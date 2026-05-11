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
