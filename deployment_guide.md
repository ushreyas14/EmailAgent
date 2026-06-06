# 🚀 Email Agent — Complete Deployment Guide
## localhost → Public Production Website

> **Architecture:** React (Vite) → Vercel | Node.js/Express → Render | Google OAuth | Gemini API | Google STT

---

## ⚠️ CRITICAL: Do This Before Anything Else

Your `.env` file currently contains **real secret keys**. These must NEVER go to GitHub.

### Verify your root `.gitignore` covers these files:
Your root `.gitignore` already includes:
```
.env
google-credentials.json
backend/google-credentials.json
tokens.json
backend/tokens.json
sessions/
```
✅ This is correct. Do NOT remove these lines.

### Also check your backend `.gitignore`:
Open `backend/.gitignore` and make sure it has:
```
.env
google-credentials.json
tokens.json
sessions/
*.log
node_modules/
```

---

## 📋 PART 0: Pre-Deployment Code Changes

You need to make **3 small code changes** before deploying. Do these now.

### 0A — Fix `server.js`: Enable secure cookies in production

Open `backend/server.js`. Find the cookie block (line ~36) and change:
```js
// BEFORE
cookie: {
  httpOnly: true,
  secure: false,       // ← change this
  sameSite: 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000
}
```
```js
// AFTER
cookie: {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',   // ← HTTPS only in prod
  sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',  // ← cross-origin
  maxAge: 7 * 24 * 60 * 60 * 1000
}
```

> **Why?** Vercel (frontend) and Render (backend) are on different domains.  
> Cookies must be `secure: true` + `sameSite: 'none'` to cross domain boundaries.

### 0B — Fix `speechService.js`: Load credentials from environment variable

The current code uses `keyFilename`. In production (Render), you will paste the JSON content as an env variable instead of uploading a file. Change `backend/services/speechService.js` lines 8–10:

```js
// BEFORE
const speechClient = new SpeechClient({
  keyFilename: path.resolve(process.env.GOOGLE_APPLICATION_CREDENTIALS)
});
```

```js
// AFTER — works both locally (file path) AND in production (JSON string)
let speechClient;
if (process.env.GOOGLE_CREDENTIALS_JSON) {
  // Production: credentials passed as a JSON string env variable
  const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
  speechClient = new SpeechClient({ credentials });
} else {
  // Local dev: use the file path from GOOGLE_APPLICATION_CREDENTIALS
  speechClient = new SpeechClient({
    keyFilename: path.resolve(process.env.GOOGLE_APPLICATION_CREDENTIALS)
  });
}
```

### 0C — Create `frontend/.env.production`

Create a new file at `frontend/.env.production`:
```env
VITE_API_BASE_URL=https://YOUR-RENDER-APP-NAME.onrender.com
```
> You'll fill in the actual Render URL after deploying the backend. For now, leave it as a placeholder.

### 0D — Check your `frontend/src/utils/api.js`

Make sure your API calls use the env variable. Open `frontend/src/utils/api.js` and ensure the base URL is:
```js
const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';
```

---

## 📦 PART 1: Push to GitHub

### Step 1 — Create GitHub Account (if you don't have one)
Go to https://github.com → Sign up → Verify email.

### Step 2 — Create a new GitHub Repository
1. Click the **+** icon (top right) → **New repository**
2. Settings:
   - **Repository name:** `email-agent-app`
   - **Visibility:** ✅ Public (required for free Vercel/Render deploys)
   - **DO NOT** check "Add a README" or any other file
3. Click **Create repository**
4. Copy the URL shown (e.g. `https://github.com/YOUR_USERNAME/email-agent-app.git`)

### Step 3 — Push your code from PowerShell

Open PowerShell and run these commands **one by one**:

```powershell
# Navigate to your project
cd "C:\Users\ushre\Desktop\email-agent-app\new"

# Check git status — make sure no secrets are staged
git status
```

> ⚠️ If you see `.env` or `google-credentials.json` listed, STOP. Your gitignore isn't working.  
> Run: `git rm --cached backend/.env backend/google-credentials.json` then retry.

```powershell
# Stage all safe files
git add .

# Commit
git commit -m "feat: production-ready email agent"

# Add GitHub remote
git remote add origin https://github.com/YOUR_USERNAME/email-agent-app.git

# Push
git push -u origin main
```

> If your branch is called `master` instead of `main`:  
> `git push -u origin master`

### Step 4 — Verify on GitHub
Go to `https://github.com/YOUR_USERNAME/email-agent-app`.  
✅ You should see `backend/` and `frontend/` folders.  
❌ You should NOT see `.env` or `google-credentials.json` files.

---

## ⚙️ PART 2: Backend Deployment (Render)

### Step 1 — Create Render Account
Go to https://render.com → **Sign up with GitHub** (this links your repos automatically).

### Step 2 — Create a New Web Service

1. Dashboard → **New +** → **Web Service**
2. Click **Connect** next to your `email-agent-app` repo
3. Fill in the settings:

| Setting | Value |
|---|---|
| **Name** | `email-agent-backend` (or any name you like) |
| **Region** | Singapore (closest to India) |
| **Branch** | `main` |
| **Root Directory** | `backend` |
| **Runtime** | `Node` |
| **Build Command** | `npm install` |
| **Start Command** | `node server.js` |
| **Instance Type** | Free |

4. Click **Create Web Service** (do NOT click Deploy yet — add env variables first)

### Step 3 — Add Environment Variables on Render

Go to your service → **Environment** tab → **Add Environment Variable** for each:

| Key | Value |
|---|---|
| `NODE_ENV` | `production` |
| `PORT` | `10000` |
| `FRONTEND_URL` | `https://YOUR-VERCEL-APP.vercel.app` ← fill after Vercel deploy |
| `GOOGLE_CLIENT_ID` | Your Google OAuth Client ID |
| `GOOGLE_CLIENT_SECRET` | Your Google OAuth Client Secret |
| `GOOGLE_REDIRECT_URI` | `https://YOUR-RENDER-APP.onrender.com/auth/google/callback` |
| `GEMINI_API_KEY` | Your Gemini API key |
| `GEMINI_MODEL` | `gemini-2.5-flash` |
| `SESSION_SECRET` | A long random string (e.g. `xK9mP2rT8vQ4nL6jW1hA3bY7cE0dF5gH`) |
| `GOOGLE_CREDENTIALS_JSON` | *(See Part 4 below for instructions)* |

> **How to generate SESSION_SECRET:** Go to https://randomkeygen.com/ → Copy a 256-bit WEP key.

### Step 4 — Deploy the Backend

Click **Manual Deploy** → **Deploy latest commit**.  
Watch the build logs. A successful deploy ends with:
```
✅ Server running on port 10000
```

### Step 5 — Get your Backend URL

After deploy, Render shows your URL at the top:  
`https://email-agent-backend-XXXX.onrender.com`

**Save this URL** — you'll need it for Vercel and Google Cloud Console.

### Step 6 — Test Backend Health Check

Open in browser:
```
https://email-agent-backend-XXXX.onrender.com/
```

Expected response:
```json
{
  "message": "Email Agent API is running (Multi-User OAuth)",
  "gemini": "configured",
  "session": "none"
}
```

---

## 🌐 PART 3: Frontend Deployment (Vercel)

### Step 1 — Create Vercel Account
Go to https://vercel.com → **Sign up with GitHub**.

### Step 2 — Import Project

1. Dashboard → **New Project**
2. Find `email-agent-app` → Click **Import**
3. Configure the project:

| Setting | Value |
|---|---|
| **Framework Preset** | Vite |
| **Root Directory** | `frontend` |
| **Build Command** | `npm run build` |
| **Output Directory** | `dist` |
| **Install Command** | `npm install` |

### Step 3 — Add Environment Variables on Vercel

Before clicking Deploy, scroll down to **Environment Variables**:

| Key | Value |
|---|---|
| `VITE_API_BASE_URL` | `https://email-agent-backend-XXXX.onrender.com` |

> Use your actual Render backend URL here.

### Step 4 — Deploy

Click **Deploy**. Wait ~2 minutes.  
You'll get a URL like: `https://email-agent-app-abc123.vercel.app`

**Save this URL** — it's your public frontend.

### Step 5 — Update Backend FRONTEND_URL

Go back to Render → **Environment** tab → Update:
```
FRONTEND_URL = https://email-agent-app-abc123.vercel.app
```
Then click **Manual Deploy** → **Deploy latest commit** to apply the change.

---

## 🔐 PART 4: Google OAuth Production Setup

### Step 1 — Open Google Cloud Console

Go to https://console.cloud.google.com  
Select your existing project (the one you used for local development).

### Step 2 — Configure OAuth Consent Screen

Navigate: **APIs & Services** → **OAuth consent screen**

1. **User Type:** Select `External` → Click **Create**
2. Fill in:
   - **App name:** `AI Email Agent`
   - **User support email:** your Gmail
   - **Developer contact:** your Gmail
3. Click **Save and Continue**
4. **Scopes page:** Click **Add or Remove Scopes**, add:
   - `https://www.googleapis.com/auth/gmail.send`
   - `https://www.googleapis.com/auth/userinfo.email`
   - `https://www.googleapis.com/auth/userinfo.profile`
   - Click **Update** → **Save and Continue**
5. **Test users page:** Click **Save and Continue** (skip this — we'll go to Production)
6. **Summary:** Click **Back to Dashboard**

### Step 3 — Publish to Production (WITHOUT Google Verification)

On the OAuth Consent Screen page, find the **Publishing Status** section.  
Click **Publish App** → **Confirm**.

Status changes from **Testing** to **In Production**.

> ✅ **This is the key step.** "In Production" means ANYONE with a Google account can log in.  
> They will see an "unverified app" warning screen — this is expected and acceptable.  
> Users click **"Advanced"** → **"Go to AI Email Agent (unsafe)"** to proceed.

### Step 4 — Update OAuth Credentials (Authorized URIs)

Navigate: **APIs & Services** → **Credentials** → Click your **OAuth 2.0 Client ID**

**Authorized JavaScript origins — Add:**
```
https://email-agent-app-abc123.vercel.app
```

**Authorized redirect URIs — Add:**
```
https://email-agent-backend-XXXX.onrender.com/auth/google/callback
```

> Keep your existing localhost entries too (for local development).

Click **Save**.

> ⚠️ Changes take **5–10 minutes** to propagate. Do not test immediately.

---

## 🎤 PART 5: Google Speech-to-Text — Secure Credential Deployment

> **Rule:** NEVER commit `google-credentials.json` to GitHub.

### Step 1 — Get your Service Account JSON content

Open `backend/google-credentials.json` in any text editor.  
It looks like:
```json
{
  "type": "service_account",
  "project_id": "...",
  "private_key_id": "...",
  "private_key": "-----BEGIN RSA PRIVATE KEY-----\n...",
  ...
}
```

### Step 2 — Convert to a single-line string (for Render)

In PowerShell:
```powershell
# Read the file and convert to a single-line JSON string
$json = Get-Content "C:\Users\ushre\Desktop\email-agent-app\new\backend\google-credentials.json" -Raw
$json | ConvertTo-Json -Compress | Set-Clipboard
```

Or manually: Copy the entire file content as-is (Render accepts multi-line env vars).

### Step 3 — Add to Render as Environment Variable

Render Dashboard → Your backend service → **Environment** tab:

| Key | Value |
|---|---|
| `GOOGLE_CREDENTIALS_JSON` | *(Paste the entire JSON content of google-credentials.json)* |

> Render stores this securely and it is never exposed publicly.

### Step 4 — Verify the code change from Part 0B is deployed

Your `speechService.js` now reads from `GOOGLE_CREDENTIALS_JSON` in production.  
No file path is needed on Render — the JSON is loaded directly from the environment.

### Step 5 — Ensure STT API is enabled in Google Cloud

Google Cloud Console → **APIs & Services** → **Library**  
Search: `Cloud Speech-to-Text API` → Click it → Click **Enable** (if not already enabled)

---

## 🤖 PART 6: Gemini API

This is already handled in Part 2 Step 3. Just confirm:

Render → **Environment** tab has:
```
GEMINI_API_KEY = AIzaSy...your-key...
GEMINI_MODEL   = gemini-2.5-flash
```

No other changes needed — your backend already reads these from `process.env`.

---

## 🌐 PART 7: Production CORS Configuration

Your `server.js` already has good CORS setup. After the code change in **Part 0A**, verify it reads:

```js
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

app.use(cors({
  origin: FRONTEND_URL,
  credentials: true
}));
```

And the session cookie is:
```js
cookie: {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000
}
```

On Render, `NODE_ENV=production` and `FRONTEND_URL=https://your-vercel-app.vercel.app` are set.  
This means cookies flow correctly from Vercel → Render cross-domain.

---

## 🔁 PART 8: Final OAuth Redirect Flow Summary

Here's what the full login flow looks like in production:

```
1. User clicks "Login with Google" on Vercel frontend
2. Frontend opens popup: https://YOUR-RENDER.onrender.com/auth/google
3. Render redirects to Google's consent screen
4. User signs in → Google redirects to:
   https://YOUR-RENDER.onrender.com/auth/google/callback
5. Render exchanges code → tokens → saves session → redirects to:
   https://YOUR-VERCEL.vercel.app/?auth=success
6. Frontend reads ?auth=success → writes to localStorage → closes popup
7. Parent window detects localStorage change → marks user as authenticated
```

**All URIs must match exactly** — no trailing slashes, correct protocol (https).

---

## ⚠️ PART 9: Common Errors & Fixes

### ❌ `redirect_uri_mismatch`
**Cause:** The URI in Google Cloud Console doesn't exactly match `GOOGLE_REDIRECT_URI` env var.  
**Fix:**
1. Render env: `GOOGLE_REDIRECT_URI=https://YOUR-RENDER.onrender.com/auth/google/callback`
2. Google Console → Credentials → Add this exact same URI under **Authorized redirect URIs**
3. Wait 10 minutes, redeploy.

---

### ❌ `CORS blocked` / `Access-Control-Allow-Origin`
**Cause:** `FRONTEND_URL` env var on Render is wrong or not updated.  
**Fix:**
- Render → Environment → `FRONTEND_URL` must be exactly `https://YOUR-VERCEL.vercel.app` (no trailing slash)
- Redeploy backend after changing env vars

---

### ❌ `access_denied` / OAuth login blocked
**Cause:** App is still in **Testing** mode on OAuth Consent Screen.  
**Fix:** Google Cloud Console → OAuth Consent Screen → Click **Publish App** → Confirm.

---

### ❌ Service Account permission denied
**Cause 1:** `GOOGLE_CREDENTIALS_JSON` env var on Render is malformed.  
**Fix:** Re-paste the JSON. Make sure the quotes are correct (no extra escaping).

**Cause 2:** STT API not enabled.  
**Fix:** Google Cloud Console → APIs & Services → Library → Enable "Cloud Speech-to-Text API".

**Cause 3:** Service account doesn't have STT permissions.  
**Fix:** Google Cloud Console → IAM & Admin → Add your service account email → Role: "Cloud Speech Client".

---

### ❌ Render app crashes on start
**Causes & Fixes:**
1. Missing env variables → Check ALL variables in Part 2 Step 3 are added
2. `GOOGLE_CREDENTIALS_JSON` has parse error → Re-paste it as raw JSON
3. Port conflict → Make sure `PORT=10000` is set (Render uses 10000 by default)
4. Check Render logs: Dashboard → Your service → **Logs** tab

---

### ❌ `Missing environment variables` error
**Cause:** Forgot to redeploy after adding env variables.  
**Fix:** Render → **Manual Deploy** → **Deploy latest commit** after ANY env change.

---

### ❌ Speech-to-Text quota / billing error
**Cause:** Google STT has a free tier limit (60 min/month). After that, billing is required.  
**Fix:** Google Cloud Console → Billing → Link a billing account (first 60 min/month is free).

---

### ❌ Vercel build fails
**Cause:** Missing `frontend/.env.production` or wrong `VITE_API_BASE_URL`.  
**Fix:** Vercel Dashboard → Your project → **Settings** → **Environment Variables** → Add `VITE_API_BASE_URL`.

---

### ❌ Session lost on every page refresh
**Cause:** `secure` and `sameSite` cookie settings mismatch.  
**Fix:** Confirm the code change in **Part 0A** is deployed (both `secure: true` and `sameSite: 'none'`).

---

## ✅ PART 10: Final Verification Checklist

Work through these in order after deployment.

### Phase 1 — Infrastructure Check
- [ ] GitHub repo has `backend/` and `frontend/` folders
- [ ] GitHub does NOT have `.env`, `google-credentials.json`, `tokens.json`
- [ ] Render backend URL is live: `https://YOUR-RENDER.onrender.com/` returns JSON
- [ ] Vercel frontend URL loads the app: `https://YOUR-VERCEL.vercel.app`

### Phase 2 — Google OAuth Check
- [ ] OAuth Consent Screen status is **In production** (not Testing)
- [ ] Authorized JavaScript Origins includes your Vercel URL
- [ ] Authorized Redirect URIs includes `https://YOUR-RENDER.onrender.com/auth/google/callback`
- [ ] `GOOGLE_REDIRECT_URI` on Render matches exactly

### Phase 3 — Login Test
1. Open `https://YOUR-VERCEL.vercel.app` in **Incognito** window
2. Click **Login with Google**
3. A popup opens → Google shows "unverified app" warning
4. Click **Advanced** → **Go to AI Email Agent (unsafe)**
5. Select your Google account → Allow permissions
6. Popup closes → Main window shows your email address as logged in
- [ ] Login works
- [ ] Email address shows in the UI

### Phase 4 — Voice Input Test
1. Click **Start Voice Input**
2. Speak: *"Send an email to test@gmail.com with subject Hello and body This is a test"*
3. Click **Stop Recording**
4. Wait for transcription (2–5 seconds)
- [ ] Transcription appears in text box
- [ ] Email fields auto-fill (recipient, subject, body)

### Phase 5 — Email Send Test
1. Confirm email fields are filled
2. Click **Send Email**
3. Check your Gmail sent folder
- [ ] Email appears in sent folder
- [ ] Recipient receives the email

---

## 📊 Environment Variables — Complete Reference

### Backend (Render)
```
NODE_ENV                = production
PORT                    = 10000
FRONTEND_URL            = https://YOUR-VERCEL-APP.vercel.app
GOOGLE_CLIENT_ID        = 698867385524-xxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET    = GOCSPX-xxxxxxxxxxxxxxxxxxxx
GOOGLE_REDIRECT_URI     = https://YOUR-RENDER-APP.onrender.com/auth/google/callback
GEMINI_API_KEY          = AIzaSy-xxxxxxxxxxxxxxxxxxxx
GEMINI_MODEL            = gemini-2.5-flash
SESSION_SECRET          = [long-random-string-min-32-chars]
GOOGLE_CREDENTIALS_JSON = {"type":"service_account","project_id":"..."}
```

### Frontend (Vercel)
```
VITE_API_BASE_URL = https://YOUR-RENDER-APP.onrender.com
```

---

## 🔄 Deployment Update Workflow (Future Changes)

After making code changes locally:
```powershell
cd "C:\Users\ushre\Desktop\email-agent-app\new"
git add .
git commit -m "fix: description of change"
git push
```

- **Vercel** auto-deploys on push (no manual action needed)
- **Render** auto-deploys on push if **Auto-Deploy** is enabled (check Render Settings)

---

## 🏁 Final URLs (fill in after deployment)

| Service | URL |
|---|---|
| Frontend (Vercel) | `https://_____________________.vercel.app` |
| Backend (Render) | `https://_____________________.onrender.com` |
| Google Callback | `https://_____________________.onrender.com/auth/google/callback` |

---

> **Tip:** Render's free tier spins down after 15 minutes of inactivity. The first request after idle  
> takes ~30 seconds. This is normal for free tier. Upgrade to a paid plan to avoid cold starts.
