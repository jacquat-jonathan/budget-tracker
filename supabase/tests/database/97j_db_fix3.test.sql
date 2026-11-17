-- The last database fix round (re-check 3 at a8db050): a period's key is never compared with a
-- date (must-fix 1, R-ACCOUNT-420, R-ACCOUNT-421), the step 7 and import should-fixes, the
-- screens' asks (Q-300, Q-301) and the tests the reviewer's surviving mutants asked for.
begin;
select no_plan();

select tests.create_user('jade', 'Jade');
select tests.create_user('jules', 'Jules');
select tests.create_user('juno', 'Juno');
select tests.set_today('2026-11-16');
select tests.authenticate_as('jade');

create function pg_temp.day(d date, who text default 'jade') returns void language plpgsql as $$
begin
  perform tests.clear_authentication();
  perform tests.set_today(d);
  perform tests.authenticate_as(who);
end $$;
-- a budget paid on p_day, started in September 2026, with Main, Savings and the category Saving
create function pg_temp.budget(n text, p_day integer default 25) returns void language plpgsql as $$
declare
  b uuid;
  p1 uuid;
begin
  b := public.create_budget('Budget ' || n, 'Salary', 600000, p_day, 'none', '2026-09-01');
  p1 := (select id from public.periods where budget_id = b and seq = 1);
  perform tests.remember(n, b);
  perform tests.remember(n || '_p1', p1);
  perform tests.remember(n || '_inc', (select primary_income_id from public.budgets where id = b));
  perform tests.remember(n || '_main', (select id from public.create_account(b, 'Main', 'current', p_from_period_id => p1)));
  perform tests.remember(n || '_sav', (select id from public.create_account(b, 'Savings', 'savings', p_from_period_id => p1)));
  perform tests.remember(n || '_cat', (select id from public.create_category(b, 'Saving', p_amount => 100000, p_from_period_id => p1)));
end $$;
create function pg_temp.cur(n text) returns public.periods language sql as $$
  select p.* from public.periods as p
  where p.budget_id = tests.id(n) and (select public.get_today()) between p.start_date and p.end_date $$;
create function pg_temp.period_at(n text, d date) returns uuid language sql as $$
  select id from public.periods where budget_id = tests.id(n) and d between start_date and end_date $$;
-- every period of a budget with its checklist rows of one transfer: key, due date, status, planned
create function pg_temp.rows(n text, t uuid) returns table (seq integer, start_date date, rows text) language sql as $$
  select p.seq, p.start_date,
         coalesce((select string_agg(c.occurrence_date || '/' || coalesce(c.due_date::text, '-') || '/' || c.status
                                     || case when c.planned then '' else '/unplanned' end, ';' order by c.occurrence_date)
                   from public.get_transfer_checklist(p.id) as c where c.transfer_id = t), '')
  from public.periods as p where p.budget_id = tests.id(n) order by p.seq $$;
create function pg_temp.txs(t uuid) returns text language sql as $$
  select coalesce(string_agg(x.date::text, ',' order by x.date), '') from public.transaction_list as x where x.transfer_id = t $$;
create function pg_temp.new_transfer(n text, name text, p_auto boolean default true, p_from uuid default null)
returns uuid language sql as $$
  select id from public.create_transfer(tests.id(n), name, tests.id(n || '_main'), tests.id(n || '_sav'), 100000, 'pay_date',
    p_is_automatic => p_auto, p_category_id => tests.id(n || '_cat'), p_from_period_id => p_from) $$;

-- ===========================================================================
-- Must-fix 1, A: an early salary; a transfer made two days later from today records nothing
-- dated before that day (R-ACCOUNT-420, D-493)
-- ===========================================================================
select pg_temp.day('2026-11-20');
select pg_temp.budget('a');
select public.record_early_pay_date(tests.id('a'), (pg_temp.cur('a')).id, (pg_temp.cur('a')).revision, '2026-11-20');
select pg_temp.day('2026-11-22');
select results_eq(
  format($$select occurrence_date, due_date, created_at_once, created_at_once_count
           from public.preview_create_transfer(%L, %L, %L, 100000, 'pay_date', p_is_automatic => true,
                                               p_category_id => %L, p_count => 1)$$,
         tests.id('a'), tests.id('a_main'), tests.id('a_sav'), tests.id('a_cat')),
  $$values ('2026-12-25'::date, '2026-12-25'::date, false, 0)$$,
  'R-ACCOUNT-420: a salary recorded early on 20 Nov (keyed 25 Nov): made on 22 Nov from today, the preview creates nothing');
select tests.remember('a_t', pg_temp.new_transfer('a', 'Savings on payday'));
select tests.model_made_from_today(tests.id('a_t'));
select is(pg_temp.txs(tests.id('a_t')), '', 'R-ACCOUNT-420: no transaction dated 20 Nov, before the day it was made');
select is((select rows from pg_temp.rows('a', tests.id('a_t')) where start_date = '2026-11-20'), '',
  'R-ACCOUNT-420: the current period lists no occurrence: its salary came before the first counted day');
select is((select next_due_date from public.transfer_overview where id = tests.id('a_t')), '2026-12-25'::date,
  'R-ACCOUNT-420: its first occurrence is the next payday');
-- naming the period asks for its salary: recorded at once, dated the day it came
select tests.remember('a_t2', pg_temp.new_transfer('a', 'Asked for', p_from => (pg_temp.cur('a')).id));
select is(pg_temp.txs(tests.id('a_t2')), '2026-11-20', 'R-ACCOUNT-420: naming the period records its salary''s transfer, dated 20 Nov');
select is_empty(format($$select * from tests.moneyflow_violations(%L)$$, tests.id('a')), 'R-ACCOUNT-420: the model agrees (A)');

-- ===========================================================================
-- B: after a change of pay day every key is the next payday; a transfer made from today on 20 Jan
-- records nothing dated 5 Jan, and a manual one is not to do (R-ACCOUNT-420)
-- ===========================================================================
select pg_temp.day('2026-12-05');
select pg_temp.budget('b');
select public.update_income(tests.id('b_inc'), (select revision from public.incomes where id = tests.id('b_inc')), p_pay_day => 5,
  p_previewed_end_date => (select end_date from public.preview_update_income(tests.id('b_inc'), p_pay_day => 5)));
select public.record_early_pay_date(tests.id('b'), (pg_temp.cur('b')).id, (pg_temp.cur('b')).revision, '2026-12-05');
select pg_temp.day('2027-01-20');
select public.ensure_periods(tests.id('b'));
select results_eq(format($$select start_date, pay_key from public.periods where budget_id = %L and seq >= 4 order by seq$$, tests.id('b')),
  $$values ('2026-12-05'::date, '2027-01-05'::date), ('2027-01-05', '2027-02-05')$$,
  'R-ACCOUNT-420: (setup) the period starting 5 Jan is keyed 5 Feb');
select tests.remember('b_t', pg_temp.new_transfer('b', 'Savings on payday'));
select tests.model_made_from_today(tests.id('b_t'));
select is(pg_temp.txs(tests.id('b_t')), '', 'R-ACCOUNT-420: no transaction dated 5 Jan for a transfer made on 20 Jan');
select tests.remember('b_m', pg_temp.new_transfer('b', 'Manual on payday', false));
select tests.model_made_from_today(tests.id('b_m'));
select is((select count(*)::integer from public.get_transfer_checklist((pg_temp.cur('b')).id) where transfer_id = tests.id('b_m')), 0,
  'R-ACCOUNT-420: a manual one is not to do, let alone overdue, for a payday before it was made');
select results_eq(format($$select transfers_to_do, transfers_overdue from public.get_transfers_to_do(%L)$$, tests.id('b')),
  $$values (0, 0)$$, 'R-ACCOUNT-420: the dashboard counts nothing to do');
select is_empty(format($$select * from tests.moneyflow_violations(%L)$$, tests.id('b')), 'R-ACCOUNT-420: the model agrees (B)');

-- ===========================================================================
-- C: the same budget; made on 6 Feb naming its period, then reopened: the reopened period's own
-- payday (5 Jan, keyed 5 Feb) is not planned; the salary recorded on 8 Feb gives one transaction
-- ===========================================================================
select pg_temp.day('2027-02-06');
select public.ensure_periods(tests.id('b'));
select tests.remember('c_t', pg_temp.new_transfer('b', 'Holiday fund', p_from => (pg_temp.cur('b')).id));
select is(pg_temp.txs(tests.id('c_t')), '2027-02-05', 'R-ACCOUNT-420: (setup) made naming its period: its payday recorded');
select results_eq(
  format($$select change from public.preview_reopen(%L, '2027-02-08') where record_kind = 'transfer' and record_id = %L order by 1$$,
         tests.id('b'), tests.id('c_t')),
  $$values ('added'), ('transaction_removed')$$,
  'R-ACCOUNT-420: the reopen preview removes its transaction and creates none dated in the past');
select public.reopen_previous_period(tests.id('b'), (pg_temp.cur('b')).id, (pg_temp.cur('b')).revision, '2027-02-08');
select is(pg_temp.txs(tests.id('c_t')), '', 'R-ACCOUNT-420: after the reopen no transaction dated 5 Jan appears');
select is((select rows from pg_temp.rows('b', tests.id('c_t')) where start_date = '2027-01-05'), '',
  'R-ACCOUNT-420: the reopened period plans no occurrence of its own earlier payday (key 5 Feb)');
select pg_temp.day('2027-02-08');
select public.ensure_periods(tests.id('b'));
select is(pg_temp.txs(tests.id('c_t')), '2027-02-08', 'R-ACCOUNT-420: the salary comes on 8 Feb: one transaction, that day');
select is_empty(format($$select * from tests.moneyflow_violations(%L)$$, tests.id('b')), 'R-ACCOUNT-420: the model agrees (C)');

-- ===========================================================================
-- D: the same budget; "Savings on payday" changed on 6 Mar from the period 5 Mar.. to a fixed day 5
-- from 5 Mar. Key 5 Mar is also the earlier period's scheduled pay date (its salary of 8 Feb):
-- two transfers, both planned and recorded (R-ACCOUNT-421)
-- ===========================================================================
select pg_temp.day('2027-03-06');
select public.ensure_periods(tests.id('b'));
select is(pg_temp.txs(tests.id('b_t')), '2027-02-08,2027-03-05', 'R-ACCOUNT-421: (setup) the paydays of 8 Feb and 5 Mar recorded');
select results_eq(
  format($$select occurrence_date, due_date, created_at_once from public.preview_update_transfer(%L,
           p_schedule => 'day_of_month', p_day_of_month => 5, p_first_date => '2027-03-05', p_count => 2)$$, tests.id('b_t')),
  $$values ('2027-03-05'::date, '2027-03-05'::date, true), ('2027-04-05', '2027-04-05', false)$$,
  'R-ACCOUNT-421: the edit''s preview plans 5 Mar in the period 5 Mar..');
select public.update_transfer(tests.id('b_t'), (select revision from public.transfers where id = tests.id('b_t')),
  p_schedule => 'day_of_month', p_day_of_month => 5, p_first_date => '2027-03-05');
select results_eq(
  $$select start_date, rows from pg_temp.rows('b', tests.id('b_t')) where seq >= 6$$,
  $$values ('2027-02-08'::date, '2027-03-05/2027-02-08/done'), ('2027-03-05', '2027-03-05/2027-03-05/done')$$,
  'R-ACCOUNT-421: the period 8 Feb.. keeps its payday (key 5 Mar) and the period 5 Mar.. has its fixed day 5 Mar');
select is(pg_temp.txs(tests.id('b_t')), '2027-02-08,2027-03-05', 'R-ACCOUNT-421: no real transfer is lost');
select is((select count(*)::integer from public.transfer_occurrences where transfer_id = tests.id('b_t') and occurrence_date = '2027-03-05'),
  2, 'R-ACCOUNT-421: two marks with one key, the later one told apart');
select is_empty(format($$select * from tests.moneyflow_violations(%L)$$, tests.id('b')), 'R-ACCOUNT-421: the model agrees (D)');
-- the same with a manual transfer: the later occurrence is marked, skipped and undone on its own
select tests.remember('d_m', (select id from public.create_transfer(tests.id('b'), 'Manual fixed', tests.id('b_main'), tests.id('b_sav'), 5000,
  'pay_date', p_from_period_id => pg_temp.period_at('b', '2027-02-10'))));
select public.mark_transfer_done(tests.id('d_m'), pg_temp.period_at('b', '2027-02-10'), 0, '2027-02-09');
select public.update_transfer(tests.id('d_m'), (select revision from public.transfers where id = tests.id('d_m')),
  p_schedule => 'day_of_month', p_day_of_month => 5, p_first_date => '2027-03-05');
select results_eq(
  format($$select occurrence_date, status, mark_revision from public.get_transfer_checklist(%L) where transfer_id = %L$$,
         (pg_temp.cur('b')).id, tests.id('d_m')),
  $$values ('2027-03-05'::date, 'to_do', 0)$$,
  'R-ACCOUNT-421: the period 5 Mar.. lists its own occurrence 5 Mar to do, not the earlier period''s mark');
select lives_ok(format($$select * from public.skip_transfer(%L, %L, 0, '2027-03-05')$$, tests.id('d_m'), (pg_temp.cur('b')).id),
  'R-ACCOUNT-421: the later occurrence is skipped on its own');
select results_eq(
  $$select start_date, rows from pg_temp.rows('b', tests.id('d_m')) where seq >= 6$$,
  $$values ('2027-02-08'::date, '2027-03-05/2027-02-08/done'), ('2027-03-05', '2027-03-05/2027-03-05/skipped')$$,
  'R-ACCOUNT-421: the earlier period''s mark is untouched');
select lives_ok(format($$select * from public.undo_transfer_mark(%L, %L, 1, '2027-03-05')$$, tests.id('d_m'), (pg_temp.cur('b')).id),
  'R-ACCOUNT-421: undo acts on the later occurrence''s mark');
select is((select string_agg(mark::text || '/' || key_shared, ',') from public.transfer_occurrences where transfer_id = tests.id('d_m')),
  'done/false', 'R-ACCOUNT-421: only the earlier period''s mark is left');

-- ===========================================================================
-- E, the other way: a fixed day 25 until the salary came late (28 Nov, keyed 25 Nov), then a pay
-- date from that period: the fixed 25 Nov and the payday of 28 Nov are both recorded
-- ===========================================================================
select pg_temp.day('2026-11-25');
select pg_temp.budget('e');
select tests.remember('e_t', (select id from public.create_transfer(tests.id('e'), 'Rent reserve', tests.id('e_main'), tests.id('e_sav'),
  20000, 'day_of_month', p_day_of_month => 25, p_is_automatic => true, p_category_id => tests.id('e_cat'),
  p_from_period_id => tests.id('e_p1'))));
select pg_temp.day('2026-11-28');
select public.move_period_start((pg_temp.cur('e')).id, (pg_temp.cur('e')).revision, '2026-11-28');
select is(pg_temp.txs(tests.id('e_t')), '2026-09-25,2026-10-25,2026-11-25', 'R-ACCOUNT-421: (setup) the fixed day recorded on 25 Nov');
select public.update_transfer(tests.id('e_t'), (select revision from public.transfers where id = tests.id('e_t')),
  p_schedule => 'pay_date', p_offset_days => 0);
select is(pg_temp.txs(tests.id('e_t')), '2026-09-25,2026-10-25,2026-11-25,2026-11-28',
  'R-ACCOUNT-421: the payday of 28 Nov (keyed 25 Nov) is recorded beside the fixed 25 Nov of the period before');
select is_empty(format($$select * from tests.moneyflow_violations(%L)$$, tests.id('e')), 'R-ACCOUNT-421: the model agrees (E)');
-- the same payday twice (a chosen income's pay date, then the primary's key) stays one occurrence
-- (the earlier period's): covered by 97i (S1) and the walk

-- ===========================================================================
-- The salary the transfer was made from counts wherever it is recorded (R-ACCOUNT-420): made
-- naming its period on 25 Nov, the member then says the salary came on 20 Nov
-- ===========================================================================
select pg_temp.day('2026-11-25');
select pg_temp.budget('k');
select tests.remember('k_t', pg_temp.new_transfer('k', 'Savings on payday', p_from => (pg_temp.cur('k')).id));
select is(pg_temp.txs(tests.id('k_t')), '2026-11-25', 'R-ACCOUNT-420: (setup) recorded on 25 Nov');
select public.move_period_start((pg_temp.cur('k')).id, (pg_temp.cur('k')).revision, '2026-11-20');
select is(pg_temp.txs(tests.id('k_t')), '2026-11-20',
  'R-ACCOUNT-420: the salary it was made from moved to 20 Nov: still its occurrence, re-dated (not lost)');
select is((select starts_key from public.transfers where id = tests.id('k_t')), '2026-11-25'::date,
  'R-ACCOUNT-420: it remembers the key of that salary');
select is((select starts_key from public.transfers where id = tests.id('a_t')), null::date,
  'R-ACCOUNT-420: one made from a later day remembers none');
select is_empty(format($$select * from tests.moneyflow_violations(%L)$$, tests.id('k')), 'R-ACCOUNT-420: the model agrees (moved salary)');

-- ===========================================================================
-- Import ceilings: members and tokens have separate allowances (R-IMPORT-420, D-452 as amended)
-- ===========================================================================
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
create function pg_temp.call(p_secret text, p_batch text, p_rows jsonb) returns text language sql as $$
  select coalesce(x.error, x.received::text || '/' || x.refused::text)
  from public.import_with_token(p_secret, p_batch, '1', p_rows, 'script') as x
$$;
create function pg_temp.row1(n integer) returns jsonb language sql as $$
  select jsonb_build_array(jsonb_build_object('date', '2026-11-14', 'amount', n, 'direction', 'debit')) $$;
grant execute on function pg_temp.call(text, text, jsonb), pg_temp.row1(integer) to anon, authenticated;
select pg_temp.day('2026-11-16');
select tests.remember('i', public.create_budget('Import ceilings', 'Salary', 600000, 25, 'none', '2026-09-01'));
create temp table jtok on commit drop as select * from public.create_import_token(tests.id('i'), 'Script');
grant select on jtok to anon, authenticated;
select tests.clear_authentication();
-- a token takes its 50 new imports of the day; the 51st is refused, naming its own limit
select tests.authenticate_as_anon();
select is((select count(*)::integer from generate_series(1, 50) as g
           where pg_temp.call((select token from jtok), gen_random_uuid()::text, pg_temp.row1(1000 + g)) = '1/0'), 50,
  'R-IMPORT-420: a token starts 50 new imports in a day');
select is(pg_temp.call((select token from jtok), gen_random_uuid()::text, pg_temp.row1(2000)), 'import_limit_reached',
  'R-IMPORT-420: the token''s 51st new import is refused');
select tests.clear_authentication();
select pg_temp.day('2026-11-16');
select is(pg_temp.refusal(format($$select * from public.import_transactions(%L, gen_random_uuid(), 1, %L, 'csv')$$,
                                 tests.id('i'), pg_temp.row1(3000))),
  'no error', 'R-IMPORT-420: the token never locks the members out: a member still starts a new import');
-- the members' allowance is their own (200 a day; 3 here), and its refusal names it
select tests.clear_authentication();
savepoint ceilings;
create or replace function private.limit_import_batches_per_day() returns integer language sql immutable set search_path = '' as $f$ select 3 $f$;
select pg_temp.day('2026-11-16');
select public.import_transactions(tests.id('i'), gen_random_uuid(), 1, pg_temp.row1(3001), 'csv');
select public.import_transactions(tests.id('i'), gen_random_uuid(), 1, pg_temp.row1(3002), 'csv');
select is(pg_temp.refusal(format($$select * from public.import_transactions(%L, gen_random_uuid(), 1, %L, 'csv')$$,
                                 tests.id('i'), pg_temp.row1(3003))),
  'import_limit_reached {"limit" : "imports_per_day"}', 'R-IMPORT-420: the members'' 4th new import of the day (3 here) is refused, naming the limit');
select is(pg_temp.refusal(format($$select * from public.preview_import(%L, null, %L)$$, tests.id('i'), pg_temp.row1(3003))),
  'no error', 'R-IMPORT-420: a preview is not an import (nothing counted)');
rollback to savepoint ceilings;
-- rows: 20 000 a day in all (20 here), of which tokens at most 10 000 (10 here)
savepoint ceilings2;
create or replace function private.limit_import_rows_per_day() returns integer language sql immutable set search_path = '' as $f$ select 20 $f$;
create or replace function private.limit_import_token_rows_per_day() returns integer language sql immutable set search_path = '' as $f$ select 10 $f$;
select tests.clear_authentication();
delete from private.import_budget_usage where budget_id = tests.id('i');
select tests.authenticate_as_anon();
select is(pg_temp.call((select token from jtok), gen_random_uuid()::text,
                       (select jsonb_agg(jsonb_build_object('date', '2026-11-13', 'amount', 4000 + g, 'direction', 'debit')) from generate_series(1, 10) as g)),
  '10/0', 'R-IMPORT-420: tokens import their share of the day''s rows');
select is(pg_temp.call((select token from jtok), gen_random_uuid()::text, pg_temp.row1(4100)), 'import_limit_reached',
  'R-IMPORT-420: one row more by a token is refused');
select tests.clear_authentication();
select pg_temp.day('2026-11-16');
select is(pg_temp.refusal(format($$select * from public.import_transactions(%L, gen_random_uuid(), 1, %L, 'csv')$$, tests.id('i'),
          (select jsonb_agg(jsonb_build_object('date', '2026-11-13', 'amount', 4200 + g, 'direction', 'debit')) from generate_series(1, 10) as g))),
  'no error', 'R-IMPORT-420: members keep the rest of the day''s rows');
select is(pg_temp.refusal(format($$select * from public.import_transactions(%L, gen_random_uuid(), 1, %L, 'csv')$$, tests.id('i'), pg_temp.row1(4300))),
  'import_limit_reached {"limit" : "rows_per_day"}', 'R-IMPORT-420: beyond 20 000 rows in all, a member is refused, naming the limit');
select tests.clear_authentication();
select is((select sum(token_rows)::integer || '/' || sum(rows)::integer from private.import_budget_usage where budget_id = tests.id('i')),
  '10/20', 'R-IMPORT-420: the tokens'' share is counted on its own');
rollback to savepoint ceilings2;

-- ===========================================================================
-- The new import calls check membership and lengths before any work (R-IMPORT-421)
-- ===========================================================================
savepoint order_of_work;
-- the fragment's normalisation is replaced by a refusal of its own: whoever reaches it says so
create or replace function private.normalize_merchant_text(p_text text) returns text language plpgsql immutable set search_path = ''
  as $f$ begin raise exception 'normalised' using errcode = 'P0001'; end $f$;
select pg_temp.day('2026-11-16', 'jules');
select is(pg_temp.refusal(format($$select * from public.preview_merchant_rule(%L, %L)$$, tests.id('i'), repeat('x', 2000000))),
  'budget_not_found', 'R-IMPORT-421: an outsider''s huge fragment is refused for the budget before any work on it');
select is(pg_temp.refusal(format($$select * from public.create_merchant_rule(%L, %L, %L)$$, tests.id('i'), repeat('x', 2000000),
                                 gen_random_uuid())),
  'budget_not_found', 'R-IMPORT-421: so is creating the rule');
select is(pg_temp.refusal(format($$select public.forget_import_choice(%L, 'own_transfer', %L)$$, tests.id('i'), repeat('x', 2000000))),
  'budget_not_found', 'R-IMPORT-421: forget_import_choice checks membership first');
select is(pg_temp.refusal(format($$select public.preview_import_part(%L, gen_random_uuid(), 1, '[]')$$, tests.id('i'))),
  'budget_not_found', 'R-IMPORT-421: preview_import_part checks membership first');
select pg_temp.day('2026-11-16');
select is(pg_temp.refusal(format($$select * from public.preview_merchant_rule(%L, %L)$$, tests.id('i'), repeat('x', 1001))),
  'invalid_fragment', 'R-IMPORT-421: a member''s fragment over 1000 characters is refused before it is normalised');
select is(pg_temp.refusal(format($$select * from public.preview_merchant_rule(%L, %L)$$, tests.id('i'), 'coop')),
  'normalised', 'R-IMPORT-421: (a fragment of a sane length is normalised)');
select is(public.forget_import_choice(tests.id('i'), 'own_transfer', repeat('x', 1001)), false,
  'R-IMPORT-421: a key longer than any stored one is not looked for');
rollback to savepoint order_of_work;

-- ===========================================================================
-- Q-290 (D-522): a written part answers what it recorded; once written it is no longer staged
-- ===========================================================================
select pg_temp.day('2026-11-16');
select tests.remember('qb', gen_random_uuid());
create temp table qrows on commit drop as
  select (select jsonb_agg(jsonb_build_object('date', '2026-11-10', 'amount', 5100 + g, 'direction', 'debit', 'description', 'Shop ' || g))
          from generate_series(1, 3) as g) as p1,
         (select jsonb_agg(jsonb_build_object('date', '2026-11-11', 'amount', 5200 + g, 'direction', 'debit')) from generate_series(1, 2) as g) as p2;
grant select on qrows to authenticated;
select is((public.preview_import_part(tests.id('i'), tests.id('qb'), 1, (select p1 from qrows)) -> 'part' ->> 'import')::integer, 3,
  'D-522: (part 1 staged: 3 rows to import)');
create temp table qwrite on commit drop as
  select * from public.import_transactions(tests.id('i'), tests.id('qb'), 1, (select p1 from qrows), 'csv');
grant select on qwrite to authenticated;
create temp table qagain on commit drop as
  select public.preview_import_part(tests.id('i'), tests.id('qb'), 1, (select p1 from qrows)) as a;
grant select on qagain to authenticated;
select is((select a ->> 'written' from qagain), 'true', 'D-522: part 1 previewed again after its write says it was written');
select results_eq($$select x.row_no, x.action, x.transaction_id from qagain cross join lateral
                     jsonb_populate_recordset(null::public.import_row_result, a -> 'rows') as x order by 1$$,
  $$select row_no, action, transaction_id from qwrite order by 1$$,
  'D-522: its rows are what the write recorded (the same answers, the transactions it made), not planned as new');
select is((select (a -> 'part' ->> 'import')::integer from qagain), 3, 'D-522: its counts are the write''s');
select is((public.preview_import_part(tests.id('i'), tests.id('qb'), 2, (select p2 from qrows)) -> 'parts')::text, '[2]',
  'D-522: part 1, written, no longer counts as staged: the statement covers part 2 only');
select is((select count(*)::integer from public.import_transactions(tests.id('i'), tests.id('qb'), 1, (select p1 from qrows), 'csv')
           where action = 'import'), 3, 'D-522: (the chunk sent again answers as before)');

-- ===========================================================================
-- Q-291 (D-523): import_skipped_anyway says which ids sent are no longer kept
-- ===========================================================================
create temp table qskip on commit drop as
  select * from public.import_transactions(tests.id('i'), gen_random_uuid(), 1,
    (select jsonb_agg(jsonb_build_object('date', '2026-11-10', 'amount', 5101, 'direction', 'debit', 'description', 'Shop 1'))), 'csv');
select is((select action from qskip), 'skip_duplicate', 'D-523: (setup) a duplicate is skipped and kept');
select tests.clear_authentication();
select tests.remember('qk', (select id from public.import_skipped_rows where budget_id = tests.id('i') limit 1));
select tests.remember('qkb', (select batch_id from public.import_skipped_rows where budget_id = tests.id('i') limit 1));
select pg_temp.day('2026-11-16');
select results_eq(
  format($$select action, reason, valid from public.import_skipped_anyway(%L, array[%L::uuid, %L::uuid, %L::uuid]) order by action$$,
         tests.id('qkb'), tests.id('qk'), gen_random_uuid(), gen_random_uuid()),
  $$values ('import', null::text, true), ('not_kept', 'not_kept', false), ('not_kept', 'not_kept', false)$$,
  'D-523: the kept row is imported anyway and each id no longer kept answers a row not_kept');

-- ===========================================================================
-- Q-301 (D-524): the money flow ends at spending. The contract's worked example, in figures
-- (R-ACCOUNT-422, R-ACCOUNT-423)
-- ===========================================================================
select pg_temp.day('2026-11-20');
select tests.remember('w', public.create_budget('Worked example', 'Ann''s salary', 600000, 25, 'none', '2026-09-01'));
select tests.remember('w_p1', (select id from public.periods where budget_id = tests.id('w') and seq = 1));
create function pg_temp.wcat(n text, parent text, amount bigint, cadence public.expectation_cadence default 'monthly')
returns void language sql as $$
  select tests.remember('w_' || n, (select id from public.create_category(tests.id('w'), n,
    p_parent_id => case when parent is null then null else tests.id('w_' || parent) end, p_amount => amount,
    p_cadence => cadence, p_from_period_id => tests.id('w_p1')))) $$;
select tests.remember('w_main', (select id from public.create_account(tests.id('w'), 'Main', 'current', p_from_period_id => tests.id('w_p1'))));
select tests.remember('w_sav', (select id from public.create_account(tests.id('w'), 'Savings', 'savings', p_from_period_id => tests.id('w_p1'))));
select tests.remember('w_pil', (select id from public.create_account(tests.id('w'), 'Pillar 3a', 'third_pillar', p_from_period_id => tests.id('w_p1'))));
select public.update_income((select primary_income_id from public.budgets where id = tests.id('w')),
  (select revision from public.incomes where id = (select primary_income_id from public.budgets where id = tests.id('w'))),
  p_account_id => tests.id('w_main'), p_from_period_id => tests.id('w_p1'));
select public.add_income(tests.id('w'), 'Ben''s salary', 400000, 25, 'none', p_from_period_id => tests.id('w_p1'), p_account_id => tests.id('w_main'));
select pg_temp.wcat('Home', null, 0); select pg_temp.wcat('Rent', 'Home', 200000); select pg_temp.wcat('Energy', 'Home', 15000);
select pg_temp.wcat('Food', null, 0); select pg_temp.wcat('Groceries', 'Food', 90000); select pg_temp.wcat('Restaurants', 'Food', 20000);
select pg_temp.wcat('Transport', null, 0); select pg_temp.wcat('Train', 'Transport', 30000);
select pg_temp.wcat('Leisure', null, 0); select pg_temp.wcat('Holidays', 'Leisure', 240000, 'yearly'); select pg_temp.wcat('Hobbies', 'Leisure', 15000);
select pg_temp.wcat('Saving and pension', null, 0); select pg_temp.wcat('Savings', 'Saving and pension', 100000);
select pg_temp.wcat('Pillar', 'Saving and pension', 705600, 'yearly');
select public.create_transfer(tests.id('w'), 'Savings', tests.id('w_main'), tests.id('w_sav'), 100000, 'pay_date', p_is_automatic => true,
  p_category_id => tests.id('w_Savings'), p_from_period_id => (pg_temp.cur('w')).id);
select public.create_transfer(tests.id('w'), 'Pillar 3a', tests.id('w_main'), tests.id('w_pil'), 705600, 'day_of_month',
  p_cadence => 'yearly', p_first_date => '2026-12-20', p_is_automatic => true, p_category_id => tests.id('w_Pillar'));
select public.add_transaction(tests.id('w'), 'expense', 200000, '2026-11-01', tests.id('w_Rent'));
select public.add_transaction(tests.id('w'), 'expense', 64050, '2026-11-08', tests.id('w_Groceries'));
select public.add_transaction(tests.id('w'), 'expense', 8500, '2026-11-09', tests.id('w_Restaurants'));
select public.add_transaction(tests.id('w'), 'expense', 12000, '2026-11-03', tests.id('w_Train'));
select public.add_transaction(tests.id('w'), 'expense', 6000, '2026-11-12', tests.id('w_Hobbies'));
create temp table wflow on commit drop as select * from public.get_money_flow(tests.id('w'));
grant select on wflow to authenticated;
select results_eq($$select name, amount, expected, transfer_share, spent, transfer_spent, yearly_amount, is_negative
                     from wflow where row_kind = 'spending' order by display_order$$,
  $$values ('Home', 215000::bigint, 215000::bigint, 0::bigint, 200000::bigint, 0::bigint, null::bigint, false),
           ('Food', 110000, 110000, 0, 72550, 0, null, false),
           ('Transport', 30000, 30000, 0, 12000, 0, null, false),
           ('Leisure', 35000, 35000, 0, 6000, 0, 240000, false),
           ('Saving and pension', 0, 158800, 158800, 0, 100000, 705600, false)$$,
  'R-ACCOUNT-422: one spending row per category group: planned at the monthly share less the transfers'' share, spent less the transfers'' transactions');
select results_eq($$select name, account_kind::text, stays, spendable from wflow where row_kind = 'account' order by name$$,
  $$values ('Main', 'current', 841200::bigint, true), ('Pillar 3a', 'third_pillar', 58800, false), ('Savings', 'savings', 100000, false)$$,
  'R-ACCOUNT-423: what stays on an everyday account is spendable, on a savings or pillar account set aside');
select results_eq($$select amount, set_aside, spendable_amount, planned_spending, not_planned, actual_spending, left_amount, is_negative
                     from wflow where row_kind = 'total'$$,
  $$values (1000000::bigint, 158800::bigint, 841200::bigint, 390000::bigint, 451200::bigint, 290550::bigint, 550650::bigint, false)$$,
  'R-ACCOUNT-422: the totals balance: income = set aside + spendable = set aside + planned + not planned = set aside + spent + left');
select is((select count(*)::integer from wflow), 2 + 1 + 3 + 2 + 5, 'R-ACCOUNT-422: incomes, accounts, transfers, spending and the total, nothing else');
select is((select row_kind from wflow order by row_kind = 'total', 1 limit 1 offset 12), 'total', 'R-ACCOUNT-422: the total stays the last row');
-- the 1000-row bound: with room for two spending rows, the second adds up the other four
select tests.clear_authentication();
savepoint mf_rows;
create or replace function private.limit_money_flow_rows() returns integer language sql immutable set search_path = '' as $f$ select 10 $f$;
select pg_temp.day('2026-11-20');
select results_eq($$select name, amount, spent from public.get_money_flow(tests.id('w')) where row_kind = 'spending' order by display_order$$,
  $$values ('Home', 215000::bigint, 200000::bigint), ('4', 175000, 90550)$$,
  'R-ACCOUNT-422: at the row limit the last spending row adds up the rest (its name: how many), so the totals stay whole');
select is((select count(*)::integer from public.get_money_flow(tests.id('w'))), 10, 'R-ACCOUNT-422: never more rows than the limit');
rollback to savepoint mf_rows;

-- ===========================================================================
-- Q-300 (D-525): list_transactions takes a transfer, like a subscription or a debt
-- ===========================================================================
select pg_temp.day('2026-11-20');
select results_eq(format($$select date, amount from public.list_transactions(%L, p_transfer_id => %L)$$, tests.id('w'),
                         (select id from public.transfers where budget_id = tests.id('w') and name = 'Savings')),
  $$values ('2026-10-25'::date, 100000::bigint)$$, 'D-525: one planned transfer''s transactions');
select is(pg_temp.refusal(format($$select * from public.list_transactions(%L, p_transfer_id => %L)$$, tests.id('w'), tests.id('a_t'))),
  'transfer_not_found', 'D-525: another budget''s transfer is not found');

-- ===========================================================================
-- An import's creator is named while a member, also without any transaction (R-IMPORT-422)
-- ===========================================================================
select tests.remember('n_inv', public.invite_member(tests.id('i'), tests.get_user_email('juno')));
select pg_temp.day('2026-11-16', 'juno');
select public.accept_invitation(tests.id('n_inv'));
select tests.remember('n_b', gen_random_uuid());
select public.import_transactions(tests.id('i'), tests.id('n_b'), 1, pg_temp.row1(7001), 'csv');
select public.undo_import_batch(tests.id('n_b'));
select pg_temp.day('2026-11-16');
select is((select created_by_name from public.get_import_batch(tests.id('n_b'))), 'Juno',
  'R-IMPORT-422: a current member whose only import was undone (no transaction recorded) is named');
select is((select created_by_name from public.list_import_batches(tests.id('i'), 200) where id = tests.id('n_b')), 'Juno',
  'R-IMPORT-422: in the batch list too');
select public.remove_member(tests.id('i'), tests.get_user_id('juno'));
select is((select created_by_name from public.get_import_batch(tests.id('n_b'))), null,
  'R-IMPORT-422: once no longer a member, null ("a former member")');

-- ===========================================================================
-- An automatic occurrence not linked to a category, due: done (assumed), no mark; undo has
-- nothing to undo, "did not happen" is allowed (the contract says so)
-- ===========================================================================
select pg_temp.day('2026-11-20');
select tests.remember('u_t', (select id from public.create_transfer(tests.id('w'), 'Unlinked', tests.id('w_main'), tests.id('w_sav'),
  5000, 'pay_date', p_is_automatic => true, p_from_period_id => (pg_temp.cur('w')).id)));
select results_eq(format($$select status, done_on, mark_revision, assumed, due_date from public.get_transfer_checklist(%L) where transfer_id = %L$$,
                         (pg_temp.cur('w')).id, tests.id('u_t')),
  $$values ('done', null::date, 0, true, '2026-10-25'::date)$$,
  'R-ACCOUNT-004: due and unlinked: done, assumed, no mark; it counts as done on its due date');
select is(pg_temp.refusal(format($$select * from public.undo_transfer_mark(%L, %L, 0)$$, tests.id('u_t'), (pg_temp.cur('w')).id)),
  'nothing_to_undo', 'R-ACCOUNT-004: undo has nothing to undo');
select is((select status from public.mark_transfer_not_done(tests.id('u_t'), (pg_temp.cur('w')).id, 0)), 'not_done',
  'R-ACCOUNT-004: "did not happen" is allowed from that state');

-- ===========================================================================
-- Step 7 should-fix 1: a reopen keeps what an ended standing order recorded (R-ACCOUNT-424)
-- ===========================================================================
select pg_temp.day('2026-11-26');
select pg_temp.budget('r');
select tests.remember('r_t', pg_temp.new_transfer('r', 'Standing order', p_from => tests.id('r_p1')));
select is(pg_temp.txs(tests.id('r_t')), '2026-09-25,2026-10-25,2026-11-25', 'R-ACCOUNT-424: (setup) three transactions recorded');
select public.end_transfer(tests.id('r_t'), (select revision from public.transfers where id = tests.id('r_t')));
select is((select count(*)::integer from public.preview_reopen(tests.id('r'), '2026-11-28')
           where record_kind = 'transfer' and change = 'transaction_removed'), 0,
  'R-ACCOUNT-424: the reopen preview removes no transaction of the ended order');
select public.reopen_previous_period(tests.id('r'), (pg_temp.cur('r')).id, (pg_temp.cur('r')).revision, '2026-11-28');
select is(pg_temp.txs(tests.id('r_t')), '2026-09-25,2026-10-25,2026-11-25',
  'R-ACCOUNT-424: after the reopen both transactions of the period stay (the 25 Oct one was deleted)');
select is((select rows from pg_temp.rows('r', tests.id('r_t')) where seq = 2), '2026-10-25/-/done/unplanned;2026-11-25/-/done/unplanned',
  'R-ACCOUNT-424: listed as ended, not planned');
select is_empty(format($$select * from tests.moneyflow_violations(%L)$$, tests.id('r')), 'R-ACCOUNT-424: the model agrees');

-- ===========================================================================
-- Step 7 should-fix 2: a primary switch never re-plans what its period planned (R-ACCOUNT-428)
-- ===========================================================================
select pg_temp.day('2026-11-26');
select pg_temp.budget('sw');
select tests.remember('sw_partner', public.add_income(tests.id('sw'), 'Partner', 400000, 10, 'none', p_from_period_id => tests.id('sw_p1')));
select tests.remember('sw_t', (select id from public.create_transfer(tests.id('sw'), 'Savings', tests.id('sw_main'), tests.id('sw_sav'),
  100000, 'pay_date', p_income_id => tests.id('sw_inc'), p_is_automatic => true, p_category_id => tests.id('sw_cat'),
  p_from_period_id => tests.id('sw_p1'))));
select is(pg_temp.txs(tests.id('sw_t')), '2026-09-25,2026-10-25,2026-11-25', 'R-ACCOUNT-428: (setup) it names the Salary, the primary');
select results_eq(format($$select transfer_transactions_removed, transfer_transactions_created, transfer_marks_unplanned
                           from public.preview_set_primary_income(%L)$$, tests.id('sw_partner')),
  $$values (0, 0, 0)$$, 'R-ACCOUNT-428: the switch''s preview says nothing recorded changes');
select public.set_primary_income(tests.id('sw_partner'), (select revision from public.budgets where id = tests.id('sw')),
  (select end_date from public.preview_set_primary_income(tests.id('sw_partner'))));
select is(pg_temp.txs(tests.id('sw_t')), '2026-09-25,2026-10-25,2026-11-25',
  'R-ACCOUNT-428: after the switch every period keeps what it planned and recorded');
select is((select string_agg(rows, ' ' order by seq) from pg_temp.rows('sw', tests.id('sw_t'))),
  '2026-09-25/2026-09-25/done 2026-10-25/2026-10-25/done 2026-11-25/2026-11-25/done',
  'R-ACCOUNT-428: the checklists are unchanged');
select pg_temp.day('2027-01-12');
select public.ensure_periods(tests.id('sw'));
select ok(pg_temp.txs(tests.id('sw_t')) like '2026-09-25,2026-10-25,2026-11-25,2026-12-25%',
  'R-ACCOUNT-428: from the next period it follows the Salary''s own pay dates (25 Dec), as a chosen income');
select is_empty(format($$select * from tests.moneyflow_violations(%L)$$, tests.id('sw')), 'R-ACCOUNT-428: the model agrees');

-- ===========================================================================
-- Step 7 should-fix 3: an income added and removed in one period (R-ACCOUNT-427)
-- ===========================================================================
select pg_temp.day('2026-11-12');
select pg_temp.budget('h');
select tests.remember('h_inc2', public.add_income(tests.id('h'), 'Side job', 30000, 10, 'none'));
select tests.remember('h_t', (select id from public.create_transfer(tests.id('h'), 'After the side job', tests.id('h_main'), tests.id('h_sav'),
  30000, 'pay_date', p_income_id => tests.id('h_inc2'), p_is_automatic => true, p_category_id => tests.id('h_cat'),
  p_from_period_id => (pg_temp.cur('h')).id)));
select is(pg_temp.txs(tests.id('h_t')), '2026-11-10', 'R-ACCOUNT-427: (setup) recorded on the side job''s pay date');
select is(public.remove_income(tests.id('h_inc2'), (select revision from public.incomes where id = tests.id('h_inc2'))), 'deleted',
  'R-ACCOUNT-427: (the income is deleted outright)');
select is(pg_temp.txs(tests.id('h_t')), '2026-11-10',
  'R-ACCOUNT-427: what was recorded stays, and nothing dated 25 Oct (the primary''s payday, past) appears');
select is((select follows_primary from public.transfer_overview where id = tests.id('h_t')), true,
  'R-ACCOUNT-427: it follows the primary income from now, and says so');
select pg_temp.day('2026-11-26');
select public.ensure_periods(tests.id('h'));
select is(pg_temp.txs(tests.id('h_t')), '2026-11-10,2026-11-25', 'R-ACCOUNT-427: the next payday has its transfer');
select is_empty(format($$select * from tests.moneyflow_violations(%L)$$, tests.id('h')), 'R-ACCOUNT-427: the model agrees');

-- ===========================================================================
-- Step 7 should-fixes 4 and 5: a moved start moves only what nobody touched; a move with no
-- change changes nothing (R-ACCOUNT-425, R-ACCOUNT-426)
-- ===========================================================================
select pg_temp.day('2026-11-26');
select pg_temp.budget('mv');
select tests.remember('mv_plain', pg_temp.new_transfer('mv', 'Plain', p_from => (pg_temp.cur('mv')).id));
select tests.remember('mv_manual', pg_temp.new_transfer('mv', 'Made manual', p_from => (pg_temp.cur('mv')).id));
select tests.remember('mv_edit', pg_temp.new_transfer('mv', 'Edited', p_from => (pg_temp.cur('mv')).id));
select public.update_transfer(tests.id('mv_manual'), (select revision from public.transfers where id = tests.id('mv_manual')),
  p_is_automatic => false);
select public.update_transaction(x.id, x.revision, 'expense', 98000, x.date, x.category_id, 'bank fee taken off')
from public.transaction_list as x where x.transfer_id = tests.id('mv_edit');
create temp table mv_before on commit drop as
  select x.id, x.transfer_id from public.transaction_list as x where x.budget_id = tests.id('mv');
grant select on mv_before to authenticated;
-- no change: on schedule already, nothing moves (5)
select public.move_period_start((pg_temp.cur('mv')).id, (pg_temp.cur('mv')).revision);
select is((select count(*)::integer from public.transaction_list as x join mv_before as b on b.id = x.id
           where x.budget_id = tests.id('mv')), 3, 'R-ACCOUNT-426: a move with no change re-dates nothing (same transactions)');
select pg_temp.day('2026-11-27');
select results_eq(format($$select transfer_transactions_removed, transfer_transactions_created from public.preview_move_period_start(%L, '2026-11-27')$$,
                         (pg_temp.cur('mv')).id),
  $$values (1, 1)$$, 'R-ACCOUNT-425: the preview counts only what nobody touched');
select public.move_period_start(pg_temp.period_at('mv', '2026-11-26'), (select revision from public.periods where id = pg_temp.period_at('mv', '2026-11-26')),
  '2026-11-27');
select is(pg_temp.txs(tests.id('mv_plain')), '2026-11-27', 'R-ACCOUNT-425: the app''s own transaction moves to the new due date');
select is(pg_temp.txs(tests.id('mv_manual')), '2026-11-25', 'R-ACCOUNT-425: made manual since: it stays as the member left it');
select results_eq(format($$select date, amount, description from public.transaction_list where transfer_id = %L$$, tests.id('mv_edit')),
  $$values ('2026-11-25'::date, 98000::bigint, 'bank fee taken off')$$,
  'R-ACCOUNT-425: its transaction edited by a member: it stays exactly as edited');

-- ===========================================================================
-- What the reviewer's surviving mutants showed untested (re-check 3), step 7
-- ===========================================================================
-- the previous period after a moved start: its occurrence's due date, capped at its end, moves
select pg_temp.day('2026-11-20');
select pg_temp.budget('pv');
select tests.remember('pv_t', (select id from public.create_transfer(tests.id('pv'), 'Late in the month', tests.id('pv_main'), tests.id('pv_sav'),
  100000, 'pay_date', p_offset_days => 25, p_is_automatic => true, p_category_id => tests.id('pv_cat'), p_from_period_id => tests.id('pv_p1'))));
select is(pg_temp.txs(tests.id('pv_t')), '2026-10-20,2026-11-19', 'R-ACCOUNT-309: (setup) due 25 days after payday');
select public.move_period_start((pg_temp.cur('pv')).id, (pg_temp.cur('pv')).revision, '2026-10-15');
select is(pg_temp.txs(tests.id('pv_t')), '2026-10-14,2026-11-09',
  'R-ACCOUNT-309: the previous period''s transaction moves too: its due date, capped at its end, is now 14 Oct');
-- a yearly transfer 12 to 13 months ahead still shows its next date (13 months, not 12)
select tests.remember('pv_y', (select id from public.create_transfer(tests.id('pv'), 'Yearly', tests.id('pv_main'), tests.id('pv_sav'),
  50000, 'day_of_month', p_cadence => 'yearly', p_first_date => '2027-12-01')));
select is((select next_due_date from public.transfer_overview where id = tests.id('pv_y')), '2027-12-01'::date,
  'R-ACCOUNT-314: a yearly date more than 12 months ahead is still its next due date');
-- D-492's boundaries: due on the day the income ended stays; the primary's due that day does not
-- appear; ended by a correction from an earlier period, those periods follow the primary as before
select pg_temp.day('2026-11-10');
select pg_temp.budget('eb');
select tests.remember('eb_x', public.add_income(tests.id('eb'), 'Side job', 30000, 10, 'none', p_from_period_id => tests.id('eb_p1')));
select tests.remember('eb_t1', (select id from public.create_transfer(tests.id('eb'), 'On its day', tests.id('eb_main'), tests.id('eb_sav'),
  1000, 'pay_date', p_income_id => tests.id('eb_x'), p_is_automatic => true, p_category_id => tests.id('eb_cat'), p_from_period_id => tests.id('eb_p1'))));
select tests.remember('eb_t2', (select id from public.create_transfer(tests.id('eb'), 'Sixteen days on', tests.id('eb_main'), tests.id('eb_sav'),
  1000, 'pay_date', p_offset_days => 16, p_income_id => tests.id('eb_x'), p_is_automatic => true, p_category_id => tests.id('eb_cat'),
  p_from_period_id => tests.id('eb_p1'))));
select public.remove_income(tests.id('eb_x'), (select revision from public.incomes where id = tests.id('eb_x')));
select is(pg_temp.txs(tests.id('eb_t1')), '2026-10-10,2026-11-10', 'R-ACCOUNT-311: an occurrence due on the day the income ended stays');
select is((select rows from pg_temp.rows('eb', tests.id('eb_t2')) where start_date = '2026-10-25'), '',
  'R-ACCOUNT-311: the primary''s occurrence due that very day (25 Oct + 16) does not appear');
select pg_temp.day('2026-11-26');
select pg_temp.budget('ec');
select tests.remember('ec_x', public.add_income(tests.id('ec'), 'Side job', 30000, 10, 'none', p_from_period_id => tests.id('ec_p1')));
select tests.remember('ec_t', (select id from public.create_transfer(tests.id('ec'), 'After it', tests.id('ec_main'), tests.id('ec_sav'),
  1000, 'pay_date', p_income_id => tests.id('ec_x'), p_is_automatic => true, p_category_id => tests.id('ec_cat'), p_from_period_id => tests.id('ec_p1'))));
select public.remove_income(tests.id('ec_x'), (select revision from public.incomes where id = tests.id('ec_x')),
  pg_temp.period_at('ec', '2026-11-01'));
select is(pg_temp.txs(tests.id('ec_t')), '2026-10-10,2026-10-25,2026-11-25',
  'R-ACCOUNT-311: ended by a correction from an earlier period, that period follows the primary income (25 Oct), not the day it was asked');
select is_empty(format($$select * from tests.moneyflow_violations(%L)$$, tests.id('ec')), 'R-ACCOUNT-311: the model agrees');
-- the gate (D-433): more than 62 days behind with a charge or a transfer's transaction answers
-- catching_up, 62 does not, and a full budget is not behind
select pg_temp.day('2026-11-26');
select pg_temp.budget('g');
select tests.remember('g_t', pg_temp.new_transfer('g', 'Standing order', p_from => tests.id('g_p1')));
select tests.clear_authentication();
update public.transfers set next_due = date '2026-11-26' - 62 where id = tests.id('g_t');
select pg_temp.day('2026-11-26');
select is(pg_temp.refusal(format($$select public.create_category(%L, 'Gate 62')$$, tests.id('g'))), 'no error',
  'R-PERIOD-250: a transfer''s transaction 62 days due: not behind');
select tests.clear_authentication();
update public.transfers set next_due = date '2026-11-26' - 63 where id = tests.id('g_t');
select pg_temp.day('2026-11-26');
select is(pg_temp.refusal(format($$select public.create_category(%L, 'Gate 63')$$, tests.id('g'))), 'catching_up',
  'R-PERIOD-250: 63 days: catching_up');
select tests.clear_authentication();
savepoint gate_full;
create or replace function private.limit_transactions() returns integer language sql immutable set search_path = '' as $f$ select 0 $f$;
select pg_temp.day('2026-11-26');
select is(pg_temp.refusal(format($$select public.create_category(%L, 'Gate full')$$, tests.id('g'))), 'no error',
  'R-PERIOD-250: a full budget is not behind (its transactions wait for room)');
select tests.clear_authentication();
rollback to savepoint gate_full;
update public.transfers set next_due = null where id = tests.id('g_t');
select pg_temp.day('2026-11-26');
select tests.remember('g_sub', (select id from public.create_subscription(tests.id('g'), 'Streaming', 1500, 'monthly', tests.id('g_cat'), '2026-11-30')));
select tests.clear_authentication();
update public.subscriptions set next_due = date '2026-11-26' - 63 where id = tests.id('g_sub');
select pg_temp.day('2026-11-26');
select is(pg_temp.refusal(format($$select public.create_category(%L, 'Gate charge')$$, tests.id('g'))), 'catching_up',
  'R-PERIOD-250: a subscription charge 63 days due: catching_up too');
select tests.clear_authentication();
update public.subscriptions set next_due = date '2026-11-26' - 62 where id = tests.id('g_sub');
select pg_temp.day('2026-11-26');
select is(pg_temp.refusal(format($$select public.create_category(%L, 'Gate charge 62')$$, tests.id('g'))), 'no error',
  'R-PERIOD-250: 62 days: not behind');

-- ===========================================================================
-- What the reviewer's surviving mutants showed untested (re-check 3), import
-- ===========================================================================
-- preview_import_part (D-455): its refusals, the day, the cap, the parts forgotten, fits, part 101
select pg_temp.day('2026-11-16', 'jules');
select tests.remember('o', public.create_budget('Other', 'Salary', 500000, 25, 'none', '2026-09-01'));
select tests.remember('o_staged', gen_random_uuid());
select public.preview_import_part(tests.id('o'), tests.id('o_staged'), 1, pg_temp.row1(8001));
select tests.remember('o_batch', gen_random_uuid());
select public.import_transactions(tests.id('o'), tests.id('o_batch'), 1, pg_temp.row1(8002), 'csv');
select pg_temp.day('2026-11-16');
select is(pg_temp.refusal(format($$select public.preview_import_part(%L, %L, 1, %L)$$, tests.id('i'), tests.id('o_staged'), pg_temp.row1(1))),
  'import_batch_conflict', 'R-IMPORT-340: another budget''s staged batch id is refused');
select is(pg_temp.refusal(format($$select public.preview_import_part(%L, %L, 1, %L)$$, tests.id('i'), tests.id('o_batch'), pg_temp.row1(1))),
  'import_batch_conflict', 'R-IMPORT-340: another budget''s batch is refused');
select tests.remember('u_b', gen_random_uuid());
select public.import_transactions(tests.id('i'), tests.id('u_b'), 1, pg_temp.row1(8101), 'csv');
select public.undo_import_batch(tests.id('u_b'));
select is(pg_temp.refusal(format($$select public.preview_import_part(%L, %L, 2, %L)$$, tests.id('i'), tests.id('u_b'), pg_temp.row1(1))),
  'batch_undone', 'R-IMPORT-340: an undone batch is refused');
select is(pg_temp.refusal(format($$select public.preview_import_part(%L, gen_random_uuid(), 101, %L)$$, tests.id('i'), pg_temp.row1(1))),
  'invalid_chunk', 'R-IMPORT-340: part 101 is refused (1 to 100)');
select tests.remember('pp', gen_random_uuid());
select public.preview_import_part(tests.id('i'), tests.id('pp'), 1, pg_temp.row1(8201));
select public.preview_import_part(tests.id('i'), tests.id('pp'), 2, pg_temp.row1(8202));
select public.preview_import_part(tests.id('i'), tests.id('pp'), 3, pg_temp.row1(8203));
select is((public.preview_import_part(tests.id('i'), tests.id('pp'), 2, pg_temp.row1(8202)) -> 'parts')::text, '[1, 2]',
  'R-IMPORT-340: previewing part 2 again forgets the staged parts from it on (part 3)');
select tests.clear_authentication();
update private.import_preview_parts set created_at = now() - interval '25 hours' where batch_id = tests.id('pp') and part = 1;
select pg_temp.day('2026-11-16');
select is((public.preview_import_part(tests.id('i'), tests.id('pp'), 2, pg_temp.row1(8202)) -> 'parts')::text, '[2]',
  'R-IMPORT-340: a part staged more than a day ago is forgotten');
select tests.clear_authentication();
savepoint parts_cap;
create or replace function private.limit_import_preview_parts_kept() returns integer language sql immutable set search_path = '' as $f$ select 2 $f$;
select pg_temp.day('2026-11-16');
select public.preview_import_part(tests.id('i'), gen_random_uuid(), 1, pg_temp.row1(8301));
select public.preview_import_part(tests.id('i'), gen_random_uuid(), 1, pg_temp.row1(8302));
select tests.clear_authentication();
select is((select count(*)::integer from private.import_preview_parts where budget_id = tests.id('i')), 2,
  'R-IMPORT-340: at most 100 staged parts a budget (2 here): the oldest go');
rollback to savepoint parts_cap;
savepoint parts_fit;
do $d$ begin
  execute format($f$create or replace function private.limit_transactions() returns integer language sql stable set search_path = ''
    as $g$ select (select count(*)::integer from public.transactions where budget_id = %L) + 1 $g$$f$, tests.id('i'));
end $d$;
select pg_temp.day('2026-11-16');
select is((public.preview_import_part(tests.id('i'), gen_random_uuid(), 1,
           (select jsonb_agg(jsonb_build_object('date', '2026-11-12', 'amount', 8400 + g, 'direction', 'debit')) from generate_series(1, 2) as g))
          ->> 'fits'), 'false', 'R-IMPORT-340: fits is false when the statement''s rows to import do not fit');
select tests.clear_authentication();
rollback to savepoint parts_fit;
-- the 24-hour window: a use 23 hours ago still counts
select tests.clear_authentication();
savepoint window24;
create or replace function private.limit_import_rows_per_day() returns integer language sql immutable set search_path = '' as $f$ select 5 $f$;
delete from private.import_budget_usage where budget_id = tests.id('i');
insert into private.import_budget_usage (budget_id, minute, rows, batches, tokens)
values (tests.id('i'), date_trunc('minute', now()) - interval '23 hours', 5, 0, 0);
select pg_temp.day('2026-11-16');
select is(pg_temp.refusal(format($$select * from public.import_transactions(%L, gen_random_uuid(), 1, %L, 'csv')$$, tests.id('i'), pg_temp.row1(8501))),
  'import_limit_reached {"limit" : "rows_per_day"}', 'R-IMPORT-341: rows used 23 hours ago still count (a rolling 24 hours)');
select tests.clear_authentication();
update private.import_budget_usage set minute = date_trunc('minute', now()) - interval '25 hours' where budget_id = tests.id('i');
select pg_temp.day('2026-11-16');
select is(pg_temp.refusal(format($$select * from public.import_transactions(%L, gen_random_uuid(), 1, %L, 'csv')$$, tests.id('i'), pg_temp.row1(8502))),
  'no error', 'R-IMPORT-341: 25 hours ago no longer');
select tests.clear_authentication();
rollback to savepoint window24;
-- an answer older than 7 days is forgotten: sending the chunk again answers chunk_expired
select tests.remember('old_b', gen_random_uuid());
select pg_temp.day('2026-11-16');
select public.import_transactions(tests.id('i'), tests.id('old_b'), 1, pg_temp.row1(8601), 'csv');
select tests.clear_authentication();
update private.import_chunks set created_at = now() - interval '8 days' where batch_id = tests.id('old_b');
select pg_temp.day('2026-11-16');
select public.import_transactions(tests.id('i'), gen_random_uuid(), 1, pg_temp.row1(8602), 'csv');
select is(pg_temp.refusal(format($$select * from public.import_transactions(%L, %L, 1, %L, 'csv')$$, tests.id('i'), tests.id('old_b'), pg_temp.row1(8601))),
  'chunk_expired', 'R-IMPORT-341: an answer older than 7 days is forgotten; the chunk is never imported twice');
-- the rule preview: covered by the longest fragment; would_move counts only what is to review
select tests.remember('rc', (select id from public.create_category(tests.id('i'), 'Groceries')));
select public.create_merchant_rule(tests.id('i'), 'coop', tests.id('rc'));
select public.create_merchant_rule(tests.id('i'), 'coop bern', tests.id('rc'));
select is((select covered_by_fragment from public.preview_merchant_rule(tests.id('i'), 'Coop Bern 12')), 'coop bern',
  'R-IMPORT-347: covered by the longest fragment it contains');
-- (would_move's "to review only" cannot be told apart: a transaction in "to categorise" is always
-- to review, a trigger refuses any other state there)
-- a moved start onto a debt's opening day is refused (on or before the opening)
select pg_temp.day('2026-11-16');
select tests.remember('db', public.create_budget('Debt edge', 'Salary', 500000, 25, 'nearest', '2026-09-01'));
select tests.remember('db_cat', (select id from public.create_category(tests.id('db'), 'Loans', p_amount => 1000)));
select public.create_debt(tests.id('db'), 'Loan', 100000, tests.id('db_cat'), 5000, 12);
select pg_temp.day('2026-11-26');
select public.ensure_periods(tests.id('db'));
select is((select refusal from public.preview_move_period_start(pg_temp.period_at('db', '2026-11-26'), '2026-11-16')), 'interest_before_opening',
  'R-DEBT-340: a start moved onto the opening day itself is refused');

select * from finish();
rollback;
