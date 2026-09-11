import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { getGroup } from '../api/groups.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useAsync } from '../hooks/useAsync.js';
import { formatDate } from '../utils/format.js';
import { Loading, ErrorState } from '../components/States.jsx';
import MembersTab from '../components/MembersTab.jsx';
import ExpensesTab from '../components/ExpensesTab.jsx';
import BalancesTab from '../components/BalancesTab.jsx';

const TABS = ['Expenses', 'Balances', 'Members'];

export default function GroupDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const [tab, setTab] = useState('Expenses');
  const { data, loading, error, reload } = useAsync(() => getGroup(id), [id]);

  if (loading) return <Loading label="Loading group…" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  const group = data.group;
  const me = group.members.find((m) => m.userId === user.id);
  const view = { ...group, me, iAmAdmin: me?.role === 'admin' };

  return (
    <>
      <Link to="/groups" className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-4 w-4" /> Groups
      </Link>

      <header className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{group.title}</h1>
          <p className="text-sm text-slate-500">
            <span className="capitalize">{group.type}</span> · {group.memberCount} members
            {group.startDate && ` · from ${formatDate(group.startDate)}`}
          </p>
          {group.description && <p className="mt-1 text-sm text-slate-600">{group.description}</p>}
        </div>
        {group.status === 'SETTLED' && (
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">settled</span>
        )}
      </header>

      <nav className="mt-6 flex gap-1 border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm transition ${
              tab === t ? 'border-slate-900 font-medium text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            {t}
          </button>
        ))}
      </nav>

      <section className="mt-6">
        {tab === 'Expenses' && <ExpensesTab group={view} onChanged={reload} />}
        {tab === 'Balances' && <BalancesTab group={view} />}
        {tab === 'Members' && <MembersTab group={view} onChange={reload} />}
      </section>
    </>
  );
}
