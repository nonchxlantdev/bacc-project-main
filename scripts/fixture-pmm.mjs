/**
 * Generic PMM fixture + placement check.
 *
 * Builds a fully-populated submission for any PMM annex — every header field,
 * every item result, every remarks cell, every summary block and every
 * signature — overlays it onto the approved base, and asserts that every pixel
 * of stamped ink lands inside a declared field box.
 *
 * A form that passes here cannot have a coordinate quietly landing on top of
 * the approved wording, because the diff is against the same overlay run with
 * no values at all.
 *
 *   node fixture-pmm.mjs <schema.json> <fieldmap.json> <base.pdf> [outDir]
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import { overlayChecklistPdf, submissionToOverlayValues, dataUriToBytes } from '../server/overlayChecklistPdf.js';
import { verifyPlacement } from './verify-placement.mjs';

const SAMPLE = {
  date: '2026-05-22',
  time: '08:15',
  number: '42',
  text: 'Clear, light NE wind 8 kt, visibility 10 km',
};

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
      const i = (w * yy + x) << 2;
      png.data[i] = 10;
      png.data[i + 1] = 25;
      png.data[i + 2] = 90;
      png.data[i + 3] = 255;
    }
  }
  return `data:image/png;base64,${PNG.sync.write(png).toString('base64')}`;
}

export async function buildAndVerify({ schema, fieldMap, basePdfBytes, outDir, label }) {
  mkdirSync(outDir, { recursive: true });

  const header = {};
  for (const f of schema.headerFields ?? []) {
    header[f.key] = f.options?.length ? f.options[0].value : SAMPLE[f.type] ?? SAMPLE.text;
  }

  const summary = {};
  for (const f of schema.summaryFields ?? []) {
    // A log sheet's grid. Fill every printed row and two beyond it, so the
    // fixture exercises both the ruled cells and the continuation page — an
    // unfilled grid would let a mis-measured cell pass the placement gate
    // simply by never being stamped.
    if (f.type === 'table') {
      const printed = f.printedRows ?? 0;
      summary[f.key] = Array.from({ length: printed + 2 }, (_, r) =>
        Object.fromEntries((f.columns ?? []).map((c) => [c.key, `${c.label} ${r + 1}`])),
      );
      continue;
    }
    summary[f.key] = f.options?.length
      ? f.options[f.options.length - 1].value
      : 'Deficiency recorded during this inspection; OM notified and corrective action scheduled with the contractor.';
  }

  const items = {};
  const results = ['sat', 'no_sat'];
  (schema.sections ?? []).forEach((sec) => {
    (sec.items ?? []).forEach((item, i) => {
      const result = results[i % results.length];
      items[item.code] = {
        result,
        remarks: result === 'sat' ? '' : `Defect at ${item.code}; repair raised and scheduled`,
      };
    });
  });

  const signoffs = (schema.signoffs ?? []).map((s) => ({
    role: s.role,
    name: 'R. Charlie',
    position: 'Maintenance Inspector',
    signed_at: '2026-05-22T16:10:00-06:00',
  }));

  const record = {
    id: `${fieldMap.templateKey}-FIXTURE`,
    template_code: schema.code,
    schema,
    header,
    summary,
    items,
    signoffs,
    deficiencies_summary: '',
  };

  const images = {};
  let seed = 0;
  for (const [key, f] of Object.entries(fieldMap.fields)) {
    if (f.type === 'image') {
      images[key] = dataUriToBytes(strokePng(seed));
      seed += 40;
    }
  }

  const values = submissionToOverlayValues(record);
  // Anything mapped but still unset would leave a coordinate unexercised, and an
  // unexercised coordinate is an unverified one.
  for (const [key, f] of Object.entries(fieldMap.fields)) {
    if (f.type === 'image' || f.type === 'mark') continue;
    if (values[key] === undefined || values[key] === '') values[key] = SAMPLE.text;
  }

  const meta = {
    formCode: schema.code,
    templateVersion: fieldMap.templateVersion,
    submissionId: record.id,
    photos: [],
  };

  const populated = path.join(outDir, `${fieldMap.templateKey}-populated.pdf`);
  const blank = path.join(outDir, `${fieldMap.templateKey}-blank.pdf`);
  writeFileSync(populated, await overlayChecklistPdf({ basePdfBytes, fieldMap, values, images, meta }));
  writeFileSync(
    blank,
    await overlayChecklistPdf({
      basePdfBytes,
      fieldMap,
      values: {},
      images: {},
      meta: { ...meta, submissionId: 'BLANK' },
    }),
  );

  return verifyPlacement({ populatedPdf: populated, blankPdf: blank, fieldMap, label: label ?? fieldMap.templateKey });
}

if (process.argv[1]?.endsWith('fixture-pmm.mjs')) {
  const [, , schemaPath, mapPath, basePdf, outDir = 'tmp-pdf-diff'] = process.argv;
  const res = await buildAndVerify({
    schema: JSON.parse(readFileSync(schemaPath, 'utf8')),
    fieldMap: JSON.parse(readFileSync(mapPath, 'utf8')),
    basePdfBytes: readFileSync(basePdf),
    outDir,
  });
  process.exit(res.ok ? 0 : 1);
}
