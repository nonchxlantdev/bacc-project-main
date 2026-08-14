-- Private bucket for NO-SAT photo evidence. Objects are stored as:
--   {inspector_id}/{submission_id}/{item_code}.{ext}

insert into storage.buckets (id, name, public)
values ('checklist-photos', 'checklist-photos', false)
on conflict (id) do nothing;

create policy "checklist_photos_select_own"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'checklist-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "checklist_photos_insert_own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'checklist-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "checklist_photos_update_own"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'checklist-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "checklist_photos_delete_own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'checklist-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
