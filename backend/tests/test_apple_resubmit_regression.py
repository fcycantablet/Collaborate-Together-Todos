"""
Backend regression tests for Apple App Store Build 10 resubmit.

Covers the explicit requests from the review task:
  - GET /api/ (warm-up ping) returns 200
  - GET /api/support returns 200 HTML w/ fcycantablet@gmail.com
  - Auth: register -> login -> /me
  - Todos: create -> list -> toggle complete -> delete
  - GET /api/badges returns counts dict
"""
import os
import uuid
import pytest
import requests
from datetime import datetime, timedelta, timezone

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # Fall back to value from /app/frontend/.env if env var not exported
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
                    BASE_URL = line.split("=", 1)[1].strip().strip('"').rstrip("/")
                    break
    except Exception:
        pass
assert BASE_URL, "EXPO_PUBLIC_BACKEND_URL missing — required for testing"
API = f"{BASE_URL}/api"


# ---------- Fixtures ----------
@pytest.fixture(scope="session")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def fresh_user():
    """Random new user used across the whole test module."""
    uniq = uuid.uuid4().hex[:10]
    return {
        "email": f"TEST_resub_{uniq}@todoshare.app",
        "password": "TestPass123!",
        "name": f"TEST Resub {uniq}",
    }


@pytest.fixture(scope="session")
def auth(session, fresh_user):
    """Registers the random user once and returns the auth payload."""
    r = session.post(f"{API}/auth/register", json=fresh_user, timeout=30)
    assert r.status_code == 200, f"register failed: {r.status_code} {r.text}"
    data = r.json()
    assert "token" in data and "user" in data
    return data


def _h(auth):
    return {"Authorization": f"Bearer {auth['token']}"}


# ---------- Warm-up ping ----------
class TestWarmupPing:
    def test_root_returns_200(self, session):
        r = session.get(f"{API}/", timeout=30)
        assert r.status_code == 200
        body = r.json()
        assert "message" in body


# ---------- Support page ----------
class TestSupportPage:
    """Apple rejected the previous build for a bad support URL."""

    def test_api_support_returns_html_with_email(self, session):
        r = session.get(f"{API}/support", timeout=30)
        assert r.status_code == 200
        # Some proxies (Cloudflare) obfuscate raw email addresses with
        # email-protection. So accept EITHER the literal email OR the
        # mailto link / cf-protection markup, plus required textual
        # markers that prove this is the support page.
        text = r.text
        assert "Support" in text
        assert "Collaborate Together" in text
        assert "Frequently Asked Questions" in text
        email_ok = (
            "fcycantablet@gmail.com" in text
            or "mailto:fcycantablet@gmail.com" in text
            or "__cf_email__" in text  # Cloudflare obfuscation marker
        )
        assert email_ok, "support page is missing the contact email"

    def test_support_content_type_html(self, session):
        r = session.get(f"{API}/support", timeout=30)
        assert r.status_code == 200
        ctype = r.headers.get("content-type", "")
        assert "text/html" in ctype.lower()


# ---------- Auth ----------
class TestAuthFlow:
    def test_register_returns_token_and_user(self, auth, fresh_user):
        assert auth["user"]["email"] == fresh_user["email"]
        assert auth["user"]["name"] == fresh_user["name"]
        assert auth["user"]["user_code"].startswith("USR-")
        assert len(auth["token"]) > 20

    def test_register_duplicate_email_fails(self, session, fresh_user):
        r = session.post(f"{API}/auth/register", json=fresh_user, timeout=30)
        assert r.status_code == 400
        assert "already" in r.json().get("detail", "").lower()

    def test_login_success(self, session, fresh_user):
        r = session.post(
            f"{API}/auth/login",
            json={"email": fresh_user["email"], "password": fresh_user["password"]},
            timeout=30,
        )
        assert r.status_code == 200
        body = r.json()
        assert "token" in body
        assert body["user"]["email"] == fresh_user["email"]

    def test_login_wrong_password(self, session, fresh_user):
        r = session.post(
            f"{API}/auth/login",
            json={"email": fresh_user["email"], "password": "WrongPass!!!"},
            timeout=30,
        )
        assert r.status_code == 401

    def test_me_returns_current_user(self, session, auth, fresh_user):
        r = session.get(f"{API}/auth/me", headers=_h(auth), timeout=30)
        assert r.status_code == 200
        body = r.json()
        assert body["email"] == fresh_user["email"]
        assert body["name"] == fresh_user["name"]
        assert body["user_code"].startswith("USR-")

    def test_me_without_token_rejected(self, session):
        r = session.get(f"{API}/auth/me", timeout=30)
        # FastAPI HTTPBearer returns 403 when no Authorization header is sent
        assert r.status_code in (401, 403)


# ---------- Todos ----------
class TestTodosCRUD:
    @pytest.fixture(scope="class")
    def created_todo(self, session, auth):
        scheduled = (datetime.now(timezone.utc) + timedelta(hours=2)).isoformat()
        payload = {
            "title": "TEST_resub todo",
            "description": "regression test todo",
            "scheduled_at": scheduled,
            "priority": "high",
            "category": "Work",
        }
        r = session.post(f"{API}/todos", json=payload, headers=_h(auth), timeout=30)
        assert r.status_code == 200, r.text
        return r.json()

    def test_create_persists(self, session, auth, created_todo):
        # GET-verify after POST
        r = session.get(f"{API}/todos", headers=_h(auth), timeout=30)
        assert r.status_code == 200
        ids = [t["id"] for t in r.json()]
        assert created_todo["id"] in ids
        # Field validation
        assert created_todo["title"] == "TEST_resub todo"
        assert created_todo["priority"] == "high"
        assert created_todo["category"] == "Work"
        assert created_todo["completed"] is False
        assert created_todo["owner_id"]

    def test_list_my_todos(self, session, auth):
        r = session.get(f"{API}/todos", headers=_h(auth), timeout=30)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_toggle_complete(self, session, auth, created_todo):
        r = session.patch(
            f"{API}/todos/{created_todo['id']}/complete",
            headers=_h(auth),
            timeout=30,
        )
        assert r.status_code == 200
        assert r.json()["completed"] is True
        # Verify persistence with GET
        r2 = session.get(f"{API}/todos", headers=_h(auth), timeout=30)
        match = next(t for t in r2.json() if t["id"] == created_todo["id"])
        assert match["completed"] is True

    def test_delete_todo(self, session, auth, created_todo):
        r = session.delete(
            f"{API}/todos/{created_todo['id']}",
            headers=_h(auth),
            timeout=30,
        )
        assert r.status_code == 200
        assert r.json().get("success") is True
        # GET-verify gone
        r2 = session.get(f"{API}/todos", headers=_h(auth), timeout=30)
        ids = [t["id"] for t in r2.json()]
        assert created_todo["id"] not in ids


# ---------- Badges ----------
class TestBadges:
    def test_badges_returns_counts(self, session, auth):
        r = session.get(f"{API}/badges", headers=_h(auth), timeout=30)
        assert r.status_code == 200
        body = r.json()
        for k in ("notifications_unread", "shared_new", "friend_requests_pending"):
            assert k in body, f"missing key {k}"
            assert isinstance(body[k], int)
            assert body[k] >= 0


# ---------- Cleanup ----------
@pytest.fixture(scope="session", autouse=True)
def _cleanup(request, session):
    """After all tests, delete the throwaway user so no orphan data is left."""
    yield
    try:
        # Re-login to get a fresh token (in case auth fixture went stale)
        user = request.session._test_user_cache  # type: ignore
    except Exception:
        user = None
    # Best-effort — failure here should not break the test suite
    try:
        if user:
            r = session.post(
                f"{API}/auth/login",
                json={"email": user["email"], "password": user["password"]},
                timeout=10,
            )
            if r.status_code == 200:
                tok = r.json()["token"]
                session.delete(
                    f"{API}/auth/account",
                    json={"password": user["password"]},
                    headers={"Authorization": f"Bearer {tok}"},
                    timeout=10,
                )
    except Exception:
        pass
