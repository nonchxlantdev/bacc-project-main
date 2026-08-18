/**
 * Placement verification for overlay exports.
 *
 * A blank-vs-source diff proves only that pdf-lib round-trips the approved base.
 * It says nothing about whether stamped values land where they should — a field
 * map with every coordinate wrong would still pass.
 *
 * This does the real check:
 *   1. render a POPULATED overlay and a BLANK overlay of the same base
 *   2. diff them — every changed pixel is stamped content
 *   3. assert each changed pixel falls inside a declared field box
 *
 * Anything outside a declared box is ink on the approved form where the map did
 * not say it would be. That is exactly BACC acceptance criterion #11.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PNG } from 'pngjs';

const DPI = Number(process.env.PDF_DIFF_DPI || 130);
const PAD = Number(process.env.PLACEMENT_PAD_PT || 3); // tolerance in PDF points

export function rasterise(pdfPath, prefix) {
  try {
    execFileSync('pdftoppm', ['-png', '-r', String(DPI), pdfPath, prefix], { stdio: 'pipe' });
  } catch {
    console.error('pdftoppm (Poppler) not found on PATH — cannot verify placement.');
    console.error('Windows: install poppler and add its bin/ to PATH, or run this in CI/WSL.');
    process.exit(2);
  }
}

function pages(dir) {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.png'))
    .sort()
    .map((f) => PNG.sync.read(readFileSync(path.join(dir, f))));
}

/** Declared ink box for a field, in PDF points, y measured from the bottom. */
export function fieldBox(field) {
  const size = field.size ?? 9;
  const lineHeight = field.lineHeight ?? size * 1.2;
  if (field.type === 'mark') {
    const s = field.size ?? 9;
    return { x0: field.x, y0: field.y, x1: field.x + s, y1: field.y + s };
  }
  if (field.type === 'image') {
    return { x0: field.x, y0: field.y, x1: field.x + (field.width ?? 150), y1: field.y + (field.height ?? 36) };
  }
  const lines = field.maxLines ?? 1;
  // text draws its baseline at y, ascenders above, descenders below,
  // and wraps downward for subsequent lines
  return {
    x0: field.x,
    y0: field.y - lineHeight * (lines - 1) - size * 0.3,
    x1: field.x + (field.width ?? 120),
    y1: field.y + size,
  };
}

export function verifyPlacement({ populatedPdf, blankPdf, fieldMap, label = 'overlay' }) {
  const outDir = path.resolve('tmp-pdf-diff');
  mkdirSync(outDir, { recursive: true });
  const aDir = mkdtempSync(path.join(tmpdir(), 'plc-a-'));
  const bDir = mkdtempSync(path.join(tmpdir(), 'plc-b-'));
  rasterise(populatedPdf, path.join(aDir, 'p'));
  rasterise(blankPdf, path.join(bDir, 'p'));

  const A = pages(aDir);
  const B = pages(bDir);
  const basePages = B.length;
  const pageH = fieldMap.pageSize?.height ?? 792;
  const pageW = fieldMap.pageSize?.width ?? 612;

  // Group declared boxes by page
  const boxesByPage = new Map();
  for (const [key, f] of Object.entries(fieldMap.fields ?? {})) {
    const p = f.page ?? 0;
    if (!boxesByPage.has(p)) boxesByPage.set(p, []);
    boxesByPage.get(p).push({ key, ...fieldBox(f) });
  }

  const violations = [];
  let stampedPx = 0;

  for (let p = 0; p < Math.min(A.length, basePages); p++) {
    const a = A[p];
    const b = B[p];
    if (a.width !== b.width || a.height !== b.height) {
      violations.push({ page: p + 1, key: '(page size)', count: 1, note: 'raster size mismatch' });
      continue;
    }
    const pxPerPtX = a.width / pageW;
    const pxPerPtY = a.height / pageH;
    const boxes = (boxesByPage.get(p) ?? []).map((bx) => ({
      key: bx.key,
      px0: (bx.x0 - PAD) * pxPerPtX,
      px1: (bx.x1 + PAD) * pxPerPtX,
      // PDF y is bottom-up; raster y is top-down
      py0: (pageH - (bx.y1 + PAD)) * pxPerPtY,
      py1: (pageH - (bx.y0 - PAD)) * pxPerPtY,
    }));

    const stray = new Map();
    for (let y = 0; y < a.height; y++) {
      for (let x = 0; x < a.width; x++) {
        const i = (a.width * y + x) << 2;
        const d =
          Math.abs(a.data[i] - b.data[i]) +
          Math.abs(a.data[i + 1] - b.data[i + 1]) +
          Math.abs(a.data[i + 2] - b.data[i + 2]);
        if (d < 60) continue; // unchanged
        stampedPx += 1;
        const inside = boxes.some((bx) => x >= bx.px0 && x <= bx.px1 && y >= bx.py0 && y <= bx.py1);
        if (!inside) {
          const kx = `${Math.round(x / 10) * 10},${Math.round(y / 10) * 10}`;
          stray.set(kx, (stray.get(kx) ?? 0) + 1);
        }
      }
    }

    const total = [...stray.values()].reduce((s, n) => s + n, 0);
    if (total > 0) {
      const worst = [...stray.entries()].sort((m, n) => n[1] - m[1]).slice(0, 6);
      violations.push({
        page: p + 1,
        count: total,
        hotspots: worst.map(([xy, n]) => {
          const [px, py] = xy.split(',').map(Number);
          return `${n}px near (${(px / pxPerPtX).toFixed(0)}pt, ${(pageH - py / pxPerPtY).toFixed(0)}pt)`;
        }),
      });
    }
  }

  const extraPages = A.length - basePages;
  console.log(`\n${label}: ${stampedPx} stamped px across ${basePages} approved pages, ${extraPages} continuation page(s)`);
  if (!violations.length) {
    console.log('PASS — every stamped pixel falls inside a declared field box.\n');
    return { ok: true, violations, stampedPx };
  }
  console.error('FAIL — ink outside declared field boxes:');
  for (const v of violations) {
    console.error(`  page ${v.page}: ${v.count}px stray${v.note ? ` (${v.note})` : ''}`);
    for (const h of v.hotspots ?? []) console.error(`      ${h}`);
  }
  console.error('');
  return { ok: false, violations, stampedPx };
}

if (process.argv[1] && process.argv[1].endsWith('verify-placement.mjs')) {
  const fieldMap = JSON.parse(readFileSync(process.argv[4], 'utf8'));
  const res = verifyPlacement({
    populatedPdf: process.argv[2],
    blankPdf: process.argv[3],
    fieldMap,
    label: fieldMap.templateKey,
  });
  process.exit(res.ok ? 0 : 1);
}
