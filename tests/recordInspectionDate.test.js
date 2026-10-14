import test from 'node:test';
import assert from 'node:assert/strict';
import { recordInspectionDate } from '../src/lib/belizeTime.js';

// 2026-10-14 03:00 UTC is still 2026-10-13 in Belize (UTC−6).
const NOW = Date.parse('2026-10-14T03:00:00Z');

test('keeps a real ISO calendar date', () => {
  assert.equal(recordInspectionDate('2026-09-30', NOW), '2026-09-30');
});

test('free text falls back to the Belize date of now', () => {
  assert.equal(recordInspectionDate('October 13, 2026', NOW), '2026-10-13');
  assert.equal(recordInspectionDate('13/10/2026', NOW), '2026-10-13');
});

test('empty, missing and non-string values fall back too', () => {
  for (const v of ['', '   ', null, undefined, 20261013, {}]) {
    assert.equal(recordInspectionDate(v, NOW), '2026-10-13');
  }
});

test('ISO-shaped but impossible dates fall back', () => {
  assert.equal(recordInspectionDate('2026-02-30', NOW), '2026-10-13');
  assert.equal(recordInspectionDate('2026-13-01', NOW), '2026-10-13');
});

test('result is always 10 characters (the Worker limit)', () => {
  assert.equal(recordInspectionDate('Monday the thirteenth of October', NOW).length, 10);
});
