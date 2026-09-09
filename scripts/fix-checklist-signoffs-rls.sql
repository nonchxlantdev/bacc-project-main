-- Paste into Supabase Dashboard → SQL Editor and Run.
-- Fixes PDF preview / draft save failing on checklist_signoffs RLS when the
-- form's self-signoff role is not the literal string "inspector".

alter table public.checklist_signoffs
  drop constraint if exists checklist_signoffs_role_check;

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
          (
            role is distinct from 'om_acknowledgment'
            and s.locked = false
            and s.status in ('draft', 'in_progress')
            and (
              s.inspector_id = auth.uid()
              or p.role in ('om', 'admin')
            )
          )
          or (
            role = 'om_acknowledgment'
            and p.role in ('om', 'admin')
          )
        )
    )
  );

drop policy if exists "signoffs_update_related" on public.checklist_signoffs;
create policy "signoffs_update_related"
  on public.checklist_signoffs for update to authenticated
  using (
    exists (
      select 1
      from public.checklist_submissions s
      join public.profiles p on p.id = auth.uid()
      where s.id = submission_id
        and (
          (
            role is distinct from 'om_acknowledgment'
            and s.locked = false
            and s.status in ('draft', 'in_progress')
            and (
              s.inspector_id = auth.uid()
              or p.role in ('om', 'admin')
            )
          )
          or (
            role = 'om_acknowledgment'
            and p.role in ('om', 'admin')
          )
        )
    )
  )
  with check (
    exists (
      select 1
      from public.checklist_submissions s
      join public.profiles p on p.id = auth.uid()
      where s.id = submission_id
        and (
          (
            role is distinct from 'om_acknowledgment'
            and s.locked = false
            and s.status in ('draft', 'in_progress')
            and (
              s.inspector_id = auth.uid()
              or p.role in ('om', 'admin')
            )
          )
          or (
            role = 'om_acknowledgment'
            and p.role in ('om', 'admin')
          )
        )
    )
  );
