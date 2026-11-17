-- Client request ids and access (M-1 of the step 6 re-review, R-APP-340): membership is checked
-- before the id is looked at, before the catch-up gate and before the budget lock. A removed
-- member's replay, and any signed-in outsider's call, get budget_not_found; a replay answers a
-- current member only rows of that budget; add_income replayed after the income was removed
-- answers nothing. Also the parts of R-APP-250 the earlier tests left open.
begin;
select plan(25);

select tests.create_user('ria', 'Ria');
select tests.create_user('sam', 'Sam');
select tests.create_user('out', 'Out');
select tests.set_today('2026-11-16');

select tests.authenticate_as('ria');
select tests.remember('b', public.create_budget('Access', 'Salary', 500000, 25, 'nearest', '2026-09-01'));
select tests.remember('b2', public.create_budget('Second', 'Salary', 500000, 25, 'nearest', '2026-09-01'));
select tests.remember('p_next', (select id from public.periods where budget_id = tests.id('b') order by seq desc limit 1));
select tests.remember('inv', public.invite_member(tests.id('b'), tests.get_user_email('sam')));
select tests.authenticate_as('sam');
select public.accept_invitation(tests.id('inv'));

-- Sam records one of each with a client id
select tests.remember('cat', (select id from public.create_category(tests.id('b'), 'Food', p_amount => 1000)));
select tests.remember('k_tx', gen_random_uuid());
select tests.remember('k_cat', gen_random_uuid());
select tests.remember('k_debt', gen_random_uuid());
select tests.remember('k_sub', gen_random_uuid());
select tests.remember('k_inc', gen_random_uuid());
select tests.remember('k_acc', gen_random_uuid());
select tests.remember('k_tr', gen_random_uuid());
create temp table calls (name text primary key, sql text) on commit drop;
grant select on calls to authenticated;
insert into calls values
  ('add_transaction', format($$select id::text from public.add_transaction(%L, 'expense', 1234, '2026-11-10', %L, 'first', p_client_id => %L)$$,
                             tests.id('b'), tests.id('cat'), tests.id('k_tx'))),
  ('create_category', format($$select string_agg(id::text, ',') from public.create_category(%L, 'Garden', p_client_id => %L)$$,
                             tests.id('b'), tests.id('k_cat'))),
  ('create_debt', format($$select id::text from public.create_debt(%L, 'Car loan', 100000, %L, 5000, p_client_id => %L)$$,
                         tests.id('b'), tests.id('cat'), tests.id('k_debt'))),
  ('create_subscription', format($$select id::text from public.create_subscription(%L, 'Gym', 4900, 'monthly', %L, '2026-11-20', p_client_id => %L)$$,
                                 tests.id('b'), tests.id('cat'), tests.id('k_sub'))),
  ('add_income', format($$select public.add_income(%L, 'Side job', 1000, 1, p_from_period_id => %L, p_client_id => %L)::text$$,
                        tests.id('b'), tests.id('p_next'), tests.id('k_inc'))),
  ('create_account', format($$select id::text from public.create_account(%L, 'Main', 'current', p_client_id => %L)$$,
                            tests.id('b'), tests.id('k_acc'))),
  ('create_transfer', format($$select id::text from public.create_transfer(%L, 'Rent', null, null, 1000, 'day_of_month', p_day_of_month => 28, p_client_id => %L)$$,
                             tests.id('b'), tests.id('k_tr')));
create temp table first_answers (name text primary key, answer text) on commit drop;
grant select, insert on first_answers to authenticated;
do $$
declare
  c record;
  v text;
begin
  for c in select * from calls where name not in ('create_transfer') loop
    execute c.sql into v;
    insert into first_answers values (c.name, v);
  end loop;
end $$;
select is((select count(*)::integer from first_answers where answer is not null), 6, 'R-APP-250: six records created with client ids');

-- a replay by a current member answers the same rows (the survivor "no budget lock" is covered
-- by 91c; here: answered by the replay, nothing more created)
select is((select id::text from public.add_transaction(tests.id('b'), 'expense', 1234, '2026-11-10', tests.id('cat'), 'first', p_client_id => tests.id('k_tx'))),
          (select answer from first_answers where name = 'add_transaction'), 'R-APP-340: a current member''s replay answers the row');

-- Ria removes Sam and edits the transaction
select tests.authenticate_as('ria');
select public.remove_member(tests.id('b'), tests.get_user_id('sam'));
select count(*) from public.update_transaction((select answer::uuid from first_answers where name = 'add_transaction'), 1, 'expense', 888888,
                                               '2026-11-10', tests.id('cat'), 'after removal: more secret', false, null, null);

-- the removed member replays each call exactly
select tests.authenticate_as('sam');
create function pg_temp.refusal(q text) returns text language plpgsql as $$
begin
  execute q;
  return 'no error';
exception when others then
  return sqlerrm;
end $$;
select is(pg_temp.refusal((select sql from calls where name = c.name)), 'budget_not_found',
          format('R-APP-340: a removed member replaying %s gets budget_not_found', c.name))
from (values ('add_transaction'), ('create_category'), ('create_debt'), ('create_subscription'), ('add_income'), ('create_account'), ('create_transfer')) as c (name);

-- a signed-in outsider: every budget, every client id, known or not
select tests.authenticate_as('out');
select is(pg_temp.refusal((select sql from calls where name = 'add_transaction')), 'budget_not_found',
  'R-APP-340: an outsider replaying a known client id gets budget_not_found (not request_reused)');
select is(pg_temp.refusal(format($$select * from public.add_transaction(%L, 'expense', 1, '2026-11-10', %L, null, p_client_id => %L)$$,
                                 tests.id('b'), tests.id('cat'), gen_random_uuid())), 'budget_not_found',
  'R-APP-340: and an unknown one');
select is(pg_temp.refusal(format($$select * from public.add_transaction(%L, 'expense', 1, '2026-11-10', %L, null, p_client_id => %L)$$,
                                 tests.id('b2'), tests.id('cat'), tests.id('k_tx'))), 'budget_not_found',
  'R-APP-340: for any budget id');
select is(pg_temp.refusal(format($$select * from public.add_transaction(%L, 'expense', 1, '2026-11-10', null, null, p_client_id => %L)$$,
                                 gen_random_uuid(), tests.id('k_tx'))), 'budget_not_found',
  'R-APP-340: even one that does not exist');

-- far behind: the member is told catching_up, an outsider still budget_not_found
select tests.clear_authentication();
select tests.set_today('2027-04-15');
select tests.authenticate_as('out');
select is(pg_temp.refusal(format($$select * from public.add_transaction(%L, 'expense', 1, '2026-11-10', %L, null, p_client_id => %L)$$,
                                 tests.id('b'), tests.id('cat'), tests.id('k_tx'))), 'budget_not_found',
  'R-APP-340: an outsider never learns that a budget is far behind');
select tests.authenticate_as('ria');
select is(pg_temp.refusal(format($$select * from public.add_transaction(%L, 'expense', 1, '2026-11-10', %L, null, p_client_id => %L)$$,
                                 tests.id('b'), tests.id('cat'), gen_random_uuid())), 'catching_up',
  'R-APP-340: a member is (the gate after membership)');
select tests.clear_authentication();
select tests.set_today('2026-11-16');

-- a replay answers only rows of that budget: a recorded id pointing at another budget's row
-- (impossible through the calls; planted here) answers nothing
select tests.clear_authentication();
select tests.remember('k_plant', gen_random_uuid());
insert into private.client_requests (id, user_id, budget_id, kind, digest, record_ids)
select tests.id('k_plant'), tests.get_user_id('ria'), tests.id('b2'), 'add_transaction',
       private.client_request_digest(jsonb_build_array('expense'::public.transaction_kind, 1234::bigint, '2026-11-10'::date, tests.id('cat'), 'first', null::uuid, null::uuid)),
       array[(select answer::uuid from first_answers where name = 'add_transaction')];
select tests.authenticate_as('ria');
select is((select count(*)::integer from public.add_transaction(tests.id('b2'), 'expense', 1234, '2026-11-10', tests.id('cat'), 'first', p_client_id => tests.id('k_plant'))),
          0, 'R-APP-340: a replay answers only rows of the budget it names');
-- the call is part of the check on its own: an id recorded by another call with the very same
-- digest (planted) is still refused
select tests.clear_authentication();
select tests.remember('k_kind', gen_random_uuid());
insert into private.client_requests (id, user_id, budget_id, kind, digest, record_ids)
select tests.id('k_kind'), tests.get_user_id('ria'), tests.id('b2'), 'create_category',
       private.client_request_digest(jsonb_build_array('expense'::public.transaction_kind, 1234::bigint, '2026-11-10'::date, tests.id('cat'), 'first', null::uuid, null::uuid)),
       array[tests.id('cat')];
select tests.authenticate_as('ria');
select is(pg_temp.refusal(format($$select * from public.add_transaction(%L, 'expense', 1234, '2026-11-10', %L, 'first', p_client_id => %L)$$,
                                 tests.id('b2'), tests.id('cat'), tests.id('k_kind'))), 'request_reused',
  'R-APP-250: an id recorded by another call is refused even with the same arguments');

-- add_income replayed after the income was removed answers nothing, like the other calls
select tests.remember('k_inc2', gen_random_uuid());
select tests.remember('inc2', public.add_income(tests.id('b'), 'Bonus', 2000, 1, p_from_period_id => tests.id('p_next'), p_client_id => tests.id('k_inc2')));
select public.remove_income(tests.id('inc2'), 1);
select is((select count(*)::integer from public.incomes where id = tests.id('inc2')), 0, 'R-APP-340: (the income added for a later period is deleted)');
select is(public.add_income(tests.id('b'), 'Bonus', 2000, 1, p_from_period_id => tests.id('p_next'), p_client_id => tests.id('k_inc2')), null,
  'R-APP-340: add_income replayed after the income was removed answers no income');

-- R-APP-250 survivors: another budget, another call, kept 7 days, pruned after
select tests.remember('k_r', gen_random_uuid());
select count(*) from public.add_transaction(tests.id('b'), 'expense', 77, '2026-11-11', tests.id('cat'), 'kept', p_client_id => tests.id('k_r'));
select is(pg_temp.refusal(format($$select * from public.add_transaction(%L, 'expense', 77, '2026-11-11', %L, 'kept', p_client_id => %L)$$,
                                 tests.id('b2'), tests.id('cat'), tests.id('k_r'))), 'request_reused',
  'R-APP-250: the same id and arguments for another budget of the member are refused');
select is(pg_temp.refusal(format($$select * from public.create_category(%L, 'kept', p_client_id => %L)$$, tests.id('b'), tests.id('k_r'))), 'request_reused',
  'R-APP-250: and for another call');
select tests.clear_authentication();
update private.client_requests set created_at = now() - interval '6 days 23 hours' where id = tests.id('k_r');
select tests.authenticate_as('ria');
select count(*) from public.add_transaction(tests.id('b'), 'expense', 78, '2026-11-11', tests.id('cat'), 'other', p_client_id => gen_random_uuid());
select tests.clear_authentication();
select is((select count(*)::integer from private.client_requests where id = tests.id('k_r')), 1, 'R-APP-250: a request is kept for 7 days');
select tests.clear_authentication();
update private.client_requests set created_at = now() - interval '7 days 1 minute' where id = tests.id('k_r');
select tests.authenticate_as('ria');
select count(*) from public.add_transaction(tests.id('b'), 'expense', 79, '2026-11-11', tests.id('cat'), 'other', p_client_id => gen_random_uuid());
select tests.clear_authentication();
select is((select count(*)::integer from private.client_requests where id = tests.id('k_r')), 0, 'R-APP-250: and pruned once older');
select is((select count(*)::integer from private.client_requests where budget_id = tests.id('b2')), 2,
  'R-APP-250: pruning keeps the newer requests');

-- the anonymous visitor cannot call any of them
select tests.authenticate_as_anon();
select throws_ok(format($$select * from public.add_transaction(%L, 'expense', 1, '2026-11-10', null, null, p_client_id => %L)$$, tests.id('b'), tests.id('k_tx')),
  '42501', null, 'R-APP-340: an anonymous visitor cannot replay a client id');

select * from finish();
rollback;
