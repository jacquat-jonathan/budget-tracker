-- Incomes and versioning: edits never rewrite the past implicitly; explicit corrections can.
-- Budget from January 2026, pay day 25: periods 1..10, period 10 (October's, 26 Oct -
-- 24 Nov) is current on 15 November.
begin;
select plan(54);

select tests.create_user('alice', 'Alice');
select tests.create_user('bob', 'Bob');
select tests.create_user('carol', 'Carol');
select tests.set_today('2026-11-15');

select tests.authenticate_as('alice');
select tests.remember('b', public.create_budget('Home', 'Alice salary', 500000, 25, 'nearest', '2026-01-01'));
select tests.remember('primary', (select primary_income_id from public.budgets where id = tests.id('b')));
select tests.remember('p1', (select id from public.periods where budget_id = tests.id('b') and seq = 1));
select tests.remember('p4', (select id from public.periods where budget_id = tests.id('b') and seq = 4));
select tests.remember('p8', (select id from public.periods where budget_id = tests.id('b') and seq = 8));

-- Bob joins through an invitation.
select tests.remember('inv', public.invite_member(tests.id('b'), tests.get_user_email('bob')));
select tests.authenticate_as('bob');
select public.accept_invitation(tests.id('inv'));

create or replace function pg_temp.totals(b uuid)
returns table (seq integer, income_total bigint)
language sql
as $$
  select seq, income_total from public.period_summaries where budget_id = b order by seq
$$;

select results_eq(
  format('select * from pg_temp.totals(%L)', tests.id('b')),
  $$select s, 500000::bigint from generate_series(1, 10) as s$$,
  'R-INCOME-001 R-PERIOD-018: every period starts with the primary income'
);
select is(
  (select pg_typeof(amount)::text from public.income_versions where income_id = tests.id('primary') limit 1),
  'bigint',
  'R-MONEY-002 C-MONEY-002: income amounts are stored as integer rappen'
);
select results_eq(
  format('select amount, pay_day, weekend_rule from public.income_overview where id = %L', tests.id('primary')),
  $$values (500000::bigint, 25, 'nearest'::public.weekend_rule)$$,
  'R-INCOME-004 R-INCOME-005: an income has an amount, a nominal pay day and a weekend rule, nearest by default'
);

-- ---------------------------------------------------------------------------
-- Edits in the current period
-- ---------------------------------------------------------------------------
select lives_ok(
  format('select public.update_income_terms(%L, 600000, 25, %L)', tests.id('primary'), 'nearest'),
  'R-MEMBER-001 R-INCOME-050: a member edits another member''s income (the primary) in the current period'
);
select results_eq(
  format('select * from pg_temp.totals(%L)', tests.id('b')),
  $$select s, (case when s = 10 then 600000 else 500000 end)::bigint from generate_series(1, 10) as s$$,
  'R-VERSION-001 R-VERSION-005: only the current period reads the new amount; past totals are unchanged'
);
select lives_ok(
  format('select public.update_income_terms(%L, 650000, 25, %L)', tests.id('primary'), 'nearest'),
  'R-VERSION-006: a second edit in the same period'
);
select results_eq(
  format('select effective_from_seq, amount from public.income_versions where income_id = %L order by 1',
         tests.id('primary')),
  $$values (1, 500000::bigint), (10, 650000::bigint)$$,
  'R-VERSION-006: overwrites that period''s version instead of adding one'
);
select results_eq(
  format('select amount, terms_from_seq, next_pay_date from public.income_overview where id = %L', tests.id('primary')),
  $$values (650000::bigint, 10, '2026-11-25'::date)$$,
  'R-VERSION-001: income_overview shows the terms in force now and the next actual pay date'
);

-- ---------------------------------------------------------------------------
-- Adding incomes
-- ---------------------------------------------------------------------------
select tests.remember('bob_now', public.add_income(tests.id('b'), 'Bob salary', 200000, 20));
select results_eq(
  format('select user_id, user_display_name, first_seq, is_primary, is_active from public.income_overview where id = %L',
         tests.id('bob_now')),
  format('values (%L::uuid, %L, 10, false, true)', tests.get_user_id('bob'), 'Bob'),
  'R-INCOME-003: an added income belongs to the caller by default and counts from the current period'
);
select tests.remember('bob_past', public.add_income(tests.id('b'), 'Bob side job', 100000, 1, 'nearest', null, tests.id('p4')));
select results_eq(
  format('select * from pg_temp.totals(%L)', tests.id('b')),
  $$select s, (case when s = 10 then 650000 + 200000 + 100000
                    when s >= 4 then 500000 + 100000
                    else 500000 end)::bigint
    from generate_series(1, 10) as s$$,
  'R-INCOME-003 R-INCOME-011 R-PERIOD-018: an income added from a past period counts once per period from that period on, whatever its pay day'
);

select tests.authenticate_as('alice');
select tests.remember('for_bob', public.add_income(tests.id('b'), 'Bob bonus', 5000, 25, 'nearest', tests.get_user_id('bob')));
select is(
  (select user_id from public.incomes where id = tests.id('for_bob')),
  tests.get_user_id('bob'),
  'R-MEMBER-001 R-INCOME-050: a member can add an income for another member'
);
select throws_ok(
  format('select public.add_income(%L, %L, 1000, 25, %L, %L)', tests.id('b'), 'X', 'nearest', tests.get_user_id('carol')),
  'P0001', 'member_not_found',
  'R-SECURITY-002: but not for someone who is not a member'
);
select throws_ok(
  format('select public.add_income(%L, %L, 1000, 25, %L, null, %L)', tests.id('b'), 'X', 'nearest', extensions.gen_random_uuid()),
  'P0001', 'period_not_found',
  'R-SECURITY-004: nor from a period of another budget'
);

-- ---------------------------------------------------------------------------
-- Removing incomes from the current period
-- ---------------------------------------------------------------------------
select is(public.remove_income(tests.id('bob_past')), 'ended', 'R-INCOME-012 R-INCOME-050: an income that counted in the past is ended (here one member removes another member''s income)');
select results_eq(
  format('select first_seq, end_seq, is_active, next_pay_date from public.income_overview where id = %L', tests.id('bob_past')),
  $$values (4, 10, false, null::date)$$,
  'R-INCOME-012: from the current period; an ended income has no next pay date'
);
select results_eq(
  format('select * from pg_temp.totals(%L)', tests.id('b')),
  $$select s, (case when s = 10 then 650000 + 200000 + 5000
                    when s >= 4 then 500000 + 100000
                    else 500000 end)::bigint
    from generate_series(1, 10) as s$$,
  'R-INCOME-012 R-VERSION-005: past periods keep counting it; the current one no longer does'
);
select is(public.remove_income(tests.id('for_bob')), 'deleted', 'R-INCOME-012: an income added in the current period is deleted');
select is_empty(format('select 1 from public.incomes where id = %L', tests.id('for_bob')), 'R-INCOME-012: and is gone');
select throws_ok(
  format('select public.remove_income(%L)', tests.id('primary')),
  'P0001', 'income_is_primary',
  'R-INCOME-009: the primary income cannot be removed (so the last income cannot either)'
);
select throws_ok(format('select public.remove_income(%L)', tests.id('bob_past')),
  'P0001', 'income_ended', 'R-INCOME-012: an ended income cannot be removed again from now');
select throws_ok(format('select public.update_income_terms(%L, 1000, 1, %L)', tests.id('bob_past'), 'nearest'),
  'P0001', 'income_ended', 'R-INCOME-012: nor edited from now');
select throws_ok(format('select public.set_primary_income(%L)', tests.id('bob_past')),
  'P0001', 'income_ended', 'R-INCOME-008 R-INCOME-017: nor made primary (only an income in force now can be)');

-- ---------------------------------------------------------------------------
-- Explicit corrections of the past
-- ---------------------------------------------------------------------------
select tests.remember('typo', public.add_income(tests.id('b'), 'Typo', 9000000, 25, 'nearest', null, tests.id('p1')));
select lives_ok(
  format('select public.update_income_terms(%L, 90000, 25, %L, %L)', tests.id('typo'), 'nearest', tests.id('p1')),
  'R-VERSION-010: a back-dated typo is corrected from the period it started in'
);
select results_eq(
  format('select effective_from_seq, amount from public.income_versions where income_id = %L', tests.id('typo')),
  $$values (1, 90000::bigint)$$,
  'R-VERSION-010: every period now reads the corrected amount'
);
select throws_ok(
  format('select public.update_income_terms(%L, 1000, 1, %L, %L)', tests.id('bob_now'), 'nearest', tests.id('p4')),
  'P0001', 'invalid_period',
  'R-VERSION-010: a correction cannot start before the income does'
);
select is(public.remove_income(tests.id('typo'), tests.id('p1')), 'deleted',
  'R-INCOME-015: removing an income from the period it started in deletes it');
select results_eq(
  format('select seq, income_total from pg_temp.totals(%L) where seq in (1, 8)', tests.id('b')),
  $$values (1, 500000::bigint), (8, 600000::bigint)$$,
  'R-INCOME-015: and it is gone from every period'
);
select tests.remember('side', public.add_income(tests.id('b'), 'Side job', 30000, 1, 'nearest', null, tests.id('p4')));
select is(public.remove_income(tests.id('side'), tests.id('p8')), 'ended',
  'R-INCOME-015: removing it from a later past period ends it there');
select results_eq(
  format('select seq, income_total from pg_temp.totals(%L) where seq in (7, 8)', tests.id('b')),
  $$values (7, 630000::bigint), (8, 600000::bigint)$$,
  'R-INCOME-015: it counts up to the period before'
);
select lives_ok(
  format('select public.update_income_terms(%L, 40000, 1, %L, %L)', tests.id('side'), 'nearest', tests.id('p4')),
  'R-VERSION-010: an ended income''s past can still be corrected'
);
select is(
  (select income_total from public.period_summaries where budget_id = tests.id('b') and seq = 7),
  640000::bigint,
  'R-VERSION-010: the correction applies to the periods it counted in'
);

-- ---------------------------------------------------------------------------
-- A correction from period K applies until the next change only (finding 3)
-- ---------------------------------------------------------------------------
select tests.remember('m7', public.create_budget('M7', 'Salary', 500000, 25, 'nearest', '2026-07-01'));
select tests.remember('m7_primary', (select primary_income_id from public.budgets where id = tests.id('m7')));
select public.update_income_terms(tests.id('m7_primary'), 510000, 25, 'nearest',
  (select id from public.periods where budget_id = tests.id('m7') and seq = 2));
select public.update_income_terms(tests.id('m7_primary'), 520000, 25, 'nearest');  -- now: period 4
select public.update_income_terms(tests.id('m7_primary'), 505000, 25, 'nearest',
  (select id from public.periods where budget_id = tests.id('m7') and seq = 1));
select results_eq(
  format('select * from pg_temp.totals(%L)', tests.id('m7')),
  $$values (1, 505000::bigint), (2, 510000::bigint), (3, 510000::bigint), (4, 520000::bigint)$$,
  'R-VERSION-012: correcting period 1 leaves the later changes (periods 2 and 4) alone'
);

-- ---------------------------------------------------------------------------
-- An edit made in a period that is then merged back is in force now (M6)
-- ---------------------------------------------------------------------------
select tests.remember('m6', public.create_budget('M6', 'Salary', 500000, 25));  -- October's period
select tests.clear_authentication();
select tests.set_today('2026-11-25');
select tests.authenticate_as('alice');
select public.ensure_periods(tests.id('m6'));                                    -- the 25 Nov period starts
select tests.remember('m6_primary', (select primary_income_id from public.budgets where id = tests.id('m6')));
select public.update_income_terms(tests.id('m6_primary'), 600000, 25, 'nearest');  -- keyed to period 2
select tests.clear_authentication();
select tests.set_today('2026-11-26');
select tests.authenticate_as('alice');
select public.reopen_previous_period(tests.id('m6'));                            -- the salary is late
select results_eq(
  format('select amount, terms_from_seq from public.income_overview where id = %L', tests.id('m6_primary')),
  $$values (600000::bigint, 1)$$,
  'R-VERSION-011: the edit made in the merged period is re-keyed to the reopened one and in force now'
);
select public.update_income_terms(tests.id('m6_primary'), 700000, 25, 'nearest');
select results_eq(
  format('select effective_from_seq, amount from public.income_versions where income_id = %L order by 1', tests.id('m6_primary')),
  $$values (1, 700000::bigint)$$,
  'R-VERSION-006 R-VERSION-011: a new edit now replaces it: one version per period, nothing beyond the latest'
);
select tests.clear_authentication();
select tests.set_today('2026-11-27');
select tests.authenticate_as('alice');
select public.record_early_pay_date(tests.id('m6'), '2026-11-27');
select results_eq(
  format('select * from pg_temp.totals(%L)', tests.id('m6')),
  $$values (1, 700000::bigint), (2, 700000::bigint)$$,
  'R-VERSION-011: when the salary arrives, the next period reads the edit just saved'
);

-- ---------------------------------------------------------------------------
-- The next period reads the latest version; an edit then does not touch period 10
-- ---------------------------------------------------------------------------
select tests.clear_authentication();
select tests.set_today('2026-12-10');
select tests.authenticate_as('alice');
select is(public.ensure_periods(tests.id('b')), 1, 'R-PERIOD-009: December starts period 11 (November''s)');
select lives_ok(
  format('select public.update_income_terms(%L, 700000, 25, %L)', tests.id('primary'), 'nearest'),
  'R-VERSION-001: editing the primary in period 11'
);
select results_eq(
  format('select * from pg_temp.totals(%L) where seq >= 9', tests.id('b')),
  $$values (9, 600000::bigint), (10, 850000::bigint), (11, 900000::bigint)$$,
  'R-VERSION-001 R-VERSION-005: creates a version from period 11 only'
);
select is(
  (select count(*)::integer from public.income_versions where income_id = tests.id('primary')),
  3,
  'R-VERSION-006: one version per period with an edit'
);

-- ---------------------------------------------------------------------------
-- Validation and bounds
-- ---------------------------------------------------------------------------
select throws_ok(format('select public.update_income_terms(%L, 0, 25, %L)', tests.id('primary'), 'nearest'),
  'P0001', 'invalid_amount', 'R-INCOME-014: an amount of 0 is rejected');
select throws_ok(format('select public.update_income_terms(%L, 1000000001, 25, %L)', tests.id('primary'), 'nearest'),
  'P0001', 'invalid_amount', 'R-INCOME-014: an amount above CHF 10 million is rejected');
select lives_ok(format('select public.update_income_terms(%L, 1000000000, 25, %L)', tests.id('primary'), 'nearest'),
  'R-INCOME-014: CHF 10 million is accepted');
select throws_ok(format('select public.update_income_terms(%L, 1000, 0, %L)', tests.id('primary'), 'nearest'),
  'P0001', 'invalid_pay_day', 'R-INCOME-004: a pay day of 0 is rejected');
select throws_ok(format('select public.update_income_terms(%L, 1000, 25, null)', tests.id('primary')),
  'P0001', 'invalid_weekend_rule', 'R-PAYDATE-007: a missing weekend rule is rejected');
select throws_ok(format('select public.add_income(%L, %L, 1000, 25)', tests.id('b'), '   '),
  'P0001', 'invalid_name', 'R-INCOME-004: a blank name is rejected');
select throws_ok(
  format('update public.incomes set name = %L where id = %L', ' padded ', tests.id('primary')),
  '23514', null, 'R-MEMBER-001: a direct rename must be trimmed'
);
select lives_ok(
  format('update public.incomes set name = %L where id = %L', 'Alice main job', tests.id('primary')),
  'R-MEMBER-001: a member renames an income directly'
);

-- Limits: 50 incomes in force; ended ones do not count, but there are at most 500 rows.
select lives_ok(
  format($q$do $d$ begin for i in 1..(50 - (select count(*) from public.incomes where budget_id = %L and end_seq is null)) loop
           perform public.add_income(%L, 'Filler ' || i, 100, 1, 'nearest', null, %L); end loop; end $d$$q$,
         tests.id('b'), tests.id('b'), tests.id('p1')),
  'R-INCOME-013: filling the budget up to 50 incomes in force'
);
select throws_ok(format('select public.add_income(%L, %L, 100, 1)', tests.id('b'), 'One too many'),
  'P0001', 'income_limit_reached', 'R-INCOME-013: the 51st income in force is rejected');
select lives_ok(
  format($q$do $d$ declare r record; begin
           for r in select id from public.incomes where budget_id = %L and name like 'Filler %%' loop
             perform public.remove_income(r.id); end loop; end $d$$q$, tests.id('b')),
  'R-INCOME-013: ending the fillers'
);
select lives_ok(format('select public.add_income(%L, %L, 400000, 25)', tests.id('b'), 'Partner'),
  'R-INCOME-013: ended incomes do not count against the limit');
select tests.clear_authentication();
insert into public.incomes (budget_id, name, first_seq, end_seq)
select tests.id('b'), 'Old ' || g, 1, 2
from generate_series(1, 500 - (select count(*) from public.incomes where budget_id = tests.id('b'))) as g;
insert into public.income_versions (income_id, budget_id, effective_from_seq, amount, pay_day)
select id, budget_id, 1, 1, 1 from public.incomes where budget_id = tests.id('b') and name like 'Old %';
select tests.authenticate_as('alice');
select throws_ok(format('select public.add_income(%L, %L, 100, 1)', tests.id('b'), 'Row 501'),
  'P0001', 'income_limit_reached', 'R-INCOME-016: a budget holds at most 500 income rows, ended ones included');

select tests.clear_authentication();
select lives_ok('set constraints all immediate', 'R-INCOME-001 R-INCOME-006: all income invariants hold');
set constraints all deferred;

-- Direct violations by a privileged role.
delete from public.income_versions where income_id = tests.id('bob_now');
select throws_ok('set constraints all immediate', '23514', 'income_needs_version',
  'R-INCOME-004: an income without terms for its first period is rejected');
set constraints all deferred;

select * from finish();
rollback;
