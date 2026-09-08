-- Fix API grants after SQL Editor apply (PostgREST roles need table privileges).
-- Run once in Dashboard → SQL Editor, then: notify pgrst, 'reload schema';

grant usage on schema public to postgres, anon, authenticated, service_role;

grant all on all tables in schema public to postgres, anon, authenticated, service_role;
grant all on all sequences in schema public to postgres, anon, authenticated, service_role;
grant all on all routines in schema public to postgres, anon, authenticated, service_role;

alter default privileges in schema public
  grant all on tables to postgres, anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to postgres, anon, authenticated, service_role;
alter default privileges in schema public
  grant all on routines to postgres, anon, authenticated, service_role;

-- Storage schema objects used by migrations (buckets/policies already created).
grant usage on schema storage to postgres, anon, authenticated, service_role;

notify pgrst, 'reload schema';
