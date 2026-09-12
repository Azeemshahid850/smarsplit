import { useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { resetPassword } from '../api/auth.js';
import AuthLayout from '../components/AuthLayout.jsx';
import Field from '../components/Field.jsx';
import SubmitButton from '../components/SubmitButton.jsx';
import FormError from '../components/FormError.jsx';

export default function ResetPassword() {
  const { token } = useParams();
  const navigate = useNavigate();

  const [form, setForm] = useState({ password: '', confirm: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const change = (event) => setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  const tooShort = form.password.length > 0 && form.password.length < 8;
  const mismatch = form.confirm.length > 0 && form.confirm !== form.password;

  const submit = async (event) => {
    event.preventDefault();
    if (tooShort || mismatch) return;
    setError('');
    setLoading(true);
    try {
      await resetPassword(token, form.password);
      navigate('/login', { replace: true, state: { notice: 'Password updated. Sign in again.' } });
    } catch (err) {
      setError(err.message || 'Reset link is invalid or expired');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Set a new password"
      subtitle="Your other sessions will be signed out"
      footer={
        <Link to="/login" className="font-medium text-emerald-700 hover:underline">
          Back to sign in
        </Link>
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        <FormError message={error} />
        <Field
          label="New password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          value={form.password}
          onChange={change}
          error={tooShort ? 'At least 8 characters' : ''}
        />
        <Field
          label="Confirm password"
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
          value={form.confirm}
          onChange={change}
          error={mismatch ? 'Passwords do not match' : ''}
        />
        <SubmitButton loading={loading} disabled={tooShort || mismatch}>
          Update password
        </SubmitButton>
      </form>
    </AuthLayout>
  );
}
