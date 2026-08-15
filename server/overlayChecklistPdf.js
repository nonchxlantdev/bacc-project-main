import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

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
  const visible = overflow ? lines.slice(0, Math.max(1, maxLines - 1)) : lines;
  if (overflow) {
    const marker = `${CONTINUATION_MARKER}${field._continuationPage ?? 'N'}`;
    visible.push(marker);
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
  const overflow = [];

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
      page.drawImage(png, {
        x: field.x,
        y: field.y,
        width: field.width ?? png.width,
        height: field.height ?? png.height,
      });
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
  let page = pdfDoc.addPage([width, height]);
  let y = height - 72;

  const ensureSpace = (need) => {
    if (y - need < 72) {
      page = pdfDoc.addPage([width, height]);
      y = height - 72;
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
    page.drawText(`Photo evidence — ${photo.label ?? ''}`, { x: 72, y, size: 10, font: bold });
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

export function submissionToOverlayValues(record) {
  const header = record.header ?? {};
  const values = {
    inspection_date: header.date || record.inspection_date || '',
    conducted_by: header.conductedBy || '',
    rainfall_mm: header.rainfallMm ?? record.rainfall_mm ?? '',
    deficiencies_summary: record.deficiencies_summary ?? '',
  };
  const type = header.inspectionType || record.inspection_type;
  if (type) values[`inspection_type.${type}`] = true;

  for (const [code, row] of Object.entries(record.items ?? {})) {
    if (row?.result === 'sat') values[`${code}.sat`] = true;
    if (row?.result === 'no_sat') values[`${code}.no_sat`] = true;
    if (row?.remarks) values[`${code}.remarks`] = row.remarks;
  }

  const inspector = (record.signoffs ?? []).find((s) => s.role === 'inspector');
  const om = (record.signoffs ?? []).find((s) => s.role === 'om_acknowledgment');
  if (inspector) {
    values.inspector_name = [inspector.name, inspector.position].filter(Boolean).join(' / ');
    values.inspector_date = inspector.signed_at ? String(inspector.signed_at).slice(0, 10) : '';
  }
  if (om) {
    values.om_name = [om.name, om.position].filter(Boolean).join(' / ');
    values.om_date = om.signed_at ? String(om.signed_at).slice(0, 10) : '';
  }
  return values;
}

export function dataUriToBytes(dataUri) {
  if (!dataUri) return null;
  const match = String(dataUri).match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  return Buffer.from(match[2], 'base64');
}
