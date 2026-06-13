# TodoShare - Mobile App PRD

## Overview
A mobile to-do app where users register, create scheduled to-dos, and share them with other users via unique codes. Both owner and shared users receive push notifications at the scheduled time.

## Tech Stack
- **Backend:** FastAPI + MongoDB + JWT auth + APScheduler + Expo Push API
- **Frontend:** Expo (React Native) with Expo Router (file-based routing)
- **Notifications:** expo-notifications + Expo Push Service
- **Storage:** expo-secure-store (mobile) + AsyncStorage (web fallback) for JWT token

## Features Implemented
1. **Authentication (JWT)**
   - Register with email/password/name → auto-generates unique `USR-XXXXXX` user code
   - Login with email/password
   - Auto-login on app launch (token persisted)
   - Logout
2. **My To-Dos Tab**
   - Create todo with title, description, scheduled date/time, priority (low/medium/high), category (Work/Personal/Shopping/Health/Other), optional image attachment (base64)
   - Mark complete / uncomplete
   - Delete
   - Share with another user via their user code
3. **Shared with Me Tab**
   - List of to-dos shared by others
   - Mark complete only (cannot edit/delete)
   - Completion notifies the owner
4. **Notifications Tab**
   - In-app feed of reminders, shared todos, completion notifications
   - Mark all read
5. **Profile Tab**
   - Displays unique user code prominently (copy to clipboard)
   - User name, email
   - Logout
6. **Push Notifications**
   - Auto-registers Expo push token after login (mobile only)
   - APScheduler triggers at scheduled time, sends push to owner + all shared users
   - Sends in-app notifications too

## Backend Endpoints (all prefixed with `/api`)
- `POST /auth/register`, `POST /auth/login`, `GET /auth/me`, `POST /auth/push-token`
- `GET /todos`, `POST /todos`, `DELETE /todos/{id}`, `PATCH /todos/{id}/complete`, `POST /todos/{id}/share`
- `GET /todos/shared`
- `GET /notifications`, `POST /notifications/mark-all-read`, `GET /notifications/unread-count`

## Data Models
- **User:** id, email, password_hash, name, user_code, push_token, created_at
- **Todo:** id, title, description, scheduled_at, priority, category, attachment, owner_id, shared_with[], completed, created_at
- **Notification:** id, user_id, todo_id, type, title, body, read, created_at

## Design
Neo-Brutalist + Pastel theme (`/app/design_guidelines.json`): hard 2px black borders, brutalist shadows (4px offset, no blur), pastel accents (mint, butter, peach, lavender, sky), uppercase bold typography.

## Changelog
### 2026-06-11 — Apple Rejection Fixes (Build 10 prep)
Apple rejected Build 9 (v1.0.2) on 3 points; all fixed in container, awaiting user to sync to Mac + rebuild:
1. **2.1(a) Placeholder icon** → AI-generated unique neo-brutalist icon (two figures + checkbox, butter-yellow bg, no text). Replaced icon.png, adaptive-icon.png, favicon.png, splash-icon.png, splash-image.png. Generator script: /app/scripts/generate_icon.py.
2. **2.1(a) Freeze after login on first launch** → Root causes fixed:
   - src/api.ts: 30s AbortController timeout on ALL requests + friendly errors + pingServer() warm-up (Render free-tier cold start was hanging login indefinitely).
   - src/auth.tsx: push-token registration deferred 2.5s + InteractionManager + timeout guards (permission prompt no longer races post-login navigation).
   - login.tsx/register.tsx: Keyboard.dismiss() before submit + warm-up ping on mount; app/index.tsx pings on launch.
3. **1.5 Support URL** → Public HTML support page at GET /support (and /api/support) in server.py, contact: fcycantablet@gmail.com. Production URL: https://collaborate-together-api.onrender.com/support
- app.json bumped to version 1.0.3, iOS buildNumber 10.
- Fixed latent NameError: logger now defined before routes in server.py.
- Tests: 14/14 pytest pass (/app/backend/tests/test_apple_resubmit_regression.py) + full frontend flow pass (test_reports/iteration_2.json).

## Remaining Backlog
- P0: User resubmits Build 10 to Apple (sync changes to Mac, push backend to Render, eas build, update Support URL in App Store Connect)
- P1: Refactor monolithic server.py into /routes, /models, /services
- P2: Forgot Password flow; custom backend domain
- P3: Apple Sign-In; splash branding polish
- Recommended: keep Render awake with free uptime ping (cron-job.org / UptimeRobot hitting /api/ every 10 min) or upgrade Render plan

### 2026-06-11 (later) — iPad time/date picker bug fix
- Bug: On iPad, tapping date/time in create-todo showed nothing (worked on iPhone). Cause: DateTimePicker rendered without `display` prop inside a zero-space flex row — iPad popover had nothing to anchor to.
- Fix: iOS now presents pickers in a Modal with `display="spinner"` + themeVariant light + DONE button (deterministic on iPhone AND iPad). Android keeps native dialog behavior. Also removed stray corrupted lines at end of create-todo.tsx styles.
- Verified: tsc clean, web smoke test (login → create-todo renders). Native iPad verification by user on TestFlight.
