import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Trash2, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { listExpenses, deleteExpense } from '../api/expenses.js';
import { useAsync } from '../hooks/useAsync.js';
import { useCategories } from '../context/CategoriesContext.jsx';
import { formatMoney, formatDate } from '../utils/format.js';
import { Loading, ErrorState, EmptyState } from './States.jsx';
import Avatar from './Avatar.jsx';
import { useConfirm } from './ConfirmDialog.jsx';

const SPLIT_LABEL = { EQUAL: 'equal', EXACT: 'exact', PERCENTAGE: '%', LINE_ITEM: 'items' };

export default function ExpensesTab({ group, onChanged, onInvite }) {
  const confirm = useConfirm();
  const { all: CATEGORIES } = useCategories();
  const [filters, setFilters] = useState({ category: '', payer: '', page: 1 });
  const { data, loading, error, reload } = useAsync(
    () => listExpenses(group.id, { ...filters, limit: 20 }),
    [group.id, filters.category, filters.payer, filters.page],
  );

  const nameOf = (userId) => group.members.find((memberRow) => memberRow.userId === userId)?.name || 'Someone';

  const remove = async (expense) => {
    const ok = await confirm({
      title: `Delete "${expense.title}"?`,
      description: 'Balances update straight away. This cannot be undone from the app.',
    });
    if (!ok) return;

    try {
      await deleteExpense(expense.id);
      await Promise.all([reload(), onChanged?.()]);
      toast.success(`Deleted "${expense.title}"`);
    } catch (err) {
      toast.error(err.message || 'Could not delete that expense');
    }
  };

  const setFilter = (patch) => setFilters((current) => ({ ...current, ...patch, page: 1 }));

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={filters.category}
          onChange={(expenseRow) => setFilter({ category: expenseRow.target.value })}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm"
        >
          <option value="">All categories</option>
          {CATEGORIES.map((categoryName) => (
            <option key={categoryName}>{categoryName}</option>
          ))}
        </select>

        <select
          value={filters.payer}
          onChange={(expenseRow) => setFilter({ payer: expenseRow.target.value })}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm"
        >
          <option value="">Anyone paid</option>
          {group.members.filter((memberRow) => memberRow.status === 'active').map((memberRow) => (
            <option key={memberRow.id} value={memberRow.userId}>
              {memberRow.name}
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
            title={group.memberCount < 2 ? "It's just you in this group" : 'No expenses yet'}
            hint={
              group.memberCount < 2
                ? 'Add the people you are travelling with — there is nobody to split with yet.'
                : 'Add the first one — fuel, hotel, dinner — and balances update instantly.'
            }
            action={
              group.memberCount < 2 && group.iAmAdmin && onInvite ? (
                <button onClick={onInvite} className="mt-2 text-sm font-medium text-emerald-700 hover:underline">
                  Add people to this group
                </button>
              ) : null
            }
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
                  {data.expenses.map((expenseRow) => (
                    <tr key={expenseRow.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-800">{expenseRow.title}</p>
                        <p className="text-xs text-slate-400">
                          {expenseRow.category} · {formatDate(expenseRow.date)}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="flex -space-x-2">
                            {expenseRow.paidBy.map((payerEntry) => (
                              <Avatar key={payerEntry.userId} name={nameOf(payerEntry.userId)} />
                            ))}
                          </div>
                          {expenseRow.paidBy.length > 1 && <span className="text-xs text-slate-400">{expenseRow.paidBy.length} payers</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                          {SPLIT_LABEL[expenseRow.splitType]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-medium">{formatMoney(expenseRow.totalAmount, group.baseCurrency)}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          <Link to={`/expenses/${expenseRow.id}/edit`} title="Edit" className="text-slate-300 hover:text-slate-700">
                            <Pencil className="h-4 w-4" />
                          </Link>
                          <button onClick={() => remove(expenseRow)} title="Delete" className="text-slate-300 hover:text-red-600">
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
                    onClick={() => setFilters((current) => ({ ...current, page: current.page - 1 }))}
                    className="rounded-lg border border-slate-300 px-3 py-1 disabled:opacity-40"
                  >
                    Previous
                  </button>
                  <button
                    disabled={filters.page >= data.pagination.pages}
                    onClick={() => setFilters((current) => ({ ...current, page: current.page + 1 }))}
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
