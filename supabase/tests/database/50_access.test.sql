-- Access matrix for every table, view and RPC of step 2: a non-member (who owns another
-- budget) and an anonymous visitor can neither read nor change budget A; hostile argument
-- combinations are refused. Members versus owner: see 40_members_invitations.test.sql.
begin;

select tests.create_user('alice', 'Alice');
select tests.create_user('bob', 'Bob');
select tests.create_user('carol', 'Carol');
select tests.create_user('dave', 'Dave');
select tests.set_today('2026-11-15');

-- Budget A: owner alice, member bob, a pending invitation for dave.
select tests.authenticate_as('alice');
select tests.remember('a', public.create_budget('A', 'Alice salary', 500000, 25, 'nearest', '2026-09-01'));
select tests.remember('a_income', (select primary_income_id from public.budgets where id = tests.id('a')));
select tests.remember('a_period', (select id from public.periods where budget_id = tests.id('a') and seq = 1));
select tests.remember('a_inv_bob', public.invite_member(tests.id('a'), tests.get_user_email('bob')));
select tests.remember('a_inv_dave', public.invite_member(tests.id('a'), tests.get_user_email('dave')));
select tests.authenticate_as('bob');
select public.accept_invitation(tests.id('a_inv_bob'));
select tests.remember('a_bob_income', public.add_income(tests.id('a'), 'Bob salary', 300000, 20));

-- Budget C: carol's own.
select tests.authenticate_as('carol');
select tests.remember('c', public.create_budget('C', 'Carol salary', 400000, 1));
select tests.remember('c_income', (select primary_income_id from public.budgets where id = tests.id('c')));
select tests.remember('c_second', public.add_income(tests.id('c'), 'Second', 1000, 1));
select tests.remember('c_period', (select id from public.periods where budget_id = tests.id('c') and seq = 1));
select tests.clear_authentication();

-- Every relation the client can read, with its budget column.
create temp table relations (name text, budget_column text) on commit drop;
insert into relations values
  ('budgets', 'id'), ('budget_members', 'budget_id'), ('budget_invitations', 'budget_id'),
  ('incomes', 'budget_id'), ('income_versions', 'budget_id'), ('periods', 'budget_id'),
  ('my_budgets', 'id'), ('budget_member_list', 'budget_id'), ('income_overview', 'budget_id'),
  ('period_summaries', 'budget_id');

-- Every RPC, called by carol against budget A, with the error she must get.
create temp table carol_calls (sql text, message text) on commit drop;
insert into carol_calls values
  (format('select public.set_budget_end_date(%L, %L)', tests.id('a'), '2027-01-01'), 'budget_not_found'),
  (format('select public.set_budget_end_date(%L, null)', tests.id('a')), 'budget_not_found'),
  (format('select public.invite_member(%L, %L)', tests.id('a'), tests.get_user_email('carol')), 'budget_not_found'),
  (format('select public.remove_member(%L, %L)', tests.id('a'), tests.get_user_id('bob')), 'budget_not_found'),
  (format('select public.leave_budget(%L)', tests.id('a')), 'budget_not_found'),
  (format('select public.add_income(%L, %L, 1000, 1)', tests.id('a'), 'Mine'), 'budget_not_found'),
  (format('select public.add_income(%L, %L, 1000, 1, %L, %L)', tests.id('a'), 'Mine', 'nearest', tests.get_user_id('carol')), 'budget_not_found'),
  (format('select public.add_income(%L, %L, 1000, 1, %L, null, %L)', tests.id('c'), 'Mine', 'nearest', tests.id('a_period')), 'period_not_found'),
  (format('select public.update_income_terms(%L, 1, 1, %L)', tests.id('a_income'), 'nearest'), 'income_not_found'),
  (format('select public.update_income_terms(%L, 1, 1, %L, %L)', tests.id('a_income'), 'nearest', tests.id('a_period')), 'income_not_found'),
  (format('select public.remove_income(%L, %L)', tests.id('a_bob_income'), tests.id('a_period')), 'income_not_found'),
  (format('select public.update_income_terms(%L, 1, 1, %L, %L)', tests.id('c_income'), 'nearest', tests.id('a_period')), 'period_not_found'),
  (format('select public.remove_income(%L, %L)', tests.id('c_second'), tests.id('a_period')), 'period_not_found'),
  (format('select public.set_primary_income(%L)', tests.id('a_bob_income')), 'income_not_found'),
  (format('select public.remove_income(%L)', tests.id('a_bob_income')), 'income_not_found'),
  (format('select public.ensure_periods(%L)', tests.id('a')), 'budget_not_found'),
  (format('select public.get_current_period(%L)', tests.id('a')), 'budget_not_found'),
  (format('select public.move_period_boundary(%L, %L)', tests.id('a_period'), '2026-10-20'), 'period_not_found'),
  (format('select public.move_period_boundary(%L, null)', tests.id('a_period')), 'period_not_found'),
  (format('select public.accept_invitation(%L)', tests.id('a_inv_dave')), 'invitation_not_found'),
  (format('select public.decline_invitation(%L)', tests.id('a_inv_dave')), 'invitation_not_found'),
  -- hostile arguments
  ('select public.ensure_periods(null)', 'budget_not_found'),
  ('select public.move_period_boundary(null, null)', 'period_not_found'),
  ('select public.accept_invitation(null)', 'invitation_not_found'),
  ($$select public.create_budget(null, 'x', 1, 1)$$, 'invalid_name'),
  ($$select public.create_budget('x', 'x', null, 1)$$, 'invalid_amount'),
  ($$select public.create_budget('x', 'x', 1, null)$$, 'invalid_pay_day'),
  ($$select public.create_budget('x', 'x', 1, 1, null)$$, 'invalid_weekend_rule'),
  ($$select public.create_budget('x', 'x', 1, 1, 'nearest', '1900-01-01')$$, 'invalid_start_month'),
  ($$select public.create_budget(repeat('x', 101), 'x', 1, 1)$$, 'invalid_name'),
  ($$select public.get_start_months(32)$$, 'invalid_pay_day'),
  ($$select public.get_start_months(1, null)$$, 'invalid_weekend_rule'),
  (format('select public.move_period_boundary(%L, %L)', tests.id('c_period'), 'infinity'), 'invalid_boundary'),
  (format('select public.set_budget_end_date(%L, %L)', tests.id('c'), '-infinity'), 'invalid_end_date');

-- Direct writes carol must not be able to make at all (no privilege).
create temp table carol_denied (sql text) on commit drop;
insert into carol_denied values
  (format($$insert into public.budgets (name, owner_id, primary_income_id) values ('x', %L, %L)$$, tests.get_user_id('carol'), tests.id('a_income'))),
  (format('insert into public.budget_members (budget_id, user_id) values (%L, %L)', tests.id('a'), tests.get_user_id('carol'))),
  (format($$insert into public.budget_invitations (budget_id, email) values (%L, 'x@test.local')$$, tests.id('a'))),
  (format($$insert into public.incomes (budget_id, name, first_seq) values (%L, 'x', 1)$$, tests.id('a'))),
  (format('insert into public.income_versions (income_id, budget_id, effective_from_seq, amount, pay_day) values (%L, %L, 5, 1, 1)', tests.id('a_income'), tests.id('a'))),
  (format($$insert into public.periods (budget_id, seq, start_date, end_date) values (%L, 9, '2030-01-01', '2030-01-30')$$, tests.id('a'))),
  (format('update public.periods set end_date = end_date where budget_id = %L', tests.id('a'))),
  (format('update public.income_versions set amount = 1 where budget_id = %L', tests.id('a'))),
  (format('update public.budgets set end_month = null where id = %L', tests.id('a'))),
  (format('update public.incomes set end_seq = 1 where budget_id = %L', tests.id('a'))),
  (format('delete from public.incomes where budget_id = %L', tests.id('a'))),
  (format('delete from public.periods where budget_id = %L', tests.id('a'))),
  (format('delete from public.budget_members where budget_id = %L', tests.id('a'))),
  -- internal helpers are not callable
  (format('select private.ensure_periods(%L)', tests.id('a'))),
  (format('select private.end_member_incomes(%L, %L)', tests.id('a'), tests.get_user_id('bob'))),
  (format('select private.is_budget_member(%L)', tests.id('a'))),
  ('select private.current_verified_email()');

-- Every RPC, for anon.
create temp table anon_calls (sql text) on commit drop;
insert into anon_calls values
  ('select public.pay_date(2026, 1, 1)'),
  ('select public.get_start_months(25)'),
  ($$select public.create_budget('x', 'x', 1, 1)$$),
  (format('select public.set_budget_end_date(%L, null)', tests.id('a'))),
  (format('select public.invite_member(%L, %L)', tests.id('a'), 'x@test.local')),
  ('select public.list_my_invitations()'),
  (format('select public.accept_invitation(%L)', tests.id('a_inv_dave'))),
  (format('select public.decline_invitation(%L)', tests.id('a_inv_dave'))),
  (format('select public.remove_member(%L, %L)', tests.id('a'), tests.get_user_id('bob'))),
  (format('select public.leave_budget(%L)', tests.id('a'))),
  (format('select public.add_income(%L, %L, 1, 1)', tests.id('a'), 'x')),
  (format('select public.update_income_terms(%L, 1, 1, %L)', tests.id('a_income'), 'nearest')),
  (format('select public.set_primary_income(%L)', tests.id('a_income'))),
  (format('select public.remove_income(%L)', tests.id('a_bob_income'))),
  (format('select public.ensure_periods(%L)', tests.id('a'))),
  (format('select public.get_current_period(%L)', tests.id('a'))),
  (format('select public.move_period_boundary(%L, null)', tests.id('a_period')));

grant select on relations, carol_calls, carol_denied, anon_calls to anon, authenticated;

select plan(
  (select count(*)::integer from relations) * 2
  + (select count(*)::integer from carol_calls)
  + (select count(*)::integer from carol_denied)
  + (select count(*)::integer from anon_calls)
  + 9
);

-- ---------------------------------------------------------------------------
-- Non-member (owner of another budget)
-- ---------------------------------------------------------------------------
select tests.authenticate_as('carol');

select is_empty(
  format('select 1 from public.%I where %I = %L', name, budget_column, tests.id('a')),
  'R-SECURITY-002 C-RLS-001: a non-member reads nothing of budget A from ' || name
) from relations;

select throws_ok(sql, 'P0001', message, 'R-SECURITY-002 R-SECURITY-004: non-member: ' || sql) from carol_calls;

select throws_ok(sql, '42501', null, 'R-SECURITY-001 R-SECURITY-002: non-member, no privilege: ' || sql) from carol_denied;

-- Writes that are granted but filtered by RLS change nothing.
update public.budgets set name = 'Hacked' where id = tests.id('a');
delete from public.budgets where id = tests.id('a');
update public.incomes set name = 'Hacked' where budget_id = tests.id('a');
delete from public.budget_invitations where budget_id = tests.id('a');

select tests.clear_authentication();
select is(
  (select name from public.budgets where id = tests.id('a')), 'A',
  'R-SECURITY-002: a non-member cannot rename or delete budget A'
);
select is(
  (select count(*)::integer from public.incomes where budget_id = tests.id('a') and name = 'Hacked'), 0,
  'R-SECURITY-002: nor rename its incomes'
);
select is(
  (select count(*)::integer from public.budget_invitations where id = tests.id('a_inv_dave')), 1,
  'R-SECURITY-002: nor cancel its invitations'
);
select is(
  (select count(*)::integer from public.budget_members where budget_id = tests.id('a')), 2,
  'R-SECURITY-002: and has not become a member'
);

-- The non-member's own budget is unaffected by their failed attempts and still theirs.
select tests.authenticate_as('carol');
select results_eq(
  'select id, is_owner from public.my_budgets',
  format('values (%L::uuid, true)', tests.id('c')),
  'R-SECURITY-002: carol sees exactly her own budget'
);

-- ---------------------------------------------------------------------------
-- Anonymous visitor
-- ---------------------------------------------------------------------------
select tests.authenticate_as_anon();

select throws_ok(
  format('select 1 from public.%I', name), '42501', null,
  'R-SECURITY-003: anon cannot read ' || name
) from relations;

select throws_ok(sql, '42501', null, 'R-SECURITY-003: anon cannot call: ' || sql) from anon_calls;

select tests.clear_authentication();

-- ---------------------------------------------------------------------------
-- A member's direct writes are limited to what the columns allow
-- ---------------------------------------------------------------------------
select tests.authenticate_as('bob');
select throws_ok(
  format('update public.incomes set budget_id = %L where id = %L', tests.id('c'), tests.id('a_bob_income')),
  '42501', null, 'R-BUDGET-001: a member cannot move an income to another budget'
);
select throws_ok(
  format('update public.incomes set user_id = %L where id = %L', tests.get_user_id('carol'), tests.id('a_bob_income')),
  '42501', null, 'R-SECURITY-001: nor reassign it'
);
select throws_ok(
  format('update public.budgets set primary_income_id = %L where id = %L', tests.id('a_bob_income'), tests.id('a')),
  '42501', null, 'R-INCOME-006: nor switch the primary income without the RPC'
);
select throws_ok(
  format('update public.budgets set end_month = %L where id = %L', '2027-01-01', tests.id('a')),
  '42501', null, 'R-MEMBER-003: nor set the end date without the RPC'
);

select * from finish();
rollback;
