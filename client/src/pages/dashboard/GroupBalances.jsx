import { Link } from 'react-router-dom';
import { formatMoney, formatSigned } from '../../utils/format.js';
import { Loading, ErrorState, EmptyState } from '../../components/ui/States.jsx';
import { btn } from '../../components/ui/buttonStyles.js';

const LedgerColumn = ({ title, tone, rows, emptyText }) => (
  <div>
    <h3 className={`text-sm font-medium ${tone === 'gain' ? 'text-gain' : 'text-loss'}`}>{title}</h3>
    {rows.length === 0 ? (
      <p className="mt-2 border-t border-rule py-3 text-sm text-slate-500">{emptyText}</p>
    ) : (
      <ul className="mt-2 divide-y divide-rule border-t border-rule">
        {rows.map((groupRow) => (
          <li key={groupRow.id}>
            <Link to={`/groups/${groupRow.id}`} className="flex items-baseline justify-between gap-3 py-2.5 hover:text-slate-600">
              <span className="truncate text-sm">{groupRow.title}</span>
              <span className={`amount text-[15px] ${tone === 'gain' ? 'text-gain' : 'text-loss'}`}>
                {formatMoney(Math.abs(groupRow.myBalance))}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    )}
  </div>
);

/**
 * The khata page: who owes you and whom you owe, group by group, with the net
 * across every group as the ledger total under a double rule.
 */
export default function GroupBalances({ groups }) {
  const list = groups.data?.groups ?? [];
  const owedToYou = list.filter((groupRow) => groupRow.myBalance > 0);
  const youOwe = list.filter((groupRow) => groupRow.myBalance < 0);
  const settled = list.length - owedToYou.length - youOwe.length;
  const net = list.reduce((runningTotal, groupRow) => runningTotal + groupRow.myBalance, 0);

  return (
    <section className="ledger p-5 sm:p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Group balances</h2>
        <Link to="/groups" className="text-sm font-medium text-slate-600 hover:text-ink">
          All groups
        </Link>
      </div>

      <div className="mt-4">
        {groups.loading && <Loading />}
        {groups.error && <ErrorState message={groups.error} onRetry={groups.reload} />}
        {groups.data && list.length === 0 && (
          <EmptyState
            title="No groups yet"
            hint="Start with a trip and invite the people you travelled with."
            action={
              <Link to="/groups/new" className={`${btn.primary} mt-2`}>
                Create a group
              </Link>
            }
          />
        )}

        {list.length > 0 && (
          <>
            <div className="grid gap-6 sm:grid-cols-2 sm:gap-8">
              <LedgerColumn title="Owed to you" tone="gain" rows={owedToYou} emptyText="Nobody owes you right now." />
              <LedgerColumn title="You owe" tone="loss" rows={youOwe} emptyText="You owe nobody right now." />
            </div>

            <div className="total-rule mt-5 flex flex-wrap items-baseline justify-between gap-2 pt-3">
              <span className="text-sm text-slate-600">
                Net across groups
                {settled > 0 && <span className="text-slate-500"> ({settled} settled up)</span>}
              </span>
              <span className={`amount text-3xl ${net > 0 ? 'text-gain' : net < 0 ? 'text-loss' : 'text-ink'}`}>
                {net === 0 ? 'All square' : formatSigned(net)}
              </span>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
