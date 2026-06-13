# 🚀 Deploy Backend to Render (Persistent URL for App Store)

This guide gives your `Collaborate Together` backend a **permanent URL** that never dies — so Apple reviewers (and your users) can always log in.

**Time required:** ~20 minutes
**Cost:** $0 (free tier works) — optionally $7/mo to avoid cold-start delays

---

## Step 1 — Create a Free MongoDB Atlas cluster (5 min)

Render doesn't host MongoDB, so we'll use MongoDB's own free cloud DB.

1. Go to **https://www.mongodb.com/cloud/atlas/register** and sign up (free).
2. Create a new project → click **"Build a Database"**.
3. Choose the **M0 FREE** shared cluster. Region: pick one close to Render (e.g., AWS / Oregon).
4. Cluster name: `collaborate-together-cluster`. Click **Create Deployment**.
5. On the **Security Quickstart** screen:
   - Username: `app_user`
   - Password: click **Autogenerate** → **COPY IT SOMEWHERE SAFE** (you'll need it in Step 3)
   - Click **Create User**
6. Network access: choose **"My Local Environment"** and click **"Add My Current IP"**.
   ⚠️ **Important:** also click **Add IP Address → Allow Access From Anywhere (`0.0.0.0/0`)** so Render servers can connect.
7. Click **Finish and Close**.
8. On the cluster page, click **"Connect" → "Drivers" → "Python"**.
9. Copy the connection string. It looks like:
   ```
   mongodb+srv://app_user:<password>@collaborate-together-cluster.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```
10. **Replace `<password>`** with the password you saved. Keep this string ready for Step 3.

---

## Step 2 — Push the backend code to GitHub (5 min)

Render deploys from GitHub. If you already have the repo on GitHub, skip to Step 3.

On your **Mac terminal** (where you ran `eas build`):

```bash
# From your project root (the folder containing /backend and /frontend)
git init   # only if not already a repo
git add backend/ DEPLOY_TO_RENDER.md
git commit -m "Add Render deploy config"

# Create a new repo at https://github.com/new (name it 'collaborate-together-api')
# Then push:
git remote add origin https://github.com/<YOUR_USERNAME>/collaborate-together-api.git
git branch -M main
git push -u origin main
```

> 💡 If you prefer not to share the frontend code, push **only** the `backend/` folder to its own repo.

---

## Step 3 — Deploy to Render (5 min)

1. Go to **https://render.com** and sign up (free, GitHub login works).
2. Click **New + → Web Service**.
3. Connect your GitHub account → select the repo you just pushed.
4. Render auto-detects `render.yaml` from `/backend/`. If prompted to use the Blueprint, click **Apply**.
   - Otherwise fill manually:
     - **Name:** `collaborate-together-api`
     - **Root Directory:** `backend`
     - **Runtime:** Python 3
     - **Build Command:** `pip install -r requirements-prod.txt`
     - **Start Command:** `uvicorn server:app --host 0.0.0.0 --port $PORT --workers 2`
     - **Plan:** Free (or Starter $7/mo — see note below)
5. Scroll down to **Environment Variables** and add:
   | Key          | Value                                                                 |
   |--------------|-----------------------------------------------------------------------|
   | `MONGO_URL`  | *(paste the connection string from Step 1.10)*                        |
   | `DB_NAME`    | `collaborate_together`                                                |
   | `JWT_SECRET` | *(click "Generate" or paste any long random string)*                  |
6. Click **Create Web Service**. Wait ~3-5 min for the first build.
7. When you see **"Live"**, click the URL at the top. It looks like:
   ```
   https://collaborate-together-api.onrender.com
   ```
8. ✅ Test it: open `https://collaborate-together-api.onrender.com/api/` in your browser.
   You should see: `{"message":"TodoShare API running"}`

> ⚠️ **About the Free tier:** Render's free tier puts your service to sleep after 15 min of inactivity. The first request after sleep takes ~30 sec to wake up. **For App Store review, upgrade to the $7/mo Starter plan** so Apple reviewers don't time out. You can downgrade later.

---

## Step 4 — Point your iOS app to the new URL (3 min)

On your **Mac**, edit `/frontend/.env`:

```env
EXPO_PUBLIC_BACKEND_URL=https://collaborate-together-api.onrender.com
```

(Replace with **your** Render URL from Step 3.7.)

Then rebuild the IPA:

```bash
cd frontend
eas build --platform ios --profile production
```

When the build finishes, submit it:

```bash
eas submit --platform ios --latest
```

---

## Step 5 — Reply to Apple Review (2 min)

In App Store Connect → Resolution Center, send the reviewer this message:

> Hello Review Team,
>
> Thank you for your feedback. The previous "Network request failed" was caused by a temporary backend hosted on a development environment that went offline. We have now migrated the backend to a production-grade host with a persistent URL.
>
> We have uploaded a new build (vX.X.X) that connects to this stable production backend. The demo credentials below have been verified working:
>
> - Email: `reviewer@todoshare.app`
> - Password: `TestReview123!`
>
> Please run the new build for re-review. Thank you!

---

## 🔄 Future updates

Any push to your `main` branch automatically redeploys to Render (`autoDeploy: true` in `render.yaml`). No more URL rot.

## 🆘 Troubleshooting

| Symptom                                        | Fix                                                                                  |
|------------------------------------------------|--------------------------------------------------------------------------------------|
| Render build fails on `pip install`           | Check `runtime.txt` says `python-3.11.9` and `requirements-prod.txt` exists in `/backend` |
| App still says "Network request failed"       | Confirm `/frontend/.env` has the new URL, then rebuild `.ipa` (the URL is baked at build time) |
| MongoDB connection times out                  | In Atlas → Network Access, ensure `0.0.0.0/0` is whitelisted                         |
| 502 on Render                                  | Open Render logs → look for missing env var or crashed startup                       |
| Cold-start delays during Apple review          | Upgrade Render to Starter ($7/mo) — service stays warm 24/7                          |
