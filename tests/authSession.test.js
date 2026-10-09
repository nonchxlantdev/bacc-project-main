import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  RENEW_AFTER_MS,
  SESSION_COOKIE,
  SESSION_TTL_MS,
  clearedSessionCookie,
  hashToken,
  newSessionToken,
  readSessionCookie,
  sessionCookie,
} from '../worker/auth/session.js';

const req = (cookie) => new Request('https://bacc.visionforgestudio.app/api/auth/me', cookie ? { headers: { cookie } } : {});

test('constants match the spec', () => {
  assert.equal(SESSION_COOKIE, '__Host-bacc_session');
  assert.equal(SESSION_TTL_MS, 30 * 24 * 60 * 60 * 1000);
  assert.equal(RENEW_AFTER_MS, 24 * 60 * 60 * 1000);
});

test('tokens are 43-char base64url and unique', () => {
  const seen = new Set();
  for (let i = 0; i < 100; i += 1) {
    const t = newSessionToken();
    assert.match(t, /^[A-Za-z0-9_-]{43}$/);
    seen.add(t);
  }
  assert.equal(seen.size, 100);
});

test('hashToken is stable 64-char hex and differs per token', async () => {
  const t = newSessionToken();
  assert.match(await hashToken(t), /^[0-9a-f]{64}$/);
  assert.equal(await hashToken(t), await hashToken(t));
  assert.notEqual(await hashToken(t), await hashToken(newSessionToken()));
});

test('session cookie has exactly the spec attributes', () => {
  assert.equal(
    sessionCookie('abc'),
    '__Host-bacc_session=abc; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000',
  );
  assert.equal(
    clearedSessionCookie(),
    '__Host-bacc_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0',
  );
});

test('readSessionCookie finds the token among other cookies', () => {
  const t = newSessionToken();
  assert.equal(readSessionCookie(req(`a=1; __Host-bacc_session=${t}; b=2`)), t);
  assert.equal(readSessionCookie(req(`__Host-bacc_session=${t}`)), t);
});

test('readSessionCookie returns null for missing or malformed values', () => {
  assert.equal(readSessionCookie(req()), null);
  assert.equal(readSessionCookie(req('other=1')), null);
  assert.equal(readSessionCookie(req('__Host-bacc_session=')), null);
  assert.equal(readSessionCookie(req('__Host-bacc_session=short')), null);
  assert.equal(readSessionCookie(req(`__Host-bacc_session=${'a'.repeat(42)}!`)), null);
  assert.equal(readSessionCookie(req(`bacc_session=${newSessionToken()}`)), null);
});
