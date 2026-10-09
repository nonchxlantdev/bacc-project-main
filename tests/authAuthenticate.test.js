import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAuthenticator } from '../worker/auth/authenticate.js';
import { createAuthService } from '../worker/auth/service.js';
import { createMemoryAuthStore } from '../worker/auth/store.js';
import { hashPassword } from '../worker/auth/password.js';
import { RENEW_AFTER_MS } from '../worker/auth/session.js';

const T0 = Date.parse('2026-10-08T12:00:00Z');
const is = (status) => (e) => e.status === status;

async function setup() {
  const store = createMemoryAuthStore();
  let clock = T0;
  const svc = createAuthService({ store, now: () => clock });
  const iso = new Date(T0).toISOString();
  for (const [id, email, role, mustChange] of [
    ['a1', 'admin@bacc.bz', 'admin', false],
    ['i1', 'insp@bacc.bz', 'inspector', false],
    ['n1', 'new@bacc.bz', 'inspector', true],
  ]) {
    await store.insertUser({
      id, email, password_hash: await hashPassword('password-1234'), full_name: id, position: '', role,
      department: null, is_active: true, can_login: true, is_approver: false, must_change_password: mustChange,
      failed_login_count: 0, locked_until: null, last_login_at: null, created_at: iso, updated_at: iso,
    });
  }
  const supabaseCalls = [];
  const authenticate = createAuthenticator({
    serviceFor: () => svc,
    supabaseAuth: async (_req, _env, auth) => {
      supabaseCalls.push(auth);
      return { user: { id: 'sb' }, profile: { id: 'sb', role: 'om' } };
    },
  });
  const cookieFor = async (email) => `__Host-bacc_session=${(await svc.login({ email, password: 'password-1234' })).token}`;
  const req = (cookie) => new Request('https://bacc.visionforgestudio.app/api/x', cookie ? { headers: { cookie } } : {});
  return { authenticate, cookieFor, req, supabaseCalls, advance: (ms) => { clock += ms; } };
}

test('public returns null', async () => {
  const { authenticate, req } = await setup();
  assert.equal(await authenticate(req(), {}, { mode: 'public' }), null);
});

test('session mode needs a valid cookie', async () => {
  const { authenticate, req, cookieFor } = await setup();
  await assert.rejects(authenticate(req(), {}, { mode: 'session' }), is(401));
  const ctx = await authenticate(req(await cookieFor('admin@bacc.bz')), {}, { mode: 'session' });
  assert.equal(ctx.user.role, 'admin');
  assert.equal(ctx.profile.role, 'admin');
  assert.match(ctx.sessionId, /^[0-9a-f]{64}$/);
  assert.equal(ctx.setCookie, undefined);
});

test('either mode uses D1 with a cookie, Supabase without', async () => {
  const { authenticate, req, cookieFor, supabaseCalls } = await setup();
  const viaD1 = await authenticate(req(await cookieFor('insp@bacc.bz')), {}, { roles: undefined });
  assert.equal(viaD1.user.id, 'i1');
  assert.equal(supabaseCalls.length, 0);
  const viaSupabase = await authenticate(req(), {}, { roles: ['om'] });
  assert.equal(viaSupabase.user.id, 'sb');
  assert.deepEqual(supabaseCalls, [{ roles: ['om'] }]);
});

test('supabase mode ignores a D1 cookie', async () => {
  const { authenticate, req, cookieFor, supabaseCalls } = await setup();
  const ctx = await authenticate(req(await cookieFor('admin@bacc.bz')), {}, { mode: 'supabase', roles: ['admin'] });
  assert.equal(ctx.user.id, 'sb');
  assert.equal(supabaseCalls.length, 1);
});

test('roles are enforced for D1 sessions', async () => {
  const { authenticate, req, cookieFor } = await setup();
  await assert.rejects(authenticate(req(await cookieFor('insp@bacc.bz')), {}, { mode: 'session', roles: ['admin', 'om'] }), is(403));
});

test('must_change_password blocks everything except allowed routes', async () => {
  const { authenticate, req, cookieFor } = await setup();
  const cookie = await cookieFor('new@bacc.bz');
  await assert.rejects(authenticate(req(cookie), {}, { mode: 'session' }), (e) => e.status === 403 && e.code === 'PASSWORD_CHANGE_REQUIRED');
  await assert.rejects(authenticate(req(cookie), {}, {}), (e) => e.code === 'PASSWORD_CHANGE_REQUIRED');
  const ok = await authenticate(req(cookie), {}, { mode: 'session', allowPasswordChangePending: true });
  assert.equal(ok.user.id, 'n1');
});

test('a sliding renewal returns a fresh cookie to send back', async () => {
  const { authenticate, req, cookieFor, advance } = await setup();
  const cookie = await cookieFor('admin@bacc.bz');
  advance(RENEW_AFTER_MS + 1);
  const ctx = await authenticate(req(cookie), {}, { mode: 'session' });
  assert.equal(ctx.setCookie, `${cookie}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000`);
});
