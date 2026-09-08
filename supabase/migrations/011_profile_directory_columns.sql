-- Profile directory columns used by the SPA (Users & roles, login roster).
-- Safe to re-run: IF NOT EXISTS / idempotent backfill.

alter table public.profiles
  add column if not exists email text,
  add column if not exists is_active boolean not null default true,
  add column if not exists can_login boolean not null default true,
  add column if not exists is_approver boolean not null default false;

create unique index if not exists profiles_email_unique
  on public.profiles (lower(email))
  where email is not null;

-- Allow service-role / SQL-editor role assignment (auth.uid() is null there).
-- Session users still cannot escalate themselves.
create or replace function public.protect_profile_privileged_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_role text;
begin
  -- No JWT → trusted server path (migrations, service_role seed).
  if auth.uid() is null then
    return new;
  end if;

  select role into actor_role from public.profiles where id = auth.uid();

  if tg_op = 'UPDATE' then
    if new.role is distinct from old.role
       or new.department is distinct from old.department then
      if actor_role is null or actor_role not in ('om', 'admin', 'coo') then
        new.role := old.role;
        new.department := old.department;
      end if;
    end if;
  end if;
  return new;
end;
$$;

-- Keep email in sync on signup (role still fixed to inspector by 010).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, position, role, department)
  values (
    new.id,
    lower(new.email),
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'position', 'Inspector'),
    'inspector',
    coalesce(new.raw_user_meta_data->>'department', 'Maintenance')
  )
  on conflict (id) do update set
    email = excluded.email,
    full_name = coalesce(public.profiles.full_name, excluded.full_name),
    position = coalesce(public.profiles.position, excluded.position),
    department = coalesce(public.profiles.department, excluded.department);
  return new;
end;
$$;

-- Backfill email from auth.users where missing.
update public.profiles p
set email = lower(u.email)
from auth.users u
where p.id = u.id
  and (p.email is null or p.email = '');
