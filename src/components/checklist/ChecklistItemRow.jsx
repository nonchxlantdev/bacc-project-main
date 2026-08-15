import { Camera, Check } from 'lucide-react';
import { CHECKLIST_GRID } from './checklistGrid.js';

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
      className={`${CHECKLIST_GRID} min-h-12 items-stretch border-b border-navy/10 ${
        noSat ? 'border-l-4 border-l-alert bg-alert-soft' : selected ? 'bg-primary/5' : striped ? 'bg-stripe' : 'bg-white'
      }`}
    >
      <button
        type="button"
        onClick={() => onSelect(item.code)}
        className="px-3 py-2.5 text-left text-[13px] font-bold text-navy"
      >
        {item.code}
      </button>

      <button
        type="button"
        onClick={() => onSelect(item.code)}
        className="px-3 py-2.5 text-left text-[13px] leading-snug text-ink"
      >
        {item.text}
      </button>

      <label className="flex cursor-pointer items-center justify-center border-l border-navy/10">
        <input
          type="radio"
          name={`${item.code}-result`}
          className="sr-only"
          disabled={disabled}
          checked={result === 'sat'}
          onChange={() => onChange({ result: 'sat' })}
        />
        <span
          className={`flex h-6 w-6 items-center justify-center rounded-full border-2 ${
            result === 'sat' ? 'border-success bg-success-soft' : 'border-navy/25 bg-white'
          }`}
        >
          {result === 'sat' && <Check className="h-3.5 w-3.5 text-success" strokeWidth={3} />}
        </span>
      </label>

      <label className="flex cursor-pointer items-center justify-center border-l border-navy/10">
        <input
          type="radio"
          name={`${item.code}-result`}
          className="sr-only"
          disabled={disabled}
          checked={noSat}
          onChange={() => {
            onChange({ result: 'no_sat' });
            onSelect(item.code);
          }}
        />
        <span
          className={`flex h-6 w-6 items-center justify-center rounded-full border-2 ${
            noSat ? 'border-alert bg-white' : 'border-navy/25 bg-white'
          }`}
        >
          {noSat && <span className="h-2.5 w-2.5 rounded-full bg-alert" />}
        </span>
      </label>

      <div className="flex items-center gap-1 border-l border-navy/10 p-1.5">
        <input
          value={row?.remarks ?? ''}
          disabled={disabled}
          placeholder={noSat ? 'Required for NO SAT' : 'Remarks / location'}
          onChange={(e) => onChange({ remarks: e.target.value })}
          onFocus={() => onSelect(item.code)}
          className={`min-h-9 min-w-0 flex-1 rounded border px-2 py-1 text-[13px] ${
            remarksError ? 'border-alert bg-white' : 'border-navy/15 bg-white'
          }`}
        />
        <button
          type="button"
          onClick={() => {
            onSelect(item.code);
            onPhotoClick?.(item.code);
          }}
          className={`rounded p-1.5 ${hasPhoto ? 'text-primary' : 'text-muted hover:text-navy'}`}
          aria-label={`Photo for ${item.code}`}
        >
          <Camera className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
