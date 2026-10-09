/**
 * Registry key ↔ form code, for Node scripts.
 *
 * src/data/templates/registry.js imports JSON without import attributes (Vite
 * handles that), so Node cannot import it. This reads the same source: each
 * entry is `key: '<key>'` followed by `code: <ident>.code`, and `<ident>` is
 * imported from ../checklists/<file>.json. tests/registryCodes.test.js keeps
 * this honest against the registry's entry count.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export function registryKeyByCode() {
  const source = readFileSync(path.join(root, 'src/data/templates/registry.js'), 'utf8');
  const files = new Map();
  for (const m of source.matchAll(/^import (\w+) from '\.\.\/checklists\/([^']+\.json)';$/gm)) files.set(m[1], m[2]);
  const byCode = new Map();
  for (const m of source.matchAll(/key: '([^']+)',[\s\S]*?code: (\w+)\.code,/g)) {
    const [, key, ident] = m;
    const file = files.get(ident);
    if (!file) throw new Error(`registry entry ${key}: no checklist import for ${ident}`);
    const { code } = JSON.parse(readFileSync(path.join(root, 'src/data/checklists', file), 'utf8'));
    byCode.set(code, key);
  }
  return byCode;
}
