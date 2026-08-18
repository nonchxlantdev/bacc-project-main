/**
 * PDF fidelity gate — BACC acceptance criterion #11.
 *
 * Two layers, because they prove different things:
 *
 *   1. BASE INTEGRITY — blank overlay vs approved source. Proves pdf-lib
 *      round-trips the approved form without altering it. A blank overlay
 *      stamps nothing, so this always matches; that is the point.
 *
 *   2. PLACEMENT — populated overlay vs blank overlay. Every changed pixel is
 *      something we stamped; each must fall inside a declared field box.
 *      Without this, a field map with every coordinate wrong still passes
 *      layer 1. This is the check that actually verifies an export.
 *
 * VAES templates are DISCOVERED from src/data/field-maps, so a newly extracted
 * form is covered automatically — there is no list to forget to update.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyPlacement } from './verify-placement.mjs';
import { buildAndVerify } from './fixture-vaes.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const node = process.execPath;

function run(script, args = []) {
  const result = spawnSync(node, [path.join(root, script), ...args], { cwd: root, stdio: 'inherit' });
  if (result.status) process.exit(result.status ?? 1);
}

// ---- Layer 1: base integrity -----------------------------------------------
run('scripts/smoke-overlay.mjs');
run('scripts/smoke-overlay-h.mjs');
run('scripts/smoke-register.mjs');
run('scripts/pdf-diff.mjs', ['tmp-pdf-diff/overlay-blank.pdf', 'src/assets/forms/annex-d-drainage-ed01.pdf']);
run('scripts/pdf-diff.mjs', ['tmp-pdf-diff/overlay-h-blank.pdf', 'src/assets/forms/annex-h-work-order-ed01.pdf']);
run('scripts/pdf-diff.mjs', ['tmp-pdf-diff/overlay-g-blank.pdf', 'src/assets/forms/annex-g-noc-register-ed01.pdf']);

let failed = [];

// ---- Layer 2a: Annex D (hand-built fixture, PMM layout) --------------------
run('scripts/fixture-annex-d.mjs');
{
  const fieldMap = JSON.parse(
    readFileSync(path.join(root, 'src/data/field-maps/annex-d-drainage-ed01.json'), 'utf8'),
  );
  const res = verifyPlacement({
    populatedPdf: path.join(root, 'tmp-pdf-diff/annex-d-populated.pdf'),
    blankPdf: path.join(root, 'tmp-pdf-diff/annex-d-blank.pdf'),
    fieldMap,
    label: 'Annex D — Drainage (PMM)',
  });
  if (!res.ok) failed.push('annex-d-drainage');
}

// ---- Layer 2b: every VAES template, discovered ----------------------------
const mapDir = path.join(root, 'src/data/field-maps');
const vaesMaps = readdirSync(mapDir)
  .filter((f) => f.startsWith('appendix-c') && f.endsWith('-ed01.json'))
  .sort();

for (const file of vaesMaps) {
  const fieldMap = JSON.parse(readFileSync(path.join(mapDir, file), 'utf8'));
  const key = fieldMap.templateKey;
  const schemaPath = path.join(root, 'src/data/checklists', `${key}.json`);
  const basePdf = path.join(root, 'src/assets/forms', fieldMap.basePdf);
  if (!existsSync(schemaPath) || !existsSync(basePdf)) {
    console.error(`SKIP ${key}: missing schema or base PDF`);
    failed.push(key);
    continue;
  }
  const res = await buildAndVerify({
    schema: JSON.parse(readFileSync(schemaPath, 'utf8')),
    fieldMap,
    basePdfBytes: readFileSync(basePdf),
    outDir: path.join(root, 'tmp-pdf-diff'),
    label: `${fieldMap.templateKey} (VAES)`,
  });
  if (!res.ok) failed.push(key);
}

console.log(`\nTemplates verified: ${1 + vaesMaps.length}, failures: ${failed.length}`);
if (failed.length) {
  console.error('Stamped ink landed outside the declared field boxes for:');
  for (const k of failed) console.error(`  - ${k}`);
  console.error('Fix the field map (or the overlay) before that template goes near BACC.');
  process.exit(1);
}
