-- Period generation and mechanics. Dates below were worked out independently of the SQL
-- (pay day 25, weekend rule nearest unless stated). In 2026 the 25th falls on a weekend in
-- January (Sun), April (Sat), July (Sat) and October (Sun); 25 Nov is a Wednesday, 25 Dec a
-- Friday, 25 Jan 2027 a Monday.
--
-- Deferred constraint triggers (period invariants, primary income, ...) only fire at
-- commit and tests roll back, so the tests force them with `set constraints all immediate`.
-- "Today" only moves forward in this file, as in real life.
begin;
select plan(87);

select tests.create_user('alice', 'Alice');

create temp table expected_jan (seq integer, month date, start_date date, end_date date) on commit drop;
grant select on expected_jan to authenticated;
insert into expected_jan values
  (1,  '2026-01-01', '2026-01-26', '2026-02-24'),
  (2,  '2026-02-01', '2026-02-25', '2026-03-24'),
  (3,  '2026-03-01', '2026-03-25', '2026-04-23'),
  (4,  '2026-04-01', '2026-04-24', '2026-05-24'),
  (5,  '2026-05-01', '2026-05-25', '2026-06-24'),
  (6,  '2026-06-01', '2026-06-25', '2026-07-23'),
  (7,  '2026-07-01', '2026-07-24', '2026-08-24'),
  (8,  '2026-08-01', '2026-08-25', '2026-09-24'),
  (9,  '2026-09-01', '2026-09-25', '2026-10-25'),
  (10, '2026-10-01', '2026-10-26', '2026-11-24');

create or replace function pg_temp.periods_of(b uuid)
returns table (seq integer, month date, start_date date, end_date date)
language sql as $$
  select seq, month, start_date, end_date from public.period_summaries where budget_id = b order by seq
$$;

-- ===========================================================================
-- 30 January 2026
-- ===========================================================================
select tests.set_today('2026-01-30');
select tests.authenticate_as('alice');
select tests.remember('catchup', public.create_budget('Catch-up', 'Salary', 500000, 25));
select results_eq(
  format('select seq, month, start_date, end_date from pg_temp.periods_of(%L)', tests.id('catchup')),
  $$values (1, '2026-01-01'::date, '2026-01-26'::date, '2026-02-24'::date)$$,
  'R-BUDGET-010 R-PERIOD-001 R-PERIOD-015: created at the end of January, the budget has one period, January''s, from its actual pay date (25 Jan is a Sunday: Monday 26)'
);
select is(public.get_today(), '2026-01-30'::date, 'R-PERIOD-028: get_today follows the database''s today, not a clock');

-- ===========================================================================
-- 15 November 2026
-- ===========================================================================
select tests.clear_authentication();
select tests.set_today('2026-11-15');
select tests.authenticate_as('alice');

select is(public.ensure_periods(tests.id('catchup')), 9, 'R-PERIOD-009: ensure_periods catches up nine months');
select results_eq(
  format('select * from pg_temp.periods_of(%L)', tests.id('catchup')),
  'select * from expected_jan order by seq',
  'R-PERIOD-002 R-PERIOD-021: one period per month, each ending the day before the next month''s actual pay date'
);
select is(public.ensure_periods(tests.id('catchup')), 0, 'R-PERIOD-009: a second call creates nothing');
select is(
  (select max(start_date) from public.periods where budget_id = tests.id('catchup')),
  '2026-10-26'::date,
  'R-PERIOD-004 R-PERIOD-008: periods are stored rows, and only those up to the current one exist'
);

-- First period: the current one by default, or an earlier month.
select tests.remember('current', public.create_budget('Current', 'Salary', 500000, 25));
select results_eq(
  format('select seq, month, anchor_date, start_date, end_date from public.periods where budget_id = %L', tests.id('current')),
  $$values (1, '2026-10-01'::date, '2026-10-26'::date, '2026-10-26'::date, '2026-11-24'::date)$$,
  'R-PERIOD-015 R-PERIOD-003: by default the first period is the current one (October''s), starting on its salary'
);
select results_eq(
  format('select start_date, is_current, today from public.get_current_period(%L)', tests.id('current')),
  $$values ('2026-10-26'::date, true, '2026-11-15'::date)$$,
  'R-PERIOD-010 R-PERIOD-028: get_current_period returns it, with the database''s today'
);
select is(public.get_today(), '2026-11-15'::date, 'R-PERIOD-028: get_today gives the database''s today');

-- An end date can be given at creation: one atomic step.
select tests.remember('with_end', public.create_budget('With end', 'Salary', 500000, 25, 'nearest', null, '2027-02-10'));
select results_eq(
  format('select end_month, end_date from public.my_budgets where id = %L', tests.id('with_end')),
  $$values ('2027-01-01'::date, '2027-02-24'::date)$$,
  'R-BUDGET-017: create_budget takes the end date'
);
select throws_ok(
  $$select public.create_budget('Bad end', 'Salary', 500000, 25, 'nearest', null, '2026-10-01')$$,
  'P0001', 'end_date_before_last_period',
  'R-BUDGET-017: an invalid end date fails the creation'
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
  'P0001', 'invalid_start_month',
  'R-PERIOD-022: a start month whose salary is still to come is rejected'
);
select throws_ok(
  $$select public.create_budget('Too old', 'Salary', 500000, 25, 'nearest', '2021-10-01')$$,
  'P0001', 'invalid_start_month',
  'R-PERIOD-019: a start month more than 60 months back is rejected'
);
select throws_ok(
  $$select public.create_budget('Infinite', 'Salary', 500000, 25, 'nearest', '-infinity')$$,
  'P0001', 'invalid_start_month',
  'R-PERIOD-019: an infinite start month is rejected with the contract error'
);
select tests.remember('oldest', public.create_budget('Oldest', 'Salary', 500000, 25, 'nearest', '2021-11-01'));
select is(
  (select count(*)::integer from public.periods where budget_id = tests.id('oldest')),
  60,
  'R-PERIOD-019: a start exactly 60 months back gives one period per month up to today (November 2021 to October 2026)'
);
select is_empty(
  format('select * from tests.period_violations(%L)', tests.id('oldest')),
  'R-PERIOD-005 R-PERIOD-006 R-PERIOD-021: sixty months of periods are contiguous, non-overlapping, one per month'
);

-- The start months the database offers.
select results_eq(
  $$select today, month, start_date, is_default from public.get_start_months(25) limit 2$$,
  $$values ('2026-11-15'::date, '2026-10-01'::date, '2026-10-26'::date, true),
           ('2026-11-15'::date, '2026-09-01'::date, '2026-09-25'::date, false)$$,
  'R-PERIOD-027: get_start_months gives today and the valid start months, the current period''s first, with their start dates'
);
select results_eq(
  $$select count(*)::integer, min(month) from public.get_start_months(25)$$,
  $$values (60, '2021-11-01'::date)$$,
  'R-PERIOD-027 R-PERIOD-019: back to 60 months before this month'
);
select results_eq(
  $$select month, start_date from public.get_start_months(1, 'nearest') limit 1$$,
  $$values ('2026-11-01'::date, '2026-11-02'::date)$$,
  'R-PERIOD-027: for a pay day on the 1st the current period is November''s (1 Nov is a Sunday: Monday 2)'
);

-- Moving boundaries: within 14 days of the salary, never empty, and with an inverse.
select tests.remember('catchup_p3', (select id from public.periods where budget_id = tests.id('catchup') and seq = 3));
select tests.remember('catchup_p10', (select id from public.periods where budget_id = tests.id('catchup') and seq = 10));
select lives_ok(
  format('select public.move_period_boundary(%L, %L)', tests.id('catchup_p3'), '2026-04-21'),
  'R-PERIOD-012: moving the boundary between periods 3 and 4 (April''s salary came on the 22nd)'
);
select results_eq(
  format('select seq, month, start_date, end_date, end_is_manual from public.periods where budget_id = %L and seq in (3, 4) order by seq',
         tests.id('catchup')),
  $$values (3, '2026-03-01'::date, '2026-03-25'::date, '2026-04-21'::date, true),
           (4, '2026-04-01'::date, '2026-04-22'::date, '2026-05-24'::date, false)$$,
  'R-PERIOD-012: moves the end of period 3 and the start of period 4 together; each keeps its month'
);
select lives_ok(
  format('select public.move_period_boundary(%L, %L)', tests.id('catchup_p3'), '2026-04-23'),
  'R-PERIOD-025: moving it back'
);
select lives_ok(
  format('select public.move_period_boundary(%L, null)', tests.id('catchup_p3')),
  'R-PERIOD-025: and resetting it to the schedule'
);
select results_eq(
  format('select end_date, end_is_manual from public.periods where id = %L', tests.id('catchup_p3')),
  $$values ('2026-04-23'::date, false)$$,
  'R-PERIOD-025: the reset boundary follows the schedule again'
);
select throws_ok(
  format('select public.move_period_boundary(%L, %L)', tests.id('catchup_p3'), '2026-04-08'),
  'P0001', 'invalid_boundary', 'R-PERIOD-020: a boundary more than 14 days from the salary is refused'
);
select throws_ok(
  format('select public.move_period_boundary(%L, %L)', tests.id('catchup_p10'), '2026-12-09'),
  'P0001', 'invalid_boundary', 'R-PERIOD-020: the current period''s end cannot move more than 14 days from the next salary'
);
select throws_ok(
  format('select public.move_period_boundary(%L, %L)', tests.id('catchup_p10'), '2026-10-25'),
  'P0001', 'invalid_boundary', 'R-PERIOD-020: a period cannot end before it starts'
);
select throws_ok(
  format('select public.move_period_boundary(%L, %L)', tests.id('catchup_p10'), 'infinity'),
  'P0001', 'invalid_boundary', 'R-PERIOD-020: an infinite date is refused with the contract error'
);

-- A primary pay-day change mid-period: applies to the next month's pay date.
select tests.remember('jan_primary', (select primary_income_id from public.budgets where id = tests.id('jan')));
select lives_ok(
  format('select public.update_income_terms(%L, 500000, 5, %L)', tests.id('jan_primary'), 'nearest'),
  'R-VERSION-008: the primary pay day changes from the 25th to the 5th on 15 November'
);
select results_eq(
  format('select seq, month, start_date, end_date from pg_temp.periods_of(%L) where seq >= 10', tests.id('jan')),
  $$values (10, '2026-10-01'::date, '2026-10-26'::date, '2026-11-04'::date),
           (11, '2026-11-01'::date, '2026-11-05'::date, '2026-12-03'::date)$$,
  'R-VERSION-007 R-VERSION-008 R-PERIOD-011: October keeps its start and ends before November''s new pay date (5 Nov), which has passed, so November''s period starts'
);
select results_eq(
  format('select * from pg_temp.periods_of(%L) where seq < 10', tests.id('jan')),
  'select * from expected_jan where seq < 10 order by seq',
  'R-PERIOD-007: past periods are untouched'
);

-- A manual end survives recomputation while it stays within 14 days of the new schedule.
select lives_ok(
  format('select public.move_period_boundary(%L, %L)', tests.id('catchup_p10'), '2026-11-23'),
  'R-PERIOD-013: setting the current period''s end by hand (salary expected on the 24th)'
);
select tests.remember('catchup_primary', (select primary_income_id from public.budgets where id = tests.id('catchup')));
select public.update_income_terms(tests.id('catchup_primary'), 500000, 26, 'nearest');
select results_eq(
  format('select end_date, end_is_manual from public.periods where id = %L', tests.id('catchup_p10')),
  $$values ('2026-11-23'::date, true)$$,
  'R-PERIOD-014: a pay-day change from 25 to 26 leaves the manual end alone'
);
select public.update_income_terms(tests.id('catchup_primary'), 500000, 5, 'nearest');
select results_eq(
  format('select seq, start_date, end_date, end_is_manual from public.periods where budget_id = %L and seq >= 10 order by seq', tests.id('catchup')),
  $$values (10, '2026-10-26'::date, '2026-11-04'::date, false), (11, '2026-11-05'::date, '2026-12-03'::date, false)$$,
  'R-PERIOD-026: a change that moves the schedule more than 14 days from the manual end resets it'
);

-- Switching the primary income.
select tests.remember('current_second', public.add_income(tests.id('current'), 'Second job', 100000, 10));
select lives_ok(
  format('select public.set_primary_income(%L)', tests.id('current_second')),
  'R-INCOME-008: switching the primary to an income paid on the 10th'
);
select results_eq(
  format('select seq, month, start_date, end_date from pg_temp.periods_of(%L)', tests.id('current')),
  $$values (1, '2026-10-01'::date, '2026-10-26'::date, '2026-11-09'::date),
           (2, '2026-11-01'::date, '2026-11-10'::date, '2026-12-09'::date)$$,
  'R-INCOME-007: the new primary defines the periods from its next month''s pay date on'
);
select is(
  (select count(*)::integer from public.income_overview where budget_id = tests.id('current') and is_primary),
  1,
  'R-INCOME-006: exactly one income is primary'
);

-- End date.
select tests.remember('ended', public.create_budget('Ended', 'Salary', 500000, 25));
select results_eq(
  format('select end_month, end_date from public.set_budget_end_date(%L, %L)', tests.id('ended'), '2027-02-10'),
  $$values ('2027-01-01'::date, '2027-02-24'::date)$$,
  'R-BUDGET-008: an end date becomes the end of the period containing it (January 2027''s, to 24 Feb)'
);
select throws_ok(
  format('select public.set_budget_end_date(%L, %L)', tests.id('ended'), '2026-10-01'),
  'P0001', 'end_date_before_last_period',
  'R-BUDGET-008: an end date before the last existing period would delete periods: rejected'
);
select throws_ok(
  format('select public.set_budget_end_date(%L, %L)', tests.id('ended'), '2036-12-01'),
  'P0001', 'invalid_end_date', 'R-BUDGET-013: an end date more than ten years ahead is rejected'
);
select throws_ok(
  format('select public.set_budget_end_date(%L, %L)', tests.id('ended'), 'infinity'),
  'P0001', 'invalid_end_date', 'R-BUDGET-013: an infinite end date is rejected with the contract error'
);
select public.update_income_terms((select primary_income_id from public.budgets where id = tests.id('ended')), 500000, 10, 'nearest');
select results_eq(
  format('select end_month, end_date from public.my_budgets where id = %L', tests.id('ended')),
  $$values ('2027-01-01'::date, '2027-02-09'::date)$$,
  'R-BUDGET-014: when the terms change, the final period still ends on a normal boundary (before 10 Feb 2027)'
);

-- A late and an early budget for the realistic scenarios below.
select tests.remember('late', public.create_budget('Late salary', 'Salary', 500000, 25));
select tests.remember('early', public.create_budget('Early salary', 'Salary', 500000, 25));
select tests.remember('early_now', public.create_budget('Early salary, same day', 'Salary', 500000, 25));
select tests.remember('payday', public.create_budget('Pay-day change', 'Salary', 500000, 25));

select tests.clear_authentication();
select lives_ok('set constraints all immediate', 'R-PERIOD-005 R-PERIOD-006 R-PERIOD-021: every invariant holds on 15 November');
set constraints all deferred;

-- ===========================================================================
-- 25 November 2026: the salary is two days late
-- ===========================================================================
select tests.set_today('2026-11-25');
select tests.authenticate_as('alice');
select tests.remember('late_oct', (select id from public.periods where budget_id = tests.id('late') and seq = 1));
select is(public.ensure_periods(tests.id('late')), 1, 'R-PERIOD-009: on pay day November''s period starts');
select lives_ok(
  format('select public.move_period_boundary(%L, %L)', tests.id('late_oct'), '2026-11-26'),
  'R-PERIOD-023: the salary will come on the 27th: the boundary moves to the 26th'
);
select results_eq(
  format('select seq, start_date, end_date from pg_temp.periods_of(%L)', tests.id('late')),
  $$values (1, '2026-10-26'::date, '2026-11-26'::date)$$,
  'R-PERIOD-023: November''s period is removed and October''s is current again'
);
select results_eq(
  format('select seq, is_current from public.get_current_period(%L)', tests.id('late')),
  $$values (1, true)$$,
  'R-PERIOD-022: no period starts after today'
);
select lives_ok(
  format('select public.move_period_boundary(%L, null)', tests.id('late_oct')),
  'R-PERIOD-025: undo: reset the boundary'
);
select results_eq(
  format('select seq, start_date, end_date from pg_temp.periods_of(%L)', tests.id('late')),
  $$values (1, '2026-10-26'::date, '2026-11-24'::date), (2, '2026-11-25'::date, '2026-12-24'::date)$$,
  'R-PERIOD-025: November''s period is back'
);
select lives_ok(
  format('select public.move_period_boundary(%L, %L)', tests.id('late_oct'), '2026-11-26'),
  'R-PERIOD-023: and the late salary again'
);

-- ===========================================================================
-- 26 November 2026: pay-day change the day after pay day
-- ===========================================================================
select tests.clear_authentication();
select tests.set_today('2026-11-26');
select tests.authenticate_as('alice');
select is(public.ensure_periods(tests.id('payday')), 1, 'R-PERIOD-009: November''s period exists');
select public.update_income_terms((select primary_income_id from public.budgets where id = tests.id('payday')), 500000, 27, 'nearest');
select results_eq(
  format('select seq, start_date, end_date from pg_temp.periods_of(%L)', tests.id('payday')),
  $$values (1, '2026-10-26'::date, '2026-11-24'::date), (2, '2026-11-25'::date, '2026-12-27'::date)$$,
  'R-VERSION-007 R-VERSION-008: from the 25th to the 27th on 26 Nov: November''s period keeps its start and ends before 28 Dec (27 Dec is a Sunday)'
);
select is(public.ensure_periods(tests.id('late')), 0, 'R-PERIOD-022: the late salary has still not come on the 26th');

-- ===========================================================================
-- 27 November 2026: the late salary arrives
-- ===========================================================================
select tests.clear_authentication();
select tests.set_today('2026-11-27');
select tests.authenticate_as('alice');
select is(public.ensure_periods(tests.id('late')), 1, 'R-PERIOD-012: November''s period starts with the late salary');
select results_eq(
  format('select seq, month, anchor_date, start_date, end_date from public.periods where budget_id = %L and seq = 2', tests.id('late')),
  $$values (2, '2026-11-01'::date, '2026-11-25'::date, '2026-11-27'::date, '2026-12-24'::date)$$,
  'R-PERIOD-012 R-PERIOD-021: it is still November''s single period'
);

-- ===========================================================================
-- 20 December 2026: an early salary announced in advance
-- ===========================================================================
select tests.clear_authentication();
select tests.set_today('2026-12-20');
select tests.authenticate_as('alice');
select public.ensure_periods(tests.id('early'));
select tests.remember('early_nov', (select id from public.periods where budget_id = tests.id('early') and seq = 2));
select lives_ok(
  format('select public.move_period_boundary(%L, %L)', tests.id('early_nov'), '2026-12-22'),
  'R-PERIOD-013: the December salary will come two days early, on the 23rd'
);
select results_eq(
  format('select seq, end_date, end_is_manual, is_current from public.period_summaries where budget_id = %L and seq = 2', tests.id('early')),
  $$values (2, '2026-12-22'::date, true, true)$$,
  'R-PERIOD-013: November''s period is still current, ending on the 22nd'
);

-- ===========================================================================
-- 23 December 2026: the early salary arrives
-- ===========================================================================
select tests.clear_authentication();
select tests.set_today('2026-12-23');
select tests.authenticate_as('alice');
select is(public.ensure_periods(tests.id('early')), 1, 'R-PERIOD-009: December''s period starts with the early salary');
select results_eq(
  format('select seq, month, start_date, end_date from pg_temp.periods_of(%L) where seq >= 2', tests.id('early')),
  $$values (2, '2026-11-01'::date, '2026-11-25'::date, '2026-12-22'::date),
           (3, '2026-12-01'::date, '2026-12-23'::date, '2027-01-24'::date)$$,
  'R-PERIOD-021: one December period to 24 Jan, not a two-day stub before the scheduled 25th'
);
select results_eq(
  format('select seq, income_total from public.period_summaries where budget_id = %L and seq >= 2 order by seq', tests.id('early')),
  $$values (2, 500000::bigint), (3, 500000::bigint)$$,
  'R-PERIOD-018 R-INCOME-011: from 25 Nov to 24 Jan the salary counts twice, once per month'
);
select throws_ok(
  format('select public.move_period_boundary(%L, %L)',
         (select id from public.periods where budget_id = tests.id('early') and seq = 3), '2026-12-23'),
  'P0001', 'invalid_boundary',
  'R-PERIOD-020: December''s period cannot be closed again a month before January''s salary'
);

-- Closing early on the day itself, then undoing it.
select public.ensure_periods(tests.id('early_now'));
select tests.remember('early_now_nov', (select id from public.periods where budget_id = tests.id('early_now') and seq = 2));
select lives_ok(
  format('select public.move_period_boundary(%L, %L)', tests.id('early_now_nov'), '2026-12-22'),
  'R-PERIOD-012: the salary arrived today, two days early'
);
select results_eq(
  format('select seq, start_date, end_date from pg_temp.periods_of(%L) where seq >= 2', tests.id('early_now')),
  $$values (2, '2026-11-25'::date, '2026-12-22'::date), (3, '2026-12-23'::date, '2027-01-24'::date)$$,
  'R-PERIOD-012: December''s period starts today'
);
select lives_ok(
  format('select public.move_period_boundary(%L, null)', tests.id('early_now_nov')),
  'R-PERIOD-025: undo: reset the boundary to the schedule'
);
select results_eq(
  format('select seq, start_date, end_date from pg_temp.periods_of(%L) where seq >= 2', tests.id('early_now')),
  $$values (2, '2026-11-25'::date, '2026-12-24'::date)$$,
  'R-PERIOD-025 R-PERIOD-022: December''s period is gone again until its scheduled salary'
);

select tests.clear_authentication();
select lives_ok('set constraints all immediate', 'R-PERIOD-005 R-PERIOD-021 R-PERIOD-022: every invariant holds after the boundary moves');
set constraints all deferred;
select is_empty(
  $$select b, v from unnest(array[tests.id('catchup'), tests.id('jan'), tests.id('current'), tests.id('late'),
                               tests.id('early'), tests.id('early_now'), tests.id('payday'), tests.id('ended')]) as b,
                 tests.period_violations(b) as v$$,
  'R-PERIOD-005 R-PERIOD-006 R-PERIOD-021 R-PERIOD-022: the independent invariant check agrees'
);

-- ===========================================================================
-- 1 June 2027: after the end date
-- ===========================================================================
select tests.set_today('2027-06-01');
select tests.authenticate_as('alice');
select is(public.ensure_periods(tests.id('ended')), 2, 'R-BUDGET-007: catch-up stops at the final month');
select results_eq(
  format('select seq, month, start_date, end_date from pg_temp.periods_of(%L)', tests.id('ended')),
  $$values (1, '2026-10-01'::date, '2026-10-26'::date, '2026-11-09'::date),
           (2, '2026-11-01'::date, '2026-11-10'::date, '2026-12-09'::date),
           (3, '2026-12-01'::date, '2026-12-10'::date, '2027-01-10'::date),
           (4, '2027-01-01'::date, '2027-01-11'::date, '2027-02-09'::date)$$,
  'R-BUDGET-008 R-BUDGET-014: the final period (January 2027) ends on a normal boundary'
);
select is_empty(
  format('select 1 from public.get_current_period(%L)', tests.id('ended')),
  'R-BUDGET-007: an ended budget has no current period'
);
select lives_ok(
  format('select public.move_period_boundary(%L, %L)',
         (select id from public.periods where budget_id = tests.id('ended') and seq = 4), '2027-02-12'),
  'R-BUDGET-015: the final boundary is adjusted in one call'
);
select is(
  (select end_date from public.my_budgets where id = tests.id('ended')),
  '2027-02-12'::date,
  'R-BUDGET-015: and the budget''s end date follows it'
);
select throws_ok(
  format('select public.update_income_terms(%L, 1, 25, %L)',
         (select primary_income_id from public.budgets where id = tests.id('ended')), 'nearest'),
  'P0001', 'budget_ended',
  'R-VERSION-001: the terms of an ended budget cannot change from "now" (there is no current period)'
);
select is(
  (select count(*)::integer from public.set_budget_end_date(tests.id('ended'), null)),
  1,
  'R-BUDGET-005: clearing the end date'
);
select is(
  (select max(month) from public.periods where budget_id = tests.id('ended')),
  '2027-05-01'::date,
  'R-BUDGET-005: resumes generation up to the current period'
);

-- ===========================================================================
-- The invariants hold against direct writes by a privileged role
-- ===========================================================================
select tests.clear_authentication();
select lives_ok('set constraints all immediate', 'R-PERIOD-005: invariants hold before the direct writes');
set constraints all deferred;

update public.periods set start_date = start_date + 1 where budget_id = tests.id('jan') and seq = 5;
select throws_ok('set constraints all immediate', '23514', 'periods_invalid',
  'R-PERIOD-005: a gap between two periods is rejected');
set constraints all deferred;
update public.periods set start_date = start_date - 1 where budget_id = tests.id('jan') and seq = 5;

update public.periods set end_date = end_date + 1 where budget_id = tests.id('jan') and seq = 5;
select throws_ok('set constraints all immediate', '23514', 'periods_invalid',
  'R-PERIOD-006: overlapping periods are rejected');
set constraints all deferred;
update public.periods set end_date = end_date - 1 where budget_id = tests.id('jan') and seq = 5;

select throws_ok(
  format($$update public.periods set month = '2026-05-01' where budget_id = %L and seq = 4$$, tests.id('jan')),
  '23505', null,
  'R-PERIOD-021: two periods for the same month are rejected');

update public.periods set month = '2026-12-01' where budget_id = tests.id('jan') and seq = 11;
select throws_ok('set constraints all immediate', '23514', 'periods_invalid',
  'R-PERIOD-021: a skipped month is rejected');
set constraints all deferred;
update public.periods set month = '2026-11-01' where budget_id = tests.id('jan') and seq = 11;

update public.periods set anchor_date = start_date + 15 where budget_id = tests.id('jan') and seq = 6;
select throws_ok('set constraints all immediate', '23514', 'periods_invalid',
  'R-PERIOD-020: a period starting more than 14 days from its salary is rejected');
set constraints all deferred;
update public.periods set anchor_date = '2026-06-25' where budget_id = tests.id('jan') and seq = 6;

insert into public.periods (budget_id, seq, month, anchor_date, start_date, end_date)
select tests.id('ended'), max(seq) + 1, (max(month) + interval '1 month')::date,
       max(end_date) + 1, max(end_date) + 1, max(end_date) + 30
from public.periods where budget_id = tests.id('ended');
select throws_ok('set constraints all immediate', '23514', 'periods_invalid',
  'R-PERIOD-022: a period starting after today is rejected');
set constraints all deferred;
delete from public.periods where budget_id = tests.id('ended')
  and seq = (select max(seq) from public.periods where budget_id = tests.id('ended'));

select lives_ok('set constraints all immediate', 'R-PERIOD-005: invariants hold again after the direct writes');
set constraints all deferred;
update public.budgets set end_month = '2026-06-01' where id = tests.id('jan');
select throws_ok('set constraints all immediate', '23514', 'periods_invalid',
  'R-BUDGET-007: no period may lie after the final month');
set constraints all deferred;
update public.budgets set end_month = null where id = tests.id('jan');

delete from public.periods where budget_id = tests.id('jan') and seq = 5;
select throws_ok('set constraints all immediate', '23514', 'periods_invalid',
  'R-PERIOD-005: a missing period is rejected');
set constraints all deferred;

select * from finish();
rollback;
