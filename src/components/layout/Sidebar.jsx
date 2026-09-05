import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  BarChart3,
  CircleHelp,
  ClipboardCheck,
  Inbox,
  LayoutDashboard,
  List,
  LogOut,
  MapPin,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Plane,
  Settings,
  ShieldAlert,
  Sun,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useTheme } from '../../context/ThemeContext.jsx';
import { pgiaLogoUrl } from '../../lib/brandAssets.js';

// Grouped the way the people who use this actually think about the app: the
// forms and queues they touch every shift, versus the admin screens they
// open a handful of times a month.
const NAV_GROUPS = [
  {
    label: 'Operate',
    items: [
      { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { to: '/checklists/mine', label: 'My Checklists', icon: ClipboardCheck },
      { to: '/checklists/all', label: 'All Checklists', icon: List },
      { to: '/incidents', label: 'Incidents', icon: ShieldAlert },
      { to: '/approvals', label: 'Approvals', icon: Inbox },
    ],
  },
  {
    label: 'Manage',
    items: [
      { to: '/reports', label: 'Reports', icon: BarChart3 },
      { to: '/locations', label: 'Locations', icon: MapPin },
      { to: '/users', label: 'Users', icon: Users },
      { to: '/settings', label: 'Settings', icon: Settings },
      { to: '/help', label: 'Help', icon: CircleHelp },
    ],
  },
];

/**
 * `collapsed` only ever arrives `true` at `md` (768px) and up — AppShell
 * clears it below that width, because below `md` this is a full-width
 * drawer over the page, not a persistent rail, and an icon-only drawer
 * would just be a worse drawer. That guarantee is what lets every
 * `collapsed ? … : …` branch below skip a matching `md:` gate: there is no
 * width at which `collapsed` is true but the layout should still look
 * expanded.
 */
export default function Sidebar({ open = false, onClose, collapsed = false, onToggleCollapsed }) {
  const { signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const panelRef = useRef(null);

  // Tracks each nav item's DOM node (keyed by route) so the shared
  // active-page indicator below can measure where to sit.
  const itemRefs = useRef(new Map());
  // Position of the active-page indicator, in the <nav>'s own coordinate
  // space (see `relative` on <nav> below). `animate: false` on the very
  // first measurement means "snap into place, don't slide in from
  // nowhere" — matching how the sidebar's own collapse never animates on
  // first paint either.
  const [indicator, setIndicator] = useState(null);
  const hasPositionedRef = useRef(false);

  const activeTo = NAV_GROUPS.flatMap((group) => group.items).find((item) =>
    isNavActive(item.to, location.pathname),
  )?.to;

  // Re-measure whenever the active route changes or `collapsed` toggles
  // (collapsing hides each group's label row, which shifts every item
  // below it). The resize listener covers the one case neither of those
  // catches: the `lg` breakpoint shrinking each item from 44px to 40px
  // tall with no route or collapse change.
  useLayoutEffect(() => {
    function measure() {
      const activeEl = activeTo ? itemRefs.current.get(activeTo) : null;
      if (!activeEl) {
        setIndicator(null);
        return;
      }
      setIndicator({
        top: activeEl.offsetTop + 6,
        height: activeEl.offsetHeight - 12,
        animate: hasPositionedRef.current,
      });
      hasPositionedRef.current = true;
    }
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [activeTo, collapsed]);

  // Opening the drawer moves focus into it; closing hands focus back to the page.
  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  return (
    <aside
      ref={panelRef}
      tabIndex={-1}
      aria-label="Main navigation"
      className={`fixed inset-y-0 left-0 z-40 flex w-[268px] max-w-[85vw] shrink-0 flex-col bg-gradient-to-b from-navy to-navy-deep text-white shadow-2xl outline-none transition-[transform,visibility,width] duration-200 ease-out md:static md:z-auto md:max-w-none md:visible md:translate-x-0 md:shadow-none ${
        collapsed ? 'md:w-[76px]' : 'md:w-[236px]'
      } ${open ? 'visible translate-x-0' : 'invisible -translate-x-full'}`}
    >
      {collapsed ? (
        <div className="flex flex-col items-center gap-2 border-b border-white/10 px-2 pb-4 pt-[max(1.25rem,env(safe-area-inset-top))]">
          {/* Compact mark for the icon rail — the full wordmark doesn't fit
              at 76px, so this borrows the same teal-on-navy chip language
              already used for the signed-in user's initials in the top bar,
              with the airport's own aircraft mark in place of initials. */}
          <span
            aria-label="BACC Airport Portal"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-teal text-navy"
          >
            <Plane className="h-4 w-4" strokeWidth={2.5} aria-hidden />
          </span>
          <button
            type="button"
            onClick={onToggleCollapsed}
            aria-label="Expand navigation"
            title="Expand navigation"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-white/70 transition-colors duration-150 ease-out hover:bg-white/10 hover:text-white"
          >
            <PanelLeftOpen className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div className="flex items-start justify-between gap-2 border-b border-white/10 px-4 pb-4 pt-[max(1.25rem,env(safe-area-inset-top))] md:pt-5">
          <div className="min-w-0">
            {/* The wordmark is artwork for a dark ground (it disappears on
                white), so it sits directly on the sidebar's navy — no chip. */}
            <img
              src={pgiaLogoUrl}
              alt="Philip S.W. Goldson International Airport"
              className="h-auto w-[148px] max-w-full"
            />
            <p className="mt-2 text-[12px] font-semibold text-white/85">BACC Airport Portal</p>
            <p className="mt-0.5 truncate text-[11px] text-white/50">
              Philip S.W. Goldson International Airport
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={onToggleCollapsed}
              aria-label="Collapse navigation"
              title="Collapse navigation"
              className="hidden h-10 w-10 items-center justify-center rounded-md text-white/70 transition-colors duration-150 ease-out hover:bg-white/10 hover:text-white md:flex"
            >
              <PanelLeftClose className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close navigation"
              className="-mr-1 -mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-white/70 transition-colors duration-150 ease-out hover:bg-white/10 hover:text-white md:hidden"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}
      <nav className="scrollbar-dark relative flex-1 space-y-4 overflow-y-auto overscroll-contain p-3">
        {/* Active-page indicator — a single glowing rail (the same
            PAPI-light beacon language used for status dots elsewhere)
            that slides to whichever item is active, instead of each item
            drawing its own. Reduced-motion users get it snapping straight
            to place: the transition is motion-safe-gated, and the very
            first measurement never animates in from (0, 0). */}
        {indicator && (
          <span
            aria-hidden
            className="pointer-events-none absolute left-0 w-[3px] rounded-full bg-teal shadow-glow-teal motion-safe:transition-[transform,height] motion-safe:duration-200 motion-safe:ease-out"
            style={{
              height: indicator.height,
              transform: `translateY(${indicator.top}px)`,
              transitionDuration: indicator.animate ? undefined : '0ms',
            }}
          />
        )}
        {NAV_GROUPS.map((group, groupIndex) => (
          <div
            key={group.label}
            className={collapsed && groupIndex > 0 ? 'border-t border-white/10 pt-3' : undefined}
          >
            {!collapsed && (
              <p className="px-3 pb-1.5 font-display text-[11px] font-semibold uppercase tracking-[0.16em] text-white/40">
                {group.label}
              </p>
            )}
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  ref={(el) => {
                    if (el) itemRefs.current.set(item.to, el);
                    else itemRefs.current.delete(item.to);
                  }}
                  to={item.to}
                  title={collapsed ? item.label : undefined}
                  aria-label={collapsed ? item.label : undefined}
                  className={() => {
                    const active = isNavActive(item.to, location.pathname);
                    return `flex min-h-11 items-center gap-3 rounded-md py-2 text-sm transition-colors duration-150 ease-out desk:min-h-10 desk:text-[13px] ${
                      collapsed ? 'justify-center px-0' : 'pl-4 pr-3'
                    } ${
                      active
                        ? 'bg-teal/10 font-semibold text-white'
                        : 'text-white/75 hover:bg-white/5 hover:text-white'
                    }`;
                  }}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  {!collapsed && <span className="flex-1">{item.label}</span>}
                </NavLink>
              ))}
            </div>
          </div>
        ))}

        {/* Not a destination, so it sits outside the Operate/Manage groups —
            styled the same as a nav row for visual consistency, with the
            current mode named on the right instead of a link target. */}
        <div className="border-t border-white/10 pt-3">
          <button
            type="button"
            onClick={toggleTheme}
            title={collapsed ? 'Toggle theme' : undefined}
            aria-label={collapsed ? `Theme, currently ${theme === 'dark' ? 'dark' : 'light'}` : undefined}
            className={`flex min-h-11 w-full items-center gap-3 rounded-md py-2 text-sm text-white/75 transition-colors duration-150 ease-out hover:bg-white/5 hover:text-white desk:min-h-10 desk:text-[13px] ${
              collapsed ? 'justify-center px-0' : 'pl-4 pr-3'
            }`}
          >
            {theme === 'dark' ? (
              <Moon className="h-4 w-4 shrink-0" aria-hidden />
            ) : (
              <Sun className="h-4 w-4 shrink-0" aria-hidden />
            )}
            {!collapsed && (
              <>
                <span className="flex-1 text-left">Theme</span>
                <span className="text-[11px] font-semibold uppercase tracking-wide text-white/45">
                  {theme === 'dark' ? 'Dark' : 'Light'}
                </span>
              </>
            )}
          </button>
        </div>
      </nav>
      <div className="border-t border-white/10 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={() => signOut()}
          title={collapsed ? 'Sign out' : undefined}
          aria-label={collapsed ? 'Sign out' : undefined}
          className={`flex min-h-11 w-full items-center gap-3 rounded-md py-2 text-sm text-white/75 transition-colors duration-150 ease-out hover:bg-white/5 hover:text-white desk:min-h-10 desk:text-[13px] ${
            collapsed ? 'justify-center px-0' : 'px-3'
          }`}
        >
          <LogOut className="h-4 w-4" />
          {!collapsed && 'Sign out'}
        </button>
      </div>
    </aside>
  );
}

function isNavActive(to, pathname) {
  if (to === '/checklists/mine') {
    return pathname.startsWith('/checklists/') && !pathname.startsWith('/checklists/all');
  }
  return pathname === to || pathname.startsWith(`${to}/`);
}
