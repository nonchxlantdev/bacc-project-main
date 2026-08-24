import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROLE_TITLES, roleTitle, unstaffedRoles } from '../src/lib/roleStaffing.js';

const ASSIGNMENTS = [
  { department: 'Operations', role: 'om' },
  { department: 'Operations', role: 'duty_manager' },
  { department: 'Operations', role: 'apron_supervisor' },
  { department: 'Operations', role: 'cfr' },
  { department: 'Operations', role: 'coo' },
  { department: 'Engineering', role: 'electrical_tech' },
  { department: 'Engineering', role: 'cec' },
  { department: 'Maintenance', role: 'inspector' },
];

const STAFF = [
  { role: 'om' },
  { role: 'duty_manager' },
  { role: 'apron_supervisor' },
  { role: 'sms' },
];

const DEMO = { role: 'electrical_tech', is_demo: true };

test('a role held by a real employee is staffed', () => {
  const gaps = unstaffedRoles({ assignments: ASSIGNMENTS, users: STAFF });
  assert.ok(!gaps.includes('om'));
  assert.ok(!gaps.includes('apron_supervisor'));
});

test('a role no employee holds is reported, sorted', () => {
  const gaps = unstaffedRoles({ assignments: ASSIGNMENTS, users: STAFF });
  assert.deepEqual(gaps, ['cec', 'cfr', 'coo', 'electrical_tech', 'inspector']);
});

test('a demo account does not make a post look filled', () => {
  const gaps = unstaffedRoles({ assignments: ASSIGNMENTS, users: [...STAFF, DEMO] });
  assert.ok(gaps.includes('electrical_tech'), 'Glenrick is Vision Forge, not PGIA staff');
});

test('a role nothing is assigned to is not a gap', () => {
  const gaps = unstaffedRoles({ assignments: ASSIGNMENTS, users: STAFF });
  assert.ok(!gaps.includes('sms'), 'sms holds no assignment rule yet');
});

test('every role named by an assignment has a printable title', () => {
  for (const { role } of ASSIGNMENTS) {
    assert.equal(typeof ROLE_TITLES[role], 'string', `no title for ${role}`);
  }
  assert.equal(roleTitle('cfr'), 'Crash Fire & Rescue');
  assert.equal(roleTitle('nonsense'), 'nonsense');
});
