-- Debts (step 4): payments, the remaining amount, interest once per period however the period
-- came to exist (roll-over, catch-up over several periods, an early salary) and across a
-- reopen, the payoff projection, balance adjustments, versioned terms with corrections,
-- removing, links, and a reopen with debt changes.
begin;
select plan(95);

select tests.create_user('alice', 'Alice');
select tests.set_today('2026-11-16');

-- ===========================================================================
-- One period's interest, pure (R-DEBT-073, Q-055, D-172)
-- ===========================================================================
create temp table interest_cases (balance bigint, rate numeric, expected bigint, why text) on commit drop;
insert into interest_cases values
  (970000, 6, 4850, 'one twelfth of 6 % on CHF 9700'),
  (1000100, 6, 5001, 'half a rappen rounds up (5000.5)'),
  (999900, 6, 5000, 'and 4999.5 rounds up too'),
  (974850, 6, 4874, 'below half rounds down (4874.25)'),
  (1, 6, 0, 'too small to add a rappen'),
  (0, 6, 0, 'nothing on a balance of zero'),
  (-500, 6, 0, 'nothing on an overpaid debt'),
  (100000, 0, 0, 'no interest without a rate'),
  (100000, 4.875, 406, 'a rate with three decimals (406.25)'),
  (999999999999, 100, 1, 'never beyond the balance limit');
select is(private.period_interest(c.balance, c.rate), c.expected, 'R-DEBT-073: ' || c.why)
from interest_cases as c;

-- ===========================================================================
-- A budget: periods 1 (25 Aug - 24 Sep), 2 (25 Sep - 25 Oct), 3 (26 Oct - 24 Nov, current)
-- ===========================================================================
select tests.authenticate_as('alice');
select tests.remember('b', public.create_budget('Home', 'Salary', 600000, 25, 'nearest', '2026-08-01'));
select tests.remember('p1', (select id from public.periods where budget_id = tests.id('b') and seq = 1));
select tests.remember('p3', (select id from public.periods where budget_id = tests.id('b') and seq = 3));
select tests.remember('loans', (select id from public.create_category(tests.id('b'), 'Loans', p_amount => 40000, p_from_period_id => tests.id('p1'))));
select tests.remember('food', (select id from public.create_category(tests.id('b'), 'Food', p_amount => 40000, p_from_period_id => tests.id('p1'))));

select tests.remember('car', (select id from public.create_debt(tests.id('b'), 'Car loan', 1000000, tests.id('loans'), 30000, 6)));
select is((select row(principal, opened_on, first_seq, interest_rate, monthly_payment, remaining, interest_total, paid_total, has_history, removal_deletes)::text
           from public.debt_overview where id = tests.id('car')),
          row(1000000, '2026-11-16'::date, 3, 6.000, 30000, 1000000, 0, 0, false, true)::text,
  'R-DEBT-001 R-DEBT-002 R-DEBT-070: a debt has a principal, a rate, a planned monthly payment and a category');
select tests.remember('studies', (select id from public.create_debt(tests.id('b'), 'Studies', 500000, tests.id('loans'), 20000)));
select is((select interest_rate from public.debt_overview where id = tests.id('studies')), 0.000::numeric(6,3),
  'R-DEBT-002: the interest rate is optional');

select throws_ok(format('select public.create_debt(%L, %L, 0, %L, 1)', tests.id('b'), 'x', tests.id('loans')), 'P0001', 'invalid_amount',
  'R-DEBT-110: a principal of 0 is refused');
select throws_ok(format('select public.create_debt(%L, %L, 1000000001, %L, 1)', tests.id('b'), 'x', tests.id('loans')), 'P0001', 'invalid_amount',
  'R-DEBT-110: a principal above CHF 10 million is refused');
select throws_ok(format('select public.create_debt(%L, %L, 100, %L, -1)', tests.id('b'), 'x', tests.id('loans')), 'P0001', 'invalid_amount',
  'R-DEBT-110: a negative planned payment is refused');
select throws_ok(format('select public.create_debt(%L, %L, 100, %L, 1, 100.5)', tests.id('b'), 'x', tests.id('loans')), 'P0001', 'invalid_interest_rate',
  'R-DEBT-110: a rate above 100 % is refused');
select throws_ok(format('select public.create_debt(%L, %L, 100, %L, 1, 1.2345)', tests.id('b'), 'x', tests.id('loans')), 'P0001', 'invalid_interest_rate',
  'R-DEBT-110: a rate has at most three decimals');
select throws_ok(format('select public.create_debt(%L, %L, 100, %L, 1)', tests.id('b'), 'x', tests.id('b')), 'P0001', 'category_not_found',
  'R-DEBT-070: the category must be a category of the budget');

-- ===========================================================================
-- Payments (R-DEBT-071, R-DEBT-003, R-TRANSACTION-003)
-- ===========================================================================
select tests.remember('pay1', (select id from public.add_transaction(tests.id('b'), 'expense', 30000, '2026-11-16', tests.id('loans'), 'November',
  p_debt_id => tests.id('car'))));
select is((select row(debt_id = tests.id('car'), debt_name, category_name, kind)::text from public.transaction_list where id = tests.id('pay1')),
          row(true, 'Car loan', 'Loans', 'expense')::text,
  'R-DEBT-071: a payment is an expense in the debt''s category, linked to the debt');
select is((select row(remaining, paid_total)::text from public.debt_overview where id = tests.id('car')), row(970000, 30000)::text,
  'R-DEBT-003: a payment reduces the remaining amount');
select is((select spent from public.get_period_progress(tests.id('p3')) where category_id = tests.id('loans')), 30000::bigint,
  'R-DEBT-071: and counts as spending in its category like any transaction');
select throws_ok(format($$select public.add_transaction(%L, 'expense', 1, '2026-11-16', %L, p_debt_id => %L)$$, tests.id('b'), tests.id('food'), tests.id('car')),
  'P0001', 'invalid_link', 'R-DEBT-071: a payment in another category is refused');
select throws_ok(format($$select public.add_transaction(%L, 'refund', 1, '2026-11-16', %L, p_debt_id => %L)$$, tests.id('b'), tests.id('loans'), tests.id('car')),
  'P0001', 'invalid_link', 'R-TRANSACTION-110: a refund cannot be a payment');
select throws_ok(format($$select public.add_transaction(%L, 'expense', 1, '2026-11-16', %L, p_debt_id => %L, p_subscription_id => %L)$$,
                        tests.id('b'), tests.id('loans'), tests.id('car'), tests.id('car')),
  'P0001', 'invalid_link', 'R-TRANSACTION-003: a transaction links to at most one of a debt or a subscription');
select throws_ok(format($$select public.add_transaction(%L, 'expense', 1, '2026-10-01', %L, p_debt_id => %L)$$, tests.id('b'), tests.id('loans'), tests.id('car')),
  'P0001', 'debt_not_in_force', 'R-DEBT-071: a payment dated before the debt counted is refused');
select throws_ok(format($$update public.transactions set debt_id = %L, kind = 'refund' where id = %L$$, tests.id('car'), tests.id('pay1')),
  '42501', null, 'R-TRANSACTION-003: there are no direct writes');
-- editing a payment keeps its link; moving it to another category is refused
select is((select row(amount, debt_id = tests.id('car'))::text
           from public.update_transaction(tests.id('pay1'), 1, 'expense', 31000, '2026-11-16', tests.id('loans'), 'November')),
          row(31000, true)::text,
  'R-DEBT-071: a payment is edited like any transaction and stays linked');
select throws_ok(format($$select public.update_transaction(%L, 2, 'expense', 31000, '2026-11-16', %L)$$, tests.id('pay1'), tests.id('food')),
  'P0001', 'invalid_link', 'R-DEBT-071: a payment stays in the debt''s category');
select tests.remember('lunch', (select id from public.add_transaction(tests.id('b'), 'expense', 2000, '2026-11-10', tests.id('loans'))));
select is((select debt_name from public.link_transaction(tests.id('lunch'), 1, tests.id('studies'))), 'Studies',
  'R-TRANSACTION-003: an existing transaction can be linked to a debt');
select is((select paid_total from public.debt_overview where id = tests.id('studies')), 2000::bigint,
  'R-DEBT-003: and then counts as a payment');
select is((select debt_id from public.link_transaction(tests.id('lunch'), 2)), null::uuid,
  'R-TRANSACTION-003: and unlinked');
select is((select remaining from public.debt_overview where id = tests.id('studies')), 500000::bigint,
  'R-DEBT-003: which restores the remaining amount');
select throws_ok(format('select public.link_transaction(%L, 2, %L)', tests.id('lunch'), tests.id('studies')), 'P0001', 'record_changed',
  'R-CONCURRENCY-070: linking takes the transaction''s revision');

-- ===========================================================================
-- Interest at a roll-over, a catch-up over several periods, an early salary (R-DEBT-073)
-- ===========================================================================
select tests.clear_authentication();
select tests.set_today('2026-11-26');
select tests.authenticate_as('alice');
select is(public.ensure_periods(tests.id('b')), 1, 'setup: the roll-over to period 4');
select is((select array_agg(row(amount, rate, balance)::text) from public.debt_interest where debt_id = tests.id('car')),
          array[row(4845, 6.000, 969000)::text],
  'R-DEBT-073 R-DEBT-111: a new period adds one twelfth of the yearly rate on the balance at that moment');
select is((select count(*)::integer from public.debt_interest where debt_id = tests.id('studies')), 0,
  'R-DEBT-073: a debt without a rate gets no interest');
select is(public.ensure_periods(tests.id('b')), 0, 'setup: nothing more to create');
select is((select count(*)::integer from public.debt_interest where debt_id = tests.id('car')), 1,
  'R-DEBT-111: interest is applied once per period');

select tests.clear_authentication();
select tests.set_today('2027-02-26');
select tests.authenticate_as('alice');
select is(public.ensure_periods(tests.id('b')), 3, 'setup: three periods caught up at once');
select is((select array_agg(i.amount order by p.seq) from public.debt_interest as i join public.periods as p on p.id = i.period_id
           where i.debt_id = tests.id('car')),
          array[4845, 4869, 4894, 4918]::bigint[],
  'R-DEBT-073 R-DEBT-111: a catch-up over several periods applies each period''s interest once, on the balance after the previous one');
select is((select remaining from public.debt_overview where id = tests.id('car')), (969000 + 4845 + 4869 + 4894 + 4918)::bigint,
  'R-DEBT-003: the interest is added to the remaining amount');

select tests.clear_authentication();
select tests.set_today('2027-03-20');
select tests.authenticate_as('alice');
select public.ensure_periods(tests.id('b'));
select tests.record_early_pay_date(tests.id('b'), '2027-03-20');
select tests.remember('p8', (select id from public.periods where budget_id = tests.id('b') and seq = 8));
select is((select amount from public.debt_interest where debt_id = tests.id('car') and period_id = tests.id('p8')), 4943::bigint,
  'R-DEBT-073: a period started by an early salary applies its interest too');
select is((select array_agg(record_name || ' ' || change) from public.preview_reopen(tests.id('b')) where record_kind = 'debt'),
          array['Car loan interest_removed'],
  'R-PERIOD-035 R-DEBT-113: preview_reopen says the reopen removes that period''s interest');
select tests.reopen_previous_period(tests.id('b'));
select is((select count(*)::integer from public.debt_interest where debt_id = tests.id('car')), 4,
  'R-DEBT-113: a reopen that merges a period removes the interest that period added');
select is((select remaining from public.debt_overview where id = tests.id('car')), (969000 + 4845 + 4869 + 4894 + 4918)::bigint,
  'R-DEBT-113: and the remaining amount is as before');
select tests.record_early_pay_date(tests.id('b'), '2027-03-20');
select is((select array_agg(i.amount order by p.seq) from public.debt_interest as i join public.periods as p on p.id = i.period_id
           where i.debt_id = tests.id('car')),
          array[4845, 4869, 4894, 4918, 4943]::bigint[],
  'R-DEBT-111: a reopen followed by a new roll-over applies the period''s interest once again, once');
select is((select row(kind, date, amount, balance)::text from public.get_debt_history(tests.id('car')) order by date desc, kind limit 1),
          row('interest', '2027-03-20'::date, 4943, 969000 + 4845 + 4869 + 4894 + 4918 + 4943)::text,
  'R-DEBT-004: the history shows the interest added, dated at its period''s start');

-- ===========================================================================
-- The history, for a chart (R-DEBT-004)
-- ===========================================================================
select is((select array_agg(kind || ' ' || amount || ' ' || balance order by date, kind)
           from public.get_debt_history(tests.id('car')) where date < '2027-01-01'),
          array['opened 1000000 1000000', 'payment -31000 969000', 'interest 4845 973845', 'interest 4869 978714'],
  'R-DEBT-004: the history lists the principal, payments and interest in date order, with the remaining amount after each');
select is((select count(*)::integer from public.get_debt_history(tests.id('car')) where period_id is null), 0,
  'R-DEBT-004: each entry names the period containing its date');

-- ===========================================================================
-- Adjustments (R-DEBT-075)
-- ===========================================================================
select is((select row(remaining, adjustment_total)::text from public.adjust_debt_balance(tests.id('car'),
             (select revision from public.debts where id = tests.id('car')), 950000, '2027-03-01', 'Bank statement')),
          row(950000, 950000 - (969000 + 4845 + 4869 + 4894 + 4918 + 4943))::text,
  'R-DEBT-075: adjusting the balance makes the remaining amount what the bank says');
select is((select row(kind, amount, description)::text from public.get_debt_history(tests.id('car')) where kind = 'adjustment'),
          row('adjustment', 950000 - (969000 + 4845 + 4869 + 4894 + 4918 + 4943), 'Bank statement')::text,
  'R-DEBT-004 R-DEBT-075: as an entry in the history');
select is((select adjustment_total from public.adjust_debt_balance(tests.id('car'),
             (select revision from public.debts where id = tests.id('car')), 950000)),
          (950000 - (969000 + 4845 + 4869 + 4894 + 4918 + 4943))::bigint,
  'R-DEBT-075: adjusting to the balance it already has adds nothing');
select throws_ok(format('select public.adjust_debt_balance(%L, %s, 1)', tests.id('car'), (select revision from public.debts where id = tests.id('car')) - 1),
  'P0001', 'record_changed', 'R-CONCURRENCY-070: an adjustment takes the debt''s revision');
select throws_ok(format('select public.adjust_debt_balance(%L, %s, -1)', tests.id('car'), (select revision from public.debts where id = tests.id('car'))),
  'P0001', 'invalid_amount', 'R-DEBT-075: a negative balance is refused');
select throws_ok(format($$select public.adjust_debt_balance(%L, %s, 1, '2027-12-01')$$, tests.id('car'), (select revision from public.debts where id = tests.id('car'))),
  'P0001', 'date_outside_periods', 'R-DEBT-075: an adjustment is dated up to today');
select is((select remaining from public.delete_debt_adjustment((select id from public.debt_adjustments where debt_id = tests.id('car')),
             (select revision from public.debts where id = tests.id('car')))),
          (969000 + 4845 + 4869 + 4894 + 4918 + 4943)::bigint,
  'R-DEBT-075: deleting an adjustment restores the remaining amount');
select public.adjust_debt_balance(tests.id('car'), (select revision from public.debts where id = tests.id('car')), 950000);
select is(tests.naive_remaining(tests.id('car')), (select remaining from public.debt_overview where id = tests.id('car')),
  'R-DEBT-003: the remaining amount equals a naive recomputation from the rows');

-- ===========================================================================
-- Versioned terms with corrections (R-VERSION-004, R-DEBT-114)
-- ===========================================================================
select is((select row(interest_rate, monthly_payment, terms_from_seq)::text from public.update_debt(tests.id('car'),
             (select revision from public.debts where id = tests.id('car')), p_interest_rate => 3)),
          row(3.000, 30000, 8)::text,
  'R-VERSION-004: new terms apply from the current period');
select is((select count(*)::integer from public.debt_versions where debt_id = tests.id('car')), 2,
  'R-VERSION-004: past periods keep theirs');
select lives_ok(format('select public.update_debt(%L, %s, p_monthly_payment => 35000, p_from_period_id => %L)', tests.id('car'),
                       (select revision from public.debts where id = tests.id('car')), tests.id('p3')),
  'R-VERSION-012: an explicit correction of the terms from an earlier period');
select is((select array_agg(row(effective_from_seq, interest_rate, monthly_payment)::text order by effective_from_seq)
           from public.debt_versions where debt_id = tests.id('car')),
          array[row(3, 6.000, 35000)::text, row(8, 3.000, 30000)::text],
  'R-VERSION-012: applies until the next change');
select is((select sum(amount)::integer from public.debt_interest where debt_id = tests.id('car')), 4845 + 4869 + 4894 + 4918 + 4943,
  'R-DEBT-114: interest already added is never recomputed');
select throws_ok(format('select public.update_debt(%L, %s, p_principal => 1)', tests.id('car'), (select revision from public.debts where id = tests.id('car'))),
  'P0001', 'debt_has_history', 'R-DEBT-114: the principal of a debt with history cannot change (adjust its balance instead)');
select is((select principal from public.update_debt(tests.id('studies'), (select revision from public.debts where id = tests.id('studies')), p_principal => 450000)),
          450000::bigint, 'R-DEBT-114: a debt without history may correct its principal');
select throws_ok(format('select public.update_debt(%L, %s, p_from_period_id => %L)', tests.id('car'), (select revision from public.debts where id = tests.id('car')), tests.id('p3')),
  'P0001', 'invalid_period', 'R-VERSION-012: a correction needs new terms');
select throws_ok(format('select public.update_debt(%L, %s, p_interest_rate => 1, p_from_period_id => %L)', tests.id('car'), (select revision from public.debts where id = tests.id('car')), tests.id('p1')),
  'P0001', 'invalid_period', 'R-VERSION-012: not before the debt started');
select throws_ok(format('select public.update_debt(%L, null, p_name => %L)', tests.id('car'), 'x'), 'P0001', 'invalid_revision',
  'R-CONCURRENCY-070: an edit requires the revision');
-- the new rate applies at the next period
select tests.clear_authentication();
select tests.set_today('2027-04-26');
select tests.authenticate_as('alice');
select public.ensure_periods(tests.id('b'));
select is((select row(amount, rate, balance)::text from public.debt_interest as i join public.periods as p on p.id = i.period_id
           where i.debt_id = tests.id('car') and p.seq = 9),
          row(2375, 3.000, 950000)::text,
  'R-VERSION-004 R-DEBT-073: the next period applies the rate in force then');
-- the category: new payments go to the new one; existing ones keep their link
select lives_ok(format('select public.update_debt(%L, %s, p_category_id => %L)', tests.id('car'), (select revision from public.debts where id = tests.id('car')), tests.id('food')),
  'R-DEBT-070: the debt''s category can change');
select is((select debt_id = tests.id('car') from public.update_transaction(tests.id('pay1'), 2, 'expense', 31000, '2026-11-16', tests.id('loans'), 'Kept')),
          true, 'R-DEBT-071: an existing payment keeps its link in its category and period');
select throws_ok(format($$select public.add_transaction(%L, 'expense', 1, '2027-04-26', %L, p_debt_id => %L)$$, tests.id('b'), tests.id('loans'), tests.id('car')),
  'P0001', 'invalid_link', 'R-DEBT-071: a new payment goes to the debt''s category');
select throws_ok(format('select public.end_category(%L, %s)', tests.id('food'), (select revision from public.categories where id = tests.id('food'))),
  'P0001', 'category_in_use', 'R-CATEGORY-110: a category an active debt uses cannot be removed');

-- ===========================================================================
-- Removing (R-DEBT-113)
-- ===========================================================================
select tests.remember('typo', (select id from public.create_debt(tests.id('b'), 'Typo', 100, tests.id('loans'), 10, 5)));
select is(public.remove_debt(tests.id('typo'), 1), 'deleted', 'R-DEBT-113: a debt that never counted and has no history is deleted');
select is(public.remove_debt(tests.id('car'), (select revision from public.debts where id = tests.id('car'))), 'ended',
  'R-DEBT-113: a debt with history is ended');
select is((select row(is_active, remaining, payoff)::text from public.debt_overview where id = tests.id('car')),
          row(false, tests.naive_remaining(tests.id('car')), null::text)::text,
  'R-DEBT-113: it keeps its remaining amount and history, with no projection');
select throws_ok(format('select public.remove_debt(%L, %s)', tests.id('car'), (select revision from public.debts where id = tests.id('car'))),
  'P0001', 'debt_ended', 'R-DEBT-113: an ended debt cannot be removed again');
select tests.clear_authentication();
select tests.set_today('2027-05-26');
select tests.authenticate_as('alice');
select public.ensure_periods(tests.id('b'));
select is((select count(*)::integer from public.debt_interest where debt_id = tests.id('car')), 6,
  'R-DEBT-073: an ended debt gets no more interest');
select is_empty(format('select * from tests.step4_violations(%L)', tests.id('b')),
  'R-DEBT-003 R-DEBT-111: the step 4 invariants hold');

-- ===========================================================================
-- The projection (R-DEBT-005, R-DEBT-074, R-DEBT-112)
-- ===========================================================================
-- A budget whose current period is 25 May - 24 Jun 2027 (the next ones end 25 Jul and 24 Aug).
select tests.clear_authentication();
select tests.create_user('paula', 'Paula');
select tests.authenticate_as('paula');
select tests.remember('pb', public.create_budget('Projections', 'Salary', 600000, 25, 'nearest'));
select tests.remember('pb_loans', (select id from public.create_category(tests.id('pb'), 'Loans')));
create temp table pcur as select * from public.periods where budget_id = tests.id('pb') order by seq desc limit 1;
grant select on pcur to authenticated;
select tests.remember('no_rate', (select id from public.create_debt(tests.id('pb'), 'No rate', 25000, tests.id('pb_loans'), 10000)));
select is((select row(payoff, payments_left, expected_end_date)::text from public.debt_overview where id = tests.id('no_rate')),
          row('ends', 3, '2027-08-24'::date)::text,
  'R-DEBT-005: without interest: the planned payment this period, then two more');
select tests.remember('rate', (select id from public.create_debt(tests.id('pb'), 'Rate', 100000, tests.id('pb_loans'), 50000, 12)));
select is((select row(payoff, payments_left)::text from public.debt_overview where id = tests.id('rate')), row('ends', 3)::text,
  'R-DEBT-005: with interest: 1000 - 500, then 505 interest included, then the rest');
select tests.remember('equal', (select id from public.create_debt(tests.id('pb'), 'Equal', 1010000, tests.id('pb_loans'), 10000, 12)));
select public.add_transaction(tests.id('pb'), 'expense', 10000, (select start_date from pcur), tests.id('pb_loans'), p_debt_id => tests.id('equal'));
select is((select row(remaining, payoff, payments_left, expected_end_date)::text from public.debt_overview where id = tests.id('equal')),
          row(1000000, 'never', null::integer, null::date)::text,
  'R-DEBT-074 R-DEBT-112: a planned payment equal to one period''s interest: the debt never ends');
select tests.remember('below', (select id from public.create_debt(tests.id('pb'), 'Below', 1000000, tests.id('pb_loans'), 5000, 12)));
select is((select payoff from public.debt_overview where id = tests.id('below')), 'never',
  'R-DEBT-074: a planned payment below the interest: never');
select tests.remember('nearly', (select id from public.create_debt(tests.id('pb'), 'Nearly', 100, tests.id('pb_loans'), 30000, 5)));
select is((select row(payoff, payments_left, expected_end_date)::text from public.debt_overview where id = tests.id('nearly')),
          row('ends', 1, (select end_date from pcur))::text,
  'R-DEBT-005: a debt nearly paid ends with this period''s payment');
select tests.remember('over', (select id from public.create_debt(tests.id('pb'), 'Over', 1000, tests.id('pb_loans'), 500)));
select public.add_transaction(tests.id('pb'), 'expense', 1500, (select start_date from pcur), tests.id('pb_loans'), p_debt_id => tests.id('over'));
select is((select row(remaining, payoff, payments_left, expected_end_date)::text from public.debt_overview where id = tests.id('over')),
          row(-500, 'paid_off', 0, null::date)::text,
  'R-DEBT-003 R-DEBT-005: an overpaid debt is paid off, with a negative remaining amount');
select tests.remember('zero', (select id from public.create_debt(tests.id('pb'), 'Zero', 5000, tests.id('pb_loans'), 0)));
select is((select payoff from public.debt_overview where id = tests.id('zero')), 'never',
  'R-DEBT-074: no planned payment and no interest: never');
select tests.remember('horizon', (select id from public.create_debt(tests.id('pb'), 'Horizon', 1000000000, tests.id('pb_loans'), 1)));
select is((select payoff from public.debt_overview where id = tests.id('horizon')), 'never',
  'R-DEBT-112: beyond the projection''s horizon of 600 periods the answer is never');
select tests.remember('long', (select id from public.create_debt(tests.id('pb'), 'Long', 1000000000, tests.id('pb_loans'), 10000001, 12)));
select is((select payments_left from public.debt_overview where id = tests.id('long')),
          (with recursive s (k, r) as (
             select 0, 1000000000::numeric - 10000001
             union all
             select k + 1, r + round(r * 12 / 1200) - 10000001 from s where r > 0 and k < 700)
           select (min(k) + 1)::integer from s where r <= 0),
  'R-DEBT-005: a long projection equals a naive period-by-period recomputation');
select is((select payoff from public.debt_overview where id = tests.id('long')), 'ends', 'R-DEBT-005: and ends within the horizon');

-- ===========================================================================
-- A reopen with debt changes (R-VERSION-011, R-VERSION-110)
-- ===========================================================================
select public.update_debt(tests.id('rate'), (select revision from public.debts where id = tests.id('rate')), p_monthly_payment => 60000);
select tests.clear_authentication();
select tests.set_today((select end_date + 2 from pcur));
select tests.authenticate_as('paula');
select public.ensure_periods(tests.id('pb'));
select tests.remember('fresh', (select id from public.create_debt(tests.id('pb'), 'Fresh', 200000, tests.id('pb_loans'), 10000, 6)));
select public.update_debt(tests.id('rate'), (select revision from public.debts where id = tests.id('rate')), p_interest_rate => 6);
select is((select array_agg(record_name || ' ' || change order by record_name, change) from public.preview_reopen(tests.id('pb')) where record_kind = 'debt' and record_name in ('Equal', 'Fresh', 'Rate')),
          array['Equal interest_removed', 'Fresh added', 'Rate interest_removed', 'Rate terms_changed'],
  'R-PERIOD-035 R-VERSION-110: preview_reopen reports debts added, terms changed and interest removed');
select tests.reopen_previous_period(tests.id('pb'));
select is((select row(first_seq, interest_rate)::text from public.debt_overview where id = tests.id('fresh')), row(1, 6.000)::text,
  'R-VERSION-011: a debt added in the merged period now starts in the reopened one');
select is((select row(interest_rate, monthly_payment)::text from public.debt_overview where id = tests.id('rate')), row(6.000, 60000)::text,
  'R-VERSION-011: the terms in force before the reopen are in force after it');
select is((select count(*)::integer from public.debt_interest where budget_id = tests.id('pb')), 0,
  'R-DEBT-113: the interest of the merged period is gone');
select is((select count(*)::integer from public.transactions where budget_id = tests.id('pb') and debt_id is not null), 2,
  'R-VERSION-110: and no payment is lost');
select is_empty(format('select * from tests.step4_violations(%L)', tests.id('pb')), 'R-VERSION-110: the step 4 invariants hold after the reopen');
select lives_ok('set constraints all immediate', 'R-VERSION-011: and at commit');
set constraints all deferred;

select * from finish();
rollback;
