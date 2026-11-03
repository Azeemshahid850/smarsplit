import { Link } from 'react-router-dom';
import { formatMoney } from '../../utils/format.js';
import { Loading, ErrorState, EmptyState } from '../../components/ui/States.jsx';

const day = (value) => new Date(value).toLocaleDateString('en-PK', { day: 'numeric', month: 'short' });

/** The last five personal entries, written like ledger lines: date, what, amount. */
export default function RecentActivity({ recent }) {
  const rows = recent.data?.transactions ?? [];

  return (
    <section className="ledger p-5 sm:p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Recent activity</h2>
        <Link to="/personal" className="text-sm font-medium text-slate-600 hover:text-ink">
          All transactions
        </Link>
      </div>

      <div className="mt-4">
        {recent.loading && <Loading />}
        {recent.error && <ErrorState message={recent.error} onRetry={recent.reload} />}
        {recent.data && rows.length === 0 && (
          <EmptyState title="Nothing logged yet" hint="Add your first transaction on the Personal page." />
        )}
        {rows.length > 0 && (
          <ul className="divide-y divide-rule border-t border-rule">
            {rows.map((transactionRow) => {
              const received = transactionRow.type === 'CREDIT';
              return (
                <li key={transactionRow.id} className="grid grid-cols-[4rem_1fr_auto] items-baseline gap-3 py-2.5">
                  <span className="text-xs text-slate-500">{day(transactionRow.date)}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm">{transactionRow.title}</span>
                    <span className="text-xs text-slate-500">{transactionRow.category}</span>
                  </span>
                  <span className={`amount text-[15px] ${received ? 'text-gain' : 'text-loss'}`}>
                    {received ? '+' : '−'}
                    {formatMoney(transactionRow.amount)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
