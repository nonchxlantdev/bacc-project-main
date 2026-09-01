import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { queueHandlers } from '../../lib/queueHandlers.js';
import { startOnlineFlush } from '../../utils/offlineQueue.js';
import Sidebar from './Sidebar.jsx';
import TopBar from './TopBar.jsx';

const SIDEBAR_COLLAPSED_KEY = 'bacc-sidebar-collapsed';

function readStoredCollapsePref() {
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
}

export default function AppShell() {
  const { user, loading } = useAuth();
  const location = useLocation();
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  const [navOpen, setNavOpen] = useState(false);

  // The rail only collapses from `md` (768px) up — below that the sidebar is
  // a full-width drawer, and an icon-only drawer would just be a worse
  // drawer. `collapsedPref` is the person's saved choice; `isPersistentWidth`
  // tracks whether the viewport is currently wide enough to honor it, kept
  // separate so resizing down to a phone (or a tablet split-view) never
  // overwrites the saved preference — it only hides its effect until the
  // viewport is wide enough again.
  const [collapsedPref, setCollapsedPref] = useState(readStoredCollapsePref);
  const [isPersistentWidth, setIsPersistentWidth] = useState(() =>
    typeof window === 'undefined' ? true : window.matchMedia('(min-width: 768px)').matches,
  );
  const collapsed = collapsedPref && isPersistentWidth;

  useEffect(() => {
    const mql = window.matchMedia('(min-width: 768px)');
    const onChange = (event) => setIsPersistentWidth(event.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsedPref ? '1' : '0');
    } catch {
      // Private browsing / storage disabled — the rail still collapses for
      // this session, it just won't be remembered next time.
    }
  }, [collapsedPref]);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    const stop = startOnlineFlush(queueHandlers);
    if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
      stop();
    };
  }, []);

  // Navigating closes the drawer — otherwise it covers the page you just opened.
  useEffect(() => {
    setNavOpen(false);
  }, [location.pathname]);

  // While the drawer is over the page, the page behind it must not scroll.
  useEffect(() => {
    if (!navOpen) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setNavOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [navOpen]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-navy px-6 text-center text-white">
        Loading portal…
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    // md:fixed md:inset-0 pins the shell's box to the viewport unconditionally
    // (immune to the 100dvh-resolution failure that used to let it grow with
    // content). No overflow-hidden here: that briefly made this box itself an
    // invisible, scrollbar-less scroll container, and the browser's native
    // "scroll focused control into view" behavior would silently scroll it
    // instead of `<main>` — shifting the whole sidebar+content out of the
    // viewport with nothing on screen to undo it. Fixed positioning alone
    // already guarantees this box can never exceed the viewport, so the
    // backstop was both redundant and the actual cause of that bug. Pinned
    // at `md` rather than `lg` because that's where the sidebar itself now
    // goes persistent — tablet gets the same independently-scrolling shell
    // as desktop.
    <div className="flex min-h-screen md:fixed md:inset-0 md:h-[100dvh] md:min-h-0">
      {navOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={() => setNavOpen(false)}
          className="fixed inset-0 z-30 bg-navy/60 md:hidden"
        />
      )}
      <Sidebar
        open={navOpen}
        onClose={() => setNavOpen(false)}
        collapsed={collapsed}
        onToggleCollapsed={() => setCollapsedPref((current) => !current)}
      />
      <div className="flex min-h-screen min-w-0 flex-1 flex-col md:min-h-0">
        <TopBar online={online} onMenuClick={() => setNavOpen(true)} />
        <main className="min-w-0 flex-1 overflow-y-auto overscroll-contain bg-stripe px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-5">
          <Outlet context={{ online }} />
        </main>
      </div>
    </div>
  );
}
