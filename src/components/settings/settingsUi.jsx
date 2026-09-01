import { Check } from 'lucide-react';

/**
 * The shared vocabulary of the settings page.
 *
 * One rule runs through all of it: **every control says what it affects.**
 * These settings change how the portal treats regulatory records — a target-day
 * count moves every incident countdown, a severity direction inverts urgency
 * everywhere. Nobody should have to guess the blast radius of a field they are
 * about to edit, so `effect` is a required part of the row, not a tooltip.
 */

/** A titled block of related settings. */
export function Panel({ title, description, children, footer }) {
  return (
    <section className="overflow-hidden rounded-lg border border-line/10 bg-surface shadow-card">
      <header className="border-b border-line/10 px-5 py-4">
        <h2 className="text-base font-bold text-ink">{title}</h2>
        {description && <p className="mt-1 max-w-2xl text-sm text-muted">{description}</p>}
      </header>
      <div className="space-y-5 px-5 py-5">{children}</div>
      {footer && <footer className="border-t border-line/10 bg-stripe px-5 py-3">{footer}</footer>}
    </section>
  );
}

/**
 * One setting: what it is, what it changes, and the control.
 *
 * Label and effect sit left, control right, stacking on phone. `effect` is
 * plain language about consequence — "moves the countdown on every open
 * Level 2 incident" — not a restatement of the label.
 */
export function Row({ label, effect, htmlFor, children, stacked }) {
  return (
    <div className={stacked ? 'space-y-2' : 'grid gap-2 sm:grid-cols-[minmax(0,1fr)_18rem] sm:items-start sm:gap-6'}>
      <div className="min-w-0">
        <label htmlFor={htmlFor} className="block text-sm font-semibold text-ink">
          {label}
        </label>
        {effect && <p className="mt-0.5 text-xs leading-relaxed text-muted">{effect}</p>}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function TextInput({ id, value, onChange, placeholder, type = 'text', ...rest }) {
  return (
    <input
      id={id}
      type={type}
      value={value ?? ''}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="min-h-11 w-full rounded border border-line/20 bg-surface px-3 text-sm text-ink focus:border-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:min-h-10"
      {...rest}
    />
  );
}

/**
 * A number that is allowed to be unset.
 *
 * "Not set" is a real answer here — BACC have not agreed response times, and an
 * input that coerces empty to 0 would quietly claim they had, turning "no rule"
 * into "due immediately".
 */
export function NumberInput({ id, value, onChange, min = 0, max, suffix, unsetLabel = 'Not set' }) {
  return (
    <div className="flex items-center gap-2">
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={value ?? ''}
        // No placeholder: the unset state is spelled out in full beside the
        // field, and a long placeholder just truncates inside a narrow input.
        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
        className="min-h-11 w-20 rounded border border-line/20 bg-surface px-3 text-sm text-ink focus:border-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:min-h-10"
      />
      {suffix && <span className="shrink-0 text-sm text-muted">{suffix}</span>}
      {value == null && <span className="shrink-0 text-xs text-muted">· {unsetLabel}</span>}
    </div>
  );
}

export function TextArea({ id, value, onChange, placeholder, rows = 2 }) {
  return (
    <textarea
      id={id}
      rows={rows}
      value={value ?? ''}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded border border-line/20 bg-surface px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    />
  );
}

/** An on/off setting. The label is the state, so it reads without the control. */
export function Toggle({ checked, onChange, label, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={Boolean(checked)}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="group inline-flex min-h-11 items-center gap-2.5 rounded text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50 sm:min-h-9"
    >
      <span
        className={`relative h-6 w-11 shrink-0 rounded-full transition ${
          checked ? 'bg-primary' : 'bg-line/20 group-hover:bg-line/30'
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-surface shadow transition-all ${
            checked ? 'left-[1.375rem]' : 'left-0.5'
          }`}
        />
      </span>
      {label && <span className={checked ? 'font-medium text-ink' : 'text-muted'}>{label}</span>}
    </button>
  );
}

/** A small set of mutually exclusive choices, laid out as cards. */
export function ChoiceCards({ value, onChange, options, name }) {
  return (
    <div className="grid gap-2">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <label
            key={option.value}
            className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 transition ${
              active ? 'border-primary bg-primary/5' : 'border-line/15 bg-surface hover:border-line/30'
            }`}
          >
            <input
              type="radio"
              name={name}
              className="sr-only"
              checked={active}
              onChange={() => onChange(option.value)}
            />
            <span
              className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                active ? 'border-primary bg-primary' : 'border-line/25 bg-surface'
              }`}
            >
              {active && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-ink">{option.label}</span>
              {option.hint && <span className="mt-0.5 block text-xs text-muted">{option.hint}</span>}
            </span>
          </label>
        );
      })}
    </div>
  );
}

/**
 * A list of short strings the user can extend.
 *
 * Used for lookups BACC own the vocabulary of — deficiency categories, incident
 * types. Deliberately free text: their words are more use than anything we
 * would invent for them.
 */
export function StringList({ values = [], onChange, placeholder, addLabel = 'Add' }) {
  return (
    <div className="space-y-2">
      {values.map((entry, i) => (
        <div key={i} className="flex gap-2">
          <input
            value={entry}
            placeholder={placeholder}
            onChange={(e) => onChange(values.map((v, j) => (j === i ? e.target.value : v)))}
            className="min-h-11 w-full rounded border border-line/20 bg-surface px-3 text-sm text-ink focus:border-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:min-h-10"
          />
          <button
            type="button"
            onClick={() => onChange(values.filter((_, j) => j !== i))}
            className="min-h-11 shrink-0 rounded border border-line/20 px-3 text-sm font-medium text-muted hover:border-alert hover:text-alert sm:min-h-10"
          >
            Remove
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...values, ''])}
        className="min-h-11 rounded border border-dashed border-line/30 px-3 text-sm font-medium text-primary hover:border-primary sm:min-h-10"
      >
        {addLabel}
      </button>
    </div>
  );
}

/**
 * What the portal does while a setting is unset.
 *
 * Not a warning — an explanation. A blank field is ambiguous on its own: it
 * could mean nobody has got to it, or that the portal is doing something
 * sensible in its absence. This says which.
 */
export function Note({ title, children }) {
  return (
    <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">
      {title && <strong className="font-semibold">{title} </strong>}
      {children}
    </p>
  );
}
