import { useEffect, useRef, useState } from 'react';
import { Bell, LogOut } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { useNotifications } from '../../hooks/useRepos.js';

export default function TopBar({ online }) {
  const { displayName, position, user, profile, signOut } = useAuth();
  const { unread } = useNotifications(user?.id);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return undefined;
    function onPointerDown(event) {
      if (!menuRef.current?.contains(event.target)) setMenuOpen(false);
    }
    function onKeyDown(event) {
      if (event.key === 'Escape') setMenuOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

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
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className="flex items-center gap-3 rounded-md px-2 py-1 hover:bg-white/10"
          >
            <span className="text-right leading-tight">
              <span className="block text-sm font-semibold">{displayName}</span>
              <span className="block text-[11px] text-white/70">{position}</span>
            </span>
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-teal text-xs font-bold text-navy">
              {initials}
            </span>
          </button>
          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 z-30 mt-2 w-60 overflow-hidden rounded-md border border-navy/10 bg-white text-navy shadow-lg"
            >
              <div className="border-b border-navy/10 px-3 py-2">
                <div className="text-sm font-semibold">{displayName}</div>
                <div className="text-[11px] text-muted">{user?.email}</div>
                {profile?.department && (
                  <div className="mt-1 text-[11px] text-muted">
                    {profile.role} · {profile.department}
                  </div>
                )}
              </div>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  signOut();
                }}
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-stripe"
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
