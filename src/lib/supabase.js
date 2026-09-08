import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** True when URL + anon key are present (may still run mock data). */
export const isSupabaseConfigured = Boolean(url && anonKey);

/**
 * True only when the app is actually using the Supabase adapter.
 * Keys can sit in .env.local while VITE_DATA_SOURCE=mock for demos —
 * without this gate, Auth would demand real passwords and hide demo accounts.
 */
export function isLiveSupabase() {
  const source =
    (typeof import.meta !== 'undefined' && import.meta.env?.VITE_DATA_SOURCE) || 'mock';
  return source === 'supabase' && isSupabaseConfigured;
}

export const supabase = isSupabaseConfigured
  ? createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;
