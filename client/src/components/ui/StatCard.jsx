export default function StatCard({ label, value, hint, tone = 'slate', icon: Icon }) {
  const tones = {
    slate: 'text-slate-900',
    emerald: 'text-emerald-600',
    red: 'text-red-600',
  };
  return (
    <div className="rounded-xl bg-white p-4 ring-1 ring-slate-200">
      <p className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-slate-400">
        {Icon && <Icon className="h-3.5 w-3.5" />}
        {label}
      </p>
      <p className={`mt-1 text-2xl font-semibold ${tones[tone]}`}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-slate-400">{hint}</p>}
    </div>
  );
}
