import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useReports } from '../hooks/useRepos.js';
import { StatTile } from '../components/reports/StatTile.jsx';
import { HorizontalBarChart } from '../components/reports/Charts.jsx';
import ChartCard, { SimpleTable } from '../components/reports/ChartCard.jsx';
import StatusPill from '../components/checklist/StatusPill.jsx';
import { getRepos } from '../data/repositories/index.js';
import { getDeficiencyLevel } from '../config/deficiencyLevels.js';
import { ASSIGNED_UNITS } from '../config/incidentLookups.js';
import { incidentStatusLabel } from '../lib/incidentLifecycle.js';
import { fmtDate } from '../lib/airportFormat.js';

const RECENT_LIMIT = 6;

/** Anything not yet signed off is still someone's problem. */
const OPEN_INCIDENT_STATUSES = new Set(['open', 'assigned', 'in_progress', 'resolved']);

const unitLabel = (value) => ASSIGNED_UNITS.find((u) => u.value === value)?.label ?? '';

export default function DashboardPage() {
  const { displayName } = useAuth();
  const reports = useReports();
  const [kpis, setKpis] = useState(null);
  const [dept, setDept] = useState([]);
  const [activity, setActivity] = useState([]);
  const [clock, setClock] = useState(null);
  const [completed, setCompleted] = useState([]);
  const [pending, setPending] = useState([]);

  useEffect(() => {
    reports.kpis().then(setKpis);
    reports.departmentOverview().then(setDept);
    reports.activityFeed({ limit: 8 }).then(setActivity);
    getRepos().instances.getClock().then(setClock);
  }, [reports]);

  useEffect(() => {
    let cancelled = false;
    const repos = getRepos();
    Promise.all([repos.checklists.listAll(), repos.incidents.list()]).then(([rows, incidents]) => {
      if (cancelled) return;
      setCompleted(
        rows
          .filter((row) => row.status === 'submitted' || row.status === 'acknowledged')
          .sort((a, b) => byDateDesc(inspectionDate(a), inspectionDate(b)))
          .slice(0, RECENT_LIMIT),
      );
      setPending(
        incidents
          .filter((row) => OPEN_INCIDENT_STATUSES.has(row.status))
          .sort((a, b) => byDateDesc(a.reported_at, b.reported_at))
          .slice(0, RECENT_LIMIT),
      );
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const delta = (key) => (kpis ? kpis[key] - kpis.prior[key] : null);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-navy sm:text-2xl">Dashboard</h1>
        <p className="text-sm text-muted">
          Welcome back, {displayName}
          {clock ? ` · airport date ${clock.demoNow.slice(0, 10)} (America/Belize)` : ''}.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile
          label="Incidents"
          value={kpis?.incidentsOpen ?? '—'}
          delta={delta('incidentsOpen')}
          href="/incidents"
        />
        <StatTile
          label="Checklists"
          value={kpis?.checklistsDue ?? '—'}
          delta={delta('checklistsDue')}
          href="/checklists/mine"
        />
        <StatTile
          label="Approvals"
          value={kpis?.approvalsPending ?? '—'}
          delta={delta('approvalsPending')}
          href="/approvals"
        />
      </div>

      {/* The two questions someone opens this page to answer: what has been
          filed lately, and what is still outstanding. */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Checklists completed" href="/checklists/all" linkLabel="All checklists">
          {completed.length === 0 ? (
            <Empty>No checklists have been submitted yet.</Empty>
          ) : (
            completed.map((row) => (
              <RowLink key={row.id} to={`/checklists/${row.id}`}>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-navy">
                    {row.schema?.annexLabel || row.schema?.annex_label || row.template_code}
                    {row.schema?.title ? ` — ${row.schema.title}` : ''}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted">
                    {fmtDate(inspectionDate(row))}
                    {row.inspector_name ? ` · ${row.inspector_name}` : ''}
                  </span>
                </span>
                <StatusPill status={row.status} />
              </RowLink>
            ))
          )}
        </Panel>

        <Panel title="Incidents pending" href="/incidents" linkLabel="All incidents">
          {pending.length === 0 ? (
            <Empty>Nothing outstanding — every incident is closed.</Empty>
          ) : (
            pending.map((row) => {
              const level = getDeficiencyLevel(row.deficiency_level);
              return (
                <RowLink key={row.id} to={`/incidents/${row.id}`}>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-navy">
                      {row.incident_ref} — {row.source_item_code || row.category || 'Incident'}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-muted">
                      {incidentStatusLabel(row.status)}
                      {level ? ` · ${level.label}` : ''}
                      {row.assigned_unit ? ` · ${unitLabel(row.assigned_unit)}` : ' · Unassigned'}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-muted">{fmtDate(row.target_date)}</span>
                </RowLink>
              );
            })
          )}
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* A bar chart of nothing is a zero-height frame under a heading, which
            reads as a broken card rather than an empty one. On a portal with
            nothing filed yet — which is how every new environment starts — say
            so instead. */}
        <ChartCard
          title="Department overview"
          subtitle="Inspection submissions by department"
          table={
            dept.length === 0 ? (
              <ChartEmpty />
            ) : (
              <SimpleTable
                columns={[
                  { key: 'label', label: 'Department' },
                  { key: 'count', label: 'Submissions' },
                ]}
                rows={dept}
              />
            )
          }
        >
          {dept.length === 0 ? <ChartEmpty /> : <HorizontalBarChart items={dept} />}
        </ChartCard>

        <Panel title="Recent activity">
          {activity.length === 0 && <Empty>Nothing has happened yet.</Empty>}
          {activity.map((row) => (
            // The whole entry is the target, not just the link text — a 16px
            // line of text is not a tappable thing on a phone.
            <RowLink key={row.id} to={row.href || '/dashboard'}>
              <span className="min-w-0 flex-1">
                <span className="block font-medium text-primary">{row.summary}</span>
                <span className="mt-0.5 block text-xs text-muted">
                  {row.actor_name} · {String(row.at).slice(0, 16).replace('T', ' ')}
                </span>
              </span>
            </RowLink>
          ))}
        </Panel>
      </div>
    </div>
  );
}

function inspectionDate(row) {
  return row.inspection_date || row.header?.date || row.submitted_at;
}

function byDateDesc(a, b) {
  return String(b ?? '').localeCompare(String(a ?? ''));
}

function Panel({ title, href, linkLabel, children }) {
  return (
    <section className="rounded-lg border border-navy/10 bg-white p-4 shadow-sm">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-navy">{title}</h2>
        {href && (
          <Link
            to={href}
            className="-mr-2 inline-flex min-h-11 items-center gap-0.5 rounded-md px-2 text-sm font-medium text-primary hover:bg-stripe lg:mr-0 lg:min-h-0 lg:px-0 lg:hover:bg-transparent lg:hover:underline"
          >
            {linkLabel}
            <ChevronRight className="h-4 w-4" aria-hidden />
          </Link>
        )}
      </div>
      <ul className="text-sm">{children}</ul>
    </section>
  );
}

function RowLink({ to, children }) {
  return (
    <li className="border-b border-navy/5 last:border-0">
      <Link
        to={to}
        className="-mx-2 flex items-center gap-3 rounded-md px-2 py-2.5 hover:bg-stripe"
      >
        {children}
      </Link>
    </li>
  );
}

function Empty({ children }) {
  return <li className="py-6 text-center text-sm text-muted">{children}</li>;
}

/** Same message in both the chart and the table view of the card. */
function ChartEmpty() {
  return (
    <p className="py-6 text-center text-sm text-muted">No inspections have been submitted yet.</p>
  );
}
