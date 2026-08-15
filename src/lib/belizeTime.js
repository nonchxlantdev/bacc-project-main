/**
 * Airport-local time. PGIA is America/Belize (UTC−6, no DST).
 * Due / due-today / overdue MUST use this helper — never the browser TZ, never UTC calendar dates.
 */

export const AIRPORT_TZ = 'America/Belize';
export const AIRPORT_OFFSET = '-06:00';

const ymdFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: AIRPORT_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function airportYmd(ms) {
  return ymdFmt.format(new Date(ms));
}

export function airportStartMs(ymd) {
  return Date.parse(`${ymd}T00:00:00.000${AIRPORT_OFFSET}`);
}

export function airportEndMs(ymd) {
  return Date.parse(`${ymd}T23:59:59.999${AIRPORT_OFFSET}`);
}

export function airportIso(ymd, time = '12:00:00.000') {
  return `${ymd}T${time}${AIRPORT_OFFSET}`;
}

/** Last calendar day of the month containing `ymd`, in airport local time. */
export function airportMonthEndYmd(ymd) {
  const [y, m] = ymd.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${y}-${String(m).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
}

export function airportMonthStartYmd(ymd) {
  const [y, m] = ymd.split('-').map(Number);
  return `${y}-${String(m).padStart(2, '0')}-01`;
}

export function addAirportDays(ymd, days) {
  const ms = airportStartMs(ymd) + days * 86400000 + 12 * 3600000;
  return airportYmd(ms);
}

export function isDueToday(dueAt, nowMs) {
  return airportYmd(Date.parse(dueAt)) === airportYmd(nowMs);
}

export function isOverdueAt(dueAt, nowMs) {
  return Date.parse(dueAt) < nowMs;
}

export function daysUntilDue(dueAt, nowMs) {
  const dueDay = airportYmd(Date.parse(dueAt));
  const nowDay = airportYmd(nowMs);
  return Math.round((airportStartMs(dueDay) - airportStartMs(nowDay)) / 86400000);
}

export function eachMonthStart(fromYmd, toYmd) {
  const out = [];
  let cursor = airportMonthStartYmd(fromYmd);
  const end = airportMonthStartYmd(toYmd);
  while (cursor <= end) {
    out.push(cursor);
    const [y, m] = cursor.split('-').map(Number);
    const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
    cursor = next;
  }
  return out;
}
