import { FxRate } from '../models/FxRate.js';
import { ApiError } from '../middleware/ApiError.js';

// Currencies a trip is likely to be paid in. PKR is the ledger currency.
export const CURRENCIES = ['PKR', 'USD', 'AED', 'SAR', 'QAR', 'OMR', 'KWD', 'BHD', 'GBP', 'EUR', 'CAD', 'AUD', 'TRY', 'MYR', 'THB', 'CNY'];

// Free, keyless, updated once a day; its terms ask for a visible attribution link.
const SOURCE_URL = 'https://open.er-api.com/v6/latest/PKR';
export const SOURCE = { name: 'ExchangeRate-API', url: 'https://www.exchangerate-api.com' };

const MAX_AGE_MS = 12 * 60 * 60 * 1000;
const RETRY_AFTER_FAILURE_MS = 10 * 60 * 1000;

let cache = null; // { rates, updatedAt, fetchedAt }
let lastFailureAt = 0;

/** Drops the in-memory copy (tests, and a manual refresh). */
export function clearRateCache() {
  cache = null;
  lastFailureAt = 0;
}

/** Fetches today's rates from the provider and saves them. Used by the daily job. */
export async function refreshRates() {
  const res = await fetch(SOURCE_URL, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`exchange rates HTTP ${res.status}`);
  const body = await res.json();
  if (body.result !== 'success') throw new Error('exchange rate provider returned an error');

  // The provider quotes units of each currency per rupee; we store rupees per unit.
  const rates = Object.fromEntries(
    CURRENCIES.filter((code) => code !== 'PKR' && body.rates?.[code] > 0).map((code) => [
      code,
      Math.round((1 / body.rates[code]) * 10_000) / 10_000,
    ]),
  );

  cache = { rates, updatedAt: new Date(body.time_last_update_unix * 1000), fetchedAt: new Date() };
  await FxRate.findOneAndUpdate({ base: 'PKR' }, cache, { upsert: true });
  return cache;
}

/** Today's rates: memory, else the provider, else the last saved copy (marked stale). */
export async function currentRates() {
  if (cache && Date.now() - cache.fetchedAt < MAX_AGE_MS) return { ...cache, stale: false };

  if (Date.now() - lastFailureAt > RETRY_AFTER_FAILURE_MS) {
    try {
      return { ...(await refreshRates()), stale: false };
    } catch (err) {
      lastFailureAt = Date.now();
      console.error('fx refresh failed:', err.message);
    }
  }

  const saved = cache ?? (await FxRate.findOne({ base: 'PKR' }).lean());
  if (!saved) throw new ApiError(503, 'FX_UNAVAILABLE', 'Exchange rates are unavailable right now — try again shortly or enter the amount in PKR');
  cache = { rates: saved.rates, updatedAt: saved.updatedAt, fetchedAt: saved.fetchedAt };
  return { ...cache, stale: true };
}

/** Rupees per one unit of `currency`, with the date the provider published it. */
export async function pkrRate(currency) {
  const { rates, updatedAt } = await currentRates();
  const rate = rates[currency];
  if (!rate) throw ApiError.badRequest(`No exchange rate for ${currency}`, 'UNKNOWN_CURRENCY');
  return { currency, rate, rateDate: updatedAt };
}
