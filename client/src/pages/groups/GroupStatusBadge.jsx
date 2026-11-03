import { CheckCircle2, Clock } from 'lucide-react';

const payments = (count) => `${count} payment${count === 1 ? '' : 's'} due`;

// active → still spending; settled with payments not yet marked paid → waiting on
// them; settled with everything paid → done.
export default function GroupStatusBadge({ group }) {
  if (group.status !== 'SETTLED') {
    return <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">active</span>;
  }
  if (group.unpaidPayments > 0) {
    return (
      <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
        <Clock className="h-3 w-3" /> {payments(group.unpaidPayments)}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-emerald-600 px-2 py-0.5 text-xs font-medium text-white">
      <CheckCircle2 className="h-3 w-3" /> Settled
    </span>
  );
}
