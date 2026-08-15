import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import ChartCard, { SimpleTable } from '../components/reports/ChartCard.jsx';
import { HorizontalBarChart, LineChart } from '../components/reports/Charts.jsx';
import { StatTile, StatusStateTile } from '../components/reports/StatTile.jsx';
import { useReports } from '../hooks/useRepos.js';
import { downloadCsv, rowsToCsv } from '../lib/csv.js';

export default function ReportsPage() {
  const reports = useReports();
  const [completion, setCompletion] = useState({ points: [], series: [] });
  const [overdue, setOverdue] = useState([]);
  const [levels, setLevels] = useState([]);
  const [lifecycle, setLifecycle] = useState([]);
  const [ageing, setAgeing] = useState({ openAgeing: [], meanDays: null, closedCount: 0 });
  const [sla, setSla] = useState(null);
  const [noc, setNoc] = useState(null);
  const [reinspect, setReinspect] = useState(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    reports.completionRate().then(setCompletion);
    reports.overdueInspections().then(setOverdue);
    reports.openDeficienciesByLevel().then(setLevels);
    reports.incidentsByStatus().then(setLifecycle);
    reports.deficiencyAgeing().then(setAgeing);
    reports.slaAdherence().then(setSla);
    reports.nocRegisterStatus().then(setNoc);
    reports.reinspectionRate().then(setReinspect);
  }, [reports]);

  async function exportPdf() {
    setExporting(true);
    try {
      const payload = { completion, overdue, levels, lifecycle, ageing, sla, noc, reinspect };
      const res = await fetch('/api/export-report-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Report PDF failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'BACC-compliance-report.pdf';
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
          <h1 className="text-2xl font-bold text-navy">Reports</h1>
          <p className="text-sm text-muted">
            Compliance views from repository aggregations. Report PDFs are house-style documents, not overlay forms.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            className="rounded-md border border-navy/20 bg-white px-3 py-2 text-sm"
            onClick={() =>
              downloadCsv(
                'compliance-overdue.csv',
                rowsToCsv(
                  ['template', 'assignee', 'due', 'status', 'days_overdue'],
                  overdue.map((r) => [r.templateCode, r.assignee, r.due_at, r.status, r.daysOverdue]),
                ),
              )
            }
          >
            Export CSV
          </button>
          <button
            type="button"
            disabled={exporting}
            className="rounded-md bg-navy px-3 py-2 text-sm font-semibold text-white"
            onClick={exportPdf}
          >
            {exporting ? 'Exporting…' : 'Export PDF'}
          </button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="Completion rate over time"
          subtitle="Submitted instances / due instances per month · Annex D"
          table={
            <SimpleTable
              columns={[
                { key: 'period', label: 'Period' },
                { key: 'submitted', label: 'Submitted' },
                { key: 'due', label: 'Due' },
                { key: 'rate', label: 'Rate', render: (r) => `${Math.round(r.rate * 100)}%` },
              ]}
              rows={completion.points}
            />
          }
        >
          <LineChart series={completion.series} points={completion.points} />
        </ChartCard>

        <ChartCard
          title="Open deficiencies by Level"
          subtitle="Categorical hues — not a severity ramp. Level 1–4 ordering is undefined."
          table={
            <SimpleTable
              columns={[
                { key: 'label', label: 'Level' },
                { key: 'count', label: 'Open' },
              ]}
              rows={levels}
            />
          }
        >
          <HorizontalBarChart items={levels} />
        </ChartCard>

        <ChartCard
          title="Incidents by lifecycle"
          subtitle="Magnitude by state"
          table={
            <SimpleTable
              columns={[
                { key: 'label', label: 'Status' },
                { key: 'count', label: 'Count' },
              ]}
              rows={lifecycle}
            />
          }
        >
          <HorizontalBarChart items={lifecycle} />
        </ChartCard>

        <ChartCard
          title="Open deficiency ageing"
          subtitle={
            ageing.meanDays == null
              ? 'Mean time to close — not enough closed records'
              : `Mean time to close: ${ageing.meanDays.toFixed(1)} days (${ageing.closedCount} closed)`
          }
          table={
            <SimpleTable
              columns={[
                { key: 'label', label: 'Age' },
                { key: 'count', label: 'Open' },
              ]}
              rows={ageing.openAgeing}
            />
          }
        >
          <HorizontalBarChart items={ageing.openAgeing} />
        </ChartCard>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-navy">SLA adherence</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <StatusStateTile kind="ok" label="On track" value={sla?.onTrack ?? '—'} />
          <StatusStateTile kind="warning" label="Warning window" value={sla?.warning ?? '—'} />
          <StatusStateTile kind="overdue" label="Breached" value={sla?.breached ?? '—'} />
        </div>
        <p className="text-xs text-muted">
          Closed on time {sla?.closedOnTime ?? 0} · closed late {sla?.closedLate ?? 0}. Target days per Deficiency Level
          are unset until BACC defines the scale.
        </p>
        <div className="overflow-hidden rounded-lg border border-navy/10 bg-white">
          <SimpleTable
            columns={[
              { key: 'ref', label: 'Incident', render: (r) => <Link to={r.href} className="text-primary hover:underline">{r.ref}</Link> },
              { key: 'status', label: 'Status' },
              { key: 'target_date', label: 'Target' },
              { key: 'sla', label: 'SLA' },
              { key: 'remainingDays', label: 'Days' },
            ]}
            rows={sla?.rows ?? []}
          />
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <StatTile
          label="NOC register"
          value={`${noc?.open ?? 0} open / ${noc?.closed ?? 0} closed`}
        />
        <StatTile
          label="Re-inspection verification"
          value={reinspect ? `${Math.round(reinspect.rate * 100)}%` : '—'}
          note={
            reinspect
              ? `${reinspect.withSatReinspection} of ${reinspect.closed} closures have a SAT re-inspection`
              : ''
          }
        />
      </div>

      <section className="rounded-lg border border-navy/10 bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold text-navy">Overdue and missed inspections</h2>
        <p className="mb-3 text-xs text-muted">Identity of specific records — table, not a chart.</p>
        <SimpleTable
          columns={[
            { key: 'templateCode', label: 'Form' },
            { key: 'assignee', label: 'Assignee' },
            { key: 'due_at', label: 'Due' },
            { key: 'status', label: 'Status' },
            { key: 'daysOverdue', label: 'Days overdue' },
          ]}
          rows={overdue}
        />
      </section>
    </div>
  );
}
