# Narvar Meeting Scheduler

Automatically schedules client meetings when a Rocketlane task is marked complete.

**Flow:**
1. Rocketlane task → "Completed" → webhook fires
2. Google Calendar queried for all internal attendees' availability
3. Client calendar checked if accessible (falls back to internal-only)
4. Booking link emailed to client with 4–5 available 30-min slots
5. Client selects a time → confirmation email sent to pilot address

---

## Stack

| Layer | Tool | Cost |
|---|---|---|
| Hosting + serverless functions | Vercel (free tier) | Free |
| Calendar availability | Google Calendar API (via Google Workspace) | Included in Workspace |
| Email sending | Gmail API (via Google Workspace) | Included in Workspace |
| Project/client lookup | Rocketlane REST API | Included in Rocketlane |

---

## Setup

### 1. Clone & install

```bash
git clone <your-repo-url>
cd narvar-scheduler
npm install
```

### 2. Google OAuth2 credentials

You need OAuth2 credentials to query Google Calendar and send Gmail.

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a new project (or use an existing one)
3. Enable **Google Calendar API** and **Gmail API**
4. Go to **APIs & Services → Credentials → Create Credentials → OAuth 2.0 Client ID**
5. Choose **Web application**
6. Add `https://developers.google.com/oauthplayground` as an authorized redirect URI
7. Note your **Client ID** and **Client Secret**

**Get a refresh token:**
1. Go to [developers.google.com/oauthplayground](https://developers.google.com/oauthplayground)
2. Click the gear icon → check **Use your own OAuth credentials** → enter your Client ID + Secret
3. In Step 1, authorize these scopes:
   - `https://www.googleapis.com/auth/calendar.readonly`
   - `https://www.googleapis.com/auth/gmail.send`
4. Click **Authorize APIs** and sign in with a Narvar Google account
5. In Step 2, click **Exchange authorization code for tokens**
6. Copy the **Refresh token**

### 3. Rocketlane API key

1. In Rocketlane, go to **Settings → API**
2. Generate a new API key
3. Copy it

### 4. Environment variables

Copy `.env.example` to `.env.local` and fill in all values:

```bash
cp .env.example .env.local
```

```
ROCKETLANE_API_KEY=rl_live_xxxxxxxxxxxx
GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxxxxxx
GOOGLE_REFRESH_TOKEN=1//xxxxxxxxxxxx
GOOGLE_SERVICE_EMAIL=your-name@narvar.com
PILOT_EMAIL=tyler.mcdermott@narvar.com
APP_URL=http://localhost:3000
WEBHOOK_SECRET=any-random-string-you-choose
```

### 5. Local development

```bash
npm run dev
```

This starts the Vercel dev server at `http://localhost:3000`.

To test the webhook locally, use [ngrok](https://ngrok.com) to expose your local server:

```bash
npx ngrok http 3000
```

Copy the ngrok URL — you'll use it as the webhook endpoint in Rocketlane.

---

## Deploy to Vercel

### First deploy

```bash
# Install Vercel CLI if you haven't
npm i -g vercel

# Login
vercel login

# Deploy
vercel --prod
```

Note the production URL (e.g. `https://narvar-scheduler.vercel.app`).

### Add environment variables to Vercel

```bash
vercel env add ROCKETLANE_API_KEY
vercel env add GOOGLE_CLIENT_ID
vercel env add GOOGLE_CLIENT_SECRET
vercel env add GOOGLE_REFRESH_TOKEN
vercel env add GOOGLE_SERVICE_EMAIL
vercel env add PILOT_EMAIL
vercel env add WEBHOOK_SECRET
vercel env add APP_URL
```

Or add them through the Vercel dashboard: **Project → Settings → Environment Variables**

Set `APP_URL` to your production Vercel URL.

### Redeploy with env vars

```bash
vercel --prod
```

---

## Configure Rocketlane Webhook

1. In Rocketlane, go to **Settings → Webhooks → Create Webhook**
2. Set the endpoint URL to:
   ```
   https://your-vercel-url.vercel.app/api/webhook
   ```
3. Select event type: **Task Updated**
4. Add a condition: **Status → is → Completed**
5. Save

That's it — any task marked "Completed" will now trigger the scheduler.

---

## API Endpoints

| Method | Path | Description |
|---|---|---|
| POST | `/api/webhook` | Receives Rocketlane task completion events |
| GET | `/api/session/[id]` | Returns slot data for booking page |
| POST | `/api/confirm` | Confirms a selected slot, sends confirmation email |

---

## Scheduling Logic

- **Window:** 3–10 business days from today
- **Hours:** 11am–6pm EST (8am–3pm PST)
- **Duration:** 30 minutes
- **Slots returned:** Up to 5 non-overlapping slots where all internal attendees are free
- **Client calendar:** Attempted via Google Calendar API. If inaccessible, falls back to internal-only slots gracefully
- **Client email source:** `GET /api/1.0/projects/{projectId}` → `teamMembers.customerChampion.emailId` (falls back to `teamMembers.customers[0].emailId`)

---

## Pilot Mode

While `PILOT_EMAIL` is set in your environment variables:
- All outbound emails (booking link + confirmation) go to `PILOT_EMAIL` only
- Emails are labeled `[PILOT]` in the subject
- A banner in each email shows the original intended recipient
- No calendar invites are created or sent

To exit pilot mode and go live: remove `PILOT_EMAIL` from your Vercel environment variables and redeploy.

---

## Production Checklist (post-pilot)

- [ ] Remove `PILOT_EMAIL` env var to enable real email delivery
- [ ] Add Google Calendar invite creation in `api/confirm.js` using `calendar.events.insert`
- [ ] Add Slack notification to PM in `api/confirm.js` using Slack Incoming Webhooks
- [ ] Optionally write back to Rocketlane via API to update a field/task status on booking
- [ ] Swap `lib/store.js` in-memory store for [Vercel KV](https://vercel.com/docs/storage/vercel-kv) (free tier: 30k requests/month)

---

## Project Structure

```
narvar-scheduler/
├── api/
│   ├── webhook.js          # Rocketlane webhook receiver
│   ├── confirm.js          # Slot confirmation handler
│   └── session/
│       └── [id].js         # Session data endpoint for booking page
├── lib/
│   ├── calendar.js         # Google Calendar free/busy logic
│   ├── mailer.js           # Gmail API email sender
│   └── store.js            # In-memory session store
├── public/
│   └── book.html           # Client-facing booking page
├── .env.example            # Environment variable template
├── vercel.json             # Vercel routing config
├── package.json
└── README.md
```
