-- Test helpers shared by every database test.
--
-- pg_prove runs the files in this directory in name order, each in its own session.
-- This file runs first and installs the helpers in the `tests` schema of the local
-- database (it is not a migration, so it never reaches the hosted project). Each later
-- test file wraps its work in begin ... rollback, so the users and rows it creates are
-- discarded. `supabase db reset` removes the `tests` schema again.
--
-- Usage in a test file:
--
--   select tests.create_user('alice', 'Alice');      -- returns the new user's id; inserts
--                                                    -- with Auth's privileges (see below)
--   select tests.authenticate_as('alice');           -- act as Alice (role authenticated)
--   select tests.authenticate_as_anon();             -- act as a signed-out visitor
--   select tests.clear_authentication();             -- back to postgres (bypasses RLS)
--   select tests.get_user_id('alice');               -- works after the user is deleted too
--   select tests.get_user_email('alice');            -- the test user's email
--   select tests.create_user('eve', 'Eve', false);   -- a user whose email is not verified
--   select tests.set_today('2026-11-15');            -- pin private.today() (as postgres)
--   select tests.remember('b', <uuid>); tests.id('b') -- name ids across role switches
--
-- Scope every assertion to rows the test created (by tests.get_user_id); never count or
-- scan whole tables, since the local database may hold users signed up through the app.
--
-- authenticate_as* use transaction-local settings, so they only last until the end of
-- the surrounding transaction.

begin;
select plan(1);

create extension if not exists pgtap with schema extensions;

drop schema if exists tests cascade;
create schema tests;
grant usage on schema tests to anon, authenticated;

-- Users created by the helpers in the current test. Rows are inserted inside each test's
-- transaction, so they disappear with its rollback. Tests look users up here, never by
-- scanning auth.users or public.profiles, so they pass on a database that already holds
-- other users.
create table tests.users (
  identifier text primary key,
  id uuid not null unique
);

-- Stand-in for supabase_auth_admin, the role the Auth server inserts users with. The test
-- session (postgres) cannot switch to supabase_auth_admin itself, so tests insert users
-- as this role instead. Like supabase_auth_admin it has no privileges on public tables, so
-- sign-up triggers run exactly as in a real sign-up: a trigger function that only works
-- for a privileged role (for example one made security invoker) fails here.
do $$
begin
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'tests_auth_admin') then
    create role tests_auth_admin nologin;
  end if;
end;
$$;
-- postgres created the role, so it may grant itself membership (needed to switch to it).
grant tests_auth_admin to postgres;

-- Lets tests_auth_admin insert into auth.users without a grant on auth.users itself. The
-- view checks its owner's privileges on the table; triggers on auth.users still run as
-- the role that issued the insert.
create view tests.auth_users with (security_invoker = false) as
  select * from auth.users;
revoke all on tests.auth_users from public, anon, authenticated;
grant usage on schema tests to tests_auth_admin;
grant insert on tests.auth_users to tests_auth_admin;

-- Create an auth user the way a sign-up does (see tests_auth_admin above).
-- The identifier names the user in later helper calls; the email gets a unique suffix.
-- Must be called as postgres (the default, or after tests.clear_authentication()).
create or replace function tests.create_user(
  identifier text,
  display_name text default null,
  email_confirmed boolean default true
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  user_id uuid := pg_catalog.gen_random_uuid();
  previous_role text := pg_catalog.current_setting('role');
begin
  insert into tests.users (identifier, id) values (identifier, user_id);

  perform pg_catalog.set_config('role', 'tests_auth_admin', true);
  insert into tests.auth_users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  )
  values (
    '00000000-0000-0000-0000-000000000000',
    user_id,
    'authenticated',
    'authenticated',
    identifier || '+' || user_id || '@test.local',
    '',
    case when email_confirmed then pg_catalog.now() end,
    '{"provider": "email", "providers": ["email"]}'::jsonb,
    case
      when display_name is null then '{}'::jsonb
      else pg_catalog.jsonb_build_object('display_name', display_name)
    end,
    pg_catalog.now(),
    pg_catalog.now()
  );
  perform pg_catalog.set_config('role', previous_role, true);

  return user_id;
end;
$$;

create or replace function tests.get_user_id(identifier text)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  user_id uuid;
begin
  select u.id into user_id from tests.users as u where u.identifier = get_user_id.identifier;
  if user_id is null then
    raise exception 'tests.get_user_id: no test user "%"', identifier;
  end if;
  return user_id;
end;
$$;

create or replace function tests.get_user_email(identifier text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select identifier || '+' || tests.get_user_id(identifier) || '@test.local'
$$;

-- Named ids for the rest of the test (budgets, incomes, ...), usable whatever role the test
-- is acting as:  select tests.remember('budget', public.create_budget(...));
--                select tests.id('budget');
create table tests.ids (
  name text primary key,
  id uuid not null
);

create or replace function tests.remember(name text, id uuid)
returns uuid
language sql
security definer
set search_path = ''
as $$
  insert into tests.ids (name, id) values (remember.name, remember.id)
  on conflict on constraint ids_pkey do update set id = excluded.id
  returning id
$$;

create or replace function tests.id(name text)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  found_id uuid;
begin
  select i.id into found_id from tests.ids as i where i.name = id.name;
  if found_id is null then
    raise exception 'tests.id: nothing remembered as "%"', name;
  end if;
  return found_id;
end;
$$;

-- Pin "today" (private.today(), the Europe/Zurich date) for the rest of the transaction.
-- Replaces the function inside the test's transaction; the rollback restores it.
-- Must be called as postgres.
create or replace function tests.set_today(today date)
returns void
language plpgsql
security invoker
set search_path = ''
as $fn$
begin
  execute pg_catalog.format(
    $f$create or replace function private.today() returns date language sql stable
       set search_path = '' as $b$ select %L::date $b$$f$,
    today
  );
end;
$fn$;

-- Act as a signed-in user: the same role and JWT claims PostgREST sets for a request.
create or replace function tests.authenticate_as(identifier text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  user_id uuid := tests.get_user_id(identifier);
begin
  perform pg_catalog.set_config('role', 'authenticated', true);
  perform pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.jsonb_build_object(
      'sub', user_id,
      'role', 'authenticated',
      'aud', 'authenticated',
      'email', identifier || '+' || user_id || '@test.local'
    )::text,
    true
  );
end;
$$;

create or replace function tests.authenticate_as_anon()
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform pg_catalog.set_config('role', 'anon', true);
  perform pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.jsonb_build_object('role', 'anon')::text,
    true
  );
end;
$$;

create or replace function tests.clear_authentication()
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform pg_catalog.set_config('role', 'postgres', true);
  perform pg_catalog.set_config('request.jwt.claims', '', true);
end;
$$;

grant execute on all functions in schema tests to anon, authenticated;

select has_function('tests', 'authenticate_as', array['text'], 'test helpers are installed');

select * from finish();
commit;
