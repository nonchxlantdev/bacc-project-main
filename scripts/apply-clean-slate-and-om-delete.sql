-- Apply in Supabase Dashboard → SQL Editor, then refresh the portal.
-- 1) Fixes OM delete (drafts were bouncing back after reload)
-- 2) Wipes all checklists / incidents for a clean slate (keeps staff + forms)

drop policy if exists "submissions_delete_own_draft" on public.checklist_submissions;
create policy "submissions_delete_own_draft"
  on public.checklist_submissions for delete to authenticated
  using (
    locked = false
    and status = 'draft'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('om', 'admin')
    )
  );

create or replace function public.clear_operational_data()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
  actor_role text;
begin
  -- service_role has no auth.uid(); authenticated callers must be OM/admin.
  if auth.uid() is not null then
    select role into actor_role from public.profiles where id = auth.uid();
    if actor_role is null or actor_role not in ('om', 'admin') then
      raise exception 'Only Operations Manager or admin can clear operational data';
    end if;
  end if;

  set local session_replication_role = replica;

  truncate table
    public.incident_attachments,
    public.incident_updates,
    public.work_order_signoffs,
    public.work_orders,
    public.incidents,
    public.approvals,
    public.notifications,
    public.checklist_signoffs,
    public.checklist_items,
    public.checklist_submissions,
    public.checklist_instances,
    public.incident_year_counters,
    public.work_order_year_counters
  restart identity cascade;

  delete from public.audit_log
  where entity_type in (
    'checklist_submission',
    'incident',
    'work_order',
    'approval',
    'notification',
    'checklist_instance'
  );

  set local session_replication_role = origin;

  select jsonb_build_object(
    'submissions', (select count(*) from public.checklist_submissions),
    'incidents', (select count(*) from public.incidents),
    'templates', (select count(*) from public.checklist_templates),
    'profiles', (select count(*) from public.profiles)
  ) into result;

  return result;
end;
$$;

revoke all on function public.clear_operational_data() from public;
grant execute on function public.clear_operational_data() to service_role;
grant execute on function public.clear_operational_data() to authenticated;

-- Run the wipe now
select public.clear_operational_data() as clean_slate;
