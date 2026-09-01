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
    <section className="rounded-md border border-line/15 bg-surface p-4 shadow-card">
      <h2 className="mb-3 text-sm font-semibold text-ink">{title}</h2>
      {children}
    </section>
  );
}

/**
 * A single radio-style choice, used where a full radio group would be noise.
 *
 * The visible ring stays a small 20px dot — this sits in a dense table cell,
 * and a 44px circle there would crowd its neighbors — but the button's own
 * hit area is the full 44px touch-target minimum, centered on that ring, so
 * tapping near it on a phone or tablet doesn't require the same precision a
 * mouse pointer has. This is the control that verifies or reopens an
 * incident; it doesn't get to be the one thing on the page that's fiddly to
 * tap.
 */
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
      className="group inline-flex h-11 w-11 items-center justify-center rounded-full transition hover:bg-surface-2"
    >
      <span
        className={`flex h-5 w-5 items-center justify-center rounded-full border-2 transition ${
          checked ? ring : 'border-line/25 group-hover:border-line/50'
        }`}
      >
        {checked && <span className={`h-2.5 w-2.5 rounded-full ${dot}`} />}
      </span>
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
    <div className="min-w-0 lg:min-w-[8rem] lg:border-l lg:border-line/10 lg:pl-6 lg:first:border-l-0 lg:first:pl-0">
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-0.5 text-sm ${strong ? 'font-semibold text-ink' : 'text-ink'}`}>{value || '—'}</p>
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
        className="min-h-10 w-full rounded border border-line/20 bg-surface px-2 text-sm text-ink"
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

/** Resolve a stored lookup value to its human label, falling back to the raw value. */
export function labelOf(list, value) {
  return list.find((row) => row.value === value)?.label || value || '—';
}
