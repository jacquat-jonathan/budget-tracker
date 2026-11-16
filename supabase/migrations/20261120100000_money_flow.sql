-- Step 7: accounts and money flow (F-MONEYFLOW). Accounts (R-ACCOUNT-001), planned transfers
-- between them with versioned terms (R-ACCOUNT-002, R-ACCOUNT-003, R-VERSION-071), one
-- occurrence per transfer in force and period with its due date (R-ACCOUNT-070, R-ACCOUNT-071),
-- the checklist of manual transfers (R-ACCOUNT-005), automatic transfers assumed done
-- (R-ACCOUNT-004), the transaction of a transfer linked to a category (R-ACCOUNT-072 to
-- R-ACCOUNT-074), the account an income is paid into, and the money flow read from the plan
-- only, never from transactions, with no balance (R-ACCOUNT-006, R-ACCOUNT-075).
--
-- An occurrence is computed (the transfer's terms in force in that period, its due date from
-- that period's boundaries and the chosen income's terms); only what a member did, or what the
-- catch-up created, is stored (public.transfer_occurrences, one row at most per transfer and
-- period). Nothing here deletes a transaction implicitly: a transaction is deleted only when a
-- member undoes "done", marks an automatic transfer as not done, or deletes it (D-355).

-- ===========================================================================
-- Types and limits (one place)                                (R-ACCOUNT-230, D-357)
-- ===========================================================================
create type public.account_kind as enum (
  'current', 'savings', 'third_pillar', 'tax_reserve', 'investment', 'cash', 'credit_card', 'other');
-- R-ACCOUNT-070: an offset in days from a pay date, or a fixed day of the month
create type public.transfer_schedule as enum ('pay_date', 'day_of_month');
-- what a member did with an occurrence, or what the catch-up did ('done' with its transaction)
create type public.transfer_mark as enum ('done', 'skipped', 'not_done');

create function private.limit_active_accounts() returns integer
language sql immutable set search_path = '' as $$ select 50 $$;
create function private.limit_total_accounts() returns integer
language sql immutable set search_path = '' as $$ select 200 $$;
create function private.limit_active_transfers() returns integer
language sql immutable set search_path = '' as $$ select 50 $$;
create function private.limit_total_transfers() returns integer
language sql immutable set search_path = '' as $$ select 200 $$;
create function private.limit_transfer_offset_days() returns integer
language sql immutable set search_path = '' as $$ select 31 $$;
create function private.limit_bank_label_length() returns integer
language sql immutable set search_path = '' as $$ select 100 $$;
create function private.limit_transfer_preview() returns integer
language sql immutable set search_path = '' as $$ select 60 $$;

-- ===========================================================================
-- Tables
-- ===========================================================================

-- R-ACCOUNT-001: an account of the budget. Validity by period number like a category; its
-- name, kind, bank label and holder are not versioned (a rename shows everywhere, D-350). No
-- balance, ever (R-ACCOUNT-075, D-123).
create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  budget_id uuid not null references public.budgets (id) on delete cascade,
  name text not null,
  kind public.account_kind not null,
  bank_label text,
  -- the member it belongs to; null: shared (or the person deleted their account)
  user_id uuid references auth.users (id) on delete set null,
  first_seq integer not null,
  -- end_seq = first_seq is a void row, never in force (R-VERSION-014): kept for what refers to it
  end_seq integer,
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint accounts_name_valid check (name = btrim(name) and char_length(name) between 1 and 100),
  constraint accounts_bank_label_valid check (bank_label is null or (bank_label = btrim(bank_label)
                                              and char_length(bank_label) between 1 and 100)),
  constraint accounts_seq_valid check (first_seq >= 1 and (end_seq is null or end_seq >= first_seq)),
  constraint accounts_id_budget_unique unique (id, budget_id)
);
comment on table public.accounts is
  'Accounts. Validity by period number like categories; no balance; see docs/database.md.';
create index accounts_budget_id_idx on public.accounts (budget_id);
create index accounts_user_id_idx on public.accounts (user_id);

-- R-ACCOUNT-002: a planned transfer. Validity by period number; the terms are in
-- transfer_versions (R-VERSION-071, D-121).
create table public.transfers (
  id uuid primary key default gen_random_uuid(),
  budget_id uuid not null references public.budgets (id) on delete cascade,
  name text not null,
  first_seq integer not null,
  end_seq integer,
  -- R-ACCOUNT-074, D-354: every occurrence in a period up to this one is settled (its
  -- transaction created when it was automatic, linked and due, or nothing to do). Moves back
  -- on an edit of the terms and on a reopen; not an edit (neither revision nor updated_at).
  settled_seq integer not null,
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transfers_name_valid check (name = btrim(name) and char_length(name) between 1 and 100),
  constraint transfers_seq_valid check (first_seq >= 1 and (end_seq is null or end_seq >= first_seq)),
  constraint transfers_settled_valid check (settled_seq >= 0),
  constraint transfers_id_budget_unique unique (id, budget_id)
);
comment on table public.transfers is
  'Planned transfers. Validity by period number; terms in transfer_versions; see docs/database.md.';
create index transfers_budget_id_idx on public.transfers (budget_id);

-- R-ACCOUNT-002, R-ACCOUNT-003, R-ACCOUNT-070 to R-ACCOUNT-072, R-VERSION-071: the terms, one
-- version per period.
create table public.transfer_versions (
  id uuid primary key default gen_random_uuid(),
  transfer_id uuid not null,
  budget_id uuid not null references public.budgets (id) on delete cascade,
  effective_from_seq integer not null,
  from_account_id uuid not null,
  to_account_id uuid not null,
  amount bigint not null,  -- R-MONEY-002: integer rappen, once per period
  schedule public.transfer_schedule not null,
  -- 'pay_date': days after the chosen income's actual pay date in the period (0 to 31)
  offset_days integer,
  -- 'day_of_month': the day (1 to 31), clamped to the month's length, no weekend rule
  day_of_month integer,
  -- 'pay_date': the income whose pay date counts; null: the primary income (R-ACCOUNT-071),
  -- whose actual pay date in a period is the period's start
  income_id uuid,
  is_automatic boolean not null,
  -- R-ACCOUNT-072: the category its transaction goes to; null: no transaction
  category_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transfer_versions_transfer_fk foreign key (transfer_id, budget_id)
    references public.transfers (id, budget_id) on delete cascade,
  constraint transfer_versions_from_fk foreign key (from_account_id, budget_id)
    references public.accounts (id, budget_id),
  constraint transfer_versions_to_fk foreign key (to_account_id, budget_id)
    references public.accounts (id, budget_id),
  constraint transfer_versions_category_fk foreign key (category_id, budget_id)
    references public.categories (id, budget_id),
  constraint transfer_versions_income_fk foreign key (income_id)
    references public.incomes (id) on delete set null,
  constraint transfer_versions_unique unique (transfer_id, effective_from_seq),  -- R-VERSION-006
  constraint transfer_versions_seq_valid check (effective_from_seq >= 1),
  constraint transfer_versions_amount_valid check (amount between 1 and 1000000000),
  constraint transfer_versions_accounts_differ check (from_account_id <> to_account_id),
  constraint transfer_versions_schedule_valid check (
    (schedule = 'pay_date' and offset_days between 0 and 31 and day_of_month is null)
    or (schedule = 'day_of_month' and day_of_month between 1 and 31 and offset_days is null and income_id is null))
);
create index transfer_versions_budget_id_idx on public.transfer_versions (budget_id);
create index transfer_versions_transfer_idx on public.transfer_versions (transfer_id, budget_id);
create index transfer_versions_from_idx on public.transfer_versions (from_account_id, budget_id);
create index transfer_versions_to_idx on public.transfer_versions (to_account_id, budget_id);
create index transfer_versions_category_idx on public.transfer_versions (category_id, budget_id);
create index transfer_versions_income_idx on public.transfer_versions (income_id);

-- R-ACCOUNT-004, R-ACCOUNT-005, R-ACCOUNT-073, R-ACCOUNT-074: what was done with one occurrence
-- (a transfer in one period). No row: a manual one is to do, an automatic one is assumed done
-- once due. 'done' carries the date and the amount moved; its transaction, when linked to a
-- category, points here (transactions.transfer_occurrence_id).
create table public.transfer_occurrences (
  id uuid primary key default gen_random_uuid(),
  budget_id uuid not null references public.budgets (id) on delete cascade,
  transfer_id uuid not null,
  period_id uuid not null,
  mark public.transfer_mark not null,
  done_on date,
  amount bigint,
  -- created by the catch-up (an automatic transfer's transaction), not by a member
  by_catch_up boolean not null default false,
  recorded_by uuid references auth.users (id) on delete set null,
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transfer_occurrences_transfer_fk foreign key (transfer_id, budget_id)
    references public.transfers (id, budget_id) on delete cascade,
  constraint transfer_occurrences_period_fk foreign key (period_id, budget_id)
    references public.periods (id, budget_id) on delete cascade,
  constraint transfer_occurrences_unique unique (transfer_id, period_id),
  constraint transfer_occurrences_id_budget_unique unique (id, budget_id),
  constraint transfer_occurrences_done_valid check (
    (mark = 'done') = (done_on is not null and amount is not null)),
  constraint transfer_occurrences_amount_valid check (amount is null or amount between 1 and 1000000000),
  constraint transfer_occurrences_date_valid check (done_on is null or done_on between date '1900-01-01' and date '2999-12-31')
);
create index transfer_occurrences_budget_id_idx on public.transfer_occurrences (budget_id);
create index transfer_occurrences_period_idx on public.transfer_occurrences (period_id, budget_id);
create index transfer_occurrences_recorded_by_idx on public.transfer_occurrences (recorded_by);

-- The account an income is paid into: part of its terms, versioned with them (D-351).
alter table public.income_versions add column account_id uuid;
alter table public.income_versions add constraint income_versions_account_fk
  foreign key (account_id, budget_id) references public.accounts (id, budget_id);
create index income_versions_account_idx on public.income_versions (account_id, budget_id);

-- R-ACCOUNT-073, R-ACCOUNT-074: a transaction created for an occurrence. Removing the
-- occurrence keeps the transaction, unlinked (D-355); deleting the transaction puts the
-- occurrence back (private.transfer_transaction_deleted).
alter table public.transactions add column transfer_occurrence_id uuid;
alter table public.transactions add constraint transactions_transfer_fk
  foreign key (transfer_occurrence_id, budget_id) references public.transfer_occurrences (id, budget_id)
  on delete set null (transfer_occurrence_id);
alter table public.transactions add constraint transactions_transfer_unique unique (transfer_occurrence_id);
alter table public.transactions drop constraint transactions_one_link;
alter table public.transactions add constraint transactions_one_link
  check (num_nonnulls(subscription_id, debt_id, transfer_occurrence_id) <= 1);
alter table public.transactions drop constraint transactions_link_kind;
alter table public.transactions add constraint transactions_link_kind
  check ((subscription_id is null and debt_id is null and transfer_occurrence_id is null) or kind = 'expense');

create trigger accounts_set_updated_at before update on public.accounts
  for each row execute function private.set_updated_at();
create trigger accounts_bump_revision before update on public.accounts
  for each row execute function private.bump_revision('revision', 'updated_at');
create trigger transfers_set_updated_at before update on public.transfers
  for each row execute function private.touch_updated_at('settled_seq');
create trigger transfers_bump_revision before update on public.transfers
  for each row execute function private.bump_revision('revision', 'updated_at', 'settled_seq');
create trigger transfer_versions_set_updated_at before update on public.transfer_versions
  for each row execute function private.set_updated_at();
create trigger transfer_occurrences_set_updated_at before update on public.transfer_occurrences
  for each row execute function private.set_updated_at();
create trigger transfer_occurrences_bump_revision before update on public.transfer_occurrences
  for each row execute function private.bump_revision('revision', 'updated_at');

-- A transaction of an occurrence stays an expense with no other link (like a payment or a
-- charge); only the database links one (R-ACCOUNT-073).
create function private.guard_transfer_link()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.transfer_occurrence_id is not null
     and (new.kind <> 'expense' or new.subscription_id is not null or new.debt_id is not null
          or (tg_op = 'UPDATE' and old.transfer_occurrence_id is distinct from new.transfer_occurrence_id)) then
    raise exception 'invalid_link' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger transactions_guard_transfer_link before insert or update on public.transactions
  for each row execute function private.guard_transfer_link();

-- R-ACCOUNT-240, D-353: deleting the transaction of an occurrence (by
-- delete_transaction or any other way) puts it back: a manual one is to do again; an automatic
-- one is not done, and its transaction is never created again.
create function private.transfer_transaction_deleted()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.transfer_occurrences
  set mark = 'not_done', done_on = null, amount = null, recorded_by = (select auth.uid())
  where id = old.transfer_occurrence_id and by_catch_up and mark = 'done';
  delete from public.transfer_occurrences
  where id = old.transfer_occurrence_id and not by_catch_up and mark = 'done';
  return null;
end;
$$;
create trigger transactions_transfer_deleted after delete on public.transactions
  for each row when (old.transfer_occurrence_id is not null)
  execute function private.transfer_transaction_deleted();

-- ===========================================================================
-- Merges: accounts, transfers and their versions join the registry (R-VERSION-011,
-- R-VERSION-014); occurrences are merged by private.rekey_period below
-- ===========================================================================
-- Accounts after the rows that refer to them (transfers, incomes), like categories, so an
-- account whose only referrers a merge deletes is deleted rather than left void.
insert into private.period_keyed_tables (table_name, kind, record_kind, name_column, merge_order) values
  ('public.accounts', 'validity', 'account', 'name', 10),
  ('public.transfers', 'validity', 'transfer', 'name', 0);
insert into private.period_keyed_tables (table_name, kind, record_kind, entity_column, entity_table) values
  ('public.transfer_versions', 'version', 'transfer', 'transfer_id', 'public.transfers');

create constraint trigger accounts_not_beyond_latest
  after insert or update of first_seq, end_seq on public.accounts
  deferrable initially deferred
  for each row execute function private.check_nothing_beyond_latest();
create constraint trigger transfers_not_beyond_latest
  after insert or update of first_seq, end_seq on public.transfers
  deferrable initially deferred
  for each row execute function private.check_nothing_beyond_latest();
create constraint trigger transfer_versions_not_beyond_latest
  after insert or update of effective_from_seq on public.transfer_versions
  deferrable initially deferred
  for each row execute function private.check_nothing_beyond_latest();

-- ===========================================================================
-- What the terms cover (R-ACCOUNT-231, R-ACCOUNT-232, R-CATEGORY-230)
-- ===========================================================================
-- A record in force over [p_from, p_to) (p_to null: open-ended) covers it.
create function private.in_force_over(p_first integer, p_end integer, p_from integer, p_to integer)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_first <= p_from and (p_end is null or (p_to is not null and p_end >= p_to))
$$;

-- A transfer's terms, each over the periods it governs within the transfer's validity.
create function private.transfer_spans(p_transfer_id uuid)
returns table (from_account_id uuid, to_account_id uuid, category_id uuid, span_from integer, span_to integer)
language sql
stable
set search_path = ''
as $$
  with r as (select t.first_seq, t.end_seq from public.transfers as t where t.id = p_transfer_id),
  v as (
    select x.from_account_id, x.to_account_id, x.category_id, x.effective_from_seq as f,
           pg_catalog.lead(x.effective_from_seq) over (order by x.effective_from_seq) as nxt
    from public.transfer_versions as x where x.transfer_id = p_transfer_id
  ),
  spans as (
    select v.from_account_id, v.to_account_id, v.category_id, greatest(v.f, r.first_seq) as sf,
           case when v.nxt is null then r.end_seq when r.end_seq is null then v.nxt else least(v.nxt, r.end_seq) end as st
    from v cross join r
  )
  select s.from_account_id, s.to_account_id, s.category_id, s.sf, s.st from spans as s
  where s.st is null or s.st > s.sf
$$;

-- An income's accounts, each over the periods its terms govern within the income's validity.
create function private.income_account_spans(p_income_id uuid)
returns table (account_id uuid, span_from integer, span_to integer)
language sql
stable
set search_path = ''
as $$
  with r as (select i.first_seq, i.end_seq from public.incomes as i where i.id = p_income_id),
  v as (
    select x.account_id, x.effective_from_seq as f,
           pg_catalog.lead(x.effective_from_seq) over (order by x.effective_from_seq) as nxt
    from public.income_versions as x where x.income_id = p_income_id
  ),
  spans as (
    select v.account_id, greatest(v.f, r.first_seq) as sf,
           case when v.nxt is null then r.end_seq when r.end_seq is null then v.nxt else least(v.nxt, r.end_seq) end as st
    from v cross join r
  )
  select s.account_id, s.sf, s.st from spans as s
  where s.account_id is not null and (s.st is null or s.st > s.sf)
$$;

-- R-ACCOUNT-231: what is wrong with a transfer, an income or an account, if anything. Checked
-- at commit by the triggers below, whatever wrote the rows (the RPCs refuse first, with codes).
create function private.moneyflow_shape_violation(p_kind text, p_id uuid)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  v_first integer;
  r record;
  v_problem text;
begin
  if p_kind = 'transfer' then
    select t.first_seq into v_first from public.transfers as t where t.id = p_id;
    if v_first is null then
      return null;
    end if;
    if not exists (select 1 from public.transfer_versions as v
                   where v.transfer_id = p_id and v.effective_from_seq <= v_first) then
      return 'transfer_without_terms';
    end if;
    if exists (select 1 from public.transfer_versions as v join public.categories as c on c.id = v.category_id
               where v.transfer_id = p_id and c.is_group) then
      return 'transfer_on_group';
    end if;
    if exists (select 1 from private.transfer_spans(p_id) as x
               join public.accounts as a on a.id in (x.from_account_id, x.to_account_id)
               where not private.in_force_over(a.first_seq, a.end_seq, x.span_from, x.span_to)) then
      return 'transfer_account_not_in_force';
    end if;
    if exists (select 1 from private.transfer_spans(p_id) as x
               join public.categories as c on c.id = x.category_id
               where not private.in_force_over(c.first_seq, c.end_seq, x.span_from, x.span_to)) then
      return 'transfer_category_not_in_force';
    end if;
  elsif p_kind = 'income' then
    if exists (select 1 from private.income_account_spans(p_id) as x
               join public.accounts as a on a.id = x.account_id
               where not private.in_force_over(a.first_seq, a.end_seq, x.span_from, x.span_to)) then
      return 'income_account_not_in_force';
    end if;
  elsif p_kind = 'account' then
    for r in
      select distinct 'transfer' as kind, v.transfer_id as id from public.transfer_versions as v
      where v.from_account_id = p_id or v.to_account_id = p_id
      union
      select distinct 'income', v.income_id from public.income_versions as v where v.account_id = p_id
    loop
      v_problem := private.moneyflow_shape_violation(r.kind, r.id);
      if v_problem is not null then
        return v_problem;
      end if;
    end loop;
  elsif p_kind = 'category' then
    if exists (select 1 from public.categories as c where c.id = p_id and c.is_group)
       and exists (select 1 from public.transfer_versions as v where v.category_id = p_id) then
      return 'transfer_on_group';
    end if;
    for r in select distinct v.transfer_id as id from public.transfer_versions as v where v.category_id = p_id loop
      v_problem := private.moneyflow_shape_violation('transfer', r.id);
      if v_problem is not null then
        return v_problem;
      end if;
    end loop;
  end if;
  return null;
end;
$$;

create function private.check_moneyflow_shape()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_problem text;
  v_row record;
begin
  -- Deferred: read the rows as they are now. A row deleted since is not checked.
  if tg_op = 'DELETE' then v_row := old; else v_row := new; end if;
  if tg_table_name = 'transfers' then
    v_problem := private.moneyflow_shape_violation('transfer', v_row.id);
  elsif tg_table_name = 'transfer_versions' then
    v_problem := private.moneyflow_shape_violation('transfer', v_row.transfer_id);
  elsif tg_table_name = 'incomes' then
    v_problem := private.moneyflow_shape_violation('income', v_row.id);
  elsif tg_table_name = 'income_versions' then
    v_problem := private.moneyflow_shape_violation('income', v_row.income_id);
  elsif tg_table_name = 'accounts' then
    v_problem := private.moneyflow_shape_violation('account', v_row.id);
  elsif tg_table_name = 'categories' then
    v_problem := private.moneyflow_shape_violation('category', v_row.id);
  end if;
  if v_problem is not null then
    raise exception 'moneyflow_shape_invalid: %', v_problem using errcode = '23514';
  end if;
  return null;
end;
$$;

create constraint trigger transfers_shape
  after insert or update of first_seq, end_seq on public.transfers
  deferrable initially deferred
  for each row execute function private.check_moneyflow_shape();
create constraint trigger transfer_versions_shape
  after insert or update or delete on public.transfer_versions
  deferrable initially deferred
  for each row execute function private.check_moneyflow_shape();
create constraint trigger accounts_shape
  after update of first_seq, end_seq on public.accounts
  deferrable initially deferred
  for each row execute function private.check_moneyflow_shape();
create constraint trigger income_versions_account_shape
  after insert or update of account_id, effective_from_seq or delete on public.income_versions
  deferrable initially deferred
  for each row execute function private.check_moneyflow_shape();
create constraint trigger incomes_account_shape
  after update of first_seq, end_seq on public.incomes
  deferrable initially deferred
  for each row execute function private.check_moneyflow_shape();
create constraint trigger categories_moneyflow_shape
  after update of is_group, first_seq, end_seq on public.categories
  deferrable initially deferred
  for each row execute function private.check_moneyflow_shape();

-- R-ACCOUNT-232: an account is in use from period p_from when the terms of a transfer or an
-- income in force from then on name it (closing it from then is refused).
create function private.account_in_use(p_account_id uuid, p_from integer)
returns boolean
language plpgsql
stable
set search_path = ''
as $$
begin
  if not exists (select 1 from public.transfer_versions as v where v.from_account_id = p_account_id)
     and not exists (select 1 from public.transfer_versions as v where v.to_account_id = p_account_id)
     and not exists (select 1 from public.income_versions as v where v.account_id = p_account_id) then
    return false;  -- nothing ever named it: three index probes
  end if;
  return exists (
    select 1 from (select distinct v.transfer_id from public.transfer_versions as v
                   where v.from_account_id = p_account_id or v.to_account_id = p_account_id) as u
    cross join lateral private.transfer_spans(u.transfer_id) as x
    where p_account_id in (x.from_account_id, x.to_account_id) and (x.span_to is null or x.span_to > p_from)
  ) or exists (
    select 1 from (select distinct v.income_id from public.income_versions as v where v.account_id = p_account_id) as u
    cross join lateral private.income_account_spans(u.income_id) as x
    where x.account_id = p_account_id and (x.span_to is null or x.span_to > p_from)
  );
end;
$$;

-- R-ACCOUNT-232: what uses it from p_from on, as JSON [{kind, id, name}] (the error's detail).
create function private.account_users(p_account_id uuid, p_from integer)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('kind', u.kind, 'id', u.id, 'name', u.name)
                                       order by u.kind, u.name, u.id), '[]'::jsonb)
  from (
    select distinct 'income' as kind, i.id, i.name
    from (select distinct v.income_id from public.income_versions as v where v.account_id = p_account_id) as w
    join public.incomes as i on i.id = w.income_id
    cross join lateral private.income_account_spans(i.id) as x
    where x.account_id = p_account_id and (x.span_to is null or x.span_to > p_from)
    union
    select distinct 'transfer', t.id, t.name
    from (select distinct v.transfer_id from public.transfer_versions as v
          where v.from_account_id = p_account_id or v.to_account_id = p_account_id) as w
    join public.transfers as t on t.id = w.transfer_id
    cross join lateral private.transfer_spans(t.id) as x
    where p_account_id in (x.from_account_id, x.to_account_id) and (x.span_to is null or x.span_to > p_from)
  ) as u
$$;

-- Anything ever named it (a version of a transfer or an income): it is ended, never deleted.
create function private.account_referenced(p_account_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (select 1 from public.transfer_versions as v where v.from_account_id = p_account_id)
      or exists (select 1 from public.transfer_versions as v where v.to_account_id = p_account_id)
      or exists (select 1 from public.income_versions as v where v.account_id = p_account_id)
$$;

-- R-CATEGORY-230: a transfer linked to a category uses it like a subscription or a debt (step 4,
-- R-CATEGORY-130, R-CATEGORY-131), so the three helpers of step 4 learn about transfers.
create or replace function private.category_in_use(p_category_id uuid, p_from integer)
returns boolean
language plpgsql
stable
set search_path = ''
set enable_seqscan = off
as $$
declare
  v_ids uuid[] := array(select c.id from public.categories as c where c.id = p_category_id or c.parent_id = p_category_id);
begin
  if not exists (select 1 from public.subscription_versions as v where v.category_id = any (v_ids))
     and not exists (select 1 from public.debt_versions as v where v.category_id = any (v_ids))
     and not exists (select 1 from public.transfer_versions as v where v.category_id = any (v_ids)) then
    return false;  -- nothing ever used it (most categories): three index probes
  end if;
  return exists (
    select 1
    from public.subscription_versions as v
    join public.subscriptions as s on s.id = v.subscription_id
    where v.category_id = any (v_ids)
      and (s.end_seq is null or s.end_seq > p_from)
      and coalesce((select pg_catalog.min(x.effective_from_seq) from public.subscription_versions as x
                    where x.subscription_id = v.subscription_id and x.effective_from_seq > v.effective_from_seq),
                   2147483647) > greatest(p_from, s.first_seq)
      and (s.end_seq is null or s.end_seq > greatest(v.effective_from_seq, s.first_seq))
  ) or exists (
    select 1
    from public.debt_versions as v
    join public.debts as d on d.id = v.debt_id
    where v.category_id = any (v_ids)
      and (d.end_seq is null or d.end_seq > p_from)
      and coalesce((select pg_catalog.min(x.effective_from_seq) from public.debt_versions as x
                    where x.debt_id = v.debt_id and x.effective_from_seq > v.effective_from_seq),
                   2147483647) > greatest(p_from, d.first_seq)
      and (d.end_seq is null or d.end_seq > greatest(v.effective_from_seq, d.first_seq))
  ) or exists (
    select 1
    from (select distinct v.transfer_id from public.transfer_versions as v where v.category_id = any (v_ids)) as u
    cross join lateral private.transfer_spans(u.transfer_id) as x
    where x.category_id = any (v_ids) and (x.span_to is null or x.span_to > p_from)
  );
end;
$$;

create or replace function private.category_users(p_category_id uuid, p_from integer)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('kind', u.kind, 'id', u.id, 'name', u.name)
                                       order by u.kind, u.name, u.id), '[]'::jsonb)
  from (
    select distinct 'subscription' as kind, s.id, s.name
    from public.subscriptions as s
    cross join lateral private.terms_spans('subscription', s.id) as x
    where s.budget_id = (select c.budget_id from public.categories as c where c.id = p_category_id)
      and x.category_id in (select c.id from public.categories as c where c.id = p_category_id or c.parent_id = p_category_id)
      and (x.span_to is null or x.span_to > p_from)
    union
    select distinct 'debt', d.id, d.name
    from public.debts as d
    cross join lateral private.terms_spans('debt', d.id) as x
    where d.budget_id = (select c.budget_id from public.categories as c where c.id = p_category_id)
      and x.category_id in (select c.id from public.categories as c where c.id = p_category_id or c.parent_id = p_category_id)
      and (x.span_to is null or x.span_to > p_from)
    union
    select distinct 'transfer', t.id, t.name
    from public.transfers as t
    cross join lateral private.transfer_spans(t.id) as x
    where t.budget_id = (select c.budget_id from public.categories as c where c.id = p_category_id)
      and x.category_id in (select c.id from public.categories as c where c.id = p_category_id or c.parent_id = p_category_id)
      and (x.span_to is null or x.span_to > p_from)
  ) as u
$$;

create or replace function private.category_referenced(p_category_id uuid)
returns boolean
language plpgsql
stable
set search_path = ''
set enable_seqscan = off
as $$
declare
  v_ids uuid[] := array(select c.id from public.categories as c where c.id = p_category_id or c.parent_id = p_category_id);
begin
  return exists (select 1 from public.subscription_versions as v where v.category_id = any (v_ids))
      or exists (select 1 from public.debt_versions as v where v.category_id = any (v_ids))
      or exists (select 1 from public.transfer_versions as v where v.category_id = any (v_ids));
end;
$$;

-- ===========================================================================
-- Due dates (R-ACCOUNT-070, R-ACCOUNT-071, R-ACCOUNT-239, D-352)
-- ===========================================================================
-- The income's terms count in period p_seq.
create function private.income_in_force(p_income_id uuid, p_seq integer)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (select 1 from public.incomes as i
                 where i.id = p_income_id and i.first_seq <= p_seq and (i.end_seq is null or p_seq < i.end_seq))
$$;

-- One occurrence per transfer and period (R-ACCOUNT-239). Its due date, never before the
-- period's start nor after its last day (capped there):
-- * 'day_of_month': the first date with that day (clamped to the month's length, no weekend
--   rule) on or after the period's start;
-- * 'pay_date': the chosen income's actual pay date in the period (its first pay date on or
--   after the period's start, under its terms in force then) plus the offset; with no income
--   chosen, or when the chosen one is not in force in that period, the primary income's,
--   which is the period's start (a period starts on it: early salaries and moved boundaries
--   included).
create function private.transfer_due_date(
  p_start date, p_end date, p_seq integer, p_schedule public.transfer_schedule,
  p_offset_days integer, p_day_of_month integer, p_income_id uuid
)
returns date
language sql
stable
set search_path = ''
as $$
  select least(p_end,
    case p_schedule
      when 'day_of_month' then
        case when private.month_day(private.month_index(p_start), p_day_of_month) >= p_start
             then private.month_day(private.month_index(p_start), p_day_of_month)
             else private.month_day(private.month_index(p_start) + 1, p_day_of_month) end
      else coalesce((select private.next_pay_date(p_start, t.pay_day, t.weekend_rule)
                     from public.incomes as i
                     cross join lateral private.terms_at(i.id, p_seq) as t
                     where i.id = p_income_id and i.first_seq <= p_seq and (i.end_seq is null or p_seq < i.end_seq)),
                    p_start) + p_offset_days
    end)
$$;

-- The occurrences of one period: every transfer in force in it, at its terms in force then.
create function private.transfer_plan(p_budget_id uuid, p_seq integer)
returns table (
  transfer_id uuid, name text, period_id uuid, start_date date, end_date date, terms_from_seq integer,
  from_account_id uuid, to_account_id uuid, amount bigint, schedule public.transfer_schedule,
  offset_days integer, day_of_month integer, income_id uuid, is_automatic boolean, category_id uuid,
  due_date date, follows_primary boolean
)
language sql
stable
set search_path = ''
as $$
  select t.id, t.name, p.id, p.start_date, p.end_date, v.effective_from_seq,
         v.from_account_id, v.to_account_id, v.amount, v.schedule, v.offset_days, v.day_of_month, v.income_id,
         v.is_automatic, v.category_id,
         private.transfer_due_date(p.start_date, p.end_date, p.seq, v.schedule, v.offset_days, v.day_of_month, v.income_id),
         v.income_id is not null and not private.income_in_force(v.income_id, p.seq)
  from public.periods as p
  join public.transfers as t
    on t.budget_id = p.budget_id and t.first_seq <= p.seq and (t.end_seq is null or p.seq < t.end_seq)
  cross join lateral (
    select x.* from public.transfer_versions as x
    where x.transfer_id = t.id and x.effective_from_seq <= p.seq
    order by x.effective_from_seq desc limit 1
  ) as v
  where p.budget_id = p_budget_id and p.seq = p_seq
$$;

-- ===========================================================================
-- The catch-up creates the transactions of automatic linked transfers (R-ACCOUNT-074, D-354)
-- ===========================================================================
-- Is an occurrence's transaction due and not yet created? Without the lock: one check per
-- transfer whose occurrence in the latest period is not settled, and nothing else.
create function private.transfers_pending(p_budget_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  with l as (
    select p.seq, p.id, p.start_date, p.end_date from public.periods as p
    where p.budget_id = p_budget_id order by p.seq desc limit 1
  )
  select exists (
    select 1
    from public.transfers as t cross join l
    where t.budget_id = p_budget_id and t.settled_seq < l.seq
      and (t.end_seq is null or t.settled_seq + 1 < t.end_seq)
      and (greatest(t.settled_seq + 1, t.first_seq) < l.seq
           or exists (
             select 1
             from (select x.* from public.transfer_versions as x
                   where x.transfer_id = t.id and x.effective_from_seq <= l.seq
                   order by x.effective_from_seq desc limit 1) as v
             where v.is_automatic and v.category_id is not null
               and not exists (select 1 from public.transfer_occurrences as o
                               where o.transfer_id = t.id and o.period_id = l.id)
               and private.transfer_due_date(l.start_date, l.end_date, l.seq, v.schedule, v.offset_days,
                                             v.day_of_month, v.income_id) <= private.charge_horizon(p_budget_id)))
  )
$$;

-- A subscription charge or a transfer's transaction is due (and there is room for it).
create or replace function private.charges_pending(p_budget_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select (exists (
            select 1 from public.subscriptions as s
            where s.budget_id = p_budget_id and s.next_due <= private.charge_horizon(p_budget_id))
          or private.transfers_pending(p_budget_id))
         and private.transaction_room(p_budget_id) > 0
$$;

-- R-ACCOUNT-074: for every occurrence of an automatic transfer linked to a category, due on or
-- before today (and the budget's last day), not marked, one transaction, dated its due date,
-- at the planned amount in the category of the terms in force in its period, confirmed (no
-- confirmation for transfers, D-353). Exactly once (one occurrence row per transfer and
-- period); none skipped (each transfer's periods in order, settled_seq moving past a period
-- only once it is settled); held back when the budget is full (the rest wait for room, like
-- subscription charges: R-SUBSCRIPTION-111). Bounded by the periods of the step.
create function private.materialise_transfers(p_budget_id uuid)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_upto date := private.charge_horizon(p_budget_id);
  v_latest integer;
  v_room integer;
  v_made integer := 0;
  v_inserted integer;
  v_settled integer;
  v_full boolean := false;
  v_pids uuid[];
  v_dues date[];
  v_amounts bigint[];
  v_categories uuid[];
  t public.transfers;
  r record;
begin
  select pg_catalog.max(p.seq) into v_latest from public.periods as p where p.budget_id = p_budget_id;
  if v_latest is null or v_upto is null then
    return 0;
  end if;
  v_room := greatest(private.transaction_room(p_budget_id), 0);
  for t in
    select x.* from public.transfers as x
    where x.budget_id = p_budget_id and x.settled_seq < v_latest
    order by x.created_at, x.id
  loop
    v_settled := v_latest;
    v_pids := '{}'; v_dues := '{}'; v_amounts := '{}'; v_categories := '{}';
    for r in
      select y.id as period_id, y.seq, v.amount, v.category_id,
             case when v.is_automatic and v.category_id is not null
                  then private.transfer_due_date(y.start_date, y.end_date, y.seq, v.schedule, v.offset_days,
                                                 v.day_of_month, v.income_id) end as due,
             exists (select 1 from public.transfer_occurrences as o
                     where o.transfer_id = t.id and o.period_id = y.id) as marked
      from public.periods as y
      cross join lateral (
        select x.* from public.transfer_versions as x
        where x.transfer_id = t.id and x.effective_from_seq <= y.seq
        order by x.effective_from_seq desc limit 1
      ) as v
      where y.budget_id = p_budget_id and y.seq > t.settled_seq and y.seq <= v_latest
        and y.seq >= t.first_seq and (t.end_seq is null or y.seq < t.end_seq)
      order by y.seq
    loop
      continue when r.due is null or r.marked;
      if r.due > v_upto then
        v_settled := r.seq - 1;  -- due later in its period (only the latest one)
        exit;
      end if;
      if pg_catalog.cardinality(v_pids) >= v_room then
        v_settled := r.seq - 1;  -- the budget is full: hold back from here
        v_full := true;
        exit;
      end if;
      v_pids := v_pids || r.period_id;
      v_dues := v_dues || r.due;
      v_amounts := v_amounts || r.amount;
      v_categories := v_categories || r.category_id;
    end loop;
    if pg_catalog.cardinality(v_pids) > 0 then
      with made as (
        insert into public.transfer_occurrences (budget_id, transfer_id, period_id, mark, done_on, amount, by_catch_up)
        select p_budget_id, t.id, u.pid, 'done', u.due, u.amount, true
        from unnest(v_pids, v_dues, v_amounts) as u (pid, due, amount)
        on conflict (transfer_id, period_id) do nothing
        returning id, period_id, done_on, amount
      )
      insert into public.transactions (budget_id, kind, amount, date, category_id, transfer_occurrence_id)
      select p_budget_id, 'expense', made.amount, made.done_on, u.category_id, made.id
      from made join unnest(v_pids, v_categories) as u (pid, category_id) on u.pid = made.period_id;
      get diagnostics v_inserted = row_count;
      v_room := v_room - v_inserted;
      v_made := v_made + v_inserted;
    end if;
    update public.transfers set settled_seq = greatest(v_settled, settled_seq) where id = t.id;
    exit when v_full;
  end loop;
  return v_made;
end;
$$;

-- The catch-up of step 4 (D-270, D-276), with the transfers' transactions after the charges.
create or replace function private.ensure_periods(p_budget_id uuid, p_max integer default null)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_today date := private.today();
  v_end date;
  v_last public.periods;
  v_start date;
  v_created integer := 0;
  v_started timestamptz;
begin
  -- Fast path, without the lock: nothing to create, no charge or transfer due.
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
  v_started := pg_catalog.clock_timestamp();
  loop
    exit when v_created >= least(coalesce(p_max, private.limit_catch_up_periods()), private.limit_catch_up_periods());
    -- D-276: and at most about two seconds of work (with the charges and the commit, a step
    -- stays well under the API's 8 s statement timeout whatever the budget holds)
    exit when v_created > 0 and pg_catalog.clock_timestamp() - v_started > interval '2 seconds';
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
  end loop;
  perform private.materialise_charges(p_budget_id);
  perform private.materialise_transfers(p_budget_id);
  return v_created;
end;
$$;

-- ===========================================================================
-- Reads: overviews                                  (R-ACCOUNT-001, R-ACCOUNT-002)
-- ===========================================================================
-- The holder's display name, for members of the budget (also once the holder has left).
create function private.account_holder_name(p_budget_id uuid, p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.display_name from public.profiles as p
  where p.id = p_user_id
    and p_budget_id in (select private.member_budget_ids())
    and exists (select 1 from public.accounts as a where a.user_id = p_user_id and a.budget_id = p_budget_id)
$$;

create view public.account_overview with (security_invoker = true) as
select a.id, a.budget_id, a.name, a.kind, a.bank_label, a.user_id,
       private.account_holder_name(a.budget_id, a.user_id) as user_display_name,
       case when a.user_id is not null
            then exists (select 1 from public.budget_members as m
                         where m.budget_id = a.budget_id and m.user_id = a.user_id) end as user_is_member,
       a.end_seq is null and a.first_seq <= r.seq as is_active,
       a.first_seq, a.end_seq,
       h.in_use,
       not h.referenced and a.first_seq >= r.seq as removal_deletes,
       a.revision, a.created_at, a.updated_at
from public.accounts as a
cross join lateral (select private.reading_seq(a.budget_id) as seq offset 0) as r
cross join lateral (select private.account_in_use(a.id, r.seq) as in_use,
                           private.account_referenced(a.id) as referenced offset 0) as h;

-- The next due date: this period's occurrence while not yet due, else the next period's (its
-- projected boundaries, the terms in force now); null when ended or after the budget's end.
create function private.transfer_next_due(p_transfer_id uuid)
returns date
language plpgsql
stable
set search_path = ''
as $$
declare
  v_t public.transfers;
  v_current public.periods;
  v_plan record;
  v_start date;
  v_end date;
  v_budget_end date;
  v_today date := private.today();
begin
  select t.* into v_t from public.transfers as t where t.id = p_transfer_id;
  if v_t.end_seq is not null then
    return null;
  end if;
  select p.* into v_current from public.periods as p
  where p.budget_id = v_t.budget_id and v_today between p.start_date and p.end_date;
  if v_current.id is null then
    return null;
  end if;
  select x.* into v_plan from private.transfer_plan(v_t.budget_id, v_current.seq) as x where x.transfer_id = v_t.id;
  if v_plan.transfer_id is not null and v_plan.due_date >= v_today then
    return v_plan.due_date;
  end if;
  v_start := v_current.end_date + 1;
  v_budget_end := private.budget_end_date(v_t.budget_id);
  if v_budget_end is not null and v_start > v_budget_end then
    return null;
  end if;
  v_end := private.future_period_end(v_t.budget_id, v_current, 1);
  return (select private.transfer_due_date(v_start, v_end, v_current.seq + 1, v.schedule, v.offset_days,
                                           v.day_of_month, v.income_id)
          from public.transfer_versions as v where v.transfer_id = v_t.id
          order by v.effective_from_seq desc limit 1);
end;
$$;

create view public.transfer_overview with (security_invoker = true) as
select t.id, t.budget_id, t.name,
       t.end_seq is null and t.first_seq <= r.seq as is_active,
       t.first_seq, t.end_seq,
       v.from_account_id, fa.name as from_account_name, v.to_account_id, ta.name as to_account_name,
       v.amount, v.schedule, v.offset_days, v.day_of_month, v.income_id, i.name as income_name,
       v.is_automatic, v.category_id, c.name as category_name, c.parent_id as parent_category_id,
       pc.name as parent_category_name,
       v.effective_from_seq as terms_from_seq,
       v.income_id is not null and not private.income_in_force(v.income_id, r.seq) as follows_primary,
       private.transfer_next_due(t.id) as next_due_date,
       n.mark_count > 0 as has_history,
       n.mark_count = 0 and t.first_seq >= r.seq as removal_deletes,
       n.transaction_count,
       t.revision, t.created_at, t.updated_at
from public.transfers as t
cross join lateral (select private.reading_seq(t.budget_id) as seq offset 0) as r
join lateral (
  select tv.* from public.transfer_versions as tv
  where tv.transfer_id = t.id
  order by (tv.effective_from_seq <= r.seq) desc,
           case when tv.effective_from_seq <= r.seq then -tv.effective_from_seq else tv.effective_from_seq end
  limit 1
) as v on true
join public.accounts as fa on fa.id = v.from_account_id
join public.accounts as ta on ta.id = v.to_account_id
left join public.incomes as i on i.id = v.income_id
left join public.categories as c on c.id = v.category_id
left join public.categories as pc on pc.id = c.parent_id
cross join lateral (
  select pg_catalog.count(*)::integer as mark_count,
         pg_catalog.count(x.id)::integer as transaction_count
  from public.transfer_occurrences as o
  left join public.transactions as x on x.transfer_occurrence_id = o.id
  where o.transfer_id = t.id
) as n;

-- ===========================================================================
-- Locks and checks
-- ===========================================================================
create function private.lock_account(p_account_id uuid)
returns public.accounts
language plpgsql
set search_path = ''
as $$
declare
  v_budget_id uuid;
  v_account public.accounts;
begin
  select a.budget_id into v_budget_id from public.accounts as a where a.id = p_account_id;
  if v_budget_id is null or not private.is_budget_member(v_budget_id) then
    raise exception 'account_not_found' using errcode = 'P0001';
  end if;
  perform private.lock_and_catch_up(v_budget_id);
  select a.* into v_account from public.accounts as a where a.id = p_account_id;
  if v_account.id is null then
    raise exception 'account_not_found' using errcode = 'P0001';
  end if;
  return v_account;
end;
$$;

create function private.lock_transfer(p_transfer_id uuid)
returns public.transfers
language plpgsql
set search_path = ''
as $$
declare
  v_budget_id uuid;
  v_transfer public.transfers;
begin
  select t.budget_id into v_budget_id from public.transfers as t where t.id = p_transfer_id;
  if v_budget_id is null or not private.is_budget_member(v_budget_id) then
    raise exception 'transfer_not_found' using errcode = 'P0001';
  end if;
  perform private.lock_and_catch_up(v_budget_id);
  select t.* into v_transfer from public.transfers as t where t.id = p_transfer_id;
  if v_transfer.id is null then
    raise exception 'transfer_not_found' using errcode = 'P0001';
  end if;
  return v_transfer;
end;
$$;

-- R-ACCOUNT-230: 50 accounts in force, 200 in all (void ones not counted), 900 rows a budget.
create function private.assert_account_room(p_budget_id uuid)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if (select pg_catalog.count(*) from public.accounts as a where a.budget_id = p_budget_id and a.end_seq is null)
       + 1 > private.limit_active_accounts()
     or (select pg_catalog.count(*) from public.accounts as a
         where a.budget_id = p_budget_id and (a.end_seq is null or a.end_seq > a.first_seq))
       + 1 > private.limit_total_accounts()
     or (select pg_catalog.count(*) from public.accounts as a where a.budget_id = p_budget_id)
       + 1 > private.limit_rows_per_kind() then
    raise exception 'account_limit_reached' using errcode = 'P0001';
  end if;
end;
$$;

-- R-ACCOUNT-230: 50 transfers in force, 200 in all (void ones not counted), 900 rows a budget.
create function private.assert_transfer_room(p_budget_id uuid)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if (select pg_catalog.count(*) from public.transfers as t where t.budget_id = p_budget_id and t.end_seq is null)
       + 1 > private.limit_active_transfers()
     or (select pg_catalog.count(*) from public.transfers as t
         where t.budget_id = p_budget_id and (t.end_seq is null or t.end_seq > t.first_seq))
       + 1 > private.limit_total_transfers()
     or (select pg_catalog.count(*) from public.transfers as t where t.budget_id = p_budget_id)
       + 1 > private.limit_rows_per_kind() then
    raise exception 'transfer_limit_reached' using errcode = 'P0001';
  end if;
end;
$$;

create function private.clean_bank_label(p_label text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_label text := btrim(p_label);
begin
  if v_label is null or v_label = '' then
    return null;
  end if;
  if char_length(v_label) > private.limit_bank_label_length() then
    raise exception 'invalid_bank_label' using errcode = 'P0001';
  end if;
  return v_label;
end;
$$;

-- An account of the budget, in force over [p_from, p_to) (p_to null: open-ended).
create function private.assert_account(p_budget_id uuid, p_account_id uuid, p_from integer, p_to integer)
returns void
language plpgsql
stable
set search_path = ''
as $$
declare
  v_account public.accounts;
begin
  if p_account_id is null then
    raise exception 'account_required' using errcode = 'P0001';
  end if;
  select a.* into v_account from public.accounts as a where a.id = p_account_id and a.budget_id = p_budget_id;
  if v_account.id is null then
    raise exception 'account_not_found' using errcode = 'P0001';
  end if;
  if p_to is not null and p_to <= p_from then
    return;  -- the terms govern no period (a void record)
  end if;
  if not private.in_force_over(v_account.first_seq, v_account.end_seq, p_from, p_to) then
    raise exception 'account_not_in_force' using errcode = 'P0001';
  end if;
end;
$$;

-- R-ACCOUNT-002, R-ACCOUNT-070, R-ACCOUNT-072: a transfer's terms over [p_from, p_to).
create function private.assert_transfer_terms(
  p_budget_id uuid, p_from integer, p_to integer, p_from_account_id uuid, p_to_account_id uuid, p_amount bigint,
  p_schedule public.transfer_schedule, p_offset_days integer, p_day_of_month integer, p_income_id uuid,
  p_is_automatic boolean, p_category_id uuid
)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if p_amount is null or p_amount not between 1 and private.limit_amount() then
    raise exception 'invalid_amount' using errcode = 'P0001';
  end if;
  if p_schedule is null then
    raise exception 'invalid_schedule' using errcode = 'P0001';
  end if;
  if p_schedule = 'pay_date' then
    if p_day_of_month is not null then
      raise exception 'invalid_schedule' using errcode = 'P0001';
    end if;
    if p_offset_days is null or p_offset_days not between 0 and private.limit_transfer_offset_days() then
      raise exception 'invalid_offset' using errcode = 'P0001';
    end if;
  else
    if p_offset_days is not null or p_income_id is not null then
      raise exception 'invalid_schedule' using errcode = 'P0001';
    end if;
    if p_day_of_month is null or p_day_of_month not between 1 and 31 then
      raise exception 'invalid_day' using errcode = 'P0001';
    end if;
  end if;
  if p_is_automatic is null then
    raise exception 'invalid_automatic' using errcode = 'P0001';
  end if;
  perform private.assert_account(p_budget_id, p_from_account_id, p_from, p_to);
  perform private.assert_account(p_budget_id, p_to_account_id, p_from, p_to);
  if p_from_account_id = p_to_account_id then
    raise exception 'same_account' using errcode = 'P0001';
  end if;
  if p_income_id is not null then
    if not exists (select 1 from public.incomes as i where i.id = p_income_id and i.budget_id = p_budget_id) then
      raise exception 'income_not_found' using errcode = 'P0001';
    end if;
    if not private.income_in_force(p_income_id, p_from) then
      raise exception 'income_not_in_force' using errcode = 'P0001';
    end if;
  end if;
  if p_category_id is not null then
    perform private.assert_terms_category(p_budget_id, p_category_id, p_from, p_to);
  end if;
end;
$$;

-- ===========================================================================
-- Accounts                                    (R-ACCOUNT-001, R-ACCOUNT-232, D-350)
-- ===========================================================================
create function public.create_account(
  p_budget_id uuid, p_name text, p_kind public.account_kind, p_bank_label text default null,
  p_user_id uuid default null, p_from_period_id uuid default null
)
returns setof public.account_overview
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
  v_label text;
  v_seq integer;
  v_id uuid;
begin
  perform private.assert_member(p_budget_id);
  v_name := private.clean_name(p_name);
  v_label := private.clean_bank_label(p_bank_label);
  if p_kind is null then
    raise exception 'invalid_account_kind' using errcode = 'P0001';
  end if;
  perform private.lock_and_catch_up(p_budget_id);
  if p_from_period_id is not null then
    v_seq := private.period_seq(p_budget_id, p_from_period_id);  -- a correction
  else
    v_seq := private.current_seq(p_budget_id);
  end if;
  if p_user_id is not null and not exists (select 1 from public.budget_members as m
                                           where m.budget_id = p_budget_id and m.user_id = p_user_id) then
    raise exception 'member_not_found' using errcode = 'P0001';
  end if;
  perform private.assert_account_room(p_budget_id);
  insert into public.accounts (budget_id, name, kind, bank_label, user_id, first_seq)
  values (p_budget_id, v_name, p_kind, v_label, p_user_id, v_seq)
  returning id into v_id;
  return query select * from public.account_overview as o where o.id = v_id;
end;
$$;

-- Not versioned: the new name, kind, label and holder show in every period (D-350).
create function public.update_account(
  p_account_id uuid, p_expected_revision integer, p_name text default null, p_kind public.account_kind default null,
  p_bank_label text default null, p_user_id uuid default null,
  p_clear_bank_label boolean default false, p_clear_user boolean default false
)
returns setof public.account_overview
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_account public.accounts;
  v_name text;
  v_label text;
begin
  if p_name is not null then
    v_name := private.clean_name(p_name);
  end if;
  v_label := private.clean_bank_label(p_bank_label);
  if (v_label is not null and coalesce(p_clear_bank_label, false))
     or (p_user_id is not null and coalesce(p_clear_user, false)) then
    raise exception 'invalid_arguments' using errcode = 'P0001';
  end if;
  v_account := private.lock_account(p_account_id);
  perform private.assert_revision(v_account.revision, p_expected_revision);
  if p_user_id is not null and not exists (select 1 from public.budget_members as m
                                           where m.budget_id = v_account.budget_id and m.user_id = p_user_id) then
    raise exception 'member_not_found' using errcode = 'P0001';
  end if;
  update public.accounts
  set name = coalesce(v_name, name),
      kind = coalesce(p_kind, kind),
      bank_label = case when coalesce(p_clear_bank_label, false) then null else coalesce(v_label, bank_label) end,
      user_id = case when coalesce(p_clear_user, false) then null else coalesce(p_user_id, user_id) end
  where id = v_account.id;
  return query select * from public.account_overview as o where o.id = v_account.id;
end;
$$;

-- What close_account from period p_seq does, or the code it answers (the write's own checks).
create function private.account_close_outcome(p_account public.accounts, p_seq integer)
returns text
language plpgsql
stable
set search_path = ''
as $$
begin
  if p_account.end_seq is not null and p_seq >= p_account.end_seq then
    raise exception 'account_ended' using errcode = 'P0001';
  end if;
  if private.account_in_use(p_account.id, p_seq) then
    raise exception 'account_in_use' using errcode = 'P0001',
      detail = private.account_users(p_account.id, p_seq)::text;
  end if;
  if p_seq <= p_account.first_seq and not private.account_referenced(p_account.id) then
    return 'deleted';
  end if;
  return 'ended';
end;
$$;

-- R-ACCOUNT-232: close from the current period, or as a correction from an earlier one. Earlier
-- periods keep it (their plan and diagram do not change). Refused while a transfer or an
-- income uses it from then on (account_in_use, detail [{kind, id, name}]). Deleted when it
-- never counted before that period and nothing ever named it.
create function public.close_account(p_account_id uuid, p_expected_revision integer, p_from_period_id uuid default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_account public.accounts;
  v_seq integer;
begin
  v_account := private.lock_account(p_account_id);
  perform private.assert_revision(v_account.revision, p_expected_revision);
  if p_from_period_id is null then
    v_seq := private.current_seq(v_account.budget_id);
  else
    v_seq := private.period_seq(v_account.budget_id, p_from_period_id);
  end if;
  if private.account_close_outcome(v_account, v_seq) = 'deleted' then
    delete from public.accounts where id = v_account.id;
    return 'deleted';
  end if;
  update public.accounts set end_seq = greatest(v_seq, v_account.first_seq) where id = v_account.id;
  return 'ended';
end;
$$;

create function public.preview_close_account(p_account_id uuid, p_from_period_id uuid default null)
returns table (outcome text, refusal text, used_by jsonb)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_a public.accounts;
  v_seq integer;
  v_outcome text;
begin
  select a.* into v_a from public.accounts as a where a.id = p_account_id;
  if v_a.id is null or not private.is_budget_member(v_a.budget_id) then
    raise exception 'account_not_found' using errcode = 'P0001';
  end if;
  perform private.read_catch_up(v_a.budget_id);
  begin
    if p_from_period_id is null then
      v_seq := private.current_seq(v_a.budget_id);
    else
      v_seq := private.period_seq(v_a.budget_id, p_from_period_id);
    end if;
    v_outcome := private.account_close_outcome(v_a, v_seq);
  exception when sqlstate 'P0001' then
    if sqlerrm = 'catching_up' then
      raise;
    end if;
    return query select null::text, sqlerrm,
      case when sqlerrm = 'account_in_use' then private.account_users(v_a.id, v_seq) end;
    return;
  end;
  return query select v_outcome, null::text, null::jsonb;
end;
$$;

-- ===========================================================================
-- Planned transfers                 (R-ACCOUNT-002, R-ACCOUNT-003, R-VERSION-071, D-121)
-- ===========================================================================
-- The periods an edit's terms govern: from the current period (or, as a correction, from
-- p_from_period_id) until the next existing change or the transfer's end.
create function private.transfer_edit_span(p_transfer public.transfers, p_from_period_id uuid)
returns table (from_seq integer, to_seq integer)
language plpgsql
set search_path = ''
as $$
declare
  v_seq integer;
  v_next integer;
begin
  if p_from_period_id is null then
    if p_transfer.end_seq is not null then
      raise exception 'transfer_ended' using errcode = 'P0001';
    end if;
    v_seq := greatest(private.current_seq(p_transfer.budget_id), p_transfer.first_seq);
  else
    v_seq := private.period_seq(p_transfer.budget_id, p_from_period_id);
    if v_seq < p_transfer.first_seq then
      raise exception 'invalid_period' using errcode = 'P0001';
    end if;
    if p_transfer.end_seq is not null and v_seq >= p_transfer.end_seq then
      raise exception 'transfer_ended' using errcode = 'P0001';
    end if;
  end if;
  select pg_catalog.min(v.effective_from_seq) into v_next from public.transfer_versions as v
  where v.transfer_id = p_transfer.id and v.effective_from_seq > v_seq;
  return query select v_seq,
    case when v_next is null then p_transfer.end_seq
         when p_transfer.end_seq is null then v_next else least(v_next, p_transfer.end_seq) end;
end;
$$;

-- The terms an edit gives from period p_seq: each argument omitted keeps the value in force
-- there. A new schedule kind takes its own arguments (an offset defaults to 0; a day of the
-- month is required); p_clear_income / p_clear_category remove the chosen income / category.
create function private.transfer_new_terms(
  p_transfer public.transfers, p_seq integer, p_from_account_id uuid, p_to_account_id uuid, p_amount bigint,
  p_schedule public.transfer_schedule, p_offset_days integer, p_day_of_month integer, p_income_id uuid,
  p_is_automatic boolean, p_category_id uuid, p_clear_income boolean, p_clear_category boolean
)
returns table (
  from_account_id uuid, to_account_id uuid, amount bigint, schedule public.transfer_schedule, offset_days integer,
  day_of_month integer, income_id uuid, is_automatic boolean, category_id uuid
)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_old public.transfer_versions;
  v_schedule public.transfer_schedule;
begin
  if (coalesce(p_clear_income, false) and p_income_id is not null)
     or (coalesce(p_clear_category, false) and p_category_id is not null) then
    raise exception 'invalid_arguments' using errcode = 'P0001';
  end if;
  select v.* into v_old from public.transfer_versions as v
  where v.transfer_id = p_transfer.id and v.effective_from_seq <= p_seq
  order by v.effective_from_seq desc limit 1;
  v_schedule := coalesce(p_schedule, v_old.schedule);
  return query select
    coalesce(p_from_account_id, v_old.from_account_id),
    coalesce(p_to_account_id, v_old.to_account_id),
    coalesce(p_amount, v_old.amount),
    v_schedule,
    case when v_schedule = 'pay_date'
         then coalesce(p_offset_days, case when v_old.schedule = 'pay_date' then v_old.offset_days end, 0)
         else p_offset_days end,
    case when v_schedule = 'day_of_month'
         then coalesce(p_day_of_month, case when v_old.schedule = 'day_of_month' then v_old.day_of_month end)
         else p_day_of_month end,
    case when coalesce(p_clear_income, false) then null::uuid
         when p_income_id is not null then p_income_id
         when v_schedule = 'pay_date' and v_old.schedule = 'pay_date' then v_old.income_id end,
    coalesce(p_is_automatic, v_old.is_automatic),
    case when coalesce(p_clear_category, false) then null::uuid else coalesce(p_category_id, v_old.category_id) end;
end;
$$;

-- R-ACCOUNT-233: what an edit or a new transfer would do, computed with the write's own due
-- dates: the first p_count occurrences the terms govern from period p_from (to p_to, null:
-- open-ended): the existing periods, then, while open-ended, the next periods with their
-- projected boundaries (as the catch-up will create them under the terms in force), never after
-- the budget's end. created_at_once: its transaction is created with the write (automatic,
-- linked, due by today, not marked).
create function private.transfer_preview(
  p_budget_id uuid, p_transfer_id uuid, p_from integer, p_to integer, p_amount bigint,
  p_schedule public.transfer_schedule, p_offset_days integer, p_day_of_month integer, p_income_id uuid,
  p_is_automatic boolean, p_category_id uuid, p_count integer
)
returns table (
  period_id uuid, start_date date, end_date date, projected boolean, due_date date, amount bigint,
  is_automatic boolean, category_id uuid, follows_primary boolean, created_at_once boolean
)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_latest public.periods;
  v_horizon date := private.charge_horizon(p_budget_id);
  v_budget_end date := private.budget_end_date(p_budget_id);
  v_n integer := 0;
  v_k integer := 0;
  v_start date;
  v_end date;
  y record;
begin
  select p.* into v_latest from public.periods as p where p.budget_id = p_budget_id order by p.seq desc limit 1;
  for y in
    select p.id, p.seq, p.start_date, p.end_date from public.periods as p
    where p.budget_id = p_budget_id and p.seq >= p_from and (p_to is null or p.seq < p_to)
    order by p.seq limit p_count
  loop
    v_n := v_n + 1;
    period_id := y.id; start_date := y.start_date; end_date := y.end_date; projected := false;
    due_date := private.transfer_due_date(y.start_date, y.end_date, y.seq, p_schedule, p_offset_days, p_day_of_month, p_income_id);
    amount := p_amount; is_automatic := p_is_automatic; category_id := p_category_id;
    follows_primary := p_income_id is not null and not private.income_in_force(p_income_id, y.seq);
    created_at_once := p_is_automatic and p_category_id is not null and due_date <= v_horizon
      and not exists (select 1 from public.transfer_occurrences as o
                      where o.transfer_id = p_transfer_id and o.period_id = y.id);
    return next;
  end loop;
  if p_to is not null or v_latest.end_date < private.today() then
    return;  -- the terms stop at a later change, or the budget has ended
  end if;
  v_end := v_latest.end_date;
  while v_n < p_count loop
    v_k := v_k + 1;
    v_start := v_end + 1;
    exit when v_budget_end is not null and v_start > v_budget_end;
    v_end := private.future_period_end(p_budget_id, v_latest, v_k);
    v_n := v_n + 1;
    period_id := null; start_date := v_start; end_date := v_end; projected := true;
    due_date := private.transfer_due_date(v_start, v_end, v_latest.seq + v_k, p_schedule, p_offset_days,
                                          p_day_of_month, p_income_id);
    amount := p_amount; is_automatic := p_is_automatic; category_id := p_category_id;
    follows_primary := p_income_id is not null and not private.income_in_force(p_income_id, v_latest.seq + v_k);
    created_at_once := false;
    return next;
  end loop;
end;
$$;

-- R-ACCOUNT-002: in force from the current period, or, as a correction, from p_from_period_id.
-- Its transactions due up to today (automatic and linked) are created with it.
create function public.create_transfer(
  p_budget_id uuid, p_name text, p_from_account_id uuid, p_to_account_id uuid, p_amount bigint,
  p_schedule public.transfer_schedule, p_offset_days integer default null, p_day_of_month integer default null,
  p_income_id uuid default null, p_is_automatic boolean default false, p_category_id uuid default null,
  p_from_period_id uuid default null
)
returns setof public.transfer_overview
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
  v_seq integer;
  v_offset integer := case when p_schedule = 'pay_date' then coalesce(p_offset_days, 0) else p_offset_days end;
  v_id uuid;
begin
  perform private.assert_member(p_budget_id);
  v_name := private.clean_name(p_name);
  perform private.lock_and_catch_up(p_budget_id);
  if p_from_period_id is not null then
    v_seq := private.period_seq(p_budget_id, p_from_period_id);  -- a correction
  else
    v_seq := private.current_seq(p_budget_id);
  end if;
  perform private.assert_transfer_terms(p_budget_id, v_seq, null, p_from_account_id, p_to_account_id, p_amount,
    p_schedule, v_offset, p_day_of_month, p_income_id, p_is_automatic, p_category_id);
  if p_income_id is not null and not private.income_in_force(p_income_id, v_seq) then
    raise exception 'income_not_in_force' using errcode = 'P0001';
  end if;
  perform private.assert_transfer_room(p_budget_id);
  insert into public.transfers (budget_id, name, first_seq, settled_seq)
  values (p_budget_id, v_name, v_seq, v_seq - 1)
  returning id into v_id;
  insert into public.transfer_versions (transfer_id, budget_id, effective_from_seq, from_account_id, to_account_id,
                                        amount, schedule, offset_days, day_of_month, income_id, is_automatic, category_id)
  values (v_id, p_budget_id, v_seq, p_from_account_id, p_to_account_id, p_amount, p_schedule, v_offset,
          p_day_of_month, p_income_id, p_is_automatic, p_category_id);
  perform private.materialise_transfers(p_budget_id);
  return query select * from public.transfer_overview as o where o.id = v_id;
end;
$$;

create function public.preview_create_transfer(
  p_budget_id uuid, p_from_account_id uuid, p_to_account_id uuid, p_amount bigint,
  p_schedule public.transfer_schedule, p_offset_days integer default null, p_day_of_month integer default null,
  p_income_id uuid default null, p_is_automatic boolean default false, p_category_id uuid default null,
  p_from_period_id uuid default null, p_count integer default 6
)
returns table (
  period_id uuid, start_date date, end_date date, projected boolean, due_date date, amount bigint,
  is_automatic boolean, category_id uuid, follows_primary boolean, created_at_once boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_seq integer;
  v_offset integer := case when p_schedule = 'pay_date' then coalesce(p_offset_days, 0) else p_offset_days end;
begin
  perform private.assert_member(p_budget_id);
  if p_count is null or p_count not between 1 and private.limit_transfer_preview() then
    raise exception 'invalid_limit' using errcode = 'P0001';
  end if;
  perform private.read_catch_up(p_budget_id);
  if p_from_period_id is not null then
    v_seq := private.period_seq(p_budget_id, p_from_period_id);
  else
    v_seq := private.current_seq(p_budget_id);
  end if;
  perform private.assert_transfer_terms(p_budget_id, v_seq, null, p_from_account_id, p_to_account_id, p_amount,
    p_schedule, v_offset, p_day_of_month, p_income_id, p_is_automatic, p_category_id);
  if p_income_id is not null and not private.income_in_force(p_income_id, v_seq) then
    raise exception 'income_not_in_force' using errcode = 'P0001';
  end if;
  return query select * from private.transfer_preview(p_budget_id, null, v_seq, null, p_amount, p_schedule, v_offset,
    p_day_of_month, p_income_id, p_is_automatic, p_category_id, p_count);
end;
$$;

-- R-VERSION-071, D-121: a rename, and/or new terms from the current period (past periods keep
-- theirs; a second change in the same period replaces the first), or, with p_from_period_id, an
-- explicit correction until the next existing change. What was done in a period (its marks
-- and transactions) never changes; the occurrences of the periods the new terms govern are
-- settled again, so an automatic linked one already due gets its transaction (D-354).
create function public.update_transfer(
  p_transfer_id uuid, p_expected_revision integer, p_name text default null,
  p_from_account_id uuid default null, p_to_account_id uuid default null, p_amount bigint default null,
  p_schedule public.transfer_schedule default null, p_offset_days integer default null,
  p_day_of_month integer default null, p_income_id uuid default null, p_is_automatic boolean default null,
  p_category_id uuid default null, p_clear_income boolean default false, p_clear_category boolean default false,
  p_from_period_id uuid default null
)
returns setof public.transfer_overview
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_transfer public.transfers;
  v_name text;
  v_span record;
  v_terms record;
begin
  if p_name is not null then
    v_name := private.clean_name(p_name);
  end if;
  v_transfer := private.lock_transfer(p_transfer_id);
  perform private.assert_revision(v_transfer.revision, p_expected_revision);
  if num_nonnulls(p_from_account_id, p_to_account_id, p_amount, p_schedule, p_offset_days, p_day_of_month, p_income_id,
                  p_is_automatic, p_category_id) > 0
     or coalesce(p_clear_income, false) or coalesce(p_clear_category, false) then
    select * into v_span from private.transfer_edit_span(v_transfer, p_from_period_id);
    select * into v_terms from private.transfer_new_terms(v_transfer, v_span.from_seq, p_from_account_id, p_to_account_id,
      p_amount, p_schedule, p_offset_days, p_day_of_month, p_income_id, p_is_automatic, p_category_id,
      p_clear_income, p_clear_category);
    perform private.assert_transfer_terms(v_transfer.budget_id, v_span.from_seq, v_span.to_seq, v_terms.from_account_id,
      v_terms.to_account_id, v_terms.amount, v_terms.schedule, v_terms.offset_days, v_terms.day_of_month,
      v_terms.income_id, v_terms.is_automatic, v_terms.category_id);
    if p_income_id is not null and not private.income_in_force(p_income_id, v_span.from_seq) then
      raise exception 'income_not_in_force' using errcode = 'P0001';
    end if;
    insert into public.transfer_versions (transfer_id, budget_id, effective_from_seq, from_account_id, to_account_id,
                                          amount, schedule, offset_days, day_of_month, income_id, is_automatic, category_id)
    values (v_transfer.id, v_transfer.budget_id, v_span.from_seq, v_terms.from_account_id, v_terms.to_account_id,
            v_terms.amount, v_terms.schedule, v_terms.offset_days, v_terms.day_of_month, v_terms.income_id,
            v_terms.is_automatic, v_terms.category_id)
    on conflict (transfer_id, effective_from_seq) do update
      set from_account_id = excluded.from_account_id, to_account_id = excluded.to_account_id, amount = excluded.amount,
          schedule = excluded.schedule, offset_days = excluded.offset_days, day_of_month = excluded.day_of_month,
          income_id = excluded.income_id, is_automatic = excluded.is_automatic, category_id = excluded.category_id;
    update public.transfers
    set name = coalesce(v_name, name), revision = revision + 1,
        settled_seq = least(settled_seq, v_span.from_seq - 1)
    where id = v_transfer.id;
    perform private.materialise_transfers(v_transfer.budget_id);
  elsif p_from_period_id is not null then
    raise exception 'invalid_period' using errcode = 'P0001';
  elsif v_name is not null then
    update public.transfers set name = v_name where id = v_transfer.id;
  end if;
  return query select * from public.transfer_overview as o where o.id = v_transfer.id;
end;
$$;

-- R-ACCOUNT-233: the occurrences update_transfer with the same arguments would govern, with the
-- due dates of the new terms (with no term argument: the terms in force from the current period).
create function public.preview_update_transfer(
  p_transfer_id uuid, p_from_account_id uuid default null, p_to_account_id uuid default null,
  p_amount bigint default null, p_schedule public.transfer_schedule default null, p_offset_days integer default null,
  p_day_of_month integer default null, p_income_id uuid default null, p_is_automatic boolean default null,
  p_category_id uuid default null, p_clear_income boolean default false, p_clear_category boolean default false,
  p_from_period_id uuid default null, p_count integer default 6
)
returns table (
  period_id uuid, start_date date, end_date date, projected boolean, due_date date, amount bigint,
  is_automatic boolean, category_id uuid, follows_primary boolean, created_at_once boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_transfer public.transfers;
  v_span record;
  v_terms record;
begin
  select t.* into v_transfer from public.transfers as t where t.id = p_transfer_id;
  if v_transfer.id is null or not private.is_budget_member(v_transfer.budget_id) then
    raise exception 'transfer_not_found' using errcode = 'P0001';
  end if;
  if p_count is null or p_count not between 1 and private.limit_transfer_preview() then
    raise exception 'invalid_limit' using errcode = 'P0001';
  end if;
  perform private.read_catch_up(v_transfer.budget_id);
  select t.* into v_transfer from public.transfers as t where t.id = p_transfer_id;
  if num_nonnulls(p_from_account_id, p_to_account_id, p_amount, p_schedule, p_offset_days, p_day_of_month, p_income_id,
                  p_is_automatic, p_category_id) = 0
     and not coalesce(p_clear_income, false) and not coalesce(p_clear_category, false)
     and p_from_period_id is not null then
    raise exception 'invalid_period' using errcode = 'P0001';
  end if;
  select * into v_span from private.transfer_edit_span(v_transfer, p_from_period_id);
  select * into v_terms from private.transfer_new_terms(v_transfer, v_span.from_seq, p_from_account_id, p_to_account_id,
    p_amount, p_schedule, p_offset_days, p_day_of_month, p_income_id, p_is_automatic, p_category_id,
    p_clear_income, p_clear_category);
  perform private.assert_transfer_terms(v_transfer.budget_id, v_span.from_seq, v_span.to_seq, v_terms.from_account_id,
    v_terms.to_account_id, v_terms.amount, v_terms.schedule, v_terms.offset_days, v_terms.day_of_month,
    v_terms.income_id, v_terms.is_automatic, v_terms.category_id);
  if p_income_id is not null and not private.income_in_force(p_income_id, v_span.from_seq) then
    raise exception 'income_not_in_force' using errcode = 'P0001';
  end if;
  return query select * from private.transfer_preview(v_transfer.budget_id, v_transfer.id, v_span.from_seq, v_span.to_seq,
    v_terms.amount, v_terms.schedule, v_terms.offset_days, v_terms.day_of_month, v_terms.income_id,
    v_terms.is_automatic, v_terms.category_id, p_count);
end;
$$;

-- What end_transfer from period p_seq does: the outcome, how many marks of the periods from then
-- on go, and how many of their transactions stay as ordinary transactions (D-355).
create function private.transfer_end_effect(p_transfer public.transfers, p_seq integer)
returns table (outcome text, marks_removed integer, transactions_unlinked integer)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_end integer := greatest(p_seq, p_transfer.first_seq);
begin
  if p_transfer.end_seq is not null and p_seq >= p_transfer.end_seq then
    raise exception 'transfer_ended' using errcode = 'P0001';
  end if;
  return query
    select case when p_seq <= p_transfer.first_seq
                     and not exists (select 1 from public.transfer_occurrences as o where o.transfer_id = p_transfer.id)
                then 'deleted' else 'ended' end,
           (select pg_catalog.count(*)::integer from public.transfer_occurrences as o
            join public.periods as p on p.id = o.period_id
            where o.transfer_id = p_transfer.id and p.seq >= v_end),
           (select pg_catalog.count(*)::integer from public.transfer_occurrences as o
            join public.periods as p on p.id = o.period_id
            join public.transactions as x on x.transfer_occurrence_id = o.id
            where o.transfer_id = p_transfer.id and p.seq >= v_end);
end;
$$;

-- R-ACCOUNT-234: no occurrence from then on. Deleted when it never counted before that period
-- and nothing was ever done with it (transfer_overview.removal_deletes); otherwise ended. The
-- marks of the periods from then on go; their transactions stay, as ordinary transactions
-- (D-355); preview_end_transfer says how many.
create function public.end_transfer(p_transfer_id uuid, p_expected_revision integer, p_from_period_id uuid default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_transfer public.transfers;
  v_seq integer;
  v_end integer;
begin
  v_transfer := private.lock_transfer(p_transfer_id);
  perform private.assert_revision(v_transfer.revision, p_expected_revision);
  if p_from_period_id is null then
    v_seq := private.current_seq(v_transfer.budget_id);
  else
    v_seq := private.period_seq(v_transfer.budget_id, p_from_period_id);
  end if;
  if (select e.outcome from private.transfer_end_effect(v_transfer, v_seq) as e) = 'deleted' then
    delete from public.transfers where id = v_transfer.id;
    return 'deleted';
  end if;
  v_end := greatest(v_seq, v_transfer.first_seq);
  delete from public.transfer_occurrences as o
  using public.periods as p
  where p.id = o.period_id and o.transfer_id = v_transfer.id and p.seq >= v_end;
  update public.transfers set end_seq = v_end where id = v_transfer.id;
  delete from public.transfer_versions as v
  where v.transfer_id = v_transfer.id and v.effective_from_seq >= v_end and v.effective_from_seq > v_transfer.first_seq;
  return 'ended';
end;
$$;

create function public.preview_end_transfer(p_transfer_id uuid, p_from_period_id uuid default null)
returns table (outcome text, refusal text, marks_removed integer, transactions_unlinked integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_t public.transfers;
  v_seq integer;
  v_effect record;
begin
  select t.* into v_t from public.transfers as t where t.id = p_transfer_id;
  if v_t.id is null or not private.is_budget_member(v_t.budget_id) then
    raise exception 'transfer_not_found' using errcode = 'P0001';
  end if;
  perform private.read_catch_up(v_t.budget_id);
  begin
    if p_from_period_id is null then
      v_seq := private.current_seq(v_t.budget_id);
    else
      v_seq := private.period_seq(v_t.budget_id, p_from_period_id);
    end if;
    select t.* into v_t from public.transfers as t where t.id = p_transfer_id;
    select * into v_effect from private.transfer_end_effect(v_t, v_seq);
  exception when sqlstate 'P0001' then
    if sqlerrm = 'catching_up' then
      raise;
    end if;
    return query select null::text, sqlerrm, null::integer, null::integer;
    return;
  end;
  return query select v_effect.outcome, null::text, v_effect.marks_removed, v_effect.transactions_unlinked;
end;
$$;

-- R-VERSION-132, R-VERSION-133: the terms in force in a chosen period, for a correction form.
create function public.get_transfer_terms(p_transfer_id uuid, p_period_id uuid)
returns table (
  period_id uuid, in_force boolean, from_account_id uuid, to_account_id uuid, amount bigint,
  schedule public.transfer_schedule, offset_days integer, day_of_month integer, income_id uuid,
  is_automatic boolean, category_id uuid, terms_from_period_id uuid, until_period_id uuid
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_t public.transfers;
  v_seq integer;
  w record;
begin
  select t.* into v_t from public.transfers as t where t.id = p_transfer_id;
  if v_t.id is null or not private.is_budget_member(v_t.budget_id) then
    raise exception 'transfer_not_found' using errcode = 'P0001';
  end if;
  v_seq := private.period_seq(v_t.budget_id, p_period_id);
  select * into w from private.version_window('public.transfer_versions', 'transfer_id', v_t.id, v_seq, v_t.end_seq);
  if not (v_t.first_seq <= v_seq and (v_t.end_seq is null or v_seq < v_t.end_seq)) then
    w.from_seq := null;
    w.until_seq := null;
  end if;
  return query
    select p_period_id, v_t.first_seq <= v_seq and (v_t.end_seq is null or v_seq < v_t.end_seq),
           v.from_account_id, v.to_account_id, v.amount, v.schedule, v.offset_days, v.day_of_month, v.income_id,
           v.is_automatic, v.category_id,
           (select p.id from public.periods as p where p.budget_id = v_t.budget_id and p.seq = w.from_seq),
           (select p.id from public.periods as p where p.budget_id = v_t.budget_id and p.seq = w.until_seq)
    from (select 1) as one
    left join public.transfer_versions as v on v.transfer_id = v_t.id and v.effective_from_seq = w.from_seq;
end;
$$;

-- ===========================================================================
-- The checklist of a period and the marks       (R-ACCOUNT-004, R-ACCOUNT-005, R-ACCOUNT-073)
-- ===========================================================================
create type public.transfer_checklist_row as (
  transfer_id uuid,
  period_id uuid,
  name text,
  from_account_id uuid,
  from_account_name text,
  to_account_id uuid,
  to_account_name text,
  amount bigint,
  due_date date,
  is_automatic boolean,
  category_id uuid,
  category_name text,
  -- 'to_do' | 'done' | 'skipped' | 'not_done' | 'upcoming' (automatic, not yet due)
  status text,
  is_overdue boolean,
  held_back boolean,
  follows_primary boolean,
  done_on date,
  amount_moved bigint,
  transaction_id uuid,
  transaction_revision integer,
  mark_revision integer,
  recorded_by uuid,
  recorded_by_name text
);

-- The name of whoever marked an occurrence, for members (also once they have left).
create function private.marker_name(p_budget_id uuid, p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.display_name from public.profiles as p
  where p.id = p_user_id
    and p_budget_id in (select private.member_budget_ids())
    and exists (select 1 from public.transfer_occurrences as o where o.recorded_by = p_user_id and o.budget_id = p_budget_id)
$$;

-- One row per transfer in force in the period (R-ACCOUNT-239), with what was done. A manual
-- one is to do (overdue once its due date has passed), done or skipped; an automatic one is
-- upcoming until its due date, then done without confirmation (R-ACCOUNT-004), unless marked
-- not done. A done one linked to a category shows its transaction's date and amount, edits
-- included (R-ACCOUNT-073).
create function private.transfer_checklist(p_budget_id uuid, p_seq integer, p_transfer_id uuid default null)
returns setof public.transfer_checklist_row
language sql
stable
set search_path = ''
as $$
  select pl.transfer_id, pl.period_id, pl.name, pl.from_account_id, fa.name, pl.to_account_id, ta.name,
         pl.amount, pl.due_date, pl.is_automatic, pl.category_id, c.name,
         case when o.id is not null then o.mark::text
              when pl.is_automatic then case when pl.due_date <= private.today() then 'done' else 'upcoming' end
              else 'to_do' end,
         o.id is null and not pl.is_automatic and pl.due_date < private.today(),
         o.id is null and pl.is_automatic and pl.category_id is not null
           and pl.due_date <= private.charge_horizon(p_budget_id),
         pl.follows_primary,
         coalesce(x.date, o.done_on), coalesce(x.amount, o.amount), x.id, x.revision,
         coalesce(o.revision, 0), o.recorded_by, private.marker_name(p_budget_id, o.recorded_by)
  from private.transfer_plan(p_budget_id, p_seq) as pl
  join public.accounts as fa on fa.id = pl.from_account_id
  join public.accounts as ta on ta.id = pl.to_account_id
  left join public.categories as c on c.id = pl.category_id
  left join public.transfer_occurrences as o on o.transfer_id = pl.transfer_id and o.period_id = pl.period_id
  left join public.transactions as x on x.transfer_occurrence_id = o.id
  where p_transfer_id is null or pl.transfer_id = p_transfer_id
  order by pl.due_date, pl.name, pl.transfer_id
$$;

-- R-ACCOUNT-005: the checklist of any period, current or past. Catches up first.
create function public.get_transfer_checklist(p_period_id uuid)
returns setof public.transfer_checklist_row
language plpgsql
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
  perform private.read_catch_up(v_period.budget_id);
  select p.* into v_period from public.periods as p where p.id = p_period_id;
  if v_period.id is null then
    raise exception 'period_not_found' using errcode = 'P0001';
  end if;
  return query select * from private.transfer_checklist(v_period.budget_id, v_period.seq);
end;
$$;

-- The occurrence a mark acts on, under the budget lock: the transfer in force in that period
-- (transfer_not_in_force otherwise) and its mark, checked against the revision the client read
-- (0: no mark; R-CONCURRENCY-230).
create function private.lock_occurrence(p_transfer_id uuid, p_period_id uuid, p_expected_revision integer)
returns table (budget_id uuid, seq integer, start_date date, end_date date, due_date date, amount bigint,
               is_automatic boolean, category_id uuid, mark_id uuid, mark public.transfer_mark, by_catch_up boolean)
language plpgsql
set search_path = ''
as $$
declare
  v_transfer public.transfers;
  v_seq integer;
  v_plan record;
  v_mark public.transfer_occurrences;
begin
  v_transfer := private.lock_transfer(p_transfer_id);
  v_seq := private.period_seq(v_transfer.budget_id, p_period_id);
  select x.* into v_plan from private.transfer_plan(v_transfer.budget_id, v_seq) as x where x.transfer_id = v_transfer.id;
  if v_plan.transfer_id is null then
    raise exception 'transfer_not_in_force' using errcode = 'P0001';
  end if;
  select o.* into v_mark from public.transfer_occurrences as o
  where o.transfer_id = v_transfer.id and o.period_id = p_period_id;
  if p_expected_revision is null then
    raise exception 'invalid_revision' using errcode = 'P0001';
  end if;
  if coalesce(v_mark.revision, 0) <> p_expected_revision then
    raise exception 'record_changed' using errcode = 'P0001';
  end if;
  return query select v_transfer.budget_id, v_seq, v_plan.start_date, v_plan.end_date, v_plan.due_date, v_plan.amount,
                      v_plan.is_automatic, v_plan.category_id, v_mark.id, v_mark.mark, v_mark.by_catch_up;
end;
$$;

-- R-ACCOUNT-073: the transaction of a done occurrence, in the category of its terms.
create function private.create_transfer_transaction(
  p_budget_id uuid, p_mark_id uuid, p_category_id uuid, p_date date, p_amount bigint, p_recorded_by uuid
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform private.assert_transaction_category(p_budget_id, 'expense', p_category_id,
                                              private.transaction_period_seq(p_budget_id, p_date));
  if private.transaction_room(p_budget_id) <= 0 then
    raise exception 'transaction_limit_reached' using errcode = 'P0001';
  end if;
  insert into public.transactions (budget_id, kind, amount, date, category_id, transfer_occurrence_id, recorded_by)
  values (p_budget_id, 'expense', p_amount, p_date, p_category_id, p_mark_id, p_recorded_by);
end;
$$;

-- R-ACCOUNT-005, R-ACCOUNT-073: a manual transfer was done, on p_done_on (default today when the
-- period is the current one, else its due date) with the amount actually moved (default the
-- planned amount). Linked to a category: its transaction is created, dated then.
create function public.mark_transfer_done(
  p_transfer_id uuid, p_period_id uuid, p_expected_revision integer,
  p_done_on date default null, p_amount bigint default null
)
returns setof public.transfer_checklist_row
language plpgsql
security definer
set search_path = ''
as $$
declare
  o record;
  v_date date;
  v_amount bigint;
  v_id uuid;
  v_today date := private.today();
begin
  select * into o from private.lock_occurrence(p_transfer_id, p_period_id, p_expected_revision);
  if o.is_automatic then
    raise exception 'transfer_is_automatic' using errcode = 'P0001';
  end if;
  if o.mark_id is not null then
    raise exception 'transfer_already_marked' using errcode = 'P0001';
  end if;
  v_date := coalesce(p_done_on, case when v_today between o.start_date and o.end_date then v_today
                                     else least(o.due_date, v_today) end);
  perform private.transaction_period_seq(o.budget_id, v_date);  -- invalid_date, date_outside_periods
  v_amount := coalesce(p_amount, o.amount);
  if v_amount not between 1 and private.limit_amount() then
    raise exception 'invalid_amount' using errcode = 'P0001';
  end if;
  insert into public.transfer_occurrences (budget_id, transfer_id, period_id, mark, done_on, amount, recorded_by)
  values (o.budget_id, p_transfer_id, p_period_id, 'done', v_date, v_amount, (select auth.uid()))
  returning id into v_id;
  if o.category_id is not null then
    perform private.create_transfer_transaction(o.budget_id, v_id, o.category_id, v_date, v_amount, (select auth.uid()));
  end if;
  return query select * from private.transfer_checklist(o.budget_id, o.seq, p_transfer_id);
end;
$$;

-- R-ACCOUNT-005: a manual transfer was skipped this period.
create function public.skip_transfer(p_transfer_id uuid, p_period_id uuid, p_expected_revision integer)
returns setof public.transfer_checklist_row
language plpgsql
security definer
set search_path = ''
as $$
declare
  o record;
begin
  select * into o from private.lock_occurrence(p_transfer_id, p_period_id, p_expected_revision);
  if o.is_automatic then
    raise exception 'transfer_is_automatic' using errcode = 'P0001';
  end if;
  if o.mark_id is not null then
    raise exception 'transfer_already_marked' using errcode = 'P0001';
  end if;
  insert into public.transfer_occurrences (budget_id, transfer_id, period_id, mark, recorded_by)
  values (o.budget_id, p_transfer_id, p_period_id, 'skipped', (select auth.uid()));
  return query select * from private.transfer_checklist(o.budget_id, o.seq, p_transfer_id);
end;
$$;

-- R-ACCOUNT-004, D-353: an automatic transfer did not happen this period (before or after its
-- due date). Its transaction, if created, is deleted, and none is created for it again.
create function public.mark_transfer_not_done(p_transfer_id uuid, p_period_id uuid, p_expected_revision integer)
returns setof public.transfer_checklist_row
language plpgsql
security definer
set search_path = ''
as $$
declare
  o record;
begin
  select * into o from private.lock_occurrence(p_transfer_id, p_period_id, p_expected_revision);
  if not o.is_automatic then
    raise exception 'transfer_is_manual' using errcode = 'P0001';
  end if;
  if o.mark_id is null then
    insert into public.transfer_occurrences (budget_id, transfer_id, period_id, mark, recorded_by)
    values (o.budget_id, p_transfer_id, p_period_id, 'not_done', (select auth.uid()));
  elsif o.mark = 'done' and o.by_catch_up then
    delete from public.transactions where transfer_occurrence_id = o.mark_id;  -- the trigger marks it not done
    update public.transfer_occurrences set mark = 'not_done', done_on = null, amount = null,
                                           recorded_by = (select auth.uid())
    where id = o.mark_id and mark = 'done';
  else
    raise exception 'transfer_already_marked' using errcode = 'P0001';
  end if;
  return query select * from private.transfer_checklist(o.budget_id, o.seq, p_transfer_id);
end;
$$;

-- R-ACCOUNT-240, D-353: back to what the occurrence is without a mark: a manual one to do (its
-- transaction deleted), an automatic one assumed done (its transaction created again when
-- linked and due).
create function public.undo_transfer_mark(p_transfer_id uuid, p_period_id uuid, p_expected_revision integer)
returns setof public.transfer_checklist_row
language plpgsql
security definer
set search_path = ''
as $$
declare
  o record;
begin
  select * into o from private.lock_occurrence(p_transfer_id, p_period_id, p_expected_revision);
  if o.mark_id is null or (o.mark = 'done' and o.by_catch_up) then
    raise exception 'nothing_to_undo' using errcode = 'P0001';
  end if;
  if o.mark = 'not_done' and o.is_automatic and o.category_id is not null
     and o.due_date <= private.charge_horizon(o.budget_id) then
    update public.transfer_occurrences
    set mark = 'done', done_on = o.due_date, amount = o.amount, by_catch_up = true, recorded_by = null
    where id = o.mark_id;
    perform private.create_transfer_transaction(o.budget_id, o.mark_id, o.category_id, o.due_date, o.amount, null);
  else
    delete from public.transactions where transfer_occurrence_id = o.mark_id;
    delete from public.transfer_occurrences where id = o.mark_id;
  end if;
  return query select * from private.transfer_checklist(o.budget_id, o.seq, p_transfer_id);
end;
$$;

-- ===========================================================================
-- The money flow of a period (R-ACCOUNT-006, R-ACCOUNT-075, R-ACCOUNT-235, D-356)
-- ===========================================================================
-- From the plan in force in the period, never from transactions. Typed rows:
-- * 'income': an income in force, its amount then, target_id its account then (null: the
--   'not_assigned' node);
-- * 'not_assigned': only when some income names no account; inflow = those incomes;
-- * 'account': every account in force; inflow (incomes and transfers in), outflow (transfers
--   out), stays = inflow - outflow (flows of the period, not a balance), is_negative;
-- * 'transfer': a transfer in force, source_id -> target_id, its planned amount then;
-- * 'total': amount = the incomes added up (= period_summaries.salary_total: salaries only;
--   extra incomes are actual transactions, not plan), outflow = the transfers added up.
create function private.money_flow(p_budget_id uuid, p_seq integer)
returns table (
  row_kind text, id uuid, name text, source_id uuid, target_id uuid, amount bigint, inflow bigint,
  outflow bigint, stays bigint, is_negative boolean, account_kind public.account_kind, user_id uuid,
  is_automatic boolean, period_id uuid
)
language sql
stable
set search_path = ''
as $$
  with per as (select p.id from public.periods as p where p.budget_id = p_budget_id and p.seq = p_seq),
  inc as (
    select i.id, i.name, i.user_id, v.amount, v.account_id
    from public.incomes as i
    cross join lateral (
      select x.amount, x.account_id from public.income_versions as x
      where x.income_id = i.id and x.effective_from_seq <= p_seq
      order by x.effective_from_seq desc limit 1
    ) as v
    where i.budget_id = p_budget_id and i.first_seq <= p_seq and (i.end_seq is null or p_seq < i.end_seq)
  ),
  tr as (select * from private.transfer_plan(p_budget_id, p_seq)),
  acc as (
    select a.id, a.name, a.kind, a.user_id,
           coalesce((select pg_catalog.sum(inc.amount) from inc where inc.account_id = a.id), 0)
             + coalesce((select pg_catalog.sum(tr.amount) from tr where tr.to_account_id = a.id), 0) as inflow,
           coalesce((select pg_catalog.sum(tr.amount) from tr where tr.from_account_id = a.id), 0) as outflow
    from public.accounts as a
    where a.budget_id = p_budget_id and a.first_seq <= p_seq and (a.end_seq is null or p_seq < a.end_seq)
  ),
  rows as (
    select 1 as o, 'income'::text as row_kind, inc.id, inc.name, inc.id as source_id, inc.account_id as target_id,
           inc.amount, null::bigint as inflow, null::bigint as outflow, null::bigint as stays, null::boolean as is_negative,
           null::public.account_kind as account_kind, inc.user_id, null::boolean as is_automatic
    from inc
    union all
    select 2, 'not_assigned', null, null, null, null, null, pg_catalog.sum(inc.amount)::bigint, 0::bigint,
           pg_catalog.sum(inc.amount)::bigint, false, null, null, null
    from inc where inc.account_id is null having pg_catalog.count(*) > 0
    union all
    select 3, 'account', acc.id, acc.name, null, null, null, acc.inflow::bigint, acc.outflow::bigint,
           (acc.inflow - acc.outflow)::bigint, acc.inflow < acc.outflow, acc.kind, acc.user_id, null
    from acc
    union all
    select 4, 'transfer', tr.transfer_id, tr.name, tr.from_account_id, tr.to_account_id, tr.amount, null, null, null,
           null, null, null, tr.is_automatic
    from tr
    union all
    select 5, 'total', null, null, null, null,
           coalesce((select pg_catalog.sum(inc.amount) from inc), 0)::bigint,
           coalesce((select pg_catalog.sum(inc.amount) from inc), 0)::bigint,
           coalesce((select pg_catalog.sum(tr.amount) from tr), 0)::bigint, null, null, null, null, null
  )
  select r.row_kind, r.id, r.name, r.source_id, r.target_id, r.amount, r.inflow, r.outflow, r.stays, r.is_negative,
         r.account_kind, r.user_id, r.is_automatic, (select per.id from per)
  from rows as r
  order by r.o, r.name, r.id
$$;

-- R-ACCOUNT-006: one call, for a chosen period (default the current one). Catches up first.
create function public.get_money_flow(p_budget_id uuid, p_period_id uuid default null)
returns table (
  row_kind text, id uuid, name text, source_id uuid, target_id uuid, amount bigint, inflow bigint,
  outflow bigint, stays bigint, is_negative boolean, account_kind public.account_kind, user_id uuid,
  is_automatic boolean, period_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_seq integer;
begin
  perform private.assert_member(p_budget_id);
  if p_period_id is null then
    v_seq := private.current_seq(p_budget_id);
  else
    perform private.read_catch_up(p_budget_id);
    v_seq := private.period_seq(p_budget_id, p_period_id);
  end if;
  return query select * from private.money_flow(p_budget_id, v_seq);
end;
$$;

-- ===========================================================================
-- Incomes: the account they are paid into                         (R-ACCOUNT-236, D-351)
-- ===========================================================================
create function private.assert_income_account(p_budget_id uuid, p_account_id uuid, p_from integer, p_to integer)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if p_account_id is not null then
    perform private.assert_account(p_budget_id, p_account_id, p_from, p_to);
  end if;
end;
$$;

drop function public.add_income(uuid, text, bigint, integer, public.weekend_rule, uuid, uuid);
create function public.add_income(
  p_budget_id uuid, p_name text, p_amount bigint, p_pay_day integer,
  p_weekend_rule public.weekend_rule default 'nearest', p_user_id uuid default null,
  p_from_period_id uuid default null, p_account_id uuid default null
)
returns uuid
language plpgsql
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
  perform private.assert_income_account(p_budget_id, p_account_id, v_seq, null);
  insert into public.incomes (budget_id, user_id, name, first_seq)
  values (p_budget_id, v_user, v_name, v_seq)
  returning id into v_id;
  insert into public.income_versions (income_id, budget_id, effective_from_seq, amount, pay_day, weekend_rule, account_id)
  values (v_id, p_budget_id, v_seq, p_amount, p_pay_day, p_weekend_rule, p_account_id);
  return v_id;
end;
$$;

-- update_income of step 3, with the account: p_account_id (or p_clear_account) is a change of
-- terms like the others, from the current period or as a correction; omitted, the account in
-- force there is kept.
drop function public.update_income(uuid, integer, text, bigint, integer, public.weekend_rule, uuid, date);
create function public.update_income(
  p_income_id uuid, p_expected_revision integer, p_name text default null, p_amount bigint default null,
  p_pay_day integer default null, p_weekend_rule public.weekend_rule default null, p_from_period_id uuid default null,
  p_previewed_end_date date default null, p_account_id uuid default null, p_clear_account boolean default false
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_income public.incomes;
  v_name text;
  v_seq integer;
  v_terms record;
  v_revision integer;
  v_end_before date;
  v_account uuid;
  v_next integer;
begin
  if p_name is not null then
    v_name := private.clean_name(p_name);
  end if;
  if p_account_id is not null and coalesce(p_clear_account, false) then
    raise exception 'invalid_arguments' using errcode = 'P0001';
  end if;
  v_income := private.lock_income(p_income_id);
  perform private.assert_revision(v_income.revision, p_expected_revision);
  if num_nonnulls(p_amount, p_pay_day, p_weekend_rule, p_account_id) > 0 or coalesce(p_clear_account, false) then
    v_seq := private.income_edit_seq(v_income, p_from_period_id);
    select * into v_terms from private.income_new_terms(v_income.id, v_seq, p_amount, p_pay_day, p_weekend_rule);
    select v.account_id into v_account from public.income_versions as v
    where v.income_id = v_income.id and v.effective_from_seq <= v_seq
    order by v.effective_from_seq desc limit 1;
    if coalesce(p_clear_account, false) then
      v_account := null;
    elsif p_account_id is not null then
      v_account := p_account_id;
    end if;
    select pg_catalog.min(v.effective_from_seq) into v_next from public.income_versions as v
    where v.income_id = v_income.id and v.effective_from_seq > v_seq;
    perform private.assert_income_account(v_income.budget_id, v_account, v_seq,
      case when v_next is null then v_income.end_seq when v_income.end_seq is null then v_next
           else least(v_next, v_income.end_seq) end);
    select p.end_date into v_end_before from public.periods as p
    where p.budget_id = v_income.budget_id and private.today() between p.start_date and p.end_date;
    insert into public.income_versions (income_id, budget_id, effective_from_seq, amount, pay_day, weekend_rule, account_id)
    values (v_income.id, v_income.budget_id, v_seq, v_terms.amount, v_terms.pay_day, v_terms.weekend_rule, v_account)
    on conflict (income_id, effective_from_seq) do update
      set amount = excluded.amount, pay_day = excluded.pay_day, weekend_rule = excluded.weekend_rule,
          account_id = excluded.account_id;
    update public.incomes set name = coalesce(v_name, name), revision = revision + 1 where id = v_income.id;
    if exists (select 1 from public.budgets where id = v_income.budget_id and primary_income_id = v_income.id) then
      perform private.reproject_current_end(v_income.budget_id);
      if p_previewed_end_date is null and v_end_before is distinct from (
        select p.end_date from public.periods as p
        where p.budget_id = v_income.budget_id and private.today() between p.start_date and p.end_date) then
        raise exception 'preview_required' using errcode = 'P0001';
      end if;
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

drop function public.get_income_terms(uuid, uuid);
create function public.get_income_terms(p_income_id uuid, p_period_id uuid)
returns table (
  period_id uuid, in_force boolean, amount bigint, pay_day integer, weekend_rule public.weekend_rule,
  terms_from_period_id uuid, until_period_id uuid, account_id uuid
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_i public.incomes;
  v_seq integer;
  w record;
begin
  select i.* into v_i from public.incomes as i where i.id = p_income_id;
  if v_i.id is null or not private.is_budget_member(v_i.budget_id) then
    raise exception 'income_not_found' using errcode = 'P0001';
  end if;
  v_seq := private.period_seq(v_i.budget_id, p_period_id);
  select * into w from private.version_window('public.income_versions', 'income_id', v_i.id, v_seq, v_i.end_seq);
  -- R-VERSION-133, D-273: no terms where the record is not in force (before it starts, from its
  -- end on), so a correction is never offered for a period the record does not cover
  if not (v_i.first_seq <= v_seq and (v_i.end_seq is null or v_seq < v_i.end_seq)) then
    w.from_seq := null;
    w.until_seq := null;
  end if;
  return query
    select p_period_id, v_i.first_seq <= v_seq and (v_i.end_seq is null or v_seq < v_i.end_seq),
           v.amount, v.pay_day, v.weekend_rule,
           (select p.id from public.periods as p where p.budget_id = v_i.budget_id and p.seq = w.from_seq),
           (select p.id from public.periods as p where p.budget_id = v_i.budget_id and p.seq = w.until_seq),
           v.account_id
    from (select 1) as one
    left join public.income_versions as v on v.income_id = v_i.id and v.effective_from_seq = w.from_seq;
end;
$$;

create or replace view public.income_overview with (security_invoker = true) as
select i.id, i.budget_id, i.user_id, private.display_name_of(i.user_id) as user_display_name, i.name,
       b.primary_income_id = i.id as is_primary,
       i.end_seq is null and not i.ended_after_last and i.first_seq <= private.reading_seq(i.budget_id) as is_active,
       i.first_seq, i.end_seq, t.amount, t.pay_day, t.weekend_rule, t.effective_from_seq as terms_from_seq,
       case when i.end_seq is null then private.next_pay_date(private.today(), t.pay_day, t.weekend_rule) end as next_pay_date,
       i.created_at, i.updated_at, i.revision,
       t.account_id, a.name as account_name
from public.incomes as i
join public.budgets as b on b.id = i.budget_id
join lateral (
  select v.amount, v.pay_day, v.weekend_rule, v.effective_from_seq, v.account_id
  from public.income_versions as v
  where v.income_id = i.id
  order by (v.effective_from_seq <= private.reading_seq(i.budget_id)) desc,
           case when v.effective_from_seq <= private.reading_seq(i.budget_id) then -v.effective_from_seq
                else v.effective_from_seq end
  limit 1
) as t on true
left join public.accounts as a on a.id = t.account_id;

-- ===========================================================================
-- Reopen: occurrences of the merged period                         (R-ACCOUNT-237, D-358)
-- ===========================================================================
-- After the registry's re-keying (step 3 and 4, unchanged), the marks of the merged period:
-- a mark moves to the reopened period when that period has none for the transfer. Otherwise it
-- goes: a mark the catch-up made goes with its transaction (it is made again if the period
-- comes back, like a debt's interest); a member's mark goes and its transaction stays, as an
-- ordinary transaction (D-355). Marks of periods where a transfer is no longer in force after
-- the merge go too, their transactions kept. The transfers' occurrences from the reopened
-- period on are settled again.
create or replace function private.rekey_period(p_budget_id uuid, p_from integer, p_to integer)
returns void
language plpgsql
set search_path = ''
as $$
declare
  t record;
  v_id uuid;
  v_from_period uuid;
  v_to_period uuid;
begin
  for t in select * from private.period_keyed_tables
           order by (kind = 'validity') desc, merge_order, table_name::text loop
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
      execute pg_catalog.format($q$
        delete from %1$s as v using %2$s as e
        where v.budget_id = $1 and e.id = v.%3$I and e.end_seq is not null
          and v.effective_from_seq >= e.end_seq and v.effective_from_seq > e.first_seq$q$,
        t.table_name, t.entity_table, t.entity_column) using p_budget_id;
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

  select p.id into v_from_period from public.periods as p where p.budget_id = p_budget_id and p.seq = p_from;
  select p.id into v_to_period from public.periods as p where p.budget_id = p_budget_id and p.seq = p_to;
  delete from public.transactions as x
  using public.transfer_occurrences as o
  where x.transfer_occurrence_id = o.id and o.budget_id = p_budget_id and o.period_id = v_from_period
    and o.by_catch_up and o.mark = 'done'
    and exists (select 1 from public.transfer_occurrences as k
                where k.transfer_id = o.transfer_id and k.period_id = v_to_period);
  delete from public.transfer_occurrences as o
  where o.budget_id = p_budget_id and o.period_id = v_from_period
    and exists (select 1 from public.transfer_occurrences as k
                where k.transfer_id = o.transfer_id and k.period_id = v_to_period);
  update public.transfer_occurrences set period_id = v_to_period
  where budget_id = p_budget_id and period_id = v_from_period;
  delete from public.transfer_occurrences as o
  using public.transfers as tr, public.periods as p
  where o.budget_id = p_budget_id and tr.id = o.transfer_id and p.id = o.period_id
    and not (tr.first_seq <= p.seq and (tr.end_seq is null or p.seq < tr.end_seq));
  update public.transfers set settled_seq = least(settled_seq, p_to - 1)
  where budget_id = p_budget_id and settled_seq > p_to - 1;
end;
$$;

-- preview_reopen's rows (step 3 and 4) and, for transfers, what happens to the merged period's
-- marks: 'mark_moved' (to the reopened period), 'mark_removed' (it goes; no transaction),
-- 'transaction_removed' (the catch-up's mark goes with its transaction) or
-- 'transaction_unlinked' (it goes; its transaction stays as an ordinary transaction).
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
  return query
    select 'transfer'::text, tr.id, tr.name,
           case when k.id is null then 'mark_moved'
                when x.id is not null and o.by_catch_up then 'transaction_removed'
                when x.id is not null then 'transaction_unlinked'
                else 'mark_removed' end,
           k.id is not null
    from public.transfer_occurrences as o
    join public.periods as p on p.id = o.period_id
    join public.transfers as tr on tr.id = o.transfer_id
    left join public.periods as q on q.budget_id = p_budget_id and q.seq = p_to
    left join public.transfer_occurrences as k on k.transfer_id = o.transfer_id and k.period_id = q.id
    left join public.transactions as x on x.transfer_occurrence_id = o.id
    where o.budget_id = p_budget_id and p.seq = p_from
    order by tr.name;
  return query
    select 'transfer'::text, tr.id, tr.name,
           case when x.id is not null then 'transaction_unlinked' else 'mark_removed' end, false
    from public.transfer_occurrences as o
    join public.periods as p on p.id = o.period_id
    join public.transfers as tr on tr.id = o.transfer_id
    left join public.transactions as x on x.transfer_occurrence_id = o.id
    where o.budget_id = p_budget_id and p.seq = p_to and tr.end_seq = p_from
    order by tr.name;
end;
$$;

-- ===========================================================================
-- Categories and committed amounts                     (R-CATEGORY-230, R-ACCOUNT-238)
-- ===========================================================================
-- The planned amounts of the transfers in force in period p_seq linked to each category.
create function private.transfer_committed_by_category(p_budget_id uuid, p_seq integer)
returns table (category_id uuid, committed bigint)
language sql
stable
set search_path = ''
as $$
  select pl.category_id, pg_catalog.sum(pl.amount)::bigint
  from private.transfer_plan(p_budget_id, p_seq) as pl
  where pl.category_id is not null
  group by pl.category_id
$$;

create function private.transfer_committed_total(p_budget_id uuid, p_seq integer)
returns bigint
language sql
stable
set search_path = ''
as $$
  select coalesce(pg_catalog.sum(v.amount), 0)::bigint
  from public.transfers as t
  cross join lateral (
    select x.amount, x.category_id from public.transfer_versions as x
    where x.transfer_id = t.id and x.effective_from_seq <= p_seq
    order by x.effective_from_seq desc limit 1
  ) as v
  where t.budget_id = p_budget_id and t.first_seq <= p_seq and (t.end_seq is null or p_seq < t.end_seq)
    and v.category_id is not null
$$;

-- One category (a group: its subcategories), like private.category_committed.
create function private.category_transfer_committed(p_category_id uuid, p_seq integer)
returns bigint
language plpgsql
stable
set search_path = ''
set enable_seqscan = off
as $$
declare
  v_ids uuid[] := array(select c.id from public.categories as c where c.id = p_category_id or c.parent_id = p_category_id);
begin
  if not exists (select 1 from public.transfer_versions as v where v.category_id = any (v_ids)) then
    return 0;
  end if;
  return coalesce((
    select pg_catalog.sum(v.amount)
    from (select distinct x.transfer_id from public.transfer_versions as x where x.category_id = any (v_ids)) as u
    join public.transfers as t on t.id = u.transfer_id
    cross join lateral (
      select x.amount, x.category_id from public.transfer_versions as x
      where x.transfer_id = t.id and x.effective_from_seq <= p_seq
      order by x.effective_from_seq desc limit 1
    ) as v
    where t.first_seq <= p_seq and (t.end_seq is null or p_seq < t.end_seq) and v.category_id = any (v_ids)), 0)::bigint;
end;
$$;

-- end_category of step 4: a subcategory a transfer ever named is kept (void), never deleted.
CREATE OR REPLACE FUNCTION public.end_category(p_category_id uuid, p_expected_revision integer, p_from_period_id uuid DEFAULT NULL::uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    -- R-CATEGORY-131: the detail names what uses it, as JSON [{kind, id, name}]
    raise exception 'category_in_use' using errcode = 'P0001',
      detail = private.category_users(v_category.id, v_seq)::text;
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
             or exists (select 1 from public.debt_versions as v where v.category_id = c.id)
             or exists (select 1 from public.transfer_versions as v where v.category_id = c.id) as kept
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
$function$
;

-- create_category of step 6: the first subcategory moves the transfers' category to "Other" too
-- (R-CATEGORY-110).
CREATE OR REPLACE FUNCTION public.create_category(p_budget_id uuid, p_name text, p_parent_id uuid DEFAULT NULL::uuid, p_amount bigint DEFAULT 0, p_cadence expectation_cadence DEFAULT 'monthly'::expectation_cadence, p_from_period_id uuid DEFAULT NULL::uuid, p_other_name text DEFAULT NULL::text)
 RETURNS SETOF category_overview
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    if v_parent.is_to_categorise then
      raise exception 'category_to_categorise' using errcode = 'P0001';
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
        or private.category_referenced(v_parent.id)
        or exists (select 1 from public.merchant_rules as r where r.category_id = v_parent.id);
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
      insert into public.categories (budget_id, parent_id, name, sort_order, first_seq, end_seq)
      values (p_budget_id, v_parent.id, v_other_name, v_sort + 1, v_parent.first_seq, v_parent.end_seq)
      returning id into v_other_id;
      update public.category_expectations set category_id = v_other_id where category_id = v_parent.id;
      update public.transactions set category_id = v_other_id where category_id = v_parent.id;
      update public.subscription_versions set category_id = v_other_id where category_id = v_parent.id;
      update public.debt_versions set category_id = v_other_id where category_id = v_parent.id;
      update public.transfer_versions set category_id = v_other_id where category_id = v_parent.id;
      update public.merchant_rules set category_id = v_other_id where category_id = v_parent.id;
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
$function$
;

-- R-ACCOUNT-238: a transfer linked to a category commits its planned amount there, as its own
-- figure (transfer_committed), beside the subscriptions' committed amount.
alter type public.category_progress_row add attribute transfer_committed bigint;
CREATE OR REPLACE FUNCTION private.category_progress(p_budget_id uuid, p_seq integer, p_start date, p_end date)
 RETURNS SETOF category_progress_row
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  with e as (select * from private.expectations_in_force(p_budget_id, p_seq)),
  s as (select * from private.spending_between(p_budget_id, p_start, p_end)),
  k as (select * from private.committed_by_category(p_budget_id, p_seq)),
  kt as (select * from private.transfer_committed_by_category(p_budget_id, p_seq)),
  leaves as (
    select c.id, c.parent_id, c.name, c.sort_order, e.category_id is not null as in_force,
           e.amount, e.cadence, coalesce(e.expected, 0)::bigint as expected,
           coalesce(s.spent, 0)::bigint as spent, coalesce(s.transaction_count, 0) as n,
           coalesce(k.committed, 0)::bigint as committed,
           coalesce(kt.committed, 0)::bigint as transfer_committed
    from public.categories as c
    left join e on e.category_id = c.id
    left join s on s.category_id = c.id
    left join k on k.category_id = c.id
    left join kt on kt.category_id = c.id
    where c.budget_id = p_budget_id and not c.is_group
      and (e.category_id is not null or s.category_id is not null or k.category_id is not null or kt.category_id is not null)
  ),
  groups as (
    select g.id, null::uuid as parent_id, g.name, g.sort_order,
           (g.first_seq <= p_seq and (g.end_seq is null or p_seq < g.end_seq)) as in_force,
           null::bigint as amount, null::public.expectation_cadence as cadence,
           coalesce(pg_catalog.sum(l.expected), 0)::bigint as expected,
           coalesce(pg_catalog.sum(l.spent), 0)::bigint as spent,
           coalesce(pg_catalog.sum(l.n), 0)::integer as n,
           coalesce(pg_catalog.sum(l.committed), 0)::bigint as committed,
           coalesce(pg_catalog.sum(l.transfer_committed), 0)::bigint as transfer_committed
    from public.categories as g
    left join leaves as l on l.parent_id = g.id
    where g.budget_id = p_budget_id and g.is_group
      and ((g.first_seq <= p_seq and (g.end_seq is null or p_seq < g.end_seq)) or l.id is not null)
    group by g.id
  ),
  all_rows as (
    select l.id, l.parent_id, l.name, false as is_group, l.in_force, l.amount, l.cadence,
           l.expected, l.spent, l.n, l.committed, l.transfer_committed, l.sort_order,
           coalesce(p.sort_order, l.sort_order) as top_order, coalesce(p.name, l.name) as top_name
    from leaves as l left join public.categories as p on p.id = l.parent_id
    union all
    select g.id, g.parent_id, g.name, true, g.in_force, g.amount, g.cadence,
           g.expected, g.spent, g.n, g.committed, g.transfer_committed, g.sort_order, g.sort_order, g.name
    from groups as g
  )
  select r.id, r.parent_id, r.name, r.is_group, r.in_force, r.amount, r.cadence,
         r.expected, r.spent, (r.expected - r.spent)::bigint, r.spent > r.expected, r.n,
         (pg_catalog.row_number() over (
            order by r.top_order, r.top_name, coalesce(r.parent_id, r.id), r.parent_id is not null,
                     r.sort_order, r.name, r.id))::integer,
         r.committed, r.transfer_committed
  from all_rows as r
  order by 13
$function$
;

-- ===========================================================================
-- Views of earlier steps, with the new columns at the end
-- ===========================================================================
create or replace view public.category_overview with (security_invoker = true) as
  select
    c.id,
    c.budget_id,
    c.parent_id,
    c.name,
    c.sort_order,
    c.is_group,
    (c.end_seq is null and c.first_seq <= r.seq) as is_active,
    c.first_seq,
    c.end_seq,
    e.amount,
    e.cadence,
    case when c.is_group then g.monthly_total else private.monthly_share(e.amount, e.cadence) end as monthly_amount,
    e.effective_from_seq as terms_from_seq,
    h.has_transactions,
    (not h.has_transactions and not h.referenced and c.first_seq >= r.seq) as removal_deletes,
    c.revision,
    c.created_at,
    c.updated_at,
    h.committed_amount,
    h.in_use,
    h.transfer_committed_amount
  from public.categories as c
  cross join lateral (select private.reading_seq(c.budget_id) as seq offset 0) as r  -- once per row
  left join lateral (
    select ce.amount, ce.cadence, ce.effective_from_seq
    from public.category_expectations as ce
    where ce.category_id = c.id
    order by (ce.effective_from_seq <= r.seq) desc,
             case when ce.effective_from_seq <= r.seq then -ce.effective_from_seq else ce.effective_from_seq end
    limit 1
  ) as e on not c.is_group
  left join lateral (
    -- a group: the monthly shares of its subcategories in force now
    select coalesce(pg_catalog.sum(private.monthly_share(x.amount, x.cadence)), 0)::bigint as monthly_total
    from public.categories as ch
    cross join lateral (
      select ce.amount, ce.cadence from public.category_expectations as ce
      where ce.category_id = ch.id and ce.effective_from_seq <= r.seq
      order by ce.effective_from_seq desc limit 1
    ) as x
    where ch.parent_id = c.id and not ch.is_group and ch.first_seq <= r.seq and (ch.end_seq is null or r.seq < ch.end_seq)
  ) as g on c.is_group
  cross join lateral (
    select private.category_has_transactions(c.id) as has_transactions,
           private.category_referenced(c.id) as referenced,
           private.category_in_use(c.id, r.seq) as in_use,
           private.category_committed(c.id, r.seq) as committed_amount,
           private.category_transfer_committed(c.id, r.seq) as transfer_committed_amount
    offset 0
  ) as h;

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
    a.committed_total,
    a.transfer_committed_total
  from public.periods as p
  cross join lateral (
    select private.salary_total(p.budget_id, p.seq) as salary_total,
           private.extra_income_between(p.budget_id, p.start_date, p.end_date) as extra_income_total,
           private.expected_total(p.budget_id, p.seq) as expected_total,
           private.spent_total(p.budget_id, p.start_date, p.end_date) as spent_total,
           private.committed_total(p.budget_id, p.seq) as committed_total,
           private.transfer_committed_total(p.budget_id, p.seq) as transfer_committed_total
  ) as a;

-- R-ACCOUNT-241: the manual transfers of the current period still to do, and of those, the
-- ones whose due date has passed (for the dashboard). 0 when the budget has ended.
create function private.transfers_to_do(p_budget_id uuid)
returns table (to_do integer, overdue integer)
language sql
stable
set search_path = ''
as $$
  select (pg_catalog.count(*) filter (where o.id is null))::integer,
         (pg_catalog.count(*) filter (where o.id is null and pl.due_date < private.today()))::integer
  from public.periods as p
  cross join lateral private.transfer_plan(p.budget_id, p.seq) as pl
  left join public.transfer_occurrences as o on o.transfer_id = pl.transfer_id and o.period_id = pl.period_id
  where p.budget_id = p_budget_id and private.today() between p.start_date and p.end_date
    and not pl.is_automatic
$$;

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
    b.revision,
    private.caught_up(b.id) as caught_up,
    (select pg_catalog.count(*)::integer from public.transactions as t
     where t.budget_id = b.id and t.review_state = 'awaiting_confirmation') as charges_awaiting,
    (select pg_catalog.count(*)::integer from public.transactions as t
     where t.budget_id = b.id and t.review_state = 'to_review') as to_review,
    (select c.id from public.categories as c where c.budget_id = b.id and c.is_to_categorise) as to_categorise_category_id,
    coalesce(d.to_do, 0) as transfers_to_do,
    coalesce(d.overdue, 0) as transfers_overdue
  from public.budgets as b
  join public.budget_members as m on m.budget_id = b.id and m.user_id = (select auth.uid())
  left join lateral private.transfers_to_do(b.id) as d on true;

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
    t.review_state,
    coalesce(d.end_seq is not null, false) as debt_ended,
    t.import_batch_id,
    ib.source as import_source,
    t.bank_transaction_id,
    t.merchant,
    t.merchant_key,
    t.details,
    coalesce(c.is_to_categorise, false) as in_to_categorise,
    o.transfer_id,
    tr.name as transfer_name,
    o.period_id as transfer_period_id
  from public.transactions as t
  left join public.categories as c on c.id = t.category_id
  left join public.categories as pc on pc.id = c.parent_id
  left join public.subscriptions as s on s.id = t.subscription_id
  left join public.debts as d on d.id = t.debt_id
  left join public.import_batches as ib on ib.id = t.import_batch_id
  left join public.transfer_occurrences as o on o.id = t.transfer_occurrence_id
  left join public.transfers as tr on tr.id = o.transfer_id
  left join lateral (
    select pp.id, pp.end_date from public.periods as pp
    where pp.budget_id = t.budget_id and pp.start_date <= t.date
    order by pp.start_date desc limit 1
  ) as p on t.date <= p.end_date;

-- ===========================================================================
-- Row-level security (C-RLS-001 to C-RLS-003): members read; every write is an RPC
-- ===========================================================================
alter table public.accounts enable row level security;
alter table public.transfers enable row level security;
alter table public.transfer_versions enable row level security;
alter table public.transfer_occurrences enable row level security;

create policy "Members can read their budgets' accounts"
  on public.accounts for select to authenticated
  using (budget_id in (select private.member_budget_ids()));
create policy "Members can read their budgets' planned transfers"
  on public.transfers for select to authenticated
  using (budget_id in (select private.member_budget_ids()));
create policy "Members can read their budgets' transfer terms"
  on public.transfer_versions for select to authenticated
  using (budget_id in (select private.member_budget_ids()));
create policy "Members can read their budgets' transfer marks"
  on public.transfer_occurrences for select to authenticated
  using (budget_id in (select private.member_budget_ids()));

-- ===========================================================================
-- Privileges
-- ===========================================================================
revoke all on table
  public.accounts, public.transfers, public.transfer_versions, public.transfer_occurrences,
  public.account_overview, public.transfer_overview
from anon, authenticated, service_role;
grant select on table
  public.accounts, public.transfers, public.transfer_versions, public.transfer_occurrences,
  public.account_overview, public.transfer_overview
to authenticated;
grant select, insert, update, delete on table
  public.accounts, public.transfers, public.transfer_versions, public.transfer_occurrences
to service_role;
grant select on table public.account_overview, public.transfer_overview to service_role;

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
      and p.proname <> 'import_with_token'
      and (p.proacl is null or exists (
        select 1 from pg_catalog.aclexplode(p.proacl) as a
        where a.grantee = 0 or a.grantee = 'anon'::regrole
      ))
  loop
    execute pg_catalog.format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
end;
$$;

-- Used by security_invoker views (my_budgets, account_overview, transfer_overview,
-- category_overview, period_summaries), so the calling role needs them.
grant execute on function
  private.transfer_spans(uuid),
  private.income_account_spans(uuid),
  private.account_in_use(uuid, integer),
  private.account_referenced(uuid),
  private.account_holder_name(uuid, uuid),
  private.income_in_force(uuid, integer),
  private.transfer_due_date(date, date, integer, public.transfer_schedule, integer, integer, uuid),
  private.transfer_plan(uuid, integer),
  private.transfers_pending(uuid),
  private.transfers_to_do(uuid),
  private.transfer_next_due(uuid),
  private.category_transfer_committed(uuid, integer),
  private.transfer_committed_total(uuid, integer)
to authenticated;

grant execute on function
  public.create_account(uuid, text, public.account_kind, text, uuid, uuid),
  public.update_account(uuid, integer, text, public.account_kind, text, uuid, boolean, boolean),
  public.close_account(uuid, integer, uuid),
  public.preview_close_account(uuid, uuid),
  public.create_transfer(uuid, text, uuid, uuid, bigint, public.transfer_schedule, integer, integer, uuid, boolean, uuid, uuid),
  public.preview_create_transfer(uuid, uuid, uuid, bigint, public.transfer_schedule, integer, integer, uuid, boolean, uuid, uuid, integer),
  public.update_transfer(uuid, integer, text, uuid, uuid, bigint, public.transfer_schedule, integer, integer, uuid, boolean, uuid, boolean, boolean, uuid),
  public.preview_update_transfer(uuid, uuid, uuid, bigint, public.transfer_schedule, integer, integer, uuid, boolean, uuid, boolean, boolean, uuid, integer),
  public.end_transfer(uuid, integer, uuid),
  public.preview_end_transfer(uuid, uuid),
  public.get_transfer_terms(uuid, uuid),
  public.get_transfer_checklist(uuid),
  public.mark_transfer_done(uuid, uuid, integer, date, bigint),
  public.skip_transfer(uuid, uuid, integer),
  public.mark_transfer_not_done(uuid, uuid, integer),
  public.undo_transfer_mark(uuid, uuid, integer),
  public.get_money_flow(uuid, uuid),
  public.add_income(uuid, text, bigint, integer, public.weekend_rule, uuid, uuid, uuid),
  public.update_income(uuid, integer, text, bigint, integer, public.weekend_rule, uuid, date, uuid, boolean),
  public.get_income_terms(uuid, uuid),
  public.create_category(uuid, text, uuid, bigint, public.expectation_cadence, uuid, text),
  public.end_category(uuid, integer, uuid)
to authenticated;
