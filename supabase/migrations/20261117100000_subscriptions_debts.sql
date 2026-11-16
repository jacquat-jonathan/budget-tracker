-- Step 4: subscriptions (recurring charges, created automatically and confirmed by a member)
-- and debts (payments, interest added once per period, balance adjustments, projection).
--
-- The client contract is in docs/database.md; the rules are in spec/spec.json (docs/spec.md)
-- and their ids are named below, at the object that enforces each. The conventions of the
-- step 2 and step 3 migrations apply: explicit privileges, RLS with policies in the same
-- migration, membership helpers in `private`, `set search_path = ''`, schema-qualified names,
-- RPC-first writes that take the budget lock and catch up before reading the rows they check,
-- required revisions, stable P0001 message codes, deferred constraint triggers for invariants,
-- costs that depend only on the budget's own rows.
--
-- Subscriptions
--   * Validity by period number like categories (first_seq, end_seq); the terms (price,
--     cadence, category, and the date the schedule counts from) are versions keyed by
--     effective_from_seq. Both join the registry, so a reopen merges them like any other
--     recorded change.                                         (R-VERSION-003, D-170)
--   * Charges are ordinary expense transactions linked to the subscription, with the scheduled
--     date they were created for (charge_date, unique per subscription) and a review state
--     ('awaiting_confirmation' until a member confirms). They are created by the catch-up
--     (private.ensure_periods) for every scheduled date up to today that the subscription's
--     watermark (charged_through) has not passed, in periods where it is in force, at the
--     price of the version in force there. The watermark only moves forward, so a charge is
--     created at most once, a deleted or dismissed one never again, and an edit or a
--     correction never creates charges in the past.               (R-SUBSCRIPTION-073, D-171)
--
-- Debts
--   * Validity and versioned terms (interest rate, planned monthly payment) like
--     subscriptions. The remaining amount is computed from the rows: principal + interest
--     entries + adjustments - linked payments.                    (R-DEBT-003, D-174)
--   * Interest: when a period is created (however: roll-over, catch-up, early salary), one
--     entry per debt in force with a rate, one twelfth of the yearly rate on the balance at
--     that moment, rounded half up. The entry references the period, so a reopen that merges
--     that period removes it.                                     (R-DEBT-073, D-172)

-- ===========================================================================
-- Types
-- ===========================================================================
-- R-SUBSCRIPTION-070
create type public.subscription_cadence as enum ('monthly', 'quarterly', 'half_yearly', 'yearly');
comment on type public.subscription_cadence is
  'How often a subscription is charged: every 1, 3, 6 or 12 months, on the day of the month of its schedule''s date.';

-- ===========================================================================
-- Limits (one place; abuse bounds, generous for a household)      (R-SUBSCRIPTION-110, R-DEBT-110)
-- ===========================================================================
create or replace function private.limit_active_subscriptions() returns integer
language sql immutable set search_path = '' as $$ select 50 $$;
create or replace function private.limit_total_subscriptions() returns integer
language sql immutable set search_path = '' as $$ select 200 $$;
create or replace function private.limit_active_debts() returns integer
language sql immutable set search_path = '' as $$ select 50 $$;
create or replace function private.limit_total_debts() returns integer
language sql immutable set search_path = '' as $$ select 200 $$;
-- Balance adjustments per budget.
create or replace function private.limit_debt_adjustments() returns integer
language sql immutable set search_path = '' as $$ select 5000 $$;
-- Largest balance a debt may reach through interest or an adjustment (CHF 10 billion), so no
-- amount can overflow however long interest runs.
create or replace function private.limit_debt_balance() returns bigint
language sql immutable set search_path = '' as $$ select 1000000000000::bigint $$;
-- Largest yearly interest rate, in percent.
create or replace function private.limit_interest_rate() returns numeric
language sql immutable set search_path = '' as $$ select 100::numeric $$;
-- How far the payoff projection looks ahead, in periods (50 years); beyond: "never".
create or replace function private.limit_projection_periods() returns integer
language sql immutable set search_path = '' as $$ select 600 $$;
-- How far ahead a schedule date may be, in days (as for a budget's end date).
create or replace function private.limit_schedule_days_ahead() returns integer
language sql immutable set search_path = '' as $$ select 3660 $$;

-- ===========================================================================
-- Charge schedules (pure)                       (R-SUBSCRIPTION-071, R-SUBSCRIPTION-072)
-- ===========================================================================

-- R-SUBSCRIPTION-070: months per cadence interval.
create or replace function private.cadence_months(p_cadence public.subscription_cadence)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_cadence when 'monthly' then 1 when 'quarterly' then 3 when 'half_yearly' then 6 when 'yearly' then 12 end
$$;

-- Months since year 0 (calendar arithmetic on integers: no timestamp, no time zone; C-DATE-002).
create or replace function private.month_index(p_date date)
returns integer
language sql
immutable
set search_path = ''
as $$
  select (extract(year from p_date)::integer * 12 + extract(month from p_date)::integer - 1)
$$;

-- R-SUBSCRIPTION-071: day p_day of month p_index, clamped to the month's length.
create or replace function private.month_day(p_index integer, p_day integer)
returns date
language sql
immutable
set search_path = ''
as $$
  select pg_catalog.make_date(p_index / 12, p_index % 12 + 1, 1)
         + (least(p_day, extract(day from (pg_catalog.make_date(p_index / 12, p_index % 12 + 1, 1)
                                            + interval '1 month' - interval '1 day'))::integer) - 1)
$$;

-- R-SUBSCRIPTION-071, R-SUBSCRIPTION-072: the charge dates of a schedule between two dates
-- (inclusive), in order: from p_anchor, every cadence interval, on p_anchor's day of the
-- month clamped to each month's length (31 January monthly: 28 or 29 February, 31 March,
-- 30 April), whatever the weekday. Cost: the number of months between the two dates.
create or replace function private.charge_dates(
  p_anchor date,
  p_cadence public.subscription_cadence,
  p_from date,
  p_to date
)
returns setof date
language sql
immutable
set search_path = ''
as $$
  select d
  from (
    select private.month_day(i, extract(day from p_anchor)::integer) as d
    from pg_catalog.generate_series(greatest(private.month_index(p_from), private.month_index(p_anchor)),
                                    private.month_index(p_to)) as i
    where (i - private.month_index(p_anchor)) % private.cadence_months(p_cadence) = 0
  ) as s
  where s.d between greatest(p_from, p_anchor) and p_to
  order by s.d
$$;

-- R-SUBSCRIPTION-002: the first charge date of a schedule after p_after.
create or replace function private.next_charge_date(
  p_anchor date,
  p_cadence public.subscription_cadence,
  p_after date
)
returns date
language sql
immutable
set search_path = ''
as $$
  select case
    when p_anchor is null or p_cadence is null or p_after is null then null
    when p_after < p_anchor then p_anchor
    else (select pg_catalog.min(d) from private.charge_dates(p_anchor, p_cadence, p_after + 1, p_after + 400) as d)
  end
$$;

-- R-SUBSCRIPTION-079, Q-050, D-173: the monthly cost of a subscription's price: the price
-- divided by the months of its cadence, rounded half up to the rappen (prices are positive).
create or replace function private.subscription_monthly_cost(p_price bigint, p_cadence public.subscription_cadence)
returns bigint
language sql
immutable
set search_path = ''
as $$
  select (2 * p_price + private.cadence_months(p_cadence)) / (2 * private.cadence_months(p_cadence))
$$;

-- ===========================================================================
-- Tables
-- ===========================================================================

-- A period's id together with its budget, so rows can reference a period of their own budget.
alter table public.periods add constraint periods_id_budget_unique unique (id, budget_id);

-- R-SUBSCRIPTION-001: a subscription. Validity by period number like a category; the terms
-- are in subscription_versions.
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  budget_id uuid not null references public.budgets (id) on delete cascade,
  name text not null,
  first_seq integer not null,
  -- end_seq = first_seq is a void row, never in force (R-VERSION-014): kept for its charges.
  end_seq integer,
  -- R-SUBSCRIPTION-073, R-SUBSCRIPTION-111: every scheduled charge dated on or before this date
  -- has been settled (created, or skipped because it fell where the subscription was not in
  -- force). Only moves forward; not part of the revision.
  charged_through date not null,
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subscriptions_name_valid check (name = btrim(name) and char_length(name) between 1 and 100),
  constraint subscriptions_seq_valid check (first_seq >= 1 and (end_seq is null or end_seq >= first_seq)),
  constraint subscriptions_charged_through_valid check (charged_through between date '1900-01-01' and date '2999-12-31'),
  constraint subscriptions_id_budget_unique unique (id, budget_id)
);
comment on table public.subscriptions is
  'Subscriptions. Validity by period number like categories; terms in subscription_versions; see docs/database.md.';
-- The catch-up's fast path: is any subscription of this budget behind?
create index subscriptions_budget_charged_idx on public.subscriptions (budget_id, charged_through);

-- R-SUBSCRIPTION-001, R-SUBSCRIPTION-070, R-VERSION-003: the terms, one version per period.
create table public.subscription_versions (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null,
  -- A direct cascade from the budget too, so deleting a budget never checks a category
  -- reference before the version is gone (see debt_adjustments).
  budget_id uuid not null references public.budgets (id) on delete cascade,
  effective_from_seq integer not null,
  price bigint not null,  -- R-MONEY-002: integer rappen, charged in full on each charge date
  cadence public.subscription_cadence not null,
  -- A leaf of the same budget (composite key, plain: a referenced category is kept).
  category_id uuid not null,
  -- The schedule counts from this date: the first charge date, or, after a change of
  -- schedule, the next charge date given then (D-170).
  anchor_date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subscription_versions_subscription_fk foreign key (subscription_id, budget_id)
    references public.subscriptions (id, budget_id) on delete cascade,
  constraint subscription_versions_category_fk foreign key (category_id, budget_id)
    references public.categories (id, budget_id),
  constraint subscription_versions_unique unique (subscription_id, effective_from_seq),  -- R-VERSION-006
  constraint subscription_versions_seq_valid check (effective_from_seq >= 1),
  constraint subscription_versions_price_valid check (price between 1 and 1000000000),  -- R-SUBSCRIPTION-110
  constraint subscription_versions_anchor_valid check (anchor_date between date '1900-01-01' and date '2999-12-31')
);
create index subscription_versions_budget_id_idx on public.subscription_versions (budget_id);
create index subscription_versions_subscription_idx on public.subscription_versions (subscription_id, budget_id);
create index subscription_versions_category_idx on public.subscription_versions (category_id, budget_id);

-- R-DEBT-001, R-DEBT-002, R-DEBT-070, R-DEBT-072: a debt the household owes, tied to one
-- category. Validity by period number; terms in debt_versions.
create table public.debts (
  id uuid primary key default gen_random_uuid(),
  budget_id uuid not null references public.budgets (id) on delete cascade,
  name text not null,
  -- R-DEBT-070: payments are expenses in this leaf (composite key, plain).
  category_id uuid not null,
  -- R-DEBT-003, R-MONEY-002: what was owed when it was recorded, integer rappen.
  principal bigint not null,
  -- The date the principal is shown at in the debt's history.
  opened_on date not null,
  first_seq integer not null,
  end_seq integer,
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint debts_category_fk foreign key (category_id, budget_id)
    references public.categories (id, budget_id),
  constraint debts_name_valid check (name = btrim(name) and char_length(name) between 1 and 100),
  constraint debts_principal_valid check (principal between 1 and 1000000000),  -- R-DEBT-110
  constraint debts_opened_on_valid check (opened_on between date '1900-01-01' and date '2999-12-31'),
  constraint debts_seq_valid check (first_seq >= 1 and (end_seq is null or end_seq >= first_seq)),
  constraint debts_id_budget_unique unique (id, budget_id)
);
comment on table public.debts is
  'Debts the household owes. Validity by period number; terms in debt_versions; see docs/database.md.';
create index debts_budget_id_idx on public.debts (budget_id);
create index debts_category_idx on public.debts (category_id, budget_id);

-- R-DEBT-002, R-VERSION-004: the terms, one version per period.
create table public.debt_versions (
  id uuid primary key default gen_random_uuid(),
  debt_id uuid not null,
  budget_id uuid not null references public.budgets (id) on delete cascade,
  effective_from_seq integer not null,
  -- Yearly interest rate in percent (4.875 = 4.875 %); 0: no interest.
  interest_rate numeric(6, 3) not null default 0,
  -- R-MONEY-002: planned payment per period (monthly), integer rappen; 0: none planned.
  monthly_payment bigint not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint debt_versions_debt_fk foreign key (debt_id, budget_id)
    references public.debts (id, budget_id) on delete cascade,
  constraint debt_versions_unique unique (debt_id, effective_from_seq),  -- R-VERSION-006
  constraint debt_versions_seq_valid check (effective_from_seq >= 1),
  constraint debt_versions_rate_valid check (interest_rate between 0 and 100),
  constraint debt_versions_payment_valid check (monthly_payment between 0 and 1000000000)
);
create index debt_versions_budget_id_idx on public.debt_versions (budget_id);
create index debt_versions_debt_idx on public.debt_versions (debt_id, budget_id);

-- R-DEBT-075: a manual balance adjustment, as the amount it changed the remaining amount by.
-- Plain foreign key: a debt with adjustments is never deleted (a merge keeps it void).
create table public.debt_adjustments (
  id uuid primary key default gen_random_uuid(),
  -- Deleting the budget deletes it directly (its debt reference is plain, so it must be gone
  -- before the debt; R-BUDGET-001).
  budget_id uuid not null references public.budgets (id) on delete cascade,
  debt_id uuid not null,
  date date not null,
  -- R-MONEY-002: signed integer rappen (positive: the debt grew).
  amount bigint not null,
  note text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint debt_adjustments_debt_fk foreign key (debt_id, budget_id)
    references public.debts (id, budget_id),
  constraint debt_adjustments_amount_valid check (amount <> 0 and amount between -2000000000000 and 2000000000000),
  constraint debt_adjustments_date_valid check (date between date '1900-01-01' and date '2999-12-31'),
  constraint debt_adjustments_note_valid check (
    note is null or (note = btrim(note) and char_length(note) between 1 and 500)
  )
);
create index debt_adjustments_debt_idx on public.debt_adjustments (debt_id, budget_id, date);
create index debt_adjustments_budget_id_idx on public.debt_adjustments (budget_id);
create index debt_adjustments_created_by_idx on public.debt_adjustments (created_by);

-- R-DEBT-073, R-DEBT-004: interest added to a debt when a period was created, at most one per
-- debt and period. References the period: a reopen that merges the period removes it.
create table public.debt_interest (
  id uuid primary key default gen_random_uuid(),
  budget_id uuid not null references public.budgets (id) on delete cascade,
  debt_id uuid not null,
  period_id uuid not null,
  amount bigint not null,  -- R-MONEY-002: integer rappen, rounded half up
  rate numeric(6, 3) not null,  -- the yearly rate applied
  balance bigint not null,  -- the remaining amount it was computed on
  created_at timestamptz not null default now(),
  constraint debt_interest_debt_fk foreign key (debt_id, budget_id)
    references public.debts (id, budget_id) on delete cascade,
  constraint debt_interest_period_fk foreign key (period_id, budget_id)
    references public.periods (id, budget_id) on delete cascade,
  constraint debt_interest_unique unique (debt_id, period_id),  -- R-DEBT-111
  constraint debt_interest_amount_valid check (amount >= 1)
);
create index debt_interest_budget_id_idx on public.debt_interest (budget_id);
create index debt_interest_period_idx on public.debt_interest (period_id, budget_id);

-- R-TRANSACTION-003, R-DEBT-071, R-SUBSCRIPTION-073, R-SUBSCRIPTION-075: the links and the
-- charge columns, added without reshaping the table (docs/database.md, "For later tables").
alter table public.transactions
  add column subscription_id uuid,
  add column debt_id uuid,
  -- The scheduled date an automatic charge was created for (the transaction's own date may
  -- be edited); null for a transaction a member recorded.
  add column charge_date date,
  -- 'awaiting_confirmation': an automatic charge no member has confirmed yet (it counts in
  -- the totals all the same, R-SUBSCRIPTION-078). Step 6 adds a value for imports.
  add column review_state text not null default 'confirmed',
  -- Plain, non-deferrable, no cascade: a subscription or debt with transactions is never
  -- deleted (a merge keeps it void, R-VERSION-014).
  add constraint transactions_subscription_fk foreign key (subscription_id, budget_id)
    references public.subscriptions (id, budget_id),
  add constraint transactions_debt_fk foreign key (debt_id, budget_id)
    references public.debts (id, budget_id),
  -- R-TRANSACTION-003
  add constraint transactions_one_link check (num_nonnulls(subscription_id, debt_id) <= 1),
  -- R-TRANSACTION-110: a linked transaction is an expense.
  add constraint transactions_link_kind check ((subscription_id is null and debt_id is null) or kind = 'expense'),
  add constraint transactions_charge_valid check (
    charge_date is null or (subscription_id is not null and charge_date between date '1900-01-01' and date '2999-12-31')),
  add constraint transactions_review_state_valid check (review_state in ('confirmed', 'awaiting_confirmation')),
  add constraint transactions_awaiting_is_charge check (review_state = 'confirmed' or charge_date is not null),
  -- R-SUBSCRIPTION-111: one charge per subscription and scheduled date.
  add constraint transactions_charge_unique unique (subscription_id, charge_date);
create index transactions_debt_idx on public.transactions (debt_id, budget_id, date) include (amount);
create index transactions_awaiting_idx on public.transactions (budget_id, date, created_at, id)
  where review_state = 'awaiting_confirmation';

create trigger subscriptions_set_updated_at before update on public.subscriptions
  for each row execute function private.set_updated_at();
create trigger subscription_versions_set_updated_at before update on public.subscription_versions
  for each row execute function private.set_updated_at();
create trigger debts_set_updated_at before update on public.debts
  for each row execute function private.set_updated_at();
create trigger debt_versions_set_updated_at before update on public.debt_versions
  for each row execute function private.set_updated_at();

-- R-CONCURRENCY-090: the watermark moves with every catch-up and is not an edit.
create trigger subscriptions_bump_revision before update on public.subscriptions
  for each row execute function private.bump_revision('revision', 'updated_at', 'charged_through');
create trigger debts_bump_revision before update on public.debts
  for each row execute function private.bump_revision('revision', 'updated_at');

-- ===========================================================================
-- Merges: subscriptions, debts and their versions join the registry (R-VERSION-011,
-- R-VERSION-014, R-VERSION-110)
-- ===========================================================================
insert into private.period_keyed_tables (table_name, kind, record_kind, name_column) values
  ('public.subscriptions', 'validity', 'subscription', 'name'),
  ('public.debts', 'validity', 'debt', 'name');
insert into private.period_keyed_tables (table_name, kind, record_kind, entity_column, entity_table) values
  ('public.subscription_versions', 'version', 'subscription', 'subscription_id', 'public.subscriptions'),
  ('public.debt_versions', 'version', 'debt', 'debt_id', 'public.debts');

-- R-VERSION-011: nothing keyed beyond the latest period (the generic check of step 3).
create constraint trigger subscriptions_not_beyond_latest
  after insert or update of first_seq, end_seq on public.subscriptions
  deferrable initially deferred
  for each row execute function private.check_nothing_beyond_latest();
create constraint trigger subscription_versions_not_beyond_latest
  after insert or update of effective_from_seq on public.subscription_versions
  deferrable initially deferred
  for each row execute function private.check_nothing_beyond_latest();
create constraint trigger debts_not_beyond_latest
  after insert or update of first_seq, end_seq on public.debts
  deferrable initially deferred
  for each row execute function private.check_nothing_beyond_latest();
create constraint trigger debt_versions_not_beyond_latest
  after insert or update of effective_from_seq on public.debt_versions
  deferrable initially deferred
  for each row execute function private.check_nothing_beyond_latest();

-- ===========================================================================
-- Invariants (constraint triggers, checked at commit)
-- ===========================================================================

-- R-SUBSCRIPTION-001, R-DEBT-070, R-VERSION-003, R-VERSION-004: what is wrong with a
-- subscription or a debt, or null. Each has terms in force from its first period, and its
-- category (every version's, for a subscription) is a leaf.
create or replace function private.step4_shape_violation(p_kind text, p_id uuid)
returns text
language sql
stable
set search_path = ''
as $$
  select case p_kind
    when 'subscription' then (
      select case
        when not exists (select 1 from public.subscription_versions as v
                         where v.subscription_id = s.id and v.effective_from_seq <= s.first_seq)
          then 'subscription_without_terms'
        when exists (select 1 from public.subscription_versions as v join public.categories as c on c.id = v.category_id
                     where v.subscription_id = s.id and c.is_group)
          then 'subscription_on_group'
      end
      from public.subscriptions as s where s.id = p_id)
    else (
      select case
        when not exists (select 1 from public.debt_versions as v
                         where v.debt_id = d.id and v.effective_from_seq <= d.first_seq)
          then 'debt_without_terms'
        when exists (select 1 from public.categories as c where c.id = d.category_id and c.is_group)
          then 'debt_on_group'
      end
      from public.debts as d where d.id = p_id)
  end
$$;

create or replace function private.check_step4_shape()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_problem text;
  v_id uuid;
begin
  -- Deferred: read the rows as they are now. A row deleted since is not checked.
  if tg_table_name = 'subscriptions' then
    v_problem := private.step4_shape_violation('subscription', new.id);
  elsif tg_table_name = 'subscription_versions' then
    if tg_op = 'DELETE' then v_id := old.subscription_id; else v_id := new.subscription_id; end if;
    v_problem := private.step4_shape_violation('subscription', v_id);
  elsif tg_table_name = 'debts' then
    v_problem := private.step4_shape_violation('debt', new.id);
  elsif tg_table_name = 'debt_versions' then
    if tg_op = 'DELETE' then v_id := old.debt_id; else v_id := new.debt_id; end if;
    v_problem := private.step4_shape_violation('debt', v_id);
  elsif tg_table_name = 'categories' then
    -- a category that became a group: nothing may still charge or pay into it
    if exists (select 1 from public.categories as c where c.id = new.id and c.is_group)
       and (exists (select 1 from public.subscription_versions as v where v.category_id = new.id)
            or exists (select 1 from public.debts as d where d.category_id = new.id)) then
      v_problem := 'group_has_subscription_or_debt';
    end if;
  end if;
  if v_problem is not null then
    raise exception 'step4_shape_invalid: %', v_problem using errcode = '23514';
  end if;
  return null;
end;
$$;

create constraint trigger subscriptions_shape
  after insert or update of first_seq on public.subscriptions
  deferrable initially deferred
  for each row execute function private.check_step4_shape();
create constraint trigger subscription_versions_shape
  after insert or update or delete on public.subscription_versions
  deferrable initially deferred
  for each row execute function private.check_step4_shape();
create constraint trigger debts_shape
  after insert or update of first_seq, category_id on public.debts
  deferrable initially deferred
  for each row execute function private.check_step4_shape();
create constraint trigger debt_versions_shape
  after insert or update or delete on public.debt_versions
  deferrable initially deferred
  for each row execute function private.check_step4_shape();
create constraint trigger categories_step4_shape
  after update of is_group on public.categories
  deferrable initially deferred
  for each row execute function private.check_step4_shape();

-- ===========================================================================
-- Debt amounts (per debt; each an index lookup by debt id)        (R-DEBT-003, R-DEBT-004)
-- ===========================================================================

-- R-DEBT-003: principal + interest + adjustments - linked payments. Planned for the actual id
-- (force_custom_plan), as a lookup by a value with very uneven counts (D-153).
create or replace function private.debt_remaining(p_debt_id uuid)
returns bigint
language plpgsql
stable
set search_path = ''
set plan_cache_mode = force_custom_plan
as $$
begin
  -- one statement, so one plan per call
  return (
    select d.principal
      + coalesce((select pg_catalog.sum(i.amount) from public.debt_interest as i where i.debt_id = d.id), 0)::bigint
      + coalesce((select pg_catalog.sum(a.amount) from public.debt_adjustments as a where a.debt_id = d.id), 0)::bigint
      - coalesce((select pg_catalog.sum(t.amount) from public.transactions as t where t.debt_id = d.id), 0)::bigint
    from public.debts as d where d.id = p_debt_id);
end;
$$;

-- R-DEBT-073, Q-055, D-172: one period's interest on a balance: one twelfth of the yearly
-- rate, rounded half up to the rappen; none on a balance of zero or less; never beyond the
-- balance limit.
create or replace function private.period_interest(p_balance bigint, p_rate numeric)
returns bigint
language sql
immutable
set search_path = ''
as $$
  select case
    when p_balance <= 0 or p_rate is null or p_rate <= 0 or p_balance >= private.limit_debt_balance() then 0
    else least(pg_catalog.round(p_balance::numeric * p_rate / 1200), private.limit_debt_balance() - p_balance)::bigint
  end
$$;

-- R-DEBT-073, R-DEBT-111, D-172: when a period is created, add one interest entry to each debt
-- in force in it that has a rate and a positive balance, on the balance at that moment.
-- Runs for every period insert, so it holds however the period came to exist; at most one
-- entry per debt and period (unique), so a retried or concurrent catch-up adds nothing more.
create or replace function private.apply_debt_interest()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.debt_interest (budget_id, debt_id, period_id, amount, rate, balance)
  select new.budget_id, i.debt_id, new.id, i.amount, i.rate, i.balance
  from (
    select x.id as debt_id, v.interest_rate as rate, b.balance,
           private.period_interest(b.balance, v.interest_rate) as amount
    from public.debts as x
    cross join lateral (
      select dv.interest_rate from public.debt_versions as dv
      where dv.debt_id = x.id and dv.effective_from_seq <= new.seq
      order by dv.effective_from_seq desc limit 1
    ) as v
    cross join lateral (select private.debt_remaining(x.id) as balance offset 0) as b
    where x.budget_id = new.budget_id and x.first_seq <= new.seq and (x.end_seq is null or new.seq < x.end_seq)
      and v.interest_rate > 0
    offset 0
  ) as i
  where i.amount >= 1
  on conflict (debt_id, period_id) do nothing;
  return null;
end;
$$;

create trigger periods_apply_debt_interest
  after insert on public.periods
  for each row execute function private.apply_debt_interest();

-- ===========================================================================
-- Automatic charges (R-SUBSCRIPTION-073, R-SUBSCRIPTION-075, R-SUBSCRIPTION-111, D-171)
-- ===========================================================================

-- The last day charges are created up to: today, but not after the latest period's end (an
-- ended budget). Null when the budget has no periods.
create or replace function private.charge_horizon(p_budget_id uuid)
returns date
language sql
stable
set search_path = ''
as $$
  select least(private.today(), (select p.end_date from public.periods as p
                                 where p.budget_id = p_budget_id order by p.seq desc limit 1))
$$;

-- Whether some subscription of the budget has charges to settle (no lock; the fast path).
create or replace function private.charges_pending(p_budget_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.subscriptions as s
    where s.budget_id = p_budget_id and s.charged_through < private.charge_horizon(p_budget_id))
$$;

-- R-SUBSCRIPTION-073, R-SUBSCRIPTION-075, R-SUBSCRIPTION-111, R-SUBSCRIPTION-112: create the
-- charges each subscription's watermark has not passed, up to the charge horizon: for every
-- period where the subscription is in force, the dates of the version in force there, at its
-- price, in its category, as expenses awaiting confirmation; then move the watermark. A
-- charge counts towards the transaction limit: when the budget is full, creation stops before
-- the first charge that does not fit, and that subscription and the following ones keep their
-- watermark, so the charges are created once there is room (none is skipped). Caller holds the
-- budget lock and has created the periods. Returns how many charges it created.
create or replace function private.materialise_charges(p_budget_id uuid)
returns integer
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_upto date := private.charge_horizon(p_budget_id);
  v_room integer;
  v_made integer := 0;
  v_inserted integer;
  v_through date;
  v_dates date[];
  v_prices bigint[];
  v_categories uuid[];
  s public.subscriptions;
begin
  if v_upto is null or not private.charges_pending(p_budget_id) then
    return 0;
  end if;
  v_room := private.limit_transactions() - (
    select pg_catalog.count(*) from (select 1 from public.transactions as t where t.budget_id = p_budget_id
                                     limit private.limit_transactions()) as n);
  for s in
    select x.* from public.subscriptions as x
    where x.budget_id = p_budget_id and x.charged_through < v_upto
    order by x.created_at, x.id
  loop
    -- the dates due, in order, each at the terms in force in its period (one query)
    select pg_catalog.array_agg(c.d order by c.d), pg_catalog.array_agg(v.price order by c.d),
           pg_catalog.array_agg(v.category_id order by c.d)
    into v_dates, v_prices, v_categories
    from public.periods as y
    cross join lateral (
      select z.price, z.category_id, z.anchor_date, z.cadence from public.subscription_versions as z
      where z.subscription_id = s.id and z.effective_from_seq <= y.seq
      order by z.effective_from_seq desc limit 1
    ) as v
    cross join lateral private.charge_dates(v.anchor_date, v.cadence,
                                            greatest(y.start_date, s.charged_through + 1), least(y.end_date, v_upto)) as c (d)
    where y.budget_id = p_budget_id and y.end_date > s.charged_through and y.start_date <= v_upto
      and y.seq >= s.first_seq and (s.end_seq is null or y.seq < s.end_seq);
    v_through := v_upto;
    if pg_catalog.cardinality(v_dates) > greatest(v_room, 0) then
      -- the budget is full: stop before the first charge that does not fit
      v_through := v_dates[greatest(v_room, 0) + 1] - 1;
      v_dates := v_dates[1:greatest(v_room, 0)];
    end if;
    if pg_catalog.cardinality(v_dates) > 0 then
      insert into public.transactions (budget_id, kind, amount, date, category_id, subscription_id, charge_date, review_state)
      select p_budget_id, 'expense', u.price, u.d, u.category_id, s.id, u.d, 'awaiting_confirmation'
      from unnest(v_dates, v_prices[1:pg_catalog.cardinality(v_dates)], v_categories[1:pg_catalog.cardinality(v_dates)])
        as u (d, price, category_id)
      on conflict (subscription_id, charge_date) do nothing;
      get diagnostics v_inserted = row_count;
      v_room := v_room - v_inserted;
      v_made := v_made + v_inserted;
    end if;
    update public.subscriptions set charged_through = v_through where id = s.id;
    exit when v_through < v_upto;
  end loop;
  return v_made;
end;
$$;

-- R-PERIOD-008, R-PERIOD-009, R-PERIOD-031, R-SUBSCRIPTION-073, Q-054, D-171: as in step 2,
-- and then the subscription charges due up to today (missed dates included). The fast path,
-- without the lock, now also checks that no subscription is behind, so a read still never
-- waits for a writer when there is nothing to do (R-SECURITY-006). Creating a period applies
-- the debts' interest (trigger periods_apply_debt_interest).
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
  -- Fast path, without the lock: nothing to create, no charge due.
  select p.* into v_last from public.periods as p
  where p.budget_id = p_budget_id order by p.seq desc limit 1;
  select b.end_date into v_end from public.budgets as b where b.id = p_budget_id;
  if v_last.id is null then
    return 0;
  end if;
  if (v_last.end_date >= v_today or (v_end is not null and v_last.end_date >= v_end))
     and not private.charges_pending(p_budget_id) then
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
  perform private.materialise_charges(p_budget_id);
  return v_created;
end;
$$;

-- ===========================================================================
-- Committed amounts (R-SUBSCRIPTION-079, D-110, D-173)
-- ===========================================================================

-- The subscriptions in force in period p_seq with the terms in force then and their monthly
-- cost. The one source of committed amounts (progress rows, period totals and the category
-- overview all read it).
create or replace function private.subscriptions_in_force(p_budget_id uuid, p_seq integer)
returns table (subscription_id uuid, category_id uuid, price bigint, cadence public.subscription_cadence,
               anchor_date date, effective_from_seq integer, monthly_cost bigint)
language sql
stable
set search_path = ''
as $$
  select s.id, v.category_id, v.price, v.cadence, v.anchor_date, v.effective_from_seq,
         private.subscription_monthly_cost(v.price, v.cadence)
  from public.subscriptions as s
  cross join lateral (
    select sv.category_id, sv.price, sv.cadence, sv.anchor_date, sv.effective_from_seq
    from public.subscription_versions as sv
    where sv.subscription_id = s.id and sv.effective_from_seq <= p_seq
    order by sv.effective_from_seq desc
    limit 1
  ) as v
  where s.budget_id = p_budget_id and s.first_seq <= p_seq and (s.end_seq is null or p_seq < s.end_seq)
$$;

-- Step 3's progress rows, now with `committed`: the monthly cost of the subscriptions in force
-- in the period on each leaf (a group adds up its subcategories), shown inside the expected
-- amount, not added to it. A category that is not in force but carries a committed amount gets
-- a row too, like one with transactions (D-147), so the rows always add up to the period's
-- committed total. R-SUBSCRIPTION-079, R-PROGRESS-070, R-PROGRESS-071, R-PROGRESS-090
alter type public.category_progress_row add attribute committed bigint;
comment on type public.category_progress_row is
  'One row of get_period_progress. parent_id null: top level; amount and cadence null: a group, or a category not in force in the period. committed: the monthly cost of the subscriptions on it, inside expected.';

create or replace function private.category_progress(p_budget_id uuid, p_seq integer, p_start date, p_end date)
returns setof public.category_progress_row
language sql
stable
set search_path = ''
as $$
  with e as (select * from private.expectations_in_force(p_budget_id, p_seq)),
  s as (select * from private.spending_between(p_budget_id, p_start, p_end)),
  k as (select x.category_id, pg_catalog.sum(x.monthly_cost)::bigint as committed
        from private.subscriptions_in_force(p_budget_id, p_seq) as x group by x.category_id),
  leaves as (
    select c.id, c.parent_id, c.name, c.sort_order, e.category_id is not null as in_force,
           e.amount, e.cadence, coalesce(e.expected, 0)::bigint as expected,
           coalesce(s.spent, 0)::bigint as spent, coalesce(s.transaction_count, 0) as n,
           coalesce(k.committed, 0)::bigint as committed
    from public.categories as c
    left join e on e.category_id = c.id
    left join s on s.category_id = c.id
    left join k on k.category_id = c.id
    where c.budget_id = p_budget_id and not c.is_group
      and (e.category_id is not null or s.category_id is not null or k.category_id is not null)
  ),
  groups as (
    select g.id, null::uuid as parent_id, g.name, g.sort_order,
           (g.first_seq <= p_seq and (g.end_seq is null or p_seq < g.end_seq)) as in_force,
           null::bigint as amount, null::public.expectation_cadence as cadence,
           coalesce(pg_catalog.sum(l.expected), 0)::bigint as expected,
           coalesce(pg_catalog.sum(l.spent), 0)::bigint as spent,
           coalesce(pg_catalog.sum(l.n), 0)::integer as n,
           coalesce(pg_catalog.sum(l.committed), 0)::bigint as committed
    from public.categories as g
    left join leaves as l on l.parent_id = g.id
    where g.budget_id = p_budget_id and g.is_group
      and ((g.first_seq <= p_seq and (g.end_seq is null or p_seq < g.end_seq)) or l.id is not null)
    group by g.id
  ),
  all_rows as (
    select l.id, l.parent_id, l.name, false as is_group, l.in_force, l.amount, l.cadence,
           l.expected, l.spent, l.n, l.committed, l.sort_order,
           coalesce(p.sort_order, l.sort_order) as top_order, coalesce(p.name, l.name) as top_name
    from leaves as l left join public.categories as p on p.id = l.parent_id
    union all
    select g.id, g.parent_id, g.name, true, g.in_force, g.amount, g.cadence,
           g.expected, g.spent, g.n, g.committed, g.sort_order, g.sort_order, g.name
    from groups as g
  )
  select r.id, r.parent_id, r.name, r.is_group, r.in_force, r.amount, r.cadence,
         r.expected, r.spent, (r.expected - r.spent)::bigint, r.spent > r.expected, r.n,
         (pg_catalog.row_number() over (
            order by r.top_order, r.top_name, coalesce(r.parent_id, r.id), r.parent_id is not null,
                     r.sort_order, r.name, r.id))::integer,
         r.committed
  from all_rows as r
  order by 13
$$;

-- ===========================================================================
-- Categories in use by subscriptions and debts
-- ===========================================================================

-- R-CATEGORY-110: whether a category (or one of its subcategories) is referenced by any
-- subscription version or debt (so it is ended, never deleted), and whether one in force from
-- period p_from on still uses it (so it cannot be ended there).
create or replace function private.category_referenced(p_category_id uuid)
returns boolean
language plpgsql
stable
set search_path = ''
set plan_cache_mode = force_custom_plan
as $$
begin
  return exists (select 1 from public.subscription_versions as v
                 join public.categories as c on c.id = v.category_id
                 where (c.id = p_category_id or c.parent_id = p_category_id))
      or exists (select 1 from public.debts as d
                 join public.categories as c on c.id = d.category_id
                 where (c.id = p_category_id or c.parent_id = p_category_id));
end;
$$;

create or replace function private.category_in_use(p_category_id uuid, p_from integer)
returns boolean
language plpgsql
stable
set search_path = ''
set plan_cache_mode = force_custom_plan
as $$
begin
  return exists (
    select 1
    from public.categories as c
    join public.subscription_versions as v on v.category_id = c.id
    join public.subscriptions as s on s.id = v.subscription_id
    where (c.id = p_category_id or c.parent_id = p_category_id)
      and (s.end_seq is null or s.end_seq > p_from)
      -- the version is in force in some period from p_from on
      and (v.effective_from_seq >= p_from
           or v.effective_from_seq = (select pg_catalog.max(x.effective_from_seq) from public.subscription_versions as x
                                      where x.subscription_id = s.id and x.effective_from_seq <= p_from))
  ) or exists (
    select 1
    from public.categories as c
    join public.debts as d on d.category_id = c.id
    where (c.id = p_category_id or c.parent_id = p_category_id)
      and (d.end_seq is null or d.end_seq > p_from)
  );
end;
$$;

-- ===========================================================================
-- Helpers for the views (each costs one subscription's or debt's rows)
-- ===========================================================================

-- The budget's last tracked day (the latest period's end).
create or replace function private.budget_last_day(p_budget_id uuid)
returns date
language sql
stable
set search_path = ''
as $$
  select p.end_date from public.periods as p where p.budget_id = p_budget_id order by p.seq desc limit 1
$$;

-- R-SUBSCRIPTION-075, R-SUBSCRIPTION-076: a subscription's transactions: its automatic
-- charges, those awaiting confirmation, and all linked ones.
create or replace function private.subscription_charge_counts(p_subscription_id uuid)
returns table (charge_count integer, awaiting_count integer, transaction_count integer)
language plpgsql
stable
set search_path = ''
set plan_cache_mode = force_custom_plan
as $$
begin
  return query
    select (pg_catalog.count(*) filter (where t.charge_date is not null))::integer,
           (pg_catalog.count(*) filter (where t.review_state = 'awaiting_confirmation'))::integer,
           pg_catalog.count(*)::integer
    from public.transactions as t where t.subscription_id = p_subscription_id;
end;
$$;

-- R-DEBT-003, R-DEBT-004: a debt's interest, adjustments and payments, totalled and counted.
create or replace function private.debt_amounts(p_debt_id uuid)
returns table (interest_total bigint, interest_count integer, adjustment_total bigint, adjustment_count integer,
               paid_total bigint, payment_count integer)
language plpgsql
stable
set search_path = ''
set plan_cache_mode = force_custom_plan
as $$
begin
  return query
    select i.total, i.n, a.total, a.n, t.total, t.n
    from (select coalesce(pg_catalog.sum(x.amount), 0)::bigint as total, pg_catalog.count(*)::integer as n
          from public.debt_interest as x where x.debt_id = p_debt_id) as i,
         (select coalesce(pg_catalog.sum(x.amount), 0)::bigint as total, pg_catalog.count(*)::integer as n
          from public.debt_adjustments as x where x.debt_id = p_debt_id) as a,
         (select coalesce(pg_catalog.sum(x.amount), 0)::bigint as total, pg_catalog.count(*)::integer as n
          from public.transactions as x where x.debt_id = p_debt_id) as t;
end;
$$;

-- The end date of the k-th period after the current one (k >= 1), as the schedule projects
-- it: the next period starts the day after the current one ends, each later one on the
-- primary income's actual pay date of the following month (as private.budget_end_date).
create or replace function private.future_period_end(p_budget_id uuid, p_current public.periods, p_k integer)
returns date
language plpgsql
stable
set search_path = ''
as $$
declare
  v_pay_day integer;
  v_rule public.weekend_rule;
  v_next date := p_current.end_date + 1;
  v_month date;
begin
  select t.pay_day, t.weekend_rule into v_pay_day, v_rule
  from public.budgets as b cross join lateral private.terms_at(b.primary_income_id, p_current.seq + 1) as t
  where b.id = p_budget_id;
  if p_k = 1 then
    return private.next_salary_date(v_next, v_pay_day, v_rule) - 1;
  end if;
  v_month := (private.month_paid_by(v_next, v_pay_day, v_rule) + pg_catalog.make_interval(months => p_k - 1))::date;
  return private.next_salary_date(private.month_pay_date(v_month, v_pay_day, v_rule), v_pay_day, v_rule) - 1;
end;
$$;

-- R-DEBT-005, R-DEBT-074, R-DEBT-112, Q-055, D-172: when a debt in force now is expected to be
-- paid off, under the terms in force now. The planned payment still due in the current period
-- (the planned payment minus what was paid in it) is paid first; then every later period adds
-- its interest (one twelfth of the rate on the remaining amount, rounded half up) and receives
-- the planned payment. status: 'paid_off' (nothing remains), 'ends' (payments_left: the
-- planned payments still needed, end_date: the projected end of the period of the last one),
-- 'never' (the planned payment does not exceed one period's interest, or the debt would run
-- beyond the horizon of 600 periods). All null for an ended debt or an ended budget. Always
-- one row.
create or replace function private.debt_projection(p_debt_id uuid)
returns table (status text, payments_left integer, end_date date)
language plpgsql
stable
set search_path = ''
set plan_cache_mode = force_custom_plan
as $$
declare
  v_debt public.debts;
  v_current public.periods;
  v_rate numeric;
  v_payment bigint;
  v_remaining bigint;
  v_paid bigint;
  v_due bigint;
  v_n integer := 0;
  v_interest bigint;
  v_k bigint;
begin
  select d.* into v_debt from public.debts as d where d.id = p_debt_id;
  select p.* into v_current from public.periods as p
  where p.budget_id = v_debt.budget_id and private.today() between p.start_date and p.end_date;
  if v_debt.id is null or v_debt.end_seq is not null or v_current.id is null then
    return query select null::text, null::integer, null::date;
    return;
  end if;
  v_remaining := private.debt_remaining(v_debt.id);
  if v_remaining <= 0 then
    return query select 'paid_off'::text, 0, null::date;
    return;
  end if;
  select v.interest_rate, v.monthly_payment into v_rate, v_payment from public.debt_versions as v
  where v.debt_id = v_debt.id and v.effective_from_seq <= v_current.seq
  order by v.effective_from_seq desc limit 1;
  select coalesce(pg_catalog.sum(t.amount), 0)::bigint into v_paid from public.transactions as t
  where t.debt_id = v_debt.id and t.date between v_current.start_date and v_current.end_date;
  v_due := greatest(v_payment - v_paid, 0);
  if v_due > 0 then
    v_remaining := v_remaining - v_due;
    v_n := 1;
    if v_remaining <= 0 then
      return query select 'ends'::text, v_n, v_current.end_date;
      return;
    end if;
  end if;
  if v_rate = 0 then
    if v_payment = 0 then
      return query select 'never'::text, null::integer, null::date;
      return;
    end if;
    v_k := (v_remaining + v_payment - 1) / v_payment;
    if v_k > private.limit_projection_periods() then
      return query select 'never'::text, null::integer, null::date;
      return;
    end if;
    return query select 'ends'::text, v_n + v_k::integer, private.future_period_end(v_debt.budget_id, v_current, v_k::integer);
    return;
  end if;
  for k in 1..private.limit_projection_periods() loop
    v_interest := private.period_interest(v_remaining, v_rate);
    if v_payment <= v_interest then
      return query select 'never'::text, null::integer, null::date;  -- R-DEBT-074
      return;
    end if;
    v_remaining := v_remaining + v_interest - v_payment;
    if v_remaining <= 0 then
      return query select 'ends'::text, v_n + k, private.future_period_end(v_debt.budget_id, v_current, k);
      return;
    end if;
  end loop;
  return query select 'never'::text, null::integer, null::date;
end;
$$;

-- ===========================================================================
-- Views (security_invoker: the caller's RLS applies)
-- ===========================================================================

-- As in step 3, plus committed_total (R-SUBSCRIPTION-079): the monthly cost of the
-- subscriptions in force in the period, part of expected_total, never added to it.
create or replace view public.period_summaries with (security_invoker = true) as
  select
    p.id,
    p.budget_id,
    p.seq,
    p.start_date,
    p.end_date,
    p.end_is_manual,
    (private.today() between p.start_date and p.end_date) as is_current,
    private.today() as today,
    (a.salary_total + a.extra_income_total) as income_total,
    a.salary_total,
    a.extra_income_total,
    a.expected_total,
    a.spent_total,
    (a.salary_total + a.extra_income_total - a.expected_total) as left_to_assign,
    (a.salary_total + a.extra_income_total - a.spent_total) as result,
    p.revision,
    a.committed_total
  from public.periods as p
  cross join lateral (
    select
      private.salary_total(p.budget_id, p.seq) as salary_total,
      private.extra_income_between(p.budget_id, p.start_date, p.end_date) as extra_income_total,
      coalesce((select pg_catalog.sum(e.expected) from private.expectations_in_force(p.budget_id, p.seq) as e), 0)::bigint
        as expected_total,
      coalesce((select pg_catalog.sum(s.spent) from private.spending_between(p.budget_id, p.start_date, p.end_date) as s), 0)::bigint
        as spent_total,
      coalesce((select pg_catalog.sum(k.monthly_cost) from private.subscriptions_in_force(p.budget_id, p.seq) as k), 0)::bigint
        as committed_total
  ) as a;

-- As in step 3, plus committed_amount (the monthly cost of the subscriptions on it in force
-- now; a group: its subcategories') and in_use (a subscription or debt in force now uses it,
-- so end_category refuses it); removal_deletes also accounts for those references.
-- R-SUBSCRIPTION-079, R-CATEGORY-110
create or replace view public.category_overview with (security_invoker = true) as
  select
    c.id,
    c.budget_id,
    c.parent_id,
    c.name,
    c.sort_order,
    c.is_group,
    (c.end_seq is null and c.first_seq <= private.reading_seq(c.budget_id)) as is_active,
    c.first_seq,
    c.end_seq,
    e.amount,
    e.cadence,
    case when c.is_group then g.monthly_total else private.monthly_share(e.amount, e.cadence) end as monthly_amount,
    e.effective_from_seq as terms_from_seq,
    h.has_transactions,
    (not h.has_transactions and not h.referenced and c.first_seq >= private.reading_seq(c.budget_id)) as removal_deletes,
    c.revision,
    c.created_at,
    c.updated_at,
    k.committed_amount,
    h.in_use
  from public.categories as c
  left join lateral (
    select ce.amount, ce.cadence, ce.effective_from_seq
    from public.category_expectations as ce
    where ce.category_id = c.id
    order by (ce.effective_from_seq <= private.reading_seq(c.budget_id)) desc,
             case when ce.effective_from_seq <= private.reading_seq(c.budget_id)
                  then -ce.effective_from_seq else ce.effective_from_seq end
    limit 1
  ) as e on not c.is_group
  left join lateral (
    select coalesce(pg_catalog.sum(x.expected), 0)::bigint as monthly_total
    from private.expectations_in_force(c.budget_id, private.reading_seq(c.budget_id)) as x
    join public.categories as ch on ch.id = x.category_id
    where ch.parent_id = c.id
  ) as g on c.is_group
  cross join lateral (
    select coalesce(pg_catalog.sum(x.monthly_cost), 0)::bigint as committed_amount
    from private.subscriptions_in_force(c.budget_id, private.reading_seq(c.budget_id)) as x
    join public.categories as cc on cc.id = x.category_id
    where cc.id = c.id or cc.parent_id = c.id
  ) as k
  cross join lateral (
    select private.category_has_transactions(c.id) as has_transactions,
           private.category_referenced(c.id) as referenced,
           private.category_in_use(c.id, private.reading_seq(c.budget_id)) as in_use
  ) as h;

-- R-SUBSCRIPTION-001, R-SUBSCRIPTION-002, R-SUBSCRIPTION-079, R-VERSION-003: subscriptions with
-- the terms in force now (like income_overview), their monthly cost and next charge date.
create view public.subscription_overview with (security_invoker = true) as
  select
    s.id,
    s.budget_id,
    s.name,
    (s.end_seq is null and s.first_seq <= private.reading_seq(s.budget_id)) as is_active,
    s.first_seq,
    s.end_seq,
    v.price,
    v.cadence,
    v.category_id,
    c.name as category_name,
    c.parent_id as parent_category_id,
    pc.name as parent_category_name,
    v.anchor_date,
    private.subscription_monthly_cost(v.price, v.cadence) as monthly_cost,
    v.effective_from_seq as terms_from_seq,
    -- R-SUBSCRIPTION-002: the next scheduled date not yet charged; null once ended, or when
    -- the budget has no current period.
    case when s.end_seq is null and private.today() <= private.budget_last_day(s.budget_id)
      then private.next_charge_date(v.anchor_date, v.cadence, greatest(s.charged_through, private.today() - 1))
    end as next_charge_date,
    s.charged_through,
    n.charge_count,
    n.awaiting_count,
    (n.transaction_count = 0 and s.first_seq >= private.reading_seq(s.budget_id)) as removal_deletes,
    s.revision,
    s.created_at,
    s.updated_at
  from public.subscriptions as s
  join lateral (
    select sv.price, sv.cadence, sv.category_id, sv.anchor_date, sv.effective_from_seq
    from public.subscription_versions as sv
    where sv.subscription_id = s.id
    order by (sv.effective_from_seq <= private.reading_seq(s.budget_id)) desc,
             case when sv.effective_from_seq <= private.reading_seq(s.budget_id)
                  then -sv.effective_from_seq else sv.effective_from_seq end
    limit 1
  ) as v on true
  left join public.categories as c on c.id = v.category_id
  left join public.categories as pc on pc.id = c.parent_id
  cross join lateral (select * from private.subscription_charge_counts(s.id)) as n;

-- R-DEBT-001 to R-DEBT-005, R-DEBT-074, R-VERSION-004: debts with the terms in force now, their
-- amounts and the payoff projection.
create view public.debt_overview with (security_invoker = true) as
  select
    d.id,
    d.budget_id,
    d.name,
    d.category_id,
    c.name as category_name,
    c.parent_id as parent_category_id,
    pc.name as parent_category_name,
    d.principal,
    d.opened_on,
    (d.end_seq is null and d.first_seq <= private.reading_seq(d.budget_id)) as is_active,
    d.first_seq,
    d.end_seq,
    v.interest_rate,
    v.monthly_payment,
    v.effective_from_seq as terms_from_seq,
    a.interest_total,
    a.adjustment_total,
    a.paid_total,
    (d.principal + a.interest_total + a.adjustment_total - a.paid_total) as remaining,
    pr.status as payoff,
    pr.payments_left,
    pr.end_date as expected_end_date,
    (a.interest_count > 0 or a.adjustment_count > 0 or a.payment_count > 0) as has_history,
    (a.adjustment_count = 0 and a.payment_count = 0 and a.interest_count = 0
     and d.first_seq >= private.reading_seq(d.budget_id)) as removal_deletes,
    d.revision,
    d.created_at,
    d.updated_at
  from public.debts as d
  join lateral (
    select dv.interest_rate, dv.monthly_payment, dv.effective_from_seq
    from public.debt_versions as dv
    where dv.debt_id = d.id
    order by (dv.effective_from_seq <= private.reading_seq(d.budget_id)) desc,
             case when dv.effective_from_seq <= private.reading_seq(d.budget_id)
                  then -dv.effective_from_seq else dv.effective_from_seq end
    limit 1
  ) as v on true
  left join public.categories as c on c.id = d.category_id
  left join public.categories as pc on pc.id = c.parent_id
  cross join lateral (select * from private.debt_amounts(d.id)) as a
  cross join lateral (select * from private.debt_projection(d.id)) as pr;

-- As in step 3, plus the links and the charge columns (R-TRANSACTION-003, R-SUBSCRIPTION-075):
-- subscription_id and its name, debt_id and its name, charge_date (an automatic charge's
-- scheduled date; null for a transaction a member recorded), review_state.
create or replace view public.transaction_list with (security_invoker = true) as
  select
    t.id,
    t.budget_id,
    t.kind,
    t.amount,
    t.date,
    p.id as period_id,
    t.category_id,
    c.name as category_name,
    c.parent_id as parent_category_id,
    pc.name as parent_category_name,
    t.description,
    t.recorded_by,
    private.recorder_name(t.budget_id, t.recorded_by) as recorded_by_name,
    t.revision,
    t.created_at,
    t.updated_at,
    t.subscription_id,
    s.name as subscription_name,
    t.debt_id,
    d.name as debt_name,
    t.charge_date,
    t.review_state
  from public.transactions as t
  left join public.categories as c on c.id = t.category_id
  left join public.categories as pc on pc.id = c.parent_id
  left join public.subscriptions as s on s.id = t.subscription_id
  left join public.debts as d on d.id = t.debt_id
  -- the period containing the date: the latest one starting on or before it (index lookup)
  left join lateral (
    select pp.id, pp.end_date from public.periods as pp
    where pp.budget_id = t.budget_id and pp.start_date <= t.date
    order by pp.start_date desc
    limit 1
  ) as p on t.date <= p.end_date;

-- ===========================================================================
-- Reopen preview: also the interest a merge removes (R-PERIOD-035, R-DEBT-113)
-- ===========================================================================

-- As in step 2, plus one row per debt whose interest entry of the merged period the merge
-- removes (change 'interest_removed'). Subscriptions and debts, and their terms, are reported
-- by the registry like incomes and categories.
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
  return query
    select 'debt'::text, d.id, d.name, 'interest_removed'::text, false
    from public.debt_interest as i
    join public.periods as p on p.id = i.period_id
    join public.debts as d on d.id = i.debt_id
    where i.budget_id = p_budget_id and p.seq = p_from
    order by d.name;
end;
$$;

-- ===========================================================================
-- Internal helpers for the RPCs
-- ===========================================================================

-- Lock the budget of a subscription, catch up, and return the subscription read after the
-- lock; subscription_not_found unless it exists and the caller is a member. (R-SECURITY-004)
create or replace function private.lock_subscription(p_subscription_id uuid)
returns public.subscriptions
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_budget_id uuid;
  v_subscription public.subscriptions;
begin
  select s.budget_id into v_budget_id from public.subscriptions as s where s.id = p_subscription_id;
  if v_budget_id is null or not private.is_budget_member(v_budget_id) then
    raise exception 'subscription_not_found' using errcode = 'P0001';
  end if;
  perform private.lock_and_catch_up(v_budget_id);
  select s.* into v_subscription from public.subscriptions as s where s.id = p_subscription_id;
  if v_subscription.id is null then
    raise exception 'subscription_not_found' using errcode = 'P0001';
  end if;
  return v_subscription;
end;
$$;

-- The same for a debt.
create or replace function private.lock_debt(p_debt_id uuid)
returns public.debts
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_budget_id uuid;
  v_debt public.debts;
begin
  select d.budget_id into v_budget_id from public.debts as d where d.id = p_debt_id;
  if v_budget_id is null or not private.is_budget_member(v_budget_id) then
    raise exception 'debt_not_found' using errcode = 'P0001';
  end if;
  perform private.lock_and_catch_up(v_budget_id);
  select d.* into v_debt from public.debts as d where d.id = p_debt_id;
  if v_debt.id is null then
    raise exception 'debt_not_found' using errcode = 'P0001';
  end if;
  return v_debt;
end;
$$;

-- R-SUBSCRIPTION-001, R-SUBSCRIPTION-070, R-SUBSCRIPTION-110
create or replace function private.assert_subscription_terms(p_price bigint, p_cadence public.subscription_cadence)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_price is null or p_price < 1 or p_price > private.limit_transaction_amount() then
    raise exception 'invalid_amount' using errcode = 'P0001';
  end if;
  if p_cadence is null then
    raise exception 'invalid_cadence' using errcode = 'P0001';
  end if;
end;
$$;

-- A schedule date: a valid date at most ten years ahead, and after p_after when given.
create or replace function private.assert_schedule_date(p_date date, p_after date)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if not private.is_sane_date(p_date) or p_date > private.today() + private.limit_schedule_days_ahead()
     or (p_after is not null and p_date <= p_after) then
    raise exception 'invalid_charge_date' using errcode = 'P0001';
  end if;
end;
$$;

-- R-SUBSCRIPTION-110: room for p_new more subscriptions: 50 in force and 200 in all, void
-- rows not counted.
create or replace function private.assert_subscription_room(p_budget_id uuid, p_new integer)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if (select pg_catalog.count(*) from public.subscriptions as s where s.budget_id = p_budget_id and s.end_seq is null)
       + p_new > private.limit_active_subscriptions()
     or (select pg_catalog.count(*) from public.subscriptions as s
         where s.budget_id = p_budget_id and (s.end_seq is null or s.end_seq > s.first_seq))
       + p_new > private.limit_total_subscriptions() then
    raise exception 'subscription_limit_reached' using errcode = 'P0001';
  end if;
end;
$$;

-- R-DEBT-002, R-DEBT-110
create or replace function private.assert_debt_terms(p_interest_rate numeric, p_monthly_payment bigint)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_interest_rate is null or p_interest_rate < 0 or p_interest_rate > private.limit_interest_rate()
     or p_interest_rate <> pg_catalog.round(p_interest_rate, 3) then
    raise exception 'invalid_interest_rate' using errcode = 'P0001';
  end if;
  if p_monthly_payment is null or p_monthly_payment < 0 or p_monthly_payment > private.limit_transaction_amount() then
    raise exception 'invalid_amount' using errcode = 'P0001';
  end if;
end;
$$;

-- R-DEBT-110: room for p_new more debts: 50 in force and 200 in all, void rows not counted.
create or replace function private.assert_debt_room(p_budget_id uuid, p_new integer)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if (select pg_catalog.count(*) from public.debts as d where d.budget_id = p_budget_id and d.end_seq is null)
       + p_new > private.limit_active_debts()
     or (select pg_catalog.count(*) from public.debts as d
         where d.budget_id = p_budget_id and (d.end_seq is null or d.end_seq > d.first_seq))
       + p_new > private.limit_total_debts() then
    raise exception 'debt_limit_reached' using errcode = 'P0001';
  end if;
end;
$$;

-- R-TRANSACTION-003, R-TRANSACTION-110, R-DEBT-071: the link a transaction of kind p_kind in
-- category p_category_id, dated in period p_seq, may carry: at most one of a debt or a
-- subscription of the same budget; a linked transaction is an expense; a debt payment is in
-- the debt's category; the debt or subscription is in force in the period of the date.
-- p_kept: the transaction already has this link and keeps its period and category, so it may
-- keep the link even when the debt or subscription has ended since or the debt's category
-- changed (as for categories, R-TRANSACTION-100).
create or replace function private.assert_transaction_link(
  p_budget_id uuid,
  p_kind public.transaction_kind,
  p_category_id uuid,
  p_seq integer,
  p_debt_id uuid,
  p_subscription_id uuid,
  p_kept boolean default false
)
returns void
language plpgsql
stable
set search_path = ''
as $$
declare
  v_debt public.debts;
  v_subscription public.subscriptions;
begin
  if p_debt_id is null and p_subscription_id is null then
    return;
  end if;
  if p_debt_id is not null and p_subscription_id is not null then
    raise exception 'invalid_link' using errcode = 'P0001';
  end if;
  if p_kind is distinct from 'expense' then
    raise exception 'invalid_link' using errcode = 'P0001';
  end if;
  if p_debt_id is not null then
    select d.* into v_debt from public.debts as d where d.id = p_debt_id and d.budget_id = p_budget_id;
    if v_debt.id is null then
      raise exception 'debt_not_found' using errcode = 'P0001';
    end if;
    if not p_kept then
      if not (v_debt.first_seq <= p_seq and (v_debt.end_seq is null or p_seq < v_debt.end_seq)) then
        raise exception 'debt_not_in_force' using errcode = 'P0001';
      end if;
      if p_category_id is distinct from v_debt.category_id then
        raise exception 'invalid_link' using errcode = 'P0001';
      end if;
    end if;
  else
    select s.* into v_subscription from public.subscriptions as s
    where s.id = p_subscription_id and s.budget_id = p_budget_id;
    if v_subscription.id is null then
      raise exception 'subscription_not_found' using errcode = 'P0001';
    end if;
    if not p_kept and not (v_subscription.first_seq <= p_seq
                           and (v_subscription.end_seq is null or p_seq < v_subscription.end_seq)) then
      raise exception 'subscription_not_in_force' using errcode = 'P0001';
    end if;
  end if;
end;
$$;

-- ===========================================================================
-- RPCs: step 3 categories, with subscriptions and debts on them (R-CATEGORY-110)
-- ===========================================================================

-- As in step 3; subscriptions and debts on the parent also make the first subcategory move
-- what the parent held to "Other" (they move with its transactions), so nothing ever charges
-- or pays into a group.
-- R-CATEGORY-001, R-CATEGORY-002, R-CATEGORY-003, R-CATEGORY-004, R-CATEGORY-090,
-- R-CATEGORY-092, R-CATEGORY-093, R-CATEGORY-094, R-TRANSACTION-072, R-CATEGORY-110
create or replace function public.create_category(
  p_budget_id uuid,
  p_name text,
  p_parent_id uuid default null,
  p_amount bigint default 0,
  p_cadence public.expectation_cadence default 'monthly',
  p_from_period_id uuid default null,
  p_other_name text default null
)
returns setof public.category_overview
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_name text;
  v_other_name text;
  v_seq integer;
  v_parent public.categories;
  v_needs_other boolean := false;
  v_sort integer;
  v_id uuid;
  v_other_id uuid;
begin
  perform private.assert_member(p_budget_id);
  v_name := private.clean_name(p_name);
  perform private.assert_expectation(p_amount, p_cadence);
  perform private.lock_and_catch_up(p_budget_id);
  if p_from_period_id is not null then
    v_seq := private.period_seq(p_budget_id, p_from_period_id);
  else
    v_seq := private.current_seq(p_budget_id);
  end if;

  if p_parent_id is not null then
    select c.* into v_parent from public.categories as c
    where c.id = p_parent_id and c.budget_id = p_budget_id;
    if v_parent.id is null then
      raise exception 'category_not_found' using errcode = 'P0001';
    end if;
    if v_parent.parent_id is not null then
      raise exception 'invalid_parent' using errcode = 'P0001';
    end if;
    if v_parent.end_seq is not null then
      raise exception 'category_ended' using errcode = 'P0001';
    end if;
    if v_seq < v_parent.first_seq then
      raise exception 'invalid_period' using errcode = 'P0001';
    end if;
    if not v_parent.is_group then
      v_needs_other :=
        exists (select 1 from public.transactions as t where t.category_id = v_parent.id)
        or exists (select 1 from public.category_expectations as e where e.category_id = v_parent.id and e.amount > 0)
        or private.category_referenced(v_parent.id);
      if v_needs_other then
        if p_other_name is null then
          raise exception 'other_name_required' using errcode = 'P0001';
        end if;
        v_other_name := private.clean_name(p_other_name);
      end if;
    end if;
  end if;

  perform private.assert_category_room(p_budget_id, 1 + v_needs_other::integer);

  select coalesce(pg_catalog.max(c.sort_order), 0) + 1 into v_sort from public.categories as c
  where c.budget_id = p_budget_id and c.parent_id is not distinct from p_parent_id;

  if v_parent.id is not null and not v_parent.is_group then
    update public.categories set is_group = true where id = v_parent.id;
    if v_needs_other then
      insert into public.categories (budget_id, parent_id, name, sort_order, first_seq)
      values (p_budget_id, v_parent.id, v_other_name, v_sort + 1, v_parent.first_seq)
      returning id into v_other_id;
      update public.category_expectations set category_id = v_other_id where category_id = v_parent.id;
      update public.transactions set category_id = v_other_id where category_id = v_parent.id;
      update public.subscription_versions set category_id = v_other_id where category_id = v_parent.id;
      update public.debts set category_id = v_other_id where category_id = v_parent.id;
    else
      delete from public.category_expectations where category_id = v_parent.id;
    end if;
  end if;

  insert into public.categories (budget_id, parent_id, name, sort_order, first_seq)
  values (p_budget_id, p_parent_id, v_name, v_sort, v_seq)
  returning id into v_id;
  insert into public.category_expectations (category_id, budget_id, effective_from_seq, amount, cadence)
  values (v_id, p_budget_id, v_seq, p_amount, p_cadence);
  return query select * from public.category_overview as o where o.id = v_id;
end;
$$;

-- As in step 3, except that a category a subscription or debt in force from that period still
-- uses cannot be removed (category_in_use: end or move them first), and one any subscription
-- or debt references is ended (kept), never deleted, like one with transactions.
-- R-CATEGORY-072, R-CATEGORY-073, R-CATEGORY-095, R-CATEGORY-110, R-CONCURRENCY-070
create or replace function public.end_category(
  p_category_id uuid,
  p_expected_revision integer,
  p_from_period_id uuid default null
)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_category public.categories;
  v_seq integer;
  v_end integer;
  r record;
begin
  v_category := private.lock_category(p_category_id);
  perform private.assert_revision(v_category.revision, p_expected_revision);
  if p_from_period_id is null then
    v_seq := private.current_seq(v_category.budget_id);
  else
    v_seq := private.period_seq(v_category.budget_id, p_from_period_id);
  end if;
  if v_category.end_seq is not null and v_seq >= v_category.end_seq then
    raise exception 'category_ended' using errcode = 'P0001';
  end if;
  if private.category_in_use(v_category.id, v_seq) then
    raise exception 'category_in_use' using errcode = 'P0001';
  end if;

  if v_seq <= v_category.first_seq and not private.category_has_transactions(v_category.id)
     and not private.category_referenced(v_category.id) then
    delete from public.categories where id = v_category.id;  -- its subcategories cascade
    return 'deleted';
  end if;

  v_end := greatest(v_seq, v_category.first_seq);
  for r in
    select c.id, c.first_seq,
           exists (select 1 from public.transactions as t where t.category_id = c.id)
             or exists (select 1 from public.subscription_versions as v where v.category_id = c.id)
             or exists (select 1 from public.debts as d where d.category_id = c.id) as kept
    from public.categories as c
    where c.parent_id = v_category.id and (c.end_seq is null or c.end_seq > v_end)
  loop
    if v_end > r.first_seq then
      update public.categories set end_seq = v_end where id = r.id;
    elsif r.kept then
      delete from public.category_expectations as e
      where e.category_id = r.id and e.effective_from_seq > (
        select pg_catalog.min(x.effective_from_seq) from public.category_expectations as x where x.category_id = r.id);
      update public.category_expectations set effective_from_seq = v_end where category_id = r.id;
      update public.categories set first_seq = v_end, end_seq = v_end where id = r.id;
    else
      delete from public.categories where id = r.id;
    end if;
  end loop;
  update public.categories set end_seq = v_end where id = v_category.id;
  delete from public.category_expectations as e
  using public.categories as c
  where c.id = e.category_id and (c.id = v_category.id or c.parent_id = v_category.id)
    and c.end_seq is not null and e.effective_from_seq >= c.end_seq and e.effective_from_seq > c.first_seq;
  return 'ended';
end;
$$;

-- ===========================================================================
-- RPCs: transactions, with links (R-TRANSACTION-003, R-DEBT-071)
-- ===========================================================================

-- As in step 3, with an optional link: p_debt_id (a payment: an expense in the debt's
-- category) or p_subscription_id (a charge recorded by hand), each of this budget and in force
-- in the period of the date. Charges created automatically count towards the same limit.
-- R-TRANSACTION-001, R-TRANSACTION-002, R-TRANSACTION-003, R-TRANSACTION-006,
-- R-TRANSACTION-007, R-TRANSACTION-008, R-TRANSACTION-070, R-TRANSACTION-072,
-- R-TRANSACTION-073, R-TRANSACTION-090, R-TRANSACTION-091, R-TRANSACTION-092,
-- R-TRANSACTION-094, R-TRANSACTION-110, R-DEBT-071
drop function public.add_transaction(uuid, public.transaction_kind, bigint, date, uuid, text);
create function public.add_transaction(
  p_budget_id uuid,
  p_kind public.transaction_kind,
  p_amount bigint,
  p_date date,
  p_category_id uuid default null,
  p_description text default null,
  p_debt_id uuid default null,
  p_subscription_id uuid default null
)
returns setof public.transaction_list
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_description text;
  v_seq integer;
  v_id uuid;
begin
  perform private.assert_member(p_budget_id);
  perform private.assert_transaction_amount(p_kind, p_amount);
  v_description := private.clean_description(p_description);
  perform private.lock_and_catch_up(p_budget_id);
  v_seq := private.transaction_period_seq(p_budget_id, p_date);
  perform private.assert_transaction_category(p_budget_id, p_kind, p_category_id, v_seq);
  perform private.assert_transaction_link(p_budget_id, p_kind, p_category_id, v_seq, p_debt_id, p_subscription_id);
  if (select pg_catalog.count(*) from (
        select 1 from public.transactions as t where t.budget_id = p_budget_id
        limit private.limit_transactions()) as n) >= private.limit_transactions() then
    raise exception 'transaction_limit_reached' using errcode = 'P0001';
  end if;
  insert into public.transactions (budget_id, kind, amount, date, category_id, description, recorded_by, debt_id, subscription_id)
  values (p_budget_id, p_kind, p_amount, p_date, p_category_id, v_description, (select auth.uid()), p_debt_id, p_subscription_id)
  returning id into v_id;
  return query select * from public.transaction_list as l where l.id = v_id;
end;
$$;

-- As in step 3; the link is kept (change it with link_transaction). A linked transaction stays
-- an expense, and a debt payment moved to another category or period must still satisfy its
-- link (invalid_link, debt_not_in_force, subscription_not_in_force). An automatic charge keeps
-- its charge_date and review state.
-- R-TRANSACTION-008, R-TRANSACTION-091, R-TRANSACTION-100, R-TRANSACTION-110,
-- R-SUBSCRIPTION-074, R-CONCURRENCY-070
create or replace function public.update_transaction(
  p_transaction_id uuid,
  p_expected_revision integer,
  p_kind public.transaction_kind,
  p_amount bigint,
  p_date date,
  p_category_id uuid default null,
  p_description text default null
)
returns setof public.transaction_list
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_transaction public.transactions;
  v_description text;
  v_seq integer;
  v_same_period boolean;
begin
  perform private.assert_transaction_amount(p_kind, p_amount);
  v_description := private.clean_description(p_description);
  v_transaction := private.lock_transaction(p_transaction_id);
  perform private.assert_revision(v_transaction.revision, p_expected_revision);
  v_seq := private.transaction_period_seq(v_transaction.budget_id, p_date);
  v_same_period := v_seq = (
    select p.seq from public.periods as p
    where p.budget_id = v_transaction.budget_id and v_transaction.date between p.start_date and p.end_date);
  perform private.assert_transaction_category(v_transaction.budget_id, p_kind, p_category_id, v_seq,
    p_category_id is not distinct from v_transaction.category_id and v_same_period);
  perform private.assert_transaction_link(v_transaction.budget_id, p_kind, p_category_id, v_seq,
    v_transaction.debt_id, v_transaction.subscription_id,
    p_category_id is not distinct from v_transaction.category_id and v_same_period);
  update public.transactions
  set kind = p_kind, amount = p_amount, date = p_date, category_id = p_category_id, description = v_description
  where id = v_transaction.id;
  return query select * from public.transaction_list as l where l.id = v_transaction.id;
end;
$$;

-- Link a transaction to a debt (a payment) or to a subscription, or unlink it (both null).
-- Unlinking or relinking an automatic charge makes it an ordinary confirmed transaction (it
-- is never created again: the subscription's watermark has passed its date). Returns the
-- transaction. R-TRANSACTION-003, R-TRANSACTION-110, R-DEBT-071, R-CONCURRENCY-070
create or replace function public.link_transaction(
  p_transaction_id uuid,
  p_expected_revision integer,
  p_debt_id uuid default null,
  p_subscription_id uuid default null
)
returns setof public.transaction_list
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_transaction public.transactions;
  v_seq integer;
begin
  v_transaction := private.lock_transaction(p_transaction_id);
  perform private.assert_revision(v_transaction.revision, p_expected_revision);
  select p.seq into v_seq from public.periods as p
  where p.budget_id = v_transaction.budget_id and v_transaction.date between p.start_date and p.end_date;
  perform private.assert_transaction_link(v_transaction.budget_id, v_transaction.kind, v_transaction.category_id, v_seq,
    p_debt_id, p_subscription_id,
    p_debt_id is not distinct from v_transaction.debt_id and p_subscription_id is not distinct from v_transaction.subscription_id);
  update public.transactions
  set debt_id = p_debt_id,
      subscription_id = p_subscription_id,
      charge_date = case when p_subscription_id is not distinct from subscription_id then charge_date end,
      review_state = case when p_subscription_id is not distinct from subscription_id then review_state else 'confirmed' end
  where id = v_transaction.id;
  return query select * from public.transaction_list as l where l.id = v_transaction.id;
end;
$$;

-- ===========================================================================
-- RPCs: subscriptions
-- ===========================================================================

-- R-SUBSCRIPTION-071: the next p_count charge dates of a schedule on or after p_from (default:
-- the first charge date), for forms. Pure. Errors: invalid_charge_date, invalid_cadence,
-- invalid_limit (1 to 60).
create or replace function public.subscription_charge_dates(
  p_first_charge_date date,
  p_cadence public.subscription_cadence,
  p_from date default null,
  p_count integer default 12
)
returns setof date
language plpgsql
immutable
security definer
set search_path = ''
as $$
declare
  v_from date := coalesce(p_from, p_first_charge_date);
begin
  if not private.is_sane_date(p_first_charge_date) or not private.is_sane_date(v_from)
     or greatest(v_from, p_first_charge_date) > date '2900-01-01' then
    raise exception 'invalid_charge_date' using errcode = 'P0001';
  end if;
  if p_cadence is null then
    raise exception 'invalid_cadence' using errcode = 'P0001';
  end if;
  if p_count is null or p_count not between 1 and 60 then
    raise exception 'invalid_limit' using errcode = 'P0001';
  end if;
  return query
    select d from private.charge_dates(p_first_charge_date, p_cadence, v_from,
                                       (greatest(v_from, p_first_charge_date) + pg_catalog.make_interval(months => 12 * p_count + 1))::date) as d
    limit p_count;
end;
$$;

-- Create a subscription with its terms: p_price (charged in full on each charge date),
-- p_cadence, p_category_id (a leaf in force in its first period) and p_first_charge_date
-- (charges then repeat on that day of the month, clamped to each month's length; it may lie
-- in the past or the future). In force from the current period, or, as an explicit correction,
-- from an earlier period p_from_period_id. Its charges due from the start of its first period
-- up to today are created at once, awaiting confirmation. Returns the subscription.
-- R-SUBSCRIPTION-001, R-SUBSCRIPTION-070, R-SUBSCRIPTION-071, R-SUBSCRIPTION-073,
-- R-SUBSCRIPTION-110, R-SUBSCRIPTION-112
create or replace function public.create_subscription(
  p_budget_id uuid,
  p_name text,
  p_price bigint,
  p_cadence public.subscription_cadence,
  p_category_id uuid,
  p_first_charge_date date,
  p_from_period_id uuid default null
)
returns setof public.subscription_overview
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_name text;
  v_seq integer;
  v_start date;
  v_id uuid;
begin
  perform private.assert_member(p_budget_id);
  v_name := private.clean_name(p_name);
  perform private.assert_subscription_terms(p_price, p_cadence);
  perform private.assert_schedule_date(p_first_charge_date, null);
  perform private.lock_and_catch_up(p_budget_id);
  if p_from_period_id is not null then
    v_seq := private.period_seq(p_budget_id, p_from_period_id);  -- a correction (D-158)
  else
    v_seq := private.current_seq(p_budget_id);
  end if;
  perform private.assert_transaction_category(p_budget_id, 'expense', p_category_id, v_seq);
  perform private.assert_subscription_room(p_budget_id, 1);
  select p.start_date into v_start from public.periods as p where p.budget_id = p_budget_id and p.seq = v_seq;
  insert into public.subscriptions (budget_id, name, first_seq, charged_through)
  values (p_budget_id, v_name, v_seq, v_start - 1)
  returning id into v_id;
  insert into public.subscription_versions (subscription_id, budget_id, effective_from_seq, price, cadence, category_id, anchor_date)
  values (v_id, p_budget_id, v_seq, p_price, p_cadence, p_category_id, p_first_charge_date);
  perform private.materialise_charges(p_budget_id);
  return query select * from public.subscription_overview as o where o.id = v_id;
end;
$$;

-- Rename a subscription (p_name) and/or change its terms: p_price, p_cadence, p_category_id,
-- p_next_charge_date (each omitted keeps the value in force there). New terms apply from the
-- current period; past periods keep theirs; a second change in the same period replaces the
-- first; with p_from_period_id, an explicit correction from that period until the next
-- existing change. Charges already created never change, and no charge is created for a date
-- already passed. The schedule (D-170): p_next_charge_date (after today) is the next charge's
-- date, and later ones follow from it at the cadence; a new cadence without a date continues
-- from the next charge date of the current schedule; otherwise the schedule is unchanged.
-- R-VERSION-003, R-VERSION-005, R-VERSION-006, R-VERSION-012, R-SUBSCRIPTION-111,
-- R-CONCURRENCY-070
create or replace function public.update_subscription(
  p_subscription_id uuid,
  p_expected_revision integer,
  p_name text default null,
  p_price bigint default null,
  p_cadence public.subscription_cadence default null,
  p_category_id uuid default null,
  p_next_charge_date date default null,
  p_from_period_id uuid default null
)
returns setof public.subscription_overview
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_subscription public.subscriptions;
  v_name text;
  v_seq integer;
  v_old public.subscription_versions;
  v_price bigint;
  v_cadence public.subscription_cadence;
  v_category uuid;
  v_anchor date;
begin
  if p_name is not null then
    v_name := private.clean_name(p_name);
  end if;
  v_subscription := private.lock_subscription(p_subscription_id);
  perform private.assert_revision(v_subscription.revision, p_expected_revision);
  if num_nonnulls(p_price, p_cadence, p_category_id, p_next_charge_date) > 0 then
    if p_from_period_id is null then
      if v_subscription.end_seq is not null then
        raise exception 'subscription_ended' using errcode = 'P0001';
      end if;
      v_seq := greatest(private.current_seq(v_subscription.budget_id), v_subscription.first_seq);
    else
      v_seq := private.period_seq(v_subscription.budget_id, p_from_period_id);
      if v_seq < v_subscription.first_seq then
        raise exception 'invalid_period' using errcode = 'P0001';
      end if;
      if v_subscription.end_seq is not null and v_seq >= v_subscription.end_seq then
        raise exception 'subscription_ended' using errcode = 'P0001';
      end if;
    end if;
    select v.* into v_old from public.subscription_versions as v
    where v.subscription_id = v_subscription.id and v.effective_from_seq <= v_seq
    order by v.effective_from_seq desc limit 1;
    v_price := coalesce(p_price, v_old.price);
    v_cadence := coalesce(p_cadence, v_old.cadence);
    v_category := coalesce(p_category_id, v_old.category_id);
    perform private.assert_subscription_terms(v_price, v_cadence);
    if p_next_charge_date is not null then
      -- from now: the next charge is after today; a correction may name any date
      perform private.assert_schedule_date(p_next_charge_date,
        case when p_from_period_id is null then private.today() end);
      v_anchor := p_next_charge_date;
    elsif v_cadence <> v_old.cadence and p_from_period_id is null then
      v_anchor := private.next_charge_date(v_old.anchor_date, v_old.cadence,
                                           greatest(v_subscription.charged_through, private.today()));
    else
      v_anchor := v_old.anchor_date;
    end if;
    if v_category is distinct from v_old.category_id then
      perform private.assert_transaction_category(v_subscription.budget_id, 'expense', v_category, v_seq);
    end if;
    insert into public.subscription_versions (subscription_id, budget_id, effective_from_seq, price, cadence, category_id, anchor_date)
    values (v_subscription.id, v_subscription.budget_id, v_seq, v_price, v_cadence, v_category, v_anchor)
    on conflict (subscription_id, effective_from_seq) do update
      set price = excluded.price, cadence = excluded.cadence, category_id = excluded.category_id,
          anchor_date = excluded.anchor_date;
    update public.subscriptions set name = coalesce(v_name, name), revision = revision + 1
    where id = v_subscription.id;
    perform private.materialise_charges(v_subscription.budget_id);
  elsif p_from_period_id is not null then
    raise exception 'invalid_period' using errcode = 'P0001';
  elsif v_name is not null then
    update public.subscriptions set name = v_name where id = v_subscription.id;
  end if;
  return query select * from public.subscription_overview as o where o.id = v_subscription.id;
end;
$$;

-- End a subscription from the current period, or, as an explicit correction, from an earlier
-- one: no charge is created from then on. One that never counted before that period and has
-- no transactions is deleted; otherwise it ends there and keeps its charges (a row whose
-- charges would otherwise lose it is kept void). Returns 'deleted' or 'ended'.
-- R-SUBSCRIPTION-001, R-SUBSCRIPTION-113, R-CONCURRENCY-070
create or replace function public.end_subscription(
  p_subscription_id uuid,
  p_expected_revision integer,
  p_from_period_id uuid default null
)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_subscription public.subscriptions;
  v_seq integer;
  v_end integer;
begin
  v_subscription := private.lock_subscription(p_subscription_id);
  perform private.assert_revision(v_subscription.revision, p_expected_revision);
  if p_from_period_id is null then
    v_seq := private.current_seq(v_subscription.budget_id);
  else
    v_seq := private.period_seq(v_subscription.budget_id, p_from_period_id);
  end if;
  if v_subscription.end_seq is not null and v_seq >= v_subscription.end_seq then
    raise exception 'subscription_ended' using errcode = 'P0001';
  end if;
  if v_seq <= v_subscription.first_seq
     and not exists (select 1 from public.transactions as t where t.subscription_id = v_subscription.id) then
    delete from public.subscriptions where id = v_subscription.id;
    return 'deleted';
  end if;
  v_end := greatest(v_seq, v_subscription.first_seq);
  update public.subscriptions set end_seq = v_end where id = v_subscription.id;
  delete from public.subscription_versions as v
  where v.subscription_id = v_subscription.id and v.effective_from_seq >= v_end
    and v.effective_from_seq > v_subscription.first_seq;
  return 'ended';
end;
$$;

-- R-SUBSCRIPTION-075, R-SUBSCRIPTION-076: a member confirms that an automatic charge went
-- through. Already confirmed: nothing changes. Returns the transaction.
create or replace function public.confirm_subscription_charge(p_transaction_id uuid, p_expected_revision integer)
returns setof public.transaction_list
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_transaction public.transactions;
begin
  v_transaction := private.lock_transaction(p_transaction_id);
  perform private.assert_revision(v_transaction.revision, p_expected_revision);
  if v_transaction.charge_date is null then
    raise exception 'not_a_charge' using errcode = 'P0001';
  end if;
  update public.transactions set review_state = 'confirmed'
  where id = v_transaction.id and review_state <> 'confirmed';
  return query select * from public.transaction_list as l where l.id = v_transaction.id;
end;
$$;

-- R-SUBSCRIPTION-077: a member answers that an automatic charge did not go through: its
-- transaction is removed, and it is never created again for that date.
create or replace function public.dismiss_subscription_charge(p_transaction_id uuid, p_expected_revision integer)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_transaction public.transactions;
begin
  v_transaction := private.lock_transaction(p_transaction_id);
  perform private.assert_revision(v_transaction.revision, p_expected_revision);
  if v_transaction.charge_date is null then
    raise exception 'not_a_charge' using errcode = 'P0001';
  end if;
  delete from public.transactions where id = v_transaction.id;
end;
$$;

-- R-SUBSCRIPTION-076: the automatic charges awaiting confirmation, oldest first, at most
-- p_limit (1 to 200). Like get_current_period, it first catches up (periods and charges).
create or replace function public.list_charges_awaiting_confirmation(p_budget_id uuid, p_limit integer default 50)
returns setof public.transaction_list
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.assert_member(p_budget_id);
  if p_limit is null or p_limit not between 1 and private.limit_page_size() then
    raise exception 'invalid_limit' using errcode = 'P0001';
  end if;
  perform private.ensure_periods(p_budget_id);
  return query
    select l.* from public.transaction_list as l
    where l.budget_id = p_budget_id and l.review_state = 'awaiting_confirmation'
    order by l.date, l.created_at, l.id
    limit p_limit;
end;
$$;

-- ===========================================================================
-- RPCs: debts
-- ===========================================================================

-- Record a debt: p_principal (what is owed now), p_category_id (a leaf in force in its first
-- period: payments are expenses there), p_monthly_payment (planned per period; 0: none) and
-- p_interest_rate (yearly, in percent, up to three decimals; omitted or 0: none). In force
-- from the current period, or, as an explicit correction, from an earlier one (its history
-- then starts at that period's start; no interest is added for periods that already exist).
-- Returns the debt. R-DEBT-001, R-DEBT-002, R-DEBT-070, R-DEBT-110
create or replace function public.create_debt(
  p_budget_id uuid,
  p_name text,
  p_principal bigint,
  p_category_id uuid,
  p_monthly_payment bigint,
  p_interest_rate numeric default null,
  p_from_period_id uuid default null
)
returns setof public.debt_overview
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_name text;
  v_rate numeric := coalesce(p_interest_rate, 0);
  v_seq integer;
  v_opened date;
  v_id uuid;
begin
  perform private.assert_member(p_budget_id);
  v_name := private.clean_name(p_name);
  if p_principal is null or p_principal < 1 or p_principal > private.limit_transaction_amount() then
    raise exception 'invalid_amount' using errcode = 'P0001';
  end if;
  perform private.assert_debt_terms(v_rate, p_monthly_payment);
  perform private.lock_and_catch_up(p_budget_id);
  if p_from_period_id is not null then
    v_seq := private.period_seq(p_budget_id, p_from_period_id);
    select p.start_date into v_opened from public.periods as p where p.id = p_from_period_id;
  else
    v_seq := private.current_seq(p_budget_id);
    v_opened := private.today();
  end if;
  perform private.assert_transaction_category(p_budget_id, 'expense', p_category_id, v_seq);
  perform private.assert_debt_room(p_budget_id, 1);
  insert into public.debts (budget_id, name, category_id, principal, opened_on, first_seq)
  values (p_budget_id, v_name, p_category_id, p_principal, v_opened, v_seq)
  returning id into v_id;
  insert into public.debt_versions (debt_id, budget_id, effective_from_seq, interest_rate, monthly_payment)
  values (v_id, p_budget_id, v_seq, v_rate, p_monthly_payment);
  return query select * from public.debt_overview as o where o.id = v_id;
end;
$$;

-- Edit a debt: its name, its category (for payments recorded from now on: a leaf in force in
-- the latest period), its principal (only while it has no history: no payment, interest or
-- adjustment; afterwards adjust the balance instead), and its terms p_interest_rate /
-- p_monthly_payment (each omitted keeps its value), from the current period or, as an
-- explicit correction, from p_from_period_id until the next change. Interest already added is
-- never recomputed. Returns the debt.
-- R-DEBT-001, R-VERSION-004, R-VERSION-005, R-VERSION-006, R-VERSION-012, R-DEBT-114,
-- R-CONCURRENCY-070
create or replace function public.update_debt(
  p_debt_id uuid,
  p_expected_revision integer,
  p_name text default null,
  p_category_id uuid default null,
  p_principal bigint default null,
  p_interest_rate numeric default null,
  p_monthly_payment bigint default null,
  p_from_period_id uuid default null
)
returns setof public.debt_overview
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_debt public.debts;
  v_name text;
  v_seq integer;
  v_rate numeric;
  v_payment bigint;
  a record;
begin
  if p_name is not null then
    v_name := private.clean_name(p_name);
  end if;
  if p_principal is not null and (p_principal < 1 or p_principal > private.limit_transaction_amount()) then
    raise exception 'invalid_amount' using errcode = 'P0001';
  end if;
  v_debt := private.lock_debt(p_debt_id);
  perform private.assert_revision(v_debt.revision, p_expected_revision);
  if num_nonnulls(p_interest_rate, p_monthly_payment) = 0 and p_from_period_id is not null then
    raise exception 'invalid_period' using errcode = 'P0001';
  end if;
  if p_category_id is not null and p_category_id is distinct from v_debt.category_id then
    perform private.assert_transaction_category(v_debt.budget_id, 'expense', p_category_id,
                                                private.reading_seq(v_debt.budget_id));
  end if;
  if p_principal is not null and p_principal <> v_debt.principal then
    select * into a from private.debt_amounts(v_debt.id);
    if a.interest_count > 0 or a.adjustment_count > 0 or a.payment_count > 0 then
      raise exception 'debt_has_history' using errcode = 'P0001';
    end if;
  end if;
  if num_nonnulls(p_interest_rate, p_monthly_payment) > 0 then
    if p_from_period_id is null then
      if v_debt.end_seq is not null then
        raise exception 'debt_ended' using errcode = 'P0001';
      end if;
      v_seq := greatest(private.current_seq(v_debt.budget_id), v_debt.first_seq);
    else
      v_seq := private.period_seq(v_debt.budget_id, p_from_period_id);
      if v_seq < v_debt.first_seq then
        raise exception 'invalid_period' using errcode = 'P0001';
      end if;
      if v_debt.end_seq is not null and v_seq >= v_debt.end_seq then
        raise exception 'debt_ended' using errcode = 'P0001';
      end if;
    end if;
    select v.interest_rate, v.monthly_payment into v_rate, v_payment from public.debt_versions as v
    where v.debt_id = v_debt.id and v.effective_from_seq <= v_seq
    order by v.effective_from_seq desc limit 1;
    v_rate := coalesce(p_interest_rate, v_rate);
    v_payment := coalesce(p_monthly_payment, v_payment);
    perform private.assert_debt_terms(v_rate, v_payment);
    insert into public.debt_versions (debt_id, budget_id, effective_from_seq, interest_rate, monthly_payment)
    values (v_debt.id, v_debt.budget_id, v_seq, v_rate, v_payment)
    on conflict (debt_id, effective_from_seq) do update
      set interest_rate = excluded.interest_rate, monthly_payment = excluded.monthly_payment;
    update public.debts set revision = revision + 1 where id = v_debt.id;
  end if;
  update public.debts
  set name = coalesce(v_name, name), category_id = coalesce(p_category_id, category_id),
      principal = coalesce(p_principal, principal)
  where id = v_debt.id;
  return query select * from public.debt_overview as o where o.id = v_debt.id;
end;
$$;

-- Remove a debt from the current period, or, as an explicit correction, from an earlier one.
-- One that never counted before that period and has no payment, interest or adjustment is
-- deleted; otherwise it ends there and keeps its whole history (its remaining amount does not
-- change). Returns 'deleted' or 'ended'. R-DEBT-001, R-DEBT-113, R-CONCURRENCY-070
create or replace function public.remove_debt(
  p_debt_id uuid,
  p_expected_revision integer,
  p_from_period_id uuid default null
)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_debt public.debts;
  v_seq integer;
  v_end integer;
  a record;
begin
  v_debt := private.lock_debt(p_debt_id);
  perform private.assert_revision(v_debt.revision, p_expected_revision);
  if p_from_period_id is null then
    v_seq := private.current_seq(v_debt.budget_id);
  else
    v_seq := private.period_seq(v_debt.budget_id, p_from_period_id);
  end if;
  if v_debt.end_seq is not null and v_seq >= v_debt.end_seq then
    raise exception 'debt_ended' using errcode = 'P0001';
  end if;
  select * into a from private.debt_amounts(v_debt.id);
  if v_seq <= v_debt.first_seq and a.interest_count = 0 and a.adjustment_count = 0 and a.payment_count = 0 then
    delete from public.debts where id = v_debt.id;
    return 'deleted';
  end if;
  v_end := greatest(v_seq, v_debt.first_seq);
  update public.debts set end_seq = v_end where id = v_debt.id;
  delete from public.debt_versions as v
  where v.debt_id = v_debt.id and v.effective_from_seq >= v_end and v.effective_from_seq > v_debt.first_seq;
  return 'ended';
end;
$$;

-- R-DEBT-075: match the bank statement: the remaining amount becomes p_balance (0 to the
-- balance limit), through an adjustment entry dated p_date (default today; from the first
-- period's start to today) for the difference, computed by the database under the lock (no
-- entry when there is none). Returns the debt.
-- R-DEBT-075, R-DEBT-110, R-CONCURRENCY-070
create or replace function public.adjust_debt_balance(
  p_debt_id uuid,
  p_expected_revision integer,
  p_balance bigint,
  p_date date default null,
  p_note text default null
)
returns setof public.debt_overview
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_debt public.debts;
  v_date date;
  v_note text;
  v_delta bigint;
begin
  if p_balance is null or p_balance < 0 or p_balance > private.limit_debt_balance() then
    raise exception 'invalid_amount' using errcode = 'P0001';
  end if;
  v_note := private.clean_description(p_note);
  v_debt := private.lock_debt(p_debt_id);
  perform private.assert_revision(v_debt.revision, p_expected_revision);
  v_date := coalesce(p_date, private.today());
  perform private.transaction_period_seq(v_debt.budget_id, v_date);
  v_delta := p_balance - private.debt_remaining(v_debt.id);
  if abs(v_delta) > 2 * private.limit_debt_balance() then
    -- only reachable after payments far beyond the debt: the entry would be out of bounds
    raise exception 'invalid_amount' using errcode = 'P0001';
  end if;
  if v_delta <> 0 then
    if (select pg_catalog.count(*) from (select 1 from public.debt_adjustments as a where a.budget_id = v_debt.budget_id
                                         limit private.limit_debt_adjustments()) as n) >= private.limit_debt_adjustments() then
      raise exception 'adjustment_limit_reached' using errcode = 'P0001';
    end if;
    insert into public.debt_adjustments (budget_id, debt_id, date, amount, note, created_by)
    values (v_debt.budget_id, v_debt.id, v_date, v_delta, v_note, (select auth.uid()));
    update public.debts set revision = revision + 1 where id = v_debt.id;
  end if;
  return query select * from public.debt_overview as o where o.id = v_debt.id;
end;
$$;

-- R-DEBT-075: remove a balance adjustment. p_expected_revision is the debt's (an adjustment is
-- part of the debt). Returns the debt.
create or replace function public.delete_debt_adjustment(p_adjustment_id uuid, p_expected_revision integer)
returns setof public.debt_overview
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_budget_id uuid;
  v_debt_id uuid;
  v_debt public.debts;
begin
  select a.budget_id, a.debt_id into v_budget_id, v_debt_id from public.debt_adjustments as a where a.id = p_adjustment_id;
  if v_budget_id is null or not private.is_budget_member(v_budget_id) then
    raise exception 'adjustment_not_found' using errcode = 'P0001';
  end if;
  v_debt := private.lock_debt(v_debt_id);
  if not exists (select 1 from public.debt_adjustments as a where a.id = p_adjustment_id) then
    raise exception 'adjustment_not_found' using errcode = 'P0001';
  end if;
  perform private.assert_revision(v_debt.revision, p_expected_revision);
  delete from public.debt_adjustments where id = p_adjustment_id;
  update public.debts set revision = revision + 1 where id = v_debt.id;
  return query select * from public.debt_overview as o where o.id = v_debt.id;
end;
$$;

-- R-DEBT-004: a debt's history for its list and its chart: the principal (kind 'opened', on
-- opened_on), every interest entry (on its period's start), adjustment and payment, oldest
-- first (on one date: the principal, then interest, then adjustments and payments in the
-- order they were recorded), each with its effect on the remaining amount (amount: positive
-- raises it) and the remaining amount after it (balance). period_id: the period containing
-- the date. Members.
create type public.debt_history_row as (
  entry_id uuid, kind text, date date, amount bigint, balance bigint, period_id uuid,
  description text, created_at timestamptz
);
comment on type public.debt_history_row is
  'One row of get_debt_history. kind: opened, interest, adjustment, payment. description: the adjustment note or the payment description (may be null).';

create or replace function public.get_debt_history(p_debt_id uuid)
returns setof public.debt_history_row
language plpgsql
stable
security definer
set search_path = ''
set plan_cache_mode = force_custom_plan
as $$
declare
  v_debt public.debts;
begin
  select d.* into v_debt from public.debts as d where d.id = p_debt_id;
  if v_debt.id is null or not private.is_budget_member(v_debt.budget_id) then
    raise exception 'debt_not_found' using errcode = 'P0001';
  end if;
  return query
    select e.id, e.kind, e.date, e.amount,
           (pg_catalog.sum(e.amount) over (order by e.date, e.ord, e.created_at, e.id rows unbounded preceding))::bigint,
           pp.id, e.description, e.created_at
    from (
      select v_debt.id, 'opened'::text, v_debt.opened_on, v_debt.principal, null::text, v_debt.created_at, 0
      union all
      select i.id, 'interest', p.start_date, i.amount, null, i.created_at, 1
      from public.debt_interest as i join public.periods as p on p.id = i.period_id
      where i.debt_id = v_debt.id
      union all
      select a.id, 'adjustment', a.date, a.amount, a.note, a.created_at, 2
      from public.debt_adjustments as a where a.debt_id = v_debt.id
      union all
      select t.id, 'payment', t.date, -t.amount, t.description, t.created_at, 2
      from public.transactions as t where t.debt_id = v_debt.id
    ) as e (id, kind, date, amount, description, created_at, ord)
    left join lateral (
      select x.id, x.end_date from public.periods as x
      where x.budget_id = v_debt.budget_id and x.start_date <= e.date
      order by x.start_date desc limit 1
    ) as pp on e.date <= pp.end_date
    order by e.date, e.ord, e.created_at, e.id;
end;
$$;

-- ===========================================================================
-- Privileges
-- ===========================================================================
revoke all on table
  public.subscriptions, public.subscription_versions, public.debts, public.debt_versions,
  public.debt_adjustments, public.debt_interest, public.subscription_overview, public.debt_overview
from anon, authenticated, service_role;

grant select on table
  public.subscriptions, public.subscription_versions, public.debts, public.debt_versions,
  public.debt_adjustments, public.debt_interest, public.subscription_overview, public.debt_overview
to authenticated;

grant select, insert, update, delete on table
  public.subscriptions, public.subscription_versions, public.debts, public.debt_versions,
  public.debt_adjustments, public.debt_interest
to service_role;
grant select on table public.subscription_overview, public.debt_overview to service_role;

-- Functions: nothing executable by default (as in step 3: a function with a PUBLIC or anon
-- grant is one this migration created).
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
      and (p.proacl is null or exists (
        select 1 from pg_catalog.aclexplode(p.proacl) as a
        where a.grantee = 0 or a.grantee = 'anon'::regrole
      ))
  loop
    execute pg_catalog.format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
end;
$$;

-- Used by security_invoker views, so the calling role needs them.
grant execute on function
  private.cadence_months(public.subscription_cadence),
  private.month_index(date),
  private.month_day(integer, integer),
  private.charge_dates(date, public.subscription_cadence, date, date),
  private.next_charge_date(date, public.subscription_cadence, date),
  private.subscription_monthly_cost(bigint, public.subscription_cadence),
  private.subscriptions_in_force(uuid, integer),
  private.category_referenced(uuid),
  private.category_in_use(uuid, integer),
  private.budget_last_day(uuid),
  private.subscription_charge_counts(uuid),
  private.debt_amounts(uuid),
  private.debt_remaining(uuid),
  private.period_interest(bigint, numeric),
  private.future_period_end(uuid, public.periods, integer),
  private.debt_projection(uuid),
  private.limit_debt_balance(),
  private.limit_projection_periods()
to authenticated;

grant execute on function
  public.add_transaction(uuid, public.transaction_kind, bigint, date, uuid, text, uuid, uuid),
  public.link_transaction(uuid, integer, uuid, uuid),
  public.subscription_charge_dates(date, public.subscription_cadence, date, integer),
  public.create_subscription(uuid, text, bigint, public.subscription_cadence, uuid, date, uuid),
  public.update_subscription(uuid, integer, text, bigint, public.subscription_cadence, uuid, date, uuid),
  public.end_subscription(uuid, integer, uuid),
  public.confirm_subscription_charge(uuid, integer),
  public.dismiss_subscription_charge(uuid, integer),
  public.list_charges_awaiting_confirmation(uuid, integer),
  public.create_debt(uuid, text, bigint, uuid, bigint, numeric, uuid),
  public.update_debt(uuid, integer, text, uuid, bigint, numeric, bigint, uuid),
  public.remove_debt(uuid, integer, uuid),
  public.adjust_debt_balance(uuid, integer, bigint, date, text),
  public.delete_debt_adjustment(uuid, integer),
  public.get_debt_history(uuid)
to authenticated;

-- ===========================================================================
-- Row-level security (C-RLS-001, C-RLS-002, C-RLS-003, R-SECURITY-001 to R-SECURITY-003)
-- ===========================================================================
alter table public.subscriptions enable row level security;
alter table public.subscription_versions enable row level security;
alter table public.debts enable row level security;
alter table public.debt_versions enable row level security;
alter table public.debt_adjustments enable row level security;
alter table public.debt_interest enable row level security;

create policy "Members can read their budgets' subscriptions"
  on public.subscriptions for select to authenticated
  using (budget_id in (select private.member_budget_ids()));

create policy "Members can read their budgets' subscription terms"
  on public.subscription_versions for select to authenticated
  using (budget_id in (select private.member_budget_ids()));

create policy "Members can read their budgets' debts"
  on public.debts for select to authenticated
  using (budget_id in (select private.member_budget_ids()));

create policy "Members can read their budgets' debt terms"
  on public.debt_versions for select to authenticated
  using (budget_id in (select private.member_budget_ids()));

create policy "Members can read their budgets' debt adjustments"
  on public.debt_adjustments for select to authenticated
  using (budget_id in (select private.member_budget_ids()));

create policy "Members can read their budgets' debt interest"
  on public.debt_interest for select to authenticated
  using (budget_id in (select private.member_budget_ids()));
