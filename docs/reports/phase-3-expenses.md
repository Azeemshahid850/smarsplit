# Phase 3 — Group expenses

**Date:** 2026-09-12 · **Status:** ✅ done, verified · **Kit prompt:** Prompt 3

## Scope
Group expenses with multi-payer support and all four split methods, the server-side money
invariants, and balances computed by aggregation. Settlement itself is phase 4.

## The money rules, in one place
`server/src/services/splitCalculator.js` is pure — no database, no Express — so the viva can
read it top to bottom:

| Method | Rule |
|---|---|
| `EQUAL` | `floor(total / n)` each, **leftover rupees go to the payer** (the largest one when there are several) |
| `EXACT` | shares must sum to the total exactly, else "You're Rs 50 short" / "Rs 250 over" |
| `PERCENTAGE` | percentages must sum to 100 (2-dp tolerance), then `floor(total × pct / 100)`, leftover to the payer |
| `LINE_ITEM` | each item's `price × qty` splits among its `sharedBy`; items must sum to the expense total |

One rounding rule for every method: shares floor down, the whole remainder lands on the payer.
That is what makes `sum(splits.share) === totalAmount` true for every expense, always.

Two guards on top: `assertPayersCoverTotal` (multi-payer sum) and `assertSplitsBalance`
(the invariant itself). Both throw `SplitError`, which the controller turns into a `400
SPLIT_INVALID` carrying a message the UI shows verbatim.

## Backend
### Model — `GroupExpense`
groupId, title, totalAmount, category (7 fixed categories), date, **`paidBy: [{userId, amount}]`
— a multi-payer array**, splitType, splits `[{userId, share}]`, items `[{name, qty, price, sharedBy[]}]`,
notes, receiptImage, createdBy, `deletedAt` (soft delete), timestamps.
Index `{ groupId, deletedAt, date }`.

A `pre('validate')` hook re-checks both sums at the database boundary, so no route — present or
future — can write an unbalanced expense.

### Routes
| Method | Path | Notes |
|---|---|---|
| POST | `/groups/:id/expenses` | member only; everyone named must be an active member |
| GET | `/groups/:id/expenses` | paginated; filters `category`, `payer`, `from`, `to` |
| GET | `/expenses/:expenseId` | loads one for the edit page |
| PATCH | `/expenses/:expenseId` | payer or admin (or anyone when `anyoneCanEdit`); recomputes splits |
| DELETE | `/expenses/:expenseId` | soft delete, same permission |
| GET | `/groups/:id/balances` | aggregation, plus a `netsToZero` proof flag |

### Balances — `services/balances.js`
Never stored, always aggregated:
`net = Σ paidBy.amount − Σ splits.share (+ paid settlements)`, with a `$facet` doing paid, owed
and totals in one pass. `summariseGroupsFor()` does the same for many groups at once so the
groups list shows real `totalSpent` and `myBalance` without an N+1.
Settlement rows are already read here, so phase 4 wires in without touching this file.

## Frontend
- **Add Expense** (`/expenses/new`, also `/expenses/:id/edit`): group selector, title, amount,
  date, category, **multi-payer rows** with a live "covered Rs X of Y", split-method chips
  switching between Equal (checkboxes + live per-head), Exact (inputs + shortfall), Percentage
  (inputs + running total), Line items (rows with a per-item member multiselect). Save stays
  disabled while a human-readable problem is showing — "You're Rs 50 short", "Percentages add
  up to 90%, not 100%".
- **Expenses tab**: table with payer avatars, split badge, amount, category + date, filters by
  category and payer, pagination, edit link and delete with confirm.
- **Balances tab**: net per member with a proportional bar, green owed-to / red owes, group
  totals, and the "Balances net to zero" footnote driven by the server's own check.

## Bugs found and fixed during verification
1. **Mongoose 9 dropped callback-style hooks.** `pre('validate', function (next) {...})` threw
   `TypeError: next is not a function` on every insert. Rewritten as an `async` hook that throws.
2. **Express 5 makes `req.query` getter-only.** `validate(schema, 'query')` crashed the list
   route with `Cannot set property query of #<IncomingMessage>` (500). Now assigned via
   `Object.defineProperty`, so controllers still read `req.query` normally.
3. **Zod `.partial()` keeps `.default()` values**, so a partial PATCH arrived with
   `participants: []` and wiped the split — "Pick at least one person to split with" on a
   title-only edit. The controller now rebuilds any split input the caller did not send from
   the stored splits (percentages are recovered as `share / total × 100`, preserving proportions
   when the total changes).

## Verification run
```
server: npm test        → 74 passed (5 files)
client: npm run build   → built, 0 errors
```
- **22 unit tests** on the calculator: even division, 100 over 3 (payer gets 34), payer not in
  the split, single participant, awkward totals loop (1 / 7 / 99 / 100 / 101 / 4,201 / 99,999
  over 1-3 people all balance), fractional and zero totals rejected, exact shortfall and
  overage wording, percentage rounding to the payer, 4,201 at 50/25/25, sub-100% rejection,
  line-item sharing, uneven item rounding, item total mismatch, unshared item, multi-payer
  coverage and largest-payer selection.
- **16 API tests**: EQUAL creation balancing to the rupee, multi-payer accepted, shortfall
  rejected with "Rs 3,000 short", EXACT and PERCENTAGE rejections, LINE_ITEM derivation,
  non-member on an expense rejected, non-member 403, fractional rupees 400, pagination and all
  three filters, payer edit recompute, non-payer blocked, `anyoneCanEdit` honoured, soft delete
  removing the row from lists **and** balances, balances netting to zero with the right numbers
  (9,000 + 3,000 over three → +5,000 / −1,000 / −4,000), groups list showing real totals.

## Next
**Phase 4 — Settlement engine**: `minCashFlow`, tests written before the routes, settle preview
vs record, and the Settle Up page with the "6 → 2 payments" stat.

## Resume this session
```bash
cd /home/pisces/Projects/smartsplit && claude --resume 216976ad-54e0-41a4-802b-9ac1a4b9747c
```
