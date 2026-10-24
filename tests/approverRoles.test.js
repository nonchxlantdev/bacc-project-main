import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { APPROVER_ROLE_BY_CODE, approverRole, isApproverSignoffRole } from '../src/config/approverRoles.js';

const dir = new URL('../src/data/checklists/', import.meta.url);
const schemas = readdirSync(dir)
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(readFileSync(new URL(f, dir), 'utf8')));

test('every mapped OM box exists on that form', () => {
  for (const s of schemas) {
    const role = approverRole(s);
    if (!role) continue;
    assert.ok((s.signoffs ?? []).some((b) => b.role === role), `${s.code}: no "${role}" box`);
  }
});

test('every mapped code is a real form', () => {
  const codes = new Set(schemas.map((s) => s.code));
  for (const code of Object.keys(APPROVER_ROLE_BY_CODE)) assert.ok(codes.has(code), code);
});

test('the confirmed boxes', () => {
  assert.equal(approverRole('PGIA-PMM-F04'), 'om_acknowledgment');
  assert.equal(approverRole('PGIA-PMM-F01'), 'om');
  assert.equal(approverRole('PGIA-CL-VAES-08'), 'supervisor');
  assert.equal(approverRole('PGIA-AOM-A5-06'), 'received_by');
  assert.equal(approverRole('PGIA-PMM-F10'), null);
  assert.equal(approverRole('PGIA-PMM-F11'), null);
});

test('the stored OM role always counts as the approver box', () => {
  assert.equal(isApproverSignoffRole('PGIA-PMM-F10', 'om_acknowledgment'), true);
  assert.equal(isApproverSignoffRole('PGIA-CL-VAES-08', 'supervisor'), true);
  assert.equal(isApproverSignoffRole('PGIA-CL-VAES-08', 'responsible'), false);
});

test('a row signature is never the approver box', () => {
  for (const role of ['row:rows:1:signature', 'row:rows:13:signature', `row:${'a'.repeat(40)}:2:${'b'.repeat(40)}`]) {
    assert.equal(isApproverSignoffRole('PGIA-PMM-F04', role), false, role);
    assert.equal(isApproverSignoffRole('PGIA-CL-VAES-08', role), false, role);
    assert.equal(isApproverSignoffRole({ code: 'PGIA-AOM-A5-04' }, role), false, role);
  }
});
