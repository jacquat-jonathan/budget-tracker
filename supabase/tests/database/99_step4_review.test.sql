-- Step 4 review: each finding of the step 4 database review and the step 3 leftovers, with
-- the rule it protects. The projection's end against a walk of the periods the catch-up
-- creates; a decades-long absence; categories covering subscriptions and debts in every
-- period; the nominal day; nothing before a debt was opened; reads that write nothing when
-- nothing is due; charges never created again; and the contract additions (previews, terms in
-- a chosen period, totals, bulk confirmation, filters, paging).
begin;
select plan(97);

select tests.create_user('alice', 'Alice');
select tests.create_user('bob', 'Bob');
select tests.set_today('2027-02-26');

-- ===========================================================================
-- M1: the projected end follows the periods the catch-up will really create
-- (R-DEBT-005, R-PERIOD-131)
-- ===========================================================================
select tests.authenticate_as('alice');
select tests.remember('b', public.create_budget('Home', 'Salary', 600000, 25, 'nearest', '2027-01-01'));
select tests.remember('cat', (select id from public.create_category(tests.id('b'), 'Loans',
  p_from_period_id => (select id from public.periods where budget_id = tests.id('b') and seq = 1))));
-- the salary is expected five days early: the current period ends on 19 March, 1 to 14 days
-- before the regular pay date
select tests.set_expected_pay_date(tests.id('b'), '2027-03-20');
create temp table cur on commit drop as
  select p.* from public.periods as p where p.budget_id = tests.id('b') and private.today() between p.start_date and p.end_date;
grant select on cur to authenticated;
select is(
  (select array_agg(private.future_period_end(tests.id('b'), (select p from public.periods as p where p.id = (select id from cur)), k) order by k) from generate_series(1, 24) as k),
  (with recursive w (k, e) as (
     select 1, private.projected_end(tests.id('b'), (select end_date + 1 from cur), (select seq + 1 from cur))
     union all
     select k + 1, private.projected_end(tests.id('b'), e + 1, (select seq from cur) + k + 1) from w where k < 24)
   select array_agg(e order by k) from w),
  'R-PERIOD-131: the future period ends equal a walk of the catch-up''s own projection, after an end set five days early');
select tests.remember('car', (select id from public.create_debt(tests.id('b'), 'Car', 100000, tests.id('cat'), 30000)));
select is((select row(payoff, payments_left, expected_end_date)::text from public.debt_overview where id = tests.id('car')),
          (select row(status, payments_left, end_date)::text from tests.naive_projection(tests.id('car'))),
  'R-DEBT-005: the expected end is the end of the period the last payment falls in (naive walk)');
select is((select expected_end_date from public.debt_overview where id = tests.id('car')), '2027-06-24'::date,
  'R-DEBT-005: four payments, the last in 25 May - 24 June');
-- interest half up: 100 001 at 6 % with 33 500 a period ends after four payments (rounded down
-- it would take three)
select tests.remember('half', (select id from public.create_debt(tests.id('b'), 'Half up', 100001, tests.id('cat'), 33500, 6)));
select is((select row(payoff, payments_left)::text from public.debt_overview where id = tests.id('half')),
          (select row(status, payments_left)::text from tests.naive_projection(tests.id('half'))),
  'R-DEBT-112: the projection adds each period''s interest rounded half up (naive walk)');
select is((select payments_left from public.debt_overview where id = tests.id('half')), 4,
  'R-DEBT-112: four payments');
-- and the periods the catch-up then really creates
select tests.clear_authentication();
select tests.set_today('2027-06-30');
select tests.authenticate_as('alice');
select public.ensure_periods(tests.id('b'));
select is((select array_agg(end_date order by seq) from public.periods where budget_id = tests.id('b') and seq > (select seq from cur)),
          (select array_agg(private.future_period_end(tests.id('b'), (select p from public.periods as p where p.id = (select id from cur)), k) order by k) from generate_series(1, 4) as k),
  'R-PERIOD-131: and they are the periods the catch-up created');

-- ===========================================================================
-- M2: a budget nobody opened for 13 and for 40 years opens, each call making progress
-- (R-PERIOD-031, R-PERIOD-130)
-- ===========================================================================
select tests.clear_authentication();
select tests.set_today('2027-01-10');
select tests.authenticate_as('bob');
select tests.remember('old', public.create_budget('Old', 'Salary', 600000, 25));
select tests.remember('old_cat', (select id from public.create_category(tests.id('old'), 'Bills')));
select count(*) from generate_series(1, 3) as g cross join lateral
  public.create_subscription(tests.id('old'), 'S' || g, 1000 + g, 'monthly', tests.id('old_cat'), ('2027-01-' || (5 + g))::date) as s;
select tests.remember('old_debt', (select id from public.create_debt(tests.id('old'), 'D', 1000000, tests.id('old_cat'), 1000, 5)));
select tests.clear_authentication();
select tests.set_today('2040-01-20');
select tests.authenticate_as('bob');
select is(public.ensure_periods(tests.id('old')), 120, 'R-PERIOD-130: 13 years later, the first call creates 120 periods and keeps them');
select is((select caught_up from public.my_budgets where id = tests.id('old')), false, 'R-PERIOD-130: my_budgets says more remains');
select is((select count(*)::integer from public.get_current_period(tests.id('old'))), 1,
  'R-PERIOD-031: the next call succeeds and reaches the current period');
select is((select caught_up from public.my_budgets where id = tests.id('old')), true, 'R-PERIOD-130: the budget is caught up');
select is((select count(*)::integer from public.transactions where budget_id = tests.id('old')),
          (select count(*)::integer from public.subscriptions as s
           join public.subscription_versions as v on v.subscription_id = s.id
           cross join lateral tests.naive_charge_dates(v.anchor_date, 'monthly', v.charge_day,
             (select p.start_date from public.periods as p where p.budget_id = s.budget_id and p.seq = s.first_seq), '2040-01-20') as d
           where s.budget_id = tests.id('old')),
  'R-SUBSCRIPTION-073: every monthly charge of the 13 years exists, once');
select is((select count(*)::integer from public.debt_interest where debt_id = tests.id('old_debt')),
          (select count(*)::integer from public.periods where budget_id = tests.id('old')) - 1,
  'R-DEBT-111: one interest entry per period created');
select is_empty(format('select * from tests.step4_violations(%L)', tests.id('old')), 'R-DEBT-003: and the step 4 invariants hold');
-- 40 years: a write catches up in full; reads in steps
select tests.clear_authentication();
-- the steps are counted in periods (120 a call): the step's time bound (2 s) is lifted here, so
-- the count does not depend on the machine's speed (it is rolled back with the test)
create or replace function private.limit_catch_up_work() returns interval
language sql immutable set search_path = '' as $f$ select interval '1 hour' $f$;
select tests.set_today('2067-01-20');
select tests.authenticate_as('bob');
create temp table steps (n integer) on commit drop;
grant insert, select on steps to authenticated;
do $$
declare
  v integer;
begin
  for i in 1..10 loop
    v := public.ensure_periods(tests.id('old'));
    insert into steps values (v);
    exit when v = 0;
  end loop;
end $$;
select is((select array_agg(n) from steps), array[120, 120, 84, 0],
  'R-PERIOD-130: 27 more years: three calls of at most 120 periods, each succeeding, then nothing to do');
select is((select count(*)::integer from public.get_current_period(tests.id('old'))), 1, 'R-PERIOD-031: and the budget opens');
select ok((select count(*) from public.add_transaction(tests.id('old'), 'expense', 1, '2067-01-20', tests.id('old_cat'))) = 1,
  'R-PERIOD-130: a write works');
select is_empty(format('select * from tests.period_violations(%L)', tests.id('old')), 'R-PERIOD-005: the periods are valid');

-- ===========================================================================
-- S1: a subscription or debt always has a category in force (R-CATEGORY-130)
-- ===========================================================================
select tests.clear_authentication();
select tests.set_today('2027-02-26');
select tests.authenticate_as('alice');
select tests.remember('c', public.create_budget('Cover', 'Salary', 600000, 25, 'nearest', '2026-11-01'));
select tests.remember('c_p1', (select id from public.periods where budget_id = tests.id('c') and seq = 1));
select tests.remember('c_p3', (select id from public.periods where budget_id = tests.id('c') and seq = 3));
select tests.remember('c_old', (select id from public.create_category(tests.id('c'), 'Old', p_from_period_id => tests.id('c_p1'))));
select tests.remember('c_new', (select id from public.create_category(tests.id('c'), 'New')));
select public.end_category(tests.id('c_old'), (select revision from public.categories where id = tests.id('c_old')), tests.id('c_p3'));
select throws_ok(format($$select public.create_subscription(%L, 'x', 990, 'monthly', %L, '2026-12-01', %L)$$, tests.id('c'), tests.id('c_old'), tests.id('c_p1')),
  'P0001', 'category_not_in_force', 'R-CATEGORY-130: a subscription from period 1 on a category that ended in period 3 is refused');
select throws_ok(format($$select public.create_debt(%L, 'x', 1000, %L, 100, null, %L)$$, tests.id('c'), tests.id('c_old'), tests.id('c_p1')),
  'P0001', 'category_not_in_force', 'R-CATEGORY-130: so is a debt');
select throws_ok(format($$select public.create_subscription(%L, 'x', 990, 'monthly', %L, '2026-12-01', %L)$$, tests.id('c'), tests.id('c_new'), tests.id('c_p1')),
  'P0001', 'category_not_in_force', 'R-CATEGORY-130: and one on a category that starts later');
select tests.remember('c_sub', (select id from public.create_subscription(tests.id('c'), 'Ok', 990, 'monthly', tests.id('c_new'), '2027-02-01')));
select tests.remember('c_any', (select id from public.create_category(tests.id('c'), 'Any', p_from_period_id => tests.id('c_p1'))));
select tests.remember('c_sub1', (select id from public.create_subscription(tests.id('c'), 'Back', 500, 'monthly', tests.id('c_any'), '2026-12-01', tests.id('c_p1'))));
select throws_ok(format('select public.update_subscription(%L, %s, p_category_id => %L, p_from_period_id => %L)', tests.id('c_sub1'),
                        (select revision from public.subscriptions where id = tests.id('c_sub1')), tests.id('c_new'), tests.id('c_p1')),
  'P0001', 'category_not_in_force', 'R-CATEGORY-130: a correction cannot move it to a category not in force from then');
select throws_ok(format('select public.end_category(%L, %s, %L)', tests.id('c_any'), (select revision from public.categories where id = tests.id('c_any')), tests.id('c_p1')),
  'P0001', 'category_in_use', 'R-CATEGORY-130: nor can the category end from an earlier period under it');
select tests.clear_authentication();
create temp table detail (d text) on commit drop;
grant insert, select on detail to authenticated;
select tests.authenticate_as('alice');
do $$
begin
  perform public.end_category(tests.id('c_any'), (select revision from public.categories where id = tests.id('c_any')), tests.id('c_p3'));
exception when sqlstate 'P0001' then
  declare v text;
  begin
    get stacked diagnostics v = pg_exception_detail;
    insert into detail values (v);
  end;
end $$;
select is((select (d::jsonb -> 0 ->> 'name') || ' ' || (d::jsonb -> 0 ->> 'kind') from detail), 'Back subscription',
  'R-CATEGORY-131: the refusal''s detail names what uses the category');
select is_empty(format('select * from tests.step4_violations(%L)', tests.id('c')), 'R-CATEGORY-130: the invariant holds in every period');

-- the scheduled start of a period (R-PERIOD-133)
select is((select row(scheduled_start, accepted, refusal)::text from public.preview_move_period_start(tests.id('c_p3'))),
          row((select end_date + 1 from public.periods where budget_id = tests.id('c') and seq = 2), false, 'already_on_schedule')::text,
  'R-PERIOD-133: a period already on the schedule');

-- ===========================================================================
-- S2: the nominal day survives changes of cadence; the previews are what the write does
-- (R-SUBSCRIPTION-130, R-SUBSCRIPTION-133)
-- ===========================================================================
select tests.remember('d31', (select id from public.create_subscription(tests.id('c'), 'Day 31', 1000, 'monthly', tests.id('c_new'), '2027-01-31')));
select is((select array_agg(d) from public.preview_update_subscription(tests.id('d31'), p_cadence => 'quarterly', p_count => 3) as d),
          '{2027-02-28,2027-05-31,2027-08-31}'::date[],
  'R-SUBSCRIPTION-133: the preview of a change to quarterly: from the next charge, on the 31st, clamped');
select public.update_subscription(tests.id('d31'), (select revision from public.subscriptions where id = tests.id('d31')), p_cadence => 'quarterly');
select is((select row(anchor_date, charge_day)::text from public.subscription_overview where id = tests.id('d31')), row('2027-02-28'::date, 31)::text,
  'R-SUBSCRIPTION-130: re-anchored on 28 February, the nominal day stays the 31st');
select public.update_subscription(tests.id('d31'), (select revision from public.subscriptions where id = tests.id('d31')), p_cadence => 'monthly');
create temp table promised on commit drop as select d from public.preview_update_subscription(tests.id('d31'), p_count => 4) as d;
grant select on promised to authenticated;
select is((select array_agg(d order by d) from promised), '{2027-02-28,2027-03-31,2027-04-30,2027-05-31}'::date[],
  'R-SUBSCRIPTION-130: back to monthly, still on the 31st');
select tests.clear_authentication();
select tests.set_today('2027-06-01');
select tests.authenticate_as('alice');
select public.ensure_periods(tests.id('c'));
select is((select array_agg(charge_date order by charge_date) from public.transactions where subscription_id = tests.id('d31')),
          (select array_agg(d order by d) from promised),
  'R-SUBSCRIPTION-133: the charges really created are the ones the preview showed');
select is((select array_agg(charge_date order by charge_date) from public.preview_create_subscription(tests.id('c'), 'monthly', '2027-05-28', p_count => 2)),
          '{2027-05-28,2027-06-28}'::date[],
  'R-SUBSCRIPTION-133: the preview of a new subscription lists the charges of its first period');
select is((select array_agg(charged_at_once order by charge_date) from public.preview_create_subscription(tests.id('c'), 'monthly', '2027-05-28', p_count => 2)),
          '{t,f}'::boolean[], 'R-SUBSCRIPTION-133: and which of them are created at once');
select throws_ok(format($$select public.preview_update_subscription(%L, p_next_charge_date => '2027-06-01')$$, tests.id('d31')),
  'P0001', 'invalid_charge_date', 'R-SUBSCRIPTION-133: the preview answers the write''s errors');

-- ===========================================================================
-- S3: the principal is the balance on opened_on (R-DEBT-131)
-- ===========================================================================
select tests.remember('loan', (select id from public.create_debt(tests.id('c'), 'Loan', 100000, tests.id('c_new'), 10000)));
select throws_ok(format($$select public.add_transaction(%L, 'expense', 100, '2027-05-27', %L, p_debt_id => %L)$$, tests.id('c'), tests.id('c_new'), tests.id('loan')),
  'P0001', 'before_debt_opened', 'R-DEBT-131: a payment dated before the debt was opened is refused');
select tests.remember('early_tx', (select id from public.add_transaction(tests.id('c'), 'expense', 100, '2027-05-27', tests.id('c_new'))));
select throws_ok(format('select public.link_transaction(%L, 1, %L)', tests.id('early_tx'), tests.id('loan')),
  'P0001', 'before_debt_opened', 'R-DEBT-131: so is linking one');
select tests.remember('pay', (select id from public.add_transaction(tests.id('c'), 'expense', 100, '2027-06-01', tests.id('c_new'), p_debt_id => tests.id('loan'))));
select throws_ok(format($$select public.update_transaction(%L, 1, 'expense', 100, '2027-05-27', %L)$$, tests.id('pay'), tests.id('c_new')),
  'P0001', 'before_debt_opened', 'R-DEBT-131: and moving a payment before it');
select throws_ok(format($$select public.adjust_debt_balance(%L, %s, 5000, '2027-05-27')$$, tests.id('loan'), (select revision from public.debts where id = tests.id('loan'))),
  'P0001', 'before_debt_opened', 'R-DEBT-131: and an adjustment dated before it');
select tests.remember('old_loan', (select id from public.create_debt(tests.id('c'), 'Old loan', 100000, tests.id('c_any'), 10000, null, tests.id('c_p1'))));
select ok((select count(*) from public.add_transaction(tests.id('c'), 'expense', 100, (select start_date + 1 from public.periods where id = tests.id('c_p1')),
                                                        tests.id('c_any'), p_debt_id => tests.id('old_loan'))) = 1,
  'R-DEBT-131: a debt recorded from an earlier period takes payments from that period''s start');
select is((select kind from public.get_debt_history(tests.id('old_loan')) limit 1), 'opened', 'R-DEBT-131: its history starts with the principal');

-- ===========================================================================
-- S4: reads write nothing when nothing is due (R-SUBSCRIPTION-131, R-SECURITY-006)
-- ===========================================================================
create temp table before_day on commit drop as
  select id, revision, updated_at, charged_through, next_due from public.subscriptions where budget_id = tests.id('c');
grant select on before_day to authenticated;
select tests.clear_authentication();
select tests.set_today('2027-06-02');
select tests.authenticate_as('alice');
select is((select count(*)::integer from public.get_current_period(tests.id('c'))), 1, 'setup: the next day');
select is((select count(*)::integer from public.subscriptions as s join before_day as b using (id)
           where (s.revision, s.updated_at, s.charged_through) is distinct from (b.revision, b.updated_at, b.charged_through)), 0,
  'R-SUBSCRIPTION-131: crossing a day with no charge due changes no subscription row');
select is((select count(*)::integer from public.subscriptions where budget_id = tests.id('c') and end_seq is null and next_due <= private.today()), 0,
  'R-SUBSCRIPTION-131: and no subscription is due');

-- ===========================================================================
-- S5: a charge dismissed on its own date never comes back (R-SUBSCRIPTION-111)
-- ===========================================================================
select tests.remember('daily', (select id from public.create_subscription(tests.id('c'), 'Due today', 700, 'monthly', tests.id('c_new'), '2027-06-02')));
select tests.remember('ch', (select id from public.transactions where subscription_id = tests.id('daily') and charge_date = '2027-06-02'));
select public.dismiss_subscription_charge(tests.id('ch'), 1);
select tests.clear_authentication();
select tests.set_today('2027-07-03');
select tests.authenticate_as('alice');
select public.ensure_periods(tests.id('c'));
select is((select array_agg(charge_date) from public.transactions where subscription_id = tests.id('daily')), '{2027-07-02}'::date[],
  'R-SUBSCRIPTION-111: the next charge is created, the one dismissed on its own date is not');

-- charges held back by the limit keep the price of their own period
select tests.remember('h', public.create_budget('Held', 'Salary', 600000, 25, 'nearest', '2027-04-01'));
select tests.remember('h_cat', (select id from public.create_category(tests.id('h'), 'Bills')));
select tests.remember('h_sub', (select id from public.create_subscription(tests.id('h'), 'Held', 1000, 'monthly', tests.id('h_cat'), '2027-07-03')));
select tests.clear_authentication();
create temp table hn on commit drop as select count(*)::integer as n from public.transactions where budget_id = tests.id('h');
do $$ begin
  execute format('create or replace function private.limit_transactions() returns integer language sql immutable set search_path = '''' as $f$ select %s $f$', (select n from hn));
end $$;
select tests.set_today('2027-09-05');
select tests.authenticate_as('alice');
select public.ensure_periods(tests.id('h'));
select public.update_subscription(tests.id('h_sub'), (select revision from public.subscriptions where id = tests.id('h_sub')), p_price => 2000);
select tests.clear_authentication();
do $$ begin
  execute 'create or replace function private.limit_transactions() returns integer language sql immutable set search_path = '''' as $f$ select 50000 $f$';
end $$;
select tests.authenticate_as('alice');
select public.ensure_periods(tests.id('h'));
select is((select array_agg(row(charge_date, amount)::text order by charge_date) from public.transactions where subscription_id = tests.id('h_sub')),
          array[row('2027-07-03'::date, 1000)::text, row('2027-08-03'::date, 1000)::text, row('2027-09-03'::date, 2000)::text],
  'R-SUBSCRIPTION-112: charges held back by the limit are created at the price in force in their own period');

-- ===========================================================================
-- Contract additions
-- ===========================================================================
-- bulk confirmation (R-SUBSCRIPTION-134)
select is(public.confirm_subscription_charges(tests.id('h'), '2027-08-31'), 2, 'R-SUBSCRIPTION-134: one call confirms every awaiting charge up to a date');
select is(public.confirm_subscription_charges(tests.id('h')), 1, 'R-SUBSCRIPTION-134: again: only the one left');
select is(public.confirm_subscription_charges(tests.id('h')), 0, 'R-SUBSCRIPTION-134: a retry confirms nothing more');
select throws_ok(format('select public.confirm_subscription_charges(%L)', tests.id('old')), 'P0001', 'budget_not_found',
  'R-SUBSCRIPTION-134: members only');
-- the awaiting count and filters (R-SUBSCRIPTION-135, R-TRANSACTION-132)
select is((select charges_awaiting from public.my_budgets where id = tests.id('c')),
          (select count(*)::integer from public.transactions where budget_id = tests.id('c') and review_state = 'awaiting_confirmation'),
  'R-SUBSCRIPTION-135: my_budgets counts the charges awaiting confirmation');
select is((select count(*)::integer from public.list_transactions(tests.id('c'), 200, p_awaiting_only => true)),
          (select charges_awaiting from public.my_budgets where id = tests.id('c')),
  'R-TRANSACTION-132: list_transactions lists only them');
select is((select array_agg(distinct subscription_id) from public.list_transactions(tests.id('c'), 200, p_subscription_id => tests.id('d31'))),
          array[tests.id('d31')], 'R-TRANSACTION-132: or one subscription''s');
select is((select array_agg(id) from public.list_transactions(tests.id('c'), 200, p_debt_id => tests.id('loan'))), array[tests.id('pay')],
  'R-TRANSACTION-132: or one debt''s payments');
select throws_ok(format('select public.list_transactions(%L, p_debt_id => %L)', tests.id('h'), tests.id('loan')), 'P0001', 'debt_not_found',
  'R-TRANSACTION-132: a debt of another budget is not found');
-- history pages (R-DEBT-135)
select count(*) from generate_series(1, 5) as g cross join lateral (select 1) as one
  where (select count(*) from public.add_transaction(tests.id('c'), 'expense', g, ('2027-07-0' || g)::date, tests.id('c_new'), p_debt_id => tests.id('loan'))) = 1;
create temp table page1 on commit drop as select * from public.get_debt_history(tests.id('loan'), 3);
grant select on page1 to authenticated;
select is((select count(*)::integer from page1), 3, 'R-DEBT-135: a page has at most p_limit rows');
select is((select array_agg(h.kind || h.balance order by h.date, h.created_at)
           from public.get_debt_history(tests.id('loan'), 10,
             (select date from page1 order by date desc, created_at desc limit 1), (select kind from page1 order by date desc, created_at desc limit 1),
             (select created_at from page1 order by date desc, created_at desc limit 1), (select entry_id from page1 order by date desc, created_at desc limit 1)) as h),
          (select array_agg(h.kind || h.balance order by h.date, h.created_at) from (select * from public.get_debt_history(tests.id('loan'), 1000) offset 3) as h),
  'R-DEBT-135: the next page continues after the last row, balances over the whole history');
select throws_ok(format('select public.get_debt_history(%L, 1001)', tests.id('loan')), 'P0001', 'invalid_limit', 'R-DEBT-135: at most 1000 rows');
-- totals, overpaid, paid share (R-DEBT-133, R-DEBT-136, R-DEBT-137)
select tests.remember('over', (select id from public.create_debt(tests.id('c'), 'Over', 100, tests.id('c_new'), 0)));
select public.add_transaction(tests.id('c'), 'expense', 200, private.today(), tests.id('c_new'), p_debt_id => tests.id('over'));
select is((select row(remaining, overpaid_by, paid_percent)::text from public.debt_overview where id = tests.id('over')), row(-100, 100, 100)::text,
  'R-DEBT-136 R-DEBT-137: an overpaid debt: overpaid by 100, 100 % paid');
select is((select row(remaining_total, owing_count)::text from public.debt_totals where budget_id = tests.id('c')),
          (select row(sum(greatest(remaining, 0)), count(*) filter (where remaining > 0))::text from public.debt_overview where budget_id = tests.id('c') and is_active),
  'R-DEBT-133: the total counts only what is still owed, and how many debts still owe');
select tests.remember('zero', (select id from public.create_debt(tests.id('c'), 'Zero', 5000, tests.id('c_new'), 0)));
select public.adjust_debt_balance(tests.id('zero'), 1, 0);
select is((select row(paid_percent, payoff)::text from public.debt_overview where id = tests.id('zero')), row(100, 'paid_off')::text,
  'R-DEBT-137: adjusted to zero: 100 %, beside "paid off"');
select is((select paid_percent from public.debt_overview where id = tests.id('loan')),
          (select (100 * paid_total / (principal + interest_total + adjustment_total))::integer from public.debt_overview where id = tests.id('loan')),
  'R-DEBT-137: otherwise the payments as a share of what was owed, rounded down');
-- an ended debt is frozen (R-DEBT-134)
select public.remove_debt(tests.id('loan'), (select revision from public.debts where id = tests.id('loan')));
select throws_ok(format('select public.adjust_debt_balance(%L, %s, 0)', tests.id('loan'), (select revision from public.debts where id = tests.id('loan'))),
  'P0001', 'debt_ended', 'R-DEBT-134: an ended debt takes no adjustment');
select throws_ok(format($$select public.add_transaction(%L, 'expense', 1, '2027-06-02', %L, p_debt_id => %L)$$, tests.id('c'), tests.id('c_new'), tests.id('loan')),
  'P0001', 'debt_ended', 'R-DEBT-134: nor a payment, even dated where it was in force');
select throws_ok(format('select public.delete_transaction(%L, %s)', tests.id('pay'), (select revision from public.transactions where id = tests.id('pay'))),
  'P0001', 'debt_ended', 'R-DEBT-134: and its payments cannot be removed');
-- previews of an end from a period (R-SUBSCRIPTION-136, R-DEBT-138)
select tests.remember('fresh_sub', (select id from public.create_subscription(tests.id('c'), 'Fresh', 100, 'monthly', tests.id('c_new'), '2027-12-01')));
select is((select outcome from public.preview_end_subscription(tests.id('fresh_sub'))), 'deleted', 'R-SUBSCRIPTION-136: a new subscription without charges would be deleted');
select is((select outcome from public.preview_end_subscription(tests.id('c_sub1'), tests.id('c_p3'))), 'ended', 'R-SUBSCRIPTION-136: one with charges, from period 3, ended');
select is((select outcome from public.preview_end_subscription(tests.id('c_sub1'), tests.id('c_p1'))), 'ended', 'R-SUBSCRIPTION-136: and from period 1 too (it has charges)');
select is((select refusal from public.preview_remove_debt(tests.id('loan'))), 'debt_ended', 'R-DEBT-138: an ended debt: the refusal');
select is((select outcome from public.preview_remove_debt(tests.id('zero'))), 'ended', 'R-DEBT-138: a debt with an adjustment would end');
-- terms in a chosen period (R-VERSION-132)
select public.update_subscription(tests.id('c_sub1'), (select revision from public.subscriptions where id = tests.id('c_sub1')), p_price => 900);
select is((select row(price, terms_from_period_id = tests.id('c_p1'), until_period_id is not null)::text from public.get_subscription_terms(tests.id('c_sub1'), tests.id('c_p3'))),
          row(500, true, true)::text,
  'R-VERSION-132: the terms in force in period 3, since period 1, until the next change');
select is((select until_period_id from public.get_subscription_terms(tests.id('c_sub1'), tests.id('c_p3'))),
          (select id from public.periods where budget_id = tests.id('c') and private.today() between start_date and end_date),
  'R-VERSION-133: a correction from there runs up to the next change, which is the current period');
select is((select row(amount, in_force)::text from public.get_category_terms(tests.id('c_any'), tests.id('c_p1'))), row(0, true)::text,
  'R-VERSION-132: categories too');
select is((select row(amount, pay_day)::text from public.get_income_terms((select primary_income_id from public.budgets where id = tests.id('c')), tests.id('c_p1'))),
          row(600000, 25)::text, 'R-VERSION-132: and incomes');
select is((select row(category_id = tests.id('c_any'), monthly_payment)::text from public.get_debt_terms(tests.id('old_loan'), tests.id('c_p1'))),
          row(true, 10000)::text, 'R-VERSION-132: and debts');

-- an atomic change of a payment and its link (R-TRANSACTION-131)
select tests.remember('t2', (select id from public.add_transaction(tests.id('c'), 'expense', 300, '2027-07-03', tests.id('c_any'), p_debt_id => tests.id('old_loan'))));
select is((select row(amount, debt_id is null, subscription_id = tests.id('c_sub1'))::text
           from public.update_transaction(tests.id('t2'), 1, 'expense', 350, '2027-07-03', tests.id('c_any'), null, true, null, tests.id('c_sub1'))),
          row(350, true, true)::text, 'R-TRANSACTION-131: one call changes a payment and moves its link');
select throws_ok(format($$select public.update_transaction(%L, 2, 'refund', 350, '2027-07-03', %L, null, true, %L)$$, tests.id('t2'), tests.id('c_any'), tests.id('old_loan')),
  'P0001', 'invalid_link', 'R-TRANSACTION-131: checked against the new fields, all or nothing');
select is((select row(amount, subscription_id = tests.id('c_sub1'))::text from public.transactions where id = tests.id('t2')), row(350, true)::text,
  'R-TRANSACTION-131: a refused change leaves the transaction as it was');

-- the projection after the budget's end (R-DEBT-132, R-SUBSCRIPTION-132)
select tests.remember('e', public.create_budget('Ending', 'Salary', 600000, 25));
select tests.remember('e_cat', (select id from public.create_category(tests.id('e'), 'Bills')));
select tests.remember('e_debt', (select id from public.create_debt(tests.id('e'), 'Long', 1000000, tests.id('e_cat'), 50000)));
select tests.remember('e_sub', (select id from public.create_subscription(tests.id('e'), 'Yearly', 1000, 'yearly', tests.id('e_cat'), '2028-01-01')));
select tests.set_budget_end_date(tests.id('e'), '2027-09-30');
select is((select expected_end_after_budget_end from public.debt_overview where id = tests.id('e_debt')), true,
  'R-DEBT-132: a projected end after the budget''s end says so');
select is((select next_charge_date from public.subscription_overview where id = tests.id('e_sub')), null::date,
  'R-SUBSCRIPTION-132: a next charge after the budget''s end is not shown (it will never be charged)');

-- ===========================================================================
-- Step 3 leftovers
-- ===========================================================================
-- a change to a subcategory makes a stale removal of its group answer record_changed
-- (R-CONCURRENCY-130)
select tests.remember('g', (select id from public.create_category(tests.id('c'), 'Groceries')));
select tests.remember('g_market', (select id from public.create_category(tests.id('c'), 'Market', tests.id('g'), 1000, p_other_name => 'Other')));
create temp table g_rev on commit drop as select revision from public.categories where id = tests.id('g');
grant select on g_rev to authenticated;
select tests.authenticate_as('alice');
select public.create_category(tests.id('c'), 'Bakery', tests.id('g'));
select throws_ok(format('select public.end_category(%L, %s)', tests.id('g'), (select revision from g_rev)), 'P0001', 'record_changed',
  'R-CONCURRENCY-130: a group''s removal from before a subcategory was added is refused');
select public.update_category(tests.id('g_market'), (select revision from public.categories where id = tests.id('g_market')), p_amount => 1200);
select ok((select revision from public.categories where id = tests.id('g')) > (select revision from g_rev) + 1,
  'R-CONCURRENCY-130: and a change of a subcategory''s amount moves the group''s revision too');
select public.reorder_categories(tests.id('c'), array(select id from public.categories where parent_id = tests.id('g') and end_seq is null order by name desc), tests.id('g'));
-- making an income primary invalidates edits of both incomes (R-CONCURRENCY-131)
select tests.remember('side', public.add_income(tests.id('c'), 'Side', 100000, 10));
create temp table inc on commit drop as
  select (select revision from public.incomes where id = tests.id('side')) as side_rev,
         (select primary_income_id from public.budgets where id = tests.id('c')) as old_primary,
         (select revision from public.incomes where id = (select primary_income_id from public.budgets where id = tests.id('c'))) as old_rev;
grant select on inc to authenticated;
select tests.set_primary_income(tests.id('side'));
select throws_ok(format('select public.update_income(%L, %s, p_pay_day => 12)', tests.id('side'), (select side_rev from inc)), 'P0001', 'record_changed',
  'R-CONCURRENCY-131: an edit opened before the income became primary is refused');
select throws_ok(format('select public.update_income(%L, %s, p_pay_day => 12)', (select old_primary from inc), (select old_rev from inc)), 'P0001', 'record_changed',
  'R-CONCURRENCY-131: so is one of the income that stopped being primary');
select throws_ok(format('select public.update_income(%L, %s, p_pay_day => 2)', tests.id('side'), (select revision from public.incomes where id = tests.id('side'))),
  'P0001', 'preview_required', 'R-PERIOD-134: the primary''s new pay day that moves the period end needs the previewed end');
-- undoing a reopen leaves the boundary on the schedule (R-PERIOD-132)
create temp table cp on commit drop as select p.start_date from public.periods as p where p.budget_id = tests.id('h') and private.today() between p.start_date and p.end_date;
grant select on cp to authenticated;
select tests.reopen_previous_period(tests.id('h'), private.today() + 1);
select tests.record_early_pay_date(tests.id('h'), (select start_date from cp));
select is((select end_is_manual from public.periods where budget_id = tests.id('h') and end_date = (select start_date - 1 from cp)), false,
  'R-PERIOD-132: undoing a reopen with the original date leaves the boundary on the schedule, not set by hand');
-- extending stretches the first version (R-VERSION-131)
select tests.remember('rent', (select id from public.create_category(tests.id('c'), 'Rent', p_amount => 150000)));
select public.extend_category(tests.id('rent'), (select revision from public.categories where id = tests.id('rent')), tests.id('c_p1'));
select public.update_category(tests.id('rent'), (select revision from public.categories where id = tests.id('rent')), p_amount => 155000, p_from_period_id => tests.id('c_p1'));
select is((select array_agg(amount order by effective_from_seq) from public.category_expectations where category_id = tests.id('rent')), array[155000]::bigint[],
  'R-VERSION-131: a correction from the new first period runs to the next change the user made: there is none');
-- no version is left at an end after a reopen (R-VERSION-130), and no void category nothing
-- references (D-208)
select tests.remember('r', public.create_budget('Reopen', 'Salary', 600000, 25, 'nearest', '2027-05-01'));
select tests.remember('r_prev', (select id from public.periods where budget_id = tests.id('r') and seq = (select max(seq) - 1 from public.periods where budget_id = tests.id('r'))));
select tests.remember('r_tmp', (select id from public.create_category(tests.id('r'), 'Tmp', p_from_period_id => tests.id('r_prev'))));
select tests.remember('r_sub', (select id from public.create_subscription(tests.id('r'), 'Tmp', 100, 'monthly', tests.id('r_tmp'), '2027-12-01', tests.id('r_prev'))));
select tests.remember('r_debt', (select id from public.create_debt(tests.id('r'), 'Tmp', 100, tests.id('r_tmp'), 10, null, tests.id('r_prev'))));
select public.end_subscription(tests.id('r_sub'), (select revision from public.subscriptions where id = tests.id('r_sub')));
select public.remove_debt(tests.id('r_debt'), (select revision from public.debts where id = tests.id('r_debt')));
select public.end_category(tests.id('r_tmp'), (select revision from public.categories where id = tests.id('r_tmp')));
select tests.remember('r_old', (select id from public.create_category(tests.id('r'), 'Older', p_from_period_id => tests.id('r_prev'), p_amount => 100)));
select public.update_category(tests.id('r_old'), (select revision from public.categories where id = tests.id('r_old')), p_amount => 200);
select public.end_category(tests.id('r_old'), (select revision from public.categories where id = tests.id('r_old')),
  (select id from public.periods where budget_id = tests.id('r') and private.today() between start_date and end_date));
select is((select array_agg(record_kind || ' ' || change order by record_kind) from public.preview_reopen(tests.id('r')) where record_name = 'Tmp'),
          array['category removed', 'debt removed', 'subscription removed'], 'setup: a category, a subscription and a debt that the reopen removes');
select tests.reopen_previous_period(tests.id('r'), private.today() + 1);
select is((select count(*)::integer from public.categories where id = tests.id('r_tmp')), 0,
  'R-VERSION-130: a category whose only referrers the reopen removes is deleted too, not left void (D-208)');
select is_empty(format('select * from tests.step4_violations(%L)', tests.id('r')), 'R-VERSION-130: no version is left at or after an end');
-- ===========================================================================
-- An ended budget: which step 4 operations it still allows (R-BUDGET-130, D-206)
-- ===========================================================================
select tests.clear_authentication();
select tests.set_today('2068-01-10');
select tests.authenticate_as('alice');
select tests.remember('e', public.create_budget('Ending', 'Salary', 600000, 25, 'nearest', '2067-11-01'));
select tests.remember('e_cat', (select id from public.create_category(tests.id('e'), 'Bills',
  p_from_period_id => (select id from public.periods where budget_id = tests.id('e') and seq = 1))));
select tests.remember('e_sub', (select id from public.create_subscription(tests.id('e'), 'Gym', 4000, 'monthly', tests.id('e_cat'), '2067-11-05',
  (select id from public.periods where budget_id = tests.id('e') and seq = 1))));
select tests.remember('e_debt', (select id from public.create_debt(tests.id('e'), 'Loan', 100000, tests.id('e_cat'), 10000,
  p_from_period_id => (select id from public.periods where budget_id = tests.id('e') and seq = 1))));
select tests.set_budget_end_date(tests.id('e'), '2068-01-10');
select tests.clear_authentication();
select tests.set_today('2068-03-15');
select tests.authenticate_as('alice');
select is_empty(format('select * from public.get_current_period(%L)', tests.id('e')), 'setup: the budget has ended');
select throws_ok(format('select public.create_subscription(%L, %L, 100, %L, %L, %L)', tests.id('e'), 'New', 'monthly', tests.id('e_cat'), '2068-01-01'),
  'P0001', 'budget_ended', 'R-BUDGET-130: no subscription from now in an ended budget');
select throws_ok(format('select public.update_debt(%L, %s, p_monthly_payment => 5)', tests.id('e_debt'), (select revision from public.debts where id = tests.id('e_debt'))),
  'P0001', 'budget_ended', 'R-BUDGET-130: no new terms from now');
select is((select refusal from public.preview_end_subscription(tests.id('e_sub'))), 'budget_ended',
  'R-BUDGET-130: the removal preview says why');
select lives_ok(format('select public.update_subscription(%L, %s, p_price => 4500, p_from_period_id => %L)', tests.id('e_sub'),
  (select revision from public.subscriptions where id = tests.id('e_sub')), (select id from public.periods where budget_id = tests.id('e') and seq = 2)),
  'R-BUDGET-130: a correction from an earlier period is allowed');
select is_empty(format('select * from public.preview_update_subscription(%L, p_price => 4600, p_from_period_id => %L)', tests.id('e_sub'),
  (select id from public.periods where budget_id = tests.id('e') and seq = 2)),
  'R-BUDGET-130: and its preview: no charge is still to come');
select ok(public.confirm_subscription_charges(tests.id('e')) > 0, 'R-BUDGET-130: the charges are still answered');
select lives_ok(format('select public.add_transaction(%L, %L, 10000, %L, %L, p_debt_id => %L)', tests.id('e'), 'expense', '2068-01-20', tests.id('e_cat'), tests.id('e_debt')),
  'R-BUDGET-130: a payment dated in its periods is recorded');
select public.adjust_debt_balance(tests.id('e_debt'), (select revision from public.debts where id = tests.id('e_debt')), 50000);
select is((select date from public.debt_adjustments where debt_id = tests.id('e_debt')),
          (select max(end_date) from public.periods where budget_id = tests.id('e')),
  'R-BUDGET-130: an adjustment without a date is dated on the budget''s last day (D-206)');

-- the deferred checks, on the latest day this test reached (its sections run on several)
select tests.clear_authentication();
select tests.set_today('2068-03-15');
select lives_ok('set constraints all immediate', 'R-CATEGORY-130: the deferred invariants hold at commit');
set constraints all deferred;

select * from finish();
rollback;
