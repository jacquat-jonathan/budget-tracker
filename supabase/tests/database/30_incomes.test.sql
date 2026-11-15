-- Incomes and versioning: edits never rewrite the past.
-- Budget from January 2026, pay day 25: periods 1..10, period 10 (26 Oct - 24 Nov) is
-- current on 15 November.
begin;
select plan(35);

select tests.create_user('alice', 'Alice');
select tests.create_user('bob', 'Bob');
select tests.create_user('carol', 'Carol');
select tests.set_today('2026-11-15');

select tests.authenticate_as('alice');
select tests.remember('b', public.create_budget('Home', 'Alice salary', 500000, 25, 'nearest', '2026-01-01'));
select tests.remember('primary', (select primary_income_id from public.budgets where id = tests.id('b')));

-- Bob joins through an invitation.
select tests.remember('inv', public.invite_member(tests.id('b'), tests.get_user_email('bob')));
select tests.authenticate_as('bob');
select public.accept_invitation(tests.id('inv'));

-- Totals per period, as a member sees them.
create or replace function pg_temp.totals()
returns table (seq integer, income_total bigint)
language sql
as $$
  select seq, income_total from public.period_summaries
  where budget_id = tests.id('b') order by seq
$$;

select results_eq(
  'select seq, income_total from pg_temp.totals()',
  $$select s, 500000::bigint from generate_series(1, 10) as s$$,
  'every period starts with the primary income'
);

-- ---------------------------------------------------------------------------
-- Edits in the current period
-- ---------------------------------------------------------------------------
select lives_ok(
  format('select public.update_income_terms(%L, 600000, 25, %L)', tests.id('primary'), 'nearest'),
  'a member edits the primary amount in the current period'
);
select results_eq(
  'select seq, income_total from pg_temp.totals()',
  $$select s, (case when s = 10 then 600000 else 500000 end)::bigint from generate_series(1, 10) as s$$,
  'only the current period reads the new amount; past totals are unchanged'
);
select lives_ok(
  format('select public.update_income_terms(%L, 650000, 25, %L)', tests.id('primary'), 'nearest'),
  'a second edit in the same period'
);
select results_eq(
  format('select effective_from_seq, amount from public.income_versions where income_id = %L order by 1',
         tests.id('primary')),
  $$values (1, 500000::bigint), (10, 650000::bigint)$$,
  'overwrites that period''s version instead of adding one'
);
select is(
  (select amount from public.income_overview where id = tests.id('primary')),
  650000::bigint,
  'income_overview shows the current terms'
);
select is(
  (select next_pay_date from public.income_overview where id = tests.id('primary')),
  '2026-11-25'::date,
  'and the next actual pay date'
);

-- ---------------------------------------------------------------------------
-- Adding incomes
-- ---------------------------------------------------------------------------
select tests.remember('bob_now', public.add_income(tests.id('b'), 'Bob salary', 200000, 20));
select results_eq(
  format('select user_id, first_seq, is_primary, is_active from public.income_overview where id = %L',
         tests.id('bob_now')),
  format('values (%L::uuid, 10, false, true)', tests.get_user_id('bob')),
  'an added income belongs to the caller by default and counts from the current period'
);
select tests.remember('bob_past', public.add_income(
  tests.id('b'), 'Bob side job', 100000, 1, 'nearest', null,
  (select id from public.periods where budget_id = tests.id('b') and seq = 4)
));
select results_eq(
  'select seq, income_total from pg_temp.totals()',
  $$select s, (case when s = 10 then 650000 + 200000 + 100000
                    when s >= 4 then 500000 + 100000
                    else 500000 end)::bigint
    from generate_series(1, 10) as s$$,
  'an income added from a past period counts from that period on'
);

select tests.authenticate_as('alice');
select tests.remember('for_bob', public.add_income(tests.id('b'), 'Bob bonus', 5000, 25, 'nearest', tests.get_user_id('bob')));
select is(
  (select user_id from public.incomes where id = tests.id('for_bob')),
  tests.get_user_id('bob'),
  'a member can add an income for another member'
);
select throws_ok(
  format('select public.add_income(%L, %L, 1000, 25, %L, %L)', tests.id('b'), 'X', 'nearest', tests.get_user_id('carol')),
  'P0001', 'member_not_found',
  'but not for someone who is not a member'
);
select throws_ok(
  format('select public.add_income(%L, %L, 1000, 25, %L, null, %L)', tests.id('b'), 'X', 'nearest', extensions.gen_random_uuid()),
  'P0001', 'period_not_found',
  'nor from a period of another budget'
);

-- ---------------------------------------------------------------------------
-- Removing incomes
-- ---------------------------------------------------------------------------
select is(public.remove_income(tests.id('bob_past')), 'ended', 'an income that counted in the past is ended');
select results_eq(
  format('select first_seq, end_seq, is_active from public.income_overview where id = %L', tests.id('bob_past')),
  $$values (4, 10, false)$$,
  'from the current period'
);
select results_eq(
  'select seq, income_total from pg_temp.totals()',
  $$select s, (case when s = 10 then 650000 + 200000 + 5000
                    when s >= 4 then 500000 + 100000
                    else 500000 end)::bigint
    from generate_series(1, 10) as s$$,
  'past periods keep counting it; the current one no longer does'
);
select is(
  (select next_pay_date from public.income_overview where id = tests.id('bob_past')),
  null::date,
  'an ended income has no next pay date'
);
select is(public.remove_income(tests.id('for_bob')), 'deleted', 'an income added in the current period is deleted');
select is_empty(
  format('select 1 from public.incomes where id = %L', tests.id('for_bob')),
  'and is gone'
);
select throws_ok(
  format('select public.remove_income(%L)', tests.id('primary')),
  'P0001', 'income_is_primary',
  'the primary income cannot be removed (so the last income cannot either)'
);
select throws_ok(
  format('select public.remove_income(%L)', tests.id('bob_past')),
  'P0001', 'income_ended',
  'an ended income cannot be removed again'
);
select throws_ok(
  format('select public.update_income_terms(%L, 1000, 1, %L)', tests.id('bob_past'), 'nearest'),
  'P0001', 'income_ended',
  'nor edited'
);
select throws_ok(
  format('select public.set_primary_income(%L)', tests.id('bob_past')),
  'P0001', 'income_ended',
  'nor made primary'
);

-- ---------------------------------------------------------------------------
-- The next period reads the latest version; an edit then does not touch period 10
-- ---------------------------------------------------------------------------
select tests.clear_authentication();
select tests.set_today('2026-12-10');
select tests.authenticate_as('alice');
select is(public.ensure_periods(tests.id('b')), 1, 'December starts period 11');
select lives_ok(
  format('select public.update_income_terms(%L, 700000, 25, %L)', tests.id('primary'), 'nearest'),
  'editing the primary in period 11'
);
select results_eq(
  format('select seq, income_total from pg_temp.totals() where seq >= 9'),
  $$values (9, 600000::bigint), (10, 850000::bigint), (11, 900000::bigint)$$,
  'creates a version from period 11 only'
);
select is(
  (select count(*)::integer from public.income_versions where income_id = tests.id('primary')),
  3,
  'one version per period with an edit'
);

-- ---------------------------------------------------------------------------
-- Validation and bounds
-- ---------------------------------------------------------------------------
select throws_ok(
  format('select public.update_income_terms(%L, 0, 25, %L)', tests.id('primary'), 'nearest'),
  'P0001', 'invalid_amount', 'an amount of 0 is rejected'
);
select throws_ok(
  format('select public.update_income_terms(%L, 1000000001, 25, %L)', tests.id('primary'), 'nearest'),
  'P0001', 'invalid_amount', 'an amount above CHF 10 million is rejected'
);
select throws_ok(
  format('select public.update_income_terms(%L, 1000, 0, %L)', tests.id('primary'), 'nearest'),
  'P0001', 'invalid_pay_day', 'a pay day of 0 is rejected'
);
select throws_ok(
  format('select public.add_income(%L, %L, 1000, 25)', tests.id('b'), '   '),
  'P0001', 'invalid_name', 'a blank name is rejected'
);
select throws_ok(
  format('update public.incomes set name = %L where id = %L', ' padded ', tests.id('primary')),
  '23514', null, 'a direct rename must be trimmed'
);
select lives_ok(
  format('update public.incomes set name = %L where id = %L', 'Alice main job', tests.id('primary')),
  'a member renames an income directly'
);

-- Income limit: 50 per budget (ended ones included).
select lives_ok(
  format($q$do $d$ begin for i in 1..(50 - (select count(*) from public.incomes where budget_id = %L)) loop
           perform public.add_income(%L, 'Filler ' || i, 100, 1); end loop; end $d$$q$,
         tests.id('b'), tests.id('b')),
  'filling the budget up to 50 incomes'
);
select throws_ok(
  format('select public.add_income(%L, %L, 100, 1)', tests.id('b'), 'One too many'),
  'P0001', 'income_limit_reached', 'the 51st income is rejected'
);

select tests.clear_authentication();
select lives_ok('set constraints all immediate', 'all income invariants hold');
set constraints all deferred;

select * from finish();
rollback;
