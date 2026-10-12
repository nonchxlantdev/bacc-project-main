/**
 * One-time copy of the portal's CONFIGURATION from Supabase into D1:
 * schedule rules (checklist_assignment_rules) and saved Settings. Run at the
 * 3c cutover — not before — so it picks up the latest settings.
 *
 *   npm run d1:import-config                 # into local D1 (rehearsal)
 *   npm run d1:import-config -- --remote     # into PRODUCTION D1
 *
 * Asks for the Supabase service-role key at a hidden prompt (never written to
 * disk or shell history). Shows a dry run and asks before writing. Safe to run
 * again: rules upsert by their original id, settings by section.
 *
 * Records (checklists, incidents…) are NOT copied — D1 starts fresh.
 */
import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import readline from 'node:readline/promises';
import { pathToFileURL } from 'node:url';
import { askHidden } from './lib/askHidden.mjs';
import { registryKeyByCode } from './lib/registryCodes.mjs';

const FREQUENCIES = new Set(['daily', 'weekly', 'monthly', 'quarterly', 'semi_annual', 'annual', 'on_demand', 'ad_hoc']);
const SETTINGS_ENTITY_ID = '00000000-0000-4000-8000-0000000000a1';

/** Fold the Supabase settings audit trail into current overrides (same logic as the Supabase adapter). */
export function foldSettings(rows) {
  const overrides = {};
  for (const row of rows) {
    const d = row.detail || {};
    if (d.action === 'reset' && d.section) delete overrides[d.section];
    else if (d.section) overrides[d.section] = d.to;
    else if (d.overrides && typeof d.overrides === 'object') Object.assign(overrides, d.overrides);
  }
  return overrides;
}

/** Pure conversion from Supabase rows to what D1 will hold. */
export function planImport({ templates, rules, settingsRows, keyByCode }) {
  const codeById = new Map(templates.map((t) => [t.id, t.code]));
  const plan = { rules: [], skipped: [], cleared: [], settings: foldSettings(settingsRows) };
  for (const r of rules) {
    const code = codeById.get(r.template_id);
    const key = code ? keyByCode.get(code) : null;
    if (!key) {
      plan.skipped.push({ id: r.id, reason: `form ${code ?? r.template_id} is not in the registry` });
      continue;
    }
    if (!FREQUENCIES.has(r.frequency)) {
      plan.skipped.push({ id: r.id, reason: `unknown frequency ${r.frequency}` });
      continue;
    }
    if (r.assigned_user) plan.cleared.push({ id: r.id, code, role: r.role ?? null });
    plan.rules.push({
      id: r.id,
      template_id: key,
      template_version: r.template_version || 'ed01',
      frequency: r.frequency,
      role: r.role ?? null,
      department: r.department ?? null,
      location_id: r.location_id ?? null,
      inspection_type: r.inspection_type ?? null,
    });
  }
  return plan;
}

const q = (v) => (v === null || v === undefined ? 'NULL' : `'${String(v).replaceAll("'", "''")}'`);

export function planToSql(plan, nowIso) {
  const lines = [];
  for (const r of plan.rules) {
    lines.push(
      `INSERT INTO assignment_rules (id, template_id, template_version, frequency, role, department, assigned_user, location_id, inspection_type, active, created_at, updated_at) ` +
        `VALUES (${q(r.id)}, ${q(r.template_id)}, ${q(r.template_version)}, ${q(r.frequency)}, ${q(r.role)}, ${q(r.department)}, NULL, ${q(r.location_id)}, ${q(r.inspection_type)}, 1, ${q(nowIso)}, ${q(nowIso)}) ` +
        `ON CONFLICT(id) DO UPDATE SET template_id = excluded.template_id, template_version = excluded.template_version, frequency = excluded.frequency, ` +
        `role = excluded.role, department = excluded.department, location_id = excluded.location_id, inspection_type = excluded.inspection_type, updated_at = excluded.updated_at;`,
    );
  }
  for (const [section, value] of Object.entries(plan.settings)) {
    const json = JSON.stringify(value ?? null);
    lines.push(
      `INSERT INTO app_settings (section, value_json, updated_at, updated_by) VALUES (${q(section)}, ${q(json)}, ${q(nowIso)}, NULL) ` +
        `ON CONFLICT(section) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at, updated_by = NULL;`,
      `INSERT INTO settings_audit (id, section, action, from_json, to_json, by, by_name, at) VALUES (${q(crypto.randomUUID())}, ${q(section)}, 'import', NULL, ${q(json)}, NULL, 'Imported from Supabase', ${q(nowIso)});`,
    );
  }
  return `${lines.join('\n')}\n`;
}

async function supabaseGet(url, key, pathAndQuery) {
  const res = await fetch(`${url}/rest/v1/${pathAndQuery}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Supabase ${pathAndQuery.split('?')[0]}: ${res.status} ${await res.text()}`);
  return res.json();
}

async function main() {
  const remote = process.argv.includes('--remote');
  const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://ecrgipyebbgrvmkntxqe.supabase.co').replace(/\/$/, '');
  const key = await askHidden('Supabase service-role key (hidden): ');
  if (!key) throw new Error('No key entered.');

  const [templates, rules, settingsRows] = await Promise.all([
    supabaseGet(url, key, 'checklist_templates?select=id,code'),
    supabaseGet(url, key, 'checklist_assignment_rules?select=*'),
    supabaseGet(
      url,
      key,
      `audit_log?select=detail,created_at&entity_type=eq.app_settings&entity_id=eq.${SETTINGS_ENTITY_ID}&order=created_at.asc`,
    ),
  ]);
  const plan = planImport({ templates, rules, settingsRows, keyByCode: registryKeyByCode() });

  console.log(`\nDry run — from ${url}`);
  console.log(`  ${plan.rules.length} schedule rule(s) to copy`);
  console.log(`  ${plan.skipped.length} rule(s) skipped`);
  for (const s of plan.skipped) console.log(`     - ${s.id}: ${s.reason}`);
  console.log(`  ${plan.cleared.length} person assignment(s) cleared (those people are not in the fresh D1 yet; re-assign in Settings)`);
  for (const c of plan.cleared) console.log(`     - ${c.code} (${c.role ?? 'no role'}) rule ${c.id}`);
  console.log(`  ${Object.keys(plan.settings).length} settings section(s): ${Object.keys(plan.settings).join(', ') || '—'}`);

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(`\nWrite to ${remote ? 'PRODUCTION' : 'local'} D1? (y/N) `);
  rl.close();
  if (!/^y(es)?$/i.test(answer.trim())) {
    console.log('Nothing written.');
    return;
  }

  const dir = mkdtempSync(path.join(tmpdir(), 'bacc-import-'));
  const file = path.join(dir, 'import-config.sql');
  try {
    writeFileSync(file, planToSql(plan, new Date().toISOString()));
    execSync(`npx wrangler d1 execute bacc-portal-db ${remote ? '--remote' : '--local'} --file "${file}"`, { stdio: 'inherit' });
    console.log(`\nImported into ${remote ? 'PRODUCTION' : 'local'} D1.`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((err) => {
    console.error(err.message || err);
    process.exit(1);
  });
}
