import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import { createGroup, getGroup, updateGroup } from '../../api/groups.js';
import { getRates } from '../../api/fx.js';
import { useAsync } from '../../hooks/useAsync.js';
import Field from '../../components/ui/Field.jsx';
import SubmitButton from '../../components/ui/SubmitButton.jsx';
import FormError from '../../components/ui/FormError.jsx';
import { Loading, ErrorState } from '../../components/ui/States.jsx';
import PageHeader from '../../components/ui/PageHeader.jsx';

const TYPES = ['trip', 'home', 'event', 'other'];
const emailRe = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// /groups/new creates a group; /groups/:id/edit reuses the same form, filled in.
export default function GroupFormPage() {
  const { id } = useParams();
  const existing = useAsync(() => (id ? getGroup(id) : Promise.resolve(null)), [id]);

  if (id && existing.loading) return <Loading label="Loading group…" />;
  if (id && existing.error) return <ErrorState message={existing.error} onRetry={existing.reload} />;
  return <GroupForm key={id ?? 'new'} group={existing.data?.group} />;
}

function GroupForm({ group }) {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    title: group?.title ?? '',
    type: group?.type ?? 'trip',
    baseCurrency: group?.baseCurrency ?? 'PKR',
    startDate: group?.startDate?.slice(0, 10) ?? '',
    description: group?.description ?? '',
  });
  const [settings, setSettings] = useState({ anyoneCanEdit: group?.settings?.anyoneCanEdit ?? false });
  const [emails, setEmails] = useState([]);
  const [emailDraft, setEmailDraft] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const rates = useAsync(getRates, []);
  const currencies = rates.data?.currencies ?? ['PKR'];

  const change = (event) => setForm((current) => ({ ...current, [event.target.name]: event.target.value }));

  const addEmail = () => {
    const value = emailDraft.trim().toLowerCase();
    if (!emailRe.test(value)) return setError('That does not look like an email');
    if (emails.includes(value)) return setEmailDraft('');
    setEmails((list) => [...list, value]);
    setEmailDraft('');
    setError('');
  };

  const submit = async (event) => {
    event.preventDefault();
    // An address typed but never "Add"-ed still counts, rather than vanishing.
    const draft = emailDraft.trim().toLowerCase();
    if (draft && !emailRe.test(draft)) return setError('That does not look like an email');
    setError('');
    setLoading(true);
    try {
      const body = { ...form, startDate: form.startDate || null, settings };
      if (group) {
        const { group: saved } = await updateGroup(group.id, body);
        toast.success(`"${saved.title}" saved`);
        navigate(`/groups/${saved.id}`, { replace: true });
        return;
      }
      const { group: created } = await createGroup({
        ...body,
        memberEmails: draft && !emails.includes(draft) ? [...emails, draft] : emails,
      });
      toast.success(`"${created.title}" created`);
      navigate(`/groups/${created.id}`, { replace: true });
    } catch (err) {
      setError(err.message || (group ? 'Could not save the group' : 'Could not create the group'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader
        back={{ to: group ? `/groups/${group.id}` : '/groups', label: group ? group.title : 'Groups' }}
        title={group ? 'Edit group' : 'New group'}
      />

      <form onSubmit={submit} className="mt-6 space-y-5" noValidate>
        <FormError message={error} />

        <Field label="Group name" name="title" required minLength={2} value={form.title} onChange={change} placeholder="Murree Trip" />

        <div>
          <span className="text-sm font-medium text-slate-700">Type</span>
          <div className="mt-2 flex flex-wrap gap-2">
            {TYPES.map((typeOption) => (
              <button
                type="button"
                key={typeOption}
                onClick={() => setForm((current) => ({ ...current, type: typeOption }))}
                className={`rounded-full px-3 py-1.5 text-sm capitalize transition ${
                  form.type === typeOption ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {typeOption}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Trip currency</span>
            <select
              name="baseCurrency"
              value={form.baseCurrency}
              onChange={change}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500"
            >
              {currencies.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-xs text-slate-500">New expenses start in this currency. Balances stay in rupees.</span>
          </label>
          <Field label="Start date" name="startDate" type="date" value={form.startDate} onChange={change} />
        </div>

        <Field label="Description" name="description" value={form.description} onChange={change} placeholder="Optional" />

        {!group && (
          <div>
            <span className="text-sm font-medium text-slate-700">Invite by email</span>
            <div className="mt-1 flex gap-2">
              <input
                type="email"
                value={emailDraft}
                onChange={(event) => setEmailDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    addEmail();
                  }
                }}
                placeholder="friend@email.com"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-500"
              />
              <button type="button" onClick={addEmail} className="rounded-lg border border-slate-300 px-3 text-sm hover:bg-slate-100">
                Add
              </button>
            </div>
            {emails.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {emails.map((event) => (
                  <span key={event} className="flex items-center gap-1 rounded-full bg-slate-100 py-1 pl-3 pr-1.5 text-xs text-slate-700">
                    {event}
                    <button type="button" onClick={() => setEmails((currentList) => currentList.filter((entry) => entry !== event))} className="text-slate-500 hover:text-slate-700">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <p className="mt-1 text-xs text-slate-500">People without an account get a join link you can share.</p>
          </div>
        )}

        <div className="space-y-3 rounded-xl bg-slate-50 p-4">
          {[
            { key: 'anyoneCanEdit', label: 'Anyone can edit expenses', hint: 'Otherwise only the payer or an admin' },
          ].map(({ key, label, hint }) => (
            <label key={key} className="flex cursor-pointer items-start gap-3 text-sm">
              <input
                type="checkbox"
                checked={settings[key]}
                onChange={(event) => setSettings((current) => ({ ...current, [key]: event.target.checked }))}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-emerald-600"
              />
              <span>
                <span className="font-medium text-slate-700">{label}</span>
                <span className="block text-xs text-slate-500">{hint}</span>
              </span>
            </label>
          ))}
        </div>

        <SubmitButton loading={loading} disabled={form.title.trim().length < 2}>
          {group ? 'Save changes' : 'Create group'}
        </SubmitButton>
      </form>
    </div>
  );
}
