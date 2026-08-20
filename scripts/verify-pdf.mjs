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
 * Templates are DISCOVERED from src/data/field-maps, so a newly extracted form
 * is covered automatically — there is no list to forget to update. Both families
 * are included: VAES (Appendix C) and PMM (Annexes A–J).
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyPlacement } from './verify-placement.mjs';
import { buildAndVerify as buildVaes } from './fixture-vaes.mjs';
import { buildAndVerify as buildPmm } from './fixture-pmm.mjs';
import { buildBlanks } from './smoke-overlay.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const node = process.execPath;

function run(script, args = []) {
  const result = spawnSync(node, [path.join(root, script), ...args], { cwd: root, stdio: 'inherit' });
  if (result.status) process.exit(result.status ?? 1);
}

// ---- Layer 1: base integrity -----------------------------------------------
for (const item of await buildBlanks()) {
  run('scripts/pdf-diff.mjs', [`tmp-pdf-diff/${item.out}`, item.approved]);
}

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

// ---- Layer 2b: every generated template, discovered ------------------------
// Annex D is hand-mapped and already checked above; Annex G/H are registers,
// not fillable checklists, so they have no populated fixture.
const mapDir = path.join(root, 'src/data/field-maps');
const HAND_MAPPED = new Set([
  'annex-d-drainage-ed01.json',
  'annex-g-noc-register-ed01.json',
  'annex-h-work-order-ed01.json',
]);
const generated = readdirSync(mapDir)
  .filter((f) => f.endsWith('-ed01.json') && !HAND_MAPPED.has(f))
  .sort();

for (const file of generated) {
  const fieldMap = JSON.parse(readFileSync(path.join(mapDir, file), 'utf8'));
  const key = fieldMap.templateKey;
  const family = fieldMap.documentFamily ?? (file.startsWith('appendix-c') ? 'VAES' : 'PMM');
  const schemaPath = path.join(root, 'src/data/checklists', `${key}.json`);
  const basePdf = path.join(root, 'src/assets/forms', fieldMap.basePdf);
  if (!existsSync(schemaPath) || !existsSync(basePdf)) {
    console.error(`SKIP ${key}: missing schema or base PDF`);
    failed.push(key);
    continue;
  }
  const build = family === 'PMM' ? buildPmm : buildVaes;
  const res = await build({
    schema: JSON.parse(readFileSync(schemaPath, 'utf8')),
    fieldMap,
    basePdfBytes: readFileSync(basePdf),
    outDir: path.join(root, 'tmp-pdf-diff'),
    label: `${key} (${family})`,
  });
  if (!res.ok) failed.push(key);
}

console.log(`\nTemplates verified: ${1 + generated.length}, failures: ${failed.length}`);
if (failed.length) {
  console.error('Stamped ink landed outside the declared field boxes for:');
  for (const k of failed) console.error(`  - ${k}`);
  console.error('Fix the field map (or the overlay) before that template goes near BACC.');
  process.exit(1);
}
