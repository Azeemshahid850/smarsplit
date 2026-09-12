import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { listBudgets, setBudget, deleteBudget } from '../api/personal.js';
import { useAsync } from '../hooks/useAsync.js';
import { formatMoney } from '../utils/format.js';
import { Loading, ErrorState } from './States.jsx';

const CATEGORIES = ['Food', 'Utilities', 'Travel', 'Shopping', 'Healthcare', 'Housing', 'Misc'];

export default function BudgetSettings({ onChanged }) {
  const { data, loading, error, reload } = useAsync(listBudgets);
  const [draft, setDraft] = useState({ category: 'Food', monthlyCap: '' });
  const [busy, setBusy] = useState(false);

  const save = async (e) => {
    e.preventDefault();
    const cap = Math.round(Number(draft.monthlyCap)) || 0;
    if (cap <= 0) return;
    setBusy(true);
    await setBudget({ category: draft.category, monthlyCap: cap });
    setDraft((d) => ({ ...d, monthlyCap: '' }));
    setBusy(false);
    await Promise.all([reload(), onChanged?.()]);
  };

  const remove = async (id) => {
    await deleteBudget(id);
    await Promise.all([reload(), onChanged?.()]);
  };

  if (loading) return <Loading label="Loading budgets…" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  return (
    <div className="rounded-xl bg-white p-5 ring-1 ring-slate-200">
      <h3 className="font-medium">Monthly budgets</h3>
      <p className="text-xs text-slate-400">Bars turn amber at 80% and red once you pass the cap.</p>

      {data.budgets.length > 0 && (
        <ul className="mt-3 divide-y divide-slate-100">
          {data.budgets.map((b) => (
            <li key={b.id} className="flex items-center justify-between py-2 text-sm">
              <span className="text-slate-700">{b.category}</span>
              <span className="flex items-center gap-3">
                <span className="text-slate-500">{formatMoney(b.monthlyCap)}</span>
                <button onClick={() => remove(b.id)} className="text-slate-300 hover:text-red-600">
                  <Trash2 className="h-4 w-4" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={save} className="mt-3 flex gap-2">
        <select
          value={draft.category}
          onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value }))}
          className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
        >
          {CATEGORIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <input
          type="number"
          min="1"
          placeholder="Cap"
          value={draft.monthlyCap}
          onChange={(e) => setDraft((d) => ({ ...d, monthlyCap: e.target.value }))}
          className="w-28 rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <button disabled={busy} className="rounded-lg bg-slate-900 px-4 text-sm text-white hover:bg-slate-800 disabled:opacity-60">
          Set
        </button>
      </form>
    </div>
  );
}
