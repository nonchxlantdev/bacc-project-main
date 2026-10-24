import { Download, Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import NewInspectionPicker from '../components/checklist/NewInspectionPicker.jsx';
import StatusPill from '../components/checklist/StatusPill.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { startInspection } from '../lib/startInspection.js';
import { deleteDraft, canDeleteDraft, canRecallSubmissions, listMineSubmissions, recallSubmission } from '../lib/submissions.js';
import { listTemplates } from '../lib/templates.js';
import { filterMyChecklists, myChecklistTab, recordDate } from '../lib/checklistCatalogue.js';
import { downloadChecklistPdf } from '../lib/exportPdf.js';
import RecordsNotice from '../components/RecordsNotice.jsx';

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
  const [recordsDown, setRecordsDown] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [deletingId, setDeletingId] = useState(null);
  const [startingId, setStartingId] = useState(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [params, setParams] = useSearchParams();
  const tab = ['drafts', 'awaiting', 'returned', 'completed'].includes(params.get('tab')) ? params.get('tab') : 'drafts';
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [recallingId, setRecallingId] = useState(null);
  const [downloadingId, setDownloadingId] = useState(null);

  function setTab(next) {
    const nextParams = new URLSearchParams(params);
    if (next === 'drafts') nextParams.delete('tab');
    else nextParams.set('tab', next);
    setParams(nextParams, { replace: true });
  }

  const counts = useMemo(() => {
    const tally = { drafts: 0, awaiting: 0, returned: 0, completed: 0 };
    for (const row of rows) tally[myChecklistTab(row)] += 1;
    return tally;
  }, [rows]);
  const visible = useMemo(() => filterMyChecklists(rows, { tab, from, to }), [rows, tab, from, to]);

  useEffect(() => {
    let cancelled = false;
    let recordsFailed = false;
    Promise.all([
      listTemplates(profile),
      listMineSubmissions(user?.id).catch(() => {
        recordsFailed = true;
        return [];
      }),
    ])
      .then(([tpls, list]) => {
        if (cancelled) return;
        setTemplates(tpls ?? []);
        setRows(list);
        setRecordsDown(recordsFailed);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setRecordsDown(true);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [profile, user?.id, reloadKey]);

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
    if (!canDeleteDraft(row, profile, user?.id)) return;
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
          <h1 className="text-xl font-bold text-ink sm:text-2xl">My Checklists</h1>
          <p className="text-sm text-muted">
            Draft, submit, and export inspections. Drafts can be deleted; submitted records cannot.
          </p>
        </div>
        <button
          type="button"
          data-tour="mine-new"
          onClick={() => setPickerOpen(true)}
          disabled={templates.length === 0}
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-hover disabled:opacity-50 sm:w-auto"
        >
          <Plus className="h-4 w-4" />
          New Inspection
        </button>
      </header>

      {recordsDown && <RecordsNotice onRetry={() => setReloadKey((n) => n + 1)} />}

      {error && (
        <p className="rounded-md border border-alert bg-alert-soft px-4 py-2 text-sm text-alert">{error}</p>
      )}

      <div data-tour="mine-tabs" className="flex flex-wrap gap-2">
        {[
          ['drafts', 'Drafts'],
          ['awaiting', 'Awaiting OM'],
          ['returned', 'Returned'],
          ['completed', 'Completed'],
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`inline-flex min-h-11 items-center gap-2 rounded-md px-3 text-sm font-semibold desk:min-h-10 ${
              tab === key ? 'bg-navy text-white' : 'border border-line/20 bg-surface text-ink hover:bg-surface-2'
            }`}
          >
            {label}
            <span className={tab === key ? 'text-white/80' : 'text-muted'}>{counts[key]}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input type="date" aria-label="From date" value={from} onChange={(e) => setFrom(e.target.value)} className="min-h-11 rounded border border-line/20 bg-surface px-3 text-sm text-ink desk:min-h-10" />
        <input type="date" aria-label="To date" value={to} onChange={(e) => setTo(e.target.value)} className="min-h-11 rounded border border-line/20 bg-surface px-3 text-sm text-ink desk:min-h-10" />
      </div>

      <div data-tour="mine-table" className="overflow-x-auto rounded-lg border border-line/12 bg-surface shadow-card">
        <table className="table-stack w-full text-left text-sm">
          <thead className="bg-gradient-to-r from-navy to-navy-mid text-white">
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
            {!loading && visible.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted">
                  Nothing in this tab{from || to ? ' for those dates' : ''}.
                </td>
              </tr>
            )}
            {visible.map((row, i) => (
              <tr key={row.id} className={i % 2 === 0 ? 'bg-stripe' : 'bg-surface'}>
                <td data-label="Form" className="px-4 py-2">
                  <Link to={`/checklists/${row.id}`} className="font-medium text-primary hover:underline">
                    {row.schema?.annexLabel || row.schema?.annex_label || row.template_code} — {row.schema?.title}
                  </Link>
                </td>
                <td data-label="Date" className="px-4 py-2">
                  {recordDate(row)}
                </td>
                <td data-label="Type" className="px-4 py-2">
                  {TYPE_LABELS[row.inspection_type || row.header?.inspectionType] ||
                    row.inspection_type ||
                    row.header?.inspectionType}
                </td>
                <td data-label="Status" className="px-4 py-2">
                  <StatusPill status={row.pending_sync ? 'pending_sync' : row.status} />
                </td>
                <td data-label="" className="px-4 py-2 max-lg:pb-3 lg:text-right">
                  <div className="flex flex-wrap justify-end gap-2">
                    {(tab === 'drafts' || tab === 'returned') && canDeleteDraft(row, profile, user?.id) && (
                      <button
                        type="button"
                        onClick={() => handleDelete(row)}
                        disabled={deletingId === row.id}
                        className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md border border-alert/40 px-2 py-1 text-sm font-medium text-alert hover:bg-alert-soft disabled:opacity-50 desk:min-h-10"
                      >
                        <Trash2 className="h-4 w-4" />
                        {deletingId === row.id ? 'Deleting…' : 'Delete'}
                      </button>
                    )}
                    {tab === 'awaiting' && row.inspector_id === user?.id && canRecallSubmissions() && (
                      <button
                        type="button"
                        onClick={async () => {
                          setRecallingId(row.id);
                          setError(null);
                          try {
                            await recallSubmission(row.id);
                            setRows((prev) => prev.map((item) => (item.id === row.id ? { ...item, status: 'draft', locked: false } : item)));
                          } catch (err) {
                            setError(err.message || 'Could not recall this checklist.');
                          } finally {
                            setRecallingId(null);
                          }
                        }}
                        disabled={recallingId === row.id}
                        className="inline-flex min-h-11 items-center justify-center rounded-md border border-primary/40 px-2 py-1 text-sm font-medium text-primary disabled:opacity-50 desk:min-h-10"
                      >
                        {recallingId === row.id ? 'Recalling…' : 'Recall'}
                      </button>
                    )}
                    {tab === 'completed' && (
                      <button
                        type="button"
                        onClick={async () => {
                          setDownloadingId(row.id);
                          setError(null);
                          try {
                            await downloadChecklistPdf(row);
                          } catch (err) {
                            setError(err.message || 'Could not download that PDF.');
                          } finally {
                            setDownloadingId(null);
                          }
                        }}
                        disabled={downloadingId === row.id}
                        className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md border border-primary/40 px-2 py-1 text-sm font-medium text-primary disabled:opacity-50 desk:min-h-10"
                      >
                        <Download className="h-4 w-4" />
                        {downloadingId === row.id ? 'Downloading…' : 'Download PDF'}
                      </button>
                    )}
                  </div>
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
