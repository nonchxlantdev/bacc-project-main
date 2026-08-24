import { Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import NewInspectionPicker from '../components/checklist/NewInspectionPicker.jsx';
import StatusPill from '../components/checklist/StatusPill.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { startInspection } from '../lib/startInspection.js';
import { deleteDraft, isDeletableDraft, listMineSubmissions } from '../lib/submissions.js';
import { listTemplates } from '../lib/templates.js';

const TYPE_LABELS = {
  monthly_routine: 'Monthly Routine',
  semi_annual_cec: 'Semi-Annual Structural (CEC)',
  post_storm_emergency: 'Post-Storm Emergency',
};

/** This user's own inspections — drafts they can still finish, and the record. */
export default function MyChecklistsPage() {
  const { user, displayName, profile } = useAuth();
  const navigate = useNavigate();

  const [rows, setRows] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [startingId, setStartingId] = useState(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listTemplates(profile), listMineSubmissions(user?.id)]).then(([tpls, list]) => {
      if (cancelled) return;
      setTemplates(tpls);
      setRows(list);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [profile, user?.id]);

  async function startNew(templateId) {
    setStartingId(templateId);
    try {
      navigate(`/checklists/${await startInspection({ templateId, user, displayName, role: profile?.role })}`);
    } catch (err) {
      setError(err.message || 'Could not start that inspection.');
      setStartingId(null);
      setPickerOpen(false);
    }
  }

  async function handleDelete(row) {
    if (!isDeletableDraft(row)) return;
    const title = row.schema?.title || row.template_code || 'this draft';
    const date = row.inspection_date || row.header?.date || '';
    const confirmed = window.confirm(
      `Delete draft “${title}”${date ? ` (${date})` : ''}? This cannot be undone. Submitted checklists stay on file.`,
    );
    if (!confirmed) return;
    setDeletingId(row.id);
    setError(null);
    try {
      await deleteDraft(row);
      setRows((prev) => prev.filter((item) => item.id !== row.id));
    } catch (err) {
      setError(err.message || 'Could not delete draft.');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-navy sm:text-2xl">My Checklists</h1>
          <p className="text-sm text-muted">
            Draft, submit, and export inspections. Drafts can be deleted; submitted records cannot.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          disabled={templates.length === 0}
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-hover disabled:opacity-50 sm:w-auto"
        >
          <Plus className="h-4 w-4" />
          New Inspection
        </button>
      </header>

      {error && (
        <p className="rounded-md border border-alert bg-alert-soft px-4 py-2 text-sm text-alert">{error}</p>
      )}

      <div className="overflow-hidden rounded-lg border border-navy/10 bg-white shadow-sm">
        <table className="table-stack w-full text-left text-sm">
          <thead className="bg-navy text-white">
            <tr>
              <th className="px-4 py-2 font-semibold">Form</th>
              <th className="px-4 py-2 font-semibold">Date</th>
              <th className="px-4 py-2 font-semibold">Type</th>
              <th className="px-4 py-2 font-semibold">Status</th>
              <th className="px-4 py-2 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted">
                  Loading…
                </td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted">
                  No checklists yet. Use New Inspection to start one.
                </td>
              </tr>
            )}
            {rows.map((row, i) => (
              <tr key={row.id} className={i % 2 === 0 ? 'bg-stripe' : 'bg-white'}>
                <td data-label="Form" className="px-4 py-2">
                  <Link to={`/checklists/${row.id}`} className="font-medium text-primary hover:underline">
                    {row.schema?.annexLabel || row.schema?.annex_label || row.template_code} — {row.schema?.title}
                  </Link>
                </td>
                <td data-label="Date" className="px-4 py-2">
                  {row.inspection_date || row.header?.date}
                </td>
                <td data-label="Type" className="px-4 py-2">
                  {TYPE_LABELS[row.inspection_type || row.header?.inspectionType] ||
                    row.inspection_type ||
                    row.header?.inspectionType}
                </td>
                <td data-label="Status" className="px-4 py-2">
                  <StatusPill status={row.pending_sync ? 'pending_sync' : row.status} />
                </td>
                <td data-label="" className="px-4 py-2 max-md:pb-3 md:text-right">
                  {isDeletableDraft(row) ? (
                    <button
                      type="button"
                      onClick={() => handleDelete(row)}
                      disabled={deletingId === row.id}
                      className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-md border border-alert/40 px-2 py-1 text-sm font-medium text-alert hover:bg-alert-soft disabled:opacity-50 md:min-h-0 md:w-auto md:border-0"
                    >
                      <Trash2 className="h-4 w-4" />
                      {deletingId === row.id ? 'Deleting…' : 'Delete'}
                    </button>
                  ) : (
                    <span className="text-xs text-muted">Locked</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pickerOpen && (
        <NewInspectionPicker
          templates={templates}
          busyKey={startingId}
          onPick={(t) => startNew(t.id)}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  );
}
