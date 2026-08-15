import { readFileSync, writeFileSync } from 'node:fs';

const schema = readFileSync('src/data/checklists/annex-d-drainage.json', 'utf8').trim();
const fieldMap = readFileSync('src/data/field-maps/annex-d-drainage-ed01.json', 'utf8').trim();

const sql = `-- Seed Annex D (PGIA-PMM-F04 / ed01) from local JSON artifacts. Idempotent on (code, version).

insert into public.checklist_templates (
  code, version, title, annex_label, document_family, department,
  content_schema, field_map, base_pdf_path, effective_date, status
) values (
  'PGIA-PMM-F04',
  'ed01',
  'Drainage System Inspection Checklist',
  'Annex D',
  'PMM',
  'Maintenance',
  $schema$${schema}$schema$::jsonb,
  $map$${fieldMap}$map$::jsonb,
  'annex-d-drainage-ed01.pdf',
  '2026-03-12',
  'active'
)
on conflict (code, version) do update set
  title = excluded.title,
  content_schema = excluded.content_schema,
  field_map = excluded.field_map,
  base_pdf_path = excluded.base_pdf_path,
  status = 'active';

insert into public.checklist_assignment_rules (template_id, department, role, frequency, inspection_type)
select id, 'Maintenance', 'inspector', 'monthly', 'monthly_routine'
from public.checklist_templates
where code = 'PGIA-PMM-F04' and version = 'ed01'
and not exists (
  select 1 from public.checklist_assignment_rules r
  where r.template_id = checklist_templates.id and r.role = 'inspector'
);
`;

writeFileSync('supabase/migrations/004_seed_annex_d.sql', sql);
console.log('wrote 004_seed_annex_d.sql');
