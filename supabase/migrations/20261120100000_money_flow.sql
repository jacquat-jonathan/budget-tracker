-- Step 7: accounts and money flow (F-MONEYFLOW). Accounts (R-ACCOUNT-001), planned transfers
-- between them with versioned terms (R-ACCOUNT-002, R-ACCOUNT-003, R-VERSION-071), their
-- occurrences (R-ACCOUNT-070, R-ACCOUNT-071, R-ACCOUNT-300 to R-ACCOUNT-303), the checklist of
-- manual transfers (R-ACCOUNT-005), automatic transfers assumed done (R-ACCOUNT-004), the
-- transaction of a transfer linked to a category (R-ACCOUNT-072 to R-ACCOUNT-074), the account an
-- income is paid into, and the money flow read from the plan only, never from transactions,
-- with no balance (R-ACCOUNT-006, R-ACCOUNT-075).
--
-- An occurrence is computed from the plan (D-420): a fixed-day transfer follows the calendar like
-- a subscription (its schedule dates, in the period containing each), a pay-date transfer has
-- one occurrence per pay date of its income, keyed by the scheduled pay date. Only what a member
-- did, or what the catch-up created, is stored (public.transfer_occurrences, one row at most per
-- transfer and key date, never per period). After any change of the plan the catch-up looks
-- again from the transfer's watermark (D-423): its own marks whose occurrence is no longer
-- planned go with their transactions; a member's mark never goes silently (D-424). Ending a
-- transfer keeps every mark and the link of its transactions (D-380).

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
-- R-APP-170: the most rows a checklist answers (the last one says how many more there are)
create function private.limit_checklist_rows() returns integer
language sql immutable set search_path = '' as $$ select 1000 $$;

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
  -- D-421: the first day the transfer counts: the start of the period it was created in (or
  -- corrected from), or that period's scheduled pay date when the salary came late. It stays a
  -- date when a reopen moves first_seq into the reopened period, so nothing before it is planned.
  starts_on date not null,
  -- D-423: the catch-up's watermark by due date: every occurrence due up to this day is settled
  -- (its transaction made when automatic, linked and due, or nothing to do). Moves back on every
  -- change of the plan and every mark removal; next_due: the due date of the next automatic
  -- linked occurrence waiting (null: none in the existing periods); needs_check: the plan
  -- changed since the catch-up last looked (its own marks are checked again from the
  -- watermark). Bookkeeping, not an edit (neither revision nor updated_at).
  settled_through date not null,
  next_due date,
  needs_check boolean not null default true,
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transfers_name_valid check (name = btrim(name) and char_length(name) between 1 and 100),
  constraint transfers_seq_valid check (first_seq >= 1 and (end_seq is null or end_seq >= first_seq)),
  constraint transfers_starts_on_valid check (starts_on between date '1900-01-01' and date '2999-12-31'),
  constraint transfers_id_budget_unique unique (id, budget_id)
);
comment on table public.transfers is
  'Planned transfers. Validity by period number; terms in transfer_versions; see docs/database.md.';
create index transfers_budget_id_idx on public.transfers (budget_id);

-- R-ACCOUNT-002, R-ACCOUNT-003, R-ACCOUNT-070 to R-ACCOUNT-072, R-VERSION-071, R-ACCOUNT-300: the
-- terms, one version per period.
create table public.transfer_versions (
  id uuid primary key default gen_random_uuid(),
  transfer_id uuid not null,
  budget_id uuid not null references public.budgets (id) on delete cascade,
  effective_from_seq integer not null,
  from_account_id uuid not null,
  to_account_id uuid not null,
  amount bigint not null,  -- R-MONEY-002: integer rappen, per occurrence
  schedule public.transfer_schedule not null,
  -- 'pay_date': days after the actual pay date (0 to 31)
  offset_days integer,
  -- 'day_of_month' (D-420): a calendar schedule like a subscription's: cadence (monthly,
  -- quarterly, yearly), first date (anchor_date: the phase) and nominal day (day_of_month, 1 to
  -- 31, clamped to the month's length, no weekend rule)
  cadence public.subscription_cadence,
  anchor_date date,
  day_of_month integer,
  -- 'pay_date': the income whose pay dates count; null: the primary income (R-ACCOUNT-071)
  income_id uuid,
  -- D-426: the chosen income was deleted (added and removed in one period): the transfer
  -- follows the primary income, and says so (follows_primary)
  income_gone boolean not null default false,
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
    (schedule = 'pay_date' and offset_days between 0 and 31 and day_of_month is null and cadence is null
     and anchor_date is null)
    or (schedule = 'day_of_month' and day_of_month between 1 and 31 and offset_days is null and income_id is null
        and not income_gone and cadence in ('monthly', 'quarterly', 'yearly')
        and anchor_date between date '1900-01-01' and date '2999-12-31')),
  constraint transfer_versions_income_gone_valid check (not income_gone or income_id is null)
);
create index transfer_versions_budget_id_idx on public.transfer_versions (budget_id);
create index transfer_versions_transfer_idx on public.transfer_versions (transfer_id, budget_id);
create index transfer_versions_from_idx on public.transfer_versions (from_account_id, budget_id);
create index transfer_versions_to_idx on public.transfer_versions (to_account_id, budget_id);
create index transfer_versions_category_idx on public.transfer_versions (category_id, budget_id);
create index transfer_versions_income_idx on public.transfer_versions (income_id);

-- R-ACCOUNT-004, R-ACCOUNT-005, R-ACCOUNT-073, R-ACCOUNT-074, R-ACCOUNT-301, D-420: what was done
-- with one occurrence, keyed by its date (the scheduled date of a fixed-day transfer, the
-- scheduled pay date of a pay-date one), never by period: a boundary operation or a reopen
-- moves no mark. No row: a manual occurrence is to do, an automatic one is assumed done once
-- due. 'done' carries the date and the amount moved; its transaction, when linked to a
-- category, points here (transactions.transfer_occurrence_id). by_catch_up: made by the
-- catch-up for an automatic linked occurrence (D-424: removed by it when the occurrence is no
-- longer planned or not due).
create table public.transfer_occurrences (
  id uuid primary key default gen_random_uuid(),
  budget_id uuid not null references public.budgets (id) on delete cascade,
  transfer_id uuid not null,
  occurrence_date date not null,
  mark public.transfer_mark not null,
  done_on date,
  amount bigint,
  by_catch_up boolean not null default false,
  recorded_by uuid references auth.users (id) on delete set null,
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transfer_occurrences_transfer_fk foreign key (transfer_id, budget_id)
    references public.transfers (id, budget_id) on delete cascade,
  constraint transfer_occurrences_unique unique (transfer_id, occurrence_date),
  constraint transfer_occurrences_id_budget_unique unique (id, budget_id),
  constraint transfer_occurrences_done_valid check (
    (mark = 'done') = (done_on is not null and amount is not null)),
  constraint transfer_occurrences_catch_up_valid check (not by_catch_up or mark = 'done'),
  constraint transfer_occurrences_amount_valid check (amount is null or amount between 1 and 1000000000),
  constraint transfer_occurrences_date_valid check (
    occurrence_date between date '1900-01-01' and date '2999-12-31'
    and (done_on is null or done_on between date '1900-01-01' and date '2999-12-31'))
);
create index transfer_occurrences_budget_date_idx on public.transfer_occurrences (budget_id, occurrence_date);
create index transfer_occurrences_recorded_by_idx on public.transfer_occurrences (recorded_by);

-- The account an income is paid into: part of its terms, versioned with them (D-351).
alter table public.income_versions add column account_id uuid;
alter table public.income_versions add constraint income_versions_account_fk
  foreign key (account_id, budget_id) references public.accounts (id, budget_id);
create index income_versions_account_idx on public.income_versions (account_id, budget_id);

-- R-ACCOUNT-073, R-ACCOUNT-074: a transaction created for an occurrence. Removing the
-- occurrence's mark keeps the transaction, unlinked (D-380); deleting the transaction puts the
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
  for each row execute function private.touch_updated_at('settled_through', 'next_due', 'needs_check');
create trigger transfers_bump_revision before update on public.transfers
  for each row execute function private.bump_revision('revision', 'updated_at', 'settled_through', 'next_due', 'needs_check');
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

-- Removes marks with their transactions: the mark first (its transaction is unlinked by the
-- foreign key), then the transaction, so private.transfer_transaction_deleted never reads a
-- mark that is going anyway.
create function private.drop_transfer_marks(p_ids uuid[])
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_tx uuid[];
  v_n integer;
begin
  if p_ids is null or pg_catalog.cardinality(p_ids) = 0 then
    return 0;
  end if;
  select pg_catalog.array_agg(x.id) into v_tx from public.transactions as x where x.transfer_occurrence_id = any (p_ids);
  delete from public.transfer_occurrences where id = any (p_ids);
  get diagnostics v_n = row_count;
  if v_tx is not null then
    delete from public.transactions where id = any (v_tx);
  end if;
  return v_n;
end;
$$;

-- R-ACCOUNT-240, D-353, D-423: deleting the transaction of a done occurrence (by
-- delete_transaction or any other way) says it did not happen, by the terms in force for it
-- now: a planned automatic occurrence is not done (its transaction is never created again),
-- whoever marked it; a manual one is to do again; a mark whose occurrence is no longer planned
-- goes (D-424). Removing a mark moves the watermark back (transfer_occurrences_recheck).
create function private.transfer_transaction_deleted()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  o public.transfer_occurrences;
  v_automatic boolean;
begin
  select x.* into o from public.transfer_occurrences as x where x.id = old.transfer_occurrence_id;
  if o.id is null or o.mark <> 'done'
     or not exists (select 1 from public.budgets as b where b.id = old.budget_id) then
    return null;  -- R-ACCOUNT-308: nothing to mark while the budget is being deleted
  end if;
  select pl.is_automatic into v_automatic from private.transfer_planned(o.transfer_id, o.occurrence_date) as pl;
  if coalesce(v_automatic, false) then
    update public.transfer_occurrences
    set mark = 'not_done', done_on = null, amount = null, by_catch_up = false, recorded_by = (select auth.uid())
    where id = o.id;
  else
    delete from public.transfer_occurrences where id = o.id;
  end if;
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
-- Occurrences (R-ACCOUNT-070, R-ACCOUNT-071, R-ACCOUNT-300 to R-ACCOUNT-303, D-420 to D-422)
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

-- D-420, D-490: every period carries a scheduled pay date of the primary salary as its key
-- (pay_key): the date the schedule gave for it, the previous period's projected end plus one
-- (the projection rule, private.projected_end), whatever day the salary actually came (an
-- early salary, a late one recorded after a reopen, a moved start). The first period's is its
-- start. A period is never without a key: when that date is already another period's (a salary
-- recorded 15 or more days early, then the next one; several salaries in one month), the
-- period takes the next scheduled pay date no period has. Fixed when the period is created and
-- never moved: a reopen deletes the merged period with its key, and recording that salary
-- again derives the same key from the same earlier periods. Keys are unique in a budget and
-- can lie outside their period, so every lookup of an occurrence goes by the stored key.
alter table public.periods add column pay_key date;
-- D-492: the day an income was ended in the period it ends from (remove_income, remove_member,
-- leave_budget in the current period); null when ended from another period or not ended
alter table public.incomes add column ended_on date;
create unique index periods_pay_key_unique on public.periods (budget_id, pay_key) where pay_key is not null;

create function private.period_pay_key(p_budget_id uuid, p_seq integer, p_start date)
returns date
language plpgsql
stable
set search_path = ''
as $$
declare
  v_prev public.periods;
  v_key date;
  v_terms record;
  v_n integer := 0;
begin
  select p.* into v_prev from public.periods as p where p.budget_id = p_budget_id and p.seq = p_seq - 1;
  if v_prev.id is null then
    v_key := p_start;
  else
    v_key := private.projected_end(p_budget_id, v_prev.start_date, v_prev.seq) + 1;
  end if;
  select t.pay_day, t.weekend_rule into v_terms
  from public.budgets as b cross join lateral private.terms_at(b.primary_income_id, p_seq) as t
  where b.id = p_budget_id;
  while v_n < 1200 and exists (select 1 from public.periods as p
                               where p.budget_id = p_budget_id and p.pay_key = v_key and p.seq <> p_seq) loop
    v_key := private.next_pay_date(v_key + 1, v_terms.pay_day, v_terms.weekend_rule);
    v_n := v_n + 1;
  end loop;
  return v_key;
end;
$$;

create function private.set_period_pay_key()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.pay_key is null then
    new.pay_key := private.period_pay_key(new.budget_id, new.seq, new.start_date);
  end if;
  return new;
end;
$$;
create trigger periods_set_pay_key before insert on public.periods
  for each row execute function private.set_period_pay_key();

-- periods that exist before this migration (none in a new database), in order
do $$
declare
  r record;
begin
  for r in select p.id, p.budget_id, p.seq, p.start_date from public.periods as p order by p.budget_id, p.seq loop
    update public.periods set pay_key = private.period_pay_key(r.budget_id, r.seq, r.start_date) where id = r.id;
  end loop;
end;
$$;

-- The start of period p_seq (beyond the latest: the day after it; before the first: its start).
create function private.seq_start(p_budget_id uuid, p_seq integer)
returns date
language plpgsql
stable
set search_path = ''
as $$
begin
  return (
  select coalesce(
    (select p.start_date from public.periods as p where p.budget_id = p_budget_id and p.seq = p_seq),
    case when p_seq < 1
         then (select p.start_date from public.periods as p where p.budget_id = p_budget_id order by p.seq limit 1)
         else (select p.end_date + 1 from public.periods as p where p.budget_id = p_budget_id order by p.seq desc limit 1) end));
end;
$$;

-- D-424: the period that lists a date: the one containing it; a date before the first period
-- belongs to the first, one after the latest to the latest.
create function private.listing_seq(p_budget_id uuid, p_date date)
returns integer
language plpgsql
stable
set search_path = ''
as $$
begin
  return (
  select coalesce(
    (select p.seq from public.periods as p where p.budget_id = p_budget_id and p.start_date <= p_date
     order by p.start_date desc limit 1),
    1));
end;
$$;

-- An income's actual pay dates between two dates (its terms in force in period p_seq).
create function private.income_pay_dates(p_income_id uuid, p_seq integer, p_from date, p_to date)
returns setof date
language plpgsql
stable
set search_path = ''
as $$
#variable_conflict use_column
begin
  return query
  select s.d from (
    select private.month_pay_date(pg_catalog.make_date(i / 12, i % 12 + 1, 1), t.pay_day, t.weekend_rule) as d
    from private.terms_at(p_income_id, p_seq) as t
    cross join pg_catalog.generate_series(private.month_index(p_from) - 1, private.month_index(p_to) + 1) as i
  ) as s
  where s.d between p_from and p_to
  order by s.d;
end;
$$;

-- The monthly share of a transfer's amount: a pay-date or monthly transfer counts its amount
-- each period; a quarterly or yearly one its amount divided by the months, half up, by the
-- subscriptions' own rule (R-ACCOUNT-304, D-425).
create function private.transfer_monthly_amount(p_amount bigint, p_schedule public.transfer_schedule,
                                                p_cadence public.subscription_cadence)
returns bigint
language plpgsql
immutable
set search_path = ''
as $$
begin
  return (
  select case when p_schedule = 'day_of_month' then private.subscription_monthly_cost(p_amount, p_cadence)
              else p_amount end);
end;
$$;

-- S1, R-ACCOUNT-310: a chosen income that is the budget's primary income in period p_seq (it
-- has been since primary_since_seq) is the same as no income chosen there.
create function private.income_is_primary_at(p_income_id uuid, p_seq integer)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (select 1 from public.incomes as i join public.budgets as b on b.id = i.budget_id
                 where i.id = p_income_id and b.primary_income_id = i.id and p_seq >= b.primary_since_seq)
$$;

-- R-ACCOUNT-300 to R-ACCOUNT-303, D-420, D-422: the occurrences of one transfer in one period
-- under the given terms, each with its key (occurrence_date) and its due date:
-- * 'day_of_month': the dates of the calendar schedule (the subscriptions' own code,
--   private.charge_dates: the anchor's phase, the nominal day clamped to the month) inside the
--   period; key = due date. A short period may have none, a long one two.
-- * 'pay_date', the chosen income in force in the period: each of its actual pay dates in the
--   period (key), due that day plus the offset, never after the period's last day.
-- * 'pay_date', the primary income (no income chosen, the chosen one not in force there, or
--   deleted): one occurrence, keyed by the period's scheduled pay date (pay_key, from_pay_key),
--   due on the period's start (the actual pay date) plus the offset, never after the period's
--   last day.
-- Nothing before the transfer's first counted day (p_starts_on).
create function private.transfer_period_occurrences(
  p_seq integer, p_start date, p_end date, p_pay_key date, p_starts_on date,
  p_schedule public.transfer_schedule, p_cadence public.subscription_cadence, p_anchor date, p_day integer,
  p_offset integer, p_income_id uuid, p_income_gone boolean
)
returns table (occurrence_date date, due_date date, follows_primary boolean, from_pay_key boolean)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_ended date;
begin
  if p_schedule = 'day_of_month' then
    return query select d, d, false, false
                 from private.charge_dates(p_anchor, p_cadence, greatest(p_start, p_starts_on), p_end, p_day) as d;
  elsif p_income_id is not null and private.income_in_force(p_income_id, p_seq)
        and not private.income_is_primary_at(p_income_id, p_seq) then
    return query select d, least(d + p_offset, p_end), false, false
                 from private.income_pay_dates(p_income_id, p_seq, greatest(p_start, p_starts_on), p_end) as d;
  elsif p_income_id is not null
        and exists (select 1 from public.incomes as i
                    where i.id = p_income_id and i.end_seq = p_seq and i.ended_on is not null) then
    -- D-492: the chosen income ended in this period on ended_on: its occurrences already due
    -- then stay; the primary's occurrence only when it was not due yet
    v_ended := (select i.ended_on from public.incomes as i where i.id = p_income_id);
    return query select d, least(d + p_offset, p_end), false, false
                 from private.income_pay_dates(p_income_id, p_seq, greatest(p_start, p_starts_on), p_end) as d
                 where least(d + p_offset, p_end) <= v_ended;
    if p_pay_key is not null and p_pay_key >= p_starts_on and least(p_start + p_offset, p_end) > v_ended then
      return query select p_pay_key, least(p_start + p_offset, p_end), true, true;
    end if;
  elsif p_pay_key is not null and p_pay_key >= p_starts_on then
    return query select p_pay_key, least(p_start + p_offset, p_end),
                        (p_income_id is not null and not private.income_is_primary_at(p_income_id, p_seq))
                          or coalesce(p_income_gone, false),
                        true;
  end if;
end;
$$;

-- The keys one transfer's terms give in one period, before any key is given to an earlier
-- period (no row when the transfer is not in force there).
create function private.transfer_raw_keys(p_transfer_id uuid, p_seq integer)
returns table (occurrence_date date, from_pay_key boolean)
language sql
stable
set search_path = ''
as $$
  select o.occurrence_date, o.from_pay_key
  from public.transfers as t
  join public.periods as p on p.budget_id = t.budget_id and p.seq = p_seq
  cross join lateral (
    select x.* from public.transfer_versions as x
    where x.transfer_id = t.id and x.effective_from_seq <= p.seq
    order by x.effective_from_seq desc limit 1
  ) as v
  cross join lateral private.transfer_period_occurrences(p.seq, p.start_date, p.end_date, p.pay_key, t.starts_on,
    v.schedule, v.cadence, v.anchor_date, v.day_of_month, v.offset_days, v.income_id, v.income_gone) as o
  where t.id = p_transfer_id and t.first_seq <= p.seq and (t.end_seq is null or p.seq < t.end_seq)
$$;

-- The plan: every occurrence of the budget's transfers (or of one) in the periods p_seqs, at the
-- terms in force in its period. At most two periods can give a transfer the same key: the one
-- whose scheduled pay date it is (a primary occurrence) and the one containing that date (a
-- chosen income's pay date or a fixed-day date, after the transfer's terms changed); the key
-- belongs to the earlier of the two (D-420, D-490). Both are found by the key itself, wherever
-- they lie, never by searching neighbouring periods.
create function private.transfer_plan_seqs(p_budget_id uuid, p_transfer_id uuid, p_seqs integer[],
                                          p_manual_only boolean default false)
returns table (
  transfer_id uuid, name text, period_id uuid, seq integer, start_date date, end_date date,
  occurrence_date date, due_date date, follows_primary boolean, terms_from_seq integer,
  from_account_id uuid, to_account_id uuid, amount bigint, schedule public.transfer_schedule,
  cadence public.subscription_cadence, offset_days integer, day_of_month integer, income_id uuid,
  is_automatic boolean, category_id uuid
)
language plpgsql
stable
set search_path = ''
as $$
#variable_conflict use_column
begin
  return query
  select k.transfer_id, k.name, k.period_id, k.seq, k.start_date, k.end_date, k.occurrence_date, k.due_date,
         k.follows_primary, k.terms_from_seq, k.from_account_id, k.to_account_id, k.amount, k.schedule, k.cadence,
         k.offset_days, k.day_of_month, k.income_id, k.is_automatic, k.category_id
  from (
    select t.id as transfer_id, t.name, p.id as period_id, p.seq, p.start_date, p.end_date,
           o.occurrence_date, o.due_date, o.follows_primary, o.from_pay_key, v.effective_from_seq as terms_from_seq,
           v.from_account_id, v.to_account_id, v.amount, v.schedule, v.cadence, v.offset_days, v.day_of_month,
           v.income_id, v.is_automatic, v.category_id
    from public.periods as p
    join public.transfers as t
      on t.budget_id = p.budget_id and t.first_seq <= p.seq and (t.end_seq is null or p.seq < t.end_seq)
    cross join lateral (
      select x.* from public.transfer_versions as x
      where x.transfer_id = t.id and x.effective_from_seq <= p.seq
      order by x.effective_from_seq desc limit 1
    ) as v
    cross join lateral private.transfer_period_occurrences(p.seq, p.start_date, p.end_date, p.pay_key, t.starts_on,
      v.schedule, v.cadence, v.anchor_date, v.day_of_month, v.offset_days, v.income_id, v.income_gone) as o
    where p.budget_id = p_budget_id and p.seq = any (p_seqs)
      and (p_transfer_id is null or t.id = p_transfer_id)
      and (not p_manual_only or not v.is_automatic)
  ) as k
  -- a scheduled pay date before its period's start, which the period containing it gave first
  where not (k.from_pay_key and k.occurrence_date < k.start_date
             and exists (select 1 from public.periods as x
                         where x.budget_id = p_budget_id and x.start_date <= k.occurrence_date
                           and x.end_date >= k.occurrence_date and x.seq < k.seq
                           and exists (select 1 from private.transfer_raw_keys(k.transfer_id, x.seq) as r
                                       where r.occurrence_date = k.occurrence_date and not r.from_pay_key)))
    -- a date that an earlier period has as its scheduled pay date, and gave first
    and not (not k.from_pay_key
             and exists (select 1 from public.periods as y
                         where y.budget_id = p_budget_id and y.pay_key = k.occurrence_date and y.seq < k.seq
                           and exists (select 1 from private.transfer_raw_keys(k.transfer_id, y.seq) as r
                                       where r.occurrence_date = k.occurrence_date and r.from_pay_key)));
end;
$$;

-- The plan over the periods p_from_seq to p_to_seq.
create function private.transfer_plan_range(p_budget_id uuid, p_transfer_id uuid, p_from_seq integer, p_to_seq integer,
                                           p_manual_only boolean default false)
returns table (
  transfer_id uuid, name text, period_id uuid, seq integer, start_date date, end_date date,
  occurrence_date date, due_date date, follows_primary boolean, terms_from_seq integer,
  from_account_id uuid, to_account_id uuid, amount bigint, schedule public.transfer_schedule,
  cadence public.subscription_cadence, offset_days integer, day_of_month integer, income_id uuid,
  is_automatic boolean, category_id uuid
)
language sql
stable
set search_path = ''
as $$
  select * from private.transfer_plan_seqs(p_budget_id, p_transfer_id,
    array(select pg_catalog.generate_series(p_from_seq, p_to_seq)), p_manual_only)
$$;

-- D-490: the planned occurrences with these keys (of one transfer, or of any): only the periods
-- that can plan a key are computed, the one whose scheduled pay date it is and the one
-- containing it, however far apart.
create function private.transfer_plan_keys(p_budget_id uuid, p_transfer_id uuid, p_keys date[])
returns table (
  transfer_id uuid, name text, period_id uuid, seq integer, start_date date, end_date date,
  occurrence_date date, due_date date, follows_primary boolean, terms_from_seq integer,
  from_account_id uuid, to_account_id uuid, amount bigint, schedule public.transfer_schedule,
  cadence public.subscription_cadence, offset_days integer, day_of_month integer, income_id uuid,
  is_automatic boolean, category_id uuid
)
language sql
stable
set search_path = ''
as $$
  select pl.* from private.transfer_plan_seqs(p_budget_id, p_transfer_id,
    array(select p.seq from public.periods as p
          where p.budget_id = p_budget_id
            and (p.pay_key = any (p_keys)
                 or exists (select 1 from pg_catalog.unnest(p_keys) as k (d) where k.d between p.start_date and p.end_date))))
    as pl
  where pl.occurrence_date = any (p_keys)
$$;

-- The planned occurrence of a transfer with that key, if it is planned (no row otherwise).
create function private.transfer_planned(p_transfer_id uuid, p_key date)
returns table (
  transfer_id uuid, name text, period_id uuid, seq integer, start_date date, end_date date,
  occurrence_date date, due_date date, follows_primary boolean, terms_from_seq integer,
  from_account_id uuid, to_account_id uuid, amount bigint, schedule public.transfer_schedule,
  cadence public.subscription_cadence, offset_days integer, day_of_month integer, income_id uuid,
  is_automatic boolean, category_id uuid
)
language sql
stable
set search_path = ''
as $$
  select pl.* from public.transfers as t
  cross join lateral private.transfer_plan_keys(t.budget_id, t.id, array[p_key]) as pl
  where t.id = p_transfer_id
$$;

-- ===========================================================================
-- The watermark moves back on every change of the plan (D-423)
-- ===========================================================================
-- The catch-up looks again at the transfers concerned (one, those choosing an income, or all
-- of the budget) from p_from on: their watermark moves back before it, and it checks its own
-- marks again from there (private.materialise_transfers).
create function private.transfers_recheck(p_budget_id uuid, p_transfer_id uuid, p_income_id uuid, p_from date)
returns void
language sql
set search_path = ''
as $$
  update public.transfers as t
  set needs_check = true, settled_through = least(t.settled_through, p_from - 1)
  where t.budget_id = p_budget_id
    -- M2, R-ACCOUNT-308: nothing to look at again while the budget itself is being deleted (its
    -- transfers go with it; touching a row twice would re-check its key against the deleted budget)
    and exists (select 1 from public.budgets as b where b.id = p_budget_id)
    and (p_transfer_id is null or t.id = p_transfer_id)
    -- a transfer ended before the period before the one containing p_from has nothing there
    and (t.end_seq is null or p_transfer_id is not null
         or t.end_seq >= (select private.listing_seq(p_budget_id, p_from)) - 1)
    and (p_income_id is null
         or exists (select 1 from public.transfer_versions as v where v.transfer_id = t.id and v.income_id = p_income_id))
    and (not t.needs_check or t.settled_through > p_from - 1)
$$;

create function private.transfers_recheck_trigger()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_table_name = 'periods' then
    if tg_op = 'INSERT' then
      -- a new period changes no occurrence already planned: the catch-up looks at it from the
      -- watermark when there is room (next_due), and its marks need no check
      update public.transfers set next_due = new.start_date
      where budget_id = new.budget_id and (next_due is null or next_due > new.start_date)
        and (end_seq is null or end_seq > new.seq);
    elsif tg_op = 'UPDATE' then
      perform private.transfers_recheck(new.budget_id, null, null, least(old.start_date, new.start_date));
    else
      perform private.transfers_recheck(old.budget_id, null, null, old.start_date);
    end if;
  elsif tg_table_name = 'income_versions' then
    if tg_op in ('UPDATE', 'DELETE') then
      perform private.transfers_recheck(old.budget_id, null, old.income_id, private.seq_start(old.budget_id, old.effective_from_seq));
    end if;
    if tg_op in ('UPDATE', 'INSERT') then
      perform private.transfers_recheck(new.budget_id, null, new.income_id, private.seq_start(new.budget_id, new.effective_from_seq));
    end if;
  elsif tg_table_name = 'incomes' then
    perform private.transfers_recheck(new.budget_id, null, new.id, private.seq_start(new.budget_id,
      least(old.first_seq, new.first_seq, coalesce(old.end_seq, new.end_seq), coalesce(new.end_seq, old.end_seq))));
  elsif tg_table_name = 'transfer_versions' then
    if tg_op in ('UPDATE', 'DELETE') then
      perform private.transfers_recheck(old.budget_id, old.transfer_id, null, private.seq_start(old.budget_id, old.effective_from_seq));
    end if;
    if tg_op in ('UPDATE', 'INSERT') then
      perform private.transfers_recheck(new.budget_id, new.transfer_id, null, private.seq_start(new.budget_id, new.effective_from_seq));
    end if;
  elsif tg_table_name = 'transfers' then
    perform private.transfers_recheck(new.budget_id, new.id, null, least(old.starts_on, new.starts_on,
      private.seq_start(new.budget_id, least(old.first_seq, new.first_seq,
        coalesce(old.end_seq, new.end_seq, old.first_seq), coalesce(new.end_seq, old.end_seq, old.first_seq)))));
  elsif tg_table_name = 'transfer_occurrences' then
    -- D-423: every removal of a mark, from the start of the period that can plan its key
    -- (the one whose scheduled pay date it is, or the one containing it; D-490)
    perform private.transfers_recheck(old.budget_id, old.transfer_id, null,
      least(private.seq_start(old.budget_id, private.listing_seq(old.budget_id, old.occurrence_date)),
            coalesce((select p.start_date from public.periods as p
                      where p.budget_id = old.budget_id and p.pay_key = old.occurrence_date), old.occurrence_date),
            coalesce(old.done_on, old.occurrence_date)));
  end if;
  return null;
end;
$$;
create trigger periods_transfers_recheck after insert or update of start_date, end_date or delete on public.periods
  for each row execute function private.transfers_recheck_trigger();
create trigger income_versions_transfers_recheck
  after insert or update of pay_day, weekend_rule, effective_from_seq or delete on public.income_versions
  for each row execute function private.transfers_recheck_trigger();
create trigger incomes_transfers_recheck after update of first_seq, end_seq on public.incomes
  for each row execute function private.transfers_recheck_trigger();
create trigger transfer_versions_recheck after insert or update or delete on public.transfer_versions
  for each row execute function private.transfers_recheck_trigger();
create trigger transfers_recheck after update of first_seq, end_seq, starts_on on public.transfers
  for each row execute function private.transfers_recheck_trigger();
create trigger transfer_occurrences_recheck after delete on public.transfer_occurrences
  for each row execute function private.transfers_recheck_trigger();

-- D-426: an income deleted outright (added and removed in one period) leaves the transfers that
-- chose it following the primary income, saying so (income_gone), never silently.
create function private.income_deleted_for_transfers()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from public.budgets as b where b.id = old.budget_id) then
    return old;  -- R-ACCOUNT-308: the budget is being deleted, its transfers with it
  end if;
  perform private.transfers_recheck(old.budget_id, null, old.id, private.seq_start(old.budget_id, old.first_seq));
  update public.transfer_versions set income_gone = true, income_id = null where income_id = old.id;
  return old;
end;
$$;
create trigger incomes_deleted_for_transfers before delete on public.incomes
  for each row execute function private.income_deleted_for_transfers();

-- ===========================================================================
-- One catch-up step creates a bounded number of transactions (R-PERIOD-300, D-427)
-- ===========================================================================
-- At most this many subscription charges and transfer transactions per budget and statement:
-- a backlog that gets room (the budget was full for years) is created over several steps, each
-- well under the API's statement timeout.
create function private.limit_catch_up_transactions() returns integer
language sql immutable set search_path = '' as $$ select 4000 $$;

create function private.step_key(p_budget_id uuid)
returns text
language sql
stable
set search_path = ''
as $$
  select pg_catalog.statement_timestamp()::text || '/' || p_budget_id::text
$$;

-- How many more transactions this statement's catch-up may create for the budget.
create function private.step_transactions_left(p_budget_id uuid)
returns integer
language plpgsql
stable
set search_path = ''
as $$
declare
  v text := coalesce(pg_catalog.current_setting('budget_tracker.catch_up_made', true), '');
begin
  if pg_catalog.split_part(v, '|', 1) = private.step_key(p_budget_id) then
    return greatest(private.limit_catch_up_transactions() - pg_catalog.split_part(v, '|', 2)::integer, 0);
  end if;
  return private.limit_catch_up_transactions();
end;
$$;

create function private.step_transactions_made(p_budget_id uuid, p_n integer)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_n > 0 then
    perform pg_catalog.set_config('budget_tracker.catch_up_made', private.step_key(p_budget_id) || '|'
      || (private.limit_catch_up_transactions() - private.step_transactions_left(p_budget_id) + p_n)::text, true);
  end if;
end;
$$;

-- When this statement's catch-up step started for the budget (set by ensure_periods), so the
-- charges and the transfers share the step's time bound with its periods.
create function private.step_started(p_budget_id uuid)
returns timestamptz
language plpgsql
stable
set search_path = ''
as $$
declare
  v text := coalesce(pg_catalog.current_setting('budget_tracker.catch_up_started', true), '');
begin
  if pg_catalog.split_part(v, '|', 1) = private.step_key(p_budget_id) then
    return pg_catalog.split_part(v, '|', 2)::timestamptz;
  end if;
  return null;
end;
$$;

-- D-428: a preview runs the write as its own statement would: the step's transactions and time
-- start afresh inside the preview's subtransaction (rolled back with it).
create function private.preview_fresh_step()
returns void
language sql
set search_path = ''
as $$
  select pg_catalog.set_config('budget_tracker.catch_up_made', '', true),
         pg_catalog.set_config('budget_tracker.catch_up_cut', '', true),
         pg_catalog.set_config('budget_tracker.catch_up_started', '', true)
$$;

-- The step stopped before creating everything due (its bound): ensure_periods then does not
-- answer 0, and the budget is not caught up.
create function private.step_cut(p_budget_id uuid)
returns void
language sql
set search_path = ''
as $$
  select pg_catalog.set_config('budget_tracker.catch_up_cut', private.step_key(p_budget_id), true)
$$;

create function private.step_was_cut(p_budget_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(pg_catalog.current_setting('budget_tracker.catch_up_cut', true), '') = private.step_key(p_budget_id)
$$;

-- The subscriptions' catch-up of step 4 (R-SUBSCRIPTION-073, R-SUBSCRIPTION-111), bounded per
-- step (R-PERIOD-300): at most limit_catch_up_transactions() charges per budget and statement and
-- about limit_catch_up_work() of work; what is left stays due (none skipped) for the next step.
create or replace function private.materialise_charges(p_budget_id uuid)
returns integer
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_upto date := private.charge_horizon(p_budget_id);
  v_room integer;
  v_step integer;
  v_made integer := 0;
  v_inserted integer;
  v_through date;
  v_dates date[];
  v_prices bigint[];
  v_categories uuid[];
  v_started timestamptz := coalesce(private.step_started(p_budget_id), pg_catalog.clock_timestamp());
  s public.subscriptions;
begin
  if v_upto is null or not exists (select 1 from public.subscriptions as x
                                   where x.budget_id = p_budget_id and x.next_due <= v_upto) then
    return 0;
  end if;
  v_room := private.transaction_room(p_budget_id);
  v_step := private.step_transactions_left(p_budget_id);
  for s in
    select x.* from public.subscriptions as x
    where x.budget_id = p_budget_id and x.next_due <= v_upto
    order by x.created_at, x.id
  loop
    if v_room <= 0 then
      exit;  -- the budget is full: the rest wait for room
    end if;
    if v_step <= 0 or (v_made > 0 and pg_catalog.clock_timestamp() - v_started > private.limit_catch_up_work()) then
      perform private.step_cut(p_budget_id);  -- the step's bound: the next step goes on
      exit;
    end if;
    select pg_catalog.array_agg(c.d order by c.d), pg_catalog.array_agg(v.price order by c.d),
           pg_catalog.array_agg(v.category_id order by c.d)
    into v_dates, v_prices, v_categories
    from public.periods as y
    cross join lateral (
      select z.price, z.category_id, z.anchor_date, z.cadence, z.charge_day from public.subscription_versions as z
      where z.subscription_id = s.id and z.effective_from_seq <= y.seq
      order by z.effective_from_seq desc limit 1
    ) as v
    cross join lateral private.charge_dates(v.anchor_date, v.cadence,
                                            greatest(y.start_date, s.charged_through + 1), least(y.end_date, v_upto),
                                            v.charge_day) as c (d)
    where y.budget_id = p_budget_id and y.end_date > s.charged_through and y.start_date <= v_upto
      and y.seq >= s.first_seq and (s.end_seq is null or y.seq < s.end_seq);
    v_through := v_upto;
    if pg_catalog.cardinality(v_dates) > least(v_room, v_step) then
      -- full, or the step's bound: stop before the first charge that does not fit
      if v_step < v_room then
        perform private.step_cut(p_budget_id);
      end if;
      v_through := v_dates[least(v_room, v_step) + 1] - 1;
      v_dates := v_dates[1:least(v_room, v_step)];
    end if;
    if pg_catalog.cardinality(v_dates) > 0 then
      insert into public.transactions (budget_id, kind, amount, date, category_id, subscription_id, charge_date, review_state)
      select p_budget_id, 'expense', u.price, u.d, u.category_id, s.id, u.d, 'awaiting_confirmation'
      from unnest(v_dates, v_prices[1:pg_catalog.cardinality(v_dates)], v_categories[1:pg_catalog.cardinality(v_dates)])
        as u (d, price, category_id)
      on conflict (subscription_id, charge_date) do nothing;
      get diagnostics v_inserted = row_count;
      v_room := v_room - v_inserted;
      v_step := v_step - v_inserted;
      v_made := v_made + v_inserted;
    end if;
    update public.subscriptions
    set charged_through = v_through,
        next_due = case when v_through < v_upto then v_through + 1 else private.subscription_next_due(id, v_through) end
    where id = s.id;
    exit when v_through < v_upto;
  end loop;
  perform private.step_transactions_made(p_budget_id, v_made);
  return v_made;
end;
$$;

-- A subscription charge or a transfer's transaction is due and the budget has room for it, or
-- the plan of a transfer changed since the catch-up last looked (its marks are checked again
-- even when the budget is full).
create or replace function private.charges_pending(p_budget_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select ((exists (select 1 from public.subscriptions as s
                   where s.budget_id = p_budget_id and s.next_due <= private.charge_horizon(p_budget_id))
           or exists (select 1 from public.transfers as t
                      where t.budget_id = p_budget_id and t.next_due <= private.charge_horizon(p_budget_id)))
          and private.transaction_room(p_budget_id) > 0)
      or exists (select 1 from public.transfers as t where t.budget_id = p_budget_id and t.needs_check)
$$;

-- R-ACCOUNT-074, R-ACCOUNT-302, D-423, D-424: the transfers' catch-up. For each transfer whose
-- plan changed or whose next automatic linked occurrence is due, from its watermark on:
-- 1. its own marks (by_catch_up) whose occurrence is no longer planned, or no longer due, go,
--    with their transactions (a member's mark never goes here);
-- 2. every planned occurrence of an automatic transfer linked to a category, due by the horizon
--    (today, and not after the budget's last day), without a mark, gets one transaction:
--    dated its due date, at the amount and in the category of the terms in force in its
--    period, confirmed; in due-date order, exactly once (one mark per key), none skipped (the
--    watermark passes a due date only once settled), held back when the budget is full, and
--    at most one step's bound per statement (R-PERIOD-300).
-- Caller holds the budget lock and has created the periods. Returns how many it created.
create function private.materialise_transfers(p_budget_id uuid)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_upto date := private.charge_horizon(p_budget_id);
  v_latest integer;
  v_room integer;
  v_step integer;
  v_made integer := 0;
  v_inserted integer;
  v_started timestamptz := coalesce(private.step_started(p_budget_id), pg_catalog.clock_timestamp());
  v_cut boolean := false;
  t public.transfers;
  v_w date;
  v_seq integer;
  v_to integer;
  v_next date;
  v_stop boolean;
  v_bad uuid[];
  v_keys date[];
  v_dues date[];
  v_amounts bigint[];
  v_categories uuid[];
  r record;
begin
  if v_upto is null then
    return 0;
  end if;
  select pg_catalog.max(p.seq) into v_latest from public.periods as p where p.budget_id = p_budget_id;
  v_room := greatest(private.transaction_room(p_budget_id), 0);
  v_step := private.step_transactions_left(p_budget_id);
  for t in
    select x.* from public.transfers as x
    where x.budget_id = p_budget_id and (x.needs_check or (x.next_due <= v_upto and v_room > 0))
    order by x.created_at, x.id
  loop
    if v_step <= 0 or (v_made > 0 and pg_catalog.clock_timestamp() - v_started > private.limit_catch_up_work()) then
      perform private.step_cut(p_budget_id);  -- the step's bound: the next step goes on
      exit;
    end if;
    v_w := t.settled_through;
    -- never automatic and linked, and no mark of the catch-up after the watermark: nothing to do
    if not exists (select 1 from public.transfer_versions as x
                   where x.transfer_id = t.id and x.is_automatic and x.category_id is not null)
       and not exists (select 1 from public.transfer_occurrences as o
                       where o.transfer_id = t.id and o.by_catch_up and (o.done_on > v_w or o.occurrence_date > v_w)) then
      update public.transfers set settled_through = v_upto, next_due = null, needs_check = false where id = t.id;
      continue;
    end if;
    -- 1. its own marks from the watermark on that no longer hold (the plan changed): only the
    --    periods that can plan their keys are computed (D-490)
    if t.needs_check then
      select pg_catalog.array_agg(o.occurrence_date) into v_keys
      from public.transfer_occurrences as o
      where o.transfer_id = t.id and o.by_catch_up and (o.done_on > v_w or o.occurrence_date > v_w);
      if v_keys is not null then
        with planned as materialized (
          select pl.occurrence_date from private.transfer_plan_keys(p_budget_id, t.id, v_keys) as pl
          where pl.due_date <= v_upto
        )
        select pg_catalog.array_agg(o.id) into v_bad
        from public.transfer_occurrences as o
        where o.transfer_id = t.id and o.by_catch_up and (o.done_on > v_w or o.occurrence_date > v_w)
          and o.occurrence_date not in (select p.occurrence_date from planned as p);
        perform private.drop_transfer_marks(v_bad);
      end if;
    end if;
    -- 2. the transactions due, in due-date order, the periods after the watermark a chunk at a
    --    time, so a step costs what it creates, not the transfer's whole history
    v_next := null;
    v_stop := false;
    v_keys := '{}'; v_dues := '{}'; v_amounts := '{}'; v_categories := '{}';
    select pg_catalog.min(p.seq) into v_seq from public.periods as p
    where p.budget_id = p_budget_id and p.end_date > v_w;
    v_seq := greatest(coalesce(v_seq, v_latest + 1) - 1, 1);
    while not v_stop and v_seq <= v_latest loop
      v_to := least(v_seq + 59, v_latest);
      for r in
        select pl.occurrence_date, pl.due_date, pl.amount, pl.category_id, pl.is_automatic
        from private.transfer_plan_range(p_budget_id, t.id, v_seq, v_to) as pl
        where pl.due_date > v_w
        order by pl.due_date, pl.occurrence_date
      loop
        continue when not r.is_automatic or r.category_id is null;
        continue when exists (select 1 from public.transfer_occurrences as o
                              where o.transfer_id = t.id and o.occurrence_date = r.occurrence_date);
        if r.due_date > v_upto then
          v_next := r.due_date;  -- due later
          v_stop := true;
          exit;
        end if;
        if pg_catalog.cardinality(v_keys) >= least(v_room, v_step)
           or (v_made + pg_catalog.cardinality(v_keys) > 0
               and pg_catalog.clock_timestamp() - v_started > private.limit_catch_up_work()) then
          v_next := r.due_date;  -- the budget is full (held back), or the step's bound
          v_cut := v_cut or v_step < v_room or pg_catalog.cardinality(v_keys) < least(v_room, v_step);
          v_stop := true;
          exit;
        end if;
        v_keys := v_keys || r.occurrence_date;
        v_dues := v_dues || r.due_date;
        v_amounts := v_amounts || r.amount;
        v_categories := v_categories || r.category_id;
      end loop;
      v_seq := v_to + 1;
    end loop;
    if pg_catalog.cardinality(v_keys) > 0 then
      with made as (
        insert into public.transfer_occurrences (budget_id, transfer_id, occurrence_date, mark, done_on, amount, by_catch_up)
        select p_budget_id, t.id, u.k, 'done', u.due, u.amount, true
        from unnest(v_keys, v_dues, v_amounts) as u (k, due, amount)
        on conflict (transfer_id, occurrence_date) do nothing
        returning id, occurrence_date, done_on, amount
      )
      insert into public.transactions (budget_id, kind, amount, date, category_id, transfer_occurrence_id)
      select p_budget_id, 'expense', made.amount, made.done_on, u.category_id, made.id
      from made join unnest(v_keys, v_categories) as u (k, category_id) on u.k = made.occurrence_date;
      get diagnostics v_inserted = row_count;
      v_room := v_room - v_inserted;
      v_step := v_step - v_inserted;
      v_made := v_made + v_inserted;
    end if;
    update public.transfers
    set settled_through = case when v_next is null then v_upto else v_next - 1 end,
        next_due = v_next, needs_check = false
    where id = t.id;
    if v_cut then
      perform private.step_cut(p_budget_id);
      exit;
    end if;
  end loop;
  perform private.step_transactions_made(p_budget_id, v_made);
  return v_made;
end;
$$;

-- R-PERIOD-250, D-387: a budget more than limit_roll_over_days() behind (its last period ended
-- longer ago than that, before today or its end date, or a charge or a transfer's transaction
-- due that long ago is not made yet) is caught up only by ensure_periods and
-- get_current_period (and create_budget): any other call answers catching_up here, before the
-- lock, doing nothing.
create or replace function private.catch_up_gate(p_budget_id uuid)
returns void
language plpgsql
stable
set search_path = ''
as $$
declare
  v_last date;
  v_end date;
begin
  if pg_catalog.current_setting('budget_tracker.catch_up', true) = 'multi' then
    return;
  end if;
  select p.end_date into v_last from public.periods as p where p.budget_id = p_budget_id order by p.seq desc limit 1;
  select b.end_date into v_end from public.budgets as b where b.id = p_budget_id;
  if v_last < least(private.today(), coalesce(v_end, private.today())) - private.limit_roll_over_days() then
    raise exception 'catching_up' using errcode = 'P0001';
  end if;
  -- D-433: as far behind with the charges or the transfers' transactions (their periods all
  -- there, the transactions not yet made): the same, so calls do not queue behind its steps
  if exists (select 1 from public.subscriptions as s
             where s.budget_id = p_budget_id
               and s.next_due < least(private.today(), coalesce(v_end, private.today())) - private.limit_roll_over_days())
     or exists (select 1 from public.transfers as x
                where x.budget_id = p_budget_id
                  and x.next_due < least(private.today(), coalesce(v_end, private.today())) - private.limit_roll_over_days()) then
    if private.transaction_room(p_budget_id) > 0 then  -- a full budget is not behind: they wait for room
      raise exception 'catching_up' using errcode = 'P0001';
    end if;
  end if;
end;
$$;

-- The catch-up of step 4 (D-387, D-276), with the transfers' transactions after the charges.
-- R-PERIOD-180, R-PERIOD-250, D-387: one bounded step per call, whoever calls and however
-- often within one statement (the periods the statement created so far count toward its
-- step); far behind, only ensure_periods and get_current_period do the work (catch_up_gate),
-- and those two wait at most limit_catch_up_wait() for another session's lock, then answer
-- catching_up (the client's loop tries again), never the statement timeout. R-PERIOD-300,
-- D-427: the transactions a step creates are bounded too; a step that stops before creating
-- every one due answers at least 1, so 0 still means caught up.
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
  v_key text := pg_catalog.statement_timestamp()::text;
  v_step text := coalesce(pg_catalog.current_setting('budget_tracker.catch_up_step', true), '');
  v_done integer := 0;
  v_timeout text;
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

  perform private.catch_up_gate(p_budget_id);
  if pg_catalog.current_setting('budget_tracker.catch_up', true) = 'multi' then
    v_timeout := pg_catalog.current_setting('lock_timeout');
    perform pg_catalog.set_config('lock_timeout', private.limit_catch_up_wait(), true);
    begin
      v_end := (private.lock_budget(p_budget_id)).end_date;
    exception when lock_not_available then
      perform pg_catalog.set_config('lock_timeout', v_timeout, true);
      raise exception 'catching_up' using errcode = 'P0001';
    end;
    perform pg_catalog.set_config('lock_timeout', v_timeout, true);
  else
    v_end := (private.lock_budget(p_budget_id)).end_date;
  end if;
  if pg_catalog.split_part(v_step, '|', 1) = v_key then
    v_done := pg_catalog.split_part(v_step, '|', 2)::integer;
  end if;
  v_started := pg_catalog.clock_timestamp();
  perform pg_catalog.set_config('budget_tracker.catch_up_started', private.step_key(p_budget_id) || '|' || v_started::text, true);
  loop
    exit when v_done + v_created >= least(coalesce(p_max, private.limit_catch_up_periods()), private.limit_catch_up_periods());
    -- D-276: and at most about two seconds of work (with the charges and the commit, a step
    -- stays well under the API's 8 s statement timeout whatever the budget holds)
    exit when v_created > 0 and pg_catalog.clock_timestamp() - v_started > private.limit_catch_up_work();
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
  perform pg_catalog.set_config('budget_tracker.catch_up_step', v_key || '|' || (v_done + v_created)::text, true);
  perform private.materialise_charges(p_budget_id);
  perform private.materialise_transfers(p_budget_id);
  if v_created = 0 and private.step_was_cut(p_budget_id) then
    return 1;  -- D-427: stopped at its bound with transactions still due: not caught up
  end if;
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

-- The next due date: the first occurrence of the current period due today or later, else the
-- first of the next periods at their projected boundaries (the terms in force now); null when
-- ended, when the budget has ended, or after its end date. Computed for this transfer only.
create function private.transfer_next_due(p_transfer_id uuid)
returns date
language plpgsql
stable
set search_path = ''
as $$
declare
  v_t public.transfers;
  v_current public.periods;
  v_v public.transfer_versions;
  v_due date;
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
  select pg_catalog.min(pl.due_date) into v_due
  from private.transfer_plan_range(v_t.budget_id, v_t.id, v_current.seq, v_current.seq) as pl
  where pl.due_date >= v_today;
  if v_due is not null then
    return v_due;
  end if;
  select v.* into v_v from public.transfer_versions as v where v.transfer_id = v_t.id
  order by v.effective_from_seq desc limit 1;
  v_budget_end := private.budget_end_date(v_t.budget_id);
  v_end := v_current.end_date;
  for k in 1..3 loop
    v_start := v_end + 1;
    exit when v_budget_end is not null and v_start > v_budget_end;
    v_end := private.future_period_end(v_t.budget_id, v_current, k);
    select pg_catalog.min(o.due_date) into v_due
    from private.transfer_period_occurrences(v_current.seq + k, v_start, v_end, v_start, v_t.starts_on, v_v.schedule,
      v_v.cadence, v_v.anchor_date, v_v.day_of_month, v_v.offset_days, v_v.income_id, v_v.income_gone) as o;
    if v_due is not null then
      return v_due;
    end if;
  end loop;
  return null;
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
       v.schedule = 'pay_date' and (v.income_gone or (v.income_id is not null and not private.income_in_force(v.income_id, r.seq)))
         as follows_primary,
       case when t.end_seq is null and t.first_seq <= r.seq then private.transfer_next_due(t.id) end as next_due_date,
       n.mark_count > 0 as has_history,
       n.mark_count = 0 and t.first_seq >= r.seq as removal_deletes,
       n.transaction_count,
       t.revision, t.created_at, t.updated_at,
       v.cadence, v.anchor_date as first_date,
       private.transfer_monthly_amount(v.amount, v.schedule, v.cadence) as monthly_amount,
       t.starts_on
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
  v_label text := private.clean_text(p_label);
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

-- R-ACCOUNT-002, R-ACCOUNT-070, R-ACCOUNT-072, R-ACCOUNT-300: a transfer's terms over [p_from, p_to).
-- A fixed-day schedule has a cadence (monthly, quarterly, yearly), a first date (any day up to
-- ten years ahead: it sets the phase) and a nominal day that the first date falls on (clamped
-- to its month's length).
create function private.assert_transfer_terms(
  p_budget_id uuid, p_from integer, p_to integer, p_from_account_id uuid, p_to_account_id uuid, p_amount bigint,
  p_schedule public.transfer_schedule, p_offset_days integer, p_day_of_month integer, p_income_id uuid,
  p_is_automatic boolean, p_category_id uuid, p_cadence public.subscription_cadence, p_first_date date
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
    if p_day_of_month is not null or p_cadence is not null or p_first_date is not null then
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
    if p_cadence is null or p_cadence not in ('monthly', 'quarterly', 'yearly') then
      raise exception 'invalid_cadence' using errcode = 'P0001';
    end if;
    if p_first_date is null or not private.is_sane_date(p_first_date)
       or p_first_date > private.today() + private.limit_schedule_days_ahead()
       or private.month_day(private.month_index(p_first_date), p_day_of_month) <> p_first_date then
      raise exception 'invalid_first_date' using errcode = 'P0001';
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

-- A fixed-day schedule given only its day: the first date with that day (clamped) on or after
-- the start of period p_seq.
create function private.transfer_first_date(p_budget_id uuid, p_seq integer, p_day integer)
returns date
language sql
stable
set search_path = ''
as $$
  select case when p_day is null or p_day not between 1 and 31 then null
              when private.month_day(private.month_index(s.d), p_day) >= s.d then private.month_day(private.month_index(s.d), p_day)
              else private.month_day(private.month_index(s.d) + 1, p_day) end
  from (select private.seq_start(p_budget_id, p_seq) as d) as s
$$;

-- The terms an edit gives from period p_seq: each argument omitted keeps the value in force
-- there. A new schedule kind takes its own arguments (an offset defaults to 0; a day of the
-- month or a first date is required; a cadence defaults to monthly); p_clear_income /
-- p_clear_category remove the chosen income / category. A new day without a first date keeps
-- the schedule's phase (the first date moves to that day in its month); a new first date sets
-- the day unless one is given.
create function private.transfer_new_terms(
  p_transfer public.transfers, p_seq integer, p_from_account_id uuid, p_to_account_id uuid, p_amount bigint,
  p_schedule public.transfer_schedule, p_offset_days integer, p_day_of_month integer, p_income_id uuid,
  p_is_automatic boolean, p_category_id uuid, p_clear_income boolean, p_clear_category boolean,
  p_cadence public.subscription_cadence, p_first_date date
)
returns table (
  from_account_id uuid, to_account_id uuid, amount bigint, schedule public.transfer_schedule, offset_days integer,
  day_of_month integer, income_id uuid, is_automatic boolean, category_id uuid,
  cadence public.subscription_cadence, anchor_date date, income_gone boolean
)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_old public.transfer_versions;
  v_schedule public.transfer_schedule;
  v_day integer;
  v_anchor date;
  v_cadence public.subscription_cadence;
begin
  if (coalesce(p_clear_income, false) and p_income_id is not null)
     or (coalesce(p_clear_category, false) and p_category_id is not null) then
    raise exception 'invalid_arguments' using errcode = 'P0001';
  end if;
  select v.* into v_old from public.transfer_versions as v
  where v.transfer_id = p_transfer.id and v.effective_from_seq <= p_seq
  order by v.effective_from_seq desc limit 1;
  v_schedule := coalesce(p_schedule, v_old.schedule);
  if v_schedule = 'day_of_month' then
    v_cadence := coalesce(p_cadence, case when v_old.schedule = 'day_of_month' then v_old.cadence end, 'monthly');
    if p_first_date is not null then
      v_day := coalesce(p_day_of_month, extract(day from p_first_date)::integer);
      v_anchor := p_first_date;
    else
      v_day := coalesce(p_day_of_month, case when v_old.schedule = 'day_of_month' then v_old.day_of_month end);
      if v_old.schedule = 'day_of_month' then
        v_anchor := case when v_day is null then null
                         else private.month_day(private.month_index(v_old.anchor_date), v_day) end;
      else
        v_anchor := private.transfer_first_date(p_transfer.budget_id, p_seq, v_day);
      end if;
    end if;
  else
    v_cadence := p_cadence;
    v_day := p_day_of_month;
    v_anchor := p_first_date;
  end if;
  return query select
    coalesce(p_from_account_id, v_old.from_account_id),
    coalesce(p_to_account_id, v_old.to_account_id),
    coalesce(p_amount, v_old.amount),
    v_schedule,
    case when v_schedule = 'pay_date'
         then coalesce(p_offset_days, case when v_old.schedule = 'pay_date' then v_old.offset_days end, 0)
         else p_offset_days end,
    v_day,
    case when coalesce(p_clear_income, false) then null::uuid
         when p_income_id is not null then p_income_id
         when v_schedule = 'pay_date' and v_old.schedule = 'pay_date' then v_old.income_id end,
    coalesce(p_is_automatic, v_old.is_automatic),
    case when coalesce(p_clear_category, false) then null::uuid else coalesce(p_category_id, v_old.category_id) end,
    v_cadence,
    v_anchor,
    case when coalesce(p_clear_income, false) or p_income_id is not null or v_schedule <> 'pay_date' then false
         when v_old.schedule = 'pay_date' then v_old.income_gone else false end;
end;
$$;

-- ---------------------------------------------------------------------------
-- What a write does to the transfers' marks (R-ACCOUNT-233, R-ACCOUNT-303, D-428): the previews
-- run the write itself in a subtransaction they roll back, and compare the marks before and
-- after it: the catch-up's transactions removed and created, and the members' marks whose
-- occurrence is no longer planned (kept, flagged) or planned again.
-- ---------------------------------------------------------------------------
create function private.transfer_marks_snapshot(p_budget_id uuid, p_transfer_id uuid, p_from date)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_keys date[];
  v_result jsonb;
begin
  -- whether a member's mark is planned: one plan over the periods that can plan its keys
  -- (D-490), not one per mark
  select pg_catalog.array_agg(distinct o.occurrence_date) into v_keys
  from public.transfer_occurrences as o
  where o.budget_id = p_budget_id and (p_transfer_id is null or o.transfer_id = p_transfer_id)
    and o.occurrence_date >= p_from and not o.by_catch_up;
  with planned as materialized (
    select distinct pl.transfer_id, pl.occurrence_date
    from private.transfer_plan_keys(p_budget_id, p_transfer_id, v_keys) as pl
    where v_keys is not null
  )
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
           'id', o.id, 't', o.transfer_id, 'k', o.occurrence_date, 'c', o.by_catch_up,
           'x', exists (select 1 from public.transactions as x where x.transfer_occurrence_id = o.id),
           'p', o.by_catch_up or exists (select 1 from planned as p
                                         where p.transfer_id = o.transfer_id and p.occurrence_date = o.occurrence_date))),
         '[]'::jsonb)
  into v_result
  from public.transfer_occurrences as o
  where o.budget_id = p_budget_id and (p_transfer_id is null or o.transfer_id = p_transfer_id)
    and o.occurrence_date >= p_from;
  return v_result;
end;
$$;

create function private.transfer_effect_rows(p_before jsonb, p_after jsonb)
returns table (transfer_id uuid, occurrence_date date, change text)
language sql
immutable
set search_path = ''
as $$
  with b as (select * from pg_catalog.jsonb_to_recordset(p_before) as r (id uuid, t uuid, k date, c boolean, x boolean, p boolean)),
  a as (select * from pg_catalog.jsonb_to_recordset(p_after) as r (id uuid, t uuid, k date, c boolean, x boolean, p boolean))
  select b.t, b.k, 'transaction_removed' from b where b.c and b.x and not exists (select 1 from a where a.id = b.id)
  union all
  select a.t, a.k, 'transaction_created' from a where a.c and a.x and not exists (select 1 from b where b.id = a.id)
  union all
  select b.t, b.k, 'mark_unplanned' from b join a on a.id = b.id where not b.c and b.p and not a.p
  union all
  select b.t, b.k, 'mark_planned_again' from b join a on a.id = b.id where not b.c and not b.p and a.p
$$;

-- Rows of the create and edit previews, read after the write (inside the preview's
-- subtransaction): the first p_count occurrences the terms govern, the existing periods' first,
-- then, while the terms are open-ended, the next periods at their projected boundaries (never
-- after the budget's end); each says whether the write created its transaction at once, and
-- every row carries the counts over everything the write did. No occurrence: one row with the
-- counts only (occurrence_date null).
create function private.transfer_preview_rows(
  p_budget_id uuid, p_transfer_id uuid, p_from_seq integer, p_to_seq integer, p_count integer,
  p_before jsonb, p_after jsonb
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_latest public.periods;
  v_t public.transfers;
  v_v public.transfer_versions;
  v_created integer;
  v_removed integer;
  v_unplanned integer;
  v_keys date[];
  v_rows jsonb := '[]'::jsonb;
  v_n integer := 0;
  v_budget_end date := private.budget_end_date(p_budget_id);
  v_start date;
  v_end date;
  v_k integer := 0;
  r record;
begin
  select pg_catalog.count(*) filter (where e.change = 'transaction_created'),
         pg_catalog.count(*) filter (where e.change = 'transaction_removed'),
         pg_catalog.count(*) filter (where e.change = 'mark_unplanned'),
         pg_catalog.array_agg(e.occurrence_date) filter (where e.change = 'transaction_created' and e.transfer_id = p_transfer_id)
  into v_created, v_removed, v_unplanned, v_keys
  from private.transfer_effect_rows(p_before, p_after) as e;
  select p.* into v_latest from public.periods as p where p.budget_id = p_budget_id order by p.seq desc limit 1;
  select t.* into v_t from public.transfers as t where t.id = p_transfer_id;
  for r in
    select pl.period_id, pl.start_date, pl.end_date, pl.occurrence_date, pl.due_date, pl.amount, pl.is_automatic,
           pl.category_id, pl.follows_primary
    from private.transfer_plan_range(p_budget_id, p_transfer_id, p_from_seq, coalesce(p_to_seq - 1, v_latest.seq)) as pl
    order by pl.due_date, pl.occurrence_date
    limit p_count
  loop
    v_n := v_n + 1;
    v_rows := v_rows || pg_catalog.jsonb_build_object('period_id', r.period_id, 'start_date', r.start_date,
      'end_date', r.end_date, 'projected', false, 'occurrence_date', r.occurrence_date, 'due_date', r.due_date,
      'amount', r.amount, 'is_automatic', r.is_automatic, 'category_id', r.category_id,
      'follows_primary', r.follows_primary, 'created_at_once', r.occurrence_date = any (coalesce(v_keys, '{}')));
  end loop;
  if p_to_seq is null and v_latest.end_date >= private.today() and v_t.end_seq is null then
    select v.* into v_v from public.transfer_versions as v where v.transfer_id = p_transfer_id
    order by v.effective_from_seq desc limit 1;
    v_end := v_latest.end_date;
    while v_n < p_count and v_k < 12 * p_count + 12 loop
      v_k := v_k + 1;
      v_start := v_end + 1;
      exit when v_budget_end is not null and v_start > v_budget_end;
      v_end := private.future_period_end(p_budget_id, v_latest, v_k);
      for r in
        select o.occurrence_date, o.due_date, o.follows_primary
        from private.transfer_period_occurrences(v_latest.seq + v_k, v_start, v_end, v_start, v_t.starts_on, v_v.schedule,
          v_v.cadence, v_v.anchor_date, v_v.day_of_month, v_v.offset_days, v_v.income_id, v_v.income_gone) as o
        order by o.due_date, o.occurrence_date
      loop
        exit when v_n >= p_count;
        v_n := v_n + 1;
        v_rows := v_rows || pg_catalog.jsonb_build_object('period_id', null, 'start_date', v_start, 'end_date', v_end,
          'projected', true, 'occurrence_date', r.occurrence_date, 'due_date', r.due_date, 'amount', v_v.amount,
          'is_automatic', v_v.is_automatic, 'category_id', v_v.category_id, 'follows_primary', r.follows_primary,
          'created_at_once', false);
      end loop;
    end loop;
  end if;
  if v_n = 0 then
    v_rows := pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('projected', false, 'created_at_once', false));
  end if;
  return (select pg_catalog.jsonb_agg(e || pg_catalog.jsonb_build_object('created_at_once_count', v_created,
            'transactions_removed_count', v_removed, 'marks_unplanned_count', v_unplanned))
          from pg_catalog.jsonb_array_elements(v_rows) as e);
end;
$$;

-- R-ACCOUNT-002, R-ACCOUNT-300: in force from the current period, or, as a correction, from
-- p_from_period_id; counts from that period's start (starts_on, D-421). A fixed-day schedule
-- takes a cadence (default monthly) and a first date (default: the first date with the given
-- day on or after that start). Its transactions due up to today (automatic and linked) are
-- created with it (within the step's bound, D-427).
create function private.create_transfer_core(
  p_budget_id uuid, p_name text, p_from_account_id uuid, p_to_account_id uuid, p_amount bigint,
  p_schedule public.transfer_schedule, p_offset_days integer, p_day_of_month integer, p_income_id uuid,
  p_is_automatic boolean, p_category_id uuid, p_from_period_id uuid, p_cadence public.subscription_cadence,
  p_first_date date
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_name text;
  v_seq integer;
  v_offset integer := case when p_schedule = 'pay_date' then coalesce(p_offset_days, 0) else p_offset_days end;
  v_day integer := p_day_of_month;
  v_cadence public.subscription_cadence := p_cadence;
  v_first date := p_first_date;
  v_starts_on date;
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
  if p_schedule = 'day_of_month' then
    v_cadence := coalesce(p_cadence, 'monthly');
    v_day := coalesce(p_day_of_month, extract(day from p_first_date)::integer);
    v_first := coalesce(p_first_date, private.transfer_first_date(p_budget_id, v_seq, v_day));
  end if;
  perform private.assert_transfer_terms(p_budget_id, v_seq, null, p_from_account_id, p_to_account_id, p_amount,
    p_schedule, v_offset, v_day, p_income_id, p_is_automatic, p_category_id, v_cadence, v_first);
  perform private.assert_transfer_room(p_budget_id);
  select least(p.start_date, coalesce(p.pay_key, p.start_date)) into v_starts_on
  from public.periods as p where p.budget_id = p_budget_id and p.seq = v_seq;
  insert into public.transfers (budget_id, name, first_seq, starts_on, settled_through, needs_check)
  values (p_budget_id, v_name, v_seq, v_starts_on, v_starts_on - 1, true)
  returning id into v_id;
  insert into public.transfer_versions (transfer_id, budget_id, effective_from_seq, from_account_id, to_account_id,
                                        amount, schedule, offset_days, day_of_month, income_id, is_automatic, category_id,
                                        cadence, anchor_date)
  values (v_id, p_budget_id, v_seq, p_from_account_id, p_to_account_id, p_amount, p_schedule, v_offset,
          v_day, p_income_id, p_is_automatic, p_category_id, v_cadence, v_first);
  perform private.materialise_transfers(p_budget_id);
  return v_id;
end;
$$;

-- The arguments of step 7's first version (moved behind the retry guard by the client-request
-- migration, then replaced by the full signature in 20261122100000_transfer_schedule.sql).
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
  v_id uuid;
begin
  v_id := private.create_transfer_core(p_budget_id, p_name, p_from_account_id, p_to_account_id, p_amount, p_schedule,
    p_offset_days, p_day_of_month, p_income_id, p_is_automatic, p_category_id, p_from_period_id, null, null);
  return query select * from public.transfer_overview as o where o.id = v_id;
end;
$$;

-- R-ACCOUNT-233, D-398, D-428: what create_transfer with these arguments would do, by running it
-- and rolling it back.
create function public.preview_create_transfer(
  p_budget_id uuid, p_from_account_id uuid, p_to_account_id uuid, p_amount bigint,
  p_schedule public.transfer_schedule, p_offset_days integer default null, p_day_of_month integer default null,
  p_income_id uuid default null, p_is_automatic boolean default false, p_category_id uuid default null,
  p_from_period_id uuid default null, p_count integer default 6, p_cadence public.subscription_cadence default null,
  p_first_date date default null
)
returns table (
  period_id uuid, start_date date, end_date date, projected boolean, occurrence_date date, due_date date, amount bigint,
  is_automatic boolean, category_id uuid, follows_primary boolean, created_at_once boolean, created_at_once_count integer,
  transactions_removed_count integer, marks_unplanned_count integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_seq integer;
  v_id uuid;
  v_before jsonb;
  v_rows jsonb;
begin
  perform private.assert_member(p_budget_id);
  if p_count is null or p_count not between 1 and private.limit_transfer_preview() then
    raise exception 'invalid_limit' using errcode = 'P0001';
  end if;
  -- D-428: a preview that runs the write takes the budget as the write would, before it reads the
  -- revisions and marks it compares: behind a writer it waits, then previews what the writer left
  perform private.lock_and_catch_up(p_budget_id);
  if p_from_period_id is not null then
    v_seq := private.period_seq(p_budget_id, p_from_period_id);
  else
    v_seq := private.current_seq(p_budget_id);
  end if;
  v_before := '[]'::jsonb;  -- a new transfer has no mark, and creating it changes no other's
  begin
    perform private.preview_fresh_step();
    v_id := private.create_transfer_core(p_budget_id, 'preview', p_from_account_id, p_to_account_id, p_amount,
      p_schedule, p_offset_days, p_day_of_month, p_income_id, p_is_automatic, p_category_id, p_from_period_id,
      p_cadence, p_first_date);
    v_rows := private.transfer_preview_rows(p_budget_id, v_id, v_seq, null, p_count, v_before,
      private.transfer_marks_snapshot(p_budget_id, v_id, private.seq_start(p_budget_id, v_seq) - 93));
    raise exception 'preview' using errcode = 'P0050';
  exception when sqlstate 'P0050' then
    null;  -- rolled back
  end;
  return query select * from pg_catalog.jsonb_to_recordset(v_rows) as r (
    period_id uuid, start_date date, end_date date, projected boolean, occurrence_date date, due_date date,
    amount bigint, is_automatic boolean, category_id uuid, follows_primary boolean, created_at_once boolean,
    created_at_once_count integer, transactions_removed_count integer, marks_unplanned_count integer);
end;
$$;

-- R-VERSION-071, D-121: a rename, and/or new terms from the current period (past periods keep
-- theirs; a second change in the same period replaces the first), or, with p_from_period_id, an
-- explicit correction until the next existing change. The catch-up then looks at the
-- occurrences again (D-424): its own marks whose occurrence is no longer planned go with their
-- transactions; an automatic linked occurrence due without a mark gets its transaction (past
-- periods of a correction included, Q-221); a member's mark stays (flagged when its occurrence
-- is no longer planned). A transaction already made keeps its amount and category (R-ACCOUNT-305).
create function public.update_transfer(
  p_transfer_id uuid, p_expected_revision integer, p_name text default null,
  p_from_account_id uuid default null, p_to_account_id uuid default null, p_amount bigint default null,
  p_schedule public.transfer_schedule default null, p_offset_days integer default null,
  p_day_of_month integer default null, p_income_id uuid default null, p_is_automatic boolean default null,
  p_category_id uuid default null, p_clear_income boolean default false, p_clear_category boolean default false,
  p_from_period_id uuid default null, p_cadence public.subscription_cadence default null, p_first_date date default null
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
                  p_is_automatic, p_category_id, p_cadence, p_first_date) > 0
     or coalesce(p_clear_income, false) or coalesce(p_clear_category, false) then
    select * into v_span from private.transfer_edit_span(v_transfer, p_from_period_id);
    select * into v_terms from private.transfer_new_terms(v_transfer, v_span.from_seq, p_from_account_id, p_to_account_id,
      p_amount, p_schedule, p_offset_days, p_day_of_month, p_income_id, p_is_automatic, p_category_id,
      p_clear_income, p_clear_category, p_cadence, p_first_date);
    perform private.assert_transfer_terms(v_transfer.budget_id, v_span.from_seq, v_span.to_seq, v_terms.from_account_id,
      v_terms.to_account_id, v_terms.amount, v_terms.schedule, v_terms.offset_days, v_terms.day_of_month,
      p_income_id, v_terms.is_automatic, v_terms.category_id, v_terms.cadence, v_terms.anchor_date);  -- D-396
    insert into public.transfer_versions (transfer_id, budget_id, effective_from_seq, from_account_id, to_account_id,
                                          amount, schedule, offset_days, day_of_month, income_id, is_automatic, category_id,
                                          cadence, anchor_date, income_gone)
    values (v_transfer.id, v_transfer.budget_id, v_span.from_seq, v_terms.from_account_id, v_terms.to_account_id,
            v_terms.amount, v_terms.schedule, v_terms.offset_days, v_terms.day_of_month, v_terms.income_id,
            v_terms.is_automatic, v_terms.category_id, v_terms.cadence, v_terms.anchor_date, v_terms.income_gone)
    on conflict (transfer_id, effective_from_seq) do update
      set from_account_id = excluded.from_account_id, to_account_id = excluded.to_account_id, amount = excluded.amount,
          schedule = excluded.schedule, offset_days = excluded.offset_days, day_of_month = excluded.day_of_month,
          income_id = excluded.income_id, is_automatic = excluded.is_automatic, category_id = excluded.category_id,
          cadence = excluded.cadence, anchor_date = excluded.anchor_date, income_gone = excluded.income_gone;
    update public.transfers set name = coalesce(v_name, name), revision = revision + 1 where id = v_transfer.id;
    perform private.materialise_transfers(v_transfer.budget_id);
  elsif p_from_period_id is not null then
    raise exception 'invalid_period' using errcode = 'P0001';
  elsif v_name is not null then
    update public.transfers set name = v_name where id = v_transfer.id;
  end if;
  return query select * from public.transfer_overview as o where o.id = v_transfer.id;
end;
$$;

-- R-ACCOUNT-233, D-428: the occurrences update_transfer with the same arguments would govern and
-- what it would do, by running it and rolling it back (with no term argument: the terms in
-- force from the current period, nothing done).
create function public.preview_update_transfer(
  p_transfer_id uuid, p_from_account_id uuid default null, p_to_account_id uuid default null,
  p_amount bigint default null, p_schedule public.transfer_schedule default null, p_offset_days integer default null,
  p_day_of_month integer default null, p_income_id uuid default null, p_is_automatic boolean default null,
  p_category_id uuid default null, p_clear_income boolean default false, p_clear_category boolean default false,
  p_from_period_id uuid default null, p_count integer default 6, p_cadence public.subscription_cadence default null,
  p_first_date date default null
)
returns table (
  period_id uuid, start_date date, end_date date, projected boolean, occurrence_date date, due_date date, amount bigint,
  is_automatic boolean, category_id uuid, follows_primary boolean, created_at_once boolean, created_at_once_count integer,
  transactions_removed_count integer, marks_unplanned_count integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_transfer public.transfers;
  v_span record;
  v_before jsonb;
  v_rows jsonb;
  v_terms boolean;
  v_amount_only boolean;
  v_new record;
begin
  select t.* into v_transfer from public.transfers as t where t.id = p_transfer_id;
  if v_transfer.id is null or not private.is_budget_member(v_transfer.budget_id) then
    raise exception 'transfer_not_found' using errcode = 'P0001';
  end if;
  if p_count is null or p_count not between 1 and private.limit_transfer_preview() then
    raise exception 'invalid_limit' using errcode = 'P0001';
  end if;
  v_terms := num_nonnulls(p_from_account_id, p_to_account_id, p_amount, p_schedule, p_offset_days, p_day_of_month,
                          p_income_id, p_is_automatic, p_category_id, p_cadence, p_first_date) > 0
             or coalesce(p_clear_income, false) or coalesce(p_clear_category, false);
  v_amount_only := p_amount is not null and p_from_period_id is null
             and num_nonnulls(p_from_account_id, p_to_account_id, p_schedule, p_offset_days, p_day_of_month,
                              p_income_id, p_is_automatic, p_category_id, p_cadence, p_first_date) = 0
             and not coalesce(p_clear_income, false) and not coalesce(p_clear_category, false);
  if v_amount_only then
    perform private.read_catch_up(v_transfer.budget_id);  -- no write, no lock
  else
    -- D-428: a preview that runs the write takes the budget as the write would, before it reads the
    -- revisions and marks it compares: behind a writer it waits, then previews what the writer left
    perform private.lock_and_catch_up(v_transfer.budget_id);
  end if;
  select t.* into v_transfer from public.transfers as t where t.id = p_transfer_id;
  if not v_terms and p_from_period_id is not null then
    raise exception 'invalid_period' using errcode = 'P0001';
  end if;
  select * into v_span from private.transfer_edit_span(v_transfer, p_from_period_id);
  -- an edit changes only this transfer's marks
  v_before := private.transfer_marks_snapshot(v_transfer.budget_id, v_transfer.id,
                                              private.seq_start(v_transfer.budget_id, v_span.from_seq) - 93);
  begin
    perform private.preview_fresh_step();
    if v_amount_only then
      -- the write's own checks of the new terms, without its write
      select * into v_new from private.transfer_new_terms(v_transfer, v_span.from_seq, null, null, p_amount, null, null,
        null, null, null, null, false, false, null, null);
      perform private.assert_transfer_terms(v_transfer.budget_id, v_span.from_seq, v_span.to_seq, v_new.from_account_id,
        v_new.to_account_id, v_new.amount, v_new.schedule, v_new.offset_days, v_new.day_of_month,
        null, v_new.is_automatic, v_new.category_id, v_new.cadence, v_new.anchor_date);
    elsif v_terms then
      perform public.update_transfer(v_transfer.id, v_transfer.revision, null, p_from_account_id, p_to_account_id,
        p_amount, p_schedule, p_offset_days, p_day_of_month, p_income_id, p_is_automatic, p_category_id,
        p_clear_income, p_clear_category, p_from_period_id, p_cadence, p_first_date);
    end if;
    v_rows := private.transfer_preview_rows(v_transfer.budget_id, v_transfer.id, v_span.from_seq, v_span.to_seq, p_count,
      v_before, private.transfer_marks_snapshot(v_transfer.budget_id, v_transfer.id,
                                                private.seq_start(v_transfer.budget_id, v_span.from_seq) - 93));
    if v_amount_only then
      -- an amount alone changes no occurrence and no transaction already made: the plan as it is,
      -- at the new amount, without running the write (no lock)
      select pg_catalog.jsonb_agg(case when e ? 'amount' and e ->> 'amount' is not null
                                       then e || pg_catalog.jsonb_build_object('amount', p_amount) else e end)
      into v_rows from pg_catalog.jsonb_array_elements(v_rows) as e;
    end if;
    raise exception 'preview' using errcode = 'P0050';
  exception when sqlstate 'P0050' then
    null;  -- rolled back
  end;
  return query select * from pg_catalog.jsonb_to_recordset(v_rows) as r (
    period_id uuid, start_date date, end_date date, projected boolean, occurrence_date date, due_date date,
    amount bigint, is_automatic boolean, category_id uuid, follows_primary boolean, created_at_once boolean,
    created_at_once_count integer, transactions_removed_count integer, marks_unplanned_count integer);
end;
$$;

-- What end_transfer from period p_seq does: 'deleted' or 'ended' (the write's own check).
create function private.transfer_end_outcome(p_transfer public.transfers, p_seq integer)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  v_latest integer := (select pg_catalog.max(p.seq) from public.periods as p where p.budget_id = p_transfer.budget_id);
begin
  if p_transfer.end_seq is not null and p_seq >= p_transfer.end_seq then
    raise exception 'transfer_ended' using errcode = 'P0001';
  end if;
  -- D-397: an automatic linked occurrence from then on is due and waits for room: ending would
  -- drop it (the budget is full); free room first, like a subscription's held charge
  if exists (select 1 from private.transfer_plan_range(p_transfer.budget_id, p_transfer.id, p_seq, v_latest) as pl
             where pl.is_automatic and pl.category_id is not null
               and pl.due_date <= private.charge_horizon(p_transfer.budget_id)
               and not exists (select 1 from public.transfer_occurrences as o
                               where o.transfer_id = p_transfer.id and o.occurrence_date = pl.occurrence_date)) then
    raise exception 'transfer_held_back' using errcode = 'P0001';
  end if;
  return case when p_seq <= p_transfer.first_seq
                   and not exists (select 1 from public.transfer_occurrences as o where o.transfer_id = p_transfer.id)
              then 'deleted' else 'ended' end;
end;
$$;

-- R-ACCOUNT-234, D-380, D-424: no occurrence from then on. Deleted when it never counted before
-- that period and nothing was ever done with it (transfer_overview.removal_deletes); otherwise
-- ended. Nothing recorded goes: every mark stays, the catch-up's included (they become marks
-- kept like a member's, so no later change of the plan removes them), and every transaction
-- keeps its link; a period's checklist still lists them (planned false, is_ended).
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
  if private.transfer_end_outcome(v_transfer, v_seq) = 'deleted' then
    delete from public.transfers where id = v_transfer.id;
    return 'deleted';
  end if;
  v_end := greatest(v_seq, v_transfer.first_seq);
  update public.transfers set end_seq = v_end where id = v_transfer.id;
  delete from public.transfer_versions as v
  where v.transfer_id = v_transfer.id and v.effective_from_seq >= v_end and v.effective_from_seq > v_transfer.first_seq;
  update public.transfer_occurrences as o set by_catch_up = false
  where o.transfer_id = v_transfer.id and o.by_catch_up
    and o.occurrence_date >= private.seq_start(v_transfer.budget_id, v_end) - 93
    and not exists (select 1 from private.transfer_planned(v_transfer.id, o.occurrence_date));
  perform private.materialise_transfers(v_transfer.budget_id);
  return 'ended';
end;
$$;

-- R-ACCOUNT-233: what end_transfer would do: the outcome or the refusal, and the occurrences of
-- the existing periods it removes from the plan (none marked), the marks it keeps there
-- (listed as ended) and how many of them have a transaction.
create function public.preview_end_transfer(p_transfer_id uuid, p_from_period_id uuid default null)
returns table (outcome text, refusal text, occurrences_removed integer, marks_kept integer, transactions_kept integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_t public.transfers;
  v_seq integer;
  v_outcome text;
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
    v_outcome := private.transfer_end_outcome(v_t, v_seq);
  exception when sqlstate 'P0001' then
    if sqlerrm = 'catching_up' then
      raise;
    end if;
    return query select null::text, sqlerrm, 0, 0, 0;
    return;
  end;
  return query
    select v_outcome,
           null::text,
           (pg_catalog.count(*) filter (where o.id is null))::integer,
           (pg_catalog.count(o.id))::integer,
           (pg_catalog.count(x.id))::integer
    from private.transfer_plan_range(v_t.budget_id, v_t.id, greatest(v_seq, v_t.first_seq),
                                     (select pg_catalog.max(p.seq) from public.periods as p where p.budget_id = v_t.budget_id)) as pl
    left join public.transfer_occurrences as o on o.transfer_id = v_t.id and o.occurrence_date = pl.occurrence_date
    left join public.transactions as x on x.transfer_occurrence_id = o.id;
end;
$$;

-- R-VERSION-132, R-VERSION-133: the terms in force in a chosen period, for a correction form.
create function public.get_transfer_terms(p_transfer_id uuid, p_period_id uuid)
returns table (
  period_id uuid, in_force boolean, from_account_id uuid, to_account_id uuid, amount bigint,
  schedule public.transfer_schedule, offset_days integer, day_of_month integer, income_id uuid,
  is_automatic boolean, category_id uuid, terms_from_period_id uuid, until_period_id uuid,
  cadence public.subscription_cadence, first_date date
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
           (select p.id from public.periods as p where p.budget_id = v_t.budget_id and p.seq = w.until_seq),
           v.cadence, v.anchor_date
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
  -- D-420: the occurrence's key (the scheduled date, or the scheduled pay date), what a mark is
  -- stored by; due_date is when it is due (they differ for a pay date that came early or late)
  occurrence_date date,
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
  recorded_by_name text,
  -- the transfer is not in force in this period (ended, or a reopen moved its end)
  is_ended boolean,
  -- D-424: false for a mark whose occurrence is no longer planned (the schedule, the pay dates,
  -- the boundaries or the end moved it away): kept and listed here, by its date, until undone
  planned boolean,
  -- the real amount's cadence (null: once per pay date)
  cadence public.subscription_cadence,
  -- done without a member's mark: an automatic occurrence assumed done (with the catch-up's
  -- transaction when linked)
  assumed boolean
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

-- R-ACCOUNT-005, R-ACCOUNT-301: one row per occurrence planned in the period, with
-- what was done, and one per mark listed there (its date lies in the period) whose occurrence
-- is no longer planned (planned false; is_ended when the transfer is not in force there). A
-- manual occurrence is to do (overdue once its due date has passed), done or skipped; an
-- automatic one is upcoming until its due date, then done without confirmation (R-ACCOUNT-004),
-- unless marked not done. A done one linked to a category shows its transaction's date and
-- amount, edits included (R-ACCOUNT-073).
create function private.transfer_checklist(p_budget_id uuid, p_seq integer, p_transfer_id uuid default null,
                                           p_occurrence_date date default null)
returns setof public.transfer_checklist_row
language plpgsql
stable
set search_path = ''
as $$
#variable_conflict use_column
begin
  return query
  with per as (
    select p.*, p.seq = 1 as is_first,
           not exists (select 1 from public.periods as q where q.budget_id = p.budget_id and q.seq > p.seq) as is_last
    from public.periods as p where p.budget_id = p_budget_id and p.seq = p_seq
  ),
  live as materialized (select * from private.transfer_plan_range(p_budget_id, p_transfer_id, p_seq, p_seq)),
  dated as materialized (
    select o.* from public.transfer_occurrences as o cross join per
    where o.budget_id = p_budget_id and (p_transfer_id is null or o.transfer_id = p_transfer_id)
      and (per.is_first or o.occurrence_date >= per.start_date)
      and (per.is_last or o.occurrence_date <= per.end_date)
  ),
  around as materialized (
    -- only for the marks this period does not plan (usually none): planned in another period,
    -- found by their keys (D-490), or not at all
    select pl.* from private.transfer_plan_keys(p_budget_id, p_transfer_id,
      (select pg_catalog.array_agg(distinct d.occurrence_date) from dated as d
       where not exists (select 1 from live as l
                         where l.transfer_id = d.transfer_id and l.occurrence_date = d.occurrence_date))) as pl
  ),
  orphan as (
    select o.* from dated as o
    where not exists (select 1 from live as l where l.transfer_id = o.transfer_id and l.occurrence_date = o.occurrence_date)
      and not exists (select 1 from around as a where a.transfer_id = o.transfer_id and a.occurrence_date = o.occurrence_date)
  )
  select * from (
  select pl.transfer_id, pl.period_id, pl.occurrence_date, pl.name, pl.from_account_id, fa.name as from_account_name,
         pl.to_account_id, ta.name as to_account_name,
         pl.amount, pl.due_date, pl.is_automatic, pl.category_id, c.name as category_name,
         case when o.id is not null then o.mark::text
              when pl.is_automatic then case when pl.due_date <= private.today() then 'done' else 'upcoming' end
              else 'to_do' end,
         o.id is null and not pl.is_automatic and pl.due_date < private.today(),
         o.id is null and pl.is_automatic and pl.category_id is not null
           and pl.due_date <= private.charge_horizon(p_budget_id),
         pl.follows_primary,
         coalesce(x.date, o.done_on), coalesce(x.amount, o.amount), x.id, x.revision,
         coalesce(o.revision, 0), o.recorded_by, private.marker_name(p_budget_id, o.recorded_by), false, true,
         pl.cadence,
         (o.id is null and pl.is_automatic and pl.due_date <= private.today()) or coalesce(o.by_catch_up, false)
  from live as pl
  join public.accounts as fa on fa.id = pl.from_account_id
  join public.accounts as ta on ta.id = pl.to_account_id
  left join public.categories as c on c.id = pl.category_id
  left join public.transfer_occurrences as o on o.transfer_id = pl.transfer_id and o.occurrence_date = pl.occurrence_date
  left join public.transactions as x on x.transfer_occurrence_id = o.id
  union all
  select t.id, per.id, o.occurrence_date, t.name, v.from_account_id, fa.name, v.to_account_id, ta.name, v.amount,
         null::date, v.is_automatic, v.category_id, c.name, o.mark::text, false, false, false,
         coalesce(x.date, o.done_on), coalesce(x.amount, o.amount), x.id, x.revision,
         o.revision, o.recorded_by, private.marker_name(p_budget_id, o.recorded_by),
         not (t.first_seq <= per.seq and (t.end_seq is null or per.seq < t.end_seq)), false, v.cadence, o.by_catch_up
  from orphan as o
  cross join per
  join public.transfers as t on t.id = o.transfer_id
  cross join lateral (
    select y.* from public.transfer_versions as y where y.transfer_id = t.id
    order by (y.effective_from_seq <= per.seq) desc,
             case when y.effective_from_seq <= per.seq then -y.effective_from_seq else y.effective_from_seq end
    limit 1
  ) as v
  join public.accounts as fa on fa.id = v.from_account_id
  join public.accounts as ta on ta.id = v.to_account_id
  left join public.categories as c on c.id = v.category_id
  left join public.transactions as x on x.transfer_occurrence_id = o.id
  ) as k
  where p_occurrence_date is null or k.occurrence_date = p_occurrence_date
  order by coalesce(k.due_date, k.occurrence_date), k.name, k.transfer_id, k.occurrence_date;
end;
$$;

-- R-ACCOUNT-005: the checklist of any period, current or past. Catches up first. R-APP-170: at
-- most 1000 rows; when the period lists more (only with many marks no longer planned), the
-- first 999 and a last row with status 'more', name the number not listed.
create function public.get_transfer_checklist(p_period_id uuid)
returns setof public.transfer_checklist_row
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_period public.periods;
  v_n integer := 0;
  r public.transfer_checklist_row;
  v_last public.transfer_checklist_row;
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
  for r in select * from private.transfer_checklist(v_period.budget_id, v_period.seq) loop
    v_n := v_n + 1;
    if v_n < private.limit_checklist_rows() then
      return next r;
    elsif v_n = private.limit_checklist_rows() then
      v_last := r;  -- listed only if it is the last one
    end if;
  end loop;
  if v_n = private.limit_checklist_rows() then
    return next v_last;
  elsif v_n > private.limit_checklist_rows() then
    v_last := null;
    v_last.period_id := v_period.id;
    v_last.status := 'more';
    v_last.name := (v_n - private.limit_checklist_rows() + 1)::text;
    return next v_last;
  end if;
end;
$$;

-- R-ACCOUNT-301, D-429: the occurrence a mark acts on, under the budget lock: one of the
-- transfer's checklist rows in that period (planned there, or a mark listed there), chosen by
-- p_occurrence_date, which is needed only when the period has several (occurrence_required);
-- none: transfer_not_in_force. Its mark is checked against the revision the client read (0: no
-- mark; R-CONCURRENCY-230).
create function private.lock_occurrence(p_transfer_id uuid, p_period_id uuid, p_occurrence_date date,
                                        p_expected_revision integer)
returns table (budget_id uuid, seq integer, start_date date, end_date date, occurrence_date date, due_date date,
               amount bigint, is_automatic boolean, category_id uuid, mark_id uuid, mark public.transfer_mark,
               by_catch_up boolean, planned boolean, starts_on date)
language plpgsql
set search_path = ''
as $$
declare
  v_transfer public.transfers;
  v_seq integer;
  v_count integer;
  v_row public.transfer_checklist_row;
  v_mark public.transfer_occurrences;
  v_period public.periods;
begin
  v_transfer := private.lock_transfer(p_transfer_id);
  v_seq := private.period_seq(v_transfer.budget_id, p_period_id);
  select pg_catalog.count(*)::integer into v_count
  from private.transfer_checklist(v_transfer.budget_id, v_seq, v_transfer.id, p_occurrence_date);
  if v_count = 0 then
    raise exception 'transfer_not_in_force' using errcode = 'P0001';
  end if;
  if v_count > 1 then
    raise exception 'occurrence_required' using errcode = 'P0001';
  end if;
  select c.* into v_row from private.transfer_checklist(v_transfer.budget_id, v_seq, v_transfer.id, p_occurrence_date) as c;
  select o.* into v_mark from public.transfer_occurrences as o
  where o.transfer_id = v_transfer.id and o.occurrence_date = v_row.occurrence_date;
  if p_expected_revision is null then
    raise exception 'invalid_revision' using errcode = 'P0001';
  end if;
  if coalesce(v_mark.revision, 0) <> p_expected_revision then
    raise exception 'record_changed' using errcode = 'P0001';
  end if;
  select p.* into v_period from public.periods as p where p.id = p_period_id;
  return query select v_transfer.budget_id, v_seq, v_period.start_date, v_period.end_date, v_row.occurrence_date,
                      v_row.due_date, v_row.amount, v_row.is_automatic, v_row.category_id, v_mark.id, v_mark.mark,
                      v_mark.by_catch_up, v_row.planned, v_transfer.starts_on;
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

-- R-ACCOUNT-005, R-ACCOUNT-073, R-ACCOUNT-305: a planned manual occurrence was done, on
-- p_done_on (default today when the period is the current one, else its due date; never after
-- today, never before the transfer's first counted day) with the amount actually moved
-- (default the planned amount). Linked to a category: its transaction is created, dated then.
create function public.mark_transfer_done(
  p_transfer_id uuid, p_period_id uuid, p_expected_revision integer,
  p_done_on date default null, p_amount bigint default null, p_occurrence_date date default null
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
  select * into o from private.lock_occurrence(p_transfer_id, p_period_id, p_occurrence_date, p_expected_revision);
  if not o.planned then
    raise exception 'transfer_not_in_force' using errcode = 'P0001';
  end if;
  if o.is_automatic then
    raise exception 'transfer_is_automatic' using errcode = 'P0001';
  end if;
  if o.mark_id is not null then
    raise exception 'transfer_already_marked' using errcode = 'P0001';
  end if;
  v_date := coalesce(p_done_on, case when v_today between o.start_date and o.end_date then v_today
                                     else least(o.due_date, v_today) end);
  perform private.transaction_period_seq(o.budget_id, v_date);  -- invalid_date, date_outside_periods
  if v_date < o.starts_on then
    raise exception 'before_transfer_start' using errcode = 'P0001';
  end if;
  v_amount := coalesce(p_amount, o.amount);
  if v_amount not between 1 and private.limit_amount() then
    raise exception 'invalid_amount' using errcode = 'P0001';
  end if;
  insert into public.transfer_occurrences (budget_id, transfer_id, occurrence_date, mark, done_on, amount, recorded_by)
  values (o.budget_id, p_transfer_id, o.occurrence_date, 'done', v_date, v_amount, (select auth.uid()))
  returning id into v_id;
  if o.category_id is not null then
    perform private.create_transfer_transaction(o.budget_id, v_id, o.category_id, v_date, v_amount, (select auth.uid()));
  end if;
  return query select * from private.transfer_checklist(o.budget_id, o.seq, p_transfer_id, o.occurrence_date);
end;
$$;

-- R-ACCOUNT-005: a planned manual occurrence was skipped.
create function public.skip_transfer(p_transfer_id uuid, p_period_id uuid, p_expected_revision integer,
                                     p_occurrence_date date default null)
returns setof public.transfer_checklist_row
language plpgsql
security definer
set search_path = ''
as $$
declare
  o record;
begin
  select * into o from private.lock_occurrence(p_transfer_id, p_period_id, p_occurrence_date, p_expected_revision);
  if not o.planned then
    raise exception 'transfer_not_in_force' using errcode = 'P0001';
  end if;
  if o.is_automatic then
    raise exception 'transfer_is_automatic' using errcode = 'P0001';
  end if;
  if o.mark_id is not null then
    raise exception 'transfer_already_marked' using errcode = 'P0001';
  end if;
  insert into public.transfer_occurrences (budget_id, transfer_id, occurrence_date, mark, recorded_by)
  values (o.budget_id, p_transfer_id, o.occurrence_date, 'skipped', (select auth.uid()));
  return query select * from private.transfer_checklist(o.budget_id, o.seq, p_transfer_id, o.occurrence_date);
end;
$$;

-- R-ACCOUNT-004, D-353: a planned automatic occurrence did not happen (before or after its due
-- date). Its transaction, if the catch-up made one, is deleted, and none is created for it again.
create function public.mark_transfer_not_done(p_transfer_id uuid, p_period_id uuid, p_expected_revision integer,
                                              p_occurrence_date date default null)
returns setof public.transfer_checklist_row
language plpgsql
security definer
set search_path = ''
as $$
declare
  o record;
  v_tx uuid;
begin
  select * into o from private.lock_occurrence(p_transfer_id, p_period_id, p_occurrence_date, p_expected_revision);
  if not o.planned then
    raise exception 'transfer_not_in_force' using errcode = 'P0001';
  end if;
  if not o.is_automatic then
    raise exception 'transfer_is_manual' using errcode = 'P0001';
  end if;
  if o.mark_id is null then
    insert into public.transfer_occurrences (budget_id, transfer_id, occurrence_date, mark, recorded_by)
    values (o.budget_id, p_transfer_id, o.occurrence_date, 'not_done', (select auth.uid()));
  elsif o.mark = 'done' and o.by_catch_up then
    select x.id into v_tx from public.transactions as x where x.transfer_occurrence_id = o.mark_id;
    update public.transfer_occurrences set mark = 'not_done', done_on = null, amount = null, by_catch_up = false,
                                           recorded_by = (select auth.uid())
    where id = o.mark_id;
    delete from public.transactions where id = v_tx;
  else
    raise exception 'transfer_already_marked' using errcode = 'P0001';
  end if;
  return query select * from private.transfer_checklist(o.budget_id, o.seq, p_transfer_id, o.occurrence_date);
end;
$$;

-- R-ACCOUNT-240, R-ACCOUNT-301, D-353, D-424: back to what the occurrence is without a mark, by the
-- terms in force for it now: a manual one to do (the transaction of "done" deleted); an
-- automatic one assumed done, its transaction created within the same call when linked and
-- due. A mark whose occurrence is no longer planned goes, with its transaction. The catch-up's
-- transaction of an automatic linked occurrence is already that state (nothing_to_undo: mark it
-- not done).
create function public.undo_transfer_mark(p_transfer_id uuid, p_period_id uuid, p_expected_revision integer,
                                          p_occurrence_date date default null)
returns setof public.transfer_checklist_row
language plpgsql
security definer
set search_path = ''
as $$
declare
  o record;
begin
  select * into o from private.lock_occurrence(p_transfer_id, p_period_id, p_occurrence_date, p_expected_revision);
  if o.mark_id is null
     or (o.planned and o.mark = 'done' and o.by_catch_up and o.is_automatic and o.category_id is not null) then
    raise exception 'nothing_to_undo' using errcode = 'P0001';
  end if;
  perform private.drop_transfer_marks(array[o.mark_id]);  -- the watermark moves back (D-423)
  perform private.materialise_transfers(o.budget_id);
  return query select * from private.transfer_checklist(o.budget_id, o.seq, p_transfer_id, o.occurrence_date);
end;
$$;

-- ===========================================================================
-- The money flow of a period (R-ACCOUNT-006, R-ACCOUNT-075, R-ACCOUNT-235, R-ACCOUNT-304, D-356)
-- ===========================================================================
-- The transfers in force in period p_seq at their terms then: their real amount and cadence,
-- and the monthly share the plan counts (D-425: a quarterly or yearly transfer counts its
-- amount divided by its months, half up, as a subscription's monthly cost). No due date needed.
create function private.transfers_in_force(p_budget_id uuid, p_seq integer)
returns table (transfer_id uuid, name text, from_account_id uuid, to_account_id uuid, amount bigint,
               cadence public.subscription_cadence, monthly_amount bigint, is_automatic boolean, category_id uuid)
language plpgsql
stable
set search_path = ''
as $$
#variable_conflict use_column
begin
  return query
  select t.id, t.name, v.from_account_id, v.to_account_id, v.amount, v.cadence,
         case when v.schedule = 'day_of_month' and v.cadence <> 'monthly'
              then private.subscription_monthly_cost(v.amount, v.cadence) else v.amount end,
         v.is_automatic, v.category_id
  from (
    -- the budget's versions with the period each stops at, in one pass (no lookup per transfer)
    select x.*, pg_catalog.lead(x.effective_from_seq) over (partition by x.transfer_id order by x.effective_from_seq) as next_seq
    from public.transfer_versions as x
    where x.budget_id = p_budget_id and x.effective_from_seq <= p_seq
  ) as v
  join public.transfers as t on t.id = v.transfer_id
  where (v.next_seq is null or p_seq < v.next_seq)
    and t.first_seq <= p_seq and (t.end_seq is null or p_seq < t.end_seq);
end;
$$;

-- From the plan in force in the period, never from transactions. Typed rows:
-- * 'income': an income in force, its amount then, target_id its account then (null: the
--   'not_assigned' node);
-- * 'not_assigned': only when some income names no account; inflow = those incomes;
-- * 'account': every account in force; inflow (incomes and transfers in), outflow (transfers
--   out), stays = inflow - outflow (flows of the period, not a balance), is_negative;
-- * 'transfer': a transfer in force, source_id -> target_id, amount its monthly share then,
--   planned_amount and cadence its real amount and cadence;
-- * 'total': amount = the incomes added up (= period_summaries.salary_total: salaries only;
--   extra incomes are actual transactions, not plan), outflow = the transfers added up.
create function private.money_flow(p_budget_id uuid, p_seq integer)
returns table (
  row_kind text, id uuid, name text, source_id uuid, target_id uuid, amount bigint, inflow bigint,
  outflow bigint, stays bigint, is_negative boolean, account_kind public.account_kind, user_id uuid,
  is_automatic boolean, period_id uuid, planned_amount bigint, cadence public.subscription_cadence
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
  tr as (select * from private.transfers_in_force(p_budget_id, p_seq)),
  acc as (
    select a.id, a.name, a.kind, a.user_id,
           coalesce((select pg_catalog.sum(inc.amount) from inc where inc.account_id = a.id), 0)
             + coalesce((select pg_catalog.sum(tr.monthly_amount) from tr where tr.to_account_id = a.id), 0) as inflow,
           coalesce((select pg_catalog.sum(tr.monthly_amount) from tr where tr.from_account_id = a.id), 0) as outflow
    from public.accounts as a
    where a.budget_id = p_budget_id and a.first_seq <= p_seq and (a.end_seq is null or p_seq < a.end_seq)
  ),
  rows as (
    select 1 as o, 'income'::text as row_kind, inc.id, inc.name, inc.id as source_id, inc.account_id as target_id,
           inc.amount, null::bigint as inflow, null::bigint as outflow, null::bigint as stays, null::boolean as is_negative,
           null::public.account_kind as account_kind, inc.user_id, null::boolean as is_automatic,
           null::bigint as planned_amount, null::public.subscription_cadence as cadence
    from inc
    union all
    select 2, 'not_assigned', null, null, null, null, null, pg_catalog.sum(inc.amount)::bigint, 0::bigint,
           pg_catalog.sum(inc.amount)::bigint, false, null, null, null, null, null
    from inc where inc.account_id is null having pg_catalog.count(*) > 0
    union all
    select 3, 'account', acc.id, acc.name, null, null, null, acc.inflow::bigint, acc.outflow::bigint,
           (acc.inflow - acc.outflow)::bigint, acc.inflow < acc.outflow, acc.kind, acc.user_id, null, null, null
    from acc
    union all
    select 4, 'transfer', tr.transfer_id, tr.name, tr.from_account_id, tr.to_account_id, tr.monthly_amount, null, null,
           null, null, null, null, tr.is_automatic, tr.amount, tr.cadence
    from tr
    union all
    select 5, 'total', null, null, null, null,
           coalesce((select pg_catalog.sum(inc.amount) from inc), 0)::bigint,
           coalesce((select pg_catalog.sum(inc.amount) from inc), 0)::bigint,
           coalesce((select pg_catalog.sum(tr.monthly_amount) from tr), 0)::bigint, null, null, null, null, null, null, null
  )
  select r.row_kind, r.id, r.name, r.source_id, r.target_id, r.amount, r.inflow, r.outflow, r.stays, r.is_negative,
         r.account_kind, r.user_id, r.is_automatic, (select per.id from per), r.planned_amount, r.cadence
  from rows as r
  order by r.o, r.name, r.id
$$;

-- R-ACCOUNT-006: one call, for a chosen period (default the current one). Catches up first.
create function public.get_money_flow(p_budget_id uuid, p_period_id uuid default null)
returns table (
  row_kind text, id uuid, name text, source_id uuid, target_id uuid, amount bigint, inflow bigint,
  outflow bigint, stays bigint, is_negative boolean, account_kind public.account_kind, user_id uuid,
  is_automatic boolean, period_id uuid, planned_amount bigint, cadence public.subscription_cadence
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
  perform private.materialise_transfers(v_income.budget_id);  -- D-423: its pay dates may have moved
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
-- Reopen                                                   (R-ACCOUNT-306, D-430)
-- ===========================================================================
-- The registry's re-keying of steps 3 and 4, unchanged. Marks are keyed by date, not by
-- period (D-420), so a reopen moves none: after it the catch-up removes its own marks (and
-- transactions) whose occurrence is no longer planned, for example the merged period's pay
-- date, and a member's mark stays, listed by its date and flagged until the salary is
-- recorded again (the same key comes back with the period) or it is undone.
create or replace function private.rekey_period(p_budget_id uuid, p_from integer, p_to integer)
returns void
language plpgsql
set search_path = ''
as $$
declare
  t record;
  v_id uuid;
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
          -- S3, R-ACCOUNT-312: a transfer with a mark stays (in force nowhere, listed as ended
          -- with its marks), like a row something else still refers to
          if t.table_name::text = 'public.transfers'
             and exists (select 1 from public.transfer_occurrences as o where o.transfer_id = v_id) then
            raise foreign_key_violation;
          end if;
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

-- preview_reopen's rows (steps 3 and 4) and, for transfers (D-428), what the reopen does to their
-- marks, found by running the reopen (at its default end) and rolling it back:
-- 'transaction_removed' (the catch-up's transaction of an occurrence no longer planned or not
-- yet due), 'transaction_created', 'mark_unplanned' (a member's mark kept, its occurrence no
-- longer planned), 'mark_planned_again'; one row per occurrence.
-- S4: with the reopen's own optional pay date (the reopen previewed is the one the member asks for)
drop function private.merge_impact(uuid, integer, integer);
create function private.merge_impact(p_budget_id uuid, p_from integer, p_to integer, p_pay_date date default null)
returns table (record_kind text, record_id uuid, record_name text, change text, replaces_previous boolean)
language plpgsql
volatile
set search_path = ''
as $$
declare
  t record;
  v_current public.periods;
  v_before jsonb;
  v_effects jsonb := '[]'::jsonb;
begin
  -- D-428: a preview that runs the write takes the budget as the write would, before it reads the
  -- revisions and marks it compares: behind a writer it waits, then previews what the writer left
  perform private.lock_and_catch_up(p_budget_id);
  for t in select r.*, e.name_column as entity_name_column
           from private.period_keyed_tables as r
           left join private.period_keyed_tables as e on e.table_name = r.entity_table
           order by r.kind, r.table_name::text loop
    if t.kind = 'validity' then
      -- S3: a transfer with a mark is kept, ended, not removed (its marks: mark_unplanned below)
      return query execute pg_catalog.format($q$
        select %3$L::text, v.id, v.%2$I::text,
               case when v.end_seq = $2 and v.first_seq >= $3
                         and not ($4 and exists (select 1 from public.transfer_occurrences as o where o.transfer_id = v.id))
                    then 'removed'
                    when v.end_seq = $2 then 'ended'
                    else 'added' end,
               false
        from %1$s as v
        where v.budget_id = $1 and (v.first_seq = $2 or v.end_seq = $2)
        order by 3$q$, t.table_name, t.name_column, t.record_kind)
        using p_budget_id, p_from, p_to, t.table_name::text = 'public.transfers';

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
  select p.* into v_current from public.periods as p where p.budget_id = p_budget_id and p.seq = p_from;
  if v_current.id is not null and exists (select 1 from public.transfers as x where x.budget_id = p_budget_id) then
    v_before := private.transfer_marks_snapshot(p_budget_id, null, private.seq_start(p_budget_id, p_to) - 93);
    begin
      perform private.preview_fresh_step();
      perform public.reopen_previous_period(p_budget_id, v_current.id, v_current.revision, p_pay_date);
      select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(e)), '[]'::jsonb) into v_effects
      from private.transfer_effect_rows(v_before,
             private.transfer_marks_snapshot(p_budget_id, null, private.seq_start(p_budget_id, p_to) - 93)) as e;
      raise exception 'preview' using errcode = 'P0050';
    exception
      when sqlstate 'P0050' then null;  -- rolled back
      when sqlstate 'P0001' then null;  -- the reopen would be refused: nothing to report
    end;
  end if;
  return query
    select 'transfer'::text, tr.id, tr.name, e.change, false
    from pg_catalog.jsonb_to_recordset(v_effects) as e (transfer_id uuid, occurrence_date date, change text)
    join public.transfers as tr on tr.id = e.transfer_id
    order by tr.name, e.occurrence_date, e.change;
end;
$$;

-- R-APP-170, R-ACCOUNT-303, S4 (R-ACCOUNT-313): preview_reopen as in step 5 (at most 1000 rows,
-- the last one counting the rest) with the reopen's own optional p_pay_date: it describes the
-- reopen the member asks for, also when the reopen at its default end would be refused.
drop function public.preview_reopen(uuid);
create function public.preview_reopen(p_budget_id uuid, p_pay_date date default null)
returns table (record_kind text, record_id uuid, record_name text, change text, replaces_previous boolean)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_current public.periods;
  v_rows record;
  v_n integer := 0;
begin
  perform private.assert_member(p_budget_id);
  if p_pay_date is not null and not private.is_sane_date(p_pay_date) then
    raise exception 'invalid_boundary' using errcode = 'P0001';
  end if;
  v_current := private.current_period(p_budget_id);
  if v_current.id is null then
    raise exception 'budget_ended' using errcode = 'P0001';
  end if;
  if v_current.seq = 1 then
    raise exception 'invalid_boundary' using errcode = 'P0001';
  end if;
  for v_rows in select * from private.merge_impact(p_budget_id, v_current.seq, v_current.seq - 1, p_pay_date) loop
    v_n := v_n + 1;
    if v_n <= 999 then
      record_kind := v_rows.record_kind; record_id := v_rows.record_id; record_name := v_rows.record_name;
      change := v_rows.change; replaces_previous := v_rows.replaces_previous;
      return next;
    elsif v_n = 1000 then
      record_kind := v_rows.record_kind; record_id := v_rows.record_id; record_name := v_rows.record_name;
      change := v_rows.change; replaces_previous := v_rows.replaces_previous;
    end if;
  end loop;
  if v_n = 1000 then
    return next;
  elsif v_n > 1000 then
    record_kind := 'more'; record_id := null; record_name := (v_n - 999)::text; change := 'more'; replaces_previous := false;
    return next;
  end if;
end;
$$;
revoke all on function public.preview_reopen(uuid, date) from public, anon, authenticated;
grant execute on function public.preview_reopen(uuid, date) to authenticated;

-- ===========================================================================
-- Boundary operations and income changes settle the transfers at once (D-423)
-- ===========================================================================
-- The latest versions of step 3 and 4, unchanged, with the transfers' catch-up after the
-- change (private.materialise_transfers), so the call answers with the transactions and marks
-- as they now are: what a changed plan no longer holds is gone, what it now makes due is
-- created. The triggers alone would leave that to the next catch-up.

CREATE OR REPLACE FUNCTION public.reopen_previous_period(p_budget_id uuid, p_period_id uuid, p_expected_revision integer, p_pay_date date DEFAULT NULL::date)
 RETURNS SETOF period_summaries
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  perform private.materialise_transfers(p_budget_id);
  return query select s.* from public.period_summaries as s where s.id = v_previous.id;
end;
$function$
;


CREATE OR REPLACE FUNCTION public.move_period_start(p_period_id uuid, p_expected_revision integer, p_start_date date DEFAULT NULL::date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  -- D-491: what the app recorded by itself moves with the boundary, as after a reopen and the
  -- salary recorded on that day: the catch-up's own marks of the two periods whose due date the
  -- move changed go with their transactions, and the catch-up makes them again on the new due
  -- date (a member's mark stays where the member put it)
  perform private.drop_transfer_marks((
    select pg_catalog.array_agg(o.id)
    from private.transfer_plan_range(v_budget_id, null, v_previous.seq, v_period.seq) as pl
    join public.transfer_occurrences as o on o.transfer_id = pl.transfer_id and o.occurrence_date = pl.occurrence_date
    where o.by_catch_up and o.mark = 'done' and o.done_on is distinct from pl.due_date));
  perform private.materialise_transfers(v_budget_id);
end;
$function$
;


CREATE OR REPLACE FUNCTION public.set_expected_pay_date(p_budget_id uuid, p_period_id uuid, p_expected_revision integer, p_pay_date date DEFAULT NULL::date)
 RETURNS SETOF period_summaries
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  perform private.materialise_transfers(p_budget_id);
  return query select s.* from public.period_summaries as s where s.id = v_current.id;
end;
$function$
;


CREATE OR REPLACE FUNCTION public.set_primary_income(p_income_id uuid, p_expected_revision integer, p_previewed_end_date date DEFAULT NULL::date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_income public.incomes;
  v_seq integer;
  v_old uuid;
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
  select b.primary_income_id into v_old from public.budgets as b where b.id = v_income.budget_id;
  update public.budgets set primary_income_id = v_income.id, primary_since_seq = v_seq
  where id = v_income.budget_id and primary_income_id <> v_income.id;
  if found then
    update public.incomes set revision = revision + 1 where id in (v_old, v_income.id);
    -- R-ACCOUNT-310: a transfer that chose either income follows other dates from now on
    perform private.transfers_recheck(v_income.budget_id, null, v_old, private.seq_start(v_income.budget_id, v_seq));
    perform private.transfers_recheck(v_income.budget_id, null, v_income.id, private.seq_start(v_income.budget_id, v_seq));
    perform private.reproject_current_end(v_income.budget_id);
  end if;
  perform private.assert_previewed_end(v_income.budget_id, p_previewed_end_date);
  perform private.materialise_transfers(v_income.budget_id);
end;
$function$
;


CREATE OR REPLACE FUNCTION public.remove_income(p_income_id uuid, p_expected_revision integer, p_from_period_id uuid DEFAULT NULL::uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    perform private.materialise_transfers(v_income.budget_id);
    return 'deleted';
  end if;
  update public.incomes
  set end_seq = v_seq,
      ended_on = case when v_seq = private.current_seq(v_income.budget_id) then private.today() end
  where id = v_income.id;
  delete from public.income_versions where income_id = v_income.id and effective_from_seq >= v_seq;
  perform private.materialise_transfers(v_income.budget_id);
  return 'ended';
end;
$function$
;


-- step 2's end_member_incomes (remove_member, leave_budget), with the transfers' catch-up after it
create or replace function private.end_member_incomes(p_budget_id uuid, p_user_id uuid)
returns void
language plpgsql
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
  update public.incomes as i
  set end_seq = v_seq,
      ended_on = case when v_seq = (private.current_period(p_budget_id)).seq then private.today() end
  where i.budget_id = p_budget_id and i.user_id = p_user_id and i.end_seq is null;
  perform private.materialise_transfers(p_budget_id);
end;
$$;

-- ===========================================================================
-- Categories and committed amounts      (R-CATEGORY-230, R-ACCOUNT-238, R-ACCOUNT-304, D-425)
-- ===========================================================================
-- The monthly shares of the transfers in force in period p_seq linked to each category (no
-- due date needed).
create function private.transfer_committed_by_category(p_budget_id uuid, p_seq integer)
returns table (category_id uuid, committed bigint)
language plpgsql
stable
set search_path = ''
as $$
#variable_conflict use_column
begin
  return query
  select f.category_id, pg_catalog.sum(f.monthly_amount)::bigint
  from private.transfers_in_force(p_budget_id, p_seq) as f
  where f.category_id is not null
  group by f.category_id;
end;
$$;

create function private.transfer_committed_total(p_budget_id uuid, p_seq integer)
returns bigint
language plpgsql
stable
set search_path = ''
as $$
begin
  return (
  -- the budget's versions with the period each stops at, in one pass (no lookup per transfer)
  select coalesce(pg_catalog.sum(case when v.schedule = 'day_of_month' and v.cadence <> 'monthly'
                                     then private.subscription_monthly_cost(v.amount, v.cadence) else v.amount end), 0)::bigint
  from (
    select x.transfer_id, x.amount, x.category_id, x.schedule, x.cadence, x.effective_from_seq,
           pg_catalog.lead(x.effective_from_seq) over (partition by x.transfer_id order by x.effective_from_seq) as next_seq
    from public.transfer_versions as x
    where x.budget_id = p_budget_id and x.effective_from_seq <= p_seq
  ) as v
  join public.transfers as t on t.id = v.transfer_id
  where v.effective_from_seq <= p_seq and (v.next_seq is null or p_seq < v.next_seq)
    and t.first_seq <= p_seq and (t.end_seq is null or p_seq < t.end_seq)
    and v.category_id is not null);
end;
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
    select pg_catalog.sum(case when v.schedule = 'day_of_month' and v.cadence <> 'monthly'
                               then private.subscription_monthly_cost(v.amount, v.cadence) else v.amount end)
    from (select distinct x.transfer_id from public.transfer_versions as x where x.category_id = any (v_ids)) as u
    join public.transfers as t on t.id = u.transfer_id
    cross join lateral (
      select x.amount, x.category_id, x.schedule, x.cadence from public.transfer_versions as x
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
    h.transfer_committed_amount,
    c.is_to_categorise
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
  -- S8 (D-389): the per-row helpers run only where their answer can differ: a category not in
  -- force now (ended, void) has no committed amount, no transfer and is in no use (terms may
  -- only use a category in force: R-CATEGORY-130); one that started before now never deletes
  cross join lateral (
    select private.category_has_transactions(c.id) as has_transactions,
           case when c.first_seq >= r.seq then private.category_referenced(c.id) else true end as referenced,
           case when c.first_seq <= r.seq and (c.end_seq is null or r.seq < c.end_seq)
                then private.category_in_use(c.id, r.seq) else false end as in_use,
           case when c.first_seq <= r.seq and (c.end_seq is null or r.seq < c.end_seq)
                then private.category_committed(c.id, r.seq) else 0::bigint end as committed_amount,
           case when c.first_seq <= r.seq and (c.end_seq is null or r.seq < c.end_seq)
                then private.category_transfer_committed(c.id, r.seq) else 0::bigint end as transfer_committed_amount
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

-- R-ACCOUNT-241, D-395: the manual occurrences planned in the current period and in the one
-- before it with no mark (to do), and of those, the ones whose due date has passed (for the
-- dashboard). 0 when the budget has ended.
create function private.transfers_to_do(p_budget_id uuid)
returns table (to_do integer, overdue integer)
language plpgsql
stable
set search_path = ''
as $$
#variable_conflict use_column
begin
  return query
  select (pg_catalog.count(*) filter (where o.id is null))::integer,
         (pg_catalog.count(*) filter (where o.id is null and pl.due_date < private.today()))::integer
  from public.periods as cur
  cross join lateral private.transfer_plan_range(p_budget_id, null, cur.seq - 1, cur.seq, true) as pl
  left join public.transfer_occurrences as o on o.transfer_id = pl.transfer_id and o.occurrence_date = pl.occurrence_date
  where cur.budget_id = p_budget_id and private.today() between cur.start_date and cur.end_date
    and not pl.is_automatic;
end;
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
    (select c.id from public.categories as c where c.budget_id = b.id and c.is_to_categorise and c.end_seq is null) as to_categorise_category_id,
    coalesce(d.to_do, 0) as transfers_to_do,
    coalesce(d.overdue, 0) as transfers_overdue,
    -- D-392: the earliest date the budget accepts (the first period's start; index lookup)
    (select p.start_date from public.periods as p where p.budget_id = b.id order by p.seq limit 1) as first_period_start
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
    private.import_source(t.import_batch_id) as import_source,
    t.bank_transaction_id,
    t.merchant,
    t.merchant_key,
    t.details,
    coalesce(c.is_to_categorise, false) as in_to_categorise,
    o.transfer_id,
    tr.name as transfer_name,
    o.occurrence_date as transfer_occurrence_date
  from public.transactions as t
  left join public.categories as c on c.id = t.category_id
  left join public.categories as pc on pc.id = c.parent_id
  left join public.subscriptions as s on s.id = t.subscription_id
  left join public.debts as d on d.id = t.debt_id
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
  private.income_is_primary_at(uuid, integer),
  private.transfer_plan_range(uuid, uuid, integer, integer, boolean),
  private.transfer_plan_seqs(uuid, uuid, integer[], boolean),
  private.transfer_raw_keys(uuid, integer),
  private.transfer_period_occurrences(integer, date, date, date, date, public.transfer_schedule,
    public.subscription_cadence, date, integer, integer, uuid, boolean),
  private.income_pay_dates(uuid, integer, date, date),
  private.transfer_monthly_amount(bigint, public.transfer_schedule, public.subscription_cadence),
  private.transfers_in_force(uuid, integer),
  private.transfer_committed_by_category(uuid, integer),
  private.charges_pending(uuid),
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
  public.preview_create_transfer(uuid, uuid, uuid, bigint, public.transfer_schedule, integer, integer, uuid, boolean, uuid, uuid,
    integer, public.subscription_cadence, date),
  public.update_transfer(uuid, integer, text, uuid, uuid, bigint, public.transfer_schedule, integer, integer, uuid, boolean, uuid,
    boolean, boolean, uuid, public.subscription_cadence, date),
  public.preview_update_transfer(uuid, uuid, uuid, bigint, public.transfer_schedule, integer, integer, uuid, boolean, uuid,
    boolean, boolean, uuid, integer, public.subscription_cadence, date),
  public.end_transfer(uuid, integer, uuid),
  public.preview_end_transfer(uuid, uuid),
  public.get_transfer_terms(uuid, uuid),
  public.get_transfer_checklist(uuid),
  public.mark_transfer_done(uuid, uuid, integer, date, bigint, date),
  public.skip_transfer(uuid, uuid, integer, date),
  public.mark_transfer_not_done(uuid, uuid, integer, date),
  public.undo_transfer_mark(uuid, uuid, integer, date),
  public.get_money_flow(uuid, uuid),
  public.add_income(uuid, text, bigint, integer, public.weekend_rule, uuid, uuid, uuid),
  public.update_income(uuid, integer, text, bigint, integer, public.weekend_rule, uuid, date, uuid, boolean),
  public.get_income_terms(uuid, uuid),
  public.create_category(uuid, text, uuid, bigint, public.expectation_cadence, uuid, text),
  public.end_category(uuid, integer, uuid)
to authenticated;

-- ===========================================================================
-- The previews of boundary moves and income changes say what they do to the transfers
-- (R-ACCOUNT-303, D-428)
-- ===========================================================================
-- The counts of transfer_effect_rows: the catch-up's transactions removed and created, and the
-- members' marks whose occurrence is no longer planned.
create function private.transfer_effect_counts(p_before jsonb, p_after jsonb)
returns table (transactions_removed integer, transactions_created integer, marks_unplanned integer)
language sql
immutable
set search_path = ''
as $$
  select (pg_catalog.count(*) filter (where e.change = 'transaction_removed'))::integer,
         (pg_catalog.count(*) filter (where e.change = 'transaction_created'))::integer,
         (pg_catalog.count(*) filter (where e.change = 'mark_unplanned'))::integer
  from private.transfer_effect_rows(p_before, p_after) as e
$$;

-- Steps 3 and 4's previews, unchanged, with three counts at the end, found by running the write
-- (with the end the preview computed) and rolling it back: transfer_transactions_removed,
-- transfer_transactions_created, transfer_marks_unplanned (0 when the write would be refused or
-- changes nothing).
drop function public.preview_update_income(uuid, bigint, integer, public.weekend_rule, uuid);
create function public.preview_update_income(
  p_income_id uuid, p_amount bigint default null, p_pay_day integer default null,
  p_weekend_rule public.weekend_rule default null, p_from_period_id uuid default null
)
returns table (period_id uuid, end_date date, expected_pay_date date, end_is_manual boolean,
               transfer_transactions_removed integer, transfer_transactions_created integer, transfer_marks_unplanned integer)
language plpgsql
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
  v_before jsonb;
  v_removed integer := 0;
  v_created integer := 0;
  v_unplanned integer := 0;
begin
  select i.* into v_income from public.incomes as i where i.id = p_income_id;
  if v_income.id is null or not private.is_budget_member(v_income.budget_id) then
    raise exception 'income_not_found' using errcode = 'P0001';
  end if;
  -- D-428: a preview that runs the write takes the budget as the write would, before it reads the
  -- revisions and marks it compares: behind a writer it waits, then previews what the writer left
  perform private.lock_and_catch_up(v_income.budget_id);
  select i.* into v_income from public.incomes as i where i.id = p_income_id;
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
  v_before := private.transfer_marks_snapshot(v_income.budget_id, null, private.seq_start(v_income.budget_id, v_seq) - 93);
  begin
    perform private.preview_fresh_step();
    if num_nonnulls(p_amount, p_pay_day, p_weekend_rule) > 0 then
      perform public.update_income(v_income.id, v_income.revision, null, p_amount, p_pay_day, p_weekend_rule,
                                   p_from_period_id, v_end);
    end if;
    select * into v_removed, v_created, v_unplanned from private.transfer_effect_counts(v_before,
      private.transfer_marks_snapshot(v_income.budget_id, null, private.seq_start(v_income.budget_id, v_seq) - 93));
    raise exception 'preview' using errcode = 'P0050';
  exception
    when sqlstate 'P0050' then null;  -- rolled back
    when sqlstate 'P0001' then null;  -- the write would be refused: nothing happens
  end;
  return query select v_current.id, v_end, v_end + 1, v_current.end_is_manual,
    v_removed, v_created, v_unplanned;
end;
$$;

drop function public.preview_set_primary_income(uuid);
create function public.preview_set_primary_income(p_income_id uuid)
returns table (period_id uuid, end_date date, expected_pay_date date, end_is_manual boolean,
               transfer_transactions_removed integer, transfer_transactions_created integer, transfer_marks_unplanned integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_income public.incomes;
  v_current public.periods;
  v_pay_day integer;
  v_rule public.weekend_rule;
  v_end date;
  v_before jsonb;
  v_removed integer := 0;
  v_created integer := 0;
  v_unplanned integer := 0;
begin
  select i.* into v_income from public.incomes as i where i.id = p_income_id;
  if v_income.id is null or not private.is_budget_member(v_income.budget_id) then
    raise exception 'income_not_found' using errcode = 'P0001';
  end if;
  -- D-428: a preview that runs the write takes the budget as the write would, before it reads the
  -- revisions and marks it compares: behind a writer it waits, then previews what the writer left
  perform private.lock_and_catch_up(v_income.budget_id);
  select i.* into v_income from public.incomes as i where i.id = p_income_id;
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
  v_before := private.transfer_marks_snapshot(v_income.budget_id, null, v_current.start_date - 93);
  begin
    perform private.preview_fresh_step();
    perform public.set_primary_income(v_income.id, (select b.revision from public.budgets as b where b.id = v_income.budget_id), v_end);
    select * into v_removed, v_created, v_unplanned from private.transfer_effect_counts(v_before,
      private.transfer_marks_snapshot(v_income.budget_id, null, v_current.start_date - 93));
    raise exception 'preview' using errcode = 'P0050';
  exception
    when sqlstate 'P0050' then null;  -- rolled back
    when sqlstate 'P0001' then null;  -- the write would be refused: nothing happens
  end;
  return query select v_current.id, v_end, v_end + 1, v_current.end_is_manual,
    v_removed, v_created, v_unplanned;
end;
$$;

drop function public.preview_move_period_start(uuid, date);
create function public.preview_move_period_start(p_period_id uuid, p_start_date date default null)
returns table (period_id uuid, scheduled_start date, accepted boolean, refusal text, interest_removed integer,
               transfer_transactions_removed integer, transfer_transactions_created integer, transfer_marks_unplanned integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_budget_id uuid;
  v_period public.periods;
  v_previous public.periods;
  v_start date;
  v_scheduled date;
  v_refusal text;
  v_before jsonb;
  v_removed integer := 0;
  v_created integer := 0;
  v_unplanned integer := 0;
begin
  select p.budget_id into v_budget_id from public.periods as p where p.id = p_period_id;
  if v_budget_id is null or not private.is_budget_member(v_budget_id) then
    raise exception 'period_not_found' using errcode = 'P0001';
  end if;
  if p_start_date is not null and not private.is_sane_date(p_start_date) then
    raise exception 'invalid_boundary' using errcode = 'P0001';
  end if;
  -- D-428: a preview that runs the write takes the budget as the write would, before it reads the
  -- revisions and marks it compares: behind a writer it waits, then previews what the writer left
  perform private.lock_and_catch_up(v_budget_id);
  select p.* into v_period from public.periods as p where p.id = p_period_id;
  if v_period.id is null then
    raise exception 'period_not_found' using errcode = 'P0001';
  end if;
  select p.* into v_previous from public.periods as p
  where p.budget_id = v_budget_id and p.seq = v_period.seq - 1;
  if v_previous.id is null then
    return query select v_period.id, null::date, false, 'invalid_boundary'::text, 0, 0, 0, 0;
    return;
  end if;
  v_scheduled := private.projected_end(v_budget_id, v_previous.start_date, v_previous.seq) + 1;
  v_start := coalesce(p_start_date, v_scheduled);
  begin
    if v_start > private.today()
       or v_start > coalesce((select b.end_date from public.budgets as b where b.id = v_budget_id), v_start) then
      raise exception 'invalid_boundary' using errcode = 'P0001';
    end if;
    perform private.assert_length(v_previous.start_date, v_start - 1);
    perform private.assert_length(v_start, v_period.end_date);
    -- R-DEBT-340, D-467: as the write's trigger refuses it
    if v_start < v_period.start_date
       and exists (select 1 from public.debt_interest as i join public.debts as d on d.id = i.debt_id
                   where i.period_id = v_period.id and d.opened_on >= v_start) then
      raise exception 'interest_before_opening' using errcode = 'P0001';
    end if;
  exception when sqlstate 'P0001' then
    v_refusal := sqlerrm;
  end;
  if v_refusal is null and v_start <> v_period.start_date then
    v_before := private.transfer_marks_snapshot(v_budget_id, null, v_previous.start_date - 93);
    begin
      perform private.preview_fresh_step();
      perform public.move_period_start(v_period.id, v_period.revision, v_start);
      select * into v_removed, v_created, v_unplanned from private.transfer_effect_counts(v_before,
        private.transfer_marks_snapshot(v_budget_id, null, v_previous.start_date - 93));
      raise exception 'preview' using errcode = 'P0050';
    exception
      when sqlstate 'P0050' then null;  -- rolled back
      when sqlstate 'P0001' then null;  -- the write would be refused: nothing happens
    end;
  end if;
  return query select v_period.id, v_scheduled, v_refusal is null and v_start <> v_period.start_date, coalesce(v_refusal,
    case when v_start = v_period.start_date then 'already_on_schedule' end),
    0,  -- interest_removed: a move never removes interest (D-467)
    v_removed, v_created, v_unplanned;
end;
$$;

revoke all on function
  private.transfer_effect_counts(jsonb, jsonb),
  public.preview_update_income(uuid, bigint, integer, public.weekend_rule, uuid),
  public.preview_set_primary_income(uuid),
  public.preview_move_period_start(uuid, date)
from public, anon, authenticated;
grant execute on function
  public.preview_update_income(uuid, bigint, integer, public.weekend_rule, uuid),
  public.preview_set_primary_income(uuid),
  public.preview_move_period_start(uuid, date)
to authenticated;
