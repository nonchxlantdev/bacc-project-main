import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { getRepos } from '../data/repositories/index.js';

export default function SettingsPage() {
  const { displayName, position, updateProfile, configured } = useAuth();
  const [fullName, setFullName] = useState(displayName);
  const [job, setJob] = useState(position);
  const [saved, setSaved] = useState(false);
  const [clock, setClock] = useState(null);

  useEffect(() => {
    getRepos().instances.getClock().then(setClock);
  }, []);

  async function onSubmit(event) {
    event.preventDefault();
    await updateProfile({ full_name: fullName, position: job });
    setSaved(true);
  }

  return (
    <div className="max-w-lg space-y-4">
      <h1 className="text-2xl font-bold text-navy">Settings</h1>
      <p className="text-sm text-muted">
        Name and position are copied onto the inspector sign-off when you submit a checklist.
        {!configured && ' Local demo mode stores this only in this browser session.'}
      </p>
      <form onSubmit={onSubmit} className="space-y-4 rounded-lg border border-navy/10 bg-white p-5 shadow-sm">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">Full name</span>
          <input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="w-full rounded border border-navy/20 px-3 py-2"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">Position</span>
          <input
            value={job}
            onChange={(e) => setJob(e.target.value)}
            className="w-full rounded border border-navy/20 px-3 py-2"
          />
        </label>
        <button type="submit" className="rounded-md bg-primary px-4 py-2 font-semibold text-white hover:bg-primary-hover">
          Save
        </button>
        {saved && <p className="text-sm text-success">Saved.</p>}
      </form>

      {import.meta.env.DEV && (
        <section className="space-y-3 rounded-lg border border-dashed border-navy/30 bg-white p-5">
          <h2 className="text-sm font-semibold text-navy">Demo clock (dev)</h2>
          <p className="text-xs text-muted">
            Due and overdue use America/Belize, not this device&apos;s timezone. Current airport now:{' '}
            {clock?.demoNow}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-md border px-3 py-1.5 text-sm"
              onClick={async () => setClock(await getRepos().instances.advanceClock(1))}
            >
              Advance 1 day
            </button>
            <button
              type="button"
              className="rounded-md border px-3 py-1.5 text-sm"
              onClick={async () => setClock(await getRepos().instances.advanceClock(7))}
            >
              Advance 7 days
            </button>
            <button
              type="button"
              className="rounded-md border px-3 py-1.5 text-sm"
              onClick={async () => {
                const result = await getRepos().instances.generate();
                setClock(await getRepos().instances.getClock());
                window.alert(`Generated ${result.created} new instance(s). Total ${result.total}.`);
              }}
            >
              Generate instances
            </button>
            <button
              type="button"
              className="rounded-md border border-alert px-3 py-1.5 text-sm text-alert"
              onClick={async () => {
                await getRepos().instances.resetDemo();
                window.location.reload();
              }}
            >
              Reset demo data
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
