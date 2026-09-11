import { Loader2 } from 'lucide-react';

export default function SubmitButton({ loading, children, ...props }) {
  return (
    <button
      type="submit"
      disabled={loading || props.disabled}
      {...props}
      className="flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm
        font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}
