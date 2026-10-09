/**
 * Shared guards for the /api routes (run inside the Cloudflare Worker).
 *
 * Every route is authenticated by worker/http.js calling `requireUser` before
 * the builder runs. Template / basePdf lookups go through the form store
 * (api/_formStore.js) — never through client-supplied paths.
 */
import { createClient } from '@supabase/supabase-js';

/** An error that carries the HTTP status the API should answer with, and an
 * optional machine-readable code the browser can branch on. */
export class HttpError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    if (code) this.code = code;
  }
}

/** Hard caps — attacker-controlled arrays never drive unbounded PDF work. */
export const LIMITS = {
  photos: 40,
  images: 40,
  incidents: 500,
  teams: 100,
  weeks: 52,
  late: 200,
  rules: 100,
  backfillDays: 120,
  bodyBytes: 12 * 1024 * 1024,
};

export function assertSafeKey(value, label = 'key') {
  const s = String(value ?? '');
  if (!s || /[\\/\0]/.test(s) || s.includes('..')) {
    throw new HttpError(400, `Invalid ${label}`);
  }
  return s;
}

export function rejectClientBasePdf(body) {
  if (body?.basePdfBase64) throw new HttpError(400, 'Client-supplied base PDF is not allowed');
}

export function capArray(arr, max, label) {
  if (!Array.isArray(arr)) return [];
  if (arr.length > max) throw new HttpError(400, `${label} exceeds limit of ${max}`);
  return arr;
}

/**
 * Validate the Supabase session JWT the SPA already holds.
 * Returns { user, supabase, profile } or throws HttpError 401/403/503.
 */
export async function requireUser(request, env, { roles } = {}) {
  const url = env?.SUPABASE_URL || '';
  const anonKey = env?.SUPABASE_ANON_KEY || '';
  if (!url || !anonKey) throw new HttpError(503, 'Supabase is not configured on the server');

  const header = request.headers.get('authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) throw new HttpError(401, 'Missing Authorization bearer token');
  const token = match[1].trim();

  const supabase = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) throw new HttpError(401, 'Invalid or expired session');

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role, department, full_name, position')
    .eq('id', data.user.id)
    .maybeSingle();

  if (roles?.length) {
    const role = profile?.role;
    if (!role || !roles.includes(role)) throw new HttpError(403, 'Forbidden for this role');
  }
  return { user: data.user, supabase, profile: profile || { id: data.user.id, role: null } };
}

/** In-memory fixed-window rate limit (best-effort: per Worker isolate). */
const buckets = new Map();
export function rateLimit(key, { limit = 30, windowMs = 60_000, now = Date.now() } = {}) {
  let entry = buckets.get(key);
  if (!entry || now - entry.start > windowMs) {
    entry = { start: now, count: 0 };
    buckets.set(key, entry);
  }
  entry.count += 1;
  if (entry.count > limit) throw new HttpError(429, 'Too many requests');
}
