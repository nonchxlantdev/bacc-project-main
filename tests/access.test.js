import test from 'node:test';
import assert from 'node:assert/strict';
import { can, CAPABILITIES, MANAGERS, ROLES, SCREENS, SUPERVISORS, screenForPath } from '../src/config/access.js';
import { canListUsers, ROLES as AUTH_ROLES } from '../worker/auth/permissions.js';
import {
  MANAGERS as DATA_MANAGERS,
  SUPERVISORS as DATA_SUPERVISORS,
  isManager,
  isSupervisor,
} from '../worker/data/rules.js';

// The access map only decides what the menus offer; the Worker decides what is
// allowed. These tests fail the moment the two stop agreeing, so a menu can
// never again invite someone into a screen the server will refuse.

test('access map knows exactly the roles the server knows', () => {
  assert.deepEqual([...ROLES].sort(), [...AUTH_ROLES].sort());
  assert.deepEqual([...MANAGERS].sort(), [...DATA_MANAGERS].sort());
  assert.deepEqual([...SUPERVISORS].sort(), [...DATA_SUPERVISORS].sort());
});

test('every role: Users screen matches canListUsers', () => {
  for (const role of ROLES) {
    assert.equal(can(role, 'users'), canListUsers({ role }), role);
  }
});

test('every role: org settings match the settings-write rule, seeAll matches SUPERVISORS', () => {
  for (const role of ROLES) {
    assert.equal(can(role, 'orgSettings'), isManager({ role }), `orgSettings ${role}`);
    assert.equal(can(role, 'acknowledge'), isManager({ role }), `acknowledge ${role}`);
    assert.equal(can(role, 'seeAll'), isSupervisor({ role }), `seeAll ${role}`);
    assert.equal(can(role, 'seeAllRecords'), isManager({ role }), `seeAllRecords ${role}`);
  }
});

test('the COO no longer sees settings sections the server will not let them save', () => {
  assert.equal(can({ role: 'coo' }, 'orgSettings'), false);
  assert.equal(can({ role: 'coo' }, 'seeAll'), true);
});

test('everyone signed in gets the shared screens; nobody gets anything without a role', () => {
  for (const key of Object.keys(SCREENS)) {
    if (key === 'users') continue;
    for (const role of ROLES) assert.equal(can(role, key), true, `${role} → ${key}`);
  }
  assert.equal(can(null, 'dashboard'), false);
  assert.equal(can({}, 'dashboard'), false);
  assert.equal(can('admin', 'no-such-screen'), false);
  assert.ok(Object.keys(CAPABILITIES).length > 0);
});

test('screenForPath matches a screen and its children only', () => {
  assert.equal(screenForPath('/users'), 'users');
  assert.equal(screenForPath('/incidents/abc'), 'incidents');
  assert.equal(screenForPath('/checklists/mine'), 'checklistsMine');
  assert.equal(screenForPath('/checklists/123'), null);
  assert.equal(screenForPath('/usersx'), null);
});
