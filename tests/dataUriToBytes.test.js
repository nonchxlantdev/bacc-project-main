import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dataUriToBytes } from '../server/overlayChecklistPdf.js';

// 1x1 transparent PNG.
const PNG_1PX =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

test('decodes a PNG data URI to the same bytes Buffer would', () => {
  const bytes = dataUriToBytes(`data:image/png;base64,${PNG_1PX}`);
  assert.deepEqual([...bytes], [...Buffer.from(PNG_1PX, 'base64')]);
});

test('returns a plain Uint8Array, not a Node Buffer (Workers have no Buffer by default)', () => {
  const bytes = dataUriToBytes(`data:image/png;base64,${PNG_1PX}`);
  assert.ok(bytes instanceof Uint8Array);
  assert.equal(Buffer.isBuffer(bytes), false);
});

test('returns null for empty input and non-data URIs', () => {
  assert.equal(dataUriToBytes(null), null);
  assert.equal(dataUriToBytes(''), null);
  assert.equal(dataUriToBytes('https://example.com/a.png'), null);
});

test('returns null for corrupt base64 instead of throwing', () => {
  assert.equal(dataUriToBytes('data:image/png;base64,@@@@'), null);
});
