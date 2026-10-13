/**
 * Who can open which screen, and which role-dependent capabilities a screen
 * should offer. The sidebar, the Settings admin sections, the /users route
 * guard and the guided tours all read this one map.
 *
 * It mirrors the Worker's rules — `worker/auth/permissions.js` (MANAGERS for
 * user management) and `worker/data/rules.js` (MANAGERS / SUPERVISORS) — and
 * tests/access.test.js fails if the two drift apart. The server is still the
 * gate: this file only decides what the menus offer, so nobody is invited into
 * a screen that would refuse them.
 *
 * Pure data and functions, no Vite-only imports, so Node tests can load it.
 */

export const ROLES = ['inspector', 'om', 'coo', 'duty_manager', 'apron_supervisor', 'electrical_tech', 'sms', 'admin'];

/** OM and administrator: user management, settings writes, acknowledgment. */
export const MANAGERS = Object.freeze(['om', 'admin']);
/** OM, COO and administrator: see every incident, approval and schedule row. */
export const SUPERVISORS = Object.freeze(['om', 'coo', 'admin']);

const EVERYONE = '*';

/** Screens, in sidebar order. `roles` is EVERYONE or a list of roles. */
export const SCREENS = Object.freeze({
  dashboard: { path: '/dashboard', label: 'Dashboard', roles: EVERYONE },
  checklistsMine: { path: '/checklists/mine', label: 'My Checklists', roles: EVERYONE },
  checklistsAll: { path: '/checklists/all', label: 'All Checklists', roles: EVERYONE },
  incidents: { path: '/incidents', label: 'Incidents', roles: EVERYONE },
  approvals: { path: '/approvals', label: 'Approvals', roles: EVERYONE },
  reports: { path: '/reports', label: 'Reports', roles: EVERYONE },
  locations: { path: '/locations', label: 'Locations', roles: EVERYONE },
  users: { path: '/users', label: 'Users', roles: MANAGERS },
  settings: { path: '/settings', label: 'Settings', roles: EVERYONE },
  help: { path: '/help', label: 'Help', roles: EVERYONE },
});

/** Capabilities inside a screen. */
export const CAPABILITIES = Object.freeze({
  /** Airport-wide Settings sections (deficiency levels, scheduling, users & roles…). */
  orgSettings: MANAGERS,
  /** Every incident and every approval, not just one's own or assigned. */
  seeAll: SUPERVISORS,
  /** Acknowledge a submitted checklist from Approvals. */
  acknowledge: MANAGERS,
});

function roleOf(subject) {
  if (!subject) return null;
  return typeof subject === 'string' ? subject : subject.role ?? null;
}

function allowed(roles, role) {
  if (roles === EVERYONE) return Boolean(role);
  return Boolean(role) && roles.includes(role);
}

/**
 * `can(profile, 'users')` — a screen key or a capability key. Takes a profile
 * (anything with `role`) or a bare role string. Unknown keys are refused.
 */
export function can(subject, key) {
  const role = roleOf(subject);
  if (SCREENS[key]) return allowed(SCREENS[key].roles, role);
  if (CAPABILITIES[key]) return allowed(CAPABILITIES[key], role);
  return false;
}

/** The screen key whose path is `pathname` or a parent of it, if any. */
export function screenForPath(pathname) {
  const path = String(pathname || '');
  return (
    Object.entries(SCREENS).find(([, s]) => path === s.path || path.startsWith(`${s.path}/`))?.[0] ?? null
  );
}
