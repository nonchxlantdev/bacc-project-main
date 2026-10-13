import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { INTRO_TOUR_ID } from './tours.js';
import { getTour, replayableTours, stepsFor, tourForPath } from './tourSteps.js';
import {
  hasSeen,
  markSeen,
  mergeSeen,
  readLocalSeen,
  sameSeen,
  sanitizeSeen,
  writeLocalSeen,
} from './tourProgress.js';

/**
 * Decides when a guided tour runs and remembers who has seen what.
 *
 * - Welcome tour once after sign-in, then each screen's guide the first time
 *   that screen opens. One tour at a time, never over a dialog.
 * - Skipping the welcome tour pauses screen guides for the rest of the session.
 * - A screen opened at a Help answer (/help#group) gets the answer, no guide.
 * - Replays come from Help (startTour) and the Help menu (startPageTour).
 * - Automated browsers (navigator.webdriver) get no automatic tours, so the
 *   QA harness and walkthrough scripts are not blocked by an overlay; manual
 *   replays still work there.
 *
 * Content is in tours.js, role filtering in tourSteps.js, storage in
 * tourProgress.js, drawing in driverAdapter.js (loaded on first use).
 */

const TourContext = createContext(null);

const PAUSE_KEY = 'bacc-tours-paused';
const TARGET_WAIT_MS = 3000;
const AUTO_DELAY_MS = 700;
const BLOCKED_RETRY_MS = 500;
const DRAWER_MS = 260;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function isPhoneNav() {
  try {
    return !window.matchMedia('(min-width: 768px)').matches;
  } catch {
    return false;
  }
}

function isAutomated() {
  try {
    return Boolean(navigator.webdriver);
  } catch {
    return false;
  }
}

function sessionPaused() {
  try {
    return sessionStorage.getItem(PAUSE_KEY) === '1';
  } catch {
    return false;
  }
}

function pauseSession() {
  try {
    sessionStorage.setItem(PAUSE_KEY, '1');
  } catch {
    // Without session storage the pause lasts until the next page load.
  }
}

/** A dialog, picker or the phone drawer is up — a tour would sit on top of it. */
function blockingLayerOpen() {
  return Boolean(
    document.querySelector(
      '[role="dialog"]:not(.driver-popover), [aria-modal="true"]:not(.driver-popover), .fixed.inset-0.z-50, .fixed.inset-0.z-30',
    ),
  );
}

function isShown(el) {
  if (!el || !el.isConnected) return false;
  if (el.getClientRects().length === 0) return false;
  return getComputedStyle(el).visibility !== 'hidden';
}

/** First matching element that is actually on screen; a drawer item counts on a phone. */
function findTarget(step, phone) {
  const all = document.querySelectorAll(`[data-tour="${CSS.escape(step.target)}"]`);
  for (const el of all) if (isShown(el)) return el;
  if (phone && step.needsNav && all.length) return all[0];
  return null;
}

/** Wait (briefly) for lazy screens to render, then keep only steps whose target is there. */
async function resolveSteps(steps, phone, isCancelled) {
  const started = Date.now();
  for (;;) {
    const missing = steps.filter((s) => s.target && !findTarget(s, phone));
    if (missing.length === 0 || Date.now() - started >= TARGET_WAIT_MS || isCancelled()) break;
    await wait(150);
  }
  return steps
    .map((s) => (s.target ? { ...s, element: findTarget(s, phone) } : s))
    .filter((s) => !s.target || s.element);
}

export function TourProvider({ navOpen, setNavOpen, children }) {
  const { user, profile, authMode, updateProfile } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const userId = user?.id ?? null;
  const onD1 = authMode === 'd1';

  const [seen, setSeen] = useState(() => readLocalSeen(userId));
  const [ready, setReady] = useState(false);
  const [activeId, setActiveId] = useState(null);

  const seenRef = useRef(seen);
  const runnerRef = useRef(null);
  const activeRef = useRef(null);
  const navOpenRef = useRef(navOpen);
  const pendingRef = useRef(null);
  const syncedForRef = useRef(null);
  const profileRef = useRef(profile);
  const updateProfileRef = useRef(updateProfile);

  navOpenRef.current = navOpen;
  profileRef.current = profile;
  updateProfileRef.current = updateProfile;

  // Load progress once per signed-in account: this browser's cache merged with
  // the account's copy. Anything the cache has that the account lacks (a mark
  // made offline) is pushed up.
  useEffect(() => {
    if (!userId || !profile || syncedForRef.current === userId) return;
    syncedForRef.current = userId;
    const server = onD1 ? sanitizeSeen(profile.tours_seen) : {};
    const merged = mergeSeen(readLocalSeen(userId), server);
    seenRef.current = merged;
    setSeen(merged);
    writeLocalSeen(userId, merged);
    if (onD1 && !sameSeen(merged, server)) {
      updateProfileRef.current?.({ tours_seen: merged }).catch(() => {});
    }
    setReady(true);
  }, [userId, profile, onD1]);

  const persist = useCallback(
    (tour) => {
      const next = markSeen(seenRef.current, tour);
      seenRef.current = next;
      setSeen(next);
      writeLocalSeen(userId, next);
      if (onD1) updateProfileRef.current?.({ tours_seen: next }).catch(() => {});
    },
    [userId, onD1],
  );

  const setDrawer = useCallback(
    async (open) => {
      if (!isPhoneNav() || navOpenRef.current === open) return;
      setNavOpen?.(open);
      navOpenRef.current = open;
      await wait(DRAWER_MS);
    },
    [setNavOpen],
  );

  const drainPendingRef = useRef(null);

  const startTour = useCallback(
    async (id, { auto = false } = {}) => {
      const tour = getTour(id);
      if (!tour || activeRef.current) return false;
      activeRef.current = id;
      setActiveId(id);
      let cancelled = false;
      // Registered before the (up to 3 s) wait for targets, so a route change
      // during the wait cancels this start instead of drawing on a stale page.
      runnerRef.current = {
        stop: () => {
          cancelled = true;
        },
      };
      const release = () => {
        runnerRef.current = null;
        activeRef.current = null;
        setActiveId(null);
      };

      const phone = isPhoneNav();
      const steps = await resolveSteps(stepsFor(tour, profileRef.current), phone, () => cancelled);
      if (cancelled || steps.length === 0 || (auto && blockingLayerOpen())) {
        release();
        return false;
      }
      const { runTour } = await import('./driverAdapter.js');
      if (cancelled) {
        release();
        return false;
      }
      runnerRef.current = runTour({
        steps,
        beforeStep: (step) => setDrawer(Boolean(step?.needsNav)),
        onFaq: (group) => navigate(`/help#${group}`),
        onEnd: (reason) => {
          release();
          setDrawer(false);
          if (reason === 'interrupted') return;
          persist(tour);
          if (tour.id === INTRO_TOUR_ID && reason === 'skipped') pauseSession();
          if (tour.id === INTRO_TOUR_ID && reason === 'done') {
            // "Next, a quick look at this screen."
            const next = tourForPath(window.location.pathname, profileRef.current);
            if (next && !hasSeen(seenRef.current, next)) {
              pendingRef.current = next.id;
              setTimeout(() => drainPendingRef.current?.(), 300);
            }
          }
        },
      });
      return true;
    },
    [navigate, persist, setDrawer],
  );

  drainPendingRef.current = () => {
    const id = pendingRef.current;
    if (!id || activeRef.current) return;
    const tour = getTour(id);
    if (tour?.path && !tour.path.includes(':') && window.location.pathname !== tour.path) return;
    pendingRef.current = null;
    startTour(id);
  };

  // A route change ends whatever tour was running (it was pointing at the old screen).
  useEffect(() => {
    return () => runnerRef.current?.stop?.();
  }, [location.pathname]);

  // Requested replays (Help page) wait for the navigation they asked for.
  useEffect(() => {
    if (!pendingRef.current) return undefined;
    const timer = setTimeout(() => drainPendingRef.current?.(), 250);
    return () => clearTimeout(timer);
  }, [location.pathname]);

  // First-time tours.
  useEffect(() => {
    if (!ready || !profile || isAutomated()) return undefined;
    let stopped = false;
    let timer = null;

    function pick() {
      const intro = getTour(INTRO_TOUR_ID);
      if (!hasSeen(seenRef.current, intro)) return intro;
      if (sessionPaused()) return null;
      // Opened at a specific answer ("More in Help", /help#incidents): show
      // the answer, not a guide on top of it.
      if (location.hash) return null;
      const page = tourForPath(location.pathname, profileRef.current);
      return page && !hasSeen(seenRef.current, page) ? page : null;
    }

    function attempt() {
      if (stopped || activeRef.current || pendingRef.current) return;
      const tour = pick();
      if (!tour) return;
      if (blockingLayerOpen()) {
        timer = setTimeout(attempt, BLOCKED_RETRY_MS);
        return;
      }
      startTour(tour.id, { auto: true }).then((started) => {
        if (!started && !stopped && blockingLayerOpen()) timer = setTimeout(attempt, BLOCKED_RETRY_MS);
      });
    }

    timer = setTimeout(attempt, AUTO_DELAY_MS);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [ready, profile, location.pathname, location.hash, startTour]);

  // Unmount (sign-out): close anything still open.
  useEffect(() => () => runnerRef.current?.stop?.(), []);

  const pageTour = tourForPath(location.pathname, profile);

  const value = useMemo(
    () => ({
      activeId,
      seen,
      pageTour,
      replayable: replayableTours(profile),
      /** Run a tour now; a screen tour first opens its screen. */
      replay: (id) => {
        const tour = getTour(id);
        if (!tour || activeRef.current) return;
        if (tour.path && !tour.path.includes(':') && location.pathname !== tour.path) {
          pendingRef.current = id;
          navigate(tour.path);
          return;
        }
        startTour(id);
      },
      /** The guide for whatever screen is open. */
      replayPage: () => {
        if (pageTour) startTour(pageTour.id);
      },
    }),
    [activeId, seen, pageTour, profile, location.pathname, navigate, startTour],
  );

  return <TourContext.Provider value={value}>{children}</TourContext.Provider>;
}

/** Safe outside the provider (login screen, tests): tours are simply unavailable. */
export function useTour() {
  return (
    useContext(TourContext) ?? {
      activeId: null,
      seen: {},
      pageTour: null,
      replayable: [],
      replay: () => {},
      replayPage: () => {},
    }
  );
}
