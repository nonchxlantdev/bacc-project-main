-- Phase 1 checklist data model.
-- Apply in the Supabase SQL editor or via `supabase db push`. Do not run from the app.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  position text,
  role text not null default 'inspector',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.checklist_templates (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  title text not null,
  annex_label text,
  schema jsonb not null,
  print_template_key text not null,
  active boolean not null default true
);

create table if not exists public.checklist_submissions (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.checklist_templates(id),
  location_id uuid,
  inspector_id uuid not null references auth.users(id),
  inspection_type text not null check (inspection_type in ('monthly_routine','semi_annual_cec','post_storm_emergency')),
  inspection_date date not null,
  rainfall_mm numeric,
  status text not null default 'draft' check (status in ('draft','submitted')),
  deficiencies_summary text,
  created_at timestamptz not null default now(),
  submitted_at timestamptz
);

create table if not exists public.checklist_items (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.checklist_submissions(id) on delete cascade,
  item_code text not null,
  result text check (result in ('sat','no_sat')),
  remarks text,
  photo_url text
);

create table if not exists public.checklist_signoffs (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.checklist_submissions(id) on delete cascade,
  role text not null check (role in ('inspector','om_acknowledgment')),
  name text not null,
  position text,
  signed_at timestamptz not null default now()
);

create unique index if not exists checklist_submissions_inspector_idx
  on public.checklist_submissions (inspector_id, created_at desc);

alter table public.checklist_items
  drop constraint if exists checklist_items_submission_code_key;
alter table public.checklist_items
  add constraint checklist_items_submission_code_key unique (submission_id, item_code);

alter table public.checklist_signoffs
  drop constraint if exists checklist_signoffs_submission_role_key;
alter table public.checklist_signoffs
  add constraint checklist_signoffs_submission_role_key unique (submission_id, role);

-- Auto-create a profile row when a user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, position)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'position', 'Inspector')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
