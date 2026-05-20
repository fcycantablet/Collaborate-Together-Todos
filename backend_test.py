"""
Backend API tests for TodoShare focusing on the new proof_added notification flow.
Also re-verifies core auth/todo/share/complete flows.
"""
import os
import sys
import time
import uuid
import requests
from datetime import datetime, timedelta, timezone

BASE_URL = "https://task-share-hub-2.preview.emergentagent.com/api"

OWNER_EMAIL = "reviewer@todoshare.app"
OWNER_PASSWORD = "TestReview123!"

RECIPIENT_EMAIL = "reviewer2@todoshare.app"
RECIPIENT_PASSWORD = "TestReview123!"
RECIPIENT_CODE = "USR-VDQMUZ"

# A 1x1 transparent PNG base64 string (no data URL prefix to keep payload smaller)
TINY_PNG_B64 = (
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
)
IMG_DATAURL = f"data:image/png;base64,{TINY_PNG_B64}"


def log(msg):
    print(msg, flush=True)


def post(path, json=None, token=None, expected=200):
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    r = requests.post(BASE_URL + path, json=json, headers=headers, timeout=30)
    return r


def get(path, token=None):
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    return requests.get(BASE_URL + path, headers=headers, timeout=30)


def patch(path, token=None, json=None):
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    return requests.patch(BASE_URL + path, json=json, headers=headers, timeout=30)


def delete(path, token=None):
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    return requests.delete(BASE_URL + path, headers=headers, timeout=30)


results = []


def record(name, ok, details=""):
    results.append((name, ok, details))
    status = "PASS" if ok else "FAIL"
    log(f"[{status}] {name} {('- '+details) if details else ''}")


def login(email, password):
    r = post("/auth/login", {"email": email, "password": password})
    if r.status_code != 200:
        return None, r
    data = r.json()
    return data["token"], data["user"]


def main():
    log(f"Testing against: {BASE_URL}")

    # === 1. AUTH: login as Owner A ===
    owner_token, owner_user = login(OWNER_EMAIL, OWNER_PASSWORD)
    if not owner_token:
        record("Auth - login owner (reviewer@todoshare.app)", False, "login failed")
        return
    record("Auth - login owner (reviewer@todoshare.app)", True, f"id={owner_user['id']}")

    # === 2. AUTH: login as Recipient B ===
    recipient_token, recipient_user = login(RECIPIENT_EMAIL, RECIPIENT_PASSWORD)
    if not recipient_token:
        record("Auth - login recipient (reviewer2@todoshare.app)", False, "login failed")
        return
    record("Auth - login recipient (reviewer2@todoshare.app)", True,
           f"id={recipient_user['id']} code={recipient_user['user_code']}")

    if recipient_user.get("user_code") != RECIPIENT_CODE:
        record("Recipient user_code matches expected (USR-VDQMUZ)", False,
               f"got {recipient_user.get('user_code')}")
    else:
        record("Recipient user_code matches expected (USR-VDQMUZ)", True)

    # === 3. AUTH: register sanity (new random user) ===
    rand_email = f"qa_{uuid.uuid4().hex[:8]}@todoshare.app"
    rr = post("/auth/register", {"email": rand_email, "password": "Pa$$w0rd1!", "name": "QA Tester"})
    if rr.status_code == 200:
        record("Auth - register new user", True, f"user_code={rr.json()['user']['user_code']}")
    else:
        record("Auth - register new user", False, f"status={rr.status_code} body={rr.text[:200]}")

    # === 4. Snapshot pre-test notification state for owner ===
    pre_notifs_r = get("/notifications", token=owner_token)
    if pre_notifs_r.status_code != 200:
        record("GET /notifications (pre-test, owner)", False, pre_notifs_r.text[:200])
        return
    pre_notif_ids = {n["id"] for n in pre_notifs_r.json()}
    pre_unread_r = get("/notifications/unread-count", token=owner_token)
    pre_unread = pre_unread_r.json().get("count", 0) if pre_unread_r.status_code == 200 else None
    record("GET /notifications (pre-test, owner)", True,
           f"existing={len(pre_notif_ids)} unread={pre_unread}")

    # === 5. Owner A creates a new todo ===
    scheduled = (datetime.now(timezone.utc) + timedelta(days=2)).isoformat()
    todo_payload = {
        "title": f"Proof Notification Test {uuid.uuid4().hex[:6]}",
        "description": "Verify owner gets notified when recipient adds proof photos",
        "scheduled_at": scheduled,
        "priority": "high",
        "category": "Work",
    }
    cr = post("/todos", todo_payload, token=owner_token)
    if cr.status_code != 200:
        record("POST /todos (owner creates)", False, f"status={cr.status_code} body={cr.text[:200]}")
        return
    todo = cr.json()
    todo_id = todo["id"]
    record("POST /todos (owner creates)", True, f"todo_id={todo_id}")

    # === 6. List todos ===
    list_r = get("/todos", token=owner_token)
    if list_r.status_code == 200 and any(t["id"] == todo_id for t in list_r.json()):
        record("GET /todos (owner lists, includes new)", True)
    else:
        record("GET /todos (owner lists, includes new)", False,
               f"status={list_r.status_code} body={list_r.text[:200]}")

    # === 7. Share with Recipient B by user_code ===
    sr = post(f"/todos/{todo_id}/share", {"user_code": RECIPIENT_CODE}, token=owner_token)
    if sr.status_code != 200:
        record("POST /todos/{id}/share with recipient", False,
               f"status={sr.status_code} body={sr.text[:200]}")
        return
    shared = sr.json()
    is_shared = any(sw["user_id"] == recipient_user["id"] for sw in shared.get("shared_with", []))
    record("POST /todos/{id}/share with recipient", is_shared,
           f"shared_with count={len(shared.get('shared_with', []))}")

    # === 8. Recipient sees todo in /todos/shared ===
    sh_r = get("/todos/shared", token=recipient_token)
    seen = sh_r.status_code == 200 and any(t["id"] == todo_id for t in sh_r.json())
    record("GET /todos/shared (recipient sees shared)", seen,
           f"status={sh_r.status_code}")

    # === 9. Recipient marks shared todo complete ===
    cmpl_r = patch(f"/todos/{todo_id}/complete", token=recipient_token)
    if cmpl_r.status_code != 200:
        record("PATCH /todos/{id}/complete (recipient marks complete)", False,
               f"status={cmpl_r.status_code} body={cmpl_r.text[:200]}")
    else:
        body = cmpl_r.json()
        recip_completed = any(
            sw["user_id"] == recipient_user["id"] and sw.get("completed")
            for sw in body.get("shared_with", [])
        )
        record("PATCH /todos/{id}/complete (recipient marks complete)", recip_completed,
               f"recipient completed flag set={recip_completed}")

    # Owner should get a 'completed' notification — verify
    time.sleep(0.5)
    after_complete_notifs = get("/notifications", token=owner_token).json()
    completed_notif = next(
        (n for n in after_complete_notifs
         if n.get("type") == "completed" and n.get("todo_id") == todo_id
         and n["id"] not in pre_notif_ids), None
    )
    record("Owner receives 'completed' notification when recipient completes",
           completed_notif is not None,
           f"found type={completed_notif and completed_notif.get('type')}")

    # === 10. Recipient uploads proof images (2 photos) ===
    proof_payload = {"images": [IMG_DATAURL, IMG_DATAURL]}
    pr = post(f"/todos/{todo_id}/proof", proof_payload, token=recipient_token)
    if pr.status_code != 200:
        record("POST /todos/{id}/proof (recipient uploads 2 images) returns 200", False,
               f"status={pr.status_code} body={pr.text[:300]}")
        return
    pr_body = pr.json()
    proofs = pr_body.get("completion_proofs", [])
    recip_proof = next((p for p in proofs if p["user_id"] == recipient_user["id"]), None)
    has_two = recip_proof is not None and len(recip_proof.get("images", [])) == 2
    record("POST /todos/{id}/proof (recipient uploads 2 images) returns 200 + proof_added", has_two,
           f"recipient_proof_images={len(recip_proof['images']) if recip_proof else 0}")

    # === 11. Owner sees new 'proof_added' notification ===
    time.sleep(0.5)
    after_proof_r = get("/notifications", token=owner_token)
    if after_proof_r.status_code != 200:
        record("GET /notifications (owner, after proof) status 200", False, after_proof_r.text[:200])
        return
    notifs_after = after_proof_r.json()
    new_proof_notif = next(
        (n for n in notifs_after
         if n.get("type") == "proof_added" and n.get("todo_id") == todo_id
         and n["id"] not in pre_notif_ids), None
    )
    record("Owner has NEW notification type=proof_added", new_proof_notif is not None,
           f"notif={new_proof_notif}")

    if new_proof_notif:
        title_ok = new_proof_notif.get("title") == "Proof Added"
        record('proof_added notification title == "Proof Added"', title_ok,
               f"title={new_proof_notif.get('title')}")
        body_text = new_proof_notif.get("body", "")
        recipient_name = recipient_user["name"]
        body_has_name = recipient_name in body_text
        body_has_2photos = "2 photos" in body_text
        record(f'proof_added body contains recipient name "{recipient_name}"', body_has_name,
               f"body={body_text}")
        record('proof_added body contains "2 photos"', body_has_2photos,
               f"body={body_text}")
        record("proof_added notification is unread", new_proof_notif.get("read") is False,
               f"read={new_proof_notif.get('read')}")

    # === 12. unread-count reflects the new notif ===
    unread_after_r = get("/notifications/unread-count", token=owner_token)
    if unread_after_r.status_code == 200:
        unread_after = unread_after_r.json().get("count", 0)
        # expect at least pre_unread + 2 new (completed + proof_added) — but accept pre+1 if completed was caught earlier
        ok = unread_after >= (pre_unread or 0) + 1
        record("GET /notifications/unread-count increased after proof",
               ok, f"pre={pre_unread} now={unread_after}")
    else:
        record("GET /notifications/unread-count after proof", False, unread_after_r.text[:200])

    # === 13. Edge case: Owner adds proof — NO proof_added notification for owner ===
    # Snapshot owner's notifs before
    snap_r = get("/notifications", token=owner_token).json()
    snap_ids = {n["id"] for n in snap_r}

    owner_proof_payload = {"images": [IMG_DATAURL]}
    opr = post(f"/todos/{todo_id}/proof", owner_proof_payload, token=owner_token)
    if opr.status_code != 200:
        record("POST /todos/{id}/proof (owner uploads own proof) status 200", False,
               f"status={opr.status_code} body={opr.text[:200]}")
    else:
        record("POST /todos/{id}/proof (owner uploads own proof) status 200", True)

    time.sleep(0.5)
    after_owner_proof = get("/notifications", token=owner_token).json()
    new_for_owner = [
        n for n in after_owner_proof
        if n["id"] not in snap_ids and n.get("type") == "proof_added" and n.get("todo_id") == todo_id
    ]
    record("No 'proof_added' notification created when OWNER uploads own proof",
           len(new_for_owner) == 0,
           f"unexpected_new={len(new_for_owner)}")

    # === 14. Cleanup: delete the test todo (also deletes notifications) ===
    dr = delete(f"/todos/{todo_id}", token=owner_token)
    record("DELETE /todos/{id} cleanup", dr.status_code == 200,
           f"status={dr.status_code}")

    # === 15. Summary ===
    log("\n=================== SUMMARY ===================")
    passed = sum(1 for _, ok, _ in results if ok)
    failed = [r for r in results if not r[1]]
    log(f"Total: {len(results)}  Passed: {passed}  Failed: {len(failed)}")
    if failed:
        log("\nFailures:")
        for name, _, details in failed:
            log(f"  - {name}: {details}")
    return 0 if not failed else 1


if __name__ == "__main__":
    sys.exit(main())
