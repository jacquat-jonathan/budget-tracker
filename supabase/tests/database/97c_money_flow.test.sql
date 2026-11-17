-- Step 7, accounts and money flow: accounts, planned transfers and their versioned terms, due
-- dates, the checklist and its marks, the transactions of transfers linked to a category (made
-- by a mark, or by the catch-up for an automatic one), the money flow read from the plan, the
-- account an income is paid into, closing an account, ending a transfer, reopen, limits, and
-- what another user, a member of another budget and an anonymous visitor cannot do.
begin;
select plan(190);

select tests.create_user('ann', 'Ann');
select tests.create_user('bob', 'Bob');
select tests.create_user('eve', 'Eve');
select tests.set_today('2026-11-16');

-- Eve's own budget and account (another budget's ids, passed with Ann's)
select tests.authenticate_as('eve');
select tests.remember('e', public.create_budget('Eve', 'Salary', 400000, 25, 'nearest'));
select tests.remember('e_acc', (select id from public.create_account(tests.id('e'), 'Eve account', 'current')));
select tests.remember('e_income', (select primary_income_id from public.budgets where id = tests.id('e')));

select tests.authenticate_as('ann');
select tests.remember('b', public.create_budget('Flow', 'Salary', 600000, 25, 'nearest', '2026-09-01'));
select tests.remember('p1', (select id from public.periods where budget_id = tests.id('b') and seq = 1));
select tests.remember('p2', (select id from public.periods where budget_id = tests.id('b') and seq = 2));
select tests.remember('salary', (select primary_income_id from public.budgets where id = tests.id('b')));
select tests.remember('savings', (select id from public.create_category(tests.id('b'), 'Savings', p_amount => 150000, p_from_period_id => tests.id('p1'))));
select tests.remember('pillar', (select id from public.create_category(tests.id('b'), 'Third pillar', p_amount => 50000, p_from_period_id => tests.id('p1'))));
select tests.remember('home', (select id from public.create_category(tests.id('b'), 'Home', p_amount => 80000, p_from_period_id => tests.id('p1'))));
select tests.remember('netflix', (select id from public.create_subscription(tests.id('b'), 'Streaming', 1990, 'monthly', tests.id('home'), '2026-12-05')));
select tests.remember('inv', public.invite_member(tests.id('b'), tests.get_user_email('bob')));
select tests.authenticate_as('bob');
select public.accept_invitation(tests.id('inv'));
select tests.authenticate_as('ann');

-- error code and detail of a call, for the refusals that name what blocks them
create function pg_temp.refusal(q text) returns text language plpgsql as $$
declare
  v_detail text;
begin
  execute q;
  return 'no error';
exception when others then
  get stacked diagnostics v_detail = pg_exception_detail;
  return sqlerrm || coalesce(' ' || nullif(v_detail, ''), '');
end $$;

-- ===========================================================================
-- Accounts (R-ACCOUNT-001)
-- ===========================================================================
select tests.remember('main', (select id from public.create_account(tests.id('b'), ' Main ', 'current', ' Migros Bank ',
  tests.get_user_id('ann'), tests.id('p1'))));
select tests.remember('sav', (select id from public.create_account(tests.id('b'), 'Savings', 'savings', p_from_period_id => tests.id('p1'))));
select tests.remember('tax', (select id from public.create_account(tests.id('b'), 'Tax reserve', 'tax_reserve')));
select results_eq(
  format($$select name, kind::text, bank_label, user_id, user_display_name, user_is_member, is_active, first_seq, end_seq
           from public.account_overview where id = %L$$, tests.id('main')),
  format($$values ('Main', 'current', 'Migros Bank', %L::uuid, 'Ann', true, true, 1, null::integer)$$, tests.get_user_id('ann')),
  'R-ACCOUNT-001: an account has a name, a kind, a bank label and the member it belongs to, valid from a period');
select results_eq(
  format($$select user_id, user_is_member, first_seq from public.account_overview where id = %L$$, tests.id('tax')),
  $$values (null::uuid, null::boolean, 2)$$,
  'R-ACCOUNT-001: an account of nobody in particular is shared, and counts from the current period by default');
select throws_ok(format($$select * from public.create_account(%L, 'X', 'cash', null, %L)$$, tests.id('b'), tests.get_user_id('eve')),
  'P0001', 'member_not_found', 'R-ACCOUNT-001: an account belongs to a member of the budget or to nobody');
select throws_ok(format($$select * from public.create_account(%L, '  ', 'cash')$$, tests.id('b')),
  'P0001', 'invalid_name', 'R-ACCOUNT-001: an account needs a name');
select throws_ok(format($$select * from public.create_account(%L, 'X', null)$$, tests.id('b')),
  'P0001', 'invalid_account_kind', 'R-ACCOUNT-001: an account needs a kind');
select throws_ok(format($$select * from public.create_account(%L, 'X', 'cash', repeat('b', 101))$$, tests.id('b')),
  'P0001', 'invalid_bank_label', 'R-ACCOUNT-001: a bank label is at most 100 characters');
select is((select revision from public.update_account(tests.id('sav'), 1, p_name => 'Savings account', p_bank_label => 'Yuh')),
  2, 'R-ACCOUNT-001: renaming an account gives it a new revision');
select throws_ok(format($$select * from public.update_account(%L, 1, p_name => 'Late')$$, tests.id('sav')),
  'P0001', 'record_changed', 'R-CONCURRENCY-070: an account edit names the revision it read');
select results_eq(
  format($$select name, bank_label, user_id from public.update_account(%L, 1, p_clear_user => true)$$, tests.id('main')),
  $$values ('Main', 'Migros Bank', null::uuid)$$,
  'R-ACCOUNT-001: the holder can be cleared (the account becomes shared)');
select throws_ok(format($$select * from public.update_account(%L, 2, p_user_id => %L, p_clear_user => true)$$,
                        tests.id('main'), tests.get_user_id('ann')),
  'P0001', 'invalid_arguments', 'R-ACCOUNT-001: a holder and clearing it at once is refused');
select is((select user_id from public.update_account(tests.id('main'), 2, p_user_id => tests.get_user_id('ann'))),
  tests.get_user_id('ann'), 'R-ACCOUNT-001: and set again');

-- ===========================================================================
-- Planned transfers, schedules and due dates (R-ACCOUNT-002, R-ACCOUNT-003, R-ACCOUNT-070,
-- R-ACCOUNT-071, R-ACCOUNT-300, R-ACCOUNT-301)
-- ===========================================================================
-- automatic, linked to Savings, from the first period: its two transactions due by today are
-- created with it
select tests.remember('t_sav', (select id from public.create_transfer(tests.id('b'), 'To savings', tests.id('main'), tests.id('sav'),
  100000, 'pay_date', 2, null, null, true, tests.id('savings'), tests.id('p1'))));
-- manual, unlinked, on the 1st, from now
select tests.remember('t_tax', (select id from public.create_transfer(tests.id('b'), 'Tax', tests.id('main'), tests.id('tax'),
  30000, 'day_of_month', p_day_of_month => 1, p_from_period_id => tests.this_period(tests.id('b')))));
-- manual, linked to the third pillar, on the 20th, from now
select tests.remember('t_3a', (select id from public.create_transfer(tests.id('b'), 'Third pillar', tests.id('main'), tests.id('sav'),
  50000, 'day_of_month', p_day_of_month => 20, p_category_id => tests.id('pillar'), p_from_period_id => tests.this_period(tests.id('b')))));
select results_eq(
  format($$select from_account_name, to_account_name, amount, schedule::text, offset_days, day_of_month, is_automatic,
                  category_name, first_seq, next_due_date
           from public.transfer_overview where id = %L$$, tests.id('t_sav')),
  $$values ('Main', 'Savings account', 100000::bigint, 'pay_date', 2, null::integer, true, 'Savings', 1, '2026-11-27'::date)$$,
  'R-ACCOUNT-002: a planned transfer from one account to another, with an amount, a schedule and a category');
select results_eq(
  format($$select is_automatic, schedule::text, day_of_month from public.transfer_overview where id = %L$$, tests.id('t_tax')),
  $$values (false, 'day_of_month', 1)$$,
  'R-ACCOUNT-003: each planned transfer is automatic or manual (manual by default)');
select results_eq(
  format($$select p.seq, c.due_date from public.periods as p cross join lateral public.get_transfer_checklist(p.id) as c
           where p.budget_id = %L and c.transfer_id = %L order by p.seq$$, tests.id('b'), tests.id('t_sav')),
  $$values (1, '2026-09-27'::date), (2, '2026-10-28'::date)$$,
  'R-ACCOUNT-071: from the primary income, the due date is its actual pay date in the period (the period''s start) plus the offset');
select results_eq(
  format($$select transfer_id, due_date from public.get_transfer_checklist(%L) order by due_date$$, tests.id('p2')),
  format($$values (%L::uuid, '2026-10-28'::date), (%L::uuid, '2026-11-01'::date), (%L::uuid, '2026-11-20'::date)$$,
         tests.id('t_sav'), tests.id('t_tax'), tests.id('t_3a')),
  'R-ACCOUNT-301: one occurrence per transfer in force in the period, with its due date');
select results_eq(
  format($$select due_date from public.preview_create_transfer(%L, %L, %L, 1000, 'day_of_month', p_day_of_month => 31, p_count => 6,
                                                               p_from_period_id => %L)$$,
         tests.id('b'), tests.id('main'), tests.id('sav'), tests.id('p2')),
  $$values ('2026-10-31'::date), ('2026-11-30'::date), ('2026-12-31'::date), ('2027-01-31'::date), ('2027-02-28'::date), ('2027-03-31'::date)$$,
  'R-ACCOUNT-070: on a fixed day, the first date with that day on or after the period''s start, clamped to the month''s length, no weekend rule');
select results_eq(
  format($$select due_date, projected from public.preview_create_transfer(%L, %L, %L, 1000, 'day_of_month', p_day_of_month => 25, p_count => 2)$$,
         tests.id('b'), tests.id('main'), tests.id('sav')),
  $$values ('2026-11-25'::date, true), ('2026-12-25'::date, true)$$,
  'R-ACCOUNT-300: on the calendar, in the period containing each date: the next 25th falls in the next period (never capped into this one)');

-- another income chosen: its actual pay date in the period (weekend rule), plus the offset
select tests.remember('bob_salary', public.add_income(tests.id('b'), 'Bob salary', 300000, 10, 'nearest',
  tests.get_user_id('bob'), tests.id('p1'), tests.id('sav')));
select tests.remember('t_bob', (select id from public.create_transfer(tests.id('b'), 'Bob to main', tests.id('sav'), tests.id('main'),
  20000, 'pay_date', 1, null, tests.id('bob_salary'), false, null, tests.id('p1'))));
select results_eq(
  format($$select p.seq, c.due_date, c.follows_primary from public.periods as p
           cross join lateral public.get_transfer_checklist(p.id) as c
           where p.budget_id = %L and c.transfer_id = %L order by p.seq$$, tests.id('b'), tests.id('t_bob')),
  $$values (1, '2026-10-10'::date, false), (2, '2026-11-11'::date, false)$$,
  'R-ACCOUNT-070: from a chosen income, its actual pay date in the period (10 October 2026 is a Saturday: the 9th) plus the offset');
select throws_ok(format($$select * from public.create_transfer(%L, 'X', %L, %L, 1000, 'pay_date', 32)$$,
                        tests.id('b'), tests.id('main'), tests.id('sav')),
  'P0001', 'invalid_offset', 'R-ACCOUNT-070: an offset is 0 to 31 days');
select throws_ok(format($$select * from public.create_transfer(%L, 'X', %L, %L, 1000, 'pay_date', -1)$$,
                        tests.id('b'), tests.id('main'), tests.id('sav')),
  'P0001', 'invalid_offset', 'R-ACCOUNT-070: never before the pay date');
select throws_ok(format($$select * from public.create_transfer(%L, 'X', %L, %L, 1000, 'day_of_month', p_day_of_month => 0)$$,
                        tests.id('b'), tests.id('main'), tests.id('sav')),
  'P0001', 'invalid_day', 'R-ACCOUNT-070: a day of the month is 1 to 31');
select throws_ok(format($$select * from public.create_transfer(%L, 'X', %L, %L, 1000, 'day_of_month', 2, 5)$$,
                        tests.id('b'), tests.id('main'), tests.id('sav')),
  'P0001', 'invalid_schedule', 'R-ACCOUNT-070: one schedule or the other, not both');
select throws_ok(format($$select * from public.create_transfer(%L, 'X', %L, %L, 1000, 'pay_date')$$,
                        tests.id('b'), tests.id('main'), tests.id('main')),
  'P0001', 'same_account', 'R-ACCOUNT-002: from one account to a different one');
select throws_ok(format($$select * from public.create_transfer(%L, 'X', %L, %L, 0, 'pay_date')$$,
                        tests.id('b'), tests.id('main'), tests.id('sav')),
  'P0001', 'invalid_amount', 'R-ACCOUNT-002: an amount of 1 to 1 000 000 000 rappen');
select throws_ok(format($$select * from public.create_transfer(%L, 'X', %L, %L, 1000, 'pay_date', p_from_period_id => %L)$$,
                        tests.id('b'), tests.id('main'), tests.id('tax'), tests.id('p1')),
  'P0001', 'account_not_in_force', 'R-ACCOUNT-231: both accounts in force wherever the terms apply');
select throws_ok(format($$select * from public.create_transfer(%L, 'X', %L, %L, 1000, 'pay_date')$$,
                        tests.id('b'), tests.id('main'), tests.id('e_acc')),
  'P0001', 'account_not_found', 'R-SECURITY-004: another budget''s account is not found');
select throws_ok(format($$select * from public.create_transfer(%L, 'X', %L, %L, 1000, 'pay_date', p_income_id => %L)$$,
                        tests.id('b'), tests.id('main'), tests.id('sav'), tests.id('e_income')),
  'P0001', 'income_not_found', 'R-SECURITY-004: another budget''s income is not found');

-- ===========================================================================
-- Automatic transfers and their transactions (R-ACCOUNT-004, R-ACCOUNT-074)
-- ===========================================================================
select results_eq(
  format($$select kind::text, amount, date, category_id, review_state::text, recorded_by, transfer_occurrence_seq
           from public.transaction_list where transfer_id = %L order by date$$, tests.id('t_sav')),
  format($$values ('expense', 100000::bigint, '2026-09-27'::date, %1$L::uuid, 'confirmed', null::uuid, 1),
                  ('expense', 100000::bigint, '2026-10-28'::date, %1$L::uuid, 'confirmed', null::uuid, 2)$$,
         tests.id('savings')),
  'R-ACCOUNT-074: an automatic transfer linked to a category creates its transaction there, dated its due date, confirmed, once per occurrence');
select results_eq(
  format($$select status, held_back, transaction_id is not null from public.get_transfer_checklist(%L) where transfer_id = %L$$,
         tests.id('p2'), tests.id('t_sav')),
  $$values ('done', false, true)$$,
  'R-ACCOUNT-004: an automatic transfer is assumed done on its due date, without confirmation');
select is(public.ensure_periods(tests.id('b')), 0, 'R-ACCOUNT-074: nothing more to do (no catch-up pending)');
select is((select count(*)::integer from public.transaction_list where transfer_id = tests.id('t_sav')), 2,
  'R-ACCOUNT-074: never twice');
select tests.remember('t_auto20', (select id from public.create_transfer(tests.id('b'), 'Pillar standing order', tests.id('main'),
  tests.id('sav'), 7000, 'day_of_month', p_day_of_month => 20, p_is_automatic => true, p_category_id => tests.id('pillar'), p_from_period_id => tests.this_period(tests.id('b')))));
select results_eq(
  format($$select status, transaction_id from public.get_transfer_checklist(%L) where transfer_id = %L$$, tests.id('p2'), tests.id('t_auto20')),
  $$values ('upcoming', null::uuid)$$,
  'R-ACCOUNT-004: before its due date an automatic transfer is upcoming, with no transaction');
select tests.clear_authentication();
select tests.set_today('2026-11-20');
select tests.authenticate_as('ann');
select is((select caught_up from public.my_budgets where id = tests.id('b')), false,
  'R-ACCOUNT-074: once due, the catch-up has work (my_budgets.caught_up is false until a call does it)');
select is(public.ensure_periods(tests.id('b')), 0, 'R-ACCOUNT-074: the catch-up creates no period');
select results_eq(
  format($$select count(*)::integer, min(date), min(amount) from public.transaction_list where transfer_id = %L$$, tests.id('t_auto20')),
  $$values (1, '2026-11-20'::date, 7000::bigint)$$,
  'R-ACCOUNT-074: on its due date the catch-up creates its transaction, exactly once');
select results_eq(
  format($$select (select transfers_to_do from public.get_transfers_to_do(%1$L)), (select transfers_overdue from public.get_transfers_to_do(%1$L)),
                  c.status, c.is_overdue
           from public.get_transfer_checklist(%2$L) as c where c.transfer_id = %3$L$$, tests.id('b'), tests.id('p2'), tests.id('t_3a')),
  $$values (4, 3, 'to_do', false)$$,
  'R-ACCOUNT-241: due today is to do, not yet overdue (in the checklist and in my_budgets)');

-- held back while the budget is full, created when there is room (none skipped)
select tests.clear_authentication();
select tests.set_today('2026-11-16');
select tests.authenticate_as('ann');
select tests.remember('t_auto18', (select id from public.create_transfer(tests.id('b'), 'Held', tests.id('main'), tests.id('sav'),
  3000, 'day_of_month', p_day_of_month => 18, p_is_automatic => true, p_category_id => tests.id('pillar'), p_from_period_id => tests.this_period(tests.id('b')))));
select tests.remember('t_auto19', (select id from public.create_transfer(tests.id('b'), 'Held too', tests.id('main'), tests.id('sav'),
  4000, 'day_of_month', p_day_of_month => 19, p_is_automatic => true, p_category_id => tests.id('pillar'), p_from_period_id => tests.this_period(tests.id('b')))));
select tests.clear_authentication();
create temp table n_tx on commit drop as select count(*)::integer as n from public.transactions where budget_id = tests.id('b');
do $$ begin
  execute format('create or replace function private.limit_transactions() returns integer language sql immutable set search_path = '''' as $f$ select %s $f$', (select n from n_tx));
end $$;
select tests.clear_authentication();
select tests.set_today('2026-11-20');
select tests.authenticate_as('ann');
select tests.authenticate_as('ann');
select results_eq(
  format($$select (select caught_up from public.my_budgets where id = %1$L), c.held_back, c.transaction_id
           from public.get_transfer_checklist(%2$L) as c where c.transfer_id = %3$L$$, tests.id('b'), tests.id('p2'), tests.id('t_auto18')),
  $$values (true, true, null::uuid)$$,
  'R-ACCOUNT-074: a budget at the transaction limit holds the transaction back (held_back), without blocking reads');
select tests.clear_authentication();
do $$ begin
  execute format('create or replace function private.limit_transactions() returns integer language sql immutable set search_path = '''' as $f$ select %s $f$', (select n + 1 from n_tx));
end $$;
select tests.authenticate_as('ann');
select is(public.ensure_periods(tests.id('b')), 0, 'R-ACCOUNT-074: (room for one more transaction, a catch-up)');
-- (both were created in this test's one transaction: which comes first is not fixed here)
select results_eq(
  format($$select count(*) filter (where c.held_back)::integer, count(c.transaction_id)::integer from public.get_transfer_checklist(%L) as c
           where c.transfer_id in (%L, %L)$$, tests.id('p2'), tests.id('t_auto18'), tests.id('t_auto19')),
  $$values (1, 1)$$,
  'R-ACCOUNT-074: room for one: one is created, the other waits (never beyond the limit)');
select tests.clear_authentication();
create or replace function private.limit_transactions() returns integer language sql immutable set search_path = '' as $f$ select 50000 $f$;
select tests.authenticate_as('ann');
select is(public.ensure_periods(tests.id('b')), 0, 'R-ACCOUNT-074: (with room again, a catch-up)');
select results_eq(
  format($$select c.held_back, (select date from public.transactions where id = c.transaction_id)
           from public.get_transfer_checklist(%L) as c where c.transfer_id in (%L, %L) order by c.due_date$$,
         tests.id('p2'), tests.id('t_auto18'), tests.id('t_auto19')),
  $$values (false, '2026-11-18'::date), (false, '2026-11-19'::date)$$,
  'R-ACCOUNT-074: with room again, the held transaction is created, dated its due date (none skipped)');
select tests.clear_authentication();
select tests.set_today('2026-11-16');
select tests.authenticate_as('ann');

-- ===========================================================================
-- The checklist and its marks (R-ACCOUNT-005, R-ACCOUNT-073, R-ACCOUNT-240, R-CONCURRENCY-230)
-- ===========================================================================
select results_eq(
  format($$select status, is_overdue, mark_revision from public.get_transfer_checklist(%L) where transfer_id = %L$$,
         tests.id('p2'), tests.id('t_tax')),
  $$values ('to_do', true, 0)$$,
  'R-ACCOUNT-005: a manual transfer is to do in the period''s checklist, overdue once its due date has passed');
select results_eq(
  format($$select transfers_to_do, transfers_overdue from public.get_transfers_to_do(%L)$$, tests.id('b')),
  $$values (4, 3)$$,
  'R-ACCOUNT-241: my_budgets counts the manual transfers of the current period and the one before still to do, and the overdue ones (Q-222)');
select results_eq(
  format($$select status, done_on, amount_moved, transaction_id, recorded_by, recorded_by_name
           from public.mark_transfer_done(%L, %L, 0)$$, tests.id('t_tax'), tests.id('p2')),
  format($$values ('done', '2026-11-16'::date, 30000::bigint, null::uuid, %L::uuid, 'Ann')$$, tests.get_user_id('ann')),
  'R-ACCOUNT-005: marked done, by default today with the planned amount; without a category, no transaction');
select throws_ok(format($$select * from public.mark_transfer_done(%L, %L, 0)$$, tests.id('t_tax'), tests.id('p2')),
  'P0001', 'record_changed', 'R-CONCURRENCY-230: a mark names the revision of the mark it read (0: none); another member marked first');
select throws_ok(format($$select * from public.skip_transfer(%L, %L, 1)$$, tests.id('t_tax'), tests.id('p2')),
  'P0001', 'transfer_already_marked', 'R-ACCOUNT-005: a marked occurrence is undone before it is marked otherwise');
select is((select status from public.undo_transfer_mark(tests.id('t_tax'), tests.id('p2'), 1)), 'to_do',
  'R-ACCOUNT-005: undoing "done" makes it to do again');
select is((select status from public.skip_transfer(tests.id('t_tax'), tests.id('p2'), 0)), 'skipped',
  'R-ACCOUNT-005: a manual transfer can be skipped for the period');
select is((select status from public.undo_transfer_mark(tests.id('t_tax'), tests.id('p2'), 1)), 'to_do',
  'R-ACCOUNT-005: and the skip undone');
select throws_ok(format($$select * from public.undo_transfer_mark(%L, %L, 0)$$, tests.id('t_tax'), tests.id('p2')),
  'P0001', 'nothing_to_undo', 'R-ACCOUNT-005: nothing to undo without a mark');
select throws_ok(format($$select * from public.mark_transfer_done(%L, %L, 0, '2026-11-17')$$, tests.id('t_tax'), tests.id('p2')),
  'P0001', 'date_outside_periods', 'R-ACCOUNT-005: never done after today');
select throws_ok(format($$select * from public.mark_transfer_done(%L, %L, 0, p_amount => 0)$$, tests.id('t_tax'), tests.id('p2')),
  'P0001', 'invalid_amount', 'R-ACCOUNT-005: the amount moved is 1 to 1 000 000 000 rappen');
select throws_ok(format($$select * from public.mark_transfer_done(%L, %L, 1)$$, tests.id('t_sav'), tests.id('p2')),
  'P0001', 'transfer_is_automatic', 'R-ACCOUNT-004: an automatic transfer is not marked done (it is assumed done)');
select throws_ok(format($$select * from public.mark_transfer_not_done(%L, %L, 0)$$, tests.id('t_tax'), tests.id('p2')),
  'P0001', 'transfer_is_manual', 'R-ACCOUNT-004: only an automatic transfer is marked not done');
select throws_ok(format($$select * from public.mark_transfer_done(%L, %L, 0)$$, tests.id('t_tax'), tests.id('p1')),
  'P0001', 'transfer_not_in_force', 'R-ACCOUNT-301: no occurrence where the transfer is not in force');

-- linked to a category: done creates its transaction, dated the done date, with the amount moved
select tests.remember('tx_3a', (select transaction_id from public.mark_transfer_done(tests.id('t_3a'), tests.id('p2'), 0, '2026-11-12', 45000)));
select results_eq(
  format($$select kind::text, amount, date, category_id, recorded_by, transfer_id, review_state::text from public.transaction_list where id = %L$$,
         tests.id('tx_3a')),
  format($$values ('expense', 45000::bigint, '2026-11-12'::date, %L::uuid, %L::uuid, %L::uuid, 'confirmed')$$,
         tests.id('pillar'), tests.get_user_id('ann'), tests.id('t_3a')),
  'R-ACCOUNT-073: marking a manual transfer linked to a category done creates its transaction there, dated the done date, with the amount moved');
select lives_ok(format($$select * from public.update_transaction(%L, 1, 'expense', 46000, '2026-11-13', %L)$$, tests.id('tx_3a'), tests.id('pillar')),
  'R-ACCOUNT-073: its transaction can be edited');
select results_eq(
  format($$select done_on, amount_moved from public.get_transfer_checklist(%L) where transfer_id = %L$$, tests.id('p2'), tests.id('t_3a')),
  $$values ('2026-11-13'::date, 46000::bigint)$$,
  'R-ACCOUNT-073: and the edit shows on the occurrence');
select throws_ok(format($$select * from public.update_transaction(%L, 2, 'refund', 46000, '2026-11-13', %L)$$, tests.id('tx_3a'), tests.id('pillar')),
  'P0001', 'invalid_link', 'R-ACCOUNT-073: a transfer''s transaction stays an expense');
select throws_ok(format($$select * from public.link_transaction(%L, 2, p_subscription_id => %L)$$, tests.id('tx_3a'), tests.id('netflix')),
  'P0001', 'invalid_link', 'R-ACCOUNT-073: and takes no other link');
select lives_ok(format($$select public.delete_transaction(%L, 2)$$, tests.id('tx_3a')),
  'R-ACCOUNT-240: a transfer''s transaction can be deleted');
select results_eq(
  format($$select status, transaction_id, mark_revision from public.get_transfer_checklist(%L) where transfer_id = %L$$, tests.id('p2'), tests.id('t_3a')),
  $$values ('to_do', null::uuid, 0)$$,
  'R-ACCOUNT-240: deleting the transaction of a manual transfer puts it back to do');
select tests.remember('tx_3a2', (select transaction_id from public.mark_transfer_done(tests.id('t_3a'), tests.id('p2'), 0)));
select is((select status from public.undo_transfer_mark(tests.id('t_3a'), tests.id('p2'), 1)), 'to_do',
  'R-ACCOUNT-073: undoing "done"');
select is((select count(*)::integer from public.transactions where id = tests.id('tx_3a2')), 0,
  'R-ACCOUNT-073: deletes its transaction');

-- automatic: not done deletes its transaction, never created again; undo creates it again
select tests.remember('tx_sav2', (select transaction_id from public.get_transfer_checklist(tests.id('p2')) where transfer_id = tests.id('t_sav')));
select results_eq(
  format($$select c.status, c.transaction_id from public.mark_transfer_not_done(%L, %L, 1) as c$$, tests.id('t_sav'), tests.id('p2')),
  $$values ('not_done', null::uuid)$$,
  'R-ACCOUNT-004: an automatic transfer can be marked not done for the period');
select is((select count(*)::integer from public.transactions where id = tests.id('tx_sav2')), 0,
  'R-ACCOUNT-004: it loses its transaction');
select is(public.ensure_periods(tests.id('b')), 0, 'R-ACCOUNT-074: (a catch-up)');
select is((select count(*)::integer from public.transaction_list where transfer_id = tests.id('t_sav') and transfer_occurrence_seq = 2), 0,
  'R-ACCOUNT-074: and the catch-up does not create it again');
select is((select status from public.undo_transfer_mark(tests.id('t_sav'), tests.id('p2'), 2)), 'done',
  'R-ACCOUNT-240: undoing "not done" makes it assumed done again');
select is((select date from public.transaction_list where transfer_id = tests.id('t_sav') and transfer_occurrence_seq = 2),
  '2026-10-28'::date, 'R-ACCOUNT-240: with its transaction, dated its due date');
select tests.remember('tx_sav2b', (select transaction_id from public.get_transfer_checklist(tests.id('p2')) where transfer_id = tests.id('t_sav')));
select lives_ok(format($$select public.delete_transaction(%L, 1)$$, tests.id('tx_sav2b')),
  'R-ACCOUNT-240: an automatic transfer''s transaction can be deleted');
select is((select status from public.get_transfer_checklist(tests.id('p2')) where transfer_id = tests.id('t_sav')), 'not_done',
  'R-ACCOUNT-240: deleting it marks the automatic transfer not done, and it is not created again');
select is((select status from public.undo_transfer_mark(tests.id('t_sav'), tests.id('p2'),
          (select mark_revision from public.get_transfer_checklist(tests.id('p2')) where transfer_id = tests.id('t_sav')))), 'done',
  'R-ACCOUNT-240: (undone again)');

-- ===========================================================================
-- Versioned terms (R-VERSION-071), the previews (R-ACCOUNT-233)
-- ===========================================================================
create temp table preview_edit on commit drop as
  select * from public.preview_update_transfer(tests.id('t_tax'), p_amount => 35000, p_day_of_month => 5, p_count => 3);
grant select on preview_edit to authenticated;
select is((select revision from public.update_transfer(tests.id('t_tax'), 1, p_amount => 35000, p_day_of_month => 5)), 2,
  'R-VERSION-071: an edit of a planned transfer gives it a new revision');
select results_eq(
  format($$select amount, due_date from public.get_transfer_checklist(%L) where transfer_id = %L$$, tests.id('p2'), tests.id('t_tax')),
  $$select amount, due_date from preview_edit where not projected$$,
  'R-ACCOUNT-233: the preview of an edit gives the due dates and amounts the edit then has');
select results_eq(
  $$select due_date, projected from preview_edit$$,
  $$values ('2026-11-05'::date, false), ('2026-12-05'::date, true), ('2027-01-05'::date, true)$$,
  'R-ACCOUNT-233: the next periods'' due dates, at their projected boundaries');
select tests.remember('t_edit', (select id from public.create_transfer(tests.id('b'), 'Versioned', tests.id('main'), tests.id('sav'),
  1000, 'pay_date', p_from_period_id => tests.id('p1'))));
select lives_ok(format($$select * from public.update_transfer(%L, 1, p_amount => 2000)$$, tests.id('t_edit')),
  'R-VERSION-071: an edit applies from the current period');
select results_eq(
  format($$select p.seq, c.amount from public.periods as p cross join lateral public.get_transfer_checklist(p.id) as c
           where p.budget_id = %L and c.transfer_id = %L order by p.seq$$, tests.id('b'), tests.id('t_edit')),
  $$values (1, 1000::bigint), (2, 2000::bigint)$$,
  'R-VERSION-071: past periods keep the terms in force then');
select lives_ok(format($$select * from public.update_transfer(%L, 2, p_amount => 2500)$$, tests.id('t_edit')),
  'R-VERSION-071: a second edit in the same period');
select is((select count(*)::integer from public.transfer_versions where transfer_id = tests.id('t_edit')), 2,
  'R-VERSION-071: replaces the first');
select lives_ok(format($$select * from public.update_transfer(%L, 3, p_amount => 1500, p_from_period_id => %L)$$, tests.id('t_edit'), tests.id('p1')),
  'R-VERSION-071: a correction from an earlier period');
select results_eq(
  format($$select p.seq, c.amount from public.periods as p cross join lateral public.get_transfer_checklist(p.id) as c
           where p.budget_id = %L and c.transfer_id = %L order by p.seq$$, tests.id('b'), tests.id('t_edit')),
  $$values (1, 1500::bigint), (2, 2500::bigint)$$,
  'R-VERSION-071: applies until the next existing change');
select results_eq(
  format($$select amount, terms_from_period_id, until_period_id from public.get_transfer_terms(%L, %L)$$, tests.id('t_edit'), tests.id('p1')),
  format($$values (1500::bigint, %L::uuid, %L::uuid)$$, tests.id('p1'), tests.id('p2')),
  'R-VERSION-132: the terms in force in a chosen period, and until when a correction there applies');
select throws_ok(format($$select * from public.update_transfer(%L, 4, p_from_period_id => %L)$$, tests.id('t_edit'), tests.id('p1')),
  'P0001', 'invalid_period', 'R-VERSION-071: a correction needs new terms');
select throws_ok(format($$select * from public.update_transfer(%L, 4, p_schedule => 'day_of_month')$$, tests.id('t_edit')),
  'P0001', 'invalid_day', 'R-ACCOUNT-070: switching to a day of the month needs the day');

-- an edit making a manual transfer automatic and linked: its occurrence already due gets its
-- transaction with the edit, as the preview said
create temp table preview_auto on commit drop as
  select * from public.preview_update_transfer(tests.id('t_edit'), p_is_automatic => true, p_category_id => tests.id('savings'), p_count => 2);
grant select on preview_auto to authenticated;
select results_eq($$select created_at_once, projected from preview_auto$$, $$values (true, false), (false, true)$$,
  'R-ACCOUNT-233: the preview says which transactions the edit creates at once');
select results_eq(
  format($$select created_at_once from public.preview_update_transfer(%L, p_amount => 100001, p_from_period_id => %L, p_count => 2)$$,
         tests.id('t_sav'), tests.id('p1')),
  $$values (false), (false)$$,
  'R-ACCOUNT-233: none where the occurrence already has its mark (its transaction exists)');
select lives_ok(format($$select * from public.update_transfer(%L, 4, p_is_automatic => true, p_category_id => %L)$$, tests.id('t_edit'), tests.id('savings')),
  'R-ACCOUNT-074: a transfer made automatic and linked from now');
select results_eq(
  format($$select transfer_occurrence_seq, amount from public.transaction_list where transfer_id = %L$$, tests.id('t_edit')),
  $$values (2, 2500::bigint)$$,
  'R-ACCOUNT-074: gets the transaction of its occurrence already due, and only from the period the new terms govern');

-- ===========================================================================
-- Categories (R-ACCOUNT-072, R-CATEGORY-230, R-ACCOUNT-231)
-- ===========================================================================
select is((select category_id from public.transfer_overview where id = tests.id('t_3a')), tests.id('pillar'),
  'R-ACCOUNT-072: a planned transfer can be linked to a category');
select is(pg_temp.refusal(format($$select public.end_category(%L, %s)$$, tests.id('pillar'),
            (select revision from public.category_overview where id = tests.id('pillar')))),
  format('category_in_use [{"id": "%s", "kind": "transfer", "name": "Held"}, {"id": "%s", "kind": "transfer", "name": "Held too"}, {"id": "%s", "kind": "transfer", "name": "Pillar standing order"}, {"id": "%s", "kind": "transfer", "name": "Third pillar"}]',
         tests.id('t_auto18'), tests.id('t_auto19'), tests.id('t_auto20'), tests.id('t_3a')),
  'R-CATEGORY-230: a category a transfer uses from then on cannot end; the refusal names the transfers');
select is((select in_use from public.category_overview where id = tests.id('pillar')), true,
  'R-CATEGORY-230: category_overview.in_use says so beforehand');
select throws_ok(format($$select * from public.create_transfer(%L, 'X', %L, %L, 1000, 'pay_date', p_category_id => %L)$$,
                        tests.id('b'), tests.id('main'), tests.id('sav'), gen_random_uuid()),
  'P0001', 'category_not_found', 'R-ACCOUNT-072: a transfer''s category is one of the budget''s');
select tests.remember('sub', (select id from public.create_category(tests.id('b'), 'Short term', tests.id('savings'), 0, p_other_name => 'Other')));
select is((select category_name from public.transfer_overview where id = tests.id('t_sav')), 'Other',
  'R-CATEGORY-230: the first subcategory moves a transfer''s category to "Other", like a subscription''s');
select throws_ok(format($$select * from public.create_transfer(%L, 'X', %L, %L, 1000, 'pay_date', p_category_id => %L)$$,
                        tests.id('b'), tests.id('main'), tests.id('sav'), tests.id('savings')),
  'P0001', 'category_is_group', 'R-ACCOUNT-072: a transfer''s category is a leaf');

-- ===========================================================================
-- Committed amounts (R-ACCOUNT-238)
-- ===========================================================================
select results_eq(
  format($$select g.transfer_committed, g.committed from public.get_period_progress(%L) as g where g.category_id = %L$$,
         tests.id('p2'), tests.id('pillar')),
  $$values (64000::bigint, 0::bigint)$$,
  'R-ACCOUNT-238: a linked transfer commits its planned amount in its category, apart from the subscriptions'' committed amount');
select is((select transfer_committed_amount from public.category_overview where id = tests.id('pillar')), 64000::bigint,
  'R-ACCOUNT-238: category_overview has the same figure');
select is((select transfer_committed_total from public.period_summaries where id = tests.id('p2')),
  (select sum(g.transfer_committed)::bigint from public.get_period_progress(tests.id('p2')) as g where not g.is_group),
  'R-ACCOUNT-238: period_summaries adds them up');

-- ===========================================================================
-- The money flow (R-ACCOUNT-006, R-ACCOUNT-235)
-- ===========================================================================
create temp table flow2 on commit drop as select * from public.get_money_flow(tests.id('b'));
grant select on flow2 to authenticated;
select is((select sum(amount)::bigint from flow2 where row_kind = 'income'),
  (select salary_total from public.period_summaries where id = tests.id('p2')),
  'R-ACCOUNT-235: the income links add up to the period''s salaries');
select results_eq(
  $$select row_kind, target_id, amount from flow2 where row_kind in ('income', 'not_assigned') order by row_kind, name$$,
  format($$values ('income', %L::uuid, 300000::bigint), ('income', null::uuid, 600000::bigint), ('not_assigned', null::uuid, null::bigint)$$,
         tests.id('sav')),
  'R-ACCOUNT-235: an income flows into its account, or into "not assigned"');
select is((select inflow from flow2 where row_kind = 'not_assigned'), 600000::bigint,
  'R-ACCOUNT-235: "not assigned" receives the incomes that name no account');
select results_eq(
  format($$select inflow, outflow, stays, is_negative from flow2 where id = %L$$, tests.id('main')),
  $$select (select coalesce(sum(amount), 0) from flow2 where row_kind = 'transfer' and target_id = (select id from flow2 where name = 'Main'))::bigint,
           (select coalesce(sum(amount), 0) from flow2 where row_kind = 'transfer' and source_id = (select id from flow2 where name = 'Main'))::bigint,
           (select coalesce(sum(amount), 0) from flow2 where row_kind = 'transfer' and target_id = (select id from flow2 where name = 'Main'))::bigint
           - (select coalesce(sum(amount), 0) from flow2 where row_kind = 'transfer' and source_id = (select id from flow2 where name = 'Main'))::bigint,
           true$$,
  'R-ACCOUNT-235: an account''s flows: what comes in, what goes out, and what stays (negative here: more planned out than in)');
select is((select sum(stays)::bigint from flow2 where row_kind in ('account', 'not_assigned')),
  (select amount from flow2 where row_kind = 'total'),
  'R-ACCOUNT-235: what stays in every node adds up to the incomes (transfers only move money)');
select is((select outflow from flow2 where row_kind = 'total'),
  (select sum(amount)::bigint from flow2 where row_kind = 'transfer'),
  'R-ACCOUNT-006: the diagram is drawn from the plan of transfers');
select is((select amount from flow2 where id = tests.id('t_3a')), 50000::bigint,
  'R-ACCOUNT-006: the planned amount, never what a transaction says');
select results_eq(
  format($$select amount from public.get_money_flow(%L, %L) where id = %L$$, tests.id('b'), tests.id('p1'), tests.id('t_edit')),
  $$values (1500::bigint)$$,
  'R-ACCOUNT-006: a past period''s flow comes from the plan in force then');
select is((select count(*)::integer from public.get_money_flow(tests.id('b'), tests.id('p1')) where id = tests.id('tax')), 0,
  'R-ACCOUNT-235: an account not yet in force is not in that period''s flow');

-- ===========================================================================
-- The account an income is paid into (R-ACCOUNT-236)
-- ===========================================================================
select results_eq(
  format($$select account_id, account_name from public.income_overview where id = %L$$, tests.id('bob_salary')),
  format($$values (%L::uuid, 'Savings account')$$, tests.id('sav')),
  'R-ACCOUNT-236: an income can name the account it is paid into');
select is(public.update_income(tests.id('bob_salary'), 1, p_amount => 310000), 2, 'R-ACCOUNT-236: an edit of the amount alone');
select is((select account_id from public.income_overview where id = tests.id('bob_salary')), tests.id('sav'),
  'R-ACCOUNT-236: keeps the account in force');
select results_eq(
  format($$select offset_days, income_id, amount from public.update_transfer(%L, 1, p_amount => 25000)$$, tests.id('t_bob')),
  format($$values (1, %L::uuid, 25000::bigint)$$, tests.id('bob_salary')),
  'R-VERSION-071: an edit of a transfer''s amount alone keeps its schedule and income');
select lives_ok(format($$select public.update_income(%L, 1, p_account_id => %L)$$, tests.id('salary'), tests.id('main')),
  'R-ACCOUNT-236: part of its terms, changed from the current period');
select results_eq(
  format($$select (select account_id from public.get_income_terms(%1$L, %2$L)), (select account_id from public.get_income_terms(%1$L, %3$L))$$,
         tests.id('salary'), tests.id('p1'), tests.id('p2')),
  format($$values (null::uuid, %L::uuid)$$, tests.id('main')),
  'R-ACCOUNT-236: versioned with them: the period before keeps its own');
select is((select count(*)::integer from public.get_money_flow(tests.id('b')) where row_kind = 'not_assigned'), 0,
  'R-ACCOUNT-235: no "not assigned" node when every income names an account');
select throws_ok(format($$select public.update_income(%L, 2, p_account_id => %L, p_from_period_id => %L)$$, tests.id('salary'), tests.id('tax'), tests.id('p1')),
  'P0001', 'account_not_in_force', 'R-ACCOUNT-231: an income''s account is in force wherever its terms apply');
select throws_ok(format($$select public.add_income(%L, 'X', 1000, 1, p_account_id => %L)$$, tests.id('b'), tests.id('e_acc')),
  'P0001', 'account_not_found', 'R-SECURITY-004: another budget''s account is not found');
select is(public.update_income(tests.id('salary'), 2, p_clear_account => true), 3,
  'R-ACCOUNT-236: the account can be cleared');
select is((select account_id from public.income_overview where id = tests.id('salary')), null::uuid,
  'R-ACCOUNT-236: (no account now)');

-- ===========================================================================
-- Closing an account (R-ACCOUNT-232)
-- ===========================================================================
select is(pg_temp.refusal(format($$select public.close_account(%L, 1)$$, tests.id('tax'))),
  format('account_in_use [{"id": "%s", "kind": "transfer", "name": "Tax"}]', tests.id('t_tax')),
  'R-ACCOUNT-232: closing an account a transfer uses from then on is refused, naming the transfer');
select matches(pg_temp.refusal(format($$select public.close_account(%L, 2)$$, tests.id('sav'))),
  format('^account_in_use \[\{"id": "%s", "kind": "income", "name": "Bob salary"\}, ', tests.id('bob_salary')),
  'R-ACCOUNT-232: and one an income is paid into (incomes first, then transfers)');
select results_eq(
  format($$select outcome, refusal from public.preview_close_account(%L)$$, tests.id('tax')),
  $$values (null::text, 'account_in_use')$$,
  'R-ACCOUNT-232: the preview answers the same, with the write''s checks');
select is((select in_use from public.account_overview where id = tests.id('tax')), true,
  'R-ACCOUNT-232: account_overview.in_use says so beforehand');
select tests.remember('pay', (select id from public.create_account(tests.id('b'), 'Pay account', 'current', p_from_period_id => tests.id('p1'))));
select tests.remember('side', public.add_income(tests.id('b'), 'Side job', 50000, 15, 'nearest', null, tests.id('p1'), tests.id('pay')));
select is(pg_temp.refusal(format($$select public.close_account(%L, 1)$$, tests.id('pay'))),
  format('account_in_use [{"id": "%s", "kind": "income", "name": "Side job"}]', tests.id('side')),
  'R-ACCOUNT-232: an account only an income is paid into is in use too');
select tests.remember('spare', (select id from public.create_account(tests.id('b'), 'Spare', 'cash')));
select results_eq(
  format($$select (select removal_deletes from public.account_overview where id = %1$L), (select outcome from public.preview_close_account(%1$L)),
                  public.close_account(%1$L, 1)$$, tests.id('spare')),
  $$values (true, 'deleted', 'deleted')$$,
  'R-ACCOUNT-232: an account never named and never counted before is deleted');
select tests.remember('old', (select id from public.create_account(tests.id('b'), 'Old account', 'other', p_from_period_id => tests.id('p1'))));
select is(public.close_account(tests.id('old'), 1), 'ended', 'R-ACCOUNT-232: otherwise it is closed from the current period');
select results_eq(
  format($$select (select count(*)::integer from public.get_money_flow(%1$L, %2$L) where id = %4$L),
                  (select count(*)::integer from public.get_money_flow(%1$L, %3$L) where id = %4$L)$$,
         tests.id('b'), tests.id('p1'), tests.id('p2'), tests.id('old')),
  $$values (1, 0)$$,
  'R-ACCOUNT-232: earlier periods keep it (their plan and diagram do not change)');
select throws_ok(format($$select public.close_account(%L, 2)$$, tests.id('old')),
  'P0001', 'account_ended', 'R-ACCOUNT-232: an account closed is not closed again');
select throws_ok(format($$select * from public.create_transfer(%L, 'X', %L, %L, 1000, 'pay_date')$$, tests.id('b'), tests.id('main'), tests.id('old')),
  'P0001', 'account_not_in_force', 'R-ACCOUNT-231: a closed account takes no new transfer');
select is((select name from public.update_account(tests.id('old'), 2, p_name => 'Renamed')), 'Renamed',
  'R-ACCOUNT-001: a closed account can still be renamed');
select is((select name from public.get_money_flow(tests.id('b'), tests.id('p1')) where id = tests.id('old')), 'Renamed',
  'R-ACCOUNT-001: a rename shows everywhere, past periods included');

-- ===========================================================================
-- Ending a transfer (R-ACCOUNT-234)
-- ===========================================================================
select tests.remember('t_new', (select id from public.create_transfer(tests.id('b'), 'New', tests.id('main'), tests.id('sav'), 1000, 'pay_date', p_from_period_id => tests.this_period(tests.id('b')))));
select results_eq(
  format($$select (select removal_deletes from public.transfer_overview where id = %1$L), (select outcome from public.preview_end_transfer(%1$L)),
                  public.end_transfer(%1$L, 1)$$, tests.id('t_new')),
  $$values (true, 'deleted', 'deleted')$$,
  'R-ACCOUNT-234: a transfer that never counted before and was never marked is deleted');
select tests.remember('tx_3a3', (select transaction_id from public.mark_transfer_done(tests.id('t_3a'), tests.id('p2'), 0)));
select results_eq(
  format($$select outcome, refusal from public.preview_end_transfer(%L)$$, tests.id('t_3a')),
  $$values ('ended', null::text)$$,
  'R-ACCOUNT-234: the preview of an end gives its outcome (nothing is removed)');
select is(public.end_transfer(tests.id('t_3a'), 1), 'ended', 'R-ACCOUNT-234: ended from the current period');
select results_eq(
  format($$select amount, transfer_id from public.transaction_list where id = %L$$, tests.id('tx_3a3')),
  format($$values (50000::bigint, %L::uuid)$$, tests.id('t_3a')),
  'R-ACCOUNT-234: its transaction stays linked to its occurrence (D-380)');
select results_eq(
  format($$select status, is_ended, transaction_id, mark_revision > 0 from public.get_transfer_checklist(%L) where transfer_id = %L$$,
         tests.id('p2'), tests.id('t_3a')),
  format($$values ('done', true, %L::uuid, true)$$, tests.id('tx_3a3')),
  'R-ACCOUNT-234: the period''s checklist still lists the ended transfer where it has a mark, flagged as ended');
select throws_ok(format($$select * from public.skip_transfer(%L, %L, 0)$$, tests.id('t_3a'), tests.id('p1')),
  'P0001', 'transfer_not_in_force', 'R-ACCOUNT-234: no occurrence where it was never in force');
select throws_ok(format($$select public.end_transfer(%L, 2)$$, tests.id('t_3a')),
  'P0001', 'transfer_ended', 'R-ACCOUNT-234: an ended transfer is not ended again');
select throws_ok(format($$select * from public.update_transfer(%L, 2, p_amount => 5)$$, tests.id('t_3a')),
  'P0001', 'transfer_ended', 'R-VERSION-071: an ended transfer takes no new terms from now');
select results_eq(
  format($$select outcome, refusal from public.preview_end_transfer(%L)$$, tests.id('t_3a')),
  $$values (null::text, 'transfer_ended')$$,
  'R-ACCOUNT-234: the preview answers the refusal');

-- ===========================================================================
-- Reopen (R-ACCOUNT-306, R-ACCOUNT-301, D-430)
-- ===========================================================================
select tests.clear_authentication();
select tests.set_today('2026-11-22');
select tests.authenticate_as('ann');
select tests.remember('p3', (select id from public.record_early_pay_date(tests.id('b'), tests.id('p2'),
  (select revision from public.periods where id = tests.id('p2')), '2026-11-21')));
-- p3 (21 November to 24 December) carries the scheduled pay date of 25 November: To savings is
-- due on the 23rd (not yet), Versioned (automatic, linked) on the 21st (its transaction is
-- made); Tax (the 5th) has 5 December in p3, Bob to main (Bob's 10th) 10 December
select lives_ok(format($$select * from public.mark_transfer_done(%L, %L, 0)$$, tests.id('t_tax'), tests.id('p3')), 'R-ACCOUNT-306: (setup)');
select lives_ok(format($$select * from public.mark_transfer_done(%L, %L, 0)$$, tests.id('t_tax'), tests.id('p2')), 'R-ACCOUNT-306: (setup)');
select lives_ok(format($$select * from public.skip_transfer(%L, %L, 0)$$, tests.id('t_bob'), tests.id('p3')), 'R-ACCOUNT-306: (setup)');
-- Ends: marked in p2, ended from p3: after the merge it ends from p2, and its mark there is no
-- longer planned (kept, listed as ended)
select tests.remember('t_end', (select id from public.create_transfer(tests.id('b'), 'Ends', tests.id('main'), tests.id('sav'), 900,
  'pay_date', p_from_period_id => tests.id('p1'))));
select lives_ok(format($$select * from public.mark_transfer_done(%L, %L, 0, '2026-11-20')$$, tests.id('t_end'), tests.id('p2')), 'R-ACCOUNT-306: (setup)');
select is(public.end_transfer(tests.id('t_end'), 1), 'ended', 'R-ACCOUNT-306: (setup: ended from the current period)');
select results_eq(
  format($$select x.date from public.transaction_list as x where x.transfer_id = %L and x.transfer_occurrence_seq = 3$$,
         tests.id('t_edit')),
  $$values ('2026-11-21'::date)$$,
  'R-ACCOUNT-302: (setup: the catch-up''s transaction of the early salary''s period, by its number)');
select results_eq(
  format($$select record_id, change, replaces_previous from public.preview_reopen(%L) where record_kind = 'transfer' order by record_name, change$$, tests.id('b')),
  format($$values (%L::uuid, 'mark_unplanned', false), (%L::uuid, 'ended', false), (%L::uuid, 'mark_unplanned', false),
                  (%L::uuid, 'mark_unplanned', false), (%L::uuid, 'transaction_removed', false)$$,
         tests.id('t_bob'), tests.id('t_end'), tests.id('t_end'), tests.id('t_tax'), tests.id('t_edit')),
  'R-ACCOUNT-303: preview_reopen lists what the reopen does to the transfers, per occurrence (found by running it and rolling it back)');
select is((select count(*)::integer from public.transaction_list where transfer_id = tests.id('t_edit') and transfer_occurrence_seq = 3), 1,
  'R-ACCOUNT-303: (the preview changed nothing)');
create temp table merged_tx on commit drop as
  select x.id from public.transactions as x join public.transfer_occurrences as o on o.id = x.transfer_occurrence_id
  where o.transfer_id = tests.id('t_edit') and o.occurrence_seq = 3;
grant select on merged_tx to authenticated;
select lives_ok(format($$select * from public.reopen_previous_period(%L, %L, 1)$$, tests.id('b'), tests.id('p3')),
  'R-ACCOUNT-306: reopen');
select is((select count(*)::integer from public.transactions where id in (select id from merged_tx)), 0,
  'R-ACCOUNT-302: the catch-up''s transaction of the merged period''s pay date goes: that salary has not come');
select results_eq(
  format($$select transfer_id, occurrence_date, status, planned from public.get_transfer_checklist(%L)
           where transfer_id in (%L, %L) order by name, occurrence_date$$,
         tests.id('p2'), tests.id('t_bob'), tests.id('t_tax')),
  format($$values (%1$L::uuid, '2026-11-10'::date, 'to_do', true), (%1$L::uuid, '2026-12-10'::date, 'skipped', false),
                  (%2$L::uuid, '2026-11-05'::date, 'done', true), (%2$L::uuid, '2026-12-05'::date, 'done', false)$$,
         tests.id('t_bob'), tests.id('t_tax')),
  'R-ACCOUNT-301: a reopen moves no mark: a member''s mark whose occurrence is no longer planned stays, listed by its date and flagged');
select results_eq(
  format($$select t.end_seq, c.status, c.planned, c.is_ended
           from public.transfers as t cross join lateral public.get_transfer_checklist(%L) as c
           where t.id = %L and c.transfer_id = t.id$$, tests.id('p2'), tests.id('t_end')),
  $$values (2, 'done', false, true)$$,
  'R-ACCOUNT-306: a transfer ended in the merged period ends in the reopened one; its mark there stays, listed as ended (D-380)');
-- the salary comes early again on the same day: the merged period is created again with its
-- scheduled pay date, and with it the catch-up's transaction and the members' marks
select tests.remember('p3b', (select id from public.record_early_pay_date(tests.id('b'), tests.id('p2'),
  (select revision from public.periods where id = tests.id('p2')), '2026-11-21')));
select is((select count(*)::integer from public.transaction_list where transfer_id = tests.id('t_edit') and transfer_occurrence_seq = 3), 1,
  'R-ACCOUNT-302: once the period comes back, its transaction is created again, once');
select results_eq(
  format($$select transfer_id, occurrence_date, status, planned from public.get_transfer_checklist(%L)
           where transfer_id in (%L, %L) order by name$$,
         tests.id('p3b'), tests.id('t_bob'), tests.id('t_tax')),
  format($$values (%1$L::uuid, '2026-12-10'::date, 'skipped', true), (%2$L::uuid, '2026-12-05'::date, 'done', true)$$,
         tests.id('t_bob'), tests.id('t_tax')),
  'R-ACCOUNT-301: and a member''s marks are the same occurrences again');
select lives_ok(format($$select * from public.reopen_previous_period(%L, %L, 1)$$, tests.id('b'), tests.id('p3b')),
  'R-ACCOUNT-306: (reopened again)');
select tests.clear_authentication();
select tests.set_today('2026-11-16');
select tests.authenticate_as('ann');

-- ===========================================================================
-- Members, limits, shape (R-ACCOUNT-230, R-ACCOUNT-231, R-MEMBER-007)
-- ===========================================================================
select tests.remember('bob_acc', (select id from public.create_account(tests.id('b'), 'Bob card', 'credit_card', null, tests.get_user_id('bob'))));
select lives_ok(format($$select public.remove_member(%L, %L)$$, tests.id('b'), tests.get_user_id('bob')),
  'R-MEMBER-007: removing a member');
select results_eq(
  format($$select user_id, user_is_member, user_display_name, end_seq from public.account_overview where id = %L$$, tests.id('bob_acc')),
  format($$values (%L::uuid, false, 'Bob', null::integer)$$, tests.get_user_id('bob')),
  'R-ACCOUNT-001: an account keeps the member it belongs to after they leave (shown as a former member)');
select results_eq(
  format($$select due_date, follows_primary from public.get_transfer_checklist(%L) where transfer_id = %L and planned$$, tests.id('p2'), tests.id('t_bob')),
  $$values ('2026-11-11'::date, false)$$,
  'R-ACCOUNT-311: the chosen income ended today: its occurrence already due stays, and no primary one already past appears');
select is((select follows_primary from public.transfer_overview where id = tests.id('t_bob')), true,
  'R-ACCOUNT-071: the overview says so too');

select tests.clear_authentication();
create or replace function private.limit_active_accounts() returns integer language sql immutable set search_path = ''
  as $f$ select (select count(*)::integer from public.accounts where budget_id = tests.id('b') and end_seq is null) $f$;
create or replace function private.limit_active_transfers() returns integer language sql immutable set search_path = ''
  as $f$ select (select count(*)::integer from public.transfers where budget_id = tests.id('b') and end_seq is null) $f$;
select tests.authenticate_as('ann');
select throws_ok(format($$select * from public.create_account(%L, 'One too many', 'cash')$$, tests.id('b')),
  'P0001', 'account_limit_reached', 'R-ACCOUNT-230: at most 50 accounts in force');
select throws_ok(format($$select * from public.create_transfer(%L, 'One too many', %L, %L, 1, 'pay_date')$$, tests.id('b'), tests.id('main'), tests.id('sav')),
  'P0001', 'transfer_limit_reached', 'R-ACCOUNT-230: at most 50 transfers in force');
select tests.clear_authentication();
create or replace function private.limit_active_accounts() returns integer language sql immutable set search_path = '' as $f$ select 50 $f$;
create or replace function private.limit_active_transfers() returns integer language sql immutable set search_path = '' as $f$ select 50 $f$;

-- the shape holds whatever writes the rows (checked at commit)
savepoint shape;
set constraints all immediate;
select throws_ok(format($$update public.accounts set end_seq = 2 where id = %L$$, tests.id('main')),
  '23514', null, 'R-ACCOUNT-231: an account used by a transfer cannot end under it, whatever writes the row');
rollback to savepoint shape;
savepoint shape2;
set constraints all immediate;
select throws_ok(format($$update public.transfer_versions set category_id = %L where transfer_id = %L$$, tests.id('savings'), tests.id('t_sav')),
  '23514', null, 'R-ACCOUNT-231: a transfer''s category is a leaf, whatever writes the row');
rollback to savepoint shape2;
-- (the test moved today back to the 16th; the catch-up's transactions of the 18th to the 20th
-- were made when those days had come: check the invariants on the 22nd, after a catch-up)
select tests.set_today('2026-11-22');
select tests.authenticate_as('ann');
select public.ensure_periods(tests.id('b'));
select tests.clear_authentication();
select is_empty(format($$select * from tests.moneyflow_violations(%L)$$, tests.id('b')),
  'R-ACCOUNT-302: every invariant of the money flow holds after all this');

-- ===========================================================================
-- Another user, a member of another budget, an anonymous visitor (R-SECURITY-002 to -004)
-- ===========================================================================
select tests.authenticate_as('eve');
select is((select count(*)::integer from public.accounts where budget_id = tests.id('b'))
          + (select count(*)::integer from public.transfers where budget_id = tests.id('b'))
          + (select count(*)::integer from public.transfer_versions where budget_id = tests.id('b'))
          + (select count(*)::integer from public.transfer_occurrences where budget_id = tests.id('b'))
          + (select count(*)::integer from public.account_overview where budget_id = tests.id('b'))
          + (select count(*)::integer from public.transfer_overview where budget_id = tests.id('b')), 0,
  'R-SECURITY-002: another user reads none of a budget''s accounts, transfers, terms or marks');
select throws_ok(format($$select * from public.create_account(%L, 'X', 'cash')$$, tests.id('b')),
  'P0001', 'budget_not_found', 'R-SECURITY-004: another user cannot create an account in it');
select throws_ok(format($$select * from public.update_account(%L, 1, p_name => 'X')$$, tests.id('main')),
  'P0001', 'account_not_found', 'R-SECURITY-004: nor edit one');
select throws_ok(format($$select public.close_account(%L, 1)$$, tests.id('main')),
  'P0001', 'account_not_found', 'R-SECURITY-004: nor close one');
select throws_ok(format($$select * from public.preview_close_account(%L)$$, tests.id('main')),
  'P0001', 'account_not_found', 'R-SECURITY-004: nor preview it');
select throws_ok(format($$select * from public.create_transfer(%L, 'X', %L, %L, 1, 'pay_date')$$, tests.id('b'), tests.id('main'), tests.id('sav')),
  'P0001', 'budget_not_found', 'R-SECURITY-004: nor create a transfer');
select throws_ok(format($$select * from public.update_transfer(%L, 1, p_amount => 1)$$, tests.id('t_tax')),
  'P0001', 'transfer_not_found', 'R-SECURITY-004: nor edit one');
select throws_ok(format($$select public.end_transfer(%L, 1)$$, tests.id('t_tax')),
  'P0001', 'transfer_not_found', 'R-SECURITY-004: nor end one');
select throws_ok(format($$select * from public.preview_update_transfer(%L)$$, tests.id('t_tax')),
  'P0001', 'transfer_not_found', 'R-SECURITY-004: nor preview an edit');
select throws_ok(format($$select * from public.preview_end_transfer(%L)$$, tests.id('t_tax')),
  'P0001', 'transfer_not_found', 'R-SECURITY-004: nor an end');
select throws_ok(format($$select * from public.preview_create_transfer(%L, %L, %L, 1, 'pay_date')$$, tests.id('b'), tests.id('main'), tests.id('sav')),
  'P0001', 'budget_not_found', 'R-SECURITY-004: nor a new transfer');
select throws_ok(format($$select * from public.get_transfer_terms(%L, %L)$$, tests.id('t_tax'), tests.id('p2')),
  'P0001', 'transfer_not_found', 'R-SECURITY-004: nor read its terms');
select throws_ok(format($$select * from public.get_transfer_checklist(%L)$$, tests.id('p2')),
  'P0001', 'period_not_found', 'R-SECURITY-004: nor read a checklist');
select throws_ok(format($$select * from public.mark_transfer_done(%L, %L, 0)$$, tests.id('t_tax'), tests.id('p2')),
  'P0001', 'transfer_not_found', 'R-SECURITY-004: nor mark a transfer done');
select throws_ok(format($$select * from public.skip_transfer(%L, %L, 0)$$, tests.id('t_tax'), tests.id('p2')),
  'P0001', 'transfer_not_found', 'R-SECURITY-004: nor skip one');
select throws_ok(format($$select * from public.mark_transfer_not_done(%L, %L, 0)$$, tests.id('t_sav'), tests.id('p2')),
  'P0001', 'transfer_not_found', 'R-SECURITY-004: nor mark one not done');
select throws_ok(format($$select * from public.undo_transfer_mark(%L, %L, 1)$$, tests.id('t_tax'), tests.id('p2')),
  'P0001', 'transfer_not_found', 'R-SECURITY-004: nor undo a mark');
select throws_ok(format($$select * from public.get_money_flow(%L)$$, tests.id('b')),
  'P0001', 'budget_not_found', 'R-SECURITY-004: nor read the money flow');
-- a member of another budget: her own ids with Ann's budget, Ann's ids with her own budget
select throws_ok(format($$select * from public.create_transfer(%L, 'X', %L, %L, 1, 'pay_date')$$, tests.id('e'), tests.id('e_acc'), tests.id('main')),
  'P0001', 'account_not_found', 'R-SECURITY-004: a member of another budget cannot name its accounts in her own');
select throws_ok(format($$select * from public.get_money_flow(%L, %L)$$, tests.id('e'), tests.id('p2')),
  'P0001', 'period_not_found', 'R-SECURITY-004: nor read her budget''s flow for its period');

select tests.authenticate_as_anon();
select throws_ok($$select count(*) from public.accounts$$, '42501', null, 'R-SECURITY-003: an anonymous visitor reads no account');
select throws_ok($$select count(*) from public.transfers$$, '42501', null, 'R-SECURITY-003: no transfer');
select throws_ok($$select count(*) from public.transfer_occurrences$$, '42501', null, 'R-SECURITY-003: no mark');
select throws_ok($$select count(*) from public.transfer_overview$$, '42501', null, 'R-SECURITY-003: no overview');
select throws_ok(format($$select * from public.create_account(%L, 'X', 'cash')$$, tests.id('b')),
  '42501', null, 'R-SECURITY-003: and calls none of the functions');
select throws_ok(format($$select * from public.get_money_flow(%L)$$, tests.id('b')),
  '42501', null, 'R-SECURITY-003: not the money flow either');
select throws_ok(format($$select * from public.get_transfer_checklist(%L)$$, tests.id('p2')),
  '42501', null, 'R-SECURITY-003: nor the checklist');
select tests.clear_authentication();

select * from finish();
rollback;
