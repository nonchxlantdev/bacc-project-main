import { generateSeed, SEED_VERSION } from '../../seed/generateSeed.js';
import { applyShowcase } from '../../seed/generateShowcase.js';
import { refreshInstanceStatuses } from '../../../lib/instanceGeneration.js';
import { airportIso, airportYmd } from '../../../lib/belizeTime.js';

const STORAGE_KEY = 'bacc-demo-store';
let state = null;
const listeners = new Set();

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function subscribeStore(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit() {
  for (const fn of listeners) fn();
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* quota — keep memory */
  }
}

/**
 * The form catalogue is configuration, not saved data.
 *
 * `templates` and `assignment_rules` are derived from TEMPLATE_REGISTRY, but a
 * saved snapshot froze whatever the registry held on the day it was written. So
 * adding an approved form left every browser that already held a snapshot
 * unable to see it — no error, no warning, the form simply was not there. The
 * SMS hazard report was added, every gate passed, and it was invisible in the
 * running app, because the tests start from cleared storage and never meet a
 * stale snapshot.
 *
 * Rebuilding these two collections on load fixes that at the cause: a new form
 * appears on the next refresh, with no version bump and without discarding
 * anything anyone has filed. Template and rule ids are deterministic and forms
 * are appended to the registry, so a submission's `template_id` still resolves
 * to the same form it always did.
 */
function withCurrentCatalogue(snapshot) {
  const fresh = generateSeed();
  const sameCatalogue =
    snapshot.templates?.length === fresh.templates.length &&
    snapshot.assignment_rules?.length === fresh.assignment_rules.length;
  if (sameCatalogue) return snapshot;
  return { ...snapshot, templates: fresh.templates, assignment_rules: fresh.assignment_rules };
}

export function getStore() {
  if (state) return state;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.seedVersion === SEED_VERSION) {
        state = withCurrentCatalogue(parsed);
        persist();
        return state;
      }
    }
  } catch {
    /* ignore */
  }
  state = generateSeed();
  if (import.meta.env.VITE_SHOWCASE === 'true') {
    applyShowcase(state);
  }
  persist();
  return state;
}

export function loadShowcaseData() {
  return mutateStore((s) => applyShowcase(s));
}

export function resetStore() {
  state = generateSeed();
  if (import.meta.env.VITE_SHOWCASE === 'true') {
    applyShowcase(state);
  }
  persist();
  emit();
  return state;
}

export function mutateStore(updater) {
  const current = getStore();
  state = updater(current) || current;
  persist();
  emit();
  return state;
}

export function nowMs() {
  return Date.parse(getStore().demoNow);
}

export function advanceClock(days) {
  return mutateStore((s) => {
    const nextMs = Date.parse(s.demoNow) + days * 86400000;
    const ymd = airportYmd(nextMs);
    s.demoNow = airportIso(ymd, '12:00:00.000');
    s.instances = refreshInstanceStatuses(s.instances, nextMs);
    return s;
  });
}

export function snapshot() {
  return clone(getStore());
}
