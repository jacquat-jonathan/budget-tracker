-- Subscriptions (step 4): the charge schedule, automatic charges and their confirmation, the
-- committed figure, versioned terms and corrections, ending and deleting, catch-up after a long
-- absence, the transaction limit, categories in use, and a reopen with subscription changes.
begin;
select plan(125);

select tests.create_user('alice', 'Alice');
select tests.create_user('bob', 'Bob');
select tests.set_today('2026-11-16');

-- ===========================================================================
-- The schedule, pure (R-SUBSCRIPTION-071, R-SUBSCRIPTION-072)
-- ===========================================================================
create temp table schedule_cases (anchor date, cadence public.subscription_cadence, from_date date, n integer, expected date[], why text) on commit drop;
insert into schedule_cases values
  ('2026-01-31', 'monthly', null, 4, '{2026-01-31,2026-02-28,2026-03-31,2026-04-30}', 'monthly from 31 January, clamped to each month''s length'),
  ('2024-01-31', 'monthly', null, 3, '{2024-01-31,2024-02-29,2024-03-31}', 'a leap year''s February has 29 days'),
  ('2026-01-30', 'monthly', null, 3, '{2026-01-30,2026-02-28,2026-03-30}', 'the day comes back after a short month (30, 28, 30)'),
  ('2025-11-30', 'quarterly', null, 5, '{2025-11-30,2026-02-28,2026-05-30,2026-08-30,2026-11-30}', 'quarterly across a year boundary'),
  ('2026-08-31', 'half_yearly', null, 3, '{2026-08-31,2027-02-28,2027-08-31}', 'half-yearly from 31 August'),
  ('2024-02-29', 'yearly', null, 5, '{2024-02-29,2025-02-28,2026-02-28,2027-02-28,2028-02-29}', 'yearly from 29 February: 28 February in other years'),
  ('2026-12-15', 'monthly', null, 3, '{2026-12-15,2027-01-15,2027-02-15}', 'monthly across a year boundary'),
  ('2026-12-31', 'quarterly', null, 4, '{2026-12-31,2027-03-31,2027-06-30,2027-09-30}', 'quarterly from 31 December'),
  ('2026-11-14', 'monthly', null, 3, '{2026-11-14,2026-12-14,2027-01-14}', 'no weekend rule: 14 November 2026 is a Saturday and stays'),
  ('2026-01-31', 'monthly', '2026-03-01', 2, '{2026-03-31,2026-04-30}', 'from a later date: the schedule keeps its day'),
  ('2026-05-10', 'yearly', '2026-01-01', 2, '{2026-05-10,2027-05-10}', 'from a date before the first charge: starts at the first charge');

select is(
  (select array_agg(d order by d) from public.subscription_charge_dates(c.anchor, c.cadence, c.from_date, c.n) as d),
  c.expected,
  'R-SUBSCRIPTION-071 R-SUBSCRIPTION-072: ' || c.why)
from schedule_cases as c;

select is(private.next_charge_date('2026-01-31', 'monthly', '2026-11-16'), '2026-11-30'::date,
  'R-SUBSCRIPTION-002: the next charge after a day, monthly');
select is(private.next_charge_date('2026-01-31', 'monthly', '2026-11-30'), '2026-12-31'::date,
  'R-SUBSCRIPTION-002: after a charge date, the following one');
select is(private.next_charge_date('2027-03-05', 'yearly', '2026-11-16'), '2027-03-05'::date,
  'R-SUBSCRIPTION-002: a first charge in the future is the next one');
select is(private.next_charge_date('2024-02-29', 'yearly', '2027-03-01'), '2028-02-29'::date,
  'R-SUBSCRIPTION-002: yearly from 29 February, the next one in a leap year');

-- Q-050, D-173: the monthly cost, rounded half up
create temp table cost_cases (price bigint, cadence public.subscription_cadence, expected bigint) on commit drop;
insert into cost_cases values (1990, 'monthly', 1990), (1000, 'quarterly', 333), (1001, 'quarterly', 334),
  (1000, 'half_yearly', 167), (12006, 'yearly', 1001), (18, 'yearly', 2), (6, 'yearly', 1), (5, 'yearly', 0),
  (3, 'half_yearly', 1), (1000000000, 'yearly', 83333333);
select is(private.subscription_monthly_cost(c.price, c.cadence), c.expected,
  format('R-SUBSCRIPTION-079: %s %s costs %s a month (price / months, half up)', c.price, c.cadence, c.expected))
from cost_cases as c;

select throws_ok($$select public.subscription_charge_dates('2026-01-01', 'monthly', null, 61)$$, 'P0001', 'invalid_limit',
  'R-SUBSCRIPTION-071: at most 60 dates');
select throws_ok($$select public.subscription_charge_dates('infinity', 'monthly')$$, 'P0001', 'invalid_charge_date',
  'R-SUBSCRIPTION-071: an invalid date is refused');

-- ===========================================================================
-- A budget: periods 1 (25 Aug - 24 Sep), 2 (25 Sep - 25 Oct), 3 (26 Oct - 24 Nov, current)
-- ===========================================================================
select tests.authenticate_as('alice');
select tests.remember('b', public.create_budget('Home', 'Salary', 600000, 25, 'nearest', '2026-08-01'));
select tests.remember('p1', (select id from public.periods where budget_id = tests.id('b') and seq = 1));
select tests.remember('p2', (select id from public.periods where budget_id = tests.id('b') and seq = 2));
select tests.remember('p3', (select id from public.periods where budget_id = tests.id('b') and seq = 3));
select tests.remember('streaming', (select id from public.create_category(tests.id('b'), 'Streaming', p_amount => 5000, p_from_period_id => tests.id('p1'))));
select tests.remember('sport', (select id from public.create_category(tests.id('b'), 'Sport', p_amount => 3000, p_from_period_id => tests.id('p1'))));
select tests.remember('inv', public.invite_member(tests.id('b'), tests.get_user_email('bob')));
select tests.authenticate_as('bob');
select public.accept_invitation(tests.id('inv'));
select tests.authenticate_as('alice');

create temp table totals_before as
  select seq, spent_total, committed_total from public.period_summaries where budget_id = tests.id('b');

-- ===========================================================================
-- Creating: a first charge in the past, charges due created at once (R-SUBSCRIPTION-073)
-- ===========================================================================
select tests.remember('netflix', (select id from public.create_subscription(tests.id('b'), 'Netflix', 1990, 'monthly', tests.id('streaming'), '2026-01-31')));
select is((select row(first_seq, end_seq, price, cadence, anchor_date, monthly_cost, next_charge_date, charge_count, awaiting_count, charged_through)::text
           from public.subscription_overview where id = tests.id('netflix')),
          row(3, null::integer, 1990, 'monthly', '2026-01-31', 1990, '2026-11-30', 1, 1, '2026-11-16')::text,
  'R-SUBSCRIPTION-001 R-SUBSCRIPTION-002: a subscription has a price, a first charge date, a cadence and a category, and shows its next charge');
select is((select array_agg(row(date, amount, category_id = tests.id('streaming'), charge_date, review_state, kind, recorded_by)::text)
           from public.transactions where subscription_id = tests.id('netflix')),
          array[row('2026-10-31'::date, 1990, true, '2026-10-31'::date, 'awaiting_confirmation', 'expense', null::uuid)::text],
  'R-SUBSCRIPTION-073 R-SUBSCRIPTION-075: the charge due in its first period is created, in its category, linked, awaiting confirmation');
select is((select row(subscription_name, charge_date, review_state, recorded_by_name)::text from public.transaction_list where subscription_id = tests.id('netflix')),
          row('Netflix', '2026-10-31'::date, 'awaiting_confirmation', null::text)::text,
  'R-SUBSCRIPTION-075: transaction_list marks it as coming from the subscription and awaiting confirmation');
select is((select spent_total from public.period_summaries where id = tests.id('p3')),
          (select spent_total from totals_before where seq = 3) + 1990,
  'R-SUBSCRIPTION-078: a charge awaiting confirmation counts in the totals at once');
select is((select array_agg(spent_total order by seq) from public.period_summaries where budget_id = tests.id('b') and seq < 3),
          (select array_agg(spent_total order by seq) from totals_before where seq < 3),
  'R-SUBSCRIPTION-112: closed periods are untouched by a subscription created now');
select is((select committed_total from public.period_summaries where id = tests.id('p3')), 1990::bigint,
  'R-SUBSCRIPTION-079: its monthly cost is committed in the current period');
select is((select committed_total from public.period_summaries where id = tests.id('p2')), 0::bigint,
  'R-SUBSCRIPTION-079: and not in the periods before it');
select is((select row(expected, committed, spent)::text from public.get_period_progress(tests.id('p3')) where category_id = tests.id('streaming')),
          row(5000, 1990, 1990)::text,
  'R-SUBSCRIPTION-079: the committed amount is shown inside the category''s expectation, which does not change');
select is((select row(amount, committed_amount, in_use)::text from public.category_overview where id = tests.id('streaming')),
          row(5000, 1990, true)::text,
  'R-SUBSCRIPTION-079 R-CATEGORY-110: the category shows what is committed, and that it is in use');

-- A first charge in the future: nothing yet.
select tests.remember('gym', (select id from public.create_subscription(tests.id('b'), 'Gym', 6000, 'quarterly', tests.id('sport'), '2027-01-10')));
select is((select row(charge_count, next_charge_date, monthly_cost)::text from public.subscription_overview where id = tests.id('gym')),
          row(0, '2027-01-10', 2000)::text,
  'R-SUBSCRIPTION-002 R-SUBSCRIPTION-079: a first charge in the future: no charge yet, it is the next one, and a quarterly price commits a third');
-- A first charge long ago whose date this period is still ahead.
select tests.remember('yearly', (select id from public.create_subscription(tests.id('b'), 'Insurance', 12006, 'yearly', tests.id('sport'), '2025-11-20')));
select is((select row(charge_count, next_charge_date, monthly_cost)::text from public.subscription_overview where id = tests.id('yearly')),
          row(0, '2026-11-20', 1001)::text,
  'R-SUBSCRIPTION-071: a yearly first charge in the past: the next one is this year''s, after today');

-- Back-dated (an explicit correction): charges of the past periods are created.
select tests.remember('paper', (select id from public.create_subscription(tests.id('b'), 'Paper', 800, 'monthly', tests.id('sport'), '2026-09-05', tests.id('p1'))));
select is((select array_agg(date order by date) from public.transactions where subscription_id = tests.id('paper')),
          '{2026-09-05,2026-10-05,2026-11-05}'::date[],
  'R-SUBSCRIPTION-073 R-SUBSCRIPTION-112: back-dated from period 1, its charges up to today are created');
select is((select committed_total from public.period_summaries where id = tests.id('p1')), 800::bigint,
  'R-SUBSCRIPTION-079: and it is committed from period 1');

-- Refusals
select throws_ok(format($$select public.create_subscription(%L, 'x', 0, 'monthly', %L, '2026-11-01')$$, tests.id('b'), tests.id('sport')),
  'P0001', 'invalid_amount', 'R-SUBSCRIPTION-110: a price of 0 is refused');
select throws_ok(format($$select public.create_subscription(%L, 'x', 1000000001, 'monthly', %L, '2026-11-01')$$, tests.id('b'), tests.id('sport')),
  'P0001', 'invalid_amount', 'R-SUBSCRIPTION-110: a price above CHF 10 million is refused');
select throws_ok(format($$select public.create_subscription(%L, 'x', 100, null, %L, '2026-11-01')$$, tests.id('b'), tests.id('sport')),
  'P0001', 'invalid_cadence', 'R-SUBSCRIPTION-070: a cadence is required');
select throws_ok(format($$select public.create_subscription(%L, 'x', 100, 'monthly', %L, '2040-01-01')$$, tests.id('b'), tests.id('sport')),
  'P0001', 'invalid_charge_date', 'R-SUBSCRIPTION-110: a first charge more than ten years ahead is refused');
select throws_ok(format($$select public.create_subscription(%L, 'x', 100, 'monthly', null, '2026-11-01')$$, tests.id('b')),
  'P0001', 'category_required', 'R-SUBSCRIPTION-001: a category is required');
select throws_ok(format($$select public.create_subscription(%L, '  ', 100, 'monthly', %L, '2026-11-01')$$, tests.id('b'), tests.id('sport')),
  'P0001', 'invalid_name', 'R-SUBSCRIPTION-001: a name is required');

-- ===========================================================================
-- A reopen with subscription changes (R-VERSION-011, R-VERSION-110)
-- ===========================================================================
select tests.remember('r', public.create_budget('Reopen', 'Salary', 600000, 25, 'nearest', '2026-09-01'));
select tests.remember('r_cat', (select id from public.create_category(tests.id('r'), 'Subs', p_amount => 9000,
  p_from_period_id => (select id from public.periods where budget_id = tests.id('r') and seq = 1))));
select tests.remember('r_old', (select id from public.create_subscription(tests.id('r'), 'Old', 1000, 'monthly', tests.id('r_cat'), '2026-09-20',
  (select id from public.periods where budget_id = tests.id('r') and seq = 1))));
select tests.remember('r_new', (select id from public.create_subscription(tests.id('r'), 'New', 700, 'monthly', tests.id('r_cat'), '2026-10-20')));
select public.update_subscription(tests.id('r_old'), (select revision from public.subscriptions where id = tests.id('r_old')), p_price => 1200);
select is((select array_agg(record_kind || ' ' || record_name || ' ' || change || ' ' || replaces_previous order by record_name, change)
           from public.preview_reopen(tests.id('r')) where record_kind = 'subscription'),
          array['subscription New added false', 'subscription Old terms_changed true'],
  'R-PERIOD-035 R-VERSION-110: preview_reopen reports subscriptions added and terms changed in the current period (replacing the reopened period''s terms)');
select tests.reopen_previous_period(tests.id('r'));
select is((select row(first_seq, price, terms_from_seq)::text from public.subscription_overview where id = tests.id('r_new')),
          row(1, 700, 1)::text,
  'R-VERSION-011 R-VERSION-110: the subscription added in the merged period now starts in the reopened one');
select is((select price from public.subscription_overview where id = tests.id('r_old')), 1200::bigint,
  'R-VERSION-011: and the terms in force before the reopen are in force after it');
select is((select count(*)::integer from public.transactions where subscription_id = tests.id('r_new')), 0,
  'R-SUBSCRIPTION-111: the reopen creates no charge for dates already passed (20 October)');
select is((select array_agg(charge_date) from public.transactions where subscription_id = tests.id('r_old')), '{2026-10-20}'::date[],
  'R-SUBSCRIPTION-111: nor removes or duplicates one');
select is_empty(format('select * from tests.step4_violations(%L)', tests.id('r')),
  'R-VERSION-110: the step 4 invariants hold after the reopen');
select is_empty(format('select * from tests.period_violations(%L)', tests.id('r')), 'R-VERSION-011: and the period invariants');
-- a subscription added and ended in the merged period, with a charge: kept void
select tests.record_early_pay_date(tests.id('r'), '2026-11-14');
select tests.remember('r_brief', (select id from public.create_subscription(tests.id('r'), 'Brief', 300, 'monthly', tests.id('r_cat'), '2026-11-15')));
select is((select count(*)::integer from public.transactions where subscription_id = tests.id('r_brief')), 1, 'setup: charged on 15 November');
select public.end_subscription(tests.id('r_brief'), (select revision from public.subscriptions where id = tests.id('r_brief')));
select is((select change from public.preview_reopen(tests.id('r')) where record_id = tests.id('r_brief')), 'removed',
  'R-PERIOD-035: a subscription added and ended in the merged period would never be in force');
select tests.reopen_previous_period(tests.id('r'));
select is((select row(first_seq = end_seq)::text from public.subscriptions where id = tests.id('r_brief')), row(true)::text,
  'R-VERSION-014: it is kept void for its charge');
select is((select count(*)::integer from public.transactions where subscription_id = tests.id('r_brief')), 1,
  'R-VERSION-110: and the reopen never loses a charge');
select lives_ok('set constraints all immediate', 'R-VERSION-011: the invariants hold at commit');
set constraints all deferred;

-- ===========================================================================
-- Confirm, "did not go through", edit, delete (R-SUBSCRIPTION-074 to R-SUBSCRIPTION-077)
-- ===========================================================================
select tests.remember('c_oct', (select id from public.transactions where subscription_id = tests.id('netflix') and charge_date = '2026-10-31'));
select throws_ok(format('select public.confirm_subscription_charge(%L, %s)', tests.id('c_oct'),
                        (select revision from public.transactions where id = tests.id('c_oct')) + 1),
  'P0001', 'record_changed', 'R-CONCURRENCY-070: confirming takes the charge''s revision');
select tests.authenticate_as('bob');
select is((select row(review_state, revision)::text from public.confirm_subscription_charge(tests.id('c_oct'), 1)),
          row('confirmed', 2)::text,
  'R-SUBSCRIPTION-075: any member confirms that a charge went through');
select tests.authenticate_as('alice');
select throws_ok(format('select public.confirm_subscription_charge(%L, 1)', tests.id('c_oct')), 'P0001', 'record_changed',
  'R-CONCURRENCY-070: a retried confirmation is refused as a stale edit');
select is((select review_state from public.confirm_subscription_charge(tests.id('c_oct'), 2)), 'confirmed',
  'R-SUBSCRIPTION-075: confirming again changes nothing');
select is((select revision from public.transactions where id = tests.id('c_oct')), 2,
  'R-SUBSCRIPTION-075: not even the revision');

select tests.remember('manual', (select id from public.add_transaction(tests.id('b'), 'expense', 500, '2026-11-02', tests.id('sport'))));
select throws_ok(format('select public.confirm_subscription_charge(%L, 1)', tests.id('manual')), 'P0001', 'not_a_charge',
  'R-SUBSCRIPTION-075: only an automatic charge is confirmed');
select throws_ok(format('select public.dismiss_subscription_charge(%L, 1)', tests.id('manual')), 'P0001', 'not_a_charge',
  'R-SUBSCRIPTION-077: only an automatic charge is dismissed');

-- edited like any transaction; the link, the charge date and the state stay
select tests.remember('c_sep', (select id from public.transactions where subscription_id = tests.id('paper') and charge_date = '2026-09-05'));
select is((select row(amount, date, subscription_id = tests.id('paper'), charge_date, review_state, description)::text
           from public.update_transaction(tests.id('c_sep'), 1, 'expense', 850, '2026-09-06', tests.id('sport'), 'Price went up')),
          row(850, '2026-09-06'::date, true, '2026-09-05'::date, 'awaiting_confirmation', 'Price went up')::text,
  'R-SUBSCRIPTION-074: a charge is edited like any transaction, and stays a charge awaiting confirmation');
select throws_ok(format($$select public.update_transaction(%L, 2, 'refund', 850, '2026-09-06', %L)$$, tests.id('c_sep'), tests.id('sport')),
  'P0001', 'invalid_link', 'R-TRANSACTION-110: a linked transaction stays an expense');

-- did not go through: removed, never created again
select tests.remember('c_oct5', (select id from public.transactions where subscription_id = tests.id('paper') and charge_date = '2026-10-05'));
select lives_ok(format('select public.dismiss_subscription_charge(%L, 1)', tests.id('c_oct5')),
  'R-SUBSCRIPTION-077: a member answers that a charge did not go through');
select is((select count(*)::integer from public.transactions where id = tests.id('c_oct5')), 0,
  'R-SUBSCRIPTION-077: which removes its transaction');
select lives_ok(format('select public.delete_transaction(%L, 1)',
                       (select id from public.transactions where subscription_id = tests.id('paper') and charge_date = '2026-11-05')),
  'R-SUBSCRIPTION-074: a charge can also be deleted like any transaction');
select public.ensure_periods(tests.id('b'));
select is((select array_agg(charge_date order by charge_date) from public.transactions where subscription_id = tests.id('paper')),
          '{2026-09-05}'::date[],
  'R-SUBSCRIPTION-111: a dismissed or deleted charge is never created again for its date');

-- the dashboard list
select is((select array_agg(subscription_name || ' ' || charge_date order by charge_date)
           from public.list_charges_awaiting_confirmation(tests.id('b'))),
          array['Paper 2026-09-05'],
  'R-SUBSCRIPTION-075: list_charges_awaiting_confirmation lists (for the dashboard) the charges awaiting confirmation, oldest first');
select throws_ok(format('select public.list_charges_awaiting_confirmation(%L, 0)', tests.id('b')), 'P0001', 'invalid_limit',
  'R-SUBSCRIPTION-075: a page of 1 to 200');

-- ===========================================================================
-- Versioned terms (R-VERSION-003): edits never change the past
-- ===========================================================================
select is((select row(price, terms_from_seq, revision)::text from public.update_subscription(tests.id('netflix'),
             (select revision from public.subscriptions where id = tests.id('netflix')), p_price => 2290)),
          row(2290, 3, 2)::text,
  'R-VERSION-003: a new price applies from the current period');
select is((select amount from public.transactions where id = tests.id('c_oct')), 1990::bigint,
  'R-VERSION-003 R-SUBSCRIPTION-111: a charge already created keeps its amount');
select is((select committed_total from public.period_summaries where id = tests.id('p3')),
          (select 2290 + 2000 + 1001 + 800)::bigint,
  'R-SUBSCRIPTION-079: the committed total follows the terms in force now');
select lives_ok(format('select public.update_subscription(%L, 2, p_price => 2490)', tests.id('netflix')),
  'R-VERSION-003: a second change in the same period');
select is((select count(*)::integer from public.subscription_versions where subscription_id = tests.id('netflix')), 1,
  'R-VERSION-006: replaces the first (one version per period)');

-- a correction from period 1 changes the committed figures from there, and creates no charge
select lives_ok(format('select public.update_subscription(%L, %s, p_price => 900, p_from_period_id => %L)', tests.id('paper'),
                       (select revision from public.subscriptions where id = tests.id('paper')), tests.id('p1')),
  'R-VERSION-012: an explicit correction from an earlier period');
select is((select array_agg(committed_total order by seq) from public.period_summaries where budget_id = tests.id('b')),
          array[900, 900, 2490 + 2000 + 1001 + 900]::bigint[],
  'R-VERSION-012 R-SUBSCRIPTION-079: changes the committed figures from that period on');
select is((select count(*)::integer from public.transactions where subscription_id = tests.id('paper')), 1,
  'R-SUBSCRIPTION-111: and creates no charge for a date already passed');
select throws_ok(format('select public.update_subscription(%L, %s, p_from_period_id => %L)', tests.id('paper'),
                        (select revision from public.subscriptions where id = tests.id('paper')), tests.id('p1')),
  'P0001', 'invalid_period', 'R-VERSION-012: a correction needs new terms');
select throws_ok(format('select public.update_subscription(%L, %s, p_price => 1, p_from_period_id => %L)', tests.id('netflix'),
                        (select revision from public.subscriptions where id = tests.id('netflix')), tests.id('p1')),
  'P0001', 'invalid_period', 'R-VERSION-012: not before the subscription started');

-- the schedule (D-170)
select throws_ok(format($$select public.update_subscription(%L, %s, p_next_charge_date => '2026-11-16')$$, tests.id('netflix'),
                        (select revision from public.subscriptions where id = tests.id('netflix'))),
  'P0001', 'invalid_charge_date', 'R-SUBSCRIPTION-114: a new schedule''s next charge is after today');
select is((select row(anchor_date, next_charge_date)::text from public.update_subscription(tests.id('netflix'),
             (select revision from public.subscriptions where id = tests.id('netflix')), p_next_charge_date => '2026-12-03')),
          row('2026-12-03', '2026-12-03')::text,
  'R-SUBSCRIPTION-114: moving the next charge: it falls on the date given, and later ones follow from it');
select is((select row(cadence, anchor_date, next_charge_date)::text from public.update_subscription(tests.id('yearly'),
             (select revision from public.subscriptions where id = tests.id('yearly')), p_cadence => 'monthly')),
          row('monthly', '2026-11-20', '2026-11-20')::text,
  'R-SUBSCRIPTION-114: a new cadence without a date continues from the next charge of the current schedule');
select throws_ok(format('select public.update_subscription(%L, %s, p_category_id => %L)', tests.id('netflix'),
                        (select revision from public.subscriptions where id = tests.id('netflix')), tests.id('b')),
  'P0001', 'category_not_found', 'R-SUBSCRIPTION-001: the category must be a category of the budget');
select throws_ok(format('select public.update_subscription(%L, %s, p_price => 1)', tests.id('netflix'),
                        (select revision from public.subscriptions where id = tests.id('netflix')) - 1),
  'P0001', 'record_changed', 'R-CONCURRENCY-070: an edit takes the subscription''s revision');
select throws_ok(format('select public.update_subscription(%L, null, p_name => %L)', tests.id('netflix'), 'x'),
  'P0001', 'invalid_revision', 'R-CONCURRENCY-070: and requires it');
select is((select name from public.update_subscription(tests.id('netflix'),
             (select revision from public.subscriptions where id = tests.id('netflix')), 'Netflix family')),
          'Netflix family', 'R-SUBSCRIPTION-001: a rename');

-- roll-over: the next charges follow the terms in force then
select tests.clear_authentication();
select tests.set_today('2026-12-05');
select tests.authenticate_as('alice');
select is((select count(*)::integer from public.get_current_period(tests.id('b'))), 1, 'setup: periods caught up to 5 December');
select is((select array_agg(row(charge_date, amount)::text order by charge_date) from public.transactions where subscription_id = tests.id('netflix')),
          array[row('2026-10-31'::date, 1990)::text, row('2026-12-03'::date, 2490)::text],
  'R-SUBSCRIPTION-073 R-SUBSCRIPTION-114: the next charge came on the new schedule''s date, at the new price, and 30 November was not charged');
select is((select array_agg(charge_date order by charge_date) from public.transactions where subscription_id = tests.id('yearly')),
          '{2026-11-20}'::date[],
  'R-SUBSCRIPTION-073: the monthly schedule continued from 20 November');

-- ===========================================================================
-- Ending and deleting (R-SUBSCRIPTION-113)
-- ===========================================================================
select tests.remember('trial', (select id from public.create_subscription(tests.id('b'), 'Trial', 100, 'monthly', tests.id('sport'), '2027-02-01')));
select is((select removal_deletes from public.subscription_overview where id = tests.id('trial')), true,
  'R-SUBSCRIPTION-113: one that never counted and has no charge would be deleted');
select is(public.end_subscription(tests.id('trial'), 1), 'deleted',
  'R-SUBSCRIPTION-113: and is deleted');
select is((select removal_deletes from public.subscription_overview where id = tests.id('netflix')), false,
  'R-SUBSCRIPTION-113: one with charges would be ended');
select is(public.end_subscription(tests.id('netflix'), (select revision from public.subscriptions where id = tests.id('netflix'))), 'ended',
  'R-SUBSCRIPTION-113: and is ended from the current period');
select is((select row(end_seq, is_active, next_charge_date)::text from public.subscription_overview where id = tests.id('netflix')),
          row(4, false, null::date)::text,
  'R-SUBSCRIPTION-113: it is no longer in force, with no next charge');
select is((select count(*)::integer from public.transactions where subscription_id = tests.id('netflix')), 2,
  'R-SUBSCRIPTION-113: its charges are kept');
select is((select committed_total from public.period_summaries where budget_id = tests.id('b') and seq = 3), (2490 + 2000 + 12006 + 900)::bigint,
  'R-SUBSCRIPTION-113: and the past keeps it committed');
select throws_ok(format('select public.end_subscription(%L, %s)', tests.id('netflix'), (select revision from public.subscriptions where id = tests.id('netflix'))),
  'P0001', 'subscription_ended', 'R-SUBSCRIPTION-113: an ended subscription cannot be ended again');
select throws_ok(format('select public.update_subscription(%L, %s, p_price => 5)', tests.id('netflix'), (select revision from public.subscriptions where id = tests.id('netflix'))),
  'P0001', 'subscription_ended', 'R-VERSION-003: nor given new terms from now');
-- the paper subscription, ended as a correction from its first period, is kept void for its charge
select is(public.end_subscription(tests.id('paper'), (select revision from public.subscriptions where id = tests.id('paper')), tests.id('p1')), 'ended',
  'R-SUBSCRIPTION-113: ended from its first period, with a charge, it is not deleted');
select is((select row(first_seq, end_seq)::text from public.subscriptions where id = tests.id('paper')), row(1, 1)::text,
  'R-VERSION-014: it is kept as a void row, never in force');
select is((select array_agg(charge_date order by charge_date) from public.transactions where subscription_id = tests.id('paper')),
          '{2026-09-05,2026-12-05}'::date[],
  'R-SUBSCRIPTION-113: and its charges stay');

-- no charge after the end
select tests.clear_authentication();
select tests.set_today('2027-01-05');
select tests.authenticate_as('alice');
select public.ensure_periods(tests.id('b'));
select is((select count(*)::integer from public.transactions where subscription_id = tests.id('netflix')), 2,
  'R-SUBSCRIPTION-113: an ended subscription is not charged any more');

-- ===========================================================================
-- Categories in use (R-CATEGORY-110)
-- ===========================================================================
select throws_ok(format('select public.end_category(%L, %s)', tests.id('sport'), (select revision from public.categories where id = tests.id('sport'))),
  'P0001', 'category_in_use', 'R-CATEGORY-110: a category an active subscription uses cannot be removed');
select is((select in_use from public.category_overview where id = tests.id('streaming')), false,
  'R-CATEGORY-110: once its subscriptions have ended, it is no longer in use');
select throws_ok(format('select public.create_category(%L, %L, %L)', tests.id('b'), 'Tennis', tests.id('sport')),
  'P0001', 'other_name_required', 'R-CATEGORY-110: a first subcategory under a category with subscriptions needs "Other"');
select tests.remember('tennis', (select id from public.create_category(tests.id('b'), 'Tennis', tests.id('sport'), 1000, p_other_name => 'Other')));
select is((select array_agg(distinct c.name) from public.subscription_versions as v join public.categories as c on c.id = v.category_id
           where v.subscription_id in (tests.id('gym'), tests.id('yearly'))),
          array['Other'],
  'R-CATEGORY-110: the subscriptions move to "Other" with the transactions, so nothing charges a group');
select lives_ok('set constraints all immediate', 'R-CATEGORY-110: and the shape holds');
set constraints all deferred;
select is(public.end_category(tests.id('streaming'), (select revision from public.categories where id = tests.id('streaming'))), 'ended',
  'R-CATEGORY-110: once its subscriptions have ended, the category can be removed (ended: it has charges)');

-- ===========================================================================
-- A long absence (R-SUBSCRIPTION-073, R-SUBSCRIPTION-111, Q-054)
-- ===========================================================================
select tests.clear_authentication();
select tests.set_today('2029-01-15');
select tests.authenticate_as('bob');
create temp table timing (started timestamptz, finished timestamptz) on commit drop;
insert into timing (started) values (clock_timestamp());
select ok(public.ensure_periods(tests.id('b')) >= 24, 'setup: two years without anyone opening the budget');
update timing set finished = clock_timestamp();
select is((select array_agg(charge_date order by charge_date) from public.transactions where subscription_id = tests.id('gym')),
          '{2027-01-10,2027-04-10,2027-07-10,2027-10-10,2028-01-10,2028-04-10,2028-07-10,2028-10-10,2029-01-10}'::date[],
  'R-SUBSCRIPTION-073 Q-054: every missed charge date is caught up, once');
select is((select count(*)::integer from public.transactions where subscription_id = tests.id('yearly')),
          (select count(*)::integer from generate_series(date '2026-11-20', date '2029-01-15', interval '1 month')),
  'R-SUBSCRIPTION-073: monthly too');
select is(public.ensure_periods(tests.id('b')), 0, 'R-SUBSCRIPTION-111: a second catch-up creates nothing');
select is((select count(*)::integer from (select charge_date from public.transactions where budget_id = tests.id('b') and charge_date is not null
                                          group by subscription_id, charge_date having count(*) > 1) as d), 0,
  'R-SUBSCRIPTION-111: no charge exists twice');
select ok((select finished - started from timing) < interval '3 seconds', 'R-SUBSCRIPTION-110: the catch-up after a long absence is fast');
select is_empty(format('select * from tests.step4_violations(%L)', tests.id('b')),
  'R-SUBSCRIPTION-111 R-SUBSCRIPTION-079: the step 4 invariants hold, committed figures equal a naive recomputation');

-- ===========================================================================
-- The transaction limit counts automatic charges; none is skipped (R-SUBSCRIPTION-112)
-- ===========================================================================
select tests.clear_authentication();
create temp table limit_setup as select count(*)::integer as n from public.transactions where budget_id = tests.id('b');
grant select on limit_setup to authenticated;
do $$ begin
  execute format('create or replace function private.limit_transactions() returns integer language sql immutable set search_path = '''' as $f$ select %s $f$',
                 (select n + 2 from limit_setup));
end $$;
select tests.set_today('2029-04-15');
select tests.authenticate_as('alice');
select public.ensure_periods(tests.id('b'));
select is((select count(*)::integer from public.transactions where budget_id = tests.id('b')), (select n + 2 from limit_setup),
  'R-SUBSCRIPTION-112: charges stop at the transaction limit');
select throws_ok(format($$select public.add_transaction(%L, 'expense', 1, '2029-04-15', %L)$$, tests.id('b'), tests.id('tennis')),
  'P0001', 'transaction_limit_reached', 'R-TRANSACTION-094: the limit counts automatic charges');
select tests.clear_authentication();
do $$ begin
  execute format('create or replace function private.limit_transactions() returns integer language sql immutable set search_path = '''' as $f$ select %s $f$',
                 (select n + 100 from limit_setup));
end $$;
select tests.authenticate_as('alice');
select public.ensure_periods(tests.id('b'));
select is((select array_agg(charge_date order by charge_date) from public.transactions where subscription_id = tests.id('gym') and charge_date > '2029-01-10'),
          '{2029-04-10}'::date[],
  'R-SUBSCRIPTION-112: once there is room, the charges held back are created');
select is((select count(*)::integer from public.transactions where subscription_id = tests.id('yearly') and charge_date > '2029-01-15'), 3,
  'R-SUBSCRIPTION-112: none was skipped');
select tests.clear_authentication();
do $$ begin
  execute 'create or replace function private.limit_transactions() returns integer language sql immutable set search_path = '''' as $f$ select 50000 $f$';
end $$;

-- ===========================================================================
-- Limits on subscriptions (R-SUBSCRIPTION-110)
-- ===========================================================================
select tests.authenticate_as('alice');
select tests.remember('b2', public.create_budget('Many', 'Salary', 600000, 25));
select tests.remember('b2_cat', (select id from public.create_category(tests.id('b2'), 'Subs')));
select count(*) from generate_series(1, 50) as g cross join lateral public.create_subscription(tests.id('b2'), 'S' || g, 100, 'monthly', tests.id('b2_cat'), '2030-01-01') as s;
select is((select count(*)::integer from public.subscriptions where budget_id = tests.id('b2')), 50, 'setup: 50 subscriptions');
select throws_ok(format($$select public.create_subscription(%L, 'Fifty-first', 100, 'monthly', %L, '2030-01-01')$$, tests.id('b2'), tests.id('b2_cat')),
  'P0001', 'subscription_limit_reached', 'R-SUBSCRIPTION-110: at most 50 subscriptions in force');

select * from finish();
rollback;
