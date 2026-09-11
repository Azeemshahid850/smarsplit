import { useEffect, useState } from 'react';
import { Activity } from 'lucide-react';
import { getHealth } from '../api/client.js';

export default function Home() {
  const [health, setHealth] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    getHealth().then(setHealth).catch((e) => setError(e.message));
  }, []);

  return (
    <main className="min-h-screen grid place-items-center p-6">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
        <h1 className="text-2xl font-semibold">SmartSplit &amp; ExpenseAI</h1>
        <p className="mt-1 text-sm text-slate-500">Scaffold running. No features yet.</p>

        <div className="mt-6 flex items-center gap-2 rounded-lg bg-slate-50 p-3 text-sm">
          <Activity className="h-4 w-4 text-slate-400" />
          {error && <span className="text-red-600">API unreachable: {error}</span>}
          {!error && !health && <span className="text-slate-400">Checking API…</span>}
          {health && (
            <span className="text-emerald-700">
              API {health.status} · DB {health.db}
            </span>
          )}
        </div>
      </div>
    </main>
  );
}
