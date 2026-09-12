import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { X, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { createGroup } from '../api/groups.js';
import Field from '../components/Field.jsx';
import SubmitButton from '../components/SubmitButton.jsx';
import FormError from '../components/FormError.jsx';

const TYPES = ['trip', 'home', 'event', 'other'];
const emailRe = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export default function CreateGroup() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    title: '',
    type: 'trip',
    baseCurrency: 'PKR',
    startDate: '',
    description: '',
  });
  const [settings, setSettings] = useState({ simplifyDebts: true, anyoneCanEdit: false });
  const [emails, setEmails] = useState([]);
  const [emailDraft, setEmailDraft] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

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
    setError('');
    setLoading(true);
    try {
      const { group } = await createGroup({
        ...form,
        startDate: form.startDate || null,
        memberEmails: emails,
        settings,
      });
      toast.success(`"${group.title}" created`);
      navigate(`/groups/${group.id}`, { replace: true });
    } catch (err) {
      setError(err.message || 'Could not create the group');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-xl">
      <Link to="/groups" className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-4 w-4" /> Groups
      </Link>
      <h1 className="mt-3 text-2xl font-semibold">New group</h1>

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
          <Field label="Currency" name="baseCurrency" value={form.baseCurrency} onChange={change} maxLength={3} />
          <Field label="Start date" name="startDate" type="date" value={form.startDate} onChange={change} />
        </div>

        <Field label="Description" name="description" value={form.description} onChange={change} placeholder="Optional" />

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
                  <button type="button" onClick={() => setEmails((currentList) => currentList.filter((entry) => entry !== event))} className="text-slate-400 hover:text-slate-700">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <p className="mt-1 text-xs text-slate-400">People without an account get a join link you can share.</p>
        </div>

        <div className="space-y-3 rounded-xl bg-slate-50 p-4">
          {[
            { key: 'simplifyDebts', label: 'Simplify debts', hint: 'Use Min-Cash-Flow when settling up' },
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
                <span className="block text-xs text-slate-400">{hint}</span>
              </span>
            </label>
          ))}
        </div>

        <SubmitButton loading={loading} disabled={form.title.trim().length < 2}>
          Create group
        </SubmitButton>
      </form>
    </div>
  );
}
