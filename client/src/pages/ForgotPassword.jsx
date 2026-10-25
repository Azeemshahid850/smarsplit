import { useState } from 'react';
import { Link } from 'react-router-dom';
import { MailCheck, AlertTriangle } from 'lucide-react';
import { forgotPassword } from '../api/auth.js';
import AuthLayout from '../components/AuthLayout.jsx';
import Field from '../components/Field.jsx';
import SubmitButton from '../components/SubmitButton.jsx';
import FormError from '../components/FormError.jsx';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [mailConfigured, setMailConfigured] = useState(true);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await forgotPassword(email);
      setMailConfigured(res.mailConfigured !== false);
      setSent(true);
    } catch (err) {
      setError(err.message || 'Could not send the reset link');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Reset your password"
      subtitle={sent ? '' : 'We will email you a link to set a new one'}
      footer={
        <Link to="/login" className="font-medium text-emerald-700 hover:underline">
          Back to sign in
        </Link>
      }
    >
      {sent && !mailConfigured ? (
        <div className="flex gap-3 rounded-lg bg-amber-50 p-4 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <p>
            Email sending is not set up on this server yet, so no reset link can be delivered. Ask whoever runs it to
            configure SMTP, or to reset your password for you.
          </p>
        </div>
      ) : sent ? (
        <div className="flex gap-3 rounded-lg bg-emerald-50 p-4 text-sm text-emerald-800">
          <MailCheck className="mt-0.5 h-5 w-5 shrink-0" />
          <p>If that email is registered, a reset link is on its way. It expires in 30 minutes.</p>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4" noValidate>
          <FormError message={error} />
          <Field label="Email" name="email" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
          <SubmitButton loading={loading}>Send reset link</SubmitButton>
        </form>
      )}
    </AuthLayout>
  );
}
