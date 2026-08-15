/**
 * Overlay an empty (and a sample filled) submission onto the approved Annex D PDF.
 * Used by `npm run verify:pdf` so the harness always has a generated artifact.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { overlayChecklistPdf, submissionToOverlayValues } from '../server/overlayChecklistPdf.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fieldMap = JSON.parse(
  readFileSync(path.join(root, 'src/data/field-maps/annex-d-drainage-ed01.json'), 'utf8'),
);
const basePdfBytes = readFileSync(path.join(root, 'src/assets/forms', fieldMap.basePdf));
const outDir = path.join(root, 'tmp-pdf-diff');
mkdirSync(outDir, { recursive: true });

const blank = await overlayChecklistPdf({
  basePdfBytes,
  fieldMap,
  values: {},
  images: {},
  meta: { formCode: fieldMap.templateKey, templateVersion: fieldMap.templateVersion },
});
writeFileSync(path.join(outDir, 'overlay-blank.pdf'), blank);

const sampleItems = {};
for (const key of Object.keys(fieldMap.fields)) {
  const match = key.match(/^(DR-\d+)\.sat$/);
  if (match) sampleItems[match[1]] = { result: 'sat', remarks: '' };
}
sampleItems['DR-01'] = { result: 'no_sat', remarks: 'Debris at runway 07 swale — continuation test.' };

const sample = await overlayChecklistPdf({
  basePdfBytes,
  fieldMap,
  values: submissionToOverlayValues({
    header: {
      date: '2026-08-15',
      inspectionType: 'monthly_routine',
      conductedBy: 'Local Inspector / Airside Inspector',
      rainfallMm: '12',
    },
    items: sampleItems,
    deficiencies_summary: 'See DR-01 remarks.',
    signoffs: [],
    id: 'smoke-sample',
    template_code: 'PGIA-PMM-F04',
  }),
  images: {},
  meta: {
    formCode: 'PGIA-PMM-F04',
    templateVersion: 'ed01',
    submissionId: 'smoke-sample',
  },
});
writeFileSync(path.join(outDir, 'overlay-sample.pdf'), sample);

console.log(`Wrote ${path.join(outDir, 'overlay-blank.pdf')} and overlay-sample.pdf`);
