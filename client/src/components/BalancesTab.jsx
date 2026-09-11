import { Link } from 'react-router-dom';
import { getBalances } from '../api/expenses.js';
import { useAsync } from '../hooks/useAsync.js';
import { formatMoney, formatSigned } from '../utils/format.js';
import { Loading, ErrorState, EmptyState } from './States.jsx';
import Avatar from './Avatar.jsx';

export default function BalancesTab({ group }) {
  const { data, loading, error, reload } = useAsync(() => getBalances(group.id), [group.id]);

  if (loading) return <Loading label="Computing balances…" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (data.expenseCount === 0) {
    return <EmptyState title="Nothing to balance yet" hint="Balances appear as soon as the first expense is added." />;
  }

  const widest = Math.max(...data.balances.map((b) => Math.abs(b.net)), 1);

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm text-slate-500">
          {data.expenseCount} expenses · {formatMoney(data.totalSpent, group.baseCurrency)} spent
        </p>
        <Link
          to={`/groups/${group.id}/settle`}
          className="rounded-lg bg-slate-900 px-3 py-2 text-sm text-white hover:bg-slate-800"
        >
          Settle up
        </Link>
      </div>

      <ul className="mt-4 divide-y divide-slate-100 rounded-xl bg-white ring-1 ring-slate-200">
        {data.balances.map((b) => (
          <li key={b.userId} className="flex items-center gap-3 px-4 py-3">
            <Avatar name={b.name} avatarUrl={b.avatarUrl} size="md" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-slate-800">{b.name}</p>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full rounded-full ${b.net >= 0 ? 'bg-emerald-500' : 'bg-red-400'}`}
                  style={{ width: `${(Math.abs(b.net) / widest) * 100}%` }}
                />
              </div>
            </div>
            <div className="text-right">
              <p className={`text-sm font-semibold ${b.net > 0 ? 'text-emerald-600' : b.net < 0 ? 'text-red-600' : 'text-slate-400'}`}>
                {b.net === 0 ? 'settled' : formatSigned(b.net, group.baseCurrency)}
              </p>
              <p className="text-xs text-slate-400">{b.net > 0 ? 'is owed' : b.net < 0 ? 'owes' : ''}</p>
            </div>
          </li>
        ))}
      </ul>

      <p className="mt-3 text-xs text-slate-400">
        {data.netsToZero ? 'Balances net to zero — the ledger is consistent.' : 'Warning: balances do not net to zero.'}
      </p>
    </div>
  );
}
