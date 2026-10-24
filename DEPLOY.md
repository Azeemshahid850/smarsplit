# Deploying SmartSplit & ExpenseAI

Three pieces: **MongoDB Atlas** (database), **Render** (Express API), **Vercel** (Vite client).
Do them in that order — the API needs the database URI, and the client needs the API URL.

---

## 1. MongoDB Atlas

1. Create a free **M0** cluster at <https://cloud.mongodb.com>.
2. **Database Access** → Add user, e.g. `smartsplit`, password auto-generated. Copy it.
3. **Network Access** → Add IP address → **Allow access from anywhere** (`0.0.0.0/0`).
   Render's outbound IPs are not fixed on the free tier.
4. **Connect → Drivers** → copy the connection string and add the database name:

```
mongodb+srv://smartsplit:<password>@cluster0.xxxxx.mongodb.net/smartsplit?retryWrites=true&w=majority
```

---

## 2. Render — the API

**New → Web Service** → connect the repo.

| Setting | Value |
|---|---|
| Root directory | `server` |
| Build command | `npm install` |
| Start command | `npm start` |
| Instance type | Free |
| Health check path | `/api/v1/health` |

### Environment variables
Generate each secret with `openssl rand -hex 32` — never reuse one.

| Key | Value |
|---|---|
| `NODE_ENV` | `production` |
| `MONGO_URI` | the Atlas string from step 1 |
| `JWT_ACCESS_SECRET` | 64-char random hex |
| `JWT_REFRESH_SECRET` | a **different** 64-char random hex |
| `JWT_ACCESS_TTL` | `15m` |
| `JWT_REFRESH_TTL_DAYS` | `7` |
| `CLIENT_URL` | your Vercel URL, e.g. `https://smartsplit.vercel.app` — **no trailing slash** |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | from Google Cloud Console (optional) |
| `GOOGLE_REDIRECT_URI` | `https://<vercel-url>/auth/google/callback` |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `MAIL_FROM` | invite, join-request and password-reset email (optional — without it nothing is emailed; admins share invite links by copy or WhatsApp, and reset links are logged to the server console) |
| `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` | receipt image storage (optional — without it images are inlined as data URLs) |
| `VISION_API_KEY` | Anthropic API key for receipt OCR (optional — without it Tesseract runs offline instead) |

`CLIENT_URL` is not cosmetic: CORS is locked to it and the refresh cookie is `SameSite=Strict`.
Get it wrong and login appears to work but every later request 401s.

---

## 3. Vercel — the client

**Add New → Project** → import the repo.

| Setting | Value |
|---|---|
| Framework preset | Vite |
| Root directory | `client` |
| Build command | `npm run build` |
| Output directory | `dist` |

### Environment variables
| Key | Value |
|---|---|
| `VITE_API_URL` | `https://<your-render-service>.onrender.com/api/v1` |
| `VITE_GOOGLE_CLIENT_ID` | same client ID as the server (optional) |

### SPA routing
React Router owns the routes, so every path must serve `index.html`. Add `client/vercel.json`:

```json
{ "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }
```
Without it, refreshing `/groups/123` returns a Vercel 404.

---

## 4. Seed the demo data

From your machine, pointed at the production database:

```bash
cd server
MONGO_URI="<the Atlas string>" npm run seed
```

Creates: five users (**azeem@demo.pk / Demo1234**), the Murree Trip group with 7 expenses,
a Flat 3B group, 12 personal transactions, 4 budgets, 3 price-matched receipts, and the
100-product price book.

**The seed wipes every collection first.** Never run it against a database with real data.

---

## 5. Google OAuth (optional)

1. Google Cloud Console → **APIs & Services → Credentials → OAuth client ID → Web application**.
2. Authorised JavaScript origins: your Vercel URL.
3. Authorised redirect URIs: `https://<vercel-url>/auth/google/callback`.
4. Put the client ID in **both** `GOOGLE_CLIENT_ID` (Render) and `VITE_GOOGLE_CLIENT_ID` (Vercel).

---

## 6. Production smoke test

Run this list against the deployed site, in order. Every step should pass before you demo.

### Health and auth
- [ ] `curl https://<api>/api/v1/health` → `{"success":true,...,"db":"connected"}`
- [ ] Open the Vercel URL → redirected to `/login`
- [ ] Register a new account → lands on the dashboard
- [ ] Reload the page → still signed in (the refresh cookie is working)
- [ ] Sign out → back to `/login`; the browser back button does not restore the dashboard
- [ ] Sign in as `azeem@demo.pk` / `Demo1234` → dashboard shows the seeded groups
- [ ] Wrong password → "Invalid email or password"
- [ ] Forgot password → generic "if that email is registered" message

### Groups and expenses
- [ ] Groups list shows **Murree Trip** and **Flat 3B** with balances
- [ ] Open Murree Trip → Expenses tab lists 7 expenses
- [ ] Add an expense, Equal split → balances change immediately
- [ ] Add an expense with two payers → "covered Rs X of Y" turns green only when they match
- [ ] Try to save with an amount mismatch → save stays disabled with a readable message
- [ ] Balances tab → footnote reads "Balances net to zero"
- [ ] Members tab → invite an unknown email → a join link appears, copies, and the WhatsApp button opens wa.me with it
- [ ] Open that join link in a private window → shows "X invited you to …" with Create account / Sign in
- [ ] Create the account from there → lands inside the group (no detour through the dashboard)
- [ ] Invite another email, then register that email normally → Dashboard shows the invitation banner, Groups page shows Join / Decline
- [ ] Share link → "Ask to join" as another user → their Groups page shows "waiting for approval"; admin approves from the Members tab
- [ ] Members tab → Make admin / Remove admin on a member; the last admin cannot be demoted

### Settlement (the viva demo)
- [ ] Settle up → "Simplify with Min-Cash-Flow"
- [ ] Payment count is **at most members − 1**, and the "N → M payments" stat shows
- [ ] Record settlement → group shows the settled banner and the audit trail
- [ ] Mark a payment paid → that person's balance goes to zero

### Personal, scanning, reports
- [ ] Personal page → three stat cards, category bars, recent transactions
- [ ] Add a transaction with JazzCash → appears instantly
- [ ] Set a Food budget below current spend → the bar turns red
- [ ] Scan a receipt photo → processing state → verification modal opens
- [ ] Edit a line → the running total updates and the line is marked corrected
- [ ] Save to Personal → the transaction appears on the Personal page
- [ ] Reports → donut, six-month lines and budget bars all render
- [ ] Export CSV, Excel and PDF → all three download and open
- [ ] Notification bell shows activity from the other demo users

### Security and layout
- [ ] Signed out, open `/groups` directly → redirected to login, no data flashes
- [ ] Open a group you are not a member of by id → "not a member", not its contents
- [ ] Resize to **360px** → no horizontal scrolling on any page
- [ ] DevTools → Application → Cookies: `rt` is `HttpOnly`, `Secure`, `SameSite=Strict`
- [ ] DevTools → Network: no access token in `localStorage`

---

## Notes and gotchas

- **Render free tier sleeps** after ~15 minutes idle; the first request afterwards takes
  ~30 seconds. The server pings its own `/api/v1/health` every 10 minutes when Render's
  `RENDER_EXTERNAL_URL` is present, which keeps it awake. Still open the site a minute
  before demoing in case it was redeployed.
- **Rate limits are per IP.** A classroom or office shares one, so the auth limits are sized
  for a room (50 sign-ups, 60 logins, 300 refreshes per 15 min). If a demo audience still
  sees "Too many attempts", raise them in `server/src/routes/auth.js`.
- **The recurring-transactions cron** (`0 2 * * *`) only fires while the service is awake. On
  the free tier, treat it as best-effort.
- **Never commit `.env`.** It is in `.gitignore`; keep it that way.
- **Rotating a JWT secret signs everybody out** — that is the intended behaviour.
