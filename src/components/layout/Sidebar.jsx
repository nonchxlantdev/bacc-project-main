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
  Settings,
  ShieldAlert,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import { baccLogoUrl } from '../../lib/brandAssets.js';

const NAV = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/checklists/mine', label: 'My Checklists', icon: ClipboardCheck },
  { to: '/checklists/all', label: 'All Checklists', icon: List },
  { to: '/incidents', label: 'Incidents', icon: ShieldAlert },
  { to: '/approvals', label: 'Approvals', icon: Inbox },
  { to: '/reports', label: 'Reports', icon: BarChart3 },
  { to: '/locations', label: 'Locations', icon: MapPin },
  { to: '/users', label: 'Users', icon: Users },
  { to: '/settings', label: 'Settings', icon: Settings },
  { to: '/help', label: 'Help', icon: CircleHelp },
];

export default function Sidebar({ open = false, onClose }) {
  const { signOut } = useAuth();
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
      className={`fixed inset-y-0 left-0 z-40 flex w-[268px] max-w-[85vw] shrink-0 flex-col bg-navy text-white shadow-2xl outline-none transition-[transform,visibility] duration-200 ease-out lg:static lg:z-auto lg:w-[232px] lg:max-w-none lg:visible lg:translate-x-0 lg:shadow-none ${
        open ? 'visible translate-x-0' : 'invisible -translate-x-full'
      }`}
    >
      <div className="flex items-start justify-between gap-2 border-b border-white/10 px-4 pb-4 pt-[max(1rem,env(safe-area-inset-top))] lg:pt-4">
        <div>
          <img src={baccLogoUrl} alt="BACC" className="h-8 w-auto bg-white object-contain p-0.5" />
          <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/55">
            Operations portal
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close navigation"
          className="-mr-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-white/70 hover:bg-white/10 hover:text-white lg:hidden"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex min-h-11 items-center gap-3 rounded-md px-3 py-2 text-sm lg:min-h-10 lg:text-[13px] ${
                isNavActive(item.to, isActive, location.pathname)
                  ? 'bg-primary font-semibold text-white'
                  : 'text-white/80 hover:bg-white/5 hover:text-white'
              }`
            }
          >
            <item.icon className="h-4 w-4 shrink-0" />
            <span className="flex-1">{item.label}</span>
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-white/10 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={() => signOut()}
          className="flex min-h-11 w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-white/80 hover:bg-white/5 hover:text-white lg:min-h-10 lg:text-[13px]"
        >
          <LogOut className="h-4 w-4" />
          Logout
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
