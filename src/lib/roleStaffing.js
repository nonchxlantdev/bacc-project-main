/**
 * Which posts on the approved forms nobody holds.
 *
 * Every form names its owner — Apron Supervisor, Crash Fire & Rescue, Civil
 * Engineering Consultant and so on — and BACC has supplied staff for four of
 * those posts. The rest are open questions, and an open question is far more
 * likely to get answered when it is visible in the product than when it is a
 * row in a Word document.
 *
 * So the gap list is derived rather than written down: compare the roles the
 * registry assigns work to against the roles the directory actually holds. Add
 * an account and the gap closes itself; add a form for a new post and the gap
 * opens itself.
 *
 * A demo account does not close a gap. Glenrick Spain is Vision Forge, not
 * PGIA — counting him as staff would hide the very question we are trying to
 * ask.
 *
 * This has nothing to do with who may open a form. Everyone can open every
 * form; see lib/templates.js.
 */

/** The post name as printed on the approved forms. */
export const ROLE_TITLES = {
  om: 'Operations Manager',
  coo: 'Chief Operations Officer',
  duty_manager: 'Duty Manager',
  apron_supervisor: 'Apron Supervisor',
  cfr: 'Crash Fire & Rescue',
  cec: 'Civil Engineering Consultant',
  inspector: 'Maintenance Inspector',
  electrical_tech: 'Electrical Maintenance Technician',
  sms: 'Safety Management System',
  admin: 'Administrator',
};

export function roleTitle(role) {
  return ROLE_TITLES[role] ?? role;
}

export function unstaffedRoles({ assignments = [], users = [] } = {}) {
  const held = new Set(users.filter((u) => !u?.is_demo).map((u) => u?.role));
  const named = new Set(assignments.map((a) => a?.role).filter(Boolean));
  return [...named].filter((role) => !held.has(role)).sort();
}
