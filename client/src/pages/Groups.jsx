import { Link, useNavigate } from 'react-router-dom';
import { Plus, Mail, Clock, Check, X } from 'lucide-react';
import { toast } from 'sonner';
import { listGroups, listInvites, acceptInvite, declineInvite } from '../api/groups.js';
import { useAsync } from '../hooks/useAsync.js';
import { formatMoney, formatSigned } from '../utils/format.js';
import Avatar from '../components/Avatar.jsx';
import { Loading, ErrorState, EmptyState } from '../components/States.jsx';
import { useConfirm } from '../components/ConfirmDialog.jsx';

/** Invites sent to my email, and requests I am waiting on. */
function Invitations({ invites, onChange }) {
  const navigate = useNavigate();
  const confirm = useConfirm();

  const accept = async (invite) => {
    try {
      await acceptInvite(invite.groupId);
      toast.success(`You are in ${invite.title}`);
      navigate(`/groups/${invite.groupId}`);
    } catch (err) {
      toast.error(err.message || 'Could not accept that invitation');
      onChange();
    }
  };

  const decline = async (invite) => {
    const waiting = invite.status === 'requested';
    const ok = await confirm({
      title: waiting ? `Withdraw your request to join ${invite.title}?` : `Decline the invitation to ${invite.title}?`,
      description: waiting ? 'You can ask again with the share link later.' : 'An admin can invite you again if you change your mind.',
      confirmLabel: waiting ? 'Withdraw' : 'Decline',
    });
    if (!ok) return;

    try {
      await declineInvite(invite.groupId);
      toast.success(waiting ? 'Request withdrawn' : 'Invitation declined');
    } catch (err) {
      toast.error(err.message || 'Could not do that');
    }
    onChange();
  };

  if (!invites.length) return null;

  return (
    <section className="mt-6">
      <h2 className="flex items-center gap-2 text-sm font-medium text-slate-700">
        <Mail className="h-4 w-4 text-slate-400" /> Invitations
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">{invites.length}</span>
      </h2>
      <ul className="mt-2 divide-y divide-slate-100 rounded-xl bg-white ring-1 ring-amber-200">
        {invites.map((invite) => (
          <li key={invite.groupId} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-800">{invite.title}</p>
              <p className="text-xs text-slate-400">
                <span className="capitalize">{invite.type}</span> · {invite.memberCount} members
                {invite.status === 'pending' && invite.invitedBy && ` · ${invite.invitedBy} invited you`}
              </p>
            </div>

            {invite.status === 'requested' ? (
              <>
                <span className="flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-700">
                  <Clock className="h-3 w-3" /> waiting for approval
                </span>
                <button onClick={() => decline(invite)} className="text-xs text-slate-400 hover:text-slate-700">
                  Withdraw
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => accept(invite)}
                  className="flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
                >
                  <Check className="h-3.5 w-3.5" /> Join
                </button>
                <button
                  onClick={() => decline(invite)}
                  className="flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs hover:bg-slate-100"
                >
                  <X className="h-3.5 w-3.5" /> Decline
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

const balanceTone = (netAmount) => (netAmount > 0 ? 'text-emerald-600' : netAmount < 0 ? 'text-red-600' : 'text-slate-400');

export default function Groups() {
  const { data, loading, error, reload } = useAsync(listGroups);
  const invites = useAsync(listInvites);

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

      {invites.data && <Invitations invites={invites.data.invites} onChange={() => Promise.all([invites.reload(), reload()])} />}

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
                        {groupRow.members.filter((memberRow) => memberRow.status !== 'requested').slice(0, 5).map((memberRow) => (
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
