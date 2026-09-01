import { useEffect, useRef } from 'react';
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

export default function Sidebar({ open = false, onClose }) {
  const { signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const panelRef = useRef(null);

  // Opening the drawer moves focus into it; closing hands focus back to the page.
  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  return (
    <aside
      ref={panelRef}
      tabIndex={-1}
      aria-label="Main navigation"
      className={`fixed inset-y-0 left-0 z-40 flex w-[268px] max-w-[85vw] shrink-0 flex-col bg-gradient-to-b from-navy to-navy-deep text-white shadow-2xl outline-none transition-[transform,visibility] duration-200 ease-out lg:static lg:z-auto lg:w-[236px] lg:max-w-none lg:visible lg:translate-x-0 lg:shadow-none ${
        open ? 'visible translate-x-0' : 'invisible -translate-x-full'
      }`}
    >
      <div className="flex items-start justify-between gap-2 border-b border-white/10 px-4 pb-4 pt-[max(1.25rem,env(safe-area-inset-top))] lg:pt-5">
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
        <button
          type="button"
          onClick={onClose}
          aria-label="Close navigation"
          className="-mr-1 -mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-white/70 hover:bg-white/10 hover:text-white lg:hidden"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      <nav className="flex-1 space-y-4 overflow-y-auto p-3">
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <p className="px-3 pb-1.5 font-display text-[11px] font-semibold uppercase tracking-[0.16em] text-white/40">
              {group.label}
            </p>
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) => {
                    const active = isNavActive(item.to, isActive, location.pathname);
                    // The active marker is a glowing rail, not a fill — the
                    // same PAPI-light language used for status beacons
                    // elsewhere, so "where am I" reads the same way as
                    // "is this okay" does.
                    return `relative flex min-h-11 items-center gap-3 rounded-md py-2 pl-4 pr-3 text-sm before:absolute before:bottom-1.5 before:left-0 before:top-1.5 before:w-[3px] before:rounded-full before:content-[''] lg:min-h-10 lg:text-[13px] ${
                      active
                        ? 'bg-teal/10 font-semibold text-white before:bg-teal before:shadow-glow-teal'
                        : 'text-white/75 before:bg-transparent hover:bg-white/5 hover:text-white'
                    }`;
                  }}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  <span className="flex-1">{item.label}</span>
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
            className="flex min-h-11 w-full items-center gap-3 rounded-md py-2 pl-4 pr-3 text-sm text-white/75 hover:bg-white/5 hover:text-white lg:min-h-10 lg:text-[13px]"
          >
            {theme === 'dark' ? (
              <Moon className="h-4 w-4 shrink-0" aria-hidden />
            ) : (
              <Sun className="h-4 w-4 shrink-0" aria-hidden />
            )}
            <span className="flex-1 text-left">Theme</span>
            <span className="text-[11px] font-semibold uppercase tracking-wide text-white/45">
              {theme === 'dark' ? 'Dark' : 'Light'}
            </span>
          </button>
        </div>
      </nav>
      <div className="border-t border-white/10 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={() => signOut()}
          className="flex min-h-11 w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-white/75 hover:bg-white/5 hover:text-white lg:min-h-10 lg:text-[13px]"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </div>
    </aside>
  );
}

function isNavActive(to, isActive, pathname) {
  if (to === '/checklists/mine') {
    return pathname.startsWith('/checklists/') && !pathname.startsWith('/checklists/all');
  }
  return isActive;
}
