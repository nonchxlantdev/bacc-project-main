import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApiHandler, SECURITY_HEADERS } from '../worker/http.js';
import { HttpError, LIMITS } from '../api/_shared.js';

const routes = {
  '/api/pdf': {
    kind: 'pdf',
    build: async () => ({ bytes: new Uint8Array([37, 80, 68, 70, 45]), filename: 'x.pdf' }),
  },
  '/api/json': {
    kind: 'json',
    auth: { roles: ['admin'] },
    build: async (body, ctx) => ({ echo: body, role: ctx.user.profile.role, hasForms: Boolean(ctx.forms) }),
  },
  '/api/boom': { kind: 'json', build: async () => { throw new Error('kaboom'); } },
  '/api/teapot': { kind: 'json', build: async () => { throw new HttpError(418, 'short and stout'); } },
  '/api/limited': { kind: 'json', limit: 2, build: async () => ({ ok: true }) },
};

const seenAuth = [];
async function authenticate(request, env, auth) {
  seenAuth.push(auth);
  if (!request.headers.get('authorization')) throw new HttpError(401, 'Missing Authorization bearer token');
  return { user: { id: 'u1' }, profile: { id: 'u1', role: 'admin' } };
}

const handle = createApiHandler({ routes, forms: { marker: true }, authenticate });

let ipSeq = 0;
function req(path, { method = 'POST', body = '{}', auth = true, host = 'bacc.visionforgestudio.app', ip } = {}) {
  const headers = new Headers({ 'cf-connecting-ip': ip ?? `10.0.0.${++ipSeq}` });
  if (auth) headers.set('authorization', 'Bearer t');
  return new Request(`https://${host}${path}`, {
    method,
    headers,
    body: method === 'GET' || method === 'HEAD' ? undefined : body,
  });
}

test('404 JSON for an unknown /api path', async () => {
  const res = await handle(req('/api/nope'), {});
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), { error: 'Not found' });
});

test('405 with Allow: POST for other methods', async () => {
  const res = await handle(req('/api/pdf', { method: 'GET' }), {});
  assert.equal(res.status, 405);
  assert.equal(res.headers.get('allow'), 'POST');
  assert.equal(typeof (await res.json()).error, 'string');
});

test('413 when the body exceeds LIMITS.bodyBytes', async () => {
  const res = await handle(req('/api/json', { body: 'x'.repeat(LIMITS.bodyBytes + 1) }), {});
  assert.equal(res.status, 413);
});

test('401 without a bearer token', async () => {
  const res = await handle(req('/api/json', { auth: false }), {});
  assert.equal(res.status, 401);
  assert.deepEqual(await res.json(), { error: 'Missing Authorization bearer token' });
});

test('route auth options reach authenticate()', async () => {
  seenAuth.length = 0;
  await handle(req('/api/json'), {});
  assert.deepEqual(seenAuth.at(-1), { roles: ['admin'] });
  await handle(req('/api/pdf'), {});
  assert.deepEqual(seenAuth.at(-1), {});
});

test('400 on malformed JSON and on non-object bodies', async () => {
  assert.equal((await handle(req('/api/json', { body: '{not json' }), {})).status, 400);
  assert.equal((await handle(req('/api/json', { body: '[1,2]' }), {})).status, 400);
  assert.equal((await handle(req('/api/json', { body: 'null' }), {})).status, 400);
});

test('empty body is treated as {}', async () => {
  const res = await handle(req('/api/json', { body: '' }), {});
  assert.equal(res.status, 200);
  assert.deepEqual((await res.json()).echo, {});
});

test('PDF route returns bytes as an attachment with security headers', async () => {
  const res = await handle(req('/api/pdf'), {});
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'application/pdf');
  assert.equal(res.headers.get('content-disposition'), 'attachment; filename="x.pdf"');
  assert.equal(res.headers.get('cache-control'), 'no-store');
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) assert.equal(res.headers.get(k), v, k);
  assert.equal(new TextDecoder().decode(new Uint8Array(await res.arrayBuffer())), '%PDF-');
});

test('JSON route gets body, user and forms in ctx', async () => {
  const res = await handle(req('/api/json', { body: '{"a":1}' }), {});
  assert.deepEqual(await res.json(), { echo: { a: 1 }, role: 'admin', hasForms: true });
  assert.equal(res.headers.get('x-frame-options'), 'DENY');
});

test('unexpected errors become 500 { error }', async () => {
  const res = await handle(req('/api/boom'), {});
  assert.equal(res.status, 500);
  assert.deepEqual(await res.json(), { error: 'kaboom' });
});

test('HttpError status passes through', async () => {
  const res = await handle(req('/api/teapot'), {});
  assert.equal(res.status, 418);
  assert.deepEqual(await res.json(), { error: 'short and stout' });
});

test('per-route rate limit returns 429 once exceeded for one IP', async () => {
  const ip = '10.9.9.9';
  assert.equal((await handle(req('/api/limited', { ip }), {})).status, 200);
  assert.equal((await handle(req('/api/limited', { ip }), {})).status, 200);
  assert.equal((await handle(req('/api/limited', { ip }), {})).status, 429);
  assert.equal((await handle(req('/api/limited', { ip: '10.9.9.10' }), {})).status, 200);
});

test('DEV_SKIP_AUTH only works on localhost', async () => {
  const env = { DEV_SKIP_AUTH: '1' };
  const local = await handle(req('/api/json', { auth: false, host: 'localhost:5173' }), env);
  assert.equal(local.status, 200);
  assert.equal((await local.json()).role, 'admin');
  const loopback = await handle(req('/api/json', { auth: false, host: '127.0.0.1:5173' }), env);
  assert.equal(loopback.status, 200);
  const prod = await handle(req('/api/json', { auth: false }), env);
  assert.equal(prod.status, 401);
  const offLocal = await handle(req('/api/json', { auth: false, host: 'localhost:5173' }), {});
  assert.equal(offLocal.status, 401);
});
