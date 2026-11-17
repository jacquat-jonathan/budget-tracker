-- Step 6, second fix round: token calls that never queue and always count (M-2), the duplicate
-- lookup by index (M-3), import storage bounded per budget (D-452), what a token learns of the
-- room (D-451), token arguments as text, a token's own batches, exact rolling windows, the
-- cleaner's joiners and invisible names, "import anyway" importing the row previewed, the
-- statement previewed in parts with totals (Q-270, Q-274), remembered choices (Q-272, Q-276),
-- the rule preview (Q-271), one batch by id (Q-275) and editing in "to categorise" (Q-273).
begin;
select plan(70);

select tests.create_user('fay', 'Fay');
select tests.create_user('gus', 'Gus');
select tests.create_user('hal', 'Hal');
select tests.set_today('2026-11-16');

create function pg_temp.refusal(q text) returns text language plpgsql as $$
begin
  execute q;
  return 'no error';
exception when others then
  return sqlerrm;
end $$;

select tests.authenticate_as('fay');
select tests.remember('b', public.create_budget('Fix two', 'Salary', 600000, 25, 'nearest', '2026-09-01'));
select tests.remember('p1', (select id from public.periods where budget_id = tests.id('b') and seq = 1));
select tests.remember('food', (select id from public.create_category(tests.id('b'), 'Food', p_amount => 60000, p_from_period_id => tests.id('p1'))));
select tests.remember('fun', (select id from public.create_category(tests.id('b'), 'Fun', p_from_period_id => tests.id('p1'))));
create temp table tok on commit drop as select * from public.create_import_token(tests.id('b'), 'Script');
create temp table tok2 on commit drop as select * from public.create_import_token(tests.id('b'), 'Second');
grant select on tok, tok2 to anon, authenticated;
select tests.clear_authentication();
create function pg_temp.call(p_secret text, p_batch text, p_chunk text, p_rows jsonb, p_from text default null) returns text language sql as $$
  select coalesce(x.error, x.received::text || '/' || x.refused::text)
  from public.import_with_token(p_secret, p_batch, p_chunk, p_rows, 'script', p_from) as x
$$;
create function pg_temp.used(p_token uuid) returns integer language sql security definer as $$
  select coalesce(sum(u.calls), 0)::integer from private.import_token_usage as u where u.token_id = p_token
$$;
grant execute on function pg_temp.call(text, text, text, jsonb, text), pg_temp.used(uuid) to anon, authenticated;

-- ===========================================================================
-- Token arguments taken as text and checked inside (R-SECURITY-344)
-- ===========================================================================
select tests.authenticate_as_anon();
select is(pg_temp.call((select token from tok), 'not-a-uuid', '1', '[{"date": "2026-11-14", "amount": 1, "direction": "debit"}]'),
  'invalid_batch', 'R-SECURITY-344: a malformed batch id answers invalid_batch, not a raw cast error');
select is(pg_temp.call((select token from tok), gen_random_uuid()::text, 'one', '[{"date": "2026-11-14", "amount": 1, "direction": "debit"}]'),
  'invalid_chunk', 'R-SECURITY-344: a malformed chunk answers invalid_chunk');
select is(pg_temp.call((select token from tok), gen_random_uuid()::text, '1', '[{"date": "2026-11-14", "amount": 1, "direction": "debit"}]', '2026-02-30'),
  'invalid_date', 'R-SECURITY-344: an impossible statement date answers invalid_date');
select is(pg_temp.call((select token from tok), gen_random_uuid()::text, '1', '[{"date": "2026-11-14", "amount": 1, "direction": "debit"}]', 'yesterday'),
  'invalid_date', 'R-SECURITY-344: so does a date in words (no datestyle hint)');
select is(pg_temp.call((select token from tok), gen_random_uuid()::text, '1',
                       (select jsonb_agg(jsonb_build_object('date', '2026-11-14', 'amount', g, 'direction', 'debit')) from generate_series(1, 251) as g)),
  'invalid_rows', 'R-SECURITY-340: a token call takes at most 250 rows');
select tests.clear_authentication();
select is(pg_temp.used((select token_id from tok)), 5, 'R-SECURITY-252: each of those calls was counted');

-- ===========================================================================
-- A cancelled call still counts (R-SECURITY-340)
-- ===========================================================================
savepoint slow;
create or replace function private.import_chunk(p_budget_id uuid, p_batch_id uuid, p_chunk integer, p_rows jsonb, p_source text,
  p_from date, p_to date, p_to_categorise_name text, p_token public.import_tokens)
returns setof public.import_row_result language plpgsql as $f$ begin perform pg_sleep(2); end $f$;
select tests.authenticate_as_anon();
set local statement_timeout = '300ms';
select is(pg_temp.call((select token from tok2), gen_random_uuid()::text, '1', '[{"date": "2026-11-14", "amount": 1, "direction": "debit"}]'),
  'call_cancelled', 'R-SECURITY-340: a call cancelled by the statement timeout answers call_cancelled');
set local statement_timeout = 0;
select tests.clear_authentication();
select is(pg_temp.used((select token_id from tok2)), 1, 'R-SECURITY-252: and is counted all the same');
rollback to savepoint slow;

-- ===========================================================================
-- Rolling windows by whole minutes: a call counts at least 60 minutes (R-SECURITY-342)
-- ===========================================================================
select tests.authenticate_as('fay');
create temp table tok3 on commit drop as select * from public.create_import_token(tests.id('b'), 'Window');
select tests.clear_authentication();
grant select on tok3 to anon;
insert into private.import_token_usage (token_id, minute, calls, rows)
select token_id, date_trunc('minute', clock_timestamp()) - interval '60 minutes', 60, 0 from tok3;
select tests.authenticate_as_anon();
select is(pg_temp.call((select token from tok3), gen_random_uuid()::text, '1', '[{"date": "2026-11-14", "amount": 1, "direction": "debit"}]'),
  'token_rate_limited', 'R-SECURITY-342: calls made in the minute an hour before the current one still count');
select tests.clear_authentication();
update private.import_token_usage set minute = minute - interval '1 minute', calls = 60
where token_id = (select token_id from tok3) and minute < date_trunc('minute', clock_timestamp()) - interval '59 minutes';
delete from private.import_token_usage where token_id = (select token_id from tok3) and minute >= date_trunc('minute', clock_timestamp()) - interval '59 minutes';
select tests.authenticate_as_anon();
select is(pg_temp.call((select token from tok3), gen_random_uuid()::text, '1', '[{"date": "2026-11-14", "amount": 1, "direction": "debit"}]'),
  '1/0', 'R-SECURITY-342: one minute earlier they no longer count toward the hour');
select tests.clear_authentication();
update private.import_token_usage set minute = date_trunc('minute', clock_timestamp()) - interval '24 hours', calls = 300
where token_id = (select token_id from tok3) and calls = 60;
select tests.authenticate_as_anon();
select is(pg_temp.call((select token from tok3), gen_random_uuid()::text, '1', '[{"date": "2026-11-14", "amount": 2, "direction": "debit"}]'),
  'token_rate_limited', 'R-SECURITY-342: calls of the minute 24 hours before still count toward the day');

-- ===========================================================================
-- A token adds only to batches it created (R-SECURITY-343)
-- ===========================================================================
select tests.authenticate_as('fay');
select tests.remember('mbatch', gen_random_uuid());
select count(*) from public.import_transactions(tests.id('b'), tests.id('mbatch'), 1,
  '[{"date": "2026-11-12", "amount": 4321, "direction": "debit", "description": "member row"}]', 'csv');
select tests.authenticate_as_anon();
select is(pg_temp.call((select token from tok), tests.id('mbatch')::text, '2', '[{"date": "2026-11-14", "amount": 3, "direction": "debit"}]'),
  'import_batch_conflict', 'R-SECURITY-343: a token cannot add a chunk to a member''s batch');
select is(pg_temp.call((select token from tok), tests.id('mbatch')::text, '1', '[{"date": "2026-11-14", "amount": 3, "direction": "debit"}]'),
  'import_batch_conflict', 'R-SECURITY-343: nor read a member''s chunk by replaying it');
select tests.remember('tbatch', gen_random_uuid());
select is(pg_temp.call((select token from tok2), tests.id('tbatch')::text, '1', '[{"date": "2026-11-14", "amount": 4, "direction": "debit"}]'),
  '1/0', 'R-SECURITY-343: a token creates its batch');
select is(pg_temp.call((select token from tok), tests.id('tbatch')::text, '2', '[{"date": "2026-11-14", "amount": 5, "direction": "debit"}]'),
  'import_batch_conflict', 'R-SECURITY-343: another token of the budget cannot add to it');
select is(pg_temp.call((select token from tok2), tests.id('tbatch')::text, '2', '[{"date": "2026-11-14", "amount": 5, "direction": "debit"}]'),
  '1/0', 'R-SECURITY-343: the token that created it can');

-- ===========================================================================
-- The room a token learns: one bit (D-451, R-SECURITY-345)
-- ===========================================================================
select tests.clear_authentication();
savepoint room;
create function pg_temp.set_room(p_room integer) returns void language plpgsql as $f$ begin
  execute format('create or replace function private.limit_transactions() returns integer language sql immutable set search_path = '''' as $g$ select %s $g$',
                 (select count(*) from public.transactions where budget_id = tests.id('b')) + p_room);
end $f$;
select pg_temp.set_room(251);
select tests.authenticate_as_anon();
select is(pg_temp.call((select token from tok2), gen_random_uuid()::text, '1', '[{"date": "2026-11-14", "amount": 6, "direction": "debit"}]'),
  '1/0', 'R-SECURITY-345: with room for 250 or more, a token imports');
select tests.clear_authentication();
select pg_temp.set_room(249);
select tests.authenticate_as_anon();
select is(pg_temp.call((select token from tok2), gen_random_uuid()::text, '1', '[{"date": "2026-11-14", "amount": 12.5, "direction": "debit"}]'),
  'transaction_limit_reached', 'R-SECURITY-345: with room for fewer than 250, even one row that could never be imported is refused');
select tests.authenticate_as('fay');
select ok(pg_temp.refusal(format($$select * from public.import_transactions(%L, gen_random_uuid(), 1, '[{"date": "2026-11-14", "amount": 7, "direction": "debit"}]', 'csv')$$,
                                 tests.id('b'))) = 'no error', 'R-SECURITY-345: a member still imports what fits');
rollback to savepoint room;

-- ===========================================================================
-- Import storage per budget (D-452, R-IMPORT-341)
-- ===========================================================================
select tests.clear_authentication();
savepoint storage;
create or replace function private.limit_import_rows_per_day() returns integer language sql immutable set search_path = '' as $f$ select 20 $f$;
delete from private.import_budget_usage where budget_id = tests.id('b');
select tests.authenticate_as('fay');
select is(pg_temp.refusal(format($$select * from public.import_transactions(%L, gen_random_uuid(), 1, %L, 'csv')$$, tests.id('b'),
          (select jsonb_agg(jsonb_build_object('date', '2026-11-13', 'amount', 100 + g, 'direction', 'debit')) from generate_series(1, 15) as g))),
  'no error', 'R-IMPORT-341: rows within the day''s limit are imported');
select is(pg_temp.refusal(format($$select * from public.import_transactions(%L, gen_random_uuid(), 1, %L, 'csv')$$, tests.id('b'),
          (select jsonb_agg(jsonb_build_object('date', '2026-11-13', 'amount', 200 + g, 'direction', 'debit')) from generate_series(1, 6) as g))),
  'import_limit_reached', 'R-IMPORT-341: rows beyond the budget''s rows of the day are refused');
select tests.authenticate_as_anon();
select is(pg_temp.call((select token from tok2), gen_random_uuid()::text, '1',
                       (select jsonb_agg(jsonb_build_object('date', '2026-11-13', 'amount', 300 + g, 'direction', 'debit')) from generate_series(1, 6) as g)),
  'import_limit_reached', 'R-IMPORT-341: members and tokens together');
select tests.clear_authentication();
rollback to savepoint storage;

savepoint storage2;
create or replace function private.limit_import_batches_per_day() returns integer language sql immutable set search_path = '' as $f$ select 2 $f$;
delete from private.import_budget_usage where budget_id = tests.id('b');
select tests.remember('day1', gen_random_uuid());
select tests.authenticate_as('fay');
select count(*) from public.import_transactions(tests.id('b'), tests.id('day1'), 1, '[{"date": "2026-11-13", "amount": 401, "direction": "debit"}]', 'csv');
select count(*) from public.import_transactions(tests.id('b'), gen_random_uuid(), 1, '[{"date": "2026-11-13", "amount": 402, "direction": "debit"}]', 'csv');
select is(pg_temp.refusal(format($$select * from public.import_transactions(%L, gen_random_uuid(), 1, '[{"date": "2026-11-13", "amount": 403, "direction": "debit"}]', 'csv')$$, tests.id('b'))),
  'import_limit_reached', 'R-IMPORT-341: new batches beyond the day''s are refused');
select is(pg_temp.refusal(format($$select * from public.import_transactions(%L, %L, 2, '[{"date": "2026-11-13", "amount": 404, "direction": "debit"}]', 'csv')$$, tests.id('b'), tests.id('day1'))),
  'no error', 'R-IMPORT-341: a batch already open takes its next chunk');
select tests.clear_authentication();
rollback to savepoint storage2;

savepoint storage3;
select tests.remember('empty_batch', gen_random_uuid());
select tests.authenticate_as('fay');
select count(*) from public.import_transactions(tests.id('b'), tests.id('empty_batch'), 1, '[{"date": "2026-11-13", "amount": 501, "direction": "debit", "description": "undone"}]', 'csv');
select count(*) from public.undo_import_batch(tests.id('empty_batch'));
select tests.clear_authentication();
create temp table kept_now on commit drop as select count(*)::integer as n from public.import_batches where budget_id = tests.id('b');
do $$ begin
  execute format('create or replace function private.limit_import_batches_kept() returns integer language sql immutable set search_path = '''' as $f$ select %s $f$',
                 (select n from kept_now));
end $$;
select tests.authenticate_as('fay');
select is(pg_temp.refusal(format($$select * from public.import_transactions(%L, gen_random_uuid(), 1, '[{"date": "2026-11-13", "amount": 502, "direction": "debit"}]', 'csv')$$, tests.id('b'))),
  'no error', 'R-IMPORT-341: at the batches kept, a batch that holds nothing any more goes first');
select tests.clear_authentication();
select is((select count(*)::integer from public.import_batches where id = tests.id('empty_batch')), 0, 'R-IMPORT-341: (the undone, emptied batch went)');
select tests.authenticate_as('fay');
select is(pg_temp.refusal(format($$select * from public.import_transactions(%L, gen_random_uuid(), 1, '[{"date": "2026-11-13", "amount": 503, "direction": "debit"}]', 'csv')$$, tests.id('b'))),
  'import_limit_reached', 'R-IMPORT-341: when none can go, a new batch is refused');
select tests.clear_authentication();
rollback to savepoint storage3;

savepoint storage4;
create or replace function private.limit_import_skipped_kept() returns integer language sql immutable set search_path = '' as $f$ select 3 $f$;
create or replace function private.limit_import_answers_kept() returns integer language sql immutable set search_path = '' as $f$ select 1 $f$;
select tests.remember('sk', gen_random_uuid());
select tests.authenticate_as('fay');
select count(*) from public.import_transactions(tests.id('b'), tests.id('sk'), 1, (select jsonb_agg(jsonb_build_object('date', '2026-11-13', 'amount', 600 + g, 'direction', 'debit', 'hint', 'own_transfer', 'description', 'Own ' || g)) from generate_series(1, 5) as g), 'csv');
select count(*) from public.import_transactions(tests.id('b'), tests.id('sk'), 2, '[{"date": "2026-11-13", "amount": 700, "direction": "debit"}]', 'csv');
select tests.clear_authentication();
select is((select count(*)::integer from public.import_skipped_rows where budget_id = tests.id('b')), 3, 'R-IMPORT-341: a budget keeps its newest skipped rows only');
select is((select row_count from public.import_batches where id = tests.id('sk')), 6, 'R-IMPORT-341: the batch''s counts stay');
select tests.authenticate_as('fay');
select is(pg_temp.refusal(format($$select * from public.import_transactions(%L, %L, 1, '[{"date": "2026-11-13", "amount": 1, "direction": "debit"}]', 'csv')$$, tests.id('b'), tests.id('sk'))),
  'chunk_expired', 'R-IMPORT-341: a chunk whose answer was forgotten answers chunk_expired and is not imported again');
select is((select count(*)::integer from public.import_transactions(tests.id('b'), tests.id('sk'), 2, '[{"date": "2026-11-13", "amount": 700, "direction": "debit"}]', 'csv')),
  1, 'R-IMPORT-341: the newest answers are kept');
select tests.clear_authentication();
rollback to savepoint storage4;

savepoint storage5;
create or replace function private.limit_import_tokens_per_day() returns integer language sql immutable set search_path = '' as $f$ select 2 $f$;
delete from private.import_budget_usage where budget_id = tests.id('b');
select tests.authenticate_as('fay');
select tests.remember('cycle1', (select token_id from public.create_import_token(tests.id('b'), 'Cycle 1')));
select public.revoke_import_token(tests.id('cycle1'));
select public.delete_import_token(tests.id('cycle1'));
select tests.remember('cycle2', (select token_id from public.create_import_token(tests.id('b'), 'Cycle 2')));
select is(pg_temp.refusal(format($$select * from public.create_import_token(%L, 'Cycle 3')$$, tests.id('b'))), 'token_limit_reached',
  'R-IMPORT-341: tokens created in a day count, deleted ones too');
select tests.clear_authentication();
rollback to savepoint storage5;

-- ===========================================================================
-- The duplicate lookup reads by index (M-3, R-IMPORT-343)
-- ===========================================================================
select tests.clear_authentication();
select tests.remember('hist', gen_random_uuid());
insert into public.import_batches (id, budget_id, source, created_by) values (tests.id('hist'), tests.id('b'), 'csv', tests.get_user_id('fay'));
insert into public.transactions (budget_id, kind, amount, date, category_id, description, import_batch_id, import_amount, import_date, import_description)
select tests.id('b'), 'expense', 1000 + g, date '2026-10-01' + (g % 45), tests.id('food'), 'hist ' || g, tests.id('hist'), 1000 + g, date '2026-10-01' + (g % 45), 'hist ' || g
from generate_series(1, 4000) as g;
analyze public.transactions;
select pg_stat_force_next_flush();
create temp table seen on commit drop as select seq_scan, seq_tup_read from pg_stat_xact_user_tables where relid = 'public.transactions'::regclass;
select tests.authenticate_as('fay');
select count(*) from public.preview_import(tests.id('b'), null,
  (select jsonb_agg(jsonb_build_object('date', (date '2026-10-01' + (g % 45))::text, 'amount', 1000 + g, 'direction', 'debit', 'description', 'other ' || g)) from generate_series(1, 40) as g));
select tests.clear_authentication();
select is((select x.seq_tup_read - s.seq_tup_read from pg_stat_xact_user_tables as x, seen as s where x.relid = 'public.transactions'::regclass), 0::bigint,
  'R-IMPORT-343: a preview of 40 rows on a budget of 4000 imported transactions reads no transaction by a sequential scan');
select tests.authenticate_as('fay');
select is((select action from public.preview_import(tests.id('b'), null, '[{"date": "2026-10-02", "amount": 1001, "direction": "debit", "description": "hist 1"}]')),
  'skip_duplicate', 'R-IMPORT-343: and still finds the duplicate');
select tests.clear_authentication();
update public.transactions set amount = 77, date = '2026-11-01', description = 'edited' where import_batch_id = tests.id('hist') and import_amount = 1002;
select tests.authenticate_as('fay');
select is((select duplicate_of is not null from public.preview_import(tests.id('b'), null, '[{"date": "2026-10-03", "amount": 1002, "direction": "debit", "description": "hist 2"}]')),
  true, 'R-IMPORT-254: the edited import is found by its original values through the index');
select tests.clear_authentication();
delete from public.transactions where import_batch_id = tests.id('hist');
delete from public.import_batches where id = tests.id('hist');
select throws_ok($$insert into public.transactions (budget_id, kind, amount, date, category_id, import_amount) values ('$$ || tests.id('b') || $$', 'expense', 1, '2026-11-10', '$$ || tests.id('food') || $$', 1)$$,
  '23514', null, 'R-IMPORT-343: values as first imported belong to imported transactions only');

-- ===========================================================================
-- The merchant key's bounded work (R-IMPORT-342)
-- ===========================================================================
select is(char_length(private.merchant_key(null, repeat('a*', 250))), 200, 'R-IMPORT-342: a key that would take more than 10 steps keeps the text cut to 200');
select is(private.merchant_key(private.merchant_key(null, repeat('a*', 250)), null), private.merchant_key(null, repeat('a*', 250)),
  'R-IMPORT-342: and stays idempotent');
select is(private.merchant_key(null, 'Achat TWINT payup *Shop Bern'), 'shop bern', 'R-IMPORT-342: ordinary keys still take their steps');

-- ===========================================================================
-- The cleaner: joiners kept where text needs them, invisible names empty (R-SECURITY-341)
-- ===========================================================================
select is(private.clean_text(U&'\+01F468\200D\+01F469\200D\+01F467'), U&'\+01F468\200D\+01F469\200D\+01F467',
  'R-SECURITY-341: an emoji family keeps its zero-width joiners');
select is(private.clean_text(U&'\0645\06CC\200C\062E\0648\0627\0647\0645'), U&'\0645\06CC\200C\062E\0648\0627\0647\0645',
  'R-SECURITY-341: Persian keeps its zero-width non-joiner');
select is(private.clean_text(U&'\200Dab\200C c\200D'), 'ab c', 'R-SECURITY-341: a joiner at an edge or beside a space goes');
select is(private.clean_text(U&'a\FFF9b\FFFAc\FFFB\+0E0001d'), 'abcd', 'R-SECURITY-341: interlinear annotation marks and the language tag go');
select is(pg_temp.refusal($$select private.clean_name(U&'\3164\115F \2800\+0E0041\+0E007F\FE0F')$$), 'invalid_name',
  'R-SECURITY-341: a name of fillers, blank patterns, tags and selectors only is empty');
select is(private.clean_text(U&'\+01F3F4\+0E0067\+0E0062\+0E0065\+0E006E\+0E0067\+0E007F'), U&'\+01F3F4\+0E0067\+0E0062\+0E0065\+0E006E\+0E0067\+0E007F',
  'R-SECURITY-341: a flag''s tag sequence stays');

-- ===========================================================================
-- "Import anyway" imports the row the preview showed (R-IMPORT-344)
-- ===========================================================================
select tests.remember('pad', gen_random_uuid());
create temp table padded on commit drop as select jsonb_build_array(jsonb_build_object(
  'date', '2026-11-12', 'amount', 2468, 'direction', 'debit', 'hint', 'own_transfer',
  'description', repeat(U&'\200B', 300) || repeat('x', 304),
  'bank_transaction_id', repeat(U&'\200B', 60) || 'BANK-ID-' || repeat('7', 42))) as j;
grant select on padded to authenticated;
select tests.authenticate_as('fay');
select is((select char_length(description) from public.preview_import(tests.id('b'), null, (select j from padded))), 304,
  'R-IMPORT-344: (the preview shows the cleaned description)');
select is((select action from public.import_transactions(tests.id('b'), tests.id('pad'), 1, (select j from padded), 'csv')), 'skip_flagged',
  'R-IMPORT-344: (skipped as an own transfer)');
select tests.remember('pad_tx', (select transaction_id from public.import_skipped_anyway(tests.id('pad'))));
select tests.clear_authentication();
select is((select row(char_length(description), bank_transaction_id)::text from public.transactions where id = tests.id('pad_tx')),
  row(304, 'BANK-ID-' || repeat('7', 42))::text, 'R-IMPORT-344: imported anyway with the description and bank id the preview showed');
select tests.authenticate_as('fay');
select is((select action from public.preview_import(tests.id('b'), null, (select j from padded))), 'skip_duplicate',
  'R-IMPORT-344: so the same statement line imported again is its duplicate by bank id');

-- ===========================================================================
-- Remembered choices: explicit only; own transfers keyed (Q-276, R-IMPORT-345); forget (Q-272)
-- ===========================================================================
select count(*) from public.import_transactions(tests.id('b'), gen_random_uuid(), 1, '[
  {"date": "2026-11-11", "amount": 811, "direction": "debit", "description": "Card bill", "hint": "card_bill_payment"},
  {"date": "2026-11-11", "amount": 812, "direction": "debit", "description": "Ann Muster", "hint": "transfer_to_person"},
  {"date": "2026-11-11", "amount": 813, "direction": "debit", "hint": "own_transfer", "action": "import"}]', 'csv');
select results_eq(format($$select flag, counterparty_key, choice from public.list_import_choices(%L)
                          where counterparty_key in ('card bill', 'ann muster', 'own_transfer') order by flag$$, tests.id('b')),
  $$values ('own_transfer'::text, 'own_transfer'::text, 'import'::text)$$,
  'R-IMPORT-345: only the choice the member sent is remembered (no default); an own transfer without a description under the key own_transfer');
select is((select row(choice_key, remembered_choice, action)::text from public.preview_import(tests.id('b'), null,
             '[{"date": "2026-11-12", "amount": 814, "direction": "debit", "hint": "own_transfer"}]')),
  row('own_transfer', 'import', 'import')::text, 'R-IMPORT-345: and applied to the next own transfer');
select is(public.forget_import_choice(tests.id('b'), 'own_transfer', 'own_transfer'), true, 'R-IMPORT-346: a remembered choice can be forgotten');
select is(public.forget_import_choice(tests.id('b'), 'own_transfer', 'own_transfer'), false, 'R-IMPORT-346: again: nothing to forget');
select is((select action from public.preview_import(tests.id('b'), null, '[{"date": "2026-11-12", "amount": 814, "direction": "debit", "hint": "own_transfer"}]')),
  'skip_flagged', 'R-IMPORT-346: the default applies again');

-- ===========================================================================
-- The rule preview (Q-271, R-IMPORT-347) and one batch by id (Q-275, R-IMPORT-348)
-- ===========================================================================
select count(*) from public.import_transactions(tests.id('b'), gen_random_uuid(), 1, '[
  {"date": "2026-11-10", "amount": 901, "direction": "debit", "description": "Kino Rex Bern"},
  {"date": "2026-11-10", "amount": 902, "direction": "debit", "description": "Kino Rex Thun"},
  {"date": "2026-11-10", "amount": 903, "direction": "debit", "description": "Bakery"}]', 'csv');
select is((select row(fragment, covered_by_rule_id, rule_exists, would_move)::text from public.preview_merchant_rule(tests.id('b'), 'Kino Rex', tests.id('fun'))),
  row('kino rex', null::uuid, false, 2)::text, 'R-IMPORT-347: a rule''s preview: its fragment, no rule covering it yet, and how many it would move');
select is((select moved from public.create_merchant_rule(tests.id('b'), 'Kino Rex', tests.id('fun'), true)), 2, 'R-IMPORT-347: the rule then moves that many');
select is((select row(covered_by_fragment, rule_exists)::text from public.preview_merchant_rule(tests.id('b'), 'kino rex thun')),
  row('kino rex', false)::text, 'R-IMPORT-347: a key already covered names the rule covering it');
select results_eq(format($$select id, imported_count from public.get_import_batch(%L)$$, tests.id('mbatch')),
  format($$select id, imported_count from public.list_import_batches(%L) where id = %L$$, tests.id('b'), tests.id('mbatch')),
  'R-IMPORT-348: one batch by its id, as the list gives it');
select tests.authenticate_as('hal');
select is(pg_temp.refusal(format('select * from public.get_import_batch(%L)', tests.id('mbatch'))), 'import_batch_not_found',
  'R-IMPORT-348: an outsider gets import_batch_not_found');
select is(pg_temp.refusal(format($$select public.forget_import_choice(%L, 'own_transfer', 'own_transfer')$$, tests.id('b'))), 'budget_not_found',
  'R-IMPORT-346: an outsider cannot forget a choice');
select is(pg_temp.refusal(format($$select * from public.preview_merchant_rule(%L, 'kino')$$, tests.id('b'))), 'budget_not_found',
  'R-IMPORT-347: nor preview a rule');
select tests.authenticate_as_anon();
select throws_ok(format('select * from public.get_import_batch(%L)', tests.id('mbatch')), '42501', null, 'R-IMPORT-348: an anonymous visitor cannot call it');
select throws_ok(format($$select * from public.preview_import_part(%L, %L, 1, '[]')$$, tests.id('b'), gen_random_uuid()), '42501', null,
  'R-IMPORT-340: nor preview a part');

-- ===========================================================================
-- Editing in "to categorise" (Q-273, R-CATEGORY-340)
-- ===========================================================================
select tests.authenticate_as('fay');
select tests.remember('bakery', (select id from public.transactions where description = 'Bakery' and budget_id = tests.id('b')));
select is((select row(description, review_state)::text from public.update_transaction(tests.id('bakery'), 1, 'expense', 950, '2026-11-10',
            (select category_id from public.transactions where id = tests.id('bakery')), 'Bakery, croissants', false, null, null)),
  row('Bakery, croissants', 'to_review')::text, 'R-CATEGORY-340: an import waiting in "to categorise" can be edited while it stays there');

-- ===========================================================================
-- A statement previewed in parts says what the write does (Q-270, Q-274, R-IMPORT-340)
-- ===========================================================================
-- existing: a typed transaction (a duplicate for part 1 and part 2, absorbed once), a charge-like
-- typed one (a match for part 2 and part 3); part 1 chooses to skip an own transfer, part 3
-- has the same own transfer with no choice
select count(*) from public.add_transaction(tests.id('b'), 'expense', 5555, '2026-11-05', tests.id('food'), 'Migros');
select count(*) from public.add_transaction(tests.id('b'), 'expense', 6666, '2026-11-08', tests.id('food'), 'Hand typed');
select tests.remember('stmt', gen_random_uuid());
create temp table parts (part integer, j jsonb) on commit drop;
insert into parts values
  (1, '[{"date": "2026-11-05", "amount": 5555, "direction": "debit", "description": "Migros"},
        {"date": "2026-11-06", "amount": 1717, "direction": "debit", "description": "Own move", "hint": "own_transfer", "action": "import"},
        {"date": "2026-11-06", "amount": 4242, "direction": "credit", "description": "Refund shop"}]'),
  (2, '[{"date": "2026-11-05", "amount": 5555, "direction": "debit", "description": "Migros"},
        {"date": "2026-11-09", "amount": 6666, "direction": "debit", "description": "Card 6666"}]'),
  (3, '[{"date": "2026-11-10", "amount": 6666, "direction": "debit", "description": "Card 6666 again"},
        {"date": "2026-11-07", "amount": 1818, "direction": "debit", "description": "Own move", "hint": "own_transfer"}]');
grant select on parts to authenticated;
create temp table previewed (part integer, answer jsonb) on commit drop;
grant select, insert on previewed to authenticated;
insert into previewed select p.part, public.preview_import_part(tests.id('b'), tests.id('stmt'), p.part, p.j) from parts as p order by p.part;
create temp table written (part integer, r public.import_row_result) on commit drop;
grant select, insert on written to authenticated;
do $$
declare
  p record;
begin
  for p in select * from parts order by part loop
    insert into written select p.part, x from public.import_transactions(tests.id('b'), tests.id('stmt'), p.part, p.j, 'csv') as x;
  end loop;
end $$;
select results_eq(
  $$select v.part, (e ->> 'row_no')::integer, e ->> 'action', e ->> 'category_source', (e ->> 'duplicate_of')::uuid, (e ->> 'match_of')::uuid,
           e ->> 'flag', e ->> 'remembered_choice'
    from previewed as v cross join lateral jsonb_array_elements(v.answer -> 'rows') as e order by 1, 2$$,
  $$select w.part, (w.r).row_no, (w.r).action, (w.r).category_source, (w.r).duplicate_of, (w.r).match_of, (w.r).flag, (w.r).remembered_choice
    from written as w order by 1, 2$$,
  'R-IMPORT-340: each part''s preview, taken with the parts before it, answers every row as the write then does');
select is((select array_agg(e ->> 'action' order by (e ->> 'row_no')::integer) from previewed as v, jsonb_array_elements(v.answer -> 'rows') as e where v.part = 2),
  array['import', 'skip_matched'], 'R-IMPORT-340: (the duplicate absorbed by part 1 is not offered to part 2 again)');
select is((select (answer -> 'statement')::text from previewed where part = 3),
  (select jsonb_build_object('rows', row_count, 'import', imported_count, 'skip_duplicate', duplicate_count, 'skip_flagged', flagged_count,
                             'skip_matched', matched_count, 'confirm_match', charges_confirmed_count, 'skip_chosen', chosen_skip_count,
                             'invalid', invalid_count, 'expense_count', 4, 'expense_amount', 1717 + 5555 + 6666 + 1818, 'refund_count', 1,
                             'refund_amount', 4242, 'extra_income_count', 0, 'extra_income_amount', 0)::text
   from public.get_import_batch(tests.id('stmt'))),
  'R-IMPORT-340: the statement''s totals equal the batch''s counts after the write, with the sums by kind (Q-274)');
select is((select array[(answer -> 'parts')::text, (answer ->> 'fits')] from previewed where part = 3), array['[1, 2, 3]', 'true'],
  'R-IMPORT-340: and say which parts they cover and whether they fit');
select is(pg_temp.refusal(format($$select public.preview_import_part(%L, %L, 1, '[{"date": "2026-11-05", "amount": 1, "direction": "debit"}]')$$,
                                 gen_random_uuid(), tests.id('stmt'))),
  'budget_not_found', 'R-IMPORT-340: (a budget of someone else: budget_not_found)');

-- Every new private table has row-level security (C-RLS-001 is checked for every schema in 01)
select tests.clear_authentication();
select is((select bool_and(c.relrowsecurity) from pg_class as c
           where c.oid in ('private.import_absorbed'::regclass, 'private.import_budget_usage'::regclass, 'private.import_preview_parts'::regclass)),
  true, 'C-RLS-001: the import''s private tables have row-level security');

select * from finish();
rollback;
