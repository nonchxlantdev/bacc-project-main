import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { ToastProvider, useToast } from '../../context/ToastContext.jsx';
import { queueHandlers } from '../../lib/queueHandlers.js';
import { probeReachability } from '../../lib/reachability.js';
import { flushQueue } from '../../utils/offlineQueue.js';
import OfflineModal from '../offline/OfflineModal.jsx';
import Sidebar from './Sidebar.jsx';
import TopBar from './TopBar.jsx';

const SIDEBAR_COLLAPSED_KEY = 'bacc-sidebar-collapsed';
const OFFLINE_DEBOUNCE_MS = 3000;
const REACHABILITY_POLL_MS = 30_000;

function readStoredCollapsePref() {
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
}

export default function AppShell() {
  return (
    <ToastProvider>
      <AppShellInner />
    </ToastProvider>
  );
}

function AppShellInner() {
  const { user, loading } = useAuth();
  const location = useLocation();
  const toast = useToast();
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  const [navOpen, setNavOpen] = useState(false);
  const [offlineModalOpen, setOfflineModalOpen] = useState(false);

  // Once per offline episode: reset the moment we come back online so a later
  // separate offline period shows the modal again.
  const shownThisEpisodeRef = useRef(false);
  const offlineTimerRef = useRef(null);
  const syncToastIdRef = useRef(null);
  const onlineRef = useRef(online);

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
    onlineRef.current = online;
  }, [online]);

  useEffect(() => {
    async function runFlushAndReport() {
      const result = await flushQueue(queueHandlers);
      const id = syncToastIdRef.current;
      if (result.failed > 0) {
        const message = `${result.failed} item${result.failed === 1 ? '' : 's'} failed to sync — tap to retry`;
        if (id) {
          toast.update(id, {
            message,
            actionLabel: 'Retry',
            onAction: () => {
              runFlushAndReport();
            },
            tone: 'alert',
          });
        } else {
          toast.push({
            message,
            actionLabel: 'Retry',
            onAction: () => {
              runFlushAndReport();
            },
            tone: 'alert',
          });
        }
      } else if (id) {
        toast.update(id, {
          message: 'All caught up',
          actionLabel: null,
          onAction: null,
          tone: 'neutral',
        });
        setTimeout(() => toast.dismiss(id), 4000);
      } else {
        toast.push({ message: 'All caught up' });
      }
    }

    const markOnlineAndFlush = () => {
      if (offlineTimerRef.current) {
        clearTimeout(offlineTimerRef.current);
        offlineTimerRef.current = null;
      }
      shownThisEpisodeRef.current = false;
      setOfflineModalOpen(false);
      onlineRef.current = true;
      setOnline(true);

      const id = toast.push({
        id: 'sync-status',
        message: 'Back online, syncing…',
        sticky: true,
      });
      syncToastIdRef.current = id;
      runFlushAndReport();
    };

    const markOffline = () => {
      onlineRef.current = false;
      setOnline(false);
      if (offlineTimerRef.current) clearTimeout(offlineTimerRef.current);
      offlineTimerRef.current = setTimeout(() => {
        offlineTimerRef.current = null;
        toast.push({
          message: "You're offline — your changes are being saved and will sync automatically.",
        });
        if (!shownThisEpisodeRef.current) {
          shownThisEpisodeRef.current = true;
          setOfflineModalOpen(true);
        }
      }, OFFLINE_DEBOUNCE_MS);
    };

    const onOnline = async () => {
      const ok = await probeReachability({ force: true });
      if (ok) markOnlineAndFlush();
      else markOffline();
    };

    const onOffline = () => {
      markOffline();
    };

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    // Periodic Supabase reachability — catches captive/broken airfield links
    // where navigator.onLine stays true.
    const poll = window.setInterval(async () => {
      const ok = await probeReachability({ force: true });
      if (ok && !onlineRef.current) markOnlineAndFlush();
      else if (!ok && onlineRef.current) markOffline();
    }, REACHABILITY_POLL_MS);

    // Boot: probe then flush when actually reachable.
    probeReachability({ force: true }).then((ok) => {
      onlineRef.current = ok;
      setOnline(ok);
      if (ok) flushQueue(queueHandlers).catch(() => {});
    });
    if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.clearInterval(poll);
      if (offlineTimerRef.current) clearTimeout(offlineTimerRef.current);
    };
  }, [toast]);

  useEffect(() => {
    setNavOpen(false);
  }, [location.pathname]);

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
      <OfflineModal open={offlineModalOpen} onDismiss={() => setOfflineModalOpen(false)} />
    </div>
  );
}
