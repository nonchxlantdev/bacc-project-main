-- Stored signature on user profile (convenience copy for inspector sign-off).

alter table public.profiles
  add column if not exists stored_signature_data_uri text,
  add column if not exists stored_signature_updated_at timestamptz,
  add column if not exists hide_signature_prompt boolean not null default false;
