import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { RefreshCw, Loader2 } from 'lucide-react';
import { getPriceSync, runPriceSync } from '../../api/admin.js';

const ago = (value) => {
  const minutes = Math.round((Date.now() - new Date(value).getTime()) / 60000);
  const words = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  if (minutes < 1) return 'just now';
  if (minutes < 60) return words.format(-minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (hours < 24) return words.format(-hours, 'hour');
  return words.format(-Math.round(hours / 24), 'day');
};

/** "Updated 3 hours ago", and for a price-book admin a button that refreshes the store prices now. */
export default function PriceRefresh({ refresh, canEdit, onUpdated }) {
  const [running, setRunning] = useState(refresh.running);
  const [, setMinute] = useState(0);

  // Keep "… minutes ago" current while the page stays open.
  useEffect(() => {
    const timer = setInterval(() => setMinute((count) => count + 1), 60_000);
    return () => clearInterval(timer);
  }, []);

  // While an update runs, check back every few seconds and reload the book once it is done.
  useEffect(() => {
    if (!running || !canEdit) return undefined;
    const timer = setInterval(async () => {
      try {
        if (!(await getPriceSync()).running) {
          setRunning(false);
          toast.success('Price book updated');
          onUpdated();
        }
      } catch {
        /* checked again on the next tick */
      }
    }, 5000);
    return () => clearInterval(timer);
  }, [running, canEdit, onUpdated]);

  const start = async () => {
    try {
      const { alreadyRunning } = await runPriceSync();
      setRunning(true);
      toast.success(alreadyRunning ? 'An update is already running' : 'Updating prices from the stores, this takes a few minutes');
    } catch (err) {
      toast.error(err.message || 'Could not start the update');
    }
  };

  const status = running
    ? 'Reading the five stores now…'
    : refresh.lastUpdatedAt
      ? `Updated ${ago(refresh.lastUpdatedAt)}`
      : 'Not updated from the stores yet';

  return (
    <div className="flex flex-col items-start gap-1.5 sm:items-end">
      {canEdit && (
        <button
          onClick={start}
          disabled={running}
          className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
        >
          {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          {running ? 'Updating…' : 'Update price book'}
        </button>
      )}
      <p
        className="text-xs text-slate-500"
        title={refresh.lastUpdatedAt ? new Date(refresh.lastUpdatedAt).toLocaleString('en-PK', { dateStyle: 'medium', timeStyle: 'short' }) : undefined}
      >
        {status}
      </p>
    </div>
  );
}
