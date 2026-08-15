import { useEffect, useMemo, useRef, useState } from 'react';
import * as pdfjs from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import annexD from '../../data/checklists/annex-d-drainage.json';
import annexDMap from '../../data/field-maps/annex-d-drainage-ed01.json';
import annexGMap from '../../data/field-maps/annex-g-noc-register-ed01.json';
import annexHMap from '../../data/field-maps/annex-h-work-order-ed01.json';
import annexDPdf from '../../assets/forms/annex-d-drainage-ed01.pdf?url';
import annexGPdf from '../../assets/forms/annex-g-noc-register-ed01.pdf?url';
import annexHPdf from '../../assets/forms/annex-h-work-order-ed01.pdf?url';
import { tokens } from '../../lib/tokens.js';

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;

const TYPES = ['text', 'mark', 'image'];

const FORMS = {
  'annex-d': {
    label: 'Annex D · Drainage (fixed)',
    mode: 'fixed',
    pdf: annexDPdf,
    map: annexDMap,
    keys: suggestedKeys(annexD),
  },
  'annex-g': {
    label: 'Annex G · NOC register',
    mode: 'register',
    pdf: annexGPdf,
    map: annexGMap,
    keys: Object.keys(annexGMap.table.columns),
  },
  'annex-h': {
    label: 'Annex H · Work order (fixed)',
    mode: 'fixed',
    pdf: annexHPdf,
    map: annexHMap,
    keys: Object.keys(annexHMap.fields),
  },
};

const SAMPLE_REGISTER_ROWS = [
  {
    noc_no: '0047',
    date: '2026-08-15',
    source_inspection: 'Monthly',
    level: '2',
    description: 'Debris at runway 07 swale',
    assigned_to: 'CEC',
    target_date: '2026-08-22',
    closed_date_notes: '',
  },
  {
    noc_no: '0048',
    date: '2026-08-16',
    source_inspection: 'Post-storm',
    level: '3',
    description: 'Blocked culvert — west edge',
    assigned_to: 'Maintenance',
    target_date: '2026-08-20',
    closed_date_notes: '',
  },
  {
    noc_no: '0049',
    date: '2026-08-16',
    source_inspection: 'Semi-annual',
    level: '1',
    description: 'Standing water near TWY B',
    assigned_to: 'EEC',
    target_date: '2026-08-30',
    closed_date_notes: '2026-08-18 / SAT re-insp',
  },
];

/**
 * Dev-only coordinate mapper.
 * Click the rendered page to place a field. Coordinates are stored as PDF points
 * with a BOTTOM-LEFT origin (pdf-lib). Conversion:
 *   pdfX = (clickX / canvasWidth) * pageWidth
 *   pdfY = pageHeight - (clickY / canvasHeight) * pageHeight
 *
 * Register mode: place the first row band, column x/width, row height, and
 * rows per page, then preview with sample rows.
 */
export default function FieldMapperPage() {
  const canvasRef = useRef(null);
  const [formKey, setFormKey] = useState('annex-d');
  const form = FORMS[formKey];
  const [pdf, setPdf] = useState(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageCount, setPageCount] = useState(0);
  const [pageSize, setPageSize] = useState({ width: 612, height: 792 });
  const [fields, setFields] = useState(annexDMap.fields ?? {});
  const [table, setTable] = useState(annexGMap.table);
  const [selectedKey, setSelectedKey] = useState('');
  const [draftKey, setDraftKey] = useState('inspection_date');
  const [draftType, setDraftType] = useState('text');
  const [placeMode, setPlaceMode] = useState('firstRow');
  const [preview, setPreview] = useState(true);
  const [status, setStatus] = useState('Load a base PDF, then click to place fields.');

  const keys = useMemo(() => form.keys, [form]);
  const isRegister = form.mode === 'register';

  useEffect(() => {
    let cancelled = false;
    setPdf(null);
    setPageIndex(0);
    setFields(form.map.fields ?? {});
    setTable(form.map.table ?? annexGMap.table);
    setDraftKey(form.keys[0] ?? '');
    setSelectedKey('');
    (async () => {
      const doc = await pdfjs.getDocument(form.pdf).promise;
      if (cancelled) return;
      setPdf(doc);
      setPageCount(doc.numPages);
      setStatus(`${form.label} loaded. Origin is bottom-left PDF points.`);
    })();
    return () => {
      cancelled = true;
    };
  }, [formKey]);

  useEffect(() => {
    if (!pdf) return;
    let cancelled = false;
    (async () => {
      const page = await pdf.getPage(pageIndex + 1);
      const viewport = page.getViewport({ scale: 1.35 });
      const canvas = canvasRef.current;
      if (!canvas || cancelled) return;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d');
      await page.render({ canvasContext: ctx, viewport }).promise;
      const pageWidth = page.view[2] - page.view[0];
      const pageHeight = page.view[3] - page.view[1];
      setPageSize({ width: pageWidth, height: pageHeight });
      if (!preview) return;
      if (isRegister) drawRegisterOverlay(ctx, table, viewport, pageWidth, pageHeight);
      else drawOverlay(ctx, fields, pageIndex, viewport, pageWidth, pageHeight);
    })();
    return () => {
      cancelled = true;
    };
  }, [pdf, pageIndex, fields, table, preview, isRegister]);

  function clickToPdf(event) {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const clickX = ((event.clientX - rect.left) / rect.width) * canvas.width;
    const clickY = ((event.clientY - rect.top) / rect.height) * canvas.height;
    const scaleX = canvas.width / pageSize.width;
    const scaleY = canvas.height / pageSize.height;
    const pdfX = Math.round((clickX / scaleX) * 10) / 10;
    const pdfY = Math.round((pageSize.height - clickY / scaleY) * 10) / 10;
    return { pdfX, pdfY };
  }

  function onCanvasClick(event) {
    const { pdfX, pdfY } = clickToPdf(event);
    if (isRegister) {
      onRegisterClick(event, pdfX, pdfY);
      return;
    }
    const key = draftKey || `field_${Date.now()}`;
    setFields((prev) => ({
      ...prev,
      [key]: {
        ...(prev[key] ?? {}),
        page: pageIndex,
        x: pdfX,
        y: pdfY,
        type: draftType,
        size: prev[key]?.size ?? 9,
        width: prev[key]?.width ?? (draftType === 'mark' ? undefined : 120),
        height: prev[key]?.height ?? (draftType === 'image' ? 34 : 18),
        wrap: draftType === 'text' ? true : undefined,
        maxLines: draftType === 'text' ? 2 : undefined,
        overflow: draftType === 'text' ? 'continuation' : undefined,
      },
    }));
    setSelectedKey(key);
    setStatus(`${key} → page ${pageIndex}  x=${pdfX}  y=${pdfY}  (bottom-left PDF points)`);
  }

  function onRegisterClick(event, pdfX, pdfY) {
    if (placeMode === 'firstRow') {
      setTable((prev) => ({ ...prev, firstRowY: pdfY, page: pageIndex }));
      setStatus(`firstRowY = ${pdfY} (baseline of row 1, bottom-left)`);
      return;
    }
    if (placeMode === 'rowHeight') {
      const height = Math.max(8, Math.round((table.firstRowY - pdfY) * 10) / 10);
      setTable((prev) => ({ ...prev, rowHeight: height }));
      setStatus(`rowHeight = ${height}`);
      return;
    }
    const key = draftKey || 'noc_no';
    setTable((prev) => {
      const current = prev.columns?.[key] ?? { width: 40 };
      const nextCol = event.shiftKey
        ? { ...current, width: Math.max(8, Math.round((pdfX - (current.x ?? pdfX)) * 10) / 10) }
        : { ...current, x: pdfX };
      return { ...prev, columns: { ...prev.columns, [key]: nextCol } };
    });
    setSelectedKey(key);
    setStatus(
      event.shiftKey
        ? `${key} width from x=${table.columns?.[key]?.x} to ${pdfX}`
        : `${key} x=${pdfX}  (Shift+click the right edge to set width)`,
    );
  }

  function exportJson() {
    const map = isRegister
      ? {
          templateKey: form.map.templateKey,
          templateVersion: form.map.templateVersion,
          basePdf: form.map.basePdf,
          mode: 'register',
          origin: 'pdf-points-bottom-left',
          originNote:
            'Coordinates are PDF points with a bottom-left origin (pdf-lib). Register rows step down by rowHeight from firstRowY. overflow: repeat-base-page copies the approved blank page — never synthesise a continuation sheet.',
          pageSize,
          table: {
            ...table,
            overflow: 'repeat-base-page',
          },
        }
      : {
          templateKey: form.map.templateKey,
          templateVersion: form.map.templateVersion,
          basePdf: form.map.basePdf,
          origin: 'pdf-points-bottom-left',
          originNote:
            'Coordinates are PDF points with a bottom-left origin (pdf-lib). pdfY = pageHeight - (clickY / canvasHeight) * pageHeight.',
          pageSize,
          fields,
        };
    const blob = new Blob([JSON.stringify(map, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = form.map.basePdf.replace(/\.pdf$/, '.json');
    a.click();
    URL.revokeObjectURL(url);
  }

  const selected = isRegister
    ? selectedKey
      ? table.columns?.[selectedKey]
      : null
    : selectedKey
      ? fields[selectedKey]
      : null;

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-teal">Dev only</p>
        <h1 className="text-2xl font-bold text-navy">Field mapper</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted">
          Origin is <strong>bottom-left PDF points</strong>, matching pdf-lib. Do not use CSS/top-left
          pixels in exported maps. This route is omitted from production builds. Register mode places
          the first row band and columns; overflow is always <code>repeat-base-page</code>.
        </p>
        <p className="mt-1 text-sm text-navy">{status}</p>
      </div>
      <div className="flex flex-wrap items-end gap-3 rounded-md border border-navy/10 bg-white p-3">
        <label className="text-sm">
          Form
          <select
            value={formKey}
            onChange={(e) => setFormKey(e.target.value)}
            className="ml-2 rounded border border-navy/20 px-2 py-1"
          >
            {Object.entries(FORMS).map(([key, spec]) => (
              <option key={key} value={key}>
                {spec.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          {isRegister ? 'Column key' : 'Field key'}
          <input
            list="field-keys"
            value={draftKey}
            onChange={(e) => setDraftKey(e.target.value)}
            className="ml-2 rounded border border-navy/20 px-2 py-1"
          />
          <datalist id="field-keys">
            {keys.map((k) => (
              <option key={k} value={k} />
            ))}
          </datalist>
        </label>
        {!isRegister && (
          <label className="text-sm">
            Type
            <select
              value={draftType}
              onChange={(e) => setDraftType(e.target.value)}
              className="ml-2 rounded border border-navy/20 px-2 py-1"
            >
              {TYPES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
        )}
        {isRegister && (
          <label className="text-sm">
            Place
            <select
              value={placeMode}
              onChange={(e) => setPlaceMode(e.target.value)}
              className="ml-2 rounded border border-navy/20 px-2 py-1"
            >
              <option value="firstRow">First row baseline</option>
              <option value="column">Column x (Shift+click = width)</option>
              <option value="rowHeight">Row height (click next baseline)</option>
            </select>
          </label>
        )}
        <button type="button" className="rounded bg-navy px-3 py-1 text-sm text-white" onClick={() => setPageIndex((i) => Math.max(0, i - 1))}>
          Prev page
        </button>
        <span className="text-sm">
          Page {pageIndex + 1} / {pageCount || '—'}
        </span>
        <button
          type="button"
          className="rounded bg-navy px-3 py-1 text-sm text-white"
          onClick={() => setPageIndex((i) => Math.min(pageCount - 1, i + 1))}
        >
          Next page
        </button>
        <label className="text-sm">
          <input type="checkbox" checked={preview} onChange={(e) => setPreview(e.target.checked)} /> Preview
        </label>
        <button type="button" className="rounded bg-primary px-3 py-1 text-sm text-white" onClick={exportJson}>
          Export field-map JSON
        </button>
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="overflow-auto rounded border border-navy/15 bg-stripe p-2">
          <canvas ref={canvasRef} onClick={onCanvasClick} className="cursor-crosshair bg-white shadow" />
        </div>
        <aside className="space-y-2 text-sm">
          {isRegister && (
            <div className="rounded border border-navy/15 bg-white p-3">
              <p className="font-semibold text-navy">Register table</p>
              {['firstRowY', 'rowHeight', 'rowsPerPage', 'size'].map((prop) => (
                <label key={prop} className="mt-1 block">
                  {prop}
                  <input
                    type="number"
                    className="ml-2 w-20 rounded border px-1"
                    value={table[prop] ?? ''}
                    onChange={(e) => setTable((prev) => ({ ...prev, [prop]: Number(e.target.value) }))}
                  />
                </label>
              ))}
              <p className="mt-2 text-xs text-muted">overflow: repeat-base-page</p>
            </div>
          )}
          {selected && (
            <div className="rounded border border-navy/15 bg-white p-3">
              <p className="font-semibold text-navy">{selectedKey}</p>
              {isRegister ? (
                <>
                  <p>
                    x {selected.x} · width {selected.width}
                  </p>
                  {['x', 'width', 'size', 'maxLines'].map((prop) => (
                    <label key={prop} className="mt-1 block">
                      {prop}
                      <input
                        type="number"
                        className="ml-2 w-20 rounded border px-1"
                        value={selected[prop] ?? ''}
                        onChange={(e) =>
                          setTable((prev) => ({
                            ...prev,
                            columns: {
                              ...prev.columns,
                              [selectedKey]: { ...prev.columns[selectedKey], [prop]: Number(e.target.value) },
                            },
                          }))
                        }
                      />
                    </label>
                  ))}
                </>
              ) : (
                <>
                  <p>
                    page {selected.page} · x {selected.x} · y {selected.y}
                  </p>
                  {['width', 'height', 'size', 'maxLines'].map((prop) => (
                    <label key={prop} className="mt-1 block">
                      {prop}
                      <input
                        type="number"
                        className="ml-2 w-20 rounded border px-1"
                        value={selected[prop] ?? ''}
                        onChange={(e) =>
                          setFields((prev) => ({
                            ...prev,
                            [selectedKey]: { ...prev[selectedKey], [prop]: Number(e.target.value) },
                          }))
                        }
                      />
                    </label>
                  ))}
                  <button
                    type="button"
                    className="mt-2 text-alert"
                    onClick={() => {
                      setFields((prev) => {
                        const next = { ...prev };
                        delete next[selectedKey];
                        return next;
                      });
                    }}
                  >
                    Delete field
                  </button>
                </>
              )}
            </div>
          )}
          <ul className="max-h-[28rem] overflow-auto rounded border border-navy/10 bg-white p-2 text-xs">
            {(isRegister ? Object.keys(table.columns ?? {}) : Object.keys(fields))
              .sort()
              .map((key) => (
                <li key={key}>
                  <button
                    type="button"
                    className="text-primary hover:underline"
                    onClick={() => {
                      setSelectedKey(key);
                      setDraftKey(key);
                    }}
                  >
                    {key}
                  </button>
                </li>
              ))}
          </ul>
        </aside>
      </div>
    </div>
  );
}

function drawOverlay(ctx, fields, pageIndex, viewport, pageWidth, pageHeight) {
  ctx.save();
  const sx = viewport.width / pageWidth;
  const sy = viewport.height / pageHeight;
  ctx.strokeStyle = tokens.primary;
  ctx.font = '10px sans-serif';
  for (const [key, field] of Object.entries(fields)) {
    if (field.page !== pageIndex) continue;
    const x = field.x * sx;
    const y = (pageHeight - field.y) * sy;
    const w = (field.width ?? 12) * sx;
    const h = (field.height ?? 12) * sy;
    ctx.fillStyle = 'rgba(47,191,160,0.35)';
    ctx.fillRect(x, y - h, w, h);
    ctx.strokeRect(x, y - h, w, h);
    ctx.fillStyle = tokens.navy;
    ctx.fillText(key, x, Math.max(10, y - h - 2));
    if (field.type === 'mark') {
      ctx.fillStyle = tokens.alert;
      ctx.fillText('X', x, y);
    }
  }
  ctx.restore();
}

function drawRegisterOverlay(ctx, table, viewport, pageWidth, pageHeight) {
  ctx.save();
  const sx = viewport.width / pageWidth;
  const sy = viewport.height / pageHeight;
  const rows = Math.min(table.rowsPerPage ?? 18, SAMPLE_REGISTER_ROWS.length + 2);
  ctx.font = '9px sans-serif';
  for (let i = 0; i < rows; i += 1) {
    const yPdf = table.firstRowY - i * table.rowHeight;
    const y = (pageHeight - yPdf) * sy;
    const h = table.rowHeight * sy;
    ctx.fillStyle = i % 2 === 0 ? 'rgba(47,191,160,0.18)' : 'rgba(11,30,61,0.08)';
    ctx.fillRect(0, y - h + 4, viewport.width, h);
    const sample = SAMPLE_REGISTER_ROWS[i];
    for (const [key, col] of Object.entries(table.columns ?? {})) {
      const x = col.x * sx;
      const w = (col.width ?? 40) * sx;
      ctx.strokeStyle = tokens.primary;
      ctx.strokeRect(x, y - h + 4, w, h - 2);
      ctx.fillStyle = tokens.navy;
      if (i === 0) ctx.fillText(key, x, Math.max(10, y - h));
      if (sample?.[key]) ctx.fillText(String(sample[key]).slice(0, 18), x + 2, y - 4);
    }
  }
  ctx.restore();
}

function suggestedKeys(schema) {
  const keys = [
    'inspection_date',
    'inspection_type.monthly_routine',
    'inspection_type.semi_annual_cec',
    'inspection_type.post_storm_emergency',
    'conducted_by',
    'rainfall_mm',
    'deficiencies_summary',
    'inspector_signature',
    'inspector_name',
    'inspector_date',
    'om_signature',
    'om_name',
    'om_date',
  ];
  for (const section of schema.sections ?? []) {
    for (const item of section.items ?? []) {
      keys.push(`${item.code}.sat`, `${item.code}.no_sat`, `${item.code}.remarks`);
    }
  }
  return keys;
}
