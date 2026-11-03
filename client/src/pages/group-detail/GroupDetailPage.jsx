import { useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { UserPlus } from 'lucide-react';
import { getGroup } from '../../api/groups.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import { formatDate } from '../../utils/format.js';
import { Loading, ErrorState } from '../../components/ui/States.jsx';
import Avatar from '../../components/ui/Avatar.jsx';
import MembersTab from './MembersTab.jsx';
import ExpensesTab from './ExpensesTab.jsx';
import BalancesTab from './BalancesTab.jsx';
import GroupActions from '../groups/GroupActions.jsx';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { btn } from '../../components/ui/buttonStyles.js';

const TABS = ['Expenses', 'Balances', 'Members'];

export default function GroupDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
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
      <PageHeader
        back={{ to: '/groups', label: 'Groups' }}
        title={group.title}
        description={
          <>
            <span className="flex flex-wrap gap-x-4 gap-y-1">
              <span className="capitalize">{group.type}</span>
              <span>{group.memberCount} members</span>
              {group.startDate && <span>From {formatDate(group.startDate)}</span>}
              {group.status === 'SETTLED' && <span className="font-medium text-gain">Settled</span>}
            </span>
            {group.description && <span className="mt-1 block text-slate-600">{group.description}</span>}
          </>
        }
        actions={
          <>
            <div className="mr-1 flex -space-x-2">
              {group.members.filter((memberRow) => memberRow.status !== 'requested').slice(0, 5).map((memberRow) => (
                <Avatar key={memberRow.id} name={memberRow.name} avatarUrl={memberRow.avatarUrl} muted={memberRow.status === 'pending'} />
              ))}
            </div>
            <GroupActions group={group} isAdmin={view.iAmAdmin} onDeleted={() => navigate('/groups', { replace: true })} />
            {view.iAmAdmin && (
              <button onClick={openInvite} className={`relative ${btn.secondary}`}>
                <UserPlus className="h-4 w-4 text-slate-500" /> Add people
                {group.requestCount > 0 && (
                  <span className="absolute -right-1.5 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-amber-500 px-1 text-[10px] font-medium text-white">
                    {group.requestCount}
                  </span>
                )}
              </button>
            )}
          </>
        }
      />

      <nav className="mt-6 flex gap-1 border-b border-slate-200">
        {TABS.map((tabName) => (
          <button
            key={tabName}
            onClick={() => setTab(tabName)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm transition ${
              tab === tabName ? 'border-haldi font-medium text-ink' : 'border-transparent text-slate-500 hover:text-slate-800'
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
