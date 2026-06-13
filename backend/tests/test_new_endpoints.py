"""
Tests for NEW backend endpoints in /app/backend/server.py:
  - Forgot/Reset password (Resend integration)
  - Single todo GET (/api/todos/{id})
  - Comments system (list + post) + notification fanout
  - Login regression
"""
import os
import time
import uuid
import pytest
import requests
from datetime import datetime, timedelta, timezone
from motor.motor_asyncio import AsyncIOMotorClient
import asyncio

BASE_URL = os.environ.get("BACKEND_TEST_URL", "http://localhost:8001").rstrip("/")
API = f"{BASE_URL}/api"

# Seeded reviewer account (Apple)
REVIEWER = {"email": "reviewer@todoshare.app", "password": "TestReview123!"}

# Direct Mongo access to read OTP code (since Resend sandbox won't deliver it)
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "todoshare_db")


def _auth_h(token):
    return {"Authorization": f"Bearer {token}"}


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"login {email} failed: {r.status_code} {r.text}"
    return r.json()


def _register(name_prefix="TEST"):
    uniq = uuid.uuid4().hex[:10]
    email = f"test_{name_prefix.lower()}_{uniq}@todoshare.app"
    pw = "TestPass123!"
    r = requests.post(f"{API}/auth/register",
                      json={"email": email, "password": pw, "name": f"{name_prefix} {uniq[:4]}"},
                      timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    return {"email": email, "password": pw, **data}


# ---------- shared fixtures ----------
@pytest.fixture(scope="module")
def reviewer_auth():
    return _login(REVIEWER["email"], REVIEWER["password"])


@pytest.fixture(scope="module")
def shared_user():
    """Fresh recipient that the reviewer will share a todo with."""
    return _register("shared")


@pytest.fixture(scope="module")
def stranger_user():
    """Unrelated user — should not see the shared todo."""
    return _register("stranger")


@pytest.fixture(scope="module")
def reset_user():
    """Fresh user used exclusively for the reset-password flow."""
    return _register("reset")


@pytest.fixture(scope="module")
def shared_todo(reviewer_auth, shared_user):
    """Reviewer creates a todo and shares it with `shared_user`."""
    scheduled = (datetime.now(timezone.utc) + timedelta(hours=2)).isoformat()
    r = requests.post(f"{API}/todos", json={
        "title": "TEST_NEW_endpoints shared task",
        "description": "for comments + single-todo tests",
        "scheduled_at": scheduled,
        "priority": "medium",
        "category": "Other",
    }, headers=_auth_h(reviewer_auth["token"]), timeout=15)
    assert r.status_code == 200, r.text
    todo = r.json()

    # Share with shared_user via user_code
    r2 = requests.post(f"{API}/todos/{todo['id']}/share",
                       json={"user_code": shared_user["user"]["user_code"]},
                       headers=_auth_h(reviewer_auth["token"]), timeout=15)
    assert r2.status_code == 200, r2.text

    yield todo

    # cleanup
    try:
        requests.delete(f"{API}/todos/{todo['id']}", headers=_auth_h(reviewer_auth["token"]), timeout=15)
    except Exception:
        pass


# ============ 1. FORGOT / RESET PASSWORD ============
class TestForgotPassword:
    """Resend-backed password reset. We bypass email delivery by reading the OTP
    record directly from Mongo (only the bcrypt hash is stored; we re-issue codes
    and capture them via a known plaintext)."""

    def test_forgot_password_existing_email_returns_200(self):
        r = requests.post(f"{API}/auth/forgot-password",
                          json={"email": REVIEWER["email"]}, timeout=20)
        assert r.status_code == 200
        body = r.json()
        assert body.get("success") is True
        assert "message" in body

    def test_forgot_password_unknown_email_returns_200(self):
        """Anti-enumeration: must always return 200 even for non-existent users."""
        r = requests.post(f"{API}/auth/forgot-password",
                          json={"email": f"nonexistent_{uuid.uuid4().hex}@test.com"},
                          timeout=20)
        assert r.status_code == 200
        assert r.json().get("success") is True

    def test_forgot_password_invalid_email_format(self):
        r = requests.post(f"{API}/auth/forgot-password",
                          json={"email": "not-an-email"}, timeout=15)
        assert r.status_code == 422

    def test_reset_password_invalid_code(self, reset_user):
        # Trigger an OTP for this user
        r = requests.post(f"{API}/auth/forgot-password",
                          json={"email": reset_user["email"]}, timeout=20)
        assert r.status_code == 200
        # Now try a wrong code
        r2 = requests.post(f"{API}/auth/reset-password", json={
            "email": reset_user["email"],
            "code": "000000",
            "new_password": "NewPassw0rd!",
        }, timeout=15)
        assert r2.status_code == 400
        assert "Invalid code" in r2.json().get("detail", "")

    def test_reset_password_short_password_rejected(self, reset_user):
        r = requests.post(f"{API}/auth/reset-password", json={
            "email": reset_user["email"],
            "code": "123456",
            "new_password": "abc",
        }, timeout=15)
        assert r.status_code == 400
        assert "at least 6" in r.json().get("detail", "").lower()

    def test_reset_password_valid_code_and_login_after(self, reset_user):
        """Inject a known OTP code directly via the public forgot-password endpoint
        + Mongo override of code_hash to a known value, then reset and re-login."""
        # Trigger forgot-password to create a record
        r = requests.post(f"{API}/auth/forgot-password",
                          json={"email": reset_user["email"]}, timeout=20)
        assert r.status_code == 200

        # Override the latest password_resets doc with a known code "987654"
        async def _override():
            import bcrypt
            cli = AsyncIOMotorClient(MONGO_URL)
            d = cli[DB_NAME]
            known_code = "987654"
            known_hash = bcrypt.hashpw(known_code.encode(), bcrypt.gensalt()).decode()
            cursor = d.password_resets.find(
                {"email": reset_user["email"].lower(), "used": False}
            ).sort("created_at", -1).limit(1)
            docs = await cursor.to_list(1)
            doc = docs[0] if docs else None
            assert doc is not None, "No password_reset row was created"
            await d.password_resets.update_one(
                {"id": doc["id"]},
                {"$set": {"code_hash": known_hash}},
            )
            cli.close()
            return known_code

        known_code = asyncio.run(_override())

        # Use the known code
        new_pw = "BrandNewPw1!"
        r2 = requests.post(f"{API}/auth/reset-password", json={
            "email": reset_user["email"],
            "code": known_code,
            "new_password": new_pw,
        }, timeout=15)
        assert r2.status_code == 200, r2.text
        data = r2.json()
        assert "token" in data and "user" in data
        assert data["user"]["email"] == reset_user["email"]

        # Old password should no longer work
        r3 = requests.post(f"{API}/auth/login", json={
            "email": reset_user["email"],
            "password": reset_user["password"],
        }, timeout=15)
        assert r3.status_code == 401

        # New password works
        r4 = requests.post(f"{API}/auth/login", json={
            "email": reset_user["email"],
            "password": new_pw,
        }, timeout=15)
        assert r4.status_code == 200

        # Reusing the same code must fail
        r5 = requests.post(f"{API}/auth/reset-password", json={
            "email": reset_user["email"],
            "code": known_code,
            "new_password": "AnotherPw2!",
        }, timeout=15)
        assert r5.status_code == 400


# ============ 2. SINGLE TODO GET ============
class TestSingleTodoGet:
    def test_owner_can_get(self, reviewer_auth, shared_todo):
        r = requests.get(f"{API}/todos/{shared_todo['id']}",
                         headers=_auth_h(reviewer_auth["token"]), timeout=15)
        assert r.status_code == 200
        assert r.json()["id"] == shared_todo["id"]
        assert r.json()["owner_id"] == reviewer_auth["user"]["id"]

    def test_shared_user_can_get(self, shared_user, shared_todo):
        r = requests.get(f"{API}/todos/{shared_todo['id']}",
                         headers=_auth_h(shared_user["token"]), timeout=15)
        assert r.status_code == 200
        assert r.json()["id"] == shared_todo["id"]
        shared_ids = [sw["user_id"] for sw in r.json()["shared_with"]]
        assert shared_user["user"]["id"] in shared_ids

    def test_unrelated_user_gets_403(self, stranger_user, shared_todo):
        r = requests.get(f"{API}/todos/{shared_todo['id']}",
                         headers=_auth_h(stranger_user["token"]), timeout=15)
        assert r.status_code == 403

    def test_missing_todo_returns_404(self, reviewer_auth):
        r = requests.get(f"{API}/todos/{uuid.uuid4()}",
                         headers=_auth_h(reviewer_auth["token"]), timeout=15)
        assert r.status_code == 404

    def test_no_auth_rejected(self, shared_todo):
        r = requests.get(f"{API}/todos/{shared_todo['id']}", timeout=15)
        assert r.status_code in (401, 403)


# ============ 3. COMMENTS SYSTEM ============
class TestComments:
    def test_list_empty_initial(self, reviewer_auth, shared_todo):
        r = requests.get(f"{API}/todos/{shared_todo['id']}/comments",
                         headers=_auth_h(reviewer_auth["token"]), timeout=15)
        assert r.status_code == 200
        # may be empty list
        assert isinstance(r.json(), list)

    def test_list_requires_auth(self, shared_todo):
        r = requests.get(f"{API}/todos/{shared_todo['id']}/comments", timeout=15)
        assert r.status_code in (401, 403)

    def test_list_stranger_gets_403(self, stranger_user, shared_todo):
        r = requests.get(f"{API}/todos/{shared_todo['id']}/comments",
                         headers=_auth_h(stranger_user["token"]), timeout=15)
        assert r.status_code == 403

    def test_post_comment_empty_text_400(self, reviewer_auth, shared_todo):
        r = requests.post(f"{API}/todos/{shared_todo['id']}/comments",
                          json={"text": "   "},
                          headers=_auth_h(reviewer_auth["token"]), timeout=15)
        assert r.status_code == 400

    def test_post_comment_too_long_400(self, reviewer_auth, shared_todo):
        r = requests.post(f"{API}/todos/{shared_todo['id']}/comments",
                          json={"text": "x" * 1001},
                          headers=_auth_h(reviewer_auth["token"]), timeout=15)
        assert r.status_code == 400

    def test_post_comment_stranger_403(self, stranger_user, shared_todo):
        r = requests.post(f"{API}/todos/{shared_todo['id']}/comments",
                          json={"text": "I should not be allowed"},
                          headers=_auth_h(stranger_user["token"]), timeout=15)
        assert r.status_code == 403

    def test_post_comment_owner_and_notification_for_shared(
            self, reviewer_auth, shared_user, shared_todo):
        text = "TEST_owner_comment_" + uuid.uuid4().hex[:6]
        r = requests.post(f"{API}/todos/{shared_todo['id']}/comments",
                          json={"text": text},
                          headers=_auth_h(reviewer_auth["token"]), timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["text"] == text
        assert body["user_id"] == reviewer_auth["user"]["id"]
        assert "id" in body and "created_at" in body
        assert "_id" not in body  # Mongo _id must be stripped

        # Shared user should see it in list
        time.sleep(0.3)
        r2 = requests.get(f"{API}/todos/{shared_todo['id']}/comments",
                          headers=_auth_h(shared_user["token"]), timeout=15)
        assert r2.status_code == 200
        assert any(c.get("id") == body["id"] for c in r2.json())

        # Shared user should have received an in-app notification (type=comment)
        r3 = requests.get(f"{API}/notifications",
                          headers=_auth_h(shared_user["token"]), timeout=15)
        assert r3.status_code == 200
        notifs = r3.json()
        assert any(
            n.get("type") == "comment" and n.get("todo_id") == shared_todo["id"]
            for n in notifs
        ), f"Shared user did not receive comment notification. notifs={notifs}"

    def test_post_comment_shared_user_notifies_owner_only(
            self, reviewer_auth, shared_user, shared_todo):
        text = "TEST_shared_comment_" + uuid.uuid4().hex[:6]
        r = requests.post(f"{API}/todos/{shared_todo['id']}/comments",
                          json={"text": text},
                          headers=_auth_h(shared_user["token"]), timeout=15)
        assert r.status_code == 200, r.text

        # Owner (reviewer) should have a new comment notification
        time.sleep(0.3)
        r2 = requests.get(f"{API}/notifications",
                          headers=_auth_h(reviewer_auth["token"]), timeout=15)
        assert r2.status_code == 200
        notifs = r2.json()
        # find at least one comment notification for this todo whose body contains shared_user name
        matches = [
            n for n in notifs
            if n.get("type") == "comment" and n.get("todo_id") == shared_todo["id"]
        ]
        assert matches, f"Owner did not receive any comment notification. notifs={notifs}"

        # The commenter (shared_user) should NOT have a self notification
        r3 = requests.get(f"{API}/notifications",
                          headers=_auth_h(shared_user["token"]), timeout=15)
        assert r3.status_code == 200
        my_notifs = r3.json()
        for n in my_notifs:
            if n.get("type") == "comment" and n.get("todo_id") == shared_todo["id"]:
                # Body must reference someone else, not their own latest comment text
                assert text not in (n.get("body") or ""), (
                    f"Commenter received notification for their own comment: {n}"
                )


# ============ 4. LOGIN REGRESSION ============
class TestLoginRegression:
    def test_login_reviewer_still_works(self):
        r = requests.post(f"{API}/auth/login",
                          json={"email": REVIEWER["email"],
                                "password": REVIEWER["password"]},
                          timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert "token" in data
        assert data["user"]["email"] == REVIEWER["email"]

    def test_register_and_login_roundtrip(self):
        u = _register("regression")
        r = requests.post(f"{API}/auth/login",
                          json={"email": u["email"], "password": u["password"]},
                          timeout=15)
        assert r.status_code == 200
        assert r.json()["user"]["email"] == u["email"]

    def test_login_wrong_password_401(self):
        r = requests.post(f"{API}/auth/login",
                          json={"email": REVIEWER["email"], "password": "wrong!"},
                          timeout=15)
        assert r.status_code == 401
