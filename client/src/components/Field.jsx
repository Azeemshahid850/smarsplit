export default function Field({ label, error, hint, ...props }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <input
        {...props}
        aria-invalid={Boolean(error)}
        className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none transition
          focus:ring-2 focus:ring-emerald-500/30 ${error ? 'border-red-400 focus:border-red-500' : 'border-slate-300 focus:border-emerald-500'}`}
      />
      {error && <span className="mt-1 block text-xs text-red-600">{error}</span>}
      {!error && hint && <span className="mt-1 block text-xs text-slate-400">{hint}</span>}
    </label>
  );
}
