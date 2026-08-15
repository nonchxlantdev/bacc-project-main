import { NavLink, useLocation } from 'react-router-dom';
import {
  BarChart3,
  ClipboardCheck,
  Crosshair,
  FileText,
  Inbox,
  LayoutDashboard,
  List,
  LogOut,
  MapPin,
  Settings,
  ShieldAlert,
  Users,
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
  { to: '/projects', label: 'Projects', icon: FileText, soon: true },
  { to: '/documents', label: 'Documents', icon: FileText, soon: true },
  { to: '/locations', label: 'Locations', icon: MapPin },
  { to: '/users', label: 'Users', icon: Users },
  { to: '/settings', label: 'Settings', icon: Settings },
];

if (import.meta.env.DEV) {
  NAV.push({ to: '/dev/field-mapper', label: 'Field mapper', icon: Crosshair });
}

export default function Sidebar() {
  const { signOut } = useAuth();
  const location = useLocation();

  return (
    <aside className="flex w-[232px] shrink-0 flex-col bg-navy text-white">
      <div className="border-b border-white/10 px-4 py-4">
        <img src={baccLogoUrl} alt="BACC" className="h-8 w-auto bg-white object-contain p-0.5" />
        <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/55">
          Operations portal
        </p>
      </div>
      <nav className="flex-1 space-y-0.5 p-3">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex min-h-10 items-center gap-3 rounded-md px-3 py-2 text-[13px] ${
                isNavActive(item.to, isActive, location.pathname)
                  ? 'bg-primary font-semibold text-white'
                  : 'text-white/80 hover:bg-white/5 hover:text-white'
              }`
            }
          >
            <item.icon className="h-4 w-4 shrink-0" />
            <span className="flex-1">{item.label}</span>
            {item.soon && (
              <span className="rounded bg-white/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white/70">
                Soon
              </span>
            )}
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-white/10 p-3">
        <button
          type="button"
          onClick={() => signOut()}
          className="flex min-h-10 w-full items-center gap-3 rounded-md px-3 py-2 text-[13px] text-white/80 hover:bg-white/5 hover:text-white"
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
