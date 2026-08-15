-- Storage buckets for photos, drawn signatures, frozen exports, and approved base PDFs.

insert into storage.buckets (id, name, public)
values
  ('checklist-photos', 'checklist-photos', false),
  ('checklist-signatures', 'checklist-signatures', false),
  ('checklist-exports', 'checklist-exports', false),
  ('form-templates', 'form-templates', false)
on conflict (id) do nothing;

-- Objects are stored as {auth.uid()}/{...} except form-templates (read-only for authenticated).

create policy "photos_own"
  on storage.objects for all to authenticated
  using (bucket_id = 'checklist-photos' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'checklist-photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "signatures_own"
  on storage.objects for all to authenticated
  using (bucket_id = 'checklist-signatures' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'checklist-signatures' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "exports_select_own_or_om"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'checklist-exports'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('om','admin'))
    )
  );

create policy "exports_insert_own"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'checklist-exports' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "form_templates_select_authenticated"
  on storage.objects for select to authenticated
  using (bucket_id = 'form-templates');
