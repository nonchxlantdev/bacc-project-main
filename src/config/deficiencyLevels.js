import { getSection } from '../lib/settingsStore.js';

/**
 * Deficiency Level 1–4.
 *
 * The annexes record "Level (1–4)" and define none of it — not what the levels
 * mean, not their response times, not which end of the scale is severe. Those
 * are BACC configuration questions A1 and A2, and they are now answered in
 * Settings → Deficiency Levels rather than hardcoded here.
 *
 * These helpers stay synchronous and keep their signatures: they read the
 * settings cache, which is loaded before the first render. See
 * lib/settingsStore.js for why that cache exists.
 *
 * Still true, and still important: no code infers severity ordering. Anything
 * that needs to know reads `severityRank()`, which returns null until BACC
 * state the direction. A `level <= 2 ? 'urgent'` shortcut would invert urgency
 * across the portal the day the scale turns out to run the other way.
 */

/** The four levels as currently configured. */
export function deficiencyLevels() {
  return getSection('deficiency').levels;
}

export function getDeficiencyLevel(level) {
  return deficiencyLevels().find((row) => row.level === Number(level)) ?? null;
}

/** Days before the target date that the countdown turns amber. */
export function slaWarningDays() {
  return getSection('deficiency').slaWarningDays;
}

/**
 * Position of a level on the severity scale — 1 is most severe, 4 least,
 * whichever way the numbers run. Returns null while the direction is unset, and
 * callers must treat null as "we do not know", not as "not severe".
 */
export function severityRank(level) {
  const { severityOrder } = getSection('deficiency');
  const n = Number(level);
  if (!Number.isFinite(n)) return null;
  if (severityOrder === 'one_highest') return n;
  if (severityOrder === 'four_highest') return 5 - n;
  return null;
}

export function severityOrderIsSet() {
  return getSection('deficiency').severityOrder !== 'unset';
}

/**
 * Where a deficiency stands against its target date.
 *
 * `targetDate` null — which is every incident until BACC set target days —
 * yields `{ kind: 'none' }`, so nothing pretends to count down to a date that
 * was never agreed.
 */
export function slaState(targetDate, now = new Date()) {
  if (!targetDate) return { kind: 'none', remainingDays: null };
  const due = new Date(`${String(targetDate).slice(0, 10)}T23:59:59-06:00`);
  const ms = due.getTime() - (typeof now === 'number' ? now : now.getTime());
  const remainingDays = Math.ceil(ms / 86400000);
  if (remainingDays < 0) return { kind: 'overdue', remainingDays };
  if (remainingDays <= slaWarningDays()) return { kind: 'warning', remainingDays };
  return { kind: 'ok', remainingDays };
}

/**
 * The target date for a deficiency raised today at `level`, or null when that
 * level has no agreed response time yet.
 */
export function targetDateFor(level, fromYmd) {
  const days = getDeficiencyLevel(level)?.targetDays;
  if (days == null || !fromYmd) return null;
  const ms = Date.parse(`${fromYmd}T12:00:00-06:00`) + days * 86400000;
  return new Date(ms).toISOString().slice(0, 10);
}
