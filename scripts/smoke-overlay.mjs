/**
 * Layer 1 of the fidelity gate: base integrity.
 *
 * Runs each overlay writer over its approved base PDF with NOTHING to stamp,
 * and writes the result to tmp-pdf-diff. A blank overlay must come out
 * byte-for-byte indistinguishable from the approved form once rasterised — if
 * pdf-lib re-encodes a font, drops an XObject or shifts the page box, this is
 * where it shows up, before any coordinate work is blamed for it.
 *
 * `verify-pdf.mjs` then diffs each output against its source with pdf-diff.
 * Run standalone with:  node scripts/smoke-overlay.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { overlayChecklistPdf } from '../server/overlayChecklistPdf.js';
import { overlayRegisterPdf } from '../server/overlayRegisterPdf.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'tmp-pdf-diff');

const read = (rel) => readFileSync(path.join(root, rel));
const json = (rel) => JSON.parse(readFileSync(path.join(root, rel), 'utf8'));

/** Each blank we produce, and the approved form it must match. */
export const BASE_INTEGRITY_CASES = [
  {
    out: 'overlay-blank.pdf',
    approved: 'src/assets/forms/annex-d-drainage-ed01.pdf',
    map: 'src/data/field-maps/annex-d-drainage-ed01.json',
    kind: 'checklist',
  },
  {
    out: 'overlay-h-blank.pdf',
    approved: 'src/assets/forms/annex-h-work-order-ed01.pdf',
    map: 'src/data/field-maps/annex-h-work-order-ed01.json',
    kind: 'checklist',
  },
  {
    out: 'overlay-g-blank.pdf',
    approved: 'src/assets/forms/annex-g-noc-register-ed01.pdf',
    map: 'src/data/field-maps/annex-g-noc-register-ed01.json',
    kind: 'register',
  },
];

export async function buildBlanks() {
  mkdirSync(outDir, { recursive: true });
  for (const item of BASE_INTEGRITY_CASES) {
    const basePdfBytes = read(item.approved);
    const fieldMap = json(item.map);
    const bytes =
      item.kind === 'register'
        ? await overlayRegisterPdf({ basePdfBytes, fieldMap, rows: [] })
        : await overlayChecklistPdf({ basePdfBytes, fieldMap, values: {}, images: {} });
    writeFileSync(path.join(outDir, item.out), bytes);
    console.log(`blank overlay written: ${item.out}`);
  }
  return BASE_INTEGRITY_CASES;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await buildBlanks();
}
