-- What the step 6 re-review's mutants showed untested (should-fix 13): a charge winning a tie
-- of possible matches, undo and rules leaving linked transactions alone, the cleaner's
-- characters, the 365 days of kept tokens, a client id racing from another budget, the
-- 62-day gate at 62 and 63 days, interest dropped at a moved start exactly where it must be,
-- the comparison's "completed" on a period's last day, and the 50 memberships.
begin;
select plan(21);

select tests.create_user('vic', 'Vic');
select tests.create_user('wes', 'Wes');
select tests.set_today('2026-11-16');

create function pg_temp.refusal(q text) returns text language plpgsql as $$
begin
  execute q;
  return 'no error';
exception when others then
  return sqlerrm;
end $$;

select tests.authenticate_as('vic');
select tests.remember('b', public.create_budget('Survivors', 'Salary', 500000, 25, 'nearest', '2026-09-01'));
select tests.remember('p1', (select id from public.periods where budget_id = tests.id('b') and seq = 1));
select tests.remember('food', (select id from public.create_category(tests.id('b'), 'Food', p_amount => 60000, p_from_period_id => tests.id('p1'))));
select tests.remember('gym_cat', (select id from public.create_category(tests.id('b'), 'Gym', p_amount => 5000, p_from_period_id => tests.id('p1'))));
select tests.remember('sub', (select id from public.create_subscription(tests.id('b'), 'Gym', 4900, 'monthly', tests.id('gym_cat'), '2026-12-20')));
select tests.remember('acc1', (select id from public.create_account(tests.id('b'), 'Main', 'current')));
select tests.remember('acc2', (select id from public.create_account(tests.id('b'), 'Savings', 'savings')));
select tests.remember('tr', (select id from public.create_transfer(tests.id('b'), 'Saving', tests.id('acc1'), tests.id('acc2'), 1000, 'day_of_month',
                                                                   p_day_of_month => 1)));

-- ===========================================================================
-- A charge awaiting confirmation wins a tie of possible matches (R-IMPORT-261)
-- ===========================================================================
select count(*) from public.add_transaction(tests.id('b'), 'expense', 3333, '2026-11-09', tests.id('gym_cat'), 'typed');
select tests.clear_authentication();
select tests.remember('charge', gen_random_uuid());
insert into public.transactions (id, budget_id, kind, amount, date, category_id, subscription_id, review_state, charge_date)
values (tests.id('charge'), tests.id('b'), 'expense', 3333, '2026-11-11', tests.id('gym_cat'), tests.id('sub'), 'awaiting_confirmation', '2026-11-11');
select tests.authenticate_as('vic');
select is((select row(action, match_of)::text from public.preview_import(tests.id('b'), null, '[{"date": "2026-11-10", "amount": 3333, "direction": "debit"}]')),
  row('confirm_match', tests.id('charge'))::text, 'R-IMPORT-261: at the same distance, a charge awaiting confirmation goes first');

-- ===========================================================================
-- Undo and rules leave linked transactions alone (R-IMPORT-260)
-- ===========================================================================
select tests.remember('ib', gen_random_uuid());
select count(*) from public.import_transactions(tests.id('b'), tests.id('ib'), 1, '[
  {"date": "2026-11-12", "amount": 701, "direction": "debit", "description": "Linked sub"},
  {"date": "2026-11-12", "amount": 702, "direction": "debit", "description": "Linked transfer"}]', 'csv');
select count(*) from public.mark_transfer_done(tests.id('tr'), (select id from public.periods where budget_id = tests.id('b') and '2026-11-16' between start_date and end_date), 0);
select tests.clear_authentication();
select tests.remember('occ', (select id from public.transfer_occurrences where transfer_id = tests.id('tr') order by occurrence_date limit 1));
update public.transactions set subscription_id = tests.id('sub'), category_id = tests.id('gym_cat')
where import_batch_id = tests.id('ib') and description = 'Linked sub';
-- only the database links a transfer's transaction, at its creation: planted as an import
insert into public.transactions (budget_id, kind, amount, date, category_id, description, merchant_key, review_state, import_batch_id, transfer_occurrence_id)
select tests.id('b'), 'expense', 703, '2026-11-12', c.id, 'Linked transfer rule', 'linked transfer rule', 'to_review', tests.id('ib'), tests.id('occ')
from public.categories as c where c.budget_id = tests.id('b') and c.is_to_categorise;
update public.import_batches set row_count = row_count + 1, imported_count = imported_count + 1 where id = tests.id('ib');
select tests.authenticate_as('vic');
select is((select moved from public.create_merchant_rule(tests.id('b'), 'linked transfer rule', tests.id('food'), true)), 0,
  'R-IMPORT-260: a rule never moves a transaction linked to a planned transfer');
select is((select row(deleted, kept_linked)::text from public.undo_import_batch(tests.id('ib'))), row(1, 2)::text,
  'R-IMPORT-260: undo keeps the transactions linked to a subscription or a planned transfer');
select tests.clear_authentication();
select is((select array_agg(description order by description) from public.transactions where import_batch_id = tests.id('ib')),
  array['Linked sub', 'Linked transfer rule'], 'R-IMPORT-260: the linked ones are still there');

-- ===========================================================================
-- The cleaner's characters (R-SECURITY-250)
-- ===========================================================================
select is(private.clean_text(U&'a\2066b\2067c\2068d\2069e'), 'abcde', 'R-SECURITY-250: bidirectional isolates are removed');
select is(private.clean_text(U&'a\0080b\0084c\0090d\009Fe'), 'abcde', 'R-SECURITY-250: C1 controls are removed');
select is(private.clean_text(U&'soft\00ADhy\061Cphen\180E'), 'softhyphen', 'R-SECURITY-250: soft hyphen, Arabic letter mark and Mongolian vowel separator are removed');
select is(private.clean_text(U&'a\00A0\00A0b'), 'a b', 'R-SECURITY-250: non-breaking spaces are white space');

-- ===========================================================================
-- Revoked tokens are kept at most 365 days (R-IMPORT-256)
-- ===========================================================================
select tests.authenticate_as('vic');
select tests.remember('old_tok', (select token_id from public.create_import_token(tests.id('b'), 'Old')));
select tests.remember('young_tok', (select token_id from public.create_import_token(tests.id('b'), 'Young')));
select public.revoke_import_token(tests.id('old_tok'));
select public.revoke_import_token(tests.id('young_tok'));
select tests.clear_authentication();
update public.import_tokens set created_at = now() - interval '366 days' where id = tests.id('old_tok');
update public.import_tokens set created_at = now() - interval '364 days' where id = tests.id('young_tok');
select tests.authenticate_as('vic');
select count(*) from public.create_import_token(tests.id('b'), 'Trigger pruning');
select tests.clear_authentication();
select is((select array_agg(name order by name) from public.import_tokens where id in (tests.id('old_tok'), tests.id('young_tok'))), array['Young'],
  'R-IMPORT-256: a revoked token older than 365 days is pruned, a younger one kept');

-- ===========================================================================
-- A client id racing from another budget is refused (R-APP-250)
-- ===========================================================================
select tests.authenticate_as('vic');
select tests.remember('b2', public.create_budget('Second', 'Salary', 500000, 25, 'nearest', '2026-09-01'));
select tests.remember('k', gen_random_uuid());
select count(*) from public.add_transaction(tests.id('b'), 'expense', 55, '2026-11-12', tests.id('food'), null, p_client_id => tests.id('k'));
select tests.clear_authentication();
select set_config('request.jwt.claims', json_build_object('sub', tests.get_user_id('vic'), 'role', 'authenticated')::text, true);
select throws_ok(format($$select private.client_request_record(%L, %L, 'add_transaction', 'x', '{}')$$, tests.id('k'), tests.id('b2')),
  'P0001', 'request_reused', 'R-APP-250: the same id recorded by a call that raced from another budget is refused (its rows go with it)');
select tests.clear_authentication();

-- ===========================================================================
-- The gate: 62 days behind still rolls over, 63 answer catching_up (R-PERIOD-250)
-- ===========================================================================
create temp table last_end on commit drop as select max(end_date) as d from public.periods where budget_id = tests.id('b2');
grant select on last_end to authenticated;
savepoint gate62;
select tests.set_today((select d + 62 from last_end));
select tests.authenticate_as('vic');
select is(pg_temp.refusal(format($$select count(*) from public.add_transaction(%L, 'extra_income', 1, %L)$$, tests.id('b2'), (select d from last_end))),
  'no error', 'R-PERIOD-250: a budget whose last period ended 62 days ago still rolls over');
select tests.clear_authentication();
rollback to savepoint gate62;
select tests.set_today((select d + 63 from last_end));
select tests.authenticate_as('vic');
select is(pg_temp.refusal(format($$select count(*) from public.add_transaction(%L, 'extra_income', 1, %L)$$, tests.id('b2'), (select d from last_end))),
  'catching_up', 'R-PERIOD-250: 63 days behind answers catching_up');
select tests.clear_authentication();
select tests.set_today('2026-11-16');

-- ===========================================================================
-- Interest at a moved start: refused from the opening day on, only for that period (D-467)
-- ===========================================================================
select tests.authenticate_as('wes');
select tests.remember('ib3', public.create_budget('Interest', 'Salary', 500000, 25, 'nearest', '2026-09-01'));
select tests.remember('loans', (select id from public.create_category(tests.id('ib3'), 'Loans', p_amount => 1000)));
select tests.remember('debt', (select id from public.create_debt(tests.id('ib3'), 'Loan', 1200000, tests.id('loans'), 50000, 12)));
select tests.clear_authentication();
select tests.set_today('2026-12-28');
select tests.authenticate_as('wes');
select public.ensure_periods(tests.id('ib3'));
select tests.remember('p3', (select id from public.periods where budget_id = tests.id('ib3') and start_date = '2026-11-25'));
select tests.remember('p4', (select id from public.periods where budget_id = tests.id('ib3') and start_date = '2026-12-25'));
select is((select row(accepted, refusal)::text from public.preview_move_period_start(tests.id('p3'), '2026-11-17')), row(true, null::text)::text,
  'R-DEBT-340: the preview of a start the day after the opening accepts it');
select is((select row(accepted, refusal)::text from public.preview_move_period_start(tests.id('p3'), '2026-11-16')), row(false, 'interest_before_opening')::text,
  'R-DEBT-340: the preview of a start on the opening day refuses it');
select tests.move_period_start(tests.id('p3'), '2026-11-17');
select tests.clear_authentication();
select is((select count(*)::integer from public.debt_interest where debt_id = tests.id('debt') and period_id = tests.id('p3')), 1,
  'R-DEBT-340: a start moved to the day after the opening keeps the period''s entry');
select tests.authenticate_as('wes');
select throws_ok(format('select tests.move_period_start(%L, %L)', tests.id('p3'), '2026-11-16'), 'P0001', 'interest_before_opening',
  'R-DEBT-340: a start moved onto the opening day is refused');
select tests.clear_authentication();
select is((select count(*)::integer from public.debt_interest where debt_id = tests.id('debt') and period_id in (tests.id('p3'), tests.id('p4'))), 2,
  'R-DEBT-340: nothing is removed, in that period or the next');

-- ===========================================================================
-- The comparison: a period is completed only after its last day (D-384)
-- ===========================================================================
select tests.set_today((select end_date from public.periods where id = tests.id('p4')));
select tests.authenticate_as('wes');
select is((select bool_or(a_is_completed) from public.get_period_comparison(tests.id('ib3'), tests.id('p4'), null)), false,
  'D-384: on its last day a period is not completed yet');
select tests.clear_authentication();
select tests.set_today('2026-11-16');

-- ===========================================================================
-- At most 50 budgets a user (R-MEMBER-250)
-- ===========================================================================
select tests.create_user('own1', 'Own one');
select tests.create_user('own2', 'Own two');
select tests.create_user('own3', 'Own three');
select tests.create_user('joiner', 'Joiner');
create temp table invites (n integer, id uuid) on commit drop;
grant select, insert on invites to authenticated;
do $$
declare
  v_owner text;
  v_budget uuid;
begin
  for i in 1..51 loop
    v_owner := 'own' || (1 + (i - 1) / 17);
    perform tests.authenticate_as(v_owner);
    v_budget := public.create_budget('Shared ' || i, 'Salary', 100000, 25, 'nearest', '2026-10-01');
    insert into invites values (i, public.invite_member(v_budget, tests.get_user_email('joiner')));
  end loop;
end $$;
select tests.authenticate_as('joiner');
do $$ begin
  for i in 1..50 loop perform public.accept_invitation((select id from invites where n = i)); end loop;
end $$;
select is((select count(*)::integer from public.my_budgets), 50, 'R-MEMBER-250: a user can belong to 50 budgets');
select is(pg_temp.refusal(format('select public.accept_invitation(%L)', (select id from invites where n = 51))), 'membership_limit_reached',
  'R-MEMBER-250: not 51');
select tests.clear_authentication();

-- the anonymous visitor
select tests.authenticate_as_anon();
select throws_ok(format('select * from public.preview_move_period_start(%L, %L)', tests.id('p3'), '2026-11-16'), '42501', null,
  'D-386: an anonymous visitor cannot preview a move');

select * from finish();
rollback;
