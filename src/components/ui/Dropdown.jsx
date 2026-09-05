import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { Link } from 'react-router-dom';
import { MoreHorizontal, MoreVertical } from 'lucide-react';

const DropdownContext = createContext(null);

function useDropdown() {
  const ctx = useContext(DropdownContext);
  if (!ctx) throw new Error('Dropdown subcomponents must be used within <Dropdown>.');
  return ctx;
}

/**
 * Shared action-menu dropdown. Extracted from TopBar's account menu — same
 * outside-click and Escape dismissal, with focus returned to the toggle on Escape.
 *
 * Compound API:
 *   <Dropdown>
 *     <Dropdown.Toggle>…</Dropdown.Toggle>        labelled trigger
 *     <Dropdown.ToggleIcon />                      kebab for table rows
 *     <Dropdown.Menu>
 *       <Dropdown.Header>…</Dropdown.Header>
 *       <Dropdown.Item>…</Dropdown.Item>
 *       <Dropdown.Item destructive>…</Dropdown.Item>
 *     </Dropdown.Menu>
 *   </Dropdown>
 */
function Dropdown({
  children,
  open: controlledOpen,
  onOpenChange,
  align = 'right',
  className = '',
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const rootRef = useRef(null);
  const toggleRef = useRef(null);

  const setOpen = useCallback(
    (next) => {
      const value = typeof next === 'function' ? next(open) : next;
      if (!isControlled) setInternalOpen(value);
      onOpenChange?.(value);
    },
    [isControlled, onOpenChange, open],
  );

  const close = useCallback(() => setOpen(false), [setOpen]);

  useEffect(() => {
    if (!open) return undefined;
    function onPointerDown(event) {
      if (!rootRef.current?.contains(event.target)) close();
    }
    function onKeyDown(event) {
      if (event.key === 'Escape') {
        close();
        toggleRef.current?.focus();
      }
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, close]);

  return (
    <DropdownContext.Provider value={{ open, setOpen, close, toggleRef, align }}>
      <div ref={rootRef} className={`relative ${className}`.trim()}>
        {children}
      </div>
    </DropdownContext.Provider>
  );
}

function Toggle({
  children,
  className = '',
  haspopup = 'menu',
  onClick,
  ...props
}) {
  const { open, setOpen, toggleRef } = useDropdown();

  return (
    <button
      ref={toggleRef}
      type="button"
      aria-haspopup={haspopup}
      aria-expanded={open}
      onClick={(event) => {
        setOpen((was) => !was);
        onClick?.(event);
      }}
      className={className}
      {...props}
    >
      {children}
    </button>
  );
}

function ToggleIcon({
  icon = 'vertical',
  label = 'Actions',
  className = '',
  ...props
}) {
  const Icon = icon === 'horizontal' ? MoreHorizontal : MoreVertical;
  return (
    <Toggle
      aria-label={label}
      className={`flex h-11 w-11 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-ink ${className}`.trim()}
      {...props}
    >
      <Icon className="h-4 w-4" aria-hidden />
    </Toggle>
  );
}

const EDGE_GUTTER = 8;

function Menu({
  children,
  className = '',
  align: alignProp,
  panel = false,
  offset = 'mt-1',
}) {
  const { open, align } = useDropdown();
  const menuRef = useRef(null);
  // Horizontal correction, in px, applied when the menu's natural anchor puts
  // it past a viewport edge. A right-anchored menu next to a toggle that is
  // not itself near the right edge — "More Actions" once the action row wraps
  // on a phone — otherwise opens with its left side off-screen, and the top
  // three items cannot be tapped at all.
  const [shift, setShift] = useState(0);
  const alignRight = (alignProp ?? align) !== 'left';

  useLayoutEffect(() => {
    if (!open) {
      setShift(0);
      return undefined;
    }
    function reposition() {
      const el = menuRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      let dx = 0;
      if (r.left < EDGE_GUTTER) dx = EDGE_GUTTER - r.left;
      else if (r.right > window.innerWidth - EDGE_GUTTER) dx = window.innerWidth - EDGE_GUTTER - r.right;
      // Converges: each pass measures the already-shifted box, so a zero
      // correction means the menu is inside the viewport and we stop.
      if (Math.abs(dx) >= 1) setShift((current) => current + dx);
    }
    reposition();
    window.addEventListener('resize', reposition);
    return () => window.removeEventListener('resize', reposition);
  }, [open, shift]);

  if (!open) return null;

  const side = alignRight ? 'right-0' : 'left-0';
  const base =
    'absolute z-30 max-w-[calc(100vw-1rem)] overflow-hidden rounded-md border border-line/15 bg-surface text-ink shadow-lg motion-safe:animate-[modal-pop_240ms_cubic-bezier(0.16,1,0.3,1)]';
  const menuProps = panel ? {} : { role: 'menu' };

  return (
    <div
      ref={menuRef}
      {...menuProps}
      // Nudged via the inset the anchor class already sets, not a transform:
      // `modal-pop` animates transform, and an inline one would be ignored
      // until the animation finished and then jump.
      style={shift ? (alignRight ? { right: -shift } : { left: shift }) : undefined}
      className={`${base} ${side} ${offset} ${className}`.trim()}
    >
      {children}
    </div>
  );
}

function Header({ children, className = '' }) {
  return (
    <div className={`border-b border-line/15 px-3 py-2 ${className}`.trim()}>
      {children}
    </div>
  );
}

function Divider() {
  return <div className="border-t border-line/15" role="separator" />;
}

function Item({
  children,
  onClick,
  destructive = false,
  to,
  icon: Icon,
  className = '',
  closeOnSelect = true,
  ...props
}) {
  const { close } = useDropdown();

  const classes = `flex w-full min-h-11 items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-surface-2 ${
    destructive ? 'text-alert' : 'text-ink'
  } ${className}`.trim();

  function handleClick(event) {
    onClick?.(event);
    if (closeOnSelect && !event.defaultPrevented) close();
  }

  if (to) {
    return (
      <Link to={to} role="menuitem" onClick={handleClick} className={classes} {...props}>
        {Icon && <Icon className="h-4 w-4 shrink-0" aria-hidden />}
        {children}
      </Link>
    );
  }

  return (
    <button type="button" role="menuitem" onClick={handleClick} className={classes} {...props}>
      {Icon && <Icon className="h-4 w-4 shrink-0" aria-hidden />}
      {children}
    </button>
  );
}

Dropdown.Toggle = Toggle;
Dropdown.ToggleIcon = ToggleIcon;
Dropdown.Menu = Menu;
Dropdown.Header = Header;
Dropdown.Divider = Divider;
Dropdown.Item = Item;

export default Dropdown;
