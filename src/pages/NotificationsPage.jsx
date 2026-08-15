import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useNotifications } from '../hooks/useRepos.js';

export default function NotificationsPage() {
  const { user } = useAuth();
  const { rows, unread, markRead, markAllRead } = useNotifications(user?.id);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-navy">Notifications</h1>
          <p className="text-sm text-muted">{unread} unread</p>
        </div>
        <button type="button" onClick={() => markAllRead()} className="rounded-md border border-navy/20 px-3 py-2 text-sm">
          Mark all read
        </button>
      </div>
      <ul className="divide-y divide-navy/10 overflow-hidden rounded-lg border border-navy/10 bg-white">
        {rows.length === 0 && <li className="px-4 py-8 text-center text-sm text-muted">No notifications.</li>}
        {rows.map((row) => (
          <li key={row.id} className={`px-4 py-3 ${row.read_at ? 'bg-white' : 'bg-primary/5'}`}>
            <Link
              to={row.href || '/notifications'}
              onClick={() => markRead(row.id)}
              className="block"
            >
              <p className="font-medium text-navy">{row.title}</p>
              <p className="text-sm text-muted">{row.body}</p>
              <p className="mt-1 text-xs text-muted">{String(row.created_at).slice(0, 16).replace('T', ' ')}</p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
