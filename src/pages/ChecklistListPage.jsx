import { ClipboardCheck, Plus, Search, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import StatusPill from '../components/checklist/StatusPill.jsx';
import NewInspectionPicker from '../components/checklist/NewInspectionPicker.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import {
  listMineSubmissions,
  persistSubmission,
  buildDraftRecord,
  deleteDraft,
  isDeletableDraft,
} from '../lib/submissions.js';
import { getTemplate, listTemplates } from '../lib/templates.js';
import { emptyHeaderState, emptyItemState } from '../lib/checklistSchema.js';
import { airportYmd } from '../lib/belizeTime.js';
import { getRepos } from '../data/repositories/index.js';
import { FAMILY_LABELS, FREQUENCY_LABELS } from '../data/templates/registry.js';

const TYPE_LABELS = {
  monthly_routine: 'Monthly Routine',
  semi_annual_cec: 'Semi-Annual Structural (CEC)',
  post_storm_emergency: 'Post-Storm Emergency',
};

export default function ChecklistListPage({ scope = 'mine' }) {
  const { user, displayName, position, profile } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState(null);
  const [error, setError] = useState(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [startingId, setStartingId] = useState(null);

  // Catalogue filters (scope === 'all')
  const [query, setQuery] = useState('');
  const [family, setFamily] = useState('');
  const [department, setDepartment] = useState('');

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
  }, [scope, profile, user?.id]);

  async function startNew(templateId) {
    setStartingId(templateId);
    try {
      const template = await getTemplate(templateId);
      const clock = await getRepos().instances.getClock();
      const header = emptyHeaderState(template.schema, {
        date: airportYmd(clock.nowMs),
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
    const ok = window.confirm(
      `Delete draft “${title}”${date ? ` (${date})` : ''}? This cannot be undone. Submitted checklists stay on file.`,
    );
    if (!ok) return;
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

  const departments = useMemo(
    () => [...new Set(templates.map((t) => t.department).filter(Boolean))].sort(),
    [templates],
  );

  const catalogue = useMemo(() => {
    const q = query.trim().toLowerCase();
    return templates.filter((t) => {
      if (family && t.document_family !== family) return false;
      if (department && t.department !== department) return false;
      if (!q) return true;
      return [t.code, t.title, t.annex_label, t.department, t.manual]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [templates, query, family, department]);

  const lastCompleted = useMemo(() => {
    const map = new Map();
    for (const row of rows) {
      if (row.status === 'draft') continue;
      const key = row.template_code;
      const date = row.inspection_date || row.header?.date;
      if (!date) continue;
      if (!map.has(key) || date > map.get(key)) map.set(key, date);
    }
    return map;
  }, [rows]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-navy sm:text-2xl">
            {scope === 'all' ? 'All Checklists' : 'My Checklists'}
          </h1>
          <p className="text-sm text-muted">
            {scope === 'all'
              ? 'Every approved form you are permitted to open, across both manuals.'
              : 'Draft, submit, and export inspections. Drafts can be deleted; submitted records cannot.'}
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
      </div>

      {error && <p className="rounded-md border border-alert bg-alert-soft px-4 py-2 text-sm text-alert">{error}</p>}

      {scope === 'all' ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full min-w-0 sm:min-w-[16rem] sm:flex-1">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search forms…"
                className="min-h-11 w-full rounded border border-navy/20 pl-9 pr-3 text-sm sm:min-h-10"
              />
            </div>
            <select
              value={family}
              onChange={(e) => setFamily(e.target.value)}
              className="min-h-11 min-w-0 flex-1 rounded border border-navy/20 px-2 text-sm sm:min-h-10 sm:flex-none"
            >
              <option value="">All manuals</option>
              {Object.entries(FAMILY_LABELS).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
            <select
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              className="min-h-11 min-w-0 flex-1 rounded border border-navy/20 px-2 text-sm sm:min-h-10 sm:flex-none"
            >
              <option value="">All departments</option>
              {departments.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>

          <div className="overflow-hidden rounded-lg border border-navy/10 bg-white shadow-sm">
            <table className="table-stack w-full text-left text-sm">
              <thead className="bg-navy text-white">
                <tr>
                  <th className="px-4 py-2 font-semibold">Form</th>
                  <th className="px-4 py-2 font-semibold">Number</th>
                  <th className="px-4 py-2 font-semibold">Department</th>
                  <th className="px-4 py-2 font-semibold">Frequency</th>
                  <th className="px-4 py-2 font-semibold">Last completed</th>
                  <th className="px-4 py-2 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-muted">
                      Loading…
                    </td>
                  </tr>
                )}
                {!loading && catalogue.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-muted">
                      No forms match those filters.
                    </td>
                  </tr>
                )}
                {catalogue.map((t, i) => (
                  <tr key={t.id} className={i % 2 === 0 ? 'bg-stripe' : 'bg-white'}>
                    <td data-label="Form" className="px-4 py-2">
                      <span className="flex items-center gap-2 font-medium text-navy">
                        <ClipboardCheck size={15} className="text-primary" aria-hidden />
                        {t.annex_label ? `${t.annex_label} — ` : ''}
                        {t.title}
                      </span>
                    </td>
                    <td data-label="Number" className="px-4 py-2 text-muted">{t.code}</td>
                    <td data-label="Department" className="px-4 py-2 text-muted">{t.department || '—'}</td>
                    <td data-label="Frequency" className="px-4 py-2 text-muted">
                      {FREQUENCY_LABELS[t.default_frequency] ?? t.default_frequency ?? '—'}
                    </td>
                    <td data-label="Last done" className="px-4 py-2 text-muted">{lastCompleted.get(t.code) ?? 'Never'}</td>
                    <td data-label="" className="px-4 py-2 max-md:pb-3 md:text-right">
                      <button
                        type="button"
                        onClick={() => startNew(t.id)}
                        disabled={startingId === t.id}
                        className="min-h-11 w-full rounded-md border border-primary/40 px-2 py-1 text-sm font-medium text-primary hover:bg-stripe disabled:opacity-50 md:min-h-0 md:w-auto md:border-0"
                      >
                        {startingId === t.id ? 'Opening…' : 'Start'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
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
                  <td data-label="Date" className="px-4 py-2">{row.inspection_date || row.header?.date}</td>
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
      )}

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
