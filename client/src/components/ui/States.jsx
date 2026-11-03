import { Loader2, AlertCircle, Inbox } from 'lucide-react';

export const Loading = ({ label = 'Loading…' }) => (
  <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-400">
    <Loader2 className="h-4 w-4 animate-spin" /> {label}
  </div>
);

export const ErrorState = ({ message, onRetry }) => (
  <div className="flex flex-col items-center gap-3 rounded-xl bg-red-50 py-10 text-sm text-red-700">
    <AlertCircle className="h-5 w-5" />
    <p>{message}</p>
    {onRetry && (
      <button onClick={onRetry} className="rounded-lg border border-red-300 px-3 py-1.5 text-xs hover:bg-red-100">
        Try again
      </button>
    )}
  </div>
);

export const EmptyState = ({ title, hint, action }) => (
  <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-slate-300 py-12 text-center">
    <Inbox className="h-6 w-6 text-slate-300" />
    <p className="text-sm font-medium text-slate-700">{title}</p>
    {hint && <p className="max-w-xs text-xs text-slate-400">{hint}</p>}
    {action}
  </div>
);
