import { ApiError } from '../middleware/ApiError.js';

// Nisab in tola (1 tola = 11.664 g): 52.5 tola of silver (612.36 g) or 7.5 tola of gold (87.48 g).
export const NISAB_TOLA = { silver: 52.5, gold: 7.5 };

const missing = (metal) =>
  ApiError.badRequest(`Enter today's ${metal} price per tola to work this out`, 'ZAKAT_RATE_MISSING');

/**
 * Zakat is 2.5% (1/40) of what you own minus what you owe right now, and only
 * once that is at or above the nisab. Every figure is whole rupees; the zakat is
 * rounded up so it is never a rupee short.
 */
export function calculateZakat({
  cash = 0,
  bank = 0,
  goldTola = 0,
  silverTola = 0,
  business = 0,
  investments = 0,
  receivables = 0,
  debts = 0,
  goldPerTola = null,
  silverPerTola = null,
  nisabBasis = 'silver',
}) {
  if (goldTola > 0 && !goldPerTola) throw missing('gold');
  if (silverTola > 0 && !silverPerTola) throw missing('silver');
  const basisRate = nisabBasis === 'gold' ? goldPerTola : silverPerTola;
  if (!basisRate) throw missing(nisabBasis);

  const goldValue = Math.round(goldTola * (goldPerTola ?? 0));
  const silverValue = Math.round(silverTola * (silverPerTola ?? 0));
  const total = cash + bank + goldValue + silverValue + business + investments + receivables;
  const net = Math.max(total - debts, 0);
  const nisab = Math.round(NISAB_TOLA[nisabBasis] * basisRate);
  const due = net >= nisab;

  return { goldValue, silverValue, total, debts, net, nisab, nisabBasis, due, zakat: due ? Math.ceil(net / 40) : 0 };
}
