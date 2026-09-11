# Phase 1 — Auth module

**Date:** 2026-09-11 · **Status:** ✅ done, verified · **Kit prompt:** Prompt 1

## Scope
Full authentication: email/password, refresh-token rotation, Google SSO, password reset,
plus the client-side session layer. No groups, no expenses.

## Backend

### Models
| Model | Fields |
|---|---|
| `User` | name, email (unique + indexed, lowercased), passwordHash, avatarUrl, defaultCurrency (`PKR`), googleId (sparse index), notifications{email, groupActivity, budgetAlerts}, resetTokenHash + resetTokenExpiresAt (both `select:false`), timestamps |
| `RefreshToken` | userId, tokenHash (unique), expiresAt (**TTL index** — Mongo sweeps expired rows), revokedAt, replacedBy, createdAt |

`User.toPublic()` is the only shape sent to clients. A `toJSON` transform strips
`passwordHash` and the reset fields as a second line of defence.

### Routes — all under `/api/v1`
| Method | Path | Notes |
|---|---|---|
| POST | `/auth/register` | bcrypt cost 12 → 201 + access token + refresh cookie |
| POST | `/auth/login` | identical error for unknown email and wrong password |
| POST | `/auth/refresh` | rotates the cookie, revokes the old row, **reuse detection** |
| POST | `/auth/logout` | revokes the presented token, clears the cookie |
| GET | `/auth/me` | `requireAuth` |
| POST | `/auth/google` | accepts `idToken` (GIS) or `code` (server exchange); find-or-create, links googleId to an existing email account |
| POST | `/auth/forgot-password` | always the same response — no account enumeration |
| POST | `/auth/reset-password/:token` | sha256-hashed token, 30-min expiry, revokes every session |

Envelope everywhere: `{ success, data }` / `{ success:false, error:{ code, message } }`.

### Security decisions
- **Refresh cookie**: HttpOnly, `SameSite=Strict`, `Secure` in production, `Path=/api/v1/auth` — it is never attached to ordinary API calls.
- **Rotation with reuse detection**: presenting an already-rotated token revokes *every* session for that user (`TOKEN_REUSED`), the standard stolen-cookie response.
- **Access token lives in memory on the client**, never `localStorage` — XSS cannot read it.
- **Reset tokens**: 32 random bytes, only the sha256 hash is stored, single use, 30-minute window. A successful reset revokes all refresh tokens.
- **Rate limits** (`express-rate-limit`): register/login 10 per 15 min, refresh 60 per 15 min, google 20 per 15 min, forgot-password 5 per hour, reset 10 per hour. Skipped under `NODE_ENV=test`.
- **Zod on every body**, plus the `:token` param. Errors collapse to one readable `VALIDATION_ERROR` message.

### Mail
`services/mailer.js` uses NodeMailer when `SMTP_HOST` is set; otherwise it prints the reset
link to the server console. That keeps the FYP demo runnable with no SMTP account.
Marked `ponytail:` in the source as a deliberate dev fallback.

## Frontend
| File | Role |
|---|---|
| `api/client.js` | axios instance, in-memory access token, **silent refresh**: one retry per request, concurrent 401s share a single refresh call |
| `api/auth.js` | typed-ish API functions; pages never call axios directly |
| `context/AuthContext.jsx` | `user`, `booting`, `login`, `register`, `googleLogin`, `logout`; on mount it tries the refresh cookie so a reload keeps you signed in |
| `components/ProtectedRoute.jsx` | `Outlet` guard, redirects to `/login` and remembers `from` |
| `components/AuthLayout.jsx` | two-panel layout — dark brand panel left, form right, collapses to one column below `lg` |
| `components/GoogleButton.jsx` | loads Google Identity Services on demand, renders Google's own button, returns an `idToken`. Renders nothing when `VITE_GOOGLE_CLIENT_ID` is unset |
| `components/Field / SubmitButton / FormError` | inline validation, loading spinner, `role="alert"` errors |
| Pages | `/login`, `/register`, `/forgot-password`, `/reset-password/:token`, protected `/` |

## Bug found and fixed during verification
`GET /auth/me` returned `hasPassword: false` for a password account. Cause: `passwordHash`
was `select:false`, so `User.findById` in `requireAuth` never loaded it and `toPublic()`
read `undefined`. Fixed by dropping `select:false` and adding the `toJSON` scrub instead —
one source of truth, no per-query `+passwordHash` bookkeeping. Regression test added.

## Verification run
```
server: npm test        → 19 passed (2 files)
client: npm run build   → built, 0 errors
```
Test coverage: register happy path + cookie flags + no hash leak, duplicate email 409,
short password 400 with no user written, login success, wrong password, unknown email
(same code), refresh rotation, reuse detection, refresh without cookie, `/me` with/without/bad
token, `hasPassword` regression, logout revocation, forgot-password identical answers,
full reset → sessions killed → new password works → old password rejected, expired reset token.

### Live curl sequence (run against an in-memory Mongo on :5055)
```
1  health                → {"success":true,...,"db":"connected"}
2  register              → 201, user + accessToken, Set-Cookie rt=… HttpOnly SameSite=Strict Path=/api/v1/auth
3  register again        → 409 EMAIL_TAKEN
4  login                 → 200, accessToken
5  login wrong password  → 401 BAD_CREDENTIALS
6  me (Bearer)           → 200, user, hasPassword true
7  me (no token)         → 401 NO_TOKEN
8  refresh (cookie)      → 200, new cookie issued
9  refresh (old cookie)  → 401 TOKEN_REUSED, all sessions revoked
10 forgot-password       → 200 generic message, link printed to server console
11 forgot unknown email  → byte-identical response
12 register bad body     → 400 VALIDATION_ERROR "name: … ; email: … ; password: …"
```

### Repeat it yourself
```bash
cd server && cp .env.example .env   # set MONGO_URI, JWT_ACCESS_SECRET, JWT_REFRESH_SECRET
npm run dev
curl -s localhost:5000/api/v1/health
curl -s -c /tmp/cj -X POST localhost:5000/api/v1/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"name":"Azeem Khan","email":"azeem@demo.pk","password":"Demo1234"}'
TOK=$(curl -s -c /tmp/cj -X POST localhost:5000/api/v1/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"azeem@demo.pk","password":"Demo1234"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["data"]["accessToken"])')
curl -s localhost:5000/api/v1/auth/me -H "Authorization: Bearer $TOK"
curl -s -b /tmp/cj -c /tmp/cj -X POST localhost:5000/api/v1/auth/refresh
```

## New env vars in use
`JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `JWT_ACCESS_TTL` (default 15m),
`JWT_REFRESH_TTL_DAYS` (default 7), `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
`GOOGLE_REDIRECT_URI`, `SMTP_*`, `MAIL_FROM`, `CLIENT_URL`, client `VITE_GOOGLE_CLIENT_ID`.
*(`.env.example` said `JWT_REFRESH_TTL=7d`; corrected to `JWT_REFRESH_TTL_DAYS=7` to match the code.)*

## Known gaps (deliberate)
- Google SSO is untestable offline — it needs a real client ID. Code path is written for both `idToken` and `code`.
- Email delivery unverified (console fallback until SMTP is configured).
- No email-verification-on-signup flow; not in the SRS.

## Next
**Phase 2 — Groups & membership** (kit Prompt 2): Group model, invite-by-email with join links,
membership middleware, groups list / create / detail shell with a live Members tab,
and 403 authorization tests for non-members.

## Resume this session
```bash
cd /home/pisces/Projects/smartsplit && claude --resume 216976ad-54e0-41a4-802b-9ac1a4b9747c
```
