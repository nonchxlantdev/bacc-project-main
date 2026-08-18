/**
 * Fully-populated Appendix C-8 (Wind Cone) fixture.
 *
 * Exercises what Annex D does not: a third N/A response column, synthetic item
 * codes, and signatures inline in the header block.
 *
 * Outputs: tmp-pdf-diff/c08-populated.pdf, tmp-pdf-diff/c08-blank.pdf
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { overlayChecklistPdf, dataUriToBytes } from '../server/overlayChecklistPdf.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'tmp-pdf-diff');
mkdirSync(outDir, { recursive: true });

const fieldMap = JSON.parse(
  readFileSync(path.join(root, 'src/data/field-maps/appendix-c08-wind-cone-ed01.json'), 'utf8'),
);
const schema = JSON.parse(
  readFileSync(path.join(root, 'src/data/checklists/appendix-c08-wind-cone.json'), 'utf8'),
);
const basePdfBytes = readFileSync(path.join(root, 'src/assets/forms', fieldMap.basePdf));

const values = {
  date_of_inspection: '2026-05-22',
  time_commenced: '08:15',
  time_completed: '09:40',
  weather_visibility: 'Clear, light NE wind 8 kt, visibility 10 km',
  'aoc_impact.no': true,
  responsible_name: 'R. Charlie / Elec. Maint. Technician',
  supervisor_name: 'D. Flowers / Elec. Maint. Supervisor',
};

// Cycle through all three response columns so every mark slot is exercised.
const results = ['sat', 'sat', 'no_sat', 'sat', 'na', 'sat', 'no_sat', 'sat', 'sat'];
schema.sections[0].items.forEach((item, i) => {
  const result = results[i % results.length];
  values[`${item.code}.${result}`] = true;
  if (result === 'no_sat') {
    values[`${item.code}.remarks`] =
      'Wear noted at mounting collar; OEM part ordered and scheduled for replacement';
  }
  if (result === 'na') values[`${item.code}.remarks`] = 'Not due this cycle';
});

function strokePng(seed) {
  const w = 300;
  const h = 72;
  const png = new PNG({ width: w, height: h });
  png.data.fill(255);
  for (let x = 10; x < w - 10; x++) {
    const y = Math.round(h / 2 + Math.sin((x + seed) / 14) * 16);
    for (let t = -2; t <= 2; t++) {
      const yy = y + t;
      if (yy < 0 || yy >= h) continue;
      const idx = (w * yy + x) << 2;
      png.data[idx] = 10;
      png.data[idx + 1] = 25;
      png.data[idx + 2] = 90;
      png.data[idx + 3] = 255;
    }
  }
  return `data:image/png;base64,${PNG.sync.write(png).toString('base64')}`;
}

const meta = {
  formCode: 'PGIA-CL-VAES-08',
  templateVersion: 'ed01',
  submissionId: 'C08-FIXTURE',
  photos: [],
};

writeFileSync(
  path.join(outDir, 'c08-populated.pdf'),
  await overlayChecklistPdf({
    basePdfBytes,
    fieldMap,
    values,
    images: {
      responsible_signature: dataUriToBytes(strokePng(0)),
      supervisor_signature: dataUriToBytes(strokePng(40)),
    },
    meta,
  }),
);

writeFileSync(
  path.join(outDir, 'c08-blank.pdf'),
  await overlayChecklistPdf({
    basePdfBytes,
    fieldMap,
    values: {},
    images: {},
    meta: { ...meta, submissionId: 'BLANK' },
  }),
);

console.log(`fixture: ${Object.keys(fieldMap.fields).length} mapped fields, ${schema.sections[0].items.length} items`);
console.log('wrote tmp-pdf-diff/c08-populated.pdf and c08-blank.pdf');
