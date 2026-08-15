import { FileText, RefreshCw } from 'lucide-react';

export default function PdfPreview({ url, loading, error, onRefresh }) {
  return (
    <section
      id="pdf-preview"
      className="scroll-mt-4 overflow-hidden rounded-md border border-navy/15 bg-white shadow-sm"
    >
      <div className="flex items-center justify-between border-b border-navy/10 bg-stripe px-4 py-3">
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
          className="inline-flex items-center gap-1.5 rounded-md border border-navy/20 bg-white px-3 py-1.5 text-xs font-semibold text-navy disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          {loading ? 'Rendering…' : 'Refresh preview'}
        </button>
      </div>
      {error && <p className="border-b border-alert bg-alert-soft px-4 py-2 text-sm text-alert">{error}</p>}
      {url ? (
        <iframe title="Checklist PDF preview" src={url} className="block h-[1100px] w-full bg-stripe" />
      ) : (
        <p className="px-4 py-10 text-center text-sm text-muted">
          Click <strong>Show preview</strong> to stamp current values onto the approved PDF and jump here.
        </p>
      )}
    </section>
  );
}
