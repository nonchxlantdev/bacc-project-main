import { generatePendingInstances } from '../src/lib/instanceGeneration.js';
import {
  LIMITS,
  capArray,
  enforceBodySize,
  rateLimit,
  requireUser,
  sendError,
} from './_shared.js';

export const config = {
  maxDuration: 30,
};

/**
 * Idempotent instance generation. Requires an authenticated OM/admin session.
 * Body: { rules, existing, from, to, nowMs }. Unique (assignment_rule_id, period_start).
 * from/to are clamped to LIMITS.backfillDays regardless of client input.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  try {
    enforceBodySize(req);
    rateLimit(req, { limit: 10 });
    await requireUser(req, { roles: ['om', 'coo', 'admin'] });
    const json = await buildGenerateInstances(req.body ?? {});
    res.setHeader('Content-Type', 'application/json');
    res.status(200).json(json);
  } catch (err) {
    sendError(res, err);
  }
}

export async function buildGenerateInstances(body = {}) {
  const nowMs = Number(body.nowMs) || Date.now();
  const today = new Date(nowMs).toISOString().slice(0, 10);
  const maxMs = LIMITS.backfillDays * 86400000;
  const earliest = new Date(nowMs - maxMs).toISOString().slice(0, 10);
  let fromYmd = body.from || earliest;
  let toYmd = body.to || today;
  if (fromYmd < earliest) fromYmd = earliest;
  if (toYmd > today) toYmd = today;
  if (fromYmd > toYmd) {
    const err = new Error('from must be on or before to');
    err.status = 400;
    throw err;
  }

  const created = generatePendingInstances({
    rules: capArray(body.rules ?? [], LIMITS.rules, 'rules'),
    existing: capArray(body.existing ?? [], LIMITS.rules * LIMITS.backfillDays, 'existing'),
    fromYmd,
    toYmd,
    nowMs,
    idFactory: () => crypto.randomUUID(),
  });
  return { created: created.length, instances: created };
}
