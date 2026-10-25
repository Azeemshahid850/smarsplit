import { ArrowDownLeft, ArrowUpRight } from 'lucide-react';

/** Green "Received" for money in, red "Spent" for money out — readable at a glance. */
export default function TypeBadge({ type }) {
  const received = type === 'CREDIT';
  const Icon = received ? ArrowDownLeft : ArrowUpRight;
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${
        received ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
      }`}
    >
      <Icon className="h-3 w-3" /> {received ? 'Received' : 'Spent'}
    </span>
  );
}
