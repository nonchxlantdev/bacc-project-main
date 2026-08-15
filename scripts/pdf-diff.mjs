/**
 * Rasterise generated vs approved PDFs with pdftoppm and diff via pixelmatch.
 * Requires Poppler (`pdftoppm`) on PATH.
 *
 * Usage: npm run verify:pdf -- generated.pdf src/assets/forms/annex-d-drainage-ed01.pdf
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

const dpi = Number(process.env.PDF_DIFF_DPI || 150);
const generated = process.argv[2];
const approved = process.argv[3] || 'src/assets/forms/annex-d-drainage-ed01.pdf';

if (!generated) {
  console.error('Usage: npm run verify:pdf -- <generated.pdf> [approved.pdf]');
  process.exit(1);
}

function rasterise(pdf, destPrefix) {
  try {
    execFileSync('pdftoppm', ['-png', '-r', String(dpi), pdf, destPrefix], { stdio: 'inherit' });
  } catch {
    console.error('pdftoppm not found. Install Poppler and re-run. This is BACC acceptance criterion #11.');
    process.exit(2);
  }
}

const outDir = path.resolve('tmp-pdf-diff');
mkdirSync(outDir, { recursive: true });
const aDir = mkdtempSync(path.join(tmpdir(), 'bacc-a-'));
const bDir = mkdtempSync(path.join(tmpdir(), 'bacc-b-'));
rasterise(generated, path.join(aDir, 'page'));
rasterise(approved, path.join(bDir, 'page'));

function pageFiles(dir) {
  return readdirSync(dir)
    .filter((name) => name.endsWith('.png'))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

const leftPages = pageFiles(aDir);
const rightPages = pageFiles(bDir);
const count = Math.max(leftPages.length, rightPages.length);
const results = [];
for (let i = 0; i < count; i += 1) {
  const left = leftPages[i] ? path.join(aDir, leftPages[i]) : null;
  const right = rightPages[i] ? path.join(bDir, rightPages[i]) : null;
  if (!left || !right) {
    console.warn(`Missing counterpart for page ${i + 1} (generated=${Boolean(left)} approved=${Boolean(right)})`);
    continue;
  }
  const imgA = PNG.sync.read(readFileSync(left));
  const imgB = PNG.sync.read(readFileSync(right));
  const width = Math.min(imgA.width, imgB.width);
  const height = Math.min(imgA.height, imgB.height);
  const diff = new PNG({ width, height });
  const mismatch = pixelmatch(imgA.data, imgB.data, diff.data, width, height, { threshold: 0.1 });
  const total = width * height;
  const match = 1 - mismatch / total;
  const diffFile = path.join(outDir, `diff-page-${i + 1}.png`);
  writeFileSync(diffFile, PNG.sync.write(diff));
  results.push({ page: i + 1, matchPct: +(match * 100).toFixed(3), mismatch, diffFile });
}

console.log(JSON.stringify({ dpi, generated, approved, results }, null, 2));
