/**
 * Request/response wrapper for the /api routes inside the Worker.
 *
 * Replaces the per-file Vercel handler boilerplate. Order matters and matches
 * the old handlers: method → body size → rate limit → auth → parse → build.
 * Every response carries the same security headers as static assets
 * (public/_headers only applies to assets, not Worker responses).
 */
import { HttpError, LIMITS, rateLimit } from '../api/_shared.js';

export const SECURITY_HEADERS = {
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob: https:; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.tile.openstreetmap.org; frame-src 'self' blob:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(self), microphone=(), geolocation=(self)',
};

const LOCAL_DEV_USER = { user: { id: 'local-dev' }, profile: { id: 'local-dev', role: 'admin' } };

function json(status, payload, extra = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...SECURITY_HEADERS,
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      ...extra,
    },
  });
}

/** Local `vite dev` in mock mode has no Supabase session to send. */
function isLocalDevBypass(request, env) {
  if (env?.DEV_SKIP_AUTH !== '1') return false;
  const host = new URL(request.url).hostname;
  return host === 'localhost' || host === '127.0.0.1';
}

export function createApiHandler({ routes, forms, authenticate }) {
  return async function handleApi(request, env) {
    const { pathname } = new URL(request.url);
    const route = Object.prototype.hasOwnProperty.call(routes, pathname) ? routes[pathname] : null;
    if (!route) return json(404, { error: 'Not found' });
    if (request.method !== 'POST') return json(405, { error: 'Method not allowed' }, { Allow: 'POST' });

    try {
      const declared = Number(request.headers.get('content-length') || 0);
      if (declared > LIMITS.bodyBytes) throw new HttpError(413, 'Request body too large');

      const ip = request.headers.get('cf-connecting-ip') || 'unknown';
      rateLimit(`${ip}:${pathname}`, { limit: route.limit ?? 20 });

      const user = isLocalDevBypass(request, env)
        ? LOCAL_DEV_USER
        : await authenticate(request, env, route.auth ?? {});

      const text = await request.text();
      // Chunked uploads have no Content-Length; check what actually arrived.
      if (text.length > LIMITS.bodyBytes) throw new HttpError(413, 'Request body too large');
      let body;
      try {
        body = text ? JSON.parse(text) : {};
      } catch {
        throw new HttpError(400, 'Request body must be JSON');
      }
      if (body === null || typeof body !== 'object' || Array.isArray(body)) {
        throw new HttpError(400, 'Request body must be a JSON object');
      }

      const result = await route.build(body, { env, forms, user });

      if (route.kind === 'pdf') {
        return new Response(result.bytes, {
          status: 200,
          headers: {
            ...SECURITY_HEADERS,
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="${result.filename}"`,
            'Cache-Control': 'no-store',
          },
        });
      }
      return json(200, result);
    } catch (err) {
      const status = Number.isInteger(err?.status) ? err.status : 500;
      if (status >= 500) {
        console.error(
          JSON.stringify({ level: 'error', path: pathname, msg: err?.message || String(err), stack: err?.stack }),
        );
      }
      return json(status, { error: err?.message || 'Request failed' });
    }
  };
}
