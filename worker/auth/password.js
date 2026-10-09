/**
 * Password hashing for the Cloudflare login (sub-project 2).
 *
 * PBKDF2-SHA256 via Web Crypto — available in Workers, browsers and Node 22.
 * 100,000 iterations is the Workers ceiling. The iteration count is stored in
 * each hash, so it can be raised (or the scheme swapped) later without
 * forcing anyone to reset a password.
 */
import { HttpError } from '../../api/_shared.js';

export const PBKDF2_ITERATIONS = 100_000;
export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 128;
const SALT_BYTES = 16;
const KEY_BYTES = 32;
const encoder = new TextEncoder();

/** No 0/O/o, 1/l/I/i — temporary passwords get read aloud and typed by hand. */
export const TEMP_PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';

export function toBase64Url(bytes) {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64Url(text) {
  const normal = String(text).replace(/-/g, '+').replace(/_/g, '/');
  const padded = normal + '='.repeat((4 - (normal.length % 4)) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

export function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function derive(password, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    key,
    KEY_BYTES * 8,
  );
  return new Uint8Array(bits);
}

export function assertPasswordLength(password) {
  if (typeof password !== 'string' || password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
    throw new HttpError(400, `Password must be ${PASSWORD_MIN}–${PASSWORD_MAX} characters`);
  }
}

export async function hashPassword(password, { iterations = PBKDF2_ITERATIONS } = {}) {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await derive(password, salt, iterations);
  return `pbkdf2$${iterations}$${toBase64Url(salt)}$${toBase64Url(hash)}`;
}

export async function verifyPassword(password, stored) {
  if (typeof password !== 'string' || typeof stored !== 'string') return false;
  const parts = stored.split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;
  const iterations = Number(parts[1]);
  if (!Number.isInteger(iterations) || iterations < 1 || iterations > PBKDF2_ITERATIONS) return false;
  let salt;
  let expected;
  try {
    salt = fromBase64Url(parts[2]);
    expected = fromBase64Url(parts[3]);
  } catch {
    return false;
  }
  if (salt.length === 0 || expected.length !== KEY_BYTES) return false;
  return timingSafeEqual(await derive(password, salt, iterations), expected);
}

/** Uniform pick via rejection sampling (no modulo bias). */
export function generateTemporaryPassword(length = 14) {
  const size = TEMP_PASSWORD_ALPHABET.length;
  const limit = 256 - (256 % size);
  const out = [];
  while (out.length < length) {
    for (const b of crypto.getRandomValues(new Uint8Array(length * 2))) {
      if (b < limit && out.length < length) out.push(TEMP_PASSWORD_ALPHABET[b % size]);
    }
  }
  return out.join('');
}

/** Spend the same PBKDF2 time when the email doesn't exist, so response
 * timing can't be used to discover which emails have accounts. */
let dummyHash = null;
export async function burnPasswordCheck(password) {
  dummyHash ??= hashPassword('timing-equaliser-not-a-real-password');
  await verifyPassword(String(password ?? ''), await dummyHash);
}
