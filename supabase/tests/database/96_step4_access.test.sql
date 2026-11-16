-- Access matrix for every relation and RPC of step 4: a non-member (who owns another budget)
-- and an anonymous visitor can neither read nor change budget A's subscriptions, debts,
-- charges, adjustments, interest or history; hostile arguments (ids of another budget, a
-- debt or subscription of another budget, a category of another budget) are refused and
-- cannot make the remaining amount, the committed figure or the totals lie. bob is a member
-- of A and may do everything alice can.
begin;

select tests.create_user('alice', 'Alice');
select tests.create_user('bob', 'Bob');
select tests.create_user('carol', 'Carol');
select tests.set_today('2026-11-16');

-- Budget A: owner alice, member bob, with a subscription (and a charge), a debt (a payment,
-- an adjustment, interest).
select tests.authenticate_as('alice');
select tests.remember('a', public.create_budget('A', 'Alice salary', 500000, 25, 'nearest', '2026-09-01'));
select tests.remember('a_p1', (select id from public.periods where budget_id = tests.id('a') and seq = 1));
select tests.remember('a_cat', (select id from public.create_category(tests.id('a'), 'Bills', p_amount => 50000, p_from_period_id => tests.id('a_p1'))));
select tests.remember('a_sub', (select id from public.create_subscription(tests.id('a'), 'Phone', 3000, 'monthly', tests.id('a_cat'), '2026-10-01', tests.id('a_p1'))));
select tests.remember('a_charge', (select id from public.transactions where subscription_id = tests.id('a_sub') order by date limit 1));
select tests.remember('a_debt', (select id from public.create_debt(tests.id('a'), 'Loan', 100000, tests.id('a_cat'), 10000, 12, tests.id('a_p1'))));
select tests.remember('a_pay', (select id from public.add_transaction(tests.id('a'), 'expense', 10000, '2026-11-01', tests.id('a_cat'), p_debt_id => tests.id('a_debt'))));
select public.adjust_debt_balance(tests.id('a_debt'), 1, 95000, '2026-11-02');
select tests.remember('a_adj', (select id from public.debt_adjustments where debt_id = tests.id('a_debt')));
select tests.remember('a_inv', public.invite_member(tests.id('a'), tests.get_user_email('bob')));
select tests.authenticate_as('bob');
select public.accept_invitation(tests.id('a_inv'));

-- Budget C: carol's own.
select tests.authenticate_as('carol');
select tests.remember('c', public.create_budget('C', 'Carol salary', 400000, 25, 'nearest', '2026-09-01'));
select tests.remember('c_p1', (select id from public.periods where budget_id = tests.id('c') and seq = 1));
select tests.remember('c_cat', (select id from public.create_category(tests.id('c'), 'Bills', p_from_period_id => tests.id('c_p1'))));
select tests.remember('c_sub', (select id from public.create_subscription(tests.id('c'), 'Mine', 100, 'monthly', tests.id('c_cat'), '2027-01-01')));
select tests.remember('c_debt', (select id from public.create_debt(tests.id('c'), 'Mine', 1000, tests.id('c_cat'), 100)));
select tests.remember('c_tx', (select id from public.add_transaction(tests.id('c'), 'expense', 100, '2026-11-01', tests.id('c_cat'))));
select tests.clear_authentication();

-- interest on A's debt at the next roll-over (done as a member opening it later)
create temp table snapshot as
  select (select string_agg(row(id, name, revision, charged_through)::text, ',' order by id) from public.subscriptions where budget_id = tests.id('a')) as a_subs,
         (select string_agg(row(id, price, category_id, anchor_date)::text, ',' order by id) from public.subscription_versions where budget_id = tests.id('a')) as a_terms,
         (select string_agg(row(id, name, principal, category_id, revision)::text, ',' order by id) from public.debts where budget_id = tests.id('a')) as a_debts,
         (select string_agg(row(id, amount)::text, ',' order by id) from public.debt_adjustments where budget_id = tests.id('a')) as a_adjustments,
         (select string_agg(row(id, amount, category_id, revision, debt_id, subscription_id, review_state)::text, ',' order by id)
          from public.transactions where budget_id = tests.id('a')) as a_transactions,
         (select string_agg(row(seq, committed_total, spent_total)::text, ',' order by seq) from public.period_summaries where budget_id = tests.id('a')) as a_totals;

create temp table relations (name text, budget_column text) on commit drop;
insert into relations values
  ('subscriptions', 'budget_id'), ('subscription_versions', 'budget_id'), ('debts', 'budget_id'),
  ('debt_versions', 'budget_id'), ('debt_adjustments', 'budget_id'), ('debt_interest', 'budget_id'),
  ('subscription_overview', 'budget_id'), ('debt_overview', 'budget_id'), ('transaction_list', 'budget_id');

-- Every step 4 RPC, called by carol against budget A, and hostile arguments from her own.
create temp table carol_calls (sql text, message text) on commit drop;
insert into carol_calls values
  (format($$select public.create_subscription(%L, 'x', 1, 'monthly', %L, '2026-11-01')$$, tests.id('a'), tests.id('a_cat')), 'budget_not_found'),
  (format('select public.update_subscription(%L, 1, %L)', tests.id('a_sub'), 'x'), 'subscription_not_found'),
  (format('select public.update_subscription(%L, 1, p_price => 1)', tests.id('a_sub')), 'subscription_not_found'),
  (format('select public.end_subscription(%L, 1)', tests.id('a_sub')), 'subscription_not_found'),
  (format('select public.confirm_subscription_charge(%L, 1)', tests.id('a_charge')), 'transaction_not_found'),
  (format('select public.dismiss_subscription_charge(%L, 1)', tests.id('a_charge')), 'transaction_not_found'),
  (format('select public.list_charges_awaiting_confirmation(%L)', tests.id('a')), 'budget_not_found'),
  (format('select public.link_transaction(%L, 1, %L)', tests.id('a_pay'), tests.id('c_debt')), 'transaction_not_found'),
  (format('select public.create_debt(%L, %L, 1, %L, 1)', tests.id('a'), 'x', tests.id('a_cat')), 'budget_not_found'),
  (format('select public.update_debt(%L, 1, %L)', tests.id('a_debt'), 'x'), 'debt_not_found'),
  (format('select public.update_debt(%L, 1, p_interest_rate => 0)', tests.id('a_debt')), 'debt_not_found'),
  (format('select public.remove_debt(%L, 1)', tests.id('a_debt')), 'debt_not_found'),
  (format('select public.adjust_debt_balance(%L, 1, 0)', tests.id('a_debt')), 'debt_not_found'),
  (format('select public.delete_debt_adjustment(%L, 1)', tests.id('a_adj')), 'adjustment_not_found'),
  (format('select public.get_debt_history(%L)', tests.id('a_debt')), 'debt_not_found'),
  (format('select public.update_transaction(%L, 1, %L, 1, %L, %L)', tests.id('a_charge'), 'expense', '2026-11-01', tests.id('a_cat')), 'transaction_not_found'),
  -- cross-budget references from carol's own budget
  (format($$select public.add_transaction(%L, 'expense', 1, '2026-11-01', %L, p_debt_id => %L)$$, tests.id('c'), tests.id('c_cat'), tests.id('a_debt')), 'debt_not_found'),
  (format($$select public.add_transaction(%L, 'expense', 1, '2026-11-01', %L, p_subscription_id => %L)$$, tests.id('c'), tests.id('c_cat'), tests.id('a_sub')), 'subscription_not_found'),
  (format('select public.link_transaction(%L, 1, %L)', tests.id('c_tx'), tests.id('a_debt')), 'debt_not_found'),
  (format('select public.link_transaction(%L, 1, null, %L)', tests.id('c_tx'), tests.id('a_sub')), 'subscription_not_found'),
  (format($$select public.create_subscription(%L, 'x', 1, 'monthly', %L, '2026-11-01')$$, tests.id('c'), tests.id('a_cat')), 'category_not_found'),
  (format($$select public.create_subscription(%L, 'x', 1, 'monthly', %L, '2026-11-01', %L)$$, tests.id('c'), tests.id('c_cat'), tests.id('a_p1')), 'period_not_found'),
  (format('select public.update_subscription(%L, 1, p_category_id => %L)', tests.id('c_sub'), tests.id('a_cat')), 'category_not_found'),
  (format('select public.update_subscription(%L, 1, p_price => 1, p_from_period_id => %L)', tests.id('c_sub'), tests.id('a_p1')), 'period_not_found'),
  (format('select public.end_subscription(%L, 1, %L)', tests.id('c_sub'), tests.id('a_p1')), 'period_not_found'),
  (format('select public.create_debt(%L, %L, 1, %L, 1)', tests.id('c'), 'x', tests.id('a_cat')), 'category_not_found'),
  (format('select public.update_debt(%L, 1, p_category_id => %L)', tests.id('c_debt'), tests.id('a_cat')), 'category_not_found'),
  (format('select public.update_debt(%L, 1, p_monthly_payment => 1, p_from_period_id => %L)', tests.id('c_debt'), tests.id('a_p1')), 'period_not_found'),
  (format('select public.remove_debt(%L, 1, %L)', tests.id('c_debt'), tests.id('a_p1')), 'period_not_found'),
  -- hostile arguments
  ('select public.update_subscription(null, 1)', 'subscription_not_found'),
  ('select public.get_debt_history(null)', 'debt_not_found'),
  ('select public.delete_debt_adjustment(null, 1)', 'adjustment_not_found'),
  (format('select public.update_subscription(%L, null, p_name => %L)', tests.id('c_sub'), 'x'), 'invalid_revision'),
  (format('select public.end_subscription(%L, null)', tests.id('c_sub')), 'invalid_revision'),
  (format('select public.update_debt(%L, null)', tests.id('c_debt')), 'invalid_revision'),
  (format('select public.remove_debt(%L, null)', tests.id('c_debt')), 'invalid_revision'),
  (format('select public.adjust_debt_balance(%L, null, 0)', tests.id('c_debt')), 'invalid_revision'),
  (format('select public.adjust_debt_balance(%L, 1, 9223372036854775807)', tests.id('c_debt')), 'invalid_amount'),
  (format('select public.create_debt(%L, %L, 9223372036854775807, %L, 1)', tests.id('c'), 'x', tests.id('c_cat')), 'invalid_amount'),
  (format('select public.create_debt(%L, %L, 1, %L, 1, %s)', tests.id('c'), 'x', tests.id('c_cat'), '1e30'), 'invalid_interest_rate'),
  (format('select public.create_debt(%L, %L, 1, %L, 1, %s)', tests.id('c'), 'x', tests.id('c_cat'), '''NaN''::numeric'), 'invalid_interest_rate'),
  (format('select public.create_debt(%L, %L, 1, %L, 1, -1)', tests.id('c'), 'x', tests.id('c_cat')), 'invalid_interest_rate'),
  (format($$select public.create_subscription(%L, 'x', 9223372036854775807, 'monthly', %L, '2026-11-01')$$, tests.id('c'), tests.id('c_cat')), 'invalid_amount'),
  (format($$select public.create_subscription(%L, 'x', 1, 'monthly', %L, '-infinity')$$, tests.id('c'), tests.id('c_cat')), 'invalid_charge_date'),
  (format($$select public.update_subscription(%L, 1, p_next_charge_date => '2999-12-31')$$, tests.id('c_sub')), 'invalid_charge_date'),
  (format($$select public.adjust_debt_balance(%L, 1, 0, '1800-01-01')$$, tests.id('c_debt')), 'invalid_date'),
  (format('select public.adjust_debt_balance(%L, 1, 0, null, %L)', tests.id('c_debt'), repeat('x', 501)), 'invalid_description'),
  (format('select public.list_charges_awaiting_confirmation(%L, 100000)', tests.id('c')), 'invalid_limit'),
  (format('select public.confirm_subscription_charge(%L, 1)', tests.id('c_tx')), 'not_a_charge'),
  (format('select public.subscription_charge_dates(%L, %L, null, 1000000)', '2026-01-01', 'monthly'), 'invalid_limit'),
  (format('select public.subscription_charge_dates(%L, %L, %L)', '2026-01-01', 'monthly', '2999-01-01'), 'invalid_charge_date');

-- Direct writes nobody may make (no privilege), and internal helpers.
create temp table carol_denied (sql text) on commit drop;
insert into carol_denied values
  (format($$insert into public.subscriptions (budget_id, name, first_seq, charged_through) values (%L, 'x', 1, '2026-01-01')$$, tests.id('c'))),
  (format($$insert into public.subscription_versions (subscription_id, budget_id, effective_from_seq, price, cadence, category_id, anchor_date) values (%L, %L, 1, 1, 'monthly', %L, '2026-01-01')$$, tests.id('c_sub'), tests.id('c'), tests.id('c_cat'))),
  (format($$insert into public.debts (budget_id, name, category_id, principal, opened_on, first_seq) values (%L, 'x', %L, 1, '2026-11-01', 1)$$, tests.id('c'), tests.id('c_cat'))),
  (format('insert into public.debt_versions (debt_id, budget_id, effective_from_seq, monthly_payment) values (%L, %L, 1, 1)', tests.id('c_debt'), tests.id('c'))),
  (format($$insert into public.debt_adjustments (budget_id, debt_id, date, amount) values (%L, %L, '2026-11-01', -1000)$$, tests.id('c'), tests.id('c_debt'))),
  (format('insert into public.debt_interest (budget_id, debt_id, period_id, amount, rate, balance) values (%L, %L, %L, 1, 1, 1)', tests.id('c'), tests.id('c_debt'), tests.id('c_p1'))),
  (format('update public.subscriptions set charged_through = %L where budget_id = %L', '1900-01-01', tests.id('c'))),
  (format('update public.subscription_versions set price = 1 where budget_id = %L', tests.id('c'))),
  (format('update public.debts set principal = 1 where budget_id = %L', tests.id('c'))),
  (format('update public.debt_versions set interest_rate = 0 where budget_id = %L', tests.id('c'))),
  (format('update public.transactions set debt_id = null where budget_id = %L', tests.id('c'))),
  (format($$update public.transactions set review_state = 'confirmed' where budget_id = %L$$, tests.id('c'))),
  (format('delete from public.debt_interest where budget_id = %L', tests.id('c'))),
  (format('delete from public.debt_adjustments where budget_id = %L', tests.id('c'))),
  (format('delete from public.subscriptions where budget_id = %L', tests.id('c'))),
  (format('delete from public.debts where budget_id = %L', tests.id('c'))),
  (format('select private.materialise_charges(%L)', tests.id('a'))),
  (format('select private.lock_subscription(%L)', tests.id('a_sub'))),
  (format('select private.lock_debt(%L)', tests.id('a_debt'))),
  (format('select private.assert_transaction_link(%L, %L, %L, 1, %L, null)', tests.id('a'), 'expense', tests.id('a_cat'), tests.id('a_debt'))),
  (format('select private.charges_pending(%L)', tests.id('a')));

create temp table anon_calls (sql text) on commit drop;
insert into anon_calls values
  (format($$select public.create_subscription(%L, 'x', 1, 'monthly', %L, '2026-11-01')$$, tests.id('a'), tests.id('a_cat'))),
  (format('select public.update_subscription(%L, 1, %L)', tests.id('a_sub'), 'x')),
  (format('select public.end_subscription(%L, 1)', tests.id('a_sub'))),
  (format('select public.confirm_subscription_charge(%L, 1)', tests.id('a_charge'))),
  (format('select public.dismiss_subscription_charge(%L, 1)', tests.id('a_charge'))),
  (format('select public.list_charges_awaiting_confirmation(%L)', tests.id('a'))),
  (format('select public.link_transaction(%L, 1)', tests.id('a_pay'))),
  (format('select public.create_debt(%L, %L, 1, %L, 1)', tests.id('a'), 'x', tests.id('a_cat'))),
  (format('select public.update_debt(%L, 1, %L)', tests.id('a_debt'), 'x')),
  (format('select public.remove_debt(%L, 1)', tests.id('a_debt'))),
  (format('select public.adjust_debt_balance(%L, 1, 0)', tests.id('a_debt'))),
  (format('select public.delete_debt_adjustment(%L, 1)', tests.id('a_adj'))),
  (format('select public.get_debt_history(%L)', tests.id('a_debt'))),
  (format('select public.subscription_charge_dates(%L, %L)', '2026-01-01', 'monthly')),
  (format($$select public.add_transaction(%L, 'expense', 1, '2026-11-01', %L, p_debt_id => %L)$$, tests.id('a'), tests.id('a_cat'), tests.id('a_debt')));

grant select on relations, carol_calls, carol_denied, anon_calls, snapshot to anon, authenticated;

select plan(
  (select count(*)::integer from relations) * 2
  + (select count(*)::integer from carol_calls)
  + (select count(*)::integer from carol_denied)
  + (select count(*)::integer from anon_calls)
  + 16
);

-- ---------------------------------------------------------------------------
-- Non-member
-- ---------------------------------------------------------------------------
select tests.authenticate_as('carol');
select is_empty(
  format('select 1 from public.%I where %I = %L', name, budget_column, tests.id('a')),
  'R-SECURITY-002 C-RLS-001: a non-member reads nothing of budget A from ' || name
) from relations;
select throws_ok(sql, 'P0001', message, 'R-SECURITY-002 R-SECURITY-004: non-member or hostile argument: ' || sql) from carol_calls;
select throws_ok(sql, '42501', null, 'R-SECURITY-001 R-SECURITY-002: no privilege: ' || sql) from carol_denied;
select is(private.debt_remaining(tests.id('a_debt')), null::bigint,
  'R-SECURITY-002: the remaining-amount helper reveals nothing of a budget I am not in');
select is((select count(*)::integer from private.subscriptions_in_force(tests.id('a'), 1)), 0,
  'R-SECURITY-002: nor the committed-amount helper');

select tests.clear_authentication();
select results_eq(
  $$select (select string_agg(row(id, name, revision, charged_through)::text, ',' order by id) from public.subscriptions where budget_id = tests.id('a')),
           (select string_agg(row(id, price, category_id, anchor_date)::text, ',' order by id) from public.subscription_versions where budget_id = tests.id('a')),
           (select string_agg(row(id, name, principal, category_id, revision)::text, ',' order by id) from public.debts where budget_id = tests.id('a')),
           (select string_agg(row(id, amount)::text, ',' order by id) from public.debt_adjustments where budget_id = tests.id('a')),
           (select string_agg(row(id, amount, category_id, revision, debt_id, subscription_id, review_state)::text, ',' order by id)
            from public.transactions where budget_id = tests.id('a')),
           (select string_agg(row(seq, committed_total, spent_total)::text, ',' order by seq) from public.period_summaries where budget_id = tests.id('a'))$$,
  'select a_subs, a_terms, a_debts, a_adjustments, a_transactions, a_totals from snapshot',
  'R-SECURITY-002: after all those attempts budget A''s subscriptions, debts, charges, adjustments and totals are unchanged'
);
select is((select count(*)::integer from public.transactions where budget_id = tests.id('c') and (debt_id is not null or subscription_id is not null)), 0,
  'R-SECURITY-002: no transaction of budget C points at another budget''s debt or subscription');
select is((select count(*)::integer from public.subscription_versions where budget_id = tests.id('c') and category_id <> tests.id('c_cat')), 0,
  'R-SECURITY-002: no subscription of budget C uses another budget''s category');

-- ---------------------------------------------------------------------------
-- Anonymous visitor
-- ---------------------------------------------------------------------------
select tests.authenticate_as_anon();
select throws_ok(format('select 1 from public.%I', name), '42501', null, 'R-SECURITY-003: anon cannot read ' || name) from relations;
select throws_ok(sql, '42501', null, 'R-SECURITY-003: anon cannot call: ' || sql) from anon_calls;

-- ---------------------------------------------------------------------------
-- A member does everything (D-045)
-- ---------------------------------------------------------------------------
select tests.authenticate_as('bob');
select is((select count(*)::integer from public.subscription_overview where budget_id = tests.id('a')), 1,
  'R-SECURITY-002: a member reads the budget''s subscriptions');
select is((select count(*)::integer from public.debt_overview where budget_id = tests.id('a')), 1,
  'R-SECURITY-002: and debts');
select lives_ok(format('select public.update_subscription(%L, %s, p_price => 3100)', tests.id('a_sub'),
                       (select revision from public.subscriptions where id = tests.id('a_sub'))),
  'R-SECURITY-002: edits a subscription another member created');
select lives_ok(format('select public.confirm_subscription_charge(%L, %s)', tests.id('a_charge'),
                       (select revision from public.transactions where id = tests.id('a_charge'))),
  'R-SUBSCRIPTION-075: confirms a charge');
select lives_ok(format('select public.adjust_debt_balance(%L, %s, 90000)', tests.id('a_debt'),
                       (select revision from public.debts where id = tests.id('a_debt'))),
  'R-DEBT-075: adjusts a debt''s balance');
select ok((select count(*) from public.get_debt_history(tests.id('a_debt'))) >= 3, 'R-DEBT-004: and reads its history');
select is((select remaining from public.debt_overview where id = tests.id('a_debt')), 90000::bigint,
  'R-DEBT-075: the adjustment made the remaining amount what bob entered');
select is_empty(format('select * from tests.step4_violations(%L)', tests.id('a')), 'R-DEBT-003 R-SUBSCRIPTION-079: budget A''s figures equal a naive recomputation');

-- Deleting a budget deletes its subscriptions, debts and their whole history (R-BUDGET-001)
select tests.authenticate_as('alice');
select lives_ok(format('select public.delete_budget(%L)', tests.id('a')),
  'R-BUDGET-001 R-BUDGET-009: a budget with subscriptions, charges, debts, payments, adjustments and interest can be deleted');
select tests.clear_authentication();
select is((select count(*)::integer from public.subscription_versions where budget_id = tests.id('a'))
          + (select count(*)::integer from public.debt_adjustments where budget_id = tests.id('a'))
          + (select count(*)::integer from public.debt_interest where budget_id = tests.id('a'))
          + (select count(*)::integer from public.debt_versions where budget_id = tests.id('a')), 0,
  'R-BUDGET-001: and nothing of it is left');
select lives_ok(format('delete from auth.users where id = %L', tests.get_user_id('carol')),
  'R-BUDGET-001: deleting an account deletes the budgets it owns, with their subscriptions and debts');

select * from finish();
rollback;
