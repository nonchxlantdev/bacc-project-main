import { useState } from 'react';
import { Bell } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import Dropdown from '../ui/Dropdown.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useNotifications } from '../../hooks/useRepos.js';

const PREVIEW_LIMIT = 7;

/**
 * Quick-access notifications panel for the top bar. The full history stays on
 * `/notifications` — this is a glance, not a replacement.
 */
export default function NotificationDropdown() {
  const { user } = useAuth();
  const { rows, unread, markRead, markAllRead } = useNotifications(user?.id);
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const preview = rows.slice(0, PREVIEW_LIMIT);

  return (
    <Dropdown align="right" open={open} onOpenChange={setOpen}>
      <Dropdown.Toggle
        className="relative flex h-11 w-11 items-center justify-center rounded-md text-muted transition-colors duration-150 ease-out hover:bg-surface-2 hover:text-ink"
        aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
      >
        <Bell className="h-4 w-4" aria-hidden />
        {unread > 0 && (
          <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-alert px-1 text-[9px] font-bold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </Dropdown.Toggle>
      <Dropdown.Menu className="w-80 max-w-[calc(100vw-1rem)] text-ink" offset="mt-2" panel>
        <Dropdown.Header>
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold text-ink">Notifications</span>
            <button
              type="button"
              onClick={() => markAllRead()}
              disabled={unread === 0}
              className="min-h-11 rounded px-2 text-xs font-semibold text-primary hover:bg-primary/5 disabled:cursor-default disabled:text-muted desk:min-h-0"
            >
              Mark all read
            </button>
          </div>
        </Dropdown.Header>

        <ul className="max-h-[min(24rem,60vh)] overflow-y-auto overscroll-contain">
          {preview.length === 0 && (
            <li className="px-3 py-8 text-center text-sm text-muted">No notifications.</li>
          )}
          {preview.map((row) => (
            <li key={row.id}>
              <button
                type="button"
                className={`block w-full px-3 py-3 text-left hover:bg-surface-2 ${
                  row.read_at ? 'bg-surface' : 'bg-primary/5'
                }`}
                onClick={async () => {
                  await markRead(row.id);
                  setOpen(false);
                  navigate(row.href || '/notifications');
                }}
              >
                <p className="text-sm font-medium text-ink">{row.title}</p>
                <p className="line-clamp-2 text-xs text-muted">{row.body}</p>
                <p className="mt-1 text-[11px] text-muted">
                  {String(row.created_at).slice(0, 16).replace('T', ' ')}
                </p>
              </button>
            </li>
          ))}
        </ul>

        <div className="border-t border-line/15">
          <Link
            to="/notifications"
            onClick={() => setOpen(false)}
            className="flex min-h-11 items-center justify-center px-3 text-sm font-semibold text-primary hover:bg-surface-2"
          >
            View all notifications
          </Link>
        </div>
      </Dropdown.Menu>
    </Dropdown>
  );
}
