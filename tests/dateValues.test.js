import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatForPrint,
  normalizeDate,
  normalizeDateTime,
  normalizeFieldValue,
  normalizeRecordDates,
  normalizeTime,
} from '../src/lib/dateValues.js';

test('dates already in ISO stay, and day-first dates become ISO', () => {
  assert.equal(normalizeDate('2026-10-22'), '2026-10-22');
  assert.equal(normalizeDate('22/10/2026'), '2026-10-22');
  assert.equal(normalizeDate('22-10-2026'), '2026-10-22');
  assert.equal(normalizeDate('4/5/2026'), '2026-05-04');
});

test('a date that is not a date is left for the caller', () => {
  assert.equal(normalizeDate('October 13, 2026 (morning)'), null);
  assert.equal(normalizeFieldValue('October 13, 2026 (morning)', 'date'), 'October 13, 2026 (morning)');
  assert.equal(normalizeDate('31/02/2026'), null);
});

test('times accept 24-hour and am/pm', () => {
  assert.equal(normalizeTime('16:30'), '16:30');
  assert.equal(normalizeTime('4:30pm'), '16:30');
  assert.equal(normalizeTime('4:30 PM'), '16:30');
  assert.equal(normalizeTime('12:00am'), '00:00');
  assert.equal(normalizeTime('12:15pm'), '12:15');
  assert.equal(normalizeTime('not a time'), null);
});

test('datetime joins a date and a time', () => {
  assert.equal(normalizeDateTime('2026-10-22T16:30'), '2026-10-22T16:30');
  assert.equal(normalizeDateTime('22/10/2026 4:30pm'), '2026-10-22T16:30');
  assert.equal(normalizeDateTime('22-10-2026 16:30'), '2026-10-22T16:30');
  assert.equal(normalizeFieldValue('sometime yesterday', 'datetime'), 'sometime yesterday');
});

test('print format is day-first, and an unparseable value is stamped as typed', () => {
  assert.equal(formatForPrint('2026-10-22', 'date'), '22/10/2026');
  assert.equal(formatForPrint('22/10/2026', 'date'), '22/10/2026');
  assert.equal(formatForPrint('4:30pm', 'time'), '16:30');
  assert.equal(formatForPrint('2026-10-22T16:30', 'datetime'), '22/10/2026 16:30');
  assert.equal(formatForPrint('see notes', 'date'), 'see notes');
  assert.equal(formatForPrint('ordinary', 'text'), 'ordinary');
});

test('loading a record rewrites saved dates and leaves everything else', () => {
  const record = normalizeRecordDates({
    schema: {
      headerFields: [
        { key: 'date', type: 'date' },
        { key: 'timeStart', type: 'time' },
        { key: 'personnel', type: 'text' },
      ],
      summaryFields: [
        {
          key: 'rows',
          type: 'table',
          columns: [{ key: 'date_and_time', type: 'datetime' }, { key: 'description', type: 'text' }],
        },
      ],
    },
    header: { date: '22/10/2026', timeStart: '4:30pm', personnel: 'A. Smith' },
    summary: { rows: [{ date_and_time: '22-10-2026 16:30', description: 'kept' }] },
  });
  assert.equal(record.header.date, '2026-10-22');
  assert.equal(record.header.timeStart, '16:30');
  assert.equal(record.header.personnel, 'A. Smith');
  assert.equal(record.summary.rows[0].date_and_time, '2026-10-22T16:30');
  assert.equal(record.summary.rows[0].description, 'kept');
});
