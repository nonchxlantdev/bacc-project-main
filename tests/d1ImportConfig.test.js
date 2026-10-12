import test from 'node:test';
import assert from 'node:assert/strict';
import { foldSettings, planImport, planToSql } from '../scripts/d1-import-config.mjs';
import { createSqliteD1 } from './helpers/sqliteD1.js';

const keyByCode = new Map([['PGIA-PMM-F04', 'annex-d-drainage']]);
const templates = [
  { id: 'tpl-d', code: 'PGIA-PMM-F04' },
  { id: 'tpl-x', code: 'RETIRED-FORM' },
];
const rules = [
  { id: 'r1', template_id: 'tpl-d', frequency: 'monthly', role: 'inspector', department: 'Maintenance', assigned_user: 'old-uuid' },
  { id: 'r2', template_id: 'tpl-x', frequency: 'monthly' },
  { id: 'r3', template_id: 'tpl-d', frequency: 'fortnightly' },
  { id: "r'4", template_id: 'tpl-d', frequency: 'ad_hoc', role: "o'brien" },
];
const settingsRows = [
  { detail: { section: 'alerts', action: 'save', to: { a: 1 } } },
  { detail: { section: 'lookups', action: 'save', to: { b: 2 } } },
  { detail: { section: 'alerts', action: 'save', to: { a: 3 } } },
  { detail: { section: 'lookups', action: 'reset' } },
];

test('settings fold matches the Supabase adapter', () => {
  assert.deepEqual(foldSettings(settingsRows), { alerts: { a: 3 } });
});

test('rules map to registry keys; unknown forms and frequencies are skipped; people cleared', () => {
  const plan = planImport({ templates, rules, settingsRows, keyByCode });
  assert.deepEqual(plan.rules.map((r) => [r.id, r.template_id]), [['r1', 'annex-d-drainage'], ["r'4", 'annex-d-drainage']]);
  assert.deepEqual(plan.skipped.map((s) => s.id), ['r2', 'r3']);
  assert.deepEqual(plan.cleared.map((c) => c.id), ['r1']);
});

test('the generated SQL applies to D1 and is idempotent', async () => {
  const db = createSqliteD1();
  const run = () => planToSql(planImport({ templates, rules, settingsRows, keyByCode }), '2026-10-09T00:00:00.000Z');
  await db.exec(run());
  await db.exec(run()); // a second run (fresh audit ids) changes nothing but the trail
  const rows = (await db.prepare('SELECT id, template_id, assigned_user, role FROM assignment_rules ORDER BY id').all()).results;
  assert.deepEqual(rows, [
    { id: "r'4", template_id: 'annex-d-drainage', assigned_user: null, role: "o'brien" },
    { id: 'r1', template_id: 'annex-d-drainage', assigned_user: null, role: 'inspector' },
  ]);
  const settings = await db.prepare('SELECT value_json FROM app_settings WHERE section = ?1').bind('alerts').first();
  assert.deepEqual(JSON.parse(settings.value_json), { a: 3 });
  const audits = await db.prepare("SELECT COUNT(*) AS c FROM settings_audit WHERE action = 'import'").first();
  assert.equal(audits.c, 2); // one section, imported twice
});
