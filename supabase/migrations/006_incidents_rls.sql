-- Phase 2 RLS. Inspectors manage incidents they reported; OM/admin see all.

alter table public.incidents enable row level security;
alter table public.work_orders enable row level security;
alter table public.work_order_signoffs enable row level security;
alter table public.incident_updates enable row level security;
alter table public.incident_attachments enable row level security;

create policy "incidents_select_own_or_om"
  on public.incidents for select to authenticated
  using (
    reported_by = auth.uid()
    or assigned_to = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('om','admin'))
  );

create policy "incidents_insert_own"
  on public.incidents for insert to authenticated
  with check (reported_by = auth.uid());

create policy "incidents_update_own_or_om"
  on public.incidents for update to authenticated
  using (
    reported_by = auth.uid()
    or assigned_to = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('om','admin'))
  )
  with check (
    reported_by = auth.uid()
    or assigned_to = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('om','admin'))
  );

create policy "work_orders_select_related"
  on public.work_orders for select to authenticated
  using (
    exists (
      select 1 from public.incidents i
      where i.id = incident_id
        and (i.reported_by = auth.uid() or i.assigned_to = auth.uid()
          or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('om','admin')))
    )
  );

create policy "work_orders_write_related"
  on public.work_orders for all to authenticated
  using (
    exists (
      select 1 from public.incidents i
      where i.id = incident_id
        and (i.reported_by = auth.uid() or i.assigned_to = auth.uid()
          or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('om','admin')))
    )
  )
  with check (
    exists (
      select 1 from public.incidents i
      where i.id = incident_id
        and (i.reported_by = auth.uid() or i.assigned_to = auth.uid()
          or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('om','admin')))
    )
  );

create policy "wo_signoffs_select_related"
  on public.work_order_signoffs for select to authenticated
  using (
    exists (
      select 1 from public.work_orders w
      join public.incidents i on i.id = w.incident_id
      where w.id = work_order_id
        and (i.reported_by = auth.uid() or i.assigned_to = auth.uid()
          or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('om','admin')))
    )
  );

create policy "wo_signoffs_insert_related"
  on public.work_order_signoffs for insert to authenticated
  with check (
    exists (
      select 1 from public.work_orders w
      join public.incidents i on i.id = w.incident_id
      where w.id = work_order_id and w.locked = false
        and (i.reported_by = auth.uid() or i.assigned_to = auth.uid()
          or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('om','admin')))
    )
  );

create policy "incident_updates_select_related"
  on public.incident_updates for select to authenticated
  using (
    exists (
      select 1 from public.incidents i
      where i.id = incident_id
        and (i.reported_by = auth.uid() or i.assigned_to = auth.uid()
          or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('om','admin')))
    )
  );

create policy "incident_updates_insert_related"
  on public.incident_updates for insert to authenticated
  with check (author_id = auth.uid());

create policy "incident_attachments_select_related"
  on public.incident_attachments for select to authenticated
  using (
    exists (
      select 1 from public.incidents i
      where i.id = incident_id
        and (i.reported_by = auth.uid() or i.assigned_to = auth.uid()
          or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('om','admin')))
    )
  );

create policy "incident_attachments_insert_related"
  on public.incident_attachments for insert to authenticated
  with check (
    uploaded_by = auth.uid()
    and exists (select 1 from public.incidents i where i.id = incident_id)
  );
