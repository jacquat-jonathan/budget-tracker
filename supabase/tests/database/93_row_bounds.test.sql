-- No read returns more rows than the API delivers in one response (1000, max_rows) without
-- paging (R-APP-170, D-264): the kinds the list reads return one row each of are bounded at
-- 900 rows per budget, void rows included; the comparison by category returns one row per
-- line; the periods, the transactions and a debt's history are paged; preview_reopen lists at
-- most 1000 rows.
begin;
select plan(23);

select tests.create_user('alice', 'Alice');
select tests.set_today('2026-11-16');
select tests.authenticate_as('alice');
-- 60 months of periods
select tests.remember('b', public.create_budget('Bounds', 'Salary', 600000, 25, 'nearest', '2021-12-01'));
select tests.remember('cat', (select id from public.create_category(tests.id('b'), 'Base', p_amount => 100,
  p_from_period_id => (select id from public.periods where budget_id = tests.id('b') and seq = 1))));
select tests.clear_authentication();

-- ===========================================================================
-- Rows per kind, void ones included
-- ===========================================================================
create temp table cur on commit drop as select max(seq) as seq from public.periods where budget_id = tests.id('b');
grant select on cur to authenticated;
insert into public.categories (budget_id, name, first_seq, end_seq)
select tests.id('b'), 'Void ' || g, 2, 2 from generate_series(1, 898) as g;
select tests.authenticate_as('alice');
select is((select count(*)::integer from public.categories where budget_id = tests.id('b')), 899, 'setup: 899 categories, 898 of them void');
select lives_ok(format('select public.create_category(%L, %L)', tests.id('b'), 'The 900th'),
  'R-APP-170: a budget may hold 900 categories, void ones included');
select throws_ok(format('select public.create_category(%L, %L)', tests.id('b'), 'The 901st'), 'P0001', 'category_limit_reached',
  'R-APP-170 R-CATEGORY-094: not 901, although void rows do not count towards the 500');
select cmp_ok((select count(*)::integer from public.category_overview where budget_id = tests.id('b')), '<=', 1000,
  'R-APP-170: so category_overview fits in one response');
select cmp_ok((select count(*)::integer from public.get_period_comparison(tests.id('b'))), '<=', 1000,
  'R-APP-170: and the side by side (a total row and one row per category)');
select cmp_ok((select count(*)::integer from public.get_category_trend(tests.id('b'), 24)), '<=', 1000,
  'R-APP-170: and the spending per category');
select cmp_ok((select count(*)::integer from public.get_period_progress((select id from public.periods where budget_id = tests.id('b') and seq = 2))), '<=', 1000,
  'R-APP-170: and a period''s progress');

select tests.clear_authentication();
insert into public.subscriptions (budget_id, name, first_seq, end_seq, charged_through)
select tests.id('b'), 'Void ' || g, 2, 2, '2022-01-01' from generate_series(1, 900) as g;
insert into public.debts (budget_id, name, principal, opened_on, first_seq, end_seq)
select tests.id('b'), 'Void ' || g, 100, '2022-01-01', 2, 2 from generate_series(1, 900) as g;
select tests.authenticate_as('alice');
select throws_ok(format('select public.create_subscription(%L, %L, 100, %L, %L, %L)', tests.id('b'), 'One more', 'monthly', tests.id('cat'), '2026-12-01'),
  'P0001', 'subscription_limit_reached', 'R-APP-170 R-SUBSCRIPTION-110: at most 900 subscriptions, void ones included');
select throws_ok(format('select public.create_debt(%L, %L, 100, %L, 10)', tests.id('b'), 'One more', tests.id('cat')),
  'P0001', 'debt_limit_reached', 'R-APP-170 R-DEBT-110: at most 900 debts, void ones included');
select tests.clear_authentication();
delete from public.subscriptions where budget_id = tests.id('b');
delete from public.debts where budget_id = tests.id('b');
select tests.authenticate_as('alice');

-- ===========================================================================
-- The spending per category: one row per line, the periods as aligned arrays
-- ===========================================================================
create temp table trend on commit drop as select * from public.get_period_trend(tests.id('b'), 24);
create temp table lines on commit drop as select * from public.get_category_trend(tests.id('b'), 24);
grant select on trend, lines to authenticated;
select is((select count(*)::integer from lines), (select count(distinct category_id)::integer from tests.category_trend_rows(tests.id('b'), 24)),
  'R-APP-170 R-COMPARE-070: one row per category line, never lines times periods');
select is((select count(distinct period_ids)::integer from lines), 1, 'R-COMPARE-070: every row carries the same period_ids');
select is((select period_ids from lines limit 1), (select array_agg(period_id order by seq) from trend),
  'R-COMPARE-070: they are get_period_trend''s periods with the same p_count, oldest first');
select is_empty($$select category_id from lines
                  where cardinality(in_force) <> 24 or cardinality(planned) <> 24 or cardinality(spent) <> 24
                     or cardinality(committed) <> 24 or cardinality(transaction_count) <> 24$$,
  'R-COMPARE-070: every figure array has one element per period');

-- ===========================================================================
-- Paged reads
-- ===========================================================================
select is((select count(*)::integer from public.list_periods(tests.id('b'), 25)), 25, 'R-APP-170: list_periods gives a page of periods');
select is((select array_agg(seq order by seq desc) from public.list_periods(tests.id('b'), 25)),
          (select array_agg(s order by s desc) from generate_series((select seq from cur) - 24, (select seq from cur)) as s),
  'R-APP-170: newest first');
select is((select count(*)::integer from (
             select * from public.list_periods(tests.id('b'), 25)
             union all select * from public.list_periods(tests.id('b'), 25, (select seq from cur) - 24)
             union all select * from public.list_periods(tests.id('b'), 25, (select seq from cur) - 49)) as x),
          (select count(*)::integer from public.periods where budget_id = tests.id('b')),
  'R-APP-170: page after page, before the last row''s seq, every period once');
select is((select row(s.id, s.spent_total, s.result)::text from public.list_periods(tests.id('b'), 1) as s),
          (select row(s.id, s.spent_total, s.result)::text from public.period_summaries as s where s.budget_id = tests.id('b') order by s.seq desc limit 1),
  'R-APP-170: its rows are period_summaries rows');
select throws_ok(format('select * from public.list_periods(%L, 201)', tests.id('b')), 'P0001', 'invalid_limit', 'R-APP-170: at most 200 periods a page');
select throws_ok(format('select * from public.list_transactions(%L, 201)', tests.id('b')), 'P0001', 'invalid_limit', 'R-APP-170: at most 200 transactions a page');
select throws_ok(format('select * from public.list_charges_awaiting_confirmation(%L, 201)', tests.id('b')), 'P0001', 'invalid_limit',
  'R-APP-170: at most 200 charges awaiting confirmation');
select tests.remember('debt', (select id from public.create_debt(tests.id('b'), 'Loan', 1000, tests.id('cat'), 10)));
select throws_ok(format('select * from public.get_debt_history(%L, 1001)', tests.id('debt')), 'P0001', 'invalid_limit',
  'R-APP-170: at most 1000 rows of a debt''s history a page');

-- ===========================================================================
-- preview_reopen: at most 1000 rows, the rest counted
-- ===========================================================================
select tests.clear_authentication();
delete from public.categories where budget_id = tests.id('b') and name like 'Void %';
insert into public.categories (budget_id, name, first_seq)
select tests.id('b'), 'Added ' || lpad(g::text, 4, '0'), (select seq from cur) from generate_series(1, 1100) as g;
create temp table impact on commit drop as
  select count(*)::integer as n from private.merge_impact(tests.id('b'), (select seq from cur), (select seq from cur) - 1);
grant select on impact to authenticated;
select tests.authenticate_as('alice');
select is((select count(*)::integer from public.preview_reopen(tests.id('b'))), 1000, 'R-APP-170: preview_reopen lists at most 1000 rows');
select is((select row(record_kind, record_id, record_name, change)::text from (
             select p.*, row_number() over () as rn from public.preview_reopen(tests.id('b')) as p) as x where rn = 1000),
          (select row('more', null::uuid, (n - 999)::text, 'more')::text from impact),
  'R-APP-170: the last says how many more changes there are');

select tests.clear_authentication();
select * from finish();
rollback;
