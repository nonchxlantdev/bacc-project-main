import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { useDismissable } from './useDismissable.js';

/**
 * A dropdown that behaves like a native `<select>` but can be styled.
 *
 * The native control cannot carry the icons, counts and two-line options the
 * filters want, and it renders as an OS widget that ignores the app's type and
 * colour. Replacing it means re-earning what the native one gives free, so
 * this implements the listbox pattern properly rather than a div that opens on
 * click:
 *
 *   · full keyboard control — ↑ ↓ Home End to move, Enter/Space to choose,
 *     Esc to cancel, and type-ahead that jumps to the first matching label
 *   · roving `aria-activedescendant` on a `role="listbox"`, so a screen reader
 *     announces the highlighted option, not just the trigger
 *   · focus returns to the trigger on close, so Tab order never jumps
 *   · 44px targets on touch, visible focus ring, closes on outside click
 *
 * `options` is `[{ value, label, hint?, Icon? }]`. Value `''` is a legitimate
 * option (the "All …" row), so emptiness is never used as a sentinel.
 */
export default function Select({
  value,
  onChange,
  options,
  label,
  className = '',
  align = 'left',
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const triggerRef = useRef(null);
  const listRef = useRef(null);
  const typeAhead = useRef({ text: '', at: 0 });
  const id = useId();
  const rootRef = useDismissable(open, useCallback(() => setOpen(false), []));

  const selectedIndex = useMemo(
    () => Math.max(0, options.findIndex((o) => o.value === value)),
    [options, value],
  );
  const selected = options[selectedIndex];

  // Opening should land on the current choice, not the top of the list.
  useEffect(() => {
    if (open) setActive(selectedIndex);
  }, [open, selectedIndex]);

  // Keep the highlighted row in view when arrowing past the fold.
  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [open, active]);

  function choose(index) {
    const option = options[index];
    if (option) onChange(option.value);
    close();
  }

  function close() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  function onKeyDown(e) {
    if (!open) {
      if (['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(e.key)) {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    switch (e.key) {
      case 'Escape':
        e.preventDefault();
        close();
        return;
      case 'Tab':
        setOpen(false);
        return;
      case 'Enter':
      case ' ':
        e.preventDefault();
        choose(active);
        return;
      case 'ArrowDown':
        e.preventDefault();
        setActive((i) => Math.min(i + 1, options.length - 1));
        return;
      case 'ArrowUp':
        e.preventDefault();
        setActive((i) => Math.max(i - 1, 0));
        return;
      case 'Home':
        e.preventDefault();
        setActive(0);
        return;
      case 'End':
        e.preventDefault();
        setActive(options.length - 1);
        return;
      default:
        break;
    }
    // Type-ahead: successive letters within a second build one search string,
    // which is how the native control behaves and how people expect to use it.
    if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
      const now = Date.now();
      const text = (now - typeAhead.current.at < 1000 ? typeAhead.current.text : '') + e.key.toLowerCase();
      typeAhead.current = { text, at: now };
      const hit = options.findIndex((o) => o.label.toLowerCase().startsWith(text));
      if (hit >= 0) setActive(hit);
    }
  }

  const SelectedIcon = selected?.Icon;

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={onKeyDown}
        className={`flex min-h-11 w-full items-center gap-2 rounded border bg-white px-3 text-left text-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:min-h-10 ${
          open ? 'border-primary' : 'border-navy/20 hover:border-navy/40'
        }`}
      >
        {SelectedIcon && <SelectedIcon className="h-4 w-4 shrink-0 text-primary" aria-hidden />}
        <span className="min-w-0 flex-1 truncate text-navy">{selected?.label ?? ''}</span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-muted transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>

      {open && (
        <ul
          ref={listRef}
          role="listbox"
          tabIndex={-1}
          aria-label={label}
          aria-activedescendant={`${id}-${active}`}
          onKeyDown={onKeyDown}
          className={`absolute z-40 mt-1 max-h-72 min-w-full overflow-y-auto rounded-md border border-navy/15 bg-white py-1 shadow-lg ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
        >
          {options.map((option, i) => {
            const isSelected = option.value === value;
            const OptionIcon = option.Icon;
            return (
              <li
                key={option.value}
                id={`${id}-${i}`}
                role="option"
                aria-selected={isSelected}
                data-active={i === active}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(i)}
                className={`flex min-h-11 cursor-pointer items-center gap-2 px-3 text-sm sm:min-h-9 ${
                  i === active ? 'bg-stripe' : ''
                }`}
              >
                {OptionIcon && <OptionIcon className="h-4 w-4 shrink-0 text-primary" aria-hidden />}
                <span className="min-w-0 flex-1">
                  <span className={`block truncate ${isSelected ? 'font-semibold text-navy' : 'text-ink'}`}>
                    {option.label}
                  </span>
                  {option.hint && <span className="block truncate text-xs text-muted">{option.hint}</span>}
                </span>
                {isSelected && <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
