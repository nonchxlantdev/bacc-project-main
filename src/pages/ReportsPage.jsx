import { useEffect, useState } from 'react';
import { AlertTriangle, Check, Clock, SlidersHorizontal } from 'lucide-react';
import { useReports } from '../hooks/useRepos.js';
import Dropdown from '../components/ui/Dropdown.jsx';
import ChartCard, { SimpleTable } from '../components/reports/ChartCard.jsx';
import { StatTile, StatusStateTile } from '../components/reports/StatTile.jsx';
import { downloadCsv, rowsToCsv } from '../lib/csv.js';
import { fmtDate } from '../lib/airportFormat.js';

/**
 * Reports, written to be read by someone who does not work with data.
 *
 * Every heading is a plain-English question and every number is followed by
 * what it means. No chart appears without a sentence saying how to read it,
 * and no value is carried by colour alone.
 *
 * Which sections appear is the reader's choice — see SECTIONS below. Different
 * people open this page for different reasons, and a monthly reviewer should
 * not have to scroll past a chart they never use.
 */

/** Every report on this page. `id` is what the picker toggles. */
const SECTIONS = [
  { id: 'headline', label: 'Headline numbers', hint: 'Behind, still to do, on-time rate' },
  { id: 'onTime', label: 'Filed on time by week', hint: 'Eight-week trend' },
  { id: 'late', label: 'What was filed late', hint: 'The specific records' },
  { id: 'deficiency', label: 'Deficiencies & incidents', hint: 'Open by level, ageing, NOC, reinspection' },
  { id: 'workOrders', label: 'Work orders & SLA', hint: 'Turnaround and NOC SLA' },
  { id: 'templates', label: 'Per-form completion', hint: 'Scheduled vs filed by template' },
];

const SLA_LABELS = {
  ok: 'On track',
  warning: 'Warning',
  overdue: 'Breached',
  none: 'No target',
};

export default function ReportsPage() {
  const reports = useReports();
  const [teams, setTeams] = useState([]);
  const [weeks, setWeeks] = useState([]);
  const [late, setLate] = useState([]);
  const [byLevel, setByLevel] = useState([]);
  const [ageing, setAgeing] = useState({ meanDays: null, closedCount: 0, openAgeing: [] });
  const [noc, setNoc] = useState({ open: 0, closed: 0, byStatus: [] });
  const [reinspection, setReinspection] = useState({ closed: 0, withSatReinspection: 0, rate: 0 });
  const [sla, setSla] = useState({
    onTrack: 0,
    warning: 0,
    breached: 0,
    closedOnTime: 0,
    closedLate: 0,
    rows: [],
  });
  const [turnaround, setTurnaround] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [exporting, setExporting] = useState(false);
  const [visible, setVisible] = useState(() => new Set(SECTIONS.map((r) => r.id)));
  const [pickerOpen, setPickerOpen] = useState(false);

  const shows = (id) => visible.has(id);

  function toggleSection(id) {
    setVisible((prev) => {
      const next = new Set(prev);
      // Hiding the last section would leave a blank page with no obvious way
      // back, so the final one stays on.
      if (next.has(id) && next.size > 1) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  useEffect(() => {
    reports.teamCompliance().then(setTeams);
    reports.onTimeByWeek({ weeks: 8 }).then(setWeeks);
    reports.lateCompletions({ limit: 12 }).then(setLate);
    reports.openDeficienciesByLevel().then(setByLevel);
    reports.deficiencyAgeing().then(setAgeing);
    reports.nocRegisterStatus().then(setNoc);
    reports.reinspectionRate().then(setReinspection);
    reports.slaAdherence().then(setSla);
    reports.workOrderTurnaround().then(setTurnaround);
    reports.templateCompletion().then(setTemplates);
  }, [reports]);

  const totals = teams.reduce(
    (acc, t) => ({
      scheduled: acc.scheduled + t.scheduled,
      completed: acc.completed + t.completed,
      onTime: acc.onTime + t.onTime,
      late: acc.late + t.late,
      outstanding: acc.outstanding + t.outstanding,
      behind: acc.behind + t.overdue + t.missed,
    }),
    { scheduled: 0, completed: 0, onTime: 0, late: 0, outstanding: 0, behind: 0 },
  );

  const onTimeRate = totals.completed ? Math.round((totals.onTime / totals.completed) * 100) : null;
  const teamsBehind = teams.filter((t) => t.overdue + t.missed > 0);

  const templateTotals = templates.reduce(
    (acc, t) => ({
      scheduled: acc.scheduled + t.scheduled,
      completed: acc.completed + t.completed,
      onTime: acc.onTime + t.onTime,
      late: acc.late + t.late,
      outstanding: acc.outstanding + t.outstanding,
    }),
    { scheduled: 0, completed: 0, onTime: 0, late: 0, outstanding: 0 },
  );
  const templateOnTimeRate = templateTotals.completed
    ? Math.round((templateTotals.onTime / templateTotals.completed) * 100)
    : null;

  const reinspectionPct = reinspection.closed
    ? Math.round(reinspection.rate * 100)
    : null;
  const meanDaysClose =
    ageing.meanDays == null ? null : Math.round(ageing.meanDays * 10) / 10;

  const slaSample = (sla.rows || []).filter((r) => r.status !== 'closed').slice(0, 12);

  async function exportPdf() {
    setExporting(true);
    try {
      const { apiFetch } = await import('../lib/apiFetch.js');
      const res = await apiFetch('/api/export-report-pdf', {
        method: 'POST',
        body: JSON.stringify({ teams, weeks, late, totals, onTimeRate }),
      });
      if (!res.ok) throw new Error('Report PDF failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'BACC-inspection-report.pdf';
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink sm:text-2xl">Reports</h1>
          <p className="text-sm text-muted">
            How the inspection programme is doing, in plain terms. Everything below counts scheduled
            inspections — the checks each team is supposed to complete.
          </p>
        </div>
        <div className="flex w-full gap-2 sm:w-auto">
          <SectionPicker
            open={pickerOpen}
            onOpenChange={setPickerOpen}
            visible={visible}
            onToggle={toggleSection}
          />
          <button
            type="button"
            className="min-h-11 flex-1 rounded-md border border-line/20 bg-surface px-3 py-2 text-sm font-medium text-ink hover:bg-surface-2 sm:flex-none"
            onClick={() =>
              downloadCsv(
                'inspection-summary.csv',
                rowsToCsv(
                  ['team', 'scheduled', 'completed', 'on_time', 'late', 'outstanding', 'overdue', 'missed'],
                  teams.map((t) => [t.label, t.scheduled, t.completed, t.onTime, t.late, t.outstanding, t.overdue, t.missed]),
                ),
              )
            }
          >
            Export CSV
          </button>
          <button
            type="button"
            disabled={exporting}
            className="min-h-11 flex-1 rounded-md bg-navy px-3 py-2 text-sm font-semibold text-white disabled:opacity-50 sm:flex-none"
            onClick={exportPdf}
          >
            {exporting ? 'Exporting…' : 'Export PDF'}
          </button>
        </div>
      </div>

      {/* 1 — the headline, three numbers and what each one means */}
      {shows('headline') && (
      <section className="grid gap-3 sm:grid-cols-3">
        <Headline
          tone={totals.behind ? 'alert' : 'good'}
          Icon={totals.behind ? AlertTriangle : Check}
          value={totals.behind}
          label={totals.behind === 1 ? 'inspection is behind' : 'inspections are behind'}
          caption={
            totals.behind
              ? `Across ${teamsBehind.length} ${teamsBehind.length === 1 ? 'team' : 'teams'}. These are past their due date.`
              : 'Every scheduled inspection is either done or not due yet.'
          }
        />
        <Headline
          tone="neutral"
          Icon={Clock}
          value={totals.outstanding}
          label={totals.outstanding === 1 ? 'inspection still to do' : 'inspections still to do'}
          caption="Scheduled but not yet filed, including the ones not due until later."
        />
        <Headline
          tone={onTimeRate != null && onTimeRate < 90 ? 'warn' : 'good'}
          Icon={Check}
          value={onTimeRate == null ? '—' : `${onTimeRate}%`}
          label="filed on time"
          caption={`${totals.onTime} of ${totals.completed} completed inspections were filed by their due date.`}
        />
      </section>
      )}

      {/* 2 — on time vs late, by week */}
      {shows('onTime') && (
      <Panel
        title="Are inspections being filed on time?"
        caption="Each column is one week. Green is filed by the due date, amber is filed late. Taller columns simply mean more inspections were due that week."
      >
        {weeks.every((w) => w.onTime + w.late === 0) ? (
          <Empty>No inspections have been filed in the last eight weeks.</Empty>
        ) : (
          <WeeklyBars weeks={weeks} />
        )}
      </Panel>
      )}

      {/* 3 — the specific late ones */}
      {shows('late') && (
      <Panel
        title="What was filed late?"
        caption="The most recent late inspections, newest first. “Days late” counts from the due date to the day it was actually filed."
      >
        {late.length === 0 ? (
          <Empty>Nothing has been filed late.</Empty>
        ) : (
          <div className="overflow-x-auto rounded-md border border-line/10">
            <table className="table-stack w-full text-left text-sm">
              <thead className="bg-gradient-to-r from-navy to-navy-mid text-white">
                <tr>
                  <th className="px-3 py-2 font-semibold">Inspection</th>
                  <th className="px-3 py-2 font-semibold">Team</th>
                  <th className="px-3 py-2 font-semibold">Was due</th>
                  <th className="px-3 py-2 font-semibold">Filed</th>
                  <th className="px-3 py-2 text-right font-semibold">Days late</th>
                </tr>
              </thead>
              <tbody>
                {late.map((row, i) => (
                  <tr key={row.id} className={i % 2 === 0 ? 'bg-stripe' : 'bg-surface'}>
                    <td data-label="Inspection" className="px-3 py-2">
                      <span className="font-medium text-ink">{row.title || row.code}</span>
                      <span className="mt-0.5 block text-xs text-muted">{row.code}</span>
                    </td>
                    <td data-label="Team" className="px-3 py-2 text-muted">{row.team}</td>
                    <td data-label="Was due" className="px-3 py-2 text-muted">{fmtDate(row.due)}</td>
                    <td data-label="Filed" className="px-3 py-2 text-muted">{fmtDate(row.completed)}</td>
                    <td data-label="Days late" className="px-3 py-2 lg:text-right">
                      <span className="inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
                        {row.daysLate} {row.daysLate === 1 ? 'day' : 'days'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      )}

      {/* 4 — deficiencies & incidents */}
      {shows('deficiency') && (
        <div className="space-y-4">
          <Panel
            title="How are open deficiencies looking?"
            caption="Open Notices of Condition, how long they take to close, and how often a closed deficiency gets a satisfactory reinspection."
          >
            <div className="mb-4 flex flex-wrap gap-2">
              <ExportCsvButton
                filename="deficiencies-by-level.csv"
                columns={['level', 'label', 'count']}
                rows={byLevel.map((r) => [r.key, r.label, r.count])}
              />
              <ExportCsvButton
                filename="deficiency-ageing.csv"
                columns={['bucket', 'label', 'count']}
                rows={(ageing.openAgeing || []).map((r) => [r.bucket, r.label, r.count])}
              />
              <ExportCsvButton
                filename="noc-register-status.csv"
                columns={['status', 'label', 'count']}
                rows={(noc.byStatus || []).map((r) => [r.key, r.label, r.count])}
              />
            </div>
            <section className="grid gap-3 sm:grid-cols-3">
              <StatTile
                label="Open NOCs"
                value={noc.open}
                note={`${noc.closed} closed on the register`}
                tone={noc.open > 0 ? 'caution' : 'ok'}
              />
              <StatTile
                label="Mean days to close"
                value={meanDaysClose == null ? '—' : meanDaysClose}
                note={
                  ageing.closedCount
                    ? `Across ${ageing.closedCount} closed ${ageing.closedCount === 1 ? 'incident' : 'incidents'}.`
                    : 'No closed incidents yet.'
                }
              />
              <StatTile
                label="Reinspection rate"
                value={reinspectionPct == null ? '—' : `${reinspectionPct}%`}
                note={
                  reinspection.closed
                    ? `${reinspection.withSatReinspection} of ${reinspection.closed} closed with a satisfactory reinspection.`
                    : 'No closed incidents yet.'
                }
                tone={reinspectionPct != null && reinspectionPct < 80 ? 'caution' : 'ok'}
              />
            </section>
          </Panel>

          <div className="grid gap-4 desk:grid-cols-2">
            <ChartCard
              title="Open deficiencies by level"
              subtitle="Each bar is one deficiency level. Colour comes from the configured palette — read the count beside the bar, not the hue alone."
              table={
                byLevel.length === 0 ? (
                  <Empty>No open deficiencies.</Empty>
                ) : (
                  <SimpleTable
                    columns={[
                      { key: 'label', label: 'Level' },
                      { key: 'count', label: 'Open' },
                    ]}
                    rows={byLevel}
                  />
                )
              }
            >
              {byLevel.every((r) => !r.count) ? (
                <Empty>No open deficiencies.</Empty>
              ) : (
                <>
                  <ColoredBars items={byLevel} />
                  <ColorLegend items={byLevel} />
                </>
              )}
            </ChartCard>

            <ChartCard
              title="Open incident age"
              subtitle="How long today’s open incidents have been on the register, counted from the reported date."
              table={
                (ageing.openAgeing || []).length === 0 ? (
                  <Empty>No open incidents.</Empty>
                ) : (
                  <SimpleTable
                    columns={[
                      { key: 'label', label: 'Age' },
                      { key: 'count', label: 'Open' },
                    ]}
                    rows={ageing.openAgeing || []}
                  />
                )
              }
            >
              {(ageing.openAgeing || []).every((r) => !r.count) ? (
                <Empty>No open incidents.</Empty>
              ) : (
                <ColoredBars items={ageing.openAgeing || []} />
              )}
            </ChartCard>
          </div>

          <ChartCard
            title="NOC register by status"
            subtitle="Every Notice of Condition on the register, grouped by lifecycle status. Colour matches the status token used elsewhere in the portal."
            table={
              (noc.byStatus || []).length === 0 ? (
                <Empty>No NOCs on the register.</Empty>
              ) : (
                <SimpleTable
                  columns={[
                    {
                      key: 'label',
                      label: 'Status',
                      render: (row) => (
                        <span className="inline-flex items-center gap-2 capitalize">
                          <span
                            className="h-2.5 w-2.5 shrink-0 rounded-sm"
                            style={{ backgroundColor: row.color }}
                            aria-hidden
                          />
                          {row.label}
                        </span>
                      ),
                    },
                    { key: 'count', label: 'Count' },
                  ]}
                  rows={noc.byStatus || []}
                />
              )
            }
          >
            {(noc.byStatus || []).every((r) => !r.count) ? (
              <Empty>No NOCs on the register.</Empty>
            ) : (
              <>
                <ColoredBars items={noc.byStatus || []} />
                <ColorLegend items={noc.byStatus || []} />
              </>
            )}
          </ChartCard>
        </div>
      )}

      {/* 5 — work orders & SLA */}
      {shows('workOrders') && (
        <div className="space-y-4">
          <Panel
            title="Are NOC target dates being met?"
            caption="Open incidents against their SLA target date, plus how closed ones finished. Status colours here mean on track, warning, or breached — each tile is also labelled."
          >
            <div className="mb-4 flex flex-wrap gap-2">
              <ExportCsvButton
                filename="work-order-turnaround.csv"
                columns={['department', 'count', 'completed', 'mean_days', 'median_days']}
                rows={turnaround.map((r) => [r.label, r.count, r.completed, r.meanDays ?? '', r.medianDays ?? ''])}
              />
              <ExportCsvButton
                filename="sla-adherence.csv"
                columns={['ref', 'status', 'sla', 'remaining_days', 'target_date']}
                rows={(sla.rows || []).map((r) => [
                  r.ref,
                  r.status,
                  SLA_LABELS[r.sla] || r.sla,
                  r.remainingDays ?? '',
                  r.target_date || '',
                ])}
              />
            </div>
            <section className="grid gap-3 sm:grid-cols-3">
              <StatusStateTile kind="ok" label="On track" value={sla.onTrack} />
              <StatusStateTile kind="warning" label="Warning" value={sla.warning} />
              <StatusStateTile kind="overdue" label="Breached" value={sla.breached} />
            </section>
            <section className="mt-3 grid gap-3 sm:grid-cols-2">
              <StatTile
                label="Closed on time"
                value={sla.closedOnTime}
                note="Closed on or before the target date."
                tone="ok"
              />
              <StatTile
                label="Closed late"
                value={sla.closedLate}
                note="Closed after the target date."
                tone={sla.closedLate > 0 ? 'caution' : 'ok'}
              />
            </section>
          </Panel>

          <ChartCard
            title="Work order turnaround by department"
            subtitle="Days from issue to works completed or verified. Open orders count toward volume but are left out of the averages."
            table={
              turnaround.length === 0 ? (
                <Empty>No work orders yet.</Empty>
              ) : (
                <SimpleTable
                  columns={[
                    { key: 'label', label: 'Department' },
                    { key: 'count', label: 'Orders' },
                    { key: 'completed', label: 'Completed' },
                    {
                      key: 'meanDays',
                      label: 'Mean days',
                      render: (row) => (row.meanDays == null ? '—' : row.meanDays),
                    },
                    {
                      key: 'medianDays',
                      label: 'Median days',
                      render: (row) => (row.medianDays == null ? '—' : row.medianDays),
                    },
                  ]}
                  rows={turnaround}
                />
              )
            }
          >
            {turnaround.length === 0 ? (
              <Empty>No work orders yet.</Empty>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-xs uppercase text-muted">
                    <tr>
                      <th className="px-2 py-1 font-semibold">Department</th>
                      <th className="px-2 py-1 text-right font-semibold">Orders</th>
                      <th className="px-2 py-1 text-right font-semibold">Completed</th>
                      <th className="px-2 py-1 text-right font-semibold">Mean days</th>
                      <th className="px-2 py-1 text-right font-semibold">Median days</th>
                    </tr>
                  </thead>
                  <tbody>
                    {turnaround.map((row, i) => (
                      <tr key={row.key} className={i % 2 === 0 ? 'bg-surface-2' : ''}>
                        <td className="px-2 py-1.5 font-medium text-ink">{row.label}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-ink">{row.count}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-ink">{row.completed}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-ink">
                          {row.meanDays == null ? '—' : row.meanDays}
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-ink">
                          {row.medianDays == null ? '—' : row.medianDays}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </ChartCard>

          <Panel
            title="Open incidents against SLA"
            caption="A sample of open NOCs with their remaining days to the target date. Negative remaining days means the target has already passed."
          >
            {slaSample.length === 0 ? (
              <Empty>No open incidents with an SLA target.</Empty>
            ) : (
              <div className="overflow-x-auto rounded-md border border-line/10">
                <table className="table-stack w-full text-left text-sm">
                  <thead className="bg-gradient-to-r from-navy to-navy-mid text-white">
                    <tr>
                      <th className="px-3 py-2 font-semibold">Ref</th>
                      <th className="px-3 py-2 font-semibold">Status</th>
                      <th className="px-3 py-2 font-semibold">SLA</th>
                      <th className="px-3 py-2 text-right font-semibold">Days left</th>
                    </tr>
                  </thead>
                  <tbody>
                    {slaSample.map((row, i) => (
                      <tr key={row.id} className={i % 2 === 0 ? 'bg-stripe' : 'bg-surface'}>
                        <td data-label="Ref" className="px-3 py-2 font-medium text-ink">
                          {row.ref}
                        </td>
                        <td data-label="Status" className="px-3 py-2 capitalize text-muted">
                          {String(row.status || '').replace('_', ' ')}
                        </td>
                        <td data-label="SLA" className="px-3 py-2 text-muted">
                          {SLA_LABELS[row.sla] || row.sla || '—'}
                        </td>
                        <td data-label="Days left" className="px-3 py-2 text-right tabular-nums text-ink">
                          {row.remainingDays == null ? '—' : row.remainingDays}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </div>
      )}

      {/* 6 — per-form completion */}
      {shows('templates') && (
        <Panel
          title="How is each form doing?"
          caption="Scheduled versus filed for every registered checklist template, grouped by document family. Scroll the table — thirty-plus rows is expected."
        >
          <div className="mb-4 flex flex-wrap gap-2">
            <ExportCsvButton
              filename="template-completion.csv"
              columns={['code', 'label', 'family', 'scheduled', 'completed', 'on_time', 'late', 'outstanding']}
              rows={templates.map((t) => [
                t.code,
                t.label,
                t.family,
                t.scheduled,
                t.completed,
                t.onTime,
                t.late,
                t.outstanding,
              ])}
            />
          </div>
          <section className="mb-4 grid gap-3 sm:grid-cols-1 desk:max-w-md">
            <Headline
              tone={templateOnTimeRate != null && templateOnTimeRate < 90 ? 'warn' : 'good'}
              Icon={Check}
              value={templateOnTimeRate == null ? '—' : `${templateOnTimeRate}%`}
              label="filed on time across all forms"
              caption={`${templateTotals.onTime} of ${templateTotals.completed} completed filings were on time · ${templateTotals.outstanding} still outstanding.`}
            />
          </section>
          {templates.length === 0 ? (
            <Empty>No templates registered.</Empty>
          ) : (
            <div className="max-h-[36rem] overflow-auto rounded-md border border-line/10">
              <table className="table-stack w-full text-left text-sm">
                <thead className="sticky top-0 bg-gradient-to-r from-navy to-navy-mid text-white">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Code</th>
                    <th className="px-3 py-2 font-semibold">Form</th>
                    <th className="px-3 py-2 text-right font-semibold">Scheduled</th>
                    <th className="px-3 py-2 text-right font-semibold">Completed</th>
                    <th className="px-3 py-2 text-right font-semibold">On time</th>
                    <th className="px-3 py-2 text-right font-semibold">Late</th>
                    <th className="px-3 py-2 text-right font-semibold">Outstanding</th>
                  </tr>
                </thead>
                <tbody>
                  <TemplateRows templates={templates} />
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      )}
    </div>
  );
}

/** Group template rows visually by document family, all expanded. */
function TemplateRows({ templates }) {
  const rows = [];
  let lastFamily = null;
  let stripe = 0;
  for (const t of templates) {
    if (t.family !== lastFamily) {
      lastFamily = t.family;
      rows.push(
        <tr key={`family-${t.family}`} className="group-row bg-surface-2">
          <td colSpan={7} className="px-3 py-2 text-xs font-bold uppercase tracking-wide text-ink">
            {t.family}
          </td>
        </tr>,
      );
      stripe = 0;
    }
    rows.push(
      <tr key={t.key} className={stripe % 2 === 0 ? 'bg-stripe' : 'bg-surface'}>
        <td data-label="Code" className="px-3 py-2 font-mono text-xs text-ink">
          {t.code}
        </td>
        <td data-label="Form" className="px-3 py-2 text-ink">
          {t.label}
        </td>
        <td data-label="Scheduled" className="px-3 py-2 text-right tabular-nums text-muted">
          {t.scheduled}
        </td>
        <td data-label="Completed" className="px-3 py-2 text-right tabular-nums text-muted">
          {t.completed}
        </td>
        <td data-label="On time" className="px-3 py-2 text-right tabular-nums text-muted">
          {t.onTime}
        </td>
        <td data-label="Late" className="px-3 py-2 text-right tabular-nums text-muted">
          {t.late}
        </td>
        <td data-label="Outstanding" className="px-3 py-2 text-right tabular-nums text-muted">
          {t.outstanding}
        </td>
      </tr>,
    );
    stripe += 1;
  }
  return rows;
}

/**
 * Choose which reports to show.
 *
 * A checkbox list rather than tabs: these are not alternatives to each other,
 * and someone comparing the on-time trend against the late records wants both
 * on screen at once. The count on the trigger keeps the current state visible
 * when the menu is closed.
 */
function SectionPicker({ open, onOpenChange, visible, onToggle }) {
  return (
    <Dropdown open={open} onOpenChange={onOpenChange} align="left" className="flex-1 sm:flex-none">
      <Dropdown.Toggle
        haspopup="true"
        className={`inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md border bg-surface px-3 py-2 text-sm font-medium text-ink transition hover:bg-surface-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
          open ? 'border-primary' : 'border-line/20'
        }`}
      >
        <SlidersHorizontal className="h-4 w-4" aria-hidden />
        Reports
        <span className="rounded-full bg-primary/10 px-1.5 text-xs font-semibold text-primary tabular-nums">
          {visible.size}/{SECTIONS.length}
        </span>
      </Dropdown.Toggle>

      {/* Anchored left: this is the leftmost control in the toolbar, so a
          right-anchored panel would hang off the content edge. */}
      <Dropdown.Menu
        panel
        align="left"
        className="z-40 w-[min(18rem,calc(100vw-2rem))] border-line/15 p-1.5"
      >
        <p className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
          Show on this page
        </p>
        {SECTIONS.map((section) => {
          const on = visible.has(section.id);
          const last = on && visible.size === 1;
          return (
            <label
              key={section.id}
              className={`flex min-h-11 items-start gap-2.5 rounded px-2 py-2 desk:min-h-0 ${
                last ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:bg-surface-2'
              }`}
              title={last ? 'At least one report must stay visible' : undefined}
            >
              <input
                type="checkbox"
                checked={on}
                disabled={last}
                onChange={() => onToggle(section.id)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-ink">{section.label}</span>
                <span className="block text-xs text-muted">{section.hint}</span>
              </span>
            </label>
          );
        })}
      </Dropdown.Menu>
    </Dropdown>
  );
}

const HEADLINE_TONES = {
  good: 'border-success/30 bg-success-soft text-success',
  warn: 'border-amber-300 bg-amber-50 text-amber-700',
  alert: 'border-alert/30 bg-alert-soft text-alert',
  neutral: 'border-line/15 bg-stripe text-ink',
};

function Headline({ tone, Icon, value, label, caption }) {
  return (
    <div className="rounded-lg border border-line/10 bg-surface p-4 shadow-card">
      <div className="flex items-center gap-3">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border ${HEADLINE_TONES[tone]}`}>
          <Icon className="h-5 w-5" aria-hidden />
        </span>
        <p className="min-w-0">
          <span className="block text-2xl font-bold leading-tight text-ink">{value}</span>
          <span className="block text-sm text-ink">{label}</span>
        </p>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-muted">{caption}</p>
    </div>
  );
}

function Panel({ title, caption, children }) {
  return (
    <section className="rounded-lg border border-line/10 bg-surface p-4 shadow-card sm:p-5">
      <h2 className="text-base font-bold text-ink">{title}</h2>
      <p className="mb-4 mt-0.5 text-xs leading-relaxed text-muted">{caption}</p>
      {children}
    </section>
  );
}

/**
 * On-time vs late, by week.
 *
 * Proper axes rather than floating bars: a labelled Y scale lets someone read
 * a value off a column without a tooltip, and the counts sit on the segments
 * themselves so the chart still answers "how many?" when printed in black and
 * white. Colour alone never carries the meaning — every segment is labelled.
 */
function WeeklyBars({ weeks }) {
  const peak = Math.max(1, ...weeks.map((w) => w.onTime + w.late));
  const max = niceCeiling(peak);
  const ticks = axisTicks(max);
  const H = 200;

  return (
    <figure className="m-0">
      <div className="flex">
        {/* Y axis — counts, with a gridline per tick */}
        <div className="relative w-8 shrink-0 sm:w-10" style={{ height: H }}>
          {ticks.map((t) => (
            <span
              key={t}
              // `bottom` positions the label's lower edge on the gridline, so
              // it must move DOWN by half its height to sit centred on it.
              className="absolute right-1.5 translate-y-1/2 text-[11px] tabular-nums text-muted"
              style={{ bottom: `${(t / max) * 100}%` }}
            >
              {t}
            </span>
          ))}
        </div>

        <div className="min-w-0 flex-1">
          <div className="relative border-b-2 border-l-2 border-line/20" style={{ height: H }}>
            {ticks.slice(1).map((t) => (
              <span
                key={t}
                aria-hidden
                className="absolute inset-x-0 border-t border-dashed border-line/10"
                style={{ bottom: `${(t / max) * 100}%` }}
              />
            ))}

            <div className="absolute inset-0 flex items-end gap-1.5 px-1 sm:gap-3 sm:px-2">
              {weeks.map((week) => {
                const total = week.onTime + week.late;
                return (
                  <div key={week.key} className="flex h-full min-w-0 flex-1 flex-col justify-end">
                    {total > 0 && (
                      <p className="mb-0.5 text-center text-[11px] font-bold tabular-nums text-ink">
                        {total}
                      </p>
                    )}
                    <div
                      className="flex w-full flex-col justify-end overflow-hidden rounded-t-sm"
                      style={{ height: `${(total / max) * 100}%` }}
                      role="img"
                      aria-label={`Week of ${week.label}: ${week.onTime} filed on time, ${week.late} filed late`}
                    >
                      <Segment count={week.late} total={total} className="bg-amber-400 text-amber-950" />
                      <Segment count={week.onTime} total={total} className="bg-success text-white" />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* X axis — the month is printed only when it changes, so nine weeks
              fit across a phone without truncating to "Ju…". */}
          <div className="flex gap-1.5 px-1 pt-1.5 sm:gap-3 sm:px-2">
            {weeks.map((week, i) => {
              const [month, day] = week.label.split(' ');
              const newMonth = i === 0 || month !== weeks[i - 1].label.split(' ')[0];
              return (
                <p key={week.key} className="min-w-0 flex-1 text-center text-[11px] text-muted">
                  <span className={newMonth ? '' : 'hidden sm:inline'}>{month} </span>
                  {day}
                </p>
              );
            })}
          </div>
          <p className="mt-1 text-center text-[11px] font-medium uppercase tracking-wide text-muted">
            Week the inspection was due
          </p>
        </div>
      </div>

      <figcaption className="mt-3 flex flex-wrap items-center gap-4 border-t border-line/10 pt-3 text-xs text-muted">
        <Key className="bg-success">Filed on time</Key>
        <Key className="bg-amber-400">Filed late</Key>
        <span className="ml-auto">Vertical axis: number of inspections</span>
      </figcaption>
    </figure>
  );
}

/**
 * One coloured slice of a column. The count is printed inside once the slice is
 * tall enough to hold it — below that it would overflow into its neighbour, and
 * the total above the column plus the aria-label still carry the number.
 */
function Segment({ count, total, className }) {
  if (!count) return null;
  const share = count / total;
  return (
    <div
      className={`flex w-full items-center justify-center overflow-hidden ${className}`}
      style={{ flexGrow: count }}
    >
      {share > 0.18 && <span className="text-[10px] font-bold tabular-nums">{count}</span>}
    </div>
  );
}

/** Round the peak up to a friendly axis maximum (10, 20, 25, 50, 100 …). */
function niceCeiling(peak) {
  const magnitude = 10 ** Math.floor(Math.log10(peak));
  for (const step of [1, 2, 2.5, 5, 10]) {
    const candidate = step * magnitude;
    if (candidate >= peak) return candidate;
  }
  return magnitude * 10;
}

function axisTicks(max) {
  return [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(max * f));
}

function Key({ className, children }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-2.5 w-2.5 rounded-sm ${className}`} aria-hidden />
      {children}
    </span>
  );
}

/**
 * Horizontal bars that honour each item's own `color` (unlike HorizontalBarChart,
 * which paints every bar with the same teal→primary gradient).
 */
function ColoredBars({ items }) {
  const peak = Math.max(1, ...items.map((i) => i.count || 0));
  return (
    <div className="flex flex-col gap-3" role="img" aria-label="Bar chart">
      {items.map((item) => (
        <div
          key={item.key || item.bucket || item.label}
          className="grid grid-cols-[5.5rem_1fr_2.25rem] items-center gap-2.5 sm:grid-cols-[7.25rem_1fr_2.25rem]"
        >
          <span className="truncate text-sm font-medium capitalize text-muted">{item.label}</span>
          <span className="relative h-[11px] overflow-hidden rounded-md bg-surface-2">
            <span
              className="absolute inset-y-0 left-0 rounded-md"
              style={{
                width: `${Math.max(item.count ? 4 : 0, ((item.count || 0) / peak) * 100)}%`,
                backgroundColor: item.color || 'var(--color-primary)',
              }}
              title={`${item.label}: ${item.count}`}
            />
          </span>
          <span className="text-right font-mono text-sm tabular-nums text-ink">{item.count}</span>
        </div>
      ))}
    </div>
  );
}

function ColorLegend({ items }) {
  if (!items || items.length < 2) return null;
  return (
    <figcaption className="mt-3 flex flex-wrap items-center gap-3 border-t border-line/10 pt-3 text-xs text-muted">
      {items.map((item) => (
        <span key={item.key || item.label} className="inline-flex items-center gap-1.5 capitalize">
          <span
            className="h-2.5 w-2.5 rounded-sm"
            style={{ backgroundColor: item.color || 'var(--color-primary)' }}
            aria-hidden
          />
          {item.label}
        </span>
      ))}
    </figcaption>
  );
}

function ExportCsvButton({ filename, columns, rows }) {
  return (
    <button
      type="button"
      className="min-h-11 rounded-md border border-line/20 bg-surface px-3 py-2 text-sm font-medium text-ink hover:bg-surface-2"
      onClick={() => downloadCsv(filename, rowsToCsv(columns, rows))}
    >
      Export CSV
    </button>
  );
}

function Empty({ children }) {
  return <p className="py-8 text-center text-sm text-muted">{children}</p>;
}
