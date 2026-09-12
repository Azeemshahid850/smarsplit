import { useState } from 'react';
import { Copy, Check, Trash2, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { inviteMember, removeMember } from '../api/groups.js';
import Avatar from './Avatar.jsx';
import FormError from './FormError.jsx';
import { useConfirm } from './ConfirmDialog.jsx';

export default function MembersTab({ group, onChange }) {
  const confirm = useConfirm();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('member');
  const [joinLink, setJoinLink] = useState('');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const isAdmin = group.iAmAdmin;

  const invite = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const res = await inviteMember(group.id, { email: email.trim().toLowerCase(), role });
      setJoinLink(res.joinLink || '');
      setEmail('');
      await onChange();
      toast.success(
        res.joinLink ? `Invite created — share the join link with ${res.member.email}` : `${res.member.name} was added to the group`,
      );
    } catch (err) {
      setError(err.message || 'Could not invite that person');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (member) => {
    const ok = await confirm({
      title: `Remove ${member.name}?`,
      description: `They lose access to ${group.title}. Expenses they are named on stay as they are.`,
      confirmLabel: 'Remove',
    });
    if (!ok) return;

    setError('');
    try {
      await removeMember(group.id, member.userId || member.id);
      await onChange();
      toast.success(`${member.name} removed from ${group.title}`);
    } catch (err) {
      toast.error(err.message || 'Could not remove that member');
    }
  };

  const copy = async () => {
    await navigator.clipboard.writeText(joinLink);
    setCopied(true);
    toast.success('Join link copied to your clipboard');
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="space-y-6">
      <FormError message={error} />

      <ul className="divide-y divide-slate-100 rounded-xl bg-white ring-1 ring-slate-200">
        {group.members.map((m) => (
          <li key={m.id} className="flex items-center gap-3 px-4 py-3">
            <Avatar name={m.name} avatarUrl={m.avatarUrl} size="md" muted={m.status === 'pending'} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-800">{m.name}</p>
              <p className="truncate text-xs text-slate-400">{m.email}</p>
            </div>
            {m.role === 'admin' && (
              <span className="flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                <ShieldCheck className="h-3 w-3" /> admin
              </span>
            )}
            {m.status === 'pending' && (
              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-700">pending</span>
            )}
            {isAdmin && (
              <button onClick={() => remove(m)} title="Remove" className="text-slate-300 hover:text-red-600">
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </li>
        ))}
      </ul>

      {isAdmin && (
        <form onSubmit={invite} className="rounded-xl bg-slate-50 p-4">
          <label className="text-sm font-medium text-slate-700">Invite someone</label>
          <div className="mt-2 flex flex-wrap gap-2">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="friend@email.com"
              className="min-w-48 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-500"
            />
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              <option value="member">member</option>
              <option value="admin">admin</option>
            </select>
            <button
              disabled={busy}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800 disabled:opacity-60"
            >
              Invite
            </button>
          </div>

          {joinLink && (
            <div className="mt-3 flex items-center gap-2 rounded-lg bg-white p-2 ring-1 ring-slate-200">
              <code className="flex-1 truncate text-xs text-slate-500">{joinLink}</code>
              <button type="button" onClick={copy} className="flex items-center gap-1 text-xs text-emerald-700 hover:underline">
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? 'Copied' : 'Copy link'}
              </button>
            </div>
          )}
        </form>
      )}
    </div>
  );
}
