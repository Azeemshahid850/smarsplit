import { Link } from 'react-router-dom';
import { Users, Layers, Receipt, Tag, Check, X, ShieldCheck } from 'lucide-react';
import { getAdminOverview } from '../api/admin.js';
import { useAsync } from '../hooks/useAsync.js';
import { formatDate } from '../utils/format.js';
import { Loading, ErrorState } from '../components/States.jsx';
import StatCard from '../components/StatCard.jsx';
import Avatar from '../components/Avatar.jsx';

const SERVICES = [
  { key: 'mail', label: 'Email (SMTP)', hint: 'invites, join requests, password resets' },
  { key: 'cloudinary', label: 'Cloudinary', hint: 'receipt image storage' },
  { key: 'vision', label: 'Vision OCR', hint: 'AI receipt reading; Tesseract otherwise' },
  { key: 'google', label: 'Google sign-in', hint: 'one-tap login' },
];

/** Read-only picture of the whole app for the people listed in ADMIN_EMAILS. */
export default function Admin() {
  const { data, loading, error, reload } = useAsync(getAdminOverview);

  if (loading) return <Loading label="Loading overview…" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  const { totals, services, users, groups } = data;

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <ShieldCheck className="h-6 w-6 text-emerald-600" /> Admin
          </h1>
          <p className="text-sm text-slate-500">Everything on this server, at a glance.</p>
        </div>
        <Link to="/prices" className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-sm text-white hover:bg-slate-800">
          <Tag className="h-4 w-4" /> Manage price book
        </Link>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="People" value={totals.users} icon={Users} />
        <StatCard label="Groups" value={totals.groups} icon={Layers} hint={`${totals.expenses} expenses`} />
        <StatCard label="Receipts scanned" value={totals.receipts} icon={Receipt} hint={`${totals.transactions} personal transactions`} />
        <StatCard label="Price book" value={totals.prices} icon={Tag} hint={`${totals.stores} stores`} tone={totals.prices ? 'emerald' : 'red'} />
      </div>

      <section className="mt-6 rounded-xl bg-white p-5 ring-1 ring-slate-200">
        <h2 className="font-medium">Services</h2>
        <p className="text-xs text-slate-400">Set the matching env vars on the server to turn these on.</p>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {SERVICES.map(({ key, label, hint }) => (
            <li key={key} className="flex items-center gap-3 rounded-lg bg-slate-50 px-3 py-2 text-sm">
              {services[key] ? (
                <Check className="h-4 w-4 shrink-0 text-emerald-600" />
              ) : (
                <X className="h-4 w-4 shrink-0 text-red-500" />
              )}
              <span className="min-w-0">
                <span className="block font-medium text-slate-800">{label}</span>
                <span className="block truncate text-xs text-slate-400">{services[key] ? hint : `not configured — ${hint}`}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section>
          <h2 className="font-medium">Newest people</h2>
          <ul className="mt-3 divide-y divide-slate-100 rounded-xl bg-white ring-1 ring-slate-200">
            {users.length === 0 && <li className="px-4 py-6 text-center text-sm text-slate-400">Nobody has signed up yet.</li>}
            {users.map((userRow) => (
              <li key={userRow.id} className="flex items-center gap-3 px-4 py-3">
                <Avatar name={userRow.name} avatarUrl={userRow.avatarUrl} size="md" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-slate-800">{userRow.name}</span>
                  <span className="block truncate text-xs text-slate-400">{userRow.email}</span>
                </span>
                <span className="text-right text-xs text-slate-400">
                  <span className="block">{userRow.groups} group{userRow.groups === 1 ? '' : 's'}</span>
                  <span className="block">{formatDate(userRow.createdAt)}{userRow.viaGoogle ? ' · Google' : ''}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2 className="font-medium">Newest groups</h2>
          <ul className="mt-3 divide-y divide-slate-100 rounded-xl bg-white ring-1 ring-slate-200">
            {groups.length === 0 && <li className="px-4 py-6 text-center text-sm text-slate-400">No groups yet.</li>}
            {groups.map((groupRow) => (
              <li key={groupRow.id} className="flex items-center gap-3 px-4 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-slate-800">{groupRow.title}</span>
                  <span className="block truncate text-xs text-slate-400">
                    <span className="capitalize">{groupRow.type}</span> · by {groupRow.createdBy} · {groupRow.memberCount} members
                    {groupRow.pendingCount > 0 && ` · ${groupRow.pendingCount} pending`}
                  </span>
                </span>
                <span className="text-right text-xs text-slate-400">
                  <span className={`block rounded-full px-2 py-0.5 ${groupRow.status === 'SETTLED' ? 'bg-slate-100 text-slate-600' : 'bg-emerald-50 text-emerald-700'}`}>
                    {groupRow.status.toLowerCase()}
                  </span>
                  <span className="mt-1 block">{formatDate(groupRow.createdAt)}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
