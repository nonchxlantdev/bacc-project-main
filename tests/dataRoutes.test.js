import test from 'node:test';
import assert from 'node:assert/strict';
import { createApiHandler } from '../worker/http.js';
import { HttpError } from '../api/_shared.js';
import { DATA_ROUTES, READ_OPS, WRITE_OPS } from '../worker/data/routes.js';
import { createDataService } from '../worker/data/service.js';
import { createD1DataStore } from '../worker/data/store.js';
import { createSqliteD1, insertTestUser } from './helpers/sqliteD1.js';

const ORIGIN = 'https://bacc.visionforgestudio.app';
const forms = { templateKeys: new Set(['annex-d-drainage']), loadSchema: () => ({ title: 'Drainage' }) };
const db = createSqliteD1();
const people = {
  insp: await insertTestUser(db, { id: 'insp', role: 'inspector' }),
  om: await insertTestUser(db, { id: 'om', role: 'om' }),
};
const env = { DB: db };

const seenModes = new Set();
async function authenticate(request, _env, auth) {
  seenModes.add(auth.mode);
  if (auth.mode !== 'session') throw new HttpError(500, 'data routes must require a session');
  const id = request.headers.get('x-test-user');
  if (!id) throw new HttpError(401, 'Sign in required');
  return { user: people[id], profile: people[id] };
}

const handle = createApiHandler({ routes: DATA_ROUTES, forms, authenticate });
let ip = 0;
function req(op, { method = 'POST', args, user = 'insp', origin = ORIGIN, type = 'application/json', query } = {}) {
  const headers = new Headers({ 'cf-connecting-ip': `10.9.0.${++ip}` });
  if (user) headers.set('x-test-user', user);
  if (origin) headers.set('origin', origin);
  if (method !== 'GET') headers.set('content-type', type);
  const qs = query ?? (method === 'GET' && args ? `?a=${encodeURIComponent(JSON.stringify(args))}` : '');
  return new Request(`${ORIGIN}/api/data/${op}${qs}`, {
    method,
    headers,
    body: method === 'GET' ? undefined : JSON.stringify({ args: args ?? {} }),
  });
}

test('every op in the route tables exists on the service', () => {
  const svc = createDataService({ store: createD1DataStore(db), forms });
  for (const op of [...READ_OPS, ...WRITE_OPS]) assert.equal(typeof svc[op], 'function', op);
  assert.equal(Object.keys(DATA_ROUTES).length, READ_OPS.length + WRITE_OPS.length);
});

test('unknown op is 404; GET on a write op and POST on a read op are 405', async () => {
  assert.equal((await handle(req('checklists.nope'), env)).status, 404);
  assert.equal((await handle(req('checklists.persist', { method: 'GET' }), env)).status, 405);
  assert.equal((await handle(req('checklists.listAll'), env)).status, 405);
});

test('no session is 401', async () => {
  assert.equal((await handle(req('checklists.listAll', { method: 'GET', user: null }), env)).status, 401);
});

test('cross-site or non-JSON writes are blocked', async () => {
  assert.equal((await handle(req('settings.save', { user: 'om', origin: 'https://evil.example' }), env)).status, 403);
  assert.equal((await handle(req('settings.save', { user: 'om', type: 'text/plain' }), env)).status, 403);
});

test('write then read round-trips through { args } and ?a=', async () => {
  const record = {
    id: '55555555-5555-4555-8555-555555555555',
    template_id: 'annex-d-drainage',
    status: 'draft',
    header: { date: '2026-10-09' },
    items: { A1: { result: 'sat', remarks: '' } },
  };
  const saved = await handle(req('checklists.persist', { args: { record } }), env);
  assert.equal(saved.status, 200);
  assert.equal((await saved.json()).data.id, record.id);
  const got = await handle(req('checklists.get', { method: 'GET', args: { id: record.id } }), env);
  assert.equal((await got.json()).data.header.date, '2026-10-09');
  const missing = await handle(req('checklists.get', { method: 'GET', args: { id: '99999999-9999-4999-8999-999999999999' } }), env);
  assert.deepEqual(await missing.json(), { data: null });
});

test('service errors keep their status; bad query args are 400', async () => {
  const res = await handle(req('settings.save', { args: { section: 'x', value: 1 } }), env);
  assert.equal(res.status, 403);
  assert.equal((await handle(req('checklists.get', { method: 'GET', query: '?a=not-json' }), env)).status, 400);
});

test('missing D1 binding is 503', async () => {
  assert.equal((await handle(req('settings.get', { method: 'GET' }), {})).status, 503);
  assert.deepEqual([...seenModes], ['session']);
});
