import { useEffect } from 'react';
import { toast } from 'sonner';
import { RefreshCw, Loader2, Check, X, MinusCircle } from 'lucide-react';
import { getPriceSync, runPriceSync } from '../../api/admin.js';
import { useAsync } from '../../hooks/useAsync.js';
import { ErrorState } from '../../components/ui/States.jsx';

const when = (value) => (value ? new Date(value).toLocaleString('en-PK', { dateStyle: 'medium', timeStyle: 'short' }) : '—');

/** Admin view of the daily store-price refresh: the stores, the last run, and a button to run it now. */
export default function PriceSyncPanel() {
  const { data, loading, error, reload } = useAsync(getPriceSync);
  const running = Boolean(data?.running);

  // While a run is going, check back every few seconds until it finishes.
  useEffect(() => {
    if (!running) return undefined;
    const timer = setInterval(reload, 4000);
    return () => clearInterval(timer);
  }, [running, reload]);

  const start = async () => {
    try {
      const { alreadyRunning } = await runPriceSync();
      toast.success(alreadyRunning ? 'A refresh is already running' : 'Refreshing store prices — this takes a few minutes');
      reload();
    } catch (err) {
      toast.error(err.message || 'Could not start the refresh');
    }
  };

  const last = data?.runs?.[0];

  return (
    <section className="mt-6 rounded-xl bg-white p-5 ring-1 ring-slate-200">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-medium">Live store prices</h2>
          <p className="text-xs text-slate-400">
            Every morning at 9:00 the price book is refreshed from stores whose robots.txt allows it. A store that fails keeps its previous prices.
          </p>
        </div>
        <button
          onClick={start}
          disabled={running || loading}
          className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-sm text-white hover:bg-slate-800 disabled:opacity-60"
        >
          {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          {running ? 'Refreshing…' : 'Update now'}
        </button>
      </div>

      {loading && !data && <p className="mt-4 text-sm text-slate-400">Loading…</p>}
      {error && <ErrorState message={error} onRetry={reload} />}

      {data && (
        <>
          <p className="mt-3 text-xs text-slate-500">
            Stores: {data.stores.map((store) => store.key).join(', ')}
            {' · '}
            {last ? `Last run ${when(last.startedAt)} (${last.trigger}, ${last.status})` : 'Not run yet'}
          </p>
          {last?.error && <p className="mt-2 text-sm text-red-600">{last.error}</p>}
          {last?.stores?.length > 0 && (
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {last.stores.map((store) => (
                <li key={store.store} className="flex min-w-0 items-center gap-3 rounded-lg bg-slate-50 px-3 py-2 text-sm">
                  {store.skipped ? (
                    <MinusCircle className="h-4 w-4 shrink-0 text-slate-400" />
                  ) : store.error ? (
                    <X className="h-4 w-4 shrink-0 text-red-500" />
                  ) : (
                    <Check className="h-4 w-4 shrink-0 text-emerald-600" />
                  )}
                  <span className="min-w-0">
                    <span className="block font-medium capitalize text-slate-800">{store.store}</span>
                    <span className="block text-xs text-slate-400">
                      {store.skipped ?? store.error ?? `${store.updated} prices updated · ${store.matched} products found · ${store.searched} searches`}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
