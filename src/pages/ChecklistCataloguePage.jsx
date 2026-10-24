import { ChevronLeft, ClipboardCheck, Download, Search, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import NewInspectionPicker from '../components/checklist/NewInspectionPicker.jsx';
import TeamCard, { NewInspectionCard } from '../components/checklist/TeamCard.jsx';
import { StatTile } from '../components/reports/StatTile.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { getRepos } from '../data/repositories/index.js';
import { FAMILY_LABELS, FREQUENCY_LABELS } from '../data/templates/templateMeta.js';
import {
  buildTeamSummaries,
  catalogueKpis,
  filterFiledRecords,
  filterTemplates,
  lastCompletedByCode,
  omSignedDate,
  recordDate,
  teamStyle,
} from '../lib/checklistCatalogue.js';
import { can } from '../config/access.js';
import { downloadChecklistPdf } from '../lib/exportPdf.js';
import StatusPill from '../components/checklist/StatusPill.jsx';
import { startInspection } from '../lib/startInspection.js';
import { listAllSubmissions } from '../lib/submissions.js';
import { listTemplates } from '../lib/templates.js';
import Select from '../components/ui/Select.jsx';
import RecordsNotice from '../components/RecordsNotice.jsx';

/**
 * The approved-form catalogue, filed the way BACC file it: one folder per
 * owning team, opened to reveal that team's forms.
 *
 * Thirty forms in one flat table is a wall of text nobody reads. A team picks
 * their square, sees their handful of forms, and starts one. Search is the
 * escape hatch — typing skips the folders entirely and matches forms directly,
 * because someone searching already knows what they want.
 */
export default function ChecklistCataloguePage() {
  const { user, displayName, profile } = useAuth();
  const navigate = useNavigate();

  const [templates, setTemplates] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [instances, setInstances] = useState([]);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [recordsDown, setRecordsDown] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [startingId, setStartingId] = useState(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const [query, setQuery] = useState('');
  const [family, setFamily] = useState('');
  const [frequency, setFrequency] = useState('');
  const [team, setTeam] = useState(null);
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'records' ? 'records' : 'forms';
  const seeAllRecords = can(profile, 'seeAllRecords');
  const [recordQuery, setRecordQuery] = useState('');
  const [recordForm, setRecordForm] = useState('');
  const [recordTeam, setRecordTeam] = useState('');
  const [recordStatus, setRecordStatus] = useState('');
  const [recordFrom, setRecordFrom] = useState('');
  const [recordTo, setRecordTo] = useState('');
  const [recordInspector, setRecordInspector] = useState('');
  const [downloadingId, setDownloadingId] = useState(null);

  function setTab(next) {
    const nextParams = new URLSearchParams(params);
    if (next === 'forms') nextParams.delete('tab');
    else nextParams.set('tab', 'records');
    setParams(nextParams, { replace: true });
  }

  useEffect(() => {
    let cancelled = false;
    let recordsFailed = false;
    const markRecords = () => {
      recordsFailed = true;
      return [];
    };
    Promise.all([
      listTemplates(profile),
      listAllSubmissions().catch(markRecords),
      getRepos().instances.list().catch(markRecords),
      getRepos().instances.getClock().catch(() => ({ nowMs: Date.now() })),
    ])
      .then(([tpls, filed, rows, clock]) => {
        if (cancelled) return;
        setTemplates(tpls ?? []);
        setSubmissions(filed);
        setInstances(rows);
        setNowMs(clock.nowMs);
        setRecordsDown(recordsFailed);
        setError(null);
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
  }, [profile, reloadKey]);

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

  // Manual and cadence narrow both views; the team is a drill-down, not a
  // filter, so it is applied only once a folder is open.
  const scoped = useMemo(
    () => filterTemplates(templates, { family, frequency }),
    [templates, family, frequency],
  );

  const teams = useMemo(
    () => buildTeamSummaries({ templates: scoped, submissions, instances, nowMs }),
    [scoped, submissions, instances, nowMs],
  );

  const kpis = useMemo(
    () => catalogueKpis({ templates, submissions, instances, nowMs }),
    [templates, submissions, instances, nowMs],
  );

  const lastByCode = useMemo(
    () => lastCompletedByCode(submissions, instances, templates),
    [submissions, instances, templates],
  );

  const searching = query.trim().length > 0;
  const showForms = searching || team !== null;

  const forms = useMemo(
    () => filterTemplates(scoped, { query, group: searching ? '' : team ?? '' }),
    [scoped, query, team, searching],
  );

  // Only offer a cadence that some visible form actually uses — an empty
  // "Quarterly" option that returns nothing is worse than no option.
  const frequencies = useMemo(() => {
    const present = new Set(templates.map((t) => t.default_frequency).filter(Boolean));
    return Object.keys(FREQUENCY_LABELS).filter((f) => present.has(f));
  }, [templates]);

  const familyOptions = useMemo(
    () => [
      { value: '', label: 'All manuals' },
      ...Object.entries(FAMILY_LABELS).map(([key, label]) => ({ value: key, label })),
    ],
    [],
  );

  const frequencyOptions = useMemo(
    () => [
      { value: '', label: 'Any frequency' },
      ...frequencies.map((f) => ({ value: f, label: FREQUENCY_LABELS[f] })),
    ],
    [frequencies],
  );

  const filtered = Boolean(query || family || frequency);

  function clearFilters() {
    setQuery('');
    setFamily('');
    setFrequency('');
  }

  return (
    <div className="space-y-5">
      {/* No header action here on purpose — starting an inspection belongs with
          the forms themselves: the Create New Inspection tile on the team grid,
          or the Start button on each row once a team is open. */}
      <header>
        <h1 className="text-xl font-bold text-ink sm:text-2xl">All Checklists</h1>
        <p className="text-sm text-muted">
          Every approved form you are permitted to open, grouped the way BACC files them.
        </p>
      </header>

      <div data-tour="all-tabs" className="flex flex-wrap gap-2">
        <TabButton active={tab === 'forms'} onClick={() => setTab('forms')}>Forms</TabButton>
        <TabButton active={tab === 'records'} onClick={() => setTab('records')}>Filed records</TabButton>
      </div>

      {recordsDown && <RecordsNotice onRetry={() => setReloadKey((n) => n + 1)} />}

      {error && (
        <p className="rounded-md border border-alert bg-alert-soft px-4 py-2 text-sm text-alert">{error}</p>
      )}

      {tab === 'records' ? (
        <FiledRecords
          submissions={submissions}
          templates={templates}
          seeAll={seeAllRecords}
          userId={user?.id}
          query={recordQuery}
          setQuery={setRecordQuery}
          form={recordForm}
          setForm={setRecordForm}
          team={recordTeam}
          setTeam={setRecordTeam}
          status={recordStatus}
          setStatus={setRecordStatus}
          from={recordFrom}
          setFrom={setRecordFrom}
          to={recordTo}
          setTo={setRecordTo}
          inspector={recordInspector}
          setInspector={setRecordInspector}
          downloadingId={downloadingId}
          onDownload={async (row) => {
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
        />
      ) : null}

      {tab === 'forms' && <>
      <div data-tour="all-kpis" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Total Checklist Forms" value={kpis.total} />
        <StatTile label="Completed This Month" value={kpis.completedThisMonth} />
        {/* Overdue is recoverable, missed is a compliance gap — the note keeps
            them distinct without spending a fifth tile on it. */}
        <StatTile
          label="Overdue"
          value={kpis.overdue}
          note={kpis.missed ? `${kpis.missed} also missed` : null}
          tone={kpis.overdue > 0 ? 'alert' : 'ok'}
        />
        <StatTile
          label="Due Soon"
          value={kpis.dueSoon}
          note="Next 7 days"
          tone={kpis.dueSoon > 0 ? 'caution' : 'ok'}
        />
      </div>

      <div data-tour="all-filters" className="flex flex-wrap items-center gap-2">
        <div className="relative w-full min-w-0 sm:min-w-[16rem] sm:flex-1">
          <Search
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
            aria-hidden
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search forms, manuals or departments…"
            className="min-h-11 w-full rounded border border-line/20 bg-surface pl-9 pr-3 text-sm text-ink desk:min-h-10"
          />
        </div>
        <Select
          label="Filter by manual"
          value={family}
          onChange={setFamily}
          options={familyOptions}
          className="min-w-0 flex-1 sm:w-56 sm:flex-none"
        />
        <Select
          label="Filter by frequency"
          value={frequency}
          onChange={setFrequency}
          options={frequencyOptions}
          className="min-w-0 flex-1 sm:w-48 sm:flex-none"
        />
        {filtered && (
          <button
            type="button"
            onClick={clearFilters}
            className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded border border-line/20 px-3 text-sm font-medium text-ink hover:bg-surface-2 desk:min-h-10"
          >
            <X className="h-4 w-4" />
            Clear filters
          </button>
        )}
      </div>

      {loading ? (
        <p className="rounded-lg border border-line/12 bg-surface px-4 py-10 text-center text-muted shadow-card">
          Loading…
        </p>
      ) : showForms ? (
        <FormList
          forms={forms}
          team={searching ? null : team}
          heading={searching ? `${forms.length} matching ${forms.length === 1 ? 'form' : 'forms'}` : team}
          lastByCode={lastByCode}
          startingId={startingId}
          onBack={() => setTeam(null)}
          onStart={startNew}
        />
      ) : (
        <div data-tour="all-teams" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {teams.map((entry) => (
            <TeamCard key={entry.name} team={entry} onOpen={setTeam} />
          ))}
          <NewInspectionCard onClick={() => setPickerOpen(true)} disabled={templates.length === 0} />
        </div>
      )}
      </>}

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

function TabButton({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex min-h-11 items-center rounded-md px-3 text-sm font-semibold desk:min-h-10 ${
        active ? 'bg-navy text-white' : 'border border-line/20 bg-surface text-ink hover:bg-surface-2'
      }`}
    >
      {children}
    </button>
  );
}

function FiledRecords({
  submissions,
  templates,
  seeAll,
  userId,
  query,
  setQuery,
  form,
  setForm,
  team,
  setTeam,
  status,
  setStatus,
  from,
  setFrom,
  to,
  setTo,
  inspector,
  setInspector,
  downloadingId,
  onDownload,
}) {
  const rows = useMemo(
    () => filterFiledRecords(submissions, {
      userId, seeAll, status, query, form, team, inspector, from, to, templates,
    }),
    [submissions, userId, seeAll, status, query, form, team, inspector, from, to, templates],
  );
  const formOptions = useMemo(
    () => [{ value: '', label: 'All forms' }, ...templates.map((t) => ({ value: t.id, label: t.annex_label ? `${t.annex_label} — ${t.title}` : t.title }))],
    [templates],
  );
  const teamOptions = useMemo(() => {
    const names = [...new Set(templates.map((t) => t.group).filter(Boolean))].sort();
    return [{ value: '', label: 'All teams' }, ...names.map((name) => ({ value: name, label: name }))];
  }, [templates]);
  const inspectorOptions = useMemo(() => {
    const people = new Map();
    for (const row of submissions) {
      if (row.inspector_id) people.set(row.inspector_id, row.inspector_name || row.inspector_id);
    }
    return [{ value: '', label: 'All inspectors' }, ...[...people].map(([value, label]) => ({ value, label }))];
  }, [submissions]);
  const statusOptions = [
    { value: '', label: 'All filed' },
    { value: 'submitted', label: 'Awaiting OM' },
    { value: 'acknowledged', label: 'Completed' },
    ...(seeAll ? [{ value: 'returned', label: 'Returned' }] : []),
  ];

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search filed records…"
          className="min-h-11 w-full rounded border border-line/20 bg-surface px-3 text-sm text-ink sm:w-64 desk:min-h-10"
        />
        <Select label="Form" value={form} onChange={setForm} options={formOptions} className="min-w-0 flex-1 sm:w-56 sm:flex-none" />
        <Select label="Team" value={team} onChange={setTeam} options={teamOptions} className="min-w-0 flex-1 sm:w-48 sm:flex-none" />
        <Select label="Status" value={status} onChange={setStatus} options={statusOptions} className="min-w-0 flex-1 sm:w-44 sm:flex-none" />
        {seeAll && (
          <Select label="Inspector" value={inspector} onChange={setInspector} options={inspectorOptions} className="min-w-0 flex-1 sm:w-48 sm:flex-none" />
        )}
        <input type="date" aria-label="From date" value={from} onChange={(e) => setFrom(e.target.value)} className="min-h-11 rounded border border-line/20 bg-surface px-3 text-sm text-ink desk:min-h-10" />
        <input type="date" aria-label="To date" value={to} onChange={(e) => setTo(e.target.value)} className="min-h-11 rounded border border-line/20 bg-surface px-3 text-sm text-ink desk:min-h-10" />
      </div>
      <div className="overflow-x-auto rounded-lg border border-line/12 bg-surface shadow-card">
        <table className="table-stack w-full text-left text-sm">
          <thead className="bg-gradient-to-r from-navy to-navy-mid text-white">
            <tr>
              <th className="px-4 py-2 font-semibold">Form</th>
              <th className="px-4 py-2 font-semibold">Date</th>
              <th className="px-4 py-2 font-semibold">Inspector</th>
              <th className="px-4 py-2 font-semibold">Team</th>
              <th className="px-4 py-2 font-semibold">Status</th>
              <th className="px-4 py-2 font-semibold">OM signed</th>
              <th className="px-4 py-2 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted">No filed records match those filters.</td>
              </tr>
            )}
            {rows.map((row, i) => {
              const tpl = templates.find((t) => t.id === row.template_id || t.code === row.template_code);
              const label = `${tpl?.annex_label ? `${tpl.annex_label} — ` : ''}${tpl?.title || row.template_code || 'Checklist'}`;
              const returned = row.status === 'draft' && row.returned;
              return (
                <tr key={row.id} className={i % 2 === 0 ? 'bg-stripe' : 'bg-surface'}>
                  <td data-label="Form" className="px-4 py-2">
                    <Link to={`/checklists/${row.id}`} className="font-medium text-primary hover:underline">{label}</Link>
                  </td>
                  <td data-label="Date" className="px-4 py-2">{recordDate(row) || '—'}</td>
                  <td data-label="Inspector" className="px-4 py-2">{row.inspector_name || '—'}</td>
                  <td data-label="Team" className="px-4 py-2">{tpl?.group || '—'}</td>
                  <td data-label="Status" className="px-4 py-2">
                    {returned ? <span className="text-sm font-medium text-ink">Returned</span> : <StatusPill status={row.status} />}
                  </td>
                  <td data-label="OM signed" className="px-4 py-2">{omSignedDate(row) || '—'}</td>
                  <td data-label="" className="px-4 py-2 max-lg:pb-3 lg:text-right">
                    {row.status === 'acknowledged' ? (
                      <button
                        type="button"
                        onClick={() => onDownload(row)}
                        disabled={downloadingId === row.id}
                        className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-md border border-primary/40 px-2 py-1 text-sm font-medium text-primary hover:bg-surface-2 disabled:opacity-50 desk:min-h-0 desk:w-auto desk:border-0"
                      >
                        <Download className="h-4 w-4" />
                        {downloadingId === row.id ? 'Downloading…' : 'Download PDF'}
                      </button>
                    ) : (
                      <span className="text-xs text-muted">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** One team's forms, or the matches for a search. */
function FormList({ forms, team, heading, lastByCode, startingId, onBack, onStart }) {
  const { Icon, tile } = teamStyle(team);
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-3">
        {team && (
          <button
            type="button"
            onClick={onBack}
            className="inline-flex min-h-11 items-center gap-1 rounded border border-line/20 px-2.5 text-sm font-medium text-ink hover:bg-surface-2 desk:min-h-9"
          >
            <ChevronLeft className="h-4 w-4" />
            All teams
          </button>
        )}
        {team && (
          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${tile}`}>
            <Icon className="h-4.5 w-4.5" aria-hidden />
          </span>
        )}
        <h2 className="min-w-0 truncate text-base font-bold text-ink sm:text-lg">{heading}</h2>
        {team && (
          <span className="shrink-0 text-sm text-muted">
            {forms.length} {forms.length === 1 ? 'form' : 'forms'}
          </span>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border border-line/12 bg-surface shadow-card">
        <table className="table-stack w-full text-left text-sm">
          <thead className="bg-gradient-to-r from-navy to-navy-mid text-white">
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
            {forms.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted">
                  No forms match those filters.
                </td>
              </tr>
            )}
            {forms.map((t, i) => (
              <tr key={t.id} className={i % 2 === 0 ? 'bg-stripe' : 'bg-surface'}>
                <td data-label="Form" className="px-4 py-2">
                  <span className="flex items-center gap-2 font-medium text-ink">
                    <ClipboardCheck size={15} className="shrink-0 text-primary" aria-hidden />
                    {t.annex_label ? `${t.annex_label} — ` : ''}
                    {t.title}
                  </span>
                </td>
                <td data-label="Number" className="px-4 py-2 text-muted">
                  {t.code}
                </td>
                <td data-label="Department" className="px-4 py-2 text-muted">
                  {t.department || '—'}
                </td>
                <td data-label="Frequency" className="px-4 py-2 text-muted">
                  {FREQUENCY_LABELS[t.default_frequency] ?? t.default_frequency ?? '—'}
                </td>
                <td data-label="Last done" className="px-4 py-2 text-muted">
                  {lastByCode.get(t.code) ?? 'Never'}
                </td>
                <td data-label="" className="px-4 py-2 max-lg:pb-3 lg:text-right">
                  <button
                    type="button"
                    onClick={() => onStart(t.id)}
                    disabled={startingId === t.id}
                    className="min-h-11 w-full rounded-md border border-primary/40 px-2 py-1 text-sm font-medium text-primary hover:bg-surface-2 disabled:opacity-50 desk:min-h-0 desk:w-auto desk:border-0"
                  >
                    {startingId === t.id ? 'Opening…' : 'Start'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
