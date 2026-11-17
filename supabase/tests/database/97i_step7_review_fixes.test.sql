-- Step 7, the fixes after the independent review of 2264e82: a period is never without a key and
-- every occurrence is found by its key (M1, C1, D-490); deleting a budget or a login never fails on
-- a transfer that named two incomes (M2, C5); moving a period's start moves the catch-up's own
-- transactions (M3); the shoulds S1 to S6, C3 and the tests the reviewer listed as missing.
begin;
select no_plan();

select tests.create_user('iris', 'Iris');
select tests.create_user('ivan', 'Ivan');
select tests.create_user('ines', 'Ines');
select tests.set_today('2026-11-16');
select tests.authenticate_as('iris');

create function pg_temp.day(d date, who text default 'iris') returns void language plpgsql as $$
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

-- ===========================================================================
-- M1: a salary 15 days early, then the next one expected on its day: both paydays have their
-- transfer (R-ACCOUNT-307, D-490; the reviewer's F1)
-- ===========================================================================
select pg_temp.day('2026-12-15');
select pg_temp.budget('f1', 30);
select tests.remember('f1_t', (select id from public.create_transfer(tests.id('f1'), 'Savings on payday', tests.id('f1_main'),
  tests.id('f1_sav'), 100000, 'pay_date', p_is_automatic => true, p_category_id => tests.id('f1_cat'),
  p_from_period_id => tests.id('f1_p1'))));
select public.record_early_pay_date(tests.id('f1'), (pg_temp.cur('f1')).id, (pg_temp.cur('f1')).revision, '2026-12-15');
select public.set_expected_pay_date(tests.id('f1'), (pg_temp.cur('f1')).id, (pg_temp.cur('f1')).revision, '2027-01-30');
select pg_temp.day('2027-03-02');
select public.ensure_periods(tests.id('f1'));
select results_eq(
  $$select start_date, rows from pg_temp.rows('f1', tests.id('f1_t'))$$,
  $$values ('2026-09-30'::date, '2026-09-30/2026-09-30/done'), ('2026-10-30', '2026-10-30/2026-10-30/done'),
           ('2026-11-30', '2026-11-30/2026-11-30/done'), ('2026-12-15', '2026-12-30/2026-12-15/done'),
           ('2027-01-30', '2027-01-30/2027-01-30/done'), ('2027-02-28', '2027-02-28/2027-02-28/done')$$,
  'R-ACCOUNT-307: the period of the salary expected on 30 January takes that scheduled pay date as its key and has its transfer');
select is(pg_temp.txs(tests.id('f1_t')), '2026-09-30,2026-10-30,2026-11-30,2026-12-15,2027-01-30,2027-02-28',
  'R-ACCOUNT-307: one transaction for each of the six salaries');
-- the derivation depends only on the earlier periods: derived again in order, every key is the same
select tests.clear_authentication();
select is((select count(*)::integer from public.periods as p
           where p.budget_id = tests.id('f1')
             and p.pay_key is distinct from private.period_pay_key(p.budget_id, p.seq, p.start_date)), 0,
  'R-ACCOUNT-307: every stored key is the one the derivation gives again (the backfill of existing budgets uses it)');
select tests.authenticate_as('iris');
-- reopen and redo: the same key, the same mark, one transaction
select pg_temp.day('2027-03-03');
select public.reopen_previous_period(tests.id('f1'), (pg_temp.cur('f1')).id, (pg_temp.cur('f1')).revision, '2027-03-10');
select public.record_early_pay_date(tests.id('f1'), (pg_temp.cur('f1')).id, (pg_temp.cur('f1')).revision, '2027-02-28');
select results_eq(
  $$select start_date, rows from pg_temp.rows('f1', tests.id('f1_t')) where seq >= 5$$,
  $$values ('2027-01-30'::date, '2027-01-30/2027-01-30/done'), ('2027-02-28', '2027-02-28/2027-02-28/done')$$,
  'R-ACCOUNT-307: reopened and recorded again, the period has the same key and its one transfer');
select is(pg_temp.txs(tests.id('f1_t')), '2026-09-30,2026-10-30,2026-11-30,2026-12-15,2027-01-30,2027-02-28',
  'R-ACCOUNT-302: still one transaction for each salary');

-- ===========================================================================
-- M1 with C1: three salaries recorded within three weeks give three transfers, each listed once,
-- found by its key wherever the key lies (R-ACCOUNT-307, R-ACCOUNT-240, D-490; the reviewer's F6)
-- ===========================================================================
select pg_temp.day('2026-12-02');
select pg_temp.budget('f6');
select tests.remember('f6_t', (select id from public.create_transfer(tests.id('f6'), 'Savings on payday', tests.id('f6_main'),
  tests.id('f6_sav'), 100000, 'pay_date', p_is_automatic => true, p_category_id => tests.id('f6_cat'),
  p_from_period_id => tests.id('f6_p1'))));
select public.record_early_pay_date(tests.id('f6'), (pg_temp.cur('f6')).id, (pg_temp.cur('f6')).revision, '2026-12-02');
select pg_temp.day('2026-12-09');
select public.record_early_pay_date(tests.id('f6'), (pg_temp.cur('f6')).id, (pg_temp.cur('f6')).revision, '2026-12-09');
select pg_temp.day('2026-12-16');
select public.record_early_pay_date(tests.id('f6'), (pg_temp.cur('f6')).id, (pg_temp.cur('f6')).revision, '2026-12-16');
select pg_temp.day('2026-12-26');
select public.ensure_periods(tests.id('f6'));
select results_eq(
  $$select start_date, rows from pg_temp.rows('f6', tests.id('f6_t')) where seq >= 3$$,
  $$values ('2026-11-25'::date, '2026-11-25/2026-11-25/done'), ('2026-12-02', '2026-12-25/2026-12-02/done'),
           ('2026-12-09', '2027-01-25/2026-12-09/done'), ('2026-12-16', '2027-02-25/2026-12-16/done')$$,
  'R-ACCOUNT-307: three salaries in three weeks: three keys, three transfers, each listed once, in its own period');
select is(pg_temp.txs(tests.id('f6_t')), '2026-09-25,2026-10-25,2026-11-25,2026-12-02,2026-12-09,2026-12-16',
  'R-ACCOUNT-307: one transaction for each salary');
select is((select count(*)::integer from public.get_transfer_checklist(pg_temp.period_at('f6', '2026-12-25')) as c
           where c.transfer_id = tests.id('f6_t')), 1,
  'R-ACCOUNT-301: the period containing the earlier keys lists only its own occurrence, not those planned elsewhere');
select tests.clear_authentication();
select is((select count(*)::integer from private.transfer_planned(tests.id('f6_t'), '2026-12-25')), 1,
  'R-ACCOUNT-301: a key two periods away from the one containing it is found as planned');
select tests.authenticate_as('iris');
-- deleting the transaction of 2 December: not done, never created again
select public.delete_transaction(x.id, x.revision) from public.transaction_list as x
where x.transfer_id = tests.id('f6_t') and x.date = '2026-12-02';
select public.ensure_periods(tests.id('f6'));
select is((select mark::text from public.transfer_occurrences where transfer_id = tests.id('f6_t') and occurrence_date = '2026-12-25'),
  'not_done', 'R-ACCOUNT-240: deleting the transaction of an occurrence keyed far away marks it not done');
select is(pg_temp.txs(tests.id('f6_t')), '2026-09-25,2026-10-25,2026-11-25,2026-12-09,2026-12-16',
  'R-ACCOUNT-240: and the catch-up does not create it again');
-- ending the transfer from the last period keeps the catch-up's marks still planned as its own
select is(public.end_transfer(tests.id('f6_t'), (select revision from public.transfers where id = tests.id('f6_t')),
                              pg_temp.period_at('f6', '2026-12-25')), 'ended', 'R-ACCOUNT-234: (ended from the last period)');
select is((select by_catch_up from public.transfer_occurrences where transfer_id = tests.id('f6_t') and occurrence_date = '2027-01-25'),
  true, 'R-ACCOUNT-234: ending does not freeze a catch-up''s mark still planned in an earlier period, however far its key');
select is((select by_catch_up from public.transfer_occurrences where transfer_id = tests.id('f6_t') and occurrence_date = '2027-02-25'),
  false, 'R-ACCOUNT-234: the mark of the occurrence it removes is kept as recorded');

-- ===========================================================================
-- M1: the key a far earlier period has as its scheduled pay date belongs to that period, also
-- when the transfer later chose an income paid that day (D-420, D-490; the two-period lookback
-- replaced by the key lookup)
-- ===========================================================================
select pg_temp.day('2026-12-02');
select pg_temp.budget('fk');
select tests.remember('fk_t', (select id from public.create_transfer(tests.id('fk'), 'Savings on payday', tests.id('fk_main'),
  tests.id('fk_sav'), 100000, 'pay_date', p_from_period_id => tests.id('fk_p1'))));
select public.record_early_pay_date(tests.id('fk'), (pg_temp.cur('fk')).id, (pg_temp.cur('fk')).revision, '2026-12-02');
select pg_temp.day('2026-12-09');
select public.record_early_pay_date(tests.id('fk'), (pg_temp.cur('fk')).id, (pg_temp.cur('fk')).revision, '2026-12-09');
select pg_temp.day('2026-12-16');
select public.record_early_pay_date(tests.id('fk'), (pg_temp.cur('fk')).id, (pg_temp.cur('fk')).revision, '2026-12-16');
select pg_temp.day('2026-12-23');
select public.record_early_pay_date(tests.id('fk'), (pg_temp.cur('fk')).id, (pg_temp.cur('fk')).revision, '2026-12-23');
select tests.remember('fk_p7', (pg_temp.cur('fk')).id);
select is((select pay_key from public.periods where budget_id = tests.id('fk') and pay_key = '2026-12-25'
           and seq = (select seq from public.periods where id = tests.id('fk_p7')) - 3), '2026-12-25'::date,
  'R-ACCOUNT-307: (the 25th of December is the key of the period three before the current one)');
select tests.remember('fk_inc', public.add_income(tests.id('fk'), 'Partner', 300000, 25, 'none', null, tests.id('fk_p1')));
select lives_ok(format($$select * from public.update_transfer(%L, %s, p_income_id => %L, p_from_period_id => %L)$$,
                       tests.id('fk_t'), (select revision from public.transfers where id = tests.id('fk_t')), tests.id('fk_inc'),
                       tests.id('fk_p7')), 'R-ACCOUNT-071: (from the current period the transfer follows the partner, paid on the 25th)');
select is((select count(*)::integer from public.periods as p cross join lateral public.get_transfer_checklist(p.id) as c
           where p.budget_id = tests.id('fk') and c.transfer_id = tests.id('fk_t') and c.occurrence_date = '2026-12-25' and c.planned), 1,
  'R-ACCOUNT-301: the 25th of December is planned once, by the earlier period whose scheduled pay date it is');
select tests.clear_authentication();
select is((select string_agg(pl.seq::text, ',') from private.transfer_plan_range(tests.id('fk'), tests.id('fk_t'), 1, 20) as pl
           where pl.occurrence_date = '2026-12-25'),
          ((select seq from public.periods where id = tests.id('fk_p7')) - 3)::text,
  'R-ACCOUNT-301: the plan gives that key to the earlier period only');

-- ===========================================================================
-- M2 with C5: a budget whose transfer named two incomes is deleted, also within the transaction
-- that created it, and so is its owner's login (R-ACCOUNT-308; the reviewer's p_delete4 case 4)
-- ===========================================================================
create function pg_temp.two_incomes(n text) returns void language plpgsql as $$
declare
  t uuid;
  b uuid;
begin
  perform pg_temp.budget(n);
  b := tests.id(n);
  perform tests.remember(n || '_p2', (select id from public.periods where budget_id = b and seq = 2));
  perform tests.remember(n || '_p4', (select id from public.periods where budget_id = b and seq = 4));
  perform tests.remember(n || '_partner', public.add_income(tests.id(n), 'Partner', 300000, 10, 'none', null, tests.id(n || '_p4')));
  perform tests.remember(n || '_side', public.add_income(tests.id(n), 'Side job', 50000, 15, 'none', null, tests.id(n || '_p2')));
  t := (select id from public.create_transfer(tests.id(n), 'Saving', tests.id(n || '_main'), tests.id(n || '_sav'), 100,
    'pay_date', p_income_id => tests.id(n || '_side'), p_is_automatic => true, p_category_id => tests.id(n || '_cat'),
    p_from_period_id => tests.id(n || '_p2')));
  perform public.update_transfer(t, (select revision from public.transfers where id = t),
    p_income_id => tests.id(n || '_partner'), p_from_period_id => tests.id(n || '_p4'));
  perform tests.remember(n || '_t', t);
end $$;
select pg_temp.day('2027-01-26');
select pg_temp.two_incomes('m2');
select is((select count(distinct income_id)::integer from public.transfer_versions where transfer_id = tests.id('m2_t')), 2,
  'R-ACCOUNT-308: (the transfer named two incomes, the later one from period 4)');
select lives_ok(format($$select public.delete_budget(%L)$$, tests.id('m2')),
  'R-ACCOUNT-308: delete_budget deletes a budget whose transfer named two incomes (created in this same transaction)');
select is((select count(*)::integer from public.budgets where id = tests.id('m2')), 0, 'R-ACCOUNT-308: the budget is gone');
select is((select count(*)::integer from public.transfers where budget_id = tests.id('m2')), 0, 'R-ACCOUNT-308: its transfers with it');
-- the owner's login: every budget they own goes with it
select pg_temp.day('2027-01-26', 'ines');
select pg_temp.two_incomes('m2b');
select tests.clear_authentication();
select lives_ok(format($$delete from auth.users where id = %L$$, tests.get_user_id('ines')),
  'R-ACCOUNT-308: deleting the owner''s login deletes their budget whose transfer named two incomes');
select is((select count(*)::integer from public.budgets where id = tests.id('m2b')), 0, 'R-ACCOUNT-308: that budget is gone too');
select tests.authenticate_as('iris');

-- ===========================================================================
-- M3: moving a period's start moves what the app recorded by itself; a member's own mark stays
-- (R-ACCOUNT-309, D-491; the reviewer's F2b)
-- ===========================================================================
select pg_temp.day('2026-11-25');
select pg_temp.budget('m3');
select tests.remember('m3_t', (select id from public.create_transfer(tests.id('m3'), 'Savings on payday', tests.id('m3_main'),
  tests.id('m3_sav'), 100000, 'pay_date', p_is_automatic => true, p_category_id => tests.id('m3_cat'),
  p_from_period_id => tests.id('m3_p1'))));
select tests.remember('m3_h', (select id from public.create_transfer(tests.id('m3'), 'By hand', tests.id('m3_main'),
  tests.id('m3_sav'), 5000, 'pay_date', p_from_period_id => tests.id('m3_p1'))));
select tests.remember('m3_cur', (pg_temp.cur('m3')).id);
select lives_ok(format($$select * from public.mark_transfer_done(%L, %L, 0, p_done_on => '2026-11-25')$$, tests.id('m3_h'), tests.id('m3_cur')),
  'R-ACCOUNT-309: (a member marks the manual one done on the 25th)');
select pg_temp.day('2026-11-27');
select is((select row(accepted, transfer_transactions_removed, transfer_transactions_created)::text
           from public.preview_move_period_start(tests.id('m3_cur'), '2026-11-27')), row(true, 1, 1)::text,
  'R-ACCOUNT-309: the preview of the move counts the catch-up''s transaction that moves (removed from the 25th, made on the 27th)');
select lives_ok(format($$select public.move_period_start(%L, %s, '2026-11-27')$$, tests.id('m3_cur'),
                       (select revision from public.periods where id = tests.id('m3_cur'))),
  'R-ACCOUNT-309: (the salary came on the 27th: the member moves the start)');
select is(pg_temp.txs(tests.id('m3_t')), '2026-09-25,2026-10-25,2026-11-27',
  'R-ACCOUNT-309: the automatic transaction sits on the new due date, in the moved period');
select is((select string_agg(c.status || '/' || c.done_on, ',') from public.get_transfer_checklist(tests.id('m3_cur')) as c
           where c.transfer_id = tests.id('m3_t')), 'done/2026-11-27',
  'R-ACCOUNT-309: the moved period''s checklist row is done on the 27th');
select is((select count(*)::integer from public.transaction_list as x
           where x.transfer_id = tests.id('m3_t') and x.period_id = pg_temp.period_at('m3', '2026-11-26')), 1,
  'R-ACCOUNT-309: the period before keeps only its own transfer');
select is((select done_on from public.transfer_occurrences where transfer_id = tests.id('m3_h')
           and occurrence_date = '2026-11-25'), '2026-11-25'::date,
  'R-ACCOUNT-309: a member''s own mark stays where the member put it');
-- the preview and the write agree on the debts' refusal (R-DEBT-340): nothing to count then
select pg_temp.day('2026-12-10');
select tests.remember('m3_dc', (select id from public.create_category(tests.id('m3'), 'Loans', p_amount => 1000)));
select tests.remember('m3_debt', (select id from public.create_debt(tests.id('m3'), 'Loan', 100000, tests.id('m3_dc'), 5000, 12)));
select pg_temp.day('2026-12-26');
select public.ensure_periods(tests.id('m3'));
select tests.remember('m3_dec', (pg_temp.cur('m3')).id);
select is((select row(accepted, refusal, interest_removed, transfer_transactions_removed, transfer_transactions_created)::text
           from public.preview_move_period_start(tests.id('m3_dec'), '2026-12-10')),
          row(false, 'interest_before_opening', 0, 0, 0)::text,
  'R-DEBT-340: a move onto the opening of a debt with interest there is refused by the preview, with nothing counted');
select throws_ok(format($$select public.move_period_start(%L, %s, '2026-12-10')$$, tests.id('m3_dec'),
                        (select revision from public.periods where id = tests.id('m3_dec'))),
  'P0001', 'interest_before_opening', 'R-DEBT-340: and by the write');
select is(pg_temp.txs(tests.id('m3_t')), '2026-09-25,2026-10-25,2026-11-27,2026-12-25',
  'R-ACCOUNT-309: the refused move moved nothing');

-- ===========================================================================
-- S1: naming the primary income is the same as naming none (R-ACCOUNT-310; the reviewer's F9)
-- ===========================================================================
select pg_temp.day('2026-11-20');
select pg_temp.budget('s1');
select tests.remember('s1_none', (select id from public.create_transfer(tests.id('s1'), 'No income chosen', tests.id('s1_main'),
  tests.id('s1_sav'), 1000, 'pay_date', p_is_automatic => true, p_category_id => tests.id('s1_cat'), p_from_period_id => tests.id('s1_p1'))));
select tests.remember('s1_prim', (select id from public.create_transfer(tests.id('s1'), 'Salary chosen', tests.id('s1_main'),
  tests.id('s1_sav'), 2000, 'pay_date', p_income_id => (select primary_income_id from public.budgets where id = tests.id('s1')),
  p_is_automatic => true, p_category_id => tests.id('s1_cat'), p_from_period_id => tests.id('s1_p1'))));
select public.record_early_pay_date(tests.id('s1'), (pg_temp.cur('s1')).id, (pg_temp.cur('s1')).revision, '2026-11-20');
select pg_temp.day('2026-12-26');
select public.ensure_periods(tests.id('s1'));
select public.reopen_previous_period(tests.id('s1'), (pg_temp.cur('s1')).id, (pg_temp.cur('s1')).revision, '2026-12-29');
select pg_temp.day('2026-12-30');
select public.ensure_periods(tests.id('s1'));
select is(pg_temp.txs(tests.id('s1_none')), '2026-09-25,2026-10-25,2026-11-20,2026-12-29',
  'R-ACCOUNT-310: (no income chosen: one transfer per salary, on the day it came)');
select is(pg_temp.txs(tests.id('s1_prim')), pg_temp.txs(tests.id('s1_none')),
  'R-ACCOUNT-310: the primary income chosen gives the same transfers, on the same days');
select is((select string_agg(rows, '|' order by seq) from pg_temp.rows('s1', tests.id('s1_prim'))),
          (select string_agg(rows, '|' order by seq) from pg_temp.rows('s1', tests.id('s1_none'))),
  'R-ACCOUNT-310: and the same checklist rows, none following the primary as a fallback');
select is((select bool_or(c.follows_primary) from public.periods as p cross join lateral public.get_transfer_checklist(p.id) as c
           where p.budget_id = tests.id('s1') and c.transfer_id = tests.id('s1_prim')), false,
  'R-ACCOUNT-310: a transfer that chose the primary income never says it follows the primary instead');

-- ===========================================================================
-- S2: ending a chosen income never rewrites what is already recorded (R-ACCOUNT-311, D-492; the
-- reviewer's F8): remove_income, and leave_budget for a member's income
-- ===========================================================================
select pg_temp.day('2026-11-20');
select pg_temp.budget('s2');
select tests.remember('s2_inc', public.add_income(tests.id('s2'), 'Partner', 300000, 10, p_from_period_id => tests.id('s2_p1')));
select tests.remember('s2_t', (select id from public.create_transfer(tests.id('s2'), 'After the partner''s salary', tests.id('s2_main'),
  tests.id('s2_sav'), 30000, 'pay_date', p_offset_days => 2, p_income_id => tests.id('s2_inc'), p_is_automatic => true,
  p_category_id => tests.id('s2_cat'), p_from_period_id => tests.id('s2_p1'))));
select is(pg_temp.txs(tests.id('s2_t')), '2026-10-11,2026-11-12', 'R-ACCOUNT-311: (two days after each of the partner''s salaries)');
select is(public.remove_income(tests.id('s2_inc'), (select revision from public.incomes where id = tests.id('s2_inc'))), 'ended',
  'R-ACCOUNT-311: (on 20 November the partner''s income ends)');
select is(pg_temp.txs(tests.id('s2_t')), '2026-10-11,2026-11-12',
  'R-ACCOUNT-311: the transfer of 12 November stays and nothing dated in the past appears');
select is((select string_agg(c.occurrence_date || '/' || c.status || '/' || c.planned, ',')
           from public.get_transfer_checklist((pg_temp.cur('s2')).id) as c where c.transfer_id = tests.id('s2_t')),
  '2026-11-10/done/true', 'R-ACCOUNT-311: the current period still plans the occurrence already made, and only it');
select pg_temp.day('2026-11-28');
select public.ensure_periods(tests.id('s2'));
select is(pg_temp.txs(tests.id('s2_t')), '2026-10-11,2026-11-12,2026-11-27',
  'R-ACCOUNT-311: from the next occurrence not yet due the transfer follows the primary income');
-- a member's income, ended by leave_budget
select pg_temp.day('2026-11-20');
select pg_temp.budget('s2m');
select tests.remember('s2m_inv', public.invite_member(tests.id('s2m'), tests.get_user_email('ivan')));
select pg_temp.day('2026-11-20', 'ivan');
select public.accept_invitation(tests.id('s2m_inv'));
select tests.remember('s2m_inc', public.add_income(tests.id('s2m'), 'Ivan''s salary', 300000, 10,
  p_user_id => tests.get_user_id('ivan'), p_from_period_id => tests.id('s2m_p1')));
select tests.remember('s2m_t', (select id from public.create_transfer(tests.id('s2m'), 'After Ivan''s salary', tests.id('s2m_main'),
  tests.id('s2m_sav'), 30000, 'pay_date', p_offset_days => 2, p_income_id => tests.id('s2m_inc'), p_is_automatic => true,
  p_category_id => tests.id('s2m_cat'), p_from_period_id => tests.id('s2m_p1'))));
select lives_ok(format($$select public.leave_budget(%L)$$, tests.id('s2m')), 'R-ACCOUNT-311: (Ivan leaves the budget)');
select pg_temp.day('2026-11-20');
select is(pg_temp.txs(tests.id('s2m_t')), '2026-10-11,2026-11-12',
  'R-ACCOUNT-311: leave_budget keeps the transfer already made after the member''s salary, and adds nothing in the past');

select tests.clear_authentication();
select * from finish();
rollback;
