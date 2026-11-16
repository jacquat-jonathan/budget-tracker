-- Periods: salary to salary. Dates below were worked out independently of the SQL (an
-- oracle of the projection rule): pay day 25, weekend rule nearest unless stated. In 2026
-- the 25th falls on a weekend in January (Sun), April (Sat), July (Sat) and October (Sun).
--
-- Deferred constraint triggers only fire at commit and tests roll back, so the tests force
-- them with `set constraints all immediate`. "Today" only moves forward in this file.
begin;
select plan(109);

select tests.create_user('alice', 'Alice');

create temp table expected_jan (seq integer, start_date date, end_date date) on commit drop;
grant select on expected_jan to authenticated;
insert into expected_jan values
  (1,  '2026-01-26', '2026-02-24'), (2,  '2026-02-25', '2026-03-24'),
  (3,  '2026-03-25', '2026-04-23'), (4,  '2026-04-24', '2026-05-24'),
  (5,  '2026-05-25', '2026-06-24'), (6,  '2026-06-25', '2026-07-23'),
  (7,  '2026-07-24', '2026-08-24'), (8,  '2026-08-25', '2026-09-24'),
  (9,  '2026-09-25', '2026-10-25'), (10, '2026-10-26', '2026-11-24');

create or replace function pg_temp.periods_of(b uuid)
returns table (seq integer, start_date date, end_date date)
language sql as $$
  select seq, start_date, end_date from public.period_summaries where budget_id = b order by seq
$$;
create or replace function pg_temp.primary_of(b uuid) returns uuid language sql as $$
  select primary_income_id from public.budgets where id = b
$$;
create or replace function pg_temp.day(d date) returns void language plpgsql as $$
begin
  perform tests.clear_authentication();
  perform tests.set_today(d);
  perform tests.authenticate_as('alice');
end;
$$;

-- ===========================================================================
-- 30 January 2026
-- ===========================================================================
select pg_temp.day('2026-01-30');
select tests.remember('catchup', public.create_budget('Catch-up', 'Salary', 500000, 25));
select results_eq(
  format('select * from pg_temp.periods_of(%L)', tests.id('catchup')),
  $$values (1, '2026-01-26'::date, '2026-02-24'::date)$$,
  'R-BUDGET-010 R-PERIOD-001 R-PERIOD-015: created at the end of January, the budget has its current period, from the actual pay date (25 Jan is a Sunday: Monday 26)'
);
select is(public.get_today(), '2026-01-30'::date, 'R-PERIOD-028: get_today gives the database''s today, not a clock');

-- ===========================================================================
-- 10 August 2026: pay day 5 to 25 (finding 7)
-- ===========================================================================
select pg_temp.day('2026-08-10');
select tests.remember('aug', public.create_budget('August', 'Salary', 500000, 5));
select results_eq(
  format('select * from pg_temp.periods_of(%L)', tests.id('aug')),
  $$values (1, '2026-08-05'::date, '2026-09-03'::date)$$,
  'R-PERIOD-030: the period from 5 Aug ends before the next pay date (5 Sep is a Saturday: paid Friday 4)'
);
select public.update_income_terms(pg_temp.primary_of(tests.id('aug')), 500000, 25, 'nearest');
select results_eq(
  format('select * from pg_temp.periods_of(%L)', tests.id('aug')),
  $$values (1, '2026-08-05'::date, '2026-08-24'::date)$$,
  'R-PERIOD-029 R-PERIOD-030: pay day 5 to 25 on 10 Aug: the period ends before 25 Aug, the next salary'
);

-- ===========================================================================
-- 15 November 2026
-- ===========================================================================
select pg_temp.day('2026-11-15');

select is(public.ensure_periods(tests.id('catchup')), 9, 'R-PERIOD-009: ensure_periods catches up nine months');
select results_eq(
  format('select * from pg_temp.periods_of(%L)', tests.id('catchup')),
  'select * from expected_jan order by seq',
  'R-PERIOD-002 R-PERIOD-030: each period ends the day before the next salary'
);
select is(public.ensure_periods(tests.id('catchup')), 0, 'R-PERIOD-009: a second call creates nothing');
select is(
  (select max(start_date) from public.periods where budget_id = tests.id('catchup')),
  '2026-10-26'::date,
  'R-PERIOD-004 R-PERIOD-008: periods are stored rows, and only those up to the current one exist'
);

select tests.remember('current', public.create_budget('Current', 'Salary', 500000, 25));
select results_eq(
  format('select * from pg_temp.periods_of(%L)', tests.id('current')),
  $$values (1, '2026-10-26'::date, '2026-11-24'::date)$$,
  'R-PERIOD-015 R-PERIOD-003: by default the first period is the current one, starting on its salary'
);
select results_eq(
  format('select start_date, is_current, today from public.get_current_period(%L)', tests.id('current')),
  $$values ('2026-10-26'::date, true, '2026-11-15'::date)$$,
  'R-PERIOD-010 R-PERIOD-028: get_current_period returns it, with the database''s today'
);
select is(public.get_today(), '2026-11-15'::date, 'R-PERIOD-028: get_today gives the database''s today');

-- An end date at creation: one atomic step.
select tests.remember('with_end', public.create_budget('With end', 'Salary', 500000, 25, 'nearest', null, '2027-02-10'));
select results_eq(
  format('select end_date_entered, end_date from public.my_budgets where id = %L', tests.id('with_end')),
  $$values ('2027-02-10'::date, '2027-02-24'::date)$$,
  'R-BUDGET-017 R-BUDGET-008: create_budget takes the end date; the end shown is the end of the period containing it'
);
select throws_ok(
  $$select public.create_budget('Bad end', 'Salary', 500000, 25, 'nearest', null, '2026-10-01')$$,
  'P0001', 'end_date_before_last_period', 'R-BUDGET-017: an invalid end date fails the creation'
);
select is_empty($$select 1 from public.my_budgets where name = 'Bad end'$$,
  'R-BUDGET-017 R-BUDGET-010: and no budget is left half-created');

select tests.remember('jan', public.create_budget('From January', 'Salary', 500000, 25, 'nearest', '2026-01-15'));
select results_eq(
  format('select * from pg_temp.periods_of(%L)', tests.id('jan')),
  'select * from expected_jan order by seq',
  'R-PERIOD-016: a budget started in January has every period from 26 January up to the current one'
);
select throws_ok(
  $$select public.create_budget('Future', 'Salary', 500000, 25, 'nearest', '2026-11-01')$$,
  'P0001', 'invalid_start_month', 'R-PERIOD-022: a start month whose salary is still to come is rejected');
select throws_ok(
  $$select public.create_budget('Too old', 'Salary', 500000, 25, 'nearest', '2021-10-01')$$,
  'P0001', 'invalid_start_month', 'R-PERIOD-019: a start month more than 60 months back is rejected');
select throws_ok(
  $$select public.create_budget('Infinite', 'Salary', 500000, 25, 'nearest', '-infinity')$$,
  'P0001', 'invalid_start_month', 'R-PERIOD-019: an infinite start month is rejected with the contract error');
select tests.remember('oldest', public.create_budget('Oldest', 'Salary', 500000, 25, 'nearest', '2021-11-01'));
select is(
  (select count(*)::integer from public.periods where budget_id = tests.id('oldest')),
  60,
  'R-PERIOD-019: a start exactly 60 months back gives a period per salary up to today'
);
select is_empty(
  format('select * from tests.period_violations(%L)', tests.id('oldest')),
  'R-PERIOD-005 R-PERIOD-006 R-PERIOD-020: sixty months of periods are contiguous, non-overlapping and within the length bounds'
);

select results_eq(
  $$select today, month, start_date, is_default from public.get_start_months(25) limit 2$$,
  $$values ('2026-11-15'::date, '2026-10-01'::date, '2026-10-26'::date, true),
           ('2026-11-15'::date, '2026-09-01'::date, '2026-09-25'::date, false)$$,
  'R-PERIOD-027: get_start_months gives today and the valid start months, the current period''s first'
);
select results_eq(
  $$select count(*)::integer, min(month) from public.get_start_months(25)$$,
  $$values (60, '2021-11-01'::date)$$,
  'R-PERIOD-027 R-PERIOD-019: back to 60 months before this month'
);

-- A primary pay-day change mid-period (25 to 5 on 15 Nov, period started 26 Oct).
select lives_ok(
  format('select public.update_income_terms(%L, 600000, 5, %L)', pg_temp.primary_of(tests.id('jan')), 'nearest'),
  'R-VERSION-008: pay day 25 to 5 and a new amount on 15 November'
);
select results_eq(
  format('select * from pg_temp.periods_of(%L) where seq >= 9', tests.id('jan')),
  $$values (9, '2026-09-25'::date, '2026-10-25'::date), (10, '2026-10-26'::date, '2026-12-03'::date)$$,
  'R-PERIOD-029 R-VERSION-007 R-VERSION-008: the current period stays current and ends before the next pay date after today (5 Dec is a Saturday: Friday 4)'
);
select results_eq(
  format('select * from pg_temp.periods_of(%L) where seq < 10', tests.id('jan')),
  'select seq, start_date, end_date from expected_jan where seq < 10 order by seq',
  'R-PERIOD-007 R-PERIOD-029: no stored boundary moved'
);
select results_eq(
  format('select seq, income_total from public.period_summaries where budget_id = %L and seq >= 9 order by seq', tests.id('jan')),
  $$values (9, 500000::bigint), (10, 600000::bigint)$$,
  'R-VERSION-005: only the current period reads the new amount'
);

-- The expected pay date set by hand, kept through a change of terms, then reset.
select lives_ok(
  format('select public.set_expected_pay_date(%L, %L)', tests.id('catchup'), '2026-11-27'),
  'R-PERIOD-033 R-PERIOD-013: the salary is expected on the 27th'
);
select results_eq(
  format('select end_date, end_is_manual from public.periods where budget_id = %L and seq = 10', tests.id('catchup')),
  $$values ('2026-11-26'::date, true)$$,
  'R-PERIOD-033: the current period ends the day before'
);
select public.update_income_terms(pg_temp.primary_of(tests.id('catchup')), 500000, 10, 'nearest');
select results_eq(
  format('select end_date, end_is_manual from public.periods where budget_id = %L and seq = 10', tests.id('catchup')),
  $$values ('2026-11-26'::date, true)$$,
  'R-PERIOD-014 R-PERIOD-029: a change of terms leaves the manual end alone'
);
select lives_ok(
  format('select public.set_expected_pay_date(%L)', tests.id('catchup')),
  'R-PERIOD-025 R-PERIOD-033: resetting the expected pay date'
);
select results_eq(
  format('select end_date, end_is_manual from public.periods where budget_id = %L and seq = 10', tests.id('catchup')),
  $$values ('2026-12-09'::date, false)$$,
  'R-PERIOD-030: re-projects it from the terms in force, after today (10 Dec)'
);
select throws_ok(
  format('select public.set_expected_pay_date(%L, %L)', tests.id('catchup'), '2026-11-15'),
  'P0001', 'invalid_boundary', 'R-PERIOD-033: the expected pay date must be after today');
select throws_ok(
  format('select public.set_expected_pay_date(%L, %L)', tests.id('catchup'), '2027-02-01'),
  'P0001', 'invalid_boundary', 'R-PERIOD-020: no period longer than 92 days');
select throws_ok(
  format('select public.set_expected_pay_date(%L, %L)', tests.id('catchup'), 'infinity'),
  'P0001', 'invalid_boundary', 'R-PERIOD-020: an infinite date is refused with the contract error');

-- Moving the boundary between two existing periods, and back.
select tests.remember('catchup_p4', (select id from public.periods where budget_id = tests.id('catchup') and seq = 4));
select lives_ok(
  format('select public.move_period_start(%L, %L)', tests.id('catchup_p4'), '2026-04-22'),
  'R-PERIOD-012: April''s salary came on the 22nd'
);
select results_eq(
  format('select * from pg_temp.periods_of(%L) where seq in (3, 4)', tests.id('catchup')),
  $$values (3, '2026-03-25'::date, '2026-04-21'::date), (4, '2026-04-22'::date, '2026-05-24'::date)$$,
  'R-PERIOD-012: moves the end of period 3 and the start of period 4 together'
);
select lives_ok(
  format('select public.move_period_start(%L, %L)', tests.id('catchup_p4'), '2026-04-24'),
  'R-PERIOD-025: moving it back'
);
select results_eq(
  format('select * from pg_temp.periods_of(%L) where seq in (3, 4)', tests.id('catchup')),
  'select seq, start_date, end_date from expected_jan where seq in (3, 4) order by seq',
  'R-PERIOD-025: restores both periods'
);
select throws_ok(
  format('select public.move_period_start(%L, %L)', tests.id('catchup_p4'), '2026-03-30'),
  'P0001', 'invalid_boundary', 'R-PERIOD-020: no period shorter than 7 days');
select throws_ok(
  format('select public.move_period_start(%L, %L)',
         (select id from public.periods where budget_id = tests.id('catchup') and seq = 10), '2026-11-16'),
  'P0001', 'invalid_boundary', 'R-PERIOD-022: no period may start after today');
select throws_ok(
  format('select public.move_period_start(%L, %L)',
         (select id from public.periods where budget_id = tests.id('catchup') and seq = 1), '2026-01-20'),
  'P0001', 'invalid_boundary', 'R-PERIOD-012: the first period has no boundary before it');

-- Switching the primary income.
select tests.remember('current_second', public.add_income(tests.id('current'), 'Second job', 100000, 10));
select lives_ok(
  format('select public.set_primary_income(%L)', tests.id('current_second')),
  'R-INCOME-008: switching the primary to an income paid on the 10th'
);
select results_eq(
  format('select * from pg_temp.periods_of(%L)', tests.id('current')),
  $$values (1, '2026-10-26'::date, '2026-12-09'::date)$$,
  'R-INCOME-007 R-PERIOD-029: the current period stays current and ends before the new primary''s next pay date after today'
);
select is(
  (select count(*)::integer from public.income_overview where budget_id = tests.id('current') and is_primary),
  1,
  'R-INCOME-006: exactly one income is primary'
);

-- End date, then terms change: the end shown follows by itself.
select tests.remember('ended', public.create_budget('Ended', 'Salary', 500000, 25));
select results_eq(
  format('select end_date_entered, end_date from public.set_budget_end_date(%L, %L)', tests.id('ended'), '2027-02-10'),
  $$values ('2027-02-10'::date, '2027-02-24'::date)$$,
  'R-BUDGET-008: the end shown is the end of the period containing the date entered'
);
select throws_ok(
  format('select public.set_budget_end_date(%L, %L)', tests.id('ended'), '2026-10-01'),
  'P0001', 'end_date_before_last_period', 'R-BUDGET-008: an end date before the latest period starts is rejected');
select throws_ok(
  format('select public.set_budget_end_date(%L, %L)', tests.id('ended'), '2036-12-01'),
  'P0001', 'invalid_end_date', 'R-BUDGET-013: an end date more than ten years ahead is rejected');
select throws_ok(
  format('select public.set_budget_end_date(%L, %L)', tests.id('ended'), 'infinity'),
  'P0001', 'invalid_end_date', 'R-BUDGET-013: an infinite end date is rejected with the contract error');
select public.update_income_terms(pg_temp.primary_of(tests.id('ended')), 500000, 10, 'nearest');
select is(
  (select end_date from public.my_budgets where id = tests.id('ended')),
  '2027-03-09'::date,
  'R-BUDGET-014: after a pay-day change to the 10th, the period containing 10 Feb is 10 Feb to 9 Mar, and the end shown follows'
);

-- Budgets for the scenarios below.
select tests.remember('late', public.create_budget('Late salary', 'Salary', 500000, 25));
select tests.remember('early', public.create_budget('Early salary', 'Salary', 500000, 25));
select tests.remember('early_advance', public.create_budget('Early, announced', 'Salary', 500000, 25));
select tests.remember('payday', public.create_budget('Pay-day change', 'Salary', 500000, 25));
select tests.remember('stuck_a', public.create_budget('Stuck A', 'Salary', 500000, 25));
select tests.remember('m31', public.create_budget('Month end', 'Salary', 500000, 31));
select results_eq(
  format('select * from pg_temp.periods_of(%L)', tests.id('m31')),
  $$values (1, '2026-10-30'::date, '2026-11-29'::date)$$,
  'R-PERIOD-030: pay day 31: from 30 Oct (31 Oct is a Saturday) to the day before 30 Nov'
);

select tests.clear_authentication();
select lives_ok('set constraints all immediate', 'R-PERIOD-005 R-PERIOD-022: every invariant holds on 15 November');
set constraints all deferred;

-- ===========================================================================
-- 25 November 2026: in the new period, changes that the late salary will re-key
-- ===========================================================================
select pg_temp.day('2026-11-25');
select is(public.ensure_periods(tests.id('late')), 1, 'R-PERIOD-009: on pay day the next period starts');
select tests.remember('late_partner', public.add_income(tests.id('late'), 'Partner', 300000, 25));
select public.set_primary_income(tests.id('late_partner'));
select public.update_income_terms(tests.id('late_partner'), 350000, 25, 'nearest');
select tests.remember('late_old', (select id from public.incomes where budget_id = tests.id('late') and name = 'Salary'));
select public.update_income_terms(tests.id('late_old'), 550000, 25, 'nearest');

-- ===========================================================================
-- 26 November 2026: the salary has not arrived; pay-day change the day after pay day
-- ===========================================================================
select pg_temp.day('2026-11-26');
select lives_ok(
  format('select public.reopen_previous_period(%L, %L)', tests.id('late'), '2026-11-27'),
  'R-PERIOD-023: the salary will come on the 27th: November''s period is merged back into October''s'
);
select results_eq(
  format('select seq, start_date, end_date, is_current from public.period_summaries where budget_id = %L order by seq', tests.id('late')),
  $$values (1, '2026-10-26'::date, '2026-11-26'::date, true)$$,
  'R-PERIOD-023 R-PERIOD-022: October''s period is current again, to the 26th'
);
select results_eq(
  format('select name, is_primary, is_active, first_seq, amount, terms_from_seq from public.income_overview where budget_id = %L order by name', tests.id('late')),
  $$values ('Partner', true, true, 1, 350000::bigint, 1), ('Salary', false, true, 1, 550000::bigint, 1)$$,
  'R-VERSION-011: what was done in the merged period is re-keyed: the new primary is in force now and the edits just saved are the terms now (finding 6)'
);
select is(
  (select income_total from public.period_summaries where budget_id = tests.id('late') and seq = 1),
  900000::bigint,
  'R-VERSION-011: and the current total counts both'
);
select is_empty(format('select * from tests.period_violations(%L)', tests.id('late')),
  'R-VERSION-011: nothing is keyed beyond the latest period');

select is(public.ensure_periods(tests.id('payday')), 1, 'R-PERIOD-009: November''s period exists');
select public.update_income_terms(pg_temp.primary_of(tests.id('payday')), 500000, 27, 'nearest');
select results_eq(
  format('select * from pg_temp.periods_of(%L)', tests.id('payday')),
  $$values (1, '2026-10-26'::date, '2026-11-24'::date), (2, '2026-11-25'::date, '2026-12-27'::date)$$,
  'R-VERSION-007 R-VERSION-008 R-PERIOD-030: from the 25th to the 27th on 26 Nov: the current period ends before 28 Dec (27 Dec is a Sunday)'
);

select lives_ok(
  format('select public.update_income_terms(%L, 500000, 1, %L)', pg_temp.primary_of(tests.id('m31')), 'nearest'),
  'R-PERIOD-030: pay day 31 to 1 on 25-26 Nov'
);
select results_eq(
  format('select * from pg_temp.periods_of(%L)', tests.id('m31')),
  $$values (1, '2026-10-30'::date, '2026-11-30'::date)$$,
  'R-PERIOD-029 R-PERIOD-030: the period from 30 Oct ends before 1 Dec; nothing is closed retroactively'
);

-- ===========================================================================
-- 27 November 2026: the late salary arrives
-- ===========================================================================
select pg_temp.day('2026-11-27');
select is(public.ensure_periods(tests.id('late')), 1, 'R-PERIOD-001: the next period starts with the late salary');
select results_eq(
  format('select * from pg_temp.periods_of(%L)', tests.id('late')),
  $$values (1, '2026-10-26'::date, '2026-11-26'::date), (2, '2026-11-27'::date, '2026-12-24'::date)$$,
  'R-PERIOD-001 R-PERIOD-030: from the 27th to the day before the next salary'
);

-- ===========================================================================
-- 2 December 2026
-- ===========================================================================
select pg_temp.day('2026-12-02');
select is(public.ensure_periods(tests.id('m31')), 1, 'R-PERIOD-009: December''s salary on the 1st starts a period');
select results_eq(
  format('select * from pg_temp.periods_of(%L) where seq = 2', tests.id('m31')),
  $$values (2, '2026-12-01'::date, '2026-12-31'::date)$$,
  'R-PERIOD-030: 1 Dec to 31 Dec'
);

-- ===========================================================================
-- 4 December 2026
-- ===========================================================================
select pg_temp.day('2026-12-04');
select is(public.ensure_periods(tests.id('jan')), 1, 'R-PERIOD-009: the new pay day 5 starts a period on Friday 4 Dec');
select results_eq(
  format('select * from pg_temp.periods_of(%L) where seq = 11', tests.id('jan')),
  $$values (11, '2026-12-04'::date, '2027-01-04'::date)$$,
  'R-PERIOD-030: to the day before 5 Jan'
);

-- ===========================================================================
-- 20 December 2026: an early salary announced in advance
-- ===========================================================================
select pg_temp.day('2026-12-20');
select public.ensure_periods(tests.id('early_advance'));
select lives_ok(
  format('select public.set_expected_pay_date(%L, %L)', tests.id('early_advance'), '2026-12-23'),
  'R-PERIOD-033: the December salary is expected two days early, on the 23rd'
);

-- ===========================================================================
-- 23 December 2026: the early salaries arrive (finding 1 of the first review)
-- ===========================================================================
select pg_temp.day('2026-12-23');
select is(public.ensure_periods(tests.id('early_advance')), 1, 'R-PERIOD-009: the announced early salary starts the next period');
select results_eq(
  format('select * from pg_temp.periods_of(%L) where seq >= 2', tests.id('early_advance')),
  $$values (2, '2026-11-25'::date, '2026-12-22'::date), (3, '2026-12-23'::date, '2027-01-24'::date)$$,
  'R-PERIOD-030: one period from 23 Dec to 24 Jan, not a stub before the scheduled 25th'
);
select public.ensure_periods(tests.id('early'));
select results_eq(
  format('select seq, start_date, end_date from public.record_early_pay_date(%L, %L)', tests.id('early'), '2026-12-23'),
  $$values (3, '2026-12-23'::date, '2027-01-24'::date)$$,
  'R-PERIOD-034: the salary arrived today, two days early: the next period starts today'
);
select results_eq(
  format('select seq, income_total from public.period_summaries where budget_id = %L and seq >= 2 order by seq', tests.id('early')),
  $$values (2, 500000::bigint), (3, 500000::bigint)$$,
  'R-PERIOD-018 R-INCOME-011: from 25 Nov to 24 Jan the salary counts once per period, twice in all'
);
select throws_ok(
  format('select public.record_early_pay_date(%L, %L)', tests.id('early'), '2026-12-26'),
  'P0001', 'invalid_boundary', 'R-PERIOD-034: an early salary cannot be dated after today');
select throws_ok(
  format('select public.record_early_pay_date(%L, %L)', tests.id('early'), '2026-12-23'),
  'P0001', 'invalid_boundary', 'R-PERIOD-020: closing the period that started today would leave it empty');
select lives_ok(
  format('select public.reopen_previous_period(%L)', tests.id('early')),
  'R-PERIOD-025: undo: reopen the previous period'
);
select results_eq(
  format('select * from pg_temp.periods_of(%L) where seq >= 2', tests.id('early')),
  $$values (2, '2026-11-25'::date, '2026-12-24'::date)$$,
  'R-PERIOD-025 R-PERIOD-023: back to the scheduled end, before the 25th'
);
select results_eq(
  format('select seq, start_date from public.record_early_pay_date(%L, %L)', tests.id('early'), '2026-12-23'),
  $$values (3, '2026-12-23'::date)$$,
  'R-PERIOD-025: and redo'
);

-- ===========================================================================
-- 25-26 December 2026: way A into the stuck budget (finding 1)
-- ===========================================================================
select pg_temp.day('2026-12-25');
select is(public.ensure_periods(tests.id('stuck_a')), 2, 'R-PERIOD-009: the period rolls on 25 Dec');
select pg_temp.day('2026-12-26');
select public.update_income_terms(pg_temp.primary_of(tests.id('stuck_a')), 500000, 10, 'nearest');
select lives_ok(
  format('select public.reopen_previous_period(%L, %L)', tests.id('stuck_a'), '2026-12-27'),
  'R-PERIOD-023: pay day changed to the 10th, and the salary will come on the 27th'
);
select pg_temp.day('2026-12-28');
select lives_ok(format('select public.get_current_period(%L)', tests.id('stuck_a')),
  'R-PERIOD-031: two days later get_current_period works (the budget is not stuck)');
select results_eq(
  format('select * from pg_temp.periods_of(%L) where seq >= 2', tests.id('stuck_a')),
  $$values (2, '2026-11-25'::date, '2026-12-26'::date), (3, '2026-12-27'::date, '2027-01-10'::date)$$,
  'R-PERIOD-031 R-PERIOD-030: the next period starts with the salary and ends before 11 Jan (10 Jan is a Sunday)'
);
select lives_ok(format('select public.add_income(%L, %L, 1000, 1)', tests.id('stuck_a'), 'Extra'),
  'R-PERIOD-032: writes work too');

select tests.clear_authentication();
select lives_ok('set constraints all immediate', 'R-PERIOD-005 R-PERIOD-022 R-VERSION-011: every invariant holds after the boundary operations');
set constraints all deferred;
select is_empty(
  $$select b, v from unnest(array[tests.id('catchup'), tests.id('jan'), tests.id('current'), tests.id('late'),
                               tests.id('early'), tests.id('early_advance'), tests.id('payday'), tests.id('ended'),
                               tests.id('stuck_a'), tests.id('m31'), tests.id('with_end'), tests.id('aug')]) as b,
                 tests.period_violations(b) as v$$,
  'R-PERIOD-005 R-PERIOD-006 R-PERIOD-020 R-PERIOD-022 R-VERSION-011: the independent invariant check agrees'
);

-- ===========================================================================
-- 10 February 2027: the final period of a budget with an end date
-- ===========================================================================
select pg_temp.day('2027-02-10');
select results_eq(
  format('select start_date, end_date from public.get_current_period(%L)', tests.id('with_end')),
  $$values ('2027-01-25'::date, '2027-02-24'::date)$$,
  'R-BUDGET-008: the period containing the end date is current'
);
select lives_ok(
  format('select public.set_expected_pay_date(%L, %L)', tests.id('with_end'), '2027-02-27'),
  'R-BUDGET-015 R-PERIOD-013: its end is adjusted by hand in one call'
);
select is((select end_date from public.my_budgets where id = tests.id('with_end')), '2027-02-26'::date,
  'R-BUDGET-015: and the end shown follows it');

-- ===========================================================================
-- 24-26 February 2027: way B into the stuck budget (finding 1)
-- ===========================================================================
select pg_temp.day('2027-02-24');
select tests.remember('stuck_b', public.create_budget('Stuck B', 'Salary', 500000, 25));
select pg_temp.day('2027-02-26');
select lives_ok(
  format('select public.update_income_terms(%L, 500000, 5, %L, %L)', pg_temp.primary_of(tests.id('stuck_b')), 'previous',
         (select id from public.periods where budget_id = tests.id('stuck_b') and seq = 1)),
  'R-PERIOD-032 R-VERSION-010: a correction from the first period two days after the next salary'
);
select results_eq(
  format('select * from pg_temp.periods_of(%L)', tests.id('stuck_b')),
  $$values (1, '2027-01-25'::date, '2027-02-24'::date), (2, '2027-02-25'::date, '2027-04-04'::date)$$,
  'R-PERIOD-029 R-PERIOD-032: the write caught up first; stored boundaries stay; the current end is re-projected after today (5 Apr)'
);
select lives_ok(format('select public.get_current_period(%L)', tests.id('stuck_b')),
  'R-PERIOD-031: the budget is not stuck');

-- ===========================================================================
-- 1 June 2027: after the end date
-- ===========================================================================
select pg_temp.day('2027-06-01');
select lives_ok(format('select public.ensure_periods(%L)', tests.id('ended')), 'R-BUDGET-007: catching up an ended budget');
select results_eq(
  format('select * from pg_temp.periods_of(%L) where seq >= 2', tests.id('ended')),
  $$values (2, '2026-12-10'::date, '2027-01-10'::date), (3, '2027-01-11'::date, '2027-02-09'::date),
           (4, '2027-02-10'::date, '2027-03-09'::date)$$,
  'R-BUDGET-007 R-BUDGET-008: no period starts after the end date; the last one contains it and ends normally'
);
select is((select end_date from public.my_budgets where id = tests.id('ended')), '2027-03-09'::date,
  'R-BUDGET-008: the end shown is that period''s end');
select is_empty(format('select 1 from public.get_current_period(%L)', tests.id('ended')),
  'R-BUDGET-007: an ended budget has no current period');
select throws_ok(format('select public.set_expected_pay_date(%L, %L)', tests.id('ended'), '2027-06-10'),
  'P0001', 'budget_ended', 'R-PERIOD-033: an ended budget has no current period to change');
select throws_ok(
  format('select public.update_income_terms(%L, 1, 25, %L)', pg_temp.primary_of(tests.id('ended')), 'nearest'),
  'P0001', 'budget_ended', 'R-VERSION-001: nor terms to change from "now"');
select lives_ok(
  format('select public.update_income_terms(%L, 1, 25, %L, %L)', pg_temp.primary_of(tests.id('ended')), 'nearest',
         (select id from public.periods where budget_id = tests.id('ended') and seq = 4)),
  'R-VERSION-010 R-PERIOD-031: a correction of an ended budget works and leaves it consistent'
);
select is(
  (select count(*)::integer from public.set_budget_end_date(tests.id('ended'), null)),
  1, 'R-BUDGET-005: clearing the end date'
);
select cmp_ok(
  (select max(end_date) from public.periods where budget_id = tests.id('ended')),
  '>=', '2027-06-01'::date,
  'R-BUDGET-005: resumes generation up to the current period'
);

-- ===========================================================================
-- The invariants hold against direct writes by a privileged role
-- ===========================================================================
select tests.clear_authentication();
select lives_ok('set constraints all immediate', 'R-PERIOD-005: invariants hold before the direct writes');
set constraints all deferred;

update public.periods set start_date = start_date + 1 where budget_id = tests.id('jan') and seq = 5;
select throws_ok('set constraints all immediate', '23514', 'periods_invalid', 'R-PERIOD-005: a gap is rejected');
set constraints all deferred;
update public.periods set start_date = start_date - 1 where budget_id = tests.id('jan') and seq = 5;

update public.periods set end_date = end_date + 1 where budget_id = tests.id('jan') and seq = 5;
select throws_ok('set constraints all immediate', '23514', 'periods_invalid', 'R-PERIOD-006: an overlap is rejected');
set constraints all deferred;
update public.periods set end_date = end_date - 1 where budget_id = tests.id('jan') and seq = 5;

select throws_ok(
  format('update public.periods set end_date = start_date + 5 where budget_id = %L and seq = 6', tests.id('jan')),
  '23514', null, 'R-PERIOD-020: a period shorter than 7 days is rejected');
select throws_ok(
  format('update public.periods set end_date = start_date + 92 where budget_id = %L and seq = 6', tests.id('jan')),
  '23514', null, 'R-PERIOD-020: a period longer than 92 days is rejected');

select lives_ok('set constraints all immediate', 'R-PERIOD-005: invariants hold again');
set constraints all deferred;
insert into public.periods (budget_id, seq, start_date, end_date)
select tests.id('jan'), max(seq) + 1, max(end_date) + 1, max(end_date) + 30
from public.periods where budget_id = tests.id('jan');
update public.periods set start_date = '2027-07-01', end_date = '2027-07-30'
where budget_id = tests.id('jan') and seq = (select max(seq) from public.periods where budget_id = tests.id('jan'));
select throws_ok('set constraints all immediate', '23514', 'periods_invalid', 'R-PERIOD-022: a period starting after today is rejected');
set constraints all deferred;
delete from public.periods where budget_id = tests.id('jan')
  and seq = (select max(seq) from public.periods where budget_id = tests.id('jan'));

update public.budgets set end_date = '2026-06-01' where id = tests.id('jan');
select throws_ok('set constraints all immediate', '23514', 'periods_invalid', 'R-BUDGET-007: no period may start after the end date');
set constraints all deferred;
update public.budgets set end_date = null where id = tests.id('jan');

update public.incomes set first_seq = 99 where id = pg_temp.primary_of(tests.id('jan'));
select throws_ok('set constraints all immediate', '23514', null, 'R-VERSION-011: nothing may be keyed beyond the latest period');
set constraints all deferred;
update public.incomes set first_seq = 1 where id = pg_temp.primary_of(tests.id('jan'));

delete from public.periods where budget_id = tests.id('jan') and seq = 5;
select throws_ok('set constraints all immediate', '23514', 'periods_invalid', 'R-PERIOD-005: a missing period is rejected');
set constraints all deferred;

select * from finish();
rollback;
