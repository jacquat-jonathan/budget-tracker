-- Review of the step 5 database and the step 4 re-review fixes: a moved boundary and the
-- debts' interest, the catch-up of far-behind budgets (catching_up at once, a bounded wait for
-- the lock, one step per call whoever calls), the comparison's flags, default and second
-- average, memberships and invitations bounded, the held charge's preview, and the cases the
-- earlier tests left open.
begin;
select plan(62);

create extension if not exists dblink with schema extensions;
select tests.create_user('ann', 'Ann');
select tests.create_user('bob', 'Bob');
select tests.create_user('cid', 'Cid');
select tests.set_today('2026-11-16');

-- ===========================================================================
-- M1: a moved start never puts interest before the debt's opening (R-DEBT-131, D-386)
-- ===========================================================================
select tests.authenticate_as('ann');
select tests.remember('m1', public.create_budget('M1', 'Salary', 500000, 25, 'nearest', '2026-09-01'));
select tests.remember('m1_cat', (select id from public.create_category(tests.id('m1'), 'Loans', p_amount => 1000)));
select tests.remember('m1_debt', (select id from public.create_debt(tests.id('m1'), 'Loan', 100000, tests.id('m1_cat'), 5000, 12)));
select tests.clear_authentication();
select tests.set_today('2026-11-26');
select tests.authenticate_as('ann');
select public.ensure_periods(tests.id('m1'));
select tests.remember('m1_p', (select id from public.periods where budget_id = tests.id('m1') and start_date = '2026-11-25'));
select is((select count(*)::integer from public.debt_interest where period_id = tests.id('m1_p')), 1, 'setup: the new period has the debt''s interest');
select is((select row(accepted, interest_removed)::text from public.preview_move_period_start(tests.id('m1_p'), '2026-11-10')),
          row(true, 1)::text, 'R-DEBT-131: the preview of a move to before the opening says one debt''s interest goes');
select is((select interest_removed from public.preview_move_period_start(tests.id('m1_p'), '2026-11-20')), 0,
  'R-DEBT-131: a move that stays after the opening removes none');
select public.move_period_start(tests.id('m1_p'), (select revision from public.periods where id = tests.id('m1_p')), '2026-11-10');
select is((select count(*)::integer from public.debt_interest where period_id = tests.id('m1_p')), 0,
  'R-DEBT-131: moved to before the opening, the period has no interest for the debt');
select is((select kind from public.get_debt_history(tests.id('m1_debt'), 1)), 'opened', 'R-DEBT-131: the history starts with the opening');
select is_empty(format('select * from tests.step4_violations(%L)', tests.id('m1')), 'R-DEBT-131: and the step 4 invariants hold');
-- the other way: moved later again, nothing is added (interest is computed once, at creation)
select public.move_period_start(tests.id('m1_p'), (select revision from public.periods where id = tests.id('m1_p')), '2026-11-25');
select is((select count(*)::integer from public.debt_interest where period_id = tests.id('m1_p')), 0,
  'R-DEBT-131: a start moved back after the opening adds no interest afterwards');

-- ===========================================================================
-- S1: far behind, only ensure_periods and get_current_period work (R-PERIOD-250, D-387)
-- ===========================================================================
select tests.clear_authentication();
select tests.set_today('2026-11-16');
select tests.authenticate_as('ann');
-- (nothing here takes the budget's lock in this transaction: the lock test below needs that)
select tests.remember('far', public.create_budget('Far', 'Salary', 500000, 25));
select tests.clear_authentication();
select tests.set_today('2066-11-16');
select tests.authenticate_as('ann');
create temp table far_count on commit drop as select count(*) as n from public.periods where budget_id = tests.id('far');
grant select on far_count to authenticated;
select throws_ok(format('select * from public.get_period_trend(%L)', tests.id('far')), 'P0001', 'catching_up',
  'R-PERIOD-250: a read of a budget 40 years behind answers catching_up');
select throws_ok(format($$select * from public.add_transaction(%L, 'extra_income', 1, '2066-11-16')$$, tests.id('far')),
  'P0001', 'catching_up', 'R-PERIOD-250: so does a write');
select is((select count(*) from public.periods where budget_id = tests.id('far')), (select n from far_count),
  'R-PERIOD-250: without doing any work');
-- another session holds the budget lock (dblink: a real second connection)
create or replace function pg_temp.conn() returns text language sql as $$
  select format('host=%s port=%s dbname=postgres user=postgres password=postgres', host(inet_server_addr()), inet_server_port())
$$;
select tests.clear_authentication();
select extensions.dblink_connect('holder', pg_temp.conn());
select extensions.dblink_exec('holder', 'begin');
select * from extensions.dblink('holder', format('select pg_advisory_xact_lock(hashtextextended(%L, 0))::text', 'budget:' || tests.id('far'))) as x (v text);
select tests.authenticate_as('ann');
create temp table waited (what text, ms numeric) on commit drop;
grant insert, select on waited to authenticated;
-- a regression that waits without bound fails here in seconds instead of hanging the run
set local lock_timeout = '10s';
set local statement_timeout = '30s';
do $$
declare
  t timestamptz := clock_timestamp();
begin
  begin
    perform public.ensure_periods(tests.id('far'));
    insert into waited values ('no error', 0);
  exception
    when sqlstate 'P0001' then
      insert into waited values (sqlerrm, extract(epoch from clock_timestamp() - t) * 1000);
    when lock_not_available or query_canceled then
      insert into waited values ('waited without bound', extract(epoch from clock_timestamp() - t) * 1000);
  end;
  t := clock_timestamp();
  begin
    perform public.get_period_trend(tests.id('far'));
  exception
    when sqlstate 'P0001' then
      insert into waited values ('read ' || sqlerrm, extract(epoch from clock_timestamp() - t) * 1000);
    when lock_not_available or query_canceled then
      insert into waited values ('read waited without bound', extract(epoch from clock_timestamp() - t) * 1000);
  end;
end $$;
set local lock_timeout = 0;
set local statement_timeout = 0;
select is((select what from waited where what not like 'read%'), 'catching_up',
  'R-PERIOD-250: ensure_periods waiting for another session''s lock answers catching_up, not the statement timeout');
select ok((select ms between 1500 and 6000 from waited where what not like 'read%'), 'R-PERIOD-250: after waiting about two seconds');
select ok((select ms < 1000 from waited where what = 'read catching_up'), 'R-PERIOD-250: a read does not wait for the lock at all');
select tests.clear_authentication();
select extensions.dblink_exec('holder', 'rollback');
select extensions.dblink_disconnect('holder');
select tests.authenticate_as('ann');
select is(public.ensure_periods(tests.id('far')), 120, 'R-PERIOD-250: once the lock is free, ensure_periods does its step');
select is((select array_agg(n order by i) from (select i, public.ensure_periods(tests.id('far')) as n from generate_series(1, 2) as i) as x),
          array[120, 120], 'R-PERIOD-180: each call is its own step, also several in one statement');
-- D-276: the time bound, with the work budget set to nothing: one period a step
select tests.clear_authentication();
create or replace function private.limit_catch_up_work() returns interval language sql immutable set search_path = '' as $f$ select interval '0 seconds' $f$;
select tests.authenticate_as('ann');
select is(public.ensure_periods(tests.id('far')), 1, 'D-276: a step stops once its work budget is spent (at least one period)');
select tests.clear_authentication();
create or replace function private.limit_catch_up_work() returns interval language sql immutable set search_path = '' as $f$ select interval '2 seconds' $f$;
select tests.authenticate_as('ann');
-- a budget a month behind: an ordinary call does its own roll-over
select tests.clear_authentication();
select tests.set_today('2026-11-16');
select tests.authenticate_as('ann');
select tests.remember('near', public.create_budget('Near', 'Salary', 500000, 25, 'nearest', '2026-09-01'));
select tests.clear_authentication();
select tests.set_today('2027-01-03');
select tests.authenticate_as('ann');
select ok((select count(*) from public.get_period_trend(tests.id('near'))) >= 1, 'R-PERIOD-250: a budget about a month behind is rolled over by any call');

-- ===========================================================================
-- S5: one bounded step per call, whoever calls (R-PERIOD-180)
-- ===========================================================================
select tests.clear_authentication();
select tests.set_today('2026-11-16');
select tests.authenticate_as('ann');
select tests.remember('s5', public.create_budget('S5', 'Salary', 500000, 25, 'nearest', null, '2031-11-16'));
select tests.clear_authentication();
select tests.set_today('2056-11-16');
select tests.authenticate_as('ann');
select throws_ok(format('select * from public.set_budget_end_date(%L, %s)', tests.id('s5'), (select revision from public.budgets where id = tests.id('s5'))),
  'P0001', 'catching_up', 'R-PERIOD-250: a long-ended budget not yet caught up to its end answers catching_up');
select count(*) from (select public.ensure_periods(tests.id('s5')) from generate_series(1, 3)) as x;
create temp table s5_before on commit drop as select count(*) as n from public.periods where budget_id = tests.id('s5');
grant select on s5_before to authenticated;
select is((select caught_up from public.set_budget_end_date(tests.id('s5'), (select revision from public.budgets where id = tests.id('s5')))),
  false, 'R-PERIOD-180: clearing the end date of a budget ended long ago works and leaves it to catch up');
select cmp_ok((select count(*) from public.periods where budget_id = tests.id('s5')) - (select n from s5_before), '<=', 120::bigint,
  'R-PERIOD-180: within one step (not two)');

-- ===========================================================================
-- S2, S3, Q-160, Q-161: the comparison (R-COMPARE-071, R-COMPARE-172, D-383, D-384)
-- ===========================================================================
select tests.clear_authentication();
select tests.set_today('2026-11-16');
select tests.authenticate_as('ann');
select tests.remember('nc', public.create_budget('No categories', 'Salary', 500000, 25, 'nearest', '2026-09-01'));
select is((select row(a_transaction_count, b_transaction_count)::text from public.get_period_comparison(tests.id('nc')) where kind = 'total'),
          row(0, 0)::text, 'R-COMPARE-071: the total row counts 0 transactions on a side that exists, without categories');
select is((select row(a_period_id, a_transaction_count, a_is_current, a_is_completed)::text
           from public.get_period_comparison(tests.id('nc'), null, (select id from public.periods where budget_id = tests.id('nc') and seq = 1))
           where kind = 'total'),
          row(null::uuid, null::integer, null::boolean, null::boolean)::text, 'R-COMPARE-071: and null where side A is empty');
-- a budget with three periods: two completed, the third running
select tests.remember('cmp', public.create_budget('Cmp', 'Salary', 500000, 25, 'nearest', '2026-08-01'));
select tests.remember('cmp_p1', (select id from public.periods where budget_id = tests.id('cmp') and seq = 1));
select tests.remember('cmp_p2', (select id from public.periods where budget_id = tests.id('cmp') and seq = 2));
select tests.remember('cmp_p3', (select id from public.periods where budget_id = tests.id('cmp') and seq = 3));
select tests.remember('day', (select id from public.create_category(tests.id('cmp'), 'Daycare', p_amount => 80000, p_from_period_id => tests.id('cmp_p2'))));
select tests.remember('home', (select id from public.create_category(tests.id('cmp'), 'Home', p_amount => 1000, p_from_period_id => tests.id('cmp_p1'))));
select tests.remember('garden', (select id from public.create_category(tests.id('cmp'), 'Garden', tests.id('home'), 500,
  p_from_period_id => tests.id('cmp_p1'), p_other_name => 'Other')));
select tests.remember('zoo', (select id from public.create_category(tests.id('cmp'), 'Zoo', p_amount => 300, p_from_period_id => tests.id('cmp_p1'))));
select count(*) from public.add_transaction(tests.id('cmp'), 'expense', 80000, (select start_date + 1 from public.periods where id = tests.id('cmp_p2')), tests.id('day'));
select count(*) from public.add_transaction(tests.id('cmp'), 'expense', 700, (select start_date + 1 from public.periods where id = tests.id('cmp_p1')), tests.id('garden'));
select count(*) from public.add_transaction(tests.id('cmp'), 'expense', 900, private.today(), tests.id('garden'));
select count(*) from public.add_transaction(tests.id('cmp'), 'expense', 50, (select start_date + 2 from public.periods where id = tests.id('cmp_p2')), tests.id('garden'));
-- a subscription from period 2 on: its category's committed amounts are 0, 3000, 3000
select tests.remember('pass', (select id from public.create_category(tests.id('cmp'), 'Pass', p_amount => 3000, p_from_period_id => tests.id('cmp_p1'))));
select count(*) from public.create_subscription(tests.id('cmp'), 'Zoo pass', 3000, 'monthly', tests.id('pass'),
  (select start_date + 3 from public.periods where id = tests.id('cmp_p2')), tests.id('cmp_p2'));
-- a void category with spending in the running period: a row there, not in force
select tests.remember('void', (select id from public.create_category(tests.id('cmp'), 'Void', p_amount => 100)));
select count(*) from public.add_transaction(tests.id('cmp'), 'expense', 77, private.today(), tests.id('void'));
select public.end_category(tests.id('void'), (select revision from public.categories where id = tests.id('void')));
create temp table c on commit drop as select * from public.get_period_comparison(tests.id('cmp'));
grant select on c to authenticated;
select is((select row(a_period_id, b_period_id, a_is_current, a_is_completed, b_is_current, b_is_completed)::text from c where kind = 'total'),
          row(tests.id('cmp_p1'), tests.id('cmp_p2'), false, true, false, true)::text,
  'R-COMPARE-071: by default the last two completed periods, each flagged completed');
select is((select bool_and(b_is_completed and not b_is_current) from c), true, 'R-COMPARE-071: the flags are on every row');
select is((select row(a_period_id, b_is_current, b_is_completed)::text from public.get_period_comparison(tests.id('cmp'), null, tests.id('cmp_p3')) where kind = 'total'),
          row(tests.id('cmp_p2'), true, false)::text, 'R-COMPARE-071: with only B given, A is the period before it; a running B says so');
select is((select b_period_id from public.get_period_comparison(tests.id('cmp'), tests.id('cmp_p1')) where kind = 'total'),
          tests.id('cmp_p3'), 'R-COMPARE-071: with only A given, B is the current period');
select is((select row(a_planned, b_planned, planned_difference, a_committed, committed_difference)::text from c where category_id = tests.id('day')),
          row(null::bigint, 80000, null::bigint, null::bigint, 0)::text,
  'R-COMPARE-174 D-262: not in force on side A: planned null, planned_difference null, committed_difference counts the empty side as 0');
select is((select planned_difference from c where category_id = tests.id('zoo')), 0::bigint, 'D-262: both sides plan: the difference');
select is((select row(a_transaction_count, b_transaction_count)::text from c where kind = 'total'),
          row(1, 3)::text, 'R-COMPARE-071: the total row counts each transaction once (subcategories not twice)');
select is((select planned_difference from c where kind = 'total'),
          (select b.expected_total - a.expected_total from public.period_summaries as a, public.period_summaries as b
           where a.id = tests.id('cmp_p1') and b.id = tests.id('cmp_p2')), 'D-262: the total row''s planned_difference is B minus A');
select is((select row(a_in_force, a_spent, a_planned)::text from public.get_period_comparison(tests.id('cmp'), tests.id('cmp_p3'), tests.id('cmp_p2'))
           where category_id = tests.id('void')),
          row(false, 77, null::bigint)::text, 'R-COMPARE-174: a side with a row on a category not in force plans nothing (null)');
select is((select committed from public.get_category_trend(tests.id('cmp'), 3) where category_id = tests.id('pass')),
          array[0, 3000, 3000]::bigint[], 'R-COMPARE-070: element i of committed is the period period_ids[i]');
select is((select bool_and(o.display_order > g.display_order and o.display_order < z.display_order)
           from c as o, c as g, c as z
           where o.parent_id = tests.id('home') and g.category_id = tests.id('home') and z.category_id = tests.id('zoo')), true,
  'R-COMPARE-174: a group''s subcategories follow it, before the next top-level line');
-- Q-160: the second average
select is((select row(completed_count, average_spent, active_count, active_average_spent)::text
           from public.get_category_trend(tests.id('cmp')) where category_id = tests.id('day')),
          row(2, 40000, 1, 80000)::text,
  'R-COMPARE-172 D-383: a category in force for one of two completed periods averages 80000 over that one, 40000 over both');
select is((select row(active_count, active_average_spent)::text from public.get_category_trend(tests.id('cmp')) where category_id = tests.id('zoo')),
          row(2, 0)::text, 'D-383: a category in force and empty counts its periods');
-- on the last day of the running period, it is not completed yet
select tests.clear_authentication();
select tests.set_today((select end_date from public.periods where id = tests.id('cmp_p3')));
select tests.authenticate_as('ann');
select is((select completed_count from public.get_category_trend(tests.id('cmp')) where category_id = tests.id('zoo')), 2,
  'R-COMPARE-172: a line''s completed_count leaves out the running period on its last day');
select tests.clear_authentication();
select tests.set_today('2026-11-16');
select tests.authenticate_as('ann');
select tests.remember('avg', public.create_budget('Avg', 'Salary', 500000, 25, 'nearest', '2026-08-01'));
select tests.remember('avg_cat', (select id from public.create_category(tests.id('avg'), 'Any', p_from_period_id =>
  (select id from public.periods where budget_id = tests.id('avg') and seq = 1))));
select count(*) from public.add_transaction(tests.id('avg'), 'extra_income', 1, (select start_date from public.periods where budget_id = tests.id('avg') and seq = 1));
select count(*) from public.add_transaction(tests.id('avg'), 'refund', 3, (select start_date from public.periods where budget_id = tests.id('avg') and seq = 1), tests.id('avg_cat'));
select is((select row(average_income, average_spent, average_result)::text from public.get_period_trend(tests.id('avg')) limit 1),
          row(500001, -2, 500002)::text, 'D-383: the average result (500002) is not the average income minus the average spent (500003)');
select is_empty(format($$select 1 from public.get_period_trend(%L) as t
  where t.average_result is distinct from (select round(sum(s.result)::numeric / nullif(count(*), 0))::bigint
                                            from public.period_summaries as s where s.budget_id = %L and s.end_date < s.today)$$,
                       tests.id('cmp'), tests.id('cmp')), 'D-383: the average result is the average of the results');

-- ===========================================================================
-- Access the earlier tests left open (R-SECURITY-002, R-COMPARE-176)
-- ===========================================================================
select tests.authenticate_as('bob');
select tests.remember('bob_b', public.create_budget('Bob', 'Salary', 500000, 25, 'nearest', '2026-09-01'));
select throws_ok(format('select * from public.list_periods(%L)', tests.id('cmp')), 'P0001', 'budget_not_found',
  'R-SECURITY-002: another user cannot list the periods');
select throws_ok(format('select * from public.get_category_trend(%L, 0)', tests.id('cmp')), 'P0001', 'budget_not_found',
  'R-COMPARE-176: nor learn anything from a bad count');
select throws_ok(format('select * from public.get_period_comparison(%L, null, %L)', tests.id('bob_b'), tests.id('cmp_p2')), 'P0001', 'period_not_found',
  'R-COMPARE-071: a period of another budget as B is not found');

-- ===========================================================================
-- Q-162: memberships and invitations bounded (R-MEMBER-250, D-385)
-- ===========================================================================
select tests.clear_authentication();
create or replace function private.limit_memberships() returns integer language sql immutable set search_path = '' as $f$ select 2 $f$;
select tests.authenticate_as('cid');
select tests.remember('cid_1', public.create_budget('Cid 1', 'Salary', 500000, 25));
select tests.authenticate_as('ann');
select tests.remember('inv1', public.invite_member(tests.id('cmp'), tests.get_user_email('cid')));
select tests.remember('inv2', public.invite_member(tests.id('m1'), tests.get_user_email('cid')));
select tests.remember('inv3', public.invite_member(tests.id('nc'), tests.get_user_email('cid')));
select tests.authenticate_as('cid');
select is((select count(*)::integer from public.list_my_invitations(2)), 2, 'R-MEMBER-250: invitations come a page at a time');
select is((select count(*)::integer from public.list_my_invitations(2,
             (select created_at from public.list_my_invitations(2) order by created_at desc, id desc limit 1),
             (select id from public.list_my_invitations(2) order by created_at desc, id desc limit 1))), 1,
  'R-MEMBER-250: the next page continues after the last row');
select throws_ok('select * from public.list_my_invitations(201)', 'P0001', 'invalid_limit', 'R-MEMBER-250: at most 200 a page');
select is(public.accept_invitation(tests.id('inv1')), tests.id('cmp'), 'R-MEMBER-250: a second budget is accepted');
select throws_ok(format('select public.accept_invitation(%L)', tests.id('inv2')), 'P0001', 'membership_limit_reached',
  'R-MEMBER-250: beyond the limit an invitation is refused');
select throws_ok($$select public.create_budget('Cid 2', 'Salary', 500000, 25)$$, 'P0001', 'membership_limit_reached',
  'R-MEMBER-250: and so is a new budget');
select tests.clear_authentication();
create or replace function private.limit_memberships() returns integer language sql immutable set search_path = '' as $f$ select 50 $f$;

-- ===========================================================================
-- S4: the held charge in the preview (R-SUBSCRIPTION-180, D-388)
-- ===========================================================================
select tests.set_today('2026-11-16');
select tests.authenticate_as('ann');
select tests.remember('s4', public.create_budget('S4', 'Salary', 500000, 25, 'nearest', '2026-09-01'));
select tests.remember('s4_cat', (select id from public.create_category(tests.id('s4'), 'Bills', p_amount => 1000)));
select tests.remember('s4_sub', (select id from public.create_subscription(tests.id('s4'), 'S', 1000, 'monthly', tests.id('s4_cat'), '2026-11-20')));
select tests.clear_authentication();
do $$ begin
  execute format('create or replace function private.limit_transactions() returns integer language sql immutable set search_path = '''' as $f$ select %s $f$',
                 (select count(*) from public.transactions where budget_id = tests.id('s4')));
end $$;
select tests.set_today('2026-11-21');
select tests.authenticate_as('ann');
select public.ensure_periods(tests.id('s4'));
select is((select next_charge_date from public.subscription_overview where id = tests.id('s4_sub')), '2026-11-20'::date, 'setup: the charge of the 20th is held');
select throws_ok(format($$select * from public.preview_update_subscription(%L, p_cadence => 'quarterly')$$, tests.id('s4_sub')),
  'P0001', 'charge_held_back', 'R-SUBSCRIPTION-180: the preview of a new cadence is refused like the write');
select throws_ok(format($$select * from public.preview_update_subscription(%L, p_next_charge_date => '2026-12-05')$$, tests.id('s4_sub')),
  'P0001', 'charge_held_back', 'R-SUBSCRIPTION-180: so is a new next charge date');
select is((select array_agg(d) from public.preview_update_subscription(tests.id('s4_sub'), p_count => 2) as d),
          array['2026-11-20', '2026-12-20']::date[], 'R-SUBSCRIPTION-180: the unchanged schedule starts with the held date');
select is((select array_agg(d) from public.preview_update_subscription(tests.id('s4_sub'), p_price => 1500, p_count => 2) as d),
          array['2026-11-20', '2026-12-20']::date[], 'R-SUBSCRIPTION-180: so does a price change');
select lives_ok(format($$select * from public.update_subscription(%L, %s, p_cadence => 'monthly')$$, tests.id('s4_sub'),
                       (select revision from public.subscriptions where id = tests.id('s4_sub'))),
  'R-SUBSCRIPTION-180: the same cadence sent again is not a schedule change');
select tests.clear_authentication();
create or replace function private.limit_transactions() returns integer language sql immutable set search_path = '' as $f$ select 50000 $f$;

-- ===========================================================================
-- D-273 for debts, categories and incomes
-- ===========================================================================
select tests.set_today('2026-11-16');
select tests.authenticate_as('ann');
select tests.remember('t', public.create_budget('Terms', 'Salary', 500000, 25, 'nearest', '2026-09-01'));
select tests.remember('t_p1', (select id from public.periods where budget_id = tests.id('t') and seq = 1));
select tests.remember('t_cat', (select id from public.create_category(tests.id('t'), 'Late', p_amount => 1000)));
select tests.remember('t_debt', (select id from public.create_debt(tests.id('t'), 'Loan', 100000, tests.id('t_cat'), 1000, 12)));
select tests.remember('t_inc', public.add_income(tests.id('t'), 'Side', 1000, 1, 'nearest'));
select is((select row(in_force, category_id, interest_rate, monthly_payment, terms_from_period_id, until_period_id)::text
           from public.get_debt_terms(tests.id('t_debt'), tests.id('t_p1'))),
          row(false, null::uuid, null::numeric, null::bigint, null::uuid, null::uuid)::text, 'D-273: no terms where a debt is not in force');
select is((select row(in_force, amount, cadence, terms_from_period_id, until_period_id)::text from public.get_category_terms(tests.id('t_cat'), tests.id('t_p1'))),
          row(false, null::bigint, null::text, null::uuid, null::uuid)::text, 'D-273: nor a category');
select is((select row(in_force, amount, pay_day, terms_from_period_id, until_period_id)::text from public.get_income_terms(tests.id('t_inc'), tests.id('t_p1'))),
          row(false, null::bigint, null::integer, null::uuid, null::uuid)::text, 'D-273: nor an income');

-- ===========================================================================
-- What the earlier tests left open: caught_up with a charge due, a debt's end, payoff
-- ===========================================================================
select tests.clear_authentication();
select tests.set_today('2026-11-16');
select tests.authenticate_as('ann');
select tests.remember('o', public.create_budget('Open', 'Salary', 500000, 25, 'nearest', '2026-10-01'));
select tests.remember('o_cat', (select id from public.create_category(tests.id('o'), 'Bills', p_amount => 1000)));
select count(*) from public.create_subscription(tests.id('o'), 'Phone', 1000, 'monthly', tests.id('o_cat'), '2026-11-18');
select tests.remember('o_end', (select id from public.create_debt(tests.id('o'), 'Ends', 100000, tests.id('o_cat'), 1000, 12)));
select tests.remember('o_never', (select id from public.create_debt(tests.id('o'), 'Never', 100000, tests.id('o_cat'), 1000, 12)));
select tests.clear_authentication();
select tests.set_today('2026-11-19');
select tests.authenticate_as('ann');
select is((select caught_up from public.my_budgets where id = tests.id('o')), false,
  'R-PERIOD-130: not caught up while a charge it has room for is due (the periods are current)');
select public.ensure_periods(tests.id('o'));
select is((select caught_up from public.my_budgets where id = tests.id('o')), true, 'R-PERIOD-130: caught up once the charge is created');
-- a debt ended from the next period gets no interest there, and has no terms there
select tests.clear_authentication();
select tests.set_today('2026-11-26');
select tests.authenticate_as('ann');
select public.ensure_periods(tests.id('o'));
select public.remove_debt(tests.id('o_end'), (select revision from public.debts where id = tests.id('o_end')));
select tests.clear_authentication();
select tests.set_today('2026-12-28');
select tests.authenticate_as('ann');
select public.ensure_periods(tests.id('o'));
select is((select count(*)::integer from public.debt_interest as i join public.periods as p on p.id = i.period_id
           where i.debt_id = tests.id('o_end') and p.seq > (select end_seq from public.debts where id = tests.id('o_end'))), 0,
  'R-DEBT-113: no interest for an ended debt in the periods created after its end (it keeps its history up to then)');
select is((select row(in_force, interest_rate, terms_from_period_id)::text from public.get_debt_terms(tests.id('o_end'),
             (select id from public.periods where budget_id = tests.id('o') and seq = (select end_seq from public.debts where id = tests.id('o_end'))))),
          row(false, null::numeric, null::uuid)::text, 'D-273: and no terms from its end period on');

-- ===========================================================================
-- preview_reopen with exactly 1000 changes lists them all; 1001: 999 and "2 more" (R-APP-170)
-- ===========================================================================
select tests.remember('r', public.create_budget('Reopen', 'Salary', 500000, 25, 'nearest', '2026-09-01'));
select tests.clear_authentication();
insert into public.categories (budget_id, name, first_seq)
select tests.id('r'), 'C' || g, (select max(seq) from public.periods where budget_id = tests.id('r')) from generate_series(1, 1000) as g;
select tests.authenticate_as('ann');
select is((select row(count(*), count(*) filter (where change = 'more'))::text from public.preview_reopen(tests.id('r'))),
          row(1000, 0)::text, 'R-APP-170: exactly 1000 changes are all listed');
select tests.clear_authentication();
insert into public.categories (budget_id, name, first_seq)
select tests.id('r'), 'C1001', (select max(seq) from public.periods where budget_id = tests.id('r'));
select tests.authenticate_as('ann');
select is((select row(count(*), max(record_name) filter (where change = 'more'))::text from public.preview_reopen(tests.id('r'))),
          row(1000, '2')::text, 'R-APP-170: 1001: 999 listed and a last row "2 more"');

select * from finish();
rollback;
