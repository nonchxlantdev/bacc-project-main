-- 018: User management additions (2026-09-09).
--
-- Adds three things, all requested together:
-- §1  Admin/OM can edit OTHER users' profiles. The existing "Users & roles"
--     admin screen (Settings) has never actually been able to do this: the
--     only UPDATE policy on profiles is self-only (`profiles_update_own`,
--     010), so an admin editing someone else's role/department has always
--     silently failed under RLS. This closes that gap.
-- §2  Profile photos: an avatar_url column plus a per-user-folder storage
--     bucket, matching the pattern every other bucket in this app already
--     uses.
-- §3  Keeps profiles.email in sync once a Supabase Auth email change is
--     actually confirmed (self-service email change, added alongside this).
--
-- Apply against local/throwaway Supabase first if you have one — see the
-- same note on 010_security_hardening.sql. This one is lower-risk (it only
-- adds a second, narrower UPDATE policy and a new bucket; nothing existing
-- is loosened), but the same discipline applies.

-- ═══════════════════════════════════════════════════════════════════════════
-- §1 Admin/OM can edit other users' profiles
-- ═══════════════════════════════════════════════════════════════════════════
-- profiles_update_own (id = auth.uid()) still covers self-edits — Postgres
-- RLS policies for the same command are OR'd together, so this is additive:
-- it lets an admin/om caller also reach someone else's row. The existing
-- protect_profile_privileged_columns() trigger (010) still governs which
-- columns actually change on any UPDATE — it already treats om/coo/admin as
-- privileged for role/department, so nothing here loosens that check, it
-- just lets the row be reached at all.
drop policy if exists "profiles_update_admin" on public.profiles;
create policy "profiles_update_admin"
  on public.profiles for update to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'om'))
  )
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'om'))
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- §2 Profile photos
-- ═══════════════════════════════════════════════════════════════════════════
alter table public.profiles add column if not exists avatar_url text;

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', false)
on conflict (id) do nothing;

-- Folder layout matches every other bucket here: <user_id>/<file>.
drop policy if exists "avatars_write_own" on storage.objects;
create policy "avatars_write_own"
  on storage.objects for all to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- Everyone signed in can see everyone's avatar (nav header, Users directory,
-- approvals) — unlike a signature or a submission, nothing in a profile
-- photo is sensitive enough to restrict to the owner + OM/admin.
drop policy if exists "avatars_read_authenticated" on storage.objects;
create policy "avatars_read_authenticated"
  on storage.objects for select to authenticated
  using (bucket_id = 'avatars');

-- ═══════════════════════════════════════════════════════════════════════════
-- §3 Keep profiles.email in sync with Supabase Auth
-- ═══════════════════════════════════════════════════════════════════════════
-- Supabase only writes auth.users.email once the "confirm email change" link
-- is clicked (secure email change is on by default), so this fires exactly
-- when the new address is real — never for an unconfirmed pending one.
create or replace function public.sync_profile_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email is distinct from old.email then
    update public.profiles set email = new.email where id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists sync_profile_email_on_auth_change on auth.users;
create trigger sync_profile_email_on_auth_change
  after update of email on auth.users
  for each row execute procedure public.sync_profile_email();
