import { formatMoney } from '../../utils/format.js';

/** One tooltip for every chart — values in ink, a colour chip carries identity. */
export default function ChartTooltip({ active, payload, label, currency = 'PKR' }) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-lg bg-white px-3 py-2 text-xs shadow-lg ring-1 ring-slate-200">
      {label != null && <p className="font-medium text-slate-700">{label}</p>}
      <ul className="mt-1 space-y-0.5">
        {payload.map((entry) => (
          <li key={entry.name} className="flex items-center gap-2">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: entry.color || entry.payload?.fill }} />
            <span className="text-slate-500">{entry.name}</span>
            <span className="ml-auto font-medium text-slate-800">{formatMoney(entry.value, currency)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
