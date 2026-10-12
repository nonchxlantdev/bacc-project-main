/**
 * /api/data/<group>.<op> — one route per repository operation.
 *
 * Reads are GET with the arguments as JSON in `?a=`; writes are POST with
 * `{ "args": {...} }` and the same-origin JSON check (csrf). Every route needs
 * a D1 session. The answer is always `{ "data": <result> }`.
 */
import { HttpError } from '../../api/_shared.js';
import { createDataService } from './service.js';
import { createD1DataStore } from './store.js';
import { READ_OPS, WRITE_OPS } from './ops.js';

export { READ_OPS, WRITE_OPS };

const MAX_QUERY_ARGS = 4000;

export function dataServiceFor(env, forms) {
  if (!env?.DB) throw new HttpError(503, 'Portal database is not configured');
  return createDataService({ store: createD1DataStore(env.DB), forms });
}

export function readArgs(request) {
  const raw = new URL(request.url).searchParams.get('a');
  if (!raw) return {};
  if (raw.length > MAX_QUERY_ARGS) throw new HttpError(400, 'Query arguments are too long');
  let args;
  try {
    args = JSON.parse(raw);
  } catch {
    throw new HttpError(400, 'Query arguments must be JSON');
  }
  if (!args || typeof args !== 'object' || Array.isArray(args)) throw new HttpError(400, 'Query arguments must be an object');
  return args;
}

function writeArgs(body) {
  const args = body?.args ?? {};
  if (!args || typeof args !== 'object' || Array.isArray(args)) throw new HttpError(400, 'args must be an object');
  return args;
}

export function buildDataRoutes({ serviceFor = dataServiceFor } = {}) {
  const routes = {};
  for (const op of READ_OPS) {
    routes[`/api/data/${op}`] = {
      kind: 'json',
      methods: ['GET'],
      auth: { mode: 'session' },
      limit: 600,
      build: async (_body, { env, forms, user: auth, request }) => ({
        data: (await serviceFor(env, forms)[op](auth.user, readArgs(request))) ?? null,
      }),
    };
  }
  for (const op of WRITE_OPS) {
    routes[`/api/data/${op}`] = {
      kind: 'json',
      csrf: true,
      auth: { mode: 'session' },
      limit: 300,
      build: async (body, { env, forms, user: auth }) => ({
        data: (await serviceFor(env, forms)[op](auth.user, writeArgs(body))) ?? null,
      }),
    };
  }
  return routes;
}

export const DATA_ROUTES = buildDataRoutes();
