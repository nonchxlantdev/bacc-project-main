import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const SOURCE_INSPECTION_LABELS = {
  monthly_routine: 'Monthly Routine',
  semi_annual_cec: 'Semi-Annual Structural (CEC)',
  post_storm_emergency: 'Post-Storm Emergency',
};

function wrapLine(font, text, size, maxWidth) {
  if (!text) return [];
  const words = String(text).split(/\s+/);
  const lines = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= maxWidth) current = next;
    else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/**
 * Overlay repeating rows onto copies of the approved register page.
 * overflow: repeat-base-page — never synthesise a continuation sheet.
 * Coordinates are PDF points, bottom-left origin.
 */
export async function overlayRegisterPdf({ basePdfBytes, fieldMap, rows = [] }) {
  const table = fieldMap.table;
  if (!table) throw new Error('Register field map is missing table');
  if (table.overflow && table.overflow !== 'repeat-base-page') {
    throw new Error(`Unsupported register overflow "${table.overflow}"`);
  }

  const src = await PDFDocument.load(basePdfBytes);
  const out = await PDFDocument.create();
  const font = await out.embedFont(StandardFonts.Helvetica);
  const rowsPerPage = table.rowsPerPage ?? 18;
  const pageCount = Math.max(1, Math.ceil((rows.length || 0) / rowsPerPage) || 1);
  const size = table.size ?? 8;

  for (let p = 0; p < pageCount; p += 1) {
    const [copied] = await out.copyPages(src, [table.page ?? 0]);
    out.addPage(copied);
    const page = out.getPages()[p];
    const slice = rows.slice(p * rowsPerPage, (p + 1) * rowsPerPage);
    slice.forEach((row, i) => {
      const y = table.firstRowY - i * table.rowHeight;
      for (const [key, col] of Object.entries(table.columns ?? {})) {
        const raw = row[key];
        if (raw == null || raw === '') continue;
        const text = String(raw);
        const width = col.width ?? 40;
        const fontSize = col.size ?? size;
        if (col.wrap) {
          const maxLines = col.maxLines ?? 2;
          const lines = wrapLine(font, text, fontSize, width).slice(0, maxLines);
          lines.forEach((line, li) => {
            page.drawText(line, {
              x: col.x,
              y: y - li * (fontSize + 1),
              size: fontSize,
              font,
              color: rgb(0, 0, 0),
            });
          });
        } else {
          let drawn = text;
          while (drawn.length > 1 && font.widthOfTextAtSize(drawn, fontSize) > width) {
            drawn = drawn.slice(0, -1);
          }
          let x = col.x;
          if (col.align === 'center') {
            const w = font.widthOfTextAtSize(drawn, fontSize);
            x = col.x + (width - w) / 2;
          }
          page.drawText(drawn, { x, y, size: fontSize, font, color: rgb(0, 0, 0) });
        }
      }
    });
  }

  return out.save();
}

export function incidentPeriodDate(incident) {
  return String(incident.source_inspection_date || incident.reported_at || '').slice(0, 10);
}

export function currentMonthRange(now = new Date()) {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const last = new Date(y, now.getMonth() + 1, 0).getDate();
  return {
    from: `${y}-${m}-01`,
    to: `${y}-${m}-${String(last).padStart(2, '0')}`,
  };
}

export function filterIncidentsForPeriod(incidents, from, to) {
  return (incidents ?? []).filter((inc) => {
    const d = incidentPeriodDate(inc);
    if (!d) return true;
    if (from && d < from) return false;
    if (to && d > to) return false;
    return true;
  });
}

export function incidentToRegisterRow(incident) {
  const closed = incident.closed_at ? String(incident.closed_at).slice(0, 10) : '';
  const notes = [closed, incident.closure_notes].filter(Boolean).join(' / ');
  return {
    noc_no: incident.noc_no || '',
    date: incident.source_inspection_date || String(incident.reported_at || '').slice(0, 10),
    source_inspection:
      SOURCE_INSPECTION_LABELS[incident.source_inspection_type] || incident.source_inspection_type || '',
    level: incident.deficiency_level != null ? String(incident.deficiency_level) : '',
    description: [incident.description, incident.location_label].filter(Boolean).join(' — '),
    assigned_to: incident.assigned_team || incident.assigned_to_name || '',
    target_date: incident.target_date ? String(incident.target_date).slice(0, 10) : '',
    closed_date_notes: notes,
  };
}
