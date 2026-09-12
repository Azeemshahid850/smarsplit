# Phase 7 — Price benchmark & savings recommender

**Date:** 2026-09-12 · **Status:** ✅ done, verified · **Kit prompt:** Prompt 7

## Scope
Compare verified receipt lines against a local price book and tell the user where the same
product is cheaper — "Cooking Oil 3L — Rs 1,745 on Daraz, you paid Rs 1,890".

## The price book
`benchmark_prices` — `{ canonicalName, aliases[], size, unit, price, platform, url, updatedAt }`.
Seeded with **100 common Pakistani grocery SKUs across 209 platform rows** (daraz / metro /
imtiaz): cooking oil, rice, atta, sugar, milk, tea, eggs, pulses, spices, meat, frozen food,
snacks, drinks, cleaning, toiletries, baby, household. `seedBenchmarkPrices()` is idempotent.

## Matching — `services/priceMatch.js`
1. **`normalize(name)`** strips pack sizes, units, punctuation and filler words, so
   `COOKING OIL 3LTR @` and `Cooking Oil 3 Litre` become the same key.
2. **Alias lookup** — exact, indexed, covers the messy names receipts actually print
   (`surf excel` → Detergent 1kg, `anday` → Eggs Dozen, `super basmati` → Basmati Rice 5kg).
3. **Fuzzy fallback** — Dice coefficient over bigrams, accepted at **≥ 0.8**.
4. Among matches, the **cheapest platform wins**, and the top three are kept as alternatives.

**Dependency avoided:** the Dice coefficient is 12 lines, so `string-similarity` (unmaintained)
was not added. Marked `ponytail:` in the source with the swap-in note.

### Bug found while testing: phantom savings from pack sizes
Normalisation deliberately throws sizes away — which meant **"Basmati Rice 5kg" matched
"Basmati Rice 1kg"** and reported a Rs 1,470 "saving" for buying five times as much rice.
Fixed by parsing sizes separately (`parseSize`, with kg↔g and L↔ml conversion and a 2%
tolerance) and refusing to compare two products whose printed sizes disagree.

### Known limit, documented not hidden
One typo inside a short word scores 0.75 by Dice — below the 0.8 the spec asks for. Rather than
weaken the threshold, common misspellings live in the `aliases` array. There is a named test
asserting exactly this so nobody "fixes" it by accident.

## Wiring
Committing a verified receipt responds first, then runs `applyPriceMatches` in the background:
it annotates each line with `priceMatch { source, onlinePrice, url, checkedAt }`, totals
`potentialSavings`, and writes the top three `suggestedAlternatives` onto the committed
transaction. It never blocks the UI, and reads only the local collection — a live scraper
replaces `matchLineItems` behind the same call, cache-first, with no caller changes.

**Second bug found:** the background job used load-modify-`save()`, which throws a Mongoose
`VersionError` when it overlaps a user editing the same receipt in the verification modal.
Now an atomic `findByIdAndUpdate`.

## Frontend
`SavingsCards` renders one card per cheaper alternative — item, the online price and platform,
what you paid, a "save Rs X" pill and a link out — under an **"Estimated total potential
savings"** banner. Shown on the Scan page for scanned receipts and on the Personal page for
committed transactions. The dashboard's **"Savings found by ExpenseAI"** stat card reads the
cumulative figure from the monthly summary.

## Verification run
```
server: npm test        → 148 passed (10 files)
client: npm run build   → built, 0 errors
```
18 new tests: normalisation of five messy real-world spellings and junk input, similarity
scoring at both ends plus the documented 0.75 limit, **size awareness** (5kg never matched to
1kg, 3L vs 5L kept apart, unit-spelling equivalence), seeding 100 products across three
platforms, alias lookup returning the cheapest platform, messy-text matches, a typo matched
fuzzily, unknown products returning null, only-cheaper lines flagged, saving multiplied by
quantity, at most three alternatives ordered by size of saving, empty receipt handled, and the
end-to-end commit → background match → 325 rupees written onto both the receipt and the
transaction.

## Next
**Phase 8 — Reports, exports and the notification feed.**

## Resume this session
```bash
cd /home/pisces/Projects/smartsplit && claude --resume 216976ad-54e0-41a4-802b-9ac1a4b9747c
```
