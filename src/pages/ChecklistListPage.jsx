import { Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import StatusPill from '../components/checklist/StatusPill.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { listMineSubmissions, persistSubmission, buildDraftRecord } from '../lib/submissions.js';
import { getTemplate, listTemplates } from '../lib/templates.js';
import { emptyHeaderState, emptyItemState } from '../lib/checklistSchema.js';

export default function ChecklistListPage({ scope = 'mine' }) {
  const { user, displayName, position } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listTemplates(), listMineSubmissions()]).then(
      ([tpls, list]) => {
        if (cancelled) return;
        setTemplates(tpls);
        setRows(list);
        setLoading(false);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [scope]);

  async function startNew(templateId) {
    const template = await getTemplate(templateId);
    const header = emptyHeaderState(template.schema, {
      date: new Date().toISOString().slice(0, 10),
      inspectionType: 'monthly_routine',
      conductedBy: `${displayName} / ${position}`,
    });
    const record = buildDraftRecord({
      template,
      user,
      header,
      items: emptyItemState(template.schema),
      deficiencies_summary: '',
    });
    await persistSubmission(record);
    navigate(`/checklists/${record.id}`);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-navy">{scope === 'all' ? 'All Checklists' : 'My Checklists'}</h1>
          <p className="text-sm text-muted">
            {scope === 'all'
              ? 'Phase 1 RLS limits this list to your own submissions. Broader visibility comes with roles later.'
              : 'Draft, submit, and export drainage inspections.'}
          </p>
        </div>
        {templates[0] && (
          <button
            type="button"
            onClick={() => startNew(templates[0].id)}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-hover"
          >
            <Plus className="h-4 w-4" />
            New {templates[0].annex_label} inspection
          </button>
        )}
      </div>
      <div className="overflow-hidden rounded-lg border border-navy/10 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-navy text-white">
            <tr>
              <th className="px-4 py-2 font-semibold">Form</th>
              <th className="px-4 py-2 font-semibold">Date</th>
              <th className="px-4 py-2 font-semibold">Type</th>
              <th className="px-4 py-2 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-muted">
                  Loading…
                </td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-muted">
                  No checklists yet.
                </td>
              </tr>
            )}
            {rows.map((row, i) => (
              <tr key={row.id} className={i % 2 === 0 ? 'bg-stripe' : 'bg-white'}>
                <td className="px-4 py-2">
                  <Link to={`/checklists/${row.id}`} className="font-medium text-primary hover:underline">
                    {row.schema?.annexLabel || row.schema?.annex_label || row.template_code} — {row.schema?.title}
                  </Link>
                </td>
                <td className="px-4 py-2">{row.inspection_date || row.header?.date}</td>
                <td className="px-4 py-2">{row.inspection_type || row.header?.inspectionType}</td>
                <td className="px-4 py-2">
                  <StatusPill status={row.pending_sync ? 'pending_sync' : row.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
