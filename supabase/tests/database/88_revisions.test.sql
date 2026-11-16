-- Revisions: every editable record carries one; an edit with a stale revision is refused with
-- record_changed. Step 2's RPCs take it as an optional argument (D-142); step 3's require it.
-- The real races (two sessions) are in 62_concurrent_edits.test.sql.
begin;
select plan(29);

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

-- ===========================================================================
-- The budget
-- ===========================================================================
select pg_temp.remember_rev('budget', (select revision from public.my_budgets where id = tests.id('b')));
select is(public.rename_budget(tests.id('b'), 'Home', pg_temp.r('budget')), pg_temp.r('budget') + 1,
  'R-CONCURRENCY-090: a rename with the revision read succeeds and returns the next revision');
select throws_ok(format('select public.rename_budget(%L, %L, %s)', tests.id('b'), 'Other', pg_temp.r('budget')),
  'P0001', 'record_changed', 'R-CONCURRENCY-070: a rename with the revision read before that change is refused');
select is((select name from public.budgets where id = tests.id('b')), 'Home', 'R-CONCURRENCY-070: and changes nothing');
select throws_ok(format('select public.set_budget_end_date(%L, %L, %s)', tests.id('b'), '2027-06-01', pg_temp.r('budget')),
  'P0001', 'record_changed', 'R-CONCURRENCY-070: so is setting the end date with a stale revision');
select lives_ok(format('select public.set_budget_end_date(%L, %L, %s)', tests.id('b'), '2027-06-01', pg_temp.r('budget') + 1),
  'R-CONCURRENCY-090: and it succeeds with the current one');
select lives_ok(format('select public.set_budget_end_date(%L, null)', tests.id('b')),
  'R-CONCURRENCY-090: step 2 callers that send no revision still work');
select pg_temp.remember_rev('budget', (select revision from public.my_budgets where id = tests.id('b')));
update public.budgets set name = 'Direct' where id = tests.id('b');
select is((select revision from public.my_budgets where id = tests.id('b')), pg_temp.r('budget') + 1,
  'R-CONCURRENCY-090: a direct rename (kept for the previous release) also raises the revision');
select public.set_primary_income(tests.id('side'));
select is((select revision from public.my_budgets where id = tests.id('b')), pg_temp.r('budget') + 2,
  'R-CONCURRENCY-090: so does switching the primary income');
select public.set_primary_income(tests.id('inc'));

-- ===========================================================================
-- Incomes
-- ===========================================================================
select pg_temp.remember_rev('inc', (select revision from public.income_overview where id = tests.id('inc')));
select lives_ok(format('select public.update_income_terms(%L, 510000, 25, %L, null, %s)', tests.id('inc'), 'nearest', pg_temp.r('inc')),
  'R-CONCURRENCY-090: new terms with the revision read');
select is((select revision from public.income_overview where id = tests.id('inc')), pg_temp.r('inc') + 1,
  'R-CONCURRENCY-090: a change of terms raises the income''s revision');
select throws_ok(format('select public.update_income_terms(%L, 520000, 25, %L, null, %s)', tests.id('inc'), 'nearest', pg_temp.r('inc')),
  'P0001', 'record_changed', 'R-CONCURRENCY-070: new terms based on what was read before are refused');
select is((select amount from public.income_overview where id = tests.id('inc')), 510000::bigint, 'R-CONCURRENCY-070: the first change stays');
select throws_ok(format('select public.rename_income(%L, %L, %s)', tests.id('inc'), 'Pay', pg_temp.r('inc')),
  'P0001', 'record_changed', 'R-CONCURRENCY-070: a stale rename of an income is refused');
select is(public.rename_income(tests.id('inc'), 'Pay', pg_temp.r('inc') + 1), pg_temp.r('inc') + 2,
  'R-CONCURRENCY-090: a current one returns the next revision');
select throws_ok(format('select public.remove_income(%L, null, %s)', tests.id('side'),
                        (select revision - 1 from public.income_overview where id = tests.id('side'))),
  'P0001', 'record_changed', 'R-CONCURRENCY-070: removing an income that changed since read is refused');
select lives_ok(format('select public.update_income_terms(%L, 530000, 25, %L)', tests.id('inc'), 'nearest'),
  'R-CONCURRENCY-090: step 2 callers that send no revision still work');

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
select public.reorder_categories(tests.id('b'), null, array[
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
select public.reopen_previous_period(tests.id('b'));
select throws_ok(format('select public.update_category(%L, %s, %L)', tests.id('fresh'), pg_temp.r('fresh'), 'Renamed'),
  'P0001', 'record_changed', 'R-CONCURRENCY-070 R-VERSION-011: a category re-keyed by a reopen has changed: an edit read before is refused');
select lives_ok(format('select public.update_category(%L, %s, %L)', tests.id('fresh'),
                       (select revision from public.category_overview where id = tests.id('fresh')), 'Renamed'),
  'R-CONCURRENCY-090: and succeeds after reading it again');

select * from finish();
rollback;
