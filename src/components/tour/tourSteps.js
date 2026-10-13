/**
 * Pure tour logic: which tour belongs to a route, and which of its steps a role
 * gets. No DOM, no React — unit-tested in tests/tours.test.js.
 */
import { can } from '../../config/access.js';
import { INTRO_TOUR_ID, TOURS } from './tours.js';

export function getTour(id) {
  return TOURS.find((tour) => tour.id === id) ?? null;
}

function matchesPath(pattern, pathname) {
  if (!pattern) return false;
  if (pattern.endsWith('/:id')) {
    const base = pattern.slice(0, -'/:id'.length);
    const rest = pathname.startsWith(`${base}/`) ? pathname.slice(base.length + 1) : '';
    // A record id, not a sibling screen like /checklists/mine or /checklists/all.
    return Boolean(rest) && !rest.includes('/') && !TOURS.some((t) => t.path === `${base}/${rest}`);
  }
  return pathname === pattern;
}

/** The screen tour for `pathname`, if the role may open that screen. */
export function tourForPath(pathname, profile) {
  const path = String(pathname || '').replace(/\/+$/, '') || '/';
  const tour = TOURS.find((t) => t.id !== INTRO_TOUR_ID && matchesPath(t.path, path));
  if (!tour) return null;
  if (tour.screen && !can(profile, tour.screen)) return null;
  return tour;
}

/** Tours the Help page can replay: the welcome tour plus every fixed-path screen the role can open. */
export function replayableTours(profile) {
  return TOURS.filter(
    (t) => t.id === INTRO_TOUR_ID || (t.path && !t.path.includes(':') && (!t.screen || can(profile, t.screen))),
  );
}

/**
 * The tour's steps for this role, with role-dependent bodies resolved.
 * Steps whose `requires` the role lacks are dropped; so are sidebar stops for
 * screens the role is not offered (the sidebar never renders them anyway).
 */
export function stepsFor(tour, profile) {
  if (!tour) return [];
  const ctx = { can: (key) => can(profile, key) };
  return tour.steps
    .filter((step) => !step.requires || can(profile, step.requires))
    .filter((step) => {
      const screen = step.target?.startsWith('nav-') ? step.target.slice(4) : null;
      return !screen || can(profile, screen);
    })
    .map((step) => ({ ...step, body: typeof step.body === 'function' ? step.body(ctx) : step.body }));
}

export function wordCount(text) {
  return String(text || '').trim().split(/\s+/).filter(Boolean).length;
}
