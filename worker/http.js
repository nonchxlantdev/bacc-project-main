/**
 * Request/response wrapper for the /api routes inside the Worker.
 *
 * Order: route → method → CSRF → body size → rate limit → auth → parse →
 * build. Every response carries the security headers (public/_headers only
 * covers static assets), and any session-renewal cookie from authenticate().
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
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extra },
  });
}

function finalize(response, authCtx) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    if (!headers.has(key)) headers.set(key, value);
  }
  if (authCtx?.setCookie) headers.append('Set-Cookie', authCtx.setCookie);
  return new Response(response.body, { status: response.status, headers });
}

/** Local `vite dev` in mock mode has no session to send. Never applies to
 * the D1 login routes (public/session), which must behave exactly as in prod. */
function isLocalDevBypass(request, env, route) {
  const mode = route.auth?.mode;
  if (mode === 'public' || mode === 'session') return false;
  if (env?.DEV_SKIP_AUTH !== '1') return false;
  const host = new URL(request.url).hostname;
  return host === 'localhost' || host === '127.0.0.1';
}

export function createApiHandler({ routes, forms, authenticate }) {
  return async function handleApi(request, env) {
    const { pathname, origin } = new URL(request.url);
    const route = Object.prototype.hasOwnProperty.call(routes, pathname) ? routes[pathname] : null;
    if (!route) return finalize(json(404, { error: 'Not found' }));
    const methods = route.methods ?? ['POST'];
    if (!methods.includes(request.method)) {
      return finalize(json(405, { error: 'Method not allowed' }, { Allow: methods.join(', ') }));
    }

    let authCtx = null;
    try {
      if (route.csrf && request.method !== 'GET') {
        if (request.headers.get('origin') !== origin) throw new HttpError(403, 'Cross-site request blocked');
        const type = (request.headers.get('content-type') || '').toLowerCase();
        if (!type.includes('application/json')) throw new HttpError(403, 'Requests must be sent as JSON');
      }

      const declared = Number(request.headers.get('content-length') || 0);
      if (declared > LIMITS.bodyBytes) throw new HttpError(413, 'Request body too large');

      const ip = request.headers.get('cf-connecting-ip') || 'unknown';
      rateLimit(`${ip}:${pathname}`, { limit: route.limit ?? 20 });

      if (route.auth?.mode === 'public') authCtx = null;
      else if (isLocalDevBypass(request, env, route)) authCtx = LOCAL_DEV_USER;
      else authCtx = await authenticate(request, env, route.auth ?? {});

      let body = {};
      if (request.method !== 'GET') {
        const text = await request.text();
        // Chunked uploads have no Content-Length; check what actually arrived.
        if (text.length > LIMITS.bodyBytes) throw new HttpError(413, 'Request body too large');
        try {
          body = text ? JSON.parse(text) : {};
        } catch {
          throw new HttpError(400, 'Request body must be JSON');
        }
        if (body === null || typeof body !== 'object' || Array.isArray(body)) {
          throw new HttpError(400, 'Request body must be a JSON object');
        }
      }

      const result = await route.build(body, { env, forms, user: authCtx, request });

      if (route.kind === 'pdf') {
        return finalize(
          new Response(result.bytes, {
            status: 200,
            headers: {
              'Content-Type': 'application/pdf',
              'Content-Disposition': `attachment; filename="${result.filename}"`,
              'Cache-Control': 'no-store',
            },
          }),
          authCtx,
        );
      }
      if (route.kind === 'response') return finalize(result, authCtx);
      return finalize(json(200, result), authCtx);
    } catch (err) {
      const status = Number.isInteger(err?.status) ? err.status : 500;
      if (status >= 500) {
        console.error(
          JSON.stringify({ level: 'error', path: pathname, msg: err?.message || String(err), stack: err?.stack }),
        );
      }
      const payload = { error: err?.message || 'Request failed' };
      if (err?.code && typeof err.code === 'string') payload.code = err.code;
      return finalize(json(status, payload), authCtx);
    }
  };
}
