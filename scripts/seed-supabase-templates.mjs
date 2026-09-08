/**
 * Seed the full approved checklist catalogue into Supabase.
 *
 * Usage:
 *   $env:NODE_OPTIONS='--use-system-ca'
 *   node scripts/seed-supabase-templates.mjs
 *
 * Reads src/data/templates/registry.js metadata + local JSON schemas/field-maps.
 * Upserts checklist_templates on (code, version) and idempotently inserts
 * assignment_rules (on_demand → ad_hoc for the DB check constraint).
 *
 * Does NOT seed fake submissions/incidents — those are created by using the app.
 */
import { createClient } from '@supabase/supabase-js';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
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

/** Parse registry.js for key/family/department/assignments without importing JSON. */
function parseRegistryMeta() {
  const text = readFileSync(path.join(root, 'src/data/templates/registry.js'), 'utf8');
  const start = text.indexOf('export const TEMPLATE_REGISTRY');
  if (start < 0) throw new Error('TEMPLATE_REGISTRY not found');
  const body = text.slice(start);
  const entries = [];
  const blockRe = /\{\s*key:\s*'([^']+)'([\s\S]*?)\n  \},/g;
  let m;
  while ((m = blockRe.exec(body))) {
    const key = m[1];
    const block = m[2];
    const family = block.match(/family:\s*'([^']+)'/)?.[1] ?? null;
    const department = block.match(/department:\s*'([^']+)'/)?.[1] ?? null;
    const version = block.match(/version:\s*'([^']+)'/)?.[1] ?? 'ed01';
    const assignments = [];
    const assignBlock = block.match(/assignments:\s*\[([\s\S]*?)\]/)?.[1] ?? '';
    const assignRe =
      /\{\s*department:\s*'([^']+)',\s*role:\s*'([^']+)',\s*frequency:\s*'([^']+)'\s*\}/g;
    let a;
    while ((a = assignRe.exec(assignBlock))) {
      assignments.push({ department: a[1], role: a[2], frequency: a[3] });
    }
    // Dedupe identical assignment rows (e.g. Annex I)
    const seen = new Set();
    const unique = [];
    for (const row of assignments) {
      const k = `${row.department}|${row.role}|${row.frequency}`;
      if (seen.has(k)) continue;
      seen.add(k);
      unique.push(row);
    }
    entries.push({ key, family, department, version, assignments: unique });
  }
  return entries;
}

function mapFrequency(freq) {
  if (freq === 'on_demand') return 'ad_hoc';
  return freq;
}

function loadTemplateRow(meta) {
  const schemaPath = path.join(root, 'src/data/checklists', `${meta.key}.json`);
  const mapPath = path.join(root, 'src/data/field-maps', `${meta.key}-${meta.version}.json`);
  if (!existsSync(schemaPath)) throw new Error(`Missing schema ${schemaPath}`);
  if (!existsSync(mapPath)) throw new Error(`Missing field map ${mapPath}`);
  const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
  const fieldMap = JSON.parse(readFileSync(mapPath, 'utf8'));
  const pdf = fieldMap.basePdf;
  if (!pdf || /[\\/\0]/.test(pdf) || pdf.includes('..')) {
    throw new Error(`Bad basePdf on ${meta.key}`);
  }
  const pdfPath = path.join(root, 'src/assets/forms', pdf);
  if (!existsSync(pdfPath)) {
    console.warn(`warn: base PDF missing on disk for ${meta.key}: ${pdf}`);
  }
  return {
    code: schema.code,
    version: meta.version,
    title: schema.title,
    annex_label: schema.annexLabel ?? null,
    document_family: meta.family,
    department: meta.department,
    content_schema: schema,
    field_map: fieldMap,
    base_pdf_path: pdf,
    effective_date: null,
    status: 'active',
    _assignments: meta.assignments,
    _key: meta.key,
  };
}

const meta = parseRegistryMeta();
console.log(`Registry entries parsed: ${meta.length}`);

const rows = meta.map(loadTemplateRow);
console.log(`Templates ready: ${rows.length}`);

// Upsert in batches to avoid giant payloads
const BATCH = 5;
for (let i = 0; i < rows.length; i += BATCH) {
  const chunk = rows.slice(i, i + BATCH).map(({ _assignments, _key, ...row }) => row);
  const { error } = await admin.from('checklist_templates').upsert(chunk, {
    onConflict: 'code,version',
  });
  if (error) {
    console.error('template upsert failed', error.message);
    process.exit(1);
  }
  console.log(`upserted templates ${i + 1}–${Math.min(i + BATCH, rows.length)}`);
}

const { data: dbTemplates, error: listError } = await admin
  .from('checklist_templates')
  .select('id, code, version')
  .eq('status', 'active');
if (listError) {
  console.error(listError.message);
  process.exit(1);
}

const byCodeVer = new Map(dbTemplates.map((t) => [`${t.code}|${t.version}`, t]));

const { data: existingRules, error: rulesListError } = await admin
  .from('checklist_assignment_rules')
  .select('id, template_id, department, role, frequency');
if (rulesListError) {
  console.error(rulesListError.message);
  process.exit(1);
}

const existingKey = new Set(
  (existingRules || []).map(
    (r) => `${r.template_id}|${r.department || ''}|${r.role || ''}|${r.frequency || ''}`,
  ),
);

const toInsert = [];
for (const row of rows) {
  const tpl = byCodeVer.get(`${row.code}|${row.version}`);
  if (!tpl) {
    console.warn(`skip rules — template not found ${row.code}`);
    continue;
  }
  for (const a of row._assignments) {
    const frequency = mapFrequency(a.frequency);
    const key = `${tpl.id}|${a.department}|${a.role}|${frequency}`;
    if (existingKey.has(key)) continue;
    existingKey.add(key);
    toInsert.push({
      template_id: tpl.id,
      department: a.department,
      role: a.role,
      location_id: null,
      frequency,
      inspection_type: null,
      due_time: null,
    });
  }
}

if (toInsert.length) {
  const { error } = await admin.from('checklist_assignment_rules').insert(toInsert);
  if (error) {
    console.error('rules insert failed', error.message);
    process.exit(1);
  }
}

console.log(`assignment rules inserted: ${toInsert.length} (skipped existing)`);
console.log(`active templates in DB: ${dbTemplates.length}`);
console.log('Done. Refresh the Vercel app — catalogue should show the full annex set.');
console.log('Incidents / approvals / PDFs work by using the app (no fake showcase rows).');
