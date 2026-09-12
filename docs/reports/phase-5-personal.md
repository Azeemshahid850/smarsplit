# Phase 5 — Personal hub

**Date:** 2026-09-12 · **Status:** ✅ done, verified · **Kit prompt:** Prompt 5

## Scope
The second workspace: personal income and spending, monthly budgets, the recurring engine,
and the dashboard that pulls both workspaces together.

## Backend
### Models
- **`PersonalExpense`** — userId, title, amount (integer rupees), category, `type CREDIT|DEBIT`,
  paymentMethod, date, note, receiptUrl, `isRecurring`, `recurring { interval, nextRunAt }`,
  `suggestedAlternatives[]` + `potentialSavings` (filled by phase 7), and `generatedFrom` —
  set on rows the engine materialised so they never recur themselves.
  Payment methods: Cash, Bank Transfer, Card, **JazzCash, Easypaisa, Raast**.
- **`Budget`** — one `monthlyCap` per category per user, unique on `{ userId, category }`.

### Routes
| Method | Path | Notes |
|---|---|---|
| POST / GET | `/transactions` | filters `month=2026-09`, `category`, `type`; paginated |
| PATCH / DELETE | `/transactions/:id` | scoped to the owner — someone else's id is a 404, not a 403 |
| GET | `/personal/summary?month=` | income, spend, net, last-month spend, savings found, per-category totals with cap and consumed % |
| GET / PUT / DELETE | `/budgets` | PUT upserts, so setting a cap twice updates it |

### Recurring engine — `services/recurring.js`
`runDueRecurring(now)` finds every template whose `recurring.nextRunAt` has passed, writes one
row per missed period, and advances the schedule. It **catches up**: a monthly template last run
in September produces three rows when the job finally runs in December. A 120-iteration guard
stops a corrupt `nextRunAt` from spinning.

The cron job in `server.js` (`0 2 * * *`, node-cron) is only a timer — all the logic sits in the
service, which is why it is testable without waiting a day.

## Frontend
- **Personal page** (`/personal`): month picker, three stat cards (Received / Spent with a
  vs-last-month delta / Left), **"Where it went"** category bars — green under 80% of the cap,
  amber from 80%, red at 100% and over — recent transactions table with a repeat icon on
  recurring rows, and a sidebar holding the Add Transaction form (type toggle, title, amount,
  date, category, payment method, recurring toggle with interval, note) and the budgets editor.
- **Dashboard** (`/`): greeting, **owed-across-groups** card, monthly spend card, savings-found
  card, active groups panel with per-group balance, and a recent activity feed.
- Nav gained a Personal tab.

## Verification run
```
server: npm test        → 112 passed (8 files)
client: npm run build   → built, 0 errors
```
16 new tests: create a debit, every payment method accepted, fractional rupees and unknown
categories rejected, month/category/type filters, **cross-user isolation** (another user's list
is empty and patching their row 404s), update and delete, recurring without an interval rejected,
next run scheduled one interval ahead, materialisation writing the row and advancing the
schedule, generated rows not recurring themselves, **three-month catch-up**, nothing created
when nothing is due, `advance()` for weekly and monthly, budget upsert not duplicating,
full summary arithmetic (income 90,000, spend 12,700, net 77,300, last month 6,000, Food at
85% of a 10,000 cap in the amber band, uncapped category with `consumed: null`, untouched
categories omitted), empty month returning zeroes, 401 without a token.

Also fixed: `findOneAndUpdate({ new: true })` deprecation → `returnDocument: 'after'`.

## Next
**Phase 6 — Receipt OCR** with the human-in-the-loop verification modal.

## Resume this session
```bash
cd /home/pisces/Projects/smartsplit && claude --resume 216976ad-54e0-41a4-802b-9ac1a4b9747c
```
