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
    .filter((lineItem) => lineItem.priceMatch)
    .map((lineItem) => ({
      name: lineItem.name,
      paid: Math.round(lineItem.price / (lineItem.qty || 1)),
      onlinePrice: lineItem.priceMatch.onlinePrice,
      source: lineItem.priceMatch.source,
      url: lineItem.priceMatch.url,
    }));

  const cards = fromLines.length
    ? fromLines
    : alternatives.map((alternative) => ({
        name: alternative.name,
        paid: alternative.onlinePrice + alternative.saving,
        onlinePrice: alternative.onlinePrice,
        source: alternative.source,
        url: alternative.url,
      }));

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
        {cards.map((card, index) => (
          <li key={index} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 p-3 text-sm">
            <span className="min-w-0">
              <span className="block truncate font-medium text-slate-800">{card.name}</span>
              <span className="text-xs text-slate-500">
                {formatMoney(card.onlinePrice)} on {PLATFORM[card.source] ?? card.source} · you paid {formatMoney(card.paid)}
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-2">
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                save {formatMoney(card.paid - card.onlinePrice)}
              </span>
              {card.url && (
                <a href={card.url} target="_blank" rel="noreferrer" className="text-slate-300 hover:text-slate-600">
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
