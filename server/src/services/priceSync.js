// Daily refresh of the price book from online stores that allow it.
// For every product in the book each store's listings are found, and the
// middle-priced one with the same name and pack size becomes that store's
// price. Rows land in the same benchmark_prices collection the receipt matcher
// reads, so nothing that reads prices changes. A store that blocks us, fails or
// forbids the path in its robots.txt keeps its previous prices — the UI never
// waits on this.
import { BenchmarkPrice } from '../models/BenchmarkPrice.js';
import { PriceSyncRun } from '../models/PriceSyncRun.js';
import { normalize, parseSize } from './priceMatch.js';

const USER_AGENT = 'SmartSplitFYP/1.0 (student project; +https://smarsplit.onrender.com)';
const TIMEOUT_MS = 20_000;
const GAP_MS = process.env.NODE_ENV === 'test' ? 0 : 2000; // between two requests to the same store
const GIVE_UP_AFTER = 3; // consecutive failures before a store is left for tomorrow
const PAGES_PER_PRODUCT = 4; // sitemap stores: product pages opened per book product, at most

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const rupees = (value) => Math.round(Number(String(value ?? '').replace(/[^\d.]/g, '')));
const slugify = (text) => String(text).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

async function get(url, as = 'json') {
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: as === 'json' ? 'application/json' : 'text/html,application/xml' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return as === 'json' ? res.json() : res.text();
}

// ── Stores ───────────────────────────────────────────────────────────────
// Every adapter has a key (the store's name in the price book), an origin and
// the paths it reads (all checked against that origin's robots.txt), plus either
//   search(query) → [{ title, price, url }]            a search the store allows, or
//   catalogue() → [{ title, url }] + listing(url) → { title, price, url } | null
// for stores whose search is off-limits: their sitemap lists the product pages,
// and only the pages that match a book product are opened.

/** Any Shopify store: the storefront's own product search, JSON, no key. */
const shopify = (key, origin) => ({
  key,
  origin,
  paths: ['/search/suggest.json'],
  async search(query) {
    const body = await get(`${origin}/search/suggest.json?q=${encodeURIComponent(query)}&resources[type]=product&resources[limit]=10`);
    return (body.resources?.results?.products ?? [])
      .filter((product) => product.available !== false)
      .map((product) => ({ title: product.title, price: rupees(product.price), url: new URL(product.url, origin).href.split('?')[0] }));
  },
});

/** GrocerApp: the public search API its own website calls. vendor_price is whole rupees. */
const grocerApp = {
  key: 'grocerapp',
  origin: 'https://endpoints.grocerapps.com',
  paths: ['/v15/search'],
  async search(query) {
    const body = await get(`${this.origin}/v15/search?query=${encodeURIComponent(query)}&page=0&per=30`);
    return (body.data ?? []).map((item) => ({
      title: `${item.name} ${item.unit ?? ''}`.trim(),
      price: rupees(item.vendor_price),
      url: `https://grocerapp.pk/products/${slugify(item.seo_url || item.name)}-${item.product_id}/`,
    }));
  },
};

/** The schema.org Product a store page embeds for search engines: { title, price } or null when missing or out of stock. */
export function productFromPage(html) {
  for (const [, json] of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    let data;
    try {
      data = JSON.parse(json);
    } catch {
      continue;
    }
    const items = Array.isArray(data) ? data : (data['@graph'] ?? [data]);
    const product = items.find((item) => item?.['@type'] === 'Product');
    if (!product) continue;
    const offer = Array.isArray(product.offers) ? product.offers[0] : product.offers;
    if (!offer || (offer.availability && !/InStock/i.test(offer.availability))) return null;
    const price = rupees(offer.price);
    return price > 0 ? { title: product.name, price } : null;
  }
  return null;
}

/** Product page URLs from a sitemap, following a sitemap index one level down. */
async function sitemapUrls(url, isProduct) {
  const xml = await get(url, 'text');
  const locs = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map(([, loc]) => loc.replace(/&amp;/g, '&'));
  if (!/<sitemapindex/i.test(xml)) return locs.filter(isProduct);
  const nested = [];
  for (const child of locs.filter((loc) => /product/i.test(loc))) nested.push(...(await sitemapUrls(child, isProduct)));
  return nested;
}

/**
 * A store read through its sitemap. `slugOf(url)` gives the product name the
 * URL spells, e.g. ".../dalda-cooking-oil-bottle-3ltr/12620662" → "dalda cooking oil bottle 3ltr".
 */
const sitemapStore = ({ key, origin, productPath, slugOf }) => ({
  key,
  origin,
  paths: ['/sitemap.xml', productPath],
  async catalogue() {
    const urls = await sitemapUrls(`${origin}/sitemap.xml`, (loc) => new URL(loc).pathname.startsWith(productPath));
    return urls.map((url) => ({ title: slugOf(new URL(url).pathname).replace(/-/g, ' '), url }));
  },
  async listing(url) {
    const product = productFromPage(await get(url, 'text'));
    return product && { ...product, url };
  },
});

// Blinkco shops (Jalal Sons, Chase Up): /product/<name-slug>-<item id>
const blinkcoSlug = (pathname) => pathname.split('/').pop().replace(/-\d+$/, '');

export const STORES = [
  shopify('al-fatah', 'https://alfatah.pk'),
  grocerApp,
  // Metro: /detail/<category…>/<name-slug>/<id>. Its search API needs a signed header, so the sitemap it is.
  sitemapStore({ key: 'metro', origin: 'https://www.metro-online.pk', productPath: '/detail/', slugOf: (pathname) => pathname.split('/').at(-2) }),
  sitemapStore({ key: 'jalal sons', origin: 'https://www.jalalsons.com.pk', productPath: '/product/', slugOf: blinkcoSlug }),
  sitemapStore({ key: 'chase up', origin: 'https://www.chaseupgrocery.com', productPath: '/product/', slugOf: blinkcoSlug }),
];

// ── robots.txt ───────────────────────────────────────────────────────────

// A robots path pattern as a regex: "*" is any run of characters, a trailing "$" pins the end.
const patternOf = (value) =>
  new RegExp(`^${value.replace(/\$$/, '').split('*').map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')}${value.endsWith('$') ? '$' : ''}`);

/** True when the "User-agent: *" rules let us fetch `path` (the longest matching rule wins). */
export function robotsAllows(robotsText, path) {
  const rules = [];
  let agents = [];
  let lastWasAgent = false;
  for (const raw of robotsText.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    const colon = line.indexOf(':');
    if (colon < 0) continue;
    const field = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    if (field === 'user-agent') {
      if (!lastWasAgent) agents = [];
      agents.push(value);
      lastWasAgent = true;
    } else if (field === 'allow' || field === 'disallow') {
      lastWasAgent = false;
      // "Disallow:" with nothing after it allows everything.
      if (agents.includes('*') && value) rules.push({ allow: field === 'allow', length: value.length, pattern: patternOf(value) });
    }
  }
  const hit = rules.filter((rule) => rule.pattern.test(path)).sort((left, right) => right.length - left.length)[0];
  return !hit || hit.allow;
}

/** The first path robots.txt forbids, or null when every path the store reads is allowed. */
async function forbiddenPath(store) {
  let robots;
  try {
    robots = await get(`${store.origin}/robots.txt`, 'text');
  } catch {
    return null; // no robots.txt (404) means no rules
  }
  return store.paths.find((path) => !robotsAllows(robots, path)) ?? null;
}

// ── Matching ─────────────────────────────────────────────────────────────

const words = (text) => normalize(text).split(' ').filter(Boolean).map((word) => word.replace(/(es|s)$/, ''));
const baseName = (canonicalName) => canonicalName.replace(/\s*\d+(\.\d+)?\s*[a-z]+$/i, '').trim();
const UNIT_WORD = { L: 'ltr', l: 'ltr', ml: 'ml', kg: 'kg', g: 'gm', pcs: '' };

/** Searches to try for a product, most specific first: "cooking oil 3 ltr", then "cooking oil". */
export function queriesFor(product) {
  const base = baseName(product.canonicalName);
  const sized = product.size && UNIT_WORD[product.unit] ? `${base} ${product.size} ${UNIT_WORD[product.unit]}` : null;
  return [...new Set([sized, base].filter(Boolean))];
}

/** Same pack size (2% tolerance) and every word of the product's name in the title. */
function sameProduct(product, title) {
  const wanted = product.size != null && product.unit ? parseSize(`${product.size}${product.unit}`) : null;
  const size = parseSize(title);
  if (wanted && (!size || size.unit !== wanted.unit || Math.abs(size.amount - wanted.amount) > wanted.amount * 0.02)) return false;
  const titleWords = new Set(words(title));
  return words(baseName(product.canonicalName)).every((word) => titleWords.has(word));
}

/**
 * The store's listing for this product, or null: the same product (above) at a
 * price within 0.6×–1.6× of what the book already holds — "oil 3L" must not
 * pick up engine oil. Of the listings that fit, the middle-priced one is the
 * store's price: the very cheapest is too often a different grade (broken rice,
 * a herbal tea) and would show a saving that isn't real.
 */
export function pickListing(product, listings) {
  const known = (product.prices ?? []).map((row) => row.price).sort((left, right) => left - right);
  const median = known.length ? known[Math.floor(known.length / 2)] : null;
  const fits = listings.filter(
    (listing) =>
      listing.price > 0 &&
      sameProduct(product, listing.title) &&
      (!median || (listing.price >= median * 0.6 && listing.price <= median * 1.6)),
  );
  fits.sort((left, right) => left.price - right.price);
  return fits[Math.floor((fits.length - 1) / 2)] ?? null;
}

// ── The run ──────────────────────────────────────────────────────────────

/** Every product in the book once, with the prices it already has. */
async function productsInBook() {
  const rows = await BenchmarkPrice.find().lean();
  const byName = new Map();
  for (const row of rows) {
    const product = byName.get(row.canonicalName) ?? { canonicalName: row.canonicalName, size: row.size, unit: row.unit, aliases: new Set(), prices: [] };
    row.aliases.forEach((alias) => product.aliases.add(alias));
    product.prices.push(row);
    byName.set(row.canonicalName, product);
  }
  return [...byName.values()].map((product) => ({ ...product, aliases: [...product.aliases] }));
}

class StoreDown extends Error {}

async function syncStore(store, products, { gapMs, log }) {
  const result = { store: store.key, searched: 0, matched: 0, updated: 0, skipped: null, error: null };
  const forbidden = await forbiddenPath(store);
  if (forbidden) {
    result.skipped = `robots.txt disallows ${forbidden}`;
    return result;
  }

  // One polite request at a time; GIVE_UP_AFTER failures in a row and the store waits for tomorrow.
  let failures = 0;
  const request = async (call) => {
    await sleep(gapMs);
    try {
      const answer = await call();
      result.searched += 1;
      failures = 0;
      return answer;
    } catch (err) {
      failures += 1;
      if (failures >= GIVE_UP_AFTER) throw new StoreDown(`stopped after ${failures} failed requests (${err.message}) — previous prices kept`);
      return null;
    }
  };

  try {
    const catalogue = store.catalogue ? await request(() => store.catalogue()) : null;
    if (store.catalogue && !catalogue) throw new StoreDown('could not read its sitemap — previous prices kept');

    for (const product of products) {
      let listing = null;
      if (catalogue) {
        // Shortest matching titles first: "dalda cooking oil 3ltr" before a gift-pack bundle.
        const pages = catalogue
          .filter((entry) => sameProduct(product, entry.title))
          .sort((left, right) => left.title.length - right.title.length)
          .slice(0, PAGES_PER_PRODUCT);
        const listings = [];
        for (const page of pages) {
          const found = await request(() => store.listing(page.url));
          if (found) listings.push(found);
        }
        listing = pickListing(product, listings);
      } else {
        for (const query of queriesFor(product)) {
          listing = pickListing(product, (await request(() => store.search(query))) ?? []);
          if (listing) break;
        }
      }
      if (!listing) continue;

      result.matched += 1;
      const { modifiedCount, upsertedCount } = await BenchmarkPrice.updateOne(
        { canonicalName: product.canonicalName, platform: store.key },
        {
          $set: { price: listing.price, size: product.size, unit: product.unit, url: listing.url, updatedAt: new Date() },
          $setOnInsert: { aliases: product.aliases },
        },
        { upsert: true },
      );
      result.updated += modifiedCount + upsertedCount;
      log(`${store.key}: ${product.canonicalName} → Rs ${listing.price} (${listing.title})`);
    }
  } catch (err) {
    if (!(err instanceof StoreDown)) throw err;
    result.error = err.message;
  }
  return result;
}

let running = null;

async function execute(run, { stores, gapMs, log }) {
  try {
    const products = await productsInBook();
    run.stores = await Promise.all(stores.map((store) => syncStore(store, products, { gapMs, log })));
    run.status = 'done';
  } catch (err) {
    run.status = 'failed';
    run.error = err.message;
  }
  run.finishedAt = new Date();
  await run.save();
  return run;
}

/**
 * Runs one refresh to the end. Stores are read side by side (different hosts),
 * each one politely, one request every `gapMs`.
 */
export async function syncPrices({ trigger = 'cli', stores = STORES, gapMs = GAP_MS, log = () => {} } = {}) {
  return execute(await PriceSyncRun.create({ trigger }), { stores, gapMs, log });
}

/**
 * Starts a refresh in the background and returns at once; a call while one is
 * running gets that run back instead of starting a second.
 * ponytail: in-process lock; a shared lock in Mongo if the API ever runs on several instances.
 */
export async function startPriceSync(trigger, { stores = STORES, gapMs = GAP_MS, log = console.log } = {}) {
  if (running) return { run: running, alreadyRunning: true };
  const run = await PriceSyncRun.create({ trigger });
  running = run;
  execute(run, { stores, gapMs, log })
    .catch((err) => console.error('price sync:', err.message))
    .finally(() => {
      running = null;
    });
  return { run, alreadyRunning: false };
}

/**
 * On start-up: refresh unless a run started in the last 20 hours finished or is
 * still going (perhaps from a terminal) — a deploy or a wake-up shouldn't wait
 * for tomorrow, and two runs must not hit the same stores at once.
 */
export async function syncIfStale() {
  const recent = await PriceSyncRun.findOne({
    status: { $in: ['done', 'running'] },
    startedAt: { $gt: new Date(Date.now() - 20 * 60 * 60 * 1000) },
  }).lean();
  return recent ? null : startPriceSync('startup');
}

export const isPriceSyncRunning = () => Boolean(running);
