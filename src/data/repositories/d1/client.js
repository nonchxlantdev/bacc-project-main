/**
 * Fetch wrapper for the Worker's /api/data/<op> routes.
 *
 * Reads go as GET with the arguments in `?a=`; writes as same-origin JSON
 * POST `{ args }`. The HttpOnly session cookie travels automatically.
 * Errors carry `status` and `code`, like authClient.
 */
import { READ_OPS } from '../../../../worker/data/ops.js';

const READS = new Set(READ_OPS);
const READ_RETRY_DELAYS = [250, 750];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function httpError(res, payload) {
  const err = new Error(payload?.error || `Request failed (${res.status})`);
  err.status = res.status;
  err.code = payload?.code;
  return err;
}

/** Reads retry on a dropped connection, a 5xx, or a raw D1 error. Writes do not. */
function retryableRead(err) {
  if (!err?.status) return true;
  if (err.status >= 500) return true;
  return String(err.message ?? '').includes('D1_');
}

export async function callData(op, args = {}, { fetchImpl = globalThis.fetch, sleepImpl = sleep } = {}) {
  const isRead = READS.has(op);
  const hasArgs = args && Object.keys(args).length > 0;
  const url = `/api/data/${op}${isRead && hasArgs ? `?a=${encodeURIComponent(JSON.stringify(args))}` : ''}`;
  const init = { method: isRead ? 'GET' : 'POST', credentials: 'same-origin' };
  if (!isRead) {
    init.headers = { 'Content-Type': 'application/json' };
    init.body = JSON.stringify({ args });
  }
  const attempts = isRead ? READ_RETRY_DELAYS.length + 1 : 1;
  let lastErr;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (attempt > 0) await sleepImpl(READ_RETRY_DELAYS[attempt - 1]);
    try {
      const res = await fetchImpl(url, init);
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw httpError(res, payload);
      return payload?.data ?? null;
    } catch (err) {
      lastErr = err;
      if (!isRead || attempt === attempts - 1 || !retryableRead(err)) throw err;
    }
  }
  throw lastErr;
}
