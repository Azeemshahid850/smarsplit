import { useState } from 'react';
import { TrendingUp, TrendingDown, Wallet, Repeat, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { getSummary, listTransactions, deleteTransaction } from '../api/personal.js';
import { useAsync } from '../hooks/useAsync.js';
import { formatMoney, formatDate } from '../utils/format.js';
import { Loading, ErrorState, EmptyState } from '../components/States.jsx';
import StatCard from '../components/StatCard.jsx';
import CategoryBars from '../components/CategoryBars.jsx';
import AddTransactionForm from '../components/AddTransactionForm.jsx';
import BudgetSettings from '../components/BudgetSettings.jsx';
import CategorySettings from '../components/CategorySettings.jsx';
import SavingsCards from '../components/SavingsCards.jsx';
import { useConfirm } from '../components/ConfirmDialog.jsx';

const thisMonth = () => new Date().toISOString().slice(0, 7);

export default function Personal() {
  const confirm = useConfirm();
  const [month, setMonth] = useState(thisMonth());
  const summary = useAsync(() => getSummary(month), [month]);
  const transactions = useAsync(() => listTransactions({ month, limit: 10 }), [month]);

  const refresh = () => Promise.all([summary.reload(), transactions.reload()]);

  const remove = async (transactionRow) => {
    const ok = await confirm({
      title: `Delete "${transactionRow.title}"?`,
      description: `${transactionRow.type === 'CREDIT' ? 'Income' : 'Spending'} of ${formatMoney(transactionRow.amount)} on ${formatDate(transactionRow.date)}.`,
    });
    if (!ok) return;

    try {
      await deleteTransaction(transactionRow.id);
      await refresh();
      toast.success(`Deleted "${transactionRow.title}"`);
    } catch (err) {
      toast.error(err.message || 'Could not delete that transaction');
    }
  };

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Personal</h1>
          <p className="text-sm text-slate-500">Your own income and spending, separate from any group.</p>
        </div>
        <input
          type="month"
          value={month}
          onChange={(event) => setMonth(event.target.value)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
        />
      </div>

      {summary.loading && <Loading />}
      {summary.error && <ErrorState message={summary.error} onRetry={summary.reload} />}

      {summary.data && (
        <>
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <StatCard label="Received" value={formatMoney(summary.data.income)} tone="emerald" icon={TrendingUp} />
            <StatCard
              label="Spent"
              value={formatMoney(summary.data.spend)}
              tone="red"
              icon={TrendingDown}
              hint={
                summary.data.lastMonthSpend
                  ? `${summary.data.spend >= summary.data.lastMonthSpend ? '+' : '−'}${formatMoney(
                      Math.abs(summary.data.spend - summary.data.lastMonthSpend),
                    )} vs last month`
                  : undefined
              }
            />
            <StatCard label="Left" value={formatMoney(summary.data.net)} icon={Wallet} hint={`${summary.data.month}`} />
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-3">
            <section className="lg:col-span-2">
              <h2 className="font-medium">Where it went</h2>
              <div className="mt-3 rounded-xl bg-white p-5 ring-1 ring-slate-200">
                {summary.data.byCategory.length === 0 ? (
                  <EmptyState title="Nothing spent this month" hint="Add a transaction to see the breakdown." />
                ) : (
                  <CategoryBars categories={summary.data.byCategory} />
                )}
              </div>

              {summary.data.savingsFound > 0 && (
                <>
                  <h2 className="mt-6 font-medium">Savings found by ExpenseAI</h2>
                  <div className="mt-3 space-y-4">
                    {(transactions.data?.transactions ?? [])
                      .filter((transactionRow) => transactionRow.potentialSavings > 0)
                      .slice(0, 3)
                      .map((transactionRow) => (
                        <SavingsCards key={transactionRow.id} alternatives={transactionRow.suggestedAlternatives} totalSavings={transactionRow.potentialSavings} />
                      ))}
                  </div>
                </>
              )}

              <h2 className="mt-6 font-medium">Recent transactions</h2>
              <div className="mt-3">
                {transactions.loading && <Loading />}
                {transactions.error && <ErrorState message={transactions.error} onRetry={transactions.reload} />}
                {transactions.data && transactions.data.transactions.length === 0 && (
                  <EmptyState title="No transactions yet" hint="Everything you add this month shows up here." />
                )}
                {transactions.data && transactions.data.transactions.length > 0 && (
                  <div className="overflow-x-auto rounded-xl ring-1 ring-slate-200">
                    <table className="w-full bg-white text-sm">
                      <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="px-4 py-3 font-medium">Title</th>
                          <th className="px-4 py-3 font-medium">Category</th>
                          <th className="px-4 py-3 font-medium">Method</th>
                          <th className="px-4 py-3 text-right font-medium">Amount</th>
                          <th className="px-4 py-3" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {transactions.data.transactions.map((transactionRow) => (
                          <tr key={transactionRow.id} className="hover:bg-slate-50">
                            <td className="px-4 py-3">
                              <p className="flex items-center gap-1.5 font-medium text-slate-800">
                                {transactionRow.title}
                                {(transactionRow.isRecurring || transactionRow.generatedFrom) && <Repeat className="h-3.5 w-3.5 text-slate-300" />}
                              </p>
                              <p className="text-xs text-slate-400">{formatDate(transactionRow.date)}</p>
                            </td>
                            <td className="px-4 py-3 text-slate-600">{transactionRow.category}</td>
                            <td className="px-4 py-3 text-slate-500">{transactionRow.paymentMethod}</td>
                            <td className={`px-4 py-3 text-right font-medium ${transactionRow.type === 'CREDIT' ? 'text-emerald-600' : 'text-slate-900'}`}>
                              {transactionRow.type === 'CREDIT' ? '+' : '−'}
                              {formatMoney(transactionRow.amount)}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <button onClick={() => remove(transactionRow)} className="text-slate-300 hover:text-red-600">
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </section>

            <aside className="space-y-6">
              <AddTransactionForm onAdded={refresh} />
              <BudgetSettings onChanged={refresh} />
              <CategorySettings />
            </aside>
          </div>
        </>
      )}
    </>
  );
}
