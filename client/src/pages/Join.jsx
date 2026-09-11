import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, Navigate, useLocation } from 'react-router-dom';
import { Loader2, AlertCircle } from 'lucide-react';
import { joinGroup } from '../api/groups.js';
import { useAuth } from '../context/AuthContext.jsx';

// Claims an invite as soon as the viewer is signed in; otherwise sends them to
// log in first and comes straight back.
export default function Join() {
  const { inviteToken } = useParams();
  const { user, booting } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState('');
  const claimed = useRef(false);

  useEffect(() => {
    if (!user || claimed.current) return;
    claimed.current = true;
    joinGroup(inviteToken)
      .then(({ group }) => navigate(`/groups/${group.id}`, { replace: true }))
      .catch((err) => setError(err.message || 'This invite link is not valid'));
  }, [user, inviteToken, navigate]);

  if (booting) return <div className="grid min-h-screen place-items-center text-sm text-slate-400">…</div>;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;

  return (
    <div className="grid min-h-screen place-items-center p-6">
      {error ? (
        <div className="flex max-w-sm flex-col items-center gap-3 text-center">
          <AlertCircle className="h-6 w-6 text-red-500" />
          <p className="text-sm text-slate-700">{error}</p>
          <button onClick={() => navigate('/groups')} className="text-sm font-medium text-emerald-700 hover:underline">
            Go to my groups
          </button>
        </div>
      ) : (
        <p className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Joining the group…
        </p>
      )}
    </div>
  );
}
