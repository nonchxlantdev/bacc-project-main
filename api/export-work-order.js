import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { overlayChecklistPdf, dataUriToBytes } from '../server/overlayChecklistPdf.js';
import { workOrderToOverlayValues } from '../server/overlayWorkOrderPdf.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const config = {
  maxDuration: 30,
  api: { bodyParser: { sizeLimit: '12mb' } },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  try {
    const { bytes, filename } = await buildWorkOrderExport(req.body ?? {});
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.end(Buffer.from(bytes));
  } catch (err) {
    res.status(500).json({ error: err?.message ?? 'Work order export failed' });
  }
}

export async function buildWorkOrderExport(body) {
  const fieldMap = body.fieldMap || loadFieldMap();
  const basePdfBytes = body.basePdfBase64
    ? Buffer.from(body.basePdfBase64, 'base64')
    : readFileSync(path.join(root, 'src/assets/forms', fieldMap.basePdf));
  const wo = body.workOrder ?? body;
  const values = body.values ?? workOrderToOverlayValues(wo);
  const images = {};
  for (const [key, uri] of Object.entries(body.images ?? {})) {
    const bytes = dataUriToBytes(uri);
    if (bytes) images[key] = bytes;
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

function loadFieldMap() {
  const file = path.join(root, 'src/data/field-maps/annex-h-work-order-ed01.json');
  return JSON.parse(readFileSync(file, 'utf8'));
}
