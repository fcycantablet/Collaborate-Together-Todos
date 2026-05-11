from fastapi import FastAPI, APIRouter, HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.date import DateTrigger
import os
import logging
import jwt
import bcrypt
import random
import string
import httpx
from pathlib import Path
from pydantic import BaseModel, EmailStr, Field
from typing import List, Optional
import uuid
from datetime import datetime, timedelta, timezone

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# JWT Config
JWT_SECRET = os.environ.get("JWT_SECRET", "todoshare_secret_change_in_prod_2026")
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_DAYS = 30

# Expo Push API
EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"

app = FastAPI()
api_router = APIRouter(prefix="/api")
security = HTTPBearer()
scheduler = AsyncIOScheduler()


# ============ MODELS ============
class UserRegister(BaseModel):
    email: EmailStr
    password: str
    name: str


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserResponse(BaseModel):
    id: str
    email: str
    name: str
    user_code: str
    created_at: str


class AuthResponse(BaseModel):
    token: str
    user: UserResponse


class PushTokenUpdate(BaseModel):
    push_token: str


class TodoCreate(BaseModel):
    title: str
    description: Optional[str] = ""
    scheduled_at: str  # ISO format datetime
    priority: str = "medium"  # low, medium, high
    category: str = "Other"  # Work, Personal, Shopping, Health, Other
    attachment: Optional[str] = None  # base64 image


class TodoShareRequest(BaseModel):
    user_code: str


class TodoResponse(BaseModel):
    id: str
    title: str
    description: str
    scheduled_at: str
    priority: str
    category: str
    attachment: Optional[str]
    owner_id: str
    owner_name: str
    shared_with: List[dict]  # [{user_id, name, completed}]
    completed: bool
    created_at: str


# ============ HELPERS ============
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())


def create_jwt_token(user_id: str, email: str) -> str:
    payload = {
        "user_id": user_id,
        "email": email,
        "exp": datetime.now(timezone.utc) + timedelta(days=JWT_EXPIRE_DAYS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def generate_user_code() -> str:
    chars = string.ascii_uppercase + string.digits
    return "USR-" + "".join(random.choices(chars, k=6))


async def get_current_user(creds: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    try:
        payload = jwt.decode(creds.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user = await db.users.find_one({"id": payload["user_id"]}, {"_id": 0, "password_hash": 0})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


def user_to_response(user: dict) -> UserResponse:
    return UserResponse(
        id=user["id"],
        email=user["email"],
        name=user["name"],
        user_code=user["user_code"],
        created_at=user["created_at"],
    )


async def todo_to_response(todo: dict) -> TodoResponse:
    owner = await db.users.find_one({"id": todo["owner_id"]}, {"_id": 0, "name": 1})
    owner_name = owner["name"] if owner else "Unknown"

    shared_users = []
    for sw in todo.get("shared_with", []):
        u = await db.users.find_one({"id": sw["user_id"]}, {"_id": 0, "name": 1})
        shared_users.append({
            "user_id": sw["user_id"],
            "name": u["name"] if u else "Unknown",
            "completed": sw.get("completed", False),
        })

    return TodoResponse(
        id=todo["id"],
        title=todo["title"],
        description=todo.get("description", ""),
        scheduled_at=todo["scheduled_at"],
        priority=todo.get("priority", "medium"),
        category=todo.get("category", "Other"),
        attachment=todo.get("attachment"),
        owner_id=todo["owner_id"],
        owner_name=owner_name,
        shared_with=shared_users,
        completed=todo.get("completed", False),
        created_at=todo["created_at"],
    )


async def send_expo_push(push_tokens: List[str], title: str, body: str, data: dict = None):
    """Send push notification via Expo Push Service"""
    if not push_tokens:
        return
    messages = [
        {
            "to": token,
            "sound": "default",
            "title": title,
            "body": body,
            "data": data or {},
        }
        for token in push_tokens if token
    ]
    if not messages:
        return
    try:
        async with httpx.AsyncClient(timeout=10.0) as client_http:
            await client_http.post(EXPO_PUSH_URL, json=messages, headers={
                "Accept": "application/json",
                "Content-Type": "application/json",
            })
    except Exception as e:
        logging.error(f"Push notification error: {e}")


async def trigger_todo_notification(todo_id: str):
    """Triggered at scheduled time. Sends push + creates in-app notifications."""
    todo = await db.todos.find_one({"id": todo_id}, {"_id": 0})
    if not todo:
        return

    user_ids = [todo["owner_id"]] + [sw["user_id"] for sw in todo.get("shared_with", [])]
    users = await db.users.find({"id": {"$in": user_ids}}, {"_id": 0}).to_list(100)
    push_tokens = [u.get("push_token") for u in users if u.get("push_token")]

    title = f"⏰ Reminder: {todo['title']}"
    body = todo.get("description") or "It's time for your scheduled task!"

    await send_expo_push(push_tokens, title, body, {"todo_id": todo_id})

    # In-app notifications
    now = datetime.now(timezone.utc).isoformat()
    notifs = [
        {
            "id": str(uuid.uuid4()),
            "user_id": uid,
            "todo_id": todo_id,
            "type": "reminder",
            "title": title,
            "body": body,
            "read": False,
            "created_at": now,
        }
        for uid in user_ids
    ]
    if notifs:
        await db.notifications.insert_many(notifs)


def schedule_todo_notification(todo_id: str, scheduled_at_iso: str):
    try:
        scheduled_dt = datetime.fromisoformat(scheduled_at_iso.replace("Z", "+00:00"))
        if scheduled_dt.tzinfo is None:
            scheduled_dt = scheduled_dt.replace(tzinfo=timezone.utc)
        if scheduled_dt <= datetime.now(timezone.utc):
            return
        job_id = f"todo_{todo_id}"
        if scheduler.get_job(job_id):
            scheduler.remove_job(job_id)
        scheduler.add_job(
            trigger_todo_notification,
            trigger=DateTrigger(run_date=scheduled_dt),
            args=[todo_id],
            id=job_id,
            replace_existing=True,
        )
    except Exception as e:
        logging.error(f"Schedule error: {e}")


# ============ AUTH ROUTES ============
@api_router.post("/auth/register", response_model=AuthResponse)
async def register(data: UserRegister):
    existing = await db.users.find_one({"email": data.email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    # Ensure unique user_code
    while True:
        code = generate_user_code()
        if not await db.users.find_one({"user_code": code}):
            break

    user_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    user_doc = {
        "id": user_id,
        "email": data.email,
        "password_hash": hash_password(data.password),
        "name": data.name,
        "user_code": code,
        "push_token": None,
        "created_at": now,
    }
    await db.users.insert_one(user_doc)

    token = create_jwt_token(user_id, data.email)
    user_resp = user_to_response(user_doc)
    return AuthResponse(token=token, user=user_resp)


@api_router.post("/auth/login", response_model=AuthResponse)
async def login(data: UserLogin):
    user = await db.users.find_one({"email": data.email})
    if not user or not verify_password(data.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    token = create_jwt_token(user["id"], user["email"])
    user_resp = user_to_response(user)
    return AuthResponse(token=token, user=user_resp)


@api_router.get("/auth/me", response_model=UserResponse)
async def get_me(current_user: dict = Depends(get_current_user)):
    return user_to_response(current_user)


@api_router.post("/auth/push-token")
async def update_push_token(data: PushTokenUpdate, current_user: dict = Depends(get_current_user)):
    await db.users.update_one(
        {"id": current_user["id"]},
        {"$set": {"push_token": data.push_token}}
    )
    return {"success": True}


# ============ TODO ROUTES ============
@api_router.post("/todos", response_model=TodoResponse)
async def create_todo(data: TodoCreate, current_user: dict = Depends(get_current_user)):
    todo_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    todo_doc = {
        "id": todo_id,
        "title": data.title,
        "description": data.description or "",
        "scheduled_at": data.scheduled_at,
        "priority": data.priority,
        "category": data.category,
        "attachment": data.attachment,
        "owner_id": current_user["id"],
        "shared_with": [],
        "completed": False,
        "created_at": now,
    }
    await db.todos.insert_one(todo_doc)
    schedule_todo_notification(todo_id, data.scheduled_at)
    return await todo_to_response(todo_doc)


@api_router.get("/todos", response_model=List[TodoResponse])
async def get_my_todos(current_user: dict = Depends(get_current_user)):
    todos = await db.todos.find({"owner_id": current_user["id"]}, {"_id": 0}).sort("scheduled_at", 1).to_list(1000)
    return [await todo_to_response(t) for t in todos]


@api_router.get("/todos/shared", response_model=List[TodoResponse])
async def get_shared_with_me(current_user: dict = Depends(get_current_user)):
    todos = await db.todos.find(
        {"shared_with.user_id": current_user["id"]}, {"_id": 0}
    ).sort("scheduled_at", 1).to_list(1000)
    return [await todo_to_response(t) for t in todos]


@api_router.delete("/todos/{todo_id}")
async def delete_todo(todo_id: str, current_user: dict = Depends(get_current_user)):
    result = await db.todos.delete_one({"id": todo_id, "owner_id": current_user["id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Todo not found")
    # Remove scheduled job
    job_id = f"todo_{todo_id}"
    if scheduler.get_job(job_id):
        scheduler.remove_job(job_id)
    return {"success": True}


@api_router.patch("/todos/{todo_id}/complete")
async def toggle_complete(todo_id: str, current_user: dict = Depends(get_current_user)):
    """Owner toggles their own completion; shared user toggles their own."""
    todo = await db.todos.find_one({"id": todo_id}, {"_id": 0})
    if not todo:
        raise HTTPException(status_code=404, detail="Todo not found")

    uid = current_user["id"]
    if todo["owner_id"] == uid:
        new_state = not todo.get("completed", False)
        await db.todos.update_one({"id": todo_id}, {"$set": {"completed": new_state}})
    else:
        # Shared user
        shared_list = todo.get("shared_with", [])
        found = False
        for sw in shared_list:
            if sw["user_id"] == uid:
                sw["completed"] = not sw.get("completed", False)
                found = True
                # Notify owner
                owner = await db.users.find_one({"id": todo["owner_id"]}, {"_id": 0})
                if owner and sw["completed"]:
                    if owner.get("push_token"):
                        await send_expo_push(
                            [owner["push_token"]],
                            "✅ Task Completed",
                            f"{current_user['name']} completed: {todo['title']}",
                            {"todo_id": todo_id},
                        )
                    await db.notifications.insert_one({
                        "id": str(uuid.uuid4()),
                        "user_id": owner["id"],
                        "todo_id": todo_id,
                        "type": "completed",
                        "title": "Task Completed",
                        "body": f"{current_user['name']} completed: {todo['title']}",
                        "read": False,
                        "created_at": datetime.now(timezone.utc).isoformat(),
                    })
                break
        if not found:
            raise HTTPException(status_code=403, detail="Not authorized")
        await db.todos.update_one({"id": todo_id}, {"$set": {"shared_with": shared_list}})

    updated = await db.todos.find_one({"id": todo_id}, {"_id": 0})
    return await todo_to_response(updated)


@api_router.post("/todos/{todo_id}/share", response_model=TodoResponse)
async def share_todo(todo_id: str, data: TodoShareRequest, current_user: dict = Depends(get_current_user)):
    todo = await db.todos.find_one({"id": todo_id, "owner_id": current_user["id"]}, {"_id": 0})
    if not todo:
        raise HTTPException(status_code=404, detail="Todo not found or not yours")

    target = await db.users.find_one({"user_code": data.user_code.upper().strip()}, {"_id": 0})
    if not target:
        raise HTTPException(status_code=404, detail="User code not found")
    if target["id"] == current_user["id"]:
        raise HTTPException(status_code=400, detail="Cannot share with yourself")

    # Check if already shared
    if any(sw["user_id"] == target["id"] for sw in todo.get("shared_with", [])):
        raise HTTPException(status_code=400, detail="Already shared with this user")

    await db.todos.update_one(
        {"id": todo_id},
        {"$push": {"shared_with": {"user_id": target["id"], "completed": False}}}
    )

    # Notify target user
    if target.get("push_token"):
        await send_expo_push(
            [target["push_token"]],
            "📋 New Shared Task",
            f"{current_user['name']} shared: {todo['title']}",
            {"todo_id": todo_id},
        )
    await db.notifications.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": target["id"],
        "todo_id": todo_id,
        "type": "shared",
        "title": "New Shared Task",
        "body": f"{current_user['name']} shared: {todo['title']}",
        "read": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })

    updated = await db.todos.find_one({"id": todo_id}, {"_id": 0})
    return await todo_to_response(updated)


# ============ NOTIFICATIONS ============
@api_router.get("/notifications")
async def get_notifications(current_user: dict = Depends(get_current_user)):
    notifs = await db.notifications.find(
        {"user_id": current_user["id"]}, {"_id": 0}
    ).sort("created_at", -1).limit(100).to_list(100)
    return notifs


@api_router.post("/notifications/mark-all-read")
async def mark_all_read(current_user: dict = Depends(get_current_user)):
    await db.notifications.update_many(
        {"user_id": current_user["id"], "read": False},
        {"$set": {"read": True}}
    )
    return {"success": True}


@api_router.get("/notifications/unread-count")
async def unread_count(current_user: dict = Depends(get_current_user)):
    count = await db.notifications.count_documents(
        {"user_id": current_user["id"], "read": False}
    )
    return {"count": count}


@api_router.get("/")
async def root():
    return {"message": "TodoShare API running"}


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


@app.on_event("startup")
async def startup():
    scheduler.start()
    # Reschedule existing future todos
    now_iso = datetime.now(timezone.utc).isoformat()
    todos = await db.todos.find({"scheduled_at": {"$gt": now_iso}}, {"_id": 0, "id": 1, "scheduled_at": 1}).to_list(10000)
    for t in todos:
        schedule_todo_notification(t["id"], t["scheduled_at"])
    logger.info(f"Rescheduled {len(todos)} pending notifications")


@app.on_event("shutdown")
async def shutdown():
    scheduler.shutdown(wait=False)
    client.close()
