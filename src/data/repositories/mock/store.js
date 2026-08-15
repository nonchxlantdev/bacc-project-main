import { generateSeed, SEED_VERSION } from '../../seed/generateSeed.js';
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

export function getStore() {
  if (state) return state;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.seedVersion === SEED_VERSION) {
        state = parsed;
        return state;
      }
    }
  } catch {
    /* ignore */
  }
  state = generateSeed();
  persist();
  return state;
}

export function resetStore() {
  state = generateSeed();
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
