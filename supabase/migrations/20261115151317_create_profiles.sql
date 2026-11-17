-- Profiles: one row per auth user, created by a trigger on sign-up.
--
-- Conventions this migration sets for every later one:
--   * Functions that the API must not call live in the `private` schema, which is not
--     exposed through the Data API.
--   * Functions use `set search_path = ''` and schema-qualified names.
--   * Privileges are granted explicitly (config.toml sets auto_expose_new_tables = false):
--     revoke everything from the API roles, then grant only what the policies allow.
--   * RLS is enabled, with policies, in the same migration that creates the table.
--     Policies call `(select auth.uid())` so Postgres evaluates it once per statement.

create schema if not exists private;
revoke all on schema private from public;

-- ---------------------------------------------------------------------------
-- Shared trigger function: keep updated_at current on every update.
-- ---------------------------------------------------------------------------
create or replace function private.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

revoke all on function private.set_updated_at() from public;

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_display_name_length
    check (display_name is null or char_length(display_name) between 1 and 100)
);

comment on table public.profiles is
  'Public profile of an auth user. Created by trigger on auth.users insert.';

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row
  execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Create the profile when a user signs up.
-- security definer: it runs as the function owner because the inserting role
-- (supabase_auth_admin) has no privileges on public.profiles.
-- ---------------------------------------------------------------------------
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    -- Blank names become null; over-long names are cut rather than failing sign-up.
    nullif(pg_catalog.left(pg_catalog.btrim(new.raw_user_meta_data ->> 'display_name'), 100), '')
  );
  return new;
end;
$$;

revoke all on function private.handle_new_user() from public;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function private.handle_new_user();

-- ---------------------------------------------------------------------------
-- Privileges: clients may read their row and change display_name only.
-- No insert (the trigger does it) and no delete (cascade from auth.users does it).
-- ---------------------------------------------------------------------------
revoke all on table public.profiles from anon, authenticated, service_role;
grant select on table public.profiles to authenticated;
grant update (display_name) on table public.profiles to authenticated;
grant select, insert, update, delete on table public.profiles to service_role;

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;

create policy "Users can read their own profile"
  on public.profiles
  for select
  to authenticated
  using ((select auth.uid()) = id);

create policy "Users can update their own profile"
  on public.profiles
  for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);
