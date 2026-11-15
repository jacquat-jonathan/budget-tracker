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
--   select tests.create_user('alice', 'Alice');      -- returns the new user's id
--   select tests.authenticate_as('alice');           -- act as Alice (role authenticated)
--   select tests.authenticate_as_anon();             -- act as a signed-out visitor
--   select tests.clear_authentication();             -- back to postgres (bypasses RLS)
--   select tests.get_user_id('alice');
--
-- authenticate_as* use transaction-local settings, so they only last until the end of
-- the surrounding transaction.

begin;
select plan(1);

create extension if not exists pgtap with schema extensions;

drop schema if exists tests cascade;
create schema tests;
grant usage on schema tests to anon, authenticated;

-- Create an auth user (which fires the profile trigger). The identifier names the user
-- in later helper calls; the email is derived from it.
create or replace function tests.create_user(
  identifier text,
  display_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  user_id uuid := extensions.gen_random_uuid();
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  )
  values (
    '00000000-0000-0000-0000-000000000000',
    user_id,
    'authenticated',
    'authenticated',
    identifier || '@test.local',
    '',
    pg_catalog.now(),
    '{"provider": "email", "providers": ["email"]}'::jsonb,
    case
      when display_name is null then '{}'::jsonb
      else pg_catalog.jsonb_build_object('display_name', display_name)
    end,
    pg_catalog.now(),
    pg_catalog.now()
  );
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
  select u.id into user_id from auth.users as u where u.email = identifier || '@test.local';
  if user_id is null then
    raise exception 'tests.get_user_id: no test user "%"', identifier;
  end if;
  return user_id;
end;
$$;

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
      'email', identifier || '@test.local'
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
