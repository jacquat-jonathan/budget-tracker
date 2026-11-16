-- Access matrix for every relation and RPC of step 3: a non-member (who owns another budget)
-- and an anonymous visitor can neither read nor change budget A's categories, expectations or
-- transactions; hostile arguments (ids of another budget or period) are refused and cannot
-- make the totals lie. Members: bob is a member of A and may do everything alice can.
begin;

select tests.create_user('alice', 'Alice');
select tests.create_user('bob', 'Bob');
select tests.create_user('carol', 'Carol');
select tests.set_today('2026-11-15');

-- Budget A: owner alice, member bob, with a group, a leaf and transactions.
select tests.authenticate_as('alice');
select tests.remember('a', public.create_budget('A', 'Alice salary', 500000, 25, 'nearest', '2026-09-01'));
select tests.remember('a_p1', (select id from public.periods where budget_id = tests.id('a') and seq = 1));
select tests.remember('a_p2', (select id from public.periods where budget_id = tests.id('a') and seq = 2));
select tests.remember('a_income', (select primary_income_id from public.budgets where id = tests.id('a')));
select tests.remember('a_food', (select id from public.create_category(tests.id('a'), 'Food', p_amount => 50000, p_from_period_id => tests.id('a_p1'))));
select tests.remember('a_home', (select id from public.create_category(tests.id('a'), 'Home', p_from_period_id => tests.id('a_p1'))));
select tests.remember('a_repairs', (select id from public.create_category(tests.id('a'), 'Repairs', tests.id('a_home'), 1000)));
select tests.remember('a_tx', (select id from public.add_transaction(tests.id('a'), 'expense', 1200, '2026-11-01', tests.id('a_food'))));
select public.add_transaction(tests.id('a'), 'extra_income', 3000, '2026-10-01');
select tests.remember('a_inv', public.invite_member(tests.id('a'), tests.get_user_email('bob')));
select tests.authenticate_as('bob');
select public.accept_invitation(tests.id('a_inv'));

-- Budget C: carol's own.
select tests.authenticate_as('carol');
select tests.remember('c', public.create_budget('C', 'Carol salary', 400000, 25, 'nearest', '2026-09-01'));
select tests.remember('c_p1', (select id from public.periods where budget_id = tests.id('c') and seq = 1));
select tests.remember('c_income', (select primary_income_id from public.budgets where id = tests.id('c')));
select tests.remember('c_food', (select id from public.create_category(tests.id('c'), 'Food', p_from_period_id => tests.id('c_p1'))));
select tests.remember('c_tx', (select id from public.add_transaction(tests.id('c'), 'expense', 100, '2026-11-01', tests.id('c_food'))));
select tests.clear_authentication();

create temp table snapshot as
  select (select row(expected_total, spent_total, income_total)::text from public.period_summaries where id = tests.id('a_p2')) as a_totals,
         (select string_agg(row(id, name, revision)::text, ',' order by id) from public.categories where budget_id = tests.id('a')) as a_categories,
         (select string_agg(row(id, amount, category_id, revision)::text, ',' order by id) from public.transactions where budget_id = tests.id('a')) as a_transactions;

create temp table relations (name text, budget_column text) on commit drop;
insert into relations values
  ('categories', 'budget_id'), ('category_expectations', 'budget_id'), ('transactions', 'budget_id'),
  ('category_overview', 'budget_id'), ('transaction_list', 'budget_id'), ('period_summaries', 'budget_id');

-- Every step 3 RPC (and the new step 2 ones), called by carol against budget A.
create temp table carol_calls (sql text, message text) on commit drop;
insert into carol_calls values
  (format('select public.rename_budget(%L, %L, 1)', tests.id('a'), 'x'), 'budget_not_found'),
  (format('select public.rename_income(%L, %L, 1)', tests.id('a_income'), 'x'), 'income_not_found'),
  (format('select public.update_income_terms(%L, 1, 1, %L, null, 1)', tests.id('a_income'), 'nearest'), 'income_not_found'),
  (format('select public.remove_income(%L, null, 1)', tests.id('a_income')), 'income_not_found'),
  (format('select public.set_budget_end_date(%L, null, 1)', tests.id('a')), 'budget_not_found'),
  (format('select public.create_category(%L, %L)', tests.id('a'), 'x'), 'budget_not_found'),
  (format('select public.update_category(%L, 1, %L)', tests.id('a_food'), 'x'), 'category_not_found'),
  (format('select public.update_category(%L, 1, p_amount => 1)', tests.id('a_food')), 'category_not_found'),
  (format('select public.reorder_categories(%L, null, array[%L]::uuid[])', tests.id('a'), tests.id('a_food')), 'budget_not_found'),
  (format('select public.end_category(%L, 1)', tests.id('a_food')), 'category_not_found'),
  (format('select public.list_categories_for_date(%L, %L)', tests.id('a'), '2026-11-01'), 'budget_not_found'),
  (format('select public.add_transaction(%L, %L, 1, %L, %L)', tests.id('a'), 'expense', '2026-11-01', tests.id('a_food')), 'budget_not_found'),
  (format('select public.update_transaction(%L, 1, %L, 1, %L, %L)', tests.id('a_tx'), 'expense', '2026-11-01', tests.id('a_food')), 'transaction_not_found'),
  (format('select public.delete_transaction(%L, 1)', tests.id('a_tx')), 'transaction_not_found'),
  (format('select public.list_transactions(%L)', tests.id('a')), 'budget_not_found'),
  (format('select public.get_period_progress(%L)', tests.id('a_p2')), 'period_not_found'),
  -- cross-budget references from carol's own budget
  (format('select public.add_transaction(%L, %L, 1, %L, %L)', tests.id('c'), 'expense', '2026-11-01', tests.id('a_food')), 'category_not_found'),
  (format('select public.update_transaction(%L, 1, %L, 1, %L, %L)', tests.id('c_tx'), 'expense', '2026-11-01', tests.id('a_food')), 'category_not_found'),
  (format('select public.create_category(%L, %L, %L)', tests.id('c'), 'Sub', tests.id('a_home')), 'category_not_found'),
  (format('select public.create_category(%L, %L, p_from_period_id => %L)', tests.id('c'), 'x', tests.id('a_p1')), 'period_not_found'),
  (format('select public.update_category(%L, 1, p_amount => 1, p_from_period_id => %L)', tests.id('c_food'), tests.id('a_p1')), 'period_not_found'),
  (format('select public.end_category(%L, 1, %L)', tests.id('c_food'), tests.id('a_p1')), 'period_not_found'),
  (format('select public.reorder_categories(%L, null, array[%L, %L]::uuid[])', tests.id('c'), tests.id('c_food'), tests.id('a_food')), 'record_changed'),
  (format('select public.reorder_categories(%L, %L, array[%L]::uuid[])', tests.id('c'), tests.id('a_home'), tests.id('a_repairs')), 'category_not_found'),
  (format('select public.list_transactions(%L, p_category_id => %L)', tests.id('c'), tests.id('a_food')), 'category_not_found'),
  -- hostile arguments
  ('select public.create_category(null, ''x'')', 'budget_not_found'),
  ('select public.update_category(null, 1)', 'category_not_found'),
  (format('select public.update_category(%L, null)', tests.id('c_food')), 'invalid_revision'),
  (format('select public.end_category(%L, null)', tests.id('c_food')), 'invalid_revision'),
  (format('select public.delete_transaction(%L, null)', tests.id('c_tx')), 'invalid_revision'),
  (format('select public.rename_budget(%L, %L, null)', tests.id('c'), 'x'), 'invalid_revision'),
  (format('select public.reorder_categories(%L, null, null)', tests.id('c')), 'record_changed'),
  (format('select public.reorder_categories(%L, null, array_fill(%L::uuid, array[3000]))', tests.id('c'), tests.id('c_food')), 'record_changed'),
  ('select public.get_period_progress(null)', 'period_not_found'),
  ('select public.delete_transaction(null, 1)', 'transaction_not_found'),
  (format('select public.list_transactions(%L, 100000)', tests.id('c')), 'invalid_limit'),
  (format('select public.list_transactions(%L, null)', tests.id('c')), 'invalid_limit'),
  (format('select public.list_categories_for_date(%L, %L)', tests.id('c'), '-infinity'), 'invalid_date'),
  (format('select public.add_transaction(%L, %L, 9223372036854775807, %L, %L)', tests.id('c'), 'expense', '2026-11-01', tests.id('c_food')), 'invalid_amount'),
  (format('select public.create_category(%L, %L, p_amount => 9223372036854775807)', tests.id('c'), 'x'), 'invalid_amount'),
  (format('select public.create_category(%L, %L, %L, p_other_name => %L)', tests.id('c'), 'x', tests.id('c_food'), repeat('x', 101)), 'invalid_name');

-- Direct writes nobody may make (no privilege), and internal helpers.
create temp table carol_denied (sql text) on commit drop;
insert into carol_denied values
  (format($$insert into public.categories (budget_id, name, first_seq) values (%L, 'x', 1)$$, tests.id('a'))),
  (format('insert into public.category_expectations (category_id, budget_id, effective_from_seq, amount) values (%L, %L, 1, 1)', tests.id('a_food'), tests.id('a'))),
  (format($$insert into public.transactions (budget_id, amount, date, category_id) values (%L, 1, '2026-11-01', %L)$$, tests.id('a'), tests.id('a_food'))),
  (format($$insert into public.transactions (budget_id, amount, date, category_id) values (%L, 1, '2026-11-01', %L)$$, tests.id('c'), tests.id('c_food'))),
  (format('update public.categories set name = %L where budget_id = %L', 'x', tests.id('c'))),
  (format('update public.category_expectations set amount = 1 where budget_id = %L', tests.id('c'))),
  (format('update public.transactions set amount = 1 where budget_id = %L', tests.id('c'))),
  (format('delete from public.transactions where budget_id = %L', tests.id('c'))),
  (format('delete from public.categories where budget_id = %L', tests.id('c'))),
  (format('update public.budgets set revision = 1 where id = %L', tests.id('c'))),
  (format('update public.incomes set revision = 1 where budget_id = %L', tests.id('c'))),
  (format('select private.category_progress(%L, 2, %L, %L)', tests.id('a'), '2026-10-26', '2026-11-24')),
  (format('select private.rekey_period(%L, 2, 1)', tests.id('c'))),
  (format('select private.lock_category(%L)', tests.id('a_food'))),
  (format('select private.assert_transaction_category(%L, %L, %L, 2)', tests.id('a'), 'expense', tests.id('a_food')));

create temp table anon_calls (sql text) on commit drop;
insert into anon_calls values
  (format('select public.rename_budget(%L, %L, 1)', tests.id('a'), 'x')),
  (format('select public.rename_income(%L, %L, 1)', tests.id('a_income'), 'x')),
  (format('select public.create_category(%L, %L)', tests.id('a'), 'x')),
  (format('select public.update_category(%L, 1, %L)', tests.id('a_food'), 'x')),
  (format('select public.reorder_categories(%L, null, array[]::uuid[])', tests.id('a'))),
  (format('select public.end_category(%L, 1)', tests.id('a_food'))),
  (format('select public.list_categories_for_date(%L, %L)', tests.id('a'), '2026-11-01')),
  (format('select public.add_transaction(%L, %L, 1, %L, %L)', tests.id('a'), 'expense', '2026-11-01', tests.id('a_food'))),
  (format('select public.update_transaction(%L, 1, %L, 1, %L, %L)', tests.id('a_tx'), 'expense', '2026-11-01', tests.id('a_food'))),
  (format('select public.delete_transaction(%L, 1)', tests.id('a_tx'))),
  (format('select public.list_transactions(%L)', tests.id('a'))),
  (format('select public.get_period_progress(%L)', tests.id('a_p2')));

grant select on relations, carol_calls, carol_denied, anon_calls, snapshot to anon, authenticated;

select plan(
  (select count(*)::integer from relations) * 2
  + (select count(*)::integer from carol_calls)
  + (select count(*)::integer from carol_denied)
  + (select count(*)::integer from anon_calls)
  + 9
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
select is(private.recorder_name(tests.id('a'), tests.get_user_id('alice')), null::text,
  'R-TRANSACTION-095: the recorder-name helper answers nothing about a budget I am not in');

select tests.clear_authentication();
select results_eq(
  $$select (select row(expected_total, spent_total, income_total)::text from public.period_summaries where id = tests.id('a_p2')),
           (select string_agg(row(id, name, revision)::text, ',' order by id) from public.categories where budget_id = tests.id('a')),
           (select string_agg(row(id, amount, category_id, revision)::text, ',' order by id) from public.transactions where budget_id = tests.id('a'))$$,
  'select a_totals, a_categories, a_transactions from snapshot',
  'R-SECURITY-002: after all those attempts budget A''s categories, transactions and totals are unchanged'
);
select is((select count(*)::integer from public.transactions where budget_id = tests.id('c') and category_id <> tests.id('c_food')), 0,
  'R-SECURITY-002: no transaction of budget C points at another budget''s category');

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
select is((select count(*)::integer from public.category_overview where budget_id = tests.id('a')), 3,
  'R-SECURITY-002: a member reads the budget''s categories');
select lives_ok(format('select public.update_category(%L, %s, p_amount => 1)', tests.id('a_food'),
                       (select revision from public.categories where id = tests.id('a_food'))),
  'R-SECURITY-002: and edits one created by another member');
select lives_ok(format($$select public.update_transaction(%L, %s, 'expense', 1300, '2026-11-01', %L)$$, tests.id('a_tx'),
                       (select revision from public.transactions where id = tests.id('a_tx')), tests.id('a_food')),
  'R-SECURITY-002: and a transaction another member recorded');
select is((select count(*)::integer from public.list_transactions(tests.id('a'))), 2, 'R-TRANSACTION-095: and lists them');
select ok((select count(*) from public.get_period_progress(tests.id('a_p2'))) > 0, 'R-PROGRESS-090: and reads the progress');
select tests.authenticate_as('carol');
select is((select count(*)::integer from public.list_transactions(tests.id('c'))), 1,
  'R-SECURITY-002: carol''s own list holds exactly her transaction');
select tests.clear_authentication();

select * from finish();
rollback;
