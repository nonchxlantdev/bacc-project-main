import { useRef } from 'react';
import { FileImage, Trash2, Upload } from 'lucide-react';

/**
 * Drawings and site plans attached to a form.
 *
 * ── Why these are attached rather than stamped ───────────────────────────────
 * Annex K asks for demarcation layouts, phasing drawings and temporary marking
 * plans, but its six approved pages have no drawing area anywhere on them, and
 * §14 forbids changing an approved form's layout for convenience. So a drawing
 * is appended to the export as a captioned continuation page. The approved
 * sheets come out of the exporter exactly as they went in.
 *
 * Images are held as data URIs on the submission. That keeps a drawing with the
 * record it belongs to, and keeps it working offline — an inspector on the
 * apron can attach a plan with no signal and it survives to the export.
 */
export default function AttachmentsPanel({ spec, attachments = [], disabled, onChange }) {
  const inputRef = useRef(null);
  const atLimit = spec.max != null && attachments.length >= spec.max;

  async function addFiles(files) {
    const room = spec.max == null ? files.length : spec.max - attachments.length;
    const accepted = [...files].slice(0, Math.max(0, room));
    const added = [];
    for (const file of accepted) {
      added.push({
        id: crypto.randomUUID(),
        // The file name is the most useful caption available and the one the
        // person already recognises, so it is the default rather than "Image 1".
        label: file.name.replace(/\.[^.]+$/, ''),
        contentType: file.type || 'image/png',
        dataUri: await readAsDataUri(file),
        addedAt: new Date().toISOString(),
      });
    }
    if (added.length) onChange([...attachments, ...added]);
  }

  return (
    <section className="rounded-lg border border-line/12 bg-surface shadow-card">
      <header className="border-b border-line/10 px-4 py-3">
        <h2 className="flex items-center gap-2 text-sm font-bold text-ink">
          <FileImage className="h-4 w-4 text-primary" aria-hidden />
          {spec.label}
          {attachments.length > 0 && (
            <span className="font-normal text-muted">
              · {attachments.length}
              {spec.max ? ` of ${spec.max}` : ''}
            </span>
          )}
        </h2>
        {spec.hint && <p className="mt-1 text-xs leading-relaxed text-muted">{spec.hint}</p>}
      </header>

      <div className="space-y-3 p-4">
        {attachments.length === 0 && (
          <p className="text-sm text-muted">No drawings attached yet.</p>
        )}

        {attachments.length > 0 && (
          <ul className="grid gap-3 sm:grid-cols-2">
            {attachments.map((item) => (
              <li key={item.id} className="overflow-hidden rounded-md border border-line/15">
                <img
                  src={item.dataUri}
                  alt={item.label}
                  className="h-40 w-full bg-stripe object-contain"
                />
                <div className="flex items-center gap-2 border-t border-line/10 p-2">
                  <input
                    value={item.label}
                    disabled={disabled}
                    aria-label="Drawing caption"
                    placeholder="Caption"
                    onChange={(e) =>
                      onChange(
                        attachments.map((row) =>
                          row.id === item.id ? { ...row, label: e.target.value } : row,
                        ),
                      )
                    }
                    className="min-h-10 min-w-0 flex-1 rounded border border-line/15 bg-surface px-2 text-[13px] text-ink desk:min-h-9"
                  />
                  {!disabled && (
                    <button
                      type="button"
                      onClick={() => onChange(attachments.filter((row) => row.id !== item.id))}
                      aria-label={`Remove ${item.label}`}
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded text-muted hover:bg-alert-soft hover:text-alert desk:h-9 desk:w-9"
                    >
                      <Trash2 className="h-4 w-4" />
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
              disabled={atLimit}
              onClick={() => inputRef.current?.click()}
              className="inline-flex min-h-11 items-center gap-2 rounded-md border border-dashed border-line/30 px-4 text-sm font-medium text-primary hover:border-primary disabled:opacity-50 desk:min-h-10"
            >
              <Upload className="h-4 w-4" />
              {atLimit ? `Limit of ${spec.max} reached` : 'Attach drawing'}
            </button>
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                addFiles(e.target.files ?? []);
                e.target.value = '';
              }}
            />
          </>
        )}
      </div>
    </section>
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
