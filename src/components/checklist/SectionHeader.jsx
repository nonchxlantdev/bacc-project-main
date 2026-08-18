import { ChevronDown } from 'lucide-react';
import { CHECKLIST_GRID } from './checklistGrid.js';

export default function SectionHeader({ title, itemCount, open, onToggle }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className="flex min-h-11 w-full items-center gap-3 bg-navy px-4 text-left text-white"
    >
      <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${open ? '' : '-rotate-90'}`} />
      <span className="flex-1 text-[13px] font-semibold uppercase tracking-wide">{title}</span>
      {!open && (
        <span className="text-xs font-medium text-white/80">
          {itemCount} {itemCount === 1 ? 'Item' : 'Items'}
        </span>
      )}
    </button>
  );
}

export function ColumnHead() {
  return (
    <div
      className={`${CHECKLIST_GRID} hidden border-b border-navy/10 bg-stripe text-[11px] font-semibold uppercase tracking-wide text-navy`}
    >
      <div className="px-3 py-2">Item</div>
      <div className="px-3 py-2">Description</div>
      <div className="px-1 py-2 text-center">SAT</div>
      <div className="px-1 py-2 text-center">NO SAT</div>
      <div className="px-3 py-2">Remarks / Location</div>
    </div>
  );
}
