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
