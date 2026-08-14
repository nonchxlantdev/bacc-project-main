-- Phase 1 RLS: authenticated users can read templates; read/write their own submissions.
-- All-checklists read of others' rows is deferred until roles are designed.

alter table public.profiles enable row level security;
alter table public.checklist_templates enable row level security;
alter table public.checklist_submissions enable row level security;
alter table public.checklist_items enable row level security;
alter table public.checklist_signoffs enable row level security;

-- Profiles
create policy "profiles_select_authenticated"
  on public.profiles for select
  to authenticated
  using (true);

create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Templates are reference data — all signed-in inspectors can read active templates.
create policy "templates_select_authenticated"
  on public.checklist_templates for select
  to authenticated
  using (active = true);

-- Submissions: own rows only in Phase 1.
create policy "submissions_select_own"
  on public.checklist_submissions for select
  to authenticated
  using (inspector_id = auth.uid());

create policy "submissions_insert_own"
  on public.checklist_submissions for insert
  to authenticated
  with check (inspector_id = auth.uid());

create policy "submissions_update_own"
  on public.checklist_submissions for update
  to authenticated
  using (inspector_id = auth.uid())
  with check (inspector_id = auth.uid());

create policy "submissions_delete_own_drafts"
  on public.checklist_submissions for delete
  to authenticated
  using (inspector_id = auth.uid() and status = 'draft');

-- Items follow parent submission ownership.
create policy "items_select_own"
  on public.checklist_items for select
  to authenticated
  using (
    exists (
      select 1 from public.checklist_submissions s
      where s.id = submission_id and s.inspector_id = auth.uid()
    )
  );

create policy "items_insert_own"
  on public.checklist_items for insert
  to authenticated
  with check (
    exists (
      select 1 from public.checklist_submissions s
      where s.id = submission_id and s.inspector_id = auth.uid()
    )
  );

create policy "items_update_own"
  on public.checklist_items for update
  to authenticated
  using (
    exists (
      select 1 from public.checklist_submissions s
      where s.id = submission_id and s.inspector_id = auth.uid()
    )
  );

create policy "items_delete_own"
  on public.checklist_items for delete
  to authenticated
  using (
    exists (
      select 1 from public.checklist_submissions s
      where s.id = submission_id and s.inspector_id = auth.uid()
    )
  );

-- Signoffs follow parent submission ownership.
create policy "signoffs_select_own"
  on public.checklist_signoffs for select
  to authenticated
  using (
    exists (
      select 1 from public.checklist_submissions s
      where s.id = submission_id and s.inspector_id = auth.uid()
    )
  );

create policy "signoffs_insert_own"
  on public.checklist_signoffs for insert
  to authenticated
  with check (
    exists (
      select 1 from public.checklist_submissions s
      where s.id = submission_id and s.inspector_id = auth.uid()
    )
  );

create policy "signoffs_update_own"
  on public.checklist_signoffs for update
  to authenticated
  using (
    exists (
      select 1 from public.checklist_submissions s
      where s.id = submission_id and s.inspector_id = auth.uid()
    )
  );
