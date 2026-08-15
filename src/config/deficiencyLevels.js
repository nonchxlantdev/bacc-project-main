/**
 * Deficiency Level 1–4.
 *
 * The annexes do not define what the levels mean, or whether 1 is most or least
 * severe. Do not encode severity ordering in application logic (no
 * `level <= 2 ? 'urgent'` shortcuts). When BACC supplies definitions, labels,
 * colours, SLA target days, and which levels alert, change only this file.
 *
 * Chart/UI color is a categorical palette (not a light→dark ramp). A sequential
 * ramp would assert an ordering we cannot justify. When BACC defines the scale
 * direction, replace `color` with a correctly-directed sequential ramp here.
 */
import { CATEGORICAL } from './chartPalette.js';

export const DEFICIENCY_LEVELS = [
  { level: 1, label: 'Level 1', color: CATEGORICAL.blue, targetDays: null, alerting: false },
  { level: 2, label: 'Level 2', color: CATEGORICAL.orange, targetDays: null, alerting: false },
  { level: 3, label: 'Level 3', color: CATEGORICAL.green, targetDays: null, alerting: false },
  { level: 4, label: 'Level 4', color: CATEGORICAL.vermillion, targetDays: null, alerting: false },
];

/** Days before target_date to show the amber warning. Not derived from level. */
export const SLA_WARNING_DAYS = 3;

export function getDeficiencyLevel(level) {
  return DEFICIENCY_LEVELS.find((row) => row.level === Number(level)) ?? null;
}

export function slaState(targetDate, now = new Date()) {
  if (!targetDate) return { kind: 'none', remainingDays: null };
  const due = new Date(`${String(targetDate).slice(0, 10)}T23:59:59-06:00`);
  const ms = due.getTime() - (typeof now === 'number' ? now : now.getTime());
  const remainingDays = Math.ceil(ms / 86400000);
  if (remainingDays < 0) return { kind: 'overdue', remainingDays };
  if (remainingDays <= SLA_WARNING_DAYS) return { kind: 'warning', remainingDays };
  return { kind: 'ok', remainingDays };
}
