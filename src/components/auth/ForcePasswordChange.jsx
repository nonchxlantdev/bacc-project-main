import { useState } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';

/**
 * Shown instead of the whole app after signing in with a temporary password.
 * The server refuses every other route until this succeeds.
 */
export default function ForcePasswordChange() {
  const { changePassword, signOut, displayName } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function submit(event) {
    event.preventDefault();
    setError(null);
    if (next.length < 10) return setError('Use at least 10 characters.');
    if (next !== confirm) return setError("Those two don't match.");
    setBusy(true);
    try {
      await changePassword(next, current);
    } catch (err) {
      setError(err.message || 'Could not change your password.');
    } finally {
      setBusy(false);
    }
  }

  const input =
    'min-h-11 w-full rounded border border-line/20 bg-surface px-3 text-sm text-ink focus:border-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary desk:min-h-10';

  return (
    <div className="flex min-h-dvh items-center justify-center bg-stripe px-4 py-10">
      <form onSubmit={submit} className="w-full max-w-sm space-y-3 rounded-lg border border-line/12 bg-surface p-6 shadow-card">
        <h1 className="text-lg font-bold text-ink">Choose your password</h1>
        <p className="text-sm text-muted">
          Welcome, {displayName}. You signed in with a temporary password. Set your own before continuing.
        </p>
        <input type="password" autoComplete="current-password" placeholder="Temporary password" value={current} onChange={(e) => setCurrent(e.target.value)} className={input} required />
        <input type="password" autoComplete="new-password" placeholder="New password (10+ characters)" value={next} onChange={(e) => setNext(e.target.value)} className={input} required />
        <input type="password" autoComplete="new-password" placeholder="Confirm new password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={input} required />
        {error && <p className="text-sm text-alert">{error}</p>}
        <button type="submit" disabled={busy} className="min-h-11 w-full rounded-md bg-navy px-3 text-sm font-semibold text-white disabled:opacity-50 desk:min-h-10">
          {busy ? 'Saving…' : 'Set password and continue'}
        </button>
        <button type="button" onClick={() => signOut()} className="min-h-11 w-full rounded-md border border-line/20 px-3 text-sm font-medium text-muted desk:min-h-10">
          Sign out
        </button>
      </form>
    </div>
  );
}
