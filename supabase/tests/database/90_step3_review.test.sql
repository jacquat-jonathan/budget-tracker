-- The step 3 database review's findings and the rules added for them: corrections on groups,
-- a transaction keeping its category, costs that depend on the budget's own rows, extending
-- and restoring categories, limits without void rows, overspending at equality, previews of
-- corrections, boundary operations naming their period, the "set by hand" mark, corrections in
-- an ended budget, and the registry contract.
-- Dates worked out by hand: pay day 25, nearest, today 15 Nov 2026, start July: period 1 is
-- 25 Jul - 24 Aug, 2 is 25 Aug - 24 Sep, 3 is 25 Sep - 25 Oct (25 Oct is a Sunday, paid
-- Monday 26), 4 is 26 Oct - 24 Nov (current).
begin;
select plan(51);

select tests.create_user('alice', 'Alice');
select tests.create_user('other', 'Other');
select tests.set_today('2026-11-15');
select tests.authenticate_as('alice');
select tests.remember('b', public.create_budget('B', 'Salary', 650000, 25, 'nearest', '2026-07-01'));

create or replace function pg_temp.p(n integer) returns uuid language sql as $$
  select id from public.periods where budget_id = tests.id('b') and seq = n
$$;
create or replace function pg_temp.cat(n text) returns uuid language sql as $$
  select id from public.categories where budget_id = tests.id('b') and name = n
$$;
create or replace function pg_temp.crev(c uuid) returns integer language sql as $$
  select revision from public.categories where id = c
$$;
create or replace function pg_temp.trev(t uuid) returns integer language sql as $$
  select revision from public.transactions where id = t
$$;
create or replace function pg_temp.expected(c uuid, n integer) returns bigint language sql as $$
  select expected from public.get_period_progress(pg_temp.p(n)) where category_id = c
$$;

select results_eq(
  format('select seq, start_date from public.periods where budget_id = %L order by seq', tests.id('b')),
  $$values (1, '2026-07-24'::date), (2, '2026-08-25'::date), (3, '2026-09-25'::date), (4, '2026-10-26'::date)$$,
  'setup: four periods, the fourth current (25 Jul 2026 is a Saturday: paid Friday 24)'
);

-- ===========================================================================
-- Finding 2: removing a group from an earlier period when a later subcategory has transactions
-- ===========================================================================
select public.create_category(tests.id('b'), 'Insurance', p_from_period_id => pg_temp.p(1));
select public.create_category(tests.id('b'), 'Health', pg_temp.cat('Insurance'), 30000, 'monthly', pg_temp.p(1), 'Other');
select public.create_category(tests.id('b'), 'Car', pg_temp.cat('Insurance'), 10000);
select public.add_transaction(tests.id('b'), 'expense', 500, '2026-11-10', pg_temp.cat('Car'));
select is(public.end_category(pg_temp.cat('Insurance'), pg_temp.crev(pg_temp.cat('Insurance')), pg_temp.p(2)), 'ended',
  'R-CATEGORY-095 R-VERSION-070: a group is removed from an earlier period although a later subcategory has transactions');
select results_eq(
  format('select name, first_seq, end_seq from public.categories where id = %1$L or parent_id = %1$L order by name', pg_temp.cat('Insurance')),
  $$values ('Car', 2, 2), ('Health', 1, 2), ('Insurance', 1, 2)$$,
  'R-CATEGORY-095: the later subcategory is kept void within the group, for its transaction'
);
select results_eq(
  format('select in_force, expected, spent from public.get_period_progress(%L) where category_id = %L', pg_temp.p(4), pg_temp.cat('Car')),
  $$values (false, 0::bigint, 500::bigint)$$,
  'R-PROGRESS-091: its transaction still counts where it is dated'
);
select lives_ok('set constraints all immediate', 'R-CATEGORY-095 R-SECURITY-007: and every shape rule holds at commit');
set constraints all deferred;

-- ===========================================================================
-- Finding 3: a transaction keeps its category in its period
-- ===========================================================================
select public.create_category(tests.id('b'), 'Food', p_amount => 50000, p_from_period_id => pg_temp.p(1));
select tests.remember('food_tx', (select id from public.add_transaction(tests.id('b'), 'expense', 3333, '2026-11-10', pg_temp.cat('Food'))));
select tests.remember('food_old', (select id from public.add_transaction(tests.id('b'), 'expense', 1111, '2026-10-01', pg_temp.cat('Food'))));
select public.end_category(pg_temp.cat('Food'), pg_temp.crev(pg_temp.cat('Food')));
select lives_ok(
  format($$select public.update_transaction(%L, %s, 'expense', 4444, '2026-11-12', %L, 'Edited')$$,
         tests.id('food_tx'), pg_temp.trev(tests.id('food_tx')), pg_temp.cat('Food')),
  'R-TRANSACTION-100: a transaction keeps its ended category while it stays in the same period (amount, date, description edited)');
-- A category only ever in force in period 4, removed there with a transaction: kept void.
select public.create_category(tests.id('b'), 'Brief', p_amount => 100);
select tests.remember('brief_tx', (select id from public.add_transaction(tests.id('b'), 'expense', 70, '2026-11-05', pg_temp.cat('Brief'))));
select public.end_category(pg_temp.cat('Brief'), pg_temp.crev(pg_temp.cat('Brief')));
select lives_ok(
  format($$select public.update_transaction(%L, %s, 'refund', 71, '2026-11-06', %L)$$,
         tests.id('brief_tx'), pg_temp.trev(tests.id('brief_tx')), pg_temp.cat('Brief')),
  'R-TRANSACTION-100: a transaction keeps a void category in its period');
select throws_ok(
  format($$select public.update_transaction(%L, %s, 'refund', 71, '2026-10-20', %L)$$,
         tests.id('brief_tx'), pg_temp.trev(tests.id('brief_tx')), pg_temp.cat('Brief')),
  'P0001', 'category_not_in_force', 'R-TRANSACTION-100 R-TRANSACTION-091: moved into another period, the category must be in force there');
select public.create_category(tests.id('b'), 'Late', p_amount => 100);
select throws_ok(
  format($$select public.update_transaction(%L, %s, 'expense', 1111, '2026-10-01', %L)$$,
         tests.id('food_old'), pg_temp.trev(tests.id('food_old')), pg_temp.cat('Late')),
  'P0001', 'category_not_in_force', 'R-TRANSACTION-091: a new category must be in force in the period of the date');
select lives_ok(
  format($$select public.update_transaction(%L, %s, 'expense', 1111, '2026-11-02', %L)$$,
         tests.id('food_old'), pg_temp.trev(tests.id('food_old')), pg_temp.cat('Late')),
  'R-TRANSACTION-091: and accepted when the new date is in a period where it is in force (the new date''s period is checked)');

-- ===========================================================================
-- Finding 4: the categories page reads this budget's rows only
-- ===========================================================================
select tests.clear_authentication();
select tests.authenticate_as('other');
select tests.remember('o', public.create_budget('O', 'Salary', 650000, 25, 'nearest', '2026-07-01'));
select tests.remember('o_cat', (select id from public.create_category(tests.id('o'), 'Big', p_from_period_id =>
  (select id from public.periods where budget_id = tests.id('o') and seq = 1))));
select tests.clear_authentication();
insert into public.transactions (budget_id, kind, amount, date, category_id)
select tests.id('o'), 'expense', 100, date '2026-07-25' + (g % 100), tests.id('o_cat') from generate_series(1, 3000) as g;
analyze public.transactions;
select tests.authenticate_as('alice');
create temp table scans (step text, seq_tup_read bigint) on commit drop;
grant insert, select on scans to authenticated;
set local enable_seqscan = off;
insert into scans select 'before', seq_tup_read from pg_stat_xact_user_tables where relid = 'public.transactions'::regclass;
select count(*) from public.category_overview where budget_id = tests.id('b');
select public.end_category(pg_temp.cat('Late'), pg_temp.crev(pg_temp.cat('Late')));
insert into scans select 'after', seq_tup_read from pg_stat_xact_user_tables where relid = 'public.transactions'::regclass;
reset enable_seqscan;
select is(
  (select max(seq_tup_read) filter (where step = 'after') - max(seq_tup_read) filter (where step = 'before') from scans), 0::bigint,
  'R-CATEGORY-102: listing and removing categories read no other budget''s transactions (no sequential scan of the table)');

-- ===========================================================================
-- Finding 5: count from an earlier period, and restore
-- ===========================================================================
select public.create_category(tests.id('b'), 'Rent', p_amount => 150000);
select throws_ok(format($$select public.add_transaction(%L, 'expense', 1, '2026-10-01', %L)$$, tests.id('b'), pg_temp.cat('Rent')),
  'P0001', 'category_not_in_force', 'setup: a category added now does not count in period 3');
select results_eq(
  format('select first_seq, amount from public.extend_category(%L, %s, %L)', pg_temp.cat('Rent'), pg_temp.crev(pg_temp.cat('Rent')), pg_temp.p(2)),
  $$values (2, 150000::bigint)$$,
  'R-CATEGORY-100: a category is made to count from an earlier period, as a correction');
select results_eq(
  format('select pg_temp.expected(%1$L, 1), pg_temp.expected(%1$L, 2), pg_temp.expected(%1$L, 3)', pg_temp.cat('Rent')),
  $$values (null::bigint, 150000::bigint, 150000::bigint)$$,
  'R-CATEGORY-100: with its earliest expectation from that period on');
select lives_ok(format($$select public.add_transaction(%L, 'expense', 1, '2026-10-01', %L)$$, tests.id('b'), pg_temp.cat('Rent')),
  'R-CATEGORY-100: and takes back-dated transactions there');
select results_eq(
  format('select first_seq from public.extend_category(%L, %s, %L, 90000)', pg_temp.cat('Rent'), pg_temp.crev(pg_temp.cat('Rent')), pg_temp.p(1)),
  $$values (1)$$, 'R-CATEGORY-100: further back, with its own amount there');
select is(pg_temp.expected(pg_temp.cat('Rent'), 1), 90000::bigint, 'R-CATEGORY-100: the amount given applies until the next change');
select throws_ok(format('select public.extend_category(%L, %s, %L)', pg_temp.cat('Rent'), pg_temp.crev(pg_temp.cat('Rent')), pg_temp.p(3)),
  'P0001', 'invalid_period', 'R-CATEGORY-100: only to an earlier period than its first');
select public.create_category(tests.id('b'), 'Home', p_from_period_id => pg_temp.p(3));
select public.create_category(tests.id('b'), 'Repairs', pg_temp.cat('Home'), 2000, 'monthly', pg_temp.p(3));
select throws_ok(format('select public.extend_category(%L, %s, %L)', pg_temp.cat('Repairs'), pg_temp.crev(pg_temp.cat('Repairs')), pg_temp.p(2)),
  'P0001', 'invalid_period', 'R-CATEGORY-100 R-CATEGORY-093: a subcategory never before its group');
select throws_ok(format('select public.extend_category(%L, %s, %L, 5)', pg_temp.cat('Home'), pg_temp.crev(pg_temp.cat('Home')), pg_temp.p(2)),
  'P0001', 'category_is_group', 'R-CATEGORY-100 R-CATEGORY-090: a group takes no amount');
select lives_ok(format('select public.extend_category(%L, %s, %L)', pg_temp.cat('Home'), pg_temp.crev(pg_temp.cat('Home')), pg_temp.p(2)),
  'R-CATEGORY-100: a group is extended on its own');

-- Restore
select public.create_category(tests.id('b'), 'Gym', p_amount => 6000, p_from_period_id => pg_temp.p(1));
select public.end_category(pg_temp.cat('Gym'), pg_temp.crev(pg_temp.cat('Gym')), pg_temp.p(2));
create temp table closed (what text primary key, v text) on commit drop;
grant select, insert, update on closed to authenticated;
create or replace function pg_temp.closed_totals() returns text language sql as $$
  select md5(string_agg(row(seq, expected_total, spent_total)::text, ',' order by seq))
  from public.period_summaries where budget_id = tests.id('b') and seq < 4
$$;
insert into closed values ('before', pg_temp.closed_totals());
select results_eq(
  format('select first_seq, end_seq, amount from public.restore_category(%L, %s)', pg_temp.cat('Gym'), pg_temp.crev(pg_temp.cat('Gym'))),
  $$values (1, null::integer, 6000::bigint)$$,
  'R-CATEGORY-101: an ended category is restored from the current period');
select results_eq(
  format('select pg_temp.expected(%1$L, 1), pg_temp.expected(%1$L, 2), pg_temp.expected(%1$L, 3), pg_temp.expected(%1$L, 4)', pg_temp.cat('Gym')),
  $$values (6000::bigint, 0::bigint, 0::bigint, 6000::bigint)$$,
  'R-CATEGORY-101: expecting nothing in the periods between its end and now');
select is(pg_temp.closed_totals(), (select v from closed where what = 'before'),
  'R-CATEGORY-101: so restoring from now changes no closed period''s totals');
select public.end_category(pg_temp.cat('Gym'), pg_temp.crev(pg_temp.cat('Gym')), pg_temp.p(2));
select results_eq(
  format('select end_seq from public.restore_category(%L, %s, %L)', pg_temp.cat('Gym'), pg_temp.crev(pg_temp.cat('Gym')), pg_temp.p(2)),
  $$values (null::integer)$$,
  'R-CATEGORY-101: or, as a correction, from the period it ended');
select results_eq(
  format('select pg_temp.expected(%1$L, 2), pg_temp.expected(%1$L, 3)', pg_temp.cat('Gym')),
  $$values (6000::bigint, 6000::bigint)$$,
  'R-CATEGORY-101: as if it had never ended');
select throws_ok(format('select public.restore_category(%L, %s)', pg_temp.cat('Gym'), pg_temp.crev(pg_temp.cat('Gym'))),
  'P0001', 'category_not_ended', 'R-CATEGORY-101: only an ended category is restored');
select public.end_category(pg_temp.cat('Gym'), pg_temp.crev(pg_temp.cat('Gym')), pg_temp.p(3));
select throws_ok(format('select public.restore_category(%L, %s, %L)', pg_temp.cat('Gym'), pg_temp.crev(pg_temp.cat('Gym')), pg_temp.p(2)),
  'P0001', 'invalid_period', 'R-CATEGORY-101: a correction restores from the period it ended, no other');
select throws_ok(format('select public.restore_category(%L, %s)', pg_temp.cat('Health'), pg_temp.crev(pg_temp.cat('Health'))),
  'P0001', 'category_ended', 'R-CATEGORY-101 R-CATEGORY-093: a subcategory needs its group in force');
select lives_ok('set constraints all immediate', 'R-CATEGORY-100 R-CATEGORY-101: every shape rule holds');
set constraints all deferred;

-- ===========================================================================
-- Limits without void rows; overspending at equality; removal_deletes
-- ===========================================================================
select tests.clear_authentication();
insert into public.categories (budget_id, name, first_seq, end_seq)
select tests.id('b'), 'Void ' || g, 4, 4 from generate_series(1, 300) as g;
insert into public.categories (budget_id, name, first_seq, end_seq)
select tests.id('b'), 'Ended ' || g, 1, 2
from generate_series(1, 500 - (select count(*)::integer from public.categories
                               where budget_id = tests.id('b') and (end_seq is null or end_seq > first_seq))) as g;
insert into public.category_expectations (category_id, budget_id, effective_from_seq, amount)
select id, budget_id, first_seq, 0 from public.categories
where budget_id = tests.id('b') and (name like 'Void %' or name like 'Ended %');
select tests.authenticate_as('alice');
select throws_ok(format('select public.create_category(%L, %L)', tests.id('b'), 'One too many'),
  'P0001', 'category_limit_reached', 'R-CATEGORY-094: at most 500 categories in all, void rows not counted');
select throws_ok(format('select public.restore_category(%L, %s)', pg_temp.cat('Void 1'), pg_temp.crev(pg_temp.cat('Void 1'))),
  'P0001', 'category_limit_reached', 'R-CATEGORY-094: restoring a void row counts too');
select tests.clear_authentication();
delete from public.categories where budget_id = tests.id('b') and name like 'Ended %';
select tests.authenticate_as('alice');
select lives_ok(format('select public.create_category(%L, %L)', tests.id('b'), 'Room again'),
  'R-CATEGORY-094: the 300 void rows left do not count');

select public.create_category(tests.id('b'), 'Exact', p_amount => 1000);
select public.add_transaction(tests.id('b'), 'expense', 1000, '2026-11-03', pg_temp.cat('Exact'));
select results_eq(
  format('select expected, spent, result, is_overspent from public.get_period_progress(%L) where category_id = %L', pg_temp.p(4), pg_temp.cat('Exact')),
  $$values (1000::bigint, 1000::bigint, 0::bigint, false)$$,
  'R-PROGRESS-071: spending exactly the expectation is not overspending');
select results_eq(
  format($$select name, removal_deletes from public.category_overview where id in (%L, %L, %L) order by name$$,
         pg_temp.cat('Exact'), pg_temp.cat('Rent'), pg_temp.cat('Repairs')),
  $$values ('Exact', false), ('Rent', false), ('Repairs', false)$$,
  'R-CATEGORY-072: one with transactions, or one that counted in a past period, would be ended (removal_deletes false)');
select public.create_category(tests.id('b'), 'Fresh');
select is((select removal_deletes from public.category_overview where id = pg_temp.cat('Fresh')), true,
  'R-CATEGORY-073: an unused one added this period would be deleted (removal_deletes true)');

-- ===========================================================================
-- The periods must keep covering the transactions (checked at commit)
-- ===========================================================================
select tests.clear_authentication();
set constraints all immediate;
set constraints all deferred;
savepoint cover;
update public.periods set end_date = '2026-11-02' where id = pg_temp.p(4);
select throws_like('set constraints all immediate', '%transaction_outside_periods%',
  'R-TRANSACTION-093: shortening the latest period below a transaction''s date is refused at commit');
rollback to savepoint cover;
set constraints all deferred;
select tests.authenticate_as('alice');

-- ===========================================================================
-- Previews take the write's arguments, corrections included
-- ===========================================================================
select tests.remember('inc', (select primary_income_id from public.budgets where id = tests.id('b')));
select public.update_income(tests.id('inc'), (select revision from public.incomes where id = tests.id('inc')), p_pay_day => 25);
select results_eq(
  format('select end_date from public.preview_update_income(%L, p_pay_day => 5, p_from_period_id => %L)', tests.id('inc'), pg_temp.p(2)),
  $$values ('2026-11-24'::date)$$,
  'R-PERIOD-036: a correction shadowed by a later version would leave the end as it is, and the preview says so');
select public.update_income(tests.id('inc'), (select revision from public.incomes where id = tests.id('inc')),
  p_pay_day => 5, p_from_period_id => pg_temp.p(2), p_previewed_end_date => '2026-11-24');
select is((select end_date from public.periods where id = pg_temp.p(4)), '2026-11-24'::date,
  'R-PERIOD-036: and the write does exactly that');

-- ===========================================================================
-- Boundary operations name their period; the "set by hand" mark
-- ===========================================================================
select throws_ok(format('select public.set_expected_pay_date(%L, %L, %s, %L)', tests.id('b'), pg_temp.p(3),
                        (select revision from public.periods where id = pg_temp.p(3)), '2026-11-30'),
  'P0001', 'record_changed', 'R-CONCURRENCY-100: a boundary operation on a period that is no longer the current one is refused');
select throws_ok(format('select public.move_period_start(%L, %s, %L)', pg_temp.p(4),
                        (select revision from public.periods where id = pg_temp.p(4)) - 1, '2026-10-28'),
  'P0001', 'record_changed', 'R-CONCURRENCY-100: and so is one on a period that changed since read');
select public.move_period_start(pg_temp.p(4), (select revision from public.periods where id = pg_temp.p(4)), '2026-10-28');
select is((select end_is_manual from public.periods where id = pg_temp.p(3)), true, 'R-PERIOD-014: a moved boundary is marked as set by hand');
select public.move_period_start(pg_temp.p(4), (select revision from public.periods where id = pg_temp.p(4)), '2026-10-26');
select results_eq(
  format('select end_date, end_is_manual from public.periods where id = %L', pg_temp.p(3)),
  $$values ('2026-10-25'::date, false)$$,
  'R-PERIOD-100: moved back to where the schedule puts it, it is no longer marked');
select public.move_period_start(pg_temp.p(4), (select revision from public.periods where id = pg_temp.p(4)), '2026-10-29');
select public.move_period_start(pg_temp.p(4), (select revision from public.periods where id = pg_temp.p(4)));
select results_eq(
  format('select end_date, end_is_manual from public.periods where id = %L', pg_temp.p(3)),
  $$values ('2026-10-25'::date, false)$$,
  'R-PERIOD-100: without a date, the boundary goes back to the schedule');

-- ===========================================================================
-- Corrections in an ended budget
-- ===========================================================================
select tests.clear_authentication();
select tests.set_today('2026-10-10');
select tests.authenticate_as('alice');
select tests.remember('e', public.create_budget('Ended', 'Salary', 500000, 25, 'nearest', '2026-09-01', '2026-10-01'));
select tests.clear_authentication();
select tests.set_today('2026-11-15');
select tests.authenticate_as('alice');
select throws_ok(format('select public.create_category(%L, %L)', tests.id('e'), 'Now'),
  'P0001', 'budget_ended', 'R-CATEGORY-093: an ended budget has no current period to create a category from');
select lives_ok(format('select public.create_category(%L, %L, p_from_period_id => %L)', tests.id('e'), 'Then',
                       (select id from public.periods where budget_id = tests.id('e'))),
  'R-CATEGORY-093: but takes a category created as a correction from one of its periods, like the other corrections');

-- ===========================================================================
-- The registry contract
-- ===========================================================================
select tests.clear_authentication();
create table public.tst_strict (id uuid primary key, budget_id uuid, name text, first_seq integer, end_seq integer,
  check (end_seq is null or end_seq > first_seq));
select throws_like(
  $$insert into private.period_keyed_tables (table_name, kind, record_kind, name_column) values ('public.tst_strict', 'validity', 'strict', 'name')$$,
  'period_keyed_table_invalid%end_seq = first_seq%',
  'R-VERSION-100: a validity table whose checks refuse a void row is refused when it registers');
create table public.tst_ok (id uuid primary key, budget_id uuid, name text, first_seq integer, end_seq integer,
  check (end_seq is null or end_seq >= first_seq));
insert into private.period_keyed_tables (table_name, kind, record_kind, name_column) values ('public.tst_ok', 'validity', 'ok', 'name');
create table public.tst_loose (id uuid primary key, budget_id uuid, item_id uuid, effective_from_seq integer,
  unique (item_id, effective_from_seq));
select throws_like(
  $$insert into private.period_keyed_tables (table_name, kind, record_kind, entity_column, entity_table) values ('public.tst_loose', 'version', 'ok', 'item_id', 'public.tst_ok')$$,
  'period_keyed_table_invalid%foreign key%',
  'R-VERSION-100: a version table without a foreign key to its entity is refused when it registers');
create table public.tst_tied (id uuid primary key, budget_id uuid, item_id uuid references public.tst_ok, effective_from_seq integer,
  unique (item_id, effective_from_seq));
select lives_ok(
  $$insert into private.period_keyed_tables (table_name, kind, record_kind, entity_column, entity_table) values ('public.tst_tied', 'version', 'ok', 'item_id', 'public.tst_ok')$$,
  'R-VERSION-100: one that provides everything registers');
delete from private.period_keyed_tables where table_name in ('public.tst_tied'::regclass, 'public.tst_ok'::regclass);
drop table public.tst_tied, public.tst_loose, public.tst_ok, public.tst_strict;

select lives_ok('set constraints all immediate', 'R-CATEGORY-090 R-TRANSACTION-093: every invariant holds');
set constraints all deferred;
select is_empty(format('select * from tests.period_violations(%L)', tests.id('b')), 'R-VERSION-011: nothing keyed beyond the latest period');

select * from finish();
rollback;
