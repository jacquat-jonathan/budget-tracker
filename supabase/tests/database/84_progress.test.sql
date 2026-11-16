-- Period progress: per category and subcategory, the period totals, results, overspending,
-- categories with transactions outside their validity, and a reopen with category changes.
-- Dates worked out by hand: pay day 25, nearest, start September: period 1 is 25 Sep - 25 Oct,
-- period 2 is 26 Oct - 24 Nov, period 3 (from 25 Nov, a Wednesday) 25 Nov - 24 Dec.
begin;
select plan(32);

select tests.create_user('alice', 'Alice');
select tests.set_today('2026-11-15');
select tests.authenticate_as('alice');
select tests.remember('m', public.create_budget('M', 'Salary', 500000, 25, 'nearest', '2026-09-01'));

create or replace function pg_temp.p(n integer) returns uuid language sql as $$
  select id from public.periods where budget_id = tests.id('m') and seq = n
$$;
create or replace function pg_temp.cat(n text) returns uuid language sql as $$
  select id from public.categories where budget_id = tests.id('m') and name = n
$$;
create or replace function pg_temp.rev(c uuid) returns integer language sql as $$
  select revision from public.categories where id = c
$$;
create or replace function pg_temp.row(n integer, c text) returns table (in_force boolean, expected bigint, spent bigint, result bigint, is_overspent boolean) language sql as $$
  select in_force, expected, spent, result, is_overspent from public.get_period_progress(pg_temp.p(n)) where category_id = pg_temp.cat(c)
$$;
create or replace function pg_temp.tx(kind text, amount bigint, d date, c text) returns uuid language sql as $$
  select id from public.add_transaction(tests.id('m'), kind::public.transaction_kind, amount, d, pg_temp.cat(c))
$$;
-- Every period: the view's totals, the sum of its progress rows, and a naive recomputation.
create or replace function pg_temp.disagreements() returns setof text language sql as $$
  select format('period %s: view %s, rows %s, naive %s', s.seq,
                row(s.salary_total, s.extra_income_total, s.expected_total, s.spent_total),
                row(r.expected, r.spent), row(n.*))
  from public.period_summaries as s
  cross join lateral (select sum(expected)::bigint as expected, sum(spent)::bigint as spent
                      from public.get_period_progress(s.id) where not is_group) as r
  cross join lateral tests.naive_totals(s.id) as n
  where s.budget_id = tests.id('m')
    and (row(s.salary_total, s.extra_income_total, s.expected_total, s.spent_total) is distinct from row(n.*)
         or row(coalesce(r.expected, 0), coalesce(r.spent, 0)) is distinct from row(s.expected_total, s.spent_total)
         or s.income_total <> s.salary_total + s.extra_income_total
         or s.left_to_assign <> s.income_total - s.expected_total
         or s.result <> s.income_total - s.spent_total)
$$;

-- ===========================================================================
-- Period 2 current: categories, a group, transactions in both periods
-- ===========================================================================
select public.create_category(tests.id('m'), 'Food', p_amount => 50000, p_from_period_id => pg_temp.p(1));
select public.create_category(tests.id('m'), 'Insurance', p_amount => 1000006, p_cadence => 'yearly', p_from_period_id => pg_temp.p(1));
select public.create_category(tests.id('m'), 'Shoes', p_amount => 2000, p_from_period_id => pg_temp.p(1));
select public.create_category(tests.id('m'), 'Home', p_amount => 10000, p_from_period_id => pg_temp.p(1));
select pg_temp.tx('expense', 12345, '2026-10-01', 'Food');
select pg_temp.tx('refund', 300, '2026-10-02', 'Food');
select pg_temp.tx('refund', 500, '2026-10-03', 'Shoes');
select pg_temp.tx('expense', 8000, '2026-10-04', 'Home');
select pg_temp.tx('expense', 4000, '2026-11-01', 'Food');
select public.create_category(tests.id('m'), 'Repairs', pg_temp.cat('Home'), 3000, p_other_name => 'Other');
select pg_temp.tx('expense', 4500, '2026-11-02', 'Repairs');
select public.add_transaction(tests.id('m'), 'extra_income', 25000, '2026-10-20', p_description => 'Sold the bike');

select results_eq(
  format('select name, is_group, in_force, expected, spent, result, is_overspent, transaction_count from public.get_period_progress(%L) order by display_order', pg_temp.p(1)),
  $$values ('Food', false, true, 50000::bigint, 12045::bigint, 37955::bigint, false, 2),
           ('Insurance', false, true, 83334::bigint, 0::bigint, 83334::bigint, false, 0),
           ('Shoes', false, true, 2000::bigint, -500::bigint, 2500::bigint, false, 1),
           ('Home', true, true, 10000::bigint, 8000::bigint, 2000::bigint, false, 1),
           ('Other', false, true, 10000::bigint, 8000::bigint, 2000::bigint, false, 1)$$,
  'R-PROGRESS-090 R-PROGRESS-070: a past period, per category: the expectation in force then, what was spent, the result; groups add up their subcategories'
);
select results_eq(
  format('select income_total, salary_total, extra_income_total, expected_total, spent_total, left_to_assign, result from public.period_summaries where id = %L', pg_temp.p(1)),
  $$values (525000::bigint, 500000::bigint, 25000::bigint, (50000 + 83334 + 2000 + 10000)::bigint, (12045 - 500 + 8000)::bigint,
            (525000 - 145334)::bigint, (525000 - 19545)::bigint)$$,
  'R-PROGRESS-002 R-CATEGORY-006 R-PROGRESS-092: the period''s totals: income, expected, left to assign, spent, result'
);
select ok((select result > 0 from public.period_summaries where id = pg_temp.p(1)), 'R-PROGRESS-002: a surplus is a positive result');
select results_eq(
  'select * from pg_temp.row(1, ''Shoes'')',
  $$values (true, 2000::bigint, -500::bigint, 2500::bigint, false)$$,
  'R-PROGRESS-091 R-TRANSACTION-071: a refund larger than the period''s expenses makes what was spent negative'
);
select results_eq(
  format('select name, expected, spent from public.get_period_progress(%L) order by display_order', pg_temp.p(2)),
  $$values ('Food', 50000::bigint, 4000::bigint), ('Insurance', 83334::bigint, 0::bigint), ('Shoes', 2000::bigint, 0::bigint),
           ('Home', 13000::bigint, 4500::bigint), ('Repairs', 3000::bigint, 4500::bigint), ('Other', 10000::bigint, 0::bigint)$$,
  'R-PROGRESS-090 R-PROGRESS-001: the current period starts from nothing spent: balances do not carry over'
);
select results_eq('select is_overspent from pg_temp.row(2, ''Repairs'')', $$values (true)$$,
  'R-PROGRESS-071: a subcategory over its expectation is overspent');
select results_eq('select is_overspent from pg_temp.row(2, ''Home'')', $$values (false)$$,
  'R-PROGRESS-071: its group, within its total, is not');
select pg_temp.tx('expense', 900000, '2026-11-03', 'Food');
select ok((select result < 0 from public.period_summaries where id = pg_temp.p(2)), 'R-PROGRESS-002 R-TRANSACTION-073: spending more than the income gives a deficit, a negative result');
select is_empty('select * from pg_temp.disagreements()', 'R-PROGRESS-092: every period''s totals equal the sum of its rows and a naive recomputation');

-- Categories that will change in the next period
select public.create_category(tests.id('m'), 'Brief', p_amount => 700);
select pg_temp.tx('expense', 999, '2026-11-04', 'Brief');
select public.create_category(tests.id('m'), 'Unused', p_amount => 800);

-- ===========================================================================
-- 25 November: period 3; changes recorded in it
-- ===========================================================================
select tests.clear_authentication();
select tests.set_today('2026-11-25');
select tests.authenticate_as('alice');
select is(public.ensure_periods(tests.id('m')), 1, 'setup: the salary starts period 3');
select results_eq('select spent from pg_temp.row(3, ''Food'')', $$values (0::bigint)$$,
  'R-PROGRESS-001: at the end of a period the category balances reset');
select public.update_category(pg_temp.cat('Food'), pg_temp.rev(pg_temp.cat('Food')), p_amount => 60000);
select public.update_category(pg_temp.cat('Food'), pg_temp.rev(pg_temp.cat('Food')), p_amount => 55000, p_from_period_id => pg_temp.p(2));
select results_eq('select expected from pg_temp.row(2, ''Food'') union all select expected from pg_temp.row(3, ''Food'')',
  $$values (55000::bigint), (60000::bigint)$$, 'R-VERSION-070: a correction of period 2 written after the raise in period 3');
select is(public.end_category(pg_temp.cat('Brief'), pg_temp.rev(pg_temp.cat('Brief'))), 'ended', 'setup: Brief ends from period 3');
select is(public.end_category(pg_temp.cat('Unused'), pg_temp.rev(pg_temp.cat('Unused'))), 'ended', 'setup: Unused ends from period 3');
select public.create_category(tests.id('m'), 'Added', p_amount => 7000);
select results_eq(
  format('select record_kind, record_name, change, replaces_previous from public.preview_reopen(%L) order by record_kind, record_name', tests.id('m')),
  $$values ('category', 'Added', 'added', false), ('category', 'Brief', 'removed', false),
           ('category', 'Food', 'terms_changed', true), ('category', 'Unused', 'removed', false)$$,
  'R-PERIOD-035 R-VERSION-014: the reopen preview reports category changes, a new kind of record'
);
select is_empty('select * from pg_temp.disagreements()', 'R-PROGRESS-092: totals agree before the reopen');

-- ===========================================================================
-- 26 November: the salary has not arrived; reopen
-- ===========================================================================
select tests.clear_authentication();
select tests.set_today('2026-11-26');
select tests.authenticate_as('alice');
select lives_ok(format('select public.reopen_previous_period(%L)', tests.id('m')),
  'R-VERSION-014 R-PERIOD-023: a reopen with category changes succeeds');
select results_eq(
  format('select seq, start_date, end_date from public.periods where budget_id = %L order by seq', tests.id('m')),
  $$values (1, '2026-09-25'::date, '2026-10-25'::date), (2, '2026-10-26'::date, '2026-12-24'::date)$$,
  'setup: period 2 is current again and runs to 24 Dec'
);
select results_eq('select expected from pg_temp.row(2, ''Food'')', $$values (60000::bigint)$$,
  'R-VERSION-013: the merged period''s expectation wins over the later-written correction');
select results_eq(
  format('select first_seq, end_seq from public.categories where id = %L', pg_temp.cat('Brief')),
  $$values (2, 2)$$,
  'R-VERSION-014: a category that would never be in force but has transactions is kept as a void row'
);
select results_eq('select * from pg_temp.row(2, ''Brief'')', $$values (false, 0::bigint, 999::bigint, -999::bigint, true)$$,
  'R-PROGRESS-091: its transactions still count, with nothing expected');
select is(pg_temp.cat('Unused'), null,
  'R-VERSION-014: one without transactions is deleted, even when another row of the same reopen is kept void');
select results_eq(
  format('select first_seq, end_seq, is_active from public.category_overview where id = %L', pg_temp.cat('Added')),
  $$values (2, null::integer, true)$$,
  'R-VERSION-011: a category added in the merged period is in force in the reopened one'
);
select is_empty('select * from pg_temp.disagreements()', 'R-PROGRESS-092: totals agree after the reopen');
select is_empty(format('select * from tests.period_violations(%L)', tests.id('m')), 'R-VERSION-011: nothing keyed beyond the latest period');

-- A reopen voiding a group because one subcategory is referenced: the subcategory is kept, the
-- group too, the other subcategory deleted.
select tests.clear_authentication();
select tests.set_today('2026-12-25');
select tests.authenticate_as('alice');
select is(public.ensure_periods(tests.id('m')), 1, 'setup: period 3 again, from 25 Dec');
select public.create_category(tests.id('m'), 'Trip', p_amount => 0);
select public.create_category(tests.id('m'), 'Train', pg_temp.cat('Trip'), 100);
select public.create_category(tests.id('m'), 'Hotel', pg_temp.cat('Trip'), 200);
select pg_temp.tx('expense', 50, '2026-12-25', 'Train');
select public.end_category(pg_temp.cat('Trip'), pg_temp.rev(pg_temp.cat('Trip')));
select results_eq(
  format('select name, first_seq, end_seq from public.categories where id = %1$L or parent_id = %1$L order by name', pg_temp.cat('Trip')),
  $$values ('Train', 3, 3), ('Trip', 3, 3)$$,
  'R-CATEGORY-095: removing a new group: the used subcategory and the group are kept void, the unused one deleted'
);
select tests.clear_authentication();
select tests.set_today('2026-12-26');
select tests.authenticate_as('alice');
select lives_ok(format('select public.reopen_previous_period(%L)', tests.id('m')), 'R-VERSION-014: the reopen still succeeds');
select results_eq(
  format('select name, first_seq, end_seq from public.categories where id = %1$L or parent_id = %1$L order by name', pg_temp.cat('Trip')),
  $$values ('Train', 2, 2), ('Trip', 2, 2)$$,
  'R-VERSION-014: void rows move with the merge'
);
select results_eq('select * from pg_temp.row(2, ''Trip'')', $$values (false, 0::bigint, 50::bigint, -50::bigint, true)$$,
  'R-PROGRESS-091: and the group shows what was spent in it');
select is_empty('select * from pg_temp.disagreements()', 'R-PROGRESS-092: totals agree');

select lives_ok('set constraints all immediate', 'R-VERSION-014 R-CATEGORY-090: every invariant holds');
set constraints all deferred;

select * from finish();
rollback;
