# Demo receipts

Five receipts generated from the price book so every demo scan has a known answer. `expected.json` is the ground truth the comparison below is scored against.

| File | Store | Lines | Total | What it exercises |
|---|---|---|---|---|
| `receipt-01-alfatah.png` | Al-Fatah Superstore | 8 | Rs 7,320 | Clean bold monospace print; the baseline |
| `receipt-02-imtiaz.png` | Imtiaz Super Market | 7 | Rs 5,590 | Narrow thermal-style print, proportional font, a Discount line, brand names (Olpers, Tapal, Surf Excel) that only match through aliases |
| `receipt-03-carrefour.png` | Carrefour | 8 | Rs 7,379 | Light monospace, thousands separators (1,750), one line priced *below* the book (Bread) so no saving is claimed |
| `receipt-04-metro.png` | Metro Cash & Carry | 7 | Rs 4,970 | Qty / Rate / Amount columns, GST line, and two items the book does not know (Lays, Pepsi below benchmark) |
| `receipt-05-naheed.png` | Naheed Supermarket | 8 | Rs 8,160 | Phone-photo look: tilted, off-white, blurred, grainy; brand/Urdu names (Dahi, Dalda, Panadol) |

## Engine comparison

Run with the harness that drives `extractReceipt()` directly and scores each line by name similarity and exact price/quantity. Savings are from the live price book (100 products × 7 stores).

### tesseract

| Receipt | Time | Lines exact | Qty/price wrong | Missed | Extra | Store | Total | Totals agree | Lines with a cheaper price | Savings |
|---|---|---|---|---|---|---|---|---|---|---|
| `receipt-01-alfatah.png` | 0.7s | 8/8 | 0 | — | — | ✓ | ✓ | ✓ | 8 | Rs 647 |
| `receipt-02-imtiaz.png` | 0.6s | 7/7 | 0 | — | — | ✓ | ✓ | ✓ | 7 | Rs 455 |
| `receipt-03-carrefour.png` | 0.6s | 8/8 | 0 | — | — | ✓ | ✓ | ✓ | 7 | Rs 304 |
| `receipt-04-metro.png` | 0.6s | 7/7 | 0 | — | — | ✓ | ✓ | ✓ | 5 | Rs 230 |
| `receipt-05-naheed.png` | 0.6s | 8/8 | 0 | — | — | ✓ | ✓ | ✓ | 7 | Rs 645 |

### Notes

- **Tesseract (offline, no key)** reads all 38 lines across the five receipts after two parser fixes found by this comparison: stray OCR symbols (`900 g¢`) are scrubbed before the line regex, and `Qty Rate Amount` columns are recognised when qty × rate equals the amount, so quantities no longer inflate the per-unit saving.
- **OpenAI-compatible engine (`OCR_API_KEY`)** — not yet measured: the OpenRouter key available at the time returned `401 User not found`. Re-run `server/.compare.mjs` with `OR_KEY=…` once a working key exists; the table above is regenerated from `compare-results.json`.
- Savings differ per receipt on purpose: Carrefour's Bread (Rs 150) and Metro's Pepsi (Rs 170 each) are *cheaper* than the book, so those lines correctly show no saving.

## Regenerate

```bash
python3 make_receipts.py docs/demo          # from the scratch script used here; edit RECEIPTS to change items
```
