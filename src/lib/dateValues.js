/**
 * Date and time values as the portal stores them, and as the approved forms print them.
 *
 * Pickers speak ISO (`2026-10-22`, `16:30`, `2026-10-22T16:30`). Paper already in the
 * file is often `22/10/2026` or `4:30pm`. Anything that parses becomes ISO so a
 * picker can show it; anything that does not is left exactly as typed.
 */

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DMY = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/;
const ISO_TIME = /^(\d{2}):(\d{2})$/;
const CLOCK = /^(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)?$/i;

function pad2(n) {
  return String(n).padStart(2, '0');
}

function validDate(year, month, day) {
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${year}-${pad2(m)}-${pad2(d)}`;
}

/** `YYYY-MM-DD`, or null when the text is not a date we recognise. */
export function normalizeDate(value) {
  const s = String(value ?? '').trim();
  const iso = s.match(ISO_DATE);
  if (iso) return validDate(iso[1], iso[2], iso[3]);
  const dmy = s.match(DMY);
  if (dmy) return validDate(dmy[3], dmy[2], dmy[1]);
  return null;
}

/** `HH:MM` on a 24-hour clock, or null. `4:30pm` becomes `16:30`. */
export function normalizeTime(value) {
  const s = String(value ?? '').trim();
  const iso = s.match(ISO_TIME);
  if (iso && Number(iso[1]) <= 23 && Number(iso[2]) <= 59) return `${iso[1]}:${iso[2]}`;
  const clock = s.match(CLOCK);
  if (!clock) return null;
  let hour = Number(clock[1]);
  const minute = Number(clock[2]);
  const suffix = clock[3]?.toLowerCase();
  if (minute > 59) return null;
  if (suffix) {
    if (hour < 1 || hour > 12) return null;
    if (suffix === 'pm' && hour < 12) hour += 12;
    if (suffix === 'am' && hour === 12) hour = 0;
  } else if (hour > 23) {
    return null;
  }
  return `${pad2(hour)}:${pad2(minute)}`;
}

/** `YYYY-MM-DDTHH:MM`, or null. */
export function normalizeDateTime(value) {
  const s = String(value ?? '').trim();
  const combined = s.match(/^(.+?)[ T](.+)$/);
  if (!combined) return null;
  const date = normalizeDate(combined[1]);
  const time = normalizeTime(combined[2]);
  if (!date || !time) return null;
  return `${date}T${time}`;
}

/**
 * The value a picker should hold. Unparseable text is returned unchanged so a
 * later edit cannot wipe a note somebody typed before the field had a picker.
 */
export function normalizeFieldValue(value, type) {
  if (value == null || value === '') return value ?? '';
  if (type === 'date') return normalizeDate(value) ?? value;
  if (type === 'time') return normalizeTime(value) ?? value;
  if (type === 'datetime') return normalizeDateTime(value) ?? value;
  return value;
}

export function isPickerValue(value, type) {
  const s = String(value ?? '');
  if (type === 'date') return ISO_DATE.test(s);
  if (type === 'time') return ISO_TIME.test(s);
  if (type === 'datetime') return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s);
  return false;
}

/** What the approved form is stamped with. Unparseable text is stamped as typed. */
export function formatForPrint(value, type) {
  if (value == null || value === '') return '';
  if (type === 'date') {
    const iso = normalizeDate(value);
    if (!iso) return String(value);
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  }
  if (type === 'time') return normalizeTime(value) ?? String(value);
  if (type === 'datetime') {
    const iso = normalizeDateTime(value);
    if (!iso) return String(value);
    const [date, time] = iso.split('T');
    const [y, m, d] = date.split('-');
    return `${d}/${m}/${y} ${time}`;
  }
  return String(value);
}

function walkFields(schema, visit) {
  for (const field of schema?.headerFields ?? []) visit(field, null);
  for (const field of schema?.summaryFields ?? []) {
    if (field.type === 'table') {
      for (const col of field.columns ?? []) visit(col, field.key);
    } else visit(field, null);
  }
}

/** Rewrite stored header and table cells into picker shape. Leaves the rest alone. */
export function normalizeRecordDates(record) {
  const schema = record?.schema ?? record?.content_schema;
  if (!schema) return record;
  let header = record.header;
  let summary = record.summary;
  let headerChanged = false;
  let summaryChanged = false;

  walkFields(schema, (field, tableKey) => {
    if (field.type !== 'date' && field.type !== 'time' && field.type !== 'datetime') return;
    if (tableKey) {
      const rows = summary?.[tableKey];
      if (!Array.isArray(rows)) return;
      const nextRows = rows.map((row) => {
        const raw = row?.[field.key];
        const next = normalizeFieldValue(raw, field.type);
        if (next === raw) return row;
        summaryChanged = true;
        return { ...row, [field.key]: next };
      });
      if (summaryChanged) summary = { ...summary, [tableKey]: nextRows };
      return;
    }
    const raw = header?.[field.key];
    const next = normalizeFieldValue(raw, field.type);
    if (next === raw) return;
    headerChanged = true;
    header = { ...(header ?? {}), [field.key]: next };
  });

  if (!headerChanged && !summaryChanged) return record;
  return {
    ...record,
    ...(headerChanged ? { header } : {}),
    ...(summaryChanged ? { summary } : {}),
  };
}
