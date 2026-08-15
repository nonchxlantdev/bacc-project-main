import { buildExport } from './api/export-checklist-pdf.js';
import { buildNocRegisterExport } from './api/export-noc-register.js';
import { buildWorkOrderExport } from './api/export-work-order.js';
import { buildReportExport } from './api/export-report-pdf.js';
import { buildGenerateInstances } from './api/generate-checklist-instances.js';

const ROUTES = {
  '/api/export-checklist-pdf': { kind: 'pdf', builder: buildExport },
  '/api/export-noc-register': { kind: 'pdf', builder: buildNocRegisterExport },
  '/api/export-work-order': { kind: 'pdf', builder: buildWorkOrderExport },
  '/api/export-report-pdf': { kind: 'pdf', builder: buildReportExport },
  '/api/generate-checklist-instances': { kind: 'json', builder: buildGenerateInstances },
};

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function attach(server) {
  server.middlewares.use(async (req, res, next) => {
    const pathName = req.url?.split('?')[0];
    const route = ROUTES[pathName];
    if (!route) {
      next();
      return;
    }
    if (req.method !== 'POST') {
      res.statusCode = 405;
      res.end(JSON.stringify({ error: 'Method not allowed' }));
      return;
    }
    try {
      const body = await readJsonBody(req);
      if (route.kind === 'json') {
        const json = await route.builder(body);
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(json));
        return;
      }
      const { bytes, filename } = await route.builder(body);
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.end(Buffer.from(bytes));
    } catch (err) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: err?.message ?? 'Request failed' }));
    }
  });
}

export function pdfExportApiPlugin() {
  return {
    name: 'bacc-pdf-overlay-api',
    configureServer: attach,
    configurePreviewServer: attach,
  };
}
