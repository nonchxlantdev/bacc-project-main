-- v2 RLS. Inspectors read/write their own drafts. OM can acknowledge submitted rows.

alter table public.profiles enable row level security;
alter table public.checklist_templates enable row level security;
alter table public.checklist_assignment_rules enable row level security;
alter table public.checklist_submissions enable row level security;
alter table public.checklist_items enable row level security;
alter table public.checklist_signoffs enable row level security;
alter table public.audit_log enable row level security;

create policy "profiles_select_authenticated"
  on public.profiles for select to authenticated using (true);
create policy "profiles_update_own"
  on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy "templates_select_authenticated"
  on public.checklist_templates for select to authenticated using (true);

create policy "assignment_rules_select_authenticated"
  on public.checklist_assignment_rules for select to authenticated using (true);

create policy "submissions_select_own_or_om"
  on public.checklist_submissions for select to authenticated
  using (
    inspector_id = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('om','admin'))
  );

create policy "submissions_insert_own"
  on public.checklist_submissions for insert to authenticated
  with check (inspector_id = auth.uid());

create policy "submissions_update_own"
  on public.checklist_submissions for update to authenticated
  using (inspector_id = auth.uid())
  with check (inspector_id = auth.uid());

create policy "submissions_delete_own_draft"
  on public.checklist_submissions for delete to authenticated
  using (inspector_id = auth.uid() and locked = false and status = 'draft');

create policy "submissions_om_acknowledge"
  on public.checklist_submissions for update to authenticated
  using (
    locked = true
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('om','admin'))
  )
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('om','admin'))
  );

create policy "items_select_related"
  on public.checklist_items for select to authenticated
  using (
    exists (
      select 1 from public.checklist_submissions s
      where s.id = submission_id
        and (s.inspector_id = auth.uid()
          or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('om','admin')))
    )
  );

create policy "items_write_own_unlocked"
  on public.checklist_items for all to authenticated
  using (
    exists (
      select 1 from public.checklist_submissions s
      where s.id = submission_id and s.inspector_id = auth.uid() and s.locked = false
    )
  )
  with check (
    exists (
      select 1 from public.checklist_submissions s
      where s.id = submission_id and s.inspector_id = auth.uid() and s.locked = false
    )
  );

create policy "signoffs_select_related"
  on public.checklist_signoffs for select to authenticated
  using (
    exists (
      select 1 from public.checklist_submissions s
      where s.id = submission_id
        and (s.inspector_id = auth.uid()
          or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('om','admin')))
    )
  );

create policy "signoffs_insert_related"
  on public.checklist_signoffs for insert to authenticated
  with check (
    exists (
      select 1 from public.checklist_submissions s
      where s.id = submission_id
        and (s.inspector_id = auth.uid()
          or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('om','admin')))
    )
  );

create policy "signoffs_delete_own_unlocked"
  on public.checklist_signoffs for delete to authenticated
  using (
    exists (
      select 1 from public.checklist_submissions s
      where s.id = submission_id and s.inspector_id = auth.uid() and s.locked = false
    )
  );

create policy "audit_insert_own"
  on public.audit_log for insert to authenticated
  with check (actor_id = auth.uid());

create policy "audit_select_own_or_om"
  on public.audit_log for select to authenticated
  using (
    actor_id = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('om','admin'))
  );
