import { Link } from 'react-router-dom';
import { Mail } from 'lucide-react';

/** "You have an invitation to …" — shown only while someone is waiting on you. */
export default function InvitationBanner({ invites }) {
  if (!invites?.length) return null;
  return (
    <Link
      to="/groups"
      className="mb-6 flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 hover:bg-amber-100"
    >
      <Mail className="h-4 w-4 shrink-0" />
      <span className="flex-1">
        {invites.length === 1
          ? `You have an invitation to ${invites[0].title}`
          : `You have ${invites.length} group invitations waiting`}
      </span>
      <span className="font-medium">Review</span>
    </Link>
  );
}
