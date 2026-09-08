import { overlayChecklistPdf, dataUriToBytes } from '../server/overlayChecklistPdf.js';
import { workOrderToOverlayValues } from '../server/overlayWorkOrderPdf.js';
import {
  LIMITS,
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
    const { bytes, filename } = await buildWorkOrderExport(req.body ?? {});
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.end(Buffer.from(bytes));
  } catch (err) {
    sendError(res, err);
  }
}

export async function buildWorkOrderExport(body) {
  rejectClientBasePdf(body);
  const fieldMap = resolveFieldMap('annex-h-work-order', 'ed01');
  const basePdfBytes = readApprovedBasePdf(fieldMap);
  const wo = body.workOrder ?? body;
  const values = body.values ?? workOrderToOverlayValues(wo);
  const images = {};
  for (const [key, uri] of Object.entries(body.images ?? {})) {
    const bytes = dataUriToBytes(uri);
    if (bytes) images[key] = bytes;
  }
  if (Object.keys(images).length > LIMITS.images) {
    const err = new Error(`images exceeds limit of ${LIMITS.images}`);
    err.status = 400;
    throw err;
  }
  const pdfBytes = await overlayChecklistPdf({
    basePdfBytes,
    fieldMap,
    values,
    images,
    meta: {
      formCode: 'PGIA-PMM-F08',
      templateVersion: fieldMap.templateVersion,
      submissionId: wo.work_order_number || wo.id,
    },
  });
  const filename = `${wo.work_order_number || 'work-order'}.pdf`.replace(/[^\w.\-]+/g, '_');
  return { bytes: pdfBytes, filename };
}
