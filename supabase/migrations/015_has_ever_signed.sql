-- 015: Track whether a user has ever signed a checklist (one-time save prompt).

alter table public.profiles
  add column if not exists has_ever_signed boolean not null default false;

-- Anyone who already saved a signature has clearly signed before.
update public.profiles p
  set has_ever_signed = true
  where exists (
    select 1 from public.profile_signatures ps
    where ps.user_id = p.id
      and ps.stored_signature_data_uri is not null
  );
