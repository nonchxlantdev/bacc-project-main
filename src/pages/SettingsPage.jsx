import { useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';

export default function SettingsPage() {
  const { displayName, position, updateProfile, configured } = useAuth();
  const [fullName, setFullName] = useState(displayName);
  const [job, setJob] = useState(position);
  const [saved, setSaved] = useState(false);

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
    </div>
  );
}
