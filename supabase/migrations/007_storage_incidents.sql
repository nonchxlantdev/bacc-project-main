-- Incident photos and frozen Annex H exports.

insert into storage.buckets (id, name, public)
values
  ('incident-attachments', 'incident-attachments', false),
  ('work-order-signatures', 'work-order-signatures', false),
  ('work-order-exports', 'work-order-exports', false)
on conflict (id) do nothing;

create policy "incident_attachments_own"
  on storage.objects for all to authenticated
  using (bucket_id = 'incident-attachments' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'incident-attachments' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "wo_signatures_own"
  on storage.objects for all to authenticated
  using (bucket_id = 'work-order-signatures' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'work-order-signatures' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "wo_exports_select_related"
  on storage.objects for select to authenticated
  using (bucket_id = 'work-order-exports');

create policy "wo_exports_insert_own"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'work-order-exports' and (storage.foldername(name))[1] = auth.uid()::text);
