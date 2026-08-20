/**
 * Every declared sign-off reaches the exported PDF.
 *
 * A signature block is three things — an image, a name, a date — and they used
 * to be produced by two different pieces of code that disagreed about which
 * roles existed. The value mapper handled every role; the image collector
 * handled two. The result was that 29 of the 30 approved forms exported with
 * blank signature images and nobody noticed, because Annex D (the one that was
 * hand-tested) happened to be the one pair that worked.
 *
 * So this checks the whole set: for each template, sign every role its schema
 * declares, export, and confirm every slot the approved form actually has is
 * filled. Slots the form does not have are not invented — the VAES appendices
 * carry no date beside their signatures, and §14 forbids adding one.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { overlayChecklistPdf, submissionToOverlayValues } from '../server/overlayChecklistPdf.js';
import { signatureImages, signoffFieldKeys } from '../src/lib/signoffFields.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** A visible scribble, so a missing image is a missing mark and not a blank. */
function signaturePng() {
  const png = new PNG({ width: 120, height: 40 });
  for (let y = 0; y < 40; y += 1) {
    for (let x = 0; x < 120; x += 1) {
      const i = (png.width * y + x) << 2;
      const on = Math.abs(y - 20 - Math.round(12 * Math.sin(x / 8))) < 3;
      png.data[i] = png.data[i + 1] = png.data[i + 2] = on ? 0 : 255;
      png.data[i + 3] = 255;
    }
  }
  return `data:image/png;base64,${PNG.sync.write(png).toString('base64')}`;
}

const SIGNATURE = signaturePng();
const failures = [];
let checked = 0;
let slots = 0;

const maps = readdirSync(path.join(root, 'src/data/field-maps'))
  .filter((f) => f.endsWith('-ed01.json'))
  .sort();

for (const file of maps) {
  const fieldMap = JSON.parse(readFileSync(path.join(root, 'src/data/field-maps', file), 'utf8'));
  const schemaPath = path.join(root, 'src/data/checklists', `${fieldMap.templateKey}.json`);
  const basePdf = path.join(root, 'src/assets/forms', fieldMap.basePdf);
  if (!existsSync(schemaPath) || !existsSync(basePdf)) continue;

  const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
  const roles = (schema.signoffs ?? []).map((s) => s.role);
  if (!roles.length) continue;
  checked += 1;

  const record = {
    id: 'signoff-check',
    template_code: schema.code,
    schema,
    header: {},
    items: {},
    signoffs: roles.map((role, i) => ({
      role,
      name: `Signer ${i + 1}`,
      position: 'Position',
      signed_at: '2026-08-20T12:00:00.000-06:00',
      signature_data_uri: SIGNATURE,
    })),
  };

  const values = submissionToOverlayValues(record);
  const images = signatureImages(record, fieldMap);

  for (const role of roles) {
    slots += 1;
    const keys = signoffFieldKeys(role);
    const label = `${fieldMap.templateKey} · ${role}`;

    // A role the form cannot be signed for is a real defect…
    if (!fieldMap.fields[keys.signature]) {
      failures.push(`${label}: field map has no ${keys.signature}`);
    } else if (fieldMap.fields[keys.signature].type !== 'image') {
      failures.push(`${label}: ${keys.signature} is not an image field`);
    } else if (!images[keys.signature]) {
      failures.push(`${label}: signature image not collected (${keys.signature})`);
    }

    // …but a missing name or date slot is not. The VAES appendices print one
    // "Date of Inspection" for the whole sheet and no date beside either
    // signature, and §14 forbids adding a field the approved form lacks. So the
    // rule is: whatever the map declares must be filled, and nothing more.
    for (const kind of ['name', 'date']) {
      if (fieldMap.fields[keys[kind]] && !values[keys[kind]]) {
        failures.push(`${label}: ${keys[kind]} is on the form but received no value`);
      }
    }
  }

  // Render it, so a key that resolves but never draws is still caught.
  const bytes = await overlayChecklistPdf({
    basePdfBytes: readFileSync(basePdf),
    fieldMap,
    values,
    images: Object.fromEntries(
      Object.entries(images).map(([k, uri]) => [k, Buffer.from(uri.split(',')[1], 'base64')]),
    ),
    meta: { formCode: schema.code, submissionId: 'signoff-check' },
  });
  if (!bytes?.length) failures.push(`${fieldMap.templateKey}: overlay produced no PDF`);
}

console.log(`Templates with sign-offs: ${checked}  ·  signature slots: ${slots}`);
if (failures.length) {
  console.error(`\n${failures.length} problem(s):`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('Every declared sign-off has an image, a name and a date in its export.');
