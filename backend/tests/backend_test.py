"""
Backend integration tests for TodoShare API.
Covers auth, todos, sharing, completion, notifications endpoints.
"""
import os
import uuid
import time
import pytest
import requests
from datetime import datetime, timedelta, timezone

BASE_URL = "https://remind-together-6.preview.emergentagent.com"
API = f"{BASE_URL}/api"

# Pre-seeded users
SEED_USERS = {
    "test1": {"email": "test1@test.com", "password": "test123", "name": "Test User"},
    "alice": {"email": "alice@test.com", "password": "alice123", "name": "Alice"},
    "bob":   {"email": "bob@test.com",   "password": "bob12345", "name": "Bob"},
}


# ---------- Fixtures ----------
@pytest.fixture(scope="session")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _login(session, email, password):
    r = session.post(f"{API}/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, f"login {email} -> {r.status_code} {r.text}"
    return r.json()


@pytest.fixture(scope="session")
def alice_auth(session):
    return _login(session, SEED_USERS["alice"]["email"], SEED_USERS["alice"]["password"])


@pytest.fixture(scope="session")
def bob_auth(session):
    return _login(session, SEED_USERS["bob"]["email"], SEED_USERS["bob"]["password"])


def _auth_h(auth):
    return {"Authorization": f"Bearer {auth['token']}"}


# ---------- Health / root ----------
class TestHealth:
    def test_root(self, session):
        r = session.get(f"{API}/")
        assert r.status_code == 200
        assert "message" in r.json()


# ---------- AUTH ----------
class TestAuth:
    def test_register_creates_user_with_code(self, session):
        unique = uuid.uuid4().hex[:8]
        payload = {
            "email": f"TEST_{unique}@example.com",
            "password": "Passw0rd!",
            "name": f"TEST_{unique}",
        }
        r = session.post(f"{API}/auth/register", json=payload)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "token" in data
        assert data["user"]["email"] == payload["email"].lower() or data["user"]["email"] == payload["email"]
        assert data["user"]["user_code"].startswith("USR-")
        assert len(data["user"]["user_code"]) == 10  # USR-XXXXXX
        # cleanup not feasible (no delete user endpoint)

    def test_register_duplicate_email_fails(self, session):
        payload = {"email": SEED_USERS["alice"]["email"], "password": "x", "name": "y"}
        r = session.post(f"{API}/auth/register", json=payload)
        assert r.status_code == 400

    def test_login_invalid_password(self, session):
        r = session.post(f"{API}/auth/login", json={
            "email": SEED_USERS["alice"]["email"], "password": "wrongpass"
        })
        assert r.status_code == 401

    def test_login_unknown_email(self, session):
        r = session.post(f"{API}/auth/login", json={
            "email": "ghost_xyz@nowhere.com", "password": "x"
        })
        assert r.status_code == 401

    def test_login_success_alice(self, session, alice_auth):
        assert alice_auth["user"]["email"] == "alice@test.com"
        assert alice_auth["user"]["user_code"].startswith("USR-")

    def test_get_me(self, session, alice_auth):
        r = session.get(f"{API}/auth/me", headers=_auth_h(alice_auth))
        assert r.status_code == 200
        u = r.json()
        assert u["email"] == "alice@test.com"
        assert u["user_code"] == alice_auth["user"]["user_code"]

    def test_get_me_without_token(self, session):
        r = requests.get(f"{API}/auth/me")
        assert r.status_code in (401, 403)

    def test_get_me_invalid_token(self, session):
        r = requests.get(f"{API}/auth/me", headers={"Authorization": "Bearer invalid.jwt.token"})
        assert r.status_code == 401

    def test_push_token_update(self, session, alice_auth):
        r = session.post(f"{API}/auth/push-token",
                         json={"push_token": "ExponentPushToken[TEST_FAKE_TOKEN]"},
                         headers=_auth_h(alice_auth))
        assert r.status_code == 200
        assert r.json().get("success") is True


# ---------- TODOS ----------
class TestTodos:
    created_ids = []

    def _make_todo(self, session, auth, minutes_ahead=60, title=None, **extra):
        scheduled = (datetime.now(timezone.utc) + timedelta(minutes=minutes_ahead)).isoformat()
        payload = {
            "title": title or f"TEST_Todo_{uuid.uuid4().hex[:6]}",
            "description": "TEST description",
            "scheduled_at": scheduled,
            "priority": "high",
            "category": "Work",
        }
        payload.update(extra)
        r = session.post(f"{API}/todos", json=payload, headers=_auth_h(auth))
        return r, payload

    def test_create_todo(self, session, bob_auth):
        r, payload = self._make_todo(session, bob_auth)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["title"] == payload["title"]
        assert data["priority"] == "high"
        assert data["category"] == "Work"
        assert data["completed"] is False
        assert data["owner_id"] == bob_auth["user"]["id"]
        assert isinstance(data["shared_with"], list)
        TestTodos.created_ids.append(data["id"])

    def test_create_todo_requires_auth(self, session):
        scheduled = (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat()
        r = requests.post(f"{API}/todos", json={"title": "x", "scheduled_at": scheduled})
        assert r.status_code in (401, 403)

    def test_get_my_todos_contains_created(self, session, bob_auth):
        r = session.get(f"{API}/todos", headers=_auth_h(bob_auth))
        assert r.status_code == 200
        todos = r.json()
        assert isinstance(todos, list)
        ids = [t["id"] for t in todos]
        for tid in TestTodos.created_ids:
            assert tid in ids
        # All owned by bob
        for t in todos:
            assert t["owner_id"] == bob_auth["user"]["id"]

    def test_get_my_todos_isolation(self, session, alice_auth, bob_auth):
        r = session.get(f"{API}/todos", headers=_auth_h(alice_auth))
        assert r.status_code == 200
        alice_ids = [t["id"] for t in r.json()]
        # Bob's created todos should NOT appear in Alice's owned list
        for tid in TestTodos.created_ids:
            assert tid not in alice_ids

    def test_toggle_complete_owner(self, session, bob_auth):
        assert TestTodos.created_ids, "Need a created todo"
        tid = TestTodos.created_ids[0]
        r = session.patch(f"{API}/todos/{tid}/complete", headers=_auth_h(bob_auth))
        assert r.status_code == 200
        assert r.json()["completed"] is True
        # Toggle back
        r2 = session.patch(f"{API}/todos/{tid}/complete", headers=_auth_h(bob_auth))
        assert r2.status_code == 200
        assert r2.json()["completed"] is False


# ---------- SHARING + NOTIFICATIONS ----------
class TestSharingAndNotifications:
    todo_id = None

    def test_share_todo_to_alice(self, session, bob_auth, alice_auth):
        # Bob creates a fresh todo
        scheduled = (datetime.now(timezone.utc) + timedelta(minutes=120)).isoformat()
        r = session.post(f"{API}/todos", json={
            "title": "TEST_Shared_Task",
            "description": "shared from bob",
            "scheduled_at": scheduled,
            "priority": "medium",
            "category": "Personal",
        }, headers=_auth_h(bob_auth))
        assert r.status_code == 200
        TestSharingAndNotifications.todo_id = r.json()["id"]

        alice_code = alice_auth["user"]["user_code"]
        r2 = session.post(f"{API}/todos/{TestSharingAndNotifications.todo_id}/share",
                          json={"user_code": alice_code}, headers=_auth_h(bob_auth))
        assert r2.status_code == 200, r2.text
        data = r2.json()
        shared_ids = [sw["user_id"] for sw in data["shared_with"]]
        assert alice_auth["user"]["id"] in shared_ids

    def test_cannot_share_twice(self, session, bob_auth, alice_auth):
        alice_code = alice_auth["user"]["user_code"]
        r = session.post(f"{API}/todos/{TestSharingAndNotifications.todo_id}/share",
                         json={"user_code": alice_code}, headers=_auth_h(bob_auth))
        assert r.status_code == 400

    def test_cannot_share_with_self(self, session, bob_auth):
        r = session.post(f"{API}/todos/{TestSharingAndNotifications.todo_id}/share",
                         json={"user_code": bob_auth["user"]["user_code"]},
                         headers=_auth_h(bob_auth))
        assert r.status_code == 400

    def test_share_invalid_code(self, session, bob_auth):
        r = session.post(f"{API}/todos/{TestSharingAndNotifications.todo_id}/share",
                         json={"user_code": "USR-INVALID"}, headers=_auth_h(bob_auth))
        assert r.status_code == 404

    def test_non_owner_cannot_share(self, session, alice_auth, bob_auth):
        # Alice tries to share Bob's todo
        r = session.post(f"{API}/todos/{TestSharingAndNotifications.todo_id}/share",
                         json={"user_code": bob_auth["user"]["user_code"]},
                         headers=_auth_h(alice_auth))
        assert r.status_code == 404  # treated as not found / not yours

    def test_shared_with_me_lists_for_alice(self, session, alice_auth):
        r = session.get(f"{API}/todos/shared", headers=_auth_h(alice_auth))
        assert r.status_code == 200
        ids = [t["id"] for t in r.json()]
        assert TestSharingAndNotifications.todo_id in ids

    def test_shared_user_can_toggle_own_completion(self, session, alice_auth):
        tid = TestSharingAndNotifications.todo_id
        r = session.patch(f"{API}/todos/{tid}/complete", headers=_auth_h(alice_auth))
        assert r.status_code == 200
        data = r.json()
        # Owner-level completed should remain False
        assert data["completed"] is False
        alice_sw = next((sw for sw in data["shared_with"] if sw["name"] == "Alice"), None)
        assert alice_sw is not None
        assert alice_sw["completed"] is True

    def test_owner_gets_completion_notification(self, session, bob_auth):
        # Alice completed; Bob should have an in-app notification of type 'completed'
        time.sleep(0.5)
        r = session.get(f"{API}/notifications", headers=_auth_h(bob_auth))
        assert r.status_code == 200
        notifs = r.json()
        assert any(n.get("type") == "completed" and n.get("todo_id") == TestSharingAndNotifications.todo_id for n in notifs)

    def test_alice_has_shared_notification(self, session, alice_auth):
        r = session.get(f"{API}/notifications", headers=_auth_h(alice_auth))
        assert r.status_code == 200
        notifs = r.json()
        assert any(n.get("type") == "shared" and n.get("todo_id") == TestSharingAndNotifications.todo_id for n in notifs)

    def test_unread_count_and_mark_all_read(self, session, alice_auth):
        r = session.get(f"{API}/notifications/unread-count", headers=_auth_h(alice_auth))
        assert r.status_code == 200
        before = r.json()["count"]
        assert isinstance(before, int)

        r2 = session.post(f"{API}/notifications/mark-all-read", headers=_auth_h(alice_auth))
        assert r2.status_code == 200

        r3 = session.get(f"{API}/notifications/unread-count", headers=_auth_h(alice_auth))
        assert r3.status_code == 200
        assert r3.json()["count"] == 0

    def test_delete_todo_owner_only(self, session, alice_auth, bob_auth):
        tid = TestSharingAndNotifications.todo_id
        # Alice (shared) cannot delete
        r = session.delete(f"{API}/todos/{tid}", headers=_auth_h(alice_auth))
        assert r.status_code == 404
        # Bob (owner) can delete
        r2 = session.delete(f"{API}/todos/{tid}", headers=_auth_h(bob_auth))
        assert r2.status_code == 200
        # Verify gone from owner's list
        r3 = session.get(f"{API}/todos", headers=_auth_h(bob_auth))
        ids = [t["id"] for t in r3.json()]
        assert tid not in ids


# ---------- Cleanup ----------
@pytest.fixture(scope="session", autouse=True)
def cleanup_at_end(request, session):
    yield
    # Best-effort: delete bob's created TEST_ todos
    try:
        bob_auth = _login(session, SEED_USERS["bob"]["email"], SEED_USERS["bob"]["password"])
        r = session.get(f"{API}/todos", headers=_auth_h(bob_auth))
        if r.status_code == 200:
            for t in r.json():
                if t["title"].startswith("TEST_"):
                    session.delete(f"{API}/todos/{t['id']}", headers=_auth_h(bob_auth))
    except Exception:
        pass
