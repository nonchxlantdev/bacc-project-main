import { Bell } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { useNotifications } from '../../hooks/useRepos.js';

export default function TopBar({ online }) {
  const { displayName, position, user } = useAuth();
  const { unread } = useNotifications(user?.id);
  const initials = displayName
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <header className="flex h-14 items-center justify-between border-b border-white/10 bg-navy px-5 text-white">
      <div className="leading-tight">
        <div className="text-sm font-semibold tracking-wide">BACC Belize Airport Concession Company</div>
        <div className="text-[11px] text-white/65">Philip S.W. Goldson International Airport</div>
      </div>
      <div className="flex items-center gap-3">
        <span
          className={`hidden rounded-full px-2 py-0.5 text-[11px] font-semibold sm:inline ${
            online ? 'bg-success/20 text-teal' : 'bg-alert/20 text-white'
          }`}
        >
          {online ? 'Online' : 'Offline'}
        </span>
        <Link
          to="/notifications"
          className="relative rounded p-2 text-white/80 hover:bg-white/10 hover:text-white"
          aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
        >
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-alert px-1 text-[9px] font-bold text-white">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </Link>
        <div className="text-right leading-tight">
          <div className="text-sm font-semibold">{displayName}</div>
          <div className="text-[11px] text-white/70">{position}</div>
        </div>
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-teal text-xs font-bold text-navy">
          {initials}
        </div>
      </div>
    </header>
  );
}
