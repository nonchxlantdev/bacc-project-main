import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registryKeyByCode } from '../scripts/lib/registryCodes.mjs';

test('every registry entry maps its form code to its key', () => {
  const map = registryKeyByCode();
  const entries = readFileSync(new URL('../src/data/templates/registry.js', import.meta.url), 'utf8').match(/^\s+key: '/gm);
  assert.equal(map.size, entries.length);
  assert.equal(map.get('PGIA-PMM-F04'), 'annex-d-drainage');
});
