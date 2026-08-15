/**
 * Overlay Annex G register rows onto repeated copies of the approved base page.
 * Asserts overflow: repeat-base-page (never a synthesised continuation sheet).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument } from 'pdf-lib';
import { overlayRegisterPdf, incidentToRegisterRow } from '../server/overlayRegisterPdf.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fieldMap = JSON.parse(
  readFileSync(path.join(root, 'src/data/field-maps/annex-g-noc-register-ed01.json'), 'utf8'),
);
const basePdfBytes = readFileSync(path.join(root, 'src/assets/forms', fieldMap.basePdf));
const outDir = path.join(root, 'tmp-pdf-diff');
mkdirSync(outDir, { recursive: true });

const blank = await overlayRegisterPdf({ basePdfBytes, fieldMap, rows: [] });
writeFileSync(path.join(outDir, 'overlay-g-blank.pdf'), blank);

const rowsPerPage = fieldMap.table.rowsPerPage ?? 18;
const incidents = Array.from({ length: rowsPerPage + 2 }, (_, i) => ({
  noc_no: String(i + 1).padStart(4, '0'),
  source_inspection_date: '2026-08-15',
  source_inspection_type: 'monthly_routine',
  deficiency_level: (i % 4) + 1,
  description: `Sample deficiency ${i + 1}`,
  location_label: 'Runway West Edge',
  assigned_to_name: 'CEC',
  target_date: '2026-08-22',
  closed_at: i === 0 ? '2026-08-18' : null,
  closure_notes: i === 0 ? 'SAT re-inspection' : '',
}));
const rows = incidents.map(incidentToRegisterRow);
const filled = await overlayRegisterPdf({ basePdfBytes, fieldMap, rows });
writeFileSync(path.join(outDir, 'overlay-g-multipage.pdf'), filled);

const blankDoc = await PDFDocument.load(blank);
const filledDoc = await PDFDocument.load(filled);
const expectedPages = Math.ceil(rows.length / rowsPerPage);

if (blankDoc.getPageCount() !== 1) {
  throw new Error(`Empty register should be one approved page, got ${blankDoc.getPageCount()}`);
}
if (filledDoc.getPageCount() !== expectedPages) {
  throw new Error(`Expected ${expectedPages} repeated base pages, got ${filledDoc.getPageCount()}`);
}

const src = await PDFDocument.load(basePdfBytes);
const srcSize = src.getPages()[0].getSize();
for (const page of filledDoc.getPages()) {
  const size = page.getSize();
  if (Math.abs(size.width - srcSize.width) > 0.5 || Math.abs(size.height - srcSize.height) > 0.5) {
    throw new Error('Register overflow synthesised a non-approved page size');
  }
}

console.log(
  `Wrote overlay-g-blank.pdf (1 page) and overlay-g-multipage.pdf (${filledDoc.getPageCount()} repeated base pages)`,
);
