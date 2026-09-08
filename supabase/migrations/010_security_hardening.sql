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
