import { useRef } from 'react';
import { Paperclip, Trash2 } from 'lucide-react';

/**
 * Attach a drawing to one section of a form.
 *
 * Sits inside the section that asks for it, because that is where the approved
 * form asks. Annex K prints "Attach drawing." in the hint for sections C, D, E
 * and F, so those four sections carry this control and the others do not —
 * the flag is read from that wording rather than chosen by us.
 *
 * ── Why attached, never stamped ──────────────────────────────────────────────
 * None of Annex K's six pages has a drawing area, and §14 forbids changing an
 * approved form's layout for convenience. So each drawing is appended to the
 * export as a captioned continuation page naming its section. The approved
 * sheets come out of the exporter exactly as they went in.
 *
 * Images are held as data URIs on the submission, which keeps a drawing with
 * the record it belongs to and keeps it working offline.
 */
export default function DrawingAttach({ sectionKey, sectionLabel, items = [], disabled, onChange }) {
  const inputRef = useRef(null);

  async function addFiles(files) {
    const added = [];
    for (const file of files) {
      added.push({
        id: crypto.randomUUID(),
        // The file name is the caption someone already recognises, so it beats
        // "Drawing 1" as a starting point.
        label: file.name.replace(/\.[^.]+$/, ''),
        contentType: file.type || 'image/png',
        dataUri: await readAsDataUri(file),
        addedAt: new Date().toISOString(),
      });
    }
    if (added.length) onChange([...items, ...added]);
  }

  return (
    <div className="mt-3 rounded-md border border-dashed border-line/25 bg-stripe/60 p-3">
      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
        <Paperclip className="h-3.5 w-3.5 text-primary" aria-hidden />
        Drawing
        {items.length > 0 && <span className="font-normal normal-case tracking-normal text-muted">· {items.length}</span>}
      </p>

      {items.length > 0 && (
        <ul className="mt-2 grid gap-2 sm:grid-cols-2">
          {items.map((item) => (
            <li key={item.id} className="overflow-hidden rounded border border-line/15 bg-surface">
              <img src={item.dataUri} alt={item.label} className="h-32 w-full bg-stripe object-contain" />
              <div className="flex items-center gap-1.5 border-t border-line/10 p-1.5">
                <input
                  value={item.label}
                  disabled={disabled}
                  aria-label={`Caption for drawing in ${sectionLabel}`}
                  placeholder="Caption"
                  onChange={(e) =>
                    onChange(items.map((row) => (row.id === item.id ? { ...row, label: e.target.value } : row)))
                  }
                  className="min-h-9 min-w-0 flex-1 rounded border border-line/15 bg-surface px-2 text-xs text-ink"
                />
                {!disabled && (
                  <button
                    type="button"
                    onClick={() => onChange(items.filter((row) => row.id !== item.id))}
                    aria-label={`Remove ${item.label}`}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded text-muted hover:bg-alert-soft hover:text-alert"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {!disabled && (
        <>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="mt-2 inline-flex min-h-11 items-center gap-2 rounded border border-line/25 bg-surface px-3 text-xs font-semibold text-primary hover:border-primary sm:min-h-9"
          >
            <Paperclip className="h-3.5 w-3.5" />
            {items.length ? 'Attach another drawing' : 'Attach drawing'}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            aria-label={`Attach a drawing to ${sectionLabel}`}
            data-section={sectionKey}
            className="hidden"
            onChange={(e) => {
              addFiles([...(e.target.files ?? [])]);
              e.target.value = '';
            }}
          />
        </>
      )}

      {items.length === 0 && disabled && <p className="mt-1 text-xs text-muted">No drawing attached.</p>}
    </div>
  );
}

function readAsDataUri(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
