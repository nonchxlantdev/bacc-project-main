import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { baccLogoUrl, pgiaLogoUrl } from '../lib/brandAssets.js';

export default function LoginPage() {
  const { user, loading, signIn, error, configured } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState(null);

  if (!loading && user) {
    return <Navigate to="/dashboard" replace />;
  }

  async function onSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setLocalError(null);
    try {
      await signIn(email, password);
    } catch (err) {
      setLocalError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-navy p-6">
      <div className="w-full max-w-md rounded-lg bg-white p-8 shadow-xl">
        <div className="mb-6 flex items-center justify-between">
          <img src={baccLogoUrl} alt="BACC" className="h-10 w-auto object-contain" />
          <img src={pgiaLogoUrl} alt="PGIA" className="h-10 w-auto rounded bg-navy object-contain p-1" />
        </div>
        <h1 className="text-xl font-bold text-navy">Sign in</h1>
        <p className="mt-1 text-sm text-muted">BACC operations portal — PGIA inspections</p>
        {!configured && (
          <p className="mt-3 rounded bg-stripe px-3 py-2 text-xs text-muted">
            Supabase is not configured. Use any email and password to enter local demo mode.
          </p>
        )}
        <form className="mt-6 space-y-4" onSubmit={onSubmit}>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">Email</span>
            <input
              type="email"
              required={configured}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded border border-navy/20 px-3 py-2"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">Password</span>
            <input
              type="password"
              required={configured}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded border border-navy/20 px-3 py-2"
            />
          </label>
          {(localError || error) && <p className="text-sm text-alert">{localError || error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-md bg-primary px-4 py-2.5 font-semibold text-white hover:bg-primary-hover disabled:opacity-60"
          >
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
