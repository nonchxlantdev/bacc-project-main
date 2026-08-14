import { flattenItems } from './checklistSchema.js';
import { getPhotoRecord } from '../utils/offlineQueue.js';
import { getBrandDataUris, urlToDataUri } from './brandAssets.js';
import { resolvePhotoUrl } from './submissions.js';

const CHECKED = '☑';
const UNCHECKED = '☐';

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function mark(on) {
  return on ? CHECKED : UNCHECKED;
}

function formatDate(value) {
  if (!value) return '';
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return esc(value);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function inspectionMarks(type) {
  return {
    monthly: mark(type === 'monthly_routine'),
    cec: mark(type === 'semi_annual_cec'),
    storm: mark(type === 'post_storm_emergency'),
  };
}

function itemRow(item, row, stripe) {
  const result = row?.result;
  const remarks = row?.remarks || '';
  const bg = stripe ? '#f3f6fa' : '#ffffff';
  return `
    <tr class="item-row" style="background:${bg}">
      <td class="item-text"><span class="code">${esc(item.code)}</span> ${esc(item.text)}</td>
      <td class="tick">${mark(result === 'sat')}</td>
      <td class="tick">${mark(result === 'no_sat')}</td>
      <td class="remarks">${esc(remarks)}</td>
    </tr>`;
}

function sectionTable(section, items, startStripe) {
  const rows = (section.items ?? [])
    .map((item, i) => itemRow(item, items?.[item.code], (startStripe + i) % 2 === 0))
    .join('');
  return `
    <table class="section-table">
      <thead>
        <tr>
          <th class="section-title" colspan="1">${esc(section.title)}</th>
          <th class="col-sat">SAT</th>
          <th class="col-nosat">NO SAT</th>
          <th class="col-remarks">Remarks / Location</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function runningHeader(schema, logos) {
  const pageRef = (schema.manualHeader?.pageRef ?? 'ANNEX 1-1\nPGIA 16-14').split('\n');
  return `
    <header class="doc-header">
      <div class="header-left">
        <img class="bacc-logo" src="${logos.bacc}" alt="BACC" />
      </div>
      <div class="header-center">
        <div class="manual-line1">${esc(schema.manualHeader?.line1 ?? 'AERODROME OPERATIONS MANUAL')}</div>
        <div class="manual-line2">${esc(schema.manualHeader?.line2 ?? 'PHILIP S.W. GOLDSON INTERNATIONAL AIRPORT')}</div>
      </div>
      <div class="header-right">
        <div class="page-ref">${esc(pageRef[0] ?? 'ANNEX 1-1')}</div>
        <div class="page-ref">${esc(pageRef[1] ?? 'PGIA 16-14')}</div>
        <img class="pgia-logo" src="${logos.pgia}" alt="PGIA" />
      </div>
    </header>`;
}

function runningFooter(schema, pageNumber) {
  return `
    <footer class="doc-footer">
      <div class="foot-left">${esc(schema.footer?.reviewLine ?? '')}</div>
      <div class="foot-center">${esc(schema.footer?.dateLine ?? '')}</div>
      <div class="foot-right">${esc(pageNumber)} | P a g e</div>
    </footer>`;
}

function infoGrid(schema, submission) {
  const header = submission.header ?? {};
  const marks = inspectionMarks(header.inspectionType || submission.inspection_type);
  const conducted = header.conductedBy
    || submission.signoffs?.find((s) => s.role === 'inspector')?.name
    || '';
  return `
    <table class="info-grid">
      <tr>
        <td class="info-label">Date:</td>
        <td class="info-value">${esc(formatDate(header.date || submission.inspection_date))}</td>
        <td class="info-label">Inspection Type:</td>
        <td class="info-value types">
          <span>${marks.monthly} Monthly Routine</span>
          <span>${marks.cec} Semi-Annual Structural (CEC)</span>
          <span>${marks.storm} Post-Storm Emergency</span>
        </td>
      </tr>
      <tr>
        <td class="info-label">Conducted by (Name / Position):</td>
        <td class="info-value" colspan="1">${esc(conducted)}</td>
        <td class="info-label">Rainfall lasts 24 hrs. (mm, if applicable):</td>
        <td class="info-value">${esc(header.rainfallMm ?? submission.rainfall_mm ?? '')}</td>
      </tr>
    </table>`;
}

function photoStrip(photos) {
  if (!photos.length) return '';
  const cells = photos
    .map(
      (p) => `
        <figure class="photo-card">
          <img src="${p.src}" alt="${esc(p.code)}" />
          <figcaption>${esc(p.code)}</figcaption>
        </figure>`,
    )
    .join('');
  return `
    <div class="photo-block">
      <div class="photo-heading">PHOTO EVIDENCE (NO SAT items)</div>
      <div class="photo-row">${cells}</div>
    </div>`;
}

function signoffBlock(schema, submission) {
  const defs = schema.signoffs ?? [];
  const byRole = Object.fromEntries((submission.signoffs ?? []).map((s) => [s.role, s]));
  const cells = defs
    .map((def) => {
      const signed = byRole[def.role];
      const name = signed?.name ?? '';
      const position = signed?.position ?? '';
      const date = signed?.signed_at ? formatDate(signed.signed_at.slice(0, 10)) : '';
      return `
        <td class="sign-cell">
          <div class="sign-label">${esc(def.label)}</div>
          <div class="sign-line">${esc(name)}${position ? ` / ${esc(position)}` : ''}</div>
          <div class="sign-space"></div>
          <div class="sign-date">${esc(def.dateLabel ?? 'Date:')} ${esc(date)}</div>
        </td>`;
    })
    .join('');
  return `<table class="sign-table"><tr>${cells}</tr></table>`;
}

const PRINT_CSS = `
  @page { size: letter; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; }
  body {
    font-family: Arial, Helvetica, sans-serif;
    color: #111;
    font-size: 9pt;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .page {
    width: 8.5in;
    height: 11in;
    padding: 0.42in 0.5in 0.58in 0.5in;
    position: relative;
    overflow: hidden;
    page-break-after: always;
    background: #fff;
  }
  .page:last-child { page-break-after: auto; }
  .doc-header {
    display: grid;
    grid-template-columns: 1.6in 1fr 1.35in;
    gap: 8px;
    align-items: start;
    border-bottom: 1.5px solid #0b1e3d;
    padding-bottom: 6px;
    margin-bottom: 8px;
    min-height: 0.85in;
  }
  .bacc-logo { height: 42px; width: auto; max-width: 1.55in; object-fit: contain; }
  .pgia-logo { height: 38px; width: auto; max-width: 1.2in; object-fit: contain; margin-top: 4px; }
  .header-center { text-align: center; padding-top: 4px; }
  .manual-line1, .manual-line2 {
    font-weight: 700;
    font-size: 11pt;
    letter-spacing: 0.02em;
    line-height: 1.2;
    color: #0b1e3d;
  }
  .header-right { text-align: right; }
  .page-ref { font-size: 9pt; font-weight: 700; color: #0b1e3d; line-height: 1.2; }
  .annex-bar {
    background: #0b1e3d;
    color: #fff;
    text-align: center;
    font-weight: 700;
    font-size: 12pt;
    letter-spacing: 0.12em;
    padding: 4px 8px;
  }
  .form-title {
    text-align: center;
    font-weight: 700;
    font-size: 13pt;
    margin: 6px 0 2px;
    color: #0b1e3d;
  }
  .form-number {
    text-align: center;
    font-style: italic;
    font-size: 9pt;
    margin-bottom: 4px;
  }
  .form-desc {
    text-align: center;
    font-size: 8pt;
    margin-bottom: 8px;
  }
  .info-grid {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 8px;
    font-size: 8.5pt;
  }
  .info-grid td {
    border: 1px solid #0b1e3d;
    padding: 4px 6px;
    vertical-align: top;
  }
  .info-label { width: 18%; font-weight: 700; background: #f3f6fa; }
  .info-value.types { display: flex; flex-direction: column; gap: 2px; }
  .section-table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 8px;
    table-layout: fixed;
  }
  .section-table th, .section-table td {
    border: 1px solid #0b1e3d;
    padding: 3px 5px;
    vertical-align: top;
  }
  .section-title {
    background: #0b1e3d;
    color: #fff;
    text-align: left;
    font-size: 8.5pt;
    font-weight: 700;
    letter-spacing: 0.04em;
  }
  .col-sat, .col-nosat, .col-remarks {
    background: #0b1e3d;
    color: #fff;
    font-size: 8pt;
    font-weight: 700;
    text-align: center;
  }
  .col-sat, .col-nosat { width: 0.62in; }
  .col-remarks { width: 2.15in; }
  .item-text { font-size: 8pt; line-height: 1.25; }
  .code { font-weight: 700; }
  .tick { text-align: center; font-size: 12pt; line-height: 1; }
  .remarks { font-size: 7.5pt; }
  .def-box {
    border: 1.5px solid #0b1e3d;
    min-height: 1.15in;
    padding: 6px 8px;
    margin-top: 4px;
  }
  .def-label { font-weight: 700; font-size: 8pt; margin-bottom: 6px; }
  .def-body { font-size: 8.5pt; white-space: pre-wrap; min-height: 0.8in; }
  .photo-block { margin-top: 8px; }
  .photo-heading { font-weight: 700; font-size: 8pt; margin-bottom: 4px; }
  .photo-row { display: flex; gap: 8px; flex-wrap: wrap; }
  .photo-card { margin: 0; width: 1.35in; }
  .photo-card img { width: 1.35in; height: 0.9in; object-fit: cover; border: 1px solid #0b1e3d; }
  .photo-card figcaption { font-size: 7pt; text-align: center; }
  .sign-table { width: 100%; border-collapse: collapse; margin-top: 0.35in; }
  .sign-cell {
    width: 50%;
    border: 1.5px solid #0b1e3d;
    padding: 10px 12px 14px;
    height: 2.4in;
    vertical-align: top;
  }
  .sign-label { font-weight: 700; font-size: 9pt; margin-bottom: 10px; }
  .sign-line { min-height: 18px; border-bottom: 1px solid #333; font-size: 10pt; }
  .sign-space { height: 1.15in; border-bottom: 1px solid #333; margin: 18px 0 10px; }
  .sign-date { font-size: 9pt; margin-top: 10px; }
  .doc-footer {
    position: absolute;
    left: 0.5in;
    right: 0.5in;
    bottom: 0.28in;
    display: grid;
    grid-template-columns: 1.8in 1fr 1.1in;
    font-size: 8pt;
    color: #222;
  }
  .foot-center { text-align: center; }
  .foot-right { text-align: right; white-space: nowrap; }
`;

/**
 * Build print-ready HTML for a checklist submission.
 * Pagination is explicit so Chromium lands on the same page breaks as the source:
 * page 1 = sections 1–2, page 2 = sections 3–5 + deficiencies, page 3 = signatures.
 *
 * Additional annexes register a builder in PRINT_BUILDERS keyed by print_template_key.
 */
export async function buildChecklistPrintHtml({ schema, submission, printTemplateKey }) {
  const key = printTemplateKey || submission.print_template_key;
  const builder = PRINT_BUILDERS[key];
  if (!builder) {
    throw new Error(`No print template registered for key "${key}"`);
  }
  return builder({ schema, submission });
}

async function buildAnnexDHtml({ schema, submission }) {
  const logos = await getBrandDataUris();
  const items = submission.items ?? {};
  const pages = schema.footer?.pages ?? [110, 111, 112];
  const sections = schema.sections ?? [];
  const page1Sections = sections.slice(0, 2);
  const page2Sections = sections.slice(2);

  const photos = [];
  for (const item of flattenItems(schema)) {
    const row = items[item.code];
    if (!row) continue;
    let src = null;
    if (row.photo_local_id) {
      const rec = await getPhotoRecord(row.photo_local_id);
      if (rec?.blob) src = await blobToDataUri(rec.blob);
    }
    if (!src && row.photo_url) {
      const resolved = await resolvePhotoUrl(row.photo_url);
      if (resolved) src = await urlToDataUri(resolved);
    }
    if (src) photos.push({ code: item.code, src });
  }

  const page = (pageIndex, body) => `
    <section class="page">
      ${runningHeader(schema, logos)}
      ${body}
      ${runningFooter(schema, pages[pageIndex] ?? pages[0] + pageIndex)}
    </section>`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${esc(schema.title)} — ${esc(schema.code)}</title>
  <style>${PRINT_CSS}</style>
</head>
<body>
  ${page(0, `
    <div class="annex-bar">${esc((schema.annexLabel ?? 'ANNEX D').toUpperCase())}</div>
    <div class="form-title">${esc(schema.title)}</div>
    <div class="form-number">Form: ${esc(schema.code)}</div>
    <div class="form-desc">${esc(schema.description ?? '')}</div>
    ${infoGrid(schema, submission)}
    ${page1Sections.map((section) => sectionTable(section, items, 0)).join('')}
  `)}
  ${page(1, `
    ${page2Sections.map((section) => sectionTable(section, items, 0)).join('')}
    <div class="def-box">
      <div class="def-label">${esc(schema.deficienciesField?.label ?? 'DEFICIENCIES FOUND:')}</div>
      <div class="def-body">${esc(submission.deficiencies_summary ?? '')}</div>
    </div>
    ${photoStrip(photos)}
  `)}
  ${page(2, signoffBlock(schema, submission))}
</body>
</html>`;

  return html;
}

function blobToDataUri(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export const PRINT_BUILDERS = {
  'annex-d-drainage': buildAnnexDHtml,
};
