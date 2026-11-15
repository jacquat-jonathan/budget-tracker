-- Period generation and mechanics. Dates below were worked out independently of the SQL:
-- pay day 25, weekend rule nearest; in 2026 the 25th falls on a weekend in January (Sun),
-- April (Sat), July (Sat) and October (Sun).
--
-- Deferred constraint triggers (contiguity, primary income, ...) only fire at commit, and
-- tests roll back, so the tests force them with `set constraints all immediate`.
begin;
select plan(52);

select tests.create_user('alice', 'Alice');
select tests.set_today('2026-11-15');

create temp table expected_jan (seq integer, start_date date, end_date date) on commit drop;
grant select on expected_jan to authenticated;
insert into expected_jan values
  (1,  '2026-01-26', '2026-02-24'),
  (2,  '2026-02-25', '2026-03-24'),
  (3,  '2026-03-25', '2026-04-23'),
  (4,  '2026-04-24', '2026-05-24'),
  (5,  '2026-05-25', '2026-06-24'),
  (6,  '2026-06-25', '2026-07-23'),
  (7,  '2026-07-24', '2026-08-24'),
  (8,  '2026-08-25', '2026-09-24'),
  (9,  '2026-09-25', '2026-10-25'),
  (10, '2026-10-26', '2026-11-24');

-- ---------------------------------------------------------------------------
-- First period: the current one by default
-- ---------------------------------------------------------------------------
select tests.authenticate_as('alice');
select tests.remember('current', public.create_budget('Current', 'Salary', 500000, 25));

select results_eq(
  format('select seq, start_date, end_date from public.periods where budget_id = %L order by seq',
         tests.id('current')),
  $$values (1, '2026-10-26'::date, '2026-11-24'::date)$$,
  'by default the first period is the current one (25 Oct is a Sunday: starts Monday 26)'
);
select results_eq(
  format('select start_date, is_current from public.get_current_period(%L)', tests.id('current')),
  $$values ('2026-10-26'::date, true)$$,
  'get_current_period returns it'
);

-- ---------------------------------------------------------------------------
-- First period from a chosen earlier month, with catch-up to today
-- ---------------------------------------------------------------------------
select tests.remember('jan', public.create_budget('From January', 'Salary', 500000, 25, 'nearest', '2026-01-01'));

select tests.authenticate_as('alice');

select results_eq(
  format('select seq, start_date, end_date from public.periods where budget_id = %L order by seq',
         tests.id('jan')),
  'select * from expected_jan order by seq',
  'a budget started in January has every period from 26 January up to the current one'
);

select throws_ok(
  $$select public.create_budget('Future', 'Salary', 500000, 25, 'nearest', '2026-11-01')$$,
  'P0001', 'invalid_start_month',
  'a start month whose pay date is still to come is rejected'
);
select throws_ok(
  $$select public.create_budget('Too old', 'Salary', 500000, 25, 'nearest', '2021-10-01')$$,
  'P0001', 'invalid_start_month',
  'a start month more than 60 months back is rejected'
);
select lives_ok(
  $$select tests.remember('oldest', public.create_budget('Oldest', 'Salary', 500000, 25, 'nearest', '2021-11-01'))$$,
  'a start month exactly 60 months back is accepted'
);
select is(
  (select count(*)::integer from public.periods where budget_id = tests.id('oldest')),
  60,
  'and generates one period per month up to today (November 2021 to October 2026)'
);

-- ---------------------------------------------------------------------------
-- Catch-up over many months and idempotence
-- ---------------------------------------------------------------------------
select tests.clear_authentication();
select tests.set_today('2026-01-30');
select tests.authenticate_as('alice');
select tests.remember('catchup', public.create_budget('Catch-up', 'Salary', 500000, 25));
select results_eq(
  format('select start_date, end_date from public.periods where budget_id = %L', tests.id('catchup')),
  $$values ('2026-01-26'::date, '2026-02-24'::date)$$,
  'created at the end of January, the budget has one period'
);

select tests.clear_authentication();
select tests.set_today('2026-11-15');
select tests.authenticate_as('alice');
select is(public.ensure_periods(tests.id('catchup')), 9, 'ensure_periods catches up nine months');
select results_eq(
  format('select seq, start_date, end_date from public.periods where budget_id = %L order by seq',
         tests.id('catchup')),
  'select * from expected_jan order by seq',
  'the caught-up periods are the same as when created from January'
);
select is(public.ensure_periods(tests.id('catchup')), 0, 'a second call creates nothing');
select is(
  (select count(*)::integer from public.periods where budget_id = tests.id('catchup')),
  10,
  'idempotent: still ten periods'
);

select tests.clear_authentication();
select lives_ok('set constraints all immediate', 'periods are contiguous and numbered without gaps');
set constraints all deferred;
select is_empty(
  format($$select 1 from (
      select start_date, lag(end_date) over (order by seq) as prev_end, seq,
             row_number() over (order by seq) as rn
      from public.periods where budget_id = %L) s
    where s.seq <> s.rn or (s.prev_end is not null and s.start_date <> s.prev_end + 1)$$,
    tests.id('oldest')),
  'sixty months of periods are contiguous'
);

-- ---------------------------------------------------------------------------
-- Primary pay-day change mid-period
-- ---------------------------------------------------------------------------
select tests.authenticate_as('alice');
select tests.remember('jan_primary', (select primary_income_id from public.budgets where id = tests.id('jan')));
select lives_ok(
  format('select public.update_income_terms(%L, 500000, 5, %L)', tests.id('jan_primary'), 'nearest'),
  'the primary pay day changes from the 25th to the 5th on 15 November'
);
select results_eq(
  format('select start_date, end_date, end_is_manual from public.periods where budget_id = %L and seq = 10',
         tests.id('jan')),
  $$values ('2026-10-26'::date, '2026-12-03'::date, false)$$,
  'the current period keeps its start; its end is re-projected (5 Dec is a Saturday: paid Friday 4)'
);
select results_eq(
  format('select seq, start_date, end_date from public.periods where budget_id = %L and seq < 10 order by seq',
         tests.id('jan')),
  'select * from expected_jan where seq < 10 order by seq',
  'past periods are untouched'
);

select tests.clear_authentication();
select tests.set_today('2026-12-10');
select tests.authenticate_as('alice');
select is(public.ensure_periods(tests.id('jan')), 1, 'in December one new period is created');
select results_eq(
  format('select start_date, end_date from public.periods where budget_id = %L and seq = 11', tests.id('jan')),
  $$values ('2026-12-04'::date, '2027-01-04'::date)$$,
  'it follows the new pay day: 4 December to 4 January (5 January 2027 is a Tuesday)'
);
select tests.clear_authentication();
select tests.set_today('2026-11-15');
select tests.authenticate_as('alice');

-- ---------------------------------------------------------------------------
-- Manual boundaries
-- ---------------------------------------------------------------------------
select tests.remember('catchup_p3', (select id from public.periods where budget_id = tests.id('catchup') and seq = 3));
select tests.remember('catchup_p10', (select id from public.periods where budget_id = tests.id('catchup') and seq = 10));
select tests.remember('catchup_primary', (select primary_income_id from public.budgets where id = tests.id('catchup')));

select lives_ok(
  format('select public.move_period_boundary(%L, %L)', tests.id('catchup_p3'), '2026-04-21'),
  'moving the boundary between periods 3 and 4 to 21 April'
);
select results_eq(
  format('select seq, start_date, end_date, end_is_manual from public.periods where budget_id = %L and seq in (3, 4) order by seq',
         tests.id('catchup')),
  $$values (3, '2026-03-25'::date, '2026-04-21'::date, true), (4, '2026-04-22'::date, '2026-05-24'::date, false)$$,
  'moves the end of period 3 and the start of period 4 together'
);
select lives_ok(
  format('select public.move_period_boundary(%L, %L)', tests.id('catchup_p10'), '2026-11-23'),
  'setting the current period''s end by hand'
);
select lives_ok(
  format('select public.update_income_terms(%L, 500000, 10, %L)', tests.id('catchup_primary'), 'nearest'),
  'then changing the primary pay day'
);
select results_eq(
  format('select seq, end_date, end_is_manual from public.periods where budget_id = %L and seq in (3, 10) order by seq',
         tests.id('catchup')),
  $$values (3, '2026-04-21'::date, true), (10, '2026-11-23'::date, true)$$,
  'manual boundaries survive the recomputation'
);
select lives_ok(
  format('select public.move_period_boundary(%L, null)', tests.id('catchup_p10')),
  'clearing the manual end of the current period'
);
select results_eq(
  format('select end_date, end_is_manual from public.periods where id = %L', tests.id('catchup_p10')),
  $$values ('2026-12-09'::date, false)$$,
  're-projects it from the current terms (10 December 2026 is a Thursday)'
);

select throws_ok(
  format('select public.move_period_boundary(%L, %L)', tests.id('catchup_p3'), '2026-03-24'),
  'P0001', 'invalid_boundary', 'a period cannot end before it starts'
);
select throws_ok(
  format('select public.move_period_boundary(%L, %L)', tests.id('catchup_p3'), '2026-05-24'),
  'P0001', 'invalid_boundary', 'a boundary cannot swallow the next period'
);
select throws_ok(
  format('select public.move_period_boundary(%L, null)', tests.id('catchup_p3')),
  'P0001', 'invalid_boundary', 'only the last period''s end can be reset'
);
select throws_ok(
  format('select public.move_period_boundary(%L, %L)', tests.id('catchup_p10'), '2027-01-30'),
  'P0001', 'invalid_boundary', 'a period cannot be longer than 70 days'
);

-- Moving the current end before today closes the current period and starts the next.
select lives_ok(
  format('select public.move_period_boundary(%L, %L)', tests.id('catchup_p10'), '2026-11-12'),
  'the salary arrived early: the current period ends on 12 November'
);
select results_eq(
  format('select seq, start_date, end_date from public.periods where budget_id = %L and seq >= 10 order by seq',
         tests.id('catchup')),
  $$values (10, '2026-10-26'::date, '2026-11-12'::date), (11, '2026-11-13'::date, '2026-12-09'::date)$$,
  'a new current period starts the next day'
);

select tests.clear_authentication();
select lives_ok('set constraints all immediate', 'boundaries moved by hand keep periods contiguous');
set constraints all deferred;
select tests.authenticate_as('alice');

-- ---------------------------------------------------------------------------
-- Switching the primary income
-- ---------------------------------------------------------------------------
select tests.remember('current_second', public.add_income(tests.id('current'), 'Second job', 100000, 10));
select lives_ok(
  format('select public.set_primary_income(%L)', tests.id('current_second')),
  'switching the primary to an income paid on the 10th'
);
select results_eq(
  format('select start_date, end_date from public.periods where budget_id = %L', tests.id('current')),
  $$values ('2026-10-26'::date, '2026-12-09'::date)$$,
  'the current period keeps its start and ends before the new primary''s next pay date'
);
select is(
  (select is_primary from public.income_overview where id = tests.id('current_second')),
  true,
  'income_overview shows the new primary'
);
select is(
  (select count(*)::integer from public.income_overview where budget_id = tests.id('current') and is_primary),
  1,
  'exactly one income is primary'
);

-- ---------------------------------------------------------------------------
-- End date
-- ---------------------------------------------------------------------------
select tests.remember('ended', public.create_budget('Ended', 'Salary', 500000, 25));
select is(
  public.set_budget_end_date(tests.id('ended'), '2027-02-10'),
  '2027-02-24'::date,
  'an end date is moved to the end of the period containing it'
);
select is(
  (select end_date from public.budgets where id = tests.id('ended')),
  '2027-02-24'::date,
  'and stored'
);
select throws_ok(
  format('select public.set_budget_end_date(%L, %L)', tests.id('ended'), '2026-10-01'),
  'P0001', 'end_date_before_last_period',
  'an end date before the last existing period would delete periods: rejected'
);

select tests.clear_authentication();
select tests.set_today('2027-06-01');
select tests.authenticate_as('alice');
select is(public.ensure_periods(tests.id('ended')), 3, 'after the end date, catch-up stops at the end');
select results_eq(
  format('select seq, start_date, end_date from public.periods where budget_id = %L and seq > 1 order by seq',
         tests.id('ended')),
  $$values (2, '2026-11-25'::date, '2026-12-24'::date),
           (3, '2026-12-25'::date, '2027-01-24'::date),
           (4, '2027-01-25'::date, '2027-02-24'::date)$$,
  'the last period ends on the end date'
);
select is_empty(
  format('select 1 from public.get_current_period(%L)', tests.id('ended')),
  'an ended budget has no current period'
);
select throws_ok(
  format('select public.move_period_boundary(%L, %L)',
         (select id from public.periods where budget_id = tests.id('ended') and seq = 4), '2027-02-20'),
  'P0001', 'boundary_is_budget_end',
  'the boundary on the end date cannot be moved'
);
select throws_ok(
  format('select public.update_income_terms(%L, 1, 25, %L)',
         (select primary_income_id from public.budgets where id = tests.id('ended')), 'nearest'),
  'P0001', 'budget_ended',
  'the terms of an ended budget cannot change (there is no current period)'
);

select tests.clear_authentication();
select lives_ok('set constraints all immediate', 'no period lies after the end date');
set constraints all deferred;

-- Direct violation, as a privileged role, to show the invariant itself holds.
update public.periods set end_date = '2027-03-01'
where budget_id = tests.id('ended') and seq = 4;
select throws_ok('set constraints all immediate', '23514', 'periods_not_contiguous',
  'the database rejects a period ending after the end date');
set constraints all deferred;
update public.periods set end_date = '2027-02-24'
where budget_id = tests.id('ended') and seq = 4;

select tests.authenticate_as('alice');
select is(public.set_budget_end_date(tests.id('ended'), null), null::date, 'clearing the end date');
select is(
  (select max(end_date) from public.periods where budget_id = tests.id('ended')),
  '2027-06-24'::date,
  'resumes generation up to the current period'
);

select tests.clear_authentication();
select tests.set_today('2026-11-15');

-- ---------------------------------------------------------------------------
-- Invariants hold against direct writes by a privileged role
-- ---------------------------------------------------------------------------
update public.periods set start_date = start_date + 1
where budget_id = tests.id('jan') and seq = 5;
select throws_ok('set constraints all immediate', '23514', 'periods_not_contiguous',
  'a gap between two periods is rejected');
set constraints all deferred;
update public.periods set start_date = start_date - 1
where budget_id = tests.id('jan') and seq = 5;

delete from public.periods where budget_id = tests.id('jan') and seq = 5;
select throws_ok('set constraints all immediate', '23514', 'periods_not_contiguous',
  'a missing period is rejected');
set constraints all deferred;

select throws_ok(
  format($$insert into public.periods (budget_id, seq, start_date, end_date)
           values (%L, 99, '2030-01-01', '2030-04-01')$$, tests.id('jan')),
  '23514', null,
  'a period longer than 70 days is rejected'
);

select * from finish();
rollback;
