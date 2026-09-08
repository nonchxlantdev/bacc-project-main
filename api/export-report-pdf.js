import { buildReportPdf } from '../server/reportPdf.js';
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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  try {
    enforceBodySize(req);
    rateLimit(req, { limit: 20 });
    await requireUser(req);
    const body = req.body ?? {};
    const capped = {
      ...body,
      teams: capArray(body.teams ?? [], LIMITS.teams, 'teams'),
      weeks: capArray(body.weeks ?? [], LIMITS.weeks, 'weeks'),
      late: capArray(body.late ?? [], LIMITS.late, 'late'),
    };
    const { bytes, filename } = await buildReportPdf(capped);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.end(Buffer.from(bytes));
  } catch (err) {
    sendError(res, err);
  }
}

export async function buildReportExport(body) {
  return buildReportPdf(body);
}
