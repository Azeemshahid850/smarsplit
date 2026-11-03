export default function StatCard({ label, value, hint, tone = 'slate', icon: Icon }) {
  const tones = {
    slate: 'text-ink',
    emerald: 'text-gain',
    red: 'text-loss',
  };
  return (
    <div className="panel p-5">
      <p className="flex items-center gap-1.5 text-sm text-slate-600">
        {Icon && <Icon className="h-4 w-4 text-slate-500" strokeWidth={1.75} />}
        {label}
      </p>
      <p className={`amount mt-2 text-[28px] leading-none ${tones[tone]}`}>{value}</p>
      {hint && <p className="mt-1.5 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}
