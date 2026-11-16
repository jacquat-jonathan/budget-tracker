-- Step 2: budgets, members, invitations, incomes (versioned) and periods.
--
-- The client contract (tables, views, RPCs, error codes) is documented in docs/database.md;
-- the rules are in spec/spec.json (docs/spec.md) and their ids are named in the comments
-- below, at the object that enforces each. Conventions from the profiles migration apply:
-- explicit privileges, RLS with policies in the same migration, helpers in `private`,
-- `set search_path = ''`, schema-qualified names.
--
-- Access model
--   * Every read goes through RLS. Policies use the set-returning helpers
--     private.member_budget_ids() / private.owned_budget_ids() as `in (select ...)`, so the
--     helper runs once per statement (initPlan) and, being security definer, never
--     re-enters the policies of budget_members (no recursion).          (C-RLS-003)
--   * Writes go through security definer RPCs in `public`, which check membership
--     themselves. The client can write directly only budgets.name and incomes.name.
--   * RPC errors are raised with SQLSTATE P0001 and a stable snake_case message code.
--   * One lock order everywhere: the budget's advisory lock (private.lock_budget) first,
--     then any row. Each write RPC takes the lock, catches the periods up to today, and only
--     then reads the rows it checks.                         (R-SECURITY-007, R-PERIOD-032)
--
-- Periods: salary to salary                                         (D-080)
--   * Stored periods are facts: contiguous, numbered 1..n, none starting after today, each
--     7 to 92 days long. Only boundary operations move a stored boundary.
--   * The schedule only predicts the next pay date: the first actual pay date of the
--     primary income that falls at least 15 days after the period's start (and, when
--     re-projecting after a change of terms, after today). The latest period's end is the
--     day before it, unless set by hand.
--
-- Versions
--   * Income validity and versions refer to the period number (seq), not to dates.
--     An income counts in period p when first_seq <= p and (end_seq is null or p < end_seq),
--     at the version with the greatest effective_from_seq <= p.         (R-PERIOD-018)
--   * Nothing is ever keyed beyond the latest period: merging the latest period into the
--     previous one re-keys everything keyed to it (private.rekey_period).  (R-VERSION-011)

-- ===========================================================================
-- Types
-- ===========================================================================
-- R-PAYDATE-007
create type public.weekend_rule as enum ('nearest', 'previous', 'next', 'none');
comment on type public.weekend_rule is
  'What happens when a pay date falls on a weekend: nearest (Sat->Fri, Sun->Mon), previous (->Fri), next (->Mon), none.';

grant usage on schema private to authenticated;

-- ===========================================================================
-- Limits (one place, so the docs and tests can refer to them)
-- ===========================================================================
-- R-BUDGET-012
create or replace function private.limit_owned_budgets() returns integer
language sql immutable set search_path = '' as $$ select 20 $$;
-- R-MEMBER-250, D-385: budgets a user belongs to (owned ones included; owned stays at 20)
create or replace function private.limit_memberships() returns integer
language sql immutable set search_path = '' as $$ select 50 $$;
-- R-MEMBER-010
create or replace function private.limit_members() returns integer
language sql immutable set search_path = '' as $$ select 20 $$;
-- R-INVITE-006
create or replace function private.limit_pending_invitations() returns integer
language sql immutable set search_path = '' as $$ select 20 $$;
-- R-INCOME-013: incomes in force (not ended) per budget.
create or replace function private.limit_active_incomes() returns integer
language sql immutable set search_path = '' as $$ select 50 $$;
-- R-INCOME-016: all income rows per budget, ended ones included.
create or replace function private.limit_total_incomes() returns integer
language sql immutable set search_path = '' as $$ select 500 $$;
-- R-PERIOD-019: how far back a budget may start tracking, in months.
create or replace function private.limit_start_months_back() returns integer
language sql immutable set search_path = '' as $$ select 60 $$;
-- R-INCOME-014: largest income amount in rappen (CHF 10 million per month).
create or replace function private.limit_amount() returns bigint
language sql immutable set search_path = '' as $$ select 1000000000::bigint $$;
-- R-PERIOD-020: shortest and longest period, in days (start and end included).
create or replace function private.limit_period_min_days() returns integer
language sql immutable set search_path = '' as $$ select 7 $$;
create or replace function private.limit_period_max_days() returns integer
language sql immutable set search_path = '' as $$ select 92 $$;
-- R-PERIOD-030: the next pay date is at least this many days after a period's start.
create or replace function private.limit_projection_min_days() returns integer
language sql immutable set search_path = '' as $$ select 15 $$;
-- R-INVITE-007: how long an invitation stays valid, in days.
create or replace function private.limit_invitation_days() returns integer
language sql immutable set search_path = '' as $$ select 30 $$;

-- ===========================================================================
-- "Today": the Europe/Zurich calendar date. The only source of the current date; tests
-- pin it by replacing this function inside their transaction.            (R-PERIOD-017)
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
-- weekend rule. May fall in the previous or next month.   (R-PAYDATE-001 to R-PAYDATE-006)
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

-- R-PERIOD-030: the projection rule, pure. The next pay date after a period that started
-- on p_start: the first actual pay date at least 15 days after p_start and, when p_after is
-- given (re-projection after a change of terms), after p_after.
create or replace function private.next_salary_date(
  p_start date,
  p_pay_day integer,
  p_weekend_rule public.weekend_rule,
  p_after date default null
)
returns date
language sql
immutable
set search_path = ''
as $$
  select private.next_pay_date(
    greatest(p_start + private.limit_projection_min_days(), coalesce(p_after + 1, p_start)),
    p_pay_day, p_weekend_rule
  )
$$;

-- The latest month whose actual pay date is on or before p_on (R-PERIOD-015).
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
-- R-BUDGET-001: everything belongs to exactly one budget (budget_id, on delete cascade).
create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  -- R-BUDGET-002, R-BUDGET-016
  owner_id uuid not null references auth.users (id) on delete cascade,
  -- R-INCOME-006: exactly one primary income (not null, foreign key below)
  primary_income_id uuid not null,
  -- The period from which the current primary income is primary (re-keyed by a merge, so a
  -- reopen can report "made primary"; R-PERIOD-035).
  primary_since_seq integer not null default 1,
  -- R-BUDGET-005, R-BUDGET-008: the end date the owner entered; no period starts after it.
  end_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint budgets_name_valid check (name = btrim(name) and char_length(name) between 1 and 100)
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
  expires_at timestamptz not null default (now() + interval '30 days'),  -- R-INVITE-007
  constraint budget_invitations_email_valid check (
    email = lower(btrim(email)) and char_length(email) between 3 and 254
    and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
  ),
  constraint budget_invitations_unique unique (budget_id, email)  -- R-INVITE-009
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
  -- end_seq = first_seq is a void row, never in force (R-VERSION-014).
  end_seq integer,
  -- R-MEMBER-011: removed from a budget that had ended; ends from the first period created
  -- after the end if the budget ever resumes.
  ended_after_last boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint incomes_name_valid check (name = btrim(name) and char_length(name) between 1 and 100),
  constraint incomes_seq_valid check (first_seq >= 1 and (end_seq is null or end_seq >= first_seq)),
  constraint incomes_id_budget_unique unique (id, budget_id)
);
create index incomes_budget_id_idx on public.incomes (budget_id);
create index incomes_user_id_idx on public.incomes (user_id);

-- R-INCOME-006: the primary income is an income of the same budget.
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
  amount bigint not null,  -- R-MONEY-002, C-MONEY-002: integer rappen
  pay_day integer not null,
  weekend_rule public.weekend_rule not null default 'nearest',  -- R-INCOME-005
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint income_versions_income_fk foreign key (income_id, budget_id)
    references public.incomes (id, budget_id) on delete cascade,
  constraint income_versions_unique unique (income_id, effective_from_seq),  -- R-VERSION-006
  constraint income_versions_seq_valid check (effective_from_seq >= 1),
  constraint income_versions_amount_valid check (amount between 1 and 1000000000),  -- R-INCOME-014
  constraint income_versions_pay_day_valid check (pay_day between 1 and 31)  -- R-INCOME-004
);
create index income_versions_budget_id_idx on public.income_versions (budget_id);
create index income_versions_income_budget_idx on public.income_versions (income_id, budget_id);

-- R-PERIOD-004: periods are stored rows.
create table public.periods (
  id uuid primary key default gen_random_uuid(),
  budget_id uuid not null references public.budgets (id) on delete cascade,
  seq integer not null,
  start_date date not null,
  end_date date not null,
  -- true once a person has set this period's end by hand; a change of terms never
  -- re-projects it (R-PERIOD-014).
  end_is_manual boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint periods_seq_unique unique (budget_id, seq),
  constraint periods_start_unique unique (budget_id, start_date),
  constraint periods_seq_valid check (seq >= 1),
  -- R-PERIOD-020
  constraint periods_length_valid check (end_date - start_date + 1 between 7 and 92)
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
-- Membership helpers, reused by the policies of every budget-owned table (C-RLS-003).
-- security definer: they read budget_members / budgets without going through RLS.
-- ===========================================================================
-- R-SECURITY-002
create or replace function private.member_budget_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.budget_id from public.budget_members as m where m.user_id = (select auth.uid())
$$;

-- R-MEMBER-002, R-MEMBER-004
create or replace function private.owned_budget_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select b.id from public.budgets as b where b.owner_id = (select auth.uid())
$$;

-- R-PROFILE-003: profiles the caller may read: their own and those of people who share a
-- budget with them now.
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
$$;

-- R-PROFILE-004: the display name (only) of an income's owner, for income_overview, also
-- after they left. Only reachable through that view, which shows my budgets' incomes.
create or replace function private.display_name_of(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.display_name from public.profiles as p
  where p.id = p_user_id
    and exists (
      select 1 from public.incomes as i
      where i.user_id = p_user_id and i.budget_id in (select private.member_budget_ids())
    )
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

-- R-SECURITY-004: budget_not_found unless the caller is a member.
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

-- R-MEMBER-002, R-MEMBER-003, R-MEMBER-004
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

-- R-INVITE-003: verified email of the caller, or null. Relies on the Auth setting
-- "Confirm email" being on in the hosted project (docs/deployment.md, D-068).
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
-- intermediate states). None depends on the terms of an income.
-- ===========================================================================

-- R-BUDGET-003: the owner is always a member while the budget exists.
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

-- R-INCOME-006, R-INCOME-009: the primary income is never ended.
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

-- R-INCOME-004: every income has a version in force from its first period.
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

-- R-PERIOD-005, R-PERIOD-006, R-PERIOD-022, R-BUDGET-007: periods are numbered 1..n,
-- contiguous, none starts after today, none starts after the budget's end date.
-- (Lengths: check constraint periods_length_valid, R-PERIOD-020.)
create or replace function private.check_periods()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_budget_id uuid;
  v_end date;
begin
  if tg_table_name = 'budgets' then
    v_budget_id := new.id;
  elsif tg_op = 'DELETE' then
    v_budget_id := old.budget_id;
  else
    v_budget_id := new.budget_id;
  end if;
  select b.end_date into v_end from public.budgets as b where b.id = v_budget_id;
  if not found then
    return null;  -- budget deleted: its periods go with it
  end if;
  if exists (
    select 1
    from (
      select p.seq, p.start_date,
             pg_catalog.lag(p.end_date) over (order by p.seq) as prev_end,
             pg_catalog.row_number() over (order by p.seq) as rn
      from public.periods as p
      where p.budget_id = v_budget_id
    ) as s
    where s.seq <> s.rn
       or (s.prev_end is not null and s.start_date <> s.prev_end + 1)
       or s.start_date > private.today()
       or (v_end is not null and s.start_date > v_end)
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

create constraint trigger budgets_end_date_keeps_periods
  after update of end_date on public.budgets
  deferrable initially deferred
  for each row execute function private.check_periods();

-- R-VERSION-011: nothing is keyed beyond the latest period.
create or replace function private.check_nothing_beyond_latest()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_budget_id uuid;
  v_latest integer;
begin
  if tg_op = 'DELETE' then v_budget_id := old.budget_id; else v_budget_id := new.budget_id; end if;
  select pg_catalog.max(p.seq) into v_latest from public.periods as p where p.budget_id = v_budget_id;
  if v_latest is null then
    return null;  -- budget being created or deleted
  end if;
  if exists (select 1 from public.incomes as i where i.budget_id = v_budget_id
               and (i.first_seq > v_latest or i.end_seq > v_latest))
     or exists (select 1 from public.income_versions as v where v.budget_id = v_budget_id
                  and v.effective_from_seq > v_latest) then
    raise exception 'keyed_beyond_latest_period' using errcode = '23514';
  end if;
  return null;
end;
$$;

create constraint trigger incomes_not_beyond_latest
  after insert or update of first_seq, end_seq on public.incomes
  deferrable initially deferred
  for each row execute function private.check_nothing_beyond_latest();

create constraint trigger income_versions_not_beyond_latest
  after insert or update of effective_from_seq on public.income_versions
  deferrable initially deferred
  for each row execute function private.check_nothing_beyond_latest();

create constraint trigger periods_nothing_beyond_latest
  after delete on public.periods
  deferrable initially deferred
  for each row execute function private.check_nothing_beyond_latest();

-- ===========================================================================
-- Re-keying when the latest period is merged into the previous one (R-VERSION-011)
-- ===========================================================================

-- Every table keyed to periods registers here, so a merge re-keys it and a reopen preview
-- reports it (R-VERSION-014). What a registered table must provide (checked when it registers):
--   all:       id uuid, budget_id uuid not null;
--   'validity' (rows in force from first_seq to before end_seq): first_seq integer,
--              end_seq integer, a text name_column, and a check that allows
--              end_seq = first_seq (a void row, never in force);
--   'version'  (one row per entity and period): entity_column uuid referencing the id of a
--              registered 'validity' table (entity_table), effective_from_seq integer, and
--              a unique constraint on (entity_column, effective_from_seq).
-- record_kind names the kind of record for the client (for example 'income').
-- Later versioned tables (categories, subscriptions, debts) add rows in their migration.
create table private.period_keyed_tables (
  table_name regclass primary key,
  kind text not null check (kind in ('version', 'validity')),
  record_kind text not null,
  name_column text,
  entity_column text,
  entity_table regclass,
  constraint period_keyed_tables_shape check (
    (kind = 'validity' and name_column is not null and entity_column is null and entity_table is null)
    or (kind = 'version' and entity_column is not null and entity_table is not null and name_column is null)
  )
);
revoke all on private.period_keyed_tables from public;

-- R-VERSION-014: refuse to register a table that does not provide what the merge needs.
create or replace function private.check_period_keyed_table()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_missing text;
begin
  select pg_catalog.string_agg(c.col || ' ' || c.typ, ', ') into v_missing
  from (values ('id', 'uuid'), ('budget_id', 'uuid')) as c (col, typ)
  where not exists (
    select 1 from pg_catalog.pg_attribute as a
    where a.attrelid = new.table_name and a.attname = c.col and not a.attisdropped
      and pg_catalog.format_type(a.atttypid, a.atttypmod) = c.typ
  );
  if new.kind = 'validity' then
    select concat_ws(', ', v_missing, pg_catalog.string_agg(c.col || ' ' || c.typ, ', ')) into v_missing
    from (values ('first_seq', 'integer'), ('end_seq', 'integer'), (new.name_column, 'text')) as c (col, typ)
    where not exists (
      select 1 from pg_catalog.pg_attribute as a
      where a.attrelid = new.table_name and a.attname = c.col and not a.attisdropped
        and pg_catalog.format_type(a.atttypid, a.atttypmod) = c.typ
    );
  else
    select concat_ws(', ', v_missing, pg_catalog.string_agg(c.col || ' ' || c.typ, ', ')) into v_missing
    from (values (new.entity_column, 'uuid'), ('effective_from_seq', 'integer')) as c (col, typ)
    where not exists (
      select 1 from pg_catalog.pg_attribute as a
      where a.attrelid = new.table_name and a.attname = c.col and not a.attisdropped
        and pg_catalog.format_type(a.atttypid, a.atttypmod) = c.typ
    );
    if not exists (select 1 from private.period_keyed_tables as t
                   where t.table_name = new.entity_table and t.kind = 'validity') then
      v_missing := concat_ws(', ', v_missing, 'entity_table registered as validity');
    end if;
    if not exists (
      select 1 from pg_catalog.pg_constraint as k
      where k.conrelid = new.table_name and k.contype = 'u'
        and (select pg_catalog.array_agg(a.attname::text order by a.attname::text)
             from pg_catalog.pg_attribute as a
             where a.attrelid = k.conrelid and a.attnum = any (k.conkey))
            = (select pg_catalog.array_agg(x order by x) from unnest(array[new.entity_column, 'effective_from_seq']) as x)
    ) then
      v_missing := concat_ws(', ', v_missing, 'unique (' || new.entity_column || ', effective_from_seq)');
    end if;
  end if;
  if v_missing is not null and v_missing <> '' then
    raise exception 'period_keyed_table_invalid: % lacks %', new.table_name, v_missing using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger period_keyed_tables_check
  before insert or update on private.period_keyed_tables
  for each row execute function private.check_period_keyed_table();

insert into private.period_keyed_tables (table_name, kind, record_kind, name_column) values
  ('public.incomes', 'validity', 'income', 'name');
insert into private.period_keyed_tables (table_name, kind, record_kind, entity_column, entity_table) values
  ('public.income_versions', 'version', 'income', 'income_id', 'public.incomes');

-- R-VERSION-011, R-VERSION-013, R-VERSION-014: re-key everything a budget keys to period
-- p_from (the latest) onto period p_to (the one before), when p_from is merged into p_to.
-- What was keyed to the merged (later) period always wins, so the terms in force before the
-- reopen are still in force after it. Versions: a version at p_from replaces the one at
-- p_to. Validity: starting in p_from becomes starting in p_to; ending at p_from becomes
-- ending at p_to; a row that would then never be in force is deleted, or kept as a void row
-- (end_seq = first_seq) when other rows reference it, so the reopen never fails on it.
create or replace function private.rekey_period(p_budget_id uuid, p_from integer, p_to integer)
returns void
language plpgsql
volatile
set search_path = ''
as $$
declare
  t record;
begin
  for t in select * from private.period_keyed_tables order by (kind = 'validity') desc loop
    if t.kind = 'version' then
      execute pg_catalog.format($q$
        delete from %1$s as older
        where older.budget_id = $1 and older.effective_from_seq = $3
          and exists (select 1 from %1$s as newer
                      where newer.budget_id = $1 and newer.%2$I = older.%2$I
                        and newer.effective_from_seq = $2)$q$, t.table_name, t.entity_column)
        using p_budget_id, p_from, p_to;
      execute pg_catalog.format(
        'update %1$s set effective_from_seq = $3 where budget_id = $1 and effective_from_seq = $2',
        t.table_name) using p_budget_id, p_from, p_to;
    else
      begin
        execute pg_catalog.format(
          'delete from %1$s where budget_id = $1 and end_seq = $2 and first_seq >= $3',
          t.table_name) using p_budget_id, p_from, p_to;
      exception when foreign_key_violation then
        execute pg_catalog.format(
          'update %1$s set first_seq = $3, end_seq = $3 where budget_id = $1 and end_seq = $2 and first_seq >= $3',
          t.table_name) using p_budget_id, p_from, p_to;
      end;
      execute pg_catalog.format(
        'update %1$s set first_seq = $3 where budget_id = $1 and first_seq = $2',
        t.table_name) using p_budget_id, p_from, p_to;
      execute pg_catalog.format(
        'update %1$s set end_seq = $3 where budget_id = $1 and end_seq = $2',
        t.table_name) using p_budget_id, p_from, p_to;
    end if;
  end loop;
  update public.budgets set primary_since_seq = p_to
  where id = p_budget_id and primary_since_seq = p_from;
end;
$$;

-- R-PERIOD-035: what merging period p_from into p_to would move, from the registry: one row
-- per recorded change in p_from. change: 'added', 'ended', 'removed' (it would then never be
-- in force), 'terms_changed', 'made_primary'. replaces_previous: p_to has its own entry
-- for the same record that the merge replaces.
create or replace function private.merge_impact(p_budget_id uuid, p_from integer, p_to integer)
returns table (record_kind text, record_id uuid, record_name text, change text, replaces_previous boolean)
language plpgsql
stable
set search_path = ''
as $$
declare
  t record;
begin
  for t in select r.*, e.name_column as entity_name_column
           from private.period_keyed_tables as r
           left join private.period_keyed_tables as e on e.table_name = r.entity_table
           order by r.kind, r.table_name::text loop
    if t.kind = 'validity' then
      return query execute pg_catalog.format($q$
        select %3$L::text, v.id, v.%2$I::text,
               case when v.end_seq = $2 and v.first_seq >= $3 then 'removed'
                    when v.end_seq = $2 then 'ended'
                    else 'added' end,
               false
        from %1$s as v
        where v.budget_id = $1 and (v.first_seq = $2 or v.end_seq = $2)
        order by 3$q$, t.table_name, t.name_column, t.record_kind)
        using p_budget_id, p_from, p_to;
    else
      return query execute pg_catalog.format($q$
        select %4$L::text, e.id, e.%3$I::text, 'terms_changed',
               exists (select 1 from %1$s as o where o.budget_id = $1 and o.%2$I = v.%2$I
                         and o.effective_from_seq = $3)
        from %1$s as v
        join %5$s as e on e.id = v.%2$I
        where v.budget_id = $1 and v.effective_from_seq = $2 and e.first_seq < $2
        order by 3$q$, t.table_name, t.entity_column, t.entity_name_column, t.record_kind, t.entity_table)
        using p_budget_id, p_from, p_to;
    end if;
  end loop;
  return query
    select 'income'::text, i.id, i.name, 'made_primary'::text, false
    from public.budgets as b join public.incomes as i on i.id = b.primary_income_id
    where b.id = p_budget_id and b.primary_since_seq = p_from;
end;
$$;

-- ===========================================================================
-- Period mechanics (internal, no access checks: callers check membership)
-- ===========================================================================

-- R-SECURITY-006, R-SECURITY-007: serialise every change to a budget. A transaction-level
-- advisory lock, taken before any row lock, so it never waits on (or blocks) the row locks
-- that inserts referencing the budget take. Returns the budget row, read after the lock.
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

-- R-PERIOD-018: terms of an income in force for period seq p.
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

-- R-PERIOD-002, R-PERIOD-010, R-PERIOD-030: projected end of period seq p_seq that started
-- on p_start: the day before the next salary date under the primary income's terms in force
-- for the next period. p_after: re-projection after a change of terms (never before today).
create or replace function private.projected_end(p_budget_id uuid, p_start date, p_seq integer, p_after date default null)
returns date
language sql
stable
set search_path = ''
as $$
  select private.next_salary_date(p_start, t.pay_day, t.weekend_rule, p_after) - 1
  from public.budgets as b
  cross join lateral private.terms_at(b.primary_income_id, p_seq + 1) as t
  where b.id = p_budget_id
$$;

-- R-PERIOD-008, R-PERIOD-009, R-PERIOD-031: create the missing periods up to the one
-- containing today, never one starting after the end date. Cannot fail: each new period
-- starts the day after the previous one ends (so not after today) and ends at its
-- projection (15 to about 50 days later). Takes the lock only when there is work.
create or replace function private.ensure_periods(p_budget_id uuid)
returns integer
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_today date := private.today();
  v_end date;
  v_last public.periods;
  v_start date;
  v_created integer := 0;
begin
  -- Fast path, without the lock: nothing to create.
  select p.* into v_last from public.periods as p
  where p.budget_id = p_budget_id order by p.seq desc limit 1;
  select b.end_date into v_end from public.budgets as b where b.id = p_budget_id;
  if v_last.id is null or v_last.end_date >= v_today
     or (v_end is not null and v_last.end_date >= v_end) then
    return 0;
  end if;

  v_end := (private.lock_budget(p_budget_id)).end_date;
  loop
    select p.* into v_last from public.periods as p
    where p.budget_id = p_budget_id order by p.seq desc limit 1;
    exit when v_last.id is null;
    exit when v_last.end_date >= v_today;
    exit when v_end is not null and v_last.end_date >= v_end;
    v_start := v_last.end_date + 1;
    insert into public.periods (budget_id, seq, start_date, end_date)
    values (p_budget_id, v_last.seq + 1, v_start,
            private.projected_end(p_budget_id, v_start, v_last.seq + 1));
    -- R-MEMBER-011: incomes of people removed while the budget had ended stop here.
    update public.incomes set end_seq = v_last.seq + 1, ended_after_last = false
    where budget_id = p_budget_id and ended_after_last;
    v_created := v_created + 1;
    -- Bounded by the start-month limit; this guard only stops a logic error from looping.
    if v_created > 2 * private.limit_start_months_back() + 24 then
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

-- R-MEMBER-007, R-MEMBER-008: seq from which a removal takes effect: the current period,
-- or after the last period of a budget that has ended (so nothing in its history changes).
-- The latter is never stored beyond the latest period: such incomes are simply left as they
-- are (see end_member_incomes).
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

-- R-PERIOD-011, R-PERIOD-014, R-PERIOD-029, R-PERIOD-036: the end the current period would
-- get if the primary income's terms became (p_pay_day, p_weekend_rule): unchanged when set by
-- hand; otherwise the day before the next salary date after today, at most 92 days from the
-- period's start (reachable when a long merged period is re-projected), never before today.
-- Pure apart from reading the period. Shared by the write and its preview.
create or replace function private.reprojected_end(
  p_current public.periods,
  p_pay_day integer,
  p_weekend_rule public.weekend_rule
)
returns date
language sql
stable
set search_path = ''
as $$
  select case
    when p_current.end_is_manual then p_current.end_date
    else greatest(
      private.today(),
      least(
        private.next_salary_date(p_current.start_date, p_pay_day, p_weekend_rule, private.today()) - 1,
        p_current.start_date + private.limit_period_max_days() - 1
      )
    )
  end
$$;

-- After the primary's terms change or another income becomes primary, re-project the
-- current period's end (private.reprojected_end); nothing else moves. Caller holds the lock
-- and has caught up.
create or replace function private.reproject_current_end(p_budget_id uuid)
returns void
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_current public.periods;
  v_end date;
begin
  select p.* into v_current from public.periods as p
  where p.budget_id = p_budget_id and private.today() between p.start_date and p.end_date;
  if v_current.id is null then
    return;
  end if;
  select private.reprojected_end(v_current, t.pay_day, t.weekend_rule) into v_end
  from public.budgets as b
  cross join lateral private.terms_at(b.primary_income_id, v_current.seq + 1) as t
  where b.id = p_budget_id;
  if v_end <> v_current.end_date then
    update public.periods set end_date = v_end where id = v_current.id;
  end if;
end;
$$;

-- R-MEMBER-007, R-MEMBER-009: end or delete the incomes of a person leaving a budget.
-- Caller holds the lock.
create or replace function private.end_member_incomes(p_budget_id uuid, p_user_id uuid)
returns void
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_seq integer;
  v_latest integer;
begin
  if exists (
    select 1 from public.budgets as b
    join public.incomes as i on i.id = b.primary_income_id
    where b.id = p_budget_id and i.user_id = p_user_id
  ) then
    raise exception 'member_has_primary_income' using errcode = 'P0001';
  end if;
  v_seq := private.removal_seq(p_budget_id);
  select pg_catalog.max(p.seq) into v_latest from public.periods as p where p.budget_id = p_budget_id;
  if v_seq > v_latest then
    -- The budget has ended: its history stays as it is (R-MEMBER-008), and the incomes end
    -- from the first period created if it ever resumes (R-MEMBER-011).
    update public.incomes as i set ended_after_last = true
    where i.budget_id = p_budget_id and i.user_id = p_user_id and i.end_seq is null;
    return;
  end if;
  delete from public.incomes as i
  where i.budget_id = p_budget_id and i.user_id = p_user_id and i.end_seq is null
    and i.first_seq >= v_seq;
  update public.incomes as i set end_seq = v_seq
  where i.budget_id = p_budget_id and i.user_id = p_user_id and i.end_seq is null;
end;
$$;

-- Shared validation of income terms (R-INCOME-004, R-INCOME-014, R-PAYDATE-007).
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

-- seq of a period of the given budget, or period_not_found (R-SECURITY-004).
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

-- Lock the budget of an income, catch up, and return the income read after the lock;
-- income_not_found unless it exists and the caller is a member. (R-PERIOD-032, R-SECURITY-007)
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
  perform private.ensure_periods(v_budget_id);
  select i.* into v_income from public.incomes as i where i.id = p_income_id;
  if v_income.id is null then
    raise exception 'income_not_found' using errcode = 'P0001';
  end if;
  return v_income;
end;
$$;

-- Lock a budget and catch its periods up (R-PERIOD-032). Returns the budget row.
create or replace function private.lock_and_catch_up(p_budget_id uuid)
returns public.budgets
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_budget public.budgets;
begin
  v_budget := private.lock_budget(p_budget_id);
  perform private.ensure_periods(p_budget_id);
  return v_budget;
end;
$$;

-- R-BUDGET-008, R-BUDGET-014: the budget's last day tracked: the end of the period that
-- contains its end date (projected while that period does not exist). Null: no end.
-- Closed form, no walk: after the latest period, the next projected period starts the day
-- after it ends; every later one starts on an actual pay date (consecutive actual pay dates
-- are more than 15 days apart), so the period containing a later date starts on the last
-- actual pay date on or before it. (Proved against a period-by-period walk in the tests.)
create or replace function private.budget_end_date(p_budget_id uuid)
returns date
language plpgsql
stable
set search_path = ''
as $$
declare
  v_end date;
  v_latest public.periods;
  v_pay_day integer;
  v_rule public.weekend_rule;
  v_first_end date;
  v_start date;
begin
  select b.end_date into v_end from public.budgets as b where b.id = p_budget_id;
  if v_end is null then
    return null;
  end if;
  select p.* into v_latest from public.periods as p
  where p.budget_id = p_budget_id order by p.seq desc limit 1;
  if v_end <= v_latest.end_date then
    return (select p.end_date from public.periods as p
            where p.budget_id = p_budget_id and v_end between p.start_date and p.end_date);
  end if;
  select t.pay_day, t.weekend_rule into v_pay_day, v_rule
  from public.budgets as b cross join lateral private.terms_at(b.primary_income_id, v_latest.seq + 1) as t
  where b.id = p_budget_id;
  v_first_end := private.next_salary_date(v_latest.end_date + 1, v_pay_day, v_rule) - 1;
  if v_end <= v_first_end then
    return v_first_end;
  end if;
  v_start := private.month_pay_date(private.month_paid_by(v_end, v_pay_day, v_rule), v_pay_day, v_rule);
  return private.next_salary_date(v_start, v_pay_day, v_rule) - 1;
end;
$$;

-- ===========================================================================
-- Profiles: email for member lists, readable by co-members (R-PROFILE-003, R-PROFILE-005)
-- ===========================================================================
alter table public.profiles add column email text;

update public.profiles as p set email = u.email from auth.users as u where u.id = p.id;

-- R-PROFILE-001, R-PROFILE-005
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

-- R-PROFILE-005
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

-- R-PROFILE-003
drop policy "Users can read their own profile" on public.profiles;
create policy "Users can read their own and co-members' profiles"
  on public.profiles
  for select
  to authenticated
  using (id in (select private.visible_profile_ids()));

-- ===========================================================================
-- Views (security_invoker: the caller's RLS applies)
-- ===========================================================================

-- R-BUDGET-004, R-BUDGET-008: budgets I belong to, with my role and the end date shown.
create view public.my_budgets with (security_invoker = true) as
  select
    b.id,
    b.name,
    b.owner_id,
    b.primary_income_id,
    b.end_date as end_date_entered,
    private.budget_end_date(b.id) as end_date,
    b.created_at,
    b.updated_at,
    (b.owner_id = (select auth.uid())) as is_owner
  from public.budgets as b
  join public.budget_members as m on m.budget_id = b.id and m.user_id = (select auth.uid());

-- R-MEMBER-001: members of the budgets I belong to, with what the UI shows.
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

-- R-INCOME-003, R-INCOME-006, R-PROFILE-004, R-VERSION-001: incomes with their terms in
-- force now, owner's name, primary flag and next pay date. is_active: in force in the
-- current period.
create view public.income_overview with (security_invoker = true) as
  select
    i.id,
    i.budget_id,
    i.user_id,
    private.display_name_of(i.user_id) as user_display_name,
    i.name,
    (b.primary_income_id = i.id) as is_primary,
    (i.end_seq is null and not i.ended_after_last and i.first_seq <= private.reading_seq(i.budget_id)) as is_active,
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

-- R-PERIOD-018, R-INCOME-011, R-PERIOD-028: periods with the total of the incomes in force
-- in each, at the version in force, and the database's today.
create view public.period_summaries with (security_invoker = true) as
  select
    p.id,
    p.budget_id,
    p.seq,
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

-- R-PERIOD-028: the database's today, for display.
create or replace function public.get_today()
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select private.today()
$$;

-- R-PERIOD-027, R-PERIOD-015, R-PERIOD-016, R-PERIOD-019: the database's today and the
-- months a new budget may start from, with the date its first period would start.
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

-- Set or clear the end date the owner entered (caller holds the lock and has caught up).
-- R-BUDGET-005, R-BUDGET-007, R-BUDGET-008, R-BUDGET-013
create or replace function private.apply_end_date(p_budget_id uuid, p_end_date date)
returns void
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_latest_start date;
begin
  if p_end_date is not null then
    if not private.is_sane_date(p_end_date) or p_end_date > private.today() + 3660 then
      raise exception 'invalid_end_date' using errcode = 'P0001';
    end if;
    select pg_catalog.max(p.start_date) into v_latest_start from public.periods as p
    where p.budget_id = p_budget_id;
    if p_end_date < v_latest_start then
      raise exception 'end_date_before_last_period' using errcode = 'P0001';
    end if;
  end if;
  update public.budgets set end_date = p_end_date where id = p_budget_id;
  -- R-PERIOD-180 (S5): what is left of this call's one step (the write holds the lock); a
  -- budget still behind keeps catching up through ensure_periods (my_budgets.caught_up false)
  perform pg_catalog.set_config('budget_tracker.catch_up', 'multi', true);
  perform private.ensure_periods(p_budget_id);
  perform pg_catalog.set_config('budget_tracker.catch_up', '', true);
end;
$$;

-- R-BUDGET-010, R-BUDGET-011, R-BUDGET-017, R-BUDGET-012, R-PERIOD-001, R-PERIOD-015,
-- R-PERIOD-016, R-PERIOD-019, R-PERIOD-022
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
  v_start date;
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
  v_start := private.month_pay_date(v_month, p_pay_day, p_weekend_rule);

  -- Serialise budget creation per user so the limit cannot be raced.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('create_budget:' || v_user, 0));
  if (select pg_catalog.count(*) from public.budgets where owner_id = v_user)
     >= private.limit_owned_budgets() then
    raise exception 'budget_limit_reached' using errcode = 'P0001';
  end if;
  if (select pg_catalog.count(*) from public.budget_members where user_id = v_user) >= private.limit_memberships() then
    raise exception 'membership_limit_reached' using errcode = 'P0001';
  end if;

  insert into public.budgets (id, name, owner_id, primary_income_id)
  values (v_budget_id, v_name, v_user, v_income_id);
  insert into public.budget_members (budget_id, user_id) values (v_budget_id, v_user);
  insert into public.incomes (id, budget_id, user_id, name, first_seq)
  values (v_income_id, v_budget_id, v_user, v_income_name, 1);
  insert into public.income_versions (income_id, budget_id, effective_from_seq, amount, pay_day, weekend_rule)
  values (v_income_id, v_budget_id, 1, p_amount, p_pay_day, p_weekend_rule);
  insert into public.periods (budget_id, seq, start_date, end_date)
  values (v_budget_id, 1, v_start, private.projected_end(v_budget_id, v_start, 1));
  -- a budget starting up to 60 months back is caught up at once (at most 61 periods: one step)
  perform pg_catalog.set_config('budget_tracker.catch_up', 'multi', true);
  perform private.ensure_periods(v_budget_id);
  perform pg_catalog.set_config('budget_tracker.catch_up', '', true);
  if p_end_date is not null then
    perform private.apply_end_date(v_budget_id, p_end_date);
  end if;
  return v_budget_id;
end;
$$;

-- Owner: set the end date (or clear it with null). Returns the budget as my_budgets shows it.
-- R-MEMBER-003, R-BUDGET-005, R-BUDGET-007, R-BUDGET-008, R-BUDGET-013, R-PERIOD-032
create or replace function public.set_budget_end_date(p_budget_id uuid, p_end_date date default null)
returns setof public.my_budgets
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.assert_owner(p_budget_id);
  perform private.lock_and_catch_up(p_budget_id);
  perform private.apply_end_date(p_budget_id, p_end_date);
  return query select * from public.my_budgets where id = p_budget_id;
end;
$$;

-- Owner: delete the budget with everything in it. R-MEMBER-002, R-BUDGET-009, R-BUDGET-018
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

-- R-INVITE-001, R-INVITE-005, R-INVITE-006, R-INVITE-009, R-MEMBER-004
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

-- Owner: cancel a pending invitation. R-MEMBER-004, R-BUDGET-018
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
  perform private.lock_budget(v_budget_id);
  delete from public.budget_invitations where id = p_invitation_id;
  if not found then
    raise exception 'invitation_not_found' using errcode = 'P0001';
  end if;
end;
$$;

-- R-INVITE-003, R-INVITE-007, R-INVITE-008: pending, unexpired invitations addressed to my
-- verified email, oldest first, a page at a time (Q-162, D-385: at most p_limit, 1 to 200;
-- next page: the last row's created_at and id).
create or replace function public.list_my_invitations(p_limit integer default 50,
                                                      p_after_created_at timestamptz default null,
                                                      p_after_id uuid default null)
returns table (
  id uuid,
  budget_id uuid,
  budget_name text,
  invited_by_name text,
  invited_by_email text,
  created_at timestamptz,
  expires_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_limit is null or p_limit not between 1 and 200 then
    raise exception 'invalid_limit' using errcode = 'P0001';
  end if;
  if pg_catalog.num_nonnulls(p_after_created_at, p_after_id) = 1 then
    raise exception 'invalid_cursor' using errcode = 'P0001';
  end if;
  return query
    select i.id, i.budget_id, b.name, p.display_name, p.email, i.created_at, i.expires_at
    from public.budget_invitations as i
    join public.budgets as b on b.id = i.budget_id
    left join public.profiles as p on p.id = i.invited_by
    where i.email = private.current_verified_email() and i.expires_at > now()
      and (p_after_id is null or (i.created_at, i.id) > (p_after_created_at, p_after_id))
    order by i.created_at, i.id
    limit p_limit;
end;
$$;

-- R-INVITE-003, R-INVITE-004, R-INVITE-007, R-INVITE-010, R-INVITE-011, R-MEMBER-010
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
  v_budget_id uuid;
  v_invitation public.budget_invitations;
begin
  select i.budget_id into v_budget_id from public.budget_invitations as i where i.id = p_invitation_id;
  if v_budget_id is null or v_user is null or v_email is null then
    raise exception 'invitation_not_found' using errcode = 'P0001';
  end if;
  -- Lock order: the budget first, then the invitation row (as invite_member and
  -- cancel_invitation). A cancel that committed first leaves nothing to accept.
  perform private.lock_budget(v_budget_id);
  select i.* into v_invitation from public.budget_invitations as i
  where i.id = p_invitation_id and i.email = v_email and i.expires_at > now()
  for update;
  if v_invitation.id is null then
    raise exception 'invitation_not_found' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.budget_members
                 where budget_id = v_invitation.budget_id and user_id = v_user) then
    if (select pg_catalog.count(*) from public.budget_members
        where budget_id = v_invitation.budget_id) >= private.limit_members() then
      raise exception 'member_limit_reached' using errcode = 'P0001';
    end if;
    -- R-MEMBER-250: serialised per user with budget creation, so the limit cannot be raced
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('create_budget:' || v_user, 0));
    if (select pg_catalog.count(*) from public.budget_members where user_id = v_user) >= private.limit_memberships() then
      raise exception 'membership_limit_reached' using errcode = 'P0001';
    end if;
    insert into public.budget_members (budget_id, user_id) values (v_invitation.budget_id, v_user);
  end if;
  delete from public.budget_invitations where id = v_invitation.id;
  return v_invitation.budget_id;
end;
$$;

-- R-INVITE-004, R-INVITE-007, R-INVITE-011
create or replace function public.decline_invitation(p_invitation_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_email text := private.current_verified_email();
  v_budget_id uuid;
begin
  select i.budget_id into v_budget_id from public.budget_invitations as i
  where i.id = p_invitation_id and v_email is not null and i.email = v_email;
  if v_budget_id is not null then
    perform private.lock_budget(v_budget_id);
  end if;
  delete from public.budget_invitations as i
  where i.id = p_invitation_id and v_email is not null and i.email = v_email
    and i.expires_at > now();
  if not found then
    raise exception 'invitation_not_found' using errcode = 'P0001';
  end if;
end;
$$;

-- R-MEMBER-004, R-MEMBER-006, R-MEMBER-007, R-MEMBER-008, R-MEMBER-009
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
  perform private.lock_and_catch_up(p_budget_id);
  if not exists (select 1 from public.budget_members
                 where budget_id = p_budget_id and user_id = p_user_id) then
    raise exception 'member_not_found' using errcode = 'P0001';
  end if;
  perform private.end_member_incomes(p_budget_id, p_user_id);
  delete from public.budget_members where budget_id = p_budget_id and user_id = p_user_id;
end;
$$;

-- R-MEMBER-005, R-MEMBER-006, R-MEMBER-007, R-MEMBER-008, R-MEMBER-009
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
  perform private.lock_and_catch_up(p_budget_id);
  perform private.end_member_incomes(p_budget_id, (select auth.uid()));
  delete from public.budget_members
  where budget_id = p_budget_id and user_id = (select auth.uid());
end;
$$;

-- R-INCOME-003, R-INCOME-013, R-INCOME-016, R-INCOME-050, R-MEMBER-001
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
  perform private.lock_and_catch_up(p_budget_id);
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

-- New terms from the current period (default), or, as an explicit correction, from an
-- earlier period of the income until its next change. A second edit in the same period
-- overwrites it. For the primary, the current period's end is re-projected (M1).
-- R-VERSION-001, R-VERSION-005, R-VERSION-006, R-VERSION-010, R-VERSION-007, R-VERSION-008,
-- R-PERIOD-011, R-PERIOD-029, R-INCOME-050
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
    perform private.reproject_current_end(v_income.budget_id);
  end if;
end;
$$;

-- R-INCOME-007, R-INCOME-008, R-INCOME-017, R-PERIOD-029
create or replace function public.set_primary_income(p_income_id uuid)
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
  v_income := private.lock_income(p_income_id);
  if v_income.end_seq is not null then
    raise exception 'income_ended' using errcode = 'P0001';
  end if;
  v_seq := private.current_seq(v_income.budget_id);
  if v_income.first_seq > v_seq then
    raise exception 'income_not_in_force' using errcode = 'P0001';
  end if;
  update public.budgets set primary_income_id = v_income.id, primary_since_seq = v_seq
  where id = v_income.budget_id and primary_income_id <> v_income.id;
  if found then
    perform private.reproject_current_end(v_income.budget_id);
  end if;
end;
$$;

-- Remove an income from the current period (default) or, as an explicit correction, from an
-- earlier period. Removed from the period it started in it is deleted; otherwise it ends
-- there. Returns 'deleted' or 'ended'. R-INCOME-009, R-INCOME-012, R-INCOME-015, R-INCOME-050
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
    v_seq := private.current_seq(v_income.budget_id);
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

-- R-PERIOD-008, R-PERIOD-009, R-PERIOD-031
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

-- The current period (zero rows when the budget has ended). R-PERIOD-010, R-PERIOD-028,
-- R-PERIOD-031, R-SECURITY-006
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

-- ---------------------------------------------------------------------------
-- Boundary operations (R-PERIOD-012, R-PERIOD-013, R-PERIOD-014, R-PERIOD-020,
-- R-PERIOD-023, R-PERIOD-025, R-PERIOD-033, R-PERIOD-034). Each catches up first and leaves
-- the structural invariants intact; each has an inverse.
-- ---------------------------------------------------------------------------

-- Lock, catch up and return the current period, or budget_ended.
create or replace function private.lock_current_period(p_budget_id uuid)
returns public.periods
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_current public.periods;
begin
  perform private.assert_member(p_budget_id);
  perform private.lock_and_catch_up(p_budget_id);
  v_current := private.current_period(p_budget_id);
  if v_current.id is null then
    raise exception 'budget_ended' using errcode = 'P0001';
  end if;
  return v_current;
end;
$$;

create or replace function private.assert_length(p_start date, p_end date)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_end - p_start + 1 not between private.limit_period_min_days() and private.limit_period_max_days() then
    raise exception 'invalid_boundary' using errcode = 'P0001';
  end if;
end;
$$;

-- The salary is expected on p_pay_date (after today): the current period ends the day
-- before. p_pay_date = null resets the end to the projection. Inverse: call again, or reset.
-- R-PERIOD-013, R-PERIOD-014, R-PERIOD-025, R-PERIOD-033
create or replace function public.set_expected_pay_date(p_budget_id uuid, p_pay_date date default null)
returns setof public.period_summaries
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_current public.periods;
  v_today date := private.today();
  v_end date;
begin
  if p_pay_date is not null and not private.is_sane_date(p_pay_date) then
    raise exception 'invalid_boundary' using errcode = 'P0001';
  end if;
  v_current := private.lock_current_period(p_budget_id);
  if p_pay_date is null then
    v_end := private.projected_end(p_budget_id, v_current.start_date, v_current.seq, v_today);
  else
    v_end := p_pay_date - 1;
    if v_end < v_today then
      raise exception 'invalid_boundary' using errcode = 'P0001';
    end if;
  end if;
  perform private.assert_length(v_current.start_date, v_end);
  update public.periods set end_date = v_end, end_is_manual = p_pay_date is not null
  where id = v_current.id;
  return query select s.* from public.period_summaries as s where s.id = v_current.id;
end;
$$;

-- The salary arrived early, on p_pay_date (today or earlier): the current period closes the
-- day before and the next one starts on p_pay_date. Inverse: reopen_previous_period.
-- R-PERIOD-012, R-PERIOD-025, R-PERIOD-034
create or replace function public.record_early_pay_date(p_budget_id uuid, p_pay_date date)
returns setof public.period_summaries
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_current public.periods;
  v_end_date date;
begin
  if not private.is_sane_date(p_pay_date) then
    raise exception 'invalid_boundary' using errcode = 'P0001';
  end if;
  v_current := private.lock_current_period(p_budget_id);
  select b.end_date into v_end_date from public.budgets as b where b.id = p_budget_id;
  if p_pay_date > private.today() or (v_end_date is not null and p_pay_date > v_end_date) then
    raise exception 'invalid_boundary' using errcode = 'P0001';
  end if;
  perform private.assert_length(v_current.start_date, p_pay_date - 1);
  update public.periods set end_date = p_pay_date - 1, end_is_manual = true where id = v_current.id;
  perform private.ensure_periods(p_budget_id);
  return query select s.* from public.period_summaries as s
               where s.budget_id = p_budget_id and s.seq = v_current.seq + 1;
end;
$$;

-- The salary that started the current period has not arrived yet: the current (latest)
-- period is merged into the previous one, which ends the day before p_pay_date (after
-- today) or at its projection when p_pay_date is null. Everything keyed to the merged
-- period is re-keyed to the previous one (R-VERSION-011). Inverse: record_early_pay_date
-- with the original date. R-PERIOD-023, R-PERIOD-025, R-VERSION-011
create or replace function public.reopen_previous_period(p_budget_id uuid, p_pay_date date default null)
returns setof public.period_summaries
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_current public.periods;
  v_previous public.periods;
  v_today date := private.today();
  v_end date;
begin
  if p_pay_date is not null and not private.is_sane_date(p_pay_date) then
    raise exception 'invalid_boundary' using errcode = 'P0001';
  end if;
  v_current := private.lock_current_period(p_budget_id);
  select p.* into v_previous from public.periods as p
  where p.budget_id = p_budget_id and p.seq = v_current.seq - 1;
  if v_previous.id is null then
    raise exception 'invalid_boundary' using errcode = 'P0001';
  end if;
  if p_pay_date is null then
    v_end := private.projected_end(p_budget_id, v_previous.start_date, v_previous.seq, v_today);
  else
    v_end := p_pay_date - 1;
  end if;
  if v_end < v_today then
    raise exception 'invalid_boundary' using errcode = 'P0001';
  end if;
  perform private.assert_length(v_previous.start_date, v_end);
  perform private.rekey_period(p_budget_id, v_current.seq, v_previous.seq);
  delete from public.periods where id = v_current.id;
  update public.periods set end_date = v_end, end_is_manual = p_pay_date is not null
  where id = v_previous.id;
  return query select s.* from public.period_summaries as s where s.id = v_previous.id;
end;
$$;

-- R-PERIOD-035: what reopen_previous_period would move into the previous period: one row per
-- change recorded in the current (latest) period. Members. Like get_current_period, it first
-- creates missing periods.
create or replace function public.preview_reopen(p_budget_id uuid)
returns table (record_kind text, record_id uuid, record_name text, change text, replaces_previous boolean)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_current public.periods;
begin
  perform private.assert_member(p_budget_id);
  v_current := private.current_period(p_budget_id);
  if v_current.id is null then
    raise exception 'budget_ended' using errcode = 'P0001';
  end if;
  if v_current.seq = 1 then
    raise exception 'invalid_boundary' using errcode = 'P0001';
  end if;
  return query select * from private.merge_impact(p_budget_id, v_current.seq, v_current.seq - 1);
end;
$$;

-- R-PERIOD-036: what the current period's end and expected next pay date would become if the
-- primary income's terms became (p_pay_day, p_weekend_rule), each defaulting to the current
-- terms, or if p_income_id became primary with its terms in force. The same logic as the
-- write (private.reprojected_end). Members. Like get_current_period, it first creates
-- missing periods; it changes nothing else.
create or replace function public.preview_expected_pay_date(
  p_budget_id uuid,
  p_pay_day integer default null,
  p_weekend_rule public.weekend_rule default null,
  p_income_id uuid default null
)
returns table (period_id uuid, end_date date, expected_pay_date date, end_is_manual boolean)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_current public.periods;
  v_pay_day integer;
  v_rule public.weekend_rule;
  v_end date;
begin
  perform private.assert_member(p_budget_id);
  v_current := private.current_period(p_budget_id);
  if v_current.id is null then
    raise exception 'budget_ended' using errcode = 'P0001';
  end if;
  if p_income_id is not null then
    if not exists (select 1 from public.incomes as i where i.id = p_income_id and i.budget_id = p_budget_id) then
      raise exception 'income_not_found' using errcode = 'P0001';
    end if;
    if exists (select 1 from public.incomes as i where i.id = p_income_id
               and (i.end_seq is not null or i.first_seq > v_current.seq)) then
      raise exception 'income_not_in_force' using errcode = 'P0001';
    end if;
    select t.pay_day, t.weekend_rule into v_pay_day, v_rule
    from private.terms_at(p_income_id, v_current.seq + 1) as t;
  else
    select t.pay_day, t.weekend_rule into v_pay_day, v_rule
    from public.budgets as b cross join lateral private.terms_at(b.primary_income_id, v_current.seq + 1) as t
    where b.id = p_budget_id;
  end if;
  v_pay_day := coalesce(p_pay_day, v_pay_day);
  v_rule := coalesce(p_weekend_rule, v_rule);
  perform private.assert_income_terms(1, v_pay_day, v_rule);
  v_end := private.reprojected_end(v_current, v_pay_day, v_rule);
  return query select v_current.id, v_end, v_end + 1, v_current.end_is_manual;
end;
$$;

-- Move the boundary between a period and the one before it: p_period_id starts on
-- p_start_date (today or earlier), the previous one ends the day before. Inverse: move it
-- back. R-PERIOD-012, R-PERIOD-025
create or replace function public.move_period_start(p_period_id uuid, p_start_date date)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_budget_id uuid;
  v_period public.periods;
  v_previous public.periods;
begin
  select p.budget_id into v_budget_id from public.periods as p where p.id = p_period_id;
  if v_budget_id is null or not private.is_budget_member(v_budget_id) then
    raise exception 'period_not_found' using errcode = 'P0001';
  end if;
  if not private.is_sane_date(p_start_date) then
    raise exception 'invalid_boundary' using errcode = 'P0001';
  end if;
  perform private.lock_and_catch_up(v_budget_id);
  select p.* into v_period from public.periods as p where p.id = p_period_id;
  if v_period.id is null then
    raise exception 'period_not_found' using errcode = 'P0001';
  end if;
  select p.* into v_previous from public.periods as p
  where p.budget_id = v_budget_id and p.seq = v_period.seq - 1;
  if v_previous.id is null or p_start_date > private.today()
     or p_start_date > coalesce((select b.end_date from public.budgets as b where b.id = v_budget_id), p_start_date) then
    raise exception 'invalid_boundary' using errcode = 'P0001';
  end if;
  perform private.assert_length(v_previous.start_date, p_start_date - 1);
  perform private.assert_length(p_start_date, v_period.end_date);
  update public.periods set end_date = p_start_date - 1, end_is_manual = true where id = v_previous.id;
  update public.periods set start_date = p_start_date where id = v_period.id;
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
do $$
declare
  f regprocedure;
begin
  for f in
    select p.oid::regprocedure
    from pg_catalog.pg_proc as p
    join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private')
      and p.proname <> 'set_updated_at' and p.proname <> 'handle_new_user'
  loop
    execute pg_catalog.format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
end;
$$;

-- Used by policies and security_invoker views, so the calling role needs them.
grant execute on function
  private.member_budget_ids(), private.owned_budget_ids(), private.visible_profile_ids(),
  private.display_name_of(uuid),
  private.today(), private.next_pay_date(date, integer, public.weekend_rule),
  private.month_pay_date(date, integer, public.weekend_rule),
  private.next_salary_date(date, integer, public.weekend_rule, date),
  private.limit_projection_min_days(),
  private.terms_at(uuid, integer), private.reading_seq(uuid),
  private.projected_end(uuid, date, integer, date), private.budget_end_date(uuid),
  private.month_paid_by(date, integer, public.weekend_rule)
to authenticated;

grant execute on function
  public.pay_date(integer, integer, integer, public.weekend_rule),
  public.get_today(),
  public.get_start_months(integer, public.weekend_rule),
  public.create_budget(text, text, bigint, integer, public.weekend_rule, date, date),
  public.set_budget_end_date(uuid, date),
  public.delete_budget(uuid),
  public.invite_member(uuid, text),
  public.cancel_invitation(uuid),
  public.list_my_invitations(integer, timestamptz, uuid),
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
  public.set_expected_pay_date(uuid, date),
  public.record_early_pay_date(uuid, date),
  public.reopen_previous_period(uuid, date),
  public.move_period_start(uuid, date),
  public.preview_reopen(uuid),
  public.preview_expected_pay_date(uuid, integer, public.weekend_rule, uuid)
to authenticated;

-- ===========================================================================
-- Row-level security (C-RLS-001, C-RLS-002, R-SECURITY-001 to R-SECURITY-003)
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
