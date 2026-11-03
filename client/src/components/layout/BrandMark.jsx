/** The SmartSplit wordmark: a ruled ledger square and the name in the display face. */
export default function BrandMark({ tone = 'dark' }) {
  const light = tone === 'light';
  return (
    <span className="flex items-center gap-2.5">
      <svg viewBox="0 0 24 24" className="h-7 w-7 shrink-0" aria-hidden>
        <rect x="2" y="2" width="20" height="20" rx="5" fill={light ? '#ffffff' : 'var(--color-ink)'} />
        <rect x="6.5" y="5" width="2" height="14" rx="1" fill="var(--color-haldi)" />
        <path d="M11 9h7M11 12.5h7M11 16h4.5" stroke={light ? 'var(--color-ink)' : '#ffffff'} strokeWidth="1.6" strokeLinecap="round" />
      </svg>
      <span className="leading-none">
        <span className={`block font-display text-lg font-semibold ${light ? 'text-white' : 'text-ink'}`}>SmartSplit</span>
        <span className={`mt-0.5 block text-[11px] ${light ? 'text-white/50' : 'text-slate-500'}`}>& ExpenseAI</span>
      </span>
    </span>
  );
}
