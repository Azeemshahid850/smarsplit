import { useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, UserPlus } from 'lucide-react';
import { getGroup } from '../api/groups.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useAsync } from '../hooks/useAsync.js';
import { formatDate } from '../utils/format.js';
import { Loading, ErrorState } from '../components/States.jsx';
import Avatar from '../components/Avatar.jsx';
import MembersTab from '../components/MembersTab.jsx';
import ExpensesTab from '../components/ExpensesTab.jsx';
import BalancesTab from '../components/BalancesTab.jsx';

const TABS = ['Expenses', 'Balances', 'Members'];

export default function GroupDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const [tab, setTab] = useState('Expenses');
  // Set when the user jumps here to invite someone, so the email box takes focus.
  const focusInvite = useRef(false);

  const openInvite = () => {
    focusInvite.current = true;
    setTab('Members');
  };
  const { data, loading, error, reload } = useAsync(() => getGroup(id), [id]);

  if (loading) return <Loading label="Loading group…" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  const group = data.group;
  const me = group.members.find((memberRow) => memberRow.userId === user.id);
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
        <div className="flex items-center gap-3">
          <div className="flex -space-x-2">
            {group.members.filter((memberRow) => memberRow.status !== 'requested').slice(0, 5).map((memberRow) => (
              <Avatar key={memberRow.id} name={memberRow.name} avatarUrl={memberRow.avatarUrl} muted={memberRow.status === 'pending'} />
            ))}
          </div>

          {view.iAmAdmin && (
            <button
              onClick={openInvite}
              className="relative flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-100"
            >
              <UserPlus className="h-4 w-4 text-slate-400" /> Add people
              {group.requestCount > 0 && (
                <span className="absolute -right-1.5 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-amber-500 px-1 text-[10px] font-medium text-white">
                  {group.requestCount}
                </span>
              )}
            </button>
          )}

          {group.status === 'SETTLED' && (
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">settled</span>
          )}
        </div>
      </header>

      <nav className="mt-6 flex gap-1 border-b border-slate-200">
        {TABS.map((tabName) => (
          <button
            key={tabName}
            onClick={() => setTab(tabName)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm transition ${
              tab === tabName ? 'border-slate-900 font-medium text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            {tabName}
            {tabName === 'Members' && view.iAmAdmin && group.requestCount > 0 && (
              <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-800">
                {group.requestCount}
              </span>
            )}
          </button>
        ))}
      </nav>

      <section className="mt-6">
        {tab === 'Expenses' && <ExpensesTab group={view} onChanged={reload} onInvite={openInvite} />}
        {tab === 'Balances' && <BalancesTab group={view} />}
        {tab === 'Members' && <MembersTab group={view} onChange={reload} autoFocus={focusInvite.current} />}
      </section>
    </>
  );
}
