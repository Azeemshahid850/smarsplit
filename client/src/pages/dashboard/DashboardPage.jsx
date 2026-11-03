import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { listGroups, listInvites } from '../../api/groups.js';
import { getSummary, listTransactions } from '../../api/personal.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { btn } from '../../components/ui/buttonStyles.js';
import InvitationBanner from './InvitationBanner.jsx';
import GroupBalances from './GroupBalances.jsx';
import ThisMonth from './ThisMonth.jsx';
import RecentActivity from './RecentActivity.jsx';
import ScanReceiptPrompt from './ScanReceiptPrompt.jsx';

export default function DashboardPage() {
  const { user } = useAuth();
  const groups = useAsync(listGroups);
  const invites = useAsync(listInvites);
  const summary = useAsync(() => getSummary());
  const recent = useAsync(() => listTransactions({ limit: 5 }));

  return (
    <>
      <PageHeader
        title={`Hi, ${user.name.split(' ')[0]}`}
        description="Here is where your money stands today."
        actions={
          <>
            <Link to="/groups/new" className={btn.secondary}>
              New group
            </Link>
            <Link to="/expenses/new" className={btn.primary}>
              <Plus className="h-4 w-4" /> Add expense
            </Link>
          </>
        }
      />

      <InvitationBanner invites={invites.data?.invites} />

      <div className="grid items-start gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <GroupBalances groups={groups} />
        </div>
        <ThisMonth summary={summary} />
        <div className="lg:col-span-2">
          <RecentActivity recent={recent} />
        </div>
        <ScanReceiptPrompt />
      </div>
    </>
  );
}
