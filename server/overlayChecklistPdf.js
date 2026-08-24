import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { signoffFieldKeys } from '../src/lib/signoffFields.js';

const CONTINUATION_MARKER = '— see continuation p.';

function wrapLine(font, text, size, maxWidth) {
  if (!text) return [];
  const words = String(text).split(/\s+/);
  const lines = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= maxWidth) {
      current = next;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function drawWrapped(page, font, text, field) {
  const size = field.size ?? 9;
  const width = field.width ?? 120;
  const lineHeight = size + 2;
  const maxLines = field.maxLines ?? Math.max(1, Math.floor((field.height ?? lineHeight) / lineHeight));
  const lines = wrapLine(font, text, size, width);
  const overflow = lines.length > maxLines;
  const pageRef = field._continuationPage ?? 'N';
  let visible;
  if (!overflow) {
    visible = lines;
  } else if (maxLines <= 1) {
    // Single-line cell: truncate to fit and append a compact reference so the
    // total drawn lines never exceed maxLines. BACC §10 — an approved field is
    // never resized and never spills into the row below.
    const shortMarker = `…p.${pageRef}`;
    let t = String(text);
    while (t.length > 1 && font.widthOfTextAtSize(`${t} ${shortMarker}`, size) > width) {
      t = t.slice(0, -1);
    }
    visible = [`${t.trimEnd()} ${shortMarker}`];
  } else {
    visible = lines.slice(0, maxLines - 1);
    visible.push(`${CONTINUATION_MARKER}${pageRef}`);
  }
  // y is the first-line baseline (PDF bottom-left). Subsequent lines go down (smaller y).
  visible.forEach((line, i) => {
    page.drawText(line, {
      x: field.x,
      y: field.y - i * lineHeight,
      size,
      font,
      color: rgb(0, 0, 0),
    });
  });
  return overflow ? { key: field._key, text } : null;
}

/**
 * Overlay captured values onto the approved base PDF.
 * Coordinates are PDF points, bottom-left origin (pdf-lib).
 */
export async function overlayChecklistPdf({
  basePdfBytes,
  fieldMap,
  values,
  images = {},
  meta = {},
}) {
  const pdfDoc = await PDFDocument.load(basePdfBytes);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const pages = pdfDoc.getPages();
  // Grid rows past the number the approved form prints, handed over on `values`
  // by submissionToOverlayValues. Lifted out before anything is stamped, so the
  // loop below never meets a key no field map declares.
  const overflow = [...(values.__tableOverflow ?? [])];
  delete values.__tableOverflow;

  const continuationPageNumber = pages.length + 1;

  for (const [key, field] of Object.entries(fieldMap.fields ?? {})) {
    const page = pages[field.page];
    if (!page) continue;
    const type = field.type ?? 'text';
    const spec = { ...field, _key: key, _continuationPage: continuationPageNumber };

    if (type === 'mark') {
      if (values[key]) {
        page.drawText('X', {
          x: field.x,
          y: field.y,
          size: field.size ?? 9,
          font: bold,
          color: rgb(0, 0, 0),
        });
      }
      continue;
    }

    if (type === 'image') {
      const bytes = images[key];
      if (!bytes) continue;
      const png = await pdfDoc.embedPng(bytes);
      page.drawImage(png, signatureBox(field, key, fieldMap, png));
      continue;
    }

    const text = values[key];
    if (text == null || text === '') continue;
    if (field.wrap) {
      const over = drawWrapped(page, font, String(text), spec);
      if (over) overflow.push(over);
    } else {
      let drawn = String(text);
      if (field.width) {
        while (drawn.length > 1 && font.widthOfTextAtSize(drawn, field.size ?? 9) > field.width) {
          drawn = drawn.slice(0, -1);
        }
      }
      page.drawText(drawn, {
        x: field.x,
        y: field.y,
        size: field.size ?? 9,
        font,
      });
    }
  }

  if (overflow.length || (meta.photos ?? []).length) {
    await appendContinuationPages(pdfDoc, font, bold, overflow, meta);
  }

  return pdfDoc.save();
}

async function appendContinuationPages(pdfDoc, font, bold, overflow, meta) {
  const width = 612.12;
  const height = 792.12;
  const photos = meta.photos ?? [];
  // The header block runs from y=730 down to the identifier line at y=714, so
  // content starts below it. Starting at height-72 (720) put the first caption
  // straight through the identifier line.
  const CONTENT_TOP = 690;
  let page = pdfDoc.addPage([width, height]);
  let y = CONTENT_TOP;

  const ensureSpace = (need) => {
    if (y - need < 72) {
      page = pdfDoc.addPage([width, height]);
      y = CONTENT_TOP;
      drawContinuationHeader(page, bold, meta, pdfDoc.getPageCount());
    }
  };

  drawContinuationHeader(page, bold, meta, pdfDoc.getPageCount());

  for (const item of overflow) {
    ensureSpace(60);
    page.drawText(item.key, { x: 72, y, size: 10, font: bold });
    y -= 14;
    const lines = wrapLine(font, item.text, 9, width - 144);
    for (const line of lines) {
      ensureSpace(14);
      page.drawText(line, { x: 72, y, size: 9, font });
      y -= 12;
    }
    y -= 10;
  }

  for (const photo of photos) {
    if (!photo?.bytes) continue;
    ensureSpace(220);
    // Drawings and photo evidence share this channel; the caption is what tells
    // them apart in the output, so an attached site plan is not filed as
    // "photo evidence" of a deficiency.
    page.drawText(photo.caption ?? `Photo evidence — ${photo.label ?? ''}`, {
      x: 72,
      y,
      size: 10,
      font: bold,
    });
    y -= 14;
    try {
      const img = photo.contentType?.includes('png')
        ? await pdfDoc.embedPng(photo.bytes)
        : await pdfDoc.embedJpg(photo.bytes);
      const maxW = width - 144;
      const maxH = 180;
      const scale = Math.min(maxW / img.width, maxH / img.height, 1);
      page.drawImage(img, { x: 72, y: y - img.height * scale, width: img.width * scale, height: img.height * scale });
      y -= img.height * scale + 16;
    } catch {
      page.drawText('(photo could not be embedded)', { x: 72, y, size: 9, font });
      y -= 14;
    }
  }
}

/**
 * Where a signature image goes inside its declared box.
 *
 * Two things the naive placement got wrong on all 63 signature slots in the
 * project:
 *
 *  1. The typed name sits on the same signature line, anchored at the same `y`.
 *     Drawing the image from that same `y` laid the scribble straight across
 *     the name. So the image is lifted clear of the name's text height and
 *     takes the remaining space in the box — the top of the box is unchanged,
 *     which is what keeps the placement gate honest.
 *
 *  2. Forcing both width and height stretched every signature to the box's
 *     aspect ratio. A signature is handwriting; distorting it is closer to
 *     altering it than to reproducing it. It now scales to fit and keeps its
 *     shape, sitting at the left of the box the way a signature meets a line.
 */
function signatureBox(field, key, fieldMap, png) {
  const name = key.endsWith('_signature')
    ? fieldMap.fields?.[key.replace(/_signature$/, '_name')]
    : null;
  // Lift the mark clear of the typed name only when the two are stacked in the
  // same box — which is how the PMM and VAES forms print a signature slot, name
  // beneath the rule the signature sits on.
  //
  // The Wildlife forms put them side by side instead: "Prepared by: ____
  // Signature: ____" on one rule, two separate runs. Sharing a y there means
  // nothing more than sharing a line, so lifting would float the signature
  // above its own rule to dodge a name that is 250pt to its left. Overlapping
  // in x is what actually distinguishes the two layouts.
  const stacked =
    name &&
    name.y === field.y &&
    name.x < field.x + (field.width ?? 0) &&
    field.x < name.x + (name.width ?? 0);
  const lift = stacked ? (name.size ?? 9) + 1 : 0;

  const boxW = field.width ?? png.width;
  const boxH = Math.max((field.height ?? png.height) - lift, 6);
  const scale = Math.min(boxW / png.width, boxH / png.height);

  return {
    x: field.x,
    y: field.y + lift,
    width: png.width * scale,
    height: png.height * scale,
  };
}

function drawContinuationHeader(page, bold, meta, pageNumber) {
  page.drawText('CONTINUATION / ATTACHMENT', {
    x: 72,
    y: 730,
    size: 12,
    font: bold,
  });
  const line = [
    meta.formCode,
    meta.templateVersion,
    meta.submissionId,
    `p.${pageNumber}`,
  ]
    .filter(Boolean)
    .join('  ·  ');
  page.drawText(line, { x: 72, y: 714, size: 8, font: bold });
}

/** camelCase -> snake_case, the default header key -> field-map key mapping. */
function snake(key) {
  return String(key).replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
}

export function submissionToOverlayValues(record) {
  const header = record.header ?? {};
  const schema = record.schema ?? record.content_schema ?? null;
  const values = { deficiencies_summary: record.deficiencies_summary ?? '' };

  const headerFields = schema?.headerFields ?? [];
  if (headerFields.length) {
    // Schema-driven: every form declares its own header fields. A field with
    // `markPrefix` becomes a checkbox mark (`<prefix>.<value>`); everything else
    // is text at `mapKey`, defaulting to snake_case of the key.
    for (const field of headerFields) {
      const raw = header[field.key];
      if (raw === undefined || raw === null || raw === '') continue;
      if (field.markPrefix) {
        values[`${field.markPrefix}.${raw}`] = true;
      } else {
        values[field.mapKey ?? snake(field.key)] = raw;
      }
    }
  } else {
    // Fallback for records saved before schemas carried mapKey/markPrefix.
    values.inspection_date = header.date || record.inspection_date || '';
    values.conducted_by = header.conductedBy || '';
    values.rainfall_mm = header.rainfallMm ?? record.rainfall_mm ?? '';
    const legacyType = header.inspectionType || record.inspection_type;
    if (legacyType) values[`inspection_type.${legacyType}`] = true;
  }

  for (const [code, row] of Object.entries(record.items ?? {})) {
    if (row?.result === 'sat') values[`${code}.sat`] = true;
    if (row?.result === 'no_sat') values[`${code}.no_sat`] = true;
    if (row?.remarks) values[`${code}.remarks`] = row.remarks;
  }

  // Summary blocks: the free-text areas and ☐ option groups the approved forms
  // print after the item table ("DEFICIENCY DETAILS (…):", "OVERALL STATUS
  // (mark one):"). Same contract as headerFields — markPrefix for a tick,
  // mapKey for text.
  const summary = record.summary ?? {};
  const tableOverflow = [];
  for (const field of schema?.summaryFields ?? []) {
    const raw = summary[field.key];
    if (raw === undefined || raw === null || raw === '') continue;

    // A log sheet's grid. The approved form prints a fixed number of rows —
    // eleven bird sightings, thirteen attendees, eight incursions — and each
    // ruled cell is its own field, `<mapKey>_<row>_<column>`. Rows past the
    // printed count are carried to a continuation page rather than dropped:
    // a bird count that found twenty species is not a record of eleven.
    if (field.type === 'table') {
      const rows = Array.isArray(raw) ? raw : [];
      const printed = field.printedRows ?? rows.length;
      const prefix = field.mapKey ?? snake(field.key);
      const columns = field.columns ?? [];

      rows.slice(0, printed).forEach((row, i) => {
        for (const col of columns) {
          // A signature cell holds a drawn mark, not text. It travels through
          // the images channel (see signoffFields.tableSignatureImages); typing
          // its data URI onto the form would print a wall of base64.
          if (col.type === 'signature') continue;
          const cell = row?.[col.key];
          if (cell === undefined || cell === null || cell === '') continue;
          values[`${prefix}_${String(i + 1).padStart(2, '0')}_${col.key}`] = cell;
        }
      });

      rows.slice(printed).forEach((row, i) => {
        const text = columns
          .map((col) => {
            if (col.type === 'signature') {
              return `${col.label}: ${row?.[col.key] ? 'signed' : '—'}`;
            }
            return `${col.label}: ${row?.[col.key] || '—'}`;
          })
          .join('   ·   ');
        tableOverflow.push({ key: `${field.label} — row ${printed + i + 1}`, text });
      });
      continue;
    }

    if (field.markPrefix) values[`${field.markPrefix}.${raw}`] = true;
    else values[field.mapKey ?? snake(field.key)] = raw;
  }
  // Carried on `values` because that is the one thing every caller already
  // passes to the overlay. The renderer lifts it straight back out; no field
  // map declares this key, so it can never be stamped onto a page.
  if (tableOverflow.length) values.__tableOverflow = tableOverflow;
  // The app's single deficiency narrative maps onto whichever block the form
  // designates as its deficiency area.
  const narrative = schema?.deficienciesField?.mapKey;
  if (narrative && record.deficiencies_summary && values[narrative] === undefined) {
    values[narrative] = record.deficiencies_summary;
  }

  // Sign-offs. The role -> field-key rule is shared with the browser so the
  // names, dates and signature image of one slot cannot disagree about which
  // slot they belong to. See src/lib/signoffFields.js.
  for (const s of record.signoffs ?? []) {
    if (!s?.role) continue;
    const keys = signoffFieldKeys(s.role);
    values[keys.name] = [s.name, s.position].filter(Boolean).join(' / ');
    values[keys.date] = s.signed_at ? String(s.signed_at).slice(0, 10) : '';
  }
  return values;
}

export function dataUriToBytes(dataUri) {
  if (!dataUri) return null;
  const match = String(dataUri).match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  return Buffer.from(match[2], 'base64');
}
