/**
 * Which tours an account has seen: `{ "<tour id>": <version> }`.
 *
 * On D1 the map lives on the account (users.tours_seen) so it follows the
 * person across devices and shared tablets. It is also always cached in this
 * browser, so a mark made offline is never lost: the next load merges the
 * cache with the account and pushes anything newer back up. Supabase and mock
 * builds use the cache alone until the D1 cutover.
 *
 * The limits match worker/data/rules.js validateToursSeen, so whatever this
 * module produces the server accepts.
 */

const KEY_PREFIX = 'bacc-tours-seen:';
const ID_RE = /^[a-z][a-z0-9-]{0,39}$/;
const MAX_TOURS = 40;
const MAX_VERSION = 1000;

/** Keep only well-formed entries; anything else is dropped, never thrown. */
export function sanitizeSeen(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out = {};
  for (const [id, version] of Object.entries(value)) {
    if (Object.keys(out).length >= MAX_TOURS) break;
    if (ID_RE.test(id) && Number.isInteger(version) && version >= 1 && version <= MAX_VERSION) out[id] = version;
  }
  return out;
}

/** Highest version per tour wins, so merging can only ever add progress. */
export function mergeSeen(...maps) {
  const out = {};
  for (const map of maps) {
    for (const [id, version] of Object.entries(sanitizeSeen(map))) {
      out[id] = Math.max(out[id] ?? 0, version);
    }
  }
  return sanitizeSeen(out);
}

export function hasSeen(seen, tour) {
  return Boolean(tour) && (seen?.[tour.id] ?? 0) >= tour.version;
}

export function markSeen(seen, tour) {
  return mergeSeen(seen, { [tour.id]: tour.version });
}

export function sameSeen(a, b) {
  const x = sanitizeSeen(a);
  const y = sanitizeSeen(b);
  const keys = new Set([...Object.keys(x), ...Object.keys(y)]);
  return [...keys].every((k) => x[k] === y[k]);
}

export function readLocalSeen(userId) {
  if (!userId) return {};
  try {
    return sanitizeSeen(JSON.parse(localStorage.getItem(KEY_PREFIX + userId) || '{}'));
  } catch {
    return {};
  }
}

export function writeLocalSeen(userId, seen) {
  if (!userId) return;
  try {
    localStorage.setItem(KEY_PREFIX + userId, JSON.stringify(sanitizeSeen(seen)));
  } catch {
    // Private browsing or storage switched off: the tour simply shows again
    // next session on this device, which is the safe way to fail.
  }
}
