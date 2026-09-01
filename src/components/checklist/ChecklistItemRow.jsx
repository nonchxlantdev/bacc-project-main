import { Camera, Check, X } from 'lucide-react';
import { CHECKLIST_GRID } from './checklistGrid.js';

/**
 * One inspection item.
 *
 * Desktop (and laptop-and-up) keeps the approved form's five-column table.
 * Below `xl` — phone, any tablet (portrait or landscape), and a narrow
 * laptop window — the same markup restacks into a card: code and wording on
 * top, SAT / NO SAT as two full-width touch targets, remarks and camera
 * underneath. This form's detail page also opens a 19rem evidence panel and
 * the app shell pins its sidebar starting at `lg` (1024px) — stacked
 * together, a tablet-landscape-width viewport has nowhere near enough room
 * left over for the dense table's five columns, so the card stays through
 * `lg` and only gives way once there's genuine desktop-class width at `xl`
 * (1280px). The `xl:contents` wrappers exist only to group children below
 * that width; at `xl` they dissolve and their children become direct grid
 * cells again, so there is one set of markup and one source of truth for the
 * desktop layout.
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
      id={`checklist-item-${item.code}`}
      className={`${CHECKLIST_GRID} flex flex-col border-b border-line/10 xl:min-h-12 xl:items-stretch scroll-mt-24 ${
        noSat ? 'border-l-4 border-l-alert bg-alert-soft' : selected ? 'bg-primary/5' : striped ? 'bg-stripe' : 'bg-surface'
      }`}
    >
      <div className="flex items-baseline gap-2 pt-2 xl:contents">
        <button
          type="button"
          onClick={() => onSelect(item.code)}
          className="shrink-0 pl-3 text-left text-[13px] font-bold text-ink xl:px-3 xl:py-2.5 xl:pl-3"
        >
          {item.code}
        </button>

        <button
          type="button"
          onClick={() => onSelect(item.code)}
          className="min-w-0 flex-1 pr-3 text-left text-[13px] leading-snug text-ink xl:px-3 xl:py-2.5 xl:pr-3"
        >
          {item.text}
        </button>
      </div>

      <div className="flex gap-2 px-3 pt-2.5 xl:contents">
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

      <div className="flex items-center gap-1 px-3 pb-2.5 pt-2 xl:border-l xl:border-line/10 xl:p-1.5">
        <input
          value={row?.remarks ?? ''}
          disabled={disabled}
          placeholder={noSat ? 'Required for NO SAT' : 'Remarks / location'}
          onChange={(e) => onChange({ remarks: e.target.value })}
          className={`min-h-11 min-w-0 flex-1 rounded border px-2 py-1 text-[13px] text-ink xl:min-h-9 ${
            remarksError ? 'border-alert bg-surface' : 'border-line/15 bg-surface'
          }`}
        />
        <button
          type="button"
          onClick={() => {
            onSelect(item.code);
            onPhotoClick?.(item.code);
          }}
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded xl:h-8 xl:w-8 ${
            hasPhoto ? 'text-primary' : 'text-muted hover:text-ink'
          }`}
          aria-label={`Photo for ${item.code}`}
        >
          <Camera className="h-5 w-5 xl:h-4 xl:w-4" />
        </button>
      </div>
    </div>
  );
}

function ResultToggle({ itemCode, label, checked, disabled, onChange, tone }) {
  const sat = tone === 'sat';
  return (
    <label
      className={`flex min-h-11 flex-1 cursor-pointer items-center justify-center gap-2 rounded border bg-surface text-[13px] font-semibold xl:min-h-0 xl:flex-none xl:gap-0 xl:rounded-none xl:border-0 xl:border-l xl:border-line/10 xl:bg-transparent ${
        checked
          ? sat
            ? 'border-success text-success xl:text-inherit'
            : 'border-alert text-alert xl:text-inherit'
          : 'border-line/20 text-muted xl:text-inherit'
      }`}
    >
      <input
        type="radio"
        name={`${itemCode}-result`}
        // The visible "SAT" / "NO SAT" text is hidden from `xl` up, where the
        // approved form's column headers carry the meaning instead — so at
        // desktop widths this control would otherwise have no name at all, for
        // a screen reader as much as for a test.
        aria-label={`Mark ${itemCode} ${label}`}
        className="sr-only"
        disabled={disabled}
        checked={checked}
        onChange={onChange}
      />
      {/* Approved-mockup treatment: an empty ringed circle until marked, then
          a solid glowing fill with a white (or, for SAT, near-black) icon —
          not a tinted ring with a small icon/dot floating inside it. */}
      <span
        className={`flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full border-[1.5px] transition-colors ${
          checked
            ? sat
              ? 'border-teal bg-teal text-[#04241c] shadow-glow-teal'
              : 'border-alert bg-alert text-white shadow-glow-alert'
            : 'border-line/25 bg-surface text-transparent'
        }`}
      >
        {sat ? <Check className="h-4 w-4" strokeWidth={3} /> : <X className="h-4 w-4" strokeWidth={3} />}
      </span>
      <span className="xl:hidden">{label}</span>
    </label>
  );
}
