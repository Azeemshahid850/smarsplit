import { BenchmarkPrice } from '../models/BenchmarkPrice.js';

/**
 * Receipt text → a comparable product key.
 * Drops pack sizes, units, punctuation and filler words so "COOKING OIL 3LTR @"
 * and "Cooking Oil 3 Litre" land on the same string.
 */
export function normalize(name = '') {
  return name
    .toLowerCase()
    .replace(/\d+(\.\d+)?\s*(kg|g|gm|gms|ml|ltr|lt|l|litre|liters?|pcs|pc|pack|x)\b/g, ' ')
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\b(pkt|packet|bottle|box|tin|jar|bag|fresh|premium|special|brand)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Dice coefficient over bigrams — 0 to 1.
 * ponytail: 12 lines instead of the `string-similarity` dependency, which is
 * unmaintained; swap in a library only if a better metric is ever needed.
 */
export function similarity(leftText, rightText) {
  if (leftText === rightText) return 1;
  if (leftText.length < 2 || rightText.length < 2) return 0;

  const bigrams = (textValue) => {
    const map = new Map();
    for (let lineItem = 0; lineItem < textValue.length - 1; lineItem += 1) {
      const pair = textValue.slice(lineItem, lineItem + 2);
      map.set(pair, (map.get(pair) || 0) + 1);
    }
    return map;
  };

  const first = bigrams(leftText);
  const second = bigrams(rightText);
  let shared = 0;

  for (const [pair, count] of first) {
    const other = second.get(pair) || 0;
    shared += Math.min(count, other);
  }

  return (2 * shared) / (leftText.length - 1 + (rightText.length - 1));
}

export const MATCH_THRESHOLD = 0.8;

// Normalisation throws pack sizes away, which would happily compare a 5kg bag of
// rice against a 1kg one and invent a saving. Sizes are parsed separately and
// must agree before two products are treated as the same thing.
const UNIT_BASE = {
  kg: ['g', 1000], g: ['g', 1], gm: ['g', 1], gms: ['g', 1],
  l: ['ml', 1000], lt: ['ml', 1000], ltr: ['ml', 1000], litre: ['ml', 1000], litres: ['ml', 1000],
  liter: ['ml', 1000], liters: ['ml', 1000], ml: ['ml', 1],
  pcs: ['pcs', 1], pc: ['pcs', 1], pack: ['pcs', 1],
};

/** "Cooking Oil 3LTR" → { unit: 'ml', amount: 3000 }; null when no size is printed. */
export function parseSize(name = '') {
  const match = String(name)
    .toLowerCase()
    .match(/(\d+(?:\.\d+)?)\s*(kg|gms|gm|g|litres|litre|liters|liter|ltr|lt|l|ml|pcs|pc|pack)\b/);
  if (!match) return null;

  const [unit, factor] = UNIT_BASE[match[2]] ?? [];
  if (!unit) return null;
  return { unit, amount: Number(match[1]) * factor };
}

const rowSize = (row) => (row.size != null && row.unit ? parseSize(`${row.size}${row.unit}`) : null);

/** Same product family only if the printed sizes agree (2% tolerance). */
function sizeCompatible(wanted, row) {
  const theirs = rowSize(row);
  if (!wanted || !theirs) return true; // one side has no size — nothing to contradict
  if (wanted.unit !== theirs.unit) return false;
  return Math.abs(wanted.amount - theirs.amount) <= theirs.amount * 0.02;
}

/**
 * The only place prices are read. Alias lookup first (exact, indexed), fuzzy
 * match second. A live scraper would slot in behind this function with a cache
 * fallback — callers never change.
 */
export async function findBenchmark(rawName, catalogue = null) {
  const key = normalize(rawName);
  if (!key) return null;

  const all = catalogue ?? (await BenchmarkPrice.find().lean());
  const wantedSize = parseSize(rawName);
  const rows = all.filter((priceRow) => sizeCompatible(wantedSize, priceRow));
  if (!rows.length) return null;

  // Exact alias or canonical hit.
  const exact = rows.filter((priceRow) => priceRow.aliases.includes(key) || normalize(priceRow.canonicalName) === key);
  if (exact.length) {
    // Among equally-named products, compare like with like: one canonical family.
    const family = exact.filter((priceRow) => priceRow.canonicalName === exact[0].canonicalName);
    return cheapest(family, 1);
  }

  // Fuzzy: score every row, keep the best if it clears the threshold.
  let best = null;
  let bestScore = 0;

  for (const row of rows) {
    const score = Math.max(similarity(key, normalize(row.canonicalName)), ...row.aliases.map((leftText) => similarity(key, leftText)));
    if (score > bestScore) {
      bestScore = score;
      best = row;
    }
  }

  if (!best || bestScore < MATCH_THRESHOLD) return null;

  // Compare every platform's price for the matched product, not just the one row.
  const family = rows.filter((priceRow) => priceRow.canonicalName === best.canonicalName);
  return cheapest(family, bestScore);
}

function cheapest(rows, score) {
  const sorted = [...rows].sort((leftText, rightText) => leftText.price - rightText.price);
  return { match: sorted[0], alternatives: sorted.slice(0, 3), score };
}

/**
 * Compares verified receipt lines against the price book.
 * Returns the lines annotated with a `priceMatch` where something cheaper
 * exists, plus the total saving and the 2-3 best alternatives.
 */
export async function matchLineItems(lineItems = []) {
  const catalogue = await BenchmarkPrice.find().lean();

  let potentialSavings = 0;
  const suggestedAlternatives = [];

  const matched = await Promise.all(
    lineItems.map(async (item) => {
      const found = await findBenchmark(item.name, catalogue);
      if (!found) return { ...item, priceMatch: null };

      const unitPaid = Math.round(item.price / (item.qty || 1));
      const saving = unitPaid - found.match.price;

      // Only annotate when the benchmark is actually cheaper.
      if (saving <= 0) return { ...item, priceMatch: null };

      potentialSavings += saving * (item.qty || 1);
      suggestedAlternatives.push({
        name: found.match.canonicalName,
        onlinePrice: found.match.price,
        source: found.match.platform,
        url: found.match.url,
        saving: saving * (item.qty || 1),
      });

      return {
        ...item,
        priceMatch: {
          source: found.match.platform,
          onlinePrice: found.match.price,
          url: found.match.url,
          checkedAt: new Date(),
        },
      };
    }),
  );

  suggestedAlternatives.sort((leftText, rightText) => rightText.saving - leftText.saving);

  return { lineItems: matched, potentialSavings, suggestedAlternatives: suggestedAlternatives.slice(0, 3) };
}
