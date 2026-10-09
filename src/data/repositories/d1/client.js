/**
 * Fetch wrapper for the Worker's /api/data/<op> routes.
 *
 * Reads go as GET with the arguments in `?a=`; writes as same-origin JSON
 * POST `{ args }`. The HttpOnly session cookie travels automatically.
 * Errors carry `status` and `code`, like authClient.
 */
import { READ_OPS } from '../../../../worker/data/ops.js';

const READS = new Set(READ_OPS);

export async function callData(op, args = {}, { fetchImpl = globalThis.fetch } = {}) {
  const isRead = READS.has(op);
  const hasArgs = args && Object.keys(args).length > 0;
  const url = `/api/data/${op}${isRead && hasArgs ? `?a=${encodeURIComponent(JSON.stringify(args))}` : ''}`;
  const init = { method: isRead ? 'GET' : 'POST', credentials: 'same-origin' };
  if (!isRead) {
    init.headers = { 'Content-Type': 'application/json' };
    init.body = JSON.stringify({ args });
  }
  const res = await fetchImpl(url, init);
  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const err = new Error(payload?.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.code = payload?.code;
    throw err;
  }
  return payload?.data ?? null;
}
