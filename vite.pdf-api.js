import { htmlToPdfBuffer } from './server/renderChecklistPdf.js';

const API_PATH = '/api/export-checklist-pdf';

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(raw ? JSON.parse(raw) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function attachPdfApi(server) {
  server.middlewares.use(async (req, res, next) => {
    const url = req.url?.split('?')[0];
    if (url !== API_PATH) {
      next();
      return;
    }

    if (req.method !== 'POST') {
      res.statusCode = 405;
      res.setHeader('Allow', 'POST');
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Method not allowed' }));
      return;
    }

    try {
      const body = await readJsonBody(req);
      const html = body?.html;
      if (!html || typeof html !== 'string') {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'html string is required' }));
        return;
      }

      const pdf = await htmlToPdfBuffer(html);
      const filename = String(body.filename || 'checklist.pdf').replace(/[^\w.\-]+/g, '_');
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Cache-Control', 'no-store');
      res.end(Buffer.from(pdf));
    } catch (err) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: err?.message ?? 'PDF export failed' }));
    }
  });
}

export function pdfExportApiPlugin() {
  return {
    name: 'bacc-pdf-export-api',
    configureServer: attachPdfApi,
    configurePreviewServer: attachPdfApi,
  };
}
