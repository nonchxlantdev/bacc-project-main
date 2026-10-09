import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { authClient, usersAdminClient } from '../src/lib/authClient.js';

let calls;
function mockFetch(responses) {
  calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url, ...init });
    const { status = 200, body } = responses.shift();
    return new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  };
}
beforeEach(() => { calls = []; });

test('login posts JSON same-origin and returns the user', async () => {
  mockFetch([{ body: { user: { id: 'u1' } } }]);
  assert.deepEqual(await authClient.login('a@b.bz', 'pw-1234567'), { id: 'u1' });
  assert.equal(calls[0].url, '/api/auth/login');
  assert.equal(calls[0].method, 'POST');
  assert.equal(calls[0].credentials, 'same-origin');
  assert.equal(calls[0].headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(calls[0].body), { email: 'a@b.bz', password: 'pw-1234567' });
});

test('errors carry status, code and the server message', async () => {
  mockFetch([{ status: 429, body: { error: 'Too many attempts. Try again in 15 minutes.', code: 'LOCKED' } }]);
  await assert.rejects(authClient.login('a@b.bz', 'x'), (e) => e.status === 429 && e.code === 'LOCKED' && e.message.startsWith('Too many'));
});

test('me returns null on 401 and the user otherwise', async () => {
  mockFetch([{ status: 401, body: { error: 'Not signed in' } }, { body: { user: { id: 'u2' } } }]);
  assert.equal(await authClient.me(), null);
  assert.deepEqual(await authClient.me(), { id: 'u2' });
  assert.equal(calls[0].method, 'GET');
  assert.equal(calls[0].body, undefined);
});

test('logout tolerates 204', async () => {
  mockFetch([{ status: 204 }]);
  await authClient.logout();
  assert.equal(calls[0].url, '/api/auth/logout');
});

test('changePassword sends current and new', async () => {
  mockFetch([{ body: { user: { id: 'u1', must_change_password: false } } }]);
  const user = await authClient.changePassword('old-password-1', 'new-password-1');
  assert.equal(user.must_change_password, false);
  assert.deepEqual(JSON.parse(calls[0].body), { current_password: 'old-password-1', new_password: 'new-password-1' });
});

test('users admin client hits the right endpoints', async () => {
  mockFetch([
    { body: { users: [{ id: 'a' }] } },
    { status: 201, body: { user: { id: 'n' }, temporary_password: 'Temp' } },
    { body: { user: { id: 'n', role: 'om' } } },
    { body: { temporary_password: 'Next' } },
  ]);
  assert.deepEqual(await usersAdminClient.list(), [{ id: 'a' }]);
  assert.deepEqual(await usersAdminClient.create({ email: 'n@b.bz' }), { user: { id: 'n' }, temporary_password: 'Temp' });
  assert.deepEqual(await usersAdminClient.update({ id: 'n', role: 'om' }), { id: 'n', role: 'om' });
  assert.equal(await usersAdminClient.resetPassword('n'), 'Next');
  assert.deepEqual(calls.map((c) => [c.method, c.url]), [
    ['GET', '/api/users'],
    ['POST', '/api/users/create'],
    ['POST', '/api/users/update'],
    ['POST', '/api/users/reset-password'],
  ]);
});
