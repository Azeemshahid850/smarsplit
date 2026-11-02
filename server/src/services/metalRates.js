import { MetalRate } from '../models/MetalRate.js';
import { currentRates } from './fx.js';

// Free and keyless: USD per troy ounce, near real time.
const PRICE_URL = 'https://api.gold-api.com/price';
export const SOURCE = { name: 'Gold API', url: 'https://gold-api.com' };

const GRAMS_PER_OUNCE = 31.1035;
const GRAMS_PER_TOLA = 11.664;
const MAX_AGE_MS = 12 * 60 * 60 * 1000;
const RETRY_AFTER_FAILURE_MS = 10 * 60 * 1000;

let cache = null; // { goldPerTola, silverPerTola, fetchedAt }
let lastFailureAt = 0;

/** Drops the in-memory copy (tests). */
export function clearMetalCache() {
  cache = null;
  lastFailureAt = 0;
}

async function usdPerOunce(symbol) {
  const res = await fetch(`${PRICE_URL}/${symbol}`, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`metal price HTTP ${res.status}`);
  const { price } = await res.json();
  if (!(price > 0)) throw new Error(`no ${symbol} price`);
  return price;
}

/** International gold and silver in rupees per tola, saved as the last good copy. */
export async function refreshMetalRates() {
  const [fx, gold, silver] = await Promise.all([currentRates(), usdPerOunce('XAU'), usdPerOunce('XAG')]);
  const rupeesPerUsd = fx.rates.USD;
  if (!(rupeesPerUsd > 0)) throw new Error('no USD exchange rate');
  const perTola = (price) => Math.round((price / GRAMS_PER_OUNCE) * GRAMS_PER_TOLA * rupeesPerUsd);

  cache = { goldPerTola: perTola(gold), silverPerTola: perTola(silver), fetchedAt: new Date() };
  await MetalRate.findOneAndUpdate({ base: 'PKR' }, { market: cache }, { upsert: true });
  return cache;
}

/** Memory, else the provider, else the last saved copy (marked stale), else null. */
async function marketRates() {
  if (cache && Date.now() - cache.fetchedAt < MAX_AGE_MS) return { ...cache, stale: false };

  if (Date.now() - lastFailureAt > RETRY_AFTER_FAILURE_MS) {
    try {
      return { ...(await refreshMetalRates()), stale: false };
    } catch (err) {
      lastFailureAt = Date.now();
      console.error('metal price refresh failed:', err.message);
    }
  }

  const saved = cache ?? (await MetalRate.findOne({ base: 'PKR' }).lean())?.market;
  if (!saved?.goldPerTola) return null;
  cache = { goldPerTola: saved.goldPerTola, silverPerTola: saved.silverPerTola, fetchedAt: saved.fetchedAt };
  return { ...cache, stale: true };
}

/**
 * The prices a zakat calculation uses: an admin's bazaar price while it is newer
 * than the international one, otherwise the international price. Null when neither exists.
 */
export async function zakatRates() {
  const [market, saved] = await Promise.all([marketRates(), MetalRate.findOne({ base: 'PKR' }).lean()]);
  const admin = saved?.goldPerTola && saved?.silverPerTola ? saved : null;

  if (admin && (!market || admin.updatedAt > market.fetchedAt)) {
    return { goldPerTola: admin.goldPerTola, silverPerTola: admin.silverPerTola, updatedAt: admin.updatedAt, source: 'admin', stale: false };
  }
  if (market) {
    return { goldPerTola: market.goldPerTola, silverPerTola: market.silverPerTola, updatedAt: market.fetchedAt, source: 'international', stale: market.stale };
  }
  return null;
}
