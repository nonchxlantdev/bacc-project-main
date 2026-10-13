import { test } from 'node:test';
import assert from 'node:assert/strict';
import { teamOpenDrafts } from '../src/lib/openDrafts.js';

const om = { id: 'u-om', role: 'om' };
const canDelete = (row) => row.status === 'draft';
const rows = [
  { id: 'mine', inspector_id: 'u-om', status: 'draft' },
  { id: 'theirs', inspector_id: 'u-insp', status: 'draft' },
  { id: 'filed', inspector_id: 'u-insp', status: 'submitted' },
];

test('All Checklists open drafts leave out my own drafts (they live in My Checklists)', () => {
  assert.deepEqual(teamOpenDrafts(rows, om, canDelete).map((r) => r.id), ['theirs']);
});

test('only deletable drafts are listed', () => {
  assert.ok(!teamOpenDrafts(rows, om, canDelete).some((r) => r.id === 'filed'));
});

test('no profile means nothing listed', () => {
  assert.deepEqual(teamOpenDrafts(rows, null, canDelete), []);
});
