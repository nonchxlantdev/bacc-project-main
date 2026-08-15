import { generatePendingInstances } from '../src/lib/instanceGeneration.js';

export const config = {
  maxDuration: 30,
};

/**
 * Idempotent instance generation. Leave unscheduled — Vercel Cron or pg_cron later.
 * Body: { rules, existing, from, to, nowMs }. Unique (assignment_rule_id, period_start).
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  try {
    const json = await buildGenerateInstances(req.body ?? {});
    res.setHeader('Content-Type', 'application/json');
    res.status(200).json(json);
  } catch (err) {
    res.status(500).json({ error: err?.message ?? 'Instance generation failed' });
  }
}

export async function buildGenerateInstances(body = {}) {
  const nowMs = body.nowMs || Date.now();
  const toYmd = body.to || new Date(nowMs).toISOString().slice(0, 10);
  const created = generatePendingInstances({
    rules: body.rules ?? [],
    existing: body.existing ?? [],
    fromYmd: body.from || '2026-02-01',
    toYmd,
    nowMs,
    idFactory: () => crypto.randomUUID(),
  });
  return { created: created.length, instances: created };
}
