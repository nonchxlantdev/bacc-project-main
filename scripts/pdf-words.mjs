/**
 * Shared measurement primitives for reading approved base PDFs.
 *
 * Extracted from scripts/vaes-extract.mjs so the PMM (Annex 1-1) extractor uses
 * exactly the same geometry as the VAES (Annex 1-2) one. Nothing here estimates:
 * every number traces to a glyph box from `pdftotext -bbox` or to a rule found
 * by rasterising the page.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';

export const PAGE_W = 612.12;
export const PAGE_H = 792.12;
const DPI = 130;

/** bbox (top-origin) -> pdf-lib (bottom-origin). Derived exactly from Annex D. */
export const toPdfY = (yTop) => +(PAGE_H - yTop - 9.74).toFixed(2);
/** Text baseline for a glyph whose bbox bottom is yBot. */
export const baselineY = (yBot) => +(PAGE_H - yBot + 2).toFixed(2);

export function decode(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

/** Every word on every page, with its bounding box in top-origin points. */
export function words(pdf) {
  const xml = execFileSync('pdftotext', ['-bbox', pdf, '-'], { encoding: 'utf8', maxBuffer: 32e6 });
  const pages = [];
  const pageRe = /<page width="([\d.]+)" height="([\d.]+)">([\s\S]*?)<\/page>/g;
  const wordRe = /<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([\s\S]*?)<\/word>/g;
  let pm;
  while ((pm = pageRe.exec(xml))) {
    const list = [];
    let wm;
    const body = pm[3];
    wordRe.lastIndex = 0;
    while ((wm = wordRe.exec(body))) {
      list.push({ x: +wm[1], yTop: +wm[2], xMax: +wm[3], yBot: +wm[4], t: decode(wm[5]) });
    }
    pages.push(list);
  }
  return pages;
}

/**
 * Group words into visual lines.
 *
 * Grouping is by vertical MIDPOINT, not top edge: a checkbox glyph renders about
 * 4pt above the text baseline of its own row, so matching on top edge splits the
 * box off from the label it belongs to.
 */
export function lines(pageWords, tol = 5) {
  const mid = (w) => (w.yTop + w.yBot) / 2;
  const sorted = [...pageWords].sort((a, b) => mid(a) - mid(b) || a.x - b.x);
  const out = [];
  for (const w of sorted) {
    const last = out[out.length - 1];
    if (last && Math.abs(last.mid - mid(w)) <= tol) {
      last.words.push(w);
      last.yTop = Math.min(last.yTop, w.yTop);
      last.yBot = Math.max(last.yBot, w.yBot);
      last.mid = (last.yTop + last.yBot) / 2;
    } else {
      out.push({ yTop: w.yTop, yBot: w.yBot, mid: mid(w), words: [w] });
    }
  }
  for (const l of out) {
    l.words.sort((a, b) => a.x - b.x);
    l.text = l.words.map((w) => w.t).join(' ');
  }
  return out;
}

/**
 * X positions (in points) of the table's vertical rules within a y band.
 *
 * Rasterises the page and keeps columns that are dark for more than half the
 * band — a printed rule. This is how column edges are known rather than guessed.
 */
export function verticalRules(pdf, page, yTopPt, yBotPt) {
  const prefix = `/tmp/pdfwork/_rule_${process.pid}`;
  execFileSync(
    'pdftoppm',
    ['-png', '-r', String(DPI), '-f', String(page + 1), '-l', String(page + 1), pdf, prefix],
    { stdio: 'pipe' },
  );
  const p = PNG.sync.read(readFileSync(`${prefix}-${page + 1}.png`));
  const { width: W, height: H } = p;
  const ptPerPx = PAGE_W / W;
  const a = Math.max(0, Math.round((yTopPt / PAGE_H) * H));
  const b = Math.min(H, Math.round((yBotPt / PAGE_H) * H));
  const hits = [];
  for (let x = 0; x < W; x++) {
    let n = 0;
    for (let y = a; y < b; y++) {
      const i = (W * y + x) << 2;
      if ((p.data[i] + p.data[i + 1] + p.data[i + 2]) / 3 < 190) n++;
    }
    if (n / (b - a) > 0.5) hits.push(x);
  }
  const runs = [];
  let s = null;
  let q = null;
  for (const x of hits) {
    if (s === null) {
      s = x;
      q = x;
    } else if (x - q <= 3) q = x;
    else {
      runs.push([s, q]);
      s = x;
      q = x;
    }
  }
  if (s !== null) runs.push([s, q]);
  return runs.map(([u, v]) => +(((u + v) / 2) * ptPerPx).toFixed(1));
}

/**
 * Y positions (top-origin points) of the horizontal rules between xLeft/xRight.
 *
 * The PMM header is a bordered table, so its rules are the only reliable way to
 * know where one field's row ends and the next begins — text alone cannot tell
 * a wrapped label from the instruction paragraph above the table.
 */
export function horizontalRules(pdf, page, xLeftPt, xRightPt) {
  const prefix = `/tmp/pdfwork/_hrule_${process.pid}`;
  execFileSync(
    'pdftoppm',
    ['-png', '-r', String(DPI), '-f', String(page + 1), '-l', String(page + 1), pdf, prefix],
    { stdio: 'pipe' },
  );
  const p = PNG.sync.read(readFileSync(`${prefix}-${page + 1}.png`));
  const { width: W, height: H } = p;
  const ptPerPxY = PAGE_H / H;
  const a = Math.max(0, Math.round((xLeftPt / PAGE_W) * W));
  const b = Math.min(W, Math.round((xRightPt / PAGE_W) * W));
  const hits = [];
  for (let y = 0; y < H; y++) {
    let n = 0;
    for (let x = a; x < b; x++) {
      const i = (W * y + x) << 2;
      if ((p.data[i] + p.data[i + 1] + p.data[i + 2]) / 3 < 225) n++;
    }
    if (n / (b - a) > 0.7) hits.push(y);
  }
  const runs = [];
  let s = null;
  let q = null;
  for (const y of hits) {
    if (s === null) {
      s = y;
      q = y;
    } else if (y - q <= 3) q = y;
    else {
      runs.push([s, q]);
      s = y;
      q = y;
    }
  }
  if (s !== null) runs.push([s, q]);
  return runs.map(([u, v]) => +(((u + v) / 2) * ptPerPxY).toFixed(1));
}
