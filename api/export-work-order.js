import { overlayChecklistPdf, dataUriToBytes } from '../server/overlayChecklistPdf.js';
import { workOrderToOverlayValues } from '../server/overlayWorkOrderPdf.js';
import { HttpError, LIMITS, rejectClientBasePdf } from './_shared.js';

/** POST /api/export-work-order */
export async function buildWorkOrderExport(body, { forms }) {
  rejectClientBasePdf(body);
  const fieldMap = forms.resolveFieldMap('annex-h-work-order', 'ed01');
  const basePdfBytes = forms.readApprovedBasePdf(fieldMap);
  const wo = body.workOrder ?? body;
  const values = body.values ?? workOrderToOverlayValues(wo);
  const images = {};
  for (const [key, uri] of Object.entries(body.images ?? {})) {
    const bytes = dataUriToBytes(uri);
    if (bytes) images[key] = bytes;
  }
  if (Object.keys(images).length > LIMITS.images) {
    throw new HttpError(400, `images exceeds limit of ${LIMITS.images}`);
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
