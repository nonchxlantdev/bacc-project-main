import fs from 'node:fs';

const schema = fs.readFileSync('src/data/checklists/annex-d-drainage.json', 'utf8').trim();

const sql = `-- Seed Annex D from src/data/checklists/annex-d-drainage.json (verbatim).
-- Re-run is idempotent on templates.code.

insert into public.checklist_templates (code, title, annex_label, schema, print_template_key, active)
values (
  'PGIA-PMM-F04',
  'Drainage System Inspection Checklist',
  'Annex D',
  $json$${schema}$json$::jsonb,
  'annex-d-drainage',
  true
)
on conflict (code) do update set
  title = excluded.title,
  annex_label = excluded.annex_label,
  schema = excluded.schema,
  print_template_key = excluded.print_template_key,
  active = true;
`;

fs.writeFileSync('supabase/migrations/004_seed_annex_d.sql', sql);
