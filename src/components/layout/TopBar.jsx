import { LogOut, Menu } from 'lucide-react';
import Dropdown from '../ui/Dropdown.jsx';
import HelpDropdown from '../help/HelpDropdown.jsx';
import NotificationDropdown from '../notifications/NotificationDropdown.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useAirportClock } from '../../hooks/useAirportClock.js';
import { useAvatarUrl } from '../../lib/avatar.js';

export default function TopBar({ online, onMenuClick }) {
  const { displayName, position, user, profile, signOut } = useAuth();
  const clock = useAirportClock();
  const avatarUrl = useAvatarUrl(profile?.avatar_url);

  const initials = displayName
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-line/15 bg-surface px-2 pt-[env(safe-area-inset-top)] text-ink sm:px-5">
      <div className="flex min-w-0 items-center gap-2 sm:gap-4">
        <button
          type="button"
          onClick={onMenuClick}
          aria-label="Open navigation"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted transition-colors duration-150 ease-out hover:bg-surface-2 hover:text-ink md:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>

        <div className="min-w-0 leading-tight md:hidden">
          <div className="truncate text-sm font-semibold text-ink">BACC</div>
          <div className="truncate text-[11px] text-muted">PGIA Operations</div>
        </div>

        <div className="hidden items-center gap-2 md:flex">
          <span
            aria-hidden
            className={`h-2.5 w-2.5 shrink-0 rounded-full ${
              online ? 'bg-teal shadow-glow-teal' : 'bg-alert shadow-glow-alert'
            }`}
          />
          <span className="text-[13px] font-semibold text-muted">{online ? 'Online' : 'Offline'}</span>
        </div>
        <div className="hidden leading-tight md:block md:border-l md:border-line/15 md:pl-4">
          <div className="font-mono text-[15px] font-semibold tabular-nums text-ink">{clock.time}</div>
          <div className="text-[11px] text-muted">{clock.date} · America/Belize</div>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1 sm:gap-2">
        <span
          aria-label={online ? 'Online' : 'Offline'}
          className={`h-2 w-2 shrink-0 rounded-full md:hidden ${online ? 'bg-teal' : 'bg-alert'}`}
        />
        <HelpDropdown />
        <NotificationDropdown />
        <Dropdown align="right">
          <Dropdown.Toggle className="flex min-h-11 items-center gap-3 rounded-md px-1 py-1 transition-colors duration-150 ease-out hover:bg-surface-2 sm:px-2">
            <span className="hidden text-right leading-tight md:block">
              <span className="block max-w-[13rem] truncate text-sm font-semibold text-ink">{displayName}</span>
              <span className="block max-w-[13rem] truncate text-[11px] text-muted">{position}</span>
            </span>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-teal text-xs font-bold text-navy">
              {avatarUrl ? <img src={avatarUrl} alt="" className="h-full w-full object-cover" /> : initials}
            </span>
          </Dropdown.Toggle>
          <Dropdown.Menu className="w-64 max-w-[calc(100vw-1rem)] text-ink" offset="mt-2">
            <Dropdown.Header>
              <div className="text-sm font-semibold text-ink">{displayName}</div>
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
