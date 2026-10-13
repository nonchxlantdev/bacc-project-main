import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// The entry module must not suspend on a top-level await: lazily imported
// repository chunks (mock, d1) import shared code from the entry chunk, so a
// top-level await on them deadlocks the production bundle (blank page).
test('src/main.jsx has no top-level await', () => {
  const src = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8');
  const topLevel = src
    .split('\n')
    .filter((line) => /^await\b/.test(line) || /^(const|let|var)\s+[^=]+=\s*await\b/.test(line));
  assert.deepEqual(topLevel, [], `top-level await found:\n${topLevel.join('\n')}`);
});
