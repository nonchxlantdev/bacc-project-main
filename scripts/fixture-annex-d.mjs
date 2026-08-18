/**
 * Fully-populated Annex D fixture.
 *
 * Every mapped field gets a value and both mark columns are exercised, so any
 * coordinate error shows up as ink outside its declared box. Also emits a blank
 * overlay so the placement check can diff populated-vs-blank and isolate
 * exactly the pixels we stamped.
 *
 * Outputs: tmp-pdf-diff/annex-d-populated.pdf, tmp-pdf-diff/annex-d-blank.pdf
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import {
  overlayChecklistPdf,
  submissionToOverlayValues,
  dataUriToBytes,
} from '../server/overlayChecklistPdf.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'tmp-pdf-diff');
mkdirSync(outDir, { recursive: true });

const fieldMap = JSON.parse(
  readFileSync(path.join(root, 'src/data/field-maps/annex-d-drainage-ed01.json'), 'utf8'),
);
const schema = JSON.parse(
  readFileSync(path.join(root, 'src/data/checklists/annex-d-drainage.json'), 'utf8'),
);
const basePdfBytes = readFileSync(path.join(root, 'src/assets/forms', fieldMap.basePdf));

const items = {};
let i = 0;
for (const section of schema.sections) {
  for (const item of section.items) {
    const noSat = i % 3 === 0;
    items[item.code] = {
      result: noSat ? 'no_sat' : 'sat',
      remarks: noSat
        ? `Defect at ${item.code} location — debris and sediment build up requiring clearance`
        : '',
    };
    i += 1;
  }
}

const record = {
  id: 'FIXTURE-0001',
  template_code: 'PGIA-PMM-F04',
  header: {
    date: '2026-05-22',
    inspectionType: 'monthly_routine',
    conductedBy: 'John Smith / Maintenance Inspector',
    rainfallMm: '45',
  },
  items,
  deficiencies_summary:
    'Debris and sediment build up in Runway west edge drainage channel near RWY 25 end. Recommend clearing and re-grading of channel. Culvert headwall at Location 2 shows early separation from embankment and should be monitored monthly until rectified.',
  signoffs: [
    {
      role: 'inspector',
      name: 'John Smith',
      position: 'Maintenance Inspector',
      signed_at: '2026-05-22T10:35:00-06:00',
    },
    {
      role: 'om_acknowledgment',
      name: 'Alicia Nunez',
      position: 'Operations Manager',
      signed_at: '2026-05-23T08:15:00-06:00',
    },
  ],
};

/** Deterministic synthetic signature so the image slots are exercised. */
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
  formCode: 'PGIA-PMM-F04',
  templateVersion: 'ed01',
  submissionId: record.id,
  photos: [],
};

const populated = await overlayChecklistPdf({
  basePdfBytes,
  fieldMap,
  values: submissionToOverlayValues(record),
  images: {
    inspector_signature: dataUriToBytes(strokePng(0)),
    om_signature: dataUriToBytes(strokePng(40)),
  },
  meta,
});
writeFileSync(path.join(outDir, 'annex-d-populated.pdf'), populated);

const blank = await overlayChecklistPdf({
  basePdfBytes,
  fieldMap,
  values: {},
  images: {},
  meta: { ...meta, submissionId: 'BLANK' },
});
writeFileSync(path.join(outDir, 'annex-d-blank.pdf'), blank);

console.log(`fixture: ${Object.keys(fieldMap.fields).length} mapped fields, ${Object.keys(items).length} items`);
console.log('wrote tmp-pdf-diff/annex-d-populated.pdf and annex-d-blank.pdf');
