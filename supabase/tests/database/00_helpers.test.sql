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

-- Independent check of the structural invariants of one budget, written without the
-- migration's helpers: returns one line per violation (no rows: all hold).
--   numbered 1..n, contiguous, each 7 to 92 days long, none starting after today, none
--   starting after the budget's end date, nothing keyed beyond the latest period.
create or replace function tests.period_violations(budget uuid)
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  with p as (
    select seq, start_date, end_date,
           lag(end_date) over (order by seq) as prev_end,
           row_number() over (order by seq) as rn
    from public.periods where budget_id = period_violations.budget
  ), b as (select end_date from public.budgets where id = period_violations.budget),
  latest as (select max(seq) as seq from public.periods where budget_id = period_violations.budget)
  select format('period %s: %s', p.seq, v.what)
  from p cross join b
  cross join lateral (values
    (case when p.seq <> p.rn then 'numbering gap' end),
    (case when p.prev_end is not null and p.start_date <> p.prev_end + 1 then 'not contiguous' end),
    (case when p.end_date - p.start_date + 1 not between 7 and 92 then 'length out of bounds' end),
    (case when p.start_date > private.today() then 'starts after today' end),
    (case when b.end_date is not null and p.start_date > b.end_date then 'starts after the end date' end)
  ) as v (what)
  where v.what is not null
  union all
  select format('income %s keyed beyond the latest period', i.name)
  from public.incomes as i cross join latest
  where i.budget_id = period_violations.budget and (i.first_seq > latest.seq or i.end_seq > latest.seq)
  union all
  select format('version from period %s beyond the latest period', v.effective_from_seq)
  from public.income_versions as v cross join latest
  where v.budget_id = period_violations.budget and v.effective_from_seq > latest.seq
  -- step 3: categories, expectations, transactions
  union all
  select format('category %s keyed beyond the latest period', c.name)
  from public.categories as c cross join latest
  where c.budget_id = period_violations.budget and (c.first_seq > latest.seq or c.end_seq > latest.seq)
  union all
  select format('expectation from period %s beyond the latest period', e.effective_from_seq)
  from public.category_expectations as e cross join latest
  where e.budget_id = period_violations.budget and e.effective_from_seq > latest.seq
  union all
  select format('transaction on %s outside every period', t.date)
  from public.transactions as t
  where t.budget_id = period_violations.budget
    and not exists (select 1 from public.periods as p
                    where p.budget_id = t.budget_id and t.date between p.start_date and p.end_date)
  union all
  select format('transaction on group %s', c.name)
  from public.transactions as t join public.categories as c on c.id = t.category_id
  where t.budget_id = period_violations.budget and c.is_group
  union all
  select format('subcategory %s outside its group', c.name)
  from public.categories as c join public.categories as g on g.id = c.parent_id
  where c.budget_id = period_violations.budget
    and (not g.is_group or g.parent_id is not null or c.first_seq < g.first_seq
         or (g.end_seq is not null and (c.end_seq is null or c.end_seq > g.end_seq)))
$$;

-- Independent recomputation of a period's totals from the rows, written without the
-- migration's helpers (step 3): expected adds each leaf's monthly share (a yearly amount /
-- 12, rounded half up with numeric arithmetic), spent is expenses minus refunds.
create or replace function tests.naive_totals(period uuid)
returns table (salary_total bigint, extra_income_total bigint, expected_total bigint, spent_total bigint)
language sql
stable
security definer
set search_path = ''
as $$
  with p as (select * from public.periods where id = naive_totals.period)
  select
    (select coalesce(sum((select v.amount from public.income_versions as v
                          where v.income_id = i.id and v.effective_from_seq <= p.seq
                          order by v.effective_from_seq desc limit 1)), 0)::bigint
     from public.incomes as i
     where i.budget_id = p.budget_id and i.first_seq <= p.seq and (i.end_seq is null or p.seq < i.end_seq)),
    (select coalesce(sum(t.amount), 0)::bigint from public.transactions as t
     where t.budget_id = p.budget_id and t.kind = 'extra_income' and t.date >= p.start_date and t.date <= p.end_date),
    (select coalesce(sum(case e.cadence when 'monthly' then e.amount::numeric else round(e.amount::numeric / 12) end), 0)::bigint
     from public.categories as c
     cross join lateral (select x.amount, x.cadence from public.category_expectations as x
                         where x.category_id = c.id and x.effective_from_seq <= p.seq
                         order by x.effective_from_seq desc limit 1) as e
     where c.budget_id = p.budget_id and not c.is_group
       and c.first_seq <= p.seq and (c.end_seq is null or p.seq < c.end_seq)),
    (select coalesce(sum(case t.kind when 'expense' then t.amount when 'refund' then -t.amount else 0 end), 0)::bigint
     from public.transactions as t
     where t.budget_id = p.budget_id and t.date >= p.start_date and t.date <= p.end_date)
  from p
$$;

-- Callers with step 2's argument lists, for the tests that prove behaviour rather than the
-- concurrency guard: each reads, as the caller, the revision (or the current period, after
-- catching up) a client would have read, then calls the RPC. The concurrency guard itself is
-- tested by calling the RPCs directly (60, 62, 86, 88).
create or replace function tests.current_period_of(p_budget_id uuid)
returns public.periods
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v public.periods;
begin
  begin
    perform public.ensure_periods(p_budget_id);
  exception when sqlstate 'P0001' then
    null;  -- not a member: the RPC answers for itself
  end;
  select p.* into v from public.periods as p
  where p.budget_id = p_budget_id and private.today() between p.start_date and p.end_date;
  return v;
end;
$$;

create or replace function tests.set_expected_pay_date(p_budget_id uuid, p_pay_date date default null)
returns setof public.period_summaries language plpgsql security invoker set search_path = '' as $$
declare v public.periods := tests.current_period_of(p_budget_id);
begin
  return query select * from public.set_expected_pay_date(p_budget_id, v.id, v.revision, p_pay_date);
end; $$;

create or replace function tests.record_early_pay_date(p_budget_id uuid, p_pay_date date)
returns setof public.period_summaries language plpgsql security invoker set search_path = '' as $$
declare v public.periods := tests.current_period_of(p_budget_id);
begin
  return query select * from public.record_early_pay_date(p_budget_id, v.id, v.revision, p_pay_date);
end; $$;

create or replace function tests.reopen_previous_period(p_budget_id uuid, p_pay_date date default null)
returns setof public.period_summaries language plpgsql security invoker set search_path = '' as $$
declare v public.periods := tests.current_period_of(p_budget_id);
begin
  return query select * from public.reopen_previous_period(p_budget_id, v.id, v.revision, p_pay_date);
end; $$;

create or replace function tests.move_period_start(p_period_id uuid, p_start_date date default null)
returns void language plpgsql security invoker set search_path = '' as $$
declare v_budget uuid := (select p.budget_id from public.periods as p where p.id = p_period_id);
begin
  if v_budget is not null then
    perform tests.current_period_of(v_budget);
  end if;
  perform public.move_period_start(p_period_id,
    (select p.revision from public.periods as p where p.id = p_period_id), p_start_date);
end; $$;

create or replace function tests.update_income_terms(
  p_income_id uuid, p_amount bigint, p_pay_day integer, p_weekend_rule public.weekend_rule,
  p_from_period_id uuid default null)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  perform public.update_income(p_income_id, (select i.revision from public.incomes as i where i.id = p_income_id),
    null, p_amount, p_pay_day, p_weekend_rule, p_from_period_id);
end; $$;

create or replace function tests.remove_income(p_income_id uuid, p_from_period_id uuid default null)
returns text language plpgsql security invoker set search_path = '' as $$
begin
  return public.remove_income(p_income_id, (select i.revision from public.incomes as i where i.id = p_income_id),
    p_from_period_id);
end; $$;

create or replace function tests.set_primary_income(p_income_id uuid)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  perform public.set_primary_income(p_income_id,
    (select b.revision from public.incomes as i join public.budgets as b on b.id = i.budget_id where i.id = p_income_id));
end; $$;

create or replace function tests.set_budget_end_date(p_budget_id uuid, p_end_date date default null)
returns setof public.my_budgets language plpgsql security invoker set search_path = '' as $$
begin
  return query select * from public.set_budget_end_date(p_budget_id,
    (select b.revision from public.budgets as b where b.id = p_budget_id), p_end_date);
end; $$;

-- Step 2's preview: the primary's terms changed (pay day, weekend rule), or another income
-- made primary.
create or replace function tests.preview_expected_pay_date(
  p_budget_id uuid, p_pay_day integer default null, p_weekend_rule public.weekend_rule default null,
  p_income_id uuid default null)
returns table (period_id uuid, end_date date, expected_pay_date date, end_is_manual boolean)
language plpgsql security invoker set search_path = '' as $$
begin
  if p_income_id is not null then
    return query select * from public.preview_set_primary_income(p_income_id);
  else
    return query select * from public.preview_update_income(
      (select b.primary_income_id from public.budgets as b where b.id = p_budget_id), null, p_pay_day, p_weekend_rule);
  end if;
end; $$;

grant execute on all functions in schema tests to anon, authenticated;

select has_function('tests', 'authenticate_as', array['text'], 'test helpers are installed');

select * from finish();
commit;
