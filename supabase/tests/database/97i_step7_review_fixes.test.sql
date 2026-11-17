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
select is((select count(*)::integer from private.transfer_planned(tests.id('f6_t'), '2026-12-25', 'payday')), 1,
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
-- undoing that not-done mark, keyed far after its period, brings the transaction back (D-423:
-- the watermark goes back to the period that plans the key)
select is((select count(*)::integer from public.undo_transfer_mark(tests.id('f6_t'), pg_temp.period_at('f6', '2026-12-02'),
             (select revision from public.transfer_occurrences where transfer_id = tests.id('f6_t') and occurrence_date = '2026-12-25'),
             '2026-12-25')) >= 0, true, 'R-ACCOUNT-240: (the not-done mark is undone)');
select is(pg_temp.txs(tests.id('f6_t')), '2026-09-25,2026-10-25,2026-11-25,2026-12-02,2026-12-09,2026-12-16',
  'R-ACCOUNT-240: undone, the automatic occurrence keyed two periods away has its transaction again');
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
           where p.budget_id = tests.id('fk') and c.transfer_id = tests.id('fk_t') and c.occurrence_date = '2026-12-25' and c.planned), 2,
  'R-ACCOUNT-421: key 25 Dec twice: the salary of 2 Dec (keyed 25 Dec, 23 days early: not that payday) and the partner''s own 25 Dec');
select tests.clear_authentication();
select is((select string_agg(pl.seq::text || '/' || pl.kind, ',' order by pl.seq) from private.transfer_plan_range(tests.id('fk'), tests.id('fk_t'), 1, 20) as pl
           where pl.occurrence_date = '2026-12-25'),
          ((select seq from public.periods where id = tests.id('fk_p7')) - 3)::text || '/payday,'
            || (select seq from public.periods where id = tests.id('fk_p7'))::text || '/income_payday',
  'R-ACCOUNT-460: two occurrences with that key, told apart by their kind');

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

-- ===========================================================================
-- S3: a reopen keeps a transfer that has a mark, listed as ended with its marks, and the preview
-- says so (R-ACCOUNT-312; the reviewer's F4)
-- ===========================================================================
select pg_temp.day('2026-11-22');
select pg_temp.budget('s3');
select tests.remember('s3_p2', (pg_temp.cur('s3')).id);
select tests.remember('s3_t', (select id from public.create_transfer(tests.id('s3'), 'Holiday fund', tests.id('s3_main'),
  tests.id('s3_sav'), 30000, 'pay_date', p_category_id => tests.id('s3_cat'), p_from_period_id => tests.id('s3_p2'))));
select is((select status from public.mark_transfer_done(tests.id('s3_t'), tests.id('s3_p2'), 0, p_amount => 31000)), 'done',
  'R-ACCOUNT-312: (a member marks it done, with a transaction)');
select pg_temp.day('2026-11-26');
select public.ensure_periods(tests.id('s3'));
select is(public.end_transfer(tests.id('s3_t'), (select revision from public.transfers where id = tests.id('s3_t'))), 'ended',
  'R-ACCOUNT-312: (ended from the new period)');
select results_eq(
  $$select change from public.preview_reopen(tests.id('s3')) where record_kind = 'transfer' and record_id = tests.id('s3_t') order by change$$,
  $$values ('ended'::text), ('mark_unplanned')$$,
  'R-ACCOUNT-312: preview_reopen says the transfer is kept, ended, and its mark stays, no longer planned');
select lives_ok(format($$select * from public.reopen_previous_period(%L, %L, %s)$$, tests.id('s3'), (pg_temp.cur('s3')).id,
                       (pg_temp.cur('s3')).revision), 'R-ACCOUNT-312: (the reopen)');
select is((select count(*)::integer from public.transfer_overview where id = tests.id('s3_t') and not is_active), 1,
  'R-ACCOUNT-312: the transfer stays, not in force');
select results_eq(
  $$select status, planned, is_ended, done_on, transaction_id is not null from public.get_transfer_checklist(tests.id('s3_p2'))
    where transfer_id = tests.id('s3_t')$$,
  $$values ('done'::text, false, true, '2026-11-22'::date, true)$$,
  'R-ACCOUNT-312: its mark stays, listed as ended, with its transaction still linked');
select is((select count(*)::integer from public.undo_transfer_mark(tests.id('s3_t'), tests.id('s3_p2'),
             (select revision from public.transfer_occurrences where transfer_id = tests.id('s3_t')))), 0,
  'R-ACCOUNT-312: undo leads out of it');
select is((select count(*)::integer from public.transaction_list where transfer_id = tests.id('s3_t')), 0,
  'R-ACCOUNT-312: with its transaction');

-- ===========================================================================
-- S4: preview_reopen takes the reopen's pay date and describes that reopen (R-ACCOUNT-313; the
-- reviewer's F3a and F3b)
-- ===========================================================================
create function pg_temp.reopen_check(n text, d date) returns text language plpgsql as $$
declare
  v_preview integer;
  v_before integer;
  v_after integer;
  t uuid := tests.id(n || '_t');
begin
  v_preview := (select count(*) from public.preview_reopen(tests.id(n), d) where record_kind = 'transfer' and change = 'transaction_removed');
  v_before := (select count(*) from public.transaction_list where transfer_id = t);
  perform public.reopen_previous_period(tests.id(n), (pg_temp.cur(n)).id, (pg_temp.cur(n)).revision, d);
  v_after := (select count(*) from public.transaction_list where transfer_id = t);
  return v_preview || ' announced, ' || (v_before - v_after) || ' removed';
end $$;
select pg_temp.day('2026-10-20');
select pg_temp.budget('s4a');
select tests.remember('s4a_t', (select id from public.create_transfer(tests.id('s4a'), 'Savings on payday', tests.id('s4a_main'),
  tests.id('s4a_sav'), 100000, 'pay_date', p_is_automatic => true, p_category_id => tests.id('s4a_cat'), p_from_period_id => tests.id('s4a_p1'))));
select public.record_early_pay_date(tests.id('s4a'), (pg_temp.cur('s4a')).id, (pg_temp.cur('s4a')).revision, '2026-10-20');
select pg_temp.day('2026-11-20');
select public.set_expected_pay_date(tests.id('s4a'), (pg_temp.cur('s4a')).id, (pg_temp.cur('s4a')).revision, '2026-12-25');
select pg_temp.day('2027-01-10');
select public.ensure_periods(tests.id('s4a'));
select throws_ok(format($$select * from public.reopen_previous_period(%L, %L, %s)$$, tests.id('s4a'), (pg_temp.cur('s4a')).id,
                        (pg_temp.cur('s4a')).revision), 'P0001', null,
  'R-ACCOUNT-313: (the reopen at its default end is refused)');
select is(pg_temp.reopen_check('s4a', '2027-01-15'), '1 announced, 1 removed',
  'R-ACCOUNT-313: the preview with the pay date announces the removal the reopen with that pay date makes');
select pg_temp.day('2026-11-15');
select pg_temp.budget('s4b');
select tests.remember('s4b_t', (select id from public.create_transfer(tests.id('s4b'), 'A month after payday', tests.id('s4b_main'),
  tests.id('s4b_sav'), 100000, 'pay_date', p_offset_days => 31, p_is_automatic => true, p_category_id => tests.id('s4b_cat'),
  p_from_period_id => tests.id('s4b_p1'))));
select public.record_early_pay_date(tests.id('s4b'), (pg_temp.cur('s4b')).id, (pg_temp.cur('s4b')).revision, '2026-11-15');
select pg_temp.day('2026-11-16');
select public.ensure_periods(tests.id('s4b'));
select is(pg_temp.reopen_check('s4b', '2026-11-17'), '1 announced, 0 removed',
  'R-ACCOUNT-313: with another end the preview follows that end''s due-date cap, as the write does (R-ACCOUNT-462: the transaction is made again on its new due date, one removed and one created)');
select is((select string_agg(x.date::text, ',' order by x.date) from public.transaction_list as x where x.transfer_id = tests.id('s4b_t')), '2026-10-24,2026-11-16',
  'R-ACCOUNT-462: the transaction the app made sits on the occurrence''s new due date (the period''s new last day)');

-- ===========================================================================
-- S5: next_due_date of a yearly or a far quarterly transfer (R-ACCOUNT-314; the reviewer's F5)
-- ===========================================================================
select pg_temp.day('2026-11-16');
select pg_temp.budget('s5');
select tests.remember('s5_y', (select id from public.create_transfer(tests.id('s5'), 'Third pillar', tests.id('s5_main'),
  tests.id('s5_sav'), 705600, 'day_of_month', p_cadence => 'yearly', p_first_date => '2027-03-15')));
select tests.remember('s5_q', (select id from public.create_transfer(tests.id('s5'), 'Taxes', tests.id('s5_main'),
  tests.id('s5_sav'), 300000, 'day_of_month', p_cadence => 'quarterly', p_first_date => '2027-06-30')));
select is((select next_due_date from public.transfer_overview where id = tests.id('s5_y')), '2027-03-15'::date,
  'R-ACCOUNT-314: a yearly transfer four months ahead has its next due date');
select is((select next_due_date from public.transfer_overview where id = tests.id('s5_q')), '2027-06-30'::date,
  'R-ACCOUNT-314: a quarterly one whose first date is seven months ahead too');

-- ===========================================================================
-- C3: creating a transfer records nothing dated before today unless the member asks
-- (R-ACCOUNT-315, D-493)
-- ===========================================================================
select pg_temp.day('2026-11-20');
select pg_temp.budget('c3');
select tests.remember('c3_d', (select id from public.create_transfer(tests.id('c3'), 'On the 5th', tests.id('c3_main'),
  tests.id('c3_sav'), 1000, 'day_of_month', p_day_of_month => 5, p_is_automatic => true, p_category_id => tests.id('c3_cat'))));
select is((select first_date from public.transfer_overview where id = tests.id('c3_d')), '2026-12-05'::date,
  'R-ACCOUNT-315: a fixed day created on 20 November for the 5th starts on 5 December, not on the 5th already past');
select is(pg_temp.txs(tests.id('c3_d')), '', 'R-ACCOUNT-315: nothing dated 5 November is recorded');
select tests.remember('c3_p', (select id from public.create_transfer(tests.id('c3'), 'Payday', tests.id('c3_main'),
  tests.id('c3_sav'), 1000, 'pay_date', p_is_automatic => true, p_category_id => tests.id('c3_cat'))));
select is(pg_temp.txs(tests.id('c3_p')), '', 'R-ACCOUNT-315: a pay-date transfer created after this period''s payday records none for it');
select is((select count(*)::integer from public.get_transfer_checklist((pg_temp.cur('c3')).id) where transfer_id = tests.id('c3_p')), 0,
  'R-ACCOUNT-315: and this period plans none');
select pg_temp.day('2026-11-25');
select public.ensure_periods(tests.id('c3'));
select is(pg_temp.txs(tests.id('c3_p')), '2026-11-25', 'R-ACCOUNT-315: its first occurrence is the next payday');
select pg_temp.day('2026-11-26');
select is((select max(created_at_once_count) from public.preview_create_transfer(tests.id('c3'), tests.id('c3_main'), tests.id('c3_sav'),
             1000, 'day_of_month', p_is_automatic => true, p_category_id => tests.id('c3_cat'), p_first_date => '2026-11-25')), 1,
  'R-ACCOUNT-315: an explicit first date in the current period back-fills, and the preview says so');
select is((select max(created_at_once_count) from public.preview_create_transfer(tests.id('c3'), tests.id('c3_main'), tests.id('c3_sav'),
             1000, 'pay_date', p_is_automatic => true, p_category_id => tests.id('c3_cat'),
             p_from_period_id => (pg_temp.cur('c3')).id)), 1,
  'R-ACCOUNT-315: naming the current period asks for its payday already past, and the preview says so');
select is((select max(created_at_once_count) from public.preview_create_transfer(tests.id('c3'), tests.id('c3_main'), tests.id('c3_sav'),
             1000, 'pay_date', p_is_automatic => true, p_category_id => tests.id('c3_cat'))), 0,
  'R-ACCOUNT-315: with neither, nothing at once');

-- ===========================================================================
-- S6: the dashboard's transfer counts are a read of their own, for members only (D-494)
-- ===========================================================================
select pg_temp.day('2026-11-26', 'ivan');
select throws_ok(format($$select * from public.get_transfers_to_do(%L)$$, tests.id('c3')), 'P0001', 'budget_not_found',
  'R-ACCOUNT-241: another user cannot read a budget''s transfers to do');
select tests.authenticate_as_anon();
select throws_ok(format($$select * from public.get_transfers_to_do(%L)$$, tests.id('c3')), '42501', null,
  'R-ACCOUNT-241: nor can an anonymous visitor');
select pg_temp.day('2026-11-26');
select results_eq(format($$select transfers_to_do, transfers_overdue from public.get_transfers_to_do(%L)$$, tests.id('c3')),
  $$values (0, 0)$$, 'R-ACCOUNT-241: a member reads them (no manual transfer here)');

-- ===========================================================================
-- The gaps the reviewer's mutants showed
-- ===========================================================================
-- a non-member on preview_move_period_start (C-DBTEST-002)
select pg_temp.day('2026-11-26', 'ivan');
select throws_ok(format($$select * from public.preview_move_period_start(%L, '2026-11-24')$$, (select id from public.periods
                        where budget_id = tests.id('c3') and seq = 3)), 'P0001', 'period_not_found',
  'R-PERIOD-133: another user cannot preview moving a period''s start');
select pg_temp.day('2026-11-26');
-- the writes that change the plan settle it before they answer (D-423): caught up at once
select pg_temp.day('2026-11-20');
select pg_temp.budget('st');
select tests.remember('st_inc', public.add_income(tests.id('st'), 'Partner', 300000, 10, p_from_period_id => tests.id('st_p1')));
select tests.remember('st_t', (select id from public.create_transfer(tests.id('st'), 'After the partner', tests.id('st_main'),
  tests.id('st_sav'), 1000, 'pay_date', p_income_id => tests.id('st_inc'), p_is_automatic => true, p_category_id => tests.id('st_cat'),
  p_from_period_id => tests.id('st_p1'))));
select tests.remember('st_inv', public.invite_member(tests.id('st'), tests.get_user_email('ivan')));
select pg_temp.day('2026-11-20', 'ivan');
select public.accept_invitation(tests.id('st_inv'));
select tests.remember('st_inc2', public.add_income(tests.id('st'), 'Ines', 200000, 15,
  p_user_id => tests.get_user_id('ivan'), p_from_period_id => tests.id('st_p1')));
select tests.remember('st_t2', (select id from public.create_transfer(tests.id('st'), 'After Ines', tests.id('st_main'),
  tests.id('st_sav'), 1000, 'pay_date', p_income_id => tests.id('st_inc2'), p_is_automatic => true, p_category_id => tests.id('st_cat'),
  p_from_period_id => tests.id('st_p1'))));
select pg_temp.day('2026-11-20');
select public.set_primary_income(tests.id('st_inc'), (select revision from public.budgets where id = tests.id('st')));
select is((select caught_up from public.my_budgets where id = tests.id('st')), true,
  'R-ACCOUNT-310: set_primary_income settles the transfers before it answers');
select is(pg_temp.txs(tests.id('st_t')), '2026-10-09,2026-11-10',
  'R-ACCOUNT-428: the transfer that chose the new primary keeps this period''s plan (the partner''s 10 Nov); it follows the primary from the next period');
select public.set_expected_pay_date(tests.id('st'), (pg_temp.cur('st')).id, (pg_temp.cur('st')).revision, '2026-12-01');
select is((select caught_up from public.my_budgets where id = tests.id('st')), true,
  'R-ACCOUNT-302: set_expected_pay_date settles the transfers before it answers');
select is(public.remove_income(tests.id('st_inc2'), (select revision from public.incomes where id = tests.id('st_inc2')),
                               tests.id('st_p1')), 'deleted', 'R-ACCOUNT-311: (Ines''s income removed as a correction from the first period)');
select is((select caught_up from public.my_budgets where id = tests.id('st')), true,
  'R-ACCOUNT-311: remove_income settles the transfers before it answers');
select is(pg_temp.txs(tests.id('st_t2')), '2026-09-25,2026-10-25',
  'R-ACCOUNT-311: (from then on the transfer follows the primary, recorded at once; this period''s payday was the partner''s, no longer due at the start)');
select lives_ok(format($$select public.remove_member(%L, %L)$$, tests.id('st'), tests.get_user_id('ivan')), 'R-MEMBER-007: (Ines removed)');
select is((select caught_up from public.my_budgets where id = tests.id('st')), true,
  'R-MEMBER-007: removing a member settles the transfers before it answers');
-- a fixed day's nominal day against a clamped first date, and the default first date on the
-- period's start day (R-ACCOUNT-300)
select is((select first_date || '/' || day_of_month from public.create_transfer(tests.id('st'), 'Month end', tests.id('st_main'),
             tests.id('st_sav'), 1000, 'day_of_month', p_day_of_month => 31, p_first_date => '2026-11-30')),
  '2026-11-30/31', 'R-ACCOUNT-300: a first date clamped to a short month keeps the nominal day 31');
select is((select string_agg(due_date::text, ',') from public.preview_create_transfer(tests.id('st'), tests.id('st_main'), tests.id('st_sav'),
             1000, 'day_of_month', p_day_of_month => 25, p_from_period_id => (pg_temp.cur('st')).id, p_count => 2)),
  '2026-10-25,2026-11-25', 'R-ACCOUNT-300: with only the day and a period, the first date is the period''s start when it falls on that day');
-- the retry digest covers the cadence and the first date (D-390)
select tests.remember('st_req', extensions.gen_random_uuid());
select tests.remember('st_y', (select id from public.create_transfer(tests.id('st'), 'Yearly', tests.id('st_main'), tests.id('st_sav'), 1000,
  'day_of_month', p_cadence => 'yearly', p_first_date => '2027-03-01', p_client_id => tests.id('st_req'))));
select throws_ok(format($$select * from public.create_transfer(%L, 'Yearly', %L, %L, 1000, 'day_of_month', p_cadence => 'quarterly',
                          p_first_date => '2027-03-01', p_client_id => %L)$$, tests.id('st'), tests.id('st_main'), tests.id('st_sav'),
                        tests.id('st_req')), 'P0001', 'request_reused', 'R-APP-340: the same client id with another cadence is refused');
select throws_ok(format($$select * from public.create_transfer(%L, 'Yearly', %L, %L, 1000, 'day_of_month', p_cadence => 'yearly',
                          p_first_date => '2027-04-01', p_client_id => %L)$$, tests.id('st'), tests.id('st_main'), tests.id('st_sav'),
                        tests.id('st_req')), 'P0001', 'request_reused', 'R-APP-340: and with another first date');
-- the committed total rounds each transfer's monthly share, not their sum (R-ACCOUNT-304)
select pg_temp.budget('rd');
select public.create_transfer(tests.id('rd'), 'A', tests.id('rd_main'), tests.id('rd_sav'), 100001, 'day_of_month',
  p_cadence => 'yearly', p_first_date => '2027-03-01', p_category_id => tests.id('rd_cat'));
select public.create_transfer(tests.id('rd'), 'B', tests.id('rd_main'), tests.id('rd_sav'), 100001, 'day_of_month',
  p_cadence => 'yearly', p_first_date => '2027-04-01', p_category_id => tests.id('rd_cat'));
select is((select transfer_committed_total from public.period_summaries where id = (pg_temp.cur('rd')).id), 16666::bigint,
  'R-ACCOUNT-304: two yearly 1000.01 count 833.33 each in the period''s committed total (16666, not 16667)');

-- an occurrence of the ended income not yet due on the day it ended is not planned (R-ACCOUNT-311)
select pg_temp.day('2026-11-20');
select pg_temp.budget('nd');
select tests.remember('nd_inc', public.add_income(tests.id('nd'), 'Partner', 300000, 10, 'none', null, tests.id('nd_p1')));
select tests.remember('nd_t', (select id from public.create_transfer(tests.id('nd'), 'Two weeks after the partner', tests.id('nd_main'),
  tests.id('nd_sav'), 1000, 'pay_date', p_offset_days => 15, p_income_id => tests.id('nd_inc'), p_is_automatic => true,
  p_category_id => tests.id('nd_cat'), p_from_period_id => tests.id('nd_p1'))));
select is(public.remove_income(tests.id('nd_inc'), (select revision from public.incomes where id = tests.id('nd_inc'))), 'ended',
  'R-ACCOUNT-311: (ended on 20 November, before the occurrence of 10 November was due on the 24th)');
select pg_temp.day('2026-11-24');
select public.ensure_periods(tests.id('nd'));
select is(pg_temp.txs(tests.id('nd_t')), '2026-10-24', 'R-ACCOUNT-311: an occurrence not yet due when the income ended is not made');
-- a scheduled pay date lying in the period before (a late salary), where the transfer followed a
-- chosen income paid that day: two incomes, two paydays (R-ACCOUNT-421 as amended by D-560: the
-- same payday is one income's salary and its own pay date; it was one occurrence before)
select pg_temp.day('2026-11-25');
select pg_temp.budget('lk');
select tests.remember('lk_inc', public.add_income(tests.id('lk'), 'Partner', 300000, 25, 'none', null, tests.id('lk_p1')));
select tests.remember('lk_t', (select id from public.create_transfer(tests.id('lk'), 'After the partner', tests.id('lk_main'),
  tests.id('lk_sav'), 1000, 'pay_date', p_income_id => tests.id('lk_inc'), p_from_period_id => tests.id('lk_p1'))));
select public.ensure_periods(tests.id('lk'));
select public.reopen_previous_period(tests.id('lk'), (pg_temp.cur('lk')).id, (pg_temp.cur('lk')).revision, '2026-12-05');
select pg_temp.day('2026-11-28');
select public.record_early_pay_date(tests.id('lk'), (pg_temp.cur('lk')).id, (pg_temp.cur('lk')).revision, '2026-11-28');
select lives_ok(format($$select * from public.update_transfer(%L, %s, p_clear_income => true, p_from_period_id => %L)$$,
                       tests.id('lk_t'), (select revision from public.transfers where id = tests.id('lk_t')), (pg_temp.cur('lk')).id),
  'R-ACCOUNT-071: (from the late salary''s period the transfer follows the primary, keyed 25 November)');
select tests.clear_authentication();
select is((select string_agg(pl.start_date::text, ',' order by pl.start_date) from private.transfer_plan_range(tests.id('lk'), tests.id('lk_t'), 1, 9) as pl
           where pl.occurrence_date = '2026-11-25'), '2026-10-25,2026-11-28',
  'R-ACCOUNT-461: key 25 Nov twice: the partner''s 25 Nov in the period containing it, the late salary of 28 Nov in its own');
select tests.authenticate_as('iris');

-- a primary switch to an income with the same projected end still looks at the transfers that
-- chose it (R-ACCOUNT-310): here the partner, paid on the 25th or the Friday before, was not paid
-- in the current period; as the primary it gives the period's scheduled pay date
select pg_temp.day('2026-11-16');
select pg_temp.budget('ps');
select tests.remember('ps_inc', public.add_income(tests.id('ps'), 'Partner', 300000, 25, 'previous', null, tests.id('ps_p1')));
select tests.remember('ps_t', (select id from public.create_transfer(tests.id('ps'), 'After the partner', tests.id('ps_main'),
  tests.id('ps_sav'), 1000, 'pay_date', p_income_id => tests.id('ps_inc'), p_is_automatic => true, p_category_id => tests.id('ps_cat'),
  p_from_period_id => tests.id('ps_p1'))));
select is(pg_temp.txs(tests.id('ps_t')), '2026-09-25,2026-10-23', 'R-ACCOUNT-310: (the partner was paid on 25 September and Friday 23 October, both in the first period: none in the current one)');
select public.set_primary_income(tests.id('ps_inc'), (select revision from public.budgets where id = tests.id('ps')));
select is((select end_date from public.periods where id = (pg_temp.cur('ps')).id), '2026-11-24'::date,
  'R-ACCOUNT-310: (the switch keeps the current period''s end)');
select is(pg_temp.txs(tests.id('ps_t')), '2026-09-25,2026-10-23',
  'R-ACCOUNT-428: the switch changes nothing the current period planned (no transaction dated 25 Oct appears)');
select pg_temp.day('2026-11-26');
select public.ensure_periods(tests.id('ps'));
select is(pg_temp.txs(tests.id('ps_t')), '2026-09-25,2026-10-23,2026-11-25',
  'R-ACCOUNT-310: from the next period the transfer that chose the new primary gets its scheduled pay date');

-- the step's bound: one statement creates at most 4000 transactions (R-PERIOD-300, D-427)
select tests.clear_authentication();
create or replace function private.limit_catch_up_work() returns interval language sql immutable set search_path = '' as $$ select interval '1 hour' $$;
select tests.set_today('2019-02-01');
select tests.authenticate_as('ivan');
select tests.remember('bd', public.create_budget('Bound', 'Salary', 600000, 25, 'none', '2019-01-01'));
select tests.remember('bd_p1', (select id from public.periods where budget_id = tests.id('bd') and seq = 1));
select tests.remember('bd_a', (select id from public.create_account(tests.id('bd'), 'Main', 'current', p_from_period_id => tests.id('bd_p1'))));
select tests.remember('bd_b', (select id from public.create_account(tests.id('bd'), 'Savings', 'savings', p_from_period_id => tests.id('bd_p1'))));
select tests.remember('bd_c', (select id from public.create_category(tests.id('bd'), 'Saving', p_amount => 100000, p_from_period_id => tests.id('bd_p1'))));
select count(*) from generate_series(1, 45) as g,
  lateral public.create_transfer(tests.id('bd'), 'T' || g, tests.id('bd_a'), tests.id('bd_b'), 100, 'pay_date', p_is_automatic => true,
                                 p_from_period_id => tests.id('bd_p1'));
select tests.clear_authentication();
select tests.set_today('2026-11-26');
select tests.authenticate_as('ivan');
do $$ begin loop exit when public.ensure_periods(tests.id('bd')) = 0; end loop; end $$;
select tests.clear_authentication();
update public.transfer_versions set category_id = tests.id('bd_c') where budget_id = tests.id('bd');
select is((select private.materialise_transfers(tests.id('bd'))), 4000,
  'R-PERIOD-300: one statement creates at most 4000 transactions, however many are due');
select cmp_ok((select count(*)::integer from public.transactions where budget_id = tests.id('bd')), '=', 4000,
  'R-PERIOD-300: the rest stays due');
select cmp_ok((select private.materialise_transfers(tests.id('bd'))), '>', 0, 'R-PERIOD-300: the next step goes on, none skipped');
select tests.authenticate_as('iris');

select tests.clear_authentication();
select * from finish();
rollback;
