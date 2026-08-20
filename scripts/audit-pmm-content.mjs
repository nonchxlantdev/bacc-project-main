/**
 * Content audit for the PMM annexes — the check that placement verification
 * cannot do.
 *
 * verify-placement proves stamped values land in the right place. It says
 * nothing about whether the WORDING in the app is the wording on the approved
 * form. BACC §14 forbids altering item text, numbering or order, so this
 * rebuilds every item independently from `pdftotext -layout` — a different code
 * path from the bbox-based extractor — and compares:
 *
 *   1. every code printed on the form was captured, once, in print order
 *   2. every captured wording matches the printed wording exactly
 *
 * A dropped wrapped line, a lost page-break tail or a renumbered item shows up
 * here. Run it whenever an annex is re-extracted.
 *
 *   node scripts/audit-pmm-content.mjs
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CODE = /^\s*([A-Z]{1,4}-\d{1,3})\s+(.*)$/;
const FOOTER =
  /Review:\s*Ed\.|P a g e|ANNEX 1-1|PGIA 16-14|AERODROME OPERATIONS|PHILIP S\.W\.|Maintenance Paved|Annex 2-1|^\s*Date: March/;
const norm = (s) => String(s).replace(/\s+/g, ' ').trim();
const caps = (w) => {
  const letters = String(w ?? '').replace(/[^A-Za-z]/g, '');
  return letters.length >= 3 && letters === letters.toUpperCase();
};

const mapDir = path.join(root, 'src/data/field-maps');
const maps = readdirSync(mapDir)
  .filter((f) => f.startsWith('annex-') && f.endsWith('-ed01.json'))
  .sort();

let bad = 0;
let checked = 0;

for (const file of maps) {
  const fieldMap = JSON.parse(readFileSync(path.join(mapDir, file), 'utf8'));
  if (fieldMap.documentFamily !== 'PMM' || !fieldMap.mapping?.generated) continue;
  const key = fieldMap.templateKey;
  const schemaPath = path.join(root, 'src/data/checklists', `${key}.json`);
  const pdf = path.join(root, 'src/assets/forms', fieldMap.basePdf);
  if (!existsSync(schemaPath) || !existsSync(pdf)) {
    console.error(`SKIP ${key}: missing schema or base PDF`);
    bad += 1;
    continue;
  }
  checked += 1;

  const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
  const items = (schema.sections ?? []).flatMap((s) => s.items ?? []);
  const codes = items.map((i) => i.code);
  const raw = execFileSync('pdftotext', ['-layout', pdf, '-'], { encoding: 'utf8', maxBuffer: 32e6 });

  // --- 1. codes printed on the form, in print order -------------------------
  const printed = [];
  for (const line of raw.split('\n')) {
    const m = line.match(/^\s*([A-Z]{1,4}-\d{1,3})\s+\S/);
    if (m && line.includes('☐')) printed.push(m[1]);
  }
  const missing = printed.filter((c) => !codes.includes(c));
  const extra = codes.filter((c) => !printed.includes(c));
  const dupes = [...new Set(codes.filter((c, i) => codes.indexOf(c) !== i))];
  const orderOk = JSON.stringify(printed) === JSON.stringify(codes);

  // --- 2. wording, rebuilt independently ------------------------------------
  const rebuilt = new Map();
  let current = null;
  for (const line of raw.split('\n')) {
    if (FOOTER.test(line)) continue;
    if (/\bSAT\b/.test(line) && /Remarks/.test(line)) { current = null; continue; }
    if (/^\s*(SAT\s+)?Location\s*$/.test(line)) { current = null; continue; }
    const cut = line.indexOf('☐');
    const left = cut >= 0 ? line.slice(0, cut) : line;
    const m = left.match(CODE);
    if (m) { current = m[1]; rebuilt.set(current, norm(m[2])); continue; }
    if (!current || !norm(left)) continue;
    const w = norm(left).split(' ');
    if (w.length >= 2 && caps(w[0]) && caps(w[1])) { current = null; continue; }
    rebuilt.set(current, norm(`${rebuilt.get(current)} ${left}`));
  }

  const diffs = [];
  const inline = [];
  for (const it of items) {
    // Rows printing ☐ sub-options inside their own wording cannot be rebuilt by
    // this method (it cuts each line at the first ☐), so they are listed for
    // review rather than silently passed.
    if (it.inlineOptions) { inline.push(`${it.code}: ${norm(it.text)}`); continue; }
    const want = rebuilt.get(it.code);
    if (want === undefined) { diffs.push(`${it.code}: could not be rebuilt from the form`); continue; }
    if (norm(it.text) !== want) {
      diffs.push(`${it.code}\n       app  : ${norm(it.text)}\n       form : ${want}`);
    }
  }

  const ok = !missing.length && !extra.length && !dupes.length && orderOk && !diffs.length;
  if (!ok) bad += 1;
  console.log(
    `${schema.annexLabel.padEnd(8)} ${ok ? 'PASS' : 'FAIL'}  ${items.length} items, ${
      (schema.sections ?? []).length
    } sections${inline.length ? `, ${inline.length} with inline ☐` : ''}`,
  );
  if (missing.length) console.error('   printed but missing from the app:', missing.slice(0, 10));
  if (extra.length) console.error('   in the app but not printed:', extra.slice(0, 10));
  if (dupes.length) console.error('   duplicate item codes:', dupes);
  if (!orderOk && !missing.length && !extra.length) console.error('   item ORDER differs from the form');
  for (const d of diffs.slice(0, 5)) console.error('   wording differs —', d);
  if (diffs.length > 5) console.error(`   …and ${diffs.length - 5} more`);
  for (const i of inline) console.log('   inline ☐ (review by eye):', i);
}

console.log(
  bad
    ? `\n${bad} of ${checked} PMM annexes differ from the approved source`
    : `\nAll ${checked} PMM annexes match the approved source, item for item`,
);
process.exit(bad ? 1 : 0);
