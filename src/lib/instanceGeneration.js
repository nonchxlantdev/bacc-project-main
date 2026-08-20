import {
  addAirportDays,
  airportIso,
  airportMonthEndYmd,
  airportYmd,
  eachDay,
  eachMonthStart,
  eachPeriodStart,
  eachWeekStart,
  isOverdueAt,
} from './belizeTime.js';

/**
 * How each cadence carves the calendar.
 *
 * `starts` lists the period starts in a window; `end` gives the last day of a
 * period. Everything else about generation is identical across cadences, so
 * adding one is a single entry here rather than a new branch.
 *
 * `on_demand` and `ad_hoc` are deliberately absent: they are startable at any
 * time but never scheduled, so they generate nothing.
 *
 * `backfillDays` caps how far back a cadence reaches on a first run. Without
 * it, standing up the scheduler against a six-month window would conjure ~180
 * "missed" daily inspections that nobody was ever asked to do. Low-frequency
 * cadences have no cap — a missed quarterly genuinely is worth surfacing.
 */
const CADENCES = {
  daily: {
    starts: (from, to) => eachDay(from, to),
    end: (start) => start,
    backfillDays: 14,
  },
  weekly: {
    starts: (from, to) => eachWeekStart(from, to),
    end: (start) => addAirportDays(start, 6),
    backfillDays: 56,
  },
  monthly: {
    starts: (from, to) => eachMonthStart(from, to),
    end: (start) => airportMonthEndYmd(start),
  },
  quarterly: {
    starts: (from, to) => eachPeriodStart(from, to, 3),
    end: (start) => airportMonthEndYmd(shiftMonths(start, 2)),
  },
  semi_annual: {
    starts: (from, to) => eachPeriodStart(from, to, 6),
    end: (start) => airportMonthEndYmd(shiftMonths(start, 5)),
  },
  annual: {
    starts: (from, to) => eachPeriodStart(from, to, 12),
    end: (start) => `${start.slice(0, 4)}-12-31`,
  },
};

function shiftMonths(ymd, months) {
  const [y, m] = ymd.split('-').map(Number);
  const total = (m - 1) + months;
  return `${y + Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}-01`;
}

/**
 * Idempotent instance generation: unique (assignment_rule_id, period_start).
 * A job running twice must not double-book.
 */
export function generatePendingInstances({
  rules,
  existing = [],
  fromYmd,
  toYmd,
  nowMs,
  idFactory,
}) {
  const seen = new Set(existing.map((row) => `${row.assignment_rule_id}|${row.period_start}`));
  const created = [];
  let n = 0;

  for (const rule of rules) {
    const cadence = CADENCES[rule.frequency];
    if (!cadence) continue;
    const from = cadence.backfillDays
      ? maxYmd(fromYmd, addAirportDays(toYmd, -cadence.backfillDays))
      : fromYmd;
    for (const period_start of cadence.starts(from, toYmd)) {
      const key = `${rule.id}|${period_start}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const period_end = cadence.end(period_start);
      const due_at = airportIso(period_end, '23:59:59.999');
      n += 1;
      created.push({
        id: idFactory ? idFactory(n) : crypto.randomUUID(),
        template_id: rule.template_id,
        template_version: rule.template_version || 'ed01',
        assignment_rule_id: rule.id,
        assigned_role: rule.role,
        assigned_department: rule.department,
        assigned_user: rule.assigned_user ?? null,
        location_id: rule.location_id ?? null,
        period_start,
        period_end,
        due_at,
        status: 'pending',
        submission_id: null,
        created_at: airportIso(airportYmd(nowMs), '00:05:00.000'),
      });
    }
  }

  return created;
}

function maxYmd(a, b) {
  return a > b ? a : b;
}

export function refreshInstanceStatuses(instances, nowMs) {
  return instances.map((row) => {
    if (row.status === 'submitted' || row.status === 'missed' || row.status === 'in_progress') {
      return row;
    }
    if (row.status === 'pending' && isOverdueAt(row.due_at, nowMs)) {
      const ageDays = (nowMs - Date.parse(row.due_at)) / 86400000;
      return { ...row, status: ageDays > 14 ? 'missed' : 'overdue' };
    }
    if (row.status === 'overdue' && isOverdueAt(row.due_at, nowMs)) {
      const ageDays = (nowMs - Date.parse(row.due_at)) / 86400000;
      if (ageDays > 14) return { ...row, status: 'missed' };
    }
    return row;
  });
}

export function linkSubmissionToInstance(instances, submission) {
  const date = submission.inspection_date || submission.header?.date;
  if (!date) return instances;
  return instances.map((row) => {
    if (row.submission_id) return row;
    if (row.template_id !== submission.template_id) return row;
    if (row.assigned_user && submission.inspector_id && row.assigned_user !== submission.inspector_id) {
      return row;
    }
    if (date >= row.period_start && date <= row.period_end) {
      return { ...row, submission_id: submission.id, status: 'submitted' };
    }
    return row;
  });
}
