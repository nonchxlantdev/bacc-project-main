/**
 * Compare two parity output folders page by page via scripts/pdf-diff.mjs
 * (Poppler pdftoppm + pixelmatch). Exits non-zero on ANY difference.
 *
 *   node scripts/parity-compare.mjs tmp-pdf-diff/parity-before tmp-pdf-diff/parity-before
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument } from 'pdf-lib';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [dirA, dirB] = process.argv.slice(2).map((d) => path.resolve(root, d ?? ''));
if (!process.argv[2] || !process.argv[3]) {
  console.error('Usage: node scripts/parity-compare.mjs <dirA> <dirB>');
  process.exit(1);
}

const pageCount = async (file) => (await PDFDocument.load(readFileSync(file))).getPageCount();

let failed = false;
for (const name of readdirSync(dirA).filter((f) => f.endsWith('.pdf')).sort()) {
  const a = path.join(dirA, name);
  const b = path.join(dirB, name);
  let pagesA;
  let pagesB;
  try {
    [pagesA, pagesB] = [await pageCount(a), await pageCount(b)];
  } catch (err) {
    console.error(`FAIL ${name}: ${err.message}`);
    failed = true;
    continue;
  }
  if (pagesA !== pagesB) {
    console.error(`FAIL ${name}: page count ${pagesA} vs ${pagesB}`);
    failed = true;
    continue;
  }
  const out = execFileSync('node', [path.join(root, 'scripts/pdf-diff.mjs'), a, b], {
    cwd: root,
    encoding: 'utf8',
  });
  const report = JSON.parse(out.slice(out.indexOf('{')));
  const worst = Math.min(...report.results.map((r) => r.matchPct));
  if (worst < 100) {
    console.error(`FAIL ${name}: worst page match ${worst}%`);
    failed = true;
  } else {
    console.log(`ok   ${name}: ${pagesA} page(s), 100% match`);
  }
}
process.exit(failed ? 1 : 0);
