import { supabase, isSupabaseConfigured } from './supabase.js';
import { isD1Auth } from './authMode.js';

/**
 * Authenticated fetch for the Worker /api routes.
 * d1 mode: the HttpOnly session cookie is sent automatically (same-origin).
 * supabase mode: attach the Supabase session JWT.
 */
export async function apiFetch(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && options.body && typeof options.body === 'string') {
    headers.set('Content-Type', 'application/json');
  }
  if (!isD1Auth() && isSupabaseConfigured && supabase) {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    if (token) headers.set('Authorization', `Bearer ${token}`);
  }
  return fetch(path, { credentials: 'same-origin', ...options, headers });
}
