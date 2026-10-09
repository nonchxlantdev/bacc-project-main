import { generatePendingInstances } from '../src/lib/instanceGeneration.js';
import { HttpError, LIMITS, capArray } from './_shared.js';

/**
 * POST /api/generate-checklist-instances — OM/COO/admin only (enforced by the
 * route's auth.roles in worker/index.js). Idempotent. Body:
 * { rules, existing, from, to, nowMs }. from/to are clamped to
 * LIMITS.backfillDays regardless of client input.
 */
export async function buildGenerateInstances(body = {}) {
  const nowMs = Number(body.nowMs) || Date.now();
  const today = new Date(nowMs).toISOString().slice(0, 10);
  const maxMs = LIMITS.backfillDays * 86400000;
  const earliest = new Date(nowMs - maxMs).toISOString().slice(0, 10);
  let fromYmd = body.from || earliest;
  let toYmd = body.to || today;
  if (fromYmd < earliest) fromYmd = earliest;
  if (toYmd > today) toYmd = today;
  if (fromYmd > toYmd) throw new HttpError(400, 'from must be on or before to');

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
