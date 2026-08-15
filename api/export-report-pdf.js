import { buildReportPdf } from '../server/reportPdf.js';

export const config = {
  maxDuration: 30,
  api: { bodyParser: { sizeLimit: '4mb' } },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  try {
    const { bytes, filename } = await buildReportPdf(req.body ?? {});
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.end(Buffer.from(bytes));
  } catch (err) {
    res.status(500).json({ error: err?.message ?? 'Report PDF failed' });
  }
}

export async function buildReportExport(body) {
  return buildReportPdf(body);
}
