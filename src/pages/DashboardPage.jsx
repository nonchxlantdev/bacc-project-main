import { ClipboardCheck, CloudOff, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import StatusPill from '../components/checklist/StatusPill.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { listMineSubmissions } from '../lib/submissions.js';
import { listTemplates } from '../lib/templates.js';

export default function DashboardPage() {
  const { displayName } = useAuth();
  const [templates, setTemplates] = useState([]);
  const [rows, setRows] = useState([]);

  useEffect(() => {
    listTemplates().then(setTemplates);
    listMineSubmissions().then(setRows);
  }, []);

  const drafts = rows.filter((r) => r.status === 'draft').length;
  const submitted = rows.filter((r) => r.status === 'submitted').length;
  const pending = rows.filter((r) => r.pending_sync).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-navy">Dashboard</h1>
        <p className="text-sm text-muted">Welcome back, {displayName}.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Drafts" value={drafts} />
        <Stat label="Submitted" value={submitted} />
        <Stat label="Pending sync" value={pending} />
      </div>
      <section className="rounded-lg border border-navy/10 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold text-navy">Start an inspection</h2>
          <Link to="/checklists/mine" className="text-sm font-medium text-primary hover:underline">
            View mine
          </Link>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {templates.map((tpl) => (
            <Link
              key={tpl.id}
              to={`/checklists/new?template=${encodeURIComponent(tpl.id)}`}
              className="flex items-start gap-3 rounded-md border border-navy/10 p-4 hover:border-primary"
            >
              <ClipboardCheck className="mt-0.5 h-5 w-5 text-teal" />
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">{tpl.annex_label}</p>
                <p className="font-semibold text-navy">{tpl.title}</p>
                <p className="text-xs text-muted">{tpl.code}</p>
              </div>
              <Plus className="ml-auto h-4 w-4 text-primary" />
            </Link>
          ))}
        </div>
      </section>
      {pending > 0 && (
        <p className="flex items-center gap-2 text-sm text-muted">
          <CloudOff className="h-4 w-4" />
          {pending} submission{pending === 1 ? '' : 's'} will sync when you are back online.
        </p>
      )}
      {rows.slice(0, 5).length > 0 && (
        <section className="rounded-lg border border-navy/10 bg-white shadow-sm">
          <h2 className="border-b border-navy/10 px-5 py-3 font-semibold text-navy">Recent</h2>
          <ul>
            {rows.slice(0, 5).map((row) => (
              <li key={row.id} className="flex items-center justify-between border-b border-navy/5 px-5 py-3 last:border-0">
                <Link to={`/checklists/${row.id}`} className="font-medium text-primary hover:underline">
                  {row.schema?.title || row.template_code} — {row.inspection_date}
                </Link>
                <StatusPill status={row.pending_sync ? 'pending_sync' : row.status} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="rounded-lg border border-navy/10 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 text-2xl font-bold text-navy">{value}</p>
    </div>
  );
}
