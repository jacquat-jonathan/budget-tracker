-- Step 6 review (F1 to F17): what a token can learn, tokens ending with their creator, bounded
-- storage, duplicates and matches counted per batch, frozen and linked transactions, the
-- preview of a batch not started, review states, clean error codes, the salary window, rolling
-- rate windows, token housekeeping, "to categorise", free text, paged reads, the batch's
-- bookkeeping, edited imports, merchant keys, and what the earlier tests left untested.
begin;
select plan(95);

select tests.create_user('ivy', 'Ivy');
select tests.create_user('jon', 'Jon');
select tests.create_user('kim', 'Kim');
select tests.create_user('lou', 'Lou');
select tests.create_user('max', 'Max');
select tests.set_today('2026-11-16');

-- error code and detail of a call
create function pg_temp.refusal(q text) returns text language plpgsql as $$
declare
  v_detail text;
begin
  execute q;
  return 'no error';
exception when others then
  get stacked diagnostics v_detail = pg_exception_detail;
  return sqlerrm || coalesce(' ' || nullif(v_detail, ''), '');
end $$;

select tests.authenticate_as('kim');
select tests.remember('kb', public.create_budget('Kim', 'Salary', 400000, 25, 'nearest', '2026-09-01'));
select tests.remember('kb_batch', gen_random_uuid());
select count(*) from public.import_transactions(tests.id('kb'), tests.id('kb_batch'), 1,
  '[{"date": "2026-11-12", "amount": 100, "direction": "debit", "description": "Kim shop"}]', 'csv');

select tests.authenticate_as('ivy');
select tests.remember('b', public.create_budget('Review', 'Salary', 612300, 25, 'nearest', '2026-09-01'));
select tests.remember('p1', (select id from public.periods where budget_id = tests.id('b') and seq = 1));
select tests.remember('p2', (select id from public.periods where budget_id = tests.id('b') and seq = 2));
select tests.remember('food', (select id from public.create_category(tests.id('b'), 'Food', p_amount => 60000, p_from_period_id => tests.id('p1'))));
select tests.remember('fun', (select id from public.create_category(tests.id('b'), 'Fun', p_from_period_id => tests.id('p1'))));
select count(*) from public.add_transaction(tests.id('b'), 'expense', 1250, '2026-11-10', tests.id('food'), 'Coop Bern');
select count(*) from public.add_transaction(tests.id('b'), 'expense', 3300, '2026-11-12', tests.id('food'), 'Kiosk');
select count(*) from public.create_merchant_rule(tests.id('b'), 'migros', tests.id('fun'));
create temp table tok on commit drop as select * from public.create_import_token(tests.id('b'), 'Script');
grant select on tok to anon, authenticated;
create function pg_temp.tok_call(p_rows jsonb, p_source text default 'script') returns text language sql as $$
  select format('%s/%s/%s/%s', x.received, x.refused, x.refused_rows, coalesce(x.error, '-'))
  from public.import_with_token((select token from tok), gen_random_uuid(), 1, p_rows, p_source) as x
$$;
select tests.clear_authentication();
create temp table answers (state text, answer text) on commit drop;
grant select, insert on answers to anon, authenticated;

-- ===========================================================================
-- F1: a token's answer does not depend on the budget (R-SECURITY-251)
-- ===========================================================================
select tests.authenticate_as_anon();
insert into answers values
  ('outside the periods', pg_temp.tok_call('[{"date": "2030-01-01", "amount": 5, "direction": "debit"}]')),
  ('a salary', pg_temp.tok_call('[{"date": "2026-10-26", "amount": 612300, "direction": "credit"}]')),
  ('a duplicate', pg_temp.tok_call('[{"date": "2026-11-10", "amount": 1250, "direction": "debit", "description": "Coop Bern"}]')),
  ('a possible match', pg_temp.tok_call('[{"date": "2026-11-13", "amount": 3300, "direction": "debit", "description": "KIOSK BAHNHOF"}]')),
  ('a rule', pg_temp.tok_call('[{"date": "2026-11-14", "amount": 880, "direction": "debit", "description": "Migros Lausanne"}]')),
  ('new, no "to categorise" yet', pg_temp.tok_call('[{"date": "2026-11-14", "amount": 777, "direction": "debit", "description": "Something"}]')),
  ('new, "to categorise" exists', pg_temp.tok_call('[{"date": "2026-11-14", "amount": 778, "direction": "debit", "description": "Else"}]'));
select results_eq($$select distinct answer from answers$$, $$values ('1/0/[]/-')$$,
  'R-SECURITY-251: a token gets the same answer for a new row, a duplicate, a match, a rule, a salary, a date outside the periods, with or without "to categorise"');
select is(pg_temp.tok_call('[{"date": "2026-11-14", "amount": 1.5, "direction": "debit"}]'), '0/1/[{"row": 1, "reason": "invalid_amount"}]/-',
  'R-SECURITY-251: and only the reasons that depend on the row sent');
select tests.clear_authentication();
select is((select count(*)::integer from pg_catalog.pg_proc where proname = 'import_with_token' and 'p_to_categorise_name' = any (proargnames)), 0,
  'R-SECURITY-251: a token cannot name "to categorise" (no such argument)');
select is((select name from public.categories where budget_id = tests.id('b') and is_to_categorise), 'To categorise',
  'R-SECURITY-251: a token import creates it under its fixed name');
-- the one coarse state of the budget's content: full, whatever the rows would become
create temp table n_tx on commit drop as select count(*)::integer as n from public.transactions where budget_id = tests.id('b');
do $$ begin
  execute format('create or replace function private.limit_transactions() returns integer language sql immutable set search_path = '''' as $f$ select %s $f$', (select n from n_tx));
end $$;
select tests.authenticate_as_anon();
insert into answers values
  ('full: duplicate', pg_temp.tok_call('[{"date": "2026-11-10", "amount": 1250, "direction": "debit", "description": "Coop Bern"}]')),
  ('full: new', pg_temp.tok_call('[{"date": "2026-11-14", "amount": 779, "direction": "debit", "description": "New"}]'));
select results_eq($$select distinct answer from answers where state like 'full%'$$, $$values ('0/0/[]/transaction_limit_reached')$$,
  'R-SECURITY-251 D-371: a full budget answers the same whatever the rows would become (no "fits" for a token)');
select tests.clear_authentication();
create or replace function private.limit_transactions() returns integer language sql immutable set search_path = '' as $f$ select 50000 $f$;

-- ===========================================================================
-- F10: every call counts, atomically, in rolling windows (R-SECURITY-252)
-- ===========================================================================
delete from private.import_token_usage where token_id = (select token_id from tok);
select tests.authenticate_as_anon();
select is(pg_temp.tok_call('[{"date": "2026-11-14", "amount": 5, "direction": "debit"}]', 'nonsense'), '0/0/[]/invalid_source',
  'R-SECURITY-252: a refused argument is answered in error');
select tests.clear_authentication();
select results_eq(format($$select sum(calls)::integer, sum(rows)::integer from private.import_token_usage where token_id = %L$$, (select token_id from tok)),
  $$values (1, 1)$$, 'R-SECURITY-252: and the call and its rows are counted all the same');
select ok((select last_used_at > now() - interval '1 minute' from public.import_tokens where id = (select token_id from tok)),
  'R-SECURITY-252: the token''s last use is recorded');
-- calls in the last 60 minutes
delete from private.import_token_usage where token_id = (select token_id from tok);
insert into private.import_token_usage values ((select token_id from tok), date_trunc('minute', clock_timestamp()) - interval '61 minutes', 30, 0),
                                              ((select token_id from tok), date_trunc('minute', clock_timestamp()) - interval '59 minutes', 59, 0);
select tests.authenticate_as_anon();
select is(pg_temp.tok_call('[{"date": "2026-11-14", "amount": 6, "direction": "debit"}]'), '1/0/[]/-',
  'R-SECURITY-252: the 60th call within 60 minutes passes (61 minutes ago no longer counts)');
select is(pg_temp.tok_call('[{"date": "2026-11-14", "amount": 7, "direction": "debit"}]'), '0/0/[]/token_rate_limited',
  'R-SECURITY-252: the 61st is refused');
select tests.clear_authentication();
-- calls in the last 24 hours
delete from private.import_token_usage where token_id = (select token_id from tok);
insert into private.import_token_usage values ((select token_id from tok), date_trunc('minute', clock_timestamp()) - interval '25 hours', 100, 0),
                                              ((select token_id from tok), date_trunc('minute', clock_timestamp()) - interval '23 hours', 299, 0);
select tests.authenticate_as_anon();
select is(pg_temp.tok_call('[{"date": "2026-11-14", "amount": 8, "direction": "debit"}]'), '1/0/[]/-',
  'R-SECURITY-252: the 300th call within 24 hours passes (25 hours ago no longer counts)');
select is(pg_temp.tok_call('[{"date": "2026-11-14", "amount": 9, "direction": "debit"}]'), '0/0/[]/token_rate_limited',
  'R-SECURITY-252: the 301st is refused');
select tests.clear_authentication();
-- rows in the last 60 minutes and the last 24 hours
delete from private.import_token_usage where token_id = (select token_id from tok);
insert into private.import_token_usage values ((select token_id from tok), date_trunc('minute', clock_timestamp()) - interval '10 minutes', 1, 4999);
select tests.authenticate_as_anon();
select is(pg_temp.tok_call('[{"date": "2026-11-14", "amount": 10, "direction": "debit"}, {"date": "2026-11-14", "amount": 11, "direction": "debit"}]'),
  '0/0/[]/token_rate_limited', 'R-SECURITY-252: at most 5000 rows within 60 minutes');
select is(pg_temp.tok_call('[{"date": "2026-11-14", "amount": 12, "direction": "debit"}]'), '1/0/[]/-',
  'R-SECURITY-252: one more row fits');
select tests.clear_authentication();
delete from private.import_token_usage where token_id = (select token_id from tok);
insert into private.import_token_usage values ((select token_id from tok), date_trunc('minute', clock_timestamp()) - interval '5 hours', 1, 19999);
select tests.authenticate_as_anon();
select is(pg_temp.tok_call('[{"date": "2026-11-14", "amount": 13, "direction": "debit"}, {"date": "2026-11-14", "amount": 14, "direction": "debit"}]'),
  '0/0/[]/token_rate_limited', 'R-SECURITY-252: at most 20 000 rows within 24 hours');
select tests.clear_authentication();
select results_eq(format($$select sum(calls)::integer from private.import_token_usage where token_id = %L$$, (select token_id from tok)),
  $$values (2)$$, 'R-SECURITY-252: a refused call is counted too (the one stored, and the refused one)');
delete from private.import_token_usage where token_id = (select token_id from tok);

-- a token import records the token, never the caller; no GET (R-SECURITY-254)
select tests.authenticate_as('kim');
select tests.remember('kbatch', gen_random_uuid());
select count(*) from public.import_with_token((select token from tok), tests.id('kbatch'), 1,
  '[{"date": "2026-11-14", "amount": 15, "direction": "debit", "description": "via kim"}]');
select tests.clear_authentication();
select results_eq(format($$select b.created_by, t.recorded_by from public.import_batches as b join public.transactions as t on t.import_batch_id = b.id
                          where b.id = %L$$, tests.id('kbatch')),
  $$values (null::uuid, null::uuid)$$, 'R-SECURITY-254: a signed-in caller using a token is not recorded (the batch names the token)');

-- ===========================================================================
-- F2: a token ends with its creator's membership (R-SECURITY-253)
-- ===========================================================================
select tests.authenticate_as('ivy');
select tests.remember('inv_jon', public.invite_member(tests.id('b'), tests.get_user_email('jon')));
select tests.remember('inv_lou', public.invite_member(tests.id('b'), tests.get_user_email('lou')));
select tests.remember('inv_max', public.invite_member(tests.id('b'), tests.get_user_email('max')));
select tests.authenticate_as('jon');
select public.accept_invitation(tests.id('inv_jon'));
create temp table tok_jon on commit drop as select * from public.create_import_token(tests.id('b'), 'Jon');
select tests.authenticate_as('lou');
select public.accept_invitation(tests.id('inv_lou'));
create temp table tok_lou on commit drop as select * from public.create_import_token(tests.id('b'), 'Lou');
select tests.authenticate_as('max');
select public.accept_invitation(tests.id('inv_max'));
create temp table tok_max on commit drop as select * from public.create_import_token(tests.id('b'), 'Max');
grant select on tok_jon, tok_lou, tok_max to anon;
select tests.authenticate_as('jon');
select public.leave_budget(tests.id('b'));
select tests.authenticate_as('ivy');
select public.remove_member(tests.id('b'), tests.get_user_id('lou'));
select tests.clear_authentication();
delete from auth.users where id = tests.get_user_id('max');
select tests.authenticate_as_anon();
select throws_ok(format($$select * from public.import_with_token(%L, gen_random_uuid(), 1, '[{"date": "2026-11-14", "amount": 1, "direction": "debit"}]')$$,
                        (select token from tok_jon)), 'P0001', 'invalid_token', 'R-SECURITY-253: a member who leaves ends their tokens');
select throws_ok(format($$select * from public.import_with_token(%L, gen_random_uuid(), 1, '[{"date": "2026-11-14", "amount": 1, "direction": "debit"}]')$$,
                        (select token from tok_lou)), 'P0001', 'invalid_token', 'R-SECURITY-253: so does a member removed');
select throws_ok(format($$select * from public.import_with_token(%L, gen_random_uuid(), 1, '[{"date": "2026-11-14", "amount": 1, "direction": "debit"}]')$$,
                        (select token from tok_max)), 'P0001', 'invalid_token', 'R-SECURITY-253: and a member whose account is deleted');
select is(pg_temp.tok_call('[{"date": "2026-11-14", "amount": 16, "direction": "debit"}]'), '1/0/[]/-',
  'R-SECURITY-253: the other members'' tokens still work');
select tests.clear_authentication();
select is((select count(*)::integer from public.import_tokens where id in ((select token_id from tok_jon), (select token_id from tok_lou), (select token_id from tok_max))
           and revoked_at is not null), 3, 'R-SECURITY-253: all three are recorded as revoked');

-- ===========================================================================
-- F11: tokens that can be used are limited; the others are deleted or pruned (R-IMPORT-256)
-- ===========================================================================
select tests.authenticate_as('ivy');
do $$ begin
  for i in 1..9 loop perform public.create_import_token(tests.id('b'), 'Extra ' || i); end loop;
end $$;
select throws_ok(format($$select * from public.create_import_token(%L, 'One too many')$$, tests.id('b')), 'P0001', 'token_limit_reached',
  'R-IMPORT-256: at most 10 tokens that can be used');
do $$ begin
  for i in 1..30 loop
    perform public.revoke_import_token((select id from public.import_tokens where budget_id = tests.id('b') and name <> 'Script' and revoked_at is null
                                        order by created_at, id limit 1));
    perform public.create_import_token(tests.id('b'), 'Cycle ' || i);
  end loop;
end $$;
select is((select count(*)::integer from public.import_token_list where budget_id = tests.id('b') and is_active), 10,
  'R-IMPORT-256: create and revoke as often as needed (30 cycles)');
select cmp_ok((select count(*)::integer from public.import_token_list where budget_id = tests.id('b') and not is_active), '<=', 21,
  'R-IMPORT-256: revoked tokens beyond the newest 20 are pruned');
select throws_ok(format($$select public.delete_import_token(%L)$$, (select token_id from tok)), 'P0001', 'token_active',
  'R-IMPORT-256: a token that can be used is revoked before it is deleted');
select public.revoke_import_token((select token_id from tok));
select lives_ok(format($$select public.delete_import_token(%L)$$, (select token_id from tok)), 'R-IMPORT-256: then it can be deleted');
select is((select token_name from public.list_import_batches(tests.id('b')) where id = tests.id('kbatch')), 'Script',
  'R-IMPORT-256: its batches keep its name');

-- ===========================================================================
-- F3: what is stored of a refused row is bounded; so is a call (R-IMPORT-250)
-- ===========================================================================
select tests.remember('big', gen_random_uuid());
select count(*) from public.import_transactions(tests.id('b'), tests.id('big'), 1,
  jsonb_build_array(jsonb_build_object('date', '2026-11-14', 'amount', 1, 'direction', 'debit', 'junk', repeat('j', 1000000),
                                       'description', repeat('d', 2000))), 'csv');
select results_eq(format($$select reason, detail, octet_length(row_data::text) < 4000, row_data -> 'unknown_keys', char_length(row_data ->> 'description')
                          from public.list_import_skipped_rows(%L)$$, tests.id('big')),
  $$values ('invalid', 'invalid_row', true, '["junk"]'::jsonb, 500)$$,
  'R-IMPORT-250: a refused row keeps its known keys within their limits and only the names of unknown keys');
select throws_ok(format($$select * from public.preview_import(%L, null, %L)$$, tests.id('b'),
                        jsonb_build_array(jsonb_build_object('date', '2026-11-14', 'amount', 1, 'direction', 'debit', 'junk', repeat('j', 2100000)))),
  'P0001', 'invalid_rows', 'R-IMPORT-250: a call of more than 2 MB is refused before any row is read');

-- ===========================================================================
-- F4: duplicates and matches are counted per batch (R-IMPORT-251)
-- ===========================================================================
select count(*) from public.add_transaction(tests.id('b'), 'expense', 1450, '2026-11-09', tests.id('food'), 'Coop Basel');
select tests.remember('d1', gen_random_uuid());
create temp table coop1 on commit drop as select '[{"date": "2026-11-09", "amount": 1450, "direction": "debit", "description": "Coop Basel"}]'::jsonb as j;
grant select on coop1 to authenticated;
select results_eq(format($$select action from public.import_transactions(%L, %L, 1, (select j from coop1), 'csv')
                          union all select action from public.import_transactions(%L, %L, 2, (select j from coop1), 'csv')$$,
                         tests.id('b'), tests.id('d1'), tests.id('b'), tests.id('d1')),
  $$values ('skip_duplicate'), ('import')$$,
  'R-IMPORT-251: one in the budget, two in the statement sent in two chunks: one skipped, one imported');
select is((select string_agg(action, ',') from public.import_transactions(tests.id('b'), tests.id('d1'), 2, (select j from coop1), 'csv')), 'import',
  'R-IMPORT-251: a chunk sent again answers the same');
-- two in the budget, three in the statement, the chunks out of order
select count(*) from public.add_transaction(tests.id('b'), 'expense', 990, '2026-11-08', tests.id('food'), 'Bakery');
select count(*) from public.add_transaction(tests.id('b'), 'expense', 990, '2026-11-08', tests.id('food'), 'Bakery');
select tests.remember('d2', gen_random_uuid());
select results_eq(format($$select x.chunk, x.action from public.import_transactions(%L, %L, 2, '[{"date": "2026-11-08", "amount": 990, "direction": "debit", "description": "Bakery"}]', 'csv') as x
                          union all
                          select x.chunk, x.action from public.import_transactions(%L, %L, 1, '[{"date": "2026-11-08", "amount": 990, "direction": "debit", "description": "Bakery"}, {"date": "2026-11-08", "amount": 990, "direction": "debit", "description": "Bakery"}]', 'csv') as x$$,
                         tests.id('b'), tests.id('d2'), tests.id('b'), tests.id('d2')),
  $$values (2, 'skip_duplicate'), (1, 'skip_duplicate'), (1, 'import')$$,
  'R-IMPORT-251: two in the budget, three in the statement, chunks out of order: two skipped, one imported');
-- a hand-typed transaction absorbs one row of a batch as its match, not one per chunk
select tests.remember('d3', gen_random_uuid());
select results_eq(format($$select action from public.import_transactions(%L, %L, 1, '[{"date": "2026-11-13", "amount": 3300, "direction": "debit", "description": "KIOSK"}]', 'csv')
                          union all select action from public.import_transactions(%L, %L, 2, '[{"date": "2026-11-11", "amount": 3300, "direction": "debit", "description": "KIOSK"}]', 'csv')$$,
                         tests.id('b'), tests.id('d3'), tests.id('b'), tests.id('d3')),
  $$values ('skip_matched'), ('import')$$,
  'R-IMPORT-251: a possible match absorbs one row of the batch, whatever the chunks');

-- ===========================================================================
-- Matches (R-IMPORT-261, Q-192): the nearest date, either way, same kind, within three days
-- ===========================================================================
select count(*) from public.add_transaction(tests.id('b'), 'expense', 4100, '2026-11-05', tests.id('food'), 'typed');
select results_eq(format($$select row_no, action from public.preview_import(%L, null, '[
  {"date": "2026-11-03", "amount": 4100, "direction": "debit", "description": "far"},
  {"date": "2026-11-06", "amount": 4100, "direction": "debit", "description": "near"}]') order by row_no$$, tests.id('b')),
  $$values (1, 'import'), (2, 'skip_matched')$$,
  'R-IMPORT-261: the row nearest in date gets the match, not the first in the file');
select results_eq(format($$select row_no, action from public.preview_import(%L, null, '[
  {"date": "2026-11-08", "amount": 4100, "direction": "debit"}, {"date": "2026-11-02", "amount": 4100, "direction": "debit"},
  {"date": "2026-11-09", "amount": 4100, "direction": "debit"}, {"date": "2026-11-05", "amount": 4100, "direction": "credit"}]') order by row_no$$, tests.id('b')),
  $$values (1, 'skip_matched'), (2, 'import'), (3, 'import'), (4, 'import')$$,
  'R-IMPORT-261: three days later or earlier match (four do not), and a refund never matches an expense');
select results_eq(format($$select row_no, action from public.preview_import(%L, null, '[
  {"date": "2026-11-02", "amount": 4100, "direction": "debit"}]')$$, tests.id('b')),
  $$values (1, 'skip_matched')$$, 'R-IMPORT-261: three days earlier matches too');

-- ===========================================================================
-- Duplicates (R-IMPORT-070, R-IMPORT-071): what makes one
-- ===========================================================================
select results_eq(format($$select row_no, action from public.preview_import(%L, null, '[
  {"date": "2026-11-10", "amount": 1250, "direction": "credit", "description": "Coop Bern"},
  {"date": "2026-11-10", "amount": 1250, "direction": "debit", "description": "Coop Zurich"}]') order by row_no$$, tests.id('b')),
  $$values (1, 'import'), (2, 'skip_matched')$$,
  'R-IMPORT-070: a duplicate has the same kind and the same description (another description is at most a possible match)');
select tests.remember('bk', gen_random_uuid());
select count(*) from public.import_transactions(tests.id('b'), tests.id('bk'), 1,
  '[{"date": "2026-11-07", "amount": 2200, "direction": "debit", "description": "Shop A", "bank_transaction_id": "TW-1"}]', 'csv');
select results_eq(format($$select row_no, action from public.preview_import(%L, null, '[
  {"date": "2026-11-11", "amount": 1, "direction": "credit", "description": "Other", "bank_transaction_id": "TW-1"},
  {"date": "2026-11-11", "amount": 1, "direction": "debit", "description": "Other", "bank_transaction_id": "TW-1"}]') order by row_no$$, tests.id('b')),
  $$values (1, 'import'), (2, 'skip_duplicate')$$,
  'R-IMPORT-071: the same bank id is a duplicate, of the same kind');
select results_eq(format($$select row_no, action, duplicate_of is not null from public.preview_import(%L, null, '[
  {"date": "2026-11-10", "amount": 1250, "direction": "debit", "description": "Coop Bern", "action": "import"},
  {"date": "2026-11-10", "amount": 1250, "direction": "debit", "description": "Coop Bern"}]') order by row_no$$, tests.id('b')),
  $$values (1, 'import', true), (2, 'skip_duplicate', true)$$,
  'R-IMPORT-070: a row imported by choice does not use up the transaction it duplicates');

-- ===========================================================================
-- F17: an edited import is still found (R-IMPORT-254)
-- ===========================================================================
select tests.remember('e1', gen_random_uuid());
select tests.remember('e1_tx', (select transaction_id from public.import_transactions(tests.id('b'), tests.id('e1'), 1,
  '[{"date": "2026-11-06", "amount": 1990, "direction": "debit", "description": "Cinema"}]', 'csv')));
select count(*) from public.update_transaction(tests.id('e1_tx'), 1, 'expense', 2000, '2026-11-07',
  (select id from public.categories where budget_id = tests.id('b') and is_to_categorise), 'Cinema with friends');
select is((select action from public.import_transactions(tests.id('b'), gen_random_uuid(), 1,
  '[{"date": "2026-11-06", "amount": 1990, "direction": "debit", "description": "Cinema"}]', 'csv')), 'skip_duplicate',
  'R-IMPORT-254: the same statement line after the member edited the import is a duplicate (compared as first imported)');

-- ===========================================================================
-- F6: a preview of a batch not started says what its first chunk does (R-IMPORT-252)
-- ===========================================================================
select count(*) from public.add_transaction(tests.id('b'), 'expense', 990, '2026-11-11', tests.id('food'), 'Kiosk 2');
create temp table pv on commit drop as
  select action, duplicate_of from public.preview_import(tests.id('b'), null, '[{"date": "2026-11-11", "amount": 990, "direction": "debit", "description": "Kiosk 2"}]');
grant select on pv to authenticated;
select results_eq($$select action, duplicate_of is not null from pv$$,
  format($$select action, duplicate_of is not null from public.import_transactions(%L, gen_random_uuid(), 1, '[{"date": "2026-11-11", "amount": 990, "direction": "debit", "description": "Kiosk 2"}]', 'csv')$$, tests.id('b')),
  'R-IMPORT-252: with no batch id the preview sees a hand-typed transaction as a duplicate, like the write');

-- ===========================================================================
-- F5: undo and rules leave linked and frozen transactions alone (R-IMPORT-260)
-- ===========================================================================
select tests.remember('loan', (select id from public.create_category(tests.id('b'), 'Loan', p_amount => 1500, p_from_period_id => tests.id('p1'))));
select tests.remember('b5', gen_random_uuid());
select tests.remember('pay', (select transaction_id from public.import_transactions(tests.id('b'), tests.id('b5'), 1,
  format('[{"date": "2026-11-16", "amount": 1500, "direction": "debit", "description": "loan payment", "category_id": "%s"},
          {"date": "2026-11-16", "amount": 1600, "direction": "debit", "description": "other"}]', tests.id('loan'))::jsonb, 'csv') where row_no = 1));
select tests.remember('debt', (select id from public.create_debt(tests.id('b'), 'Loan', 1500, tests.id('loan'), 1500)));
select count(*) from public.link_transaction(tests.id('pay'), (select revision from public.transactions where id = tests.id('pay')), p_debt_id => tests.id('debt'));
select public.remove_debt(tests.id('debt'), (select revision from public.debts where id = tests.id('debt')));
select results_eq(format($$select deleted, kept_confirmed, kept_linked from public.undo_import_batch(%L)$$, tests.id('b5')),
  $$values (1, 0, 1)$$, 'R-IMPORT-260: undo keeps a transaction linked to a debt (here a frozen payment) and says so');
select results_eq(format($$select paid_total, remaining from public.debt_overview where id = %L$$, tests.id('debt')),
  $$values (1500::bigint, 0::bigint)$$, 'R-IMPORT-260: the ended debt still shows its payment');
-- a rule never moves a linked transaction
select tests.remember('gymcat', (select id from public.create_category(tests.id('b'), 'Gym', p_from_period_id => tests.id('p1'))));
select tests.remember('gym', (select id from public.create_subscription(tests.id('b'), 'Gym', 4900, 'monthly', tests.id('gymcat'), '2026-12-15')));
select tests.remember('g1', (select transaction_id from public.import_transactions(tests.id('b'), gen_random_uuid(), 1,
  '[{"date": "2026-11-15", "amount": 4900, "direction": "debit", "description": "FITNESS PARK"}]', 'csv')));
select results_eq(format($$select review_state::text, in_to_categorise from public.link_transaction(%L, %s, p_subscription_id => %L)$$,
                         tests.id('g1'), (select revision from public.transactions where id = tests.id('g1')), tests.id('gym')),
  $$values ('to_review', true)$$, 'R-IMPORT-253: linking a transaction to review to a subscription leaves it to review');
select results_eq(format($$select moved from public.create_merchant_rule(%L, 'fitness park', %L, true)$$, tests.id('b'), tests.id('gymcat')),
  $$values (0)$$, 'R-IMPORT-260: a rule applied at once never moves a linked transaction');
select results_eq(format($$select review_state::text from public.update_transaction(%L, %s, 'expense', 4900, '2026-11-15', %L, null, true)$$,
                         tests.id('g1'), (select revision from public.transactions where id = tests.id('g1')), tests.id('gymcat')),
  $$values ('to_review')$$, 'R-IMPORT-253: nor does unlinking it with update_transaction');

-- ===========================================================================
-- F8: clean codes (R-IMPORT-262)
-- ===========================================================================
select results_eq(format($$select reason from public.preview_import(%L, null, '[{"date": "2026-11-10", "amount": 12.0, "direction": "debit"}]')$$, tests.id('b')),
  $$values ('invalid_amount')$$, 'R-IMPORT-262: a JSON number with a decimal point is invalid_amount for its row, never a raw error');
select throws_ok(format($$select * from public.import_transactions(%L, %L, 1, '[{"date": "2026-11-10", "amount": 1, "direction": "debit"}]', 'csv')$$,
                        tests.id('b'), tests.id('kb_batch')),
  'P0001', 'import_batch_conflict', 'R-IMPORT-262: another budget''s batch id is a clean refusal');
select throws_ok(format($$select * from public.import_transactions(%L, gen_random_uuid(), 1, '[{"date": "2026-11-10", "amount": 1, "direction": "debit"}]', 'csv', p_to_categorise_name => %L)$$,
                        tests.id('b'), repeat('x', 101)),
  'P0001', 'invalid_name', 'R-IMPORT-262: a bad name for "to categorise" is refused first, whatever the rows');
select tests.clear_authentication();
create temp table n_tx2 on commit drop as select count(*)::integer as n from public.transactions where budget_id = tests.id('b');
do $$ begin
  execute format('create or replace function private.limit_transactions() returns integer language sql immutable set search_path = '''' as $f$ select %s $f$', (select n + 1 from n_tx2));
end $$;
select tests.authenticate_as('ivy');
select is(pg_temp.refusal(format($$select * from public.import_transactions(%L, gen_random_uuid(), 1, '[{"date": "2026-11-10", "amount": 31, "direction": "debit"}, {"date": "2026-11-10", "amount": 32, "direction": "debit"}]', 'csv')$$, tests.id('b'))),
  'transaction_limit_reached {"fits" : 1}', 'R-IMPORT-208: a member is told how many rows would fit');
select tests.clear_authentication();
create or replace function private.limit_transactions() returns integer language sql immutable set search_path = '' as $f$ select 50000 $f$;
select tests.authenticate_as('ivy');

-- ===========================================================================
-- F9: a salary within five days either side of a period start (R-IMPORT-259)
-- ===========================================================================
select tests.remember('side', public.add_income(tests.id('b'), 'Side', 100000, 1, 'nearest', null, tests.id('p1')));
select public.update_income(tests.id('side'), 1, p_amount => 120000);
select results_eq(format($$select row_no, flag from public.preview_import(%L, null, '[
  {"date": "2026-10-21", "amount": 612300, "direction": "credit"},
  {"date": "2026-10-20", "amount": 612300, "direction": "credit"},
  {"date": "2026-10-31", "amount": 612300, "direction": "credit"},
  {"date": "2026-11-01", "amount": 612300, "direction": "credit"},
  {"date": "2026-10-27", "amount": 100000, "direction": "credit"},
  {"date": "2026-10-27", "amount": 120000, "direction": "credit"},
  {"date": "2026-09-27", "amount": 100000, "direction": "credit"}]') order by row_no$$, tests.id('b')),
  $$values (1, 'salary'), (2, null::text), (3, 'salary'), (4, null), (5, null), (6, 'salary'), (7, 'salary')$$,
  'R-IMPORT-259: five days before the next period''s start or after a period''s start (not six), at the income''s amount in that period');

-- ===========================================================================
-- F12: "to categorise" holds imports to review only (R-CATEGORY-250)
-- ===========================================================================
select tests.remember('tc', (select id from public.categories where budget_id = tests.id('b') and is_to_categorise));
select throws_ok(format($$select * from public.add_transaction(%L, 'expense', 100, '2026-11-10', %L)$$, tests.id('b'), tests.id('tc')),
  'P0001', 'category_to_categorise', 'R-CATEGORY-250: no hand-typed transaction in "to categorise"');
select tests.remember('typed', (select id from public.add_transaction(tests.id('b'), 'expense', 101, '2026-11-10', tests.id('food'))));
select throws_ok(format($$select * from public.update_transaction(%L, 1, 'expense', 101, '2026-11-10', %L)$$, tests.id('typed'), tests.id('tc')),
  'P0001', 'category_to_categorise', 'R-CATEGORY-250: none moved into it');
select throws_ok(format($$select * from public.create_subscription(%L, 'X', 100, 'monthly', %L, '2026-12-01')$$, tests.id('b'), tests.id('tc')),
  'P0001', 'category_to_categorise', 'R-CATEGORY-250: no subscription on it');
select throws_ok(format($$select * from public.create_debt(%L, 'X', 100, %L, 10)$$, tests.id('b'), tests.id('tc')),
  'P0001', 'category_to_categorise', 'R-CATEGORY-250: no debt on it');
select tests.remember('acc1', (select id from public.create_account(tests.id('b'), 'A', 'current')));
select tests.remember('acc2', (select id from public.create_account(tests.id('b'), 'B', 'savings')));
select throws_ok(format($$select * from public.create_transfer(%L, 'X', %L, %L, 100, 'pay_date', p_category_id => %L)$$, tests.id('b'), tests.id('acc1'), tests.id('acc2'), tests.id('tc')),
  'P0001', 'category_to_categorise', 'R-CATEGORY-250: no planned transfer on it');
select throws_ok(format($$select * from public.create_merchant_rule(%L, 'zzz', %L)$$, tests.id('b'), tests.id('tc')),
  'P0001', 'category_to_categorise', 'R-CATEGORY-250: no rule to it');
select is((select is_to_categorise from public.category_overview where id = tests.id('tc')), true,
  'R-CATEGORY-250: category_overview flags it');
select tests.clear_authentication();
create or replace function private.limit_active_categories() returns integer language sql immutable set search_path = ''
  as $f$ select (select count(*)::integer from public.categories where budget_id = tests.id('b') and end_seq is null and not is_to_categorise) + 1 $f$;
select tests.authenticate_as('ivy');
select lives_ok(format($$select public.create_category(%L, 'Last one')$$, tests.id('b')),
  'R-CATEGORY-250 Q-190: it does not count towards the categories in force');
select tests.clear_authentication();
create or replace function private.limit_active_categories() returns integer language sql immutable set search_path = '' as $f$ select 200 $f$;
select tests.authenticate_as('ivy');

-- ===========================================================================
-- F13: free text, one way everywhere (R-SECURITY-250)
-- ===========================================================================
select results_eq(format($$select description, merchant_key from public.preview_import(%L, null,
  jsonb_build_array(jsonb_build_object('date', '2026-11-10', 'amount', 4321, 'direction', 'debit',
    'description', E'  Caf\u200Be\tdu\u202E  Lac\u0007 ', 'merchant', E'\u00A0Café\u2066 du Lac'))) $$, tests.id('b')),
  $$values ('Cafe du Lac', 'cafe du lac')$$,
  'R-SECURITY-250: control, bidirectional and zero-width characters go, other white space is one space');
select is((select name from public.create_category(tests.id('b'), E'Fun\u200F  stuff\n')), 'Fun stuff',
  'R-SECURITY-250: names too (every step''s names)');
select tests.remember('ws', gen_random_uuid());
select count(*) from public.import_transactions(tests.id('b'), tests.id('ws'), 1,
  jsonb_build_array(jsonb_build_object('date', '2026-11-10', 'amount', 4322, 'direction', 'debit', 'description', 'Details',
    'details', jsonb_build_object('location', E'Bern\u200E', 'card', E' 1234\u200B ', 'fee', 25))), 'csv');
select is((select details from public.transaction_list where import_batch_id = tests.id('ws')),
  '{"card": "1234", "fee": 25, "location": "Bern"}'::jsonb,
  'R-SECURITY-250: details are normalised (strings cleaned, keys in order)');
select results_eq(format($$select action from public.preview_import(%L, null,
  jsonb_build_array(jsonb_build_object('date', '2026-11-10', 'amount', 1250, 'direction', 'debit', 'description', E'Coop\u200B  Bern')))$$, tests.id('b')),
  $$values ('skip_duplicate')$$, 'R-SECURITY-250: before the duplicate comparison');

-- ===========================================================================
-- Merchant keys (R-IMPORT-255)
-- ===========================================================================
select tests.clear_authentication();
select results_eq($$select private.merchant_key(m, d) from (values
  ('amazon.de*AB12CD', null), ('ACHAT TWINT Migros', null), ('PAYUP *SHOP', null), ('Москва Кафе', null),
  ('Straße Œuvre', null), ('!!!', 'Bäckerei Zürich')) as v (m, d)$$,
  $$values ('amazon.de'), ('migros'), ('shop'), ('москва кафе'), ('strasse oeuvre'), ('backerei zurich')$$,
  'R-IMPORT-255: a reference after the merchant, statement words, a processor prefix, any script, ß and œ, an empty merchant');
select is((select count(*)::integer from (values ('ACHAT TWINT Migros'), ('amazon.de*AB12CD'), ('SQ *COFFEE BAR 12'), ('credit twint achat x'),
                                                 ('PAYPAL *STEAM 4029357733'), ('twint')) as v (m)
           where private.merchant_key(private.merchant_key(m, null), null) is distinct from private.merchant_key(m, null)), 0,
  'R-IMPORT-255: the key of a key is itself');
select tests.authenticate_as('ivy');

-- ===========================================================================
-- F15: the batch's bookkeeping after "import anyway" (R-IMPORT-258)
-- ===========================================================================
select tests.remember('f15', gen_random_uuid());
select count(*) from public.import_transactions(tests.id('b'), tests.id('f15'), 1, '[
  {"date": "2026-11-10", "amount": 1250, "direction": "debit", "description": "Coop Bern"},
  {"date": "2026-11-14", "amount": 55, "direction": "debit", "description": "new one"},
  {"date": "2026-11-14", "amount": 56, "direction": "debit", "action": "skip"},
  {"date": "2026-11-14", "amount": 57, "direction": "debit", "action": "nope"}]', 'csv');
select count(*) from public.import_transactions(tests.id('b'), tests.id('f15'), 2, '[
  {"date": "2026-11-14", "amount": 58, "direction": "debit", "action": "skip"}]', 'csv');
create temp table anyway on commit drop as select chunk, row_no, action, transaction_id from public.import_skipped_anyway(tests.id('f15'));
grant select on anyway to authenticated;
select results_eq($$select chunk, row_no, action from anyway order by chunk, row_no$$,
  $$values (1, 1, 'import'), (1, 3, 'import'), (2, 1, 'import')$$,
  'R-IMPORT-258: rows imported anyway answer with their own chunk and row number');
select results_eq(format($$select row_count, imported_count + duplicate_count + flagged_count + matched_count + chosen_skip_count + invalid_count,
                                 imported_count, chosen_skip_count, duplicate_count
                          from public.list_import_batches(%L) where id = %L$$, tests.id('b'), tests.id('f15')),
  $$values (5, 5, 4, 0, 0)$$, 'R-IMPORT-258: the batch''s counts still add up to the rows received');
select public.delete_transaction((select transaction_id from anyway where chunk = 2), 1);
select results_eq(format($$select chunk, row_no, action from public.import_skipped_anyway(%L)$$, tests.id('f15')),
  $$values (2, 1, 'import')$$, 'R-IMPORT-258: a row whose transaction was deleted can be imported anyway again');
select is((select imported_count from public.list_import_batches(tests.id('b')) where id = tests.id('f15')), 4,
  'R-IMPORT-258: without counting it twice');

-- ===========================================================================
-- F14: paged reads only; remembered choices bounded (R-IMPORT-257)
-- ===========================================================================
select throws_ok('select count(*) from public.import_batches', '42501', null, 'R-IMPORT-257: members read batches through list_import_batches only');
select throws_ok('select count(*) from public.import_skipped_rows', '42501', null, 'R-IMPORT-257: skipped rows through list_import_skipped_rows only');
select throws_ok('select count(*) from public.import_choices', '42501', null, 'R-IMPORT-257: remembered choices through list_import_choices only');
select tests.clear_authentication();
create or replace function private.limit_import_choices() returns integer language sql immutable set search_path = '' as $f$ select 2 $f$;
select tests.authenticate_as('ivy');
select count(*) from public.import_transactions(tests.id('b'), gen_random_uuid(), 1, '[
  {"date": "2026-11-14", "amount": 61, "direction": "debit", "description": "Ann", "hint": "own_transfer"},
  {"date": "2026-11-14", "amount": 62, "direction": "debit", "description": "Ben", "hint": "own_transfer"},
  {"date": "2026-11-14", "amount": 63, "direction": "debit", "description": "Cal", "hint": "own_transfer"}]', 'csv');
select is((select count(*)::integer from public.list_import_choices(tests.id('b'))), 2,
  'R-IMPORT-257: at most the stated number of remembered choices are kept');
select is((select count(*)::integer from public.list_import_choices(tests.id('b'), 1)), 1, 'R-IMPORT-257: read a page at a time');
select tests.clear_authentication();
create or replace function private.limit_import_choices() returns integer language sql immutable set search_path = '' as $f$ select 1000 $f$;
-- a token's flagged rows remember nothing
select tests.authenticate_as('ivy');
create temp table tok5 on commit drop as select * from public.create_import_token(tests.id('b'), 'Five');
grant select on tok5 to anon;
select tests.authenticate_as_anon();
select count(*) from public.import_with_token((select token from tok5), gen_random_uuid(), 1,
  '[{"date": "2026-11-14", "amount": 64, "direction": "debit", "description": "Dee", "hint": "own_transfer"}]');
select tests.clear_authentication();
select is((select count(*)::integer from public.import_choices where budget_id = tests.id('b') and counterparty_key = 'dee'), 0,
  'D-314: a token''s import remembers no choice');
select tests.authenticate_as('ivy');

-- ===========================================================================
-- Rules and review: what the earlier tests left untested
-- ===========================================================================
select tests.remember('oldcat', (select id from public.create_category(tests.id('b'), 'Old', p_from_period_id => tests.id('p1'))));
select public.end_category(tests.id('oldcat'), 1);
select throws_ok(format($$select * from public.create_merchant_rule(%L, 'oldshop', %L)$$, tests.id('b'), tests.id('oldcat')),
  'P0001', 'category_ended', 'R-IMPORT-202: a rule''s category is not ended');
select tests.clear_authentication();
create or replace function private.limit_merchant_rules() returns integer language sql immutable set search_path = ''
  as $f$ select (select count(*)::integer from public.merchant_rules where budget_id = tests.id('b')) $f$;
select tests.authenticate_as('ivy');
select throws_ok(format($$select * from public.create_merchant_rule(%L, 'onemore', %L)$$, tests.id('b'), tests.id('fun')),
  'P0001', 'merchant_rule_limit_reached', 'R-IMPORT-202: at most 500 rules a budget');
select tests.clear_authentication();
create or replace function private.limit_merchant_rules() returns integer language sql immutable set search_path = '' as $f$ select 500 $f$;
select tests.authenticate_as('ivy');
-- a rule moves only where its category is in force on the transaction's date
select tests.remember('late', (select id from public.create_category(tests.id('b'), 'Late')));
select tests.remember('tx_p1', (select transaction_id from public.import_transactions(tests.id('b'), gen_random_uuid(), 1,
  '[{"date": "2026-10-10", "amount": 71, "direction": "debit", "description": "Laterie"}, {"date": "2026-11-10", "amount": 72, "direction": "debit", "description": "Laterie"}]', 'csv')
  where row_no = 1));
select results_eq(format($$select moved from public.create_merchant_rule(%L, 'laterie', %L, true)$$, tests.id('b'), tests.id('late')),
  $$values (1)$$, 'R-IMPORT-202: a rule applied at once moves only where its category is in force on the date');
select tests.remember('rule_id', (select id from public.merchant_rules where budget_id = tests.id('b') and fragment = 'laterie'));
-- confirm_imports: one batch only, one budget only
select tests.remember('cb1', gen_random_uuid());
select tests.remember('cb2', gen_random_uuid());
select count(*) from public.import_transactions(tests.id('b'), tests.id('cb1'), 1, format('[{"date": "2026-11-14", "amount": 81, "direction": "debit", "category_id": "%s"}]', tests.id('food'))::jsonb, 'csv');
select count(*) from public.import_transactions(tests.id('b'), tests.id('cb2'), 1, format('[{"date": "2026-11-14", "amount": 82, "direction": "debit", "category_id": "%s"}]', tests.id('food'))::jsonb, 'csv');
select results_eq(format($$select confirmed from public.confirm_imports(%L, %L)$$, tests.id('b'), tests.id('cb1')), $$values (1)$$,
  'R-IMPORT-209: confirming one batch confirms that batch');
select is((select review_state::text from public.transaction_list where import_batch_id = tests.id('cb2')), 'to_review',
  'R-IMPORT-209: and not another');
select count(*) from public.confirm_imports(tests.id('b'));
select tests.clear_authentication();
select is((select review_state::text from public.transactions where import_batch_id = tests.id('kb_batch')), 'to_review',
  'R-SECURITY-002: confirming all of one budget never touches another''s');
-- the rule calls of another user
select tests.authenticate_as('kim');
select throws_ok(format($$select * from public.update_merchant_rule(%L, 1, 'x')$$, tests.id('rule_id')), 'P0001', 'merchant_rule_not_found',
  'R-SECURITY-004: another user cannot change a rule (by its id)');
select throws_ok(format($$select public.delete_merchant_rule(%L, 1)$$, tests.id('rule_id')), 'P0001', 'merchant_rule_not_found',
  'R-SECURITY-004: nor delete it');
select throws_ok(format($$insert into public.merchant_rules (budget_id, fragment, category_id) values (%L, 'x', %L)$$, tests.id('kb'), tests.id('fun')),
  '42501', null, 'R-SECURITY-002: every write is an RPC (no direct insert)');
select tests.authenticate_as_anon();
select throws_ok(format($$select * from public.list_import_batches(%L)$$, tests.id('b')), '42501', null,
  'R-SECURITY-200: a visitor cannot list batches');
select tests.clear_authentication();
-- tokens refused before the lock: a budget far behind still answers invalid_token
select tests.authenticate_as('ivy');
select public.revoke_import_token((select id from public.import_tokens where budget_id = tests.id('b') and name like 'Cycle%' and revoked_at is null limit 1));
create temp table tok6 on commit drop as select * from public.create_import_token(tests.id('b'), 'Six');
grant select on tok6 to anon;
select public.revoke_import_token((select token_id from tok6));
select tests.clear_authentication();
select tests.set_today('2066-11-16');
select tests.authenticate_as_anon();
select throws_ok(format($$select * from public.import_with_token(%L, gen_random_uuid(), 1, '[{"date": "2026-11-14", "amount": 1, "direction": "debit"}]')$$,
                        (select token from tok6)), 'P0001', 'invalid_token',
  'R-IMPORT-205: a revoked token is refused before any lock or catch-up');
select is((select error from public.import_with_token((select token from tok5), gen_random_uuid(), 1, '[{"date": "2026-11-14", "amount": 1, "direction": "debit"}]')),
  'catching_up', 'R-SECURITY-251 D-371: a valid token on a budget far behind is told catching_up (the other coarse state)');
select tests.clear_authentication();
select tests.set_today('2026-11-16');
update public.import_tokens set expires_at = now() - interval '1 second' where id = (select token_id from tok5);
select is((select private.token_by_id((select token_id from tok5)) is null), true,
  'R-IMPORT-205: a token that expired while its call waited is refused after the lock too');

-- ===========================================================================
-- Mutants that survived the first run (the reviewer's mutate6.py, ported)
-- ===========================================================================
select tests.authenticate_as('ivy');
select tests.remember('b2', public.create_budget('Second', 'Salary', 500000, 25, 'nearest', '2026-10-01'));
create temp table tok7 on commit drop as select * from public.create_import_token(tests.id('b2'), 'Seven');
grant select on tok7 to anon;
select tests.clear_authentication();
insert into private.import_token_usage (token_id, minute, calls, rows)
values ((select token_id from tok7), date_trunc('minute', now()) - interval '25 hours', 7, 70);
select tests.authenticate_as_anon();
select count(*) from public.import_with_token((select token from tok7), gen_random_uuid(), 1,
  '[{"date": "2026-11-14", "amount": 11, "direction": "debit"}, {"date": "2026-11-14", "amount": 12, "direction": "debit"}]');
select count(*) from public.import_with_token((select token from tok7), gen_random_uuid(), 1,
  '[{"date": "2026-11-14", "amount": 13, "direction": "debit"}, {"date": "2026-11-14", "amount": 14, "direction": "debit"}, {"date": "2026-11-14", "amount": 15, "direction": "debit"}]');
select tests.clear_authentication();
select results_eq(format($$select sum(calls)::integer, sum(rows)::integer from private.import_token_usage where token_id = %L$$, (select token_id from tok7)),
  $$values (2, 5)$$, 'R-SECURITY-252: two calls in the same minute count two calls and all their rows; minutes older than 24 hours are pruned');
-- each of the three ways a token ends with its creator holds on its own
update public.import_tokens set created_by = tests.get_user_id('kim') where id = (select token_id from tok7);
select is(private.token_usable((select t from public.import_tokens as t where t.id = (select token_id from tok7))), false,
  'R-SECURITY-253: a token whose creator is not a member of its budget cannot be used, even unrevoked');
update public.import_tokens set created_by = null where id = (select token_id from tok7);
select isnt((select revoked_at from public.import_tokens where id = (select token_id from tok7)), null,
  'R-SECURITY-253: a token whose creator is gone (account deleted) is revoked');
-- confirm all stays in its budget
select tests.authenticate_as('ivy');
select tests.remember('b2food', (select id from public.create_category(tests.id('b2'), 'Food')));
select count(*) from public.import_transactions(tests.id('b2'), gen_random_uuid(), 1,
  format('[{"date": "2026-11-14", "amount": 16, "direction": "debit", "category_id": "%s"}]', tests.id('b2food'))::jsonb, 'csv');
select count(*) from public.confirm_imports(tests.id('b'));
select is((select count(*)::integer from public.transaction_list where budget_id = tests.id('b2') and review_state = 'to_review'), 6,
  'R-IMPORT-209: confirming all of one budget leaves another budget''s imports to review');
-- a salary a few days before the next period's start, that period not created yet (projected)
select tests.clear_authentication();
select tests.set_today('2026-11-22');
select tests.authenticate_as('ivy');
select is((select flag from public.preview_import(tests.id('b2'), null, '[{"date": "2026-11-21", "amount": 500000, "direction": "credit"}]')),
  'salary', 'R-IMPORT-259: four days before the projected start of a period that does not exist yet');
select tests.clear_authentication();
select tests.set_today('2026-11-16');

-- a read-only call (what PostgREST runs for a GET) is refused before the token is looked at; last,
-- since the rest of the transaction stays read-only (the test's own temporary tables excepted)
select tests.authenticate_as_anon();
set local transaction_read_only = on;
select throws_ok(format($$select * from public.import_with_token(%L, gen_random_uuid(), 1, '[{"date": "2026-11-14", "amount": 1, "direction": "debit"}]')$$,
                        (select token from tok6)),
  'P0001', 'read_only_call', 'R-SECURITY-254: a read-only call (a GET) is refused before the token is looked at');

select * from finish();
rollback;
