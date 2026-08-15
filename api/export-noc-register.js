import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { overlayRegisterPdf, incidentToRegisterRow, filterIncidentsForPeriod, currentMonthRange } from '../server/overlayRegisterPdf.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const config = {
  maxDuration: 30,
  api: { bodyParser: { sizeLimit: '8mb' } },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  try {
    const { bytes, filename } = await buildNocRegisterExport(req.body ?? {});
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.end(Buffer.from(bytes));
  } catch (err) {
    res.status(500).json({ error: err?.message ?? 'NOC register export failed' });
  }
}

export async function buildNocRegisterExport(body) {
  const fieldMap = body.fieldMap || loadFieldMap();
  const basePdfBytes = body.basePdfBase64
    ? Buffer.from(body.basePdfBase64, 'base64')
    : readFileSync(path.join(root, 'src/assets/forms', fieldMap.basePdf));
  const range = currentMonthRange();
  const from = body.from || range.from;
  const to = body.to || range.to;
  const incidents = filterIncidentsForPeriod(body.incidents ?? [], from, to);
  const rows = incidents.map(incidentToRegisterRow);
  const pdfBytes = await overlayRegisterPdf({ basePdfBytes, fieldMap, rows });
  const filename = `PGIA-PMM-F07-NOC-register-${from}_to_${to}.pdf`.replace(/[^\w.\-]+/g, '_');
  return { bytes: pdfBytes, filename };
}

function loadFieldMap() {
  const file = path.join(root, 'src/data/field-maps/annex-g-noc-register-ed01.json');
  return JSON.parse(readFileSync(file, 'utf8'));
}
