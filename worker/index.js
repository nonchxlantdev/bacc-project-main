/**
 * Cloudflare Worker entry for the BACC portal.
 *
 * Static assets (the SPA) are served by Workers static assets before this
 * code runs; wrangler.jsonc's run_worker_first sends only /api/* here.
 */
import { createApiHandler } from './http.js';
import { formStore } from './formAssets.js';
import { requireUser } from '../api/_shared.js';
import { buildExport } from '../api/export-checklist-pdf.js';
import { buildNocRegisterExport } from '../api/export-noc-register.js';
import { buildWorkOrderExport } from '../api/export-work-order.js';
import { buildReportExport } from '../api/export-report-pdf.js';
import { buildGenerateInstances } from '../api/generate-checklist-instances.js';
import { buildCreateUser } from '../api/create-user.js';

export const ROUTES = {
  '/api/export-checklist-pdf': { kind: 'pdf', build: buildExport },
  '/api/export-noc-register': { kind: 'pdf', build: buildNocRegisterExport },
  '/api/export-work-order': { kind: 'pdf', build: buildWorkOrderExport },
  '/api/export-report-pdf': { kind: 'pdf', build: buildReportExport },
  '/api/generate-checklist-instances': {
    kind: 'json',
    auth: { roles: ['om', 'coo', 'admin'] },
    limit: 10,
    build: buildGenerateInstances,
  },
  '/api/create-user': {
    kind: 'json',
    auth: { roles: ['admin', 'om'] },
    limit: 10,
    build: buildCreateUser,
  },
};

const handleApi = createApiHandler({ routes: ROUTES, forms: formStore, authenticate: requireUser });

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname.startsWith('/api/')) return handleApi(request, env);
    return env.ASSETS.fetch(request);
  },
};
