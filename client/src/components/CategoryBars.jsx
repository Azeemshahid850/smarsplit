import { formatMoney } from '../utils/format.js';

// Green under 80% of the cap, amber from 80%, red at or over 100%.
const toneFor = (consumed) => {
  if (consumed == null) return 'bg-slate-300';
  if (consumed >= 100) return 'bg-red-500';
  if (consumed >= 80) return 'bg-amber-500';
  return 'bg-emerald-500';
};

export default function CategoryBars({ categories, currency = 'PKR' }) {
  const widest = Math.max(...categories.map((categoryRow) => categoryRow.cap ?? categoryRow.total), 1);

  return (
    <ul className="space-y-3">
      {categories.map((categoryRow) => {
        const width = Math.min((categoryRow.total / (categoryRow.cap ?? widest)) * 100, 100);
        return (
          <li key={categoryRow.category}>
            <div className="flex items-baseline justify-between text-sm">
              <span className="font-medium text-slate-700">{categoryRow.category}</span>
              <span className="text-slate-500">
                {formatMoney(categoryRow.total, currency)}
                {categoryRow.cap != null && <span className="text-slate-400"> / {formatMoney(c.cap, currency)}</span>}
              </span>
            </div>
            <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-100">
              <div className={`h-full rounded-full transition-all ${toneFor(categoryRow.consumed)}`} style={{ width: `${width}%` }} />
            </div>
            {categoryRow.consumed != null && (
              <p className={`mt-0.5 text-xs ${categoryRow.consumed >= 100 ? 'text-red-600' : categoryRow.consumed >= 80 ? 'text-amber-600' : 'text-slate-400'}`}>
                {categoryRow.consumed}% of budget{categoryRow.consumed >= 100 ? ' — over' : ''}
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
