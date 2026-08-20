/**
 * Generic PMM (Annex 1-1 / PGIA 16-14) extractor — Annexes A, B, C, E, F, I, J.
 *
 * The PMM annexes share one layout, different from the VAES family:
 *
 *   - a two-column header table (label | value cell), some rows carrying ☐ options
 *   - section bands whose header row also prints the column captions
 *     "SAT | NO SAT | Remarks / Location"
 *   - item rows that DO print their own codes (RW-01, UA-32, …) — unlike the
 *     VAES forms, where codes had to be synthesised
 *   - an optional free-text block (DEFICIENCIES / CORRECTIVE ACTION / FOD REMOVED)
 *   - two or three signature slots printed as underscore runs, each with a
 *     "Date: ______" beneath it
 *
 * Annex I has no item table at all (it is an activity log); this handles that by
 * simply emitting zero sections.
 *
 * Every coordinate is measured. Column edges come from raster rule detection and
 * every y from a real glyph box, so the overlay lands inside the printed cells
 * rather than near them.
 *
 *   usage: node pmm-extract.mjs <source.pdf> [outDir] [--key=slug]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { PAGE_H, PAGE_W, baselineY, horizontalRules, lines, toPdfY, verticalRules, words } from './pdf-words.mjs';

const BOX = '☐';
const UNDERSCORES = /^_{3,}$/;
/** Running page furniture that must never be read as form content. */
const FOOTER_RE =
  /Review:\s*Ed\.|P\s*a\s*g\s*e|ANNEX 1-1|PGIA 16-14|AERODROME OPERATIONS|PHILIP S\.W\.|Maintenance Paved and Unpaved|Annex 2-1|^Date: March/i;
/** An item code as the approved forms print it: RW-01, TW-12, UA-34, A-11… */
const CODE_RE = /^[A-Z]{1,4}-\d{1,3}$/;

/**
 * A row's code is always the FIRST word printed in the item column. Testing any
 * word would misfire on regulation references that share the shape — "BCAR-14",
 * "BCAR-139" — and truncate the wording that follows them.
 */
function rowCode(line, itemRight) {
  const first = line.words.filter((w) => w.x < itemRight)[0];
  return first && CODE_RE.test(first.t) ? first : null;
}

export function extractPmm(pdf, keyOverride) {
  const pages = words(pdf);
  const pageLines = pages.map((p) => lines(p));
  const l0 = pageLines[0];
  const flat = l0.map((l) => l.text);

  // ---- title block -------------------------------------------------------
  const annexIdx = flat.findIndex((t) => /^ANNEX [A-L]$/.test(t.trim()));
  if (annexIdx < 0) throw new Error(`${path.basename(pdf)}: no "ANNEX <letter>" title line`);
  const annexLetter = flat[annexIdx].trim().split(/\s+/)[1];
  const formIdx = flat.findIndex((t) => /^Form:\s*PGIA-PMM-F\d+/.test(t.trim()));
  if (formIdx < 0) throw new Error(`${path.basename(pdf)}: no "Form: PGIA-PMM-Fxx" line`);
  const code = flat[formIdx].match(/PGIA-PMM-F\d+/)[0];
  const title = flat
    .slice(annexIdx + 1, formIdx)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  // The instruction sentence sits between the form number and the first field.
  const instruction = (flat[formIdx + 1] ?? '').trim();

  // ---- geometry ----------------------------------------------------------
  // First section band (or, for a log form, the signature block) bounds the header.
  // The header table ends at whichever comes first: the first item-table band,
  // the first free-text block heading, or the signature block.
  const sectionLineIdx = l0.findIndex((l) => isSectionHeader(l));
  const firstBlockIdx = l0.findIndex((l, i) => i > formIdx + 1 && startsBlockHeading(l.text));
  const headerBottom = Math.min(
    sectionLineIdx >= 0 ? l0[sectionLineIdx].yTop - 4 : Infinity,
    firstBlockIdx >= 0 ? l0[firstBlockIdx].yTop - 4 : Infinity,
    firstUnderscoreTop(l0) ?? Infinity,
    700,
  );
  const headerTop = l0[formIdx].yBot + 6;
  const hdrRules = verticalRules(pdf, 0, headerTop, headerBottom);
  // [left edge, label/value divide, right edge]
  const valueDivide = hdrRules.length >= 3 ? hdrRules[1] : 205.9;
  const headerRight = hdrRules.length >= 3 ? hdrRules[hdrRules.length - 1] : 533.5;

  const fields = {};
  const headerFields = [];

  // ---- header fields -----------------------------------------------------
  // The header is a bordered table. Its horizontal rules — not the text — decide
  // where one field's row ends, which is the only way to keep the instruction
  // paragraph above the table from being read as the first field's label, and to
  // keep a wrapped label ("Conducted by (Name /" / "Position):") in one row.
  const hRules = horizontalRules(pdf, 0, 66, 534).filter(
    (y) => y > headerTop - 8 && y < headerBottom + 8,
  );
  for (let r = 0; r + 1 < hRules.length; r++) {
    const top = hRules[r];
    const bot = hRules[r + 1];
    const band = l0.filter((l) => l.mid > top && l.mid < bot && !FOOTER_RE.test(l.text));
    if (!band.length) continue;

    const labelLines = band.filter((l) => l.words.some((w) => w.x < valueDivide - 4));
    const label = labelLines
      .map((l) => l.words.filter((w) => w.x < valueDivide - 4).map((w) => w.t).join(' '))
      .join(' ')
      .replace(/\s+/g, ' ')
      .replace(/\s*:\s*$/, '')
      .trim();
    if (!label) continue;

    const right = band.flatMap((l) => l.words.filter((w) => w.x >= valueDivide - 4));
    const anchorLine = labelLines[labelLines.length - 1] ?? band[0];
    emitHeaderField(
      { label, anchor: anchorLine, right, band },
      { fields, headerFields, valueDivide, headerRight },
    );
  }

  // ---- sections and items -------------------------------------------------
  const sections = [];
  let itemCount = 0;

  for (let pi = 0; pi < pages.length; pi++) {
    const pl = pageLines[pi];
    const boxLines = pl.filter((l) => l.words.some((w) => w.t === BOX && w.x > 300));
    if (!boxLines.length && !pl.some(isSectionHeader)) continue;

    const bandTop = Math.max(0, Math.min(...pl.filter(isSectionHeader).map((l) => l.yTop), ...boxLines.map((l) => l.yTop)) - 20);
    const bandBot = Math.min(PAGE_H, Math.max(...boxLines.map((l) => l.yBot), bandTop + 40) + 20);
    const rules = verticalRules(pdf, pi, bandTop, bandBot);
    // [left, item|SAT, SAT|NOSAT, NOSAT|remarks, right]
    const itemRight = pick(rules, 1, 377.5);
    const remarksLeft = pick(rules, 3, 449.4);
    const tableRight = pick(rules, 4, 533.5);

    // An item's wording can run over a page break (Annex C A-10 "...width (mm)"
    // / "and severity" at the top of page 2). Without this the tail is lost.
    if (pi > 0 && sections.length && sections[sections.length - 1].items.length) {
      const firstRow = pl.find(
        (l) => l.words.filter((w) => w.t === BOX && w.x >= itemRight && w.x < remarksLeft).length === 2,
      );
      const firstSection = pl.find(isSectionHeader);
      const limit = Math.min(firstRow?.yTop ?? PAGE_H, firstSection?.yTop ?? PAGE_H);
      const carry = pl
        .filter(
          (l) =>
            l.yTop > 90 &&
            l.yTop < limit - 4 &&
            l.words.some((w) => w.x < itemRight) &&
            !FOOTER_RE.test(l.text) &&
            !isSectionHeader(l) &&
            !startsBlockHeading(leftOf(l, itemRight)) &&
            !rowCode(l, itemRight),
        )
        .map((l) => leftOf(l, itemRight))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (carry) {
        const prevItems = sections[sections.length - 1].items;
        const prev = prevItems[prevItems.length - 1];
        prev.text = `${prev.text} ${carry}`.replace(/\s+/g, ' ').trim();
      }
    }

    for (let li = 0; li < pl.length; li++) {
      const line = pl[li];
      if (isSectionHeader(line)) {
        let titleText = leftOf(line, itemRight);
        // A long section title wraps; the continuation line carries only the
        // second half of the column captions ("SAT" / "Location").
        const next = pl[li + 1];
        if (next && isCaptionTail(next, itemRight)) {
          const tail = leftOf(next, itemRight);
          if (tail) titleText = `${titleText} ${tail}`.replace(/\s+/g, ' ').trim();
        }
        if (titleText) sections.push({ title: titleText, items: [] });
        continue;
      }

      const boxes = line.words.filter((w) => w.t === BOX && w.x >= itemRight && w.x < remarksLeft);
      if (boxes.length !== 2) continue;

      const codeWord = rowCode(line, itemRight);
      if (!codeWord) continue;

      // Wording is the left column of this row plus any continuation lines that
      // have no code and no checkboxes before the next row starts.
      let text = stripCode(leftOf(line, itemRight), codeWord.t);
      const continuationLines = [];
      for (let k = li + 1; k < pl.length; k++) {
        const cont = pl[k];
        if (cont.words.some((w) => w.t === BOX && w.x >= itemRight && w.x < remarksLeft)) break;
        if (rowCode(cont, itemRight)) break;
        if (isSectionHeader(cont) || FOOTER_RE.test(cont.text)) break;
        if (!cont.words.some((w) => w.x < itemRight)) break;
        if (isBlockHeading(cont.text) || startsBlockHeading(leftOf(cont, itemRight))) break;
        continuationLines.push(cont);
        text = `${text} ${leftOf(cont, itemRight)}`.replace(/\s+/g, ' ').trim();
      }
      if (!text) continue;

      if (!sections.length) sections.push({ title: null, items: [] });
      const itemCode = codeWord.t;
      // Some approved rows print extra ☐ sub-options inside the wording itself
      // (Annex C A-21 "None ☐ Recommended to COO ☐"). The overlay cannot tick
      // those from a SAT/NO SAT answer, so record them rather than lose them.
      const inlineBoxes = [line, ...continuationLines].some((l) =>
        l.words.some((w) => w.t === BOX && w.x < itemRight),
      );
      sections[sections.length - 1].items.push({
        code: itemCode,
        text,
        ...(inlineBoxes ? { inlineOptions: true } : {}),
      });
      itemCount += 1;

      const y = toPdfY(line.yTop);
      const nextRowTop = nextBoxRowTop(pl, li, itemRight, remarksLeft) ?? line.yTop + 20.76;
      const rowHeight = +(nextRowTop - line.yTop).toFixed(2);
      const cols = [...boxes].sort((a, b) => a.x - b.x);
      fields[`${itemCode}.sat`] = { page: pi, x: +cols[0].x.toFixed(1), y, type: 'mark', size: 9 };
      fields[`${itemCode}.no_sat`] = { page: pi, x: +cols[1].x.toFixed(1), y, type: 'mark', size: 9 };
      fields[`${itemCode}.remarks`] = {
        page: pi,
        x: +(remarksLeft + 3).toFixed(1),
        y: y + 1,
        // Stay inside the printed remarks cell. The right rule is the hard edge:
        // anything wider prints into the page margin.
        width: +(tableRight - remarksLeft - 6).toFixed(1),
        height: rowHeight,
        size: 7,
        wrap: true,
        maxLines: rowHeight > 25 ? 2 : 1,
        overflow: 'continuation',
      };
    }
  }

  // ---- summary blocks (any page) and signatures ---------------------------
  // The approved forms close with a mix of free-text areas ("DEFICIENCY DETAILS
  // (…):") and ☐ option groups ("OVERALL STATUS (mark one):"). They are not all
  // on the last page — Annex A carries two on page 4 and one on page 5 — so the
  // whole document is scanned in print order.
  const summaryFields = [];
  const preprinted = [];
  const last = pages.length - 1;
  const lastLines = pageLines[last];
  const underscores = lastLines
    .flatMap((l) => l.words.filter((w) => UNDERSCORES.test(w.t)))
    .sort((a, b) => a.yTop - b.yTop || a.x - b.x);
  const sigRowTop = underscores.length ? underscores[0].yTop : null;

  for (let pi = 0; pi < pages.length; pi++) {
    const pl = pageLines[pi];
    const headings = [];
    for (let li = 0; li < pl.length; li++) {
      const line = pl[li];
      if (FOOTER_RE.test(line.text)) continue;
      // The form's own title block is ALL CAPS too; it is not a field.
      if (pi === 0 && line.yTop < headerTop) continue;
      if (!startsBlockHeading(line.text)) continue;
      if (line.words.some((w) => w.t === BOX)) continue;
      // The heading's colon may land on the following line.
      let label = line.text.replace(/\s+/g, ' ').trim();
      let endLine = line;
      for (let k = li + 1; k < pl.length && !/:$/.test(label); k++) {
        const cont = pl[k];
        if (FOOTER_RE.test(cont.text) || cont.words.some((w) => w.t === BOX)) break;
        label = `${label} ${cont.text}`.replace(/\s+/g, ' ').trim();
        endLine = cont;
        li = k;
      }
      if (!/:$/.test(label)) continue;
      headings.push({ label, line, endLine });
    }

    for (let hi = 0; hi < headings.length; hi++) {
      const h = headings[hi];
      const label = h.label.replace(/\s*:$/, '').trim();
      const key = camel(label);
      const mapKey = snake(key).slice(0, 40);

      // Lines between this heading and the next boundary.
      const nextHeadingTop = headings[hi + 1]?.line.yTop ?? Infinity;
      const footerTop = Math.min(
        ...pl.filter((l) => FOOTER_RE.test(l.text) && l.yTop > h.endLine.yBot).map((l) => l.yTop),
        Infinity,
      );
      const sigTop = pi === last && sigRowTop != null && sigRowTop > h.endLine.yBot ? sigRowTop : Infinity;
      const bottom = Math.min(nextHeadingTop, footerTop, sigTop, PAGE_H);

      const bodyLines = pl.filter(
        (l) =>
          l.yTop > h.endLine.yBot + 1 &&
          l.yTop < bottom - 1 &&
          !FOOTER_RE.test(l.text) &&
          l.text.replace(/\s+/g, '').length > 0,
      );
      const bodyText = bodyLines.map((l) => l.text).join(' ').replace(/\s+/g, ' ').trim();
      // A parenthetical under the heading is completion GUIDANCE, not content:
      // Annex K's "(Attach drawing. Confirm markings comply with BCAR-14…)".
      // The area below it is still the fill-in space.
      const isGuidance = /^\(/.test(bodyText) && /\)\.?$/.test(bodyText);
      const optionLines = bodyLines.filter((l) => l.words.some((w) => w.t === BOX));

      if (optionLines.length && !isGuidance) {
        const boxes = optionLines.flatMap((l) =>
          l.words.filter((w) => w.t === BOX).map((w) => ({ box: w, line: l })),
        );
        const options = boxes.map(({ box, line }, i) => {
          // "☐ NO DEFICIENCIES FOUND — …" labels follow their box; "Yes ☐" precedes it.
          const after = line.words.filter((w) => w.t !== BOX && w.x > box.x);
          const before = line.words.filter((w) => w.t !== BOX && w.x < box.x);
          const boxesOnLine = line.words.filter((w) => w.t === BOX);
          const idxOnLine = boxesOnLine.indexOf(box);
          const prevBoxX = idxOnLine > 0 ? boxesOnLine[idxOnLine - 1].x : -Infinity;
          const nextBoxX = boxesOnLine[idxOnLine + 1]?.x ?? Infinity;
          const leadText = before
            .filter((w) => w.x > prevBoxX)
            .map((w) => w.t)
            .join(' ')
            .trim();
          const trailText = after
            .filter((w) => w.x < nextBoxX)
            .map((w) => w.t)
            .join(' ')
            .trim();
          let text = leadText || trailText || `Option ${i + 1}`;
          // "Yes ☐ (reason below) No ☐" — the note belongs to the previous
          // option, so a Yes/No answer keeps its own one-word label.
          const yn = text.match(/\b(Yes|No)\s*$/i);
          if (yn) text = yn[1];
          return { box, label: text };
        });
        const isYesNo =
          options.length === 2 && /^yes/i.test(options[0].label) && /^no\b/i.test(options[1].label);
        summaryFields.push({
          key,
          label,
          type: isYesNo ? 'yes_no' : 'radio',
          required: false,
          markPrefix: mapKey,
          options: options.map((o) => ({ value: optionValue(o.label), label: o.label })),
        });
        for (const o of options) {
          fields[`${mapKey}.${optionValue(o.label)}`] = {
            page: pi,
            x: +o.box.x.toFixed(1),
            y: toPdfY(o.box.yTop),
            type: 'mark',
            size: 9,
          };
        }
        continue;
      }

      if (bodyLines.length && !isGuidance) {
        // Content the form already prints — a declaration or a reference list.
        // Stamping into it would overprint approved wording, which §14 forbids.
        preprinted.push({ key, label, page: pi, text: bodyText });
        continue;
      }

      // Guidance may itself carry a confirmation pair, e.g. Annex K Section F's
      // "(… EEC involvement confirmed: Yes ☐ No ☐.)". Map those boxes as their
      // own field; the section's writing space is unaffected.
      // Inside prose the box can arrive glued to its punctuation ("No ☐.)"),
      // so match on the leading glyph rather than the whole token.
      const guidanceBoxes = isGuidance
        ? bodyLines.flatMap((l) => l.words.filter((w) => w.t.startsWith(BOX)))
        : [];
      if (guidanceBoxes.length === 2) {
        const confirmKey = `${key}Confirmed`;
        const confirmMap = snake(confirmKey).slice(0, 40);
        summaryFields.push({
          key: confirmKey,
          label: `${label} — confirmed`,
          type: 'yes_no',
          required: false,
          markPrefix: confirmMap,
          options: [
            { value: 'yes', label: 'Yes' },
            { value: 'no', label: 'No' },
          ],
        });
        const ordered = [...guidanceBoxes].sort((a, b) => a.x - b.x);
        fields[`${confirmMap}.yes`] = { page: pi, x: +ordered[0].x.toFixed(1), y: toPdfY(ordered[0].yTop), type: 'mark', size: 9 };
        fields[`${confirmMap}.no`] = { page: pi, x: +ordered[1].x.toFixed(1), y: toPdfY(ordered[1].yTop), type: 'mark', size: 9 };
      }

      // The writing space starts below any guidance line.
      const blockTop = isGuidance && bodyLines.length
        ? Math.max(...bodyLines.map((l) => l.yBot))
        : h.endLine.yBot;
      const hint = isGuidance ? bodyText : null;

      // A free-text area: the blank space the approved form leaves under the
      // heading. `y` is the FIRST LINE'S BASELINE and wrapped lines run
      // downward, so the anchor is measured from the top of the gap; the line
      // count and type size are then chosen so the last descender still clears
      // whatever is printed below.
      const top = blockTop + 2;
      const avail = bottom - top;
      const size = [9, 8, 7, 6].find((sz) => sz * 1.3 + 1 <= avail) ?? 6;
      const lineH = size + 2;
      const maxLines = Math.max(1, 1 + Math.floor((avail - 1 - size * 1.3) / lineH));
      const x = +Math.max(72, h.line.words[0].x).toFixed(1);
      const width = +(headerRight - x - 4).toFixed(1);
      const y = +(PAGE_H - (top + 1) - size).toFixed(2);
      summaryFields.push({
        key,
        label,
        type: 'textarea',
        required: false,
        mapKey,
        ...(hint ? { hint } : {}),
        ...(maxLines === 1 && avail < 16 ? { tightOnForm: true } : {}),
      });
      fields[mapKey] = {
        page: pi,
        x,
        y,
        width,
        height: +avail.toFixed(1),
        size,
        wrap: true,
        maxLines,
        overflow: 'continuation',
      };
    }
  }

  // The first free-text area is the form's deficiency narrative; the app already
  // has one such box, so alias it rather than inventing a second concept.
  const firstText = summaryFields.find((f) => f.type === 'textarea');
  const deficienciesField = firstText ? { label: firstText.label, mapKey: firstText.mapKey } : null;

  // Signature slots: underscore runs on the final page, captioned underneath.
  const signoffs = [];
  const sigRow = underscores.filter((w) => Math.abs(w.yTop - sigRowTop) <= 6);
  const usedRoles = new Set();
  sigRow.forEach((slot, i) => {
    const caption = captionUnder(lastLines, slot, sigRow, i);
    let role = roleFor(caption, i);
    if (usedRoles.has(role)) role = `${role}_${usedRoles.size + 1}`;
    usedRoles.add(role);
    const y = baselineY(slot.yBot);
    const width = +(slot.xMax - slot.x).toFixed(1);
    fields[`${role}_signature`] = { page: last, x: +slot.x.toFixed(1), y, type: 'image', width, height: 22 };
    fields[`${role}_name`] = {
      page: last,
      x: +slot.x.toFixed(1),
      y,
      size: 7,
      width,
      wrap: true,
      maxLines: 1,
      overflow: 'continuation',
    };
    const dateWord = dateSlotFor(lastLines, slot);
    if (dateWord) {
      fields[`${role}_date`] = {
        page: last,
        x: +dateWord.x.toFixed(1),
        y: baselineY(dateWord.yBot),
        size: 8,
        width: +(dateWord.xMax - dateWord.x).toFixed(1),
      };
    }
    signoffs.push({ role, label: caption, dateLabel: dateWord ? 'Date' : null });
  });

  const key = keyOverride ?? `annex-${annexLetter.toLowerCase()}-${slugify(title)}`;

  // Annex K numbers its header rows ("1. PROJECT TITLE:", "2. Project Location
  // on Aerodrome:") and gives each a full-width answer line. That is a list, not
  // a grid of short fields, so the form renders it one row per line.
  const numberedHeader =
    headerFields.length > 0 && headerFields.filter((f) => /^\s*\d+\./.test(f.label)).length >= 3;

  const schema = {
    code,
    annexLabel: `Annex ${annexLetter}`,
    headerLayout: numberedHeader ? 'stacked' : 'grid',
    documentFamily: 'PMM',
    title,
    description: instruction,
    manualHeader: {
      line1: 'AERODROME OPERATIONS MANUAL',
      line2: 'PHILIP S.W. GOLDSON INTERNATIONAL AIRPORT',
      pageRef: 'ANNEX 1-1\nPGIA 16-14',
    },
    footer: {
      reviewLine: 'Review: Ed. 01 Annex 2-1',
      dateLine: 'Date: March 12, 2026. Maintenance Paved and Unpaved Manual.',
    },
    frequency: normaliseFrequency(instruction),
    responseType: {
      columns: ['sat', 'no_sat'],
      labels: { sat: 'SAT', no_sat: 'NO SAT' },
      remarksLabel: 'Remarks / Location',
    },
    headerFields,
    sections,
    summaryFields,
    ...(preprinted.length ? { preprintedStatements: preprinted } : {}),
    ...(deficienciesField ? { deficienciesField } : {}),
    signoffs,
    validationRules: ['Every item marked NO SAT requires non-empty remarks before submission.'],
    notes: [
      'Generated by scripts/pmm-extract.mjs from the approved base PDF. Re-run it rather than hand-editing; every coordinate is a measured glyph or rule position.',
      'Item codes are the ones PRINTED on the approved form — they are not synthetic and must not be renumbered.',
    ],
  };

  const fieldMap = {
    templateKey: key,
    templateVersion: 'ed01',
    basePdf: `${key}-ed01.pdf`,
    documentFamily: 'PMM',
    origin: 'pdf-points-bottom-left',
    originNote:
      'PDF points, bottom-left origin (pdf-lib). From pdftotext -bbox: y_pdf = 792.12 - yTop - 9.74.',
    mapping: {
      method: 'automated: scripts/pmm-extract.mjs — glyph positions + raster rule detection',
      headerRules: hdrRules,
      generated: true,
    },
    pageSize: { width: PAGE_W, height: PAGE_H },
    fields,
  };

  return { key, schema, fieldMap, annexLetter, itemCount, pages: pages.length };
}

// ------------------------------------------------------------------ helpers ---

function pick(rules, i, fallback) {
  return rules.length >= 5 ? rules[i] : fallback;
}

/** Remove the printed item code from the start of an item's wording. */
function stripCode(text, code) {
  const t = String(text).trim();
  return (t.startsWith(code) ? t.slice(code.length) : t).replace(/^[\s.\-—]+/, '').trim();
}

function leftOf(line, x) {
  return line.words
    .filter((w) => w.x < x)
    .map((w) => w.t)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** A section band header prints the column captions beside its title. */
function isSectionHeader(line) {
  const right = line.words.filter((w) => w.x >= 360);
  const hasSat = right.some((w) => w.t === 'SAT');
  const hasRemarks = right.some((w) => /^Remarks/.test(w.t));
  const left = line.words.filter((w) => w.x < 360);
  return hasSat && hasRemarks && left.length > 0;
}

/** The wrapped second line of a section header: only "SAT" / "Location" on the right. */
function isCaptionTail(line, itemRight) {
  const right = line.words.filter((w) => w.x >= itemRight);
  if (!right.length) return false;
  const t = right.map((w) => w.t).join(' ');
  return /^(SAT\s*)?(Location)?$/.test(t.trim()) && !line.words.some((w) => w.t === BOX);
}

/**
 * The first line of an ALL-CAPS block heading, e.g. "DEFICIENCY SUMMARY (for
 * each NO SAT item: Section, Item No.,". Its colon may not arrive until the next
 * line, so isBlockHeading() alone would let the heading bleed into the last
 * item's wording.
 */
function startsBlockHeading(text) {
  const words = String(text).replace(/\s+/g, ' ').trim().split(' ');
  if (words.length < 2) return false;
  const caps = (w, min) => {
    const letters = String(w ?? '').replace(/[^A-Za-z]/g, '');
    return letters.length >= min && letters === letters.toUpperCase();
  };
  // The first word must be a real word ("SECTION", "DEFICIENCY"); the second may
  // be a single letter, as in Annex K's "SECTION A — OPERATIONAL IMPACT…".
  return caps(words[0], 3) && (caps(words[1], 1) || words[1] === '—');
}

/** ALL-CAPS block heading that opens a free-text area, e.g. "DEFICIENCIES …:" */
function isBlockHeading(text) {
  const t = text.replace(/\s+/g, ' ').trim();
  if (!/:$/.test(t)) return false;
  // "FOD REMOVED DURING INSPECTION (description and quantity, if any):" — the
  // parenthetical is sentence case on every form, so test the heading without it.
  const head = t.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
  const letters = head.replace(/[^A-Za-z]/g, '');
  if (letters.length < 8) return false;
  return letters === letters.toUpperCase();
}

function firstUnderscoreTop(pageLines) {
  const hit = pageLines.find((l) => l.words.some((w) => UNDERSCORES.test(w.t)));
  return hit ? hit.yTop - 4 : null;
}

function nextRowStarts(pageLines, line, valueDivide) {
  const after = pageLines.filter((l) => l.yTop > line.yTop + 2);
  const next = after[0];
  if (!next) return true;
  return next.words.some((w) => w.x < valueDivide - 4);
}

function nextBoxRowTop(pageLines, fromIndex, itemRight, remarksLeft) {
  for (let k = fromIndex + 1; k < pageLines.length; k++) {
    const l = pageLines[k];
    const n = l.words.filter((w) => w.t === BOX && w.x >= itemRight && w.x < remarksLeft).length;
    if (n === 2) return l.yTop;
  }
  return null;
}

function emitHeaderField(row, { fields, headerFields, valueDivide, headerRight }) {
  const label = String(row.label).replace(/\s*:$/, '').replace(/\s+/g, ' ').trim();
  if (!label) return;
  const key = camel(label);
  const mapKey = snake(key);
  const boxes = row.right.filter((w) => w.t === BOX);

  if (boxes.length) {
    const ordered = [...boxes].sort((a, b) => a.x - b.x);
    const options = ordered.map((box, i) => {
      const prevX = i === 0 ? -Infinity : ordered[i - 1].x;
      const before = row.right
        .filter((w) => w.t !== BOX && w.x > prevX && w.x < box.x)
        .map((w) => w.t)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      return { box, label: before || `Option ${i + 1}` };
    });
    const isYesNo = options.length === 2 && /yes/i.test(options[0].label) && /no/i.test(options[1].label);
    headerFields.push({
      key,
      label,
      type: isYesNo ? 'yes_no' : 'radio',
      required: true,
      markPrefix: mapKey,
      options: options.map((o) => ({ value: optionValue(o.label), label: o.label })),
    });
    for (const o of options) {
      fields[`${mapKey}.${optionValue(o.label)}`] = {
        page: 0,
        x: +o.box.x.toFixed(1),
        y: toPdfY(o.box.yTop),
        type: 'mark',
        size: 9,
      };
    }
    // Some option rows carry a write-in slot printed as underscores, e.g.
    // Annex F's "Other: ____" beneath the Inspection Type choices.
    const rule = underscoreIn(row.band);
    if (rule) {
      const otherKey = `${key}Other`;
      headerFields.push({ key: otherKey, label: `${label} — other`, type: 'text', required: false, mapKey: snake(otherKey) });
      fields[snake(otherKey)] = {
        page: 0,
        x: +rule.x.toFixed(1),
        y: baselineY(rule.yBot),
        size: 8,
        width: +Math.max(60, rule.xMax - rule.x).toFixed(1),
        wrap: true,
        maxLines: 1,
        overflow: 'continuation',
      };
    }
    return;
  }

  const type = /date/i.test(label) ? 'date' : /\btime\b/i.test(label) ? 'time' : 'text';
  // If the form prints an underscore rule for the answer, write on the rule.
  // Otherwise the value belongs in the ruled cell to the right of the label.
  const rule = underscoreIn(row.band);
  const anchorX = rule ? +rule.x.toFixed(1) : +(valueDivide + 6).toFixed(1);
  const y = rule ? baselineY(rule.yBot) : baselineY(row.anchor.yBot);
  const width = rule
    ? +Math.max(60, rule.xMax - rule.x).toFixed(1)
    : +(headerRight - anchorX - 4).toFixed(1);
  headerFields.push({ key, label, type, required: type !== 'text', mapKey });
  fields[mapKey] = {
    page: 0,
    x: anchorX,
    y,
    size: 9,
    width,
    ...(type === 'text' ? { wrap: true, maxLines: 1, overflow: 'continuation' } : {}),
  };
}

function underscoreIn(band) {
  for (const l of band ?? []) {
    const hit = l.words.find((w) => UNDERSCORES.test(w.t));
    if (hit) return hit;
  }
  return null;
}

/** The caption printed under a signature slot identifies whose signature it is. */
function captionUnder(pageLines, slot, sigRow, index) {
  const nextLeft = sigRow[index + 1] ? sigRow[index + 1].x : 1e9;
  const parts = [];
  for (const l of pageLines) {
    if (l.yTop <= slot.yTop + 2) continue;
    if (FOOTER_RE.test(l.text)) break;
    // Columns wrap independently: on Annex C the CEC caption's second line sits
    // on the same visual row as the OM column's "Date: ____", so the underscore
    // and "Date:" tests must look only at THIS column's slice.
    const col = l.words.filter((w) => w.x >= slot.x - 6 && w.x < nextLeft - 6);
    if (col.some((w) => UNDERSCORES.test(w.t))) break;
    const seg = col.map((w) => w.t).join(' ').trim();
    if (/^Date:/.test(seg)) break;
    if (seg) parts.push(seg);
  }
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

/** The "Date: ______" slot belonging to one signature column. */
function dateSlotFor(pageLines, slot) {
  for (const l of pageLines) {
    if (l.yTop <= slot.yTop) continue;
    const dateIdx = l.words.findIndex((w) => /^Date:?$/.test(w.t) && w.x >= slot.x - 8 && w.x < slot.x + 220);
    if (dateIdx < 0) continue;
    const rule = l.words.slice(dateIdx + 1).find((w) => UNDERSCORES.test(w.t));
    if (rule) return rule;
  }
  return null;
}

function roleFor(caption, index) {
  const c = String(caption).toLowerCase();
  if (/contractor/.test(c)) return 'contractor';
  if (/\bcoo\b/.test(c) && !/\bom\b/.test(c)) return 'coo';
  if (/\bcec\b/.test(c)) return 'cec';
  if (/\bceo\b/.test(c)) return 'ceo';
  if (/apron supervisor/.test(c)) return 'apron_supervisor';
  if (/conducting inspection|conducted by|inspection conducted/.test(c)) return 'inspector';
  if (/received by om|acknowledgment|reviewed|\bom\b/.test(c)) return 'om';
  if (index === 0) return 'inspector';
  return `signoff_${index + 1}`;
}

function optionValue(label) {
  return (
    String(label)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 28) || 'option'
  );
}

function camel(label) {
  // Annex K numbers its header rows ("1. PROJECT TITLE:"). The label stays
  // verbatim on the form; the key must not start with a digit.
  return String(label)
    .replace(/^\s*\d+\.\s*/, '')
    .replace(/[^A-Za-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((w, i) => (i === 0 ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1).toLowerCase()))
    .join('');
}

function snake(key) {
  return String(key).replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
}

function slugify(title) {
  return String(title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
}

function normaliseFrequency(text) {
  const t = String(text ?? '').toLowerCase();
  if (/twice daily|daily/.test(t)) return 'daily';
  if (/week/.test(t)) return 'weekly';
  if (/quarter/.test(t)) return 'quarterly';
  if (/semi-?annual/.test(t)) return 'semi_annual';
  if (/annual|yearly/.test(t)) return 'annual';
  if (/month/.test(t)) return 'monthly';
  return 'on_demand';
}

// --------------------------------------------------------------------- main ---

if (process.argv[1]?.endsWith('pmm-extract.mjs')) {
  const pdf = process.argv[2];
  const outDir = process.argv[3] ?? '.';
  const keyArg = process.argv.find((a) => a.startsWith('--key='));
  const res = extractPmm(pdf, keyArg ? keyArg.slice(6) : undefined);
  mkdirSync(path.join(outDir, 'checklists'), { recursive: true });
  mkdirSync(path.join(outDir, 'field-maps'), { recursive: true });
  writeFileSync(path.join(outDir, 'checklists', `${res.key}.json`), JSON.stringify(res.schema, null, 2));
  writeFileSync(path.join(outDir, 'field-maps', `${res.key}-ed01.json`), JSON.stringify(res.fieldMap, null, 2));
  console.log(
    `Annex ${res.annexLetter.padEnd(2)} ${String(res.itemCount).padStart(3)} items  ${String(
      Object.keys(res.fieldMap.fields).length,
    ).padStart(3)} fields  ${res.pages}p  ${res.key}`,
  );
}
