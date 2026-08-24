import { Camera, Check } from 'lucide-react';
import { CHECKLIST_GRID } from './checklistGrid.js';

/**
 * One inspection item.
 *
 * Desktop keeps the approved form's five-column table. Below `md` the same
 * markup restacks into a card — code and wording on top, SAT / NO SAT as two
 * full-width targets, remarks and camera underneath. The `md:contents`
 * wrappers exist only to group children on the phone; at `md` they dissolve
 * and their children become direct grid cells again, so there is one set of
 * markup and one source of truth for the desktop layout.
 */
export default function ChecklistItemRow({
  item,
  row,
  selected,
  striped,
  disabled,
  remarksError,
  hasPhoto,
  onSelect,
  onChange,
  onPhotoClick,
}) {
  const result = row?.result ?? null;
  const noSat = result === 'no_sat';

  return (
    <div
      className={`${CHECKLIST_GRID} flex flex-col border-b border-navy/10 md:min-h-12 md:items-stretch ${
        noSat ? 'border-l-4 border-l-alert bg-alert-soft' : selected ? 'bg-primary/5' : striped ? 'bg-stripe' : 'bg-white'
      }`}
    >
      <div className="flex items-baseline gap-2 pt-2 md:contents">
        <button
          type="button"
          onClick={() => onSelect(item.code)}
          className="shrink-0 pl-3 text-left text-[13px] font-bold text-navy md:px-3 md:py-2.5 md:pl-3"
        >
          {item.code}
        </button>

        <button
          type="button"
          onClick={() => onSelect(item.code)}
          className="min-w-0 flex-1 pr-3 text-left text-[13px] leading-snug text-ink md:px-3 md:py-2.5 md:pr-3"
        >
          {item.text}
        </button>
      </div>

      <div className="flex gap-2 px-3 pt-2.5 md:contents">
        <ResultToggle
          itemCode={item.code}
          label="SAT"
          checked={result === 'sat'}
          disabled={disabled}
          onChange={() => onChange({ result: 'sat' })}
          tone="sat"
        />
        <ResultToggle
          itemCode={item.code}
          label="NO SAT"
          checked={noSat}
          disabled={disabled}
          onChange={() => {
            onChange({ result: 'no_sat' });
            onSelect(item.code);
          }}
          tone="no_sat"
        />
      </div>

      <div className="flex items-center gap-1 px-3 pb-2.5 pt-2 md:border-l md:border-navy/10 md:p-1.5">
        <input
          value={row?.remarks ?? ''}
          disabled={disabled}
          placeholder={noSat ? 'Required for NO SAT' : 'Remarks / location'}
          onChange={(e) => onChange({ remarks: e.target.value })}
          onFocus={() => onSelect(item.code)}
          className={`min-h-11 min-w-0 flex-1 rounded border px-2 py-1 text-[13px] md:min-h-9 ${
            remarksError ? 'border-alert bg-white' : 'border-navy/15 bg-white'
          }`}
        />
        <button
          type="button"
          onClick={() => {
            onSelect(item.code);
            onPhotoClick?.(item.code);
          }}
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded md:h-8 md:w-8 ${
            hasPhoto ? 'text-primary' : 'text-muted hover:text-navy'
          }`}
          aria-label={`Photo for ${item.code}`}
        >
          <Camera className="h-5 w-5 md:h-4 md:w-4" />
        </button>
      </div>
    </div>
  );
}

function ResultToggle({ itemCode, label, checked, disabled, onChange, tone }) {
  const sat = tone === 'sat';
  return (
    <label
      className={`flex min-h-11 flex-1 cursor-pointer items-center justify-center gap-2 rounded border bg-white text-[13px] font-semibold md:min-h-0 md:flex-none md:gap-0 md:rounded-none md:border-0 md:border-l md:border-navy/10 md:bg-transparent ${
        checked
          ? sat
            ? 'border-success text-success md:text-inherit'
            : 'border-alert text-alert md:text-inherit'
          : 'border-navy/20 text-muted md:text-inherit'
      }`}
    >
      <input
        type="radio"
        name={`${itemCode}-result`}
        // The visible "SAT" / "NO SAT" text is hidden from `md` up, where the
        // approved form's column headers carry the meaning instead — so at
        // desktop widths this control would otherwise have no name at all, for
        // a screen reader as much as for a test.
        aria-label={`Mark ${itemCode} ${label}`}
        className="sr-only"
        disabled={disabled}
        checked={checked}
        onChange={onChange}
      />
      <span
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${
          checked
            ? sat
              ? 'border-success bg-success-soft'
              : 'border-alert bg-white'
            : 'border-navy/25 bg-white'
        }`}
      >
        {checked && sat && <Check className="h-3.5 w-3.5 text-success" strokeWidth={3} />}
        {checked && !sat && <span className="h-2.5 w-2.5 rounded-full bg-alert" />}
      </span>
      <span className="md:hidden">{label}</span>
    </label>
  );
}
