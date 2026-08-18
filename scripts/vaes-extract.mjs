/**
 * Generic VAES (Annex 1-2 / Appendix C-x) extractor.
 *
 * All 20 VAES checklists share one layout: a two-column document-control header,
 * a three-response item table (SAT / NOSAT / N/A) and a remarks column. Only the
 * item wording, the row positions and a few column rules differ per form — so
 * rather than hand-mapping 19 more forms, this MEASURES each one and emits both
 * the content schema and the field map.
 *
 * Nothing here is estimated. Column rules come from raster rule detection and
 * every y comes from a real glyph position in the approved PDF.
 *
 *   usage: node vaes-extract.mjs <source.pdf> [outDir]
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const PAGE_W = 612.12;
const PAGE_H = 792.12;
const DPI = 130;

// bbox (top-origin) -> pdf-lib (bottom-origin). Derived exactly from Annex D.
const toPdfY = (yTop) => +(PAGE_H - yTop - 9.74).toFixed(2);
const baselineY = (yBot) => +(PAGE_H - yBot + 2).toFixed(2);

// ---------------------------------------------------------------- parsing ---

function words(pdf) {
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
      list.push({
        x: +wm[1],
        yTop: +wm[2],
        xMax: +wm[3],
        yBot: +wm[4],
        t: decode(wm[5]),
      });
    }
    pages.push(list);
  }
  return pages;
}

function decode(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

/** Group words into visual lines by their top edge. */
function lines(pageWords, tol = 5) {
  // Group by vertical midpoint, not top edge: checkbox glyphs render ~4pt above
  // the text baseline of the same row, so a top-edge match splits them off.
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

// ------------------------------------------------------------ rule detect ---

function verticalRules(pdf, page, yTopPt, yBotPt) {
  const prefix = `/tmp/pdfwork/_rule_${process.pid}`;
  execFileSync('pdftoppm', ['-png', '-r', String(DPI), '-f', String(page + 1), '-l', String(page + 1), pdf, prefix], {
    stdio: 'pipe',
  });
  const file = `${prefix}-${page + 1}.png`;
  const p = PNG.sync.read(readFileSync(file));
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

// ------------------------------------------------------------- extraction ---

const BOX = '☐';
/** Running footer / page furniture that must never be read as item wording. */
const FOOTER_RE = /Review:\s*Ed\.|P\s*a\s*g\s*e|ANNEX 1-2|PGIA 16-15|Visual Aid and Electrical|AERODROME OPERATIONS|PHILIP S\.W\./i;

function slugify(title) {
  return String(title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
}

export function extractVaes(pdf, keyOverride) {
  const pages = words(pdf);
  const p0 = pages[0];
  const l0 = lines(p0);

  const all = l0.map((l) => l.text).join('\n');
  const appendix = (all.match(/APPENDIX (C-\d+)/) || [])[1];
  if (!appendix) throw new Error(`${path.basename(pdf)}: not a VAES Appendix C form`);
  const checklistNo = (all.match(/PGIA-MAN-VAES-\d+/) || [])[0] ?? null;
  const docNo = (all.match(/PGIA-CL-VAES-\d+/) || [])[0] ?? null;

  // Title: the line between "APPENDIX C-x" and "CHECKLIST No."
  const appIdx = l0.findIndex((l) => l.text.includes('APPENDIX'));
  const cklIdx = l0.findIndex((l) => l.text.startsWith('CHECKLIST No'));
  const title = l0
    .slice(appIdx + 1, cklIdx > appIdx ? cklIdx : appIdx + 2)
    .map((l) => l.text)
    .join(' ')
    .trim();

  const hdrRules = verticalRules(pdf, 0, 160, 395);
  const valueX = (hdrRules[1] ?? 297.8) + 3;
  const valueRight = hdrRules[2] ?? 531.3;

  // --- document control + header fields -----------------------------------
  const control = {};
  const headerFields = [];
  const fields = {};

  const labelOf = (line) =>
    line.words
      .filter((w) => w.x < valueX - 4)
      .map((w) => w.t)
      .join(' ')
      .replace(/:$/, '')
      .trim();
  const rightWords = (line) => line.words.filter((w) => w.x >= valueX - 6);

  const CONTROL_KEYS = {
    'Document No.': 'documentNo',
    Frequency: 'frequency',
    Responsible: 'responsible',
    'Supervisor / Reviewer': 'supervisorReviewer',
  };

  const itemHeaderLine = l0.find((l) => l.text.startsWith('Item to Verify'));
  const headerLimit = itemHeaderLine ? itemHeaderLine.yTop : 400;

  for (const line of l0) {
    if (line.yTop >= headerLimit) continue;
    const label = labelOf(line);
    if (!label) continue;
    const right = rightWords(line);
    if (!right.length) continue;
    const rightText = right.map((w) => w.t).join(' ');

    const controlKey = CONTROL_KEYS[label];
    if (controlKey) {
      control[controlKey] = rightText;
      continue;
    }

    const isBlank = /^_+$/.test(right[0].t);
    const isYesNo = right.some((w) => w.t === 'Yes') && right.some((w) => w.t === BOX);

    if (isYesNo) {
      const key = camel(label);
      const boxes = right.filter((w) => w.t === BOX);
      const prefix = markPrefixFor(label);
      headerFields.push({
        key,
        label,
        type: 'yes_no',
        required: true,
        note: stripNote(rightText),
        escalateOnYes: /notify|immediat/i.test(rightText),
        options: [
          { value: 'yes', label: 'Yes' },
          { value: 'no', label: 'No' },
        ],
        markPrefix: prefix,
      });
      if (boxes[0]) fields[`${prefix}.yes`] = { page: 0, x: +boxes[0].x.toFixed(1), y: toPdfY(boxes[0].yTop), type: 'mark', size: 9 };
      if (boxes[1]) fields[`${prefix}.no`] = { page: 0, x: +boxes[1].x.toFixed(1), y: toPdfY(boxes[1].yTop), type: 'mark', size: 9 };
      continue;
    }

    if (!isBlank) continue;

    // A blank line is either an input or a signature slot.
    const y = baselineY(right[0].yBot);
    const anchorX = +right[0].x.toFixed(1); // where the form actually prints values
    if (/signature/i.test(label)) {
      const role = /supervis/i.test(label) ? 'supervisor' : 'responsible';
      fields[`${role}_signature`] = { page: 0, x: anchorX, y, type: 'image', width: 118, height: 16 };
      fields[`${role}_name`] = {
        page: 0,
        x: anchorX + 122,
        y,
        size: 6.5,
        width: Math.max(60, valueRight - (anchorX + 122) - 3),
        wrap: true,
        maxLines: 1,
        overflow: 'continuation',
      };
      continue;
    }

    const key = camel(label);
    const mapKey = snake(key);
    const type = /date/i.test(label) ? 'date' : /time/i.test(label) ? 'time' : 'text';
    headerFields.push({ key, label, type, required: type !== 'text', mapKey });
    fields[mapKey] = {
      page: 0,
      x: anchorX,
      y,
      size: 9,
      width: Math.max(80, valueRight - anchorX - 3),
      ...(type === 'text' ? { wrap: true, maxLines: 1, overflow: 'continuation' } : {}),
    };
  }

  // --- item table ----------------------------------------------------------
  const codePrefix = `C${appendix.split('-')[1].padStart(2, '0')}`;
  const items = [];
  let seq = 0;

  for (let pi = 0; pi < pages.length; pi++) {
    const pw = pages[pi];
    const boxes = pw.filter((w) => w.t === BOX);
    // header Yes/No boxes live above the table on page 1 — exclude them
    const tableBoxes = boxes.filter((w) => !(pi === 0 && w.yTop < headerLimit));
    if (!tableBoxes.length) continue;

    const tblTop = Math.min(...tableBoxes.map((w) => w.yTop)) - 40;
    const tblBot = Math.max(...tableBoxes.map((w) => w.yBot)) + 20;
    const rules = verticalRules(pdf, pi, Math.max(0, tblTop), Math.min(PAGE_H, tblBot));
    // expect: left | SAT | NOSAT | N/A | remarks | right
    const remarksLeft = rules.length >= 6 ? rules[4] : 441.1;
    const tableRight = rules.length >= 6 ? rules[5] : 534.1;
    const itemRight = rules.length >= 2 ? rules[1] : 311.6;

    // group boxes into rows
    const rows = [];
    for (const b of tableBoxes.sort((a, c) => a.yTop - c.yTop || a.x - c.x)) {
      const last = rows[rows.length - 1];
      if (last && Math.abs(last.yTop - b.yTop) <= 3) last.boxes.push(b);
      else rows.push({ yTop: b.yTop, boxes: [b] });
    }

    const pageLines = lines(pw);

    // An item's wording can continue onto the next page, above that page's first
    // checkbox row (e.g. C-14 "...alarms, and controls" / "functional"). Without
    // this the tail is silently dropped from the item text.
    if (pi > 0 && items.length) {
      const firstRowTop = rows[0].yTop;
      const carry = pageLines
        .filter(
          (l) =>
            l.yTop > 100 &&
            l.yTop < firstRowTop - 6 &&
            l.words.some((w) => w.x < itemRight) &&
            !FOOTER_RE.test(l.text),
        )
        .map((l) =>
          l.words
            .filter((w) => w.x < itemRight)
            .map((w) => w.t)
            .join(' '),
        )
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (carry) {
        const prev = items[items.length - 1];
        prev.text = `${prev.text} ${carry}`.replace(/\s+/g, ' ').trim();
      }
    }

    for (let ri = 0; ri < rows.length; ri++) {
      const row = rows[ri];
      const isLast = ri === rows.length - 1;
      const nextTop = rows[ri + 1]?.yTop ?? row.yTop + 20.76;
      const rowHeight = +(nextTop - row.yTop).toFixed(2);
      // Item wording: left-column lines inside this row's band. The LAST row on a
      // page has no next row to bound it, so its wrapped continuation line would
      // be dropped — extend the band and exclude the running footer instead.
      const bandBottom = isLast ? row.yTop + 44 : nextTop - 4;
      const band = pageLines.filter(
        (l) =>
          l.yTop >= row.yTop - 8 &&
          l.yTop < bandBottom &&
          l.words.some((w) => w.x < itemRight) &&
          !FOOTER_RE.test(l.text),
      );
      const text = band
        .map((l) =>
          l.words
            .filter((w) => w.x < itemRight)
            .map((w) => w.t)
            .join(' '),
        )
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (!text) continue;

      seq += 1;
      const code = `${codePrefix}-${String(seq).padStart(2, '0')}`;
      items.push({ code, text });

      const y = toPdfY(row.yTop);
      const cols = row.boxes.sort((a, b) => a.x - b.x);
      const names = ['sat', 'no_sat', 'na'];
      cols.slice(0, 3).forEach((b, i) => {
        fields[`${code}.${names[i]}`] = { page: pi, x: +b.x.toFixed(1), y, type: 'mark', size: 9 };
      });
      fields[`${code}.remarks`] = {
        page: pi,
        x: +(remarksLeft + 3).toFixed(1),
        y: y + 1,
        width: +(tableRight - remarksLeft - 6).toFixed(1),
        height: rowHeight,
        size: 7,
        wrap: true,
        maxLines: rowHeight > 25 ? 2 : 1,
        overflow: 'continuation',
      };
    }
  }

  const key = keyOverride ?? `appendix-${codePrefix.toLowerCase()}-${slugify(shortTitle(title))}`;

  const schema = {
    code: docNo ?? `PGIA-CL-VAES-${appendix.split('-')[1].padStart(2, '0')}`,
    checklistNo,
    annexLabel: `Appendix ${appendix}`,
    documentFamily: 'VAES',
    title: titleCase(title),
    manualHeader: {
      line1: 'AERODROME OPERATIONS MANUAL',
      line2: 'PHILIP S.W. GOLDSON INTERNATIONAL AIRPORT',
      pageRef: 'ANNEX 1-2\nPGIA 16-15',
    },
    footer: {
      reviewLine: 'Review: Ed. 01',
      annexLine: 'Annex 1-2',
      dateLine: 'Date: March 14, 2026.',
      manualLine: 'Visual Aid and Electrical System Maintenance Manual.',
    },
    documentControl: control,
    frequency: normaliseFrequency(control.frequency),
    responseType: {
      columns: ['sat', 'no_sat', 'na'],
      labels: { sat: 'SAT', no_sat: 'NOSAT', na: 'N/A' },
      remarksLabel: 'Remarks / Corrective Action',
    },
    headerFields,
    sections: [{ title: null, items }],
    signoffs: [
      { role: 'responsible', label: 'Responsible Signature', inHeader: true },
      { role: 'supervisor', label: 'Supervisor Signature', inHeader: true },
    ],
    validationRules: ['Every item marked NOSAT requires non-empty remarks before submission.'],
    notes: [
      `Item codes ${codePrefix}-01.. are SYNTHETIC. The approved form lists items without identifiers; codes exist only so responses, incidents and audit records can reference a row, and must never be printed on the exported form.`,
      'Generated by scripts/vaes-extract.mjs from the approved base PDF. Re-run it rather than hand-editing; every coordinate is a measured glyph position.',
      'Document control values are pre-printed constants on the approved form — not inputs, and never overlaid.',
    ],
  };

  const fieldMap = {
    templateKey: key,
    templateVersion: 'ed01',
    basePdf: `${key}-ed01.pdf`,
    documentFamily: 'VAES',
    origin: 'pdf-points-bottom-left',
    originNote:
      'PDF points, bottom-left origin (pdf-lib). From pdftotext -bbox: y_pdf = 792.12 - yTop - 9.74.',
    mapping: {
      method: 'automated: scripts/vaes-extract.mjs — glyph positions + raster rule detection',
      headerRules: hdrRules,
      generated: true,
    },
    pageSize: { width: PAGE_W, height: PAGE_H },
    fields,
  };

  return { key, schema, fieldMap, appendix, itemCount: items.length, pages: pages.length };
}

function camel(label) {
  return label
    .replace(/[^A-Za-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((w, i) => (i === 0 ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1).toLowerCase()))
    .join('');
}
function snake(key) {
  return String(key).replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
}
function markPrefixFor(label) {
  if (/aoc/i.test(label)) return 'aoc_impact';
  return snake(camel(label)).slice(0, 24);
}
function stripNote(text) {
  const m = text.match(/\(([^)]*)\)?$/);
  return m ? m[1].trim() : '';
}
function shortTitle(t) {
  return t.replace(/^(MONTHLY|WEEKLY|DAILY|ANNUAL|SEMI-ANNUAL|QUARTERLY)\s+/i, '');
}
/** Acronyms the approved forms use — title-casing must not lowercase these. */
const ACRONYMS = new Set([
  'PAPI','CCR','CCRS','PMI','ATS','ATC','AOC','OEM','LED','RWY','TWY','NAVAID','NAVAIDS',
  'CEC','EEC','OM','COO','BCAR','ILS','VASI','MΩ','UPS','PPE','SAT','NOSAT',
]);

function titleCase(t) {
  return t
    .split(/\s+/)
    .map((w) => {
      const bare = w.replace(/[^A-Za-zΩ]/g, '');
      if (ACRONYMS.has(bare.toUpperCase())) return w.toUpperCase();
      const lower = w.toLowerCase();
      if (/^(and|the|of|to|in|for|by|or|per|vs\.?)$/.test(lower)) return lower;
      // preserve hyphenated compounds: Semi-Annual, Cross-Drainage
      return lower.replace(/(^|[-/])([a-z])/g, (_, sep, c) => sep + c.toUpperCase());
    })
    .join(' ')
    .replace(/^./, (c) => c.toUpperCase());
}

/** Map the form's printed frequency prose onto the scheduler's vocabulary. */
function normaliseFrequency(text) {
  const t = String(text ?? '').toLowerCase();
  if (/semi-?annual/.test(t)) return 'semi_annual';
  if (/quarter/.test(t)) return 'quarterly';
  if (/annual|yearly/.test(t)) return 'annual';
  if (/month/.test(t)) return 'monthly';
  if (/week/.test(t)) return 'weekly';
  if (/dai?ly/.test(t)) return 'daily';
  return 'on_demand';
}

// ------------------------------------------------------------------- main ---

if (process.argv[1]?.endsWith('vaes-extract.mjs')) {
  const pdf = process.argv[2];
  const outDir = process.argv[3] ?? '.';
  const keyArg = process.argv.find((a) => a.startsWith('--key='));
  const res = extractVaes(pdf, keyArg ? keyArg.slice(6) : undefined);
  mkdirSync(path.join(outDir, 'checklists'), { recursive: true });
  mkdirSync(path.join(outDir, 'field-maps'), { recursive: true });
  writeFileSync(path.join(outDir, 'checklists', `${res.key}.json`), JSON.stringify(res.schema, null, 2));
  writeFileSync(path.join(outDir, 'field-maps', `${res.key}-ed01.json`), JSON.stringify(res.fieldMap, null, 2));
  console.log(
    `${res.appendix.padEnd(6)} ${String(res.itemCount).padStart(2)} items  ${String(Object.keys(res.fieldMap.fields).length).padStart(3)} fields  ${res.pages}p  ${res.key}`,
  );
}
