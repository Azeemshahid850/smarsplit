import { useState } from 'react';
import { KeyRound, LogOut, Save } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext.jsx';
import Avatar from '../components/Avatar.jsx';
import Field from '../components/Field.jsx';
import SubmitButton from '../components/SubmitButton.jsx';
import FormError from '../components/FormError.jsx';

const TOGGLES = [
  { key: 'email', label: 'Email notifications', hint: 'Invites and password resets always send regardless' },
  { key: 'groupActivity', label: 'Group activity', hint: 'Expenses added, members joining, settlements' },
  { key: 'budgetAlerts', label: 'Budget alerts', hint: 'When a category passes its monthly cap' },
];

function Details() {
  const { user, updateProfile } = useAuth();
  const [form, setForm] = useState({
    name: user.name,
    avatarUrl: user.avatarUrl || '',
    defaultCurrency: user.defaultCurrency,
  });
  const [notifications, setNotifications] = useState(user.notifications);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const change = (event) => setForm((current) => ({ ...current, [event.target.name]: event.target.value }));

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setSaving(true);
    try {
      await updateProfile({
        name: form.name.trim(),
        avatarUrl: form.avatarUrl.trim() || null,
        defaultCurrency: form.defaultCurrency.trim().toUpperCase(),
        notifications,
      });
      toast.success('Profile saved');
    } catch (err) {
      setError(err.message || 'Could not save your profile');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-5 rounded-xl bg-white p-5 ring-1 ring-slate-200" noValidate>
      <FormError message={error} />

      <div className="flex items-center gap-4">
        <Avatar name={form.name || user.name} avatarUrl={form.avatarUrl || null} size="md" />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-slate-800">{user.email}</p>
          <p className="text-xs text-slate-400">
            Email cannot be changed here{user.hasPassword ? '' : ' · signed in with Google'}
          </p>
        </div>
      </div>

      <Field label="Name" name="name" required minLength={2} value={form.name} onChange={change} />
      <Field
        label="Avatar image URL"
        name="avatarUrl"
        value={form.avatarUrl}
        onChange={change}
        placeholder="https://…"
        hint="Leave empty to use your initials"
      />
      <Field
        label="Default currency"
        name="defaultCurrency"
        maxLength={3}
        value={form.defaultCurrency}
        onChange={change}
        hint="Three-letter code, e.g. PKR"
      />

      <div className="space-y-3 rounded-lg bg-slate-50 p-4">
        {TOGGLES.map(({ key, label, hint }) => (
          <label key={key} className="flex cursor-pointer items-start gap-3 text-sm">
            <input
              type="checkbox"
              checked={notifications[key]}
              onChange={(event) => setNotifications((current) => ({ ...current, [key]: event.target.checked }))}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-emerald-600"
            />
            <span>
              <span className="font-medium text-slate-700">{label}</span>
              <span className="block text-xs text-slate-400">{hint}</span>
            </span>
          </label>
        ))}
      </div>

      <SubmitButton loading={saving} disabled={form.name.trim().length < 2}>
        <Save className="h-4 w-4" /> Save changes
      </SubmitButton>
    </form>
  );
}

function Password() {
  const { user, changePassword } = useAuth();
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const change = (event) => setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  const tooShort = form.newPassword.length > 0 && form.newPassword.length < 8;
  const mismatch = form.confirm.length > 0 && form.confirm !== form.newPassword;

  const submit = async (event) => {
    event.preventDefault();
    if (tooShort || mismatch) return;
    setError('');
    setSaving(true);
    try {
      await changePassword({
        ...(user.hasPassword ? { currentPassword: form.currentPassword } : {}),
        newPassword: form.newPassword,
      });
      setForm({ currentPassword: '', newPassword: '', confirm: '' });
      toast.success('Password updated — your other devices were signed out');
    } catch (err) {
      setError(err.message || 'Could not change your password');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4 rounded-xl bg-white p-5 ring-1 ring-slate-200" noValidate>
      <h2 className="flex items-center gap-2 font-medium">
        <KeyRound className="h-4 w-4 text-slate-400" />
        {user.hasPassword ? 'Change password' : 'Set a password'}
      </h2>
      <p className="text-xs text-slate-400">
        {user.hasPassword
          ? 'Your other devices are signed out when the password changes.'
          : 'You signed in with Google. Setting a password lets you sign in with your email too.'}
      </p>

      <FormError message={error} />

      {user.hasPassword && (
        <Field
          label="Current password"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
          value={form.currentPassword}
          onChange={change}
        />
      )}

      <Field
        label="New password"
        name="newPassword"
        type="password"
        autoComplete="new-password"
        required
        value={form.newPassword}
        onChange={change}
        error={tooShort ? 'At least 8 characters' : ''}
      />
      <Field
        label="Confirm new password"
        name="confirm"
        type="password"
        autoComplete="new-password"
        required
        value={form.confirm}
        onChange={change}
        error={mismatch ? 'Passwords do not match' : ''}
      />

      <SubmitButton loading={saving} disabled={tooShort || mismatch || form.newPassword.length === 0}>
        Update password
      </SubmitButton>
    </form>
  );
}

export default function Profile() {
  const { user, logout } = useAuth();

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold">Your profile</h1>
      <p className="text-sm text-slate-500">Name, avatar, currency and notifications.</p>

      <div className="mt-6 space-y-6">
        <Details />
        <Password />

        <button
          onClick={logout}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 px-4 py-2.5 text-sm hover:bg-slate-100"
        >
          <LogOut className="h-4 w-4 text-slate-400" /> Sign out {user.email}
        </button>
      </div>
    </div>
  );
}
