-- 017: Draft delete must remove (or detach) dependent incidents first.
-- incidents.submission_id has no ON DELETE clause, so deleting a draft that
-- raised NO SAT incidents failed with incidents_submission_id_fkey.

create or replace function public.delete_draft_submission(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_role text;
  rec record;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select role into actor_role from public.profiles where id = auth.uid();
  if actor_role is null or actor_role not in ('om', 'admin') then
    raise exception 'Only Operations Manager or admin can delete drafts';
  end if;

  select id, status, locked
    into rec
  from public.checklist_submissions
  where id = p_id
  for update;

  if not found then
    return;
  end if;

  if rec.locked or rec.status is distinct from 'draft' then
    raise exception 'Only unlocked drafts can be deleted';
  end if;

  -- Detach instance / reinspection pointers at this draft.
  update public.checklist_instances
    set submission_id = null
  where submission_id = p_id;

  update public.incidents
    set reinspection_submission_id = null
  where reinspection_submission_id = p_id;

  -- Approvals for work orders belonging to incidents from this draft.
  delete from public.approvals
  where entity_type = 'work_order'
    and entity_id in (
      select w.id
      from public.work_orders w
      join public.incidents i on i.id = w.incident_id
      where i.submission_id = p_id
    );

  -- Work orders RESTRICT incident delete — remove them first.
  delete from public.work_orders
  where incident_id in (
    select id from public.incidents where submission_id = p_id
  );

  -- Incidents raised from this draft (updates/attachments cascade).
  delete from public.incidents where submission_id = p_id;

  delete from public.approvals
  where entity_type = 'checklist_submission' and entity_id = p_id;

  delete from public.notifications
  where entity_type = 'checklist_submission' and entity_id = p_id;

  delete from public.checklist_submissions where id = p_id;
end;
$$;

revoke all on function public.delete_draft_submission(uuid) from public;
grant execute on function public.delete_draft_submission(uuid) to authenticated;
grant execute on function public.delete_draft_submission(uuid) to service_role;
