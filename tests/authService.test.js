import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GENERIC_LOGIN_ERROR, LOCKOUT_MS, createAuthService } from '../worker/auth/service.js';
import { createMemoryAuthStore } from '../worker/auth/store.js';
import { hashPassword } from '../worker/auth/password.js';
import { RENEW_AFTER_MS, SESSION_TTL_MS, hashToken } from '../worker/auth/session.js';

const T0 = Date.parse('2026-10-08T12:00:00Z');
const is = (status) => (e) => e.status === status;

async function setup() {
  const store = createMemoryAuthStore();
  let clock = T0;
  const svc = createAuthService({ store, now: () => clock });
  const advance = (ms) => { clock += ms; };
  const iso = new Date(T0).toISOString();
  await store.insertUser({
    id: 'admin-1', email: 'admin@bacc.bz', password_hash: await hashPassword('admin-password-1'),
    full_name: 'Ada Admin', position: 'Administrator', role: 'admin', department: null,
    is_active: true, can_login: true, is_approver: true, must_change_password: false,
    failed_login_count: 0, locked_until: null, last_login_at: null, created_at: iso, updated_at: iso,
  });
  const admin = (await svc.login({ email: 'admin@bacc.bz', password: 'admin-password-1' })).user;
  return { store, svc, advance, admin };
}

test('login succeeds case-insensitively and returns a public user + token', async () => {
  const { svc } = await setup();
  const { user, token } = await svc.login({ email: '  ADMIN@bacc.bz ', password: 'admin-password-1' });
  assert.equal(user.email, 'admin@bacc.bz');
  assert.equal('password_hash' in user, false);
  assert.equal('failed_login_count' in user, false);
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
});

test('wrong password and unknown email give the same generic 401', async () => {
  const { svc } = await setup();
  await assert.rejects(svc.login({ email: 'admin@bacc.bz', password: 'nope-nope-nope' }), (e) => e.status === 401 && e.message === GENERIC_LOGIN_ERROR);
  await assert.rejects(svc.login({ email: 'ghost@bacc.bz', password: 'nope-nope-nope' }), (e) => e.status === 401 && e.message === GENERIC_LOGIN_ERROR);
  await assert.rejects(svc.login({ email: '', password: '' }), is(400));
});

test('5 failures lock for 15 minutes, even the right password; unlocks after', async () => {
  const { svc, advance } = await setup();
  for (let i = 0; i < 4; i += 1) {
    await assert.rejects(svc.login({ email: 'admin@bacc.bz', password: 'wrong-wrong-1' }), is(401));
  }
  await assert.rejects(svc.login({ email: 'admin@bacc.bz', password: 'wrong-wrong-1' }), (e) => e.status === 429 && /15 minutes/.test(e.message));
  await assert.rejects(svc.login({ email: 'admin@bacc.bz', password: 'admin-password-1' }), is(429));
  advance(LOCKOUT_MS + 1000);
  const ok = await svc.login({ email: 'admin@bacc.bz', password: 'admin-password-1' });
  assert.equal(ok.user.id, 'admin-1');
});

test('a success resets the failure counter', async () => {
  const { svc, store } = await setup();
  await assert.rejects(svc.login({ email: 'admin@bacc.bz', password: 'wrong-wrong-1' }), is(401));
  await svc.login({ email: 'admin@bacc.bz', password: 'admin-password-1' });
  assert.equal((await store.findUserById('admin-1')).failed_login_count, 0);
});

test('sessions authenticate, slide at most once per 24h, and expire', async () => {
  const { svc, store, advance } = await setup();
  const { token } = await svc.login({ email: 'admin@bacc.bz', password: 'admin-password-1' });
  const first = await svc.authenticateSession(token);
  assert.equal(first.user.id, 'admin-1');
  assert.equal(first.renewed, false);
  advance(RENEW_AFTER_MS - 1000);
  assert.equal((await svc.authenticateSession(token)).renewed, false);
  advance(2000);
  const renewed = await svc.authenticateSession(token);
  assert.equal(renewed.renewed, true);
  const row = await store.findSession(await hashToken(token));
  assert.equal(Date.parse(row.expires_at), T0 + RENEW_AFTER_MS + 1000 + SESSION_TTL_MS);
  advance(SESSION_TTL_MS + 1);
  await assert.rejects(svc.authenticateSession(token), is(401));
  assert.equal(await store.findSession(await hashToken(token)), null);
});

test('missing or unknown tokens are 401', async () => {
  const { svc } = await setup();
  await assert.rejects(svc.authenticateSession(null), is(401));
  await assert.rejects(svc.authenticateSession('A'.repeat(43)), is(401));
});

test('logout deletes the session', async () => {
  const { svc } = await setup();
  const { token } = await svc.login({ email: 'admin@bacc.bz', password: 'admin-password-1' });
  const { sessionId } = await svc.authenticateSession(token);
  await svc.logout(sessionId);
  await assert.rejects(svc.authenticateSession(token), is(401));
});

test('createUser: temp password, must_change flag, duplicate email 409', async () => {
  const { svc, admin } = await setup();
  const { user, temporary_password } = await svc.createUser(admin, { email: 'Om@Bacc.bz', full_name: 'Olu Ops', role: 'om', department: 'Operations' });
  assert.equal(user.email, 'om@bacc.bz');
  assert.equal(user.must_change_password, true);
  assert.equal(temporary_password.length, 14);
  const loggedIn = await svc.login({ email: 'om@bacc.bz', password: temporary_password });
  assert.equal(loggedIn.user.must_change_password, true);
  await assert.rejects(svc.createUser(admin, { email: 'om@bacc.bz', full_name: 'Dup' }), is(409));
  await assert.rejects(svc.createUser(admin, { email: 'bad', full_name: 'X' }), is(400));
  await assert.rejects(svc.createUser(admin, { email: 'x@bacc.bz', full_name: ' ' }), is(400));
  await assert.rejects(svc.createUser(admin, { email: 'x@bacc.bz', full_name: 'X', role: 'king' }), is(400));
  await assert.rejects(svc.createUser(admin, { email: 'x@bacc.bz', full_name: 'X', department: 'Finance' }), is(400));
});

test('om cannot create an admin', async () => {
  const { svc, admin } = await setup();
  const { temporary_password } = await svc.createUser(admin, { email: 'om@bacc.bz', full_name: 'Olu Ops', role: 'om' });
  const om = (await svc.login({ email: 'om@bacc.bz', password: temporary_password })).user;
  await assert.rejects(svc.createUser(om, { email: 'new@bacc.bz', full_name: 'New', role: 'admin' }), is(403));
});

test('changePassword: needs current, clears flag, keeps this session, kills others', async () => {
  const { svc, admin } = await setup();
  const { temporary_password } = await svc.createUser(admin, { email: 'om@bacc.bz', full_name: 'Olu Ops', role: 'om' });
  const a = await svc.login({ email: 'om@bacc.bz', password: temporary_password });
  const b = await svc.login({ email: 'om@bacc.bz', password: temporary_password });
  const sa = await svc.authenticateSession(a.token);
  await assert.rejects(svc.changePassword({ userId: a.user.id, sessionId: sa.sessionId, current_password: 'wrong-current', new_password: 'brand-new-pass-1' }), is(400));
  await assert.rejects(svc.changePassword({ userId: a.user.id, sessionId: sa.sessionId, current_password: temporary_password, new_password: 'short' }), is(400));
  await assert.rejects(svc.changePassword({ userId: a.user.id, sessionId: sa.sessionId, current_password: temporary_password, new_password: temporary_password }), is(400));
  const updated = await svc.changePassword({ userId: a.user.id, sessionId: sa.sessionId, current_password: temporary_password, new_password: 'brand-new-pass-1' });
  assert.equal(updated.must_change_password, false);
  assert.equal((await svc.authenticateSession(a.token)).user.id, a.user.id);
  await assert.rejects(svc.authenticateSession(b.token), is(401));
  await svc.login({ email: 'om@bacc.bz', password: 'brand-new-pass-1' });
});

test('deactivation kills sessions and blocks login', async () => {
  const { svc, admin } = await setup();
  const { user, temporary_password } = await svc.createUser(admin, { email: 'i@bacc.bz', full_name: 'Ivy Insp' });
  const s = await svc.login({ email: 'i@bacc.bz', password: temporary_password });
  await svc.updateUser(admin, { id: user.id, is_active: false });
  await assert.rejects(svc.authenticateSession(s.token), is(401));
  await assert.rejects(svc.login({ email: 'i@bacc.bz', password: temporary_password }), is(403));
});

test('resetPassword: new temp, flag set, lock cleared, sessions killed', async () => {
  const { svc, admin } = await setup();
  const { user, temporary_password } = await svc.createUser(admin, { email: 'i@bacc.bz', full_name: 'Ivy Insp' });
  const s = await svc.login({ email: 'i@bacc.bz', password: temporary_password });
  for (let i = 0; i < 5; i += 1) await svc.login({ email: 'i@bacc.bz', password: 'wrong-wrong-1' }).catch(() => {});
  const { temporary_password: next } = await svc.resetPassword(admin, { id: user.id });
  assert.notEqual(next, temporary_password);
  await assert.rejects(svc.authenticateSession(s.token), is(401));
  const again = await svc.login({ email: 'i@bacc.bz', password: next });
  assert.equal(again.user.must_change_password, true);
  await assert.rejects(svc.resetPassword(admin, { id: 'nope' }), is(404));
});

test('updateUser validates, 404s, and maps duplicate email to 409', async () => {
  const { svc, admin } = await setup();
  const one = (await svc.createUser(admin, { email: 'one@bacc.bz', full_name: 'One' })).user;
  await svc.createUser(admin, { email: 'two@bacc.bz', full_name: 'Two' });
  const renamed = await svc.updateUser(admin, { id: one.id, full_name: 'Uno', email: 'UNO@bacc.bz', department: 'Engineering' });
  assert.equal(renamed.full_name, 'Uno');
  assert.equal(renamed.email, 'uno@bacc.bz');
  await assert.rejects(svc.updateUser(admin, { id: one.id, email: 'two@bacc.bz' }), is(409));
  await assert.rejects(svc.updateUser(admin, { id: 'missing', full_name: 'X' }), is(404));
  await assert.rejects(svc.updateUser(admin, { id: one.id, role: 'king' }), is(400));
});

test('listUsers is managers-only and never leaks hashes', async () => {
  const { svc, admin } = await setup();
  const list = await svc.listUsers(admin);
  assert.equal(list.length, 1);
  assert.equal('password_hash' in list[0], false);
  await assert.rejects(svc.listUsers({ id: 'x', role: 'inspector' }), is(403));
});
