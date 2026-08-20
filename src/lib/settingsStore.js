import { SETTINGS_DEFAULTS } from '../config/settingsDefaults.js';

/**
 * The repository is imported lazily, not at module scope, to break a cycle:
 * the repositories import `deficiencyLevels.js`, which imports this file. A
 * static import would make one of the three modules read the others before they
 * had finished evaluating, and which one lost would depend on bundler ordering.
 */
async function repo() {
  const { getRepos } = await import('../data/repositories/index.js');
  return getRepos().settings;
}

/**
 * The one place settings live in memory.
 *
 * ── Why a module-level cache ─────────────────────────────────────────────────
 * `getDeficiencyLevel()`, `slaState()` and `ruleFor()` are called synchronously
 * from eight files, several of them inside render. Making them async would turn
 * every one of those call sites into a loading state for a value that cannot
 * change mid-render. So settings are loaded once at boot and held here, and the
 * helpers read this synchronously.
 *
 * This is deliberately the only mutable module-level value in the app. It is
 * write-once-per-save, never written during render, and `subscribe` exists so
 * React re-renders when it changes rather than components reading it at random
 * moments and disagreeing with each other.
 */

let cache = SETTINGS_DEFAULTS;
const listeners = new Set();

/**
 * Merge one level deep, per section.
 *
 * Deeper merging would be wrong for the arrays here: if BACC delete a
 * deficiency category, a deep merge would resurrect it from the defaults. A
 * saved section replaces its default wholesale; an unsaved one falls through.
 */
function merge(overrides) {
  const next = {};
  for (const [section, defaults] of Object.entries(SETTINGS_DEFAULTS)) {
    next[section] = { ...defaults, ...(overrides?.[section] ?? {}) };
  }
  return next;
}

/** Current settings. Safe to call during render. */
export function getSettings() {
  return cache;
}

export function getSection(section) {
  return cache[section] ?? SETTINGS_DEFAULTS[section];
}

export function subscribeSettings(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function publish(next) {
  cache = next;
  for (const listener of listeners) listener(cache);
}

/** Load persisted overrides. Called once at boot, before the app renders. */
export async function loadSettings() {
  try {
    publish(merge(await (await repo()).get()));
  } catch {
    // A settings read failing must not stop the app booting — the shipped
    // defaults are a working configuration, which is the point of having them.
    publish(merge(null));
  }
  return cache;
}

/**
 * Save one section and publish the result.
 *
 * `actor` is recorded in the audit trail. Section-at-a-time rather than
 * whole-object so two people editing different sections cannot overwrite each
 * other's work with a stale copy of the rest.
 */
export async function saveSection(section, value, actor) {
  const overrides = await (await repo()).save({ section, value, actor });
  publish(merge(overrides));
  return cache[section];
}

/** Drop a section's overrides and fall back to the shipped defaults. */
export async function resetSection(section, actor) {
  const overrides = await (await repo()).resetSection({ section, actor });
  publish(merge(overrides));
  return cache[section];
}

export async function settingsAudit() {
  return (await repo()).audit();
}
