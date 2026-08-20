import { Check } from 'lucide-react';

const TONES = {
  cleared: 'border-success bg-success-soft text-success',
  pending: 'border-primary/40 bg-primary/10 text-navy',
  open: 'border-alert bg-alert-soft text-alert',
};

/**
 * Current state of the deficiency an item raised.
 *
 * Lives in its own file rather than beside the form: both the item row and the
 * form import it, and having the row reach back into ChecklistForm made the two
 * modules circular.
 */
export default function ResolutionChip({ resolution, className = '' }) {
  if (!resolution) return null;
  return (
    <span
      className={`inline-flex flex-wrap items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${
        TONES[resolution.tone] ?? TONES.open
      } ${className}`}
    >
      {resolution.tone === 'cleared' && <Check className="h-3 w-3 shrink-0" strokeWidth={3} />}
      {resolution.ref}
      <span className="font-normal">· {resolution.label}</span>
      {resolution.at && <span className="font-normal">· {String(resolution.at).slice(0, 10)}</span>}
    </span>
  );
}
