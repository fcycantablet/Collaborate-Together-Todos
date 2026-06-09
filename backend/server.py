from fastapi import FastAPI, APIRouter, HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.staticfiles import StaticFiles
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


class DeleteAccountRequest(BaseModel):
    password: str


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


class ReminderRequest(BaseModel):
    minutes: int  # total minutes from now


class ProofRequest(BaseModel):
    images: List[str]  # base64 strings, max 10


class FriendAdd(BaseModel):
    user_code: str
    nickname: Optional[str] = None


class FriendUpdate(BaseModel):
    nickname: str


class FriendAccept(BaseModel):
    nickname: Optional[str] = None


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
    shared_with: List[dict]
    completed: bool
    created_at: str
    updated_at: Optional[str] = None
    my_reminder_at: Optional[str] = None
    completion_proofs: List[dict] = []  # [{user_id, user_name, images, updated_at}]


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


async def todo_to_response(todo: dict, current_user_id: Optional[str] = None) -> TodoResponse:
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

    # Current user's personal reminder if any
    my_reminder_at = None
    if current_user_id:
        for r in todo.get("personal_reminders", []):
            if r.get("user_id") == current_user_id:
                my_reminder_at = r.get("remind_at")
                break

    # Enrich proofs with user names
    proofs = []
    for p in todo.get("completion_proofs", []):
        u = await db.users.find_one({"id": p["user_id"]}, {"_id": 0, "name": 1})
        proofs.append({
            "user_id": p["user_id"],
            "user_name": u["name"] if u else "Unknown",
            "images": p.get("images", []),
            "updated_at": p.get("updated_at"),
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
        updated_at=todo.get("updated_at"),
        my_reminder_at=my_reminder_at,
        completion_proofs=proofs,
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


@api_router.delete("/auth/account")
async def delete_account(data: DeleteAccountRequest, current_user: dict = Depends(get_current_user)):
    """
    Permanently delete the authenticated user's account and all related data.
    Required by Apple Guideline 5.1.1(v).

    Re-verifies the user's password before proceeding to prevent accidental
    or unauthorized deletion. Cascades the delete across todos, shared todos,
    notifications, friends, and friend requests so no orphan data remains.
    """
    # Re-verify password to confirm intent (defence in depth).
    # get_current_user strips password_hash for safety, so fetch the full record here.
    user_id = current_user["id"]
    full_user = await db.users.find_one({"id": user_id})
    if not full_user or not verify_password(data.password, full_user["password_hash"]):
        raise HTTPException(status_code=401, detail="Incorrect password")

    # Cancel any pending scheduled notification jobs for this user's todos
    try:
        owned_todos = await db.todos.find({"owner_id": user_id}, {"id": 1}).to_list(length=None)
        for t in owned_todos:
            job_id = f"todo_{t['id']}"
            try:
                scheduler.remove_job(job_id)
            except Exception:
                pass  # Job may not exist
    except Exception as e:
        logger.warning(f"Failed to cancel scheduler jobs for user {user_id}: {e}")

    # 1. Delete all todos owned by the user
    await db.todos.delete_many({"owner_id": user_id})

    # 2. Remove the user from any todos that were shared WITH them
    await db.todos.update_many(
        {"shared_with": user_id},
        {"$pull": {"shared_with": user_id}}
    )

    # 3. Delete all notifications targeted at this user
    await db.notifications.delete_many({"user_id": user_id})

    # 4. Delete all notifications this user generated (clean-up)
    await db.notifications.delete_many({"actor_id": user_id})

    # 5. Delete friend requests sent or received by this user
    await db.friend_requests.delete_many({
        "$or": [{"from_user_id": user_id}, {"to_user_id": user_id}]
    })

    # 6. Delete friendship documents (both directions)
    await db.friends.delete_many({
        "$or": [{"owner_id": user_id}, {"friend_id": user_id}]
    })

    # 7. Finally, delete the user record itself
    result = await db.users.delete_one({"id": user_id})

    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="User not found")

    logger.info(f"Account permanently deleted: {current_user.get('email')} ({user_id})")
    return {"success": True, "message": "Account permanently deleted"}


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
    return await todo_to_response(todo_doc, current_user["id"])


@api_router.get("/todos", response_model=List[TodoResponse])
async def get_my_todos(current_user: dict = Depends(get_current_user)):
    todos = await db.todos.find({"owner_id": current_user["id"]}, {"_id": 0}).sort("scheduled_at", 1).to_list(1000)
    return [await todo_to_response(t, current_user["id"]) for t in todos]


@api_router.get("/todos/shared", response_model=List[TodoResponse])
async def get_shared_with_me(current_user: dict = Depends(get_current_user)):
    todos = await db.todos.find(
        {"shared_with.user_id": current_user["id"]}, {"_id": 0}
    ).sort("scheduled_at", 1).to_list(1000)
    return [await todo_to_response(t, current_user["id"]) for t in todos]


@api_router.delete("/todos/{todo_id}")
async def delete_todo(todo_id: str, current_user: dict = Depends(get_current_user)):
    """Owner-only hard delete. Removes the todo, all notifications, all scheduled jobs, and all proof images."""
    todo = await db.todos.find_one({"id": todo_id, "owner_id": current_user["id"]}, {"_id": 0})
    if not todo:
        raise HTTPException(status_code=404, detail="Todo not found")

    # Remove main scheduled notification job
    main_job_id = f"todo_{todo_id}"
    if scheduler.get_job(main_job_id):
        scheduler.remove_job(main_job_id)

    # Remove every personal reminder job for this todo (one per user)
    for r in todo.get("personal_reminders", []):
        uid = r.get("user_id")
        if uid:
            rjob = f"reminder_{todo_id}_{uid}"
            if scheduler.get_job(rjob):
                scheduler.remove_job(rjob)

    # Delete all in-app notifications tied to this todo
    await db.notifications.delete_many({"todo_id": todo_id})

    # Hard delete the todo doc itself (proofs/images live inside it, gone with it)
    await db.todos.delete_one({"id": todo_id})

    return {"success": True}


@api_router.put("/todos/{todo_id}", response_model=TodoResponse)
async def update_todo(todo_id: str, data: TodoCreate, current_user: dict = Depends(get_current_user)):
    """Only the owner can edit a todo. Updates fields and reschedules notification."""
    todo = await db.todos.find_one({"id": todo_id, "owner_id": current_user["id"]}, {"_id": 0})
    if not todo:
        raise HTTPException(status_code=404, detail="Todo not found or not yours")

    now = datetime.now(timezone.utc).isoformat()
    updates = {
        "title": data.title,
        "description": data.description or "",
        "scheduled_at": data.scheduled_at,
        "priority": data.priority,
        "category": data.category,
        "attachment": data.attachment,
        "updated_at": now,
    }
    await db.todos.update_one({"id": todo_id}, {"$set": updates})

    # Reschedule notification
    schedule_todo_notification(todo_id, data.scheduled_at)

    # Notify shared users about the edit
    shared_user_ids = [sw["user_id"] for sw in todo.get("shared_with", [])]
    if shared_user_ids:
        users = await db.users.find({"id": {"$in": shared_user_ids}}, {"_id": 0}).to_list(100)
        push_tokens = [u.get("push_token") for u in users if u.get("push_token")]
        if push_tokens:
            await send_expo_push(
                push_tokens,
                "✏️ Shared Task Updated",
                f"{current_user['name']} updated: {data.title}",
                {"todo_id": todo_id},
            )
        notifs = [
            {
                "id": str(uuid.uuid4()),
                "user_id": uid,
                "todo_id": todo_id,
                "type": "updated",
                "title": "Shared Task Updated",
                "body": f"{current_user['name']} updated: {data.title}",
                "read": False,
                "created_at": now,
            }
            for uid in shared_user_ids
        ]
        await db.notifications.insert_many(notifs)

    updated = await db.todos.find_one({"id": todo_id}, {"_id": 0})
    return await todo_to_response(updated, current_user["id"])


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
    return await todo_to_response(updated, current_user["id"])


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
        {"$push": {"shared_with": {"user_id": target["id"], "completed": False, "shared_at": datetime.now(timezone.utc).isoformat()}}}
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
    return await todo_to_response(updated, current_user["id"])


# ============ COMPLETION PROOFS ============
@api_router.post("/todos/{todo_id}/proof", response_model=TodoResponse)
async def add_completion_proof(todo_id: str, data: ProofRequest, current_user: dict = Depends(get_current_user)):
    """Replace current user's proof images for a todo. Max 10 per user. Owner or shared user."""
    if len(data.images) > 10:
        raise HTTPException(status_code=400, detail="Maximum 10 images per user")

    todo = await db.todos.find_one({"id": todo_id}, {"_id": 0})
    if not todo:
        raise HTTPException(status_code=404, detail="Todo not found")

    uid = current_user["id"]
    is_owner = todo["owner_id"] == uid
    is_shared = any(sw["user_id"] == uid for sw in todo.get("shared_with", []))
    if not (is_owner or is_shared):
        raise HTTPException(status_code=403, detail="Not authorized")

    now = datetime.now(timezone.utc).isoformat()
    # Remove existing entry for this user
    await db.todos.update_one(
        {"id": todo_id},
        {"$pull": {"completion_proofs": {"user_id": uid}}}
    )
    if data.images:
        await db.todos.update_one(
            {"id": todo_id},
            {"$push": {"completion_proofs": {"user_id": uid, "images": data.images, "updated_at": now}}}
        )

    # Notify the owner (if proof added by a shared user)
    if data.images and not is_owner:
        owner = await db.users.find_one({"id": todo["owner_id"]}, {"_id": 0})
        if owner:
            count = len(data.images)
            body = f"{current_user['name']} added {count} photo{'s' if count != 1 else ''} for: {todo['title']}"
            if owner.get("push_token"):
                await send_expo_push(
                    [owner["push_token"]],
                    "📸 Proof Added",
                    body,
                    {"todo_id": todo_id},
                )
            await db.notifications.insert_one({
                "id": str(uuid.uuid4()),
                "user_id": owner["id"],
                "todo_id": todo_id,
                "type": "proof_added",
                "title": "Proof Added",
                "body": body,
                "read": False,
                "created_at": datetime.now(timezone.utc).isoformat(),
            })

    updated = await db.todos.find_one({"id": todo_id}, {"_id": 0})
    return await todo_to_response(updated, uid)


# ============ PERSONAL REMINDERS ============
async def trigger_personal_reminder(todo_id: str, user_id: str):
    todo = await db.todos.find_one({"id": todo_id}, {"_id": 0})
    if not todo:
        return
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        return

    title = f"⏰ Reminder: {todo['title']}"
    body = todo.get("description") or "Your snoozed reminder"

    if user.get("push_token"):
        await send_expo_push([user["push_token"]], title, body, {"todo_id": todo_id})

    await db.notifications.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "todo_id": todo_id,
        "type": "reminder",
        "title": title,
        "body": body,
        "read": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })

    # Clear the personal_reminder entry after firing
    await db.todos.update_one(
        {"id": todo_id},
        {"$pull": {"personal_reminders": {"user_id": user_id}}}
    )


def schedule_personal_reminder(todo_id: str, user_id: str, remind_at_iso: str):
    try:
        remind_dt = datetime.fromisoformat(remind_at_iso.replace("Z", "+00:00"))
        if remind_dt.tzinfo is None:
            remind_dt = remind_dt.replace(tzinfo=timezone.utc)
        if remind_dt <= datetime.now(timezone.utc):
            return
        job_id = f"reminder_{todo_id}_{user_id}"
        if scheduler.get_job(job_id):
            scheduler.remove_job(job_id)
        scheduler.add_job(
            trigger_personal_reminder,
            trigger=DateTrigger(run_date=remind_dt),
            args=[todo_id, user_id],
            id=job_id,
            replace_existing=True,
        )
    except Exception as e:
        logging.error(f"Schedule personal reminder error: {e}")


@api_router.post("/todos/{todo_id}/remind", response_model=TodoResponse)
async def set_personal_reminder(todo_id: str, data: ReminderRequest, current_user: dict = Depends(get_current_user)):
    """Set a personal reminder X minutes from now. Owner or any shared user can use this."""
    if data.minutes <= 0 or data.minutes > 60 * 24 * 7:  # max 1 week
        raise HTTPException(status_code=400, detail="Minutes must be between 1 and 10080 (1 week)")

    todo = await db.todos.find_one({"id": todo_id}, {"_id": 0})
    if not todo:
        raise HTTPException(status_code=404, detail="Todo not found")

    uid = current_user["id"]
    is_owner = todo["owner_id"] == uid
    is_shared = any(sw["user_id"] == uid for sw in todo.get("shared_with", []))
    if not (is_owner or is_shared):
        raise HTTPException(status_code=403, detail="Not authorized")

    remind_at = (datetime.now(timezone.utc) + timedelta(minutes=data.minutes)).isoformat()

    # Remove any existing reminder for this user, then add new one
    await db.todos.update_one(
        {"id": todo_id},
        {"$pull": {"personal_reminders": {"user_id": uid}}}
    )
    await db.todos.update_one(
        {"id": todo_id},
        {"$push": {"personal_reminders": {"user_id": uid, "remind_at": remind_at, "minutes": data.minutes}}}
    )

    schedule_personal_reminder(todo_id, uid, remind_at)

    updated = await db.todos.find_one({"id": todo_id}, {"_id": 0})
    return await todo_to_response(updated, uid)


@api_router.delete("/todos/{todo_id}/remind", response_model=TodoResponse)
async def clear_personal_reminder(todo_id: str, current_user: dict = Depends(get_current_user)):
    todo = await db.todos.find_one({"id": todo_id}, {"_id": 0})
    if not todo:
        raise HTTPException(status_code=404, detail="Todo not found")
    uid = current_user["id"]
    await db.todos.update_one(
        {"id": todo_id},
        {"$pull": {"personal_reminders": {"user_id": uid}}}
    )
    job_id = f"reminder_{todo_id}_{uid}"
    if scheduler.get_job(job_id):
        scheduler.remove_job(job_id)
    updated = await db.todos.find_one({"id": todo_id}, {"_id": 0})
    return await todo_to_response(updated, uid)


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


@api_router.get("/badges")
async def get_badges(current_user: dict = Depends(get_current_user)):
    """Returns unread notification count, new-shared count, and pending friend requests."""
    unread = await db.notifications.count_documents(
        {"user_id": current_user["id"], "read": False}
    )
    last_seen = current_user.get("last_seen_shared_at") or "1970-01-01T00:00:00+00:00"
    shared_todos = await db.todos.find(
        {"shared_with.user_id": current_user["id"]},
        {"_id": 0, "shared_with": 1}
    ).to_list(10000)
    shared_new = 0
    for t in shared_todos:
        for sw in t.get("shared_with", []):
            if sw.get("user_id") == current_user["id"]:
                sw_at = sw.get("shared_at") or "1970-01-01T00:00:00+00:00"
                if sw_at > last_seen:
                    shared_new += 1
                break
    friend_requests_pending = await db.friend_requests.count_documents({"to_user_id": current_user["id"]})
    return {
        "notifications_unread": unread,
        "shared_new": shared_new,
        "friend_requests_pending": friend_requests_pending,
    }


@api_router.post("/badges/mark-shared-seen")
async def mark_shared_seen(current_user: dict = Depends(get_current_user)):
    await db.users.update_one(
        {"id": current_user["id"]},
        {"$set": {"last_seen_shared_at": datetime.now(timezone.utc).isoformat()}}
    )
    return {"success": True}


# ============ FRIENDS ============
@api_router.get("/friends")
async def list_friends(current_user: dict = Depends(get_current_user)):
    friends = await db.friends.find(
        {"owner_id": current_user["id"]}, {"_id": 0}
    ).sort("nickname", 1).to_list(1000)
    # Enrich with friend user info
    result = []
    for f in friends:
        u = await db.users.find_one({"id": f["friend_user_id"]}, {"_id": 0, "name": 1, "email": 1, "user_code": 1})
        if u:
            result.append({
                "id": f["id"],
                "friend_user_id": f["friend_user_id"],
                "nickname": f["nickname"],
                "name": u["name"],
                "email": u["email"],
                "user_code": u["user_code"],
                "created_at": f["created_at"],
            })
    return result


@api_router.post("/friends")
async def add_friend(data: FriendAdd, current_user: dict = Depends(get_current_user)):
    """Send a friend request (not immediate add)."""
    target = await db.users.find_one({"user_code": data.user_code.upper().strip()}, {"_id": 0})
    if not target:
        raise HTTPException(status_code=404, detail="User code not found")
    if target["id"] == current_user["id"]:
        raise HTTPException(status_code=400, detail="Cannot add yourself as friend")

    # Already friends?
    existing = await db.friends.find_one({
        "owner_id": current_user["id"],
        "friend_user_id": target["id"],
    })
    if existing:
        raise HTTPException(status_code=400, detail="Already in your friends list")

    # Pending request already exists (sent by me)?
    pending = await db.friend_requests.find_one({
        "from_user_id": current_user["id"],
        "to_user_id": target["id"],
    })
    if pending:
        raise HTTPException(status_code=400, detail="Friend request already sent")

    # Reverse request exists (they sent to me)? Auto-accept it.
    reverse = await db.friend_requests.find_one({
        "from_user_id": target["id"],
        "to_user_id": current_user["id"],
    })
    if reverse:
        # Auto-accept: both become friends
        await _create_mutual_friendship(
            user_a=current_user, user_b=target,
            nickname_a_for_b=(data.nickname or target["name"]).strip() or target["name"],
            nickname_b_for_a=reverse.get("from_nickname") or current_user["name"],
        )
        await db.friend_requests.delete_one({"id": reverse["id"]})
        await _notify_request_accepted(target, current_user)
        return {"status": "accepted", "message": "Friend request auto-accepted (they already sent you one)"}

    suggested = (data.nickname or "").strip() or None
    req_doc = {
        "id": str(uuid.uuid4()),
        "from_user_id": current_user["id"],
        "to_user_id": target["id"],
        "from_nickname": suggested,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.friend_requests.insert_one(req_doc)

    # Notify recipient
    if target.get("push_token"):
        await send_expo_push(
            [target["push_token"]],
            "👋 New Friend Request",
            f"{current_user['name']} wants to add you as a friend",
            {"type": "friend_request"},
        )
    await db.notifications.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": target["id"],
        "todo_id": None,
        "type": "friend_request",
        "title": "New Friend Request",
        "body": f"{current_user['name']} wants to add you as a friend",
        "read": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })

    return {"status": "pending", "request_id": req_doc["id"]}


async def _create_mutual_friendship(user_a: dict, user_b: dict, nickname_a_for_b: str, nickname_b_for_a: str):
    now = datetime.now(timezone.utc).isoformat()
    docs = [
        {
            "id": str(uuid.uuid4()),
            "owner_id": user_a["id"],
            "friend_user_id": user_b["id"],
            "nickname": nickname_a_for_b,
            "created_at": now,
        },
        {
            "id": str(uuid.uuid4()),
            "owner_id": user_b["id"],
            "friend_user_id": user_a["id"],
            "nickname": nickname_b_for_a,
            "created_at": now,
        },
    ]
    await db.friends.insert_many(docs)


async def _notify_request_accepted(sender: dict, accepter: dict):
    if sender.get("push_token"):
        await send_expo_push(
            [sender["push_token"]],
            "🎉 Friend Request Accepted",
            f"{accepter['name']} accepted your friend request",
            {"type": "friend_accepted"},
        )
    await db.notifications.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": sender["id"],
        "todo_id": None,
        "type": "friend_accepted",
        "title": "Friend Request Accepted",
        "body": f"{accepter['name']} accepted your friend request",
        "read": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })


@api_router.get("/friend-requests")
async def list_friend_requests(current_user: dict = Depends(get_current_user)):
    incoming_docs = await db.friend_requests.find(
        {"to_user_id": current_user["id"]}, {"_id": 0}
    ).sort("created_at", -1).to_list(500)
    outgoing_docs = await db.friend_requests.find(
        {"from_user_id": current_user["id"]}, {"_id": 0}
    ).sort("created_at", -1).to_list(500)

    incoming = []
    for r in incoming_docs:
        u = await db.users.find_one({"id": r["from_user_id"]}, {"_id": 0, "name": 1, "user_code": 1})
        if u:
            incoming.append({
                "id": r["id"],
                "from_user_id": r["from_user_id"],
                "from_name": u["name"],
                "from_user_code": u["user_code"],
                "from_nickname": r.get("from_nickname"),
                "created_at": r["created_at"],
            })

    outgoing = []
    for r in outgoing_docs:
        u = await db.users.find_one({"id": r["to_user_id"]}, {"_id": 0, "name": 1, "user_code": 1})
        if u:
            outgoing.append({
                "id": r["id"],
                "to_user_id": r["to_user_id"],
                "to_name": u["name"],
                "to_user_code": u["user_code"],
                "created_at": r["created_at"],
            })

    return {"incoming": incoming, "outgoing": outgoing}


@api_router.post("/friend-requests/{request_id}/accept")
async def accept_friend_request(request_id: str, data: FriendAccept, current_user: dict = Depends(get_current_user)):
    req = await db.friend_requests.find_one({"id": request_id, "to_user_id": current_user["id"]}, {"_id": 0})
    if not req:
        raise HTTPException(status_code=404, detail="Friend request not found")

    sender = await db.users.find_one({"id": req["from_user_id"]}, {"_id": 0})
    if not sender:
        await db.friend_requests.delete_one({"id": request_id})
        raise HTTPException(status_code=404, detail="Sender no longer exists")

    nickname_for_sender = (data.nickname or "").strip() or sender["name"]
    nickname_for_me = req.get("from_nickname") or current_user["name"]

    await _create_mutual_friendship(
        user_a=current_user, user_b=sender,
        nickname_a_for_b=nickname_for_sender,
        nickname_b_for_a=nickname_for_me,
    )
    await db.friend_requests.delete_one({"id": request_id})
    await _notify_request_accepted(sender, current_user)

    return {"success": True}


@api_router.post("/friend-requests/{request_id}/decline")
async def decline_friend_request(request_id: str, current_user: dict = Depends(get_current_user)):
    req = await db.friend_requests.find_one({"id": request_id, "to_user_id": current_user["id"]})
    if not req:
        raise HTTPException(status_code=404, detail="Friend request not found")
    await db.friend_requests.delete_one({"id": request_id})
    return {"success": True}


@api_router.delete("/friend-requests/{request_id}")
async def cancel_friend_request(request_id: str, current_user: dict = Depends(get_current_user)):
    result = await db.friend_requests.delete_one({"id": request_id, "from_user_id": current_user["id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Friend request not found")
    return {"success": True}


@api_router.put("/friends/{friend_id}")
async def update_friend(friend_id: str, data: FriendUpdate, current_user: dict = Depends(get_current_user)):
    if not data.nickname.strip():
        raise HTTPException(status_code=400, detail="Nickname required")
    result = await db.friends.update_one(
        {"id": friend_id, "owner_id": current_user["id"]},
        {"$set": {"nickname": data.nickname.strip()}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Friend not found")
    return {"success": True}


@api_router.delete("/friends/{friend_id}")
async def remove_friend(friend_id: str, current_user: dict = Depends(get_current_user)):
    """Removes the friendship for BOTH users (bidirectional)."""
    me_record = await db.friends.find_one({"id": friend_id, "owner_id": current_user["id"]})
    if not me_record:
        raise HTTPException(status_code=404, detail="Friend not found")
    other_user_id = me_record["friend_user_id"]
    # Delete both directional records
    await db.friends.delete_many({
        "$or": [
            {"owner_id": current_user["id"], "friend_user_id": other_user_id},
            {"owner_id": other_user_id, "friend_user_id": current_user["id"]},
        ]
    })
    return {"success": True}


@api_router.get("/")
async def root():
    return {"message": "TodoShare API running"}


app.include_router(api_router)

# Mount static screenshots folder (for App Store screenshot delivery)
SCREENSHOTS_DIR = ROOT_DIR / "screenshots"
SCREENSHOTS_DIR.mkdir(exist_ok=True)
app.mount("/api/screenshots", StaticFiles(directory=str(SCREENSHOTS_DIR)), name="screenshots")

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
