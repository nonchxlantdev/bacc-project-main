import { useId } from 'react';

/**
 * Presentational primitives for the incident screen.
 *
 * These carry no logic — they exist so the page reads as a layout rather than
 * as a wall of Tailwind, and so the panels split out of it (the verification
 * panel, and whatever follows) keep the same look without copying classes.
 */

export function Card({ title, children }) {
  return (
    <section className="rounded-md border border-navy/15 bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-sm font-semibold text-navy">{title}</h2>
      {children}
    </section>
  );
}

/** A single radio-style choice, used where a full radio group would be noise. */
export function RadioButton({ checked, tone, label, onClick }) {
  const ring = tone === 'success' ? 'border-success' : 'border-alert';
  const dot = tone === 'success' ? 'bg-success' : 'bg-alert';
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={checked}
      aria-label={label}
      title={label}
      className={`inline-flex h-5 w-5 items-center justify-center rounded-full border-2 transition ${
        checked ? ring : 'border-navy/25 hover:border-navy/50'
      }`}
    >
      {checked && <span className={`h-2.5 w-2.5 rounded-full ${dot}`} />}
    </button>
  );
}

export function Row({ label, value }) {
  return (
    <div className="grid gap-0.5 py-2 text-sm sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className="break-words text-ink">{value || '—'}</dd>
    </div>
  );
}

export function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-muted">{label}</span>
      {children}
    </label>
  );
}

export function StripField({ label, value, sub, strong }) {
  return (
    <div className="min-w-0 lg:min-w-[8rem] lg:border-l lg:border-navy/10 lg:pl-6 lg:first:border-l-0 lg:first:pl-0">
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-0.5 text-sm ${strong ? 'font-semibold text-navy' : 'text-ink'}`}>{value || '—'}</p>
      {sub && <p className="text-xs text-muted">{sub}</p>}
    </div>
  );
}

export function Metric({ label, value }) {
  return (
    <div>
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-0.5 text-sm text-ink">{value}</p>
    </div>
  );
}

export function SelectField({ label, value, onChange, options }) {
  // The label was a bare <span>, which looks right and names nothing: the
  // select had no accessible name, so a screen reader announced the incident's
  // status and assignee controls as unlabelled combo boxes. A real <label> with
  // a generated id ties the two together without changing how it looks.
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs text-muted">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-10 w-full rounded border border-navy/20 px-2 text-sm"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function MenuItem({ onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="block w-full px-3 py-2 text-left text-sm text-navy hover:bg-stripe"
    >
      {children}
    </button>
  );
}

/** Resolve a stored lookup value to its human label, falling back to the raw value. */
export function labelOf(list, value) {
  return list.find((row) => row.value === value)?.label || value || '—';
}
