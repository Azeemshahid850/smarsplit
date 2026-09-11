import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Trash2, Pencil } from 'lucide-react';
import { listExpenses, deleteExpense } from '../api/expenses.js';
import { useAsync } from '../hooks/useAsync.js';
import { formatMoney, formatDate } from '../utils/format.js';
import { Loading, ErrorState, EmptyState } from './States.jsx';
import Avatar from './Avatar.jsx';

const CATEGORIES = ['Food', 'Utilities', 'Travel', 'Shopping', 'Healthcare', 'Housing', 'Misc'];
const SPLIT_LABEL = { EQUAL: 'equal', EXACT: 'exact', PERCENTAGE: '%', LINE_ITEM: 'items' };

export default function ExpensesTab({ group, onChanged }) {
  const [filters, setFilters] = useState({ category: '', payer: '', page: 1 });
  const { data, loading, error, reload } = useAsync(
    () => listExpenses(group.id, { ...filters, limit: 20 }),
    [group.id, filters.category, filters.payer, filters.page],
  );

  const nameOf = (userId) => group.members.find((m) => m.userId === userId)?.name || 'Someone';

  const remove = async (expense) => {
    if (!window.confirm(`Delete "${expense.title}"? This cannot be undone from the UI.`)) return;
    await deleteExpense(expense.id);
    await Promise.all([reload(), onChanged?.()]);
  };

  const setFilter = (patch) => setFilters((f) => ({ ...f, ...patch, page: 1 }));

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={filters.category}
          onChange={(e) => setFilter({ category: e.target.value })}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm"
        >
          <option value="">All categories</option>
          {CATEGORIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>

        <select
          value={filters.payer}
          onChange={(e) => setFilter({ payer: e.target.value })}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm"
        >
          <option value="">Anyone paid</option>
          {group.members.filter((m) => m.userId).map((m) => (
            <option key={m.id} value={m.userId}>
              {m.name}
            </option>
          ))}
        </select>

        <Link
          to={`/expenses/new?group=${group.id}`}
          className="ml-auto flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm text-white hover:bg-slate-800"
        >
          <Plus className="h-4 w-4" /> Add expense
        </Link>
      </div>

      <div className="mt-4">
        {loading && <Loading label="Loading expenses…" />}
        {error && <ErrorState message={error} onRetry={reload} />}

        {data && data.expenses.length === 0 && (
          <EmptyState
            title="No expenses yet"
            hint="Add the first one — fuel, hotel, dinner — and balances update instantly."
          />
        )}

        {data && data.expenses.length > 0 && (
          <>
            <div className="overflow-x-auto rounded-xl ring-1 ring-slate-200">
              <table className="w-full bg-white text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-medium">Expense</th>
                    <th className="px-4 py-3 font-medium">Paid by</th>
                    <th className="px-4 py-3 font-medium">Split</th>
                    <th className="px-4 py-3 text-right font-medium">Amount</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.expenses.map((e) => (
                    <tr key={e.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-800">{e.title}</p>
                        <p className="text-xs text-slate-400">
                          {e.category} · {formatDate(e.date)}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="flex -space-x-2">
                            {e.paidBy.map((p) => (
                              <Avatar key={p.userId} name={nameOf(p.userId)} />
                            ))}
                          </div>
                          {e.paidBy.length > 1 && <span className="text-xs text-slate-400">{e.paidBy.length} payers</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                          {SPLIT_LABEL[e.splitType]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-medium">{formatMoney(e.totalAmount, group.baseCurrency)}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          <Link to={`/expenses/${e.id}/edit`} title="Edit" className="text-slate-300 hover:text-slate-700">
                            <Pencil className="h-4 w-4" />
                          </Link>
                          <button onClick={() => remove(e)} title="Delete" className="text-slate-300 hover:text-red-600">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {data.pagination.pages > 1 && (
              <div className="mt-3 flex items-center justify-between text-sm text-slate-500">
                <span>
                  Page {data.pagination.page} of {data.pagination.pages}
                </span>
                <div className="flex gap-2">
                  <button
                    disabled={filters.page <= 1}
                    onClick={() => setFilters((f) => ({ ...f, page: f.page - 1 }))}
                    className="rounded-lg border border-slate-300 px-3 py-1 disabled:opacity-40"
                  >
                    Previous
                  </button>
                  <button
                    disabled={filters.page >= data.pagination.pages}
                    onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}
                    className="rounded-lg border border-slate-300 px-3 py-1 disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
