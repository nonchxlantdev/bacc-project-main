import { overlayRegisterPdf, incidentToRegisterRow, filterIncidentsForPeriod, currentMonthRange } from '../server/overlayRegisterPdf.js';
import {
  LIMITS,
  capArray,
  enforceBodySize,
  rateLimit,
  readApprovedBasePdf,
  rejectClientBasePdf,
  requireUser,
  resolveFieldMap,
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
    const { bytes, filename } = await buildNocRegisterExport(req.body ?? {});
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.end(Buffer.from(bytes));
  } catch (err) {
    sendError(res, err);
  }
}

export async function buildNocRegisterExport(body) {
  rejectClientBasePdf(body);
  const fieldMap = resolveFieldMap('annex-g-noc-register', 'ed01');
  const basePdfBytes = readApprovedBasePdf(fieldMap);
  const range = currentMonthRange();
  const from = body.from || range.from;
  const to = body.to || range.to;
  const incidents = filterIncidentsForPeriod(
    capArray(body.incidents ?? [], LIMITS.incidents, 'incidents'),
    from,
    to,
  );
  const rows = incidents.map(incidentToRegisterRow);
  const pdfBytes = await overlayRegisterPdf({ basePdfBytes, fieldMap, rows });
  const filename = `PGIA-PMM-F07-NOC-register-${from}_to_${to}.pdf`.replace(/[^\w.\-]+/g, '_');
  return { bytes: pdfBytes, filename };
}
