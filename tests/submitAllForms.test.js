import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { validateRecordPayload } from '../worker/data/rules.js';
import { recordInspectionDate } from '../src/lib/belizeTime.js';

const dir = new URL('../src/data/checklists/', import.meta.url);
const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
const NOW = Date.parse('2026-10-13T18:00:00Z');
const FREE_TEXT_DATE = 'October 13, 2026 (morning)';

const isDateLike = (f) => f.type === 'date' || /date/i.test(f.label ?? '') || /date/i.test(f.key ?? '');

/** What ChecklistDetailPage sends on Submit, with a free-text value in every date-like box. */
function submittedRecord(schema, file) {
  const header = {};
  for (const f of schema.headerFields ?? []) header[f.key] = isDateLike(f) ? FREE_TEXT_DATE : 'x';
  return {
    id: randomUUID(),
    template_id: file.replace(/\.json$/, ''),
    template_version: 'ed01',
    status: 'submitted',
    locked: true,
    header,
    items: {},
    signoffs: [],
    inspection_type: header.inspectionType ?? 'monthly_routine',
    inspection_date: recordInspectionDate(header.date, NOW),
    submitted_at: new Date(NOW).toISOString(),
  };
}

test('checklist schemas are present', () => {
  assert.ok(files.length >= 36, `expected ≥36 schemas, found ${files.length}`);
});

for (const file of files) {
  test(`${file}: submits with free-text dates`, () => {
    const schema = JSON.parse(readFileSync(new URL(file, dir), 'utf8'));
    const out = validateRecordPayload(submittedRecord(schema, file));
    assert.equal(out.status, 'submitted');
    assert.match(out.inspection_date, /^\d{4}-\d{2}-\d{2}$/);
  });
}

test('control: the raw free-text date is what the Worker rejects', () => {
  const schema = JSON.parse(readFileSync(new URL('wildlife-incursion-report-movement-area.json', dir), 'utf8'));
  const rec = { ...submittedRecord(schema, 'wildlife-incursion-report-movement-area.json'), inspection_date: FREE_TEXT_DATE };
  assert.throws(() => validateRecordPayload(rec), (err) => err.status === 400);
});
