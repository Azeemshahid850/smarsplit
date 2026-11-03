# SmartSplit & ExpenseAI

Final Year Project (NCBA&E). A dual-workspace MERN web app:
(1) personal income/expense tracking with AI receipt OCR and
price-benchmark savings suggestions, and (2) group trip expense
splitting with a Min-Cash-Flow debt settlement optimizer.

## Stack (do not substitute)
- Frontend: React 18 + Vite, React Router v6, TailwindCSS, Recharts, Lucide icons, Axios
- Backend: Node.js + Express (REST), no GraphQL
- DB: MongoDB Atlas via Mongoose
- Auth: JWT — short-lived access token + rotating refresh token in HttpOnly cookie; bcrypt (cost 12); Google OAuth 2.0 SSO
- OCR: Vision LLM API for receipt extraction, Tesseract.js as offline fallback
- Files: Cloudinary for receipt images
- Validation: Zod on every request body
- Tests: Vitest (unit) + Supertest (API)

## Repo layout (monorepo)
smartsplit/
  client/          # Vite React app
    src/pages/     # one folder per route
    src/components/
    src/api/       # axios instance + typed API functions
    src/context/   # AuthContext
  server/
    src/models/    # Mongoose schemas
    src/routes/    # Express routers, one file per resource
    src/controllers/
    src/services/  # settlement.js, ocr.js, priceMatch.js, recurring.js
    src/middleware/ # auth, validate(zodSchema), errorHandler
    src/tests/
  CLAUDE.md

## Domain rules (never violate)
- Money: integer rupees (Number, no floats in arithmetic paths). Rounding
  remainder on splits is assigned to the payer. Every expense must satisfy
  sum(splits.share) === totalAmount.
- Balances are ALWAYS computed from expenses via aggregation — never stored
  as running totals.
- Settlement algorithm: greedy max-matching on net balances (Min-Cash-Flow).
  Guarantee: at most V−1 payments, all balances net to zero after.
- Group authorization: every group route verifies the requesting user is an
  active member server-side. Never trust client-sent IDs.
- OCR results are never auto-committed: user verifies/edits line items in a
  human-in-the-loop modal before anything is saved.
- Price suggestions read from a local benchmark_prices collection first;
  live scraping is a decoupled async job with cache fallback (never blocks UI).

## Conventions
- ES modules everywhere. async/await, no .then chains.
- API prefix /api/v1. Responses: { success, data } or { success:false, error:{ code, message } }.
- Zod schema per route in the same folder as the router.
- React: function components + hooks only. Pages fetch via src/api functions,
  never inline axios. Loading, empty, and error states required on every list.
- Currency display: "Rs 4,200" with thousands separators, PKR default.
- Categories: Food, Utilities, Travel, Shopping, Healthcare, Housing, Misc.
- Payment methods: Cash, Bank Transfer, Card, JazzCash, Easypaisa, Raast.

## Commands
- client: npm run dev (5173) · server: npm run dev (5000, nodemon)
- test: npm test in server/ — settlement tests must always pass
