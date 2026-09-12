# Phase 4 — Settlement engine (Min-Cash-Flow)

**Date:** 2026-09-12 · **Status:** ✅ done, verified · **Kit prompt:** Prompt 4

This is the phase the viva panel will ask about. Tests were written **before** the routes.

## The algorithm — `server/src/services/settlement.js`

```
computeNetBalances(expenses, settlements) → Map<userId, net>
    net = Σ paid − Σ owed, then ± any settlement already marked paid
minCashFlow(netBalances) → [{ from, to, amount }]
```

Greedy max-matching:
1. Split members into **creditors** (net > 0) and **debtors** (net < 0).
2. Take the largest of each, move `min(credit, debt)` from debtor to creditor.
3. Whoever hits zero leaves the pool; the other stays with the remainder.
4. Repeat until one side is empty.

**Why it terminates in at most V−1 payments:** every pass zeroes at least one of the two
people it touches, so after k payments at least k people are out. The last person is forced
to zero by the others (the balances sum to zero), so V−1 payments is the ceiling.

**Why the balances must sum to zero first:** `minCashFlow` refuses input that does not net
out — a guard that would catch any upstream split bug rather than silently inventing money.

`rawPairwiseDebts()` computes what the naive "pay everyone back individually" approach would
need — each split share attributed back to each payer in proportion to what they put in.
That is the denominator in the **"6 → 2 payments, 4 transfers saved"** stat.

Integer rupees throughout, so no residue can hide in a float.

## Routes
| Method | Path | Effect |
|---|---|---|
| POST | `/groups/:id/settle/preview` | computes only — **writes nothing** |
| POST | `/groups/:id/settle` | persists one `Settlement` per payment, stores `rawDebtCount` + `optimizedCount`, sets group `SETTLED`, writes an `AuditLog` entry |
| GET | `/groups/:id/settlements` | recorded payments + the audit trail |
| PATCH | `/settlements/:settlementId/pay` | marks one payment paid; balances pick it up immediately |

A second settlement is refused while one is outstanding (`409 SETTLEMENT_IN_PROGRESS`), and a
group where nobody owes anything gives `400 NOTHING_TO_SETTLE`.
New model `AuditLog` — append-only `{ groupId, userId, action, detail, createdAt }`.

## Frontend — `/groups/:id/settle`
Left panel lists the raw pairwise debts, faded and scaled down once the optimiser runs.
"Simplify with Min-Cash-Flow" calls preview and shows the payment cards plus the
**"6 → 2 payments · 4 transfers saved"** banner. "Record settlement" persists, after which the
group shows the settled banner, per-payment "Mark paid" buttons with paid checkmarks, and the
audit trail underneath.

## Verification run
```
server: npm test        → 96 passed (7 files)
client: npm run build   → built, 0 errors
```

**12 algorithm tests (written first):**
- **The Murree example** — nets `{Sara +7080, Bilal +4330, Azeem +1080, Hamza −6020, Ali −6470}`
  → **exactly 4 payments**, all balances zero afterwards, and nobody both pays and receives.
- Already-settled group → `[]`; empty group → `[]`.
- Two people → a single payment.
- Rounding leftovers (+66 / −33 / −33 from a 100-over-3 split) settle in 2 payments.
- Non-zero input throws rather than inventing money.
- **Property test, 300 random rounds:** groups of 2-10 members, 1-6 expenses built through the
  real split calculator — applying the returned payments zeroes every balance, payment count
  is always ≤ V−1, every amount is a positive integer. Deterministic LCG seed, so a failure
  reproduces exactly.
- **Property test, 100 rounds of multi-payer expenses** — same guarantees.
- `computeNetBalances`: nets paid against owed, ignores soft-deleted expenses, counts a paid
  settlement and ignores an unpaid one.
- `rawPairwiseDebts`: 6 naive debts for three mutual expenses, and the saving arithmetic.

**10 API tests:**
- Preview computes without persisting anything and leaves the group `ACTIVE`.
- Applying the preview to the live balances zeroes every member.
- **The aggregation and the pure function agree** on the same ledger — this is what stops
  `services/balances.js` and `services/settlement.js` from drifting apart.
- Non-member 403 on preview and on marking a payment paid.
- Settle persists exactly `optimizedCount` rows, flips the group to `SETTLED`, writes the
  `SETTLEMENT_CREATED` audit entry with the saving figures.
- Second settlement 409, nothing-to-settle 400.
- Marking one payment paid zeroes that debtor and keeps the ledger netting to zero.
- Marking every payment paid leaves all balances at zero and a preview with no payments left.

## Next
**Phase 5 — Personal hub**: transactions, budgets, the recurring engine, and the dashboard.

## Resume this session
```bash
cd /home/pisces/Projects/smartsplit && claude --resume 216976ad-54e0-41a4-802b-9ac1a4b9747c
```
