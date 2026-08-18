/**
 * Generic VAES fixture + placement check.
 *
 * One fixture for the whole family: everything is driven by the template's own
 * schema and field map, so a newly extracted form is verifiable with no new code.
 *
 *   node fixture-vaes.mjs <schema.json> <fieldmap.json> <base.pdf>
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import { overlayChecklistPdf, submissionToOverlayValues, dataUriToBytes } from './overlayChecklistPdf.js';
import { verifyPlacement } from './verify-placement.mjs';

const SAMPLE = {
  date: '2026-05-22',
  time: '08:15',
  text: 'Clear, light NE wind 8 kt, visibility 10 km',
  yes_no: 'no',
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
    header[f.key] = SAMPLE[f.type] ?? SAMPLE.text;
  }

  const items = {};
  const results = ['sat', 'no_sat', 'na'];
  (schema.sections ?? []).forEach((sec) => {
    (sec.items ?? []).forEach((item, i) => {
      const result = results[i % results.length];
      items[item.code] = {
        result,
        remarks:
          result === 'sat'
            ? ''
            : `Defect noted at ${item.code}; OEM part ordered and scheduled for replacement`,
      };
    });
  });

  const record = {
    id: `${fieldMap.templateKey}-FIXTURE`,
    template_code: schema.code,
    schema,
    header,
    items,
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
  // every *_name beside a signature
  const values = submissionToOverlayValues(record);
  for (const key of Object.keys(fieldMap.fields)) {
    if (key.endsWith('_name') && values[key] === undefined) {
      values[key] = key.startsWith('supervisor')
        ? 'D. Flowers / Elec. Maint. Supervisor'
        : 'R. Charlie / Elec. Maint. Technician';
    }
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

if (process.argv[1]?.endsWith('fixture-vaes.mjs')) {
  const [, , schemaPath, mapPath, basePdf, outDir = 'tmp-pdf-diff'] = process.argv;
  const res = await buildAndVerify({
    schema: JSON.parse(readFileSync(schemaPath, 'utf8')),
    fieldMap: JSON.parse(readFileSync(mapPath, 'utf8')),
    basePdfBytes: readFileSync(basePdf),
    outDir,
  });
  process.exit(res.ok ? 0 : 1);
}
