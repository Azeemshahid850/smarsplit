import { useState, useCallback } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import AuthLayout from '../components/AuthLayout.jsx';
import Field from '../components/Field.jsx';
import SubmitButton from '../components/SubmitButton.jsx';
import GoogleButton from '../components/GoogleButton.jsx';
import FormError from '../components/FormError.jsx';

export default function Login() {
  const { login, googleLogin } = useAuth();
  const navigate = useNavigate();
  const { state } = useLocation();
  const target = state?.from || '/';

  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const notice = state?.notice;
  const [loading, setLoading] = useState(false);

  const change = (event) => setForm((current) => ({ ...current, [event.target.name]: event.target.value }));

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(form);
      navigate(target, { replace: true });
    } catch (err) {
      setError(err.message || 'Could not sign in');
    } finally {
      setLoading(false);
    }
  };

  const onCredential = useCallback(
    async (idToken) => {
      setError('');
      try {
        await googleLogin(idToken);
        navigate(target, { replace: true });
      } catch (err) {
        setError(err.message || 'Google sign-in failed');
      }
    },
    [googleLogin, navigate, target],
  );

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to your SmartSplit account"
      footer={
        <>
          New here?{' '}
          <Link to="/register" state={state} className="font-medium text-emerald-700 hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        <FormError message={error} />
        {notice && !error && (
          <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>
        )}
        <Field label="Email" name="email" type="email" autoComplete="email" required value={form.email} onChange={change} />
        <Field
          label="Password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={form.password}
          onChange={change}
        />
        <div className="text-right">
          <Link to="/forgot-password" className="text-xs text-slate-500 hover:text-slate-800 hover:underline">
            Forgot password?
          </Link>
        </div>
        <SubmitButton loading={loading}>Sign in</SubmitButton>
      </form>

      <GoogleButton onCredential={onCredential} onError={setError} />
    </AuthLayout>
  );
}
