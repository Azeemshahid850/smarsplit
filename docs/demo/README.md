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
- **OpenAI-compatible engine (`OCR_API_KEY`)** — not yet measured: the OpenRouter key available at the time returned `401 User not found`. Re-run `cd server && OR_KEY=… node src/scripts/compareReceipts.mjs ../docs/demo` once a working key exists; the table above is regenerated from `compare-results.json`.
- Savings differ per receipt on purpose: Carrefour's Bread (Rs 150) and Metro's Pepsi (Rs 170 each) are *cheaper* than the book, so those lines correctly show no saving.

## Regenerate

```bash
python3 docs/demo/make_receipts.py docs/demo                      # receipts + expected.json (needs Pillow)
cd server && node src/scripts/compareReceipts.mjs ../docs/demo    # score the engines; OR_KEY=… adds OpenRouter
```

## Demo video

`SmartSplit-demo.mp4` — 2 min 39 s, 1280×720, voiced walkthrough of every feature, made from a scripted
headless-browser recording with a text-to-speech narration (edge-tts, voice en-GB-RyanNeural). Send it when
nobody can present live. Narration, scene by scene:


1. This is SmartSplit and ExpenseAI, a final year project from NCBA and E. One app, two workspaces: personal expense tracking with AI receipt scanning, and group trip expense splitting with a Min-Cash-Flow settlement optimizer.
2. After signing in, the dashboard shows where your money stands: what you are owed across groups, this month's personal spending, and the savings ExpenseAI has found.
3. Groups are trips, flats or events. Whoever creates a group becomes its admin. This is the Hunza Trip, with four members and their running balances.
4. Admins add people three ways: pick someone they have travelled with, invite by email, or share a link that anyone can request to join through. Every invite can be sent on WhatsApp with one tap, and admins approve requests and can promote other admins.
5. Adding an expense: choose who paid, the amount, and how to split it: equally, exact amounts, percentages, or line by line. The form keeps the shares balanced to the rupee before it lets you save.
6. Balances are always computed from the expenses, never stored as running totals, so they can never drift.
7. Settle up runs the Min-Cash-Flow algorithm. It finds the fewest payments that clear every debt, never more than one less than the number of members, and records them so each one can be marked paid.
8. ExpenseAI. Upload a photo of a receipt. The AI reads the store, every line item and the total. You check and correct the lines before anything is saved; nothing is ever committed automatically.
9. Each item is then compared against a price book of local stores: Daraz, Metro, Imtiaz, Al-Fatah, Carrefour and more, and ExpenseAI shows where the same product was cheaper.
10. The price book itself is open for everyone to browse. Admins add stores and prices directly, or upload an Excel sheet.
11. The personal workspace tracks income and spending with monthly budgets per category, and Reports turns it all into charts, with CSV, Excel and PDF export.
12. Finally, a super admin page shows everything on the server: people, groups, scans, and which services are live.
13. SmartSplit and ExpenseAI. Thank you for watching.
