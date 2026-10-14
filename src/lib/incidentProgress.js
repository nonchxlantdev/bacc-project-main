/**
 * The incident page's tick-off list, as pure functions so the rules can be
 * tested without a browser. Status names and the closure gate stay owned by
 * incidentLifecycle.js — this only maps four tick boxes onto that flow:
 *
 *   ☐ Sent to a unit      open        → assigned
 *   ☐ Work started        assigned    → in_progress
 *   ☐ Fixed               in_progress → resolved
 *   ☐ Checked and closed  resolved    → closed
 */
import { incidentStepIndex } from './incidentLifecycle.js';

export const PROGRESS_STEPS = [
  { key: 'sent', label: 'Sent to a unit', status: 'assigned' },
  { key: 'started', label: 'Work started', status: 'in_progress' },
  { key: 'fixed', label: 'Fixed', status: 'resolved' },
  { key: 'closed', label: 'Checked and closed', status: 'closed' },
];

const FLOW = ['open', 'assigned', 'in_progress', 'resolved', 'closed'];

/**
 * One row per step. A box is enabled once the step above it is ticked; only
 * the latest ticked box can be unticked, and nothing moves once closed.
 */
export function progressSteps(incident) {
  const reached = incidentStepIndex(incident?.status); // 0 (open) … 4 (closed)
  const closed = incident?.status === 'closed';
  return PROGRESS_STEPS.map((step, i) => ({
    ...step,
    done: reached >= i + 1,
    enabled: !closed && reached >= i,
    canUntick: !closed && reached === i + 1 && step.key !== 'closed',
  }));
}

/** Unticking a step returns the incident to the status before it. */
export function statusAfterUntick(stepKey) {
  const i = PROGRESS_STEPS.findIndex((s) => s.key === stepKey);
  return i < 0 ? null : FLOW[i];
}

/** Step 1 ticks itself: Open becomes Assigned once a unit and a due date are both set. */
export function withAutoAssign(incident) {
  if (incident.status === 'open' && incident.assigned_unit && incident.target_date) {
    return { ...incident, status: 'assigned' };
  }
  if (incident.status === 'assigned' && !incident.assigned_unit) {
    return { ...incident, status: 'open' };
  }
  return incident;
}

/**
 * Tick a unit (one at a time) or clear it. `assigned_at` is stamped when a unit
 * is first named and survives reassignment — the clock started when the work
 * left the manager's desk.
 */
export function applyUnitChoice(incident, unit, nowIso) {
  const next = {
    ...incident,
    assigned_unit: unit || null,
    assigned_at: unit ? incident.assigned_at ?? nowIso : null,
  };
  return withAutoAssign(next);
}

/** Once work has started the unit can be changed but not removed. */
export function canClearUnit(incident) {
  return incident?.status === 'open' || incident?.status === 'assigned';
}
