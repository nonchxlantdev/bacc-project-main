import test from 'node:test';
import assert from 'node:assert/strict';
import { filterFiledRecords, filterMyChecklists, myChecklistTab } from '../src/lib/checklistCatalogue.js';

const templates = [
  { id: 'annex-a', code: 'PGIA-PMM-F01', title: 'Daily Routine', annex_label: 'Annex A', group: 'Duty Manager' },
  { id: 'attendance', code: 'PGIA-AOM-A5-04', title: 'Attendance List', annex_label: 'A5-04', group: 'SMS' },
];

const row = (over) => ({
  id: over.id,
  template_id: 'annex-a',
  template_code: 'PGIA-PMM-F01',
  inspector_id: 'insp',
  inspector_name: 'Ivy Inspector',
  status: 'submitted',
  inspection_date: '2026-10-01',
  signoffs: [],
  ...over,
});

test('filed records hide drafts, and Returned is a separate filter', () => {
  const submissions = [
    row({ id: '1', status: 'submitted' }),
    row({ id: '2', status: 'acknowledged', inspection_date: '2026-10-20', signoffs: [{ role: 'om_acknowledgment', sign_date: '2026-10-21' }] }),
    row({ id: '3', status: 'draft' }),
    row({ id: '4', status: 'draft', returned: { note: 'fix' }, inspection_date: '2026-10-18' }),
    row({ id: '5', status: 'submitted', inspector_id: 'other', inspector_name: 'Otto' }),
  ];
  const own = filterFiledRecords(submissions, { userId: 'insp', seeAll: false, templates });
  assert.deepEqual(own.map((r) => r.id), ['2', '1']);
  const all = filterFiledRecords(submissions, { userId: 'om', seeAll: true, templates });
  assert.deepEqual(all.map((r) => r.id), ['2', '1', '5']);
  const returned = filterFiledRecords(submissions, { userId: 'om', seeAll: true, status: 'returned', templates });
  assert.deepEqual(returned.map((r) => r.id), ['4']);
});

test('filed-record filters match form, team, inspector, search and dates', () => {
  const submissions = [
    row({ id: '1', inspection_date: '2026-10-01' }),
    row({
      id: '2',
      template_id: 'attendance',
      template_code: 'PGIA-AOM-A5-04',
      inspection_date: '2026-10-22',
      inspector_id: 'other',
      inspector_name: 'Otto Other',
      status: 'acknowledged',
    }),
  ];
  assert.deepEqual(
    filterFiledRecords(submissions, { userId: 'om', seeAll: true, form: 'attendance', templates }).map((r) => r.id),
    ['2'],
  );
  assert.deepEqual(
    filterFiledRecords(submissions, { userId: 'om', seeAll: true, team: 'SMS', templates }).map((r) => r.id),
    ['2'],
  );
  assert.deepEqual(
    filterFiledRecords(submissions, { userId: 'om', seeAll: true, inspector: 'other', templates }).map((r) => r.id),
    ['2'],
  );
  assert.deepEqual(
    filterFiledRecords(submissions, { userId: 'om', seeAll: true, query: 'attendance', templates }).map((r) => r.id),
    ['2'],
  );
  assert.deepEqual(
    filterFiledRecords(submissions, { userId: 'om', seeAll: true, from: '2026-10-10', to: '2026-10-22', templates }).map((r) => r.id),
    ['2'],
  );
});

test('my checklist tabs split drafts, awaiting, returned and completed', () => {
  const submissions = [
    row({ id: 'd', status: 'draft', inspection_date: '2026-10-02' }),
    row({ id: 'r', status: 'draft', returned: { note: 'x' }, inspection_date: '2026-10-03' }),
    row({ id: 's', status: 'submitted', inspection_date: '2026-10-04' }),
    row({ id: 'a', status: 'acknowledged', inspection_date: '2026-10-05' }),
  ];
  assert.equal(myChecklistTab(submissions[1]), 'returned');
  assert.deepEqual(filterMyChecklists(submissions, { tab: 'drafts' }).map((r) => r.id), ['d']);
  assert.deepEqual(filterMyChecklists(submissions, { tab: 'returned' }).map((r) => r.id), ['r']);
  assert.deepEqual(filterMyChecklists(submissions, { tab: 'awaiting' }).map((r) => r.id), ['s']);
  assert.deepEqual(filterMyChecklists(submissions, { tab: 'completed', from: '2026-10-05' }).map((r) => r.id), ['a']);
  assert.deepEqual(filterMyChecklists(submissions, { tab: 'completed', to: '2026-10-04' }).map((r) => r.id), []);
});
