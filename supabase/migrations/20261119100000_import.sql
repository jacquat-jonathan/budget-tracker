-- Step 6: import (F-IMPORT). One import implementation (R-IMPORT-001): private.import_plan
-- decides, row by row, what an import does (validation with add_transaction's checks,
-- duplicates by count, flags and remembered choices, possible matches, merchant rules, the
-- "to categorise" category), and private.import_apply does exactly that. The member's preview
-- and write, the token's write, and "import a skipped row anyway" all go through them.
-- Imported transactions are to_review (R-IMPORT-004) and count at once (R-IMPORT-080).

-- ===========================================================================
-- Limits (one place)                                          (R-IMPORT-002, D-310, D-316)
-- ===========================================================================
create function private.limit_import_rows_per_call() returns integer
language sql immutable set search_path = '' as $$ select 500 $$;
create function private.limit_import_chunks() returns integer
language sql immutable set search_path = '' as $$ select 100 $$;
create function private.limit_import_details_bytes() returns integer
language sql immutable set search_path = '' as $$ select 2000 $$;
create function private.limit_merchant_rules() returns integer
language sql immutable set search_path = '' as $$ select 500 $$;
create function private.limit_import_tokens_active() returns integer
language sql immutable set search_path = '' as $$ select 10 $$;
create function private.limit_import_tokens_total() returns integer
language sql immutable set search_path = '' as $$ select 100 $$;
create function private.limit_token_calls_per_hour() returns integer
language sql immutable set search_path = '' as $$ select 60 $$;
create function private.limit_token_calls_per_day() returns integer
language sql immutable set search_path = '' as $$ select 300 $$;
create function private.limit_token_rows_per_hour() returns integer
language sql immutable set search_path = '' as $$ select 5000 $$;
create function private.limit_token_rows_per_day() returns integer
language sql immutable set search_path = '' as $$ select 20000 $$;

-- ===========================================================================
-- The "to categorise" category (R-IMPORT-200, D-312)
-- ===========================================================================
-- One ordinary top-level leaf per budget, created at its first import that needs it: where an
-- imported expense or refund without a category goes, so every transaction keeps a category
-- and every total still adds up. Renamable; no expectation, no subcategory, and it cannot end
-- while it holds transactions.
alter table public.categories add column is_to_categorise boolean not null default false;
create unique index categories_one_to_categorise_idx on public.categories (budget_id) where is_to_categorise;

create function private.guard_to_categorise()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_table_name = 'categories' then
    if tg_op = 'INSERT' and new.parent_id is not null
       and exists (select 1 from public.categories as c where c.id = new.parent_id and c.is_to_categorise) then
      raise exception 'category_to_categorise' using errcode = 'P0001';
    end if;
    if tg_op = 'UPDATE' and old.is_to_categorise and old.end_seq is null and new.end_seq is not null
       and exists (select 1 from public.transactions as t where t.category_id = old.id) then
      raise exception 'category_to_categorise' using errcode = 'P0001';
    end if;
  else
    if new.amount > 0 and exists (select 1 from public.categories as c where c.id = new.category_id and c.is_to_categorise) then
      raise exception 'category_to_categorise' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;
create trigger categories_guard_to_categorise before insert or update on public.categories
  for each row execute function private.guard_to_categorise();
create trigger category_expectations_guard_to_categorise before insert or update on public.category_expectations
  for each row execute function private.guard_to_categorise();

-- ===========================================================================
-- Tables
-- ===========================================================================

-- D-116, R-IMPORT-074 to R-IMPORT-077: import tokens. Only the SHA-256 of the secret is stored.
create table public.import_tokens (
  id uuid primary key default gen_random_uuid(),
  budget_id uuid not null references public.budgets (id) on delete cascade,
  name text not null,
  token_hash bytea not null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_used_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid references auth.users (id) on delete set null,
  constraint import_tokens_name_valid check (name = btrim(name) and char_length(name) between 1 and 100),
  constraint import_tokens_hash_unique unique (token_hash)
);
create index import_tokens_budget_idx on public.import_tokens (budget_id);
create index import_tokens_created_by_idx on public.import_tokens (created_by);
create index import_tokens_revoked_by_idx on public.import_tokens (revoked_by);

-- R-IMPORT-001, D-310: one import, possibly in several chunks; the caller generates its id.
create table public.import_batches (
  id uuid primary key,
  budget_id uuid not null references public.budgets (id) on delete cascade,
  source text not null,
  statement_from date,
  statement_to date,
  created_by uuid references auth.users (id) on delete set null,
  token_id uuid references public.import_tokens (id) on delete set null,
  token_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  chunk_count integer not null default 0,
  row_count integer not null default 0,
  imported_count integer not null default 0,
  duplicate_count integer not null default 0,
  flagged_count integer not null default 0,
  matched_count integer not null default 0,
  chosen_skip_count integer not null default 0,
  invalid_count integer not null default 0,
  charges_confirmed_count integer not null default 0,
  undone_at timestamptz,
  undone_by uuid references auth.users (id) on delete set null,
  constraint import_batches_source_valid check (source in ('csv', 'migros_account', 'migros_card', 'yuh', 'script', 'other')),
  constraint import_batches_range_valid check (
    (statement_from is null or private.is_sane_date(statement_from)) and (statement_to is null or private.is_sane_date(statement_to))
    and (statement_from is null or statement_to is null or statement_from <= statement_to)),
  constraint import_batches_id_budget_unique unique (id, budget_id)
);
create index import_batches_budget_idx on public.import_batches (budget_id, created_at desc, id desc);
create index import_batches_created_by_idx on public.import_batches (created_by);
create index import_batches_token_idx on public.import_batches (token_id);
create index import_batches_undone_by_idx on public.import_batches (undone_by);
create trigger import_batches_set_updated_at before update on public.import_batches
  for each row execute function private.set_updated_at();

-- R-IMPORT-072: every row of a batch that was not imported, with why, for the member.
create table public.import_skipped_rows (
  id uuid primary key default gen_random_uuid(),
  budget_id uuid not null references public.budgets (id) on delete cascade,
  batch_id uuid not null,
  chunk integer not null,
  row_no integer not null,
  reason text not null,
  detail text,
  duplicate_of uuid,
  match_of uuid,
  row_data jsonb not null,
  imported_transaction_id uuid,
  created_at timestamptz not null default now(),
  constraint import_skipped_rows_batch_fk foreign key (batch_id, budget_id)
    references public.import_batches (id, budget_id) on delete cascade,
  constraint import_skipped_rows_reason_valid check (reason in ('duplicate', 'flagged', 'matched', 'chosen', 'invalid')),
  constraint import_skipped_rows_row_unique unique (batch_id, chunk, row_no)
);
create index import_skipped_rows_budget_idx on public.import_skipped_rows (budget_id);

-- R-IMPORT-078, R-IMPORT-079, D-311: merchant rules: a key fragment and a category.
create table public.merchant_rules (
  id uuid primary key default gen_random_uuid(),
  budget_id uuid not null references public.budgets (id) on delete cascade,
  fragment text not null,
  category_id uuid not null,
  created_by uuid references auth.users (id) on delete set null,
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint merchant_rules_fragment_valid check (char_length(fragment) between 1 and 100),
  constraint merchant_rules_fragment_unique unique (budget_id, fragment),
  -- a category deleted (never counted, no transactions) takes its rules with it
  constraint merchant_rules_category_fk foreign key (category_id, budget_id)
    references public.categories (id, budget_id) on delete cascade
);
create index merchant_rules_category_idx on public.merchant_rules (category_id, budget_id);
create index merchant_rules_created_by_idx on public.merchant_rules (created_by);
create trigger merchant_rules_bump_revision before update on public.merchant_rules
  for each row execute function private.bump_revision('revision', 'updated_at');
create trigger merchant_rules_set_updated_at before update on public.merchant_rules
  for each row execute function private.set_updated_at();

-- R-IMPORT-092, D-314: the last choice for a flagged entry, per budget, kind of flag and
-- counterparty key.
create table public.import_choices (
  budget_id uuid not null references public.budgets (id) on delete cascade,
  flag text not null,
  counterparty_key text not null,
  choice text not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  primary key (budget_id, flag, counterparty_key),
  constraint import_choices_flag_valid check (flag in ('card_bill_payment', 'own_transfer', 'transfer_to_person')),
  constraint import_choices_choice_valid check (choice in ('import', 'skip'))
);
create index import_choices_updated_by_idx on public.import_choices (updated_by);

-- Internal: the answer of each chunk already recorded (idempotency), and a token's use.
create table private.import_chunks (
  batch_id uuid not null references public.import_batches (id) on delete cascade,
  chunk integer not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key (batch_id, chunk)
);
create table private.import_token_usage (
  token_id uuid not null references public.import_tokens (id) on delete cascade,
  hour timestamptz not null,
  calls integer not null default 0,
  rows integer not null default 0,
  primary key (token_id, hour)
);

-- The imported transactions (R-IMPORT-102: their extra data, as given).
alter table public.transactions
  add column import_batch_id uuid,
  add column bank_transaction_id text,
  add column merchant text,
  add column merchant_key text,
  add column details jsonb,
  add constraint transactions_import_batch_fk foreign key (import_batch_id, budget_id)
    references public.import_batches (id, budget_id),
  add constraint transactions_bank_transaction_id_valid check (bank_transaction_id is null or char_length(bank_transaction_id) between 1 and 100),
  add constraint transactions_merchant_valid check (merchant is null or char_length(merchant) <= 200),
  add constraint transactions_details_valid check (details is null or (pg_catalog.jsonb_typeof(details) = 'object'
                                                                       and pg_catalog.octet_length(details::text) <= 2000));
-- the review state of a transaction: a charge awaits confirmation, an import is to review
alter table public.transactions drop constraint transactions_awaiting_is_charge;
alter table public.transactions add constraint transactions_review_state_valid check (
  review_state = 'confirmed'
  or (review_state = 'awaiting_confirmation' and charge_date is not null)
  or (review_state = 'to_review' and import_batch_id is not null));
create index transactions_import_batch_idx on public.transactions (import_batch_id) where import_batch_id is not null;
create index transactions_bank_id_idx on public.transactions (budget_id, bank_transaction_id) where bank_transaction_id is not null;
create index transactions_match_idx on public.transactions (budget_id, kind, amount, date);
create index transactions_to_review_idx on public.transactions (budget_id, date, created_at, id) where review_state = 'to_review';

-- ===========================================================================
-- The merchant key (R-IMPORT-201, D-311): one implementation
-- ===========================================================================

-- Lower case, accents removed, every run of characters other than letters, digits, '*', '.',
-- '&' and '-' a single space, trimmed.
create function private.normalize_merchant_text(p_text text)
returns text
language sql
immutable
set search_path = ''
as $$
  select pg_catalog.btrim(pg_catalog.regexp_replace(
    pg_catalog.translate(pg_catalog.lower(coalesce(p_text, '')),
      'àáâãäåāăąçćčďèéêëēĕėęěìíîïĩīĭįñńňòóôõöøōŏőùúûüũūŭůűųýÿžźżšśşťţřŕľĺłğ',
      'aaaaaaaaacccdeeeeeeeeeiiiiiiiinnnooooooooouuuuuuuuuuyyzzzsssttrrllllg'),
    '[^a-z0-9*.&-]+', ' ', 'g'))
$$;

-- The key of a row: its merchant field when the source gives one, otherwise its description;
-- normalised, then the statement's own words and a processor prefix ("payup *shop", "xyz*
-- preauth...") dropped (docs/import-sources.md). Never empty when the text has a letter or
-- digit; at most 200 characters.
create function private.merchant_key(p_merchant text, p_description text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_key text := private.normalize_merchant_text(coalesce(nullif(pg_catalog.btrim(p_merchant), ''), p_description));
  v_stripped text;
begin
  v_stripped := pg_catalog.regexp_replace(v_key, '^(achat|credit|debit twint|credit twint|twint|paiement de salaire|paiement|ordre permanent) ', '');
  v_stripped := pg_catalog.btrim(pg_catalog.regexp_replace(v_stripped, '^[a-z0-9.]{1,12} ?\* ?', ''));
  if v_stripped = '' then
    v_stripped := v_key;
  end if;
  return nullif(pg_catalog.left(v_stripped, 200), '');
end;
$$;

-- ===========================================================================
-- One row of an import, as the preview and the write answer it (R-IMPORT-001, D-310)
-- ===========================================================================
create type public.import_row_result as (
  row_no integer,
  valid boolean,
  reason text,
  action text,
  kind public.transaction_kind,
  category_id uuid,
  category_source text,
  rule_id uuid,
  date date,
  amount bigint,
  direction text,
  description text,
  merchant_key text,
  flag text,
  remembered_choice text,
  duplicate_of uuid,
  match_of uuid,
  match_is_charge boolean,
  salary_income_id uuid,
  salary_income_amount bigint,
  transaction_id uuid
);
comment on type public.import_row_result is
  'One row of preview_import / import_transactions. action: import, skip_duplicate, skip_flagged, skip_matched, confirm_match, skip_chosen, invalid. category_source: choice, rule, to_categorise (category_id null until the write creates it), null for extra income. transaction_id: the write only.';

-- The reason codes that depend only on the row sent (what a token is told).
create function private.import_shape_reasons() returns text[]
language sql immutable set search_path = '' as $$
  select array['invalid_row', 'invalid_date', 'invalid_amount', 'invalid_direction', 'invalid_description',
               'invalid_merchant', 'invalid_bank_transaction_id', 'invalid_hint', 'invalid_details',
               'invalid_kind', 'invalid_category', 'invalid_action', 'choice_not_allowed']
$$;

-- R-IMPORT-002, R-IMPORT-102: the row's own fields, checked with nothing of the budget.
create function private.import_row_shape(p_row jsonb, p_by_token boolean,
  out reason text, out r_date date, out r_amount bigint, out r_direction text, out r_description text,
  out r_merchant text, out r_bank_id text, out r_hint text, out r_details jsonb,
  out r_action text, out r_kind public.transaction_kind, out r_category uuid)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_key text;
  v_value jsonb;
begin
  if p_row is null or pg_catalog.jsonb_typeof(p_row) <> 'object' then
    reason := 'invalid_row'; return;
  end if;
  for v_key in select pg_catalog.jsonb_object_keys(p_row) loop
    if v_key not in ('date', 'amount', 'direction', 'description', 'merchant', 'bank_transaction_id', 'hint', 'details',
                     'action', 'kind', 'category_id') then
      reason := 'invalid_row'; return;
    end if;
  end loop;
  -- the date: a calendar date YYYY-MM-DD
  if pg_catalog.jsonb_typeof(p_row -> 'date') is distinct from 'string'
     or (p_row ->> 'date') !~ '^\d{4}-\d{2}-\d{2}$' then
    reason := 'invalid_date'; return;
  end if;
  begin
    r_date := (p_row ->> 'date')::date;
  exception when others then
    reason := 'invalid_date'; return;
  end;
  if not private.is_sane_date(r_date) then
    reason := 'invalid_date'; return;
  end if;
  -- the amount: integer rappen, 1 to the transaction maximum
  if pg_catalog.jsonb_typeof(p_row -> 'amount') is distinct from 'number'
     or (p_row ->> 'amount')::numeric <> pg_catalog.trunc((p_row ->> 'amount')::numeric)
     or (p_row ->> 'amount')::numeric < 1 or (p_row ->> 'amount')::numeric > private.limit_transaction_amount() then
    reason := 'invalid_amount'; return;
  end if;
  r_amount := (p_row ->> 'amount')::bigint;
  r_direction := p_row ->> 'direction';
  if pg_catalog.jsonb_typeof(p_row -> 'direction') is distinct from 'string' or r_direction not in ('debit', 'credit') then
    reason := 'invalid_direction'; return;
  end if;
  if p_row ? 'description' and pg_catalog.jsonb_typeof(p_row -> 'description') not in ('string', 'null') then
    reason := 'invalid_description'; return;
  end if;
  begin
    r_description := private.clean_description(p_row ->> 'description');
  exception when sqlstate 'P0001' then
    reason := 'invalid_description'; return;
  end;
  if p_row ? 'merchant' and (pg_catalog.jsonb_typeof(p_row -> 'merchant') not in ('string', 'null')
                             or char_length(p_row ->> 'merchant') > 200) then
    reason := 'invalid_merchant'; return;
  end if;
  r_merchant := nullif(pg_catalog.btrim(p_row ->> 'merchant'), '');
  if p_row ? 'bank_transaction_id' and (pg_catalog.jsonb_typeof(p_row -> 'bank_transaction_id') not in ('string', 'null')
                                        or char_length(pg_catalog.btrim(p_row ->> 'bank_transaction_id')) > 100) then
    reason := 'invalid_bank_transaction_id'; return;
  end if;
  r_bank_id := nullif(pg_catalog.btrim(p_row ->> 'bank_transaction_id'), '');
  r_hint := p_row ->> 'hint';
  if p_row ? 'hint' and r_hint is not null and r_hint not in ('card_bill_payment', 'own_transfer', 'transfer_to_person', 'salary',
                                                              'interest', 'fee', 'securities_purchase', 'cash_withdrawal', 'refund') then
    reason := 'invalid_hint'; return;
  end if;
  -- the extra data (R-IMPORT-102): known keys, scalar values, bounded size
  if p_row ? 'details' and pg_catalog.jsonb_typeof(p_row -> 'details') <> 'null' then
    r_details := p_row -> 'details';
    if pg_catalog.jsonb_typeof(r_details) <> 'object' or pg_catalog.octet_length(r_details::text) > private.limit_import_details_bytes() then
      reason := 'invalid_details'; return;
    end if;
    for v_key, v_value in select * from pg_catalog.jsonb_each(r_details) loop
      if v_key not in ('purchase_time', 'booking_date', 'value_date', 'card', 'original_currency', 'original_amount',
                       'exchange_rate', 'fee', 'merchant_category', 'security', 'location')
         or pg_catalog.jsonb_typeof(v_value) not in ('string', 'number') then
        reason := 'invalid_details'; return;
      end if;
    end loop;
  end if;
  -- the caller's choices (a member only)
  if p_row ?| array['action', 'kind', 'category_id'] then
    if p_by_token then
      reason := 'choice_not_allowed'; return;
    end if;
    r_action := p_row ->> 'action';
    if p_row ? 'action' and r_action is not null and r_action not in ('import', 'skip') then
      reason := 'invalid_action'; return;
    end if;
    if p_row ? 'kind' and (p_row ->> 'kind') is not null then
      if (r_direction = 'debit' and (p_row ->> 'kind') <> 'expense')
         or (r_direction = 'credit' and (p_row ->> 'kind') not in ('refund', 'extra_income')) then
        reason := 'invalid_kind'; return;
      end if;
      r_kind := (p_row ->> 'kind')::public.transaction_kind;
    end if;
    if p_row ? 'category_id' and (p_row ->> 'category_id') is not null then
      if (p_row ->> 'category_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
         or r_kind = 'extra_income' then
        reason := 'invalid_category'; return;
      end if;
      r_category := (p_row ->> 'category_id')::uuid;
    end if;
  end if;
end;
$$;

-- R-IMPORT-001 to R-IMPORT-003, R-IMPORT-070 to R-IMPORT-073, R-IMPORT-079, R-IMPORT-091 to
-- R-IMPORT-094, R-IMPORT-200 to R-IMPORT-206, D-310 to D-315: what importing p_rows into the
-- budget does, row by row, without writing anything. Rows are taken in order; within one
-- call an existing transaction absorbs at most one row (as its duplicate or its match), so
-- duplicates count; the batch's own transactions are never compared (rows of one import are
-- never duplicates of each other).
create function private.import_plan(p_budget_id uuid, p_batch_id uuid, p_rows jsonb, p_by_token boolean)
returns setof public.import_row_result
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_row jsonb;
  v_no integer;
  s record;
  r public.import_row_result;
  v_seq integer;
  v_start date;
  v_used uuid[] := '{}'::uuid[];
  v_to_categorise uuid;
  v_hint_flag text;
  v_default text;
  v_dup uuid;
  v_match uuid;
  v_match_charge boolean;
begin
  if p_rows is null or pg_catalog.jsonb_typeof(p_rows) <> 'array'
     or pg_catalog.jsonb_array_length(p_rows) not between 1 and private.limit_import_rows_per_call() then
    raise exception 'invalid_rows' using errcode = 'P0001';
  end if;
  select c.id into v_to_categorise from public.categories as c
  where c.budget_id = p_budget_id and c.is_to_categorise and c.end_seq is null;

  for v_row, v_no in select e.value, e.ordinality::integer from pg_catalog.jsonb_array_elements(p_rows) with ordinality as e loop
    r := null;
    r.row_no := v_no;
    r.valid := true;
    s := private.import_row_shape(v_row, p_by_token);
    r.date := s.r_date; r.amount := s.r_amount; r.direction := s.r_direction; r.description := s.r_description;
    r.reason := s.reason;
    if r.reason is null then
      r.merchant_key := private.merchant_key(s.r_merchant, s.r_description);
      -- the date: in one of the budget's periods, not after today (add_transaction's check)
      begin
        v_seq := private.transaction_period_seq(p_budget_id, s.r_date);
        select p.start_date into v_start from public.periods as p where p.budget_id = p_budget_id and p.seq = v_seq;
      exception when sqlstate 'P0001' then
        r.reason := sqlerrm;
      end;
    end if;
    if r.reason is null then
      -- R-IMPORT-091 to R-IMPORT-093: what the source says, and a salary by its amount
      v_hint_flag := case when s.r_hint in ('card_bill_payment', 'own_transfer', 'transfer_to_person') then s.r_hint end;
      if s.r_direction = 'credit' then
        select i.id, v.amount into r.salary_income_id, r.salary_income_amount
        from public.incomes as i
        cross join lateral (select iv.amount from public.income_versions as iv
                            where iv.income_id = i.id and iv.effective_from_seq <= v_seq
                            order by iv.effective_from_seq desc limit 1) as v
        where i.budget_id = p_budget_id and i.first_seq <= v_seq and (i.end_seq is null or v_seq < i.end_seq)
          and v.amount = s.r_amount and abs(s.r_date - v_start) <= 5
        order by i.created_at, i.id limit 1;
        if r.salary_income_id is not null or s.r_hint = 'salary' then
          v_hint_flag := 'salary';
          if r.salary_income_id is null then
            -- the planned income to show beside the amount: the primary income's
            select b.primary_income_id, v.amount into r.salary_income_id, r.salary_income_amount
            from public.budgets as b
            cross join lateral (select iv.amount from public.income_versions as iv
                                where iv.income_id = b.primary_income_id and iv.effective_from_seq <= v_seq
                                order by iv.effective_from_seq desc limit 1) as v
            where b.id = p_budget_id;
          end if;
        end if;
      end if;
      r.flag := v_hint_flag;
      if r.flag in ('card_bill_payment', 'own_transfer', 'transfer_to_person') and r.merchant_key is not null then
        select c.choice into r.remembered_choice from public.import_choices as c
        where c.budget_id = p_budget_id and c.flag = r.flag and c.counterparty_key = r.merchant_key;
      end if;
      -- the kind: an expense for a debit; a credit is a refund, or extra income for a salary
      r.kind := coalesce(s.r_kind, case when s.r_direction = 'debit' then 'expense'
                                        when r.flag = 'salary' then 'extra_income' else 'refund' end::public.transaction_kind);
      -- the category: the caller's, else a rule's (in force on the date), else "to categorise"
      if r.kind <> 'extra_income' then
        if s.r_category is not null then
          begin
            perform private.assert_transaction_category(p_budget_id, r.kind, s.r_category, v_seq);
            r.category_id := s.r_category;
            r.category_source := 'choice';
          exception when sqlstate 'P0001' then
            r.reason := sqlerrm;
          end;
        else
          select m.id, m.category_id into r.rule_id, r.category_id
          from public.merchant_rules as m
          join public.categories as c on c.id = m.category_id
          where m.budget_id = p_budget_id and r.merchant_key is not null
            and pg_catalog.strpos(r.merchant_key, m.fragment) > 0
            and not c.is_group and c.first_seq <= v_seq and (c.end_seq is null or v_seq < c.end_seq)
          order by char_length(m.fragment) desc, m.created_at, m.id
          limit 1;
          if r.rule_id is not null then
            r.category_source := 'rule';
          else
            r.category_id := v_to_categorise;
            r.category_source := 'to_categorise';
          end if;
        end if;
      end if;
    end if;
    if r.reason is not null then
      r.valid := false;
      r.action := 'invalid';
      return next r;
      continue;
    end if;

    -- R-IMPORT-070, R-IMPORT-071, D-313: a duplicate, counted: the same bank transaction id,
    -- else the same date, amount and description, of the same kind, not yet absorbed
    v_dup := null;
    if s.r_bank_id is not null then
      select t.id into v_dup from public.transactions as t
      where t.budget_id = p_budget_id and t.bank_transaction_id = s.r_bank_id and t.kind = r.kind
        and t.import_batch_id is distinct from p_batch_id and t.id <> all (v_used)
      order by t.created_at, t.id limit 1;
    end if;
    if v_dup is null then
      select t.id into v_dup from public.transactions as t
      where t.budget_id = p_budget_id and t.kind = r.kind and t.amount = s.r_amount and t.date = s.r_date
        and coalesce(t.description, '') = coalesce(s.r_description, '')
        and t.import_batch_id is distinct from p_batch_id and t.id <> all (v_used)
      order by t.created_at, t.id limit 1;
    end if;
    r.duplicate_of := v_dup;
    -- R-IMPORT-203, D-315: a possible match: not imported, same kind and amount, within three
    -- days, not yet absorbed
    v_match := null;
    v_match_charge := null;
    if v_dup is null then
      select t.id, t.review_state = 'awaiting_confirmation' into v_match, v_match_charge
      from public.transactions as t
      where t.budget_id = p_budget_id and t.kind = r.kind and t.amount = s.r_amount
        and t.date between s.r_date - 3 and s.r_date + 3 and t.import_batch_id is null and t.id <> all (v_used)
      order by abs(t.date - s.r_date), (t.review_state = 'awaiting_confirmation') desc, t.created_at, t.id
      limit 1;
    end if;
    r.match_of := v_match;
    r.match_is_charge := v_match_charge;

    -- the action: the caller's choice, else the default
    v_default := case
      when r.flag in ('card_bill_payment', 'own_transfer') then coalesce(r.remembered_choice, 'skip')
      when r.flag = 'transfer_to_person' then coalesce(r.remembered_choice, 'import')
      when r.flag = 'salary' then 'skip'
      else 'import' end;
    if s.r_action = 'skip' then
      r.action := 'skip_chosen';
    elsif s.r_action = 'import' then
      r.action := 'import';
    elsif v_dup is not null then
      r.action := 'skip_duplicate';
      v_used := v_used || v_dup;
    elsif v_default = 'skip' then
      r.action := 'skip_flagged';
    elsif v_match is not null then
      r.action := case when v_match_charge and not p_by_token then 'confirm_match' else 'skip_matched' end;
      v_used := v_used || v_match;
    else
      r.action := 'import';
    end if;
    return next r;
  end loop;
end;
$$;

-- R-IMPORT-001, R-IMPORT-004, R-IMPORT-080, D-310: do what the plan says. Under the budget
-- lock, caught up, the batch checked. All or nothing: refused before anything is written when
-- the budget has no room for the rows to import (the detail says how many would fit). Returns
-- the plan rows with the transactions created.
create function private.import_apply(p_budget_id uuid, p_batch_id uuid, p_chunk integer, p_plan public.import_row_result[],
                                     p_rows jsonb, p_by_token boolean, p_to_categorise_name text)
returns setof public.import_row_result
language plpgsql
volatile
set search_path = ''
as $$
declare
  r public.import_row_result;
  v_row jsonb;
  s record;
  v_needed integer;
  v_room integer;
  v_to_categorise uuid;
  v_first integer;
  v_user uuid := (select auth.uid());
begin
  select pg_catalog.count(*)::integer into v_needed from unnest(p_plan) as x where x.action = 'import';
  v_room := private.transaction_room(p_budget_id);
  if v_needed > v_room then
    raise exception 'transaction_limit_reached' using errcode = 'P0001',
      detail = pg_catalog.json_build_object('fits', greatest(v_room, 0))::text;
  end if;
  -- the "to categorise" category, created at the first import that needs it (D-312)
  if exists (select 1 from unnest(p_plan) as x where x.action = 'import' and x.kind <> 'extra_income' and x.category_id is null) then
    select c.id into v_to_categorise from public.categories as c
    where c.budget_id = p_budget_id and c.is_to_categorise and c.end_seq is null;
    if v_to_categorise is null then
      -- an ended one (emptied, then removed) gives its place up
      update public.categories set is_to_categorise = false where budget_id = p_budget_id and is_to_categorise;
      -- created even at the 200 / 500 category limits (it needs no room: the import must not
      -- fail for want of a place to put what it cannot categorise), within the 900-row bound
      if (select pg_catalog.count(*) from public.categories as c where c.budget_id = p_budget_id) + 1 > private.limit_rows_per_kind() then
        raise exception 'category_limit_reached' using errcode = 'P0001';
      end if;
      select pg_catalog.min(p.seq) into v_first from public.periods as p where p.budget_id = p_budget_id;
      insert into public.categories (budget_id, name, sort_order, first_seq, is_to_categorise)
      values (p_budget_id, private.clean_name(coalesce(p_to_categorise_name, 'To categorise')),
              (select coalesce(pg_catalog.max(c.sort_order), 0) + 1 from public.categories as c
               where c.budget_id = p_budget_id and c.parent_id is null),
              v_first, true)
      returning id into v_to_categorise;
      insert into public.category_expectations (category_id, budget_id, effective_from_seq, amount, cadence)
      values (v_to_categorise, p_budget_id, v_first, 0, 'monthly');
    end if;
  end if;
  foreach r in array p_plan loop
    v_row := p_rows -> (r.row_no - 1);
    if r.action = 'import' then
      s := private.import_row_shape(v_row, p_by_token);
      if r.kind <> 'extra_income' and r.category_id is null then
        r.category_id := v_to_categorise;
      end if;
      insert into public.transactions (budget_id, kind, amount, date, category_id, description, recorded_by, review_state,
                                       import_batch_id, bank_transaction_id, merchant, merchant_key, details)
      values (p_budget_id, r.kind, r.amount, r.date, r.category_id, r.description, v_user, 'to_review',
              p_batch_id, s.r_bank_id, s.r_merchant, r.merchant_key, s.r_details)
      returning id into r.transaction_id;
    else
      if r.action = 'confirm_match' then
        update public.transactions set review_state = 'confirmed'
        where id = r.match_of and review_state = 'awaiting_confirmation';
      end if;
      insert into public.import_skipped_rows (budget_id, batch_id, chunk, row_no, reason, detail, duplicate_of, match_of, row_data)
      values (p_budget_id, p_batch_id, p_chunk, r.row_no,
              case r.action when 'skip_duplicate' then 'duplicate' when 'skip_flagged' then 'flagged'
                            when 'skip_matched' then 'matched' when 'confirm_match' then 'matched'
                            when 'skip_chosen' then 'chosen' else 'invalid' end,
              case when r.action = 'invalid' then r.reason when r.action in ('skip_flagged', 'skip_chosen') then r.flag end,
              r.duplicate_of, r.match_of, coalesce(v_row, 'null'::jsonb))
      on conflict (batch_id, chunk, row_no) do nothing;
    end if;
    -- R-IMPORT-092, D-314: a member's choice for a flagged entry is remembered
    if not p_by_token and r.flag in ('card_bill_payment', 'own_transfer', 'transfer_to_person') and r.merchant_key is not null
       and r.action in ('import', 'skip_flagged', 'skip_chosen') then
      insert into public.import_choices (budget_id, flag, counterparty_key, choice, updated_by)
      values (p_budget_id, r.flag, r.merchant_key, case when r.action = 'import' then 'import' else 'skip' end, v_user)
      on conflict (budget_id, flag, counterparty_key) do update
        set choice = excluded.choice, updated_by = excluded.updated_by, updated_at = now();
    end if;
    return next r;
  end loop;
end;
$$;

-- Lock the budget, catch up (one step, catching_up otherwise), and check or create the batch.
create function private.import_open_batch(p_budget_id uuid, p_batch_id uuid, p_chunk integer, p_source text,
                                          p_from date, p_to date, p_token public.import_tokens)
returns public.import_batches
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_batch public.import_batches;
begin
  if p_batch_id is null then
    raise exception 'invalid_batch' using errcode = 'P0001';
  end if;
  if p_chunk is null or p_chunk not between 1 and private.limit_import_chunks() then
    raise exception 'invalid_chunk' using errcode = 'P0001';
  end if;
  perform private.lock_and_catch_up(p_budget_id);
  -- a token revoked while this call waited for the lock is refused (revoking takes the lock)
  if p_token.id is not null and not exists (select 1 from public.import_tokens as t
                                            where t.id = p_token.id and t.revoked_at is null and t.expires_at > now()) then
    raise exception 'invalid_token' using errcode = 'P0001';
  end if;
  select b.* into v_batch from public.import_batches as b where b.id = p_batch_id;
  if v_batch.id is null then
    if p_source is null or p_source not in ('csv', 'migros_account', 'migros_card', 'yuh', 'script', 'other') then
      raise exception 'invalid_source' using errcode = 'P0001';
    end if;
    if (p_from is not null and not private.is_sane_date(p_from)) or (p_to is not null and not private.is_sane_date(p_to))
       or p_from > p_to then
      raise exception 'invalid_date' using errcode = 'P0001';
    end if;
    insert into public.import_batches (id, budget_id, source, statement_from, statement_to, created_by, token_id, token_name)
    values (p_batch_id, p_budget_id, p_source, p_from, p_to, (select auth.uid()), p_token.id, p_token.name)
    returning * into v_batch;
  elsif v_batch.budget_id <> p_budget_id then
    raise exception 'import_batch_conflict' using errcode = 'P0001';
  elsif v_batch.undone_at is not null then
    raise exception 'batch_undone' using errcode = 'P0001';
  end if;
  return v_batch;
end;
$$;

-- The write behind both entries: plan, apply, count, record the chunk's answer.
create function private.import_chunk(p_budget_id uuid, p_batch_id uuid, p_chunk integer, p_rows jsonb, p_source text,
                                     p_from date, p_to date, p_to_categorise_name text, p_token public.import_tokens)
returns setof public.import_row_result
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_done jsonb;
  v_plan public.import_row_result[];
  v_result public.import_row_result[];
  v_by_token boolean := p_token.id is not null;
begin
  perform private.import_open_batch(p_budget_id, p_batch_id, p_chunk, p_source, p_from, p_to, p_token);
  -- idempotent: a chunk already recorded answers what it answered then, records nothing
  select c.result into v_done from private.import_chunks as c where c.batch_id = p_batch_id and c.chunk = p_chunk;
  if v_done is not null then
    return query select * from pg_catalog.jsonb_populate_recordset(null::public.import_row_result, v_done);
    return;
  end if;
  select pg_catalog.array_agg(p order by p.row_no) into v_plan from private.import_plan(p_budget_id, p_batch_id, p_rows, v_by_token) as p;
  select pg_catalog.array_agg(a order by a.row_no) into v_result
  from private.import_apply(p_budget_id, p_batch_id, p_chunk, v_plan, p_rows, v_by_token, p_to_categorise_name) as a;
  update public.import_batches as b set
    chunk_count = b.chunk_count + 1,
    row_count = b.row_count + pg_catalog.cardinality(v_result),
    imported_count = b.imported_count + (select pg_catalog.count(*) from unnest(v_result) as x where x.action = 'import'),
    duplicate_count = b.duplicate_count + (select pg_catalog.count(*) from unnest(v_result) as x where x.action = 'skip_duplicate'),
    flagged_count = b.flagged_count + (select pg_catalog.count(*) from unnest(v_result) as x where x.action = 'skip_flagged'),
    matched_count = b.matched_count + (select pg_catalog.count(*) from unnest(v_result) as x where x.action in ('skip_matched', 'confirm_match')),
    chosen_skip_count = b.chosen_skip_count + (select pg_catalog.count(*) from unnest(v_result) as x where x.action = 'skip_chosen'),
    invalid_count = b.invalid_count + (select pg_catalog.count(*) from unnest(v_result) as x where x.action = 'invalid'),
    charges_confirmed_count = b.charges_confirmed_count + (select pg_catalog.count(*) from unnest(v_result) as x where x.action = 'confirm_match')
  where b.id = p_batch_id;
  insert into private.import_chunks (batch_id, chunk, result) values (p_batch_id, p_chunk, pg_catalog.to_jsonb(v_result));
  return query select * from unnest(v_result);
end;
$$;

-- ===========================================================================
-- RPCs: import by a member (R-IMPORT-001 to R-IMPORT-004, R-IMPORT-200 to R-IMPORT-206)
-- ===========================================================================

-- What import_transactions with the same rows would do now, row by row; changes nothing
-- (one catch-up step, like every read). p_batch_id: the batch the rows will be sent in (its
-- earlier chunks are not compared with them). Members. Errors: budget_not_found,
-- invalid_rows (not an array of 1 to 500 rows), catching_up.
create function public.preview_import(p_budget_id uuid, p_batch_id uuid, p_rows jsonb)
returns setof public.import_row_result
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.assert_member(p_budget_id);
  perform private.read_catch_up(p_budget_id);
  return query select * from private.import_plan(p_budget_id, p_batch_id, p_rows, false);
end;
$$;

-- Import one chunk (1 to 100) of a batch (the caller's id) of at most 500 rows, exactly as
-- preview_import says for the same rows. The first chunk creates the batch with its source
-- and statement range; a chunk sent again answers what it answered the first time and records
-- nothing (D-310). Members. Errors: budget_not_found, invalid_batch, invalid_chunk,
-- invalid_source, invalid_date (the statement range), invalid_rows, import_batch_conflict (the
-- id is another budget's batch), batch_undone, transaction_limit_reached (detail: {"fits": n}),
-- category_limit_reached (creating "to categorise"), catching_up.
create function public.import_transactions(
  p_budget_id uuid,
  p_batch_id uuid,
  p_chunk integer,
  p_rows jsonb,
  p_source text,
  p_statement_from date default null,
  p_statement_to date default null,
  p_to_categorise_name text default null
)
returns setof public.import_row_result
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.assert_member(p_budget_id);
  return query select * from private.import_chunk(p_budget_id, p_batch_id, p_chunk, p_rows, p_source,
                                                  p_statement_from, p_statement_to, p_to_categorise_name, null::public.import_tokens);
end;
$$;

-- R-IMPORT-073, R-IMPORT-204: import skipped rows of a batch anyway (all of them by default):
-- each is planned again now with the action "import" (duplicates and matches no longer
-- matter), through the same code; rows that are no longer valid stay skipped. Returns the
-- rows as the plan answers them. Members. Errors: import_batch_not_found, batch_undone,
-- transaction_limit_reached, catching_up.
create function public.import_skipped_anyway(p_batch_id uuid, p_skipped_row_ids uuid[] default null)
returns setof public.import_row_result
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_batch public.import_batches;
  v_rows jsonb;
  v_ids uuid[];
  v_plan public.import_row_result[];
  r public.import_row_result;
begin
  select b.* into v_batch from public.import_batches as b where b.id = p_batch_id;
  if v_batch.id is null or not private.is_budget_member(v_batch.budget_id) then
    raise exception 'import_batch_not_found' using errcode = 'P0001';
  end if;
  perform private.lock_and_catch_up(v_batch.budget_id);
  select b.* into v_batch from public.import_batches as b where b.id = p_batch_id;
  if v_batch.undone_at is not null then
    raise exception 'batch_undone' using errcode = 'P0001';
  end if;
  select pg_catalog.array_agg(x.id order by x.chunk, x.row_no),
         pg_catalog.jsonb_agg(
           (x.row_data - 'action' - 'kind' - 'category_id') || pg_catalog.jsonb_build_object('action', 'import')
           order by x.chunk, x.row_no)
  into v_ids, v_rows
  from (select k.* from public.import_skipped_rows as k
        where k.batch_id = p_batch_id and k.reason <> 'invalid' and k.imported_transaction_id is null
          and (p_skipped_row_ids is null or k.id = any (p_skipped_row_ids))
        order by k.chunk, k.row_no
        limit private.limit_import_rows_per_call()) as x;
  if v_ids is null then
    return;
  end if;
  -- the original choices (a kind, a category) of a row are dropped: the member's review decides
  select pg_catalog.array_agg(p order by p.row_no) into v_plan from private.import_plan(v_batch.budget_id, p_batch_id, v_rows, false) as p;
  for r in select * from private.import_apply(v_batch.budget_id, p_batch_id, 0, v_plan, v_rows, false, null) loop
    if r.action = 'import' then
      update public.import_skipped_rows set imported_transaction_id = r.transaction_id where id = v_ids[r.row_no];
    end if;
    return next r;
  end loop;
  -- rows planned again record no new skipped row (chunk 0 rows are discarded)
  delete from public.import_skipped_rows where batch_id = p_batch_id and chunk = 0;
  update public.import_batches set imported_count = imported_count + (
    select pg_catalog.count(*) from public.import_skipped_rows as k where k.id = any (v_ids) and k.imported_transaction_id is not null)
  where id = p_batch_id;
end;
$$;

-- ===========================================================================
-- RPCs: import with a token (R-IMPORT-006, R-IMPORT-075 to R-IMPORT-077, D-116, D-316)
-- ===========================================================================

-- The token's row, or nothing: one index lookup by hash whatever the token is.
create function private.token_by_secret(p_token text)
returns public.import_tokens
language sql
stable
set search_path = ''
as $$
  select t.* from public.import_tokens as t
  where t.token_hash = pg_catalog.sha256(pg_catalog.convert_to(coalesce(p_token, ''), 'UTF8'))
    and t.revoked_at is null and t.expires_at > now()
$$;

-- Callable without a session (the publishable key only). An unknown, expired or revoked token
-- gets invalid_token, before any lock or catch-up. Rows are imported with the default choices
-- (a row with a choice is refused: choice_not_allowed), possible matches are skipped, never
-- confirmed. The answer reads nothing of the budget: how many rows were received, and the
-- reasons of rows refused for their own content only (rows refused for the budget's sake are
-- received and wait in the batch for a member). Limits per token: 60 calls and 5000 rows an
-- hour, 300 calls and 20 000 rows a day (token_rate_limited). Errors: invalid_token,
-- token_rate_limited, invalid_batch, invalid_chunk, invalid_source, invalid_rows,
-- import_batch_conflict, batch_undone, transaction_limit_reached, catching_up.
create function public.import_with_token(
  p_token text,
  p_batch_id uuid,
  p_chunk integer,
  p_rows jsonb,
  p_source text default 'script',
  p_statement_from date default null,
  p_statement_to date default null,
  p_to_categorise_name text default null
)
returns table (received integer, refused integer, refused_rows jsonb)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_token public.import_tokens;
  v_hour timestamptz := pg_catalog.date_trunc('hour', now());
  v_rows integer;
  v_used record;
  v_result public.import_row_result[];
begin
  v_token := private.token_by_secret(p_token);
  if v_token.id is null then
    raise exception 'invalid_token' using errcode = 'P0001';
  end if;
  v_rows := case when pg_catalog.jsonb_typeof(p_rows) = 'array' then pg_catalog.jsonb_array_length(p_rows) else 0 end;
  -- the token's own rate (counted when the call is accepted)
  select coalesce(pg_catalog.sum(u.calls) filter (where u.hour = v_hour), 0) as calls_hour,
         coalesce(pg_catalog.sum(u.rows) filter (where u.hour = v_hour), 0) as rows_hour,
         coalesce(pg_catalog.sum(u.calls), 0) as calls_day, coalesce(pg_catalog.sum(u.rows), 0) as rows_day
  into v_used
  from private.import_token_usage as u where u.token_id = v_token.id and u.hour > v_hour - interval '24 hours';
  if v_used.calls_hour + 1 > private.limit_token_calls_per_hour() or v_used.calls_day + 1 > private.limit_token_calls_per_day()
     or v_used.rows_hour + v_rows > private.limit_token_rows_per_hour() or v_used.rows_day + v_rows > private.limit_token_rows_per_day() then
    raise exception 'token_rate_limited' using errcode = 'P0001';
  end if;
  select pg_catalog.array_agg(c order by c.row_no) into v_result
  from private.import_chunk(v_token.budget_id, p_batch_id, p_chunk, p_rows, p_source, p_statement_from, p_statement_to,
                            p_to_categorise_name, v_token) as c;
  insert into private.import_token_usage (token_id, hour, calls, rows) values (v_token.id, v_hour, 1, v_rows)
  on conflict (token_id, hour) do update set calls = private.import_token_usage.calls + 1,
                                             rows = private.import_token_usage.rows + excluded.rows;
  update public.import_tokens set last_used_at = now() where id = v_token.id;
  return query
    select pg_catalog.count(*) filter (where not (x.action = 'invalid' and x.reason = any (private.import_shape_reasons())))::integer,
           pg_catalog.count(*) filter (where x.action = 'invalid' and x.reason = any (private.import_shape_reasons()))::integer,
           coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('row', x.row_no, 'reason', x.reason) order by x.row_no)
                      filter (where x.action = 'invalid' and x.reason = any (private.import_shape_reasons())), '[]'::jsonb)
    from unnest(v_result) as x;
end;
$$;

-- R-IMPORT-074: a token for one budget; the secret is answered once and never stored.
create function public.create_import_token(p_budget_id uuid, p_name text, p_expires_in_days integer default 30)
returns table (token_id uuid, token text, expires_at timestamptz)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_name text;
  v_secret text;
  v_id uuid;
  v_expires timestamptz;
begin
  perform private.assert_member(p_budget_id);
  v_name := private.clean_name(p_name);
  if p_expires_in_days is null or p_expires_in_days not between 1 and 365 then
    raise exception 'invalid_expiry' using errcode = 'P0001';
  end if;
  perform private.lock_budget(p_budget_id);
  if (select pg_catalog.count(*) from public.import_tokens as t
      where t.budget_id = p_budget_id and t.revoked_at is null and t.expires_at > now()) >= private.limit_import_tokens_active()
     or (select pg_catalog.count(*) from public.import_tokens as t where t.budget_id = p_budget_id) >= private.limit_import_tokens_total() then
    raise exception 'token_limit_reached' using errcode = 'P0001';
  end if;
  v_secret := 'bti_' || pg_catalog.replace(gen_random_uuid()::text, '-', '') || pg_catalog.replace(gen_random_uuid()::text, '-', '');
  v_expires := now() + pg_catalog.make_interval(days => p_expires_in_days);
  insert into public.import_tokens (budget_id, name, token_hash, created_by, expires_at)
  values (p_budget_id, v_name, pg_catalog.sha256(pg_catalog.convert_to(v_secret, 'UTF8')), (select auth.uid()), v_expires)
  returning id into v_id;
  return query select v_id, v_secret, v_expires;
end;
$$;

-- R-IMPORT-077: revoked at once and for good. Idempotent. Members of its budget.
create function public.revoke_import_token(p_token_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_token public.import_tokens;
begin
  select t.* into v_token from public.import_tokens as t where t.id = p_token_id;
  if v_token.id is null or not private.is_budget_member(v_token.budget_id) then
    raise exception 'token_not_found' using errcode = 'P0001';
  end if;
  perform private.lock_budget(v_token.budget_id);  -- an import in progress finishes first; the next is refused
  update public.import_tokens set revoked_at = now(), revoked_by = (select auth.uid())
  where id = p_token_id and revoked_at is null;
end;
$$;

-- R-IMPORT-205: a member who leaves or is removed (or whose account is deleted) takes the
-- tokens they created for that budget with them.
create function private.revoke_tokens_of_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.import_tokens set revoked_at = now()
  where budget_id = old.budget_id and created_by = old.user_id and revoked_at is null;
  return old;
end;
$$;
create trigger budget_members_revoke_tokens after delete on public.budget_members
  for each row execute function private.revoke_tokens_of_member();

-- ===========================================================================
-- RPCs: review (R-IMPORT-081, R-IMPORT-007, R-IMPORT-202)
-- ===========================================================================

-- The transaction is reviewed: to_review becomes confirmed. Not from "to categorise" (choose
-- a category first). Members. Errors: transaction_not_found, record_changed, invalid_revision,
-- not_to_review, category_to_categorise, catching_up.
create function public.confirm_import(p_transaction_id uuid, p_expected_revision integer)
returns setof public.transaction_list
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_budget_id uuid;
  v_tx public.transactions;
begin
  select t.budget_id into v_budget_id from public.transactions as t where t.id = p_transaction_id;
  if v_budget_id is null or not private.is_budget_member(v_budget_id) then
    raise exception 'transaction_not_found' using errcode = 'P0001';
  end if;
  perform private.lock_and_catch_up(v_budget_id);
  select t.* into v_tx from public.transactions as t where t.id = p_transaction_id;
  if v_tx.id is null then
    raise exception 'transaction_not_found' using errcode = 'P0001';
  end if;
  perform private.assert_revision(v_tx.revision, p_expected_revision);
  if v_tx.review_state <> 'to_review' then
    raise exception 'not_to_review' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.categories as c where c.id = v_tx.category_id and c.is_to_categorise) then
    raise exception 'category_to_categorise' using errcode = 'P0001';
  end if;
  update public.transactions set review_state = 'confirmed' where id = v_tx.id;
  return query select * from public.transaction_list as l where l.id = v_tx.id;
end;
$$;

-- Confirm in one call every transaction to review of the budget (or of one batch) that is not
-- in "to categorise". Under the budget lock. Returns how many were confirmed and how many are
-- left in "to categorise". Members. Errors: budget_not_found, import_batch_not_found, catching_up.
create function public.confirm_imports(p_budget_id uuid, p_batch_id uuid default null)
returns table (confirmed integer, left_to_categorise integer)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_confirmed integer;
begin
  perform private.assert_member(p_budget_id);
  if p_batch_id is not null and not exists (select 1 from public.import_batches as b where b.id = p_batch_id and b.budget_id = p_budget_id) then
    raise exception 'import_batch_not_found' using errcode = 'P0001';
  end if;
  perform private.lock_and_catch_up(p_budget_id);
  update public.transactions as t set review_state = 'confirmed'
  where t.budget_id = p_budget_id and t.review_state = 'to_review'
    and (p_batch_id is null or t.import_batch_id = p_batch_id)
    and not exists (select 1 from public.categories as c where c.id = t.category_id and c.is_to_categorise);
  get diagnostics v_confirmed = row_count;
  return query select v_confirmed,
    (select pg_catalog.count(*)::integer from public.transactions as t
     where t.budget_id = p_budget_id and t.review_state = 'to_review' and (p_batch_id is null or t.import_batch_id = p_batch_id));
end;
$$;

-- R-IMPORT-206: undo a batch: its transactions still to review are deleted; the confirmed ones,
-- and the charges it confirmed, stay; the remembered choices stay. Once. Members. Errors:
-- import_batch_not_found, batch_undone, catching_up.
create function public.undo_import_batch(p_batch_id uuid)
returns table (deleted integer, kept_confirmed integer, charges_confirmed integer)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_batch public.import_batches;
  v_deleted integer;
begin
  select b.* into v_batch from public.import_batches as b where b.id = p_batch_id;
  if v_batch.id is null or not private.is_budget_member(v_batch.budget_id) then
    raise exception 'import_batch_not_found' using errcode = 'P0001';
  end if;
  perform private.lock_and_catch_up(v_batch.budget_id);
  select b.* into v_batch from public.import_batches as b where b.id = p_batch_id;
  if v_batch.undone_at is not null then
    raise exception 'batch_undone' using errcode = 'P0001';
  end if;
  delete from public.transactions where import_batch_id = p_batch_id and review_state = 'to_review';
  get diagnostics v_deleted = row_count;
  update public.import_batches set undone_at = now(), undone_by = (select auth.uid()) where id = p_batch_id;
  return query select v_deleted,
    (select pg_catalog.count(*)::integer from public.transactions as t where t.import_batch_id = p_batch_id),
    v_batch.charges_confirmed_count;
end;
$$;

-- ===========================================================================
-- RPCs: merchant rules (R-IMPORT-078, R-IMPORT-079, R-IMPORT-007, D-311)
-- ===========================================================================

-- A rule's category: a leaf of the budget, not "to categorise", not ended.
create function private.assert_rule_category(p_budget_id uuid, p_category_id uuid)
returns void
language plpgsql
stable
set search_path = ''
as $$
declare
  v_category public.categories;
begin
  select c.* into v_category from public.categories as c where c.id = p_category_id and c.budget_id = p_budget_id;
  if v_category.id is null then
    raise exception 'category_not_found' using errcode = 'P0001';
  end if;
  if v_category.is_group then
    raise exception 'category_is_group' using errcode = 'P0001';
  end if;
  if v_category.is_to_categorise then
    raise exception 'category_to_categorise' using errcode = 'P0001';
  end if;
  if v_category.end_seq is not null then
    raise exception 'category_ended' using errcode = 'P0001';
  end if;
end;
$$;

-- R-IMPORT-202: move the to-review transactions waiting in "to categorise" whose key contains
-- the rule's fragment to its category, where that category is in force on their date.
create function private.apply_merchant_rule(p_rule public.merchant_rules)
returns integer
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_moved integer;
begin
  update public.transactions as t set category_id = p_rule.category_id
  from public.categories as tc, public.categories as c
  where t.budget_id = p_rule.budget_id and t.review_state = 'to_review' and t.kind <> 'extra_income'
    and tc.id = t.category_id and tc.is_to_categorise
    and t.merchant_key is not null and pg_catalog.strpos(t.merchant_key, p_rule.fragment) > 0
    and c.id = p_rule.category_id and not c.is_group
    and exists (select 1 from public.periods as p where p.budget_id = t.budget_id and t.date between p.start_date and p.end_date
                and c.first_seq <= p.seq and (c.end_seq is null or p.seq < c.end_seq));
  get diagnostics v_moved = row_count;
  return v_moved;
end;
$$;

create view public.merchant_rule_list with (security_invoker = true) as
  select r.id, r.budget_id, r.fragment, r.category_id, c.name as category_name, c.parent_id as parent_category_id,
         pc.name as parent_category_name, (c.end_seq is null) as category_in_force, r.created_by, r.revision,
         r.created_at, r.updated_at
  from public.merchant_rules as r
  join public.categories as c on c.id = r.category_id
  left join public.categories as pc on pc.id = c.parent_id;

-- One-click rule (D-117): create it and, with p_apply, move the waiting matches. p_fragment
-- is normalised like a merchant key. Members. Errors: budget_not_found, invalid_fragment,
-- category_not_found, category_is_group, category_to_categorise, category_ended,
-- merchant_rule_exists, merchant_rule_limit_reached, catching_up.
create function public.create_merchant_rule(p_budget_id uuid, p_fragment text, p_category_id uuid, p_apply boolean default false)
returns table (rule_id uuid, fragment text, revision integer, moved integer)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_fragment text := private.normalize_merchant_text(p_fragment);
  v_rule public.merchant_rules;
begin
  perform private.assert_member(p_budget_id);
  if v_fragment = '' or char_length(v_fragment) > 100 then
    raise exception 'invalid_fragment' using errcode = 'P0001';
  end if;
  perform private.lock_and_catch_up(p_budget_id);
  perform private.assert_rule_category(p_budget_id, p_category_id);
  if exists (select 1 from public.merchant_rules as r where r.budget_id = p_budget_id and r.fragment = v_fragment) then
    raise exception 'merchant_rule_exists' using errcode = 'P0001';
  end if;
  if (select pg_catalog.count(*) from public.merchant_rules as r where r.budget_id = p_budget_id) >= private.limit_merchant_rules() then
    raise exception 'merchant_rule_limit_reached' using errcode = 'P0001';
  end if;
  insert into public.merchant_rules (budget_id, fragment, category_id, created_by)
  values (p_budget_id, v_fragment, p_category_id, (select auth.uid()))
  returning * into v_rule;
  return query select v_rule.id, v_rule.fragment, v_rule.revision,
    case when coalesce(p_apply, false) then private.apply_merchant_rule(v_rule) else 0 end;
end;
$$;

-- Change a rule's fragment and/or category; with p_apply, move the waiting matches. Errors:
-- merchant_rule_not_found, record_changed, invalid_revision, as create_merchant_rule.
create function public.update_merchant_rule(p_rule_id uuid, p_expected_revision integer, p_fragment text default null,
                                            p_category_id uuid default null, p_apply boolean default false)
returns table (rule_id uuid, fragment text, revision integer, moved integer)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_rule public.merchant_rules;
  v_fragment text;
begin
  select r.* into v_rule from public.merchant_rules as r where r.id = p_rule_id;
  if v_rule.id is null or not private.is_budget_member(v_rule.budget_id) then
    raise exception 'merchant_rule_not_found' using errcode = 'P0001';
  end if;
  if p_fragment is not null then
    v_fragment := private.normalize_merchant_text(p_fragment);
    if v_fragment = '' or char_length(v_fragment) > 100 then
      raise exception 'invalid_fragment' using errcode = 'P0001';
    end if;
  end if;
  perform private.lock_and_catch_up(v_rule.budget_id);
  select r.* into v_rule from public.merchant_rules as r where r.id = p_rule_id;
  if v_rule.id is null then
    raise exception 'merchant_rule_not_found' using errcode = 'P0001';
  end if;
  perform private.assert_revision(v_rule.revision, p_expected_revision);
  if p_category_id is not null then
    perform private.assert_rule_category(v_rule.budget_id, p_category_id);
  end if;
  if v_fragment is not null and v_fragment <> v_rule.fragment
     and exists (select 1 from public.merchant_rules as r where r.budget_id = v_rule.budget_id and r.fragment = v_fragment) then
    raise exception 'merchant_rule_exists' using errcode = 'P0001';
  end if;
  update public.merchant_rules set fragment = coalesce(v_fragment, fragment), category_id = coalesce(p_category_id, category_id)
  where id = v_rule.id returning * into v_rule;
  return query select v_rule.id, v_rule.fragment, v_rule.revision,
    case when coalesce(p_apply, false) then private.apply_merchant_rule(v_rule) else 0 end;
end;
$$;

create function public.delete_merchant_rule(p_rule_id uuid, p_expected_revision integer)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_rule public.merchant_rules;
begin
  select r.* into v_rule from public.merchant_rules as r where r.id = p_rule_id;
  if v_rule.id is null or not private.is_budget_member(v_rule.budget_id) then
    raise exception 'merchant_rule_not_found' using errcode = 'P0001';
  end if;
  perform private.lock_and_catch_up(v_rule.budget_id);
  select r.* into v_rule from public.merchant_rules as r where r.id = p_rule_id;
  if v_rule.id is null then
    raise exception 'merchant_rule_not_found' using errcode = 'P0001';
  end if;
  perform private.assert_revision(v_rule.revision, p_expected_revision);
  delete from public.merchant_rules where id = v_rule.id;
end;
$$;

-- ===========================================================================
-- Reads: batches, skipped rows, tokens (R-IMPORT-072, R-APP-170)
-- ===========================================================================
create view public.import_batch_list with (security_invoker = true) as
  select b.id, b.budget_id, b.source, b.statement_from, b.statement_to, b.created_by,
         private.recorder_name(b.budget_id, b.created_by) as created_by_name, b.token_id, b.token_name, b.created_at,
         b.chunk_count, b.row_count, b.imported_count, b.duplicate_count, b.flagged_count, b.matched_count,
         b.chosen_skip_count, b.invalid_count, b.charges_confirmed_count,
         (select pg_catalog.count(*)::integer from public.transactions as t
          where t.import_batch_id = b.id and t.review_state = 'to_review') as to_review_count,
         b.undone_at, b.undone_by
  from public.import_batches as b;

create view public.import_token_list with (security_invoker = true) as
  select t.id, t.budget_id, t.name, t.created_by, p.display_name as created_by_name, t.created_at, t.expires_at,
         t.last_used_at, t.revoked_at, (t.revoked_at is null and t.expires_at > now()) as is_active
  from public.import_tokens as t
  left join public.profiles as p on p.id = t.created_by;

-- Batches, newest first, at most p_limit (1 to 200); next page: the last row's created_at and
-- id. Members. Errors: budget_not_found, invalid_limit, invalid_cursor.
create function public.list_import_batches(p_budget_id uuid, p_limit integer default 50,
                                           p_before_created_at timestamptz default null, p_before_id uuid default null)
returns setof public.import_batch_list
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.assert_member(p_budget_id);
  if p_limit is null or p_limit not between 1 and private.limit_page_size() then
    raise exception 'invalid_limit' using errcode = 'P0001';
  end if;
  if pg_catalog.num_nonnulls(p_before_created_at, p_before_id) = 1 then
    raise exception 'invalid_cursor' using errcode = 'P0001';
  end if;
  return query select l.* from public.import_batch_list as l
    where l.budget_id = p_budget_id and (p_before_id is null or (l.created_at, l.id) < (p_before_created_at, p_before_id))
    order by l.created_at desc, l.id desc limit p_limit;
end;
$$;

-- The rows of a batch that were not imported, in their order, at most p_limit (1 to 200);
-- next page: the last row's chunk and row_no. Members. Errors: import_batch_not_found,
-- invalid_limit, invalid_cursor.
create function public.list_import_skipped_rows(p_batch_id uuid, p_limit integer default 100,
                                                p_after_chunk integer default null, p_after_row_no integer default null)
returns setof public.import_skipped_rows
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_budget uuid;
begin
  select b.budget_id into v_budget from public.import_batches as b where b.id = p_batch_id;
  if v_budget is null or not private.is_budget_member(v_budget) then
    raise exception 'import_batch_not_found' using errcode = 'P0001';
  end if;
  if p_limit is null or p_limit not between 1 and private.limit_page_size() then
    raise exception 'invalid_limit' using errcode = 'P0001';
  end if;
  if pg_catalog.num_nonnulls(p_after_chunk, p_after_row_no) = 1 then
    raise exception 'invalid_cursor' using errcode = 'P0001';
  end if;
  return query select k.* from public.import_skipped_rows as k
    where k.batch_id = p_batch_id and (p_after_chunk is null or (k.chunk, k.row_no) > (p_after_chunk, p_after_row_no))
    order by k.chunk, k.row_no limit p_limit;
end;
$$;

-- ===========================================================================
-- Step 3 and 4 replacements
-- ===========================================================================

-- As in step 4, plus (R-IMPORT-200) the "to categorise" category takes no subcategory (the
-- guard trigger), and (R-IMPORT-207) the merchant rules of a category that gets its first
-- subcategory move to "Other" with its transactions (a rule counts as a reference).
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
$$;

-- As in step 4, plus what the import review needs (R-IMPORT-102, R-IMPORT-201): the batch and
-- its source, the bank transaction id, the merchant and its key, the extra data, and whether
-- the transaction waits in "to categorise".
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
    coalesce(c.is_to_categorise, false) as in_to_categorise
  from public.transactions as t
  left join public.categories as c on c.id = t.category_id
  left join public.categories as pc on pc.id = c.parent_id
  left join public.subscriptions as s on s.id = t.subscription_id
  left join public.debts as d on d.id = t.debt_id
  left join public.import_batches as ib on ib.id = t.import_batch_id
  left join lateral (
    select pp.id, pp.end_date from public.periods as pp
    where pp.budget_id = t.budget_id and pp.start_date <= t.date
    order by pp.start_date desc
    limit 1
  ) as p on t.date <= p.end_date;

-- As in step 4, plus (R-IMPORT-081) how many transactions are to review and the budget's
-- "to categorise" category.
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
    (select c.id from public.categories as c where c.budget_id = b.id and c.is_to_categorise) as to_categorise_category_id
  from public.budgets as b
  join public.budget_members as m on m.budget_id = b.id and m.user_id = (select auth.uid());

-- As in step 4, plus p_to_review_only (the imported transactions to review, by the partial
-- index) and p_import_batch_id (one batch's transactions). R-TRANSACTION-095, R-IMPORT-081
drop function public.list_transactions(uuid, integer, date, date, uuid, public.transaction_kind, date, timestamptz, uuid, uuid, uuid, boolean);
create function public.list_transactions(
  p_budget_id uuid,
  p_limit integer default 50,
  p_from_date date default null,
  p_to_date date default null,
  p_category_id uuid default null,
  p_kind public.transaction_kind default null,
  p_before_date date default null,
  p_before_created_at timestamptz default null,
  p_before_id uuid default null,
  p_subscription_id uuid default null,
  p_debt_id uuid default null,
  p_awaiting_only boolean default false,
  p_to_review_only boolean default false,
  p_import_batch_id uuid default null
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
  if p_subscription_id is not null then
    if not exists (select 1 from public.subscriptions as s where s.id = p_subscription_id and s.budget_id = p_budget_id) then
      raise exception 'subscription_not_found' using errcode = 'P0001';
    end if;
    v_sql := v_sql || ' and l.subscription_id = $10';
  end if;
  if p_debt_id is not null then
    if not exists (select 1 from public.debts as d where d.id = p_debt_id and d.budget_id = p_budget_id) then
      raise exception 'debt_not_found' using errcode = 'P0001';
    end if;
    v_sql := v_sql || ' and l.debt_id = $11';
  end if;
  if p_import_batch_id is not null then
    if not exists (select 1 from public.import_batches as b where b.id = p_import_batch_id and b.budget_id = p_budget_id) then
      raise exception 'import_batch_not_found' using errcode = 'P0001';
    end if;
    v_sql := v_sql || ' and l.import_batch_id = $12';
  end if;
  if p_from_date is not null then v_sql := v_sql || ' and l.date >= $2'; end if;
  if p_to_date is not null then v_sql := v_sql || ' and l.date <= $3'; end if;
  if p_kind is not null then v_sql := v_sql || ' and l.kind = $4'; end if;
  if coalesce(p_awaiting_only, false) then v_sql := v_sql || ' and l.review_state = ''awaiting_confirmation'''; end if;
  if coalesce(p_to_review_only, false) then v_sql := v_sql || ' and l.review_state = ''to_review'''; end if;
  if p_before_id is not null then
    v_sql := v_sql || ' and (l.date, l.created_at, l.id) < ($6, $7, $8)';
  end if;
  v_sql := v_sql || ' order by l.date desc, l.created_at desc, l.id desc limit $9';
  return query execute v_sql
    using p_budget_id, p_from_date, p_to_date, p_kind, v_categories,
          p_before_date, p_before_created_at, p_before_id, p_limit, p_subscription_id, p_debt_id, p_import_batch_id;
end;
$$;

-- ===========================================================================
-- Row-level security (C-RLS-001 to C-RLS-003): members read; every write is an RPC
-- ===========================================================================
alter table public.import_tokens enable row level security;
alter table public.import_batches enable row level security;
alter table public.import_skipped_rows enable row level security;
alter table public.merchant_rules enable row level security;
alter table public.import_choices enable row level security;
alter table private.import_chunks enable row level security;
alter table private.import_token_usage enable row level security;

create policy "Members can read their budgets' import tokens (never the hash)"
  on public.import_tokens for select to authenticated
  using (budget_id in (select private.member_budget_ids()));
create policy "Members can read their budgets' import batches"
  on public.import_batches for select to authenticated
  using (budget_id in (select private.member_budget_ids()));
create policy "Members can read their budgets' skipped import rows"
  on public.import_skipped_rows for select to authenticated
  using (budget_id in (select private.member_budget_ids()));
create policy "Members can read their budgets' merchant rules"
  on public.merchant_rules for select to authenticated
  using (budget_id in (select private.member_budget_ids()));
create policy "Members can read their budgets' remembered import choices"
  on public.import_choices for select to authenticated
  using (budget_id in (select private.member_budget_ids()));

-- ===========================================================================
-- Privileges
-- ===========================================================================
revoke all on table
  public.import_tokens, public.import_batches, public.import_skipped_rows, public.merchant_rules, public.import_choices,
  public.merchant_rule_list, public.import_batch_list, public.import_token_list
from anon, authenticated, service_role;
revoke all on table private.import_chunks, private.import_token_usage from public, anon, authenticated, service_role;

-- the token hash is never readable: no column privilege on it
grant select (id, budget_id, name, created_by, created_at, expires_at, last_used_at, revoked_at, revoked_by)
  on table public.import_tokens to authenticated;
grant select on table
  public.import_batches, public.import_skipped_rows, public.merchant_rules, public.import_choices,
  public.merchant_rule_list, public.import_batch_list, public.import_token_list
to authenticated;
grant select, insert, update, delete on table
  public.import_batches, public.import_skipped_rows, public.merchant_rules, public.import_choices
to service_role;
grant select (id, budget_id, name, created_by, created_at, expires_at, last_used_at, revoked_at, revoked_by)
  on table public.import_tokens to service_role;
grant select on table public.merchant_rule_list, public.import_batch_list, public.import_token_list to service_role;

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

grant execute on function
  public.preview_import(uuid, uuid, jsonb),
  public.import_transactions(uuid, uuid, integer, jsonb, text, date, date, text),
  public.import_skipped_anyway(uuid, uuid[]),
  public.create_import_token(uuid, text, integer),
  public.revoke_import_token(uuid),
  public.confirm_import(uuid, integer),
  public.confirm_imports(uuid, uuid),
  public.undo_import_batch(uuid),
  public.create_merchant_rule(uuid, text, uuid, boolean),
  public.update_merchant_rule(uuid, integer, text, uuid, boolean),
  public.delete_merchant_rule(uuid, integer),
  public.list_import_batches(uuid, integer, timestamptz, uuid),
  public.list_import_skipped_rows(uuid, integer, integer, integer),
  public.list_transactions(uuid, integer, date, date, uuid, public.transaction_kind, date, timestamptz, uuid, uuid, uuid, boolean, boolean, uuid),
  public.create_category(uuid, text, uuid, bigint, public.expectation_cadence, uuid, text)
to authenticated;
-- R-IMPORT-076, R-SECURITY-005: the only function a visitor without a session can call
grant execute on function public.import_with_token(text, uuid, integer, jsonb, text, date, date, text) to anon, authenticated;
