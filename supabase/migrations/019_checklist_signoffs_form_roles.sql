-- 019: Allow real form sign-off roles on checklist_signoffs.
--
-- PDF preview / autosave call replaceSubmissionChildren, which upserts
-- checklist_signoffs. Migration 010's insert policy only allowed
-- role = 'inspector' (or OM/CEC system approval roles). Most approved forms
-- name the filler block something else — responsible, apron_supervisor,
-- prepared_by, reporter, cec, contractor, etc. — so saving those drafts
-- failed with "new row violates row-level security policy".
--
-- The original table also constrained role to ('inspector','om_acknowledgment'),
-- which cannot express the 36-form catalogue. Drop that check; keep uniqueness
-- on (submission_id, role).

alter table public.checklist_signoffs
  drop constraint if exists checklist_signoffs_role_check;

-- Filler / form-level roles the person completing the draft may write.
-- System approval row used by acknowledge() stays OM/admin-only.
-- Secondary form blocks (om, supervisor, coo, …) are only written when the
-- SPA puts them on the record; they are not the om_acknowledgment gate.

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

-- Upsert needs UPDATE as well as INSERT (unique on submission_id, role).
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
