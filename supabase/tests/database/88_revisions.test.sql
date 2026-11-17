-- Revisions: every editable record carries one; every edit and removal requires the revision
-- the client read and is refused with record_changed when it is stale (D-150). The real races
-- (two sessions) are in 62_concurrent_edits.test.sql.
begin;
select plan(36);

select tests.create_user('alice', 'Alice');
select tests.set_today('2026-11-15');
select tests.authenticate_as('alice');
select tests.remember('b', public.create_budget('B', 'Salary', 500000, 25, 'nearest', '2026-09-01'));
select tests.remember('inc', (select primary_income_id from public.budgets where id = tests.id('b')));
select tests.remember('side', public.add_income(tests.id('b'), 'Side', 10000, 1));

create temp table seen (name text primary key, v integer) on commit drop;
create or replace function pg_temp.remember_rev(n text, v integer) returns void language sql as $$
  insert into seen values (n, v) on conflict (name) do update set v = excluded.v
$$;
create or replace function pg_temp.r(n text) returns integer language sql as $$ select v from seen where name = n $$;
create or replace function pg_temp.brev() returns integer language sql as $$
  select revision from public.my_budgets where id = tests.id('b')
$$;
create or replace function pg_temp.irev(i uuid) returns integer language sql as $$
  select revision from public.income_overview where id = i
$$;

-- ===========================================================================
-- The budget
-- ===========================================================================
select pg_temp.remember_rev('budget', pg_temp.brev());
select is(public.rename_budget(tests.id('b'), 'Home', pg_temp.r('budget')), pg_temp.r('budget') + 1,
  'R-CONCURRENCY-090: a rename with the revision read succeeds and returns the next revision');
select throws_ok(format('select public.rename_budget(%L, %L, %s)', tests.id('b'), 'Other', pg_temp.r('budget')),
  'P0001', 'record_changed', 'R-CONCURRENCY-070: a rename with the revision read before that change is refused');
select is((select name from public.budgets where id = tests.id('b')), 'Home', 'R-CONCURRENCY-070: and changes nothing');
select throws_ok(format('select public.set_budget_end_date(%L, %s, %L)', tests.id('b'), pg_temp.r('budget'), '2027-06-01'),
  'P0001', 'record_changed', 'R-CONCURRENCY-070: so is setting the end date with a stale revision');
select lives_ok(format('select public.set_budget_end_date(%L, %s, %L)', tests.id('b'), pg_temp.r('budget') + 1, '2027-06-01'),
  'R-CONCURRENCY-090: and it succeeds with the current one');
select throws_ok(format('select public.set_budget_end_date(%L, null)', tests.id('b')),
  'P0001', 'invalid_revision', 'R-CONCURRENCY-090: the revision is required');
select lives_ok(format('select public.set_budget_end_date(%L, %s)', tests.id('b'), pg_temp.brev()),
  'setup: clear the end date');
select pg_temp.remember_rev('budget', pg_temp.brev());
select throws_ok(format('select public.set_primary_income(%L, %s)', tests.id('side'), pg_temp.r('budget') - 1),
  'P0001', 'record_changed', 'R-CONCURRENCY-070: switching the primary income with a stale budget revision is refused');
select throws_ok(format('select public.set_primary_income(%L, null)', tests.id('side')),
  'P0001', 'invalid_revision', 'R-CONCURRENCY-090: switching the primary income requires the budget''s revision');
select lives_ok(format('select public.set_primary_income(%L, %s)', tests.id('side'), pg_temp.r('budget')),
  'R-CONCURRENCY-090: and succeeds with the current one');
select is(pg_temp.brev(), pg_temp.r('budget') + 1, 'R-CONCURRENCY-090: switching the primary income raises the budget''s revision');
select public.set_primary_income(tests.id('inc'), pg_temp.brev());

-- ===========================================================================
-- Incomes: one edit for name and terms
-- ===========================================================================
select pg_temp.remember_rev('inc', pg_temp.irev(tests.id('inc')));
select is(public.update_income(tests.id('inc'), pg_temp.r('inc'), 'Pay', 510000), pg_temp.r('inc') + 1,
  'R-CONCURRENCY-090 R-INCOME-100: one edit renames and changes the terms, and returns the next revision');
select results_eq(
  format('select name, amount, pay_day, weekend_rule::text from public.income_overview where id = %L', tests.id('inc')),
  $$values ('Pay', 510000::bigint, 25, 'nearest')$$,
  'R-INCOME-100: the terms not given keep their value');
select throws_ok(format('select public.update_income(%L, %s, p_amount => 520000)', tests.id('inc'), pg_temp.r('inc')),
  'P0001', 'record_changed', 'R-CONCURRENCY-070: new terms based on what was read before are refused');
select is((select amount from public.income_overview where id = tests.id('inc')), 510000::bigint, 'R-CONCURRENCY-070: the first change stays');
select throws_ok(format('select public.update_income(%L, %s, %L)', tests.id('inc'), pg_temp.r('inc'), 'Wage'),
  'P0001', 'record_changed', 'R-CONCURRENCY-070: a stale rename of an income is refused');
select is(public.update_income(tests.id('inc'), pg_temp.r('inc') + 1, 'Wage'), pg_temp.r('inc') + 2,
  'R-CONCURRENCY-090: a rename alone raises the revision too');
select throws_ok(format('select public.update_income(%L, null, p_amount => 1000)', tests.id('inc')),
  'P0001', 'invalid_revision', 'R-CONCURRENCY-090: an income edit requires the revision');
select throws_ok(format('select public.remove_income(%L, %s)', tests.id('side'), pg_temp.irev(tests.id('side')) - 1),
  'P0001', 'record_changed', 'R-CONCURRENCY-070: removing an income that changed since read is refused');
select throws_ok(format('select public.remove_income(%L, null)', tests.id('side')),
  'P0001', 'invalid_revision', 'R-CONCURRENCY-090: removing an income requires the revision');
select throws_ok(format('select public.update_income(%L, %s, p_from_period_id => (select id from public.periods where budget_id = %L and seq = 1))',
                        tests.id('inc'), pg_temp.irev(tests.id('inc')), tests.id('b')),
  'P0001', 'invalid_period', 'R-INCOME-100: a correction period without new terms is refused');

-- A write paired with a preview is refused when the preview no longer holds.
select tests.remember('prev_period', (select period_id from public.preview_update_income(tests.id('inc'), p_pay_day => 5)));
select throws_ok(format('select public.update_income(%L, %s, p_pay_day => 5, p_previewed_end_date => %L)',
                        tests.id('inc'), pg_temp.irev(tests.id('inc')), '2026-12-31'),
  'P0001', 'record_changed', 'R-PERIOD-036 R-CONCURRENCY-100: a write whose result differs from the preview the user saw is refused');
select lives_ok(format('select public.update_income(%L, %s, p_pay_day => 5, p_previewed_end_date => %L)',
                       tests.id('inc'), pg_temp.irev(tests.id('inc')),
                       (select end_date from public.preview_update_income(tests.id('inc'), p_pay_day => 5))),
  'R-PERIOD-036: and accepted when it is what the preview showed');

-- ===========================================================================
-- Categories
-- ===========================================================================
select tests.remember('food', (select id from public.create_category(tests.id('b'), 'Food', p_amount => 1000, p_from_period_id =>
  (select id from public.periods where budget_id = tests.id('b') and seq = 1))));
select pg_temp.remember_rev('food', (select revision from public.category_overview where id = tests.id('food')));
select is((select revision from public.update_category(tests.id('food'), pg_temp.r('food'), p_amount => 2000)), pg_temp.r('food') + 1,
  'R-CONCURRENCY-090: an expectation change raises the category''s revision');
select throws_ok(format('select public.update_category(%L, %s, p_amount => 3000)', tests.id('food'), pg_temp.r('food')),
  'P0001', 'record_changed', 'R-CONCURRENCY-070: a change based on what was read before is refused');
select throws_ok(format('select public.update_category(%L, %s, %L)', tests.id('food'), pg_temp.r('food'), 'Groceries'),
  'P0001', 'record_changed', 'R-CONCURRENCY-070: so is a rename');
select throws_ok(format('select public.end_category(%L, %s)', tests.id('food'), pg_temp.r('food')),
  'P0001', 'record_changed', 'R-CONCURRENCY-070: and removing it');
select is((select amount from public.category_overview where id = tests.id('food')), 2000::bigint, 'R-CONCURRENCY-070: the first change stays');
select public.create_category(tests.id('b'), 'Rent');
select pg_temp.remember_rev('food', (select revision from public.category_overview where id = tests.id('food')));
select public.reorder_categories(tests.id('b'), array[
  (select id from public.categories where budget_id = tests.id('b') and name = 'Rent'), tests.id('food')]);
select is((select revision from public.category_overview where id = tests.id('food')), pg_temp.r('food'),
  'R-CONCURRENCY-090 R-CATEGORY-096: reordering does not count as a change of the category');

-- ===========================================================================
-- Transactions
-- ===========================================================================
select tests.remember('tx', (select id from public.add_transaction(tests.id('b'), 'expense', 100, '2026-11-01', tests.id('food'))));
select is((select revision from public.update_transaction(tests.id('tx'), 1, 'expense', 200, '2026-11-01', tests.id('food'))), 2,
  'R-CONCURRENCY-090: an edit with the revision read returns the next revision');
select throws_ok(format($$select public.update_transaction(%L, 1, 'expense', 300, '2026-11-01', %L)$$, tests.id('tx'), tests.id('food')),
  'P0001', 'record_changed', 'R-CONCURRENCY-070: an edit based on what was read before is refused');
select throws_ok(format('select public.delete_transaction(%L, 1)', tests.id('tx')),
  'P0001', 'record_changed', 'R-CONCURRENCY-070: so is deleting it');
select is((select amount from public.transactions where id = tests.id('tx')), 200::bigint, 'R-CONCURRENCY-070: the first edit stays');
select is((select revision from public.update_transaction(tests.id('tx'), 2, 'expense', 200, '2026-11-01', tests.id('food'))), 2,
  'R-CONCURRENCY-090: saving unchanged fields is not a change');

-- ===========================================================================
-- A merge changes the records it re-keys
-- ===========================================================================
select tests.clear_authentication();
select tests.set_today('2026-11-25');
select tests.authenticate_as('alice');
select public.ensure_periods(tests.id('b'));
select tests.remember('fresh', (select id from public.create_category(tests.id('b'), 'Fresh')));
select pg_temp.remember_rev('fresh', (select revision from public.category_overview where id = tests.id('fresh')));
select tests.clear_authentication();
select tests.set_today('2026-11-26');
select tests.authenticate_as('alice');
select tests.reopen_previous_period(tests.id('b'));
select throws_ok(format('select public.update_category(%L, %s, %L)', tests.id('fresh'), pg_temp.r('fresh'), 'Renamed'),
  'P0001', 'record_changed', 'R-CONCURRENCY-070 R-VERSION-011: a category re-keyed by a reopen has changed: an edit read before is refused');
select lives_ok(format('select public.update_category(%L, %s, %L)', tests.id('fresh'),
                       (select revision from public.category_overview where id = tests.id('fresh')), 'Renamed'),
  'R-CONCURRENCY-090: and succeeds after reading it again');

select * from finish();
rollback;
