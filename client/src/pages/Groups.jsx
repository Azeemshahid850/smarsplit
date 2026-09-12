import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { listGroups } from '../api/groups.js';
import { useAsync } from '../hooks/useAsync.js';
import { formatMoney, formatSigned } from '../utils/format.js';
import Avatar from '../components/Avatar.jsx';
import { Loading, ErrorState, EmptyState } from '../components/States.jsx';

const balanceTone = (netAmount) => (netAmount > 0 ? 'text-emerald-600' : netAmount < 0 ? 'text-red-600' : 'text-slate-400');

export default function Groups() {
  const { data, loading, error, reload } = useAsync(listGroups);

  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Groups</h1>
          <p className="text-sm text-slate-500">Trips, flats and events you split with others</p>
        </div>
        <Link
          to="/groups/new"
          className="flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm text-white hover:bg-slate-800"
        >
          <Plus className="h-4 w-4" /> New group
        </Link>
      </div>

      <div className="mt-6">
        {loading && <Loading label="Loading groups…" />}
        {error && <ErrorState message={error} onRetry={reload} />}

        {data && data.groups.length === 0 && (
          <EmptyState
            title="No groups yet"
            hint="Create one for your next trip and invite people by email."
            action={
              <Link to="/groups/new" className="mt-2 text-sm font-medium text-emerald-700 hover:underline">
                Create your first group
              </Link>
            }
          />
        )}

        {data && data.groups.length > 0 && (
          <div className="overflow-x-auto rounded-xl ring-1 ring-slate-200">
            <table className="w-full bg-white text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Group</th>
                  <th className="px-4 py-3 font-medium">Members</th>
                  <th className="px-4 py-3 font-medium">Total spent</th>
                  <th className="px-4 py-3 font-medium">My balance</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.groups.map((groupRow) => (
                  <tr key={groupRow.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <Link to={`/groups/${groupRow.id}`} className="font-medium text-slate-900 hover:underline">
                        {groupRow.title}
                      </Link>
                      <p className="text-xs capitalize text-slate-400">{groupRow.type}</p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex -space-x-2">
                        {groupRow.members.slice(0, 5).map((memberRow) => (
                          <Avatar key={memberRow.id} name={memberRow.name} avatarUrl={memberRow.avatarUrl} muted={memberRow.status === 'pending'} />
                        ))}
                        {groupRow.members.length > 5 && (
                          <span className="grid h-7 w-7 place-items-center rounded-full bg-slate-100 text-[11px] text-slate-500 ring-2 ring-white">
                            +{groupRow.members.length - 5}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{formatMoney(groupRow.totalSpent, groupRow.baseCurrency)}</td>
                    <td className={`px-4 py-3 font-medium ${balanceTone(groupRow.myBalance)}`}>
                      {groupRow.myBalance === 0 ? 'settled up' : formatSigned(groupRow.myBalance, groupRow.baseCurrency)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs ${
                          groupRow.status === 'SETTLED' ? 'bg-slate-100 text-slate-600' : 'bg-emerald-50 text-emerald-700'
                        }`}
                      >
                        {groupRow.status.toLowerCase()}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
