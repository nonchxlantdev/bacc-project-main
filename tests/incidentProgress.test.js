import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PROGRESS_STEPS,
  applyUnitChoice,
  canClearUnit,
  progressSteps,
  statusAfterUntick,
  withAutoAssign,
} from '../src/lib/incidentProgress.js';

const at = (status, extra = {}) => ({ status, assigned_unit: null, target_date: null, ...extra });
const byKey = (inc) => Object.fromEntries(progressSteps(inc).map((s) => [s.key, s]));

test('four steps in order', () => {
  assert.deepEqual(PROGRESS_STEPS.map((s) => s.key), ['sent', 'started', 'fixed', 'closed']);
});

test('open: nothing done, only step 1 enabled', () => {
  const s = byKey(at('open'));
  assert.deepEqual(Object.values(s).map((x) => x.done), [false, false, false, false]);
  assert.equal(s.sent.enabled, true);
  assert.equal(s.started.enabled, false);
});

test('in_progress: two done, step 3 enabled, only step 2 can be unticked', () => {
  const s = byKey(at('in_progress'));
  assert.equal(s.sent.done && s.started.done, true);
  assert.equal(s.fixed.enabled, true);
  assert.equal(s.closed.enabled, false);
  assert.equal(s.started.canUntick, true);
  assert.equal(s.sent.canUntick, false);
});

test('closed: everything done, nothing enabled, nothing untickable', () => {
  const s = Object.values(byKey(at('closed')));
  assert.ok(s.every((x) => x.done && !x.enabled && !x.canUntick));
});

test('unticking moves back exactly one status', () => {
  assert.equal(statusAfterUntick('sent'), 'open');
  assert.equal(statusAfterUntick('started'), 'assigned');
  assert.equal(statusAfterUntick('fixed'), 'in_progress');
});

test('open becomes assigned only once unit AND due date are set', () => {
  assert.equal(withAutoAssign(at('open', { assigned_unit: 'grounds' })).status, 'open');
  assert.equal(withAutoAssign(at('open', { target_date: '2026-10-20' })).status, 'open');
  assert.equal(withAutoAssign(at('open', { assigned_unit: 'grounds', target_date: '2026-10-20' })).status, 'assigned');
});

test('clearing the unit while assigned returns to open; later statuses are untouched', () => {
  assert.equal(withAutoAssign(at('assigned')).status, 'open');
  assert.equal(withAutoAssign(at('in_progress')).status, 'in_progress');
});

test('applyUnitChoice stamps assigned_at once and keeps it on reassignment', () => {
  const a = applyUnitChoice(at('open', { target_date: '2026-10-20' }), 'grounds', 'T1');
  assert.equal(a.assigned_unit, 'grounds');
  assert.equal(a.assigned_at, 'T1');
  assert.equal(a.status, 'assigned');
  const b = applyUnitChoice(a, 'electrical', 'T2');
  assert.equal(b.assigned_at, 'T1');
  const c = applyUnitChoice(b, null, 'T3');
  assert.equal(c.assigned_unit, null);
  assert.equal(c.assigned_at, null);
  assert.equal(c.status, 'open');
});

test('the unit can only be cleared before work has started', () => {
  assert.equal(canClearUnit(at('open')), true);
  assert.equal(canClearUnit(at('assigned')), true);
  assert.equal(canClearUnit(at('in_progress')), false);
});
