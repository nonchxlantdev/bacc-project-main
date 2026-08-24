import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PEOPLE, buildDirectory } from '../src/data/seed/directory.js';

const seedId = (bucket, n) => `${bucket}-${n}`;
const build = () => buildDirectory(seedId);

test('the directory is the seven BACC staff plus two demo accounts', () => {
  assert.equal(PEOPLE.length, 9);
  assert.equal(PEOPLE.filter((p) => p.is_demo).length, 2);
});

test('every real employee has a pgiabelize address, except the one BACC gave as gmail', () => {
  const real = PEOPLE.filter((p) => !p.is_demo);
  const offDomain = real.filter((p) => !p.email.endsWith('@pgiabelize.com'));
  assert.deepEqual(
    offDomain.map((p) => p.email),
    ['kareemnunez24@gmail.com'],
    'transcribed verbatim from BACCUsers and Departments.xlsx',
  );
});

test('no demo account uses a deliverable address', () => {
  for (const person of PEOPLE.filter((p) => p.is_demo)) {
    assert.ok(person.email.endsWith('@pgia.local'), `${person.email} must not be a real mailbox`);
  }
});

test('Keagan Moore carries the approver flag from the spreadsheet', () => {
  const keagan = build().find((u) => u.email === 'kmoore@pgiabelize.com');
  assert.equal(keagan.is_approver, true);
  assert.equal(keagan.role, 'om');
});

test('Windell Thompson holds the new SMS role', () => {
  const windell = build().find((u) => u.email === 'wthompson@pgiabelize.com');
  assert.equal(windell.role, 'sms');
  assert.equal(windell.department, 'Operations');
});

test('every account can sign in, so each role can be demonstrated', () => {
  assert.ok(build().every((u) => u.can_login === true));
});

test('ids are stable and unique', () => {
  const ids = build().map((u) => u.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(build().map((u) => u.id), ids);
});

test('the two demo accounts are the ones we expect', () => {
  const demo = build().filter((u) => u.is_demo).map((u) => u.full_name);
  assert.deepEqual(demo, ['Shamira Young', 'Glenrick Spain']);
});
