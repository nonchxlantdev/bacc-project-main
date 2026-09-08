import { supabase, isSupabaseConfigured } from './supabase.js';

/**
 * Authenticated fetch for Vercel API routes.
 * Attaches the current Supabase session JWT when available.
 */
export async function apiFetch(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && options.body && typeof options.body === 'string') {
    headers.set('Content-Type', 'application/json');
  }
  if (isSupabaseConfigured && supabase) {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    if (token) headers.set('Authorization', `Bearer ${token}`);
  }
  return fetch(path, { ...options, headers });
}
