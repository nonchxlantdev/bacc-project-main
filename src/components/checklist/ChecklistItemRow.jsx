import { Camera, ChevronRight, Check, X } from 'lucide-react';
import { CHECKLIST_GRID } from './checklistGrid.js';

/**
 * One inspection item — three genuinely different layouts, not one layout
 * compacted three ways. Each tier is its own sibling block, shown or hidden
 * outright by breakpoint (`md:hidden`, `hidden md:flex xl:hidden`,
 * `hidden xl:grid`); only one is ever in the accessibility tree at a time.
 *
 * That used to be one set of markup, restacked with an `xl:contents` trick
 * so the phone card's DOM nodes became the desktop table's grid cells. It
 * worked for two tiers because "phone card" and "desktop table" wanted the
 * same content in a different arrangement. A third, structurally different
 * tablet tier doesn't fit that trick: this row still needs `CHECKLIST_GRID`'s
 * `xl:grid` for the table AND a `md:flex`-vs-`xl:hidden` swap for the tablet
 * row, and stacking two display-affecting utilities like that on one element
 * depends on generated-CSS source order, not the order they're written in —
 * not something to build on. Three explicit blocks cost some duplication but
 * every tier can be read (and changed) on its own.
 *
 * - **Phone** (below `md`, 768px): unchanged — code and wording, full-width
 *   SAT / NO SAT, remarks and camera all inline in the card.
 * - **Tablet** (`md` to just under `xl`, 768–1279px): a compact row — code,
 *   wording, SAT / NO SAT. Remarks and the photo live in the detail sheet
 *   (`ChecklistForm`'s evidence panel, already a bottom sheet below `lg` and
 *   pinned to the right side of NO SAT items already needing it above that)
 *   instead of a third inline row, so a full section fits on screen at once
 *   without shrinking touch targets. A small "Remarks added" / "Photo
 *   attached" line and a chevron mark when there's something to see there.
 * - **Desktop** (`xl` and up, 1280px): the approved form's five-column
 *   table, unchanged.
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
  const hasRemarks = Boolean(row?.remarks?.trim());

  return (
    <div
      id={`checklist-item-${item.code}`}
      className={`border-b border-line/10 scroll-mt-24 ${
        noSat ? 'border-l-4 border-l-alert bg-alert-soft' : selected ? 'bg-primary/5' : striped ? 'bg-stripe' : 'bg-surface'
      }`}
    >
      {/* Phone card (<768px) */}
      <div className="flex flex-col pb-2.5 pt-2 md:hidden">
        <div className="flex items-baseline gap-2 px-3">
          <button
            type="button"
            onClick={() => onSelect(item.code)}
            className="shrink-0 text-left text-[13px] font-bold text-ink"
          >
            {item.code}
          </button>
          <button
            type="button"
            onClick={() => onSelect(item.code)}
            className="min-w-0 flex-1 text-left text-[13px] leading-snug text-ink"
          >
            {item.text}
          </button>
        </div>

        <div className="flex gap-2 px-3 pt-2.5">
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

        <div className="flex items-center gap-1 px-3 pt-2">
          <input
            value={row?.remarks ?? ''}
            disabled={disabled}
            placeholder={noSat ? 'Required for NO SAT' : 'Remarks / location'}
            onChange={(e) => onChange({ remarks: e.target.value })}
            className={`min-h-11 min-w-0 flex-1 rounded border px-2 py-1 text-[13px] text-ink ${
              remarksError ? 'border-alert bg-surface' : 'border-line/15 bg-surface'
            }`}
          />
          <button
            type="button"
            onClick={() => {
              onSelect(item.code);
              onPhotoClick?.(item.code);
            }}
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded ${
              hasPhoto ? 'text-primary' : 'text-muted hover:text-ink'
            }`}
            aria-label={`Photo for ${item.code}`}
          >
            <Camera className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Tablet compact row (768–1279px) */}
      <div className="hidden flex-col gap-2 px-3 py-2.5 md:flex xl:hidden">
        <div className="flex items-start gap-2">
          <button
            type="button"
            onClick={() => onSelect(item.code)}
            className="shrink-0 text-left text-[13px] font-bold text-ink"
          >
            {item.code}
          </button>
          <button
            type="button"
            onClick={() => onSelect(item.code)}
            className="min-w-0 flex-1 text-left text-[13px] leading-snug text-ink"
          >
            {item.text}
            {(hasRemarks || hasPhoto) && (
              <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] font-medium text-muted">
                {hasRemarks && <span>Remarks added</span>}
                {hasPhoto && (
                  <span className="inline-flex items-center gap-1">
                    <Camera className="h-3 w-3" aria-hidden />
                    Photo attached
                  </span>
                )}
              </span>
            )}
          </button>
          <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden />
        </div>

        <div className="flex gap-2">
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
      </div>

      {/* Desktop table row (1280px+) */}
      <div className={`hidden ${CHECKLIST_GRID} xl:min-h-12 xl:items-stretch`}>
        <button
          type="button"
          onClick={() => onSelect(item.code)}
          className="px-3 py-2.5 pl-3 text-left text-[13px] font-bold text-ink"
        >
          {item.code}
        </button>

        <button
          type="button"
          onClick={() => onSelect(item.code)}
          className="min-w-0 px-3 py-2.5 pr-3 text-left text-[13px] leading-snug text-ink"
        >
          {item.text}
        </button>

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

        <div className="flex items-center gap-1 border-l border-line/10 p-1.5">
          <input
            value={row?.remarks ?? ''}
            disabled={disabled}
            placeholder={noSat ? 'Required for NO SAT' : 'Remarks / location'}
            onChange={(e) => onChange({ remarks: e.target.value })}
            className={`min-h-9 min-w-0 flex-1 rounded border px-2 py-1 text-[13px] text-ink ${
              remarksError ? 'border-alert bg-surface' : 'border-line/15 bg-surface'
            }`}
          />
          <button
            type="button"
            onClick={() => {
              onSelect(item.code);
              onPhotoClick?.(item.code);
            }}
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded ${
              hasPhoto ? 'text-primary' : 'text-muted hover:text-ink'
            }`}
            aria-label={`Photo for ${item.code}`}
          >
            <Camera className="h-4 w-4" />
          </button>
        </div>
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
