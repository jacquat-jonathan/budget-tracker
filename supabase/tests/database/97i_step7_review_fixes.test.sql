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

select tests.clear_authentication();
select * from finish();
rollback;
