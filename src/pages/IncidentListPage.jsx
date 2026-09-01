import { Download, Plus, Search, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useOutletContext } from 'react-router-dom';
import { getDeficiencyLevel } from '../config/deficiencyLevels.js';
import { ASSIGNED_UNITS } from '../config/incidentLookups.js';
import { GROUP_ORDER } from '../data/templates/registry.js';
import { INCIDENT_STATUSES, incidentStatusLabel } from '../lib/incidentLifecycle.js';
import { listIncidents } from '../lib/incidents.js';
import { teamStyle } from '../lib/checklistCatalogue.js';
import { fmtDate } from '../lib/airportFormat.js';
import Select from '../components/ui/Select.jsx';
import SortableTh, { useSort } from '../components/ui/SortableTh.jsx';

const UNGROUPED = 'Other';

// Status sorts along the workflow, not alphabetically — "Assigned" coming
// before "In Progress" is meaningful; coming before "Open" is not.
const STATUS_ORDER = INCIDENT_STATUSES.map((s) => s.value);

/** '' for an unassigned incident, so it both searches and sorts as empty. */
const unitLabel = (value) => ASSIGNED_UNITS.find((u) => u.value === value)?.label ?? '';

/**
 * Every incident traces back to a NO SAT on an approved form, and that form
 * belongs to a team — so the list is filterable by the same team vocabulary as
 * the checklist catalogue. "Whose is this?" is the first question asked about
 * an open deficiency, and it should not require opening the record.
 */
export default function IncidentListPage() {
  const navigate = useNavigate();
  const { online } = useOutletContext() ?? { online: navigator.onLine };
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [query, setQuery] = useState('');
  const [team, setTeam] = useState('');
  const [status, setStatus] = useState('');

  useEffect(() => {
    listIncidents().then((list) => {
      setRows(list);
      setLoading(false);
    });
  }, []);

  const teams = useMemo(() => {
    const present = new Set(rows.map((row) => row.source_group).filter(Boolean));
    const known = GROUP_ORDER.filter((g) => present.has(g));
    return rows.some((row) => !row.source_group) ? [...known, UNGROUPED] : known;
  }, [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (team && (row.source_group || UNGROUPED) !== team) return false;
      if (status && row.status !== status) return false;
      if (!q) return true;
      return [
        row.incident_ref,
        row.noc_no,
        row.title,
        row.source_item_code,
        row.source_template_code,
        row.source_group,
        row.department,
        unitLabel(row.assigned_unit),
        row.location_label,
      ]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [rows, query, team, status]);

  // What each column sorts on, and how. Level is the number, not the label,
  // so Level 10 would file after Level 2 rather than before it.
  const SORT_COLUMNS = useMemo(
    () => ({
      ref: { get: (r) => r.incident_ref, kind: 'text' },
      team: { get: (r) => r.source_group ?? '', kind: 'text' },
      title: { get: (r) => r.title, kind: 'text' },
      unit: { get: (r) => unitLabel(r.assigned_unit), kind: 'text' },
      level: { get: (r) => r.deficiency_level, kind: 'number' },
      status: { get: (r) => STATUS_ORDER.indexOf(r.status), kind: 'number' },
      target: { get: (r) => r.target_date, kind: 'date' },
    }),
    [],
  );

  const { sorted, sort, toggle } = useSort(filtered, SORT_COLUMNS, { key: 'ref', dir: 'asc' });

  async function exportRegister() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const last = new Date(y, now.getMonth() + 1, 0).getDate();
    const from = `${y}-${m}-01`;
    const to = `${y}-${m}-${String(last).padStart(2, '0')}`;
    setExporting(true);
    try {
      const res = await fetch('/api/export-noc-register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ incidents: rows, from, to }),
      });
      if (!res.ok) throw new Error('Register export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `PGIA-PMM-F07-NOC-${from}_to_${to}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink sm:text-2xl">Incidents</h1>
          <p className="text-sm text-muted">
            Each incident is one NOC register row (Annex G), raised from a NO SAT item and owned by
            the team whose form it came from.
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          <button
            type="button"
            disabled={!online || exporting}
            onClick={exportRegister}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-line/20 bg-surface px-4 py-2 text-sm font-medium text-ink disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            {exporting ? 'Exporting…' : 'Export NOC register'}
          </button>
          <button
            type="button"
            onClick={() => navigate('/checklists/mine')}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-hover"
          >
            <Plus className="h-4 w-4" />
            From a NO SAT item
          </button>
        </div>
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
            placeholder="Search by reference, item, team or person…"
            className="min-h-11 w-full rounded border border-line/20 bg-surface pl-9 pr-3 text-sm text-ink lg:min-h-10"
          />
        </div>
        <Select
          label="Filter by owning team"
          value={team}
          onChange={setTeam}
          className="min-w-0 flex-1 sm:w-56 sm:flex-none"
          options={[
            { value: '', label: 'All teams', hint: `${rows.length} incidents` },
            ...teams.map((g) => ({
              value: g,
              label: g,
              Icon: teamStyle(g).Icon,
              hint: `${rows.filter((r) => (r.source_group || UNGROUPED) === g).length} incidents`,
            })),
          ]}
        />
        <Select
          label="Filter by status"
          value={status}
          onChange={setStatus}
          className="min-w-0 flex-1 sm:w-48 sm:flex-none"
          options={[
            { value: '', label: 'Any status' },
            ...INCIDENT_STATUSES.map((s) => ({
              value: s.value,
              label: s.label,
              hint: `${rows.filter((r) => r.status === s.value).length}`,
            })),
          ]}
        />
        {(query || team || status) && (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              setTeam('');
              setStatus('');
            }}
            className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded border border-line/20 px-3 text-sm font-medium text-ink hover:bg-surface-2 lg:min-h-10"
          >
            <X className="h-4 w-4" />
            Clear filters
          </button>
        )}
      </div>

      <div className="overflow-hidden rounded-lg border border-line/10 bg-surface shadow-card">
        <table className="table-stack w-full text-left text-sm">
          <thead className="bg-gradient-to-r from-navy to-navy-mid text-white">
            <tr>
              <SortableTh label="Incident ID" sortKey="ref" sort={sort} onToggle={toggle} hint="A–Z" />
              <SortableTh label="Team" sortKey="team" sort={sort} onToggle={toggle} hint="A–Z" />
              <SortableTh label="Title" sortKey="title" sort={sort} onToggle={toggle} hint="A–Z" />
              <SortableTh label="Unit" sortKey="unit" sort={sort} onToggle={toggle} hint="A–Z" />
              <SortableTh label="Level" sortKey="level" sort={sort} onToggle={toggle} hint="1 first" />
              <SortableTh label="Status" sortKey="status" sort={sort} onToggle={toggle} hint="workflow order" />
              <SortableTh label="Target" sortKey="target" sort={sort} onToggle={toggle} hint="earliest first" />
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted">
                  Loading…
                </td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted">
                  No incidents yet. Create one from a NO SAT checklist item.
                </td>
              </tr>
            )}
            {!loading && rows.length > 0 && filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted">
                  No incidents match those filters.
                </td>
              </tr>
            )}
            {sorted.map((row, i) => {
              const level = getDeficiencyLevel(row.deficiency_level);
              return (
                <tr key={row.id} className={i % 2 === 0 ? 'bg-stripe' : 'bg-surface'}>
                  <td data-label="Incident ID" className="px-4 py-2">
                    <Link to={`/incidents/${row.id}`} className="font-medium text-primary hover:underline">
                      {row.incident_ref}
                    </Link>
                    <span className="mt-0.5 block text-xs text-muted">NOC {row.noc_no}</span>
                  </td>
                  <td data-label="Team" className="px-4 py-2">
                    <TeamChip name={row.source_group} code={row.source_template_code} />
                  </td>
                  <td data-label="Title" className="px-4 py-2 font-medium text-ink">
                    {row.title}
                  </td>
                  <td data-label="Unit" className="px-4 py-2 text-muted">
                    {unitLabel(row.assigned_unit) || <span className="text-alert">Unassigned</span>}
                    {row.department && <span className="mt-0.5 block text-xs">{row.department}</span>}
                  </td>
                  <td data-label="Level" className="px-4 py-2">
                    <span
                      className="inline-block w-fit whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold text-white"
                      style={{ background: level?.color }}
                    >
                      {level?.label}
                    </span>
                  </td>
                  <td data-label="Status" className="px-4 py-2 text-muted">
                    {incidentStatusLabel(row.status)}
                  </td>
                  <td data-label="Target" className="px-4 py-2 text-muted">
                    {row.target_date ? fmtDate(row.target_date) : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** The owning team, styled to match its card in the checklist catalogue. */
export function TeamChip({ name, code }) {
  if (!name) return <span className="text-xs text-muted">{code || '—'}</span>;
  const { Icon, tile } = teamStyle(name);
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded ${tile}`}>
        <Icon className="h-3.5 w-3.5" aria-hidden />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-xs font-semibold text-ink">{name}</span>
        {code && <span className="block truncate text-[11px] text-muted">{code}</span>}
      </span>
    </span>
  );
}
