-- The screen review's asks of steps 4 and 5 (a retried add records once, "over the plan" in the
-- comparison, the budget's first day), and the cases the step 4 and 5 mutants showed untested.
begin;
select plan(33);

select tests.create_user('ann', 'Ann');
select tests.create_user('bob', 'Bob');
select tests.create_user('eve', 'Eve');
select tests.set_today('2026-11-16');

-- ===========================================================================
-- A retried add records once (R-APP-250, D-390, Q-090)
-- ===========================================================================
select tests.authenticate_as('ann');
select tests.remember('b', public.create_budget('Retry', 'Salary', 500000, 25, 'nearest', '2026-09-01'));
select tests.remember('b2', public.create_budget('Other', 'Salary', 500000, 25, 'nearest', '2026-09-01'));
select tests.remember('inv', public.invite_member(tests.id('b'), tests.get_user_email('bob')));
select tests.authenticate_as('bob');
select public.accept_invitation(tests.id('inv'));
select tests.authenticate_as('ann');
select tests.remember('food', (select id from public.create_category(tests.id('b'), 'Food', p_amount => 1000)));
select tests.remember('k1', gen_random_uuid());
select tests.remember('t1', (select id from public.add_transaction(tests.id('b'), 'expense', 1250, '2026-11-10', tests.id('food'), 'Coop', p_client_id => tests.id('k1'))));
select is((select id from public.add_transaction(tests.id('b'), 'expense', 1250, '2026-11-10', tests.id('food'), 'Coop', p_client_id => tests.id('k1'))),
          tests.id('t1'), 'R-APP-250: the same request sent again answers the transaction recorded the first time');
select is((select count(*)::integer from public.transaction_list where budget_id = tests.id('b') and amount = 1250), 1,
  'R-APP-250: and records nothing more');
select throws_ok(format($$select * from public.add_transaction(%L, 'expense', 1300, '2026-11-10', %L, 'Coop', p_client_id => %L)$$,
                        tests.id('b'), tests.id('food'), tests.id('k1')),
  'P0001', 'request_reused', 'R-APP-250: the same id with other content is refused');
select throws_ok(format($$select * from public.add_transaction(%L, 'extra_income', 1250, '2026-11-10', p_client_id => %L)$$,
                        tests.id('b2'), tests.id('k1')),
  'P0001', 'request_reused', 'R-APP-250: so is the same id for another budget');
select throws_ok(format($$select public.add_income(%L, 'Side', 1000, 1, p_client_id => %L)$$, tests.id('b'), tests.id('k1')),
  'P0001', 'request_reused', 'R-APP-250: and for another call');
select tests.authenticate_as('bob');
select throws_ok(format($$select * from public.add_transaction(%L, 'expense', 1250, '2026-11-10', %L, 'Coop', p_client_id => %L)$$,
                        tests.id('b'), tests.id('food'), tests.id('k1')),
  'P0001', 'request_reused', 'R-APP-250: and for another member, who learns nothing of the first');
select tests.authenticate_as('eve');
select throws_ok(format($$select * from public.add_transaction(%L, 'expense', 1250, '2026-11-10', %L, 'Coop', p_client_id => %L)$$,
                        tests.id('b'), tests.id('food'), gen_random_uuid()),
  'P0001', 'budget_not_found', 'R-SECURITY-002: a new id does not open someone else''s budget');
select tests.authenticate_as('ann');
select is((select count(*)::integer from (select public.add_transaction(tests.id('b'), 'expense', 999, '2026-11-10', tests.id('food'))
                                          from generate_series(1, 2)) as x), 2, 'R-APP-250: without an id, two calls record two');
-- deleted since: the retry answers nothing and records nothing again
select public.delete_transaction(tests.id('t1'), (select revision from public.transactions where id = tests.id('t1')));
select is((select count(*)::integer from public.add_transaction(tests.id('b'), 'expense', 1250, '2026-11-10', tests.id('food'), 'Coop', p_client_id => tests.id('k1'))),
          0, 'R-APP-250: a retry after the row was deleted answers nothing and records nothing');
-- every other add
select tests.remember('k2', gen_random_uuid());
select tests.remember('inc', public.add_income(tests.id('b'), 'Side', 1000, 1, p_client_id => tests.id('k2')));
select is(public.add_income(tests.id('b'), 'Side', 1000, 1, p_client_id => tests.id('k2')), tests.id('inc'), 'R-APP-250: add_income');
select tests.remember('k3', gen_random_uuid());
select tests.remember('cat', (select id from public.create_category(tests.id('b'), 'Garden', tests.id('food'), 500, p_other_name => 'Other', p_client_id => tests.id('k3')) limit 1));
select is((select array_agg(name order by name) from public.create_category(tests.id('b'), 'Garden', tests.id('food'), 500, p_other_name => 'Other', p_client_id => tests.id('k3'))),
          array['Garden'], 'R-APP-250: create_category answers what it answered the first time');
select is((select count(*)::integer from public.categories where budget_id = tests.id('b') and name in ('Garden', 'Other')), 2,
  'R-APP-250: once (the subcategory and its "Other")');
select tests.remember('k4', gen_random_uuid());
select tests.remember('sub', (select id from public.create_subscription(tests.id('b'), 'Phone', 3000, 'monthly', tests.id('cat'), '2026-11-20', p_client_id => tests.id('k4'))));
select is((select id from public.create_subscription(tests.id('b'), 'Phone', 3000, 'monthly', tests.id('cat'), '2026-11-20', p_client_id => tests.id('k4'))),
          tests.id('sub'), 'R-APP-250: create_subscription');
select tests.remember('k5', gen_random_uuid());
select tests.remember('debt', (select id from public.create_debt(tests.id('b'), 'Loan', 100000, tests.id('cat'), 1000, 3, p_client_id => tests.id('k5'))));
select is((select id from public.create_debt(tests.id('b'), 'Loan', 100000, tests.id('cat'), 1000, 3, p_client_id => tests.id('k5'))),
          tests.id('debt'), 'R-APP-250: create_debt');
select tests.remember('k6', gen_random_uuid());
select tests.remember('acc', (select id from public.create_account(tests.id('b'), 'Main', 'current', p_client_id => tests.id('k6'))));
select is((select id from public.create_account(tests.id('b'), 'Main', 'current', p_client_id => tests.id('k6'))), tests.id('acc'), 'R-APP-250: create_account');
select tests.remember('acc2', (select id from public.create_account(tests.id('b'), 'Savings', 'savings')));
select tests.remember('k7', gen_random_uuid());
select tests.remember('tr', (select id from public.create_transfer(tests.id('b'), 'Save', tests.id('acc'), tests.id('acc2'), 10000, 'day_of_month',
  p_day_of_month => 28, p_client_id => tests.id('k7'))));
select is((select id from public.create_transfer(tests.id('b'), 'Save', tests.id('acc'), tests.id('acc2'), 10000, 'day_of_month',
  p_day_of_month => 28, p_client_id => tests.id('k7'))), tests.id('tr'), 'R-APP-250: create_transfer');
select is((select row((select count(*) from public.incomes where budget_id = tests.id('b') and name = 'Side'),
                      (select count(*) from public.subscriptions where budget_id = tests.id('b')),
                      (select count(*) from public.debts where budget_id = tests.id('b')),
                      (select count(*) from public.accounts where budget_id = tests.id('b') and name = 'Main'),
                      (select count(*) from public.transfers where budget_id = tests.id('b')))::text),
          row(1, 1, 1, 1, 1)::text, 'R-APP-250: each recorded once');
select tests.clear_authentication();
select is((select count(*)::integer from private.client_requests where budget_id = tests.id('b')), 7, 'R-APP-250: one request row per client id');
select tests.authenticate_as('ann');

-- ===========================================================================
-- "Over the plan" in the comparison (R-COMPARE-070, R-COMPARE-071, D-391)
-- ===========================================================================
select tests.remember('cmp', public.create_budget('Over', 'Salary', 500000, 25, 'nearest', '2026-08-01'));
select tests.remember('c_p1', (select id from public.periods where budget_id = tests.id('cmp') and seq = 1));
select tests.remember('c_p2', (select id from public.periods where budget_id = tests.id('cmp') and seq = 2));
select tests.remember('small', (select id from public.create_category(tests.id('cmp'), 'Small', p_amount => 1000, p_from_period_id => tests.id('c_p1'))));
select count(*) from public.add_transaction(tests.id('cmp'), 'expense', 1500, (select start_date + 1 from public.periods where id = tests.id('c_p2')), tests.id('small'));
select count(*) from public.add_transaction(tests.id('cmp'), 'expense', 500, (select start_date + 1 from public.periods where id = tests.id('c_p1')), tests.id('small'));
-- a void category with spending: over nothing, not in force
select tests.remember('void', (select id from public.create_category(tests.id('cmp'), 'Void', p_amount => 100)));
select count(*) from public.add_transaction(tests.id('cmp'), 'expense', 77, private.today(), tests.id('void'));
select public.end_category(tests.id('void'), (select revision from public.categories where id = tests.id('void')));
select is_empty(format($$
  select t.category_id, i from public.get_category_trend(%L) as t
  cross join lateral generate_subscripts(t.period_ids, 1) as i
  where t.is_overspent[i] is distinct from coalesce((select g.is_overspent from public.get_period_progress(t.period_ids[i]) as g
                                                      where g.category_id = t.category_id), false)$$, tests.id('cmp')),
  'R-COMPARE-070: is_overspent of every line and period is the progress view''s flag (false without a row)');
select is((select is_overspent from public.get_category_trend(tests.id('cmp')) where category_id = tests.id('small')),
          array[false, true, false], 'R-COMPARE-070: over the plan in the second period only');
select is((select row(a_is_overspent, b_is_overspent)::text from public.get_period_comparison(tests.id('cmp'), tests.id('c_p1'), tests.id('c_p2'))
           where category_id = tests.id('small')), row(false, true)::text, 'R-COMPARE-071: each side''s flag on the category rows');
select is((select row(a_is_overspent, b_is_overspent)::text from public.get_period_comparison(tests.id('cmp'), tests.id('c_p1'), tests.id('c_p2'))
           where kind = 'total'), row(null::boolean, null::boolean)::text, 'R-COMPARE-071: none on the total row');
select is((select b_is_overspent from public.get_period_comparison(tests.id('cmp'), tests.id('c_p2'),
             (select id from public.periods where budget_id = tests.id('cmp') and seq = 3)) where category_id = tests.id('void')),
          (select g.is_overspent from public.get_period_progress((select id from public.periods where budget_id = tests.id('cmp') and seq = 3)) as g
           where g.category_id = tests.id('void')), 'R-COMPARE-071: a void category with spending: the progress view''s flag');

-- ===========================================================================
-- The budget's first day and last day (R-BUDGET-004, D-392)
-- ===========================================================================
select is((select first_period_start from public.my_budgets where id = tests.id('cmp')),
          (select min(start_date) from public.periods where budget_id = tests.id('cmp')), 'R-BUDGET-004: my_budgets gives the first period''s start');

-- ===========================================================================
-- Mutants of steps 4 and 5 left alive by the earlier tests
-- ===========================================================================
-- still behind after its own step (its work budget spent): a read, a write and a preview answer catching_up
select tests.remember('near', public.create_budget('Near', 'Salary', 500000, 25, 'nearest', '2026-09-01'));
select tests.remember('near_cat', (select id from public.create_category(tests.id('near'), 'Food', p_amount => 1000)));
select tests.clear_authentication();
select tests.set_today('2027-01-10');
create or replace function private.limit_catch_up_work() returns interval language sql immutable set search_path = '' as $f$ select interval '0 seconds' $f$;
select tests.authenticate_as('ann');
select throws_ok(format('select * from public.get_period_trend(%L)', tests.id('near')), 'P0001', 'catching_up',
  'R-PERIOD-180: a read still behind after its step answers catching_up');
select throws_ok(format($$select * from public.add_transaction(%L, 'expense', 5, '2027-01-10', %L)$$, tests.id('near'), tests.id('near_cat')), 'P0001', 'catching_up',
  'R-PERIOD-180: so does a write, which records nothing');
select throws_ok(format('select * from public.preview_move_period_start(%L)', (select id from public.periods where budget_id = tests.id('near') and seq = 2)),
  'P0001', 'catching_up', 'R-PERIOD-180: and preview_move_period_start');
select tests.clear_authentication();
create or replace function private.limit_catch_up_work() returns interval language sql immutable set search_path = '' as $f$ select interval '2 seconds' $f$;
select tests.set_today('2026-11-16');
select tests.authenticate_as('ann');
-- a charge on the first day of the subscription's first period
select tests.remember('fd', public.create_budget('First day', 'Salary', 500000, 25, 'nearest', '2026-09-01'));
select tests.remember('fd_cat', (select id from public.create_category(tests.id('fd'), 'Bills', p_amount => 1000)));
select tests.remember('fd_start', (select id from public.periods where budget_id = tests.id('fd') and private.today() between start_date and end_date));
select count(*) from public.create_subscription(tests.id('fd'), 'S', 1000, 'monthly', tests.id('fd_cat'),
  (select start_date from public.periods where id = tests.id('fd_start')));
select is((select count(*)::integer from public.transactions where budget_id = tests.id('fd') and charge_date = (select start_date from public.periods where id = tests.id('fd_start'))),
  1, 'R-SUBSCRIPTION-073: a charge due on the first day of the subscription''s first period is created');
-- the first subcategory moves the parent's debts to "Other"
select tests.remember('pd', (select id from public.create_category(tests.id('fd'), 'Loans', p_amount => 1000)));
select tests.remember('pd_debt', (select id from public.create_debt(tests.id('fd'), 'Car', 100000, tests.id('pd'), 1000)));
select count(*) from public.create_category(tests.id('fd'), 'Car loan', tests.id('pd'), 500, p_other_name => 'Other');
select is((select c.name from public.debt_versions as v join public.categories as c on c.id = v.category_id where v.debt_id = tests.id('pd_debt')),
  'Other', 'R-CATEGORY-110: the first subcategory moves the parent''s debts to "Other"');
-- a moved start removes only the interest of debts not opened before it (D-386)
select tests.remember('mv', public.create_budget('Moved', 'Salary', 500000, 25, 'nearest', '2026-09-01'));
select tests.remember('mv_cat', (select id from public.create_category(tests.id('mv'), 'Loans', p_amount => 1000,
  p_from_period_id => (select id from public.periods where budget_id = tests.id('mv') and seq = 1))));
select tests.remember('mv_old', (select id from public.create_debt(tests.id('mv'), 'Old', 100000, tests.id('mv_cat'), 1000, 12,
  (select id from public.periods where budget_id = tests.id('mv') and seq = 1))));
select tests.remember('mv_new', (select id from public.create_debt(tests.id('mv'), 'New', 100000, tests.id('mv_cat'), 1000, 12)));
select tests.clear_authentication();
select tests.set_today('2026-11-26');
select tests.authenticate_as('ann');
select public.ensure_periods(tests.id('mv'));
select tests.remember('mv_p', (select id from public.periods where budget_id = tests.id('mv') and start_date = '2026-11-25'));
select public.move_period_start(tests.id('mv_p'), (select revision from public.periods where id = tests.id('mv_p')), '2026-11-10');
select is((select array_agg(d.name order by d.name) from public.debt_interest as i join public.debts as d on d.id = i.debt_id where i.period_id = tests.id('mv_p')),
          array['Old'], 'R-DEBT-131: the debt opened before the new start keeps its interest; the one opened after loses it');

-- several catch-ups within one statement share one step (here a step of one period)
select tests.clear_authentication();
select tests.set_today('2026-11-16');
select tests.authenticate_as('ann');
select tests.remember('st', public.create_budget('Steps', 'Salary', 500000, 25));
select tests.clear_authentication();
select tests.set_today('2027-01-10');
create temp table st_out (n integer) on commit drop;
do $$
begin
  perform set_config('budget_tracker.catch_up', 'multi', true);
  insert into st_out values (private.ensure_periods(tests.id('st'), 1) + private.ensure_periods(tests.id('st'), 1));
  perform set_config('budget_tracker.catch_up', '', true);
end $$;
select is((select n from st_out), 1, 'R-PERIOD-180: two catch-ups in one statement do one step between them');
-- B on its last day is still running, not completed
select tests.set_today((select end_date from public.periods where id = tests.id('c_p2')));
select tests.authenticate_as('ann');
select is((select row(b_is_current, b_is_completed)::text from public.get_period_comparison(tests.id('cmp'), tests.id('c_p1'), tests.id('c_p2')) where kind = 'total'),
          row(true, false)::text, 'R-COMPARE-071: on its last day a period is current, not completed');

-- a period created again after a reopen (here by an early pay date) computes its interest on the
-- balance before its start: a payment and an adjustment on its first day do not count
select tests.clear_authentication();
select tests.set_today('2026-11-16');
select tests.authenticate_as('ann');
select tests.remember('sd', public.create_budget('Start day', 'Salary', 500000, 25, 'nearest', '2026-09-01'));
select tests.remember('sd_c', (select id from public.create_category(tests.id('sd'), 'Loans', p_amount => 1000,
  p_from_period_id => (select id from public.periods where budget_id = tests.id('sd') and seq = 1))));
select tests.remember('sd_d', (select id from public.create_debt(tests.id('sd'), 'Loan', 100000, tests.id('sd_c'), 1000, 12,
  (select id from public.periods where budget_id = tests.id('sd') and seq = 1))));
select tests.clear_authentication();
select tests.set_today('2026-11-26');
select tests.authenticate_as('ann');
select public.ensure_periods(tests.id('sd'));
select count(*) from public.add_transaction(tests.id('sd'), 'expense', 20000, '2026-11-25', tests.id('sd_c'), p_debt_id => tests.id('sd_d'));
select count(*) from public.adjust_debt_balance(tests.id('sd_d'), (select revision from public.debts where id = tests.id('sd_d')), 70000, '2026-11-25');
select tests.reopen_previous_period(tests.id('sd'));
select tests.record_early_pay_date(tests.id('sd'), '2026-11-25');
select is((select i.balance from public.debt_interest as i join public.periods as p on p.id = i.period_id
           where i.debt_id = tests.id('sd_d') and p.start_date = '2026-11-25'), 100000::bigint,
  'R-DEBT-180: a period created again computes its interest on the balance before its start (a payment and an adjustment on its first day are not before it)');

select * from finish();
rollback;
