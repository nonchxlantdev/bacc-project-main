import test from 'node:test';
import assert from 'node:assert/strict';
import { isChunkLoadError, loadWithReload } from '../src/lib/lazyWithReload.js';

function memoryStorage() {
  const data = new Map();
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
  };
}

function chunkError() {
  return new TypeError('Failed to fetch dynamically imported module: https://bacc.example/assets/page-old.js');
}

test('a chunk error is recognised and an ordinary error is not', () => {
  assert.equal(isChunkLoadError(chunkError()), true);
  assert.equal(isChunkLoadError(new Error('Cannot read properties of undefined')), false);
});

test('a failed chunk is retried, then the page reloads once', async () => {
  const storage = memoryStorage();
  let reloads = 0;
  let calls = 0;
  const pending = loadWithReload('dashboard', async () => {
    calls += 1;
    throw chunkError();
  }, { storage, reload: () => { reloads += 1; } });
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(calls, 2);
  assert.equal(reloads, 1);
  pending.catch(() => {});

  await assert.rejects(
    () => loadWithReload('dashboard', async () => {
      calls += 1;
      throw chunkError();
    }, { storage, reload: () => { reloads += 1; } }),
    /Failed to fetch dynamically imported module/,
  );
  assert.equal(reloads, 1);
});

test('a retry that succeeds does not reload, and clears the guard', async () => {
  const storage = memoryStorage();
  storage.setItem('bacc:chunk-reload:help', '1');
  let reloads = 0;
  let calls = 0;
  const loaded = await loadWithReload('help', async () => {
    calls += 1;
    if (calls === 1) throw chunkError();
    return { default: 'ok' };
  }, { storage, reload: () => { reloads += 1; } });
  assert.equal(loaded.default, 'ok');
  assert.equal(reloads, 0);
  assert.equal(storage.getItem('bacc:chunk-reload:help'), null);
});
