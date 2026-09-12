import { formatMoney } from '../utils/format.js';

// Green under 80% of the cap, amber from 80%, red at or over 100%.
const toneFor = (consumed) => {
  if (consumed == null) return 'bg-slate-300';
  if (consumed >= 100) return 'bg-red-500';
  if (consumed >= 80) return 'bg-amber-500';
  return 'bg-emerald-500';
};

export default function CategoryBars({ categories, currency = 'PKR' }) {
  const widest = Math.max(...categories.map((c) => c.cap ?? c.total), 1);

  return (
    <ul className="space-y-3">
      {categories.map((c) => {
        const width = Math.min((c.total / (c.cap ?? widest)) * 100, 100);
        return (
          <li key={c.category}>
            <div className="flex items-baseline justify-between text-sm">
              <span className="font-medium text-slate-700">{c.category}</span>
              <span className="text-slate-500">
                {formatMoney(c.total, currency)}
                {c.cap != null && <span className="text-slate-400"> / {formatMoney(c.cap, currency)}</span>}
              </span>
            </div>
            <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-100">
              <div className={`h-full rounded-full transition-all ${toneFor(c.consumed)}`} style={{ width: `${width}%` }} />
            </div>
            {c.consumed != null && (
              <p className={`mt-0.5 text-xs ${c.consumed >= 100 ? 'text-red-600' : c.consumed >= 80 ? 'text-amber-600' : 'text-slate-400'}`}>
                {c.consumed}% of budget{c.consumed >= 100 ? ' — over' : ''}
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
