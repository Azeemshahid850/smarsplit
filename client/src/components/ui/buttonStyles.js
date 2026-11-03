// Button looks shared by <button> and <Link>, so an action looks the same wherever it sits.
const base =
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md px-3.5 py-2 text-sm font-medium transition-colors disabled:opacity-60';

export const btn = {
  primary: `${base} bg-ink text-white hover:bg-slate-800`,
  secondary: `${base} border border-rule bg-white text-ink hover:border-slate-300 hover:bg-slate-50`,
  danger: `${base} border border-red-200 bg-white text-red-700 hover:bg-red-50`,
};
