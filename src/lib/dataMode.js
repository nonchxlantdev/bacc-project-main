/**
 * The D1 data mode (VITE_DATA_SOURCE=d1): Cloudflare login + the Worker's
 * /api/data API. Production stays on Supabase until the 3c cutover.
 */
export function isD1Data() {
  return (typeof import.meta !== 'undefined' && import.meta.env?.VITE_DATA_SOURCE) === 'd1';
}

/** Annex K drawings per checklist in d1 mode (the Worker enforces the same). */
export const DRAWING_LIMIT = 6;

/** A compressed drawing larger than this is refused (~820,000 data-URI chars server-side). */
export const DRAWING_MAX_BYTES = 600 * 1024;
