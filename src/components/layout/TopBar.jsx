import { Bell, CircleHelp, LogOut, Menu } from 'lucide-react';
import { Link } from 'react-router-dom';
import Dropdown from '../ui/Dropdown.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useNotifications } from '../../hooks/useRepos.js';

export default function TopBar({ online, onMenuClick }) {
  const { displayName, position, user, profile, signOut } = useAuth();
  const { unread } = useNotifications(user?.id);

  const initials = displayName
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-white/10 bg-navy px-2 pt-[env(safe-area-inset-top)] text-white sm:px-5">
      <div className="flex min-w-0 items-center gap-1 sm:gap-2">
        <button
          type="button"
          onClick={onMenuClick}
          aria-label="Open navigation"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-white/85 hover:bg-white/10 hover:text-white lg:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="min-w-0 leading-tight">
          <div className="truncate text-sm font-semibold tracking-wide">
            <span className="sm:hidden">BACC</span>
            <span className="hidden sm:inline">BACC Belize Airport Concession Company</span>
          </div>
          <div className="truncate text-[11px] text-white/65">
            <span className="sm:hidden">PGIA Operations</span>
            <span className="hidden sm:inline">Philip S.W. Goldson International Airport</span>
          </div>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1 sm:gap-3">
        <span
          className={`hidden rounded-full px-2 py-0.5 text-[11px] font-semibold sm:inline ${
            online ? 'bg-success/20 text-teal' : 'bg-alert/20 text-white'
          }`}
        >
          {online ? 'Online' : 'Offline'}
        </span>
        <span
          aria-label={online ? 'Online' : 'Offline'}
          className={`h-2 w-2 shrink-0 rounded-full sm:hidden ${online ? 'bg-teal' : 'bg-alert'}`}
        />
        <Link
          to="/help"
          className="flex h-11 w-11 items-center justify-center rounded-md text-white/80 hover:bg-white/10 hover:text-white"
          aria-label="Help"
        >
          <CircleHelp className="h-4 w-4" />
        </Link>
        <Link
          to="/notifications"
          className="relative flex h-11 w-11 items-center justify-center rounded-md text-white/80 hover:bg-white/10 hover:text-white"
          aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
        >
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-alert px-1 text-[9px] font-bold text-white">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </Link>
        <Dropdown align="right">
          <Dropdown.Toggle className="flex min-h-11 items-center gap-3 rounded-md px-1 py-1 hover:bg-white/10 sm:px-2">
            <span className="hidden text-right leading-tight md:block">
              <span className="block max-w-[13rem] truncate text-sm font-semibold">{displayName}</span>
              <span className="block max-w-[13rem] truncate text-[11px] text-white/70">{position}</span>
            </span>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-teal text-xs font-bold text-navy">
              {initials}
            </span>
          </Dropdown.Toggle>
          <Dropdown.Menu
            className="w-64 max-w-[calc(100vw-1rem)] text-navy"
            offset="mt-2"
          >
            <Dropdown.Header>
              <div className="text-sm font-semibold">{displayName}</div>
              <div className="text-[11px] text-muted">{user?.email}</div>
              {profile?.department && (
                <div className="mt-1 text-[11px] text-muted">
                  {profile.role} · {profile.department}
                </div>
              )}
            </Dropdown.Header>
            <Dropdown.Item destructive icon={LogOut} onClick={signOut}>
              Sign out
            </Dropdown.Item>
          </Dropdown.Menu>
        </Dropdown>
      </div>
    </header>
  );
}
