/**
 * Node-side form store: reads the approved forms from disk. Used by tests
 * and scripts (parity harness). The Worker uses worker/formAssets.js instead.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFormStore } from '../../api/_formStore.js';

const defaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export const FORM_DIRS = {
  basePdfs: 'src/assets/forms',
  fieldMaps: 'src/data/field-maps',
  schemas: 'src/data/checklists',
};

export function listFormFiles(rootDir = defaultRoot) {
  const list = (dir, ext) =>
    readdirSync(path.join(rootDir, dir))
      .filter((f) => f.toLowerCase().endsWith(ext))
      .sort();
  return {
    basePdfs: list(FORM_DIRS.basePdfs, '.pdf'),
    fieldMaps: list(FORM_DIRS.fieldMaps, '.json'),
    schemas: list(FORM_DIRS.schemas, '.json'),
  };
}

export function loadFormSources(rootDir = defaultRoot) {
  const files = listFormFiles(rootDir);
  const json = (dir, f) => JSON.parse(readFileSync(path.join(rootDir, dir, f), 'utf8'));
  const stem = (f) => f.replace(/\.json$/i, '');
  return {
    basePdfs: Object.fromEntries(
      files.basePdfs.map((f) => [f, new Uint8Array(readFileSync(path.join(rootDir, FORM_DIRS.basePdfs, f)))]),
    ),
    fieldMaps: Object.fromEntries(files.fieldMaps.map((f) => [stem(f), json(FORM_DIRS.fieldMaps, f)])),
    schemas: Object.fromEntries(files.schemas.map((f) => [stem(f), json(FORM_DIRS.schemas, f)])),
  };
}

export function createNodeFormStore(rootDir = defaultRoot) {
  return createFormStore(loadFormSources(rootDir));
}
