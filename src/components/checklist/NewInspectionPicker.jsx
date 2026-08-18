import { useMemo, useState } from 'react';
import { ClipboardCheck, Search, X } from 'lucide-react';
import { FAMILY_LABELS, FREQUENCY_LABELS } from '../../data/templates/registry.js';

/**
 * Pick a form to start. With 31 approved forms a single "New inspection" button
 * is meaningless, and an unfiltered list of 31 is worse — the list passed in is
 * already limited to what this user's role and department may open (BACC §4).
 */
export default function NewInspectionPicker({ templates, onPick, onClose, busyKey }) {
  const [query, setQuery] = useState('');

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = templates.filter((t) => {
      if (!q) return true;
      return [t.code, t.title, t.annex_label, t.department, t.document_family]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
    const byFamily = new Map();
    for (const t of matches) {
      const fam = t.document_family || 'Other';
      if (!byFamily.has(fam)) byFamily.set(fam, []);
      byFamily.get(fam).push(t);
    }
    return [...byFamily.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [templates, query]);

  const total = grouped.reduce((n, [, list]) => n + list.length, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-navy/40 sm:items-start sm:p-8">
      <div className="flex max-h-[92dvh] w-full max-w-2xl flex-col rounded-t-xl bg-white shadow-xl sm:max-h-[85dvh] sm:rounded-lg">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-navy/10 px-4 py-4 sm:px-5">
          <div>
            <h2 className="text-lg font-bold text-navy">New Inspection</h2>
            <p className="mt-0.5 text-sm text-muted">
              Forms you are assigned to complete. {total} available.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded p-1 text-muted hover:bg-stripe hover:text-navy"
          >
            <X size={18} aria-hidden />
          </button>
        </div>

        <div className="border-b border-navy/10 px-5 py-3">
          <div className="relative">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
            <input
              type="search"
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by form number, title or department…"
              className="min-h-10 w-full rounded border border-navy/20 pl-9 pr-3 text-sm"
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-5">
          {total === 0 && (
            <p className="py-8 text-center text-sm text-muted">
              {templates.length === 0
                ? 'No forms are assigned to your role yet.'
                : 'No forms match that search.'}
            </p>
          )}

          {grouped.map(([family, list]) => (
            <section key={family} className="mb-4 last:mb-0">
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
                {FAMILY_LABELS[family] ?? family}
              </h3>
              <ul className="space-y-1.5">
                {list.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      disabled={Boolean(busyKey)}
                      onClick={() => onPick(t)}
                      className="flex w-full items-start gap-3 rounded-md border border-navy/15 px-3 py-2.5 text-left hover:border-primary hover:bg-stripe disabled:opacity-60"
                    >
                      <ClipboardCheck size={16} className="mt-0.5 shrink-0 text-primary" aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-navy">
                          {t.annex_label ? `${t.annex_label} — ` : ''}
                          {t.title}
                        </span>
                        <span className="mt-0.5 block text-xs text-muted">
                          {t.code}
                          {t.department ? ` · ${t.department}` : ''}
                          {t.default_frequency ? ` · ${FREQUENCY_LABELS[t.default_frequency] ?? t.default_frequency}` : ''}
                        </span>
                      </span>
                      {busyKey === t.id && <span className="text-xs text-muted">Opening…</span>}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
