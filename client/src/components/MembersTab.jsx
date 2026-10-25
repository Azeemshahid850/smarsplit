import { useEffect, useRef, useState } from 'react';
import { Trash2, ShieldCheck, ShieldOff, Search, Mail, Check, X, Send, Link2, RefreshCw, AlertCircle, MessageCircle } from 'lucide-react';
import { toast } from 'sonner';
import { inviteMember, removeMember, searchUsers, resendInvite, approveMember, rotateJoinCode, setMemberRole } from '../api/groups.js';
import { useAuth } from '../context/AuthContext.jsx';
import Avatar from './Avatar.jsx';
import CopyButton from './CopyButton.jsx';
import { useConfirm } from './ConfirmDialog.jsx';

/** Opens WhatsApp with the message ready — the person picks who to send it to. */
function WhatsAppButton({ text }) {
  return (
    <a
      href={`https://wa.me/?text=${encodeURIComponent(text)}`}
      target="_blank"
      rel="noreferrer"
      className="flex items-center gap-1 whitespace-nowrap text-xs font-medium text-emerald-700 hover:underline"
    >
      <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
    </a>
  );
}

/** Row shown for people who asked to join through the share link. */
function RequestRow({ request, onApprove, onReject }) {
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <Avatar name={request.name} avatarUrl={request.avatarUrl} size="md" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-800">{request.name}</p>
        <p className="truncate text-xs text-slate-400">{request.email}</p>
      </div>
      <button
        onClick={() => onApprove(request)}
        className="flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
      >
        <Check className="h-3.5 w-3.5" /> Approve
      </button>
      <button
        onClick={() => onReject(request)}
        className="flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs hover:bg-slate-100"
      >
        <X className="h-3.5 w-3.5" /> Decline
      </button>
    </li>
  );
}

export default function MembersTab({ group, onChange, autoFocus = false }) {
  const confirm = useConfirm();
  const { user } = useAuth();
  const isAdmin = group.iAmAdmin;

  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('member');
  const [busy, setBusy] = useState(false);
  const [mailConfigured, setMailConfigured] = useState(true);
  // Member ids with a resend in flight — the button goes dead until the server answers.
  const [resending, setResending] = useState({});

  // Server stamps inviteSentAt; inside a minute of it the button stays off, so a
  // double-click (or an impatient admin) cannot send the same email twice.
  const RESEND_COOLDOWN_MS = 60 * 1000;
  const recentlySent = (member) => Boolean(member.inviteSentAt) && Date.now() - new Date(member.inviteSentAt).getTime() < RESEND_COOLDOWN_MS;
  const emailInput = useRef(null);

  useEffect(() => {
    if (autoFocus) emailInput.current?.focus();
  }, [autoFocus]);

  // Debounced people search — only accounts you already share a group with,
  // plus an exact email match.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    const timer = setTimeout(() => {
      searchUsers(q)
        .then(({ users }) => setResults(users.filter((userRow) => !group.members.some((memberRow) => memberRow.userId === userRow.id))))
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [query, group.members]);

  const addPerson = async (body, label) => {
    setBusy(true);
    try {
      const res = await inviteMember(group.id, { ...body, role });
      setMailConfigured(res.mailConfigured !== false);
      await onChange();

      if (res.member.status === 'active') {
        toast.success(`${res.member.name} added to ${group.title}`);
      } else if (res.emailed) {
        toast.success(`Invite emailed to ${res.member.email}`);
      } else {
        toast.success(`${label} invited — copy their link below and send it to them`);
      }

      setQuery('');
      setEmail('');
    } catch (err) {
      toast.error(err.message || 'Could not add that person');
    } finally {
      setBusy(false);
    }
  };

  const approve = async (member) => {
    try {
      await approveMember(group.id, member.id);
      await onChange();
      toast.success(`${member.name} is now in ${group.title}`);
    } catch (err) {
      toast.error(err.message || 'Could not approve that request');
    }
  };

  const reject = async (member) => {
    const ok = await confirm({
      title: `Decline ${member.name}?`,
      description: 'They can ask again with the share link if you change your mind.',
      confirmLabel: 'Decline',
    });
    if (!ok) return;

    await removeMember(group.id, member.id);
    await onChange();
    toast.success(`Declined ${member.name}`);
  };

  const remove = async (member) => {
    const ok = await confirm({
      title: member.status === 'pending' ? `Cancel the invite to ${member.email}?` : `Remove ${member.name}?`,
      description:
        member.status === 'pending'
          ? 'Their join link stops working straight away.'
          : `They lose access to ${group.title}. Expenses they are named on stay as they are.`,
      confirmLabel: member.status === 'pending' ? 'Cancel invite' : 'Remove',
    });
    if (!ok) return;

    try {
      await removeMember(group.id, member.userId || member.id);
      await onChange();
      toast.success(member.status === 'pending' ? 'Invite cancelled' : `${member.name} removed`);
    } catch (err) {
      toast.error(err.message || 'Could not remove that member');
    }
  };

  const resend = async (member) => {
    if (resending[member.id] || recentlySent(member)) return;
    setResending((current) => ({ ...current, [member.id]: true }));
    try {
      const res = await resendInvite(group.id, member.id);
      setMailConfigured(res.mailConfigured !== false);
      toast.success(res.emailed ? `Invite re-sent to ${member.email}` : 'Invite refreshed — copy the link and send it');
      await onChange(); // picks up inviteSentAt, which keeps the button off for a minute
    } catch (err) {
      toast.error(err.message || 'Could not resend that invite');
      if (err.code === 'RESEND_TOO_SOON') await onChange();
    } finally {
      setResending((current) => ({ ...current, [member.id]: false }));
    }
  };

  const changeRole = async (member) => {
    const role = member.role === 'admin' ? 'member' : 'admin';
    try {
      await setMemberRole(group.id, member.id, role);
      await onChange();
      toast.success(role === 'admin' ? `${member.name} is now an admin` : `${member.name} is no longer an admin`);
    } catch (err) {
      toast.error(err.message || 'Could not change that role');
    }
  };

  const rotate = async () => {
    const ok = await confirm({
      title: 'Generate a new share link?',
      description: 'Anyone holding the old link can no longer ask to join.',
      confirmLabel: 'Regenerate',
      tone: 'default',
    });
    if (!ok) return;

    await rotateJoinCode(group.id);
    await onChange();
    toast.success('New share link generated');
  };

  const requests = group.members.filter((memberRow) => memberRow.status === 'requested');
  const roster = group.members.filter((memberRow) => memberRow.status !== 'requested');

  return (
    <div className="space-y-6">
      {/* Waiting for approval */}
      {isAdmin && requests.length > 0 && (
        <section>
          <h3 className="text-sm font-medium text-slate-700">
            Waiting for your approval
            <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">{requests.length}</span>
          </h3>
          <ul className="mt-2 divide-y divide-slate-100 rounded-xl bg-white ring-1 ring-amber-200">
            {requests.map((requestRow) => (
              <RequestRow key={requestRow.id} request={requestRow} onApprove={approve} onReject={reject} />
            ))}
          </ul>
        </section>
      )}

      {/* The roster */}
      <ul className="divide-y divide-slate-100 rounded-xl bg-white ring-1 ring-slate-200">
        {roster.map((memberRow) => (
          <li key={memberRow.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <Avatar name={memberRow.name} avatarUrl={memberRow.avatarUrl} size="md" muted={memberRow.status === 'pending'} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-800">{memberRow.name}</p>
              <p className="truncate text-xs text-slate-400">{memberRow.email}</p>
            </div>

            {memberRow.role === 'admin' && (
              <span className="flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                <ShieldCheck className="h-3 w-3" /> admin
              </span>
            )}

            {isAdmin && memberRow.status === 'active' && (
              <button
                onClick={() => changeRole(memberRow)}
                title={memberRow.role === 'admin' ? 'Remove admin' : 'Make admin'}
                className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-700"
              >
                {memberRow.role === 'admin' ? <ShieldOff className="h-3.5 w-3.5" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                {memberRow.role === 'admin' ? 'Remove admin' : 'Make admin'}
              </button>
            )}

            {memberRow.status === 'pending' && (
              <>
                <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-700">not joined yet</span>
                {isAdmin && memberRow.joinLink && <CopyButton value={memberRow.joinLink} label="Copy invite link" />}
                {isAdmin && memberRow.joinLink && (
                  <WhatsAppButton text={`${user.name} invited you to "${group.title}" on SmartSplit. Join here: ${memberRow.joinLink}`} />
                )}
                {isAdmin &&
                  (recentlySent(memberRow) ? (
                    <span title="Invite sent — you can resend in a minute" className="flex items-center gap-1 text-xs text-emerald-700">
                      <Check className="h-3.5 w-3.5" /> sent
                    </span>
                  ) : (
                    <button
                      onClick={() => resend(memberRow)}
                      disabled={Boolean(resending[memberRow.id])}
                      title="Resend invite email"
                      className="text-slate-300 hover:text-slate-700 disabled:cursor-wait disabled:opacity-50"
                    >
                      <Send className="h-4 w-4" />
                    </button>
                  ))}
              </>
            )}

            {isAdmin && (
              <button onClick={() => remove(memberRow)} title="Remove" className="text-slate-300 hover:text-red-600">
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </li>
        ))}
      </ul>

      {isAdmin && (
        <>
          {!mailConfigured && (
            <p className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              Email sending is not set up on this server, so invites are not delivered automatically. Send each person
              their invite link above — copy it, or share it on WhatsApp.
            </p>
          )}

          {/* Way 1 — pick someone you have travelled with */}
          <section className="rounded-xl bg-slate-50 p-4">
            <label className="text-sm font-medium text-slate-700">Add someone you have shared a group with</label>
            <p className="text-xs text-slate-400">They are added straight away — no invite needed.</p>

            <div className="relative mt-2">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search by name or email"
                className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm outline-none focus:border-emerald-500"
              />
            </div>

            {query.trim().length >= 2 && (
              <ul className="mt-2 divide-y divide-slate-100 overflow-hidden rounded-lg bg-white ring-1 ring-slate-200">
                {searching && <li className="px-3 py-2 text-xs text-slate-400">Searching…</li>}
                {!searching && results.length === 0 && (
                  <li className="px-3 py-2 text-xs text-slate-400">
                    Nobody found. Use their exact email address below to invite them.
                  </li>
                )}
                {results.map((userRow) => (
                  <li key={userRow.id} className="flex items-center gap-3 px-3 py-2">
                    <Avatar name={userRow.name} avatarUrl={userRow.avatarUrl} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-slate-800">{userRow.name}</span>
                      <span className="block truncate text-xs text-slate-400">{userRow.email}</span>
                    </span>
                    {userRow.known && <span className="text-xs text-slate-400">travelled with</span>}
                    <button
                      disabled={busy}
                      onClick={() => addPerson({ userId: userRow.id }, userRow.name)}
                      className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs text-white hover:bg-slate-800 disabled:opacity-50"
                    >
                      Add
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Way 2 — invite a new email address */}
          <section className="rounded-xl bg-slate-50 p-4">
            <label className="flex items-center gap-1.5 text-sm font-medium text-slate-700">
              <Mail className="h-4 w-4 text-slate-400" /> Invite by email
            </label>
            <p className="text-xs text-slate-400">
              Has an account already? They join straight away. Otherwise you get a link to share.
            </p>

            <form
              onSubmit={(event) => {
                event.preventDefault();
                addPerson({ email: email.trim().toLowerCase() }, email.trim());
              }}
              className="mt-2 flex flex-wrap gap-2"
            >
              <input
                ref={emailInput}
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="friend@email.com"
                className="min-w-48 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-500"
              />
              <select
                value={role}
                onChange={(event) => setRole(event.target.value)}
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
            </form>
          </section>

          {/* Way 3 — share a link anyone can ask through */}
          {group.shareLink && (
            <section className="rounded-xl bg-slate-50 p-4">
              <label className="flex items-center gap-1.5 text-sm font-medium text-slate-700">
                <Link2 className="h-4 w-4 text-slate-400" /> Share link
              </label>
              <p className="text-xs text-slate-400">
                Post this anywhere. Whoever opens it asks to join, and you approve them here first.
              </p>

              <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-white p-2 ring-1 ring-slate-200">
                <code className="min-w-0 flex-1 truncate text-xs text-slate-500">{group.shareLink}</code>
                <CopyButton value={group.shareLink} label="Copy share link" />
                <WhatsAppButton text={`Join "${group.title}" on SmartSplit: ${group.shareLink}`} />
                <button onClick={rotate} title="Generate a new link" className="text-slate-300 hover:text-slate-700">
                  <RefreshCw className="h-4 w-4" />
                </button>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
