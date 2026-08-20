import { AIRPORT_TZ } from './belizeTime.js';

/**
 * Display formatting for airport-local values.
 *
 * PGIA runs on America/Belize (UTC−6, no DST). Everything stored is UTC ISO or
 * a plain YYYY-MM-DD; these render it the way an inspector on the apron reads
 * it, so a record filed at 19:00 local never displays as the following day.
 */

const dateTimeFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: AIRPORT_TZ,
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

const dateFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: AIRPORT_TZ,
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

export function fmtDateTime(value) {
  if (!value) return '—';
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? String(value) : dateTimeFmt.format(ms);
}

/** A bare YYYY-MM-DD is anchored to airport midday so it cannot slip a day. */
export function fmtDate(value) {
  if (!value) return '—';
  const ms = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? `${value}T12:00:00-06:00` : value);
  return Number.isNaN(ms) ? String(value) : dateFmt.format(ms);
}

/**
 * Display precision for coordinates. 5 decimal places is ~1 m at this latitude —
 * already finer than the ±5 m the device reports, so more digits are noise.
 * Stored values keep their full precision; this only affects display.
 */
export function fmtCoord(value) {
  if (value == null || value === '') return '—';
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(5) : String(value);
}
