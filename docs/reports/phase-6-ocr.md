# Phase 6 — Receipt OCR with human-in-the-loop

**Date:** 2026-09-12 · **Status:** ✅ done, verified (vision call stubbed in tests) · **Kit prompt:** Prompt 6

## Scope
Upload a receipt photo, have it read automatically, **check every line yourself**, then turn it
into a personal transaction or a pre-filled group expense. Nothing is ever saved unverified.

## The pipeline
```
POST /receipts/scan  →  multer (memory)  →  Cloudinary  →  201 {receiptId, status:'processing'}
                                                   ↓ (background)
                                    Vision LLM (structured output)
                                                   ↓ on any failure
                                    Tesseract.js + line regex
                                                   ↓
                              receipt row: lineItems, totalDetected, totalsAgree
                                                   ↓
      GET /receipts/:id (client polls) → verification modal → PATCH items → POST commit
```

### Vision extraction — `services/ocr.js`
Uses the Anthropic SDK with **`claude-opus-5`** and **structured outputs**
(`client.messages.parse` + `zodOutputFormat`), so the response cannot come back as prose or
half-JSON — the schema is enforced server-side:

```js
{ store: string|null, date: string|null, items: [{name, qty, price}], total: number|null }
```
The prompt pins the domain rules: rupees as whole numbers, `price` is the **line total** not the
unit price, skip subtotals/tax/discount/grand-total rows, `qty` defaults to 1, and use `null`
rather than guessing.

### Fallback — Tesseract.js
If the vision call fails (no API key, network, rate limit), the same shape is produced offline
from Tesseract text plus a line-shape regex that handles `Cooking Oil 3L 1,745` and `2 x Milk 220`,
skipping subtotal/tax/discount/change/total lines. The receipt records which engine ran
(`ocrEngine`) and why the fallback happened (`ocrError`).

### Confidence check
`totalsAgree(items, total)` compares the summed lines against the printed total and returns
**false when they differ by more than 5%** — the UI then blocks nothing but shows a warning
telling the user exactly which two numbers disagree. `null` when the receipt printed no total.

## Routes
| Method | Path | Notes |
|---|---|---|
| POST | `/receipts/scan` | multipart `image`, memory storage, 8MB cap, images only → **202 immediately** |
| GET | `/receipts` · `/receipts/:id` | owner-scoped; polling endpoint |
| POST / PATCH / DELETE | `/receipts/:id/items[/:index]` | add, edit (sets `corrected: true`), remove — re-checks the totals each time |
| POST | `/receipts/:id/commit` | `{target: 'personal'}` writes a transaction; `{target: 'groupExpense', groupId}` returns a **LINE_ITEM draft** |

Committing to a group deliberately does **not** write the expense — it hands back a draft so the
user still chooses who shared which item on the Add Expense page. Uploads that are too large or
not images come back as `400 UPLOAD_FAILED` / `BAD_FILE_TYPE` rather than a 500.

## Frontend
- **Scan page** (`/scan`): drag-and-drop or camera capture, a processing state that walks through
  "Uploading the image → Reading the receipt → Matching line items" while it polls, a recent-scans
  list with a Review button, and clear failure text.
- **Verification modal**: receipt image on the left, editable lines on the right — name, qty and
  price each editable, a green check on lines you corrected, add and remove rows, a running
  **Lines total vs Printed on receipt** comparison, and an amber warning when they disagree.
  Then "Save to Personal" (with category + payment method) or "Use in group expense" (pick the
  group), which carries the draft straight into Add Expense as a pre-filled LINE_ITEM split.

## Verification run
```
server: npm test        → 130 passed (9 files)
client: npm run build   → built, 0 errors
```
18 new tests. The vision call is stubbed with `vi.mock` — what is tested is the pipeline, not the
model: 202-then-background completion with the row filled in, a failure recorded as
`ocrStatus: 'failed'` instead of throwing, non-image upload rejected, missing file rejected, 401
without a token, an edit marking the line `corrected` and re-running the totals check, an edit
that breaks the 5% agreement flagged, add/remove lines, 404 on a bad index, cross-user isolation,
personal commit writing a 4,430 transaction with the receipt URL attached, double-commit 409,
**commit refused while still processing with nothing auto-written**, group commit returning a
LINE_ITEM draft with every member on each item, 403 for a group you are not in, and `groupId`
required. `totalsAgree` is unit-tested at the 5% boundary.

## Configuration
- `VISION_API_KEY` (or `ANTHROPIC_API_KEY`) — without it, every scan uses the Tesseract fallback.
- `CLOUDINARY_*` — without it, images are inlined as data URLs so the demo still runs offline.
  Marked `ponytail:` in `services/uploads.js`; configure before deploying.

## Next
**Phase 7 — Price benchmark & savings recommender.**

## Resume this session
```bash
cd /home/pisces/Projects/smartsplit && claude --resume 216976ad-54e0-41a4-802b-9ac1a4b9747c
```
