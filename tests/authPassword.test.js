import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PBKDF2_ITERATIONS,
  TEMP_PASSWORD_ALPHABET,
  assertPasswordLength,
  fromBase64Url,
  generateTemporaryPassword,
  hashPassword,
  toBase64Url,
  verifyPassword,
} from '../worker/auth/password.js';
import { HttpError } from '../api/_shared.js';

test('HttpError carries an optional code', () => {
  assert.equal(new HttpError(403, 'x', 'PASSWORD_CHANGE_REQUIRED').code, 'PASSWORD_CHANGE_REQUIRED');
  assert.equal('code' in new HttpError(400, 'y'), false);
});

test('base64url round-trips arbitrary bytes', () => {
  const bytes = new Uint8Array([0, 1, 62, 63, 250, 251, 252, 253, 254, 255]);
  const text = toBase64Url(bytes);
  assert.match(text, /^[A-Za-z0-9_-]+$/);
  assert.deepEqual([...fromBase64Url(text)], [...bytes]);
});

test('hash format is pbkdf2$100000$salt$hash', async () => {
  const stored = await hashPassword('correct horse battery');
  const [scheme, iterations, salt, hash] = stored.split('$');
  assert.equal(scheme, 'pbkdf2');
  assert.equal(Number(iterations), PBKDF2_ITERATIONS);
  assert.equal(fromBase64Url(salt).length, 16);
  assert.equal(fromBase64Url(hash).length, 32);
});

test('same password hashes differently each time (random salt)', async () => {
  assert.notEqual(await hashPassword('same-password-1'), await hashPassword('same-password-1'));
});

test('verify accepts the right password and rejects a wrong one', async () => {
  const stored = await hashPassword('correct horse battery');
  assert.equal(await verifyPassword('correct horse battery', stored), true);
  assert.equal(await verifyPassword('correct horse batterz', stored), false);
});

test('a hash stored with fewer iterations still verifies (upgrade path)', async () => {
  const stored = await hashPassword('older-hash-pass', { iterations: 1000 });
  assert.equal(stored.split('$')[1], '1000');
  assert.equal(await verifyPassword('older-hash-pass', stored), true);
});

test('tampered or malformed hashes never verify', async () => {
  const stored = await hashPassword('tamper-test-pw');
  const [s, i, salt, hash] = stored.split('$');
  const flip = (t) => (t[0] === 'A' ? 'B' : 'A') + t.slice(1);
  for (const bad of [
    `${s}$${i}$${flip(salt)}$${hash}`,
    `${s}$${i}$${salt}$${flip(hash)}`,
    `bcrypt$${i}$${salt}$${hash}`,
    `${s}$999999$${salt}$${hash}`,
    `${s}$${i}$${salt}`,
    `${s}$${i}$@@@$${hash}`,
    '',
  ]) {
    assert.equal(await verifyPassword('tamper-test-pw', bad), false, bad);
  }
  assert.equal(await verifyPassword(undefined, stored), false);
});

test('password length bounds are 10..128', () => {
  assert.throws(() => assertPasswordLength('123456789'), (e) => e.status === 400);
  assert.throws(() => assertPasswordLength('x'.repeat(129)), (e) => e.status === 400);
  assert.throws(() => assertPasswordLength(undefined), (e) => e.status === 400);
  assertPasswordLength('1234567890');
  assertPasswordLength('x'.repeat(128));
});

test('temporary passwords: 14 chars from the unambiguous alphabet, all different', () => {
  for (const ch of '0O1lIio') assert.equal(TEMP_PASSWORD_ALPHABET.includes(ch), false, ch);
  const seen = new Set();
  for (let n = 0; n < 200; n += 1) {
    const pw = generateTemporaryPassword();
    assert.equal(pw.length, 14);
    for (const ch of pw) assert.ok(TEMP_PASSWORD_ALPHABET.includes(ch), ch);
    seen.add(pw);
  }
  assert.equal(seen.size, 200);
});
