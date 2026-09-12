# Phase 9 — Hardening, seed and deployment

**Date:** 2026-09-13 · **Status:** ✅ done, verified · **Kit prompt:** Prompt 9

## 1. Security sweep

### Audited every route
All 38 routes were listed and checked for three things: authentication, Zod validation, and an
ownership check. **Four real gaps were found and closed:**

| Gap | Risk | Fix |
|---|---|---|
| No global rate limit — only `/auth/*` was covered | Any authenticated endpoint could be hammered | `globalLimiter` (600 / 15 min) on the whole `/api/v1` surface |
| `/receipts/scan` unlimited | Each scan calls a **paid vision API** — abuse costs money, not just CPU | `scanLimiter`, 30 per hour per IP |
| Cloudinary URLs permanent and public | A receipt is a personal document; a leaked link would work forever | Uploads are now `type: 'authenticated'`, and `publicReceipt()` **re-signs a 1-hour URL on every read** |
| No `trust proxy` | Behind Render's proxy every request looks like one IP, so rate limiting would throttle all users together | `app.set('trust proxy', 1)` |

Exports also got their own limiter (40 / 15 min) — each one renders a PDF or workbook in-process.

### Already in place, confirmed
- `helmet()`, CORS locked to `CLIENT_URL` with credentials
- Refresh cookie `HttpOnly` + `Secure` in production + `SameSite=Strict` + path-scoped
- Access token in memory only, never `localStorage`
- bcrypt cost 12; reset tokens stored as sha256 hashes, single use, 30-minute expiry
- Zod on every body, param and query that carries input
- `requireMember` / `requireAdmin` on every group route; personal, receipt and notification
  routes scoped to `req.user._id` (another user's id returns 404, never their data)
- **No secret is hardcoded** — verified by grep; all 18 config values come from env

### New: fail-fast env guard
`config/env.js` refuses to start a production server when a required variable is missing, when
a JWT secret still holds its `.env.example` placeholder, when a secret is under 32 characters,
when both secrets are identical, or when `CLIENT_URL` is unset. Development stays lenient.

## 2. UX sweep
- Every list has loading, empty and error states (`States.jsx` + `useAsync`) — enforced from
  phase 2 onwards rather than retrofitted here.
- Destructive actions confirm first: delete expense, delete transaction, remove member.
- Forms validate inline and keep the submit button disabled while a readable problem is
  showing ("You're Rs 50 short", "Percentages add up to 90%, not 100%").
- Layout is responsive by construction: every wide table sits in an `overflow-x-auto` wrapper,
  grids collapse to one column below `sm`/`lg`, charts use `ResponsiveContainer`, and the
  verification modal stacks its two panes on narrow screens.
  **Caveat:** this was verified by reading the markup, not in a real browser — the 360px check
  is on the smoke-test list in `DEPLOY.md` for you to run against the deployed site.

## 3. Tests and audit
```
server: npm test   → 174 passed (12 files)
client: npm run build → built, 0 errors
npm audit → 0 vulnerabilities (server, client, root)
```
7 new tests cover the env guard. The `exceljs`→`uuid` advisory from phase 8 stays fixed by the
npm `overrides` pin rather than a forced major downgrade.

## 4. Seed script — `npm run seed`
One command produces the whole FYP demo:

| Data | Detail |
|---|---|
| Users | 5 — **azeem@demo.pk / Demo1234**, plus Sara, Bilal, Hamza, Ali (same password) |
| Murree Trip | 5 members, 7 expenses totalling **Rs 49,600** — hotel, fuel both ways, dinner, chairlift, breakfast, souvenirs |
| Flat 3B | second group so the list is not a single row |
| Personal | 12 transactions incl. salary, rent, K-Electric, StormFiber, Careem, Easypaisa/JazzCash/Raast methods; 3 marked recurring |
| Budgets | 4 caps, set so one category lands in the amber band |
| Receipts | 3 scanned receipts, already price-matched against the book |
| Price book | 100 products / 209 platform rows |
| Notifications | 2 seeded feed entries |

Verified end to end against a temporary in-memory MongoDB: exits 0, writes every collection.
**It wipes all collections first** — that warning is in `DEPLOY.md` too.

## 5. Deployment — `DEPLOY.md`
Full walkthrough: Atlas cluster and connection string, Render service (root `server`, health
check `/api/v1/health`) with a table of every environment variable and how to generate the
secrets, Vercel project (root `client`) with `VITE_API_URL`, the **`vercel.json` SPA rewrite**
without which refreshing `/groups/123` 404s, seeding production, and optional Google OAuth.

It ends with a **40-point production smoke test** grouped by area — health and auth, groups and
expenses, the settlement demo, personal/scanning/reports, and security and layout — including
the checks that matter for the viva: payment count ≤ members − 1, the "N → M payments" stat,
the `rt` cookie flags, and no token in `localStorage`.

Gotchas documented: Render free tier sleeps after ~15 minutes (wake it before demoing), the
recurring cron is best-effort on a sleeping instance, and rotating a JWT secret signs everyone out.

## Project complete
All ten phases (0-9) are built, tested and committed.

## Resume this session
```bash
cd /home/pisces/Projects/smartsplit && claude --resume 216976ad-54e0-41a4-802b-9ac1a4b9747c
```
