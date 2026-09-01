import { useEffect, useState } from 'react';
import { AlertTriangle, Check, Clock, SlidersHorizontal } from 'lucide-react';
import { useReports } from '../hooks/useRepos.js';
import Dropdown from '../components/ui/Dropdown.jsx';
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
];
export default function ReportsPage() {
  const reports = useReports();
  const [teams, setTeams] = useState([]);
  const [weeks, setWeeks] = useState([]);
  const [late, setLate] = useState([]);
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

  async function exportPdf() {
    setExporting(true);
    try {
      const res = await fetch('/api/export-report-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
          <h1 className="text-xl font-bold text-navy sm:text-2xl">Reports</h1>
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
            className="min-h-11 flex-1 rounded-md border border-navy/20 bg-white px-3 py-2 text-sm font-medium text-navy hover:bg-stripe sm:flex-none"
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
          <div className="overflow-hidden rounded-md border border-navy/10">
            <table className="table-stack w-full text-left text-sm">
              <thead className="bg-navy text-white">
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
                  <tr key={row.id} className={i % 2 === 0 ? 'bg-stripe' : 'bg-white'}>
                    <td data-label="Inspection" className="px-3 py-2">
                      <span className="font-medium text-navy">{row.title || row.code}</span>
                      <span className="mt-0.5 block text-xs text-muted">{row.code}</span>
                    </td>
                    <td data-label="Team" className="px-3 py-2 text-muted">{row.team}</td>
                    <td data-label="Was due" className="px-3 py-2 text-muted">{fmtDate(row.due)}</td>
                    <td data-label="Filed" className="px-3 py-2 text-muted">{fmtDate(row.completed)}</td>
                    <td data-label="Days late" className="px-3 py-2 md:text-right">
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
    </div>
  );
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
        className={`inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md border bg-white px-3 py-2 text-sm font-medium text-navy transition hover:bg-stripe focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
          open ? 'border-primary' : 'border-navy/20'
        }`}
      >
        <SlidersHorizontal className="h-4 w-4" aria-hidden />
        Reports
        <span className="rounded-full bg-navy/10 px-1.5 text-xs font-semibold tabular-nums">
          {visible.size}/{SECTIONS.length}
        </span>
      </Dropdown.Toggle>

      {/* Anchored left: this is the leftmost control in the toolbar, so a
          right-anchored panel would hang off the content edge. */}
      <Dropdown.Menu
        panel
        align="left"
        className="z-40 w-[min(18rem,calc(100vw-2rem))] border-navy/15 p-1.5"
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
              className={`flex min-h-11 items-start gap-2.5 rounded px-2 py-2 sm:min-h-0 ${
                last ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:bg-stripe'
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
                <span className="block text-sm font-medium text-navy">{section.label}</span>
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
  neutral: 'border-navy/15 bg-stripe text-navy',
};

function Headline({ tone, Icon, value, label, caption }) {
  return (
    <div className="rounded-lg border border-navy/10 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border ${HEADLINE_TONES[tone]}`}>
          <Icon className="h-5 w-5" aria-hidden />
        </span>
        <p className="min-w-0">
          <span className="block text-2xl font-bold leading-tight text-navy">{value}</span>
          <span className="block text-sm text-ink">{label}</span>
        </p>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-muted">{caption}</p>
    </div>
  );
}

function Panel({ title, caption, children }) {
  return (
    <section className="rounded-lg border border-navy/10 bg-white p-4 shadow-sm sm:p-5">
      <h2 className="text-base font-bold text-navy">{title}</h2>
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
          <div className="relative border-b-2 border-l-2 border-navy/20" style={{ height: H }}>
            {ticks.slice(1).map((t) => (
              <span
                key={t}
                aria-hidden
                className="absolute inset-x-0 border-t border-dashed border-navy/10"
                style={{ bottom: `${(t / max) * 100}%` }}
              />
            ))}

            <div className="absolute inset-0 flex items-end gap-1.5 px-1 sm:gap-3 sm:px-2">
              {weeks.map((week) => {
                const total = week.onTime + week.late;
                return (
                  <div key={week.key} className="flex h-full min-w-0 flex-1 flex-col justify-end">
                    {total > 0 && (
                      <p className="mb-0.5 text-center text-[11px] font-bold tabular-nums text-navy">
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

      <figcaption className="mt-3 flex flex-wrap items-center gap-4 border-t border-navy/10 pt-3 text-xs text-muted">
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

function Empty({ children }) {
  return <p className="py-8 text-center text-sm text-muted">{children}</p>;
}
