import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEPARTMENTS,
  ROLES,
  canListUsers,
  checkCreateUser,
  checkResetPassword,
  checkUserUpdate,
} from '../worker/auth/permissions.js';

const u = (id, role, extra = {}) => ({ id, role, is_active: true, can_login: true, ...extra });
const admin = u('a1', 'admin');
const admin2 = u('a2', 'admin');
const om = u('o1', 'om');
const inspector = u('i1', 'inspector');
const coo = u('c1', 'coo');
const is = (status) => (e) => e.status === status;

test('role and department lists match the spec', () => {
  assert.deepEqual(ROLES, ['inspector', 'om', 'coo', 'duty_manager', 'apron_supervisor', 'electrical_tech', 'sms', 'admin']);
  assert.deepEqual(DEPARTMENTS, ['Operations', 'Engineering', 'Maintenance']);
});

test('only admin and om can list users', () => {
  assert.equal(canListUsers(admin), true);
  assert.equal(canListUsers(om), true);
  assert.equal(canListUsers(coo), false);
  assert.equal(canListUsers(inspector), false);
  assert.equal(canListUsers(null), false);
});

test('create: admin/om may create non-admins; only admin may create admin', () => {
  checkCreateUser(admin, { role: 'inspector' });
  checkCreateUser(admin, { role: 'admin' });
  checkCreateUser(om, { role: 'duty_manager' });
  assert.throws(() => checkCreateUser(om, { role: 'admin' }), is(403));
  assert.throws(() => checkCreateUser(coo, { role: 'inspector' }), is(403));
  assert.throws(() => checkCreateUser(inspector, { role: 'inspector' }), is(403));
});

test('update: managers edit ordinary users', () => {
  checkUserUpdate(om, inspector, { role: 'duty_manager', is_active: false }, { activeAdminCount: 1 });
  checkUserUpdate(admin, om, { position: 'Ops lead' }, { activeAdminCount: 1 });
});

test('update: non-managers are refused', () => {
  assert.throws(() => checkUserUpdate(coo, inspector, { position: 'x' }, { activeAdminCount: 1 }), is(403));
});

test('update: om cannot touch an admin or promote to admin', () => {
  assert.throws(() => checkUserUpdate(om, admin, { position: 'x' }, { activeAdminCount: 2 }), is(403));
  assert.throws(() => checkUserUpdate(om, inspector, { role: 'admin' }, { activeAdminCount: 1 }), is(403));
  checkUserUpdate(admin, inspector, { role: 'admin' }, { activeAdminCount: 1 });
});

test('update: nobody changes their own role or access', () => {
  assert.throws(() => checkUserUpdate(admin, admin, { role: 'om' }, { activeAdminCount: 2 }), is(403));
  assert.throws(() => checkUserUpdate(om, om, { is_active: false }, { activeAdminCount: 1 }), is(403));
  assert.throws(() => checkUserUpdate(om, om, { can_login: false }, { activeAdminCount: 1 }), is(403));
  // Same values are not a change:
  checkUserUpdate(om, om, { role: 'om', is_active: true, full_name: 'New Name' }, { activeAdminCount: 1 });
});

test('update: the last active admin cannot be removed', () => {
  assert.throws(() => checkUserUpdate(admin, admin2, { is_active: false }, { activeAdminCount: 1 }), is(409));
  assert.throws(() => checkUserUpdate(admin, admin2, { role: 'om' }, { activeAdminCount: 1 }), is(409));
  assert.throws(() => checkUserUpdate(admin, admin2, { can_login: false }, { activeAdminCount: 1 }), is(409));
  checkUserUpdate(admin, admin2, { is_active: false }, { activeAdminCount: 2 });
});

test('reset password: managers only, never self, only admin resets an admin', () => {
  checkResetPassword(admin, om);
  checkResetPassword(om, inspector);
  checkResetPassword(admin, admin2);
  assert.throws(() => checkResetPassword(om, admin), is(403));
  assert.throws(() => checkResetPassword(coo, inspector), is(403));
  assert.throws(() => checkResetPassword(om, om), is(400));
});
