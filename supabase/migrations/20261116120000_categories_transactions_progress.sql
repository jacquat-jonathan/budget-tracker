-- Step 3: categories and subcategories with versioned expectations, transactions (expenses,
-- refunds, extra incomes), the period progress view, and revisions for concurrent edits.
--
-- The client contract is in docs/database.md; the rules are in spec/spec.json (docs/spec.md)
-- and their ids are named below, at the object that enforces each. The conventions of the
-- step 2 migration apply: explicit privileges, RLS with policies in the same migration,
-- helpers in `private`, `set search_path = ''`, schema-qualified names, RPC-first writes that
-- take the budget lock and catch the periods up before reading the rows they check, stable
-- P0001 message codes, and deferred constraint triggers for invariants.
--
-- Categories
--   * Two levels: a top-level category is either a leaf (it holds an expectation and takes
--     transactions) or a group (is_group: it has subcategories, which are leaves). A category
--     becomes a group when its first subcategory is created and stays one.     (D-141)
--   * Validity is keyed to period numbers like incomes: in force in period p when
--     first_seq <= p and (end_seq is null or p < end_seq). A subcategory's validity lies within
--     its group's. Expectations are versions keyed by effective_from_seq. Both take part in
--     merges through the registry private.period_keyed_tables.      (R-VERSION-002, R-VERSION-070)
--
-- Transactions
--   * Belong to the period containing their date; no period id is stored, so they follow
--     their date through every boundary operation. A date is from the first period's start to
--     today (and not after the last period's end), so no operation can leave a transaction
--     outside every period (deferred check below).        (R-TRANSACTION-006, R-TRANSACTION-093)
--
-- Revisions (concurrent edits, R-CONCURRENCY-070, R-CONCURRENCY-090)
--   * Every editable record has `revision`, raised by a trigger whenever the row changes (and
--     explicitly when a dependent row, such as an expectation or an income's terms, changes).
--     Edit RPCs take the revision the client read and refuse with record_changed when it differs.

-- ===========================================================================
-- Types
-- ===========================================================================
-- R-CATEGORY-003
create type public.expectation_cadence as enum ('monthly', 'yearly');
comment on type public.expectation_cadence is
  'How an expectation amount was entered: per month, or per year (stored as yearly, shown as one twelfth).';

-- R-TRANSACTION-070, R-TRANSACTION-092
create type public.transaction_kind as enum ('expense', 'refund', 'extra_income');
comment on type public.transaction_kind is
  'expense: money spent in a category; refund: money back, reducing what was spent in its category; extra_income: one-off income with no category, adding to the period''s income total.';

-- ===========================================================================
-- Limits: generous household values, one place (D-153)            (R-CATEGORY-094, R-TRANSACTION-094)
-- ===========================================================================
-- Categories and subcategories in force, and in all (void rows, kept only for their
-- transactions, are not counted).
create or replace function private.limit_active_categories() returns integer
language sql immutable set search_path = '' as $$ select 200 $$;
create or replace function private.limit_total_categories() returns integer
language sql immutable set search_path = '' as $$ select 500 $$;
-- Largest expectation amount as entered (per month or per year), in rappen.
create or replace function private.limit_expectation_amount() returns bigint
language sql immutable set search_path = '' as $$ select 1000000000::bigint $$;
create or replace function private.limit_transaction_amount() returns bigint
language sql immutable set search_path = '' as $$ select 1000000000::bigint $$;
create or replace function private.limit_transactions() returns integer
language sql immutable set search_path = '' as $$ select 50000 $$;
create or replace function private.limit_description_length() returns integer
language sql immutable set search_path = '' as $$ select 500 $$;
create or replace function private.limit_page_size() returns integer
language sql immutable set search_path = '' as $$ select 200 $$;

-- ===========================================================================
-- Revisions (R-CONCURRENCY-090)
-- ===========================================================================

-- Before update: raise the revision when anything other than the columns named in the
-- trigger arguments changed (and the statement did not set the revision itself).
create or replace function private.bump_revision()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.revision = old.revision
     and (pg_catalog.to_jsonb(new) - tg_argv) is distinct from (pg_catalog.to_jsonb(old) - tg_argv) then
    new.revision := old.revision + 1;
  end if;
  return new;
end;
$$;

-- R-CONCURRENCY-070: refuse when the record changed since the client read it. Every edit RPC
-- requires the revision (D-150): invalid_revision when none is sent.
create or replace function private.assert_revision(p_actual integer, p_expected integer)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_expected is null then
    raise exception 'invalid_revision' using errcode = 'P0001';
  end if;
  if p_actual is distinct from p_expected then
    raise exception 'record_changed' using errcode = 'P0001';
  end if;
end;
$$;

alter table public.budgets add column revision integer not null default 1;
alter table public.incomes add column revision integer not null default 1;
-- R-CONCURRENCY-100: a period's revision moves with its dates, so a boundary operation names
-- the period the client saw and is refused when it changed or is gone (a second reopen).
alter table public.periods add column revision integer not null default 1;

create trigger budgets_bump_revision before update on public.budgets
  for each row execute function private.bump_revision('revision', 'updated_at');
create trigger incomes_bump_revision before update on public.incomes
  for each row execute function private.bump_revision('revision', 'updated_at');
create trigger periods_bump_revision before update on public.periods
  for each row execute function private.bump_revision('revision', 'updated_at');

-- ===========================================================================
-- Tables
-- ===========================================================================

-- R-CATEGORY-001, R-CATEGORY-002, R-CATEGORY-090
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  budget_id uuid not null references public.budgets (id) on delete cascade,
  -- The group this subcategory belongs to (same budget, by the composite key); null: top level.
  parent_id uuid,
  -- R-CATEGORY-090: true from the first subcategory on; a group holds no expectation and
  -- takes no transaction (R-TRANSACTION-072).
  is_group boolean not null default false,
  name text not null,
  -- Order among siblings (R-CATEGORY-096); not part of the revision.
  sort_order integer not null default 0,
  first_seq integer not null,
  -- end_seq = first_seq is a void row, never in force (R-VERSION-014).
  end_seq integer,
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint categories_name_valid check (name = btrim(name) and char_length(name) between 1 and 100),
  constraint categories_seq_valid check (first_seq >= 1 and (end_seq is null or end_seq >= first_seq)),
  -- R-CATEGORY-001: a subcategory is never a group, so there are two levels at most.
  constraint categories_two_levels check (parent_id is null or not is_group),
  constraint categories_id_budget_unique unique (id, budget_id),
  -- R-SECURITY-002: a subcategory's group is in the same budget.
  constraint categories_parent_fk foreign key (parent_id, budget_id)
    references public.categories (id, budget_id) on delete cascade
);
comment on table public.categories is
  'Categories (parent_id null) and subcategories. Validity by period number like incomes; see docs/database.md.';
create index categories_budget_id_idx on public.categories (budget_id);
create index categories_parent_idx on public.categories (parent_id, budget_id);

-- R-VERSION-002, R-CATEGORY-003, R-CATEGORY-004: one expectation version per leaf and period.
create table public.category_expectations (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null,
  budget_id uuid not null,
  effective_from_seq integer not null,
  -- R-MONEY-002: integer rappen, as entered: per month, or per year (stored as yearly).
  amount bigint not null,
  cadence public.expectation_cadence not null default 'monthly',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint category_expectations_category_fk foreign key (category_id, budget_id)
    references public.categories (id, budget_id) on delete cascade,
  constraint category_expectations_unique unique (category_id, effective_from_seq),  -- R-VERSION-006
  constraint category_expectations_seq_valid check (effective_from_seq >= 1),
  constraint category_expectations_amount_valid check (amount between 0 and 1000000000)  -- R-CATEGORY-094
);
create index category_expectations_budget_id_idx on public.category_expectations (budget_id);
create index category_expectations_category_budget_idx on public.category_expectations (category_id, budget_id);

-- R-TRANSACTION-001, R-TRANSACTION-002, R-TRANSACTION-070, R-TRANSACTION-092, R-TRANSACTION-095
-- Later steps add nullable columns (a debt or subscription link, a source, an external id, a
-- review state) without reshaping it: docs/database.md, "For later tables".
create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  budget_id uuid not null references public.budgets (id) on delete cascade,
  kind public.transaction_kind not null default 'expense',
  -- R-TRANSACTION-001, R-MONEY-002: positive integer rappen; the kind gives the direction.
  amount bigint not null,
  -- The period is the one containing this date (R-TRANSACTION-006); never stored.
  date date not null,
  -- A leaf of the same budget (composite key); null exactly for extra incomes. Not deferrable
  -- and no cascade: a referenced category is kept (as a void row in a merge, R-VERSION-014).
  category_id uuid,
  description text,
  -- Who recorded it (R-TRANSACTION-095); kept when they leave, null if their account is deleted.
  recorded_by uuid references auth.users (id) on delete set null,
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transactions_category_fk foreign key (category_id, budget_id)
    references public.categories (id, budget_id),
  constraint transactions_amount_valid check (amount between 1 and 1000000000),  -- R-TRANSACTION-094
  constraint transactions_date_valid check (date between date '1900-01-01' and date '2999-12-31'),
  constraint transactions_description_valid check (
    description is null or (description = btrim(description) and char_length(description) between 1 and 500)
  ),
  -- R-TRANSACTION-092: an extra income has no category; anything else has one.
  constraint transactions_category_kind check ((kind = 'extra_income') = (category_id is null))
);
comment on table public.transactions is
  'Expenses, refunds and extra incomes. The period is the one containing the date.';
-- Date-range reads (progress, totals, paging by date desc, created_at desc, id desc), with the
-- columns the progress sums need.                                          (R-TRANSACTION-095)
create index transactions_budget_date_idx on public.transactions (budget_id, date, created_at, id)
  include (category_id, kind, amount);
-- Per-category reads and the foreign key.
create index transactions_category_idx on public.transactions (category_id, budget_id, date, created_at, id);
create index transactions_recorded_by_idx on public.transactions (recorded_by, budget_id);

create trigger categories_set_updated_at before update on public.categories
  for each row execute function private.set_updated_at();
create trigger category_expectations_set_updated_at before update on public.category_expectations
  for each row execute function private.set_updated_at();
create trigger transactions_set_updated_at before update on public.transactions
  for each row execute function private.set_updated_at();

create trigger categories_bump_revision before update on public.categories
  for each row execute function private.bump_revision('revision', 'updated_at', 'sort_order');
create trigger transactions_bump_revision before update on public.transactions
  for each row execute function private.bump_revision('revision', 'updated_at');

-- ===========================================================================
-- Invariants (constraint triggers, checked at commit)
-- ===========================================================================

-- R-CATEGORY-001, R-CATEGORY-002, R-CATEGORY-090, R-CATEGORY-095, R-TRANSACTION-072: what is
-- wrong with category p_category_id, or null. A subcategory's parent is a group of the same
-- budget and its validity lies within the group's; a group holds no expectation and no
-- transaction; a leaf has no subcategory and an expectation in force from its first period.
create or replace function private.category_shape_violation(p_category_id uuid)
returns text
language sql
stable
set search_path = ''
as $$
  select v.what
  from public.categories as c
  left join public.categories as p on p.id = c.parent_id
  cross join lateral (values
    (case when c.parent_id is not null and not p.is_group then 'parent_not_group' end),
    (case when c.parent_id is not null
               and (c.first_seq < p.first_seq
                    or (p.end_seq is not null and (c.end_seq is null or c.end_seq > p.end_seq)))
          then 'outside_parent_validity' end),
    (case when c.is_group and exists (select 1 from public.category_expectations as e where e.category_id = c.id)
          then 'group_has_expectation' end),
    (case when c.is_group and exists (select 1 from public.transactions as t where t.category_id = c.id)
          then 'group_has_transaction' end),
    (case when not c.is_group and exists (select 1 from public.categories as ch where ch.parent_id = c.id)
          then 'leaf_has_subcategory' end),
    (case when not c.is_group and not exists (
            select 1 from public.category_expectations as e
            where e.category_id = c.id and e.effective_from_seq <= c.first_seq)
          then 'leaf_without_expectation' end)
  ) as v (what)
  where c.id = p_category_id and v.what is not null
  limit 1
$$;

create or replace function private.check_category_shape()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ids uuid[];
  v_id uuid;
  v_problem text;
begin
  -- Deferred: the row may have changed since the event, so read it as it is now.
  if tg_table_name = 'categories' then
    v_ids := array[new.id, (select c.parent_id from public.categories as c where c.id = new.id)]
             || coalesce((select pg_catalog.array_agg(ch.id) from public.categories as ch where ch.parent_id = new.id), '{}');
  elsif tg_op = 'DELETE' then
    v_ids := array[old.category_id];
  elsif tg_op = 'UPDATE' then
    v_ids := array[new.category_id, old.category_id];
  else
    v_ids := array[new.category_id];
  end if;
  foreach v_id in array v_ids loop
    continue when v_id is null;
    v_problem := private.category_shape_violation(v_id);
    if v_problem is not null then
      raise exception 'category_shape_invalid: %', v_problem using errcode = '23514';
    end if;
  end loop;
  return null;
end;
$$;

create constraint trigger categories_shape
  after insert or update of parent_id, is_group, first_seq, end_seq on public.categories
  deferrable initially deferred
  for each row execute function private.check_category_shape();

create constraint trigger category_expectations_shape
  after insert or update or delete on public.category_expectations
  deferrable initially deferred
  for each row execute function private.check_category_shape();

-- R-TRANSACTION-072: a transaction is never on a group (cheaper than the full shape check,
-- since imports and the move to "Other" touch many rows).
create or replace function private.check_transaction_on_leaf()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Deferred: check the transaction as it is now, not as it was when the event fired.
  if exists (select 1 from public.transactions as t join public.categories as c on c.id = t.category_id
             where t.id = new.id and c.is_group) then
    raise exception 'category_shape_invalid: group_has_transaction' using errcode = '23514';
  end if;
  return null;
end;
$$;

create constraint trigger transactions_on_leaves
  after insert or update of category_id on public.transactions
  deferrable initially deferred
  for each row execute function private.check_transaction_on_leaf();

-- R-TRANSACTION-006, R-TRANSACTION-093: every transaction lies within the budget's stored
-- periods (from the first period's start to the latest period's end), so each belongs to
-- exactly one period, whatever boundary operation ran.
create or replace function private.check_transactions_in_periods()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_budget_id uuid;
  v_first date;
  v_last date;
begin
  if tg_op = 'DELETE' then v_budget_id := old.budget_id; else v_budget_id := new.budget_id; end if;
  select pg_catalog.min(p.start_date), pg_catalog.max(p.end_date) into v_first, v_last
  from public.periods as p where p.budget_id = v_budget_id;
  if v_first is null then
    return null;  -- budget being deleted
  end if;
  if tg_table_name = 'transactions' then
    -- Deferred: the date as it is now.
    if exists (select 1 from public.transactions as t where t.id = new.id and (t.date < v_first or t.date > v_last)) then
      raise exception 'transaction_outside_periods' using errcode = '23514';
    end if;
  elsif exists (select 1 from public.transactions as t where t.budget_id = v_budget_id and t.date < v_first)
     or exists (select 1 from public.transactions as t where t.budget_id = v_budget_id and t.date > v_last) then
    raise exception 'transaction_outside_periods' using errcode = '23514';
  end if;
  return null;
end;
$$;

create constraint trigger transactions_in_periods
  after insert or update of date on public.transactions
  deferrable initially deferred
  for each row execute function private.check_transactions_in_periods();

create constraint trigger periods_cover_transactions
  after update or delete on public.periods
  deferrable initially deferred
  for each row execute function private.check_transactions_in_periods();

-- R-VERSION-011: nothing is keyed beyond the latest period, now for every table in the
-- registry (step 2 checked incomes and income versions by name; the triggers stay). A row
-- event checks that row only, as it is now (constant cost, so a merge touching hundreds of
-- rows stays fast, D-153); a deleted period checks the whole budget.
create or replace function private.check_nothing_beyond_latest()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_budget_id uuid;
  v_latest integer;
  v_bad boolean;
  t record;
begin
  if tg_op = 'DELETE' then v_budget_id := old.budget_id; else v_budget_id := new.budget_id; end if;
  select pg_catalog.max(p.seq) into v_latest from public.periods as p where p.budget_id = v_budget_id;
  if v_latest is null then
    return null;  -- budget being created or deleted
  end if;
  if tg_table_name <> 'periods' then
    select * into t from private.period_keyed_tables where table_name = tg_relid::regclass;
    if t.kind = 'validity' then
      execute pg_catalog.format(
        'select exists (select 1 from %s where id = $1 and (first_seq > $2 or end_seq > $2))',
        t.table_name) into v_bad using new.id, v_latest;
    else
      execute pg_catalog.format(
        'select exists (select 1 from %s where id = $1 and effective_from_seq > $2)',
        t.table_name) into v_bad using new.id, v_latest;
    end if;
    if v_bad then
      raise exception 'keyed_beyond_latest_period' using errcode = '23514';
    end if;
    return null;
  end if;
  for t in select * from private.period_keyed_tables loop
    if t.kind = 'validity' then
      execute pg_catalog.format(
        'select exists (select 1 from %s where budget_id = $1 and (first_seq > $2 or end_seq > $2))',
        t.table_name) into v_bad using v_budget_id, v_latest;
    else
      execute pg_catalog.format(
        'select exists (select 1 from %s where budget_id = $1 and effective_from_seq > $2)',
        t.table_name) into v_bad using v_budget_id, v_latest;
    end if;
    if v_bad then
      raise exception 'keyed_beyond_latest_period' using errcode = '23514';
    end if;
  end loop;
  return null;
end;
$$;

create constraint trigger categories_not_beyond_latest
  after insert or update of first_seq, end_seq on public.categories
  deferrable initially deferred
  for each row execute function private.check_nothing_beyond_latest();

create constraint trigger category_expectations_not_beyond_latest
  after insert or update of effective_from_seq on public.category_expectations
  deferrable initially deferred
  for each row execute function private.check_nothing_beyond_latest();

-- ===========================================================================
-- Merges: categories and their expectations join the registry (R-VERSION-011, R-VERSION-014)
-- ===========================================================================

-- R-VERSION-014, R-VERSION-100 (step 2 gap fixed, D-155): as in step 2, and also enforce the
-- two promises the docs made but step 2 did not check: a validity table's check constraints
-- on first_seq and end_seq accept a void row (end_seq = first_seq), and a version table has a
-- foreign key from its entity column to the entity table.
create or replace function private.check_period_keyed_table()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_missing text;
  v_check record;
  v_ok boolean;
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
    if v_missing is null or v_missing = '' then
      -- every check on first_seq / end_seq alone must accept a void row
      for v_check in
        select k.conname, pg_catalog.pg_get_expr(k.conbin, k.conrelid) as expr
        from pg_catalog.pg_constraint as k
        where k.conrelid = new.table_name and k.contype = 'c'
          and not exists (
            select 1 from pg_catalog.pg_attribute as a
            where a.attrelid = k.conrelid and a.attnum = any (k.conkey)
              and a.attname not in ('first_seq', 'end_seq'))
      loop
        execute pg_catalog.format(
          'select (%s) is not false from (select 1::integer as first_seq, 1::integer as end_seq) as v', v_check.expr)
          into v_ok;
        if not v_ok then
          v_missing := concat_ws(', ', v_missing, 'a check allowing end_seq = first_seq (' || v_check.conname || ' refuses it)');
        end if;
      end loop;
    end if;
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
    if not exists (
      select 1 from pg_catalog.pg_constraint as k
      join pg_catalog.pg_attribute as a on a.attrelid = k.conrelid and a.attnum = any (k.conkey)
      where k.conrelid = new.table_name and k.contype = 'f' and k.confrelid = new.entity_table
        and a.attname = new.entity_column
    ) then
      v_missing := concat_ws(', ', v_missing, 'a foreign key from ' || new.entity_column || ' to ' || new.entity_table::text);
    end if;
  end if;
  if v_missing is not null and v_missing <> '' then
    raise exception 'period_keyed_table_invalid: % lacks %', new.table_name, v_missing using errcode = '23514';
  end if;
  return new;
end;
$$;

insert into private.period_keyed_tables (table_name, kind, record_kind, name_column) values
  ('public.categories', 'validity', 'category', 'name');
insert into private.period_keyed_tables (table_name, kind, record_kind, entity_column, entity_table) values
  ('public.category_expectations', 'version', 'category', 'category_id', 'public.categories');

-- R-VERSION-011, R-VERSION-013, R-VERSION-014 (step 2 defect fixed, D-146): as in step 2, but a
-- validity row that would never be in force is deleted or voided one row at a time. Step 2
-- tried one delete for all such rows and, when any of them was referenced, voided them all,
-- so unreferenced rows (an income, a category without transactions) were kept as void rows.
create or replace function private.rekey_period(p_budget_id uuid, p_from integer, p_to integer)
returns void
language plpgsql
volatile
set search_path = ''
as $$
declare
  t record;
  v_id uuid;
begin
  for t in select * from private.period_keyed_tables order by (kind = 'validity') desc, table_name::text loop
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
      for v_id in execute pg_catalog.format(
          'select id from %1$s where budget_id = $1 and end_seq = $2 and first_seq >= $3',
          t.table_name) using p_budget_id, p_from, p_to loop
        begin
          execute pg_catalog.format('delete from %1$s where id = $1', t.table_name) using v_id;
        exception when foreign_key_violation then
          execute pg_catalog.format('update %1$s set first_seq = $2, end_seq = $2 where id = $1', t.table_name)
            using v_id, p_to;
        end;
      end loop;
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

-- ===========================================================================
-- Amounts (pure, and per period)
-- ===========================================================================

-- R-CATEGORY-005, R-CATEGORY-070, R-CATEGORY-091: the monthly share of an expectation as
-- entered. A yearly amount: one twelfth, rounded half up to the rappen (amounts are never
-- negative, so (a + 6) / 12 in integer arithmetic), never adjusted to add up over a year.
create or replace function private.monthly_share(p_amount bigint, p_cadence public.expectation_cadence)
returns bigint
language sql
immutable
set search_path = ''
as $$
  select case p_cadence when 'monthly' then p_amount when 'yearly' then (p_amount + 6) / 12 end
$$;

-- R-PERIOD-018: total of the incomes in force in period p_seq, each at its version then.
create or replace function private.salary_total(p_budget_id uuid, p_seq integer)
returns bigint
language sql
stable
set search_path = ''
as $$
  select coalesce(pg_catalog.sum(v.amount), 0)::bigint
  from public.incomes as i
  join lateral (
    select iv.amount from public.income_versions as iv
    where iv.income_id = i.id and iv.effective_from_seq <= p_seq
    order by iv.effective_from_seq desc
    limit 1
  ) as v on true
  where i.budget_id = p_budget_id and i.first_seq <= p_seq and (i.end_seq is null or p_seq < i.end_seq)
$$;

-- R-CATEGORY-006, R-PROGRESS-070: the leaves in force in period p_seq with the expectation in
-- force then and its monthly share. The one source of expected amounts (progress rows and
-- period totals both read it, so they always agree; R-CATEGORY-091).
create or replace function private.expectations_in_force(p_budget_id uuid, p_seq integer)
returns table (category_id uuid, amount bigint, cadence public.expectation_cadence,
               effective_from_seq integer, expected bigint)
language sql
stable
set search_path = ''
as $$
  select c.id, e.amount, e.cadence, e.effective_from_seq, private.monthly_share(e.amount, e.cadence)
  from public.categories as c
  cross join lateral (
    select ce.amount, ce.cadence, ce.effective_from_seq
    from public.category_expectations as ce
    where ce.category_id = c.id and ce.effective_from_seq <= p_seq
    order by ce.effective_from_seq desc
    limit 1
  ) as e
  where c.budget_id = p_budget_id and not c.is_group
    and c.first_seq <= p_seq and (c.end_seq is null or p_seq < c.end_seq)
$$;

-- R-PROGRESS-001, R-TRANSACTION-006, R-TRANSACTION-071: what was spent per category between
-- two dates (a period): expenses minus refunds; extra incomes are not spending. The one
-- source of spent amounts.
create or replace function private.spending_between(p_budget_id uuid, p_start date, p_end date)
returns table (category_id uuid, spent bigint, transaction_count integer)
language sql
stable
set search_path = ''
as $$
  select t.category_id,
         pg_catalog.sum(case t.kind when 'expense' then t.amount else -t.amount end)::bigint,
         pg_catalog.count(*)::integer
  from public.transactions as t
  where t.budget_id = p_budget_id and t.date between p_start and p_end and t.kind <> 'extra_income'
  group by t.category_id
$$;

-- R-TRANSACTION-092: the extra incomes dated between two dates.
create or replace function private.extra_income_between(p_budget_id uuid, p_start date, p_end date)
returns bigint
language sql
stable
set search_path = ''
as $$
  select coalesce(pg_catalog.sum(t.amount), 0)::bigint
  from public.transactions as t
  where t.budget_id = p_budget_id and t.date between p_start and p_end and t.kind = 'extra_income'
$$;

-- R-PROGRESS-070, R-PROGRESS-071, R-PROGRESS-090, R-PROGRESS-091: one row per category and
-- subcategory of period p_seq (p_start to p_end): every one in force, and every one with
-- transactions dated in it even when not in force then (expected 0). A group adds up its
-- subcategories. Rows come in display order (groups and top-level leaves by sort order, each
-- group's subcategories after it).
-- A named row type, so the generated client types show which fields can be null (D-156):
-- parent_id (top level), amount and cadence (groups, and rows not in force).
create type public.category_progress_row as (
  category_id uuid, parent_id uuid, name text, is_group boolean, in_force boolean,
  amount bigint, cadence public.expectation_cadence, expected bigint, spent bigint, result bigint,
  is_overspent boolean, transaction_count integer, display_order integer
);
comment on type public.category_progress_row is
  'One row of get_period_progress. parent_id null: top level; amount and cadence null: a group, or a category not in force in the period.';

create or replace function private.category_progress(p_budget_id uuid, p_seq integer, p_start date, p_end date)
returns setof public.category_progress_row
language sql
stable
set search_path = ''
as $$
  with e as (select * from private.expectations_in_force(p_budget_id, p_seq)),
  s as (select * from private.spending_between(p_budget_id, p_start, p_end)),
  leaves as (
    select c.id, c.parent_id, c.name, c.sort_order, e.category_id is not null as in_force,
           e.amount, e.cadence, coalesce(e.expected, 0)::bigint as expected,
           coalesce(s.spent, 0)::bigint as spent, coalesce(s.transaction_count, 0) as n
    from public.categories as c
    left join e on e.category_id = c.id
    left join s on s.category_id = c.id
    where c.budget_id = p_budget_id and not c.is_group
      and (e.category_id is not null or s.category_id is not null)
  ),
  groups as (
    select g.id, null::uuid as parent_id, g.name, g.sort_order,
           (g.first_seq <= p_seq and (g.end_seq is null or p_seq < g.end_seq)) as in_force,
           null::bigint as amount, null::public.expectation_cadence as cadence,
           coalesce(pg_catalog.sum(l.expected), 0)::bigint as expected,
           coalesce(pg_catalog.sum(l.spent), 0)::bigint as spent,
           coalesce(pg_catalog.sum(l.n), 0)::integer as n
    from public.categories as g
    left join leaves as l on l.parent_id = g.id
    where g.budget_id = p_budget_id and g.is_group
      and ((g.first_seq <= p_seq and (g.end_seq is null or p_seq < g.end_seq)) or l.id is not null)
    group by g.id
  ),
  all_rows as (
    select l.id, l.parent_id, l.name, false as is_group, l.in_force, l.amount, l.cadence,
           l.expected, l.spent, l.n, l.sort_order,
           coalesce(p.sort_order, l.sort_order) as top_order, coalesce(p.name, l.name) as top_name
    from leaves as l left join public.categories as p on p.id = l.parent_id
    union all
    select g.id, g.parent_id, g.name, true, g.in_force, g.amount, g.cadence,
           g.expected, g.spent, g.n, g.sort_order, g.sort_order, g.name
    from groups as g
  )
  select r.id, r.parent_id, r.name, r.is_group, r.in_force, r.amount, r.cadence,
         r.expected, r.spent, (r.expected - r.spent)::bigint, r.spent > r.expected, r.n,
         (pg_catalog.row_number() over (
            order by r.top_order, r.top_name, coalesce(r.parent_id, r.id), r.parent_id is not null,
                     r.sort_order, r.name, r.id))::integer
  from all_rows as r
  order by 13
$$;

-- R-CATEGORY-072, R-CATEGORY-073: whether a category or one of its subcategories has
-- transactions. Each test is an index lookup by category, so the cost depends on this
-- budget's rows only, never on other budgets' (D-153).
-- Planned for the actual id (force_custom_plan): a generic plan estimates every category as
-- big as the biggest one in the whole database and scans all transactions.
create or replace function private.category_has_transactions(p_category_id uuid)
returns boolean
language plpgsql
stable
set search_path = ''
set plan_cache_mode = force_custom_plan
as $$
begin
  return exists (select 1 from public.transactions as t where t.category_id = p_category_id)
      or exists (select 1 from public.categories as ch
                 where ch.parent_id = p_category_id
                   and exists (select 1 from public.transactions as t where t.category_id = ch.id));
end;
$$;

-- R-TRANSACTION-095: the display name (only) of whoever recorded a transaction, also after
-- they left (D-088); only for budgets the caller belongs to.
create or replace function private.recorder_name(p_budget_id uuid, p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.display_name from public.profiles as p
  where p.id = p_user_id
    and p_budget_id in (select private.member_budget_ids())
    and exists (select 1 from public.transactions as t where t.recorded_by = p_user_id and t.budget_id = p_budget_id)
$$;

-- ===========================================================================
-- Views (security_invoker: the caller's RLS applies)
-- ===========================================================================

-- As in step 2, plus the revision (R-CONCURRENCY-090).
create or replace view public.my_budgets with (security_invoker = true) as
  select
    b.id,
    b.name,
    b.owner_id,
    b.primary_income_id,
    b.end_date as end_date_entered,
    private.budget_end_date(b.id) as end_date,
    b.created_at,
    b.updated_at,
    (b.owner_id = (select auth.uid())) as is_owner,
    b.revision
  from public.budgets as b
  join public.budget_members as m on m.budget_id = b.id and m.user_id = (select auth.uid());

-- As in step 2, plus the revision (R-CONCURRENCY-090).
create or replace view public.income_overview with (security_invoker = true) as
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
    i.updated_at,
    i.revision
  from public.incomes as i
  join public.budgets as b on b.id = i.budget_id
  join lateral (
    select v.amount, v.pay_day, v.weekend_rule, v.effective_from_seq
    from public.income_versions as v
    where v.income_id = i.id
    order by (v.effective_from_seq <= private.reading_seq(i.budget_id)) desc,
             case when v.effective_from_seq <= private.reading_seq(i.budget_id)
                  then -v.effective_from_seq else v.effective_from_seq end
    limit 1
  ) as t on true;

-- R-PERIOD-018, R-CATEGORY-006, R-CATEGORY-071, R-PROGRESS-002, R-PROGRESS-090,
-- R-TRANSACTION-092: periods with their totals. income_total now includes the extra incomes
-- dated in the period (salary_total + extra_income_total). expected_total adds the rounded
-- monthly shares (R-CATEGORY-091); left_to_assign and result may be negative.
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
    p.revision  -- R-CONCURRENCY-100: name it in a boundary operation
  from public.periods as p
  cross join lateral (
    select
      private.salary_total(p.budget_id, p.seq) as salary_total,
      private.extra_income_between(p.budget_id, p.start_date, p.end_date) as extra_income_total,
      coalesce((select pg_catalog.sum(e.expected) from private.expectations_in_force(p.budget_id, p.seq) as e), 0)::bigint
        as expected_total,
      coalesce((select pg_catalog.sum(s.spent) from private.spending_between(p.budget_id, p.start_date, p.end_date) as s), 0)::bigint
        as spent_total
  ) as a;

-- R-CATEGORY-001 to R-CATEGORY-005, R-CATEGORY-072, R-CATEGORY-073: categories with the
-- expectation in force now (like income_overview). is_active: in force in the current period.
-- monthly_amount: the leaf's monthly share, or a group's total of its active subcategories.
-- removal_deletes: removing it now deletes it (no transactions, never counted in a past
-- period) rather than ending it.
create view public.category_overview with (security_invoker = true) as
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
    (not h.has_transactions and c.first_seq >= private.reading_seq(c.budget_id)) as removal_deletes,
    c.revision,
    c.created_at,
    c.updated_at
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
  -- itself or a subcategory, each by the per-category index (cost: this budget's rows only)
  cross join lateral (select private.category_has_transactions(c.id) as has_transactions) as h;

-- R-TRANSACTION-001, R-TRANSACTION-002, R-TRANSACTION-006, R-TRANSACTION-095: transactions
-- with their category path, the period containing their date, and who recorded them.
create view public.transaction_list with (security_invoker = true) as
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
    t.updated_at
  from public.transactions as t
  left join public.categories as c on c.id = t.category_id
  left join public.categories as pc on pc.id = c.parent_id
  -- the period containing the date: the latest one starting on or before it (index lookup)
  left join lateral (
    select pp.id, pp.end_date from public.periods as pp
    where pp.budget_id = t.budget_id and pp.start_date <= t.date
    order by pp.start_date desc
    limit 1
  ) as p on t.date <= p.end_date;

-- ===========================================================================
-- Internal helpers for the RPCs
-- ===========================================================================

-- Lock the budget of a category, catch up, and return the category read after the lock;
-- category_not_found unless it exists and the caller is a member. (R-PERIOD-032, R-SECURITY-004)
create or replace function private.lock_category(p_category_id uuid)
returns public.categories
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_budget_id uuid;
  v_category public.categories;
begin
  select c.budget_id into v_budget_id from public.categories as c where c.id = p_category_id;
  if v_budget_id is null or not private.is_budget_member(v_budget_id) then
    raise exception 'category_not_found' using errcode = 'P0001';
  end if;
  perform private.lock_and_catch_up(v_budget_id);
  select c.* into v_category from public.categories as c where c.id = p_category_id;
  if v_category.id is null then
    raise exception 'category_not_found' using errcode = 'P0001';
  end if;
  return v_category;
end;
$$;

-- The same for a transaction.
create or replace function private.lock_transaction(p_transaction_id uuid)
returns public.transactions
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_budget_id uuid;
  v_transaction public.transactions;
begin
  select t.budget_id into v_budget_id from public.transactions as t where t.id = p_transaction_id;
  if v_budget_id is null or not private.is_budget_member(v_budget_id) then
    raise exception 'transaction_not_found' using errcode = 'P0001';
  end if;
  perform private.lock_and_catch_up(v_budget_id);
  select t.* into v_transaction from public.transactions as t where t.id = p_transaction_id;
  if v_transaction.id is null then
    raise exception 'transaction_not_found' using errcode = 'P0001';
  end if;
  return v_transaction;
end;
$$;

-- R-CATEGORY-003, R-CATEGORY-094
create or replace function private.assert_expectation(p_amount bigint, p_cadence public.expectation_cadence)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_amount is null or p_amount < 0 or p_amount > private.limit_expectation_amount() then
    raise exception 'invalid_amount' using errcode = 'P0001';
  end if;
  if p_cadence is null then
    raise exception 'invalid_cadence' using errcode = 'P0001';
  end if;
end;
$$;

-- R-TRANSACTION-001, R-TRANSACTION-094
create or replace function private.assert_transaction_amount(p_kind public.transaction_kind, p_amount bigint)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_kind is null then
    raise exception 'invalid_kind' using errcode = 'P0001';
  end if;
  if p_amount is null or p_amount < 1 or p_amount > private.limit_transaction_amount() then
    raise exception 'invalid_amount' using errcode = 'P0001';
  end if;
end;
$$;

-- R-TRANSACTION-002, R-TRANSACTION-094: trimmed; blank means none.
create or replace function private.clean_description(p_description text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_description text := nullif(btrim(p_description), '');
begin
  if char_length(v_description) > private.limit_description_length() then
    raise exception 'invalid_description' using errcode = 'P0001';
  end if;
  return v_description;
end;
$$;

-- R-TRANSACTION-006, R-TRANSACTION-090: the number of the period containing p_date, which a
-- transaction may carry: a stored period's date, and not after today.
create or replace function private.transaction_period_seq(p_budget_id uuid, p_date date)
returns integer
language plpgsql
stable
set search_path = ''
as $$
declare
  v_seq integer;
begin
  if not private.is_sane_date(p_date) then
    raise exception 'invalid_date' using errcode = 'P0001';
  end if;
  select p.seq into v_seq from public.periods as p
  where p.budget_id = p_budget_id and p_date between p.start_date and p.end_date;
  if v_seq is null or p_date > private.today() then
    raise exception 'date_outside_periods' using errcode = 'P0001';
  end if;
  return v_seq;
end;
$$;

-- R-TRANSACTION-001, R-TRANSACTION-072, R-TRANSACTION-091, R-TRANSACTION-092,
-- R-TRANSACTION-100: the category a transaction of kind p_kind dated in period p_seq may
-- carry. p_kept: the transaction already has this category and stays in the same period, so
-- it may keep it even when the category is no longer in force there (ended, voided by a
-- reopen, or moved out of the period by a boundary operation).
create or replace function private.assert_transaction_category(
  p_budget_id uuid,
  p_kind public.transaction_kind,
  p_category_id uuid,
  p_seq integer,
  p_kept boolean default false
)
returns void
language plpgsql
stable
set search_path = ''
as $$
declare
  v_category public.categories;
begin
  if p_kind = 'extra_income' then
    if p_category_id is not null then
      raise exception 'invalid_category' using errcode = 'P0001';
    end if;
    return;
  end if;
  if p_category_id is null then
    raise exception 'category_required' using errcode = 'P0001';
  end if;
  select c.* into v_category from public.categories as c
  where c.id = p_category_id and c.budget_id = p_budget_id;
  if v_category.id is null then
    raise exception 'category_not_found' using errcode = 'P0001';
  end if;
  if v_category.is_group then
    raise exception 'category_is_group' using errcode = 'P0001';
  end if;
  if not p_kept and not (v_category.first_seq <= p_seq and (v_category.end_seq is null or p_seq < v_category.end_seq)) then
    raise exception 'category_not_in_force' using errcode = 'P0001';
  end if;
end;
$$;

-- ===========================================================================
-- RPCs: step 2 records, replaced (R-CONCURRENCY-070, R-CONCURRENCY-090, D-150)
--
-- Nothing is deployed, so every edit RPC requires the revision the client read, the direct
-- renames are gone, an income is edited in one call (name and terms), set_primary_income
-- checks the budget's revision, and the boundary operations name the period they act on.
-- ===========================================================================

-- No direct writes any more (D-150): renames go through rename_budget and update_income.
revoke update on table public.budgets, public.incomes from authenticated;
drop policy "Members can rename their budgets" on public.budgets;
drop policy "Members can rename their budgets' incomes" on public.incomes;

-- Rename a budget, refusing when it changed since read. Returns the new revision.
-- R-BUDGET-009, R-CONCURRENCY-070
create or replace function public.rename_budget(p_budget_id uuid, p_name text, p_expected_revision integer)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_name text;
  v_revision integer;
begin
  perform private.assert_member(p_budget_id);
  v_name := private.clean_name(p_name);
  perform private.lock_and_catch_up(p_budget_id);
  select b.revision into v_revision from public.budgets as b where b.id = p_budget_id;
  perform private.assert_revision(v_revision, p_expected_revision);
  update public.budgets set name = v_name where id = p_budget_id returning revision into v_revision;
  return v_revision;
end;
$$;

-- The period from which an edit of an income's terms applies: the current period (or the
-- income's first, if later), or, as an explicit correction, p_from_period_id within the
-- income's validity. Shared by update_income and its preview.
-- R-VERSION-001, R-VERSION-010, R-VERSION-012
create or replace function private.income_edit_seq(p_income public.incomes, p_from_period_id uuid)
returns integer
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_seq integer;
begin
  if p_from_period_id is null then
    if p_income.end_seq is not null then
      raise exception 'income_ended' using errcode = 'P0001';
    end if;
    return greatest(private.current_seq(p_income.budget_id), p_income.first_seq);
  end if;
  v_seq := private.period_seq(p_income.budget_id, p_from_period_id);
  if v_seq < p_income.first_seq then
    raise exception 'invalid_period' using errcode = 'P0001';
  end if;
  if p_income.end_seq is not null and v_seq >= p_income.end_seq then
    raise exception 'income_ended' using errcode = 'P0001';
  end if;
  return v_seq;
end;
$$;

-- The terms an edit writes at period p_seq: each one omitted keeps the value in force there.
-- Shared by update_income and its preview. R-INCOME-004, R-INCOME-014
create or replace function private.income_new_terms(
  p_income_id uuid, p_seq integer, p_amount bigint, p_pay_day integer, p_weekend_rule public.weekend_rule
)
returns table (amount bigint, pay_day integer, weekend_rule public.weekend_rule)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_amount bigint;
  v_pay_day integer;
  v_rule public.weekend_rule;
begin
  select t.amount, t.pay_day, t.weekend_rule into v_amount, v_pay_day, v_rule
  from private.terms_at(p_income_id, p_seq) as t;
  v_amount := coalesce(p_amount, v_amount);
  v_pay_day := coalesce(p_pay_day, v_pay_day);
  v_rule := coalesce(p_weekend_rule, v_rule);
  perform private.assert_income_terms(v_amount, v_pay_day, v_rule);
  return query select v_amount, v_pay_day, v_rule;
end;
$$;

-- Edit an income in one call: its name (p_name) and/or its terms (any of p_amount, p_pay_day,
-- p_weekend_rule; the others keep their value), from the current period or, as an explicit
-- correction, from p_from_period_id until the next existing change; a second edit in the same
-- period replaces the first. Refused with record_changed when the income changed since read,
-- or, with p_previewed_end_date (the end its preview showed), when the current period would
-- now end on another day. For the primary, the current period's end is re-projected.
-- Returns the income's new revision.
-- R-VERSION-001, R-VERSION-005, R-VERSION-006, R-VERSION-010, R-VERSION-012, R-VERSION-007,
-- R-VERSION-008, R-PERIOD-011, R-PERIOD-029, R-PERIOD-036, R-INCOME-050, R-CONCURRENCY-070
drop function public.update_income_terms(uuid, bigint, integer, public.weekend_rule, uuid);
create or replace function public.update_income(
  p_income_id uuid,
  p_expected_revision integer,
  p_name text default null,
  p_amount bigint default null,
  p_pay_day integer default null,
  p_weekend_rule public.weekend_rule default null,
  p_from_period_id uuid default null,
  p_previewed_end_date date default null
)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_income public.incomes;
  v_name text;
  v_seq integer;
  v_terms record;
  v_revision integer;
begin
  if p_name is not null then
    v_name := private.clean_name(p_name);
  end if;
  v_income := private.lock_income(p_income_id);
  perform private.assert_revision(v_income.revision, p_expected_revision);
  if num_nonnulls(p_amount, p_pay_day, p_weekend_rule) > 0 then
    v_seq := private.income_edit_seq(v_income, p_from_period_id);
    select * into v_terms from private.income_new_terms(v_income.id, v_seq, p_amount, p_pay_day, p_weekend_rule);
    insert into public.income_versions (income_id, budget_id, effective_from_seq, amount, pay_day, weekend_rule)
    values (v_income.id, v_income.budget_id, v_seq, v_terms.amount, v_terms.pay_day, v_terms.weekend_rule)
    on conflict (income_id, effective_from_seq) do update
      set amount = excluded.amount, pay_day = excluded.pay_day, weekend_rule = excluded.weekend_rule;
    update public.incomes set name = coalesce(v_name, name), revision = revision + 1 where id = v_income.id;
    if exists (select 1 from public.budgets where id = v_income.budget_id and primary_income_id = v_income.id) then
      perform private.reproject_current_end(v_income.budget_id);
    end if;
    perform private.assert_previewed_end(v_income.budget_id, p_previewed_end_date);
  elsif p_from_period_id is not null then
    raise exception 'invalid_period' using errcode = 'P0001';
  elsif v_name is not null then
    update public.incomes set name = v_name where id = v_income.id;
  end if;
  select i.revision into v_revision from public.incomes as i where i.id = v_income.id;
  return v_revision;
end;
$$;

-- R-PERIOD-036, R-CONCURRENCY-100: a write paired with a preview is refused when the current
-- period no longer ends where the preview said it would (someone changed it meanwhile).
create or replace function private.assert_previewed_end(p_budget_id uuid, p_previewed_end_date date)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if p_previewed_end_date is not null and p_previewed_end_date is distinct from (
    select p.end_date from public.periods as p
    where p.budget_id = p_budget_id and private.today() between p.start_date and p.end_date
  ) then
    raise exception 'record_changed' using errcode = 'P0001';
  end if;
end;
$$;

-- As in step 2, with the required revision. R-INCOME-009, R-INCOME-012, R-INCOME-015,
-- R-INCOME-050, R-CONCURRENCY-070
drop function public.remove_income(uuid, uuid);
create function public.remove_income(
  p_income_id uuid,
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
  v_income public.incomes;
  v_seq integer;
begin
  v_income := private.lock_income(p_income_id);
  perform private.assert_revision(v_income.revision, p_expected_revision);
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

-- As in step 2, with the budget's required revision (the primary income is a budget field).
-- p_previewed_end_date: the end preview_set_primary_income showed. R-INCOME-007, R-INCOME-008,
-- R-INCOME-017, R-PERIOD-029, R-CONCURRENCY-070
drop function public.set_primary_income(uuid);
create function public.set_primary_income(
  p_income_id uuid,
  p_expected_revision integer,
  p_previewed_end_date date default null
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
  v_income := private.lock_income(p_income_id);
  perform private.assert_revision(
    (select b.revision from public.budgets as b where b.id = v_income.budget_id), p_expected_revision);
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
  perform private.assert_previewed_end(v_income.budget_id, p_previewed_end_date);
end;
$$;

-- As in step 2, with the budget's required revision. R-MEMBER-003, R-BUDGET-005,
-- R-BUDGET-007, R-BUDGET-008, R-BUDGET-013, R-PERIOD-032, R-CONCURRENCY-070
drop function public.set_budget_end_date(uuid, date);
create function public.set_budget_end_date(
  p_budget_id uuid,
  p_expected_revision integer,
  p_end_date date default null
)
returns setof public.my_budgets
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.assert_owner(p_budget_id);
  perform private.lock_and_catch_up(p_budget_id);
  perform private.assert_revision(
    (select b.revision from public.budgets as b where b.id = p_budget_id), p_expected_revision);
  perform private.apply_end_date(p_budget_id, p_end_date);
  return query select * from public.my_budgets where id = p_budget_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Previews, with the same arguments as their writes (R-PERIOD-036, D-157)
-- ---------------------------------------------------------------------------

drop function public.preview_expected_pay_date(uuid, integer, public.weekend_rule, uuid);

-- What the current period's end and expected next pay date would become if update_income
-- were called with these terms (and correction period). Computed as the write computes it:
-- the terms in force for the next period after the version the write would insert.
create or replace function public.preview_update_income(
  p_income_id uuid,
  p_amount bigint default null,
  p_pay_day integer default null,
  p_weekend_rule public.weekend_rule default null,
  p_from_period_id uuid default null
)
returns table (period_id uuid, end_date date, expected_pay_date date, end_is_manual boolean)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_income public.incomes;
  v_current public.periods;
  v_seq integer;
  v_terms record;
  v_pay_day integer;
  v_rule public.weekend_rule;
  v_end date;
begin
  select i.* into v_income from public.incomes as i where i.id = p_income_id;
  if v_income.id is null or not private.is_budget_member(v_income.budget_id) then
    raise exception 'income_not_found' using errcode = 'P0001';
  end if;
  v_current := private.current_period(v_income.budget_id);
  if v_current.id is null then
    raise exception 'budget_ended' using errcode = 'P0001';
  end if;
  v_seq := private.income_edit_seq(v_income, p_from_period_id);
  select * into v_terms from private.income_new_terms(v_income.id, v_seq, p_amount, p_pay_day, p_weekend_rule);
  if not exists (select 1 from public.budgets as b where b.id = v_income.budget_id and b.primary_income_id = v_income.id) then
    v_end := v_current.end_date;  -- not the primary: periods do not move
  else
    if exists (select 1 from public.income_versions as iv where iv.income_id = v_income.id
               and iv.effective_from_seq > v_seq and iv.effective_from_seq <= v_current.seq + 1) then
      -- a later version shadows the one the write would insert
      select t.pay_day, t.weekend_rule into v_pay_day, v_rule from private.terms_at(v_income.id, v_current.seq + 1) as t;
    else
      v_pay_day := v_terms.pay_day;
      v_rule := v_terms.weekend_rule;
    end if;
    v_end := private.reprojected_end(v_current, v_pay_day, v_rule);
  end if;
  return query select v_current.id, v_end, v_end + 1, v_current.end_is_manual;
end;
$$;

-- What the current period's end and expected next pay date would become if
-- set_primary_income(p_income_id) were called.
create or replace function public.preview_set_primary_income(p_income_id uuid)
returns table (period_id uuid, end_date date, expected_pay_date date, end_is_manual boolean)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_income public.incomes;
  v_current public.periods;
  v_pay_day integer;
  v_rule public.weekend_rule;
  v_end date;
begin
  select i.* into v_income from public.incomes as i where i.id = p_income_id;
  if v_income.id is null or not private.is_budget_member(v_income.budget_id) then
    raise exception 'income_not_found' using errcode = 'P0001';
  end if;
  v_current := private.current_period(v_income.budget_id);
  if v_current.id is null then
    raise exception 'budget_ended' using errcode = 'P0001';
  end if;
  if v_income.end_seq is not null then
    raise exception 'income_ended' using errcode = 'P0001';
  end if;
  if v_income.first_seq > v_current.seq then
    raise exception 'income_not_in_force' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.budgets as b where b.id = v_income.budget_id and b.primary_income_id = v_income.id) then
    v_end := v_current.end_date;  -- already primary: nothing changes
  else
    select t.pay_day, t.weekend_rule into v_pay_day, v_rule from private.terms_at(v_income.id, v_current.seq + 1) as t;
    v_end := private.reprojected_end(v_current, v_pay_day, v_rule);
  end if;
  return query select v_current.id, v_end, v_end + 1, v_current.end_is_manual;
end;
$$;

-- ---------------------------------------------------------------------------
-- Boundary operations name the period they act on (R-CONCURRENCY-100, D-151)
-- ---------------------------------------------------------------------------

-- The period the client acted on must still be this one, at the revision it read: otherwise
-- someone (or the client's own earlier attempt) changed or removed it.
create or replace function private.assert_period(p_period public.periods, p_period_id uuid, p_expected_revision integer)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_period_id is null or p_expected_revision is null then
    raise exception 'invalid_revision' using errcode = 'P0001';
  end if;
  if p_period.id is distinct from p_period_id then
    raise exception 'record_changed' using errcode = 'P0001';
  end if;
  perform private.assert_revision(p_period.revision, p_expected_revision);
end;
$$;

-- R-PERIOD-013, R-PERIOD-014, R-PERIOD-025, R-PERIOD-033, R-CONCURRENCY-100: as in step 2;
-- p_period_id and p_expected_revision name the current period the client saw.
drop function public.set_expected_pay_date(uuid, date);
create function public.set_expected_pay_date(
  p_budget_id uuid,
  p_period_id uuid,
  p_expected_revision integer,
  p_pay_date date default null
)
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
  perform private.assert_period(v_current, p_period_id, p_expected_revision);
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

-- R-PERIOD-012, R-PERIOD-025, R-PERIOD-034, R-CONCURRENCY-100: as in step 2; names the
-- current period, so a retry after the salary was recorded is refused.
drop function public.record_early_pay_date(uuid, date);
create function public.record_early_pay_date(
  p_budget_id uuid,
  p_period_id uuid,
  p_expected_revision integer,
  p_pay_date date
)
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
  perform private.assert_period(v_current, p_period_id, p_expected_revision);
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

-- R-PERIOD-023, R-PERIOD-025, R-VERSION-011, R-CONCURRENCY-100: as in step 2; p_period_id and
-- p_expected_revision name the current period the client saw, the one to merge. A second call
-- (another member's, or the client's own retry) finds that period gone: record_changed, so
-- a reopen never merges two periods.
drop function public.reopen_previous_period(uuid, date);
create function public.reopen_previous_period(
  p_budget_id uuid,
  p_period_id uuid,
  p_expected_revision integer,
  p_pay_date date default null
)
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
  perform private.assert_period(v_current, p_period_id, p_expected_revision);
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

-- R-PERIOD-012, R-PERIOD-025, R-PERIOD-100, R-CONCURRENCY-100: as in step 2, naming the
-- period's revision. p_start_date null moves the boundary to where the schedule puts it (the
-- previous period's projected end, the day before); a boundary on that day is not marked as
-- set by hand, so moving it back clears the mark (Q-071, D-152).
drop function public.move_period_start(uuid, date);
create function public.move_period_start(
  p_period_id uuid,
  p_expected_revision integer,
  p_start_date date default null
)
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
  v_start date := p_start_date;
  v_scheduled date;
begin
  select p.budget_id into v_budget_id from public.periods as p where p.id = p_period_id;
  if v_budget_id is null or not private.is_budget_member(v_budget_id) then
    raise exception 'period_not_found' using errcode = 'P0001';
  end if;
  if p_start_date is not null and not private.is_sane_date(p_start_date) then
    raise exception 'invalid_boundary' using errcode = 'P0001';
  end if;
  perform private.lock_and_catch_up(v_budget_id);
  select p.* into v_period from public.periods as p where p.id = p_period_id;
  if v_period.id is null then
    raise exception 'period_not_found' using errcode = 'P0001';
  end if;
  perform private.assert_period(v_period, p_period_id, p_expected_revision);
  select p.* into v_previous from public.periods as p
  where p.budget_id = v_budget_id and p.seq = v_period.seq - 1;
  if v_previous.id is null then
    raise exception 'invalid_boundary' using errcode = 'P0001';
  end if;
  v_scheduled := private.projected_end(v_budget_id, v_previous.start_date, v_previous.seq) + 1;
  v_start := coalesce(p_start_date, v_scheduled);
  if v_start > private.today()
     or v_start > coalesce((select b.end_date from public.budgets as b where b.id = v_budget_id), v_start) then
    raise exception 'invalid_boundary' using errcode = 'P0001';
  end if;
  perform private.assert_length(v_previous.start_date, v_start - 1);
  perform private.assert_length(v_start, v_period.end_date);
  update public.periods set end_date = v_start - 1, end_is_manual = v_start <> v_scheduled where id = v_previous.id;
  update public.periods set start_date = v_start where id = v_period.id;
end;
$$;

-- ===========================================================================
-- RPCs: categories
-- ===========================================================================

-- R-CATEGORY-094: room for p_new more categories in force: at most 200 in force and 500 in
-- all, void rows (kept only for their transactions) not counted.
create or replace function private.assert_category_room(p_budget_id uuid, p_new integer)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if (select pg_catalog.count(*) from public.categories as c where c.budget_id = p_budget_id and c.end_seq is null)
       + p_new > private.limit_active_categories()
     or (select pg_catalog.count(*) from public.categories as c
         where c.budget_id = p_budget_id and (c.end_seq is null or c.end_seq > c.first_seq))
       + p_new > private.limit_total_categories() then
    raise exception 'category_limit_reached' using errcode = 'P0001';
  end if;
end;
$$;

-- Create a category (p_parent_id null) or a subcategory of p_parent_id, with its expectation
-- (p_amount per month or per year, default 0), from the current period or, as an explicit
-- correction, from an earlier period (p_from_period_id). Adding the first subcategory makes the
-- parent a group: its expectation versions and transactions move to a subcategory named
-- p_other_name created with it (when it has transactions or a non-zero expectation), so none is
-- ever left on a group. Returns the new category as category_overview shows it.
-- R-CATEGORY-001, R-CATEGORY-002, R-CATEGORY-003, R-CATEGORY-004, R-CATEGORY-090,
-- R-CATEGORY-092, R-CATEGORY-093, R-CATEGORY-094, R-TRANSACTION-072
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
  -- A correction names its period and works in an ended budget too, like every other
  -- correction; from the current period needs one (budget_ended).          (D-158)
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
        or exists (select 1 from public.category_expectations as e where e.category_id = v_parent.id and e.amount > 0);
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

-- Rename a category and/or change its expectation, refusing when it changed since read.
-- p_name null: unchanged. p_amount / p_cadence both null: expectation unchanged; otherwise the
-- new expectation (the one omitted keeps its value) applies from the current period, or, as an
-- explicit correction, from p_from_period_id until the next existing change; a second change
-- in the same period replaces the first. Returns the category as category_overview shows it.
-- R-VERSION-002, R-VERSION-005, R-VERSION-006, R-VERSION-070, R-VERSION-012, R-CATEGORY-003,
-- R-CATEGORY-004, R-CONCURRENCY-070
create or replace function public.update_category(
  p_category_id uuid,
  p_expected_revision integer,
  p_name text default null,
  p_amount bigint default null,
  p_cadence public.expectation_cadence default null,
  p_from_period_id uuid default null
)
returns setof public.category_overview
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_category public.categories;
  v_name text;
  v_seq integer;
  v_amount bigint;
  v_cadence public.expectation_cadence;
begin
  if p_name is not null then
    v_name := private.clean_name(p_name);
  end if;
  v_category := private.lock_category(p_category_id);
  perform private.assert_revision(v_category.revision, p_expected_revision);

  if p_amount is not null or p_cadence is not null then
    if v_category.is_group then
      raise exception 'category_is_group' using errcode = 'P0001';
    end if;
    if p_from_period_id is null then
      if v_category.end_seq is not null then
        raise exception 'category_ended' using errcode = 'P0001';
      end if;
      v_seq := greatest(private.current_seq(v_category.budget_id), v_category.first_seq);
    else
      v_seq := private.period_seq(v_category.budget_id, p_from_period_id);
      if v_seq < v_category.first_seq then
        raise exception 'invalid_period' using errcode = 'P0001';
      end if;
      if v_category.end_seq is not null and v_seq >= v_category.end_seq then
        raise exception 'category_ended' using errcode = 'P0001';
      end if;
    end if;
    select e.amount, e.cadence into v_amount, v_cadence
    from public.category_expectations as e
    where e.category_id = v_category.id and e.effective_from_seq <= v_seq
    order by e.effective_from_seq desc limit 1;
    v_amount := coalesce(p_amount, v_amount);
    v_cadence := coalesce(p_cadence, v_cadence);
    perform private.assert_expectation(v_amount, v_cadence);
    insert into public.category_expectations (category_id, budget_id, effective_from_seq, amount, cadence)
    values (v_category.id, v_category.budget_id, v_seq, v_amount, v_cadence)
    on conflict (category_id, effective_from_seq) do update
      set amount = excluded.amount, cadence = excluded.cadence;
    update public.categories set revision = revision + 1 where id = v_category.id;
  elsif p_from_period_id is not null then
    raise exception 'invalid_period' using errcode = 'P0001';
  end if;

  if v_name is not null then
    update public.categories set name = v_name where id = v_category.id;
  end if;
  return query select * from public.category_overview as o where o.id = v_category.id;
end;
$$;

-- R-CATEGORY-096: set the order of the categories under p_parent_id (top level when null) that
-- have not ended: p_category_ids lists exactly those, in the new order; otherwise someone added
-- or removed one meanwhile (record_changed). Ended ones keep their place for past periods.
create or replace function public.reorder_categories(
  p_budget_id uuid,
  p_category_ids uuid[],
  p_parent_id uuid default null  -- null: the top level (D-156: optional in the client types)
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.assert_member(p_budget_id);
  perform private.lock_and_catch_up(p_budget_id);
  if p_parent_id is not null and not exists (
    select 1 from public.categories as c where c.id = p_parent_id and c.budget_id = p_budget_id
  ) then
    raise exception 'category_not_found' using errcode = 'P0001';
  end if;
  if p_category_ids is null or pg_catalog.cardinality(p_category_ids) > private.limit_total_categories()
     or (select pg_catalog.count(distinct x) from unnest(p_category_ids) as x) <> pg_catalog.cardinality(p_category_ids)
     or exists (
       (select c.id from public.categories as c
        where c.budget_id = p_budget_id and c.parent_id is not distinct from p_parent_id and c.end_seq is null)
       except (select unnest(p_category_ids))
     )
     or exists (
       (select unnest(p_category_ids))
       except (select c.id from public.categories as c
               where c.budget_id = p_budget_id and c.parent_id is not distinct from p_parent_id and c.end_seq is null)
     ) then
    raise exception 'record_changed' using errcode = 'P0001';
  end if;
  update public.categories as c set sort_order = o.position
  from unnest(p_category_ids) with ordinality as o (id, position)
  where c.id = o.id and c.sort_order <> o.position;
end;
$$;

-- Remove a category (with its subcategories) from the current period, or, as an explicit
-- correction, from an earlier period. One that never counted before that period and has no
-- transactions (itself or its subcategories) is deleted; otherwise it ends there and earlier
-- periods keep it; a row with transactions that would never be in force is kept as a void row.
-- Transactions are never deleted. Returns 'deleted' or 'ended'.
-- R-CATEGORY-072, R-CATEGORY-073, R-CATEGORY-095, R-CONCURRENCY-070
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

  if v_seq <= v_category.first_seq and not private.category_has_transactions(v_category.id) then
    delete from public.categories where id = v_category.id;  -- its subcategories cascade
    return 'deleted';
  end if;

  -- The category's new end; its subcategories end within it (R-CATEGORY-095). A subcategory
  -- that never counted before that end but has transactions is kept void at the group's end,
  -- with its earliest expectation moved there (a void row is never in force, so where it sits
  -- only has to satisfy the shape rules), even when it started after that end.
  v_end := greatest(v_seq, v_category.first_seq);
  for r in
    select c.id, c.first_seq,
           exists (select 1 from public.transactions as t where t.category_id = c.id) as has_transactions
    from public.categories as c
    where c.parent_id = v_category.id and (c.end_seq is null or c.end_seq > v_end)
  loop
    if v_end > r.first_seq then
      update public.categories set end_seq = v_end where id = r.id;
    elsif r.has_transactions then
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
  -- Versions from the end on are never in force (a void row keeps the one at its first period).
  delete from public.category_expectations as e
  using public.categories as c
  where c.id = e.category_id and (c.id = v_category.id or c.parent_id = v_category.id)
    and c.end_seq is not null and e.effective_from_seq >= c.end_seq and e.effective_from_seq > c.first_seq;
  return 'ended';
end;
$$;

-- Make a category count from an earlier period, as an explicit correction: it is in force
-- from p_from_period_id (before its first period), with the expectation p_amount / p_cadence
-- there, each defaulting to its earliest expectation. A subcategory cannot start before its
-- group (extend the group first); a group has no expectation of its own. Returns the
-- category. R-CATEGORY-100, R-CATEGORY-093, R-VERSION-070, R-CONCURRENCY-070
create or replace function public.extend_category(
  p_category_id uuid,
  p_expected_revision integer,
  p_from_period_id uuid,
  p_amount bigint default null,
  p_cadence public.expectation_cadence default null
)
returns setof public.category_overview
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_category public.categories;
  v_seq integer;
  v_amount bigint;
  v_cadence public.expectation_cadence;
begin
  v_category := private.lock_category(p_category_id);
  perform private.assert_revision(v_category.revision, p_expected_revision);
  if p_from_period_id is null then
    raise exception 'invalid_period' using errcode = 'P0001';
  end if;
  v_seq := private.period_seq(v_category.budget_id, p_from_period_id);
  if v_seq >= v_category.first_seq then
    raise exception 'invalid_period' using errcode = 'P0001';  -- it already counts from there
  end if;
  if v_category.parent_id is not null and v_seq < (
    select g.first_seq from public.categories as g where g.id = v_category.parent_id
  ) then
    raise exception 'invalid_period' using errcode = 'P0001';
  end if;
  if v_category.is_group then
    if num_nonnulls(p_amount, p_cadence) > 0 then
      raise exception 'category_is_group' using errcode = 'P0001';
    end if;
  else
    select e.amount, e.cadence into v_amount, v_cadence from public.category_expectations as e
    where e.category_id = v_category.id order by e.effective_from_seq limit 1;
    v_amount := coalesce(p_amount, v_amount);
    v_cadence := coalesce(p_cadence, v_cadence);
    perform private.assert_expectation(v_amount, v_cadence);
    insert into public.category_expectations (category_id, budget_id, effective_from_seq, amount, cadence)
    values (v_category.id, v_category.budget_id, v_seq, v_amount, v_cadence);
  end if;
  update public.categories set first_seq = v_seq where id = v_category.id;
  perform private.assert_category_room(v_category.budget_id, 0);  -- a void row now counts
  return query select * from public.category_overview as o where o.id = v_category.id;
end;
$$;

-- Restore an ended category. From the current period (default): in force again from now,
-- with p_amount / p_cadence (defaulting to its last expectation), and nothing expected in the
-- periods between its end and now, so their totals do not change. As an explicit correction
-- from the period it ended (p_from_period_id): as if it had never ended. A subcategory needs
-- its group in force (restore the group first); a group's subcategories stay as they are.
-- Returns the category. R-CATEGORY-101, R-CATEGORY-072, R-VERSION-070, R-CONCURRENCY-070
create or replace function public.restore_category(
  p_category_id uuid,
  p_expected_revision integer,
  p_from_period_id uuid default null,
  p_amount bigint default null,
  p_cadence public.expectation_cadence default null
)
returns setof public.category_overview
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_category public.categories;
  v_seq integer;
  v_amount bigint;
  v_cadence public.expectation_cadence;
begin
  v_category := private.lock_category(p_category_id);
  perform private.assert_revision(v_category.revision, p_expected_revision);
  if v_category.end_seq is null then
    raise exception 'category_not_ended' using errcode = 'P0001';
  end if;
  if p_from_period_id is null then
    v_seq := private.current_seq(v_category.budget_id);
  else
    v_seq := private.period_seq(v_category.budget_id, p_from_period_id);
    if v_seq <> v_category.end_seq then
      raise exception 'invalid_period' using errcode = 'P0001';  -- a correction restores from its end
    end if;
  end if;
  if v_category.parent_id is not null and exists (
    select 1 from public.categories as g where g.id = v_category.parent_id and g.end_seq is not null
  ) then
    raise exception 'category_ended' using errcode = 'P0001';  -- its group has ended
  end if;
  if v_category.is_group and num_nonnulls(p_amount, p_cadence) > 0 then
    raise exception 'category_is_group' using errcode = 'P0001';
  end if;
  if not v_category.is_group then
    select e.amount, e.cadence into v_amount, v_cadence from public.category_expectations as e
    where e.category_id = v_category.id order by e.effective_from_seq desc limit 1;
    v_amount := coalesce(p_amount, v_amount);
    v_cadence := coalesce(p_cadence, v_cadence);
    perform private.assert_expectation(v_amount, v_cadence);
    if v_seq > v_category.end_seq then
      -- the periods between its end and now expect nothing
      insert into public.category_expectations (category_id, budget_id, effective_from_seq, amount, cadence)
      values (v_category.id, v_category.budget_id, v_category.end_seq, 0, 'monthly')
      on conflict (category_id, effective_from_seq) do update set amount = 0, cadence = 'monthly';
    end if;
    insert into public.category_expectations (category_id, budget_id, effective_from_seq, amount, cadence)
    values (v_category.id, v_category.budget_id, v_seq, v_amount, v_cadence)
    on conflict (category_id, effective_from_seq) do update
      set amount = excluded.amount, cadence = excluded.cadence;
  end if;
  update public.categories set end_seq = null where id = v_category.id;
  perform private.assert_category_room(v_category.budget_id, 0);
  return query select * from public.category_overview as o where o.id = v_category.id;
end;
$$;

-- R-TRANSACTION-091: the leaves a transaction dated p_date may use: those in force in the
-- period containing it (ended ones included when they were in force then). Errors as for the
-- date of add_transaction. Members.
-- A named row type for the same reason as category_progress_row: parent_id and parent_name
-- are null for a top-level category.
create type public.category_choice as (
  category_id uuid, parent_id uuid, name text, parent_name text, display_order integer
);

create or replace function public.list_categories_for_date(p_budget_id uuid, p_date date)
returns setof public.category_choice
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_seq integer;
begin
  perform private.assert_member(p_budget_id);
  v_seq := private.transaction_period_seq(p_budget_id, p_date);
  return query
    select c.id, c.parent_id, c.name, p.name,
           (pg_catalog.row_number() over (
              order by coalesce(p.sort_order, c.sort_order), coalesce(p.name, c.name),
                       coalesce(c.parent_id, c.id), c.sort_order, c.name, c.id))::integer
    from private.expectations_in_force(p_budget_id, v_seq) as e
    join public.categories as c on c.id = e.category_id
    left join public.categories as p on p.id = c.parent_id
    order by 5;
end;
$$;

-- ===========================================================================
-- RPCs: transactions
-- ===========================================================================

-- Record an expense, a refund (both on a leaf in force in the period of p_date) or an extra
-- income (no category), dated from the first period's start to today. Returns the new row as
-- transaction_list shows it. Never refused for going over an expectation.
-- R-TRANSACTION-001, R-TRANSACTION-002, R-TRANSACTION-006, R-TRANSACTION-007,
-- R-TRANSACTION-008, R-TRANSACTION-070, R-TRANSACTION-072, R-TRANSACTION-073,
-- R-TRANSACTION-090, R-TRANSACTION-091, R-TRANSACTION-092, R-TRANSACTION-094
create or replace function public.add_transaction(
  p_budget_id uuid,
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
  if (select pg_catalog.count(*) from (
        select 1 from public.transactions as t where t.budget_id = p_budget_id
        limit private.limit_transactions()) as n) >= private.limit_transactions() then
    raise exception 'transaction_limit_reached' using errcode = 'P0001';
  end if;
  insert into public.transactions (budget_id, kind, amount, date, category_id, description, recorded_by)
  values (p_budget_id, p_kind, p_amount, p_date, p_category_id, v_description, (select auth.uid()))
  returning id into v_id;
  return query select * from public.transaction_list as l where l.id = v_id;
end;
$$;

-- Replace a transaction's fields (all of them: omitted category and description become none),
-- in any period, refusing when it changed since read. The same checks as add_transaction,
-- except that a transaction may keep its category while it stays in the same period.
-- R-TRANSACTION-008, R-TRANSACTION-091, R-TRANSACTION-100, R-CONCURRENCY-070
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
begin
  perform private.assert_transaction_amount(p_kind, p_amount);
  v_description := private.clean_description(p_description);
  v_transaction := private.lock_transaction(p_transaction_id);
  perform private.assert_revision(v_transaction.revision, p_expected_revision);
  v_seq := private.transaction_period_seq(v_transaction.budget_id, p_date);
  perform private.assert_transaction_category(v_transaction.budget_id, p_kind, p_category_id, v_seq,
    p_category_id is not distinct from v_transaction.category_id and v_seq = (
      select p.seq from public.periods as p
      where p.budget_id = v_transaction.budget_id and v_transaction.date between p.start_date and p.end_date));
  update public.transactions
  set kind = p_kind, amount = p_amount, date = p_date, category_id = p_category_id, description = v_description
  where id = v_transaction.id;
  return query select * from public.transaction_list as l where l.id = v_transaction.id;
end;
$$;

-- Delete a transaction, in any period, refusing when it changed since read.
-- R-TRANSACTION-008, R-CONCURRENCY-070
create or replace function public.delete_transaction(p_transaction_id uuid, p_expected_revision integer)
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
  delete from public.transactions where id = v_transaction.id;
end;
$$;

-- R-TRANSACTION-095: one page of a budget's transactions, newest first, in the stable order
-- (date desc, created_at desc, id desc). Filters: a date range, a category (a group includes
-- its subcategories), a kind. The next page: pass the last row's date, created_at and id as
-- p_before_*. At most 200 rows per page; each page is an index range scan.
create or replace function public.list_transactions(
  p_budget_id uuid,
  p_limit integer default 50,
  p_from_date date default null,
  p_to_date date default null,
  p_category_id uuid default null,
  p_kind public.transaction_kind default null,
  p_before_date date default null,
  p_before_created_at timestamptz default null,
  p_before_id uuid default null
)
returns setof public.transaction_list
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_sql text := 'select l.* from public.transaction_list as l where l.budget_id = $1';
  v_categories uuid[];
begin
  perform private.assert_member(p_budget_id);
  if p_limit is null or p_limit not between 1 and private.limit_page_size() then
    raise exception 'invalid_limit' using errcode = 'P0001';
  end if;
  if pg_catalog.num_nonnulls(p_before_date, p_before_created_at, p_before_id) not in (0, 3) then
    raise exception 'invalid_cursor' using errcode = 'P0001';
  end if;
  if p_category_id is not null then
    select pg_catalog.array_agg(c.id) into v_categories from public.categories as c
    where c.budget_id = p_budget_id and (c.id = p_category_id or c.parent_id = p_category_id);
    if v_categories is null then
      raise exception 'category_not_found' using errcode = 'P0001';
    end if;
    v_sql := v_sql || ' and l.category_id = any ($5)';
  end if;
  if p_from_date is not null then v_sql := v_sql || ' and l.date >= $2'; end if;
  if p_to_date is not null then v_sql := v_sql || ' and l.date <= $3'; end if;
  if p_kind is not null then v_sql := v_sql || ' and l.kind = $4'; end if;
  if p_before_id is not null then
    v_sql := v_sql || ' and (l.date, l.created_at, l.id) < ($6, $7, $8)';
  end if;
  v_sql := v_sql || ' order by l.date desc, l.created_at desc, l.id desc limit $9';
  return query execute v_sql
    using p_budget_id, p_from_date, p_to_date, p_kind, v_categories,
          p_before_date, p_before_created_at, p_before_id, p_limit;
end;
$$;

-- ===========================================================================
-- RPCs: progress
-- ===========================================================================

-- R-PROGRESS-001, R-PROGRESS-070, R-PROGRESS-071, R-PROGRESS-090, R-PROGRESS-091: the progress
-- of any period, current or past: one row per category and subcategory (see
-- private.category_progress). The period's totals are in period_summaries. Members.
create or replace function public.get_period_progress(p_period_id uuid)
returns setof public.category_progress_row
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_period public.periods;
begin
  select p.* into v_period from public.periods as p where p.id = p_period_id;
  if v_period.id is null or not private.is_budget_member(v_period.budget_id) then
    raise exception 'period_not_found' using errcode = 'P0001';
  end if;
  return query
    select * from private.category_progress(v_period.budget_id, v_period.seq, v_period.start_date, v_period.end_date);
end;
$$;

-- ===========================================================================
-- Privileges
-- ===========================================================================
revoke all on table
  public.categories, public.category_expectations, public.transactions,
  public.category_overview, public.transaction_list
from anon, authenticated, service_role;

grant select on table
  public.categories, public.category_expectations, public.transactions,
  public.category_overview, public.transaction_list
to authenticated;

grant select, insert, update, delete on table
  public.categories, public.category_expectations, public.transactions
to service_role;
grant select on table public.category_overview, public.transaction_list to service_role;

-- Functions: nothing executable by default. New functions get default privileges (PUBLIC,
-- and anon/authenticated in public); step 2's functions grant to authenticated only, so a
-- function with a PUBLIC or anon grant is one this migration created.
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
  private.monthly_share(bigint, public.expectation_cadence),
  private.salary_total(uuid, integer),
  private.expectations_in_force(uuid, integer),
  private.spending_between(uuid, date, date),
  private.extra_income_between(uuid, date, date),
  private.recorder_name(uuid, uuid),
  private.category_has_transactions(uuid)
to authenticated;

grant execute on function
  public.rename_budget(uuid, text, integer),
  public.update_income(uuid, integer, text, bigint, integer, public.weekend_rule, uuid, date),
  public.remove_income(uuid, integer, uuid),
  public.set_primary_income(uuid, integer, date),
  public.set_budget_end_date(uuid, integer, date),
  public.preview_update_income(uuid, bigint, integer, public.weekend_rule, uuid),
  public.preview_set_primary_income(uuid),
  public.set_expected_pay_date(uuid, uuid, integer, date),
  public.record_early_pay_date(uuid, uuid, integer, date),
  public.reopen_previous_period(uuid, uuid, integer, date),
  public.move_period_start(uuid, integer, date),
  public.create_category(uuid, text, uuid, bigint, public.expectation_cadence, uuid, text),
  public.update_category(uuid, integer, text, bigint, public.expectation_cadence, uuid),
  public.reorder_categories(uuid, uuid[], uuid),
  public.end_category(uuid, integer, uuid),
  public.extend_category(uuid, integer, uuid, bigint, public.expectation_cadence),
  public.restore_category(uuid, integer, uuid, bigint, public.expectation_cadence),
  public.list_categories_for_date(uuid, date),
  public.add_transaction(uuid, public.transaction_kind, bigint, date, uuid, text),
  public.update_transaction(uuid, integer, public.transaction_kind, bigint, date, uuid, text),
  public.delete_transaction(uuid, integer),
  public.list_transactions(uuid, integer, date, date, uuid, public.transaction_kind, date, timestamptz, uuid),
  public.get_period_progress(uuid)
to authenticated;

-- ===========================================================================
-- Row-level security (C-RLS-001, C-RLS-002, C-RLS-003, R-SECURITY-001 to R-SECURITY-003)
-- ===========================================================================
alter table public.categories enable row level security;
alter table public.category_expectations enable row level security;
alter table public.transactions enable row level security;

create policy "Members can read their budgets' categories"
  on public.categories for select to authenticated
  using (budget_id in (select private.member_budget_ids()));

create policy "Members can read their budgets' expectations"
  on public.category_expectations for select to authenticated
  using (budget_id in (select private.member_budget_ids()));

create policy "Members can read their budgets' transactions"
  on public.transactions for select to authenticated
  using (budget_id in (select private.member_budget_ids()));
