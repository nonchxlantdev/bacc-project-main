import { htmlToPdfBuffer } from '../server/renderChecklistPdf.js';

export const config = {
  maxDuration: 60,
  api: {
    bodyParser: {
      sizeLimit: '12mb',
    },
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { html, filename = 'checklist.pdf' } = req.body ?? {};
  if (!html || typeof html !== 'string') {
    res.status(400).json({ error: 'html string is required' });
    return;
  }

  try {
    const pdf = await htmlToPdfBuffer(html);
    const safeName = String(filename).replace(/[^\w.\-]+/g, '_');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.end(Buffer.from(pdf));
  } catch (err) {
    res.status(500).json({
      error: err?.message ?? 'PDF export failed',
    });
  }
}
