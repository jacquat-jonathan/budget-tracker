-- Step 6: import (F-IMPORT). One import implementation (R-IMPORT-001): private.import_plan
-- decides, row by row, what an import does (validation with add_transaction's checks,
-- duplicates by count, flags and remembered choices, possible matches, merchant rules, the
-- "to categorise" category), and private.import_apply does exactly that. The member's preview
-- and write, the token's write, and "import a skipped row anyway" all go through them.
-- Imported transactions are to_review (R-IMPORT-004) and count at once (R-IMPORT-080).

-- ===========================================================================
-- Limits (one place)                                          (R-IMPORT-002, D-310, D-370)
-- ===========================================================================
create function private.limit_import_rows_per_call() returns integer
language sql immutable set search_path = '' as $$ select 500 $$;
create function private.limit_import_chunks() returns integer
language sql immutable set search_path = '' as $$ select 100 $$;
create function private.limit_import_details_bytes() returns integer
language sql immutable set search_path = '' as $$ select 2000 $$;
-- F3 (R-IMPORT-250): the whole rows argument of one call, checked when the function starts
-- (500 valid rows take at most about 1.6 MB). The request body is read and parsed before the
-- function runs: what bounds it there is the API gateway's limit (Q-280, docs/deployment.md).
create function private.limit_import_call_bytes() returns integer
language sql immutable set search_path = '' as $$ select 2000000 $$;
create function private.limit_merchant_rules() returns integer
language sql immutable set search_path = '' as $$ select 500 $$;
-- F11 (R-IMPORT-256): tokens that can still be used; revoked or expired ones are kept for the
-- batch list, at most this many a budget and this many days, then pruned
create function private.limit_import_tokens_active() returns integer
language sql immutable set search_path = '' as $$ select 10 $$;
create function private.limit_import_tokens_kept() returns integer
language sql immutable set search_path = '' as $$ select 20 $$;
create function private.limit_import_tokens_kept_days() returns integer
language sql immutable set search_path = '' as $$ select 365 $$;
-- rolling windows (F10): the last 60 minutes and the last 24 hours
create function private.limit_token_calls_per_hour() returns integer
language sql immutable set search_path = '' as $$ select 60 $$;
create function private.limit_token_calls_per_day() returns integer
language sql immutable set search_path = '' as $$ select 300 $$;
create function private.limit_token_rows_per_hour() returns integer
language sql immutable set search_path = '' as $$ select 5000 $$;
create function private.limit_token_rows_per_day() returns integer
language sql immutable set search_path = '' as $$ select 20000 $$;
-- F14 (R-IMPORT-257): remembered choices a budget keeps (the least recently used go first)
create function private.limit_import_choices() returns integer
language sql immutable set search_path = '' as $$ select 1000 $$;
-- M-2 (R-SECURITY-340, D-453): token calls never queue. At most this many token calls of all
-- budgets do work at the same time (the others answer imports_busy at once), and a token call
-- waits at most this long for its budget's lock (budget_busy), so its database time stays well
-- under the anon statement timeout (3 s).
create function private.limit_import_slots() returns integer
language sql immutable set search_path = '' as $$ select 2 $$;
create function private.limit_token_lock_wait() returns text
language sql immutable set search_path = '' as $$ select '1000ms' $$;
-- M-2 (D-453): a token call takes at most 250 rows (a member's 500), so that its worst-case
-- work stays far within the anon statement timeout; the hourly row limit (5000) is the same
-- 20 calls either way. D-451: a token is refused (transaction_limit_reached) whenever the
-- budget has room for fewer than this many transactions, whatever it sends.
create function private.limit_token_rows_per_call() returns integer
language sql immutable set search_path = '' as $$ select 250 $$;
-- D-452 (R-IMPORT-341), R-IMPORT-420: import storage per budget. Over a rolling 24 hours: rows
-- submitted to a write (members and tokens together, tokens at most limit_import_token_rows_per_day
-- of them), new batches (members and tokens each their own allowance, so a token never locks the
-- members out), tokens created (deleted ones count). Kept: batches, skipped rows (the oldest go),
-- stored chunk answers (the oldest are forgotten), staged preview parts (the oldest go, and those
-- older than a day).
create function private.limit_import_rows_per_day() returns integer
language sql immutable set search_path = '' as $$ select 20000 $$;
create function private.limit_import_token_rows_per_day() returns integer
language sql immutable set search_path = '' as $$ select 10000 $$;
create function private.limit_import_batches_per_day() returns integer
language sql immutable set search_path = '' as $$ select 200 $$;
create function private.limit_import_token_batches_per_day() returns integer
language sql immutable set search_path = '' as $$ select 50 $$;
create function private.limit_import_tokens_per_day() returns integer
language sql immutable set search_path = '' as $$ select 20 $$;
create function private.limit_import_batches_kept() returns integer
language sql immutable set search_path = '' as $$ select 2000 $$;
create function private.limit_import_skipped_kept() returns integer
language sql immutable set search_path = '' as $$ select 20000 $$;
create function private.limit_import_answers_kept() returns integer
language sql immutable set search_path = '' as $$ select 50 $$;
create function private.limit_import_preview_parts_kept() returns integer
language sql immutable set search_path = '' as $$ select 100 $$;

-- ===========================================================================
-- Free text, one helper (F13, R-SECURITY-250, D-376)
-- ===========================================================================
-- Control characters, bidirectional and zero-width formatting characters, interlinear
-- annotation marks and the language tag are removed; a zero-width joiner or non-joiner stays
-- only between two characters that are not white space (an emoji sequence, Persian or Indic
-- text) (R-SECURITY-341, D-454); any other run of white space (tabs, new lines, non-breaking and
-- other Unicode spaces) becomes one space; trimmed. A text left with nothing visible (only
-- fillers, blank patterns, joiners, variation selectors or tag characters) is empty. Before
-- validation and before any comparison. Markup and spreadsheet formulas stay as text (the
-- screens escape; an export must neutralise them).
create function private.clean_text(p_text text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when x.v ~ '[^[:space:]\u034F\u115F\u1160\u200C\u200D\u2800\u3164\uFE00-\uFE0F\uFFA0\U000E0020-\U000E007F\U000E0100-\U000E01EF]'
              then x.v else pg_catalog.left(x.v, 0) end
  from (select pg_catalog.btrim(pg_catalog.regexp_replace(
    pg_catalog.regexp_replace(pg_catalog.regexp_replace(p_text,
      '[\u0001-\u0008\u000E-\u001F\u007F-\u0084\u0086-\u009F\u00AD\u061C\u180E\u200B\u200E\u200F\u202A-\u202E\u2060-\u2064\u2066-\u206F\uFEFF\uFFF9-\uFFFB\U000E0001]',
      '', 'g'),
      '(?<![^[:space:]\u200C\u200D])[\u200C\u200D]+|[\u200C\u200D]+(?![^[:space:]\u200C\u200D])', '', 'g'),
    '[[:space:]\u0085\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]+', ' ', 'g')) as v) as x
$$;

-- Every name of every step (budgets, incomes, categories, subscriptions, debts, accounts,
-- transfers, tokens) and every description go through private.clean_text.
create or replace function private.clean_name(p_name text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_name text := private.clean_text(p_name);
begin
  if v_name is null or char_length(v_name) not between 1 and 100 then
    raise exception 'invalid_name' using errcode = 'P0001';
  end if;
  return v_name;
end;
$$;

create or replace function private.clean_description(p_description text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_description text := nullif(private.clean_text(p_description), '');
begin
  if char_length(v_description) > private.limit_description_length() then
    raise exception 'invalid_description' using errcode = 'P0001';
  end if;
  return v_description;
end;
$$;

-- ===========================================================================
-- The "to categorise" category (R-IMPORT-200, R-CATEGORY-250, D-375)
-- ===========================================================================
-- One ordinary top-level leaf per budget, created at its first import that needs it: where an
-- imported expense or refund without a category goes, so every transaction keeps a category
-- and every total still adds up. Renamable; no expectation, no subcategory, and it cannot end
-- while it holds transactions. F12: only imported transactions still to review can be in it
-- (private.guard_to_categorise_transaction below); no subscription, debt, planned transfer or
-- rule points to it; it does not count towards the 200 categories in force.
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
-- A token can be used only while its creator is a member of its budget (F2).
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
  -- F15: the transaction it was imported as (null again if that transaction is deleted, so the
  -- row can be imported anyway again), and when it was first imported anyway (counted once)
  imported_transaction_id uuid references public.transactions (id) on delete set null,
  imported_at timestamptz,
  created_at timestamptz not null default now(),
  constraint import_skipped_rows_batch_fk foreign key (batch_id, budget_id)
    references public.import_batches (id, budget_id) on delete cascade,
  constraint import_skipped_rows_reason_valid check (reason in ('duplicate', 'flagged', 'matched', 'chosen', 'invalid')),
  constraint import_skipped_rows_row_unique unique (batch_id, chunk, row_no)
);
create index import_skipped_rows_budget_idx on public.import_skipped_rows (budget_id, created_at, id);
create index import_skipped_rows_imported_idx on public.import_skipped_rows (imported_transaction_id);

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
-- counterparty key. At most 1000 a budget (F14); read with list_import_choices.
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
create index import_choices_recent_idx on public.import_choices (budget_id, updated_at desc);

-- Internal: the answer of each chunk already recorded (idempotency), and a token's use. D-452:
-- an answer is forgotten (result null) beyond the budget's newest 50 or after 7 days; the
-- chunk stays recorded, so sending it again answers chunk_expired and never imports it twice.
create table private.import_chunks (
  batch_id uuid not null references public.import_batches (id) on delete cascade,
  budget_id uuid not null references public.budgets (id) on delete cascade,
  chunk integer not null,
  result jsonb,
  created_at timestamptz not null default now(),
  primary key (batch_id, chunk)
);
create index import_chunks_budget_idx on private.import_chunks (budget_id, created_at) where result is not null;
-- D-452: what a budget's import writes used, by minute (rows submitted, new batches, tokens
-- created), for the rolling 24 hours (older minutes are pruned by the next write)
create table private.import_budget_usage (
  budget_id uuid not null references public.budgets (id) on delete cascade,
  minute timestamptz not null,
  rows integer not null default 0,
  batches integer not null default 0,
  tokens integer not null default 0,
  -- R-IMPORT-420: of those, what token calls used (rows and new batches)
  token_rows integer not null default 0,
  token_batches integer not null default 0,
  primary key (budget_id, minute)
);
-- Q-270 (D-455): the staged parts of a statement previewed in parts before any is written:
-- what each part absorbed and the choices it makes, so the next part's preview accounts for
-- them, and its totals. Kept a day, at most 100 a budget.
create table private.import_preview_parts (
  batch_id uuid not null,
  budget_id uuid not null references public.budgets (id) on delete cascade,
  part integer not null,
  absorbed uuid[] not null,
  choices jsonb not null,
  totals jsonb not null,
  created_at timestamptz not null default now(),
  primary key (batch_id, part)
);
create index import_preview_parts_budget_idx on private.import_preview_parts (budget_id, created_at);
-- F10: a token's calls and rows by minute, for windows rolling over the last 60 minutes and
-- the last 24 hours (older minutes are pruned by the token's next call). A call counts for at
-- least 60 minutes and at most 61 (the hour), at least 24 hours and at most 24 h 1 min (the
-- day): the whole minute it was made in counts (R-SECURITY-342).
create table private.import_token_usage (
  token_id uuid not null references public.import_tokens (id) on delete cascade,
  minute timestamptz not null,
  calls integer not null default 0,
  rows integer not null default 0,
  primary key (token_id, minute)
);
-- F4 (R-IMPORT-251): the existing transactions a batch's rows have absorbed (as duplicates or
-- matches), so the counting runs over the whole batch, whatever chunks it is sent in
create table private.import_absorbed (
  batch_id uuid not null references public.import_batches (id) on delete cascade,
  transaction_id uuid not null references public.transactions (id) on delete cascade,
  primary key (batch_id, transaction_id)
);
create index import_absorbed_transaction_idx on private.import_absorbed (transaction_id);

-- The imported transactions (R-IMPORT-102: their extra data, normalised). F17
-- (R-IMPORT-254): the amount, date and description as first imported, never changed, so an
-- edited import is still found as a duplicate.
alter table public.transactions
  add column import_batch_id uuid,
  add column bank_transaction_id text,
  add column merchant text,
  add column merchant_key text,
  add column details jsonb,
  add column import_amount bigint,
  add column import_date date,
  add column import_description text,
  add constraint transactions_import_batch_fk foreign key (import_batch_id, budget_id)
    references public.import_batches (id, budget_id),
  add constraint transactions_bank_transaction_id_valid check (bank_transaction_id is null or char_length(bank_transaction_id) between 1 and 100),
  add constraint transactions_merchant_valid check (merchant is null or char_length(merchant) <= 200),
  add constraint transactions_details_valid check (details is null or (pg_catalog.jsonb_typeof(details) = 'object'
                                                                       and pg_catalog.octet_length(details::text) <= 2000)),
  -- M-3: the values as first imported belong to imported transactions only (what lets the
  -- duplicate lookup use the partial index below)
  add constraint transactions_import_original_valid check (
    (import_amount is null and import_date is null and import_description is null) or import_batch_id is not null);
-- the review state of a transaction: a charge awaits confirmation, an import is to review
alter table public.transactions drop constraint transactions_awaiting_is_charge;
alter table public.transactions add constraint transactions_review_state_valid check (
  review_state = 'confirmed'
  or (review_state = 'awaiting_confirmation' and charge_date is not null)
  or (review_state = 'to_review' and import_batch_id is not null));
create index transactions_import_batch_idx on public.transactions (import_batch_id) where import_batch_id is not null;
create index transactions_bank_id_idx on public.transactions (budget_id, bank_transaction_id) where bank_transaction_id is not null;
create index transactions_match_idx on public.transactions (budget_id, kind, amount, date);
create index transactions_import_original_idx on public.transactions (budget_id, import_amount, import_date)
  where import_batch_id is not null;
create index transactions_to_review_idx on public.transactions (budget_id, date, created_at, id) where review_state = 'to_review';

-- ===========================================================================
-- The merchant key (R-IMPORT-201, R-IMPORT-255, D-311, D-381): one implementation
-- ===========================================================================

-- Lower case, accents removed (ß, œ, æ, ø spelled out), control and formatting characters
-- removed, every run of characters other than letters (any script), digits, '*', '.', '&'
-- and '-' a single space, trimmed.
create function private.normalize_merchant_text(p_text text)
returns text
language sql
immutable
set search_path = ''
as $$
  select pg_catalog.btrim(pg_catalog.regexp_replace(
    pg_catalog.translate(
      pg_catalog.replace(pg_catalog.replace(pg_catalog.replace(pg_catalog.replace(
        pg_catalog.lower(coalesce(private.clean_text(p_text), '')), 'ß', 'ss'), 'œ', 'oe'), 'æ', 'ae'), 'ø', 'o'),
      'àáâãäåāăąçćčďèéêëēĕėęěìíîïĩīĭįñńňòóôõöōŏőùúûüũūŭůűųýÿžźżšśşťţřŕľĺłğ',
      'aaaaaaaaacccdeeeeeeeeeiiiiiiiinnnoooooooouuuuuuuuuuyyzzzsssttrrllllg'),
    '[^[:alnum:]*.&-]+', ' ', 'g'))
$$;

-- The key of a row (D-311, D-381): its merchant field when that has a letter or digit,
-- otherwise its description; normalised; then, until nothing changes, the statement's own
-- leading words dropped ("achat", "twint", ...) and a '*' resolved: "payup *shop" is a
-- processor before the merchant (the key is "shop"), "amazon.de*ab12cd" a merchant before a
-- reference (one word with a digit: the key is "amazon.de"). Idempotent: the key of a key is
-- itself. Never empty when the text has a letter or digit; at most 200 characters. Bounded
-- work (M-2, R-IMPORT-342): the normalised text is cut to 200 characters first, and a text
-- that still changes after 10 steps keeps that cut text as its key (so it stays idempotent).
create function private.merchant_key(p_merchant text, p_description text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_merchant text := private.normalize_merchant_text(p_merchant);
  v_key text;
  v_prev text;
  v_before text;
  v_after text;
  v_steps integer := 0;
  v_start text;
begin
  v_key := pg_catalog.btrim(pg_catalog.left(
    case when v_merchant ~ '[[:alnum:]]' then v_merchant else private.normalize_merchant_text(p_description) end, 200));
  v_start := v_key;
  loop
    v_steps := v_steps + 1;
    if v_steps > 10 then
      v_key := v_start;
      exit;
    end if;
    v_prev := v_key;
    v_key := pg_catalog.regexp_replace(v_key, '^(achat|credit twint|debit twint|credit|debit|twint|paiement de salaire|paiement|ordre permanent) ', '');
    if v_key ~ '^[^ *]{1,20} ?\* ?[^ *]' then
      v_before := pg_catalog.substring(v_key, '^([^ *]{1,20}) ?\*');
      v_after := pg_catalog.btrim(pg_catalog.substring(v_key, '^[^ *]{1,20} ?\* ?(.*)$'));
      v_key := case when v_after !~ ' ' and v_after ~ '[0-9]' then v_before else v_after end;
    end if;
    v_key := pg_catalog.btrim(v_key);
    exit when v_key = v_prev or v_key !~ '[[:alnum:]]';
  end loop;
  if v_key !~ '[[:alnum:]]' then
    v_key := v_prev;
  end if;
  return nullif(v_key, '');
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
  transaction_id uuid,
  -- the chunk the row was sent in (null in a preview); with row_no, the row as sent (F15)
  chunk integer,
  -- Q-276 (D-456): the key a choice for a flagged row is remembered under: its merchant key,
  -- or 'own_transfer' for an own transfer without one (no merchant key can contain '_')
  choice_key text
);
comment on type public.import_row_result is
  'One row of preview_import / import_transactions / import_skipped_anyway. action: import, skip_duplicate, skip_flagged, skip_matched, confirm_match, skip_chosen, invalid. category_source: choice, rule, to_categorise (category_id null until the write creates it), null for extra income. transaction_id: the write only. chunk, row_no: the row as sent. choice_key: the key a choice for a flagged row is remembered under.';

-- The reason codes that depend only on the row sent (what a token is told).
create function private.import_shape_reasons() returns text[]
language sql immutable set search_path = '' as $$
  select array['invalid_row', 'invalid_date', 'invalid_amount', 'invalid_direction', 'invalid_description',
               'invalid_merchant', 'invalid_bank_transaction_id', 'invalid_hint', 'invalid_details',
               'invalid_kind', 'invalid_category', 'invalid_action', 'choice_not_allowed']
$$;

-- R-IMPORT-002, R-IMPORT-102: the row's own fields, checked with nothing of the budget. Free
-- text through private.clean_text (F13); the amount a JSON integer (F8: 12.0 is not one);
-- details rebuilt from their known keys, string values cleaned (normalised, not as given).
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
  v_text text;
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
  -- the amount: a JSON integer of rappen, 1 to the transaction maximum
  if pg_catalog.jsonb_typeof(p_row -> 'amount') is distinct from 'number'
     or (p_row ->> 'amount') !~ '^[1-9][0-9]{0,9}$' then
    reason := 'invalid_amount'; return;
  end if;
  r_amount := (p_row ->> 'amount')::bigint;
  if r_amount > private.limit_transaction_amount() then
    r_amount := null;
    reason := 'invalid_amount'; return;
  end if;
  r_direction := p_row ->> 'direction';
  if pg_catalog.jsonb_typeof(p_row -> 'direction') is distinct from 'string' or r_direction not in ('debit', 'credit') then
    r_direction := null;
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
  if p_row ? 'merchant' and pg_catalog.jsonb_typeof(p_row -> 'merchant') not in ('string', 'null') then
    reason := 'invalid_merchant'; return;
  end if;
  r_merchant := nullif(private.clean_text(p_row ->> 'merchant'), '');
  if char_length(r_merchant) > 200 then
    r_merchant := null;
    reason := 'invalid_merchant'; return;
  end if;
  if p_row ? 'bank_transaction_id' and pg_catalog.jsonb_typeof(p_row -> 'bank_transaction_id') not in ('string', 'null') then
    reason := 'invalid_bank_transaction_id'; return;
  end if;
  r_bank_id := nullif(private.clean_text(p_row ->> 'bank_transaction_id'), '');
  if char_length(r_bank_id) > 100 then
    r_bank_id := null;
    reason := 'invalid_bank_transaction_id'; return;
  end if;
  if p_row ? 'hint' and pg_catalog.jsonb_typeof(p_row -> 'hint') not in ('string', 'null') then
    reason := 'invalid_hint'; return;
  end if;
  r_hint := p_row ->> 'hint';
  if r_hint is not null and r_hint not in ('card_bill_payment', 'own_transfer', 'transfer_to_person', 'salary',
                                           'interest', 'fee', 'securities_purchase', 'cash_withdrawal', 'refund') then
    r_hint := null;
    reason := 'invalid_hint'; return;
  end if;
  -- the extra data (R-IMPORT-102): known keys, scalar values, bounded size; rebuilt
  if p_row ? 'details' and pg_catalog.jsonb_typeof(p_row -> 'details') <> 'null' then
    if pg_catalog.jsonb_typeof(p_row -> 'details') <> 'object'
       or pg_catalog.octet_length((p_row -> 'details')::text) > private.limit_import_details_bytes() then
      reason := 'invalid_details'; return;
    end if;
    r_details := '{}'::jsonb;
    for v_key, v_value in select * from pg_catalog.jsonb_each(p_row -> 'details') loop
      if v_key not in ('purchase_time', 'booking_date', 'value_date', 'card', 'original_currency', 'original_amount',
                       'exchange_rate', 'fee', 'merchant_category', 'security', 'location')
         or pg_catalog.jsonb_typeof(v_value) not in ('string', 'number') then
        r_details := null;
        reason := 'invalid_details'; return;
      end if;
      if pg_catalog.jsonb_typeof(v_value) = 'string' then
        v_text := private.clean_text(v_value #>> '{}');
        if v_text <> '' then
          r_details := r_details || pg_catalog.jsonb_build_object(v_key, v_text);
        end if;
      else
        r_details := r_details || pg_catalog.jsonb_build_object(v_key, v_value);
      end if;
    end loop;
    if r_details = '{}'::jsonb then
      r_details := null;
    end if;
  end if;
  -- the caller's choices (a member only)
  if p_row ?| array['action', 'kind', 'category_id'] then
    if p_by_token then
      reason := 'choice_not_allowed'; return;
    end if;
    if p_row ? 'action' and pg_catalog.jsonb_typeof(p_row -> 'action') not in ('string', 'null') then
      reason := 'invalid_action'; return;
    end if;
    r_action := p_row ->> 'action';
    if r_action is not null and r_action not in ('import', 'skip') then
      r_action := null;
      reason := 'invalid_action'; return;
    end if;
    if p_row ? 'kind' and (p_row ->> 'kind') is not null then
      if pg_catalog.jsonb_typeof(p_row -> 'kind') <> 'string'
         or (r_direction = 'debit' and (p_row ->> 'kind') <> 'expense')
         or (r_direction = 'credit' and (p_row ->> 'kind') not in ('refund', 'extra_income')) then
        reason := 'invalid_kind'; return;
      end if;
      r_kind := (p_row ->> 'kind')::public.transaction_kind;
    end if;
    if p_row ? 'category_id' and (p_row ->> 'category_id') is not null then
      if pg_catalog.jsonb_typeof(p_row -> 'category_id') <> 'string'
         or (p_row ->> 'category_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
         or r_kind = 'extra_income' then
        reason := 'invalid_category'; return;
      end if;
      r_category := (p_row ->> 'category_id')::uuid;
    end if;
  end if;
end;
$$;

-- F3 (R-IMPORT-250): what is kept of a row that was not imported: the known keys only, each
-- bounded like a valid row's (strings cut to their limits, details only within their bound),
-- unknown keys named (at most 20 names of at most 40 characters), never their values; a row
-- that is not an object is kept as its type. At most a few kilobytes, whatever was sent.
create function private.import_row_digest(p_row jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_out jsonb := '{}'::jsonb;
  v_key text;
  v_value jsonb;
  v_unknown text[] := '{}'::text[];
  v_max integer;
begin
  if p_row is null or pg_catalog.jsonb_typeof(p_row) <> 'object' then
    return pg_catalog.jsonb_build_object('not_an_object', coalesce(pg_catalog.jsonb_typeof(p_row), 'null'));
  end if;
  for v_key, v_value in select * from pg_catalog.jsonb_each(p_row) loop
    v_max := case v_key when 'date' then 10 when 'amount' then 20 when 'direction' then 10 when 'description' then 500
                        when 'merchant' then 200 when 'bank_transaction_id' then 100 when 'hint' then 30
                        when 'action' then 10 when 'kind' then 20 when 'category_id' then 36 end;
    if v_key = 'details' then
      if pg_catalog.jsonb_typeof(v_value) = 'object' and pg_catalog.octet_length(v_value::text) <= private.limit_import_details_bytes() then
        v_out := v_out || pg_catalog.jsonb_build_object(v_key, v_value);
      else
        v_out := v_out || pg_catalog.jsonb_build_object(v_key, 'too large or not an object');
      end if;
    elsif v_max is null then
      if pg_catalog.cardinality(v_unknown) < 20 then
        v_unknown := v_unknown || pg_catalog.left(v_key, 40);
      end if;
    elsif pg_catalog.jsonb_typeof(v_value) = 'string'
          or (pg_catalog.jsonb_typeof(v_value) = 'number' and char_length(v_value::text) > v_max) then
      v_out := v_out || pg_catalog.jsonb_build_object(v_key, pg_catalog.left(v_value #>> '{}', v_max));
    elsif pg_catalog.jsonb_typeof(v_value) in ('number', 'boolean', 'null') then
      v_out := v_out || pg_catalog.jsonb_build_object(v_key, v_value);
    else
      v_out := v_out || pg_catalog.jsonb_build_object(v_key, pg_catalog.jsonb_typeof(v_value));
    end if;
  end loop;
  if pg_catalog.cardinality(v_unknown) > 0 then
    v_out := v_out || pg_catalog.jsonb_build_object('unknown_keys', pg_catalog.to_jsonb(v_unknown));
  end if;
  return v_out;
end;
$$;

-- F8, F1: the rows argument: an array of 1 to 500 rows, at most 2 MB in all (before any row
-- is read, before anything of the budget).
create function private.assert_import_rows(p_rows jsonb)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_rows is null or pg_catalog.jsonb_typeof(p_rows) <> 'array'
     or pg_catalog.jsonb_array_length(p_rows) not between 1 and private.limit_import_rows_per_call()
     or pg_catalog.octet_length(p_rows::text) > private.limit_import_call_bytes() then
    raise exception 'invalid_rows' using errcode = 'P0001';
  end if;
end;
$$;

-- F9 (D-377): a credit of exactly a planned income, within five days either side of
-- a period start: the start of the row's own period (on or after it), or the start of the next
-- period (before it; projected when that period does not exist yet), the income's amount in
-- force in that period.
create function private.import_salary(p_budget_id uuid, p_seq integer, p_date date, p_amount bigint,
                                      out income_id uuid, out income_amount bigint)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_period public.periods;
  v_next date;
  v_target integer;
begin
  select p.* into v_period from public.periods as p where p.budget_id = p_budget_id and p.seq = p_seq;
  if p_date - v_period.start_date <= 5 then
    v_target := p_seq;
  else
    v_next := coalesce((select p.start_date from public.periods as p where p.budget_id = p_budget_id and p.seq = p_seq + 1),
                       v_period.end_date + 1);
    if v_next - p_date between 1 and 5 then
      v_target := p_seq + 1;
    end if;
  end if;
  if v_target is null then
    return;
  end if;
  select i.id, v.amount into income_id, income_amount
  from public.incomes as i
  cross join lateral (select iv.amount from public.income_versions as iv
                      where iv.income_id = i.id and iv.effective_from_seq <= v_target
                      order by iv.effective_from_seq desc limit 1) as v
  where i.budget_id = p_budget_id and i.first_seq <= v_target and (i.end_seq is null or v_target < i.end_seq)
    and v.amount = p_amount
  order by i.created_at, i.id limit 1;
end;
$$;

-- R-IMPORT-001 to R-IMPORT-003, R-IMPORT-070 to R-IMPORT-073, R-IMPORT-079, R-IMPORT-091 to
-- R-IMPORT-094, R-IMPORT-200 to R-IMPORT-206, R-IMPORT-251, R-IMPORT-252, D-310, D-311, D-314,
-- D-372, D-373: what importing p_rows into the budget does, row by row, without writing
-- anything. Each existing transaction absorbs at most one row of the batch (as its duplicate
-- or its match), counted over the whole batch: what its earlier chunks absorbed is remembered
-- (private.import_absorbed). The batch's own transactions are never compared (rows of one
-- import are never duplicates of each other). Duplicates first, in row order (the same bank
-- id, else the same date, amount and description, now or as first imported); then possible
-- matches, the nearest date first (ties: the row first, a charge first). Q-270 (D-455): a
-- staged preview passes what the statement's earlier parts absorb (p_absorbed) and the choices
-- they remember (p_choices: {"<flag> <key>": "import" | "skip"}), as their writes would.
create function private.import_plan(p_budget_id uuid, p_batch_id uuid, p_rows jsonb, p_by_token boolean,
                                    p_absorbed uuid[] default null, p_choices jsonb default null)
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
  v_used uuid[] := '{}'::uuid[];
  v_to_categorise uuid;
  v_hint_flag text;
  v_plan public.import_row_result[] := '{}'::public.import_row_result[];
  v_bank text[] := '{}'::text[];
  v_choice text[] := '{}'::text[];
  v_default text[] := '{}'::text[];
  v_dup uuid;
  v_taken integer[] := '{}'::integer[];
  m record;
begin
  perform private.assert_import_rows(p_rows);
  select c.id into v_to_categorise from public.categories as c
  where c.budget_id = p_budget_id and c.is_to_categorise and c.end_seq is null;
  if p_batch_id is not null then
    select coalesce(pg_catalog.array_agg(a.transaction_id), '{}') into v_used
    from private.import_absorbed as a where a.batch_id = p_batch_id;
  end if;
  v_used := v_used || coalesce(p_absorbed, '{}'::uuid[]);

  -- 1. each row on its own: shape, period, flag, kind, category
  for v_row, v_no in select e.value, e.ordinality::integer from pg_catalog.jsonb_array_elements(p_rows) with ordinality as e loop
    r := null;
    r.row_no := v_no;
    r.valid := true;
    s := private.import_row_shape(v_row, p_by_token);
    r.date := s.r_date; r.amount := s.r_amount; r.direction := s.r_direction; r.description := s.r_description;
    r.reason := s.reason;
    if r.reason is null then
      r.merchant_key := private.merchant_key(s.r_merchant, s.r_description);
      begin
        v_seq := private.transaction_period_seq(p_budget_id, s.r_date);
      exception when sqlstate 'P0001' then
        r.reason := sqlerrm;
      end;
    end if;
    if r.reason is null then
      v_hint_flag := case when s.r_hint in ('card_bill_payment', 'own_transfer', 'transfer_to_person') then s.r_hint end;
      if s.r_direction = 'credit' then
        select x.income_id, x.income_amount into r.salary_income_id, r.salary_income_amount
        from private.import_salary(p_budget_id, v_seq, s.r_date, s.r_amount) as x;
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
      if r.flag in ('card_bill_payment', 'own_transfer', 'transfer_to_person') then
        r.choice_key := coalesce(r.merchant_key, case when r.flag = 'own_transfer' then 'own_transfer' end);
      end if;
      if r.choice_key is not null then
        r.remembered_choice := p_choices ->> (r.flag || ' ' || r.choice_key);
        if r.remembered_choice is null then
          select c.choice into r.remembered_choice from public.import_choices as c
          where c.budget_id = p_budget_id and c.flag = r.flag and c.counterparty_key = r.choice_key;
        end if;
      end if;
      r.kind := coalesce(s.r_kind, case when s.r_direction = 'debit' then 'expense'
                                        when r.flag = 'salary' then 'extra_income' else 'refund' end::public.transaction_kind);
      if r.kind <> 'extra_income' then
        if s.r_category is not null then
          begin
            perform private.assert_transaction_category(p_budget_id, r.kind, s.r_category, v_seq);
            if exists (select 1 from public.categories as c where c.id = s.r_category and c.is_to_categorise) then
              raise exception 'category_to_categorise' using errcode = 'P0001';
            end if;
            r.category_id := s.r_category;
            r.category_source := 'choice';
          exception when sqlstate 'P0001' then
            r.reason := sqlerrm;
          end;
        else
          select m2.id, m2.category_id into r.rule_id, r.category_id
          from public.merchant_rules as m2
          join public.categories as c on c.id = m2.category_id
          where m2.budget_id = p_budget_id and r.merchant_key is not null
            and pg_catalog.strpos(r.merchant_key, m2.fragment) > 0
            and not c.is_group and c.first_seq <= v_seq and (c.end_seq is null or v_seq < c.end_seq)
          order by char_length(m2.fragment) desc, m2.created_at, m2.id
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
    end if;
    v_plan := v_plan || r;
    v_bank := v_bank || s.r_bank_id;
    v_choice := v_choice || s.r_action;
    v_default := v_default || case
      when r.flag in ('card_bill_payment', 'own_transfer') then coalesce(r.remembered_choice, 'skip')
      when r.flag = 'transfer_to_person' then coalesce(r.remembered_choice, 'import')
      when r.flag = 'salary' then 'skip'
      else 'import' end;
  end loop;

  -- 2. duplicates (R-IMPORT-070, R-IMPORT-071, D-372), in row order
  for i in 1 .. pg_catalog.cardinality(v_plan) loop
    r := v_plan[i];
    continue when not r.valid;
    v_dup := null;
    if v_bank[i] is not null then
      select t.id into v_dup from public.transactions as t
      where t.budget_id = p_budget_id and t.bank_transaction_id = v_bank[i] and t.kind = r.kind
        and (p_batch_id is null or t.import_batch_id is distinct from p_batch_id) and t.id <> all (v_used)
      order by t.created_at, t.id limit 1;
    end if;
    if v_dup is null then
      -- M-3 (R-IMPORT-343): two index lookups, as the transaction is now (transactions_match_idx)
      -- and as first imported (transactions_import_original_idx: only imports have those values)
      select x.id into v_dup from (
        (select t.id, t.created_at from public.transactions as t
         where t.budget_id = p_budget_id and t.kind = r.kind and t.amount = r.amount and t.date = r.date
           and coalesce(t.description, '') = coalesce(r.description, '')
           and (p_batch_id is null or t.import_batch_id is distinct from p_batch_id) and t.id <> all (v_used)
         order by t.created_at, t.id limit 1)
        union all
        (select t.id, t.created_at from public.transactions as t
         where t.budget_id = p_budget_id and t.import_batch_id is not null
           and t.import_amount = r.amount and t.import_date = r.date and t.kind = r.kind
           and coalesce(t.import_description, '') = coalesce(r.description, '')
           and (p_batch_id is null or t.import_batch_id <> p_batch_id) and t.id <> all (v_used)
         order by t.created_at, t.id limit 1)) as x
      order by x.created_at, x.id limit 1;
    end if;
    r.duplicate_of := v_dup;
    if v_choice[i] = 'skip' then
      r.action := 'skip_chosen';
    elsif v_choice[i] = 'import' then
      r.action := 'import';
    elsif v_dup is not null then
      r.action := 'skip_duplicate';
      v_used := v_used || v_dup;
    elsif v_default[i] = 'skip' then
      r.action := 'skip_flagged';
    end if;
    v_plan[i] := r;
  end loop;

  -- 3. possible matches (R-IMPORT-203, D-373): not imported, same kind and amount,
  -- within three days either way; each transaction to the row nearest in date
  for m in
    select x.i, t.id as tx, t.review_state = 'awaiting_confirmation' as is_charge
    from unnest(v_plan) with ordinality as x (row_no, valid, reason, action, kind, category_id, category_source, rule_id,
                                              date, amount, direction, description, merchant_key, flag, remembered_choice,
                                              duplicate_of, match_of, match_is_charge, salary_income_id, salary_income_amount,
                                              transaction_id, chunk, choice_key, i)
    join public.transactions as t
      on t.budget_id = p_budget_id and t.kind = x.kind and t.amount = x.amount
     and t.date between x.date - 3 and x.date + 3 and t.import_batch_id is null
    where x.valid and x.action is null and t.id <> all (v_used)
    order by abs(t.date - x.date), x.i, (t.review_state = 'awaiting_confirmation') desc, t.created_at, t.id
  loop
    continue when m.i = any (v_taken) or m.tx = any (v_used);
    r := v_plan[m.i];
    r.match_of := m.tx;
    r.match_is_charge := m.is_charge;
    r.action := case when m.is_charge and not p_by_token then 'confirm_match' else 'skip_matched' end;
    v_plan[m.i] := r;
    v_taken := v_taken || m.i;
    v_used := v_used || m.tx;
  end loop;

  for i in 1 .. pg_catalog.cardinality(v_plan) loop
    r := v_plan[i];
    if r.action is null then
      r.action := 'import';
    end if;
    return next r;
  end loop;
end;
$$;

-- R-IMPORT-001, R-IMPORT-004, R-IMPORT-080, D-310: do what the plan says. Under the budget
-- lock, caught up, the batch checked. All or nothing: refused before anything is written when
-- the budget has no room (a member is told how many would fit; a token is refused whenever the
-- budget has room for fewer than a token call's maximum rows, whatever it sent, D-451).
-- Returns the plan rows with the transactions created.
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
  v_user uuid := case when p_by_token then null else (select auth.uid()) end;
begin
  select pg_catalog.count(*)::integer into v_needed from unnest(p_plan) as x where x.action = 'import';
  v_room := private.transaction_room(p_budget_id);
  -- (a token was refused before planning when the room is under its rows per call, D-451, so
  -- what it sends always fits here)
  if v_needed > v_room then
    raise exception 'transaction_limit_reached' using errcode = 'P0001',
      detail = pg_catalog.json_build_object('fits', greatest(v_room, 0))::text;
  end if;
  -- the "to categorise" category, created at the first import that needs it (D-375)
  if exists (select 1 from unnest(p_plan) as x where x.action = 'import' and x.kind <> 'extra_income' and x.category_id is null) then
    select c.id into v_to_categorise from public.categories as c
    where c.budget_id = p_budget_id and c.is_to_categorise and c.end_seq is null;
    if v_to_categorise is null then
      -- an ended one (emptied, then removed) gives its place up
      update public.categories set is_to_categorise = false where budget_id = p_budget_id and is_to_categorise;
      -- created even at the category limits (it does not count towards them, D-375), within
      -- the 900-row bound
      if (select pg_catalog.count(*) from public.categories as c where c.budget_id = p_budget_id) + 1 > private.limit_rows_per_kind() then
        raise exception 'category_limit_reached' using errcode = 'P0001';
      end if;
      select pg_catalog.min(p.seq) into v_first from public.periods as p where p.budget_id = p_budget_id;
      insert into public.categories (budget_id, name, sort_order, first_seq, is_to_categorise)
      values (p_budget_id, coalesce(p_to_categorise_name, 'To categorise'),
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
    r.chunk := nullif(p_chunk, 0);
    s := private.import_row_shape(v_row, p_by_token);
    if r.action = 'import' then
      if r.kind <> 'extra_income' and r.category_id is null then
        r.category_id := v_to_categorise;
      end if;
      insert into public.transactions (budget_id, kind, amount, date, category_id, description, recorded_by, review_state,
                                       import_batch_id, bank_transaction_id, merchant, merchant_key, details,
                                       import_amount, import_date, import_description)
      values (p_budget_id, r.kind, r.amount, r.date, r.category_id, r.description, v_user, 'to_review',
              p_batch_id, s.r_bank_id, s.r_merchant, r.merchant_key, s.r_details,
              r.amount, r.date, r.description)
      returning id into r.transaction_id;
    else
      if r.action = 'confirm_match' then
        update public.transactions set review_state = 'confirmed'
        where id = r.match_of and review_state = 'awaiting_confirmation';
      end if;
      -- F4: what this row absorbed is the batch's from now on
      if r.action in ('skip_duplicate', 'skip_matched', 'confirm_match') then
        insert into private.import_absorbed (batch_id, transaction_id)
        values (p_batch_id, coalesce(r.duplicate_of, r.match_of))
        on conflict do nothing;
      end if;
      if p_chunk > 0 then
        insert into public.import_skipped_rows (budget_id, batch_id, chunk, row_no, reason, detail, duplicate_of, match_of, row_data)
        values (p_budget_id, p_batch_id, p_chunk, r.row_no,
                case r.action when 'skip_duplicate' then 'duplicate' when 'skip_flagged' then 'flagged'
                              when 'skip_matched' then 'matched' when 'confirm_match' then 'matched'
                              when 'skip_chosen' then 'chosen' else 'invalid' end,
                case when r.action = 'invalid' then r.reason when r.action in ('skip_flagged', 'skip_chosen') then r.flag end,
                r.duplicate_of, r.match_of,
                -- should-fix 4 (R-IMPORT-344): a valid row is kept as the preview showed it
                -- (cleaned), so importing it anyway imports that row; an invalid one bounded
                case when r.action = 'invalid' then private.import_row_digest(v_row)
                     else pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
                       'date', s.r_date, 'amount', s.r_amount, 'direction', s.r_direction, 'description', s.r_description,
                       'merchant', s.r_merchant, 'bank_transaction_id', s.r_bank_id, 'hint', s.r_hint, 'details', s.r_details,
                       'action', s.r_action, 'kind', s.r_kind, 'category_id', s.r_category)) end)
        on conflict (batch_id, chunk, row_no) do nothing;
      end if;
    end if;
    -- R-IMPORT-092, D-314, Q-276 (D-456): a member's own choice for a flagged entry is
    -- remembered (an action sent with the row), never a default the import applied
    if not p_by_token and r.choice_key is not null and (v_row ->> 'action') is not null
       and r.action in ('import', 'skip_chosen') then
      insert into public.import_choices (budget_id, flag, counterparty_key, choice, updated_by)
      values (p_budget_id, r.flag, r.choice_key, case when r.action = 'import' then 'import' else 'skip' end, v_user)
      on conflict (budget_id, flag, counterparty_key) do update
        set choice = excluded.choice, updated_by = excluded.updated_by, updated_at = now();
    end if;
    return next r;
  end loop;
  -- F14: at most so many remembered choices; the least recently used go
  delete from public.import_choices as c
  where c.budget_id = p_budget_id
    and (c.flag, c.counterparty_key) in (select k.flag, k.counterparty_key from public.import_choices as k
                                         where k.budget_id = p_budget_id
                                         order by k.updated_at desc, k.flag, k.counterparty_key
                                         offset private.limit_import_choices());
end;
$$;

-- F1, F8: every argument of an import call, checked before anything of the budget.
create function private.assert_import_args(p_batch_id uuid, p_chunk integer, p_rows jsonb, p_source text,
                                           p_from date, p_to date)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_batch_id is null then
    raise exception 'invalid_batch' using errcode = 'P0001';
  end if;
  if p_chunk is null or p_chunk not between 1 and private.limit_import_chunks() then
    raise exception 'invalid_chunk' using errcode = 'P0001';
  end if;
  if p_source is null or p_source not in ('csv', 'migros_account', 'migros_card', 'yuh', 'script', 'other') then
    raise exception 'invalid_source' using errcode = 'P0001';
  end if;
  if (p_from is not null and not private.is_sane_date(p_from)) or (p_to is not null and not private.is_sane_date(p_to))
     or p_from > p_to then
    raise exception 'invalid_date' using errcode = 'P0001';
  end if;
  perform private.assert_import_rows(p_rows);
end;
$$;

-- D-452 (R-IMPORT-341), R-IMPORT-420: add what an import write uses to the budget's rolling 24
-- hours (rows submitted, new batches, tokens created; a token call's rows and batches also as
-- the tokens' own) when it stays within the limits, and answer null; otherwise add nothing and
-- answer the limit it would pass ('rows_per_day', 'token_rows_per_day', 'imports_per_day',
-- 'token_imports_per_day', 'tokens_per_day'). Members and tokens have separate allowances of
-- new batches, and tokens at most part of the rows, so a token never locks the members out. A
-- minute counts while it is at most 24 hours before the current minute. Under the budget lock.
create function private.import_use(p_budget_id uuid, p_rows integer, p_batches integer, p_tokens integer,
                                   p_by_token boolean default false)
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_minute timestamptz := pg_catalog.date_trunc('minute', pg_catalog.clock_timestamp());
  v_used record;
  v_token integer := case when p_by_token then 1 else 0 end;
begin
  delete from private.import_budget_usage as u where u.budget_id = p_budget_id and u.minute < v_minute - interval '24 hours';
  select coalesce(pg_catalog.sum(u.rows), 0) as rows, coalesce(pg_catalog.sum(u.batches), 0) as batches,
         coalesce(pg_catalog.sum(u.tokens), 0) as tokens, coalesce(pg_catalog.sum(u.token_rows), 0) as token_rows,
         coalesce(pg_catalog.sum(u.token_batches), 0) as token_batches
  into v_used
  from private.import_budget_usage as u where u.budget_id = p_budget_id and u.minute >= v_minute - interval '24 hours';
  if v_used.rows + p_rows > private.limit_import_rows_per_day() then
    return 'rows_per_day';
  elsif p_by_token and v_used.token_rows + p_rows > private.limit_import_token_rows_per_day() then
    return 'token_rows_per_day';
  elsif p_by_token and v_used.token_batches + p_batches > private.limit_import_token_batches_per_day() then
    return 'token_imports_per_day';
  elsif not p_by_token and v_used.batches - v_used.token_batches + p_batches > private.limit_import_batches_per_day() then
    return 'imports_per_day';
  elsif v_used.tokens + p_tokens > private.limit_import_tokens_per_day() then
    return 'tokens_per_day';
  end if;
  insert into private.import_budget_usage (budget_id, minute, rows, batches, tokens, token_rows, token_batches)
  values (p_budget_id, v_minute, p_rows, p_batches, p_tokens, v_token * p_rows, v_token * p_batches)
  on conflict (budget_id, minute) do update set rows = private.import_budget_usage.rows + excluded.rows,
    batches = private.import_budget_usage.batches + excluded.batches, tokens = private.import_budget_usage.tokens + excluded.tokens,
    token_rows = private.import_budget_usage.token_rows + excluded.token_rows,
    token_batches = private.import_budget_usage.token_batches + excluded.token_batches;
  return null;
end;
$$;

-- R-IMPORT-420: the refusal of an import write at a limit of the budget's storage; its detail
-- names the limit (JSON text {"limit": "..."}), so a screen can say which one and when it frees.
create function private.raise_import_limit(p_limit text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'import_limit_reached' using errcode = 'P0001',
    detail = pg_catalog.json_build_object('limit', p_limit)::text;
end;
$$;

-- Lock the budget, catch up (one step, catching_up otherwise), and check or create the batch.
-- Its arguments were checked before (private.assert_import_args). A new batch counts toward the
-- budget's batches of the day and kept (D-452: at the limit kept, the oldest batches that hold
-- nothing any more go first; import_limit_reached when none can). A token adds only to a batch
-- it created itself: any other batch id that exists answers import_batch_conflict, like another
-- budget's (should-fix 7, R-SECURITY-343).
create function private.import_open_batch(p_budget_id uuid, p_batch_id uuid, p_source text,
                                          p_from date, p_to date, p_token public.import_tokens)
returns public.import_batches
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_batch public.import_batches;
begin
  perform private.lock_and_catch_up(p_budget_id);
  -- a token revoked (or its creator gone) while this call waited for the lock is refused
  if p_token.id is not null and private.token_by_id(p_token.id) is null then
    raise exception 'invalid_token' using errcode = 'P0001';
  end if;
  select b.* into v_batch from public.import_batches as b where b.id = p_batch_id;
  if v_batch.id is null then
    if (select pg_catalog.count(*) from public.import_batches as b where b.budget_id = p_budget_id) >= private.limit_import_batches_kept() then
      delete from public.import_batches as b
      where b.id in (select x.id from public.import_batches as x
                     where x.budget_id = p_budget_id
                       and not exists (select 1 from public.transactions as t where t.import_batch_id = x.id)
                       and not exists (select 1 from public.import_skipped_rows as k where k.batch_id = x.id)
                     order by x.created_at, x.id limit 10);
      if (select pg_catalog.count(*) from public.import_batches as b where b.budget_id = p_budget_id) >= private.limit_import_batches_kept() then
        perform private.raise_import_limit('imports_kept');
      end if;
    end if;
    perform private.raise_import_limit(v_limit)
    from (select private.import_use(p_budget_id, 0, 1, 0, p_token.id is not null) as v_limit) as u
    where u.v_limit is not null;
    -- F8: two budgets racing for one new batch id get a clean answer (no unique violation)
    insert into public.import_batches (id, budget_id, source, statement_from, statement_to, created_by, token_id, token_name)
    values (p_batch_id, p_budget_id, p_source, p_from, p_to,
            case when p_token.id is null then (select auth.uid()) end, p_token.id, p_token.name)
    on conflict (id) do nothing;
    select b.* into v_batch from public.import_batches as b where b.id = p_batch_id;
  end if;
  if v_batch.budget_id <> p_budget_id or (p_token.id is not null and v_batch.token_id is distinct from p_token.id) then
    raise exception 'import_batch_conflict' using errcode = 'P0001';
  elsif v_batch.undone_at is not null then
    raise exception 'batch_undone' using errcode = 'P0001';
  end if;
  return v_batch;
end;
$$;

-- The write behind both entries: plan, apply, count, record the chunk's answer. D-452: the rows
-- count toward the budget's rows of the day (import_limit_reached); then the budget keeps its
-- newest skipped rows and chunk answers only. D-451: a token is refused before any planning
-- when the budget has room for fewer than a token call's maximum rows.
create function private.import_chunk(p_budget_id uuid, p_batch_id uuid, p_chunk integer, p_rows jsonb, p_source text,
                                     p_from date, p_to date, p_to_categorise_name text, p_token public.import_tokens)
returns setof public.import_row_result
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_done private.import_chunks;
  v_plan public.import_row_result[];
  v_result public.import_row_result[];
  v_by_token boolean := p_token.id is not null;
begin
  perform private.import_open_batch(p_budget_id, p_batch_id, p_source, p_from, p_to, p_token);
  -- idempotent: a chunk already recorded answers what it answered then, records nothing; once
  -- its answer is forgotten (D-452), chunk_expired (it is never imported twice)
  select c.* into v_done from private.import_chunks as c where c.batch_id = p_batch_id and c.chunk = p_chunk;
  if v_done.batch_id is not null then
    if v_done.result is null then
      raise exception 'chunk_expired' using errcode = 'P0001';
    end if;
    return query select * from pg_catalog.jsonb_populate_recordset(null::public.import_row_result, v_done.result);
    return;
  end if;
  if v_by_token and private.transaction_room(p_budget_id) < private.limit_token_rows_per_call() then
    raise exception 'transaction_limit_reached' using errcode = 'P0001';
  end if;
  perform private.raise_import_limit(u.v_limit)
  from (select private.import_use(p_budget_id, pg_catalog.jsonb_array_length(p_rows), 0, 0, v_by_token) as v_limit) as u
  where u.v_limit is not null;
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
  insert into private.import_chunks (batch_id, budget_id, chunk, result, created_at)
  values (p_batch_id, p_budget_id, p_chunk, pg_catalog.to_jsonb(v_result), pg_catalog.clock_timestamp());
  -- Q-290 (D-522): the part staged for this chunk is written now, no longer staged
  delete from private.import_preview_parts as x where x.batch_id = p_batch_id and x.part = p_chunk;
  -- D-452: the newest skipped rows and chunk answers are kept
  delete from public.import_skipped_rows as k
  where k.id in (select x.id from public.import_skipped_rows as x where x.budget_id = p_budget_id
                 order by x.created_at desc, x.id desc offset private.limit_import_skipped_kept());
  update private.import_chunks as c set result = null
  where c.budget_id = p_budget_id and c.result is not null
    and (c.created_at < now() - interval '7 days'
         or (c.batch_id, c.chunk) in (select x.batch_id, x.chunk from private.import_chunks as x
                                      where x.budget_id = p_budget_id and x.result is not null
                                      order by x.created_at desc, x.batch_id, x.chunk desc
                                      offset private.limit_import_answers_kept()));
  return query select * from unnest(v_result);
end;
$$;

-- ===========================================================================
-- RPCs: import by a member (R-IMPORT-001 to R-IMPORT-004, R-IMPORT-200 to R-IMPORT-206)
-- ===========================================================================

-- What import_transactions with the same rows would do now, row by row; changes nothing
-- (one catch-up step, like every read). p_batch_id: the batch the rows will be sent in (its
-- earlier chunks are not compared with them, and what they absorbed counts); null: a batch not
-- yet started, with the same answer as its first chunk (F6). Members. Errors: budget_not_found,
-- invalid_rows, catching_up.
create function public.preview_import(p_budget_id uuid, p_batch_id uuid, p_rows jsonb)
returns setof public.import_row_result
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.assert_member(p_budget_id);
  perform private.assert_import_rows(p_rows);
  perform private.read_catch_up(p_budget_id);
  return query select * from private.import_plan(p_budget_id, p_batch_id, p_rows, false);
end;
$$;

-- Q-274 (D-455): the totals of planned rows: how many rows, how many of each action, and of
-- the rows to import, how many and how much of each kind (rappen).
create function private.import_totals(p_plan public.import_row_result[])
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'rows', pg_catalog.count(*),
    'import', pg_catalog.count(*) filter (where x.action = 'import'),
    'skip_duplicate', pg_catalog.count(*) filter (where x.action = 'skip_duplicate'),
    'skip_flagged', pg_catalog.count(*) filter (where x.action = 'skip_flagged'),
    'skip_matched', pg_catalog.count(*) filter (where x.action = 'skip_matched'),
    'confirm_match', pg_catalog.count(*) filter (where x.action = 'confirm_match'),
    'skip_chosen', pg_catalog.count(*) filter (where x.action = 'skip_chosen'),
    'invalid', pg_catalog.count(*) filter (where x.action = 'invalid'),
    'expense_count', pg_catalog.count(*) filter (where x.action = 'import' and x.kind = 'expense'),
    'expense_amount', coalesce(pg_catalog.sum(x.amount) filter (where x.action = 'import' and x.kind = 'expense'), 0),
    'refund_count', pg_catalog.count(*) filter (where x.action = 'import' and x.kind = 'refund'),
    'refund_amount', coalesce(pg_catalog.sum(x.amount) filter (where x.action = 'import' and x.kind = 'refund'), 0),
    'extra_income_count', pg_catalog.count(*) filter (where x.action = 'import' and x.kind = 'extra_income'),
    'extra_income_amount', coalesce(pg_catalog.sum(x.amount) filter (where x.action = 'import' and x.kind = 'extra_income'), 0))
  from unnest(p_plan) as x
$$;

-- Q-270, Q-274 (D-455, R-IMPORT-340): preview a statement in parts before any part is written.
-- Part p_part (1 to 100) of the batch p_batch_id answers what import_transactions will do with
-- the same rows as chunk p_part once chunks 1 to p_part - 1 are written with the rows previewed
-- as parts 1 to p_part - 1 (absent changes by others): what those parts absorb (duplicates,
-- matches) and the choices they remember are taken into account, as are the chunks of the
-- batch already written. Previewing a part again forgets the staged parts from it on; send the
-- parts in order. Staged parts are kept a day, at most 100 a budget. Answer (one JSON object):
-- rows (the rows, as preview_import gives them), part (this part's totals), statement (the
-- totals of the staged parts 1 to p_part), parts (the part numbers they cover), room (how many
-- transactions the budget can still take), fits (whether the statement's rows to import fit).
-- A row going to a "to categorise" category that does not exist yet has category_id null in the
-- preview and the new category's id in the write. D-522 (answers Q-290): a part already written
-- as its chunk answers what that chunk recorded (its rows and its totals, written true), stages
-- nothing and forgets no later part; a staged part is no longer staged once written, so the
-- statement covers the parts staged and not yet written (written false on a planned part).
-- Members. Errors: budget_not_found, invalid_batch, invalid_chunk, invalid_rows,
-- import_batch_conflict, batch_undone, chunk_expired, catching_up.
create function public.preview_import_part(p_budget_id uuid, p_batch_id uuid, p_part integer, p_rows jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_batch public.import_batches;
  v_absorbed uuid[];
  v_choices jsonb := '{}'::jsonb;
  v_prev jsonb;
  v_plan public.import_row_result[];
  v_totals jsonb;
  v_statement jsonb;
  v_parts integer[];
  v_room integer;
  v_written private.import_chunks;
begin
  perform private.assert_member(p_budget_id);
  if p_batch_id is null then
    raise exception 'invalid_batch' using errcode = 'P0001';
  end if;
  if p_part is null or p_part not between 1 and private.limit_import_chunks() then
    raise exception 'invalid_chunk' using errcode = 'P0001';
  end if;
  perform private.assert_import_rows(p_rows);
  perform private.read_catch_up(p_budget_id);
  perform private.lock_budget(p_budget_id);
  select b.* into v_batch from public.import_batches as b where b.id = p_batch_id;
  if (v_batch.id is not null and v_batch.budget_id <> p_budget_id)
     or exists (select 1 from private.import_preview_parts as x where x.batch_id = p_batch_id and x.budget_id <> p_budget_id) then
    raise exception 'import_batch_conflict' using errcode = 'P0001';
  elsif v_batch.undone_at is not null then
    raise exception 'batch_undone' using errcode = 'P0001';
  end if;
  select c.* into v_written from private.import_chunks as c where c.batch_id = p_batch_id and c.chunk = p_part;
  if v_written.batch_id is not null and v_written.budget_id = p_budget_id then
    -- Q-290 (D-522): what the write recorded for this part, as it answered then
    if v_written.result is null then
      raise exception 'chunk_expired' using errcode = 'P0001';
    end if;
    select pg_catalog.array_agg(r order by r.row_no) into v_plan
    from pg_catalog.jsonb_populate_recordset(null::public.import_row_result, v_written.result) as r;
    v_totals := private.import_totals(v_plan);
    delete from private.import_preview_parts as x
    where x.budget_id = p_budget_id and x.created_at < now() - interval '1 day';
  else
  delete from private.import_preview_parts as x
  where x.budget_id = p_budget_id and (x.created_at < now() - interval '1 day' or (x.batch_id = p_batch_id and x.part >= p_part));
  select coalesce(pg_catalog.array_agg(u.id), '{}') into v_absorbed
  from private.import_preview_parts as x cross join lateral unnest(x.absorbed) as u (id)
  where x.batch_id = p_batch_id and x.part < p_part;
  for v_prev in select x.choices from private.import_preview_parts as x where x.batch_id = p_batch_id and x.part < p_part order by x.part loop
    v_choices := v_choices || v_prev;
  end loop;
  select pg_catalog.array_agg(p order by p.row_no) into v_plan
  from private.import_plan(p_budget_id, p_batch_id, p_rows, false, v_absorbed, v_choices) as p;
  v_totals := private.import_totals(v_plan);
  insert into private.import_preview_parts (batch_id, budget_id, part, absorbed, choices, totals)
  select p_batch_id, p_budget_id, p_part,
    coalesce((select pg_catalog.array_agg(coalesce(x.duplicate_of, x.match_of)) from unnest(v_plan) as x
              where x.action in ('skip_duplicate', 'skip_matched', 'confirm_match')), '{}'),
    coalesce((select pg_catalog.jsonb_object_agg(x.flag || ' ' || x.choice_key, case when x.action = 'import' then 'import' else 'skip' end
                                                 order by x.row_no)
              from unnest(v_plan) as x
              where x.choice_key is not null and x.action in ('import', 'skip_chosen')
                and (p_rows -> (x.row_no - 1) ->> 'action') is not null), '{}'),
    v_totals;
  delete from private.import_preview_parts as x
  where (x.batch_id, x.part) in (select y.batch_id, y.part from private.import_preview_parts as y where y.budget_id = p_budget_id
                                 order by y.created_at desc, y.batch_id, y.part desc offset private.limit_import_preview_parts_kept());
  end if;
  select pg_catalog.jsonb_object_agg(t.key, t.total), pg_catalog.array_agg(distinct t.part)
  into v_statement, v_parts
  from (select e.key, pg_catalog.sum(e.value::bigint) over (partition by e.key) as total, x.part
        from private.import_preview_parts as x cross join lateral pg_catalog.jsonb_each_text(x.totals) as e
        where x.batch_id = p_batch_id and x.part <= p_part) as t;
  v_room := private.transaction_room(p_budget_id);
  return pg_catalog.jsonb_build_object(
    'rows', (select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) order by x.row_no) from unnest(v_plan) as x),
    'part', v_totals, 'statement', v_statement, 'parts', pg_catalog.to_jsonb(v_parts),
    'room', greatest(v_room, 0), 'fits', coalesce((v_statement ->> 'import')::bigint, 0) <= v_room,
    'written', v_written.batch_id is not null);
end;
$$;

-- Import one chunk (1 to 100) of a batch (the caller's id) of at most 500 rows, exactly as
-- preview_import says for the same rows. The first chunk creates the batch with its source
-- and statement range; a chunk sent again answers what it answered the first time and records
-- nothing (D-310). Every argument is checked first (F1). Members. Errors: budget_not_found,
-- invalid_batch, invalid_chunk, invalid_source, invalid_date (the statement range),
-- invalid_rows, invalid_name (p_to_categorise_name), import_batch_conflict, batch_undone,
-- transaction_limit_reached (detail: {"fits": n}), category_limit_reached, catching_up.
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
declare
  v_name text;
begin
  perform private.assert_member(p_budget_id);
  perform private.assert_import_args(p_batch_id, p_chunk, p_rows, p_source, p_statement_from, p_statement_to);
  if p_to_categorise_name is not null then
    v_name := private.clean_name(p_to_categorise_name);
  end if;
  return query select * from private.import_chunk(p_budget_id, p_batch_id, p_chunk, p_rows, p_source,
                                                  p_statement_from, p_statement_to, v_name, null::public.import_tokens);
end;
$$;

-- R-IMPORT-073, R-IMPORT-204, F15: import skipped rows of a batch anyway (all of them by
-- default, at most 500 a call): each is planned again now with the action "import" (duplicates
-- and matches no longer matter), through the same code; rows no longer valid stay skipped.
-- Answers each row with its own chunk and row_no. The batch's counts move from the row's
-- reason to imported (once per row: a row imported anyway whose transaction was deleted since
-- can be imported anyway again, without counting it twice). D-523 (answers Q-291): each id sent
-- that is no longer a kept skipped row of the batch (the oldest go, D-452) answers one row of
-- action 'not_kept' (reason 'not_kept', valid false, the other fields null), after the rows
-- imported. Members. Errors: import_batch_not_found, batch_undone, transaction_limit_reached,
-- catching_up.
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
  k public.import_skipped_rows;
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
  from (select s.* from public.import_skipped_rows as s
        where s.batch_id = p_batch_id and s.reason <> 'invalid' and s.imported_transaction_id is null
          and (p_skipped_row_ids is null or s.id = any (p_skipped_row_ids))
        order by s.chunk, s.row_no
        limit private.limit_import_rows_per_call()) as x;
  -- D-523: the ids sent that are no longer kept, answered after the rows (none when all are)
  if v_ids is null then
    return query select * from private.import_not_kept_rows(p_batch_id, p_skipped_row_ids);
    return;
  end if;
  -- the original choices (a kind, a category) of a row are dropped: the member's review decides
  select pg_catalog.array_agg(p order by p.row_no) into v_plan from private.import_plan(v_batch.budget_id, p_batch_id, v_rows, false) as p;
  for r in select * from private.import_apply(v_batch.budget_id, p_batch_id, 0, v_plan, v_rows, false, null) loop
    select s.* into k from public.import_skipped_rows as s where s.id = v_ids[r.row_no];
    if r.action = 'import' then
      update public.import_skipped_rows set imported_transaction_id = r.transaction_id, imported_at = coalesce(imported_at, now())
      where id = k.id;
      if k.imported_at is null then
        update public.import_batches set
          imported_count = imported_count + 1,
          duplicate_count = duplicate_count - (k.reason = 'duplicate')::integer,
          flagged_count = flagged_count - (k.reason = 'flagged')::integer,
          matched_count = matched_count - (k.reason = 'matched')::integer,
          chosen_skip_count = chosen_skip_count - (k.reason = 'chosen')::integer
        where id = p_batch_id;
      end if;
    end if;
    r.chunk := k.chunk;
    r.row_no := k.row_no;
    return next r;
  end loop;
  return query select * from private.import_not_kept_rows(p_batch_id, p_skipped_row_ids);
end;
$$;

-- D-523: one row of action 'not_kept' for each distinct id sent that is no longer a skipped row
-- the batch keeps.
create function private.import_not_kept_rows(p_batch_id uuid, p_ids uuid[])
returns setof public.import_row_result
language sql
stable
set search_path = ''
as $$
  select r.* from (select distinct u.id from unnest(p_ids) as u (id) where u.id is not null) as i
  cross join lateral (select null::integer as row_no, false as valid, 'not_kept'::text as reason, 'not_kept'::text as action) as x
  cross join lateral pg_catalog.jsonb_populate_record(null::public.import_row_result, pg_catalog.to_jsonb(x)) as r
  where not exists (select 1 from public.import_skipped_rows as s where s.id = i.id and s.batch_id = p_batch_id)
$$;

-- ===========================================================================
-- RPCs: import with a token (R-IMPORT-006, R-IMPORT-075 to R-IMPORT-077, D-116, D-370)
-- ===========================================================================

-- A token that can be used: not revoked, not expired, and its creator still a member of its
-- budget (F2: whatever order a deletion runs its triggers in, a creator gone ends the token).
create function private.token_usable(p_token public.import_tokens)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_token.id is not null and p_token.revoked_at is null and p_token.expires_at > now()
     and exists (select 1 from public.budget_members as m
                 where m.budget_id = p_token.budget_id and m.user_id = p_token.created_by)
$$;

-- The token's row when it can be used, or nothing: one index lookup by hash whatever the
-- token is, before any lock (R-IMPORT-205).
create function private.token_by_secret(p_token text)
returns public.import_tokens
language plpgsql
stable
set search_path = ''
as $$
declare
  v_token public.import_tokens;
begin
  select t.* into v_token from public.import_tokens as t
  where t.token_hash = pg_catalog.sha256(pg_catalog.convert_to(coalesce(p_token, ''), 'UTF8'));
  if not private.token_usable(v_token) then
    return null;
  end if;
  return v_token;
end;
$$;

create function private.token_by_id(p_token_id uuid)
returns public.import_tokens
language plpgsql
stable
set search_path = ''
as $$
declare
  v_token public.import_tokens;
begin
  select t.* into v_token from public.import_tokens as t where t.id = p_token_id;
  if not private.token_usable(v_token) then
    return null;
  end if;
  return v_token;
end;
$$;

-- Callable without a session (the publishable key only), by POST only (F-token: a GET would
-- put the token in the gateway's logs; PostgREST runs a GET read-only, refused here before the
-- token is looked at). An unknown, expired or revoked token, or one whose creator left the
-- budget, gets invalid_token, before any lock or catch-up.
-- M-2 (R-SECURITY-340, D-453): a call never waits for another token call. Another call of the
-- same token doing work: token_busy at once; the few slots for token work all taken (calls of
-- any budget): imports_busy at once. Neither does any work or counts; the script waits and
-- tries again.
-- Then the call is counted, whatever comes next (F10, R-SECURITY-252): under the token's own
-- lock, the calls and rows of the last hour and the last 24 hours are checked and this call
-- added in one step (a call counts for at least 60 and at most 61 minutes, and at least 24 h and
-- at most 24 h 1 min, R-SECURITY-342). Over a limit: token_rate_limited. Then every argument is
-- checked before anything of the budget (F1); the arguments are taken as text and checked here
-- (should-fix 6, R-SECURITY-344), so a malformed one answers its code, never a raw cast error.
-- The budget lock is waited for at most limit_token_lock_wait() (budget_busy), and the work is
-- bounded (250 rows, the merchant key's bounded steps, index lookups), so the call ends well
-- within the anon statement timeout; were it cancelled all the same, the count stands
-- (call_cancelled).
-- Rows are imported with the default choices (a row with a choice is refused:
-- choice_not_allowed), recorded by nobody (the batch names the token), possible matches
-- skipped, never confirmed, "to categorise" created under its fixed name. The answer reads
-- nothing of the budget beyond coarse states (D-371, D-451, D-452): the budget has room for
-- fewer than 250 transactions (transaction_limit_reached); it is far behind (catching_up); its
-- import storage of the day is used up (import_limit_reached); its lock is held (budget_busy).
-- Once counted, a refusal is answered in error (with received 0), not raised, so the count
-- stands. Errors raised: invalid_token, read_only_call. In error: token_busy, imports_busy,
-- token_rate_limited, invalid_batch, invalid_chunk, invalid_source, invalid_date, invalid_rows,
-- import_batch_conflict, batch_undone, chunk_expired, transaction_limit_reached,
-- category_limit_reached, import_limit_reached, catching_up, budget_busy, call_cancelled.
create function public.import_with_token(
  p_token text,
  p_batch_id text,
  p_chunk text,
  p_rows jsonb,
  p_source text default 'script',
  p_statement_from text default null,
  p_statement_to text default null
)
returns table (received integer, refused integer, refused_rows jsonb, error text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_token public.import_tokens;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_minute timestamptz := pg_catalog.date_trunc('minute', pg_catalog.clock_timestamp());
  v_rows integer;
  v_used record;
  v_slot boolean := false;
  v_lock_timeout text := pg_catalog.current_setting('lock_timeout');
  v_batch uuid;
  v_chunk integer;
  v_from date;
  v_to date;
  v_result public.import_row_result[];
begin
  if pg_catalog.current_setting('transaction_read_only') = 'on' then
    raise exception 'read_only_call' using errcode = 'P0001';
  end if;
  v_token := private.token_by_secret(p_token);
  if v_token.id is null then
    raise exception 'invalid_token' using errcode = 'P0001';
  end if;
  -- M-2: never queue behind the same token, nor beyond the slots
  if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('import_token:' || v_token.id::text, 0)) then
    return query select 0, 0, '[]'::jsonb, 'token_busy'::text;
    return;
  end if;
  for i in 1 .. private.limit_import_slots() loop
    if pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('import_token_slot:' || i::text, 0)) then
      v_slot := true;
      exit;
    end if;
  end loop;
  if not v_slot then
    return query select 0, 0, '[]'::jsonb, 'imports_busy'::text;
    return;
  end if;
  v_rows := case when pg_catalog.jsonb_typeof(p_rows) = 'array' then pg_catalog.jsonb_array_length(p_rows) else 0 end;
  -- F10: the check and the count in one step, under the token's own lock; rolling windows
  delete from private.import_token_usage as u where u.token_id = v_token.id and u.minute < v_minute - interval '24 hours';
  select coalesce(pg_catalog.sum(u.calls) filter (where u.minute >= v_minute - interval '60 minutes'), 0) as calls_hour,
         coalesce(pg_catalog.sum(u.rows) filter (where u.minute >= v_minute - interval '60 minutes'), 0) as rows_hour,
         coalesce(pg_catalog.sum(u.calls), 0) as calls_day, coalesce(pg_catalog.sum(u.rows), 0) as rows_day
  into v_used
  from private.import_token_usage as u where u.token_id = v_token.id and u.minute >= v_minute - interval '24 hours';
  -- never waits: a revocation or deletion in progress holds the row (and ends the token)
  update public.import_tokens set last_used_at = v_now
  where id = (select t.id from public.import_tokens as t where t.id = v_token.id for update skip locked);
  if v_used.calls_hour + 1 > private.limit_token_calls_per_hour() or v_used.calls_day + 1 > private.limit_token_calls_per_day()
     or v_used.rows_hour + v_rows > private.limit_token_rows_per_hour() or v_used.rows_day + v_rows > private.limit_token_rows_per_day() then
    insert into private.import_token_usage (token_id, minute, calls, rows) values (v_token.id, v_minute, 1, 0)
    on conflict (token_id, minute) do update set calls = private.import_token_usage.calls + 1;
    return query select 0, 0, '[]'::jsonb, 'token_rate_limited'::text;
    return;
  end if;
  insert into private.import_token_usage (token_id, minute, calls, rows) values (v_token.id, v_minute, 1, v_rows)
  on conflict (token_id, minute) do update set calls = private.import_token_usage.calls + 1,
                                               rows = private.import_token_usage.rows + excluded.rows;
  begin
    -- should-fix 6: the arguments as text, checked here
    if p_batch_id is null or p_batch_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'invalid_batch' using errcode = 'P0001';
    end if;
    v_batch := p_batch_id::uuid;
    if p_chunk is null or p_chunk !~ '^[0-9]{1,3}$' then
      raise exception 'invalid_chunk' using errcode = 'P0001';
    end if;
    v_chunk := p_chunk::integer;
    v_from := private.parse_date_arg(p_statement_from);
    v_to := private.parse_date_arg(p_statement_to);
    perform private.assert_import_args(v_batch, v_chunk, p_rows, p_source, v_from, v_to);
    if pg_catalog.jsonb_array_length(p_rows) > private.limit_token_rows_per_call() then
      raise exception 'invalid_rows' using errcode = 'P0001';
    end if;
    perform pg_catalog.set_config('lock_timeout', private.limit_token_lock_wait(), true);
    select pg_catalog.array_agg(c order by c.row_no) into v_result
    from private.import_chunk(v_token.budget_id, v_batch, v_chunk, p_rows, p_source, v_from, v_to, null, v_token) as c;
    perform pg_catalog.set_config('lock_timeout', v_lock_timeout, true);
  exception
    when sqlstate 'P0001' then
      perform pg_catalog.set_config('lock_timeout', v_lock_timeout, true);
      return query select 0, 0, '[]'::jsonb, sqlerrm;
      return;
    when lock_not_available then
      perform pg_catalog.set_config('lock_timeout', v_lock_timeout, true);
      return query select 0, 0, '[]'::jsonb, 'budget_busy'::text;
      return;
    when query_canceled then
      perform pg_catalog.set_config('lock_timeout', v_lock_timeout, true);
      return query select 0, 0, '[]'::jsonb, 'call_cancelled'::text;
      return;
  end;
  return query
    select pg_catalog.count(*) filter (where not (x.action = 'invalid' and x.reason = any (private.import_shape_reasons())))::integer,
           pg_catalog.count(*) filter (where x.action = 'invalid' and x.reason = any (private.import_shape_reasons()))::integer,
           coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('row', x.row_no, 'reason', x.reason) order by x.row_no)
                      filter (where x.action = 'invalid' and x.reason = any (private.import_shape_reasons())), '[]'::jsonb),
           null::text
    from unnest(v_result) as x;
end;
$$;

-- A calendar date argument given as text (YYYY-MM-DD): null for null; invalid_date otherwise.
create function private.parse_date_arg(p_text text)
returns date
language plpgsql
stable
set search_path = ''
as $$
begin
  if p_text is null then
    return null;
  end if;
  if p_text !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception 'invalid_date' using errcode = 'P0001';
  end if;
  return p_text::date;
exception when datetime_field_overflow or invalid_datetime_format then
  raise exception 'invalid_date' using errcode = 'P0001';
end;
$$;

-- R-IMPORT-074, F11: a token for one budget; the secret is answered once and never stored. At
-- most 10 tokens that can still be used; revoked and expired ones are kept for the batch list,
-- the newest 20 of them for at most 365 days, then pruned. D-452: at most 20 tokens created a
-- budget in a rolling 24 hours, deleted ones included (token_limit_reached).
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
  perform private.prune_import_tokens(p_budget_id);
  if (select pg_catalog.count(*) from public.import_tokens as t
      where t.budget_id = p_budget_id and t.revoked_at is null and t.expires_at > now()) >= private.limit_import_tokens_active()
     or private.import_use(p_budget_id, 0, 0, 1) is not null then
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

-- F11: revoked and expired tokens beyond the newest 20, or older than 365 days, go (their
-- batches keep the token's name).
create function private.prune_import_tokens(p_budget_id uuid)
returns void
language sql
volatile
set search_path = ''
as $$
  delete from public.import_tokens as t
  where t.budget_id = p_budget_id and (t.revoked_at is not null or t.expires_at <= now())
    and (t.created_at < now() - pg_catalog.make_interval(days => private.limit_import_tokens_kept_days())
         or t.id in (select k.id from public.import_tokens as k
                     where k.budget_id = p_budget_id and (k.revoked_at is not null or k.expires_at <= now())
                     order by coalesce(k.revoked_at, k.expires_at) desc, k.id
                     offset private.limit_import_tokens_kept()))
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

-- F11: a member deletes a revoked or expired token (one that can still be used: token_active;
-- revoke it first). Its batches keep its name. Members of its budget.
create function public.delete_import_token(p_token_id uuid)
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
  perform private.lock_budget(v_token.budget_id);
  select t.* into v_token from public.import_tokens as t where t.id = p_token_id;
  if v_token.id is null then
    raise exception 'token_not_found' using errcode = 'P0001';
  end if;
  if v_token.revoked_at is null and v_token.expires_at > now() then
    raise exception 'token_active' using errcode = 'P0001';
  end if;
  delete from public.import_tokens where id = p_token_id;
end;
$$;

-- R-IMPORT-205, F2: a member who leaves or is removed takes the tokens they created for that
-- budget with them (only theirs); a token whose creator's account is deleted is revoked when
-- the creator is set to null, whichever trigger runs first.
create function private.revoke_tokens_of_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.import_tokens set revoked_at = now()
  where budget_id = old.budget_id and (created_by = old.user_id or created_by is null) and revoked_at is null;
  return old;
end;
$$;
create trigger budget_members_revoke_tokens after delete on public.budget_members
  for each row execute function private.revoke_tokens_of_member();

create function private.revoke_token_without_creator()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.created_by is null and old.created_by is not null and new.revoked_at is null then
    new.revoked_at := now();
  end if;
  return new;
end;
$$;
create trigger import_tokens_revoke_without_creator before update of created_by on public.import_tokens
  for each row execute function private.revoke_token_without_creator();

-- ===========================================================================
-- RPCs: review (R-IMPORT-081, R-IMPORT-007, R-IMPORT-202)
-- ===========================================================================

-- The transaction is reviewed: to_review becomes confirmed. Not from "to categorise" (choose
-- a category first). Confirming changes no amount, date, category or link, so a frozen
-- payment of an ended debt can be confirmed (D-374). Members. Errors: transaction_not_found,
-- record_changed, invalid_revision, not_to_review, category_to_categorise, catching_up.
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

-- Confirm in one call every transaction to review of the budget (or of one of its batches)
-- that is not in "to categorise". Under the budget lock. Returns how many were confirmed and
-- how many are left in "to categorise". Members. Errors: budget_not_found,
-- import_batch_not_found, catching_up.
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
     join public.categories as c on c.id = t.category_id and c.is_to_categorise
     where t.budget_id = p_budget_id and t.review_state = 'to_review' and (p_batch_id is null or t.import_batch_id = p_batch_id));
end;
$$;

-- R-IMPORT-206, F5: undo a batch: its transactions still to review are deleted, except those
-- linked to a debt, a subscription or a transfer (a payment of an ended debt is frozen; a link
-- is the member's work): those stay, counted in kept_linked; the confirmed ones and the charges
-- it confirmed stay; the remembered choices stay. Once. Members. Errors:
-- import_batch_not_found, batch_undone, catching_up.
create function public.undo_import_batch(p_batch_id uuid)
returns table (deleted integer, kept_confirmed integer, kept_linked integer, charges_confirmed integer)
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
  delete from public.transactions
  where import_batch_id = p_batch_id and review_state = 'to_review'
    and debt_id is null and subscription_id is null and transfer_occurrence_id is null;
  get diagnostics v_deleted = row_count;
  update public.import_batches set undone_at = now(), undone_by = (select auth.uid()) where id = p_batch_id;
  return query select v_deleted,
    (select pg_catalog.count(*)::integer from public.transactions as t where t.import_batch_id = p_batch_id and t.review_state <> 'to_review'),
    (select pg_catalog.count(*)::integer from public.transactions as t where t.import_batch_id = p_batch_id and t.review_state = 'to_review'),
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

-- R-IMPORT-202, F5: move the to-review transactions waiting in "to categorise" whose key
-- contains the rule's fragment to its category, where that category is in force on their
-- date. Never a transaction linked to a debt, a subscription or a transfer.
-- The transactions a rule (fragment, category) moves: one implementation for applying a rule
-- and for previewing it (Q-271, D-457).
create function private.merchant_rule_targets(p_budget_id uuid, p_fragment text, p_category_id uuid)
returns setof uuid
language plpgsql
stable
set search_path = ''
as $$
begin
  return query
  select t.id
  from public.transactions as t
  join public.categories as tc on tc.id = t.category_id and tc.is_to_categorise
  join public.categories as c on c.id = p_category_id and not c.is_group
  where t.budget_id = p_budget_id and t.review_state = 'to_review' and t.kind <> 'extra_income'
    and t.debt_id is null and t.subscription_id is null and t.transfer_occurrence_id is null
    and t.merchant_key is not null and pg_catalog.strpos(t.merchant_key, p_fragment) > 0
    and exists (select 1 from public.periods as p where p.budget_id = t.budget_id and t.date between p.start_date and p.end_date
                and c.first_seq <= p.seq and (c.end_seq is null or p.seq < c.end_seq));
end;
$$;

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
  where t.id in (select private.merchant_rule_targets(p_rule.budget_id, p_rule.fragment, p_rule.category_id));
  get diagnostics v_moved = row_count;
  return v_moved;
end;
$$;

-- R-IMPORT-421: a rule's fragment as stored (normalised like a merchant key, 1 to 100
-- characters), its raw length checked before any work on it: no text over 1000 characters
-- normalises to a valid fragment worth the work (invalid_fragment).
create function private.merchant_fragment(p_fragment text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_fragment text;
begin
  if p_fragment is null or pg_catalog.octet_length(p_fragment) > 4000 or char_length(p_fragment) > 1000 then
    raise exception 'invalid_fragment' using errcode = 'P0001';
  end if;
  v_fragment := private.normalize_merchant_text(p_fragment);
  if v_fragment = '' or char_length(v_fragment) > 100 then
    raise exception 'invalid_fragment' using errcode = 'P0001';
  end if;
  return v_fragment;
end;
$$;

-- Q-271 (D-457): what a one-click rule would do, without writing: the fragment as it would be
-- stored, the existing rule that already covers the key it is taken from (the one the import
-- would pick: the longest fragment the key contains; null if none), whether a rule with this
-- fragment exists, and how many transactions waiting in "to categorise" it would move to
-- p_category_id (null category: those whose key contains the fragment, any category). Members.
-- Errors: budget_not_found, invalid_fragment, category_not_found, category_is_group,
-- category_to_categorise, category_ended.
create function public.preview_merchant_rule(p_budget_id uuid, p_fragment text, p_category_id uuid default null)
returns table (fragment text, covered_by_rule_id uuid, covered_by_fragment text, rule_exists boolean, would_move integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_fragment text;
  v_rule public.merchant_rules;
begin
  -- R-IMPORT-421: membership, then the fragment's length, before any work on it
  perform private.assert_member(p_budget_id);
  v_fragment := private.merchant_fragment(p_fragment);
  if p_category_id is not null then
    perform private.assert_rule_category(p_budget_id, p_category_id);
  end if;
  select r.* into v_rule from public.merchant_rules as r
  where r.budget_id = p_budget_id and pg_catalog.strpos(v_fragment, r.fragment) > 0
  order by char_length(r.fragment) desc, r.created_at, r.id limit 1;
  return query select v_fragment, v_rule.id, v_rule.fragment,
    exists (select 1 from public.merchant_rules as r where r.budget_id = p_budget_id and r.fragment = v_fragment),
    case when p_category_id is not null
         then (select pg_catalog.count(*)::integer from private.merchant_rule_targets(p_budget_id, v_fragment, p_category_id))
         else (select pg_catalog.count(*)::integer from public.transactions as t
               join public.categories as tc on tc.id = t.category_id and tc.is_to_categorise
               where t.budget_id = p_budget_id and t.review_state = 'to_review' and t.kind <> 'extra_income'
                 and t.debt_id is null and t.subscription_id is null and t.transfer_occurrence_id is null
                 and pg_catalog.strpos(t.merchant_key, v_fragment) > 0) end;
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
  v_fragment text;
  v_rule public.merchant_rules;
begin
  perform private.assert_member(p_budget_id);
  v_fragment := private.merchant_fragment(p_fragment);
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
-- Reads: batches, skipped rows, tokens, remembered choices (R-IMPORT-072, R-APP-170, F14)
-- ===========================================================================
-- Members read batches, skipped rows and remembered choices only through the paged calls
-- below (no direct select); the views are the calls' row shapes.
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
         t.last_used_at, t.revoked_at,
         (t.revoked_at is null and t.expires_at > now()
          and exists (select 1 from public.budget_members as m where m.budget_id = t.budget_id and m.user_id = t.created_by)) as is_active
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
-- next page: the last row's chunk and row_no. row_data: what is kept of the row (bounded,
-- F3). Members. Errors: import_batch_not_found, invalid_limit, invalid_cursor.
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

-- F14: the remembered choices of a budget, by flag and key, at most p_limit (1 to 200); next
-- page: the last row's flag and counterparty_key. At most 1000 are kept a budget (the least
-- recently used go). Members. Errors: budget_not_found, invalid_limit, invalid_cursor.
create function public.list_import_choices(p_budget_id uuid, p_limit integer default 100,
                                           p_after_flag text default null, p_after_key text default null)
returns setof public.import_choices
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
  if pg_catalog.num_nonnulls(p_after_flag, p_after_key) = 1 then
    raise exception 'invalid_cursor' using errcode = 'P0001';
  end if;
  return query select c.* from public.import_choices as c
    where c.budget_id = p_budget_id and (p_after_flag is null or (c.flag, c.counterparty_key) > (p_after_flag, p_after_key))
    order by c.flag, c.counterparty_key limit p_limit;
end;
$$;

-- Q-272 (D-458): forget a remembered choice; the next import of that entry applies the default
-- again. Answers whether one was forgotten (false: none, idempotent). Members. Errors:
-- budget_not_found.
create function public.forget_import_choice(p_budget_id uuid, p_flag text, p_counterparty_key text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_found boolean;
begin
  perform private.assert_member(p_budget_id);
  -- R-IMPORT-421: nothing longer than a stored key is looked for (none can match)
  if p_flag is null or p_counterparty_key is null or char_length(p_flag) > 100 or char_length(p_counterparty_key) > 1000 then
    return false;
  end if;
  perform private.lock_budget(p_budget_id);
  delete from public.import_choices as c
  where c.budget_id = p_budget_id and c.flag = p_flag and c.counterparty_key = p_counterparty_key;
  get diagnostics v_found = row_count;
  return v_found;
end;
$$;

-- Q-275 (D-459): one batch by its id, as list_import_batches gives it. Members. Errors:
-- import_batch_not_found.
create function public.get_import_batch(p_batch_id uuid)
returns setof public.import_batch_list
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
  return query select l.* from public.import_batch_list as l where l.id = p_batch_id;
end;
$$;

-- The source of a transaction's batch, for transaction_list (members do not select batches).
create function private.import_source(p_batch_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select b.source from public.import_batches as b
  where b.id = p_batch_id and b.budget_id in (select private.member_budget_ids())
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
    private.import_source(t.import_batch_id) as import_source,
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
    (select c.id from public.categories as c where c.budget_id = b.id and c.is_to_categorise and c.end_seq is null) as to_categorise_category_id
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

-- update_transaction of step 4; F7 (R-IMPORT-253): a transaction to review stays to review when its link
-- changes (only the confirm calls review it).
CREATE OR REPLACE FUNCTION public.update_transaction(p_transaction_id uuid, p_expected_revision integer, p_kind transaction_kind, p_amount bigint, p_date date, p_category_id uuid DEFAULT NULL::uuid, p_description text DEFAULT NULL::text, p_relink boolean DEFAULT false, p_debt_id uuid DEFAULT NULL::uuid, p_subscription_id uuid DEFAULT NULL::uuid)
 RETURNS SETOF transaction_list
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_transaction public.transactions;
  v_description text;
  v_seq integer;
  v_same_period boolean;
  v_debt uuid;
  v_subscription uuid;
  v_kept boolean;
begin
  perform private.assert_transaction_amount(p_kind, p_amount);
  v_description := private.clean_description(p_description);
  v_transaction := private.lock_transaction(p_transaction_id);
  perform private.assert_revision(v_transaction.revision, p_expected_revision);
  perform private.assert_debt_not_frozen(v_transaction.debt_id);
  v_seq := private.transaction_period_seq(v_transaction.budget_id, p_date);
  v_same_period := v_seq = (
    select p.seq from public.periods as p
    where p.budget_id = v_transaction.budget_id and v_transaction.date between p.start_date and p.end_date);
  perform private.assert_transaction_category(v_transaction.budget_id, p_kind, p_category_id, v_seq,
    p_category_id is not distinct from v_transaction.category_id and v_same_period);
  if coalesce(p_relink, false) then
    v_debt := p_debt_id;
    v_subscription := p_subscription_id;
  else
    v_debt := v_transaction.debt_id;
    v_subscription := v_transaction.subscription_id;
  end if;
  v_kept := v_debt is not distinct from v_transaction.debt_id
            and v_subscription is not distinct from v_transaction.subscription_id
            and p_category_id is not distinct from v_transaction.category_id and v_same_period;
  perform private.assert_transaction_link(v_transaction.budget_id, p_kind, p_category_id, v_seq, p_date,
    v_debt, v_subscription, v_kept);
  update public.transactions
  set kind = p_kind, amount = p_amount, date = p_date, category_id = p_category_id, description = v_description,
      debt_id = v_debt,
      subscription_id = v_subscription,
      charge_date = case when v_subscription is not distinct from subscription_id then charge_date end,
      review_state = case when review_state = 'to_review' or v_subscription is not distinct from subscription_id then review_state
                          else 'confirmed' end
  where id = v_transaction.id;
  return query select * from public.transaction_list as l where l.id = v_transaction.id;
end;
$function$;

-- link_transaction of step 4, with the same F7 rule.
CREATE OR REPLACE FUNCTION public.link_transaction(p_transaction_id uuid, p_expected_revision integer, p_debt_id uuid DEFAULT NULL::uuid, p_subscription_id uuid DEFAULT NULL::uuid)
 RETURNS SETOF transaction_list
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_transaction public.transactions;
  v_seq integer;
begin
  v_transaction := private.lock_transaction(p_transaction_id);
  perform private.assert_revision(v_transaction.revision, p_expected_revision);
  if p_debt_id is distinct from v_transaction.debt_id then
    perform private.assert_debt_not_frozen(v_transaction.debt_id);
  end if;
  select p.seq into v_seq from public.periods as p
  where p.budget_id = v_transaction.budget_id and v_transaction.date between p.start_date and p.end_date;
  perform private.assert_transaction_link(v_transaction.budget_id, v_transaction.kind, v_transaction.category_id, v_seq,
    v_transaction.date, p_debt_id, p_subscription_id,
    p_debt_id is not distinct from v_transaction.debt_id and p_subscription_id is not distinct from v_transaction.subscription_id);
  update public.transactions
  set debt_id = p_debt_id,
      subscription_id = p_subscription_id,
      charge_date = case when p_subscription_id is not distinct from subscription_id then charge_date end,
      review_state = case when review_state = 'to_review' or p_subscription_id is not distinct from subscription_id then review_state
                          else 'confirmed' end
  where id = v_transaction.id;
  return query select * from public.transaction_list as l where l.id = v_transaction.id;
end;
$function$;

-- assert_terms_category of step 4; F12 (R-CATEGORY-250): no subscription, debt or planned transfer on
-- "to categorise".
CREATE OR REPLACE FUNCTION private.assert_terms_category(p_budget_id uuid, p_category_id uuid, p_from integer, p_to integer)
 RETURNS void
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  v_category public.categories;
begin
  if p_category_id is null then
    raise exception 'category_required' using errcode = 'P0001';
  end if;
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
  if p_to is not null and p_to <= p_from then
    return;  -- the terms govern no period (a void record)
  end if;
  if v_category.first_seq > p_from
     or (v_category.end_seq is not null and (p_to is null or v_category.end_seq < p_to)) then
    raise exception 'category_not_in_force' using errcode = 'P0001';
  end if;
end;
$function$;

-- assert_category_room of step 4; F12 (R-CATEGORY-250, answers Q-190): "to categorise" does not count
-- towards the 200 categories in force.
CREATE OR REPLACE FUNCTION private.assert_category_room(p_budget_id uuid, p_new integer)
 RETURNS void
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
begin
  if (select pg_catalog.count(*) from public.categories as c where c.budget_id = p_budget_id and c.end_seq is null and not c.is_to_categorise)
       + p_new > private.limit_active_categories()
     or (select pg_catalog.count(*) from public.categories as c
         where c.budget_id = p_budget_id and (c.end_seq is null or c.end_seq > c.first_seq))
       + p_new > private.limit_total_categories()
     or (select pg_catalog.count(*) from public.categories as c where c.budget_id = p_budget_id)
       + p_new > private.limit_rows_per_kind() then
    raise exception 'category_limit_reached' using errcode = 'P0001';
  end if;
end;
$function$;

-- F12 (R-CATEGORY-250): only an imported transaction still to review can be in "to categorise":
-- no hand-typed one, none moved into it, none confirmed there (whatever writes the row).
create function private.guard_to_categorise_transaction()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.category_id is not null
     and (tg_op = 'INSERT' or new.category_id is distinct from old.category_id or new.review_state is distinct from old.review_state)
     and not (new.review_state = 'to_review' and new.import_batch_id is not null)
     and exists (select 1 from public.categories as c where c.id = new.category_id and c.is_to_categorise) then
    raise exception 'category_to_categorise' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger transactions_guard_to_categorise before insert or update on public.transactions
  for each row execute function private.guard_to_categorise_transaction();

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
-- should-fix 10: every table of the app, private ones included (no policy: only the definer
-- functions read or write them)
alter table private.import_absorbed enable row level security;
-- (and the step 1 bookkeeping table of the private schema, so C-RLS-001 holds in every schema
-- of the app)
alter table private.period_keyed_tables enable row level security;
alter table private.import_budget_usage enable row level security;
alter table private.import_preview_parts enable row level security;

create policy "Members can read their budgets' import tokens (never the hash)"
  on public.import_tokens for select to authenticated
  using (budget_id in (select private.member_budget_ids()));
-- (F14: members read batches, skipped rows and remembered choices through the paged calls only;
-- the policies stay for defence in depth)
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
revoke all on table private.import_chunks, private.import_token_usage, private.import_absorbed, private.import_budget_usage,
  private.import_preview_parts from public, anon, authenticated, service_role;

-- the token hash is never readable: no column privilege on it
grant select (id, budget_id, name, created_by, created_at, expires_at, last_used_at, revoked_at, revoked_by)
  on table public.import_tokens to authenticated;
grant select on table public.merchant_rules, public.merchant_rule_list, public.import_token_list to authenticated;
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

-- Used by the security_invoker view transaction_list.
grant execute on function private.import_source(uuid) to authenticated;

grant execute on function
  public.preview_import(uuid, uuid, jsonb),
  public.preview_import_part(uuid, uuid, integer, jsonb),
  public.preview_merchant_rule(uuid, text, uuid),
  public.forget_import_choice(uuid, text, text),
  public.get_import_batch(uuid),
  public.delete_import_token(uuid),
  public.list_import_choices(uuid, integer, text, text),
  public.update_transaction(uuid, integer, public.transaction_kind, bigint, date, uuid, text, boolean, uuid, uuid),
  public.link_transaction(uuid, integer, uuid, uuid),
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
grant execute on function public.import_with_token(text, text, text, jsonb, text, text, text) to anon, authenticated;
