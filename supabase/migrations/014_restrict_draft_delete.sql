-- 014: Restrict draft delete to OM/admin only (no self-delete, no COO).

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
