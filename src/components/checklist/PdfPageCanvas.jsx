import { useEffect, useRef, useState } from 'react';

/**
 * Draws a PDF's pages to <canvas> with pdf.js.
 *
 * Our CSP (`object-src 'none'`, `frame-ancestors 'none'`) blocks the
 * browser's built-in PDF viewer inside the page, and Android browsers never
 * render a PDF in an iframe at all — so the preview is drawn here instead.
 * pdf.js and its worker load only when a preview is opened. The worker is
 * bundled by Vite and served from our own origin (script-src 'self').
 *
 * A Blob is read directly (no fetch of a blob: URL, which connect-src would
 * refuse); a string is fetched as a same-origin asset.
 */
export default function PdfPageCanvas({ source, className = '' }) {
  const hostRef = useRef(null);
  const [state, setState] = useState({ status: 'loading', error: null });

  useEffect(() => {
    let cancelled = false;
    let loadingTask = null;
    const host = hostRef.current;

    (async () => {
      try {
        setState({ status: 'loading', error: null });
        const [pdfjs, { default: workerUrl }] = await Promise.all([
          import('pdfjs-dist'),
          import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
        ]);
        pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

        const bytes =
          typeof source === 'string'
            ? await (await fetch(source, { credentials: 'same-origin' })).arrayBuffer()
            : await source.arrayBuffer();
        if (cancelled) return;
        loadingTask = pdfjs.getDocument({ data: new Uint8Array(bytes) });
        const doc = await loadingTask.promise;
        if (cancelled) return;

        host.replaceChildren();
        const width = host.clientWidth || 800;
        const ratio = window.devicePixelRatio || 1;
        for (let n = 1; n <= doc.numPages; n += 1) {
          const page = await doc.getPage(n);
          if (cancelled) return;
          const base = page.getViewport({ scale: 1 });
          const viewport = page.getViewport({ scale: (width / base.width) * ratio });
          const canvas = document.createElement('canvas');
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          canvas.style.width = '100%';
          canvas.style.height = 'auto';
          canvas.className = 'mb-3 block rounded border border-line/15 bg-white shadow-card';
          canvas.setAttribute('role', 'img');
          canvas.setAttribute('aria-label', `Page ${n} of ${doc.numPages}`);
          host.appendChild(canvas);
          await page.render({ canvas, canvasContext: canvas.getContext('2d'), viewport }).promise;
        }
        if (!cancelled) setState({ status: 'ready', error: null });
      } catch (err) {
        if (!cancelled) setState({ status: 'error', error: err?.message || 'Could not draw the preview.' });
      }
    })();

    // The loading task is what pdf.js tears down (it frees the worker and the
    // document, and cancels a load still in flight). PDFDocumentProxy has no
    // destroy() in the bundled pdf.js, so calling it threw during unmount —
    // pressing Back with a preview open took the whole page down to the error
    // screen. Cleanup must never throw, so it is guarded as well.
    return () => {
      cancelled = true;
      try {
        loadingTask?.destroy()?.catch?.(() => {});
      } catch {
        /* nothing left to free */
      }
    };
  }, [source]);

  return (
    <div className={className}>
      {state.status === 'loading' && <p className="px-4 py-6 text-center text-sm text-muted">Drawing preview…</p>}
      {state.status === 'error' && (
        <p className="border-b border-alert bg-alert-soft px-4 py-2 text-sm text-alert">{state.error}</p>
      )}
      <div ref={hostRef} className="p-3" />
    </div>
  );
}
