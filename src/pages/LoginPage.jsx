import { useEffect, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { baccLogoUrl, pgiaLogoUrl } from '../lib/brandAssets.js';

export default function LoginPage() {
  const { user, loading, signIn, error, configured, demoUsers } = useAuth();
  const [email, setEmail] = useState(demoUsers[0]?.email || '');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState(null);

  useEffect(() => {
    if (!email && demoUsers[0]?.email) setEmail(demoUsers[0].email);
  }, [demoUsers, email]);

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
    <div className="fixed inset-0 overflow-y-auto overscroll-y-contain bg-navy">
      <div className="min-h-full lg:grid lg:grid-cols-[1.05fr_1fr]">
        <VisualPanel />

        <div className="flex items-center justify-center bg-surface px-6 py-10 pb-[max(2.5rem,env(safe-area-inset-bottom))] sm:px-10 lg:px-12">
          <div className="w-full max-w-[26rem]">
            <div className="mb-7 flex items-center justify-between gap-3">
              <img src={baccLogoUrl} alt="BACC" className="h-9 w-auto object-contain" />
              <span className="flex shrink-0 items-center rounded-lg bg-navy p-1.5">
                <img src={pgiaLogoUrl} alt="PGIA" className="h-6 w-auto object-contain" />
              </span>
            </div>

            <h1 className="text-2xl font-bold text-ink">Sign in</h1>
            <p className="mt-1 text-sm text-muted">BACC operations portal — PMM and VAES checklists</p>

            {!configured && (
              <p className="mt-4 rounded-lg border border-line/10 bg-surface-2 px-3.5 py-2.5 text-xs leading-relaxed text-muted">
                Local mode. Pick an account below to sign in as that person. Everyone can open every checklist;
                what differs is whose name goes on it. The password is not checked — real sign-in arrives with
                Supabase.
              </p>
            )}

            {configured && (
              <p className="mt-4 rounded-lg border border-line/10 bg-surface-2 px-3.5 py-2.5 text-xs leading-relaxed text-muted">
                Sign in with your provisioned email and password. Data you save is shared with the team —
                treat it as a staging workspace, not production compliance records.
              </p>
            )}

            {!configured && demoUsers.length > 0 && (
              <div className="mt-4 grid max-h-64 gap-2 overflow-y-auto overscroll-contain pr-1">
                {demoUsers.map((row) => {
                  const active = email === row.email;
                  return (
                    <button
                      key={row.id}
                      type="button"
                      onClick={() => setEmail(row.email)}
                      className={`flex min-h-11 items-center gap-3 rounded-lg border px-3 py-2 text-left ${
                        active ? 'border-primary bg-primary/5' : 'border-line/15 hover:border-primary'
                      }`}
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-teal text-[11px] font-bold text-navy">
                        {initialsOf(row.full_name)}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-ink">{row.full_name}</span>
                        <span className="mt-0.5 block truncate text-xs text-muted">
                          {row.position} · {row.department}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            <form className="mt-6 space-y-4" onSubmit={onSubmit}>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">Email</span>
                <input
                  type="text"
                  inputMode="email"
                  autoComplete="username"
                  required={configured}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-line/20 bg-surface px-3 py-2 text-ink"
                />
              </label>
              <label className="relative block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">Password</span>
                <input
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required={configured}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-line/20 bg-surface py-2 pl-3 pr-11 text-ink"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute bottom-0 right-0 flex h-[42px] w-11 items-center justify-center rounded-r-lg text-muted hover:text-ink"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </label>
              {(localError || error) && <p className="text-sm text-alert">{localError || error}</p>}
              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-lg bg-primary px-4 py-2.5 font-semibold text-white shadow-[0_1px_2px_rgba(11,30,61,.12),0_10px_20px_-10px_rgba(30,95,168,.55)] hover:bg-primary-hover disabled:opacity-60"
              >
                {submitting ? 'Signing in…' : 'Sign in'}
              </button>
            </form>

            <p className="mt-6 text-center text-[11px] text-muted">© Belize Airport Concession Company Limited</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function initialsOf(fullName) {
  return String(fullName || '')
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

/**
 * Calm brand panel on `lg` and up — logos and airport name only, no live
 * telemetry or animation. Below `lg`, a slim strip keeps the form reachable
 * without scrolling past decoration on a phone.
 */
function VisualPanel() {
  return (
    <>
      <div className="login-visual-bg relative hidden flex-col justify-between overflow-hidden px-10 py-9 text-white lg:flex">
        <div>
          <img src={pgiaLogoUrl} alt="Philip S.W. Goldson International Airport" className="h-auto w-[160px] max-w-full" />
          <p className="mt-3 text-[12px] font-semibold text-white/85">BACC Airport Portal</p>
          <p className="mt-0.5 text-[11px] text-white/50">Philip S.W. Goldson International Airport</p>
        </div>

        <p className="max-w-[22ch] text-sm leading-relaxed text-white/70">
          Daily airfield compliance checklists and incident tracking for PGIA.
        </p>

        <div className="border-t border-white/10 pt-4 text-[11px] text-white/55">
          <strong className="block font-sans text-[15px] font-semibold text-white">BACC</strong>
          <span className="mt-0.5 block">Belize Airport Concession Co.</span>
        </div>
      </div>

      <div className="flex items-center gap-3 bg-navy px-6 py-5 text-white lg:hidden">
        <img src={pgiaLogoUrl} alt="Philip S.W. Goldson International Airport" className="h-8 w-auto shrink-0" />
        <div className="min-w-0">
          <p className="truncate text-[12px] font-semibold text-white/85">BACC Airport Portal</p>
          <p className="truncate text-[11px] text-white/50">Philip S.W. Goldson International Airport</p>
        </div>
      </div>
    </>
  );
}
