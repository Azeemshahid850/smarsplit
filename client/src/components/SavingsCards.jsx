import { Sparkles, ExternalLink } from 'lucide-react';
import { formatMoney } from '../utils/format.js';

const PLATFORM = { daraz: 'Daraz', metro: 'Metro', imtiaz: 'Imtiaz' };

/**
 * "Cooking oil 3L — Rs 1,745 on Daraz, you paid Rs 1,890".
 * Takes either receipt line items (with priceMatch) or a transaction's
 * suggestedAlternatives.
 */
export default function SavingsCards({ lineItems = [], alternatives = [], totalSavings = 0, compact = false }) {
  const fromLines = lineItems
    .filter((i) => i.priceMatch)
    .map((i) => ({
      name: i.name,
      paid: Math.round(i.price / (i.qty || 1)),
      onlinePrice: i.priceMatch.onlinePrice,
      source: i.priceMatch.source,
      url: i.priceMatch.url,
    }));

  const cards = fromLines.length
    ? fromLines
    : alternatives.map((a) => ({ name: a.name, paid: a.onlinePrice + a.saving, onlinePrice: a.onlinePrice, source: a.source, url: a.url }));

  if (!cards.length) return null;

  return (
    <div className={compact ? '' : 'rounded-xl bg-white p-5 ring-1 ring-slate-200'}>
      <div className="flex items-center gap-2 rounded-lg bg-emerald-50 p-3 text-emerald-800">
        <Sparkles className="h-4 w-4 shrink-0" />
        <p className="text-sm">
          Estimated total potential savings <span className="font-semibold">{formatMoney(totalSavings)}</span>
        </p>
      </div>

      <ul className="mt-3 space-y-2">
        {cards.map((c, i) => (
          <li key={i} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 p-3 text-sm">
            <span className="min-w-0">
              <span className="block truncate font-medium text-slate-800">{c.name}</span>
              <span className="text-xs text-slate-500">
                {formatMoney(c.onlinePrice)} on {PLATFORM[c.source] ?? c.source} · you paid {formatMoney(c.paid)}
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-2">
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                save {formatMoney(c.paid - c.onlinePrice)}
              </span>
              {c.url && (
                <a href={c.url} target="_blank" rel="noreferrer" className="text-slate-300 hover:text-slate-600">
                  <ExternalLink className="h-4 w-4" />
                </a>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
