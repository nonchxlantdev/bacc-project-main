import {
  airportEndMs,
  airportIso,
  airportMonthEndYmd,
  airportYmd,
  eachMonthStart,
  isOverdueAt,
} from './belizeTime.js';

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
    if (rule.frequency !== 'monthly') continue;
    for (const period_start of eachMonthStart(fromYmd, toYmd)) {
      const key = `${rule.id}|${period_start}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const period_end = airportMonthEndYmd(period_start);
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

export { airportEndMs };
