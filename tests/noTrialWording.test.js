import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// Staff must see a production system: features that aren't offered say
// "unavailable at this time", never "pilot", "light run" or "switched off for…".
const ROOTS = ['src', 'worker'];
const BANNED = /\b(pilot|light run|trial|test environment)\b|switched off for|not available on the new login/i;

function* files(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === 'generated' || name === 'node_modules') continue;
      yield* files(p);
    } else if (/\.(jsx?|mjs)$/.test(name) && name !== 'formAssets.js') yield p;
  }
}

/** Drop comments so notes for developers don't count — only shipped text does. */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
}

test('no user-facing text calls the portal a pilot or trial', () => {
  const hits = [];
  for (const root of ROOTS) {
    for (const file of files(root)) {
      stripComments(readFileSync(file, 'utf8'))
        .split('\n')
        .forEach((line, i) => {
          if (BANNED.test(line)) hits.push(`${file}:${i + 1}: ${line.trim()}`);
        });
    }
  }
  assert.deepEqual(hits, []);
});
