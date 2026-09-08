import { isLiveSupabase, isSupabaseConfigured, supabase } from './supabase.js';

const PROBE_TIMEOUT_MS = 4000;
const CACHE_MS = 15_000;

let lastResult = { ok: true, at: 0 };

/**
 * True when the browser thinks it is online AND (if live Supabase) the API
 * answers a cheap ping. navigator.onLine alone is not enough on airfield
 * tablets that have captive/broken links. Mock demos skip the ping.
 */
export async function probeReachability({ force = false } = {}) {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    lastResult = { ok: false, at: Date.now() };
    return false;
  }
  // Mock / keys-not-used: browser online is enough.
  if (!isLiveSupabase()) {
    lastResult = { ok: typeof navigator === 'undefined' ? true : navigator.onLine, at: Date.now() };
    return lastResult.ok;
  }
  if (!isSupabaseConfigured || !supabase) {
    lastResult = { ok: typeof navigator === 'undefined' ? true : navigator.onLine, at: Date.now() };
    return lastResult.ok;
  }
  if (!force && Date.now() - lastResult.at < CACHE_MS) return lastResult.ok;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    // HEAD against the REST root is enough; we only care that TLS + DNS work.
    const url = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/`;
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
    const res = await fetch(url, {
      method: 'HEAD',
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      signal: controller.signal,
    });
    lastResult = { ok: res.ok || res.status === 200 || res.status === 404, at: Date.now() };
  } catch {
    lastResult = { ok: false, at: Date.now() };
  } finally {
    clearTimeout(timer);
  }
  return lastResult.ok;
}

export function lastReachability() {
  return lastResult;
}
