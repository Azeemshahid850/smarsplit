import { Link } from 'react-router-dom';
import { Users, ArrowRight, TrendingDown, Sparkles, HandCoins } from 'lucide-react';
import { listGroups } from '../api/groups.js';
import { getSummary, listTransactions } from '../api/personal.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useAsync } from '../hooks/useAsync.js';
import { formatMoney, formatSigned, formatDate } from '../utils/format.js';
import { Loading, ErrorState, EmptyState } from '../components/States.jsx';
import StatCard from '../components/StatCard.jsx';

export default function Home() {
  const { user } = useAuth();
  const groups = useAsync(listGroups);
  const summary = useAsync(() => getSummary());
  const recent = useAsync(() => listTransactions({ limit: 5 }));

  const owedAcross = groups.data?.groups.reduce((transactionRow, groupRow) => transactionRow + groupRow.myBalance, 0) ?? 0;

  return (
    <>
      <h1 className="text-2xl font-semibold">Hi, {user.name.split(' ')[0]}</h1>
      <p className="text-sm text-slate-500">Here is where your money stands today.</p>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Across groups"
          value={groups.loading ? '…' : formatSigned(owedAcross)}
          tone={owedAcross > 0 ? 'emerald' : owedAcross < 0 ? 'red' : 'slate'}
          hint={owedAcross > 0 ? 'owed to you' : owedAcross < 0 ? 'you owe' : 'all settled'}
          icon={HandCoins}
        />
        <StatCard
          label="Spent this month"
          value={summary.loading ? '…' : formatMoney(summary.data?.spend ?? 0)}
          icon={TrendingDown}
          hint={summary.data?.month}
        />
        <StatCard
          label="Savings found"
          value={summary.loading ? '…' : formatMoney(summary.data?.savingsFound ?? 0)}
          tone="emerald"
          icon={Sparkles}
          hint="by ExpenseAI"
        />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section>
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-medium">
              <Users className="h-4 w-4 text-slate-400" /> Active groups
            </h2>
            <Link to="/groups" className="flex items-center gap-1 text-sm text-emerald-700 hover:underline">
              All groups <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="mt-3">
            {groups.loading && <Loading />}
            {groups.error && <ErrorState message={groups.error} onRetry={groups.reload} />}
            {groups.data?.groups.length === 0 && (
              <EmptyState
                title="No groups yet"
                hint="Start with a trip and invite the people you travelled with."
                action={
                  <Link to="/groups/new" className="mt-2 text-sm font-medium text-emerald-700 hover:underline">
                    Create a group
                  </Link>
                }
              />
            )}
            {groups.data && groups.data.groups.length > 0 && (
              <ul className="space-y-2">
                {groups.data.groups.slice(0, 4).map((groupRow) => (
                  <li key={groupRow.id}>
                    <Link to={`/groups/${groupRow.id}`} className="flex items-center justify-between rounded-xl bg-white p-4 ring-1 ring-slate-200 hover:ring-slate-300">
                      <span>
                        <span className="block font-medium text-slate-800">{groupRow.title}</span>
                        <span className="text-xs text-slate-400">{groupRow.memberCount} members · {formatMoney(groupRow.totalSpent, groupRow.baseCurrency)} spent</span>
                      </span>
                      <span className={`text-sm font-medium ${groupRow.myBalance > 0 ? 'text-emerald-600' : groupRow.myBalance < 0 ? 'text-red-600' : 'text-slate-400'}`}>
                        {groupRow.myBalance === 0 ? 'settled' : formatSigned(groupRow.myBalance, groupRow.baseCurrency)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section>
          <div className="flex items-center justify-between">
            <h2 className="font-medium">Recent activity</h2>
            <Link to="/personal" className="flex items-center gap-1 text-sm text-emerald-700 hover:underline">
              Personal <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="mt-3">
            {recent.loading && <Loading />}
            {recent.error && <ErrorState message={recent.error} onRetry={recent.reload} />}
            {recent.data?.transactions.length === 0 && (
              <EmptyState title="Nothing logged yet" hint="Add your first transaction on the Personal page." />
            )}
            {recent.data && recent.data.transactions.length > 0 && (
              <ul className="divide-y divide-slate-100 rounded-xl bg-white ring-1 ring-slate-200">
                {recent.data.transactions.map((transactionRow) => (
                  <li key={transactionRow.id} className="flex items-center justify-between px-4 py-3">
                    <span>
                      <span className="block text-sm font-medium text-slate-800">{transactionRow.title}</span>
                      <span className="text-xs text-slate-400">{transactionRow.category} · {formatDate(transactionRow.date)}</span>
                    </span>
                    <span className={`text-sm font-medium ${transactionRow.type === 'CREDIT' ? 'text-emerald-600' : 'text-slate-900'}`}>
                      {transactionRow.type === 'CREDIT' ? '+' : '−'}
                      {formatMoney(transactionRow.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </>
  );
}
