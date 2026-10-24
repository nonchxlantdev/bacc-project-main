import { HttpError } from '../api/_shared.js';

const MAX_BODY = 8 * 1024;

function clip(value, max) {
  if (value == null) return '';
  return String(value).slice(0, max);
}

/**
 * A browser crash report. Only the fields listed here are logged — a checklist,
 * a name or an email in the body is dropped, not stored.
 */
export async function buildClientError(body) {
  if (JSON.stringify(body).length > MAX_BODY) throw new HttpError(413, 'Request body too large');
  const ref = crypto.randomUUID().replace(/-/g, '').slice(0, 8);
  console.error(JSON.stringify({
    level: 'error',
    source: 'client',
    ref,
    message: clip(body.message, 1000),
    stack: clip(body.stack, 4096),
    componentStack: clip(body.componentStack, 2048),
    route: clip(body.route, 300),
    build: clip(body.build, 40),
    role: clip(body.role, 32),
    ua: clip(body.ua, 300),
  }));
  return { ref };
}

export const CLIENT_ERROR_ROUTE = {
  kind: 'json',
  methods: ['POST'],
  csrf: true,
  limit: 30,
  auth: { mode: 'public' },
  build: buildClientError,
};
