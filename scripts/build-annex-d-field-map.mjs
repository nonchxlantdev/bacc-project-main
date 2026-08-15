/**
 * Build Annex D field map from pdf.js text positions (PDF points, bottom-left origin).
 * Same coordinate convention as /dev/field-mapper.
 */
import { writeFileSync } from 'node:fs';

const SAT_X = 392.2;
const NO_SAT_X = 428.2;
const REMARKS_X = 456.1;
const REMARKS_WIDTH = 90;
const MARK_SIZE = 9;

/** Checkbox y from the approved PDF (pdf.js text positions). */
const ITEMS = [
  { code: 'DR-01', page: 0, y: 430.6, height: 26 },
  { code: 'DR-02', page: 0, y: 401.8, height: 26 },
  { code: 'DR-03', page: 0, y: 373.0, height: 18 },
  { code: 'DR-04', page: 0, y: 352.9, height: 18 },
  { code: 'DR-05', page: 0, y: 332.8, height: 18 },
  { code: 'DR-06', page: 0, y: 304.0, height: 26 },
  { code: 'DR-07', page: 0, y: 284.0, height: 18 },
  { code: 'DR-08', page: 0, y: 219.5, height: 18 },
  { code: 'DR-09', page: 0, y: 199.4, height: 18 },
  { code: 'DR-10', page: 0, y: 179.3, height: 18 },
  { code: 'DR-12', page: 0, y: 159.3, height: 18 },
  { code: 'DR-13', page: 0, y: 86.1, height: 18 },
  { code: 'DR-14', page: 1, y: 680.1, height: 18 },
  { code: 'DR-15', page: 1, y: 660.1, height: 18 },
  { code: 'DR-16', page: 1, y: 640.1, height: 18 },
  { code: 'DR-17', page: 1, y: 575.5, height: 26 },
  { code: 'DR-18', page: 1, y: 546.7, height: 26 },
  { code: 'DR-19', page: 1, y: 517.9, height: 26 },
  { code: 'DR-20', page: 1, y: 489.1, height: 18 },
  { code: 'DR-21', page: 1, y: 469.0, height: 18 },
  { code: 'DR-22', page: 1, y: 395.8, height: 26 },
  { code: 'DR-23', page: 1, y: 367.0, height: 18 },
  { code: 'DR-24', page: 1, y: 347.0, height: 18 },
  { code: 'DR-25', page: 1, y: 326.9, height: 18 },
  { code: 'DR-26', page: 1, y: 306.8, height: 18 },
  { code: 'DR-27', page: 1, y: 286.7, height: 18 },
];

const fields = {
  inspection_date: { page: 0, x: 100, y: 585.5, size: 9, width: 90 },
  'inspection_type.monthly_routine': { page: 0, x: 279.7, y: 564.7, type: 'mark' },
  'inspection_type.semi_annual_cec': { page: 0, x: 420.0, y: 564.7, type: 'mark' },
  'inspection_type.post_storm_emergency': { page: 0, x: 260.2, y: 552.7, type: 'mark' },
  conducted_by: {
    page: 0,
    x: 168,
    y: 533.8,
    size: 9,
    width: 360,
    wrap: true,
    maxLines: 2,
    overflow: 'continuation',
  },
  rainfall_mm: { page: 0, x: 200, y: 505.0, size: 9, width: 80 },
};

for (const item of ITEMS) {
  fields[`${item.code}.sat`] = { page: item.page, x: SAT_X, y: item.y, type: 'mark', size: MARK_SIZE };
  fields[`${item.code}.no_sat`] = { page: item.page, x: NO_SAT_X, y: item.y, type: 'mark', size: MARK_SIZE };
  fields[`${item.code}.remarks`] = {
    page: item.page,
    x: REMARKS_X,
    y: item.y,
    width: REMARKS_WIDTH,
    height: item.height,
    size: 7,
    wrap: true,
    maxLines: item.height > 20 ? 2 : 1,
    overflow: 'continuation',
  };
}

fields.deficiencies_summary = {
  page: 1,
  x: 76,
  y: 228,
  width: 460,
  height: 148,
  size: 9,
  wrap: true,
  maxLines: 10,
  overflow: 'continuation',
};

fields.inspector_signature = { page: 2, x: 72, y: 572, type: 'image', width: 150, height: 36 };
fields.inspector_name = { page: 2, x: 72, y: 572, size: 9, width: 150 };
fields.inspector_date = { page: 2, x: 110, y: 547.5, size: 9, width: 80 };
fields.om_signature = { page: 2, x: 306.1, y: 572, type: 'image', width: 150, height: 36 };
fields.om_name = { page: 2, x: 306.1, y: 572, size: 9, width: 180 };
fields.om_date = { page: 2, x: 344, y: 547.5, size: 9, width: 80 };

const map = {
  templateKey: 'annex-d-drainage',
  templateVersion: 'ed01',
  basePdf: 'annex-d-drainage-ed01.pdf',
  origin: 'pdf-points-bottom-left',
  originNote:
    'Coordinates are PDF points with a bottom-left origin (pdf-lib / pdf.js). Canvas clicks in /dev/field-mapper convert as pdfY = pageHeight - (clickY / canvasHeight) * pageHeight.',
  mapping: {
    method: 'pdf.js text positions from approved base PDF (same origin as field-mapper)',
    durationMinutes: 22,
    measuredAt: new Date().toISOString(),
  },
  pageSize: { width: 612.12, height: 792.12 },
  fields,
};

writeFileSync('src/data/field-maps/annex-d-drainage-ed01.json', JSON.stringify(map, null, 2));
console.log(`Wrote ${Object.keys(fields).length} fields`);
