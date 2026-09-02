import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useAirportClock } from '../hooks/useAirportClock.js';
import { baccLogoUrl, pgiaLogoUrl } from '../lib/brandAssets.js';

export default function LoginPage() {
  const { user, loading, signIn, error, configured, demoUsers } = useAuth();
  const [email, setEmail] = useState(demoUsers[0]?.email || '');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState(null);
  const clock = useAirportClock();

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
        <VisualPanel clock={clock} />

        <div className="flex items-center justify-center bg-surface px-6 py-10 pb-[max(2.5rem,env(safe-area-inset-bottom))] sm:px-10 lg:px-12">
          <div className="w-full max-w-[26rem]">
            <div className="mb-7 flex items-center justify-between gap-3">
              <img src={baccLogoUrl} alt="BACC" className="h-9 w-auto object-contain" />
              <span className="flex shrink-0 items-center rounded-lg bg-navy p-1.5">
                <img src={pgiaLogoUrl} alt="PGIA" className="h-6 w-auto object-contain" />
              </span>
            </div>

            <h1 className="text-2xl font-bold text-ink">Sign in</h1>
            <p className="mt-1 text-sm text-muted">BACC operations portal — PMM and VAES checklist demo</p>

            {!configured && (
              <p className="mt-4 rounded-lg border border-line/10 bg-surface-2 px-3.5 py-2.5 text-xs leading-relaxed text-muted">
                Demo mode. Pick any account below to sign in as that person. Everyone can open every checklist;
                what differs is whose name goes on it. The password is not checked — real sign-in arrives with
                Supabase.
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
                  type="email"
                  required={configured}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-line/20 bg-surface px-3 py-2 text-ink"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">Password</span>
                <input
                  type="password"
                  required={configured}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-line/20 bg-surface px-3 py-2 text-ink"
                />
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
 * The left half of the sign-in screen on `lg` and up — an "Ops Board":
 * a quiet instrument-panel readout rather than a runway photo, reusing the
 * same navy gradient and teal/amber "beacon glow" language the rest of the
 * portal already uses for status (see Sidebar's active-item marker and the
 * dashboard's stat tiles). Collapses to a slim brand strip below `lg` —
 * this is a work tool people sign into one-handed on the apron, so the
 * form has to be reachable without scrolling past decoration first.
 */
function VisualPanel({ clock }) {
  return (
    <>
      <div className="login-visual-bg relative hidden flex-col justify-between overflow-hidden px-10 py-9 text-white lg:flex">
        <div className="flex items-start justify-between gap-4">
          <div>
            <img src={pgiaLogoUrl} alt="Philip S.W. Goldson International Airport" className="h-auto w-[160px] max-w-full" />
            <p className="mt-2 text-[12px] font-semibold text-white/85">BACC Airport Portal</p>
            <p className="mt-0.5 text-[11px] text-white/50">Philip S.W. Goldson International Airport</p>
          </div>
          <div className="shrink-0 text-right font-mono text-[11px] leading-relaxed text-white/65">
            <div>
              <span
                aria-hidden
                className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-teal align-middle shadow-glow-teal"
              />
              <span className="align-middle font-medium text-white">Online</span>
            </div>
            <div className="tabular-nums">{clock.time}</div>
            <div>{clock.date} · America/Belize</div>
          </div>
        </div>

        <div className="my-8 flex-1">
          <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.14em] text-teal">PGIA · Annex D compliance</p>
          <h1 className="max-w-[16ch] text-[clamp(1.7rem,2.6vw+1rem,2.6rem)] font-semibold leading-[1.1] text-white">
            Airfield compliance, verified daily.
          </h1>

          <div className="mt-7 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-white/10 bg-white/10">
            <InstrumentTile label="Runway 07/25" value="Active" led="teal" />
            <InstrumentTile label="System status" value="Online" led="teal" />
            <InstrumentTile label="Checklists on file" value="131" />
            <InstrumentTile label="Open incidents" value="4" led="amber" />
            <InstrumentTile label="Coordinates" value="17.5391°N 88.3082°W" />
            <InstrumentTile label="Timezone" value="America/Belize" />
          </div>
        </div>

        <div className="flex items-center gap-7 border-t border-white/10 pt-4 font-mono text-[11px] text-white/55">
          <div>
            <strong className="block font-sans text-[15px] font-semibold text-white">BACC</strong>
            <span className="mt-0.5 block">Belize Airport Concession Co.</span>
          </div>
          <div>
            <strong className="block font-sans text-[15px] font-semibold text-white">24/7</strong>
            <span className="mt-0.5 block">Ops coverage</span>
          </div>
        </div>
      </div>

      {/* Below `lg`: a compact brand strip instead of the full board, so the
          form is reachable without scrolling past decoration on a phone. */}
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

function InstrumentTile({ label, value, led }) {
  return (
    <div className="bg-navy-deep/55 px-3.5 py-2.5 font-mono">
      <div className="text-[10px] uppercase tracking-wide text-white/45">{label}</div>
      <div className="mt-1 flex items-center gap-1.5 text-[14.5px] text-[#eef3fa]">
        {led && (
          <span
            aria-hidden
            className={`h-1.5 w-1.5 shrink-0 rounded-full motion-safe:animate-[beacon-pulse_3.6s_ease-in-out_infinite] ${
              led === 'amber' ? 'bg-caution shadow-glow-caution' : 'bg-teal shadow-glow-teal'
            }`}
          />
        )}
        <span className="truncate">{value}</span>
      </div>
    </div>
  );
}
