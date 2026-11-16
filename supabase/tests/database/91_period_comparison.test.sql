-- Step 5, period comparison: the trend of the last periods, the spending per category across
-- them and two periods side by side, checked against period_summaries and get_period_progress
-- (the progress view they must never disagree with), with renamed, ended, restored, "Other"
-- and void categories, a reopen, an ended budget, short budgets and access.
begin;
select plan(56);

select tests.create_user('alice', 'Alice');
select tests.create_user('bob', 'Bob');
select tests.create_user('carol', 'Carol');
select tests.set_today('2026-01-10');

-- ===========================================================================
-- A budget with history: months of spending in several categories
-- ===========================================================================
select tests.authenticate_as('alice');
select tests.remember('b', public.create_budget('Compare', 'Salary', 600000, 25, 'nearest', '2025-09-01'));
select tests.remember('b_p1', (select id from public.periods where budget_id = tests.id('b') and seq = 1));
select tests.remember('food', (select id from public.create_category(tests.id('b'), 'Food', p_amount => 50000, p_from_period_id => tests.id('b_p1'))));
select tests.remember('old', (select id from public.create_category(tests.id('b'), 'Old name', p_amount => 10000, p_from_period_id => tests.id('b_p1'))));
select tests.remember('home', (select id from public.create_category(tests.id('b'), 'Home', p_amount => 20000, p_from_period_id => tests.id('b_p1'))));
select tests.remember('bills', (select id from public.create_subscription(tests.id('b'), 'Phone', 3000, 'monthly', tests.id('food'), '2025-09-05', tests.id('b_p1'))));
-- spending in every period so far, refunds and extra income too
select count(*) from (
  select public.add_transaction(tests.id('b'), 'expense', 1000 + 37 * g, p.start_date + 2, tests.id('food'))
  from public.periods as p cross join generate_series(1, 3) as g where p.budget_id = tests.id('b')) as x;
select count(*) from (
  select public.add_transaction(tests.id('b'), 'expense', 2500, p.start_date + 3, tests.id('old'))
  from public.periods as p where p.budget_id = tests.id('b')) as x;
select count(*) from (
  select public.add_transaction(tests.id('b'), 'expense', 4000, p.start_date + 1, tests.id('home'))
  from public.periods as p where p.budget_id = tests.id('b')) as x;
select public.add_transaction(tests.id('b'), 'refund', 700, private.today(), tests.id('food'));
select public.add_transaction(tests.id('b'), 'extra_income', 12345, private.today());
-- a rename (one line, under the new name), an end and a restore later
select public.update_category(tests.id('old'), (select revision from public.categories where id = tests.id('old')), 'Renamed');
-- the first subcategory of Home: its transactions move to "Other"
select tests.remember('garden', (select id from public.create_category(tests.id('b'), 'Garden', tests.id('home'), 5000,
  p_from_period_id => tests.id('b_p1'), p_other_name => 'Other')));
select tests.remember('other', (select id from public.categories where parent_id = tests.id('home') and name = 'Other'));
select public.add_transaction(tests.id('b'), 'expense', 1500, private.today(), tests.id('garden'));
-- end "Renamed" from period 3; a transaction of period 4 then stays on it (moved there before)
select public.end_category(tests.id('old'), (select revision from public.categories where id = tests.id('old')),
  (select id from public.periods where budget_id = tests.id('b') and seq = 3));
select tests.clear_authentication();
select tests.set_today('2026-03-12');
select tests.authenticate_as('alice');
select public.ensure_periods(tests.id('b'));
-- the lines while "Renamed" is ended, before its restore
create temp table ct_before on commit drop as select * from tests.category_trend_rows(tests.id('b'), 24);
grant select on ct_before to authenticated;
select public.restore_category(tests.id('old'), (select revision from public.categories where id = tests.id('old')));
select public.add_transaction(tests.id('b'), 'expense', 900, private.today(), tests.id('old'));
-- a void leftover: created and removed in the current period, with a transaction dated on it
select tests.remember('tmp', (select id from public.create_category(tests.id('b'), 'Temporary', p_amount => 100)));
select public.add_transaction(tests.id('b'), 'expense', 333, private.today(), tests.id('tmp'));
select public.end_category(tests.id('tmp'), (select revision from public.categories where id = tests.id('tmp')));
select is((select first_seq = end_seq from public.categories where id = tests.id('tmp')), true, 'setup: a void leftover category with a transaction');

create temp table cur_seq on commit drop as
  select seq from public.periods where budget_id = tests.id('b') and private.today() between start_date and end_date;
grant select on cur_seq to authenticated;

-- ===========================================================================
-- The trend (R-COMPARE-002, R-COMPARE-171, R-COMPARE-172, R-COMPARE-173)
-- ===========================================================================
select is((select count(*)::integer from public.get_period_trend(tests.id('b'))), (select seq from cur_seq),
  'R-COMPARE-171: a budget with fewer periods than asked gives all it has');
select is((select array_agg(seq order by seq) from public.get_period_trend(tests.id('b'), 3)),
          (select array_agg(s order by s) from generate_series((select seq from cur_seq) - 2, (select seq from cur_seq)) as s),
  'R-COMPARE-171: the last three periods, oldest first, up to the current one');
select is(
  (select array_agg(row(t.period_id, t.start_date, t.end_date, t.is_current, t.income_total, t.salary_total, t.extra_income_total,
                        t.spent_total, t.expected_total, t.committed_total, t.result)::text order by t.seq)
   from public.get_period_trend(tests.id('b'), 24) as t),
  (select array_agg(row(s.id, s.start_date, s.end_date, s.is_current, s.income_total, s.salary_total, s.extra_income_total,
                        s.spent_total, s.expected_total, s.committed_total, s.result)::text order by s.seq)
   from public.period_summaries as s where s.budget_id = tests.id('b')),
  'R-COMPARE-002: every figure of the trend is the period''s period_summaries row');
select is((select array_agg(row(is_current, is_completed)::text order by seq) filter (where is_current) from public.get_period_trend(tests.id('b'))),
          array[row(true, false)::text], 'R-COMPARE-171: the current period is included and marked as still running');
select is((select bool_and(is_completed) from public.get_period_trend(tests.id('b')) where not is_current), true,
  'R-COMPARE-172: the others are completed');
select is((select bool_and(days = end_date - start_date + 1) from public.get_period_trend(tests.id('b'))), true,
  'R-COMPARE-173: each period gives its number of days; amounts are not scaled');
select is(
  (select row(completed_count, average_income, average_spent, average_result)::text from public.get_period_trend(tests.id('b'), 4) limit 1),
  (select row(count(*)::integer, round(avg(income_total))::bigint, round(avg(spent_total))::bigint, round(avg(result))::bigint)::text
   from public.period_summaries where budget_id = tests.id('b') and end_date < private.today()
     and seq > (select seq from cur_seq) - 4),
  'R-COMPARE-172: the averages are over the completed periods of the range only, to the rappen');
select is((select count(distinct row(completed_count, average_income, average_spent, average_result))::integer from public.get_period_trend(tests.id('b'))), 1,
  'R-COMPARE-172: the same averages on every row');
-- on the last day of the current period it is still running
select tests.clear_authentication();
select tests.set_today((select end_date from public.periods where budget_id = tests.id('b') and seq = (select seq from cur_seq)));
select tests.authenticate_as('alice');
select is((select row(is_current, is_completed)::text from public.get_period_trend(tests.id('b')) where seq = (select seq from cur_seq)),
          row(true, false)::text, 'R-COMPARE-172: on its last day the current period is not yet completed');
select tests.clear_authentication();
select tests.set_today('2026-03-12');
select is((select private.compare_average(-5, 2)), -3::bigint, 'R-COMPARE-172: halves are rounded away from zero (-2.5 -> -3)');
select is((select private.compare_average(5, 2)), 3::bigint, 'R-COMPARE-172: (2.5 -> 3)');
select tests.authenticate_as('alice');
select throws_ok(format('select * from public.get_period_trend(%L, 0)', tests.id('b')), 'P0001', 'invalid_limit',
  'R-COMPARE-171: at least one period');
select throws_ok(format('select * from public.get_period_trend(%L, 25)', tests.id('b')), 'P0001', 'invalid_limit',
  'R-COMPARE-171: at most 24');

-- a new budget: one period, none completed
select tests.remember('n', public.create_budget('New', 'Salary', 100000, 25));
select is((select row(count(*), min(completed_count), min(average_spent), min(average_income), min(average_result))::text
           from public.get_period_trend(tests.id('n'), 6)),
          row(1, 0, null::bigint, null::bigint, null::bigint)::text,
  'R-COMPARE-172: with no completed period the averages are null, not a division error');
select is((select row(count(*), min(completed_count), min(average_spent))::text from public.get_category_trend(tests.id('n'))),
          row(0, null::integer, null::bigint)::text, 'R-COMPARE-070: a budget without categories has no lines');

-- ===========================================================================
-- Spending per category (R-COMPARE-070, R-COMPARE-170, R-COMPARE-174)
-- ===========================================================================
create temp table ct on commit drop as select * from tests.category_trend_rows(tests.id('b'), 24);
grant select on ct to authenticated;
select is(
  (select array_agg(x.s::bigint order by x.seq) from (select seq, sum(spent) as s from ct where parent_id is null group by seq) as x),
  (select array_agg(spent_total order by seq) from public.period_summaries where budget_id = tests.id('b')),
  'R-COMPARE-170: the top-level lines of each period add up to the trend''s spent, exactly');
select is(
  (select array_agg(x.s::bigint order by x.seq) from (select seq, sum(spent) as s from ct where not is_group group by seq) as x),
  (select array_agg(spent_total order by seq) from public.period_summaries where budget_id = tests.id('b')),
  'R-COMPARE-170: so do the leaves');
select is((select count(*)::integer from ct), (select count(distinct category_id) * count(distinct period_id) from ct)::integer,
  'R-COMPARE-070: every line has a row in every period of the range');
select is_empty(
  $$select g.category_id, p.seq from public.periods as p
    cross join lateral public.get_period_progress(p.id) as g
    left join ct on ct.category_id = g.category_id and ct.period_id = p.id
    where p.budget_id = tests.id('b')
      and (ct.category_id is null or ct.in_force <> g.in_force or ct.spent <> g.spent or ct.committed <> g.committed
           or ct.transaction_count <> g.transaction_count or ct.planned is distinct from case when g.in_force then g.expected end
           or ct.is_group <> g.is_group or ct.parent_id is distinct from g.parent_id)$$,
  'R-COMPARE-070: every progress row of every period is the line''s figure there');
select is_empty(
  $$select ct.category_id, ct.seq from ct
    where not exists (select 1 from public.get_period_progress(ct.period_id) as g where g.category_id = ct.category_id)
      and (ct.in_force or ct.planned is not null or ct.spent <> 0 or ct.committed <> 0 or ct.transaction_count <> 0)$$,
  'R-COMPARE-070: a period without a progress row for the line: not in force, nothing planned, nothing spent');
select is((select array_agg(distinct name) from ct where category_id = tests.id('old')), array['Renamed'],
  'R-COMPARE-174: a renamed category is one line under its current name');
select is((select array_agg(row(in_force, planned is null, spent > 0)::text order by seq) from ct_before
           where category_id = tests.id('old') and seq in (3, 4)),
          array[row(false, true, true)::text, row(false, true, true)::text],
  'R-COMPARE-070 R-COMPARE-174: while ended it is not in force, plans nothing, and still counts what was spent on it');
select is((select bool_and(in_force) from ct where category_id = tests.id('old') and seq = (select seq from cur_seq)), true,
  'R-COMPARE-174: restored, the same line is in force again');
select is((select row(parent_id, is_group, spent > 0)::text from ct where category_id = tests.id('other') and seq = 1),
          row(tests.id('home'), false, true)::text, 'R-COMPARE-070: "Other" is a line under its group');
select is((select bool_and(is_group) from ct where category_id = tests.id('home')), true, 'R-COMPARE-070: and the group is one line');
select is((select row(in_force, planned, spent)::text from ct where category_id = tests.id('tmp') and seq = (select seq from cur_seq)),
          row(false, null::bigint, 333)::text, 'R-COMPARE-070: a void leftover category is a line with what was spent on it');
select is((select count(distinct display_order)::integer from ct), (select count(distinct category_id)::integer from ct),
  'R-COMPARE-174: each line has one place across periods');
select is((select bool_and(o.ord = o.rn) from (select display_order as ord, dense_rank() over (order by display_order) as rn from ct) as o), true,
  'R-COMPARE-174: groups and their subcategories in display order');
select is_empty(
  $$select category_id from ct group by category_id
    having count(distinct average_spent) > 1
        or min(average_spent) is distinct from round(sum(spent) filter (where is_completed) / nullif(min(completed_count), 0))::bigint$$,
  'R-COMPARE-172: per line, the average spent over the completed periods of the range');

-- ===========================================================================
-- Two periods side by side (R-COMPARE-071, R-COMPARE-174)
-- ===========================================================================
create temp table cmp on commit drop as select * from public.get_period_comparison(tests.id('b'));
grant select on cmp to authenticated;
select is((select row(a_period_id, b_period_id)::text from cmp where kind = 'total'),
          (select row((select id from public.periods where budget_id = tests.id('b') and seq = s.seq - 1),
                      (select id from public.periods where budget_id = tests.id('b') and seq = s.seq))::text from cur_seq as s),
  'R-COMPARE-071: by default the current period and the one before');
select is((select kind from cmp limit 1), 'total', 'R-COMPARE-071: the totals come first');
select is(
  (select row(a_income, b_income, income_difference, a_spent, b_spent, spent_difference, a_result, b_result, result_difference,
              a_committed, b_committed, committed_difference, a_planned, b_planned)::text from cmp where kind = 'total'),
  (select row(a.income_total, b.income_total, b.income_total - a.income_total, a.spent_total, b.spent_total, b.spent_total - a.spent_total,
              a.result, b.result, b.result - a.result, a.committed_total, b.committed_total, b.committed_total - a.committed_total,
              a.expected_total, b.expected_total)::text
   from public.period_summaries as a, public.period_summaries as b
   where a.id = (select a_period_id from cmp where kind = 'total') and b.id = (select b_period_id from cmp where kind = 'total')),
  'R-COMPARE-071: the totals of each side are period_summaries, the differences B minus A');
select is_empty(
  $$select g.category_id from public.get_period_progress((select b_period_id from cmp where kind = 'total')) as g
    left join cmp on cmp.category_id = g.category_id
    where cmp.category_id is null or cmp.b_spent <> g.spent or cmp.b_in_force <> g.in_force
       or cmp.b_planned is distinct from case when g.in_force then g.expected end or cmp.b_committed <> g.committed$$,
  'R-COMPARE-071: side B is get_period_progress of B');
select is_empty(
  $$select g.category_id from public.get_period_progress((select a_period_id from cmp where kind = 'total')) as g
    left join cmp on cmp.category_id = g.category_id
    where cmp.category_id is null or cmp.a_spent <> g.spent or cmp.a_in_force <> g.in_force
       or cmp.a_planned is distinct from case when g.in_force then g.expected end or cmp.a_committed <> g.committed$$,
  'R-COMPARE-071: side A is get_period_progress of A');
select is((select row(a_in_force, a_spent, a_planned, b_spent, spent_difference)::text from cmp where category_id = tests.id('tmp')),
          row(false, null::bigint, null::bigint, 333, 333)::text,
  'R-COMPARE-174: a category only in B has nothing (null) on side A; the difference counts it as nothing spent');
select is((select bool_and(spent_difference = coalesce(b_spent, 0) - coalesce(a_spent, 0)) from cmp where kind = 'category'), true,
  'R-COMPARE-071: each line''s difference is B minus A');
select is((select sum(spent_difference)::bigint from cmp where kind = 'category' and parent_id is null),
          (select spent_difference from cmp where kind = 'total'), 'R-COMPARE-170: the top-level differences add up to the total''s');
-- any two periods, in either order
select is((select row(a_spent, b_spent)::text from public.get_period_comparison(tests.id('b'),
             (select id from public.periods where budget_id = tests.id('b') and seq = 4),
             (select id from public.periods where budget_id = tests.id('b') and seq = 1)) where kind = 'total'),
          (select row((select spent_total from public.period_summaries where budget_id = tests.id('b') and seq = 4),
                      (select spent_total from public.period_summaries where budget_id = tests.id('b') and seq = 1))::text),
  'R-COMPARE-071: any two periods, A after B too');
select is((select row(a_period_id, a_spent, a_income, income_difference)::text
           from public.get_period_comparison(tests.id('n')) where kind = 'total'),
          row(null::uuid, null::bigint, null::bigint, (select income_total from public.period_summaries where budget_id = tests.id('n')))::text,
  'R-COMPARE-071: the first period has no period before it: side A is empty');
select throws_ok(format('select * from public.get_period_comparison(%L, %L)', tests.id('b'),
                        (select id from public.periods where budget_id = tests.id('n'))), 'P0001', 'period_not_found',
  'R-COMPARE-071: a period of another budget is not found');

-- ===========================================================================
-- A reopen merges a period (R-COMPARE-170)
-- ===========================================================================
select tests.reopen_previous_period(tests.id('b'));
select is((select count(*)::integer from public.get_period_trend(tests.id('b'), 24)), (select seq - 1 from cur_seq),
  'R-COMPARE-171: after a reopen the merged period is gone from the trend');
select is_empty(
  $$select t.seq from public.get_period_trend(tests.id('b'), 24) as t
    where t.spent_total <> (select sum(c.spent) from tests.category_trend_rows(tests.id('b'), 24) as c
                            where c.period_id = t.period_id and c.parent_id is null)$$,
  'R-COMPARE-170: and the lines still add up, the merged period''s spending in the reopened one');

-- ===========================================================================
-- An ended budget (R-COMPARE-171)
-- ===========================================================================
select tests.set_budget_end_date(tests.id('b'), private.today());
select tests.clear_authentication();
select tests.set_today('2026-09-01');
select tests.authenticate_as('alice');
select is((select row(bool_or(is_current), bool_and(is_completed), max(seq))::text from public.get_period_trend(tests.id('b'), 24)),
          (select row(false, true, max(seq))::text from public.periods where budget_id = tests.id('b')),
  'R-COMPARE-171: an ended budget: the range ends at its last period, every period completed');
select is((select b_period_id from public.get_period_comparison(tests.id('b')) where kind = 'total'),
          (select id from public.periods where budget_id = tests.id('b') order by seq desc limit 1),
  'R-COMPARE-071: and B defaults to its last period');

-- ===========================================================================
-- Catching up (R-COMPARE-175)
-- ===========================================================================
create temp table before_read on commit drop as
  select (select count(*) from public.periods where budget_id = tests.id('b')) as periods,
         (select count(*) from public.transactions where budget_id = tests.id('b')) as transactions,
         (select string_agg(row(id, revision, updated_at, charged_through, next_due)::text, ',' order by id) from public.subscriptions where budget_id = tests.id('b')) as subs;
grant select on before_read to authenticated;
select count(*) from public.get_period_trend(tests.id('b'), 24);
select count(*) from public.get_category_trend(tests.id('b'), 24);
select count(*) from public.get_period_comparison(tests.id('b'));
select is((select row(
             (select count(*) from public.periods where budget_id = tests.id('b')),
             (select count(*) from public.transactions where budget_id = tests.id('b')),
             (select string_agg(row(id, revision, updated_at, charged_through, next_due)::text, ',' order by id) from public.subscriptions where budget_id = tests.id('b')))::text),
          (select row(periods, transactions, subs)::text from before_read),
  'R-COMPARE-175: the reads write nothing when nothing is due');
select tests.clear_authentication();
select tests.set_today('2041-09-01');
select tests.authenticate_as('alice');
select throws_ok(format('select * from public.get_period_trend(%L)', tests.id('n')), 'P0001', 'catching_up',
  'R-COMPARE-175: after fifteen years away the trend says the budget is still being caught up');
select count(*) from (select public.ensure_periods(tests.id('n')) from generate_series(1, 2)) as x;
select is((select max(seq) from public.get_period_trend(tests.id('n'))),
          (select seq from public.periods where budget_id = tests.id('n') and private.today() between start_date and end_date),
  'R-COMPARE-175: once caught up (ensure_periods), the range ends at today''s period');

-- ===========================================================================
-- Access (R-COMPARE-176, C-DBTEST-002, C-DBTEST-003)
-- ===========================================================================
select tests.remember('b_inv', public.invite_member(tests.id('b'), tests.get_user_email('bob')));
select tests.authenticate_as('bob');
select public.accept_invitation(tests.id('b_inv'));
select lives_ok(format('select * from public.get_period_comparison(%L)', tests.id('b')), 'R-COMPARE-176: a member reads the comparison');
select tests.authenticate_as('carol');
select throws_ok(format('select * from public.get_period_trend(%L)', tests.id('b')), 'P0001', 'budget_not_found',
  'R-COMPARE-176: another user gets nothing of the trend');
select throws_ok(format('select * from public.get_category_trend(%L)', tests.id('b')), 'P0001', 'budget_not_found',
  'R-COMPARE-176: nor of the spending per category');
select throws_ok(format('select * from public.get_period_comparison(%L)', tests.id('b')), 'P0001', 'budget_not_found',
  'R-COMPARE-176: nor of the side by side');
select throws_ok(format('select * from public.get_period_trend(%L, 99)', tests.id('b')), 'P0001', 'budget_not_found',
  'R-COMPARE-176: even with a bad argument, budget_not_found first');
select tests.authenticate_as_anon();
select throws_ok(format('select * from public.get_period_trend(%L)', tests.id('b')), '42501', null,
  'R-COMPARE-176: an anonymous visitor cannot call the trend');
select throws_ok(format('select * from public.get_category_trend(%L)', tests.id('b')), '42501', null,
  'R-COMPARE-176: nor the spending per category');
select throws_ok(format('select * from public.get_period_comparison(%L)', tests.id('b')), '42501', null,
  'R-COMPARE-176: nor the side by side');
select tests.clear_authentication();

select * from finish();
rollback;
