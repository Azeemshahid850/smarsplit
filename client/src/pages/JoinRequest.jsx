import { useState } from 'react';
import { useParams, useNavigate, Navigate, useLocation } from 'react-router-dom';
import { Users, Clock, Check, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { previewJoinCode, requestToJoin } from '../api/groups.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useAsync } from '../hooks/useAsync.js';
import { Loading } from '../components/States.jsx';

/** What someone lands on when they open a shared group link. */
export default function JoinRequest() {
  const { joinCode } = useParams();
  const { user, booting } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [status, setStatus] = useState(null);
  const [sending, setSending] = useState(false);

  const preview = useAsync(() => (user ? previewJoinCode(joinCode) : Promise.resolve(null)), [joinCode, user]);

  if (booting) return <div className="grid min-h-screen place-items-center text-sm text-slate-400">…</div>;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (preview.loading) return <Loading label="Looking up that group…" />;

  if (preview.error) {
    return (
      <div className="grid min-h-screen place-items-center p-6">
        <div className="flex max-w-sm flex-col items-center gap-3 text-center">
          <AlertCircle className="h-6 w-6 text-red-500" />
          <p className="text-sm text-slate-700">{preview.error}</p>
          <button onClick={() => navigate('/groups')} className="text-sm font-medium text-emerald-700 hover:underline">
            Go to my groups
          </button>
        </div>
      </div>
    );
  }

  const { group, myStatus } = preview.data;
  const state = status ?? myStatus;

  const ask = async () => {
    setSending(true);
    try {
      const res = await requestToJoin(joinCode);
      setStatus(res.status);

      if (res.status === 'active') {
        toast.success(`You are in ${group.title}`);
        navigate(`/groups/${res.groupId}`, { replace: true });
      } else {
        toast.success('Request sent — an admin will approve it');
      }
    } catch (err) {
      toast.error(err.message || 'Could not send that request');
      if (err.code === 'ALREADY_MEMBER') navigate(`/groups/${group.id}`, { replace: true });
      if (err.code === 'ALREADY_REQUESTED') setStatus('requested');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="grid min-h-screen place-items-center p-6">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-sm ring-1 ring-slate-200">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-emerald-50 text-emerald-700">
          <Users className="h-5 w-5" />
        </span>

        <h1 className="mt-4 text-xl font-semibold">{group.title}</h1>
        <p className="text-sm text-slate-500">
          <span className="capitalize">{group.type}</span> · {group.memberCount} members
        </p>

        {state === 'requested' ? (
          <p className="mt-6 flex items-center justify-center gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
            <Clock className="h-4 w-4" /> Waiting for an admin to approve you
          </p>
        ) : state === 'active' ? (
          <p className="mt-6 flex items-center justify-center gap-2 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">
            <Check className="h-4 w-4" /> You are already in this group
          </p>
        ) : (
          <button
            onClick={ask}
            disabled={sending}
            className="mt-6 w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
          >
            {sending ? 'Sending…' : 'Ask to join'}
          </button>
        )}

        <button onClick={() => navigate('/groups')} className="mt-3 text-xs text-slate-400 hover:text-slate-700">
          Back to my groups
        </button>
      </div>
    </div>
  );
}
