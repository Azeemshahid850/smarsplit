import { Link } from 'react-router-dom';
import { Users, ArrowRight } from 'lucide-react';
import { listGroups } from '../api/groups.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useAsync } from '../hooks/useAsync.js';
import { formatSigned } from '../utils/format.js';
import { Loading, ErrorState, EmptyState } from '../components/States.jsx';

export default function Home() {
  const { user } = useAuth();
  const { data, loading, error, reload } = useAsync(listGroups);

  return (
    <>
      <h1 className="text-2xl font-semibold">Hi, {user.name.split(' ')[0]}</h1>
      <p className="text-sm text-slate-500">Here is where your money stands today.</p>

      <section className="mt-6">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-medium">
            <Users className="h-4 w-4 text-slate-400" /> Active groups
          </h2>
          <Link to="/groups" className="flex items-center gap-1 text-sm text-emerald-700 hover:underline">
            All groups <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        <div className="mt-3">
          {loading && <Loading />}
          {error && <ErrorState message={error} onRetry={reload} />}
          {data && data.groups.length === 0 && (
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
          {data && data.groups.length > 0 && (
            <ul className="grid gap-3 sm:grid-cols-2">
              {data.groups.slice(0, 4).map((g) => (
                <li key={g.id}>
                  <Link
                    to={`/groups/${g.id}`}
                    className="block rounded-xl bg-white p-4 ring-1 ring-slate-200 transition hover:ring-slate-300"
                  >
                    <p className="font-medium text-slate-800">{g.title}</p>
                    <p className="text-xs text-slate-400">{g.memberCount} members</p>
                    <p
                      className={`mt-2 text-sm font-medium ${
                        g.myBalance > 0 ? 'text-emerald-600' : g.myBalance < 0 ? 'text-red-600' : 'text-slate-400'
                      }`}
                    >
                      {g.myBalance === 0 ? 'settled up' : formatSigned(g.myBalance, g.baseCurrency)}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </>
  );
}
