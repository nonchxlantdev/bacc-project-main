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

// ── Sub-project 2 additions ────────────────────────────────────────────────
const extRoutes = {
  '/api/get-only': { kind: 'json', methods: ['GET'], build: async (body, ctx) => ({ body, hasRequest: ctx.request instanceof Request }) },
  '/api/public': { kind: 'json', auth: { mode: 'public' }, build: async (_b, ctx) => ({ user: ctx.user }) },
  '/api/session-only': { kind: 'json', auth: { mode: 'session' }, build: async (_b, ctx) => ({ role: ctx.user.profile.role }) },
  '/api/csrf': { kind: 'json', csrf: true, auth: { mode: 'public' }, build: async () => ({ ok: true }) },
  '/api/raw': {
    kind: 'response',
    auth: { mode: 'public' },
    build: async () => new Response(null, { status: 204, headers: { 'Set-Cookie': 'x=1' } }),
  },
  '/api/renew': { kind: 'json', build: async () => ({ ok: true }) },
  '/api/coded': { kind: 'json', build: async () => { throw new HttpError(403, 'Password change required', 'PASSWORD_CHANGE_REQUIRED'); } },
};
let extAuthCalls = 0;
const extHandle = createApiHandler({
  routes: extRoutes,
  forms: {},
  authenticate: async (request) => {
    extAuthCalls += 1;
    if (!request.headers.get('authorization')) throw new HttpError(401, 'Not signed in');
    return { user: { id: 'u1' }, profile: { id: 'u1', role: 'om' }, setCookie: 'renewed=1' };
  },
});
function extReq(path, { method = 'POST', body = '{}', auth = true, host = 'bacc.visionforgestudio.app', origin, contentType = 'application/json' } = {}) {
  const headers = new Headers({ 'cf-connecting-ip': `10.1.0.${++ipSeq}` });
  if (auth) headers.set('authorization', 'Bearer t');
  if (origin !== undefined) headers.set('origin', origin);
  if (contentType && method !== 'GET') headers.set('content-type', contentType);
  return new Request(`https://${host}${path}`, { method, headers, body: method === 'GET' ? undefined : body });
}

test('GET routes work, get an empty body and the request in ctx', async () => {
  const res = await extHandle(extReq('/api/get-only', { method: 'GET' }), {});
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { body: {}, hasRequest: true });
});

test('405 lists the route methods in Allow', async () => {
  const res = await extHandle(extReq('/api/get-only', { method: 'POST' }), {});
  assert.equal(res.status, 405);
  assert.equal(res.headers.get('allow'), 'GET');
});

test('public routes never call authenticate', async () => {
  const before = extAuthCalls;
  const res = await extHandle(extReq('/api/public', { auth: false }), {});
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { user: null });
  assert.equal(extAuthCalls, before);
});

test('DEV_SKIP_AUTH does not bypass session-mode routes', async () => {
  const res = await extHandle(extReq('/api/session-only', { auth: false, host: 'localhost:5173' }), { DEV_SKIP_AUTH: '1' });
  assert.equal(res.status, 401);
});

test('csrf routes require same Origin and JSON', async () => {
  const origin = 'https://bacc.visionforgestudio.app';
  assert.equal((await extHandle(extReq('/api/csrf', { origin }), {})).status, 200);
  assert.equal((await extHandle(extReq('/api/csrf', { origin: 'https://evil.example' }), {})).status, 403);
  assert.equal((await extHandle(extReq('/api/csrf'), {})).status, 403);
  assert.equal((await extHandle(extReq('/api/csrf', { origin, contentType: 'text/plain' }), {})).status, 403);
});

test('response-kind routes keep status/headers and gain security headers', async () => {
  const res = await extHandle(extReq('/api/raw', { auth: false }), {});
  assert.equal(res.status, 204);
  assert.equal(res.headers.get('set-cookie'), 'x=1');
  assert.equal(res.headers.get('x-frame-options'), 'DENY');
});

test('a renewal cookie from authenticate is appended to the response', async () => {
  const res = await extHandle(extReq('/api/renew'), {});
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('set-cookie'), 'renewed=1');
});

test('error codes are passed through to the body', async () => {
  const res = await extHandle(extReq('/api/coded'), {});
  assert.equal(res.status, 403);
  assert.deepEqual(await res.json(), { error: 'Password change required', code: 'PASSWORD_CHANGE_REQUIRED' });
});
