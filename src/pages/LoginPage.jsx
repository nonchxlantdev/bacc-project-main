import { useEffect, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import {
  baccLogoPngUrl,
  baccLogoUrl,
  loginBgJpgUrl,
  loginBgSmWebpUrl,
  loginBgWebpUrl,
  pgiaLogoPngUrl,
  pgiaLogoUrl,
} from '../lib/brandAssets.js';

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
    <div className="login-screen fixed inset-0 overflow-y-auto overscroll-y-contain">
      <picture className="pointer-events-none absolute inset-0 -z-10">
        <source media="(max-width: 640px)" type="image/webp" srcSet={loginBgSmWebpUrl} />
        <source type="image/webp" srcSet={loginBgWebpUrl} />
        <img
          src={loginBgJpgUrl}
          alt=""
          className="h-full w-full object-cover object-center"
          decoding="async"
          fetchPriority="high"
        />
      </picture>
      <div className="login-screen-scrim pointer-events-none absolute inset-0 -z-10" aria-hidden />

      <div className="relative flex min-h-full flex-col lg:block">
        <BrandPanel />

        <div className="flex flex-1 items-center justify-center px-4 py-8 pb-[max(2rem,env(safe-area-inset-bottom))] sm:px-6 lg:absolute lg:inset-0 lg:px-12">
          <div className="login-glass w-full max-w-[26rem] rounded-2xl border border-white/55 px-6 py-7 shadow-[0_20px_50px_-20px_rgba(11,30,61,0.55)] sm:px-8 sm:py-8">
            <div className="mb-7 flex items-center justify-between gap-3">
              <picture>
                <source type="image/webp" srcSet={baccLogoUrl} />
                <img src={baccLogoPngUrl} alt="BACC" className="h-10 w-auto object-contain" />
              </picture>
              <span className="flex shrink-0 items-center rounded-lg bg-navy p-1.5">
                <picture>
                  <source type="image/webp" srcSet={pgiaLogoUrl} />
                  <img src={pgiaLogoPngUrl} alt="PGIA" className="h-6 w-auto object-contain" />
                </picture>
              </span>
            </div>

            <h1 className="text-2xl font-bold text-ink">Sign in</h1>
            <p className="mt-1 text-sm text-muted">BACC operations portal — PMM and VAES checklists</p>

            {!configured && (
              <p className="mt-4 rounded-lg border border-line/10 bg-white/55 px-3.5 py-2.5 text-xs leading-relaxed text-muted backdrop-blur-sm">
                Local mode. Pick an account below to sign in as that person. Everyone can open every checklist;
                what differs is whose name goes on it. The password is not checked — real sign-in arrives with
                Supabase.
              </p>
            )}

            {configured && (
              <p className="mt-4 rounded-lg border border-line/10 bg-white/55 px-3.5 py-2.5 text-xs leading-relaxed text-muted backdrop-blur-sm">
                Sign in with your assigned email and password to access the BACC operations portal.
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
                      className={`flex min-h-11 items-center gap-3 rounded-lg border px-3 py-2 text-left backdrop-blur-sm ${
                        active
                          ? 'border-primary bg-primary/10'
                          : 'border-line/15 bg-white/50 hover:border-primary'
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
                  className="w-full rounded-lg border border-line/20 bg-white/90 px-3 py-2.5 text-ink shadow-sm"
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
                  className="w-full rounded-lg border border-line/20 bg-white/90 py-2.5 pl-3 pr-11 text-ink shadow-sm"
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

function BrandPanel() {
  return (
    <>
      {/* Phone / tablet strip — keeps brand visible without crowding the form */}
      <div className="flex items-center gap-3 px-5 py-4 text-white lg:hidden">
        <picture>
          <source type="image/webp" srcSet={pgiaLogoUrl} />
          <img
            src={pgiaLogoPngUrl}
            alt="Philip S.W. Goldson International Airport"
            className="h-8 w-auto shrink-0 drop-shadow"
          />
        </picture>
        <div className="min-w-0">
          <p className="truncate text-[12px] font-semibold text-white/90">BACC Airport Portal</p>
          <p className="truncate text-[11px] text-white/65">Philip S.W. Goldson International Airport</p>
        </div>
      </div>

      {/* Desktop left brand column over the photo’s navy wedge */}
      <aside className="pointer-events-none absolute inset-y-0 left-0 z-10 hidden w-[min(28rem,38%)] flex-col justify-between px-10 py-9 text-white lg:flex">
        <div>
          <picture>
            <source type="image/webp" srcSet={pgiaLogoUrl} />
            <img
              src={pgiaLogoPngUrl}
              alt="Philip S.W. Goldson International Airport"
              className="h-auto w-[168px] max-w-full drop-shadow"
            />
          </picture>
          <p className="mt-3 text-[13px] font-semibold tracking-wide text-white/90">BACC Airport Portal</p>
          <p className="mt-0.5 text-[12px] text-white/55">Philip S.W. Goldson International Airport</p>
        </div>

        <div className="max-w-[18rem]">
          <div className="mb-3 h-0.5 w-10 rounded-full bg-primary" />
          <p className="text-[1.35rem] font-bold leading-tight tracking-wide text-white">
            SAFER SKIES
            <br />
            STRONGER BELIZE
          </p>
          <p className="mt-3 text-sm leading-relaxed text-white/70">
            Daily airfield compliance checklists and incident tracking for PGIA.
          </p>
        </div>

        <div className="flex items-end justify-between gap-4 border-t border-white/15 pt-5">
          <div>
            <strong className="block font-sans text-[15px] font-semibold text-white">BACC</strong>
            <span className="mt-0.5 block text-[11px] text-white/55">Belize Airport Concession Co.</span>
          </div>
          <div className="text-right">
            <p className="font-serif text-[1.65rem] italic leading-none text-[#7eb8e8]">Belize</p>
            <p className="mt-1 max-w-[11rem] text-[8px] font-semibold uppercase tracking-[0.14em] text-white/55">
              Connecting people places possibilities
            </p>
          </div>
        </div>
      </aside>
    </>
  );
}
