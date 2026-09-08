/**
 * Wipe operational data from the live Supabase project so the portal is empty.
 *
 * Keeps: profiles, auth users, checklist_templates, assignment_rules,
 *        profile_signatures, organisation/settings audit rows (optional wipe below).
 * Clears: submissions, items, signoffs, incidents, work orders, approvals,
 *         notifications, instances, year counters, related audit/storage.
 *
 * Usage:
 *   $env:NODE_OPTIONS='--use-system-ca'
 *   node scripts/clear-supabase-operational-data.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function loadEnvLocal() {
  const file = path.join(root, '.env.local');
  if (!existsSync(file)) return {};
  const raw = readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
  return Object.fromEntries(
    raw
      .split(/\r?\n/)
      .filter((l) => l && !l.startsWith('#') && l.includes('='))
      .map((l) => {
        const i = l.indexOf('=');
        return [l.slice(0, i).trim(), l.slice(i + 1)];
      }),
  );
}

const env = { ...loadEnvLocal(), ...process.env };
const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL || '';
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!url || !serviceKey) {
  console.error('Need SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** Delete every row. Prefer a always-true filter PostgREST accepts. */
async function wipe(table, filter = { column: 'id', op: 'not.is', value: null }) {
  let q = admin.from(table).delete();
  if (filter.op === 'not.is') q = q.not(filter.column, 'is', filter.value);
  else if (filter.op === 'gte') q = q.gte(filter.column, filter.value);
  else if (filter.op === 'neq') q = q.neq(filter.column, filter.value);

  const { error, count } = await q.select('*', { count: 'exact', head: true });
  // Re-run without head to actually delete — supabase-js delete+select count is awkward.
  // Do a plain delete with the same filter.
  let del = admin.from(table).delete();
  if (filter.op === 'not.is') del = del.not(filter.column, 'is', filter.value);
  else if (filter.op === 'gte') del = del.gte(filter.column, filter.value);
  else if (filter.op === 'neq') del = del.neq(filter.column, filter.value);

  const res = await del;
  if (res.error) {
    // Table may not exist yet on a lean schema.
    if (/does not exist|Could not find the table/i.test(res.error.message)) {
      console.log(`  skip  ${table} (missing)`);
      return 0;
    }
    throw new Error(`${table}: ${res.error.message}`);
  }
  void count;
  void error;
  console.log(`  wiped ${table}`);
  return 1;
}

async function countRows(table) {
  const { count, error } = await admin.from(table).select('*', { count: 'exact', head: true });
  if (error) return null;
  return count ?? 0;
}

console.log(`Clearing operational data on ${url}…\n`);

const before = {
  submissions: await countRows('checklist_submissions'),
  incidents: await countRows('incidents'),
  approvals: await countRows('approvals'),
  instances: await countRows('checklist_instances'),
  notifications: await countRows('notifications'),
};
console.log('Before:', before);

// Prefer the DB helper (bypasses lock triggers). Fall back to row deletes.
const { data: rpcResult, error: rpcError } = await admin.rpc('clear_operational_data');
if (!rpcError) {
  console.log('\nCleared via clear_operational_data():', rpcResult);
  process.exit(0);
}

console.warn(
  `RPC unavailable (${rpcError.message}). Falling back to row deletes.\n` +
    'If locked submissions remain, run scripts/apply-clean-slate-and-om-delete.sql in the SQL Editor.\n',
);

// Child → parent order
const tables = [
  { name: 'incident_attachments', filter: { column: 'id', op: 'not.is', value: null } },
  { name: 'incident_updates', filter: { column: 'id', op: 'not.is', value: null } },
  { name: 'work_order_signoffs', filter: { column: 'id', op: 'not.is', value: null } },
  { name: 'work_orders', filter: { column: 'id', op: 'not.is', value: null } },
  { name: 'incidents', filter: { column: 'id', op: 'not.is', value: null } },
  { name: 'approvals', filter: { column: 'id', op: 'not.is', value: null } },
  { name: 'notifications', filter: { column: 'id', op: 'not.is', value: null } },
  { name: 'checklist_signoffs', filter: { column: 'id', op: 'not.is', value: null } },
  { name: 'checklist_items', filter: { column: 'id', op: 'not.is', value: null } },
  { name: 'checklist_submissions', filter: { column: 'id', op: 'not.is', value: null } },
  { name: 'checklist_instances', filter: { column: 'id', op: 'not.is', value: null } },
  // Year counters — wipe so INC-/WO- numbers restart at 1
  { name: 'incident_year_counters', filter: { column: 'year', op: 'gte', value: 0 } },
  { name: 'work_order_year_counters', filter: { column: 'year', op: 'gte', value: 0 } },
];

for (const t of tables) {
  if (t.name === 'checklist_submissions') {
    // Trigger blocks delete of locked/submitted rows — unlock first.
    const { error: unlockErr } = await admin
      .from('checklist_submissions')
      .update({ locked: false, status: 'draft' })
      .not('id', 'is', null);
    if (unlockErr) {
      console.warn('  unlock submissions:', unlockErr.message);
    } else {
      console.log('  unlocked checklist_submissions');
    }
  }
  await wipe(t.name, t.filter);
}

// Operational audit rows (keep app_settings overrides)
{
  const { error } = await admin
    .from('audit_log')
    .delete()
    .in('entity_type', [
      'checklist_submission',
      'incident',
      'work_order',
      'approval',
      'notification',
      'checklist_instance',
    ]);
  if (error && !/does not exist/i.test(error.message)) {
    console.warn('  audit_log partial wipe:', error.message);
  } else if (!error) {
    console.log('  wiped audit_log (operational entity types)');
  }
}

// Storage: incident / checklist evidence buckets if present
for (const bucket of ['incidents', 'checklist-photos', 'photos', 'attachments']) {
  try {
    const { data: files, error } = await admin.storage.from(bucket).list('', { limit: 1000 });
    if (error) {
      if (!/not found|does not exist/i.test(error.message)) {
        console.warn(`  storage ${bucket}:`, error.message);
      }
      continue;
    }
    const paths = (files || []).map((f) => f.name).filter(Boolean);
    if (!paths.length) {
      console.log(`  storage ${bucket}: empty`);
      continue;
    }
    // list is shallow — also try common prefixes
    const { error: remErr } = await admin.storage.from(bucket).remove(paths);
    if (remErr) console.warn(`  storage ${bucket} remove:`, remErr.message);
    else console.log(`  storage ${bucket}: removed ${paths.length} top-level object(s)`);
  } catch (err) {
    console.warn(`  storage ${bucket}:`, err.message);
  }
}

const after = {
  submissions: await countRows('checklist_submissions'),
  incidents: await countRows('incidents'),
  approvals: await countRows('approvals'),
  instances: await countRows('checklist_instances'),
  notifications: await countRows('notifications'),
  templates: await countRows('checklist_templates'),
  profiles: await countRows('profiles'),
};
console.log('\nAfter:', after);
console.log('Kept templates and profiles. Refresh the app — it should be a clean slate.');
