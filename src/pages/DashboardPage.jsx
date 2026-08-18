import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardCheck, Plus } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useReports, useTemplates } from '../hooks/useRepos.js';
import { StatTile } from '../components/reports/StatTile.jsx';
import { HorizontalBarChart } from '../components/reports/Charts.jsx';
import ChartCard, { SimpleTable } from '../components/reports/ChartCard.jsx';
import { getRepos } from '../data/repositories/index.js';

export default function DashboardPage() {
  const { displayName, profile } = useAuth();
  const { rows: templates } = useTemplates(profile);
  const reports = useReports();
  const [kpis, setKpis] = useState(null);
  const [dept, setDept] = useState([]);
  const [activity, setActivity] = useState([]);
  const [clock, setClock] = useState(null);

  useEffect(() => {
    reports.kpis().then(setKpis);
    reports.departmentOverview().then(setDept);
    reports.activityFeed({ limit: 8 }).then(setActivity);
    getRepos().instances.getClock().then(setClock);
  }, [reports]);

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

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Active Projects"
          value={kpis?.projectsActive ?? 0}
          delta={delta('projectsActive')}
          href="/projects"
          note="Projects is contracted separately and has no design yet."
        />
        <StatTile label="Incidents" value={kpis?.incidentsOpen ?? '—'} delta={delta('incidentsOpen')} href="/incidents" />
        <StatTile label="Checklists" value={kpis?.checklistsDue ?? '—'} delta={delta('checklistsDue')} href="/checklists/mine" />
        <StatTile label="Approvals" value={kpis?.approvalsPending ?? '—'} delta={delta('approvalsPending')} href="/approvals" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="Department overview"
          subtitle="Inspection submissions in the seeded window"
          table={
            <SimpleTable
              columns={[
                { key: 'label', label: 'Department' },
                { key: 'count', label: 'Submissions' },
              ]}
              rows={dept}
            />
          }
        >
          <HorizontalBarChart items={dept} />
        </ChartCard>

        <section className="rounded-lg border border-navy/10 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-navy">Recent activity</h2>
          <ul className="text-sm">
            {activity.map((row) => (
              <li key={row.id} className="border-b border-navy/5 last:border-0">
                {/* The whole entry is the target, not just the link text — a
                    16px line of text is not a tappable thing on a phone. */}
                <Link
                  to={row.href || '/dashboard'}
                  className="-mx-2 block rounded-md px-2 py-2.5 hover:bg-stripe"
                >
                  <span className="block font-medium text-primary">{row.summary}</span>
                  <span className="mt-0.5 block text-xs text-muted">
                    {row.actor_name} · {String(row.at).slice(0, 16).replace('T', ' ')}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="rounded-lg border border-navy/10 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold text-navy">Quick actions</h2>
          <Link
            to="/checklists/mine"
            className="-mr-2 inline-flex min-h-11 items-center rounded-md px-2 text-sm font-medium text-primary hover:bg-stripe lg:mr-0 lg:min-h-0 lg:px-0 lg:hover:bg-transparent lg:hover:underline"
          >
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
          <Link to="/approvals" className="rounded-md border border-navy/10 p-4 hover:border-primary">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Inbox</p>
            <p className="font-semibold text-navy">Open approvals</p>
            <p className="text-xs text-muted">Items waiting on {profile?.role || 'you'}</p>
          </Link>
        </div>
      </section>
    </div>
  );
}
