import { useState } from 'react';
import { TrendingUp, TrendingDown, Wallet, Repeat, Trash2, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { getSummary, listTransactions, deleteTransaction } from '../../api/personal.js';
import { useAsync } from '../../hooks/useAsync.js';
import { formatMoney, formatDate } from '../../utils/format.js';
import { Loading, ErrorState, EmptyState } from '../../components/ui/States.jsx';
import StatCard from '../../components/ui/StatCard.jsx';
import CategoryBars from './CategoryBars.jsx';
import AddTransactionForm from './AddTransactionForm.jsx';
import BudgetSettings from './BudgetSettings.jsx';
import CategorySettings from './CategorySettings.jsx';
import SavingsCards from '../../components/receipts/SavingsCards.jsx';
import ReceiptPreview from '../../components/receipts/ReceiptPreview.jsx';
import TypeBadge from '../../components/ui/TypeBadge.jsx';
import { useConfirm } from '../../components/ui/ConfirmDialog.jsx';
import PageHeader from '../../components/ui/PageHeader.jsx';

const thisMonth = () => new Date().toISOString().slice(0, 7);

export default function PersonalPage() {
  const confirm = useConfirm();
  const [month, setMonth] = useState(thisMonth());
  const [preview, setPreview] = useState(null); // transaction whose receipt photo is open
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
      <PageHeader
        title="Personal"
        description="Your own income and spending, separate from any group."
        actions={
          <input
            type="month"
            aria-label="Month"
            value={month}
            onChange={(event) => setMonth(event.target.value)}
            className="rounded-md border border-rule bg-white px-3 py-2 text-sm"
          />
        }
      />

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
            <section className="min-w-0 lg:col-span-2">
              <h2 className="font-medium">Where it went</h2>
              <div className="mt-3 p-5 panel">
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
                  <div className="overflow-x-auto ledger">
                    <table className="w-full bg-white text-sm">
                      <thead className="bg-slate-50 text-left text-xs text-slate-500">
                        <tr>
                          <th className="px-4 py-3 font-medium">Title</th>
                          <th className="hidden px-4 py-3 font-medium sm:table-cell">Type</th>
                          <th className="hidden px-4 py-3 font-medium md:table-cell">Category</th>
                          <th className="hidden px-4 py-3 font-medium lg:table-cell">Method</th>
                          <th className="px-4 py-3 text-right font-medium">Amount</th>
                          <th className="px-4 py-3" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-rule">
                        {transactions.data.transactions.map((transactionRow) => (
                          <tr key={transactionRow.id} className="hover:bg-slate-50">
                            <td className="px-4 py-3">
                              <p className="flex items-center gap-1.5 font-medium text-slate-800">
                                {transactionRow.title}
                                {(transactionRow.isRecurring || transactionRow.generatedFrom) && <Repeat className="h-3.5 w-3.5 text-slate-300" />}
                              </p>
                              <p className="text-xs text-slate-500">
                                {formatDate(transactionRow.date)}
                                <span className="md:hidden">, {transactionRow.category}</span>
                              </p>
                            </td>
                            <td className="hidden px-4 py-3 sm:table-cell"><TypeBadge type={transactionRow.type} /></td>
                            <td className="hidden px-4 py-3 text-slate-600 md:table-cell">{transactionRow.category}</td>
                            <td className="hidden px-4 py-3 text-slate-500 lg:table-cell">{transactionRow.paymentMethod}</td>
                            <td className={`amount whitespace-nowrap px-4 py-3 text-right ${transactionRow.type === 'CREDIT' ? 'text-emerald-600' : 'text-red-600'}`}>
                              {transactionRow.type === 'CREDIT' ? '+' : '−'}
                              {formatMoney(transactionRow.amount)}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <span className="inline-flex items-center gap-2">
                                {transactionRow.receiptUrl && (
                                  <button onClick={() => setPreview(transactionRow)} title="View the receipt photo" className="text-slate-300 hover:text-slate-700">
                                    <Eye className="h-4 w-4" />
                                  </button>
                                )}
                                <button onClick={() => remove(transactionRow)} title="Delete" className="text-slate-300 hover:text-red-600">
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </span>
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
      {preview && (
        <ReceiptPreview url={preview.receiptUrl} title={`${preview.title} · ${formatDate(preview.date)}`} onClose={() => setPreview(null)} />
      )}
    </>
  );
}
