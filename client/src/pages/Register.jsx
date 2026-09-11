import { useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import AuthLayout from '../components/AuthLayout.jsx';
import Field from '../components/Field.jsx';
import SubmitButton from '../components/SubmitButton.jsx';
import GoogleButton from '../components/GoogleButton.jsx';
import FormError from '../components/FormError.jsx';

export default function Register() {
  const { register, googleLogin } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const change = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  const passwordTooShort = form.password.length > 0 && form.password.length < 8;

  const submit = async (e) => {
    e.preventDefault();
    if (passwordTooShort) return;
    setError('');
    setLoading(true);
    try {
      await register({ ...form, defaultCurrency: 'PKR' });
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message || 'Could not create the account');
    } finally {
      setLoading(false);
    }
  };

  const onCredential = useCallback(
    async (idToken) => {
      setError('');
      try {
        await googleLogin(idToken);
        navigate('/', { replace: true });
      } catch (err) {
        setError(err.message || 'Google sign-in failed');
      }
    },
    [googleLogin, navigate],
  );

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Track personal spending and split group trips"
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-emerald-700 hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        <FormError message={error} />
        <Field label="Full name" name="name" autoComplete="name" required minLength={2} value={form.name} onChange={change} />
        <Field label="Email" name="email" type="email" autoComplete="email" required value={form.email} onChange={change} />
        <Field
          label="Password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          value={form.password}
          onChange={change}
          hint="At least 8 characters"
          error={passwordTooShort ? 'At least 8 characters' : ''}
        />
        <SubmitButton loading={loading} disabled={passwordTooShort}>
          Create account
        </SubmitButton>
      </form>

      <GoogleButton onCredential={onCredential} onError={setError} />
    </AuthLayout>
  );
}
