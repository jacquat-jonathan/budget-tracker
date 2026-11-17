-- Categories and subcategories: shape, expectations and their versions, rounding, the move to
-- "Other" when a category gets its first subcategory, ending and deleting, ordering, limits.
-- Dates worked out by hand: pay day 25, weekend rule nearest, today 15 Nov 2026, start
-- September: period 1 is 25 Sep - 25 Oct (25 Oct is a Sunday, paid Monday 26), period 2 is
-- 26 Oct - 24 Nov (current).
begin;
select plan(62);

select tests.create_user('alice', 'Alice');
select tests.set_today('2026-11-15');
select tests.authenticate_as('alice');
select tests.remember('b', public.create_budget('B', 'Salary', 500000, 25, 'nearest', '2026-09-01'));

create temp table vals (name text primary key, v bigint) on commit drop;
create or replace function pg_temp.p(n integer) returns uuid language sql as $$
  select id from public.periods where budget_id = tests.id('b') and seq = n
$$;
create or replace function pg_temp.cat(n text) returns uuid language sql as $$
  select id from public.categories where budget_id = tests.id('b') and name = n
$$;
create or replace function pg_temp.rev(c uuid) returns integer language sql as $$
  select revision from public.categories where id = c
$$;
-- expected amount of a category in a period, from the progress view
create or replace function pg_temp.expected(c uuid, n integer) returns bigint language sql as $$
  select expected from public.get_period_progress(pg_temp.p(n)) where category_id = c
$$;
create or replace function pg_temp.total(n integer) returns bigint language sql as $$
  select expected_total from public.period_summaries where id = pg_temp.p(n)
$$;

select results_eq(
  format('select seq, start_date, end_date from public.periods where budget_id = %L order by seq', tests.id('b')),
  $$values (1, '2026-09-25'::date, '2026-10-25'::date), (2, '2026-10-26'::date, '2026-11-24'::date)$$,
  'setup: two periods, the second current'
);

-- ===========================================================================
-- Creating, amounts and rounding
-- ===========================================================================
select public.create_category(tests.id('b'), 'Food', p_amount => 60000);
select results_eq(
  format('select name, parent_id, is_group, first_seq, end_seq, amount, cadence, monthly_amount, is_active from public.category_overview where id = %L', pg_temp.cat('Food')),
  $$values ('Food', null::uuid, false, 2, null::integer, 60000::bigint, 'monthly'::public.expectation_cadence, 60000::bigint, true)$$,
  'R-CATEGORY-002 R-CATEGORY-093: a category with a monthly expectation, in force from the current period'
);
select is(pg_temp.expected(pg_temp.cat('Food'), 1), null, 'R-CATEGORY-093: and not in the past period');

select public.create_category(tests.id('b'), 'Tax', p_amount => 120000, p_cadence => 'yearly');
select results_eq(
  format('select amount, cadence from public.category_expectations where category_id = %L', pg_temp.cat('Tax')),
  $$values (120000::bigint, 'yearly'::public.expectation_cadence)$$,
  'R-CATEGORY-003 R-CATEGORY-004: a yearly amount is stored as yearly'
);
select is((select monthly_amount from public.category_overview where id = pg_temp.cat('Tax')), 10000::bigint,
  'R-CATEGORY-005: shown per month as one twelfth');

-- R-CATEGORY-070, R-CATEGORY-091: awkward yearly amounts
select public.create_category(tests.id('b'), 'Y' || a, p_amount => a, p_cadence => 'yearly')
from unnest(array[10000, 150, 18, 6, 5, 17, 19, 0, 1000000000]) as a;
select results_eq(
  format($$select amount, monthly_amount from public.category_overview
           where budget_id = %L and name like 'Y%%' order by amount$$, tests.id('b')),
  $$values (0::bigint, 0::bigint), (5, 0), (6, 1), (17, 1), (18, 2), (19, 2), (150, 13), (10000, 833), (1000000000, 83333333)$$,
  'R-CATEGORY-005 R-CATEGORY-091: one twelfth rounded to the rappen, a half rappen upwards (CHF 1.50 a year: 13 rappen a month)'
);
select is(12 * (select monthly_amount from public.category_overview where id = pg_temp.cat('Y10000')), 9996::bigint,
  'R-CATEGORY-070: twelve monthly shares of CHF 100.00 make CHF 99.96, not adjusted');
select is(
  pg_temp.total(2),
  60000 + 10000 + (0 + 0 + 1 + 1 + 2 + 2 + 13 + 833 + 83333333)::bigint,
  'R-CATEGORY-091 R-CATEGORY-006: the period''s expected total adds the rounded monthly shares'
);
select tests.remember('r', public.create_budget('Rounding', 'Salary', 500000, 25, 'nearest', '2026-09-01'));
select public.create_category(tests.id('r'), n, p_amount => 6, p_cadence => 'yearly') from unnest(array['Half 1', 'Half 2']) as n;
select is((select expected_total from public.period_summaries where budget_id = tests.id('r') and seq = 2), 2::bigint,
  'R-CATEGORY-091: two yearly amounts of 6 rappen expect 1 + 1 rappen a month, not the rounded exact sum (12 / 12 = 1)');
select is(
  (select left_to_assign from public.period_summaries where id = pg_temp.p(2)),
  500000 - pg_temp.total(2),
  'R-CATEGORY-006 R-CATEGORY-071: left to assign is the income total minus the expectations, here negative'
);
select ok((select left_to_assign < 0 from public.period_summaries where id = pg_temp.p(2)),
  'R-CATEGORY-071: assigning more than the income was accepted');
select public.end_category(pg_temp.cat('Y' || a), pg_temp.rev(pg_temp.cat('Y' || a)))
from unnest(array[10000, 150, 18, 6, 5, 17, 19, 0, 1000000000]) as a;
select is(pg_temp.cat('Y150'), null, 'R-CATEGORY-073: removed in the period they started in, without transactions: deleted');

select throws_ok(format('select public.create_category(%L, %L, p_amount => -1)', tests.id('b'), 'Bad'),
  'P0001', 'invalid_amount', 'R-CATEGORY-094: a negative expectation is refused');
select throws_ok(format('select public.create_category(%L, %L, p_amount => 1000000001)', tests.id('b'), 'Bad'),
  'P0001', 'invalid_amount', 'R-CATEGORY-094: so is one above CHF 10 million');
select throws_ok(format('select public.create_category(%L, %L, p_cadence => null)', tests.id('b'), 'Bad'),
  'P0001', 'invalid_cadence', 'R-CATEGORY-003: an expectation is per month or per year');
select throws_ok(format('select public.create_category(%L, %L)', tests.id('b'), '  '),
  'P0001', 'invalid_name', 'R-CATEGORY-001: a category needs a name');

-- ===========================================================================
-- Back-dated creation, versions, corrections
-- ===========================================================================
select public.create_category(tests.id('b'), 'Rent', p_amount => 150000, p_from_period_id => pg_temp.p(1));
select is(pg_temp.expected(pg_temp.cat('Rent'), 1), 150000::bigint,
  'R-CATEGORY-093: a category can be created from an earlier period as an explicit choice');
select public.update_category(pg_temp.cat('Rent'), pg_temp.rev(pg_temp.cat('Rent')), p_amount => 160000);
select results_eq(
  format('select pg_temp.expected(%1$L, 1), pg_temp.expected(%1$L, 2)', pg_temp.cat('Rent')),
  $$values (150000::bigint, 160000::bigint)$$,
  'R-VERSION-002 R-VERSION-005: an edit applies from the current period; the past period keeps its expectation'
);
select public.update_category(pg_temp.cat('Rent'), pg_temp.rev(pg_temp.cat('Rent')), p_amount => 170000);
select results_eq(
  format('select effective_from_seq, amount from public.category_expectations where category_id = %L order by 1', pg_temp.cat('Rent')),
  $$values (1, 150000::bigint), (2, 170000::bigint)$$,
  'R-VERSION-006: a second edit in the same period replaces the first'
);
select public.update_category(pg_temp.cat('Rent'), pg_temp.rev(pg_temp.cat('Rent')), p_cadence => 'yearly');
select is((select amount from public.category_expectations where category_id = pg_temp.cat('Rent') and effective_from_seq = 2),
  170000::bigint, 'R-CATEGORY-003: changing only the cadence keeps the amount entered');
select public.update_category(pg_temp.cat('Rent'), pg_temp.rev(pg_temp.cat('Rent')), p_amount => 155000, p_cadence => 'monthly',
  p_from_period_id => pg_temp.p(1));
select results_eq(
  format('select pg_temp.expected(%1$L, 1), pg_temp.expected(%1$L, 2)', pg_temp.cat('Rent')),
  $$values (155000::bigint, 14167::bigint)$$,
  'R-VERSION-070 R-VERSION-012: a correction from the earlier period applies until the next existing change'
);
select throws_ok(
  format('select public.update_category(%L, %s, p_amount => 1, p_from_period_id => %L)', pg_temp.cat('Food'), pg_temp.rev(pg_temp.cat('Food')), pg_temp.p(1)),
  'P0001', 'invalid_period', 'R-VERSION-070: a correction cannot start before the category does');
select throws_ok(
  format('select public.update_category(%L, %s, p_from_period_id => %L)', pg_temp.cat('Food'), pg_temp.rev(pg_temp.cat('Food')), pg_temp.p(2)),
  'P0001', 'invalid_period', 'R-VERSION-070: a period without an expectation change is refused');
select public.update_category(pg_temp.cat('Rent'), pg_temp.rev(pg_temp.cat('Rent')), p_name => 'Flat');
select results_eq(
  format('select name, amount from public.category_overview where id = %L', pg_temp.cat('Flat')),
  $$values ('Flat', 170000::bigint)$$,
  'R-CATEGORY-001: renaming leaves the expectation alone'
);

-- ===========================================================================
-- Subcategories: two levels, the first one makes a group, the move to "Other"
-- ===========================================================================
select public.create_category(tests.id('b'), 'Insurance', p_amount => 30000, p_from_period_id => pg_temp.p(1));
select tests.remember('ins_tx', (select id from public.add_transaction(tests.id('b'), 'expense', 25000, '2026-10-01', pg_temp.cat('Insurance'))));
select throws_ok(format('select public.create_category(%L, %L, %L, 1000)', tests.id('b'), 'Car', pg_temp.cat('Insurance')),
  'P0001', 'other_name_required',
  'R-CATEGORY-092: adding the first subcategory to a category with an expectation or transactions needs a name for "Other"');
select is(pg_temp.total(1), 185000::bigint, 'setup: period 1 expects Flat (155 000) and Insurance (30 000)');
insert into vals select 'p1_expected', expected_total from public.period_summaries where id = pg_temp.p(1);
insert into vals select 'p1_spent', spent_total from public.period_summaries where id = pg_temp.p(1);
select public.create_category(tests.id('b'), 'Car', pg_temp.cat('Insurance'), 12000, p_other_name => ' Other ');
select results_eq(
  format($$select name, is_group, first_seq, amount from public.category_overview
           where id = %1$L or parent_id = %1$L order by is_group desc, name$$, pg_temp.cat('Insurance')),
  $$values ('Insurance', true, 1, null::bigint), ('Car', false, 2, 12000::bigint), ('Other', false, 1, 30000::bigint)$$,
  'R-CATEGORY-090 R-CATEGORY-092: the category is now a group; its expectation moved to "Other", from the same period'
);
select is((select category_id from public.transactions where id = tests.id('ins_tx')), pg_temp.cat('Other'),
  'R-CATEGORY-092 R-TRANSACTION-072: its transactions moved to "Other": none is left on the group');
select results_eq(
  format('select expected_total, spent_total from public.period_summaries where id = %L', pg_temp.p(1)),
  'select (select v from vals where name = ''p1_expected''), (select v from vals where name = ''p1_spent'')',
  'R-CATEGORY-092: the closed period''s expected and spent totals did not change'
);
select is((select monthly_amount from public.category_overview where id = pg_temp.cat('Insurance')), 42000::bigint,
  'R-CATEGORY-090: a group''s monthly amount adds up its subcategories');
select is(pg_temp.expected(pg_temp.cat('Insurance'), 2), 42000::bigint,
  'R-CATEGORY-090 R-PROGRESS-070: and so does its expected amount in a period');
select throws_ok(format('select public.create_category(%L, %L, %L)', tests.id('b'), 'Deeper', pg_temp.cat('Car')),
  'P0001', 'invalid_parent', 'R-CATEGORY-001: a subcategory cannot have subcategories');
select throws_ok(format('select public.update_category(%L, %s, p_amount => 1)', pg_temp.cat('Insurance'), pg_temp.rev(pg_temp.cat('Insurance'))),
  'P0001', 'category_is_group', 'R-CATEGORY-002 R-CATEGORY-090: a group has no expectation of its own');
select throws_ok(format('select public.create_category(%L, %L, %L, p_from_period_id => %L)', tests.id('b'), 'Early', pg_temp.cat('Food'), pg_temp.p(1)),
  'P0001', 'invalid_period', 'R-CATEGORY-093: a subcategory cannot start before its group');
select public.create_category(tests.id('b'), 'Health', pg_temp.cat('Insurance'), 20000);
select is((select count(*)::integer from public.categories where parent_id = pg_temp.cat('Insurance') and name = 'Other'), 1,
  'R-CATEGORY-092: a later subcategory creates no second "Other"');

-- A category with nothing to move becomes a group without "Other".
select public.create_category(tests.id('b'), 'Leisure');
select public.create_category(tests.id('b'), 'Cinema', pg_temp.cat('Leisure'), 3000);
select results_eq(
  format('select name from public.categories where parent_id = %L', pg_temp.cat('Leisure')),
  $$values ('Cinema')$$,
  'R-CATEGORY-092: a category with no transactions and a zero expectation gets no "Other"'
);
select is((select count(*)::integer from public.category_expectations where category_id = pg_temp.cat('Leisure')), 0,
  'R-CATEGORY-090: a group keeps no expectation rows');
select is(public.end_category(pg_temp.cat('Cinema'), pg_temp.rev(pg_temp.cat('Cinema'))), 'deleted',
  'R-CATEGORY-073: an unused subcategory created this period is deleted');
select results_eq(
  format('select is_group, monthly_amount from public.category_overview where id = %L', pg_temp.cat('Leisure')),
  $$values (true, 0::bigint)$$,
  'R-CATEGORY-090: a group stays a group when its subcategories are gone'
);

-- Direct shape violations are caught at commit.
select tests.clear_authentication();
select throws_ok(
  format($$insert into public.categories (budget_id, parent_id, is_group, name, first_seq) values (%L, %L, true, 'X', 2)$$,
         tests.id('b'), pg_temp.cat('Insurance')),
  '23514', null, 'R-CATEGORY-001: the schema refuses a third level');
savepoint shape;
insert into public.category_expectations (category_id, budget_id, effective_from_seq, amount)
values (pg_temp.cat('Insurance'), tests.id('b'), 2, 1);
select throws_like('set constraints all immediate', '%group_has_expectation%',
  'R-CATEGORY-002 R-CATEGORY-090: a group never holds an expectation (checked at commit)');
rollback to savepoint shape;
set constraints all deferred;
savepoint shape;
update public.transactions set category_id = pg_temp.cat('Insurance') where id = tests.id('ins_tx');
select throws_like('set constraints all immediate', '%group_has_transaction%',
  'R-TRANSACTION-072: a group never holds a transaction (checked at commit)');
rollback to savepoint shape;
set constraints all deferred;
savepoint shape;
update public.categories set first_seq = 1 where id = pg_temp.cat('Car');
update public.categories set end_seq = 2 where id = pg_temp.cat('Insurance');
select throws_like('set constraints all immediate', '%outside_parent_validity%',
  'R-CATEGORY-093 R-CATEGORY-095: a subcategory is never in force outside its group (checked at commit)');
rollback to savepoint shape;
set constraints all deferred;
select tests.authenticate_as('alice');

-- ===========================================================================
-- Ending and deleting
-- ===========================================================================
select is(public.end_category(pg_temp.cat('Flat'), pg_temp.rev(pg_temp.cat('Flat'))), 'ended',
  'R-CATEGORY-072: a category that counted in a past period is ended, not deleted');
select results_eq(
  format('select first_seq, end_seq, is_active from public.category_overview where id = %L', pg_temp.cat('Flat')),
  $$values (1, 2, false)$$,
  'R-CATEGORY-072: from the current period'
);
select results_eq(
  format('select pg_temp.expected(%1$L, 1), pg_temp.expected(%1$L, 2)', pg_temp.cat('Flat')),
  $$values (155000::bigint, null::bigint)$$,
  'R-CATEGORY-072: past periods keep it'
);
select throws_ok(format('select public.end_category(%L, %s)', pg_temp.cat('Flat'), pg_temp.rev(pg_temp.cat('Flat'))),
  'P0001', 'category_ended', 'R-CATEGORY-072: an ended category cannot be ended again');
select throws_ok(format('select public.update_category(%L, %s, p_amount => 1)', pg_temp.cat('Flat'), pg_temp.rev(pg_temp.cat('Flat'))),
  'P0001', 'category_ended', 'R-VERSION-002: nor edited from now on');

select public.add_transaction(tests.id('b'), 'expense', 4500, '2026-11-02', pg_temp.cat('Food'));
select is(public.end_category(pg_temp.cat('Food'), pg_temp.rev(pg_temp.cat('Food'))), 'ended',
  'R-CATEGORY-072: a category with transactions is ended, even when it started this period');
select results_eq(
  format('select first_seq, end_seq from public.categories where id = %L', pg_temp.cat('Food')),
  $$values (2, 2)$$,
  'R-CATEGORY-095: it is kept, never in force, for its transactions'
);
select results_eq(
  format('select in_force, expected, spent from public.get_period_progress(%L) where category_id = %L', pg_temp.p(2), pg_temp.cat('Food')),
  $$values (false, 0::bigint, 4500::bigint)$$,
  'R-CATEGORY-095 R-PROGRESS-091: its transactions still count in their period'
);

-- Ending a group ends its subcategories; a correction from an earlier period.
select is(public.end_category(pg_temp.cat('Insurance'), pg_temp.rev(pg_temp.cat('Insurance'))), 'ended',
  'R-CATEGORY-095: ending a group');
select results_eq(
  format('select name, first_seq, end_seq from public.categories where id = %1$L or parent_id = %1$L order by name', pg_temp.cat('Insurance')),
  $$values ('Insurance', 1, 2), ('Other', 1, 2)$$,
  'R-CATEGORY-095 R-CATEGORY-073: ends its subcategories with it; the unused new ones are deleted'
);
select public.create_category(tests.id('b'), 'Gifts', p_amount => 5000, p_from_period_id => pg_temp.p(1));
select is(public.end_category(pg_temp.cat('Gifts'), pg_temp.rev(pg_temp.cat('Gifts')), pg_temp.p(1)), 'deleted',
  'R-CATEGORY-073 R-VERSION-070: removed from the period it started in, as a correction, without transactions: deleted');

-- ===========================================================================
-- Ordering
-- ===========================================================================
select public.create_category(tests.id('b'), n) from unnest(array['A1', 'A2', 'A3']) as n;
insert into vals values ('a1_rev', pg_temp.rev(pg_temp.cat('A1')));
select public.reorder_categories(tests.id('b'),
  array(select id from public.categories where budget_id = tests.id('b') and parent_id is null and end_seq is null
        order by case name when 'A3' then 0 when 'A1' then 1 else 2 end, name));
select results_eq(
  format($$select name from public.category_overview where budget_id = %L and name like 'A_' order by sort_order$$, tests.id('b')),
  $$values ('A3'), ('A1'), ('A2')$$,
  'R-CATEGORY-096: categories are reordered among their siblings'
);
select is(pg_temp.rev(pg_temp.cat('A1'))::bigint, (select v from vals where name = 'a1_rev'), 'R-CATEGORY-096: reordering is not an edit of the category');
select throws_ok(
  format('select public.reorder_categories(%L, array[%L]::uuid[])', tests.id('b'), pg_temp.cat('A1')),
  'P0001', 'record_changed', 'R-CATEGORY-096: a list that is not exactly the current siblings is refused');
select throws_ok(
  format('select public.reorder_categories(%L, array[%L, %L]::uuid[] || array(select id from public.categories where budget_id = %L and parent_id is null and end_seq is null))',
         tests.id('b'), pg_temp.cat('A1'), pg_temp.cat('A1'), tests.id('b')),
  'P0001', 'record_changed', 'R-CATEGORY-096: so is one with duplicates');

-- ===========================================================================
-- Limits
-- ===========================================================================
select tests.clear_authentication();
insert into public.categories (budget_id, name, first_seq)
select tests.id('b'), 'Filler ' || g, 2
from generate_series(1, 200 - (select count(*)::integer from public.categories where budget_id = tests.id('b') and end_seq is null)) as g;
insert into public.category_expectations (category_id, budget_id, effective_from_seq, amount)
select id, budget_id, 2, 0 from public.categories where budget_id = tests.id('b') and name like 'Filler %';
select tests.authenticate_as('alice');
select is((select count(*)::integer from public.categories where budget_id = tests.id('b') and end_seq is null), 200, 'setup: 200 categories in force');
select throws_ok(format('select public.create_category(%L, %L)', tests.id('b'), 'One too many'),
  'P0001', 'category_limit_reached', 'R-CATEGORY-094: at most 200 categories in force per budget');

select lives_ok('set constraints all immediate', 'R-CATEGORY-001 R-CATEGORY-090: every invariant holds');
set constraints all deferred;
select is_empty(format('select * from tests.period_violations(%L)', tests.id('b')), 'R-VERSION-011: nothing keyed beyond the latest period');

select * from finish();
rollback;
