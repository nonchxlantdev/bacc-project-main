-- Paste into Supabase Dashboard → SQL Editor and Run.
-- Fixes silent cancel of draft deletes (trigger returned NEW on DELETE).
-- Also re-applies OM/admin delete RLS.

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
  if tg_op = 'DELETE' then
    if old.locked = true then
      raise exception 'Locked checklist submissions cannot be deleted';
    end if;
    return old;
  end if;

  if old.locked = true then
    select role, department into actor_role, actor_dept
    from public.profiles where id = auth.uid();

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
