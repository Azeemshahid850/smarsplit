import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, Link, useLocation } from 'react-router-dom';
import { Loader2, AlertCircle, Users } from 'lucide-react';
import { toast } from 'sonner';
import { joinGroup, previewInvite } from '../api/groups.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useAsync } from '../hooks/useAsync.js';

function Card({ children }) {
  return (
    <div className="grid min-h-screen place-items-center p-6">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-sm ring-1 ring-slate-200">{children}</div>
    </div>
  );
}

// Claims an invite as soon as the viewer is signed in. Signed out, it shows
// what the link opens and sends them to sign in or sign up — and back here.
export default function Join() {
  const { inviteToken } = useParams();
  const { user, booting } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState('');
  const claimed = useRef(false);

  const preview = useAsync(() => (booting || user ? Promise.resolve(null) : previewInvite(inviteToken)), [inviteToken, booting, user]);

  useEffect(() => {
    if (!user || claimed.current) return;
    claimed.current = true;
    joinGroup(inviteToken)
      .then(({ group }) => navigate(`/groups/${group.id}`, { replace: true }))
      .catch((err) => {
        // Already in — the link has nothing left to do, so just go to the groups.
        if (err.code === 'ALREADY_MEMBER') {
          toast.info('You are already in this group');
          return navigate('/groups', { replace: true });
        }
        setError(err.message || 'This invite link is not valid');
      });
  }, [user, inviteToken, navigate]);

  // Signed out, the preview is the page — wait for it (data is null for a render after boot).
  if (booting || (!user && !preview.data && !preview.error)) {
    return <div className="grid min-h-screen place-items-center text-sm text-slate-400">…</div>;
  }

  if (error || (!user && preview.error)) {
    return (
      <Card>
        <AlertCircle className="mx-auto h-6 w-6 text-red-500" />
        <p className="mt-3 text-sm text-slate-700">{error || preview.error}</p>
        <button onClick={() => navigate('/groups')} className="mt-4 text-sm font-medium text-emerald-700 hover:underline">
          Go to my groups
        </button>
      </Card>
    );
  }

  if (!user) {
    const { group, email, inviterName } = preview.data;
    const next = { from: location.pathname, email };
    return (
      <Card>
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-emerald-50 text-emerald-700">
          <Users className="h-5 w-5" />
        </span>
        <p className="mt-4 text-sm text-slate-500">{inviterName ? `${inviterName} invited you to` : 'You are invited to'}</p>
        <h1 className="text-xl font-semibold">{group.title}</h1>
        <p className="text-sm text-slate-500">
          <span className="capitalize">{group.type}</span> · {group.memberCount} members
        </p>

        <Link
          to="/register"
          state={next}
          className="mt-6 block w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800"
        >
          Create an account
        </Link>
        <Link to="/login" state={next} className="mt-3 block text-sm font-medium text-emerald-700 hover:underline">
          I already have an account
        </Link>
        <p className="mt-4 text-xs text-slate-400">This invite was sent to {email}</p>
      </Card>
    );
  }

  return (
    <div className="grid min-h-screen place-items-center p-6">
      <p className="flex items-center gap-2 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Joining the group…
      </p>
    </div>
  );
}
