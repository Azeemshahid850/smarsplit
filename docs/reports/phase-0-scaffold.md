# Phase 0 — Scaffold

**Date:** 2026-09-11 · **Status:** ✅ done, verified · **Kit prompt:** Prompt 0

## Scope
Monorepo skeleton only. No features, no auth, no models beyond the health route.

## What was built

### Root
| File | Purpose |
|---|---|
| `CLAUDE.md` | Project memory — Part A of the build kit, verbatim |
| `package.json` | `concurrently` runs both sides: `npm run dev` |
| `.gitignore` | node_modules, dist, `.env`, coverage, editor dirs |

Root scripts: `dev` (both apps), `install:all`, `test` (→ server), `seed` (phase 9 placeholder).

### Server — `server/` (Express + Mongoose, ES modules)
```
server/
  .env.example
  package.json          type: module · dev = nodemon
  src/
    server.js           dotenv → connectDB → listen :5000
    app.js              helmet, cors(CLIENT_URL, credentials), json, cookieParser, morgan
    config/db.js        mongoose connect, throws if MONGO_URI missing
    middleware/
      ApiError.js       status + code factory (badRequest/unauthorized/forbidden/notFound/conflict)
      errorHandler.js   notFound + errorHandler → { success:false, error:{code,message} }
      validate.js       validate(zodSchema, source) — reusable on every route
    utils/ok.js         ok(res, data, status) → { success:true, data }
    routes/health.js    GET /api/v1/health → status, db state, uptime
    tests/health.test.js
    models/ controllers/ services/  (empty, filled per phase)
```

Deps: express, mongoose, dotenv, cors, helmet, cookie-parser, morgan, zod.
Dev: nodemon, vitest, supertest.

### Client — `client/` (Vite + React 18)
```
client/
  .env.example          VITE_API_URL, VITE_GOOGLE_CLIENT_ID
  vite.config.js        react + @tailwindcss/vite, port 5173
  src/
    index.css           @import "tailwindcss" + @theme tokens
    App.jsx             BrowserRouter shell, one route
    pages/Home.jsx      health-check card (proves client → API wiring)
    api/client.js       axios instance, withCredentials, envelope unwrap interceptor
    components/ context/  (empty, filled per phase)
```

Deps: react-router-dom, axios, recharts, lucide-react, tailwindcss, @tailwindcss/vite.

## Decisions taken
- **Tailwind v4** via `@tailwindcss/vite` — no `tailwind.config.js`, no PostCSS file. Tokens live in `@theme` inside `index.css`. If a tutorial asks for `tailwind.config.js`, that is v3; this project is v4.
- **Axios interceptor unwraps the error envelope** so pages `catch (e) { e.message }` with no envelope knowledge.
- **`validate.js` shipped in phase 0** even though no route uses it yet — CLAUDE.md requires Zod on every route from phase 1 onward.
- Vite starter cruft removed (`App.css`, `react.svg`, `hero.png`).

## Verification run
```
server: npm test          → 2 passed (health 200 envelope, 404 error envelope)
client: npm run build     → built in 177ms, 0 errors
```
Not yet verified: live Mongo connection (needs a real `MONGO_URI`).

## To boot it
```bash
cp server/.env.example server/.env
cp client/.env.example client/.env
# then edit server/.env — only MONGO_URI is required to boot:
#   MONGO_URI=mongodb+srv://<user>:<pass>@<cluster>.mongodb.net/smartsplit?retryWrites=true&w=majority
# local mongo instead: MONGO_URI=mongodb://127.0.0.1:27017/smartsplit
npm run dev
```
Expect: API on :5000, client on :5173, home card reading **API up · DB connected**.

Smoke test: `curl -s localhost:5000/api/v1/health | jq`

## Not done (by design)
Auth, models, groups, expenses, settlement, OCR, reports — phases 1-9.

## Next
**Phase 1 — Auth module** (kit Prompt 1): User model, register/login/refresh rotation/logout/me, Google OAuth, forgot/reset password via NodeMailer, bcrypt cost 12, rate limits, AuthContext + login/register pages, Supertest suite.

## Resume this session
```bash
cd /home/pisces/Projects/smartsplit && claude --resume 216976ad-54e0-41a4-802b-9ac1a4b9747c
```
