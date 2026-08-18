import { FileText, RefreshCw } from 'lucide-react';

export default function PdfPreview({ url, loading, error, onRefresh }) {
  return (
    <section
      id="pdf-preview"
      className="scroll-mt-4 overflow-hidden rounded-md border border-navy/15 bg-white shadow-sm"
    >
      <div className="flex flex-col gap-2 border-b border-navy/10 bg-stripe px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-navy" />
          <div>
            <h2 className="text-sm font-semibold text-navy">Approved-format PDF preview</h2>
            <p className="text-xs text-muted">
              Overlay onto the controlled base form — not an HTML print.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-md border border-navy/20 bg-white px-3 py-1.5 text-xs font-semibold text-navy disabled:opacity-50 sm:min-h-9"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          {loading ? 'Rendering…' : 'Refresh preview'}
        </button>
      </div>
      {error && <p className="border-b border-alert bg-alert-soft px-4 py-2 text-sm text-alert">{error}</p>}
      {/* A full US-Letter page is ~1100px tall. On a phone that is a scroll trap
          inside a scroll, so the frame gets a viewport-relative height there and
          the full page height only once the screen can hold it. */}
      {url ? (
        <iframe
          title="Checklist PDF preview"
          src={url}
          className="block h-[70dvh] min-h-[380px] w-full bg-stripe lg:h-[1100px]"
        />
      ) : (
        <p className="px-4 py-10 text-center text-sm text-muted">
          Click <strong>Show preview</strong> to stamp current values onto the approved PDF and jump here.
        </p>
      )}
    </section>
  );
}
