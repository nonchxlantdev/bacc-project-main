import { NavLink } from 'react-router-dom';
import {
  ClipboardCheck,
  FileText,
  FolderOpen,
  LayoutDashboard,
  MapPin,
  Settings,
  ShieldAlert,
  Users,
} from 'lucide-react';

const NAV = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/checklists/mine', label: 'My Checklists', icon: ClipboardCheck },
  { to: '/checklists/all', label: 'All Checklists', icon: ClipboardCheck },
  { to: '/incidents', label: 'Incidents', icon: ShieldAlert, soon: true },
  { to: '/reports', label: 'Reports', icon: FileText, soon: true },
  { to: '/documents', label: 'Documents', icon: FolderOpen, soon: true },
  { to: '/locations', label: 'Locations', icon: MapPin },
  { to: '/users', label: 'Users', icon: Users },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export default function Sidebar() {
  return (
    <aside className="flex w-56 shrink-0 flex-col bg-navy-mid text-white">
      <nav className="flex-1 space-y-0.5 p-3">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-md px-3 py-2 text-sm ${
                isActive ? 'bg-white/10 font-semibold' : 'text-white/80 hover:bg-white/5 hover:text-white'
              }`
            }
          >
            <item.icon className="h-4 w-4 shrink-0" />
            <span className="flex-1">{item.label}</span>
            {item.soon && (
              <span className="rounded bg-teal/20 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-teal">
                Soon
              </span>
            )}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
