import { Plus, Trash2 } from 'lucide-react';
import SignaturePad from './SignaturePad.jsx';

/**
 * A log sheet's grid — one row per sighting, attendee or incursion.
 *
 * The approved forms print a fixed number of ruled rows: eleven on the Bird
 * Sightings sheet, thirteen on the Attendance List, eight on the Monthly
 * Incursion Log. Those rows are what the exporter stamps into.
 *
 * Rows beyond that are allowed on purpose. A bird count that found twenty
 * species is not a record of eleven, and an inspector who runs out of lines on
 * paper reaches for a second sheet — so the extras go onto a continuation page,
 * which is the same thing the paper form's own "attach additional pages"
 * convention does. The row number turns amber past the printed count so nobody
 * is surprised by where their data came out.
 *
 * Restacks into per-row cards below `md`, like the checklist item tables: a
 * seven-column grid is unusable on the phone somebody is actually holding while
 * counting birds at the end of a runway.
 */
export default function LogTable({ field, value, disabled, onChange }) {
  const columns = field.columns ?? [];
  const printed = field.printedRows ?? 0;
  const rows = Array.isArray(value) ? value : [];

  const setCell = (index, key, cell) =>
    onChange(rows.map((row, i) => (i === index ? { ...row, [key]: cell } : row)));

  const addRow = () =>
    onChange([...rows, Object.fromEntries(columns.map((c) => [c.key, '']))]);

  return (
    <div className="mt-3">
      <div className="overflow-x-auto">
        <table className="table-stack w-full min-w-full text-left text-sm">
          <thead className="bg-gradient-to-r from-navy to-navy-mid text-white">
            <tr>
              <th className="w-10 px-2 py-2 text-center">#</th>
              {columns.map((col) => (
                <th key={col.key} className="px-2 py-2 text-[11px] font-semibold">
                  {col.label}
                </th>
              ))}
              {!disabled && <th className="w-10 px-2 py-2"><span className="sr-only">Remove</span></th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const beyond = i >= printed;
              return (
                <tr key={i} className={i % 2 === 0 ? 'bg-stripe' : 'bg-surface'}>
                  <td
                    data-label="#"
                    className={`px-2 py-2 text-center text-xs font-semibold ${
                      beyond ? 'text-alert' : 'text-muted'
                    }`}
                    title={beyond ? 'Prints on a continuation page' : undefined}
                  >
                    {i + 1}
                  </td>
                  {columns.map((col) => (
                    <td key={col.key} data-label={col.label} className="px-2 py-1.5">
                      {col.type === 'signature' ? (
                        // An attendee signs their own row, drawn the same way
                        // every other signature in the portal is. A typed name
                        // in a column the form calls "Signature" is not one.
                        <SignaturePad
                          value={row?.[col.key] || ''}
                          disabled={disabled}
                          label={`${col.label}, row ${i + 1}`}
                          onChange={(uri) => setCell(i, col.key, uri)}
                        />
                      ) : (
                        <input
                          value={row?.[col.key] ?? ''}
                          disabled={disabled}
                          aria-label={`${col.label}, row ${i + 1}`}
                          onChange={(e) => setCell(i, col.key, e.target.value)}
                          className="min-h-10 w-full min-w-0 rounded border border-line/15 bg-surface px-2 text-sm text-ink desk:min-h-9"
                        />
                      )}
                    </td>
                  ))}
                  {!disabled && (
                    <td data-label="" className="px-2 py-1.5 text-center">
                      <button
                        type="button"
                        onClick={() => onChange(rows.filter((_, r) => r !== i))}
                        aria-label={`Remove row ${i + 1}`}
                        className="flex h-11 w-11 items-center justify-center rounded text-muted hover:bg-alert-soft hover:text-alert desk:h-9 desk:w-9"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {rows.length === 0 && (
        <p className="mt-2 text-sm text-muted">Nothing recorded yet.</p>
      )}

      {!disabled && (
        <button
          type="button"
          onClick={addRow}
          className="mt-2 inline-flex min-h-11 items-center gap-2 rounded border border-line/25 bg-surface px-3 text-xs font-semibold text-primary hover:border-primary desk:min-h-9"
        >
          <Plus className="h-3.5 w-3.5" />
          Add row
        </button>
      )}

      <p className="mt-2 text-xs text-muted">
        {rows.length > printed ? (
          <>
            The approved form prints {printed} rows. Rows {printed + 1}–{rows.length} come out on a
            continuation page after it.
          </>
        ) : (
          <>The approved form prints {printed} rows. You can add more — they print on a continuation page.</>
        )}
      </p>
    </div>
  );
}
