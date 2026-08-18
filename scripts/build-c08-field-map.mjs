/**
 * Build the Appendix C-8 (Wind Cone) field map.
 *
 * Coordinates are PDF points, bottom-left origin (pdf-lib). Positions were
 * measured from the approved base PDF, not estimated:
 *
 *   conversion from `pdftotext -bbox` (top-origin) to pdf-lib (bottom-origin):
 *       y_pdf = PAGE_H - yTop - 9.74      (derived from Annex D, exact)
 *
 *   header grid rules : 63.6 | 294.4 | 531.9   -> value cell 294.4 .. 531.9
 *   item table rules  : 66.4 | 322.7 | 355.3 | 404.0 | 441.7 | 534.1
 *                       item | SAT | NOSAT | N/A | remarks
 *
 * Unlike Annex D this form has THREE response columns (SAT / NOSAT / N/A),
 * no section headers, no printed item codes, and its signatures sit inline in
 * the header block rather than on a separate page.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PAGE_W = 612.12;
const PAGE_H = 792.12;

/** bbox top-origin -> pdf-lib bottom-origin, for checkbox glyph rows. */
const toPdfY = (yTop) => +(PAGE_H - yTop - 9.74).toFixed(2);
/** bbox bottom edge -> text baseline that sits just above a printed rule. */
const baselineY = (yBot) => +(PAGE_H - yBot + 2).toFixed(2);

const VALUE_X = 300; // header value column (rule at 294.4, values printed at 300.1)
const VALUE_W = 228; // 300 -> 531.9 minus padding

const SAT_X = 335.1;
const NO_SAT_X = 375.8;
const NA_X = 419.1;
const REMARKS_X = 445;
const REMARKS_WIDTH = 86; // 445 -> 534.1 table edge, minus padding
const MARK_SIZE = 9;

/** Checkbox glyph rows from the approved PDF (bbox top-origin). */
const ITEM_ROWS_TOP = [450.52, 484.0, 504.64, 538.12, 558.88, 579.64, 613.03, 646.39, 667.15];

/** Row height in points, used for remarks wrapping. Rows differ where the item text wraps. */
const ITEM_TEXT_TOP = [454.89, 488.37, 509.01, 542.49, 563.25, 584.01, 617.4, 650.76, 671.52];

const fields = {
  date_of_inspection: { page: 0, x: VALUE_X, y: baselineY(259.85), size: 9, width: 150 },
  time_commenced: { page: 0, x: VALUE_X, y: baselineY(280.61), size: 9, width: 150 },
  time_completed: { page: 0, x: VALUE_X, y: baselineY(301.37), size: 9, width: 150 },
  weather_visibility: {
    page: 0,
    x: VALUE_X,
    y: baselineY(322.13),
    size: 9,
    width: VALUE_W,
    wrap: true,
    maxLines: 1,
    overflow: 'continuation',
  },
  'aoc_impact.yes': { page: 0, x: 320.0, y: toPdfY(328.58), type: 'mark', size: MARK_SIZE },
  'aoc_impact.no': { page: 0, x: 353.0, y: toPdfY(328.58), type: 'mark', size: MARK_SIZE },

  // VAES header rows are only ~20.8pt apart, so a signature image must be short
  // enough not to reach the row above. The printed name sits BESIDE the
  // signature rather than under it, or the image would cover the text.
  responsible_signature: { page: 0, x: VALUE_X, y: baselineY(376.25), type: 'image', width: 118, height: 16 },
  responsible_name: { page: 0, x: VALUE_X + 122, y: baselineY(376.25), size: 6.5, width: 106, wrap: true, maxLines: 1, overflow: 'continuation' },
  supervisor_signature: { page: 0, x: VALUE_X, y: baselineY(397.01), type: 'image', width: 118, height: 16 },
  supervisor_name: { page: 0, x: VALUE_X + 122, y: baselineY(397.01), size: 6.5, width: 106, wrap: true, maxLines: 1, overflow: 'continuation' },
};

ITEM_ROWS_TOP.forEach((yTop, i) => {
  const code = `C08-${String(i + 1).padStart(2, '0')}`;
  const y = toPdfY(yTop);
  const nextTop = ITEM_TEXT_TOP[i + 1] ?? ITEM_TEXT_TOP[i] + 20.76;
  const rowHeight = nextTop - ITEM_TEXT_TOP[i];
  fields[`${code}.sat`] = { page: 0, x: SAT_X, y, type: 'mark', size: MARK_SIZE };
  fields[`${code}.no_sat`] = { page: 0, x: NO_SAT_X, y, type: 'mark', size: MARK_SIZE };
  fields[`${code}.na`] = { page: 0, x: NA_X, y, type: 'mark', size: MARK_SIZE };
  fields[`${code}.remarks`] = {
    page: 0,
    x: REMARKS_X,
    y: y + 1,
    width: REMARKS_WIDTH,
    height: rowHeight,
    size: 7,
    wrap: true,
    maxLines: rowHeight > 25 ? 2 : 1,
    overflow: 'continuation',
  };
});

const map = {
  templateKey: 'appendix-c08-wind-cone',
  templateVersion: 'ed01',
  basePdf: 'appendix-c08-wind-cone-ed01.pdf',
  documentFamily: 'VAES',
  origin: 'pdf-points-bottom-left',
  originNote:
    'Coordinates are PDF points with a bottom-left origin (pdf-lib / pdf.js). From pdftotext -bbox: y_pdf = 792.12 - yTop - 9.74.',
  mapping: {
    method: 'pdftotext -bbox glyph positions + raster rule detection from approved base PDF',
    measuredRules: {
      headerGrid: [63.6, 294.4, 531.9],
      itemTable: [66.4, 322.7, 355.3, 404.0, 441.7, 534.1],
    },
    durationMinutes: 18,
  },
  pageSize: { width: PAGE_W, height: PAGE_H },
  fields,
};

mkdirSync(path.join(root, 'src/data/field-maps'), { recursive: true });
writeFileSync(
  path.join(root, 'src/data/field-maps/appendix-c08-wind-cone-ed01.json'),
  JSON.stringify(map, null, 2),
);
console.log(`Wrote ${Object.keys(fields).length} fields for ${map.templateKey}`);
