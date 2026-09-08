/**
 * Shared auth + input guards for Vercel API functions.
 *
 * Every handler must call `requireUser(req)` before doing work. Template /
 * basePdf paths are resolved only against the known registry allow-list —
 * never from raw client path fragments.
 */
import { createClient } from '@supabase/supabase-js';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';

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

let registryCache = null;

function loadRegistryAllowList() {
  if (registryCache) return registryCache;
  const fieldMapsDir = path.join(root, 'src/data/field-maps');
  const keys = new Set();
  const basePdfs = new Set();
  try {
    for (const name of readdirSync(fieldMapsDir)) {
      if (!name.endsWith('.json')) continue;
      const stem = name.replace(/\.json$/, '');
      const versionMatch = stem.match(/^(.*)-(ed\d+)$/i);
      if (versionMatch) keys.add(versionMatch[1]);
      else keys.add(stem);
      try {
        const map = JSON.parse(readFileSync(path.join(fieldMapsDir, name), 'utf8'));
        const bp = String(map.basePdf || '');
        if (bp && !/[\\/\0]/.test(bp) && !bp.includes('..')) basePdfs.add(bp);
      } catch {
        // skip unreadable maps
      }
    }
  } catch {
    // directory missing in some test contexts
  }
  keys.add('annex-h-work-order');
  keys.add('annex-g-noc-register');
  registryCache = { keys, basePdfs };
  return registryCache;
}

export function assertSafeKey(value, label = 'key') {
  const s = String(value || '');
  if (!s || /[\\/\0]/.test(s) || s.includes('..')) {
    const err = new Error(`Invalid ${label}`);
    err.status = 400;
    throw err;
  }
  return s;
}

export function resolveFieldMap(templateKey, version = 'ed01') {
  const key = assertSafeKey(templateKey, 'templateKey');
  const ver = assertSafeKey(version, 'templateVersion');
  const { keys } = loadRegistryAllowList();
  if (!keys.has(key)) {
    const err = new Error(`Unknown templateKey: ${key}`);
    err.status = 400;
    throw err;
  }
  const file = path.join(root, 'src/data/field-maps', `${key}-${ver}.json`);
  if (!existsSync(file)) {
    const err = new Error(`Field map not found for ${key}-${ver}`);
    err.status = 400;
    throw err;
  }
  return JSON.parse(readFileSync(file, 'utf8'));
}

export function readApprovedBasePdf(fieldMap) {
  const basePdf = assertSafeKey(fieldMap.basePdf, 'basePdf');
  const file = path.join(root, 'src/assets/forms', basePdf);
  if (!existsSync(file)) {
    const err = new Error(`Approved base PDF missing: ${basePdf}`);
    err.status = 400;
    throw err;
  }
  return readFileSync(file);
}

export function rejectClientBasePdf(body) {
  if (body?.basePdfBase64) {
    const err = new Error('Client-supplied base PDF is not allowed');
    err.status = 400;
    throw err;
  }
}

export function capArray(arr, max, label) {
  if (!Array.isArray(arr)) return [];
  if (arr.length > max) {
    const err = new Error(`${label} exceeds limit of ${max}`);
    err.status = 400;
    throw err;
  }
  return arr;
}

export function enforceBodySize(req) {
  const len = Number(req.headers['content-length'] || 0);
  if (len > LIMITS.bodyBytes) {
    const err = new Error('Request body too large');
    err.status = 413;
    throw err;
  }
}

/**
 * Validate the Supabase session JWT the SPA already holds.
 * Returns { user, supabase, profile } or throws with .status 401/403.
 */
export async function requireUser(req, { roles } = {}) {
  if (!url || !anonKey) {
    const err = new Error('Supabase is not configured on the server');
    err.status = 503;
    throw err;
  }
  const header = req.headers.authorization || req.headers.Authorization || '';
  const match = String(header).match(/^Bearer\s+(.+)$/i);
  if (!match) {
    const err = new Error('Missing Authorization bearer token');
    err.status = 401;
    throw err;
  }
  const token = match[1].trim();
  const supabase = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) {
    const err = new Error('Invalid or expired session');
    err.status = 401;
    throw err;
  }
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role, department, full_name, position')
    .eq('id', data.user.id)
    .maybeSingle();

  if (roles?.length) {
    const role = profile?.role;
    if (!role || !roles.includes(role)) {
      const err = new Error('Forbidden for this role');
      err.status = 403;
      throw err;
    }
  }
  return { user: data.user, supabase, profile: profile || { id: data.user.id, role: null } };
}

export function sendError(res, err) {
  const status = err?.status || 500;
  if (status >= 500) {
    console.error(JSON.stringify({ level: 'error', msg: err?.message || String(err), stack: err?.stack }));
  }
  res.status(status).json({ error: err?.message || 'Request failed' });
}

/** Simple in-memory rate limit per IP (best-effort on serverless). */
const buckets = new Map();
export function rateLimit(req, { limit = 30, windowMs = 60_000 } = {}) {
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';
  const now = Date.now();
  let entry = buckets.get(ip);
  if (!entry || now - entry.start > windowMs) {
    entry = { start: now, count: 0 };
    buckets.set(ip, entry);
  }
  entry.count += 1;
  if (entry.count > limit) {
    const err = new Error('Too many requests');
    err.status = 429;
    throw err;
  }
}
