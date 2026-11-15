-- Step 2: budgets, members, invitations, incomes (versioned) and periods.
--
-- The client contract (tables, views, RPCs, error codes) is documented in docs/database.md;
-- the rules are in spec/spec.json (docs/spec.md). Conventions from the profiles migration
-- apply: explicit privileges, RLS with policies in the same migration, helpers in `private`,
-- `set search_path = ''`, schema-qualified names.
--
-- Access model
--   * Every read goes through RLS. Policies use the set-returning helpers
--     private.member_budget_ids() / private.owned_budget_ids() as `in (select ...)`, so the
--     helper runs once per statement (initPlan) and, being security definer, never
--     re-enters the policies of budget_members (no recursion).
--   * Writes that touch several rows or need invariants go through security definer RPCs in
--     `public`, which check membership themselves. The client can write directly only
--     budgets.name and incomes.name (members); deletes go through RPCs that say why.
--   * RPC errors are raised with SQLSTATE P0001 and a stable snake_case message code.
--   * Every RPC that changes a budget's periods, incomes or members first takes the
--     budget's advisory lock (private.lock_budget) and only then reads the rows it checks.
--
-- Periods: one per calendar month
--   * Each period belongs to one month (`month`, the first day of that month) and starts on
--     that month's salary: `anchor_date` is the actual pay date of the primary income for
--     that month, computed when the period was created. Consecutive periods have consecutive
--     months, so no month ever has two periods and a month's salary never counts twice.
--   * A period ends the day before the next period starts. The latest period's end is a
--     projection: the day before the next month's actual pay date under the terms in force
--     for the next period, unless set by hand.
--   * A boundary set by hand lies within 14 days of the salary it stands for.
--   * No period starts after today. Periods are created on demand up to the one containing
--     today, and never after the budget's final month (`end_month`).
--
-- Versions
--   * Periods are numbered per budget (seq 1, 2, ...). Income validity and versions refer to
--     seq, not to dates, so moving a period boundary never changes which version applies.
--   * An income counts in period seq p when first_seq <= p and (end_seq is null or p < end_seq),
--     at the version with the greatest effective_from_seq <= p.
--   * Writing a version for period s discards the versions keyed to later periods
--     (trigger private.discard_later_versions, reused by every versioned table).

-- ===========================================================================
-- Types
-- ===========================================================================
create type public.weekend_rule as enum ('nearest', 'previous', 'next', 'none');
comment on type public.weekend_rule is
  'What happens when a pay date falls on a weekend: nearest (Sat->Fri, Sun->Mon), previous (->Fri), next (->Mon), none.';

grant usage on schema private to authenticated;

-- ===========================================================================
-- Limits (one place, so the docs and tests can refer to them)
-- ===========================================================================
create or replace function private.limit_owned_budgets() returns integer
language sql immutable set search_path = '' as $$ select 20 $$;
create or replace function private.limit_members() returns integer
language sql immutable set search_path = '' as $$ select 20 $$;
create or replace function private.limit_pending_invitations() returns integer
language sql immutable set search_path = '' as $$ select 20 $$;
-- Incomes in force (not ended) per budget.
create or replace function private.limit_active_incomes() returns integer
language sql immutable set search_path = '' as $$ select 50 $$;
-- All income rows per budget, ended ones included: the abuse bound.
create or replace function private.limit_total_incomes() returns integer
language sql immutable set search_path = '' as $$ select 500 $$;
-- How far back a budget may start tracking, in months.
create or replace function private.limit_start_months_back() returns integer
language sql immutable set search_path = '' as $$ select 60 $$;
-- Largest income amount in rappen (CHF 10 million per month).
create or replace function private.limit_amount() returns bigint
language sql immutable set search_path = '' as $$ select 1000000000::bigint $$;
-- How far a boundary set by hand may lie from the salary it stands for, in days.
create or replace function private.limit_boundary_shift_days() returns integer
language sql immutable set search_path = '' as $$ select 14 $$;
-- How long an invitation stays valid, in days.
create or replace function private.limit_invitation_days() returns integer
language sql immutable set search_path = '' as $$ select 30 $$;

-- ===========================================================================
-- "Today": the Europe/Zurich calendar date. The only source of the current date; tests
-- pin it by replacing this function inside their transaction.
-- ===========================================================================
create or replace function private.today()
returns date
language sql
stable
set search_path = ''
as $$
  select (pg_catalog.now() at time zone 'Europe/Zurich')::date
$$;

-- ===========================================================================
-- Pay dates (pure)
-- ===========================================================================

-- Actual pay date in a month: clamp the nominal day to the month's length, then apply the
-- weekend rule. May fall in the previous or next month (for example the 1st on a Saturday
-- with `nearest` is paid on the last day of the previous month).
create or replace function public.pay_date(
  p_year integer,
  p_month integer,
  p_pay_day integer,
  p_weekend_rule public.weekend_rule default 'nearest'
)
returns date
language plpgsql
immutable
set search_path = ''
as $$
declare
  first_of_month date;
  nominal date;
  dow integer;
begin
  if p_year is null or p_month is null or p_pay_day is null or p_weekend_rule is null then
    return null;
  end if;
  if p_month not between 1 and 12 or p_pay_day not between 1 and 31
     or p_year not between 1900 and 2999 then
    raise exception 'invalid_pay_day' using errcode = 'P0001';
  end if;
  first_of_month := pg_catalog.make_date(p_year, p_month, 1);
  nominal := first_of_month + (least(
    p_pay_day,
    extract(day from (first_of_month + interval '1 month' - interval '1 day'))::integer
  ) - 1);
  dow := extract(isodow from nominal)::integer;  -- 6 = Saturday, 7 = Sunday
  return case
    when dow = 6 and p_weekend_rule in ('nearest', 'previous') then nominal - 1
    when dow = 6 and p_weekend_rule = 'next' then nominal + 2
    when dow = 7 and p_weekend_rule in ('nearest', 'next') then nominal + 1
    when dow = 7 and p_weekend_rule = 'previous' then nominal - 2
    else nominal
  end;
end;
$$;

comment on function public.pay_date(integer, integer, integer, public.weekend_rule) is
  'Actual (clamped, weekend-adjusted) pay date of a nominal pay day in a month. Pure.';

-- Actual pay date for the month containing p_month.
create or replace function private.month_pay_date(
  p_month date,
  p_pay_day integer,
  p_weekend_rule public.weekend_rule
)
returns date
language sql
immutable
set search_path = ''
as $$
  select public.pay_date(
    extract(year from p_month)::integer, extract(month from p_month)::integer,
    p_pay_day, p_weekend_rule
  )
$$;

-- First actual pay date on or after p_from.
create or replace function private.next_pay_date(
  p_from date,
  p_pay_day integer,
  p_weekend_rule public.weekend_rule
)
returns date
language sql
immutable
set search_path = ''
as $$
  select pg_catalog.min(d)
  from (
    select private.month_pay_date(m::date, p_pay_day, p_weekend_rule) as d
    from pg_catalog.generate_series(
      pg_catalog.date_trunc('month', p_from) - interval '1 month',
      pg_catalog.date_trunc('month', p_from) + interval '2 months',
      interval '1 month'
    ) as m
  ) as candidates
  where d >= p_from
$$;

-- The latest month whose actual pay date is on or before p_on: the month of the period
-- that contains p_on for a budget with these terms.
create or replace function private.month_paid_by(
  p_on date,
  p_pay_day integer,
  p_weekend_rule public.weekend_rule
)
returns date
language sql
immutable
set search_path = ''
as $$
  select pg_catalog.max(m::date)
  from pg_catalog.generate_series(
    pg_catalog.date_trunc('month', p_on) - interval '2 months',
    pg_catalog.date_trunc('month', p_on) + interval '1 month',
    interval '1 month'
  ) as m
  where private.month_pay_date(m::date, p_pay_day, p_weekend_rule) <= p_on
$$;

-- Dates the API accepts: finite and in a sane range.
create or replace function private.is_sane_date(p_date date)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_date is not null and pg_catalog.isfinite(p_date)
     and p_date between date '1900-01-01' and date '2999-12-31'
$$;

-- ===========================================================================
-- Tables
-- ===========================================================================
create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references auth.users (id) on delete cascade,
  primary_income_id uuid not null,
  -- The last month tracked (first day of the month): no period after it. Null: no end.
  end_month date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint budgets_name_valid check (name = btrim(name) and char_length(name) between 1 and 100),
  constraint budgets_end_month_valid check (end_month is null or end_month = date_trunc('month', end_month)::date)
);
comment on table public.budgets is 'A budget. Deleting the owner''s account deletes the budget.';
create index budgets_owner_id_idx on public.budgets (owner_id);

create table public.budget_members (
  budget_id uuid not null references public.budgets (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (budget_id, user_id)
);
create index budget_members_user_id_idx on public.budget_members (user_id);

create table public.budget_invitations (
  id uuid primary key default gen_random_uuid(),
  budget_id uuid not null references public.budgets (id) on delete cascade,
  email text not null,
  invited_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days'),
  constraint budget_invitations_email_valid check (
    email = lower(btrim(email)) and char_length(email) between 3 and 254
    and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
  ),
  constraint budget_invitations_unique unique (budget_id, email)
);
create index budget_invitations_email_idx on public.budget_invitations (email);
create index budget_invitations_invited_by_idx on public.budget_invitations (invited_by);

create table public.incomes (
  id uuid primary key default gen_random_uuid(),
  budget_id uuid not null references public.budgets (id) on delete cascade,
  -- Whose income it is. Kept (as history) when the person leaves the budget.
  user_id uuid references auth.users (id) on delete set null,
  name text not null,
  first_seq integer not null,
  end_seq integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint incomes_name_valid check (name = btrim(name) and char_length(name) between 1 and 100),
  constraint incomes_seq_valid check (first_seq >= 1 and (end_seq is null or end_seq > first_seq)),
  constraint incomes_id_budget_unique unique (id, budget_id)
);
create index incomes_budget_id_idx on public.incomes (budget_id);
create index incomes_user_id_idx on public.incomes (user_id);

alter table public.budgets
  add constraint budgets_primary_income_fk
  foreign key (primary_income_id, id) references public.incomes (id, budget_id)
  deferrable initially deferred;
create index budgets_primary_income_id_idx on public.budgets (primary_income_id, id);

create table public.income_versions (
  id uuid primary key default gen_random_uuid(),
  income_id uuid not null,
  budget_id uuid not null,
  effective_from_seq integer not null,
  amount bigint not null,
  pay_day integer not null,
  weekend_rule public.weekend_rule not null default 'nearest',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint income_versions_income_fk foreign key (income_id, budget_id)
    references public.incomes (id, budget_id) on delete cascade,
  constraint income_versions_unique unique (income_id, effective_from_seq),
  constraint income_versions_seq_valid check (effective_from_seq >= 1),
  constraint income_versions_amount_valid check (amount between 1 and 1000000000),
  constraint income_versions_pay_day_valid check (pay_day between 1 and 31)
);
create index income_versions_budget_id_idx on public.income_versions (budget_id);
create index income_versions_income_budget_idx on public.income_versions (income_id, budget_id);

create table public.periods (
  id uuid primary key default gen_random_uuid(),
  budget_id uuid not null references public.budgets (id) on delete cascade,
  seq integer not null,
  -- The month this period belongs to (first day of the month).
  month date not null,
  -- The primary income's actual pay date for that month, when the period was created.
  anchor_date date not null,
  start_date date not null,
  end_date date not null,
  -- true once a person has set this period's end (and so the next period's start) by hand;
  -- recomputation never overwrites it.
  end_is_manual boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint periods_seq_unique unique (budget_id, seq),
  constraint periods_month_unique unique (budget_id, month),
  constraint periods_start_unique unique (budget_id, start_date),
  constraint periods_seq_valid check (seq >= 1),
  constraint periods_month_valid check (month = date_trunc('month', month)::date),
  constraint periods_dates_valid check (end_date >= start_date and end_date - start_date <= 92)
);

-- updated_at
create trigger budgets_set_updated_at before update on public.budgets
  for each row execute function private.set_updated_at();
create trigger incomes_set_updated_at before update on public.incomes
  for each row execute function private.set_updated_at();
create trigger income_versions_set_updated_at before update on public.income_versions
  for each row execute function private.set_updated_at();
create trigger periods_set_updated_at before update on public.periods
  for each row execute function private.set_updated_at();

-- ===========================================================================
-- Membership helpers, reused by the policies of every budget-owned table.
-- security definer: they read budget_members / budgets without going through RLS.
-- ===========================================================================
create or replace function private.member_budget_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.budget_id from public.budget_members as m where m.user_id = (select auth.uid())
$$;

create or replace function private.owned_budget_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select b.id from public.budgets as b where b.owner_id = (select auth.uid())
$$;

-- Profiles the caller may read: their own, people who share a budget with them, and the
-- owners of incomes in their budgets (so a former member's income keeps its label).
create or replace function private.visible_profile_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid())
  union
  select other.user_id
  from public.budget_members as mine
  join public.budget_members as other on other.budget_id = mine.budget_id
  where mine.user_id = (select auth.uid())
  union
  select i.user_id
  from public.budget_members as mine
  join public.incomes as i on i.budget_id = mine.budget_id
  where mine.user_id = (select auth.uid()) and i.user_id is not null
$$;

create or replace function private.is_budget_member(p_budget_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.budget_members as m
    where m.budget_id = p_budget_id and m.user_id = (select auth.uid())
  )
$$;

create or replace function private.is_budget_owner(p_budget_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.budgets as b
    where b.id = p_budget_id and b.owner_id = (select auth.uid())
  )
$$;

-- Raise budget_not_found unless the caller is a member (non-members cannot tell a budget
-- they may not see from one that does not exist).
create or replace function private.assert_member(p_budget_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or p_budget_id is null or not private.is_budget_member(p_budget_id) then
    raise exception 'budget_not_found' using errcode = 'P0001';
  end if;
end;
$$;

create or replace function private.assert_owner(p_budget_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.assert_member(p_budget_id);
  if not private.is_budget_owner(p_budget_id) then
    raise exception 'not_owner' using errcode = 'P0001';
  end if;
end;
$$;

-- Verified email of the caller, or null. Relies on the Auth setting "Confirm email" being on
-- in the hosted project (docs/deployment.md).
create or replace function private.current_verified_email()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select lower(u.email)
  from auth.users as u
  where u.id = (select auth.uid()) and u.email_confirmed_at is not null and u.email is not null
$$;

-- ===========================================================================
-- Invariants (constraint triggers, checked at commit so multi-row RPCs can pass through
-- intermediate states)
-- ===========================================================================

-- The owner is always a member, and keeps their membership while the budget exists.
create or replace function private.check_budget_owner_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_budget_id uuid;
begin
  -- (plpgsql resolves record fields only when a branch runs, hence if/else, not case)
  if tg_table_name = 'budgets' then v_budget_id := new.id; else v_budget_id := old.budget_id; end if;
  if exists (
    select 1 from public.budgets as b
    where b.id = v_budget_id
      and not exists (
        select 1 from public.budget_members as m
        where m.budget_id = b.id and m.user_id = b.owner_id
      )
  ) then
    raise exception 'owner_must_be_member' using errcode = '23514';
  end if;
  return null;
end;
$$;

create constraint trigger budgets_owner_is_member
  after insert or update of owner_id on public.budgets
  deferrable initially deferred
  for each row execute function private.check_budget_owner_membership();

create constraint trigger budget_members_owner_stays
  after delete on public.budget_members
  deferrable initially deferred
  for each row execute function private.check_budget_owner_membership();

-- The primary income is an active income of the same budget (the FK covers "same budget").
create or replace function private.check_primary_income()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_budget_id uuid;
begin
  if tg_table_name = 'budgets' then v_budget_id := new.id; else v_budget_id := new.budget_id; end if;
  if exists (
    select 1
    from public.budgets as b
    join public.incomes as i on i.id = b.primary_income_id
    where b.id = v_budget_id and i.end_seq is not null
  ) then
    raise exception 'primary_income_must_be_active' using errcode = '23514';
  end if;
  return null;
end;
$$;

create constraint trigger budgets_primary_income_active
  after insert or update of primary_income_id on public.budgets
  deferrable initially deferred
  for each row execute function private.check_primary_income();

create constraint trigger incomes_primary_stays_active
  after update of end_seq on public.incomes
  deferrable initially deferred
  for each row execute function private.check_primary_income();

-- Every income has a version in force from its first period.
create or replace function private.check_income_has_first_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_income_id uuid;
begin
  if tg_table_name = 'incomes' then v_income_id := new.id; else v_income_id := old.income_id; end if;
  if exists (
    select 1 from public.incomes as i
    where i.id = v_income_id
      and not exists (
        select 1 from public.income_versions as v
        where v.income_id = i.id and v.effective_from_seq <= i.first_seq
      )
  ) then
    raise exception 'income_needs_version' using errcode = '23514';
  end if;
  return null;
end;
$$;

create constraint trigger incomes_have_first_version
  after insert or update of first_seq on public.incomes
  deferrable initially deferred
  for each row execute function private.check_income_has_first_version();

create constraint trigger income_versions_keep_first
  after delete or update of effective_from_seq on public.income_versions
  deferrable initially deferred
  for each row execute function private.check_income_has_first_version();

-- Periods: numbered 1..n without gaps, one per month with consecutive months, contiguous,
-- each starting within 14 days of its month's salary, none starting after today, none
-- after the budget's final month.
create or replace function private.check_periods()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_budget_id uuid;
  v_end_month date;
begin
  if tg_table_name = 'budgets' then
    v_budget_id := new.id;
  elsif tg_op = 'DELETE' then
    v_budget_id := old.budget_id;
  else
    v_budget_id := new.budget_id;
  end if;
  select b.end_month into v_end_month from public.budgets as b where b.id = v_budget_id;
  if not found then
    return null;  -- budget deleted: its periods go with it
  end if;
  if exists (
    select 1
    from (
      select p.seq, p.month, p.anchor_date, p.start_date, p.end_date,
             pg_catalog.lag(p.end_date) over w as prev_end,
             pg_catalog.lag(p.month) over w as prev_month,
             pg_catalog.row_number() over w as rn
      from public.periods as p
      where p.budget_id = v_budget_id
      window w as (order by p.seq)
    ) as s
    where s.seq <> s.rn
       or (s.prev_end is not null and s.start_date <> s.prev_end + 1)
       or (s.prev_month is not null and s.month <> (s.prev_month + interval '1 month')::date)
       or abs(s.start_date - s.anchor_date) > private.limit_boundary_shift_days()
       or s.start_date > private.today()
       or (v_end_month is not null and s.month > v_end_month)
  ) then
    raise exception 'periods_invalid' using errcode = '23514';
  end if;
  return null;
end;
$$;

create constraint trigger periods_valid
  after insert or update or delete on public.periods
  deferrable initially deferred
  for each row execute function private.check_periods();

create constraint trigger budgets_end_month_keeps_periods
  after update of end_month on public.budgets
  deferrable initially deferred
  for each row execute function private.check_periods();

-- Versions: writing a version for period s discards the versions of the same entity keyed
-- to later periods, so the version just written is in force from s on. Generic: the first
-- trigger argument names the entity column (income_id here; category, subscription and
-- debt versions reuse it). Runs as the table owner so it sees every version.
create or replace function private.discard_later_versions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text := pg_catalog.to_jsonb(new) ->> tg_argv[0];
begin
  execute pg_catalog.format(
    'delete from %I.%I where %I = $1::uuid and effective_from_seq > $2',
    tg_table_schema, tg_table_name, tg_argv[0]
  ) using v_key, new.effective_from_seq;
  return null;
end;
$$;

create trigger income_versions_discard_later
  after insert or update of effective_from_seq, amount, pay_day, weekend_rule on public.income_versions
  for each row execute function private.discard_later_versions('income_id');

-- ===========================================================================
-- Period mechanics (internal, no access checks: callers check membership)
-- ===========================================================================

-- Serialise every change to a budget's periods, incomes and members. A transaction-level
-- advisory lock, so it never waits on (or blocks) the row locks that inserts referencing the
-- budget take. Returns the budget row, read after the lock is held.
create or replace function private.lock_budget(p_budget_id uuid)
returns public.budgets
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_budget public.budgets;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('budget:' || p_budget_id::text, 0));
  select b.* into v_budget from public.budgets as b where b.id = p_budget_id;
  return v_budget;
end;
$$;

-- Terms of an income in force for period seq p (the version with the greatest
-- effective_from_seq <= p; the first version if the income starts later).
create or replace function private.terms_at(p_income_id uuid, p_seq integer)
returns table (amount bigint, pay_day integer, weekend_rule public.weekend_rule, effective_from_seq integer)
language sql
stable
set search_path = ''
as $$
  select v.amount, v.pay_day, v.weekend_rule, v.effective_from_seq
  from public.income_versions as v
  where v.income_id = p_income_id
  order by (v.effective_from_seq <= p_seq) desc,
           case when v.effective_from_seq <= p_seq then -v.effective_from_seq else v.effective_from_seq end
  limit 1
$$;

-- The primary income's actual pay date for p_month, under its terms for period seq p_seq.
create or replace function private.scheduled_pay_date(p_budget_id uuid, p_month date, p_seq integer)
returns date
language sql
stable
set search_path = ''
as $$
  select private.month_pay_date(p_month, t.pay_day, t.weekend_rule)
  from public.budgets as b
  cross join lateral private.terms_at(b.primary_income_id, p_seq) as t
  where b.id = p_budget_id
$$;

-- The scheduled end of a period: the day before the next month's salary (never before the
-- period's own start).
create or replace function private.scheduled_end(p_budget_id uuid, p_period public.periods)
returns date
language sql
stable
set search_path = ''
as $$
  select greatest(
    p_period.start_date,
    private.scheduled_pay_date(p_budget_id, (p_period.month + interval '1 month')::date, p_period.seq + 1) - 1
  )
$$;

-- The budget's last day tracked: the end of its final month's period (projected when that
-- period does not exist yet). Null when the budget has no end.
create or replace function private.budget_end_date(p_budget_id uuid)
returns date
language sql
stable
set search_path = ''
as $$
  select case
    when b.end_month is null then null
    when f.end_date is not null then f.end_date
    else private.scheduled_pay_date(
      b.id, (b.end_month + interval '1 month')::date,
      (select pg_catalog.max(p.seq) + 1 from public.periods as p where p.budget_id = b.id)
    ) - 1
  end
  from public.budgets as b
  left join public.periods as f on f.budget_id = b.id and f.month = b.end_month
  where b.id = p_budget_id
$$;

-- Create the missing periods up to the one containing today (never after the final month).
-- Idempotent. Returns how many periods were created. Takes the budget lock only when there
-- is something to create.
create or replace function private.ensure_periods(p_budget_id uuid)
returns integer
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_today date := private.today();
  v_end_month date;
  v_last public.periods;
  v_month date;
  v_start date;
  v_new public.periods;
  v_created integer := 0;
begin
  -- Fast path, without the lock: nothing to create.
  select p.* into v_last from public.periods as p
  where p.budget_id = p_budget_id order by p.seq desc limit 1;
  select b.end_month into v_end_month from public.budgets as b where b.id = p_budget_id;
  if v_last.id is null or v_last.end_date >= v_today
     or (v_end_month is not null and v_last.month >= v_end_month) then
    return 0;
  end if;

  v_end_month := (private.lock_budget(p_budget_id)).end_month;
  loop
    select p.* into v_last from public.periods as p
    where p.budget_id = p_budget_id order by p.seq desc limit 1;
    exit when v_last.id is null;
    exit when v_last.end_date >= v_today;
    exit when v_end_month is not null and v_last.month >= v_end_month;
    v_month := (v_last.month + interval '1 month')::date;
    v_start := v_last.end_date + 1;
    v_new.seq := v_last.seq + 1;
    v_new.month := v_month;
    v_new.start_date := v_start;
    insert into public.periods (budget_id, seq, month, anchor_date, start_date, end_date)
    values (
      p_budget_id, v_new.seq, v_month,
      private.scheduled_pay_date(p_budget_id, v_month, v_new.seq),
      v_start,
      private.scheduled_end(p_budget_id, v_new)
    );
    v_created := v_created + 1;
    -- Bounded by the start-month limit; this guard only stops a logic error from looping.
    if v_created > private.limit_start_months_back() + 24 then
      raise exception 'period_generation_runaway' using errcode = 'P0001';
    end if;
  end loop;
  return v_created;
end;
$$;

-- The period containing today, after creating missing periods.
create or replace function private.current_period(p_budget_id uuid)
returns public.periods
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_period public.periods;
begin
  perform private.ensure_periods(p_budget_id);
  select p.* into v_period from public.periods as p
  where p.budget_id = p_budget_id and private.today() between p.start_date and p.end_date;
  return v_period;
end;
$$;

-- seq of the current period; raises budget_ended when the budget's last period is over.
create or replace function private.current_seq(p_budget_id uuid)
returns integer
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_seq integer := (private.current_period(p_budget_id)).seq;
begin
  if v_seq is null then
    raise exception 'budget_ended' using errcode = 'P0001';
  end if;
  return v_seq;
end;
$$;

-- seq for reads (views): the period containing today, else the last period. No side effects.
create or replace function private.reading_seq(p_budget_id uuid)
returns integer
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (select p.seq from public.periods as p
     where p.budget_id = p_budget_id and private.today() between p.start_date and p.end_date),
    (select pg_catalog.max(p.seq) from public.periods as p where p.budget_id = p_budget_id)
  )
$$;

-- seq from which a removal takes effect: the current period, or after the last period of a
-- budget that has ended (so nothing in its history changes).
create or replace function private.removal_seq(p_budget_id uuid)
returns integer
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_seq integer := (private.current_period(p_budget_id)).seq;
begin
  if v_seq is null then
    select pg_catalog.max(p.seq) + 1 into v_seq from public.periods as p
    where p.budget_id = p_budget_id;
  end if;
  return v_seq;
end;
$$;

-- Re-project the current period's end after the primary income's terms changed or the
-- primary was switched: the day before the next month's salary under the new terms. The
-- start of the current period never moves. A manual end is kept while it still lies within
-- 14 days of the new schedule; otherwise it is reset to the schedule. Caller holds the lock.
create or replace function private.recompute_projected_end(p_budget_id uuid)
returns void
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_last public.periods;
  v_end date;
begin
  select p.* into v_last from public.periods as p
  where p.budget_id = p_budget_id order by p.seq desc limit 1;
  if v_last.id is null or v_last.end_date < private.today() then
    return;  -- no current period: closed periods are never recomputed
  end if;
  v_end := private.scheduled_end(p_budget_id, v_last);
  if v_last.end_is_manual
     and abs(v_last.end_date - v_end) <= private.limit_boundary_shift_days() then
    return;
  end if;
  update public.periods set end_date = v_end, end_is_manual = false
  where id = v_last.id and (end_date <> v_end or end_is_manual);
  perform private.ensure_periods(p_budget_id);
end;
$$;

-- End or delete the incomes of a person leaving a budget. Caller holds the lock.
create or replace function private.end_member_incomes(p_budget_id uuid, p_user_id uuid)
returns void
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_seq integer;
begin
  if exists (
    select 1 from public.budgets as b
    join public.incomes as i on i.id = b.primary_income_id
    where b.id = p_budget_id and i.user_id = p_user_id
  ) then
    raise exception 'member_has_primary_income' using errcode = 'P0001';
  end if;
  v_seq := private.removal_seq(p_budget_id);
  delete from public.incomes as i
  where i.budget_id = p_budget_id and i.user_id = p_user_id and i.end_seq is null
    and i.first_seq >= v_seq;
  update public.incomes as i set end_seq = v_seq
  where i.budget_id = p_budget_id and i.user_id = p_user_id and i.end_seq is null;
end;
$$;

-- Shared validation of income terms.
create or replace function private.assert_income_terms(
  p_amount bigint,
  p_pay_day integer,
  p_weekend_rule public.weekend_rule
)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_amount is null or p_amount < 1 or p_amount > private.limit_amount() then
    raise exception 'invalid_amount' using errcode = 'P0001';
  end if;
  if p_pay_day is null or p_pay_day not between 1 and 31 then
    raise exception 'invalid_pay_day' using errcode = 'P0001';
  end if;
  if p_weekend_rule is null then
    raise exception 'invalid_weekend_rule' using errcode = 'P0001';
  end if;
end;
$$;

create or replace function private.clean_name(p_name text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_name text := btrim(p_name);
begin
  if v_name is null or char_length(v_name) not between 1 and 100 then
    raise exception 'invalid_name' using errcode = 'P0001';
  end if;
  return v_name;
end;
$$;

-- seq of a period of the given budget, or period_not_found.
create or replace function private.period_seq(p_budget_id uuid, p_period_id uuid)
returns integer
language plpgsql
stable
set search_path = ''
as $$
declare
  v_seq integer;
begin
  select p.seq into v_seq from public.periods as p
  where p.id = p_period_id and p.budget_id = p_budget_id;
  if v_seq is null then
    raise exception 'period_not_found' using errcode = 'P0001';
  end if;
  return v_seq;
end;
$$;

-- Lock the budget of an income and return the income, read after the lock; income_not_found
-- unless it exists and the caller is a member.
create or replace function private.lock_income(p_income_id uuid)
returns public.incomes
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_budget_id uuid;
  v_income public.incomes;
begin
  select i.budget_id into v_budget_id from public.incomes as i where i.id = p_income_id;
  if v_budget_id is null or not private.is_budget_member(v_budget_id) then
    raise exception 'income_not_found' using errcode = 'P0001';
  end if;
  perform private.lock_budget(v_budget_id);
  select i.* into v_income from public.incomes as i where i.id = p_income_id;
  if v_income.id is null then
    raise exception 'income_not_found' using errcode = 'P0001';
  end if;
  return v_income;
end;
$$;

-- ===========================================================================
-- Profiles: email for member lists; readable by co-members and by members of budgets where
-- the person has an income
-- ===========================================================================
alter table public.profiles add column email text;

update public.profiles as p set email = u.email from auth.users as u where u.id = p.id;

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, email)
  values (
    new.id,
    nullif(pg_catalog.left(pg_catalog.btrim(new.raw_user_meta_data ->> 'display_name'), 100), ''),
    new.email
  );
  return new;
end;
$$;

create or replace function private.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end;
$$;
revoke all on function private.handle_user_email_change() from public;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row
  when (old.email is distinct from new.email)
  execute function private.handle_user_email_change();

drop policy "Users can read their own profile" on public.profiles;
create policy "Users can read their own and co-members' profiles"
  on public.profiles
  for select
  to authenticated
  using (id in (select private.visible_profile_ids()));

-- ===========================================================================
-- Views (security_invoker: the caller's RLS applies)
-- ===========================================================================

-- Budgets I belong to, with my role.
create view public.my_budgets with (security_invoker = true) as
  select
    b.id,
    b.name,
    b.owner_id,
    b.primary_income_id,
    b.end_month,
    private.budget_end_date(b.id) as end_date,
    b.created_at,
    b.updated_at,
    (b.owner_id = (select auth.uid())) as is_owner
  from public.budgets as b
  join public.budget_members as m on m.budget_id = b.id and m.user_id = (select auth.uid());

-- Members of the budgets I belong to, with what the UI shows.
create view public.budget_member_list with (security_invoker = true) as
  select
    m.budget_id,
    m.user_id,
    case when b.owner_id = m.user_id then 'owner' else 'member' end as role,
    p.display_name,
    p.email,
    m.created_at as joined_at
  from public.budget_members as m
  join public.budgets as b on b.id = m.budget_id
  left join public.profiles as p on p.id = m.user_id;

-- Incomes with their terms in force now, owner's name, primary flag and next pay date.
create view public.income_overview with (security_invoker = true) as
  select
    i.id,
    i.budget_id,
    i.user_id,
    p.display_name as user_display_name,
    i.name,
    (b.primary_income_id = i.id) as is_primary,
    (i.end_seq is null) as is_active,
    i.first_seq,
    i.end_seq,
    t.amount,
    t.pay_day,
    t.weekend_rule,
    t.effective_from_seq as terms_from_seq,
    case when i.end_seq is null
      then private.next_pay_date(private.today(), t.pay_day, t.weekend_rule)
    end as next_pay_date,
    i.created_at,
    i.updated_at
  from public.incomes as i
  join public.budgets as b on b.id = i.budget_id
  left join public.profiles as p on p.id = i.user_id
  -- the terms in force for the period being read (as private.terms_at, inlined so the
  -- columns keep their table types)
  join lateral (
    select v.amount, v.pay_day, v.weekend_rule, v.effective_from_seq
    from public.income_versions as v
    where v.income_id = i.id
    order by (v.effective_from_seq <= private.reading_seq(i.budget_id)) desc,
             case when v.effective_from_seq <= private.reading_seq(i.budget_id)
                  then -v.effective_from_seq else v.effective_from_seq end
    limit 1
  ) as t on true;

-- Periods with the total of the incomes in force in each, at the version in force.
create view public.period_summaries with (security_invoker = true) as
  select
    p.id,
    p.budget_id,
    p.seq,
    p.month,
    p.anchor_date,
    p.start_date,
    p.end_date,
    p.end_is_manual,
    (private.today() between p.start_date and p.end_date) as is_current,
    private.today() as today,
    coalesce((
      select pg_catalog.sum(v.amount)
      from public.incomes as i
      join lateral (
        select iv.amount
        from public.income_versions as iv
        where iv.income_id = i.id and iv.effective_from_seq <= p.seq
        order by iv.effective_from_seq desc
        limit 1
      ) as v on true
      where i.budget_id = p.budget_id
        and i.first_seq <= p.seq
        and (i.end_seq is null or p.seq < i.end_seq)
    ), 0)::bigint as income_total
  from public.periods as p;

-- ===========================================================================
-- RPCs
-- ===========================================================================

-- The database's today and the months a new budget may start from, for the given primary
-- income terms: the current period's month first, then up to 60 months back, each with the
-- date its first period would start.
create or replace function public.get_start_months(
  p_pay_day integer,
  p_weekend_rule public.weekend_rule default 'nearest'
)
returns table (today date, month date, start_date date, is_default boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_today date := private.today();
  v_current date;
  v_oldest date;
begin
  if (select auth.uid()) is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;
  perform private.assert_income_terms(1, p_pay_day, p_weekend_rule);
  v_current := private.month_paid_by(v_today, p_pay_day, p_weekend_rule);
  v_oldest := (pg_catalog.date_trunc('month', v_today)
               - pg_catalog.make_interval(months => private.limit_start_months_back()))::date;
  return query
    select v_today, m::date, private.month_pay_date(m::date, p_pay_day, p_weekend_rule), m::date = v_current
    from pg_catalog.generate_series(v_current, v_oldest, interval '-1 month') as m;
end;
$$;

create or replace function public.create_budget(
  p_name text,
  p_income_name text,
  p_amount bigint,
  p_pay_day integer,
  p_weekend_rule public.weekend_rule default 'nearest',
  p_start_month date default null,
  p_end_date date default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_name text := private.clean_name(p_name);
  v_income_name text := private.clean_name(p_income_name);
  v_today date := private.today();
  v_budget_id uuid := gen_random_uuid();
  v_income_id uuid := gen_random_uuid();
  v_month date;
  v_first public.periods;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;
  perform private.assert_income_terms(p_amount, p_pay_day, p_weekend_rule);

  if p_start_month is null then
    v_month := private.month_paid_by(v_today, p_pay_day, p_weekend_rule);
  else
    if not private.is_sane_date(p_start_month) then
      raise exception 'invalid_start_month' using errcode = 'P0001';
    end if;
    v_month := pg_catalog.date_trunc('month', p_start_month)::date;
    if v_month < (pg_catalog.date_trunc('month', v_today)
                  - pg_catalog.make_interval(months => private.limit_start_months_back()))::date
       or private.month_pay_date(v_month, p_pay_day, p_weekend_rule) > v_today then
      raise exception 'invalid_start_month' using errcode = 'P0001';
    end if;
  end if;

  -- Serialise budget creation per user so the limit cannot be raced.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('create_budget:' || v_user, 0));
  if (select pg_catalog.count(*) from public.budgets where owner_id = v_user)
     >= private.limit_owned_budgets() then
    raise exception 'budget_limit_reached' using errcode = 'P0001';
  end if;

  insert into public.budgets (id, name, owner_id, primary_income_id)
  values (v_budget_id, v_name, v_user, v_income_id);
  insert into public.budget_members (budget_id, user_id) values (v_budget_id, v_user);
  insert into public.incomes (id, budget_id, user_id, name, first_seq)
  values (v_income_id, v_budget_id, v_user, v_income_name, 1);
  insert into public.income_versions (income_id, budget_id, effective_from_seq, amount, pay_day, weekend_rule)
  values (v_income_id, v_budget_id, 1, p_amount, p_pay_day, p_weekend_rule);

  v_first.seq := 1;
  v_first.month := v_month;
  v_first.start_date := private.month_pay_date(v_month, p_pay_day, p_weekend_rule);
  insert into public.periods (budget_id, seq, month, anchor_date, start_date, end_date)
  values (v_budget_id, 1, v_month, v_first.start_date, v_first.start_date,
          private.scheduled_end(v_budget_id, v_first));
  perform private.ensure_periods(v_budget_id);
  if p_end_date is not null then
    perform private.apply_end_date(v_budget_id, p_end_date);
  end if;
  return v_budget_id;
end;
$$;

-- Set the final month to the one whose period contains p_end_date (projected with the
-- current terms), or clear it with null. No access check; the caller holds the lock.
create or replace function private.apply_end_date(p_budget_id uuid, p_end_date date)
returns void
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_last public.periods;
  v_probe public.periods;
  v_steps integer := 0;
begin
  if p_end_date is null then
    update public.budgets set end_month = null where id = p_budget_id;
    perform private.ensure_periods(p_budget_id);
    return;
  end if;
  if not private.is_sane_date(p_end_date) or p_end_date > private.today() + 3660 then
    raise exception 'invalid_end_date' using errcode = 'P0001';
  end if;
  select p.* into v_last from public.periods as p
  where p.budget_id = p_budget_id order by p.seq desc limit 1;
  if p_end_date < v_last.start_date then
    raise exception 'end_date_before_last_period' using errcode = 'P0001';
  end if;

  -- Walk the projected periods from the last one to the one containing p_end_date.
  v_probe := v_last;
  while v_probe.end_date < p_end_date loop
    v_probe.start_date := v_probe.end_date + 1;
    v_probe.month := (v_probe.month + interval '1 month')::date;
    v_probe.seq := v_probe.seq + 1;
    v_probe.end_date := private.scheduled_end(p_budget_id, v_probe);
    v_steps := v_steps + 1;
    if v_steps > 130 then
      raise exception 'invalid_end_date' using errcode = 'P0001';
    end if;
  end loop;
  update public.budgets set end_month = v_probe.month where id = p_budget_id;
  perform private.ensure_periods(p_budget_id);
end;
$$;

-- Owner: set the end date (see private.apply_end_date) or clear it with null. Returns the
-- budget as my_budgets shows it.
create or replace function public.set_budget_end_date(p_budget_id uuid, p_end_date date default null)
returns setof public.my_budgets
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.assert_owner(p_budget_id);
  perform private.lock_budget(p_budget_id);
  perform private.apply_end_date(p_budget_id, p_end_date);
  return query select * from public.my_budgets where id = p_budget_id;
end;
$$;

-- Owner: delete the budget with everything in it.
create or replace function public.delete_budget(p_budget_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.assert_owner(p_budget_id);
  perform private.lock_budget(p_budget_id);
  delete from public.budgets where id = p_budget_id;
end;
$$;

-- Owner: cancel a pending invitation.
create or replace function public.cancel_invitation(p_invitation_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_budget_id uuid;
begin
  select i.budget_id into v_budget_id from public.budget_invitations as i where i.id = p_invitation_id;
  if v_budget_id is null or not private.is_budget_member(v_budget_id) then
    raise exception 'invitation_not_found' using errcode = 'P0001';
  end if;
  perform private.assert_owner(v_budget_id);
  delete from public.budget_invitations where id = p_invitation_id;
  if not found then
    raise exception 'invitation_not_found' using errcode = 'P0001';
  end if;
end;
$$;

-- The database's today (Europe/Zurich), for display.
create or replace function public.get_today()
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select private.today()
$$;

create or replace function public.invite_member(p_budget_id uuid, p_email text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(p_email));
  v_id uuid;
begin
  perform private.assert_owner(p_budget_id);
  if v_email is null or char_length(v_email) not between 3 and 254
     or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'invalid_email' using errcode = 'P0001';
  end if;
  perform private.lock_budget(p_budget_id);
  -- Members' emails are visible to the owner anyway, so this reveals nothing new.
  if exists (
    select 1 from public.budget_members as m
    join public.profiles as p on p.id = m.user_id
    where m.budget_id = p_budget_id and lower(p.email) = v_email
  ) then
    raise exception 'already_member' using errcode = 'P0001';
  end if;
  -- Re-inviting renews the invitation (same id, new expiry).
  update public.budget_invitations
  set created_at = now(),
      expires_at = now() + pg_catalog.make_interval(days => private.limit_invitation_days()),
      invited_by = (select auth.uid())
  where budget_id = p_budget_id and email = v_email
  returning id into v_id;
  if v_id is not null then
    return v_id;
  end if;
  delete from public.budget_invitations where budget_id = p_budget_id and expires_at <= now();
  if (select pg_catalog.count(*) from public.budget_invitations where budget_id = p_budget_id)
     >= private.limit_pending_invitations() then
    raise exception 'invitation_limit_reached' using errcode = 'P0001';
  end if;
  insert into public.budget_invitations (budget_id, email, invited_by, expires_at)
  values (p_budget_id, v_email, (select auth.uid()),
          now() + pg_catalog.make_interval(days => private.limit_invitation_days()))
  returning id into v_id;
  return v_id;
end;
$$;

-- Pending, unexpired invitations addressed to my verified email.
create or replace function public.list_my_invitations()
returns table (
  id uuid,
  budget_id uuid,
  budget_name text,
  invited_by_name text,
  invited_by_email text,
  created_at timestamptz,
  expires_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select i.id, i.budget_id, b.name, p.display_name, p.email, i.created_at, i.expires_at
  from public.budget_invitations as i
  join public.budgets as b on b.id = i.budget_id
  left join public.profiles as p on p.id = i.invited_by
  where i.email = private.current_verified_email() and i.expires_at > now()
  order by i.created_at
$$;

create or replace function public.accept_invitation(p_invitation_id uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_email text := private.current_verified_email();
  v_invitation public.budget_invitations;
begin
  -- Lock the invitation row: a concurrent cancel either waits for this accept or, if it
  -- committed first, leaves nothing to accept.
  select i.* into v_invitation from public.budget_invitations as i
  where i.id = p_invitation_id and v_user is not null and v_email is not null
    and i.email = v_email and i.expires_at > now()
  for update;
  if v_invitation.id is null then
    raise exception 'invitation_not_found' using errcode = 'P0001';
  end if;
  perform private.lock_budget(v_invitation.budget_id);
  if not exists (select 1 from public.budget_members
                 where budget_id = v_invitation.budget_id and user_id = v_user) then
    if (select pg_catalog.count(*) from public.budget_members
        where budget_id = v_invitation.budget_id) >= private.limit_members() then
      raise exception 'member_limit_reached' using errcode = 'P0001';
    end if;
    insert into public.budget_members (budget_id, user_id) values (v_invitation.budget_id, v_user);
  end if;
  delete from public.budget_invitations where id = v_invitation.id;
  return v_invitation.budget_id;
end;
$$;

create or replace function public.decline_invitation(p_invitation_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_email text := private.current_verified_email();
begin
  delete from public.budget_invitations as i
  where i.id = p_invitation_id and v_email is not null and i.email = v_email
    and i.expires_at > now();
  if not found then
    raise exception 'invitation_not_found' using errcode = 'P0001';
  end if;
end;
$$;

create or replace function public.remove_member(p_budget_id uuid, p_user_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.assert_owner(p_budget_id);
  if p_user_id = (select auth.uid()) then
    raise exception 'owner_cannot_leave' using errcode = 'P0001';
  end if;
  perform private.lock_budget(p_budget_id);
  if not exists (select 1 from public.budget_members
                 where budget_id = p_budget_id and user_id = p_user_id) then
    raise exception 'member_not_found' using errcode = 'P0001';
  end if;
  perform private.end_member_incomes(p_budget_id, p_user_id);
  delete from public.budget_members where budget_id = p_budget_id and user_id = p_user_id;
end;
$$;

create or replace function public.leave_budget(p_budget_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.assert_member(p_budget_id);
  if private.is_budget_owner(p_budget_id) then
    raise exception 'owner_cannot_leave' using errcode = 'P0001';
  end if;
  perform private.lock_budget(p_budget_id);
  perform private.end_member_incomes(p_budget_id, (select auth.uid()));
  delete from public.budget_members
  where budget_id = p_budget_id and user_id = (select auth.uid());
end;
$$;

create or replace function public.add_income(
  p_budget_id uuid,
  p_name text,
  p_amount bigint,
  p_pay_day integer,
  p_weekend_rule public.weekend_rule default 'nearest',
  p_user_id uuid default null,
  p_from_period_id uuid default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_name text := private.clean_name(p_name);
  v_user uuid := coalesce(p_user_id, (select auth.uid()));
  v_seq integer;
  v_id uuid;
begin
  perform private.assert_member(p_budget_id);
  perform private.assert_income_terms(p_amount, p_pay_day, p_weekend_rule);
  perform private.lock_budget(p_budget_id);
  if not exists (select 1 from public.budget_members
                 where budget_id = p_budget_id and user_id = v_user) then
    raise exception 'member_not_found' using errcode = 'P0001';
  end if;
  if (select pg_catalog.count(*) from public.incomes where budget_id = p_budget_id and end_seq is null)
       >= private.limit_active_incomes()
     or (select pg_catalog.count(*) from public.incomes where budget_id = p_budget_id)
       >= private.limit_total_incomes() then
    raise exception 'income_limit_reached' using errcode = 'P0001';
  end if;
  v_seq := private.current_seq(p_budget_id);
  if p_from_period_id is not null then
    v_seq := private.period_seq(p_budget_id, p_from_period_id);
  end if;
  insert into public.incomes (budget_id, user_id, name, first_seq)
  values (p_budget_id, v_user, v_name, v_seq)
  returning id into v_id;
  insert into public.income_versions (income_id, budget_id, effective_from_seq, amount, pay_day, weekend_rule)
  values (v_id, p_budget_id, v_seq, p_amount, p_pay_day, p_weekend_rule);
  return v_id;
end;
$$;

-- New terms from the current period (default) or, as an explicit correction, from an
-- earlier period of the income. Versions keyed to later periods are discarded. A second
-- edit in the same period overwrites it.
create or replace function public.update_income_terms(
  p_income_id uuid,
  p_amount bigint,
  p_pay_day integer,
  p_weekend_rule public.weekend_rule,
  p_from_period_id uuid default null
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_income public.incomes;
  v_seq integer;
begin
  perform private.assert_income_terms(p_amount, p_pay_day, p_weekend_rule);
  v_income := private.lock_income(p_income_id);
  if p_from_period_id is null then
    if v_income.end_seq is not null then
      raise exception 'income_ended' using errcode = 'P0001';
    end if;
    v_seq := greatest(private.current_seq(v_income.budget_id), v_income.first_seq);
  else
    v_seq := private.period_seq(v_income.budget_id, p_from_period_id);
    if v_seq < v_income.first_seq then
      raise exception 'invalid_period' using errcode = 'P0001';
    end if;
    if v_income.end_seq is not null and v_seq >= v_income.end_seq then
      raise exception 'income_ended' using errcode = 'P0001';
    end if;
  end if;
  insert into public.income_versions (income_id, budget_id, effective_from_seq, amount, pay_day, weekend_rule)
  values (v_income.id, v_income.budget_id, v_seq, p_amount, p_pay_day, p_weekend_rule)
  on conflict (income_id, effective_from_seq) do update
    set amount = excluded.amount, pay_day = excluded.pay_day, weekend_rule = excluded.weekend_rule;
  if exists (select 1 from public.budgets where id = v_income.budget_id and primary_income_id = v_income.id) then
    perform private.recompute_projected_end(v_income.budget_id);
  end if;
end;
$$;

create or replace function public.set_primary_income(p_income_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_income public.incomes;
begin
  v_income := private.lock_income(p_income_id);
  if v_income.end_seq is not null then
    raise exception 'income_ended' using errcode = 'P0001';
  end if;
  if v_income.first_seq > private.current_seq(v_income.budget_id) then
    raise exception 'income_not_in_force' using errcode = 'P0001';
  end if;
  update public.budgets set primary_income_id = v_income.id
  where id = v_income.budget_id and primary_income_id <> v_income.id;
  if found then
    perform private.recompute_projected_end(v_income.budget_id);
  end if;
end;
$$;

-- Remove an income from the current period (default) or, as an explicit correction, from an
-- earlier period. Removed from its first period (or before it started) it is deleted;
-- otherwise it ends at that period. Returns 'deleted' or 'ended'.
create or replace function public.remove_income(p_income_id uuid, p_from_period_id uuid default null)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_income public.incomes;
  v_seq integer;
begin
  v_income := private.lock_income(p_income_id);
  if exists (select 1 from public.budgets where id = v_income.budget_id and primary_income_id = v_income.id) then
    raise exception 'income_is_primary' using errcode = 'P0001';
  end if;
  if p_from_period_id is null then
    v_seq := private.removal_seq(v_income.budget_id);
  else
    v_seq := private.period_seq(v_income.budget_id, p_from_period_id);
  end if;
  if v_income.end_seq is not null and v_seq >= v_income.end_seq then
    raise exception 'income_ended' using errcode = 'P0001';
  end if;
  if v_seq <= v_income.first_seq then
    delete from public.incomes where id = v_income.id;
    return 'deleted';
  end if;
  update public.incomes set end_seq = v_seq where id = v_income.id;
  delete from public.income_versions where income_id = v_income.id and effective_from_seq >= v_seq;
  return 'ended';
end;
$$;

create or replace function public.ensure_periods(p_budget_id uuid)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.assert_member(p_budget_id);
  return private.ensure_periods(p_budget_id);
end;
$$;

-- The current period (zero rows when the budget has ended).
create or replace function public.get_current_period(p_budget_id uuid)
returns setof public.period_summaries
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_period_id uuid;
begin
  perform private.assert_member(p_budget_id);
  v_period_id := (private.current_period(p_budget_id)).id;
  return query select s.* from public.period_summaries as s where s.id = v_period_id;
end;
$$;

-- Set the boundary after a period (its last day, and so the next period's first day) by
-- hand, or reset it to the schedule with p_new_end = null. The next period must then start
-- within 14 days of its month's salary.
--   * On the latest period: sets its end. Before today, the period closes and the next one
--     starts (salary arrived early).
--   * On the period before the latest: a new end on or after today means the salary has not
--     arrived yet, so the latest period is removed and this one is current again.
--   * On older periods: moves the boundary between two closed periods.
create or replace function public.move_period_boundary(p_period_id uuid, p_new_end date default null)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_budget_id uuid;
  v_period public.periods;
  v_next public.periods;
  v_today date := private.today();
  v_salary date;  -- the actual pay date the next period's start stands for
  v_end date;
  v_manual boolean := p_new_end is not null;
  v_has_after boolean;
begin
  select p.budget_id into v_budget_id from public.periods as p where p.id = p_period_id;
  if v_budget_id is null or not private.is_budget_member(v_budget_id) then
    raise exception 'period_not_found' using errcode = 'P0001';
  end if;
  if p_new_end is not null and not private.is_sane_date(p_new_end) then
    raise exception 'invalid_boundary' using errcode = 'P0001';
  end if;
  perform private.lock_budget(v_budget_id);
  select p.* into v_period from public.periods as p where p.id = p_period_id;
  if v_period.id is null then
    raise exception 'period_not_found' using errcode = 'P0001';
  end if;
  select p.* into v_next from public.periods as p
  where p.budget_id = v_budget_id and p.seq = v_period.seq + 1;

  if v_next.id is not null then
    v_salary := v_next.anchor_date;
  else
    v_salary := private.scheduled_pay_date(
      v_budget_id, (v_period.month + interval '1 month')::date, v_period.seq + 1);
  end if;
  v_end := coalesce(p_new_end, greatest(v_period.start_date, v_salary - 1));
  if v_end < v_period.start_date
     or abs((v_end + 1) - v_salary) > private.limit_boundary_shift_days() then
    raise exception 'invalid_boundary' using errcode = 'P0001';
  end if;

  if v_next.id is null then
    update public.periods set end_date = v_end, end_is_manual = v_manual where id = v_period.id;
    perform private.ensure_periods(v_budget_id);
    return;
  end if;

  select exists (select 1 from public.periods as p
                 where p.budget_id = v_budget_id and p.seq > v_next.seq) into v_has_after;
  if v_end + 1 > v_today then
    if v_has_after then
      raise exception 'boundary_after_today' using errcode = 'P0001';
    end if;
    -- The salary that starts the latest period has not arrived yet.
    delete from public.periods where id = v_next.id;
    update public.periods set end_date = v_end, end_is_manual = v_manual where id = v_period.id;
    return;
  end if;
  if v_end + 1 > v_next.end_date then
    raise exception 'invalid_boundary' using errcode = 'P0001';
  end if;
  update public.periods set end_date = v_end, end_is_manual = v_manual where id = v_period.id;
  update public.periods set start_date = v_end + 1 where id = v_next.id;
end;
$$;

-- ===========================================================================
-- Privileges
-- ===========================================================================
revoke all on table
  public.budgets, public.budget_members, public.budget_invitations,
  public.incomes, public.income_versions, public.periods,
  public.my_budgets, public.budget_member_list, public.income_overview, public.period_summaries
from anon, authenticated, service_role;

grant select on table
  public.budgets, public.budget_members, public.budget_invitations,
  public.incomes, public.income_versions, public.periods,
  public.my_budgets, public.budget_member_list, public.income_overview, public.period_summaries
to authenticated;
grant update (name) on table public.budgets to authenticated;
grant update (name) on table public.incomes to authenticated;

grant select, insert, update, delete on table
  public.budgets, public.budget_members, public.budget_invitations,
  public.incomes, public.income_versions, public.periods
to service_role;
grant select on table
  public.my_budgets, public.budget_member_list, public.income_overview, public.period_summaries
to service_role;

-- Functions: nothing executable by default; the client gets exactly the RPCs below.
revoke all on function
  private.limit_owned_budgets(), private.limit_members(), private.limit_pending_invitations(),
  private.limit_active_incomes(), private.limit_total_incomes(), private.limit_start_months_back(),
  private.limit_amount(), private.limit_boundary_shift_days(), private.limit_invitation_days(),
  private.today(),
  private.month_pay_date(date, integer, public.weekend_rule),
  private.next_pay_date(date, integer, public.weekend_rule),
  private.month_paid_by(date, integer, public.weekend_rule),
  private.is_sane_date(date),
  private.member_budget_ids(), private.owned_budget_ids(), private.visible_profile_ids(),
  private.is_budget_member(uuid), private.is_budget_owner(uuid),
  private.assert_member(uuid), private.assert_owner(uuid),
  private.current_verified_email(),
  private.check_budget_owner_membership(), private.check_primary_income(),
  private.check_income_has_first_version(), private.check_periods(),
  private.discard_later_versions(),
  private.lock_budget(uuid), private.terms_at(uuid, integer),
  private.scheduled_pay_date(uuid, date, integer), private.scheduled_end(uuid, public.periods),
  private.budget_end_date(uuid),
  private.ensure_periods(uuid), private.current_period(uuid), private.current_seq(uuid),
  private.reading_seq(uuid), private.removal_seq(uuid), private.recompute_projected_end(uuid),
  private.end_member_incomes(uuid, uuid),
  private.assert_income_terms(bigint, integer, public.weekend_rule),
  private.clean_name(text), private.period_seq(uuid, uuid), private.lock_income(uuid),
  private.apply_end_date(uuid, date),
  public.pay_date(integer, integer, integer, public.weekend_rule),
  public.get_start_months(integer, public.weekend_rule),
  public.create_budget(text, text, bigint, integer, public.weekend_rule, date, date),
  public.set_budget_end_date(uuid, date),
  public.delete_budget(uuid),
  public.cancel_invitation(uuid),
  public.get_today(),
  public.invite_member(uuid, text),
  public.list_my_invitations(),
  public.accept_invitation(uuid),
  public.decline_invitation(uuid),
  public.remove_member(uuid, uuid),
  public.leave_budget(uuid),
  public.add_income(uuid, text, bigint, integer, public.weekend_rule, uuid, uuid),
  public.update_income_terms(uuid, bigint, integer, public.weekend_rule, uuid),
  public.set_primary_income(uuid),
  public.remove_income(uuid, uuid),
  public.ensure_periods(uuid),
  public.get_current_period(uuid),
  public.move_period_boundary(uuid, date)
from public, anon, authenticated;

-- Used by policies and security_invoker views, so the calling role needs them.
grant execute on function
  private.member_budget_ids(), private.owned_budget_ids(), private.visible_profile_ids(),
  private.today(), private.next_pay_date(date, integer, public.weekend_rule),
  private.month_pay_date(date, integer, public.weekend_rule),
  private.terms_at(uuid, integer), private.reading_seq(uuid),
  private.scheduled_pay_date(uuid, date, integer), private.budget_end_date(uuid)
to authenticated;

grant execute on function
  public.pay_date(integer, integer, integer, public.weekend_rule),
  public.get_start_months(integer, public.weekend_rule),
  public.create_budget(text, text, bigint, integer, public.weekend_rule, date, date),
  public.set_budget_end_date(uuid, date),
  public.delete_budget(uuid),
  public.cancel_invitation(uuid),
  public.get_today(),
  public.invite_member(uuid, text),
  public.list_my_invitations(),
  public.accept_invitation(uuid),
  public.decline_invitation(uuid),
  public.remove_member(uuid, uuid),
  public.leave_budget(uuid),
  public.add_income(uuid, text, bigint, integer, public.weekend_rule, uuid, uuid),
  public.update_income_terms(uuid, bigint, integer, public.weekend_rule, uuid),
  public.set_primary_income(uuid),
  public.remove_income(uuid, uuid),
  public.ensure_periods(uuid),
  public.get_current_period(uuid),
  public.move_period_boundary(uuid, date)
to authenticated;

-- ===========================================================================
-- Row-level security
-- ===========================================================================
alter table public.budgets enable row level security;
alter table public.budget_members enable row level security;
alter table public.budget_invitations enable row level security;
alter table public.incomes enable row level security;
alter table public.income_versions enable row level security;
alter table public.periods enable row level security;

create policy "Members can read their budgets"
  on public.budgets for select to authenticated
  using (id in (select private.member_budget_ids()));
create policy "Members can rename their budgets"
  on public.budgets for update to authenticated
  using (id in (select private.member_budget_ids()))
  with check (id in (select private.member_budget_ids()));

create policy "Members can read the members of their budgets"
  on public.budget_members for select to authenticated
  using (budget_id in (select private.member_budget_ids()));

create policy "Owners can read their budgets' invitations"
  on public.budget_invitations for select to authenticated
  using (budget_id in (select private.owned_budget_ids()));

create policy "Members can read their budgets' incomes"
  on public.incomes for select to authenticated
  using (budget_id in (select private.member_budget_ids()));
create policy "Members can rename their budgets' incomes"
  on public.incomes for update to authenticated
  using (budget_id in (select private.member_budget_ids()))
  with check (budget_id in (select private.member_budget_ids()));

create policy "Members can read their budgets' income versions"
  on public.income_versions for select to authenticated
  using (budget_id in (select private.member_budget_ids()));

create policy "Members can read their budgets' periods"
  on public.periods for select to authenticated
  using (budget_id in (select private.member_budget_ids()));
