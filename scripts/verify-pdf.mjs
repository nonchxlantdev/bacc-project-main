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
import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { overlayChecklistPdf } from '../server/overlayChecklistPdf.js';
import { verifyPlacement } from './verify-placement.mjs';
import { buildAndVerify as buildVaes } from './fixture-vaes.mjs';
import { buildAndVerify as buildPmm } from './fixture-pmm.mjs';
import { buildBlanks } from './smoke-overlay.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const node = process.execPath;
const only = process.env.VERIFY_PDF_ONLY ?? '';

function run(script, args = []) {
  const result = spawnSync(node, [path.join(root, script), ...args], { cwd: root, stdio: 'inherit' });
  if (result.status) process.exit(result.status ?? 1);
}

// ---- Layer 1: base integrity -----------------------------------------------
if (!only) for (const item of await buildBlanks()) {
  run('scripts/pdf-diff.mjs', [`tmp-pdf-diff/${item.out}`, item.approved]);
}

let failed = [];

// ---- Layer 2a: Annex D (hand-built fixture, PMM layout) --------------------
if (!only) run('scripts/fixture-annex-d.mjs');
if (!only) {
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
  if (only) break;
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
  // VAES is the specialised filler — it knows the Appendix C layout. Everything
  // else goes through the PMM one, which fills header fields, summary blocks and
  // sign-offs generically and copes with a form that has no item table at all
  // (Annex I, and now the SMS hazard report). Routing the default the other way
  // round meant any newly added family landed in the narrower builder.
  const build = family === 'VAES' ? buildVaes : buildPmm;
  const res = await build({
    schema: JSON.parse(readFileSync(schemaPath, 'utf8')),
    fieldMap,
    basePdfBytes: readFileSync(basePdf),
    outDir: path.join(root, 'tmp-pdf-diff'),
    label: `${key} (${family})`,
  });
  if (!res.ok) failed.push(key);
}

// ---- Layer 3: worst-case fill — long tokens must stay inside each box ------
const WORST_TEXT =
  'TROGLODYTIDAE-SUPERCALIFRAGILISTIC The inspector recorded a long observation that must stay inside the printed cell and never cross a rule.';

function snakeKey(key) {
  return String(key).replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
}

function typesByMapKey(schema) {
  const types = new Map();
  for (const field of schema?.headerFields ?? []) types.set(field.mapKey ?? snakeKey(field.key), field.type);
  for (const field of schema?.summaryFields ?? []) {
    if (field.type === 'table') {
      const prefix = field.mapKey ?? snakeKey(field.key);
      for (const col of field.columns ?? []) types.set(`${prefix}\0${col.key}`, col.type ?? 'text');
    } else types.set(field.mapKey ?? snakeKey(field.key), field.type);
  }
  return types;
}

function worstValue(key, field, types) {
  if (field.type === 'mark') return true;
  if (field.type === 'image') return null;
  const cell = String(key).match(/^(.*)_(\d{2})_(.+)$/);
  const type = cell ? types.get(`${cell[1]}\0${cell[3]}`) : types.get(key);
  if (type === 'date') return '2026-12-28';
  if (type === 'time') return '23:59';
  if (type === 'datetime') return '28/12/2026 23:59';
  return WORST_TEXT;
}

function worstSignature() {
  const png = new PNG({ width: 80, height: 24 });
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const i = (png.width * y + x) << 2;
      const ink = y > 8 && y < 14;
      png.data[i] = ink ? 10 : 255;
      png.data[i + 1] = ink ? 10 : 255;
      png.data[i + 2] = ink ? 10 : 255;
      png.data[i + 3] = 255;
    }
  }
  return PNG.sync.write(png);
}

async function verifyWorstCase(schema, fieldMap) {
  const types = typesByMapKey(schema);
  const values = {};
  const images = {};
  const signature = worstSignature();
  for (const [key, field] of Object.entries(fieldMap.fields ?? {})) {
    if (field.type === 'image') images[key] = signature;
    else {
      const value = worstValue(key, field, types);
      if (value != null && value !== '') values[key] = value;
    }
  }
  const dir = path.join(root, 'tmp-pdf-diff');
  mkdirSync(dir, { recursive: true });
  const populated = await overlayChecklistPdf({
    basePdfBytes: readFileSync(path.join(root, 'src/assets/forms', fieldMap.basePdf)),
    fieldMap,
    values,
    images,
  });
  const blank = await overlayChecklistPdf({
    basePdfBytes: readFileSync(path.join(root, 'src/assets/forms', fieldMap.basePdf)),
    fieldMap,
    values: {},
    images: {},
  });
  const popPath = path.join(dir, `${fieldMap.templateKey}-worst.pdf`);
  const blankPath = path.join(dir, `${fieldMap.templateKey}-worst-blank.pdf`);
  writeFileSync(popPath, populated);
  writeFileSync(blankPath, blank);
  return verifyPlacement({
    populatedPdf: popPath,
    blankPdf: blankPath,
    fieldMap,
    label: `${fieldMap.templateKey} worst-case`,
    pad: 0.5,
    dpi: 220,
    checkOverprint: false,
  });
}

const worstTargets = [
  {
    file: 'annex-d-drainage-ed01.json',
    schema: 'annex-d-drainage.json',
  },
  ...generated.map((file) => ({ file, schema: null })),
];

for (const target of worstTargets) {
  const fieldMap = JSON.parse(readFileSync(path.join(mapDir, target.file), 'utf8'));
  if (only && fieldMap.templateKey !== only) continue;
  const schemaPath = path.join(root, 'src/data/checklists', target.schema ?? `${fieldMap.templateKey}.json`);
  if (!existsSync(schemaPath)) {
    console.error(`SKIP worst-case ${fieldMap.templateKey}: no schema`);
    failed.push(`${fieldMap.templateKey} worst-case`);
    continue;
  }
  const res = await verifyWorstCase(JSON.parse(readFileSync(schemaPath, 'utf8')), fieldMap);
  if (!res.ok) failed.push(`${fieldMap.templateKey} worst-case`);
}

console.log(`\nTemplates verified: ${1 + generated.length}, failures: ${failed.length}`);
if (failed.length) {
  console.error('Stamped ink landed outside the declared field boxes for:');
  for (const k of failed) console.error(`  - ${k}`);
  console.error('Fix the field map (or the overlay) before that template goes near BACC.');
  process.exit(1);
}
