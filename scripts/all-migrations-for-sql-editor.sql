-- Combined migrations for Supabase SQL Editor
-- Project: ecrgipyebbgrvmkntxqe
-- Paste into Dashboard → SQL → New query → Run


-- ========== 001_checklist_tables.sql ==========

-- v2 data model (design spec §7). Apply in Supabase; do not run from the app.
-- Submissions pin template_version. Submitted rows are immutable (locked).

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  position text,
  role text not null default 'inspector',
  department text,
  location_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.checklist_templates (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  version text not null,
  title text not null,
  annex_label text,
  document_family text not null,
  department text,
  content_schema jsonb not null,
  field_map jsonb not null,
  base_pdf_path text not null,
  effective_date date,
  status text not null default 'active'
    check (status in ('active','retired')),
  unique (code, version)
);

create table if not exists public.checklist_assignment_rules (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.checklist_templates(id),
  department text,
  role text,
  location_id uuid,
  frequency text check (frequency in
    ('daily','weekly','monthly','quarterly','semi_annual','annual','ad_hoc')),
  inspection_type text,
  due_time time
);

create table if not exists public.checklist_submissions (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.checklist_templates(id),
  template_version text not null,
  location_id uuid,
  inspector_id uuid not null references auth.users(id),
  inspection_type text not null,
  inspection_date date not null,
  rainfall_mm numeric,
  status text not null default 'draft'
    check (status in ('draft','submitted','acknowledged')),
  deficiencies_summary text,
  exported_pdf_path text,
  content_hash text,
  supersedes_id uuid references public.checklist_submissions(id),
  created_at timestamptz not null default now(),
  submitted_at timestamptz,
  locked boolean not null default false
);

create table if not exists public.checklist_items (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.checklist_submissions(id) on delete cascade,
  item_code text not null,
  result text check (result in ('sat','no_sat','na')),
  remarks text,
  photo_url text
);

create table if not exists public.checklist_signoffs (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.checklist_submissions(id) on delete cascade,
  role text not null check (role in ('inspector','om_acknowledgment')),
  name text not null,
  position text,
  signature_image_path text,
  signed_at timestamptz not null default now()
);

create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid not null,
  action text not null,
  actor_id uuid references auth.users(id),
  detail jsonb,
  created_at timestamptz not null default now()
);

alter table public.checklist_items
  drop constraint if exists checklist_items_submission_code_key;
alter table public.checklist_items
  add constraint checklist_items_submission_code_key unique (submission_id, item_code);

alter table public.checklist_signoffs
  drop constraint if exists checklist_signoffs_submission_role_key;
alter table public.checklist_signoffs
  add constraint checklist_signoffs_submission_role_key unique (submission_id, role);

create index if not exists checklist_submissions_inspector_idx
  on public.checklist_submissions (inspector_id, created_at desc);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, position, role, department)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'position', 'Inspector'),
    coalesce(new.raw_user_meta_data->>'role', 'inspector'),
    coalesce(new.raw_user_meta_data->>'department', 'Maintenance')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Immutability: reject updates to locked submissions except export path and OM acknowledgment.
create or replace function public.prevent_locked_submission_mutation()
returns trigger
language plpgsql
as $$
begin
  if old.locked = true then
    if tg_op = 'DELETE' then
      raise exception 'Locked checklist submissions cannot be deleted';
    end if;
    if (to_jsonb(new) - 'exported_pdf_path' - 'status')
         is distinct from (to_jsonb(old) - 'exported_pdf_path' - 'status') then
      raise exception 'Locked checklist submissions cannot be overwritten; create a correction instead';
    end if;
    if new.status is distinct from old.status and new.status <> 'acknowledged' then
      raise exception 'Locked checklist submissions cannot be overwritten; create a correction instead';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists checklist_submissions_immutable on public.checklist_submissions;
create trigger checklist_submissions_immutable
  before update or delete on public.checklist_submissions
  for each row execute procedure public.prevent_locked_submission_mutation();


-- ========== 002_rls_policies.sql ==========

-- v2 RLS. Inspectors read/write their own drafts. OM can acknowledge submitted rows.

alter table public.profiles enable row level security;
alter table public.checklist_templates enable row level security;
alter table public.checklist_assignment_rules enable row level security;
alter table public.checklist_submissions enable row level security;
alter table public.checklist_items enable row level security;
alter table public.checklist_signoffs enable row level security;
alter table public.audit_log enable row level security;

create policy "profiles_select_authenticated"
  on public.profiles for select to authenticated using (true);
create policy "profiles_update_own"
  on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy "templates_select_authenticated"
  on public.checklist_templates for select to authenticated using (true);

create policy "assignment_rules_select_authenticated"
  on public.checklist_assignment_rules for select to authenticated using (true);

create policy "submissions_select_own_or_om"
  on public.checklist_submissions for select to authenticated
  using (
    inspector_id = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('om','admin'))
  );

create policy "submissions_insert_own"
  on public.checklist_submissions for insert to authenticated
  with check (inspector_id = auth.uid());

create policy "submissions_update_own"
  on public.checklist_submissions for update to authenticated
  using (inspector_id = auth.uid())
  with check (inspector_id = auth.uid());

create policy "submissions_delete_own_draft"
  on public.checklist_submissions for delete to authenticated
  using (inspector_id = auth.uid() and locked = false and status = 'draft');

create policy "submissions_om_acknowledge"
  on public.checklist_submissions for update to authenticated
  using (
    locked = true
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('om','admin'))
  )
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('om','admin'))
  );

create policy "items_select_related"
  on public.checklist_items for select to authenticated
  using (
    exists (
      select 1 from public.checklist_submissions s
      where s.id = submission_id
        and (s.inspector_id = auth.uid()
          or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('om','admin')))
    )
  );

create policy "items_write_own_unlocked"
  on public.checklist_items for all to authenticated
  using (
    exists (
      select 1 from public.checklist_submissions s
      where s.id = submission_id and s.inspector_id = auth.uid() and s.locked = false
    )
  )
  with check (
    exists (
      select 1 from public.checklist_submissions s
      where s.id = submission_id and s.inspector_id = auth.uid() and s.locked = false
    )
  );

create policy "signoffs_select_related"
  on public.checklist_signoffs for select to authenticated
  using (
    exists (
      select 1 from public.checklist_submissions s
      where s.id = submission_id
        and (s.inspector_id = auth.uid()
          or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('om','admin')))
    )
  );

create policy "signoffs_insert_related"
  on public.checklist_signoffs for insert to authenticated
  with check (
    exists (
      select 1 from public.checklist_submissions s
      where s.id = submission_id
        and (s.inspector_id = auth.uid()
          or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('om','admin')))
    )
  );

create policy "signoffs_delete_own_unlocked"
  on public.checklist_signoffs for delete to authenticated
  using (
    exists (
      select 1 from public.checklist_submissions s
      where s.id = submission_id and s.inspector_id = auth.uid() and s.locked = false
    )
  );

create policy "audit_insert_own"
  on public.audit_log for insert to authenticated
  with check (actor_id = auth.uid());

create policy "audit_select_own_or_om"
  on public.audit_log for select to authenticated
  using (
    actor_id = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('om','admin'))
  );


-- ========== 003_storage_checklist_photos.sql ==========

-- Storage buckets for photos, drawn signatures, frozen exports, and approved base PDFs.

insert into storage.buckets (id, name, public)
values
  ('checklist-photos', 'checklist-photos', false),
  ('checklist-signatures', 'checklist-signatures', false),
  ('checklist-exports', 'checklist-exports', false),
  ('form-templates', 'form-templates', false)
on conflict (id) do nothing;

-- Objects are stored as {auth.uid()}/{...} except form-templates (read-only for authenticated).

create policy "photos_own"
  on storage.objects for all to authenticated
  using (bucket_id = 'checklist-photos' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'checklist-photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "signatures_own"
  on storage.objects for all to authenticated
  using (bucket_id = 'checklist-signatures' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'checklist-signatures' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "exports_select_own_or_om"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'checklist-exports'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('om','admin'))
    )
  );

create policy "exports_insert_own"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'checklist-exports' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "form_templates_select_authenticated"
  on storage.objects for select to authenticated
  using (bucket_id = 'form-templates');


-- ========== 004_seed_annex_d.sql ==========

-- Seed Annex D (PGIA-PMM-F04 / ed01) from local JSON artifacts. Idempotent on (code, version).

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
  $schema${
  "code": "PGIA-PMM-F04",
  "annexLabel": "Annex D",
  "title": "Drainage System Inspection Checklist",
  "description": "Used for monthly routine drainage inspections and semi-annual CEC structural assessments. Completed form submitted to OM.",
  "manualHeader": {
    "line1": "AERODROME OPERATIONS MANUAL",
    "line2": "PHILIP S.W. GOLDSON INTERNATIONAL AIRPORT",
    "pageRef": "ANNEX 1-1\nPGIA 16-14"
  },
  "footer": {
    "reviewLine": "Review: Ed. 01 Annex 2-1",
    "dateLine": "Date: March 12, 2026. Maintenance Paved and Unpaved Manual.",
    "pages": [110, 111, 112]
  },
  "headerFields": [
    { "key": "date", "label": "Date", "type": "date", "required": true },
    {
      "key": "inspectionType",
      "label": "Inspection Type",
      "type": "radio",
      "required": true,
      "options": [
        { "value": "monthly_routine", "label": "Monthly Routine" },
        { "value": "semi_annual_cec", "label": "Semi-Annual Structural (CEC)" },
        { "value": "post_storm_emergency", "label": "Post-Storm Emergency" }
      ]
    },
    { "key": "conductedBy", "label": "Conducted by (Name / Position)", "type": "text", "required": true },
    { "key": "rainfallMm", "label": "Rainfall lasts 24 hrs. (mm, if applicable)", "type": "text", "required": false }
  ],
  "sections": [
    {
      "title": "SECTION 1 — RUNWAY DRAINAGE",
      "items": [
        { "code": "DR-01", "text": "Runway 07 end drainage swale clear of sediment, vegetation, and debris" },
        { "code": "DR-02", "text": "Runway 25 end drainage swales clear of sediment, vegetation, and debris" },
        { "code": "DR-03", "text": "Runway east edge drainage channel (full length) free of blockage" },
        { "code": "DR-04", "text": "Runway west edge drainage channel (full length) free of blockage" },
        { "code": "DR-05", "text": "Runway drainage outlets water discharging freely to aerodrome drainage network" },
        { "code": "DR-06", "text": "No ponding adjacent to runway edges 1 hour after end of rainfall" },
        { "code": "DR-07", "text": "No erosion channels created by surface water at runway edges" }
      ]
    },
    {
      "title": "SECTION 2 — TAXIWAY DRAINAGE",
      "items": [
        { "code": "DR-08", "text": "Taxiway Alpha drainage channels (east and west) clear, flowing" },
        { "code": "DR-09", "text": "Taxiway Bravo drainage gutters clear" },
        { "code": "DR-10", "text": "Taxiway Charlie drainage gutters clear" },
        { "code": "DR-12", "text": "No standing water on any taxiway surface 30 min after end of rainfall" }
      ]
    },
    {
      "title": "SECTION 3 — APRON DRAINAGE",
      "items": [
        { "code": "DR-13", "text": "All apron drainage channels clear and unobstructed" },
        { "code": "DR-14", "text": "All apron drainage sumps clear and flowing" },
        { "code": "DR-15", "text": "Apron drainage outlets to aerodrome storm network functioning" },
        { "code": "DR-16", "text": "No standing water on apron 30 min after end of rainfall" }
      ]
    },
    {
      "title": "SECTION 4 — CULVERTS AND CROSS-DRAINAGE STRUCTURES",
      "items": [
        { "code": "DR-17", "text": "Culvert at [Location 1] invert clear, headwalls intact, no structural cracking" },
        { "code": "DR-18", "text": "Culvert at [Location 2] invert clear, headwalls intact, no structural cracking" },
        { "code": "DR-19", "text": "Culvert at [Location 3] invert clear, headwalls intact, no structural cracking" },
        { "code": "DR-20", "text": "All identified culverts no sedimentation reducing flow area > 25%" },
        { "code": "DR-21", "text": "All culvert headwalls and wingwalls structurally intact, no separation from embankment" }
      ]
    },
    {
      "title": "SECTION 5 — UNPAVED AREA DRAINAGE (CHANNELS AND SWALES)",
      "items": [
        { "code": "DR-22", "text": "All open channels in runway strips free of vegetation blockage and sediment" },
        { "code": "DR-23", "text": "All open channels in infield areas free of blockage" },
        { "code": "DR-24", "text": "All swale slopes at minimum 1% longitudinal gradient to outlet" },
        { "code": "DR-25", "text": "No channel bank erosion creating structural failure of channel" },
        { "code": "DR-26", "text": "No channel blockage causing overflow onto adjacent safety areas" },
        { "code": "DR-27", "text": "Saturated Zone 7 areas no expansion of flooded zone beyond mapped boundaries" }
      ]
    }
  ],
  "deficienciesField": {
    "label": "DRAINAGE DEFICIENCIES FOUND (describe location, type, severity, and recommended action):",
    "type": "textarea"
  },
  "signoffs": [
    { "role": "inspector", "label": "Conducted by (Name / Position / Signature)", "dateLabel": "Date:" },
    { "role": "om_acknowledgment", "label": "OM Acknowledgment (Name / Signature / Date)", "dateLabel": "Date:" }
  ],
  "validationRules": [
    "Every item marked NO SAT requires non-empty remarks before submission."
  ],
  "notes": [
    "DR-11 is intentionally absent — the source form's numbering skips from DR-10 to DR-12. Preserve this gap exactly; do not renumber.",
    "DR-17/18/19 contain literal '[Location N]' placeholder text in the source document. Confirm with BACC whether these should be replaced with actual named culvert locations before go-live, or left as fill-in text per submission."
  ]
}$schema$::jsonb,
  $map${
  "templateKey": "annex-d-drainage",
  "templateVersion": "ed01",
  "basePdf": "annex-d-drainage-ed01.pdf",
  "origin": "pdf-points-bottom-left",
  "originNote": "Coordinates are PDF points with a bottom-left origin (pdf-lib / pdf.js). Canvas clicks in /dev/field-mapper convert as pdfY = pageHeight - (clickY / canvasHeight) * pageHeight.",
  "mapping": {
    "method": "pdf.js text positions from approved base PDF (same origin as field-mapper)",
    "durationMinutes": 22,
    "note": "Measured from pdf.js text positions on the approved Ed.01 PDF (same bottom-left origin as /dev/field-mapper). Use this number to scope the remaining 30 forms.",
    "measuredAt": "2026-08-15T15:55:10.183Z"
  },
  "pageSize": {
    "width": 612.12,
    "height": 792.12
  },
  "fields": {
    "inspection_date": {
      "page": 0,
      "x": 100,
      "y": 585.5,
      "size": 9,
      "width": 90
    },
    "inspection_type.monthly_routine": {
      "page": 0,
      "x": 279.7,
      "y": 564.7,
      "type": "mark"
    },
    "inspection_type.semi_annual_cec": {
      "page": 0,
      "x": 420,
      "y": 564.7,
      "type": "mark"
    },
    "inspection_type.post_storm_emergency": {
      "page": 0,
      "x": 260.2,
      "y": 552.7,
      "type": "mark"
    },
    "conducted_by": {
      "page": 0,
      "x": 168,
      "y": 533.8,
      "size": 9,
      "width": 360,
      "wrap": true,
      "maxLines": 2,
      "overflow": "continuation"
    },
    "rainfall_mm": {
      "page": 0,
      "x": 200,
      "y": 505,
      "size": 9,
      "width": 80
    },
    "DR-01.sat": {
      "page": 0,
      "x": 392.2,
      "y": 430.6,
      "type": "mark",
      "size": 9
    },
    "DR-01.no_sat": {
      "page": 0,
      "x": 428.2,
      "y": 430.6,
      "type": "mark",
      "size": 9
    },
    "DR-01.remarks": {
      "page": 0,
      "x": 456.1,
      "y": 430.6,
      "width": 90,
      "height": 26,
      "size": 7,
      "wrap": true,
      "maxLines": 2,
      "overflow": "continuation"
    },
    "DR-02.sat": {
      "page": 0,
      "x": 392.2,
      "y": 401.8,
      "type": "mark",
      "size": 9
    },
    "DR-02.no_sat": {
      "page": 0,
      "x": 428.2,
      "y": 401.8,
      "type": "mark",
      "size": 9
    },
    "DR-02.remarks": {
      "page": 0,
      "x": 456.1,
      "y": 401.8,
      "width": 90,
      "height": 26,
      "size": 7,
      "wrap": true,
      "maxLines": 2,
      "overflow": "continuation"
    },
    "DR-03.sat": {
      "page": 0,
      "x": 392.2,
      "y": 373,
      "type": "mark",
      "size": 9
    },
    "DR-03.no_sat": {
      "page": 0,
      "x": 428.2,
      "y": 373,
      "type": "mark",
      "size": 9
    },
    "DR-03.remarks": {
      "page": 0,
      "x": 456.1,
      "y": 373,
      "width": 90,
      "height": 18,
      "size": 7,
      "wrap": true,
      "maxLines": 1,
      "overflow": "continuation"
    },
    "DR-04.sat": {
      "page": 0,
      "x": 392.2,
      "y": 352.9,
      "type": "mark",
      "size": 9
    },
    "DR-04.no_sat": {
      "page": 0,
      "x": 428.2,
      "y": 352.9,
      "type": "mark",
      "size": 9
    },
    "DR-04.remarks": {
      "page": 0,
      "x": 456.1,
      "y": 352.9,
      "width": 90,
      "height": 18,
      "size": 7,
      "wrap": true,
      "maxLines": 1,
      "overflow": "continuation"
    },
    "DR-05.sat": {
      "page": 0,
      "x": 392.2,
      "y": 332.8,
      "type": "mark",
      "size": 9
    },
    "DR-05.no_sat": {
      "page": 0,
      "x": 428.2,
      "y": 332.8,
      "type": "mark",
      "size": 9
    },
    "DR-05.remarks": {
      "page": 0,
      "x": 456.1,
      "y": 332.8,
      "width": 90,
      "height": 18,
      "size": 7,
      "wrap": true,
      "maxLines": 1,
      "overflow": "continuation"
    },
    "DR-06.sat": {
      "page": 0,
      "x": 392.2,
      "y": 304,
      "type": "mark",
      "size": 9
    },
    "DR-06.no_sat": {
      "page": 0,
      "x": 428.2,
      "y": 304,
      "type": "mark",
      "size": 9
    },
    "DR-06.remarks": {
      "page": 0,
      "x": 456.1,
      "y": 304,
      "width": 90,
      "height": 26,
      "size": 7,
      "wrap": true,
      "maxLines": 2,
      "overflow": "continuation"
    },
    "DR-07.sat": {
      "page": 0,
      "x": 392.2,
      "y": 284,
      "type": "mark",
      "size": 9
    },
    "DR-07.no_sat": {
      "page": 0,
      "x": 428.2,
      "y": 284,
      "type": "mark",
      "size": 9
    },
    "DR-07.remarks": {
      "page": 0,
      "x": 456.1,
      "y": 284,
      "width": 90,
      "height": 18,
      "size": 7,
      "wrap": true,
      "maxLines": 1,
      "overflow": "continuation"
    },
    "DR-08.sat": {
      "page": 0,
      "x": 392.2,
      "y": 219.5,
      "type": "mark",
      "size": 9
    },
    "DR-08.no_sat": {
      "page": 0,
      "x": 428.2,
      "y": 219.5,
      "type": "mark",
      "size": 9
    },
    "DR-08.remarks": {
      "page": 0,
      "x": 456.1,
      "y": 219.5,
      "width": 90,
      "height": 18,
      "size": 7,
      "wrap": true,
      "maxLines": 1,
      "overflow": "continuation"
    },
    "DR-09.sat": {
      "page": 0,
      "x": 392.2,
      "y": 199.4,
      "type": "mark",
      "size": 9
    },
    "DR-09.no_sat": {
      "page": 0,
      "x": 428.2,
      "y": 199.4,
      "type": "mark",
      "size": 9
    },
    "DR-09.remarks": {
      "page": 0,
      "x": 456.1,
      "y": 199.4,
      "width": 90,
      "height": 18,
      "size": 7,
      "wrap": true,
      "maxLines": 1,
      "overflow": "continuation"
    },
    "DR-10.sat": {
      "page": 0,
      "x": 392.2,
      "y": 179.3,
      "type": "mark",
      "size": 9
    },
    "DR-10.no_sat": {
      "page": 0,
      "x": 428.2,
      "y": 179.3,
      "type": "mark",
      "size": 9
    },
    "DR-10.remarks": {
      "page": 0,
      "x": 456.1,
      "y": 179.3,
      "width": 90,
      "height": 18,
      "size": 7,
      "wrap": true,
      "maxLines": 1,
      "overflow": "continuation"
    },
    "DR-12.sat": {
      "page": 0,
      "x": 392.2,
      "y": 159.3,
      "type": "mark",
      "size": 9
    },
    "DR-12.no_sat": {
      "page": 0,
      "x": 428.2,
      "y": 159.3,
      "type": "mark",
      "size": 9
    },
    "DR-12.remarks": {
      "page": 0,
      "x": 456.1,
      "y": 159.3,
      "width": 90,
      "height": 18,
      "size": 7,
      "wrap": true,
      "maxLines": 1,
      "overflow": "continuation"
    },
    "DR-13.sat": {
      "page": 0,
      "x": 392.2,
      "y": 86.1,
      "type": "mark",
      "size": 9
    },
    "DR-13.no_sat": {
      "page": 0,
      "x": 428.2,
      "y": 86.1,
      "type": "mark",
      "size": 9
    },
    "DR-13.remarks": {
      "page": 0,
      "x": 456.1,
      "y": 86.1,
      "width": 90,
      "height": 18,
      "size": 7,
      "wrap": true,
      "maxLines": 1,
      "overflow": "continuation"
    },
    "DR-14.sat": {
      "page": 1,
      "x": 392.2,
      "y": 680.1,
      "type": "mark",
      "size": 9
    },
    "DR-14.no_sat": {
      "page": 1,
      "x": 428.2,
      "y": 680.1,
      "type": "mark",
      "size": 9
    },
    "DR-14.remarks": {
      "page": 1,
      "x": 456.1,
      "y": 680.1,
      "width": 90,
      "height": 18,
      "size": 7,
      "wrap": true,
      "maxLines": 1,
      "overflow": "continuation"
    },
    "DR-15.sat": {
      "page": 1,
      "x": 392.2,
      "y": 660.1,
      "type": "mark",
      "size": 9
    },
    "DR-15.no_sat": {
      "page": 1,
      "x": 428.2,
      "y": 660.1,
      "type": "mark",
      "size": 9
    },
    "DR-15.remarks": {
      "page": 1,
      "x": 456.1,
      "y": 660.1,
      "width": 90,
      "height": 18,
      "size": 7,
      "wrap": true,
      "maxLines": 1,
      "overflow": "continuation"
    },
    "DR-16.sat": {
      "page": 1,
      "x": 392.2,
      "y": 640.1,
      "type": "mark",
      "size": 9
    },
    "DR-16.no_sat": {
      "page": 1,
      "x": 428.2,
      "y": 640.1,
      "type": "mark",
      "size": 9
    },
    "DR-16.remarks": {
      "page": 1,
      "x": 456.1,
      "y": 640.1,
      "width": 90,
      "height": 18,
      "size": 7,
      "wrap": true,
      "maxLines": 1,
      "overflow": "continuation"
    },
    "DR-17.sat": {
      "page": 1,
      "x": 392.2,
      "y": 575.5,
      "type": "mark",
      "size": 9
    },
    "DR-17.no_sat": {
      "page": 1,
      "x": 428.2,
      "y": 575.5,
      "type": "mark",
      "size": 9
    },
    "DR-17.remarks": {
      "page": 1,
      "x": 456.1,
      "y": 575.5,
      "width": 90,
      "height": 26,
      "size": 7,
      "wrap": true,
      "maxLines": 2,
      "overflow": "continuation"
    },
    "DR-18.sat": {
      "page": 1,
      "x": 392.2,
      "y": 546.7,
      "type": "mark",
      "size": 9
    },
    "DR-18.no_sat": {
      "page": 1,
      "x": 428.2,
      "y": 546.7,
      "type": "mark",
      "size": 9
    },
    "DR-18.remarks": {
      "page": 1,
      "x": 456.1,
      "y": 546.7,
      "width": 90,
      "height": 26,
      "size": 7,
      "wrap": true,
      "maxLines": 2,
      "overflow": "continuation"
    },
    "DR-19.sat": {
      "page": 1,
      "x": 392.2,
      "y": 517.9,
      "type": "mark",
      "size": 9
    },
    "DR-19.no_sat": {
      "page": 1,
      "x": 428.2,
      "y": 517.9,
      "type": "mark",
      "size": 9
    },
    "DR-19.remarks": {
      "page": 1,
      "x": 456.1,
      "y": 517.9,
      "width": 90,
      "height": 26,
      "size": 7,
      "wrap": true,
      "maxLines": 2,
      "overflow": "continuation"
    },
    "DR-20.sat": {
      "page": 1,
      "x": 392.2,
      "y": 489.1,
      "type": "mark",
      "size": 9
    },
    "DR-20.no_sat": {
      "page": 1,
      "x": 428.2,
      "y": 489.1,
      "type": "mark",
      "size": 9
    },
    "DR-20.remarks": {
      "page": 1,
      "x": 456.1,
      "y": 489.1,
      "width": 90,
      "height": 18,
      "size": 7,
      "wrap": true,
      "maxLines": 1,
      "overflow": "continuation"
    },
    "DR-21.sat": {
      "page": 1,
      "x": 392.2,
      "y": 469,
      "type": "mark",
      "size": 9
    },
    "DR-21.no_sat": {
      "page": 1,
      "x": 428.2,
      "y": 469,
      "type": "mark",
      "size": 9
    },
    "DR-21.remarks": {
      "page": 1,
      "x": 456.1,
      "y": 469,
      "width": 90,
      "height": 18,
      "size": 7,
      "wrap": true,
      "maxLines": 1,
      "overflow": "continuation"
    },
    "DR-22.sat": {
      "page": 1,
      "x": 392.2,
      "y": 395.8,
      "type": "mark",
      "size": 9
    },
    "DR-22.no_sat": {
      "page": 1,
      "x": 428.2,
      "y": 395.8,
      "type": "mark",
      "size": 9
    },
    "DR-22.remarks": {
      "page": 1,
      "x": 456.1,
      "y": 395.8,
      "width": 90,
      "height": 26,
      "size": 7,
      "wrap": true,
      "maxLines": 2,
      "overflow": "continuation"
    },
    "DR-23.sat": {
      "page": 1,
      "x": 392.2,
      "y": 367,
      "type": "mark",
      "size": 9
    },
    "DR-23.no_sat": {
      "page": 1,
      "x": 428.2,
      "y": 367,
      "type": "mark",
      "size": 9
    },
    "DR-23.remarks": {
      "page": 1,
      "x": 456.1,
      "y": 367,
      "width": 90,
      "height": 18,
      "size": 7,
      "wrap": true,
      "maxLines": 1,
      "overflow": "continuation"
    },
    "DR-24.sat": {
      "page": 1,
      "x": 392.2,
      "y": 347,
      "type": "mark",
      "size": 9
    },
    "DR-24.no_sat": {
      "page": 1,
      "x": 428.2,
      "y": 347,
      "type": "mark",
      "size": 9
    },
    "DR-24.remarks": {
      "page": 1,
      "x": 456.1,
      "y": 347,
      "width": 90,
      "height": 18,
      "size": 7,
      "wrap": true,
      "maxLines": 1,
      "overflow": "continuation"
    },
    "DR-25.sat": {
      "page": 1,
      "x": 392.2,
      "y": 326.9,
      "type": "mark",
      "size": 9
    },
    "DR-25.no_sat": {
      "page": 1,
      "x": 428.2,
      "y": 326.9,
      "type": "mark",
      "size": 9
    },
    "DR-25.remarks": {
      "page": 1,
      "x": 456.1,
      "y": 326.9,
      "width": 90,
      "height": 18,
      "size": 7,
      "wrap": true,
      "maxLines": 1,
      "overflow": "continuation"
    },
    "DR-26.sat": {
      "page": 1,
      "x": 392.2,
      "y": 306.8,
      "type": "mark",
      "size": 9
    },
    "DR-26.no_sat": {
      "page": 1,
      "x": 428.2,
      "y": 306.8,
      "type": "mark",
      "size": 9
    },
    "DR-26.remarks": {
      "page": 1,
      "x": 456.1,
      "y": 306.8,
      "width": 90,
      "height": 18,
      "size": 7,
      "wrap": true,
      "maxLines": 1,
      "overflow": "continuation"
    },
    "DR-27.sat": {
      "page": 1,
      "x": 392.2,
      "y": 286.7,
      "type": "mark",
      "size": 9
    },
    "DR-27.no_sat": {
      "page": 1,
      "x": 428.2,
      "y": 286.7,
      "type": "mark",
      "size": 9
    },
    "DR-27.remarks": {
      "page": 1,
      "x": 456.1,
      "y": 286.7,
      "width": 90,
      "height": 18,
      "size": 7,
      "wrap": true,
      "maxLines": 1,
      "overflow": "continuation"
    },
    "deficiencies_summary": {
      "page": 1,
      "x": 76,
      "y": 228,
      "width": 460,
      "height": 148,
      "size": 9,
      "wrap": true,
      "maxLines": 10,
      "overflow": "continuation"
    },
    "inspector_signature": {
      "page": 2,
      "x": 72,
      "y": 572,
      "type": "image",
      "width": 150,
      "height": 36
    },
    "inspector_name": {
      "page": 2,
      "x": 72,
      "y": 572,
      "size": 9,
      "width": 150
    },
    "inspector_date": {
      "page": 2,
      "x": 110,
      "y": 547.5,
      "size": 9,
      "width": 80
    },
    "om_signature": {
      "page": 2,
      "x": 306.1,
      "y": 572,
      "type": "image",
      "width": 150,
      "height": 36
    },
    "om_name": {
      "page": 2,
      "x": 306.1,
      "y": 572,
      "size": 9,
      "width": 180
    },
    "om_date": {
      "page": 2,
      "x": 344,
      "y": 547.5,
      "size": 9,
      "width": 80
    }
  }
}$map$::jsonb,
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


-- ========== 005_incidents.sql ==========

-- Phase 2 incidents (Annex G NOC) and work orders (Annex H). Do not run from the app.
-- Schema matches design spec §6. One per-year sequence feeds both incident_ref and noc_no.

create table if not exists public.incident_year_counters (
  year integer primary key,
  last_seq integer not null default 0
);

create table if not exists public.work_order_year_counters (
  year integer primary key,
  last_seq integer not null default 0
);

create table if not exists public.incidents (
  id uuid primary key default gen_random_uuid(),
  seq integer not null,
  year integer not null,
  incident_ref text not null unique,
  noc_no text not null,

  submission_id uuid references public.checklist_submissions(id),
  checklist_item_id uuid references public.checklist_items(id),
  source_template_code text,
  source_section text,
  source_item_code text,
  source_item_description text,
  source_inspection_type text,
  source_inspection_date date,

  title text not null,
  description text not null,
  deficiency_level smallint not null check (deficiency_level between 1 and 4),
  category text,
  incident_type text,
  potential_impact text,
  immediate_action_taken text,

  location_label text not null,
  location_id uuid,
  latitude numeric(9,6),
  longitude numeric(9,6),
  location_accuracy_m numeric,
  location_captured_at timestamptz,
  location_capture_method text
    check (location_capture_method in ('gps','map_pin','manual')),
  location_user_adjusted boolean not null default false,

  status text not null default 'open'
    check (status in ('open','assigned','in_progress','resolved','closed')),
  reported_by uuid not null references auth.users(id),
  reported_at timestamptz not null default now(),
  department text,
  assigned_to uuid references auth.users(id),
  assigned_team text,
  assigned_at timestamptz,
  target_date date,
  closed_at timestamptz,
  closure_notes text,
  reinspection_submission_id uuid references public.checklist_submissions(id),
  unique (year, seq)
);

create table if not exists public.work_orders (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.incidents(id) on delete restrict,
  work_order_number text not null unique,
  date_issued date not null,
  issued_by uuid references auth.users(id),
  issued_by_name text not null,
  assigned_to_name text not null,
  assigned_to_user uuid references auth.users(id),
  noc_reference_no text not null,
  deficiency_level smallint not null,
  description_of_work text not null,
  location_text text,
  target_completion_date date,
  notam_required boolean,
  notam_ref text,
  cec_clearance_required boolean not null default false,

  date_works_completed date,
  completed_by text,
  description_of_work_performed text,
  materials_used text,
  test_verification_results text,
  area_cleared_for_operations boolean,
  area_not_cleared_explanation text,
  cec_clearance_issued boolean,
  cec_clearance_date date,

  status text not null default 'issued'
    check (status in ('issued','in_progress','completed','verified')),
  exported_pdf_path text,
  locked boolean not null default false
);

create table if not exists public.work_order_signoffs (
  id uuid primary key default gen_random_uuid(),
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  role text not null check (role in ('om_coo_verification','cec_clearance')),
  name text not null,
  signature_image_path text,
  signed_at timestamptz not null default now()
);

create table if not exists public.incident_updates (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.incidents(id) on delete cascade,
  author_id uuid not null references auth.users(id),
  body text not null,
  status_from text,
  status_to text,
  created_at timestamptz not null default now()
);

create table if not exists public.incident_attachments (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.incidents(id) on delete cascade,
  work_order_id uuid references public.work_orders(id),
  file_path text not null,
  caption text,
  uploaded_by uuid references auth.users(id),
  uploaded_at timestamptz not null default now()
);

alter table public.work_order_signoffs
  drop constraint if exists work_order_signoffs_role_key;
alter table public.work_order_signoffs
  add constraint work_order_signoffs_role_key unique (work_order_id, role);

-- One sequence per year feeds both incident_ref (INC-YYYY-NNNN) and noc_no.
-- noc_no is the padded sequence with no prefix until BACC confirms the register format.
create or replace function public.allocate_incident_numbers()
returns trigger
language plpgsql
as $$
declare
  next_seq integer;
begin
  if new.year is null then
    new.year := extract(year from coalesce(new.reported_at, now()))::integer;
  end if;
  insert into public.incident_year_counters (year, last_seq)
  values (new.year, 0)
  on conflict (year) do nothing;

  update public.incident_year_counters
     set last_seq = last_seq + 1
   where year = new.year
   returning last_seq into next_seq;

  new.seq := next_seq;
  new.incident_ref := 'INC-' || new.year::text || '-' || lpad(next_seq::text, 4, '0');
  new.noc_no := lpad(next_seq::text, 4, '0');
  return new;
end;
$$;

drop trigger if exists incidents_allocate_numbers on public.incidents;
create trigger incidents_allocate_numbers
  before insert on public.incidents
  for each row
  when (new.seq is null)
  execute procedure public.allocate_incident_numbers();

create or replace function public.allocate_work_order_number()
returns trigger
language plpgsql
as $$
declare
  yr integer;
  next_seq integer;
begin
  if new.work_order_number is not null and new.work_order_number <> '' then
    return new;
  end if;
  yr := extract(year from coalesce(new.date_issued, now()))::integer;
  insert into public.work_order_year_counters (year, last_seq)
  values (yr, 0)
  on conflict (year) do nothing;
  update public.work_order_year_counters
     set last_seq = last_seq + 1
   where year = yr
   returning last_seq into next_seq;
  new.work_order_number := 'WO-' || yr::text || '-' || lpad(next_seq::text, 4, '0');
  return new;
end;
$$;

drop trigger if exists work_orders_allocate_number on public.work_orders;
create trigger work_orders_allocate_number
  before insert on public.work_orders
  for each row execute procedure public.allocate_work_order_number();

create or replace function public.prevent_locked_work_order_mutation()
returns trigger
language plpgsql
as $$
begin
  if old.locked = true then
    if tg_op = 'DELETE' then
      raise exception 'Locked work orders cannot be deleted';
    end if;
    if (to_jsonb(new) - 'exported_pdf_path') is distinct from (to_jsonb(old) - 'exported_pdf_path') then
      raise exception 'Locked work orders cannot be overwritten';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists work_orders_immutable on public.work_orders;
create trigger work_orders_immutable
  before update or delete on public.work_orders
  for each row execute procedure public.prevent_locked_work_order_mutation();

create index if not exists incidents_status_idx on public.incidents (status, reported_at desc);
create index if not exists incidents_source_idx on public.incidents (submission_id, source_item_code);
create index if not exists work_orders_incident_idx on public.work_orders (incident_id, date_issued desc);


-- ========== 006_incidents_rls.sql ==========

-- Phase 2 RLS. Inspectors manage incidents they reported; OM/admin see all.

alter table public.incidents enable row level security;
alter table public.work_orders enable row level security;
alter table public.work_order_signoffs enable row level security;
alter table public.incident_updates enable row level security;
alter table public.incident_attachments enable row level security;

create policy "incidents_select_own_or_om"
  on public.incidents for select to authenticated
  using (
    reported_by = auth.uid()
    or assigned_to = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('om','admin'))
  );

create policy "incidents_insert_own"
  on public.incidents for insert to authenticated
  with check (reported_by = auth.uid());

create policy "incidents_update_own_or_om"
  on public.incidents for update to authenticated
  using (
    reported_by = auth.uid()
    or assigned_to = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('om','admin'))
  )
  with check (
    reported_by = auth.uid()
    or assigned_to = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('om','admin'))
  );

create policy "work_orders_select_related"
  on public.work_orders for select to authenticated
  using (
    exists (
      select 1 from public.incidents i
      where i.id = incident_id
        and (i.reported_by = auth.uid() or i.assigned_to = auth.uid()
          or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('om','admin')))
    )
  );

create policy "work_orders_write_related"
  on public.work_orders for all to authenticated
  using (
    exists (
      select 1 from public.incidents i
      where i.id = incident_id
        and (i.reported_by = auth.uid() or i.assigned_to = auth.uid()
          or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('om','admin')))
    )
  )
  with check (
    exists (
      select 1 from public.incidents i
      where i.id = incident_id
        and (i.reported_by = auth.uid() or i.assigned_to = auth.uid()
          or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('om','admin')))
    )
  );

create policy "wo_signoffs_select_related"
  on public.work_order_signoffs for select to authenticated
  using (
    exists (
      select 1 from public.work_orders w
      join public.incidents i on i.id = w.incident_id
      where w.id = work_order_id
        and (i.reported_by = auth.uid() or i.assigned_to = auth.uid()
          or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('om','admin')))
    )
  );

create policy "wo_signoffs_insert_related"
  on public.work_order_signoffs for insert to authenticated
  with check (
    exists (
      select 1 from public.work_orders w
      join public.incidents i on i.id = w.incident_id
      where w.id = work_order_id and w.locked = false
        and (i.reported_by = auth.uid() or i.assigned_to = auth.uid()
          or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('om','admin')))
    )
  );

create policy "incident_updates_select_related"
  on public.incident_updates for select to authenticated
  using (
    exists (
      select 1 from public.incidents i
      where i.id = incident_id
        and (i.reported_by = auth.uid() or i.assigned_to = auth.uid()
          or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('om','admin')))
    )
  );

create policy "incident_updates_insert_related"
  on public.incident_updates for insert to authenticated
  with check (author_id = auth.uid());

create policy "incident_attachments_select_related"
  on public.incident_attachments for select to authenticated
  using (
    exists (
      select 1 from public.incidents i
      where i.id = incident_id
        and (i.reported_by = auth.uid() or i.assigned_to = auth.uid()
          or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('om','admin')))
    )
  );

create policy "incident_attachments_insert_related"
  on public.incident_attachments for insert to authenticated
  with check (
    uploaded_by = auth.uid()
    and exists (select 1 from public.incidents i where i.id = incident_id)
  );


-- ========== 007_storage_incidents.sql ==========

-- Incident photos and frozen Annex H exports.

insert into storage.buckets (id, name, public)
values
  ('incident-attachments', 'incident-attachments', false),
  ('work-order-signatures', 'work-order-signatures', false),
  ('work-order-exports', 'work-order-exports', false)
on conflict (id) do nothing;

create policy "incident_attachments_own"
  on storage.objects for all to authenticated
  using (bucket_id = 'incident-attachments' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'incident-attachments' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "wo_signatures_own"
  on storage.objects for all to authenticated
  using (bucket_id = 'work-order-signatures' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'work-order-signatures' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "wo_exports_select_related"
  on storage.objects for select to authenticated
  using (bucket_id = 'work-order-exports');

create policy "wo_exports_insert_own"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'work-order-exports' and (storage.foldername(name))[1] = auth.uid()::text);


-- ========== 008_phase3.sql ==========

-- Phase 3: approvals, checklist instances, notifications.
-- Do not run from the app. Timezone for due logic is America/Belize (UTC−6).

create table if not exists public.approvals (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('checklist_submission','work_order')),
  entity_id uuid not null,
  approval_role text not null
    check (approval_role in ('om_acknowledgment','om_coo_verification','cec_clearance')),
  assigned_to uuid references auth.users(id),
  status text not null default 'pending'
    check (status in ('pending','approved','rejected')),
  decided_by uuid references auth.users(id),
  decided_at timestamptz,
  signature_image_path text,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.checklist_instances (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.checklist_templates(id),
  template_version text not null,
  assignment_rule_id uuid references public.checklist_assignment_rules(id),
  assigned_role text,
  assigned_department text,
  assigned_user uuid references auth.users(id),
  location_id uuid,
  period_start date not null,
  period_end date not null,
  due_at timestamptz not null,
  status text not null default 'pending'
    check (status in ('pending','in_progress','submitted','overdue','missed')),
  submission_id uuid references public.checklist_submissions(id),
  created_at timestamptz not null default now(),
  unique (assignment_rule_id, period_start)
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references auth.users(id),
  event_type text not null,
  entity_type text,
  entity_id uuid,
  title text not null,
  body text,
  href text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists approvals_assignee_idx on public.approvals (assigned_to, status, created_at desc);
create index if not exists instances_due_idx on public.checklist_instances (due_at, status);
create index if not exists notifications_recipient_idx on public.notifications (recipient_id, created_at desc);


-- ========== 009_stored_signature.sql ==========

-- Stored signature on user profile (convenience copy for inspector sign-off).

alter table public.profiles
  add column if not exists stored_signature_data_uri text,
  add column if not exists stored_signature_updated_at timestamptz,
  add column if not exists hide_signature_prompt boolean not null default false;


-- ========== 010_security_hardening.sql ==========

-- 010: Security hardening from the 2026-09-03 audit + 2026-09-08 design.
-- Root-cause order: role lock → Phase 3 RLS → sign-off/ack → approver reopen
-- → locked checks → signature isolation → storage scoping → incident write
-- relation checks → year-counter RLS.
--
-- Apply against local/throwaway Supabase first. Do not run against production
-- until verification (§7 of the design) passes.

-- ═══════════════════════════════════════════════════════════════════════════
-- §1.1 Role self-escalation
-- ═══════════════════════════════════════════════════════════════════════════

-- Signup must never trust client-supplied role metadata.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, position, role, department)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'position', 'Inspector'),
    -- Fixed default. Role changes are an admin operation, never signup metadata.
    'inspector',
    coalesce(new.raw_user_meta_data->>'department', 'Maintenance')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Preserve role/department unless the actor is already om/admin.
create or replace function public.protect_profile_privileged_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_role text;
begin
  select role into actor_role from public.profiles where id = auth.uid();

  if tg_op = 'UPDATE' then
    if new.role is distinct from old.role
       or new.department is distinct from old.department then
      if actor_role is null or actor_role not in ('om', 'admin', 'coo') then
        -- Non-privileged users cannot escalate or reassign themselves.
        new.role := old.role;
        new.department := old.department;
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect_privileged on public.profiles;
create trigger profiles_protect_privileged
  before update on public.profiles
  for each row execute procedure public.protect_profile_privileged_columns();

-- Tighten the update policy: owners may only touch non-privileged columns.
-- Privileged role/department changes go through the trigger above for om/admin.
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- ═══════════════════════════════════════════════════════════════════════════
-- §1.2 Missing RLS on Phase 3 tables
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.approvals enable row level security;
alter table public.checklist_instances enable row level security;
alter table public.notifications enable row level security;

-- Approvals: assignee or OM/admin can read; decide only if assigned (or OM).
drop policy if exists "approvals_select_related" on public.approvals;
create policy "approvals_select_related"
  on public.approvals for select to authenticated
  using (
    assigned_to = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('om','coo','admin'))
  );

drop policy if exists "approvals_insert_om" on public.approvals;
create policy "approvals_insert_om"
  on public.approvals for insert to authenticated
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('om','coo','admin'))
  );

drop policy if exists "approvals_update_assignee" on public.approvals;
create policy "approvals_update_assignee"
  on public.approvals for update to authenticated
  using (
    status = 'pending'
    and (
      assigned_to = auth.uid()
      or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('om','coo','admin'))
    )
  )
  with check (
    decided_by = auth.uid()
    and status in ('approved', 'rejected')
  );

-- Checklist instances: own assignment, own department, or OM/admin.
drop policy if exists "instances_select_related" on public.checklist_instances;
create policy "instances_select_related"
  on public.checklist_instances for select to authenticated
  using (
    assigned_user = auth.uid()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (
          p.role in ('om','coo','admin')
          or (p.department is not null and p.department = assigned_department)
        )
    )
  );

drop policy if exists "instances_write_om" on public.checklist_instances;
create policy "instances_write_om"
  on public.checklist_instances for all to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('om','coo','admin'))
  )
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('om','coo','admin'))
  );

-- Notifications: recipient only.
drop policy if exists "notifications_select_own" on public.notifications;
create policy "notifications_select_own"
  on public.notifications for select to authenticated
  using (recipient_id = auth.uid());

drop policy if exists "notifications_update_own" on public.notifications;
create policy "notifications_update_own"
  on public.notifications for update to authenticated
  using (recipient_id = auth.uid())
  with check (recipient_id = auth.uid());

drop policy if exists "notifications_insert_system" on public.notifications;
create policy "notifications_insert_system"
  on public.notifications for insert to authenticated
  with check (
    recipient_id = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('om','coo','admin'))
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- §1.3 Sign-off forgery + self-acknowledgment
-- ═══════════════════════════════════════════════════════════════════════════

drop policy if exists "submissions_update_own" on public.checklist_submissions;
create policy "submissions_update_own"
  on public.checklist_submissions for update to authenticated
  using (
    inspector_id = auth.uid()
    and locked = false
    and status in ('draft', 'in_progress')
  )
  with check (
    inspector_id = auth.uid()
    and status <> 'acknowledged'
  );

-- OM acknowledge stays, but WITH CHECK now pins status and lock.
drop policy if exists "submissions_om_acknowledge" on public.checklist_submissions;
create policy "submissions_om_acknowledge"
  on public.checklist_submissions for update to authenticated
  using (
    locked = true
    and status = 'submitted'
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('om','admin'))
  )
  with check (
    locked = true
    and status = 'acknowledged'
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('om','admin'))
  );

-- Sign-offs: inserter's profile.role must match the claimed signoff role.
drop policy if exists "signoffs_insert_related" on public.checklist_signoffs;
create policy "signoffs_insert_related"
  on public.checklist_signoffs for insert to authenticated
  with check (
    exists (
      select 1
      from public.checklist_submissions s
      join public.profiles p on p.id = auth.uid()
      where s.id = submission_id
        and (
          (role = 'inspector' and s.inspector_id = auth.uid())
          or (role = 'om_acknowledgment' and p.role in ('om','admin'))
          or (role = 'om_coo_verification' and p.role in ('om','coo','admin'))
          or (role = 'cec_clearance' and p.role in ('cec','admin'))
        )
    )
  );

drop policy if exists "wo_signoffs_insert_related" on public.work_order_signoffs;
create policy "wo_signoffs_insert_related"
  on public.work_order_signoffs for insert to authenticated
  with check (
    exists (
      select 1
      from public.work_orders w
      join public.incidents i on i.id = w.incident_id
      join public.profiles p on p.id = auth.uid()
      where w.id = work_order_id
        and w.locked = false
        and (
          (role = 'inspector' and (i.reported_by = auth.uid() or i.assigned_to = auth.uid()))
          or (role = 'om_acknowledgment' and p.role in ('om','admin'))
          or (role = 'om_coo_verification' and p.role in ('om','coo','admin'))
          or (role = 'cec_clearance' and p.role in ('cec','admin'))
        )
    )
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- §1.4 Approver reopen path
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.checklist_submissions
  add column if not exists reopened_at timestamptz,
  add column if not exists reopened_by uuid references auth.users(id);

-- Replace immutability trigger: locked records stay frozen except an audited
-- approver reopen that may touch items + the reopen audit pair.
create or replace function public.prevent_locked_submission_mutation()
returns trigger
language plpgsql
as $$
declare
  actor_role text;
  actor_dept text;
  allowed jsonb;
  old_core jsonb;
  new_core jsonb;
begin
  if old.locked = true then
    if tg_op = 'DELETE' then
      raise exception 'Locked checklist submissions cannot be deleted';
    end if;

    select role, department into actor_role, actor_dept
    from public.profiles where id = auth.uid();

    -- Approver reopen: OM/admin for the submission's department may flip
    -- reopened_* and rewrite items (marking NO SAT → SAT). Everything else
    -- stays frozen.
    if new.reopened_at is distinct from old.reopened_at
       or new.reopened_by is distinct from old.reopened_by
       or new.items is distinct from old.items then
      if actor_role is null or actor_role not in ('om','admin','coo') then
        raise exception 'Only an assigned approver can reopen a locked submission';
      end if;
      if new.reopened_by is distinct from auth.uid() then
        raise exception 'reopened_by must be the acting approver';
      end if;
      if new.reopened_at is null then
        raise exception 'reopened_at is required for a reopen';
      end if;

      allowed := to_jsonb(array['items','reopened_at','reopened_by','exported_pdf_path','updated_at']);
      old_core := (select jsonb_object_agg(key, value)
                   from jsonb_each(to_jsonb(old))
                   where not (allowed ? key));
      new_core := (select jsonb_object_agg(key, value)
                   from jsonb_each(to_jsonb(new))
                   where not (allowed ? key));
      if old_core is distinct from new_core then
        raise exception 'Reopen may only change corrected items and reopen audit fields';
      end if;
      return new;
    end if;

    -- Legacy OM acknowledge path: status draft→acknowledged + export path only.
    if (to_jsonb(new) - 'exported_pdf_path' - 'status')
         is distinct from (to_jsonb(old) - 'exported_pdf_path' - 'status') then
      raise exception 'Locked checklist submissions cannot be overwritten; create a correction instead';
    end if;
    if new.status is distinct from old.status and new.status <> 'acknowledged' then
      raise exception 'Locked checklist submissions cannot be overwritten; create a correction instead';
    end if;
  end if;
  return new;
end;
$$;

-- Dedicated RLS policy for the reopen operation (separate from general update).
drop policy if exists "submissions_approver_reopen" on public.checklist_submissions;
create policy "submissions_approver_reopen"
  on public.checklist_submissions for update to authenticated
  using (
    locked = true
    and status in ('submitted', 'acknowledged')
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('om','coo','admin')
    )
  )
  with check (
    locked = true
    and reopened_by = auth.uid()
    and reopened_at is not null
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('om','coo','admin')
    )
  );

-- Incidents / work orders: require unlocked for general writes.
drop policy if exists "incidents_update_own_or_om" on public.incidents;
create policy "incidents_update_own_or_om"
  on public.incidents for update to authenticated
  using (
    (status is distinct from 'closed')
    and (
      reported_by = auth.uid()
      or assigned_to = auth.uid()
      or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('om','admin'))
    )
  )
  with check (
    reported_by = auth.uid()
    or assigned_to = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('om','admin'))
  );

drop policy if exists "work_orders_write_related" on public.work_orders;
create policy "work_orders_write_related"
  on public.work_orders for all to authenticated
  using (
    locked = false
    and exists (
      select 1 from public.incidents i
      where i.id = incident_id
        and (i.reported_by = auth.uid() or i.assigned_to = auth.uid()
          or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('om','admin')))
    )
  )
  with check (
    locked = false
    and exists (
      select 1 from public.incidents i
      where i.id = incident_id
        and (i.reported_by = auth.uid() or i.assigned_to = auth.uid()
          or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('om','admin')))
    )
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- §3 Signature column isolation + work-order-exports scoping
-- ═══════════════════════════════════════════════════════════════════════════

-- Move signature off the open profiles SELECT. New owner-only table.
create table if not exists public.profile_signatures (
  user_id uuid primary key references auth.users(id) on delete cascade,
  stored_signature_data_uri text,
  stored_signature_updated_at timestamptz,
  hide_signature_prompt boolean not null default false
);

alter table public.profile_signatures enable row level security;

drop policy if exists "profile_signatures_own" on public.profile_signatures;
create policy "profile_signatures_own"
  on public.profile_signatures for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "profile_signatures_om_read" on public.profile_signatures;
create policy "profile_signatures_om_read"
  on public.profile_signatures for select to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('om','admin'))
  );

-- Backfill from profiles if the columns still hold data.
insert into public.profile_signatures (user_id, stored_signature_data_uri, stored_signature_updated_at, hide_signature_prompt)
select id, stored_signature_data_uri, stored_signature_updated_at, coalesce(hide_signature_prompt, false)
from public.profiles
where stored_signature_data_uri is not null
   or hide_signature_prompt = true
on conflict (user_id) do update set
  stored_signature_data_uri = excluded.stored_signature_data_uri,
  stored_signature_updated_at = excluded.stored_signature_updated_at,
  hide_signature_prompt = excluded.hide_signature_prompt;

-- Clear sensitive columns on profiles (kept as stubs for backward-compat reads
-- that have not migrated yet; SELECT still sees nulls for other users).
update public.profiles set stored_signature_data_uri = null;

-- Work-order-exports: match checklist-exports owner-or-om scoping.
drop policy if exists "wo_exports_select_related" on storage.objects;
create policy "wo_exports_select_own_or_om"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'work-order-exports'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('om','admin'))
    )
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- §3 Cross-department incident write gaps
-- ═══════════════════════════════════════════════════════════════════════════

drop policy if exists "incident_updates_insert_related" on public.incident_updates;
create policy "incident_updates_insert_related"
  on public.incident_updates for insert to authenticated
  with check (
    author_id = auth.uid()
    and exists (
      select 1 from public.incidents i
      where i.id = incident_id
        and (
          i.reported_by = auth.uid()
          or i.assigned_to = auth.uid()
          or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('om','admin'))
        )
    )
  );

drop policy if exists "incident_attachments_insert_related" on public.incident_attachments;
create policy "incident_attachments_insert_related"
  on public.incident_attachments for insert to authenticated
  with check (
    uploaded_by = auth.uid()
    and exists (
      select 1 from public.incidents i
      where i.id = incident_id
        and (
          i.reported_by = auth.uid()
          or i.assigned_to = auth.uid()
          or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('om','admin'))
        )
    )
  );

-- Year counters: deny-by-default RLS; allocation triggers stay security definer.
do $$
begin
  if to_regclass('public.incident_year_counters') is not null then
    execute 'alter table public.incident_year_counters enable row level security';
  end if;
  if to_regclass('public.work_order_year_counters') is not null then
    execute 'alter table public.work_order_year_counters enable row level security';
  end if;
end $$;

-- Mark number allocators security definer if present.
do $$
begin
  if exists (select 1 from pg_proc where proname = 'allocate_incident_numbers') then
    execute 'alter function public.allocate_incident_numbers() security definer';
  end if;
  if exists (select 1 from pg_proc where proname = 'allocate_work_order_number') then
    execute 'alter function public.allocate_work_order_number() security definer';
  end if;
end $$;


-- ========== 011_profile_directory_columns.sql ==========

-- Profile directory columns used by the SPA (Users & roles, login roster).
-- Safe to re-run: IF NOT EXISTS / idempotent backfill.

alter table public.profiles
  add column if not exists email text,
  add column if not exists is_active boolean not null default true,
  add column if not exists can_login boolean not null default true,
  add column if not exists is_approver boolean not null default false;

create unique index if not exists profiles_email_unique
  on public.profiles (lower(email))
  where email is not null;

-- Allow service-role / SQL-editor role assignment (auth.uid() is null there).
-- Session users still cannot escalate themselves.
create or replace function public.protect_profile_privileged_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_role text;
begin
  -- No JWT → trusted server path (migrations, service_role seed).
  if auth.uid() is null then
    return new;
  end if;

  select role into actor_role from public.profiles where id = auth.uid();

  if tg_op = 'UPDATE' then
    if new.role is distinct from old.role
       or new.department is distinct from old.department then
      if actor_role is null or actor_role not in ('om', 'admin', 'coo') then
        new.role := old.role;
        new.department := old.department;
      end if;
    end if;
  end if;
  return new;
end;
$$;

-- Keep email in sync on signup (role still fixed to inspector by 010).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, position, role, department)
  values (
    new.id,
    lower(new.email),
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'position', 'Inspector'),
    'inspector',
    coalesce(new.raw_user_meta_data->>'department', 'Maintenance')
  )
  on conflict (id) do update set
    email = excluded.email,
    full_name = coalesce(public.profiles.full_name, excluded.full_name),
    position = coalesce(public.profiles.position, excluded.position),
    department = coalesce(public.profiles.department, excluded.department);
  return new;
end;
$$;

-- Backfill email from auth.users where missing.
update public.profiles p
set email = lower(u.email)
from auth.users u
where p.id = u.id
  and (p.email is null or p.email = '');


notify pgrst, 'reload schema';
