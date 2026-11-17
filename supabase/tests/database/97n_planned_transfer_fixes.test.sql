-- Planned transfers, the three defects of the independent review of 0d5e677: a fixed day whose
-- weekend rule puts its due date before the start of its period must not be lost when the
-- catch-up looked at the transfer before that period existed (M1, R-ACCOUNT-302); a reopen must
-- not skip a payday of a transfer made mid-period (S-A, D-493); the first scheduled date of a
-- fixed day is the first one whose due date is not before today (S-B, R-ACCOUNT-315).
-- 25 Oct 2026 is a Sunday: a fixed day 25 with the rule previous is due Friday 23 Oct.
begin;
select no_plan();

select tests.create_user('nor', 'Nor');
select tests.set_today('2026-10-20');
select tests.authenticate_as('nor');

create function pg_temp.day(d date) returns void language plpgsql as $$
begin
  perform tests.clear_authentication();
  perform tests.set_today(d);
  perform tests.authenticate_as('nor');
end $$;
-- a budget paid on p_day, started in September 2026, with Main, Savings and the category Saving
create function pg_temp.budget(n text, p_day integer) returns void language plpgsql as $$
declare
  b uuid;
  p1 uuid;
begin
  b := public.create_budget('Budget ' || n, 'Salary', 600000, p_day, 'none', '2026-09-01');
  p1 := (select id from public.periods where budget_id = b and seq = 1);
  perform tests.remember(n, b);
  perform tests.remember(n || '_main', (select id from public.create_account(b, 'Main', 'current', p_from_period_id => p1)));
  perform tests.remember(n || '_sav', (select id from public.create_account(b, 'Savings', 'savings', p_from_period_id => p1)));
  perform tests.remember(n || '_cat', (select id from public.create_category(b, 'Saving', p_amount => 100000, p_from_period_id => p1)));
end $$;
create function pg_temp.cur(n text) returns public.periods language sql as $$
  select p.* from public.periods as p
  where p.budget_id = tests.id(n) and (select public.get_today()) between p.start_date and p.end_date $$;
create function pg_temp.rev(t uuid) returns integer language sql as $$
  select revision from public.transfers where id = t $$;
create function pg_temp.txs(t uuid) returns text language sql as $$
  select coalesce(string_agg(x.date::text, ',' order by x.date), '') from public.transaction_list as x where x.transfer_id = t $$;
create function pg_temp.rent(n text, p_auto boolean default true) returns uuid language sql as $$
  select id from public.create_transfer(tests.id(n), 'Rent', tests.id(n || '_main'), tests.id(n || '_sav'), 150000,
    'day_of_month', p_day_of_month => 25, p_is_automatic => p_auto, p_category_id => tests.id(n || '_cat'),
    p_weekend_rule => 'previous') $$;
create function pg_temp.settle(n text) returns void language plpgsql as $$
begin
  perform public.ensure_periods(tests.id(n));
end $$;

-- ===========================================================================
-- M1, case A: the amount is edited the day before the period starts
-- ===========================================================================
select pg_temp.budget('a', 25);
select tests.remember('a_t', pg_temp.rent('a'));
select pg_temp.day('2026-10-24');
select public.update_transfer(tests.id('a_t'), pg_temp.rev(tests.id('a_t')), p_amount => 155000);
select pg_temp.day('2026-10-25');
select pg_temp.settle('a');
select is(pg_temp.txs(tests.id('a_t')), '2026-10-23',
  'R-ACCOUNT-302: a fixed day due before its period exists, the transfer edited the day before: its transaction is made when the period starts');
select is((select amount from public.transaction_list where transfer_id = tests.id('a_t')), 155000::bigint,
  'R-ACCOUNT-302: at the edited amount');
select pg_temp.day('2026-11-26');
select pg_temp.settle('a');
select is(pg_temp.txs(tests.id('a_t')), '2026-10-23,2026-11-25',
  'R-ACCOUNT-302: and the next month''s one is made too, none twice');
select is((select spent_total from public.period_summaries where budget_id = tests.id('a') and seq = 2), 0::bigint,
  'R-ACCOUNT-302: the transaction dated 23 Oct counts in the period before the one that lists it');

-- ===========================================================================
-- M1, case C: the salary is expected on 26 Oct, then the expectation is cleared the same day
-- ===========================================================================
select pg_temp.day('2026-10-20');
select pg_temp.budget('c', 25);
select tests.remember('c_t', pg_temp.rent('c'));
select pg_temp.day('2026-10-24');
select public.set_expected_pay_date(tests.id('c'), (pg_temp.cur('c')).id, (pg_temp.cur('c')).revision, '2026-10-26');
select is(pg_temp.txs(tests.id('c_t')), '2026-10-23',
  'R-ACCOUNT-302: salary expected on 26 Oct: the transaction of 23 Oct is made');
select public.set_expected_pay_date(tests.id('c'), (pg_temp.cur('c')).id, (pg_temp.cur('c')).revision);
select is(pg_temp.txs(tests.id('c_t')), '',
  'R-ACCOUNT-302: expectation cleared the same day: that transaction goes (the period does not exist yet)');
select pg_temp.day('2026-10-25');
select pg_temp.settle('c');
select pg_temp.day('2026-10-30');
select pg_temp.settle('c');
select is(pg_temp.txs(tests.id('c_t')), '2026-10-23',
  'R-ACCOUNT-302: the period starts: the transaction is made again, not lost for good');

-- ===========================================================================
-- Controls: nobody touches the transfer; a manual transfer is listed to do
-- ===========================================================================
select pg_temp.day('2026-10-20');
select pg_temp.budget('k', 25);
select tests.remember('k_t', pg_temp.rent('k'));
select tests.remember('k_m', pg_temp.rent('k', false));
select pg_temp.day('2026-10-25');
select pg_temp.settle('k');
select is(pg_temp.txs(tests.id('k_t')), '2026-10-23',
  'R-ACCOUNT-302: untouched, the automatic one is recorded once (control)');
select is(pg_temp.txs(tests.id('k_m')), '',
  'R-ACCOUNT-302: the manual one records nothing (control)');

-- ===========================================================================
-- S-A: a main-income transfer made mid-period, the period reopened
-- ===========================================================================
select pg_temp.day('2026-11-26');
select pg_temp.budget('n', 25);
select tests.remember('n_t', (select id from public.create_transfer(tests.id('n'), 'Savings', tests.id('n_main'), tests.id('n_sav'),
  100000, 'pay_date', p_is_automatic => true, p_category_id => tests.id('n_cat'))));
select is((select starts_seq from public.transfer_overview where id = tests.id('n_t')), 4,
  'D-493: made the day after payday with no period named, it counts from the next period''s own occurrence');
select pg_temp.day('2026-11-27');
select public.reopen_previous_period(tests.id('n'), (pg_temp.cur('n')).id, (pg_temp.cur('n')).revision);
select is((select starts_seq from public.transfer_overview where id = tests.id('n_t')), 3,
  'D-493: the reopen merged period 3: the next period''s own occurrence is again number 3');
select is((select next_due_date from public.transfer_overview where id = tests.id('n_t')), '2026-12-25'::date,
  'D-493: the next payday is not skipped by the reopen (not 25 Jan)');
select pg_temp.day('2026-11-28');
select public.record_early_pay_date(tests.id('n'), (pg_temp.cur('n')).id, (pg_temp.cur('n')).revision, '2026-11-28');
select is(pg_temp.txs(tests.id('n_t')), '2026-11-28',
  'D-493: the salary came on 28 Nov: the first payday on or after the day it was made is recorded');
select pg_temp.day('2026-12-26');
select pg_temp.settle('n');
select is(pg_temp.txs(tests.id('n_t')), '2026-11-28,2026-12-25',
  'D-493: and the one after it; nothing is dated before the day the transfer was made');

-- ===========================================================================
-- S-B: made on Saturday 24 Oct with a fixed day 25 (Sunday), rule previous
-- ===========================================================================
select pg_temp.day('2026-10-24');
select pg_temp.budget('s', 20);
select results_eq(format($$select occurrence_date, due_date, created_at_once, created_at_once_count
  from public.preview_create_transfer(%L, %L, %L, 150000, 'day_of_month', p_day_of_month => 25, p_is_automatic => true,
    p_category_id => %L, p_weekend_rule => 'previous', p_count => 1) order by due_date$$,
    tests.id('s'), tests.id('s_main'), tests.id('s_sav'), tests.id('s_cat')),
  $$values ('2026-11-25'::date, '2026-11-25'::date, false, 0)$$ ,
  'R-ACCOUNT-315: the preview: the first date is 25 Nov, nothing is created at once (23 Oct is before today)');
select tests.remember('s_t', pg_temp.rent('s'));
select tests.remember('s_m', pg_temp.rent('s', false));
select is(pg_temp.txs(tests.id('s_t')), '',
  'R-ACCOUNT-315: the write agrees with the preview: nothing dated before today is recorded');
select is((select first_date from public.transfer_overview where id = tests.id('s_t')), '2026-11-25'::date,
  'R-ACCOUNT-315: its first date is 25 Nov');
select is((select transfers_overdue from public.get_transfers_to_do(tests.id('s'))), 0,
  'R-ACCOUNT-315: the manual twin is not overdue the day it was made');
select pg_temp.day('2026-11-26');
select pg_temp.settle('s');
select is(pg_temp.txs(tests.id('s_t')), '2026-11-25',
  'R-ACCOUNT-315: the first transaction is that of 25 Nov');

-- control: made on Friday 23 Oct, 23 Oct itself is the due date, not before today
select pg_temp.day('2026-10-23');
select pg_temp.budget('f', 20);
select results_eq(format($$select occurrence_date, due_date, created_at_once_count
  from public.preview_create_transfer(%L, %L, %L, 150000, 'day_of_month', p_day_of_month => 25, p_is_automatic => true,
    p_category_id => %L, p_weekend_rule => 'previous', p_count => 2) where created_at_once$$,
    tests.id('f'), tests.id('f_main'), tests.id('f_sav'), tests.id('f_cat')),
  $$values ('2026-10-25'::date, '2026-10-23'::date, 1)$$,
  'R-ACCOUNT-315: made on its due date (Fri 23 Oct), that day is the first (control): created at once, in the preview');
select tests.remember('f_t', pg_temp.rent('f'));
select is(pg_temp.txs(tests.id('f_t')), '2026-10-23',
  'R-ACCOUNT-315: and in the write');

select * from finish();
rollback;
