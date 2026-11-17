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

-- The id of the period containing today, without catching up (for p_from_period_id: a transfer
-- created "from this period" counts from its start, D-493).
create or replace function tests.this_period(p_budget_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.id from public.periods as p
  where p.budget_id = p_budget_id and (select public.get_today()) between p.start_date and p.end_date
$$;
grant execute on function tests.this_period(uuid) to authenticated, anon;

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
declare
  v_end date;
begin
  -- as the client does: the preview first, its end sent with the write (R-PERIOD-036)
  begin
    select p.end_date into v_end from public.preview_update_income(p_income_id, p_amount, p_pay_day, p_weekend_rule, p_from_period_id) as p;
  exception when sqlstate 'P0001' then
    v_end := null;  -- the write answers for itself
  end;
  perform public.update_income(p_income_id, (select i.revision from public.incomes as i where i.id = p_income_id),
    null, p_amount, p_pay_day, p_weekend_rule, p_from_period_id, v_end);
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
    return query select x.period_id, x.end_date, x.expected_pay_date, x.end_is_manual from public.preview_set_primary_income(p_income_id) as x;
  else
    return query select x.period_id, x.end_date, x.expected_pay_date, x.end_is_manual from public.preview_update_income(
      (select b.primary_income_id from public.budgets as b where b.id = p_budget_id), null, p_pay_day, p_weekend_rule) as x;
  end if;
end; $$;

-- Step 4: a period's committed total recomputed from the rows, without the migration's
-- helpers: each subscription in force in the period, at the terms in force then, its price
-- divided by the months of its cadence, rounded half up with numeric arithmetic.
create or replace function tests.naive_committed(period uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  with p as (select * from public.periods where id = naive_committed.period)
  select coalesce(sum(round(v.price::numeric / case v.cadence when 'monthly' then 1 when 'quarterly' then 3
                                                               when 'half_yearly' then 6 else 12 end)), 0)::bigint
  from p
  join public.subscriptions as s on s.budget_id = p.budget_id
  cross join lateral (select x.price, x.cadence from public.subscription_versions as x
                      where x.subscription_id = s.id and x.effective_from_seq <= p.seq
                      order by x.effective_from_seq desc limit 1) as v
  where s.first_seq <= p.seq and (s.end_seq is null or p.seq < s.end_seq)
$$;

-- Step 4: a debt's remaining amount recomputed from its rows: principal + interest +
-- adjustments - linked payments.
create or replace function tests.naive_remaining(debt uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select d.principal
         + coalesce((select sum(i.amount) from public.debt_interest as i where i.debt_id = d.id), 0)
         + coalesce((select sum(a.amount) from public.debt_adjustments as a where a.debt_id = d.id), 0)
         - coalesce((select sum(t.amount) from public.transactions as t where t.debt_id = d.id), 0)
  from public.debts as d where d.id = naive_remaining.debt
$$;

-- Step 4 invariants of one budget, written without the migration's helpers (no rows: all
-- hold): one charge per subscription and date, none past its watermark; interest entries in
-- the budget's own periods, at most one per debt and period; links and review states
-- consistent; nothing keyed beyond the latest period; terms from the first period; nothing on
-- a group; every debt's remaining amount and every period's committed total equal a naive
-- recomputation, and the progress rows add up to the committed total.
create or replace function tests.step4_violations(budget uuid)
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  with latest as (select max(seq) as seq from public.periods where budget_id = step4_violations.budget)
  select format('subscription %s charged twice on %s', t.subscription_id, t.charge_date)
  from public.transactions as t
  where t.budget_id = step4_violations.budget and t.charge_date is not null
  group by t.subscription_id, t.charge_date having count(*) > 1
  union all
  select format('charge on %s after the watermark %s', t.charge_date, s.charged_through)
  from public.transactions as t join public.subscriptions as s on s.id = t.subscription_id
  where t.budget_id = step4_violations.budget and t.charge_date > s.charged_through
  union all
  select format('interest of debt %s in a period of another budget or none', i.debt_id)
  from public.debt_interest as i left join public.periods as p on p.id = i.period_id
  where i.budget_id = step4_violations.budget and (p.id is null or p.budget_id <> i.budget_id)
  union all
  select format('debt %s has %s interest entries in one period', i.debt_id, count(*))
  from public.debt_interest as i where i.budget_id = step4_violations.budget
  group by i.debt_id, i.period_id having count(*) > 1
  union all
  -- D-272, D-386: interest only in a period that starts after the debt was opened (after any
  -- boundary change), so every history starts with the opening
  select format('interest of debt %s in the period starting %s, not after its opening on %s', d.name, p.start_date, d.opened_on)
  from public.debt_interest as i join public.periods as p on p.id = i.period_id join public.debts as d on d.id = i.debt_id
  where i.budget_id = step4_violations.budget and p.start_date <= d.opened_on
  union all
  select format('transaction %s: %s', t.id, v.what)
  from public.transactions as t
  cross join lateral (values
    (case when t.subscription_id is not null and t.debt_id is not null then 'linked twice' end),
    (case when (t.subscription_id is not null or t.debt_id is not null) and t.kind <> 'expense' then 'linked but not an expense' end),
    (case when t.review_state = 'awaiting_confirmation' and t.charge_date is null then 'awaiting but not a charge' end),
    (case when t.review_state = 'to_review' and t.import_batch_id is null then 'to review but not imported' end),
    -- (an imported transaction may be linked to a subscription by a member: F7)
    (case when t.import_batch_id is not null and t.charge_date is not null then 'imported and a charge' end),
    (case when t.subscription_id is not null and not exists (select 1 from public.subscriptions as s
            where s.id = t.subscription_id and s.budget_id = t.budget_id) then 'subscription of another budget' end),
    (case when t.debt_id is not null and not exists (select 1 from public.debts as d
            where d.id = t.debt_id and d.budget_id = t.budget_id) then 'debt of another budget' end),
    -- R-DEBT-131: nothing before the date the principal is the balance of
    (case when t.debt_id is not null and t.date < (select d.opened_on from public.debts as d where d.id = t.debt_id)
          then 'payment before its debt was opened' end)
  ) as v (what)
  where t.budget_id = step4_violations.budget and v.what is not null
  union all
  select format('adjustment on %s before its debt was opened', a.date)
  from public.debt_adjustments as a join public.debts as d on d.id = a.debt_id
  where a.budget_id = step4_violations.budget and a.date < d.opened_on
  union all
  select format('subscription %s keyed beyond the latest period', s.name)
  from public.subscriptions as s cross join latest
  where s.budget_id = step4_violations.budget and (s.first_seq > latest.seq or s.end_seq > latest.seq)
  union all
  select format('debt %s keyed beyond the latest period', d.name)
  from public.debts as d cross join latest
  where d.budget_id = step4_violations.budget and (d.first_seq > latest.seq or d.end_seq > latest.seq)
  union all
  select format('subscription terms from period %s beyond the latest period', v.effective_from_seq)
  from public.subscription_versions as v cross join latest
  where v.budget_id = step4_violations.budget and v.effective_from_seq > latest.seq
  union all
  select format('debt terms from period %s beyond the latest period', v.effective_from_seq)
  from public.debt_versions as v cross join latest
  where v.budget_id = step4_violations.budget and v.effective_from_seq > latest.seq
  union all
  select format('subscription %s has no terms in its first period', s.name)
  from public.subscriptions as s
  where s.budget_id = step4_violations.budget
    and not exists (select 1 from public.subscription_versions as v where v.subscription_id = s.id and v.effective_from_seq <= s.first_seq)
  union all
  select format('debt %s has no terms in its first period', d.name)
  from public.debts as d
  where d.budget_id = step4_violations.budget
    and not exists (select 1 from public.debt_versions as v where v.debt_id = d.id and v.effective_from_seq <= d.first_seq)
  union all
  select format('subscription terms on group %s', c.name)
  from public.subscription_versions as v join public.categories as c on c.id = v.category_id
  where v.budget_id = step4_violations.budget and c.is_group
  union all
  select format('debt terms on group %s', c.name)
  from public.debt_versions as v join public.categories as c on c.id = v.category_id
  where v.budget_id = step4_violations.budget and c.is_group
  -- R-CATEGORY-130: in every period where a subscription or debt is in force, the category of
  -- its terms then is in force too (period by period, written without the migration's helpers)
  union all
  select format('subscription %s in period %s on category %s not in force then', s.name, p.seq, c.name)
  from public.subscriptions as s
  join public.periods as p on p.budget_id = s.budget_id and p.seq >= s.first_seq and (s.end_seq is null or p.seq < s.end_seq)
  cross join lateral (select x.category_id from public.subscription_versions as x
                      where x.subscription_id = s.id and x.effective_from_seq <= p.seq
                      order by x.effective_from_seq desc limit 1) as v
  join public.categories as c on c.id = v.category_id
  where s.budget_id = step4_violations.budget
    and not (c.first_seq <= p.seq and (c.end_seq is null or p.seq < c.end_seq))
  union all
  select format('debt %s in period %s on category %s not in force then', d.name, p.seq, c.name)
  from public.debts as d
  join public.periods as p on p.budget_id = d.budget_id and p.seq >= d.first_seq and (d.end_seq is null or p.seq < d.end_seq)
  cross join lateral (select x.category_id from public.debt_versions as x
                      where x.debt_id = d.id and x.effective_from_seq <= p.seq
                      order by x.effective_from_seq desc limit 1) as v
  join public.categories as c on c.id = v.category_id
  where d.budget_id = step4_violations.budget
    and not (c.first_seq <= p.seq and (c.end_seq is null or p.seq < c.end_seq))
  -- R-VERSION-130: no version of an ended row from its end on (a void row keeps the one at its
  -- first period)
  union all
  select format('category %s keeps an expectation from period %s, at or after its end %s', c.name, e.effective_from_seq, c.end_seq)
  from public.categories as c join public.category_expectations as e on e.category_id = c.id
  where c.budget_id = step4_violations.budget and c.end_seq is not null
    and e.effective_from_seq >= c.end_seq and e.effective_from_seq > c.first_seq
  union all
  select format('subscription %s keeps terms from period %s, at or after its end %s', s.name, v.effective_from_seq, s.end_seq)
  from public.subscriptions as s join public.subscription_versions as v on v.subscription_id = s.id
  where s.budget_id = step4_violations.budget and s.end_seq is not null
    and v.effective_from_seq >= s.end_seq and v.effective_from_seq > s.first_seq
  union all
  select format('debt %s keeps terms from period %s, at or after its end %s', d.name, v.effective_from_seq, d.end_seq)
  from public.debts as d join public.debt_versions as v on v.debt_id = d.id
  where d.budget_id = step4_violations.budget and d.end_seq is not null
    and v.effective_from_seq >= d.end_seq and v.effective_from_seq > d.first_seq
  union all
  select format('income %s keeps terms from period %s, at or after its end %s', i.name, v.effective_from_seq, i.end_seq)
  from public.incomes as i join public.income_versions as v on v.income_id = i.id
  where i.budget_id = step4_violations.budget and i.end_seq is not null
    and v.effective_from_seq >= i.end_seq and v.effective_from_seq > i.first_seq
  union all
  select format('debt %s remaining %s, naive %s', o.name, o.remaining, tests.naive_remaining(o.id))
  from public.debt_overview as o
  where o.budget_id = step4_violations.budget and o.remaining is distinct from tests.naive_remaining(o.id)
  union all
  select format('period %s committed %s, naive %s, rows %s', s.seq, s.committed_total, x.naive, x.from_rows)
  from public.period_summaries as s
  cross join lateral (
    select tests.naive_committed(s.id) as naive,
           coalesce((select sum(r.committed) from public.get_period_progress(s.id) as r where not r.is_group), 0)::bigint as from_rows
  ) as x
  where s.budget_id = step4_violations.budget
    and (s.committed_total is distinct from x.naive or s.committed_total is distinct from x.from_rows)
$$;

-- Step 4: the charge dates of a schedule between two dates, written without the migration's
-- helpers: from the anchor's month, every cadence interval, on the nominal day clamped to
-- the month's last day, never before the anchor.
create or replace function tests.naive_charge_dates(anchor date, cadence text, day integer, from_date date, to_date date)
returns setof date
language plpgsql
immutable
set search_path = ''
as $$
declare
  step integer := case cadence when 'monthly' then 1 when 'quarterly' then 3 when 'half_yearly' then 6 else 12 end;
  y integer := extract(year from anchor)::integer;
  m integer := extract(month from anchor)::integer;
  first_of date;
  last_day integer;
  d date;
begin
  loop
    first_of := make_date(y, m, 1);
    exit when first_of > to_date;
    last_day := extract(day from ((first_of + interval '1 month')::date - 1))::integer;
    d := make_date(y, m, least(day, last_day));
    if d >= anchor and d >= from_date and d <= to_date then
      return next d;
    end if;
    m := m + step;
    while m > 12 loop
      m := m - 12;
      y := y + 1;
    end loop;
  end loop;
end;
$$;

-- Step 4: the first actual pay date on or after a day, from public.pay_date month by month.
create or replace function tests.naive_next_pay(from_date date, pay_day integer, rule public.weekend_rule)
returns date
language plpgsql
immutable
set search_path = ''
as $$
declare
  m date := (date_trunc('month', from_date::timestamp) - interval '1 month')::date;
  d date;
begin
  loop
    d := public.pay_date(extract(year from m)::integer, extract(month from m)::integer, pay_day, rule);
    if d >= from_date then
      return d;
    end if;
    m := (m + interval '1 month')::date;
  end loop;
  return null;  -- not reached
end;
$$;

-- Step 4: a debt's payoff projection recomputed from its rows, written without the
-- migration's helpers: the planned payment still due this period, then each later period's
-- interest (half up) and planned payment, until nothing remains, or never (payment <=
-- interest, or beyond 600 periods). end_date: the end of the period of the last payment,
-- walking the future periods as the catch-up creates them (each ends the day before the first
-- actual pay date at least 15 days after its start); computed only up to 120 periods ahead
-- (null beyond, with walked false).
create or replace function tests.naive_projection(debt uuid)
returns table (status text, payments_left integer, end_date date, walked boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  d public.debts;
  cur public.periods;
  r numeric;
  rate numeric;
  pay numeric;
  paid numeric;
  n integer := 0;
  k integer := 0;
  i numeric;
  pd integer;
  rule public.weekend_rule;
  s date;
  e date;
begin
  select * into d from public.debts where id = naive_projection.debt;
  select * into cur from public.periods as p where p.budget_id = d.budget_id and private.today() between p.start_date and p.end_date;
  if d.end_seq is not null or cur.id is null then
    return query select null::text, null::integer, null::date, true;
    return;
  end if;
  r := tests.naive_remaining(d.id);
  if r <= 0 then
    return query select 'paid_off'::text, 0, null::date, true;
    return;
  end if;
  select v.interest_rate, v.monthly_payment into rate, pay from public.debt_versions as v
  where v.debt_id = d.id and v.effective_from_seq <= cur.seq order by v.effective_from_seq desc limit 1;
  select coalesce(sum(t.amount), 0) into paid from public.transactions as t
  where t.debt_id = d.id and t.date >= cur.start_date and t.date <= cur.end_date;
  if pay - paid > 0 then
    r := r - (pay - paid);
    n := 1;
  end if;
  while r > 0 loop
    k := k + 1;
    if k > 600 then
      return query select 'never'::text, null::integer, null::date, true;
      return;
    end if;
    i := case when r > 0 then round(r * rate / 1200) else 0 end;
    if pay <= i then
      return query select 'never'::text, null::integer, null::date, true;
      return;
    end if;
    r := r + i - pay;
  end loop;
  if k = 0 then
    return query select 'ends'::text, n, cur.end_date, true;
    return;
  end if;
  if k > 120 then
    return query select 'ends'::text, n + k, null::date, false;
    return;
  end if;
  select t.pay_day, t.weekend_rule into pd, rule from public.income_versions as t
  join public.budgets as b on b.primary_income_id = t.income_id
  where b.id = d.budget_id and t.effective_from_seq <= cur.seq + 2 order by t.effective_from_seq desc limit 1;
  e := cur.end_date;
  for j in 1..k loop
    s := e + 1;
    e := tests.naive_next_pay(s + 15, pd, rule) - 1;
  end loop;
  return query select 'ends'::text, n + k, e, true;
end;
$$;

-- Step 5: get_category_trend (one row per line, arrays per period) as one row per line and
-- period, to compare with get_period_progress row by row. Call it as a member.
create or replace function tests.category_trend_rows(b uuid, n integer default 12)
returns table (category_id uuid, parent_id uuid, name text, is_group boolean, display_order integer,
               period_id uuid, seq integer, is_completed boolean, in_force boolean, planned bigint, spent bigint,
               committed bigint, transaction_count integer, completed_count integer, average_spent bigint)
language sql
volatile
set search_path = ''
as $$
  select c.category_id, c.parent_id, c.name, c.is_group, c.display_order, u.period_id, p.seq,
         p.end_date < private.today(), u.in_force, u.planned, u.spent, u.committed, u.transaction_count,
         c.completed_count, c.average_spent
  from public.get_category_trend(b, n) as c
  cross join lateral unnest(c.period_ids, c.in_force, c.planned, c.spent, c.committed, c.transaction_count)
    as u (period_id, in_force, planned, spent, committed, transaction_count)
  join public.periods as p on p.id = u.period_id
$$;

-- Step 7 (D-420 to D-424): every occurrence of a budget's transfers, written without the
-- migration's helpers, from the stored facts only (the periods' boundaries and scheduled pay
-- dates, each transfer's validity, first counted day and terms): a fixed-day transfer's
-- calendar dates (tests.naive_charge_dates) in each period where it is in force, from its first
-- counted day; a pay-date transfer's chosen income's actual pay dates in the period
-- (tests.naive_next_pay, its terms then), due that day plus the offset, never after the period's
-- end; otherwise one occurrence keyed by the period's scheduled pay date, due on its start plus
-- the offset, never after its end. A key two periods give belongs to the earlier.
-- The model's own memory (D-490, D-421, D-493), never read from the database's derived columns
-- (periods.pay_key, transfers.starts_on): each period's key, derived when the model first sees
-- the period (the first period: its start; then the previous period's start plus the
-- projection's 15 days, to the primary income's next pay date, and when another period of the
-- model has that key, the next pay date no period has), and each transfer's first counted day,
-- fixed when the model first sees it (the start of its first period, or that period's key when
-- earlier; the day it was made when the run says it made it with no period and no first date).
create table if not exists tests.model_period_keys (period_id uuid primary key, budget_id uuid not null, key date not null);
create table if not exists tests.model_transfer_starts (transfer_id uuid primary key, starts_on date not null);
create table if not exists tests.model_from_today (transfer_id uuid primary key, made_on date not null);

-- The run says it made this transfer with no period and no first date, today.
create or replace function tests.model_made_from_today(p_transfer_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into tests.model_from_today values (p_transfer_id, private.today()) on conflict do nothing;
  update tests.model_transfer_starts as m set starts_on = private.today()
  from public.transfers as t join public.periods as p on p.budget_id = t.budget_id and p.seq = t.first_seq
  where m.transfer_id = p_transfer_id and t.id = p_transfer_id and private.today() > p.start_date
$$;
grant execute on function tests.model_made_from_today(uuid) to authenticated;

create or replace function tests.model_sync(budget uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  p record;
  v_prev public.periods;
  v_key date;
  v_day integer;
  v_rule public.weekend_rule;
  t record;
  v_first public.periods;
  v_made date;
begin
  delete from tests.model_period_keys as m
  where m.budget_id = budget and not exists (select 1 from public.periods as x where x.id = m.period_id);
  for p in select y.* from public.periods as y
           where y.budget_id = budget and not exists (select 1 from tests.model_period_keys as m where m.period_id = y.id)
           order by y.seq loop
    select y.* into v_prev from public.periods as y where y.budget_id = budget and y.seq = p.seq - 1;
    select iv.pay_day, iv.weekend_rule into v_day, v_rule
    from public.budgets as bb join public.income_versions as iv on iv.income_id = bb.primary_income_id
    where bb.id = budget and iv.effective_from_seq <= p.seq
    order by iv.effective_from_seq desc limit 1;
    if v_prev.id is null then
      v_key := p.start_date;
    else
      v_key := tests.naive_next_pay(v_prev.start_date + 15, v_day, v_rule);
    end if;
    while exists (select 1 from tests.model_period_keys as m where m.budget_id = budget and m.key = v_key) loop
      v_key := tests.naive_next_pay(v_key + 1, v_day, v_rule);
    end loop;
    insert into tests.model_period_keys values (p.id, budget, v_key);
  end loop;
  for t in select x.* from public.transfers as x
           where x.budget_id = budget
             and not exists (select 1 from tests.model_transfer_starts as m where m.transfer_id = x.id) loop
    select y.* into v_first from public.periods as y where y.budget_id = budget and y.seq = t.first_seq;
    v_made := (select f.made_on from tests.model_from_today as f where f.transfer_id = t.id);
    insert into tests.model_transfer_starts values (t.id,
      case when v_made > v_first.start_date then v_made
           else least(v_first.start_date, (select m.key from tests.model_period_keys as m where m.period_id = v_first.id)) end);
  end loop;
end;
$$;

-- The model sees every period and transfer when it is made (its first counted day and its key
-- are fixed then, as the run would remember them), not only when a check runs.
create or replace function tests.model_seen()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform tests.model_sync(new.budget_id);
  return null;
end;
$$;
create or replace trigger zz_tests_model_period_seen after insert on public.periods
  for each row execute function tests.model_seen();
create or replace trigger zz_tests_model_transfer_seen after insert on public.transfers
  for each row execute function tests.model_seen();

create or replace function tests.naive_occurrence_candidates(budget uuid)
returns table (transfer_id uuid, seq integer, period_id uuid, occurrence_date date, due_date date,
               is_automatic boolean, category_id uuid, amount bigint)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  t record;
  p record;
  v record;
  d date;
  k date;
  v_pay_day integer;
  v_rule public.weekend_rule;
  v_starts date;
  v_key date;
  v_ended date;
  v_primary boolean;
begin
  perform tests.model_sync(budget);
  for t in select x.* from public.transfers as x where x.budget_id = budget order by x.id loop
    v_starts := (select m.starts_on from tests.model_transfer_starts as m where m.transfer_id = t.id);
    for p in select y.* from public.periods as y
             where y.budget_id = budget and y.seq >= t.first_seq and (t.end_seq is null or y.seq < t.end_seq)
             order by y.seq loop
      v_key := (select m.key from tests.model_period_keys as m where m.period_id = p.id);
      select x.* into v from public.transfer_versions as x
      where x.transfer_id = t.id and x.effective_from_seq <= p.seq order by x.effective_from_seq desc limit 1;
      transfer_id := t.id; seq := p.seq; period_id := p.id;
      is_automatic := v.is_automatic; category_id := v.category_id; amount := v.amount;
      if v.schedule::text = 'day_of_month' then
        for k in select c from tests.naive_charge_dates(v.anchor_date, v.cadence::text, v.day_of_month,
                                                         greatest(p.start_date, v_starts), p.end_date) as c loop
          occurrence_date := k; due_date := k;
          return next;
        end loop;
      else
        v_pay_day := null;
        v_ended := null;
        -- the income chosen is the primary one in this period: as none chosen (R-ACCOUNT-310)
        v_primary := exists (select 1 from public.budgets as bb
                             where bb.id = budget and bb.primary_income_id = v.income_id and p.seq >= bb.primary_since_seq);
        if v.income_id is not null and not v_primary then
          select iv.pay_day, iv.weekend_rule into v_pay_day, v_rule
          from public.incomes as i join public.income_versions as iv on iv.income_id = i.id
          where i.id = v.income_id and i.first_seq <= p.seq and (i.end_seq is null or p.seq < i.end_seq)
            and iv.effective_from_seq <= p.seq
          order by iv.effective_from_seq desc limit 1;
          if v_pay_day is null then
            -- ended in this very period on a known day (R-ACCOUNT-311): its pay dates up to then
            select iv.pay_day, iv.weekend_rule, i.ended_on into v_pay_day, v_rule, v_ended
            from public.incomes as i join public.income_versions as iv on iv.income_id = i.id
            where i.id = v.income_id and i.end_seq = p.seq and i.ended_on is not null and iv.effective_from_seq <= p.seq
            order by iv.effective_from_seq desc limit 1;
          end if;
        end if;
        if v_pay_day is not null then
          d := greatest(p.start_date, v_starts);
          loop
            k := tests.naive_next_pay(d, v_pay_day, v_rule);
            exit when k > p.end_date;
            occurrence_date := k; due_date := least(k + v.offset_days, p.end_date);
            if v_ended is null or due_date <= v_ended then
              return next;
            end if;
            d := k + 1;
          end loop;
        end if;
        if (v_pay_day is null or v_ended is not null) and v_key >= v_starts
           and (v_ended is null or least(p.start_date + v.offset_days, p.end_date) > v_ended) then
          occurrence_date := v_key; due_date := least(p.start_date + v.offset_days, p.end_date);
          return next;
        end if;
      end if;
    end loop;
  end loop;
end;
$$;

-- A key two periods give a transfer belongs to the earlier one (D-420, D-490).
create or replace function tests.naive_occurrences(budget uuid)
returns table (transfer_id uuid, seq integer, period_id uuid, occurrence_date date, due_date date,
               is_automatic boolean, category_id uuid, amount bigint)
language sql
volatile
security definer
set search_path = ''
as $$
  select distinct on (c.transfer_id, c.occurrence_date) c.*
  from tests.naive_occurrence_candidates(budget) as c
  order by c.transfer_id, c.occurrence_date, c.seq
$$;

-- Step 7 invariants of one budget (the property walk checks them after every step, once the
-- budget is caught up): the plan (private.transfer_plan_range) equals the naive occurrences, key,
-- period and due date; a mark done by the catch-up has its one transaction, a mark not done or
-- skipped none, a member's done at most one; every naive occurrence of an automatic transfer
-- linked to a category, due by the horizon, without a mark, has its mark (unless the budget is
-- full); no mark of the catch-up exists for anything that is not a naive occurrence due by the
-- horizon; the transfers and incomes satisfy the shape; every period's money flow adds up
-- (incomes = salaries, what stays = incomes, each account's in and out = its links, each
-- transfer at its monthly share).
create or replace function tests.moneyflow_violations(budget uuid)
returns setof text
language sql
volatile
security definer
set search_path = ''
as $$
  with b as (select moneyflow_violations.budget as id),
  h as (select least(private.today(), (select max(p.end_date) from public.periods as p where p.budget_id = (select id from b))) as d),
  full_budget as (select (select count(*) from public.transactions as x where x.budget_id = (select id from b))
                           >= private.limit_transactions() as f),
  naive as materialized (select * from tests.naive_occurrences((select id from b))),
  plan as materialized (
    select pl.* from private.transfer_plan_range((select id from b), null, 1,
                                                 (select max(p.seq) from public.periods as p where p.budget_id = (select id from b))) as pl
  ),
  listed as materialized (
    select p.seq, c.transfer_id, c.occurrence_date, c.due_date, c.planned
    from public.periods as p cross join lateral private.transfer_checklist(p.budget_id, p.seq) as c
    where p.budget_id = (select id from b)
  ),
  marks as materialized (
    select o.*, (select count(*) from public.transactions as x where x.transfer_occurrence_id = o.id) as tx
    from public.transfer_occurrences as o where o.budget_id = (select id from b)
  ),
  mf as materialized (
    select p.seq, m.*
    from public.periods as p cross join lateral private.money_flow(p.budget_id, p.seq) as m
    where p.budget_id = (select id from b)
  )
  select format('transfer %s, key %s: planned in %s due %s, naive in %s due %s', coalesce(n.transfer_id, pl.transfer_id),
                coalesce(n.occurrence_date, pl.occurrence_date), pl.seq, pl.due_date, n.seq, n.due_date)
  from naive as n
  full join plan as pl on pl.transfer_id = n.transfer_id and pl.occurrence_date = n.occurrence_date
  where pl.seq is distinct from n.seq or pl.due_date is distinct from n.due_date
     or pl.is_automatic is distinct from n.is_automatic or pl.category_id is distinct from n.category_id
     or pl.amount is distinct from n.amount
  union all
  -- the checklists list each naive occurrence once, planned, in its period, and nothing else planned
  select format('transfer %s, key %s: listed planned in %s due %s, naive in %s due %s', coalesce(n.transfer_id, c.transfer_id),
                coalesce(n.occurrence_date, c.occurrence_date), c.seq, c.due_date, n.seq, n.due_date)
  from naive as n
  full join (select * from listed where planned) as c on c.transfer_id = n.transfer_id and c.occurrence_date = n.occurrence_date
  where c.seq is distinct from n.seq or c.due_date is distinct from n.due_date
  union all
  select format('transfer %s, key %s: listed %s times', c.transfer_id, c.occurrence_date, pg_catalog.count(*))
  from listed as c group by c.transfer_id, c.occurrence_date having pg_catalog.count(*) > 1
  union all
  select format('mark %s of transfer %s on %s (catch-up %s): %s transactions', m.mark, m.transfer_id, m.occurrence_date,
                m.by_catch_up, m.tx)
  from marks as m
  where (m.mark = 'done' and m.by_catch_up and m.tx <> 1) or (m.mark <> 'done' and m.tx > 0) or m.tx > 1
  union all
  select format('transfer %s, key %s: automatic and linked, due %s, no transaction', n.transfer_id, n.occurrence_date, n.due_date)
  from naive as n
  where n.is_automatic and n.category_id is not null and n.due_date <= (select d from h)
    and not exists (select 1 from marks as m where m.transfer_id = n.transfer_id and m.occurrence_date = n.occurrence_date)
    and not (select f from full_budget)
  union all
  select format('transfer %s, key %s: a transaction of the catch-up for an occurrence not planned or not due', m.transfer_id,
                m.occurrence_date)
  from marks as m
  where m.by_catch_up
    and not exists (select 1 from naive as n where n.transfer_id = m.transfer_id and n.occurrence_date = m.occurrence_date
                                              and n.due_date <= (select d from h))
  union all
  select format('%s %s: %s', k.kind, k.id, private.moneyflow_shape_violation(k.kind, k.id))
  from (select 'transfer' as kind, t.id from public.transfers as t where t.budget_id = (select id from b)
        union all select 'income', i.id from public.incomes as i where i.budget_id = (select id from b)) as k
  where private.moneyflow_shape_violation(k.kind, k.id) is not null
  union all
  select format('period %s: money flow incomes %s, salaries %s, stays %s', f.seq, f.incomes, private.salary_total((select id from b), f.seq), f.stays)
  from (select mf.seq,
               coalesce(sum(mf.amount) filter (where mf.row_kind = 'income'), 0) as incomes,
               coalesce(sum(mf.stays) filter (where mf.row_kind in ('account', 'not_assigned')), 0) as stays
        from mf group by mf.seq) as f
  where f.incomes <> private.salary_total((select id from b), f.seq) or f.stays <> f.incomes
  union all
  select format('period %s: account %s in %s out %s, its links %s / %s', a.seq, a.name, a.inflow, a.outflow, i.s, o.s)
  from mf as a
  cross join lateral (select coalesce(sum(m.amount), 0) as s from mf as m
                      where m.seq = a.seq and m.row_kind in ('income', 'transfer') and m.target_id = a.id) as i
  cross join lateral (select coalesce(sum(m.amount), 0) as s from mf as m
                      where m.seq = a.seq and m.row_kind = 'transfer' and m.source_id = a.id) as o
  where a.row_kind = 'account' and (a.inflow <> i.s or a.outflow <> o.s)
  union all
  select format('period %s: transfer %s at %s, its monthly share is %s', t.seq, t.name, t.amount,
                case when t.cadence is null or t.cadence = 'monthly' then t.planned_amount
                     when t.cadence = 'quarterly' then (2 * t.planned_amount + 3) / 6
                     else (2 * t.planned_amount + 12) / 24 end)
  from mf as t
  where t.row_kind = 'transfer'
    and t.amount <> case when t.cadence is null or t.cadence = 'monthly' then t.planned_amount
                         when t.cadence = 'quarterly' then (2 * t.planned_amount + 3) / 6
                         else (2 * t.planned_amount + 12) / 24 end
$$;

grant execute on all functions in schema tests to anon, authenticated;

select has_function('tests', 'authenticate_as', array['text'], 'test helpers are installed');

select * from finish();
commit;
