import { ChevronLeft, ClipboardCheck, Search, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import NewInspectionPicker from '../components/checklist/NewInspectionPicker.jsx';
import TeamCard, { NewInspectionCard } from '../components/checklist/TeamCard.jsx';
import { StatTile } from '../components/reports/StatTile.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { getRepos } from '../data/repositories/index.js';
import { FAMILY_LABELS, FREQUENCY_LABELS } from '../data/templates/registry.js';
import {
  buildTeamSummaries,
  catalogueKpis,
  filterTemplates,
  lastCompletedByCode,
  teamStyle,
} from '../lib/checklistCatalogue.js';
import { startInspection } from '../lib/startInspection.js';
import { listAllSubmissions } from '../lib/submissions.js';
import { listTemplates } from '../lib/templates.js';
import Select from '../components/ui/Select.jsx';

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
  const [startingId, setStartingId] = useState(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const [query, setQuery] = useState('');
  const [family, setFamily] = useState('');
  const [frequency, setFrequency] = useState('');
  const [team, setTeam] = useState(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      listTemplates(profile),
      listAllSubmissions(),
      getRepos().instances.list(),
      getRepos().instances.getClock(),
    ]).then(([tpls, filed, rows, clock]) => {
      if (cancelled) return;
      setTemplates(tpls);
      setSubmissions(filed);
      setInstances(rows);
      setNowMs(clock.nowMs);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [profile]);

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

      {error && (
        <p className="rounded-md border border-alert bg-alert-soft px-4 py-2 text-sm text-alert">{error}</p>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
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

      <div className="flex flex-wrap items-center gap-2">
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
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {teams.map((entry) => (
            <TeamCard key={entry.name} team={entry} onOpen={setTeam} />
          ))}
          <NewInspectionCard onClick={() => setPickerOpen(true)} disabled={templates.length === 0} />
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
