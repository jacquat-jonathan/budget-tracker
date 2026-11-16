-- Transactions: fields and kinds, the period of a date (first and last days, back-dating,
-- boundary operations), ended categories, extra incomes, limits, who recorded it, paging.
-- Dates worked out by hand: pay day 25, nearest, today 15 Nov 2026, start September:
-- period 1 is 25 Sep - 25 Oct, period 2 is 26 Oct - 24 Nov (current).
begin;
select plan(56);

select tests.create_user('alice', 'Alice');
select tests.create_user('bob', 'Bob');
select tests.set_today('2026-11-15');
select tests.authenticate_as('alice');
select tests.remember('b', public.create_budget('B', 'Salary', 500000, 25, 'nearest', '2026-09-01'));
select tests.remember('inv', public.invite_member(tests.id('b'), tests.get_user_email('bob')));
select tests.authenticate_as('bob');
select public.accept_invitation(tests.id('inv'));
select tests.authenticate_as('alice');

create or replace function pg_temp.p(n integer) returns uuid language sql as $$
  select id from public.periods where budget_id = tests.id('b') and seq = n
$$;
create or replace function pg_temp.cat(n text) returns uuid language sql as $$
  select id from public.categories where budget_id = tests.id('b') and name = n
$$;
create or replace function pg_temp.rev(t uuid) returns integer language sql as $$
  select revision from public.transactions where id = t
$$;
create or replace function pg_temp.add(amount bigint, d date, c text, kind text default 'expense') returns uuid language sql as $$
  select id from public.add_transaction(tests.id('b'), kind::public.transaction_kind, amount, d, pg_temp.cat(c))
$$;
create or replace function pg_temp.period_of(t uuid) returns integer language sql as $$
  select p.seq from public.transaction_list as l join public.periods as p on p.id = l.period_id where l.id = t
$$;
create or replace function pg_temp.spent(c text, n integer) returns bigint language sql as $$
  select spent from public.get_period_progress(pg_temp.p(n)) where category_id = pg_temp.cat(c)
$$;

select public.create_category(tests.id('b'), 'Food', p_amount => 50000, p_from_period_id => pg_temp.p(1));
select public.create_category(tests.id('b'), 'Home', p_amount => 0, p_from_period_id => pg_temp.p(1));
select public.create_category(tests.id('b'), 'Repairs', pg_temp.cat('Home'), 20000, 'monthly', pg_temp.p(1));
select public.create_category(tests.id('b'), 'New', p_amount => 1000);

-- ===========================================================================
-- Fields and kinds
-- ===========================================================================
select results_eq(
  format($$select kind, amount, date, category_name, description, recorded_by, recorded_by_name, revision
           from public.add_transaction(%L, 'expense', 1250, '2026-11-03', %L, '  Market  ')$$, tests.id('b'), pg_temp.cat('Food')),
  format($$values ('expense'::public.transaction_kind, 1250::bigint, '2026-11-03'::date, 'Food', 'Market', %L::uuid, 'Alice', 1)$$,
         tests.get_user_id('alice')),
  'R-TRANSACTION-001 R-TRANSACTION-002 R-TRANSACTION-095: an expense with a positive amount, a date, a category, a trimmed description and who recorded it'
);
select is((select description from public.add_transaction(tests.id('b'), 'expense', 1, '2026-11-03', pg_temp.cat('Food'), '   ')), null,
  'R-TRANSACTION-002: the description is optional; a blank one is none');
select throws_ok(format($$select public.add_transaction(%L, 'expense', 1, '2026-11-03', %L, %L)$$, tests.id('b'), pg_temp.cat('Food'), repeat('x', 501)),
  'P0001', 'invalid_description', 'R-TRANSACTION-094: a description is at most 500 characters');
select throws_ok(format($$select public.add_transaction(%L, 'expense', 0, '2026-11-03', %L)$$, tests.id('b'), pg_temp.cat('Food')),
  'P0001', 'invalid_amount', 'R-TRANSACTION-001: the amount is positive');
select throws_ok(format($$select public.add_transaction(%L, 'refund', -5, '2026-11-03', %L)$$, tests.id('b'), pg_temp.cat('Food')),
  'P0001', 'invalid_amount', 'R-TRANSACTION-001: also for a refund');
select throws_ok(format($$select public.add_transaction(%L, 'expense', 1000000001, '2026-11-03', %L)$$, tests.id('b'), pg_temp.cat('Food')),
  'P0001', 'invalid_amount', 'R-TRANSACTION-094: at most CHF 10 million');
select throws_ok(format($$select public.add_transaction(%L, null, 1, '2026-11-03', %L)$$, tests.id('b'), pg_temp.cat('Food')),
  'P0001', 'invalid_kind', 'R-TRANSACTION-070: the kind is required');
select throws_ok(format($$select public.add_transaction(%L, 'expense', 1, '2026-11-03')$$, tests.id('b')),
  'P0001', 'category_required', 'R-TRANSACTION-001: an expense needs a category');
select throws_ok(format($$select public.add_transaction(%L, 'expense', 1, '2026-11-03', %L)$$, tests.id('b'), pg_temp.cat('Home')),
  'P0001', 'category_is_group', 'R-TRANSACTION-072: never on a category that has subcategories');
select lives_ok(format($$select public.add_transaction(%L, 'expense', 1, '2026-11-03', %L)$$, tests.id('b'), pg_temp.cat('Repairs')),
  'R-TRANSACTION-072: but on one of its subcategories');
select lives_ok(format($$select public.add_transaction(%L, 'expense', 900000000, '2026-11-04', %L)$$, tests.id('b'), pg_temp.cat('New')),
  'R-TRANSACTION-073: never refused for going over the expectation');
select results_eq(
  format('select expected, spent, is_overspent from public.get_period_progress(%L) where category_id = %L', pg_temp.p(2), pg_temp.cat('New')),
  $$values (1000::bigint, 900000000::bigint, true)$$,
  'R-TRANSACTION-073 R-PROGRESS-071: and the category shows as overspent'
);

-- Refunds and extra incomes
select tests.remember('refund', pg_temp.add(250, '2026-11-05', 'Food', 'refund'));
select is(pg_temp.spent('Food', 2), (1250 + 1 - 250)::bigint, 'R-TRANSACTION-070 R-TRANSACTION-071: a refund reduces what was spent in its category');
select throws_ok(format($$select public.add_transaction(%L, 'extra_income', 1, '2026-11-03', %L)$$, tests.id('b'), pg_temp.cat('Food')),
  'P0001', 'invalid_category', 'R-TRANSACTION-092: an extra income has no category');
select tests.remember('gift', (select id from public.add_transaction(tests.id('b'), 'extra_income', 7000, '2026-11-06', p_description => 'Gift')));
select results_eq(
  format('select income_total, salary_total, extra_income_total, spent_total from public.period_summaries where id = %L', pg_temp.p(2)),
  $$values (507000::bigint, 500000::bigint, 7000::bigint, (1250 + 1 + 1 + 900000000 - 250)::bigint)$$,
  'R-TRANSACTION-092 R-PERIOD-018: an extra income adds to the income total of its period and to nothing else'
);
select is((select count(*)::integer from public.get_period_progress(pg_temp.p(2)) where category_id is null), 0,
  'R-TRANSACTION-092: it is in no category');

-- ===========================================================================
-- The period of a date
-- ===========================================================================
select tests.remember('first_day', pg_temp.add(100, '2026-09-25', 'Food'));
select tests.remember('last_day_1', pg_temp.add(200, '2026-10-25', 'Food'));
select tests.remember('first_day_2', pg_temp.add(300, '2026-10-26', 'Food'));
select tests.remember('today', pg_temp.add(400, '2026-11-15', 'Food'));
select results_eq(
  format('select pg_temp.period_of(%L), pg_temp.period_of(%L), pg_temp.period_of(%L), pg_temp.period_of(%L)',
         tests.id('first_day'), tests.id('last_day_1'), tests.id('first_day_2'), tests.id('today')),
  $$values (1, 1, 2, 2)$$,
  'R-TRANSACTION-006 R-TRANSACTION-007: each lands in the period containing its date, first and last days included; back-dated ones in the past period'
);
select is(pg_temp.spent('Food', 1), 300::bigint, 'R-TRANSACTION-007: and counts there');
select throws_ok(format($$select public.add_transaction(%L, 'expense', 1, '2026-09-24', %L)$$, tests.id('b'), pg_temp.cat('Food')),
  'P0001', 'date_outside_periods', 'R-TRANSACTION-090: not before the first period starts');
select throws_ok(format($$select public.add_transaction(%L, 'expense', 1, '2026-11-16', %L)$$, tests.id('b'), pg_temp.cat('Food')),
  'P0001', 'date_outside_periods', 'R-TRANSACTION-090: not after today, even within the current period');
select throws_ok(format($$select public.add_transaction(%L, 'expense', 1, 'infinity', %L)$$, tests.id('b'), pg_temp.cat('Food')),
  'P0001', 'invalid_date', 'R-TRANSACTION-090: not an infinite date');
select throws_ok(format($$select public.add_transaction(%L, 'expense', 1, null, %L)$$, tests.id('b'), pg_temp.cat('Food')),
  'P0001', 'invalid_date', 'R-TRANSACTION-001: the date is required');
select throws_ok(format($$select public.add_transaction(%L, 'expense', 1, '2026-10-01', %L)$$, tests.id('b'), pg_temp.cat('New')),
  'P0001', 'category_not_in_force', 'R-TRANSACTION-091: not on a category that was not in force in the period of its date');

-- Editing and deleting in a past period
select results_eq(
  format($$select amount, date, category_name, description from public.update_transaction(%L, %s, 'expense', 222, '2026-10-02', %L, 'Late receipt')$$,
         tests.id('last_day_1'), pg_temp.rev(tests.id('last_day_1')), pg_temp.cat('Repairs')),
  $$values (222::bigint, '2026-10-02'::date, 'Repairs', 'Late receipt')$$,
  'R-TRANSACTION-008: a transaction of a past period can be edited freely'
);
select results_eq(
  format('select pg_temp.spent(%L, 1), pg_temp.spent(%L, 1)', 'Food', 'Repairs'),
  $$values (100::bigint, 222::bigint)$$,
  'R-TRANSACTION-008: what was spent follows the edit'
);
select lives_ok(format('select public.delete_transaction(%L, %s)', tests.id('first_day'), pg_temp.rev(tests.id('first_day'))),
  'R-TRANSACTION-008: and deleted');
select is(pg_temp.spent('Food', 1), 0::bigint, 'R-TRANSACTION-008: nothing is left in Food in period 1');
select throws_ok(format('select public.delete_transaction(%L, 1)', tests.id('first_day')),
  'P0001', 'transaction_not_found', 'R-SECURITY-004: a deleted transaction is not found');
select throws_ok(format($$select public.update_transaction(%L, %s, 'expense', 1, '2026-11-01')$$, tests.id('today'), pg_temp.rev(tests.id('today'))),
  'P0001', 'category_required', 'R-TRANSACTION-001: an edit replaces every field: the category is required');

-- Ended categories (Q-053)
select public.create_category(tests.id('b'), 'Old', p_amount => 1000, p_from_period_id => pg_temp.p(1));
select public.end_category(pg_temp.cat('Old'), (select revision from public.categories where id = pg_temp.cat('Old')));
select lives_ok(format($$select public.add_transaction(%L, 'expense', 10, '2026-10-10', %L)$$, tests.id('b'), pg_temp.cat('Old')),
  'R-TRANSACTION-091: an ended category takes a back-dated transaction in a period where it was in force');
select throws_ok(format($$select public.add_transaction(%L, 'expense', 10, '2026-11-10', %L)$$, tests.id('b'), pg_temp.cat('Old')),
  'P0001', 'category_not_in_force', 'R-TRANSACTION-091: but not one dated after it ended');
select results_eq(
  format($$select name, parent_name from public.list_categories_for_date(%L, '2026-10-10') order by display_order$$, tests.id('b')),
  $$values ('Food', null::text), ('Repairs', 'Home'), ('Old', null)$$,
  'R-TRANSACTION-091: the leaves a transaction on a date may use, in display order'
);
select results_eq(
  format($$select name from public.list_categories_for_date(%L, '2026-11-10') order by display_order$$, tests.id('b')),
  $$values ('Food'), ('Repairs'), ('New')$$,
  'R-TRANSACTION-091: on a date in the current period, without the ended one'
);
select throws_ok(format($$select public.list_categories_for_date(%L, '2026-11-20')$$, tests.id('b')),
  'P0001', 'date_outside_periods', 'R-TRANSACTION-090: and the same date rule');

-- ===========================================================================
-- Boundary operations: transactions follow their date
-- ===========================================================================
select tests.remember('oct27', pg_temp.add(500, '2026-10-27', 'Food'));
select tests.remember('nov14', pg_temp.add(600, '2026-11-14', 'Food'));
select public.move_period_start(pg_temp.p(2), '2026-10-28');
select is(pg_temp.period_of(tests.id('oct27')), 1, 'R-TRANSACTION-093: moving a boundary moves a transaction into the period now containing its date');
select is(pg_temp.spent('Food', 1), 800::bigint, 'R-TRANSACTION-093: and it counts there, with the one of 26 Oct');
select public.move_period_start(pg_temp.p(2), '2026-10-26');
select is(pg_temp.period_of(tests.id('oct27')), 2, 'R-TRANSACTION-093: moving it back moves it back');
select public.record_early_pay_date(tests.id('b'), '2026-11-14');
select is(pg_temp.period_of(tests.id('nov14')), 3, 'R-TRANSACTION-093: an early salary starts a period that takes the transactions from that day on');
select public.reopen_previous_period(tests.id('b'));
select is(pg_temp.period_of(tests.id('nov14')), 2, 'R-TRANSACTION-093: reopening the previous period takes them back');
select is_empty(format('select * from tests.period_violations(%L)', tests.id('b')),
  'R-TRANSACTION-093: no transaction is outside every period');
select tests.clear_authentication();
savepoint outside;
update public.transactions set date = '2026-09-01' where id = tests.id('oct27');
select throws_like('set constraints all immediate', '%transaction_outside_periods%',
  'R-TRANSACTION-093: the schema refuses a transaction outside every period (checked at commit)');
rollback to savepoint outside;
set constraints all deferred;
select tests.authenticate_as('alice');

-- A budget that has ended: no date after its last period.
select tests.clear_authentication();
select tests.set_today('2026-10-10');
select tests.authenticate_as('alice');
select tests.remember('e', public.create_budget('Ended', 'Salary', 500000, 25, 'nearest', '2026-09-01', '2026-10-01'));
select public.create_category(tests.id('e'), 'Food');
select tests.clear_authentication();
select tests.set_today('2026-11-15');
select tests.authenticate_as('alice');
select throws_ok(
  format($$select public.add_transaction(%L, 'expense', 1, '2026-11-01', (select id from public.categories where budget_id = %1$L))$$, tests.id('e')),
  'P0001', 'date_outside_periods', 'R-TRANSACTION-090: in an ended budget, nothing after its last period');
select lives_ok(
  format($$select public.add_transaction(%L, 'expense', 1, '2026-10-01', (select id from public.categories where budget_id = %1$L))$$, tests.id('e')),
  'R-TRANSACTION-008: but its past periods still take transactions');

-- ===========================================================================
-- Limit
-- ===========================================================================
select tests.clear_authentication();
create or replace function private.limit_transactions() returns integer language sql immutable set search_path = '' as $$ select 3 $$;
select tests.authenticate_as('alice');
select tests.remember('l', public.create_budget('Limit', 'Salary', 500000, 25));
select public.create_category(tests.id('l'), 'Food');
select public.add_transaction(tests.id('l'), 'expense', 1, '2026-11-01', (select id from public.categories where budget_id = tests.id('l')))
from generate_series(1, 3);
select throws_ok(
  format($$select public.add_transaction(%L, 'extra_income', 1, '2026-11-01')$$, tests.id('l')),
  'P0001', 'transaction_limit_reached', 'R-TRANSACTION-094: a budget holds a bounded number of transactions (200 000; lowered here)');
select tests.clear_authentication();
create or replace function private.limit_transactions() returns integer language sql immutable set search_path = '' as $$ select 200000 $$;

-- ===========================================================================
-- Who recorded it
-- ===========================================================================
select tests.authenticate_as('bob');
select tests.remember('bobs', pg_temp.add(700, '2026-11-07', 'Food'));
select tests.authenticate_as('alice');
select is((select recorded_by_name from public.transaction_list where id = tests.id('bobs')), 'Bob',
  'R-TRANSACTION-095: each transaction says who recorded it');
select public.update_transaction(tests.id('bobs'), pg_temp.rev(tests.id('bobs')), 'expense', 701, '2026-11-07', pg_temp.cat('Food'));
select is((select recorded_by from public.transactions where id = tests.id('bobs')), tests.get_user_id('bob'),
  'R-TRANSACTION-095: an edit by another member keeps who recorded it');
select tests.authenticate_as('bob');
select public.leave_budget(tests.id('b'));
select tests.authenticate_as('alice');
select is((select recorded_by_name from public.transaction_list where id = tests.id('bobs')), 'Bob',
  'R-TRANSACTION-095 R-PROFILE-004: a former member keeps their name on what they recorded');

-- ===========================================================================
-- Paging and filters
-- ===========================================================================
select tests.clear_authentication();
insert into public.transactions (budget_id, kind, amount, date, category_id, recorded_by, created_at)
select tests.id('b'), 'expense', g, date '2026-10-01' + (g % 30), pg_temp.cat(case when g % 3 = 0 then 'Repairs' else 'Food' end),
       tests.get_user_id('alice'), now() - (g % 4) * interval '1 minute'
from generate_series(1, 230) as g;
select tests.authenticate_as('alice');
create temp table pages (page integer, n integer, id uuid, date date, created_at timestamptz) on commit drop;
do $$
declare
  v_page integer := 0;
  v_last record;
  v_rows integer;
begin
  loop
    v_page := v_page + 1;
    if v_last is null then
      insert into pages select v_page, row_number() over (), l.id, l.date, l.created_at
      from public.list_transactions(tests.id('b'), 37) as l;
    else
      insert into pages select v_page, row_number() over (), l.id, l.date, l.created_at
      from public.list_transactions(tests.id('b'), 37, p_before_date => v_last.date,
                                    p_before_created_at => v_last.created_at, p_before_id => v_last.id) as l;
    end if;
    get diagnostics v_rows = row_count;
    exit when v_rows < 37 or v_page > 50;
    select p.* into v_last from pages as p where p.page = v_page order by p.n desc limit 1;
  end loop;
end;
$$;
select results_eq(
  'select id from pages order by page, n',
  format('select id from public.transactions where budget_id = %L order by date desc, created_at desc, id desc', tests.id('b')),
  'R-TRANSACTION-095: paging by the cursor returns every transaction once, in the stable order (date, then created_at, then id, newest first)'
);
select is((select max(n) from pages), 37, 'R-TRANSACTION-095: pages hold the requested number of rows');
select results_eq(
  format($$select count(*)::integer from public.list_transactions(%L, 200, p_category_id => %L)$$, tests.id('b'), pg_temp.cat('Home')),
  format('select count(*)::integer from public.transactions where category_id = %L', pg_temp.cat('Repairs')),
  'R-TRANSACTION-095: filtering by a category with subcategories lists theirs'
);
select results_eq(
  format($$select count(*)::integer from public.list_transactions(%L, 200, p_from_date => '2026-10-05', p_to_date => '2026-10-06', p_kind => 'expense')$$, tests.id('b')),
  format($$select count(*)::integer from public.transactions where budget_id = %L and date between '2026-10-05' and '2026-10-06' and kind = 'expense'$$, tests.id('b')),
  'R-TRANSACTION-095: filtering by dates and kind'
);
select is(
  (select count(*)::integer from public.list_transactions(tests.id('b'), 200, p_kind => 'extra_income')), 1,
  'R-TRANSACTION-092: extra incomes can be listed on their own');
select throws_ok(format('select public.list_transactions(%L, 201)', tests.id('b')),
  'P0001', 'invalid_limit', 'R-TRANSACTION-095: at most 200 rows per page');
select throws_ok(format('select public.list_transactions(%L, 0)', tests.id('b')),
  'P0001', 'invalid_limit', 'R-TRANSACTION-095: at least one');
select throws_ok(format($$select public.list_transactions(%L, 10, p_before_date => '2026-10-01')$$, tests.id('b')),
  'P0001', 'invalid_cursor', 'R-TRANSACTION-095: a cursor has all three parts');

select lives_ok('set constraints all immediate', 'R-TRANSACTION-072 R-TRANSACTION-093: every invariant holds');
set constraints all deferred;

select * from finish();
rollback;
