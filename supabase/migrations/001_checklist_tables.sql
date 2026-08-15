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
