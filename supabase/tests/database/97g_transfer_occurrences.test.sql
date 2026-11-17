-- Step 7, the occurrence model (D-420 to D-430): occurrences keyed by date, not by period; the
-- calendar schedule of a fixed-day transfer (monthly, quarterly, yearly), one occurrence per
-- pay date of a pay-date transfer keyed by its scheduled pay date; the catch-up's watermark by
-- due date and its look at the plan after every change; a member's mark never going silently;
-- one undo out of every state; the monthly share; the bounded catch-up step. The reviewer's
-- reproductions (M2, M3, R6, R7, the Q-224 cases) are here with what the bank did as expected.
begin;
select plan(154);

select tests.create_user('gina', 'Gina');
select tests.create_user('hugo', 'Hugo');
select tests.create_user('gina2', 'Gina too');
select tests.set_today('2026-11-16');
select tests.authenticate_as('gina');

-- A budget paid on the 25th, no weekend rule: periods 25 Sep to 24 Oct, 25 Oct to 24 Nov (current).
create function pg_temp.day(d date) returns void language plpgsql as $$
begin
  perform tests.clear_authentication();
  perform tests.set_today(d);
  perform tests.authenticate_as(coalesce(nullif(current_setting('test.actor', true), ''), 'gina'));
end $$;
create function pg_temp.budget(n text) returns void language plpgsql as $$
declare
  b uuid;
  p1 uuid;
begin
  perform pg_temp.day('2026-11-16');
  b := public.create_budget('Budget ' || n, 'Salary', 600000, 25, 'none', '2026-09-01');
  p1 := (select id from public.periods where budget_id = b and seq = 1);
  perform tests.remember(n, b);
  perform tests.remember(n || '_p1', p1);
  perform tests.remember(n || '_p2', (select id from public.periods where budget_id = b and seq = 2));
  perform tests.remember(n || '_main', (select id from public.create_account(b, 'Main', 'current', p_from_period_id => p1)));
  perform tests.remember(n || '_sav', (select id from public.create_account(b, 'Savings', 'savings', p_from_period_id => p1)));
  perform tests.remember(n || '_cat', (select id from public.create_category(b, 'Saving', p_amount => 100000, p_from_period_id => p1)));
end $$;
-- a transfer's transactions: the occurrence they belong to (a dated one by its date; a period's own
-- one has none, its number is transfer_occurrence_seq), date and amount
create function pg_temp.txs(t uuid) returns table (occurrence_date date, date date, amount bigint) language sql as $$
  select x.transfer_occurrence_date, x.date, x.amount from public.transaction_list as x where x.transfer_id = t order by x.date, x.id
$$;
create function pg_temp.period_at(b uuid, d date) returns uuid language sql as $$
  select id from public.periods where budget_id = b and d between start_date and end_date
$$;

-- ===========================================================================
-- M2: a reopen and the salary recorded again leave one transaction for that payday
-- (R-ACCOUNT-302, R-ACCOUNT-306, D-421, D-430)
-- ===========================================================================
select pg_temp.budget('m2');
select pg_temp.day('2026-11-26');
select public.ensure_periods(tests.id('m2'));
select tests.remember('m2_p3', pg_temp.period_at(tests.id('m2'), '2026-11-26'));
select tests.remember('m2_t', (select id from public.create_transfer(tests.id('m2'), 'New standing order', tests.id('m2_main'),
  tests.id('m2_sav'), 10000, 'pay_date', p_is_automatic => true, p_category_id => tests.id('m2_cat'), p_from_period_id => tests.this_period(tests.id('m2')))));
select results_eq(format($$select * from pg_temp.txs(%L)$$, tests.id('m2_t')),
  $$values (null::date, '2026-11-25'::date, 10000::bigint)$$,
  'R-ACCOUNT-302: (setup) created on the 26th, its period''s own occurrence (the salary of the 25th) has its transaction');
select is((select starts_on from public.transfers where id = tests.id('m2_t')), '2026-11-25'::date,
  'R-ACCOUNT-302: a transfer counts from the start of the period it is created in (starts_on)');
select results_eq(
  format($$select change, count(*)::integer from public.preview_reopen(%L) where record_kind = 'transfer' group by change order by change$$, tests.id('m2')),
  $$values ('added', 1), ('transaction_removed', 1)$$,
  'R-ACCOUNT-303: the reopen preview says the catch-up''s transaction of that payday goes');
select lives_ok(format($$select * from public.reopen_previous_period(%L, %L, %s)$$, tests.id('m2'), tests.id('m2_p3'),
                       (select revision from public.periods where id = tests.id('m2_p3'))),
  'R-ACCOUNT-306: the salary of the 25th has not arrived: reopen');
select is((select count(*)::integer from pg_temp.txs(tests.id('m2_t'))), 0,
  'R-ACCOUNT-302: no transaction while that salary has not come');
select is((select count(*)::integer from public.get_transfer_checklist(tests.id('m2_p2')) where transfer_id = tests.id('m2_t')), 0,
  'R-ACCOUNT-302: the reopened period has no occurrence of it: its own payday (25 October) is before the transfer counts');
select pg_temp.day('2026-11-28');
select lives_ok(format($$select * from public.record_early_pay_date(%L, %L, %s, '2026-11-28')$$, tests.id('m2'), tests.id('m2_p2'),
                       (select revision from public.periods where id = tests.id('m2_p2'))),
  'R-ACCOUNT-302: the salary arrives on the 28th');
select results_eq(format($$select * from pg_temp.txs(%L)$$, tests.id('m2_t')),
  $$values (null::date, '2026-11-28'::date, 10000::bigint)$$,
  'R-ACCOUNT-302: one expense for one standing order (the reviewer''s M2: two), the period''s own, dated the day the salary came');
select results_eq(
  format($$select occurrence_seq, due_date, status from public.get_transfer_checklist(%L) where transfer_id = %L$$,
         pg_temp.period_at(tests.id('m2'), '2026-11-28'), tests.id('m2_t')),
  $$values (3, '2026-11-28'::date, 'done')$$,
  'R-ACCOUNT-302: the checklist shows the period''s number and the due date (the actual pay date plus the offset)');
select is_empty(format($$select * from tests.moneyflow_violations(%L)$$, tests.id('m2')), 'R-ACCOUNT-302: the invariants hold');
-- once more, the salary recorded on another, earlier day
select lives_ok(format($$select * from public.reopen_previous_period(%L, %L, %s)$$, tests.id('m2'),
                       pg_temp.period_at(tests.id('m2'), '2026-11-28'),
                       (select revision from public.periods where id = pg_temp.period_at(tests.id('m2'), '2026-11-28'))),
  'R-ACCOUNT-306: (reopened again)');
select lives_ok(format($$select * from public.record_early_pay_date(%L, %L, %s, '2026-11-24')$$, tests.id('m2'), tests.id('m2_p2'),
                       (select revision from public.periods where id = tests.id('m2_p2'))),
  'R-ACCOUNT-302: (the salary recorded on the 24th instead)');
select results_eq(format($$select * from pg_temp.txs(%L)$$, tests.id('m2_t')),
  $$values (null::date, '2026-11-24'::date, 10000::bigint)$$,
  'R-ACCOUNT-302: still one, dated the day the salary came');

-- a member's done on that payday survives the reopen as the same occurrence
select tests.remember('m2_manual', (select id from public.create_transfer(tests.id('m2'), 'By hand', tests.id('m2_main'),
  tests.id('m2_sav'), 5000, 'pay_date', p_offset_days => 1, p_category_id => tests.id('m2_cat'), p_from_period_id => tests.this_period(tests.id('m2')))));
select tests.remember('m2_p3c', pg_temp.period_at(tests.id('m2'), '2026-11-28'));
select tests.remember('m2_mtx', (select transaction_id from public.mark_transfer_done(tests.id('m2_manual'), tests.id('m2_p3c'), 0)));
select lives_ok(format($$select * from public.reopen_previous_period(%L, %L, %s)$$, tests.id('m2'), tests.id('m2_p3c'),
                       (select revision from public.periods where id = tests.id('m2_p3c'))),
  'R-ACCOUNT-306: (reopened with a member''s mark on the payday)');
select results_eq(
  format($$select occurrence_seq, status, planned, transaction_id from public.get_transfer_checklist(%L) where transfer_id = %L$$,
         tests.id('m2_p2'), tests.id('m2_manual')),
  format($$values (3, 'done', false, %L::uuid)$$, tests.id('m2_mtx')),
  'R-ACCOUNT-301: a member''s mark never goes silently: kept with its transaction, listed by its date, flagged');
select lives_ok(format($$select * from public.record_early_pay_date(%L, %L, %s, '2026-11-28')$$, tests.id('m2'), tests.id('m2_p2'),
                       (select revision from public.periods where id = tests.id('m2_p2'))),
  'R-ACCOUNT-302: (recorded again)');
select results_eq(
  format($$select occurrence_seq, status, planned, transaction_id from public.get_transfer_checklist(%L) where transfer_id = %L$$,
         pg_temp.period_at(tests.id('m2'), '2026-11-28'), tests.id('m2_manual')),
  format($$values (3, 'done', true, %L::uuid)$$, tests.id('m2_mtx')),
  'R-ACCOUNT-301: and is the same occurrence again, with its transaction');

-- ===========================================================================
-- M3, R6 and Q-224: the calendar, never capped into a short period (R-ACCOUNT-300, D-422)
-- ===========================================================================
select pg_temp.budget('m3');
select tests.remember('m3_t', (select id from public.create_transfer(tests.id('m3'), 'On the 22nd', tests.id('m3_main'),
  tests.id('m3_sav'), 20000, 'day_of_month', p_day_of_month => 22, p_is_automatic => true, p_category_id => tests.id('m3_cat'), p_from_period_id => tests.this_period(tests.id('m3')))));
select pg_temp.day('2026-11-20');
select lives_ok(format($$select * from public.record_early_pay_date(%L, %L, %s, '2026-11-20')$$, tests.id('m3'), tests.id('m3_p2'),
                       (select revision from public.periods where id = tests.id('m3_p2'))),
  'R-ACCOUNT-300: (the salary comes early, on 20 November)');
select tests.remember('m3_p3', pg_temp.period_at(tests.id('m3'), '2026-11-20'));
select is((select count(*)::integer from public.get_transfer_checklist(tests.id('m3_p2')) where transfer_id = tests.id('m3_t')), 0,
  'R-ACCOUNT-300: the short period (25 October to 19 November) has no 22nd: no occurrence (the reviewer''s M3: one on its last day)');
select results_eq(
  format($$select occurrence_date from public.get_transfer_checklist(%L) where transfer_id = %L$$, tests.id('m3_p3'), tests.id('m3_t')),
  $$values ('2026-11-22'::date), ('2026-12-22'::date)$$,
  'R-ACCOUNT-300: the long period that follows has two (22 November and 22 December), as the bank does');
select pg_temp.day('2026-12-23');
select public.ensure_periods(tests.id('m3'));
select results_eq(format($$select date from pg_temp.txs(%L)$$, tests.id('m3_t')),
  $$values ('2026-11-22'::date), ('2026-12-22'::date)$$,
  'R-ACCOUNT-300: the transactions are the bank''s (the reviewer''s M3: 19 November and 22 November, never 22 December)');
select throws_ok(format($$select * from public.skip_transfer(%L, %L, 0)$$, tests.id('m3_t'), tests.id('m3_p3')),
  'P0001', 'occurrence_required', 'R-ACCOUNT-301: a mark names the occurrence when its period has several');
select results_eq(
  format($$select occurrence_date, status, transaction_id from public.mark_transfer_not_done(%L, %L, 1, '2026-12-22')$$,
         tests.id('m3_t'), tests.id('m3_p3')),
  $$values ('2026-12-22'::date, 'not_done', null::uuid)$$,
  'R-ACCOUNT-301: p_occurrence_date picks it');
select throws_ok(format($$select * from public.undo_transfer_mark(%L, %L, 1, '2026-12-05')$$, tests.id('m3_t'), tests.id('m3_p3')),
  'P0001', 'transfer_not_in_force', 'R-ACCOUNT-301: a date that is no occurrence of the period is refused');
select is_empty(format($$select * from tests.moneyflow_violations(%L)$$, tests.id('m3')), 'R-ACCOUNT-300: the invariants hold');

-- R6: the salary of 21 November recorded on the 23rd: one transaction dated 22 November
select pg_temp.budget('r6');
select pg_temp.day('2026-11-23');
select tests.remember('r6_t', (select id from public.create_transfer(tests.id('r6'), 'On the 22nd', tests.id('r6_main'), tests.id('r6_sav'),
  100000, 'day_of_month', p_day_of_month => 22, p_is_automatic => true, p_category_id => tests.id('r6_cat'), p_from_period_id => tests.id('r6_p1'))));
select lives_ok(format($$select * from public.record_early_pay_date(%L, %L, %s, '2026-11-21')$$, tests.id('r6'), tests.id('r6_p2'),
                       (select revision from public.periods where id = tests.id('r6_p2'))),
  'R-ACCOUNT-300: (the salary of 21 November, recorded on the 23rd)');
select results_eq(format($$select occurrence_date, date from pg_temp.txs(%L)$$, tests.id('r6_t')),
  $$values ('2026-10-22'::date, '2026-10-22'::date), ('2026-11-22'::date, '2026-11-22'::date)$$,
  'R-ACCOUNT-300: the 22nd now lies in the new period: the same occurrence, the same one transaction (the reviewer''s R6: two)');

-- Q-224 with a chosen income: a 9-day period without the partner's salary has no occurrence; an
-- 87-day period with three of them has three
select pg_temp.budget('q');
select tests.remember('q_partner', public.add_income(tests.id('q'), 'Partner', 300000, 10, 'none', null, tests.id('q_p1')));
select tests.remember('q_t', (select id from public.create_transfer(tests.id('q'), 'After the partner''s pay', tests.id('q_sav'),
  tests.id('q_main'), 30000, 'pay_date', 2, null, tests.id('q_partner'), false, null, tests.id('q_p1'))));
select lives_ok(format($$select * from public.record_early_pay_date(%L, %L, %s, '2026-11-03')$$, tests.id('q'), tests.id('q_p2'),
                       (select revision from public.periods where id = tests.id('q_p2'))),
  'R-ACCOUNT-301: (a period 25 October to 2 November: no partner salary in it)');
select is((select count(*)::integer from public.get_transfer_checklist(tests.id('q_p2')) where transfer_id = tests.id('q_t')), 0,
  'R-ACCOUNT-301: no partner pay date in the period: no occurrence (the reviewer: one, on its last day)');
select tests.remember('q_p3', pg_temp.period_at(tests.id('q'), '2026-11-03'));
select results_eq(
  format($$select occurrence_date, due_date from public.get_transfer_checklist(%L) where transfer_id = %L$$, tests.id('q_p3'), tests.id('q_t')),
  $$values ('2026-11-10'::date, '2026-11-12'::date)$$,
  'R-ACCOUNT-301: one per pay date of the chosen income in the period, due that day plus the offset');
select lives_ok(format($$select * from public.set_expected_pay_date(%L, %L, %s, '2027-01-29')$$, tests.id('q'), tests.id('q_p3'),
                       (select revision from public.periods where id = tests.id('q_p3'))),
  'R-ACCOUNT-301: (the next salary is expected on 29 January: an 87-day period)');
select results_eq(
  format($$select occurrence_date from public.get_transfer_checklist(%L) where transfer_id = %L$$, tests.id('q_p3'), tests.id('q_t')),
  $$values ('2026-11-10'::date), ('2026-12-10'::date), ('2027-01-10'::date)$$,
  'R-ACCOUNT-301: three partner salaries, three occurrences (the reviewer: one)');

-- ===========================================================================
-- Quarterly and yearly transfers, the monthly share (R-ACCOUNT-300, R-ACCOUNT-304, D-425)
-- ===========================================================================
select pg_temp.budget('y');
select tests.remember('y_t', (select id from public.create_transfer(tests.id('y'), 'Third pillar', tests.id('y_main'), tests.id('y_sav'),
  705600, 'day_of_month', p_category_id => tests.id('y_cat'), p_cadence => 'yearly', p_first_date => '2026-12-20')));
select results_eq(
  format($$select amount, cadence::text, first_date, day_of_month, monthly_amount, next_due_date from public.transfer_overview where id = %L$$,
         tests.id('y_t')),
  $$values (705600::bigint, 'yearly', '2026-12-20'::date, 20, 58800::bigint, '2026-12-20'::date)$$,
  'R-ACCOUNT-304: a yearly transfer: its real amount and cadence, and its monthly share (half up, as a subscription''s)');
select results_eq(
  format($$select occurrence_date, projected from public.preview_update_transfer(%L, p_count => 3)$$, tests.id('y_t')),
  $$values ('2026-12-20'::date, true), ('2027-12-20'::date, true), ('2028-12-20'::date, true)$$,
  'R-ACCOUNT-300: one occurrence a year (the preview walks the projected periods)');
select is((select transfer_committed_total from public.period_summaries where id = tests.id('y_p2')), 58800::bigint,
  'R-ACCOUNT-304: committed at its monthly share in every period it is in force');
select results_eq(
  format($$select amount, planned_amount, cadence::text from public.get_money_flow(%L) where id = %L$$, tests.id('y'), tests.id('y_t')),
  $$values (58800::bigint, 705600::bigint, 'yearly')$$,
  'R-ACCOUNT-304: the money flow carries the monthly share, with the real amount and cadence beside it');
select is((select count(*)::integer from public.get_transfer_checklist(tests.id('y_p2')) where transfer_id = tests.id('y_t')), 0,
  'R-ACCOUNT-300: no occurrence in a period without its date');
select tests.remember('y_q', (select id from public.create_transfer(tests.id('y'), 'Quarterly', tests.id('y_main'), tests.id('y_sav'),
  100001, 'day_of_month', p_cadence => 'quarterly', p_first_date => '2026-08-31')));
select results_eq(
  format($$select monthly_amount, day_of_month from public.transfer_overview where id = %L$$, tests.id('y_q')),
  $$values (33334::bigint, 31)$$,
  'R-ACCOUNT-304: a quarterly one: a third, half up; its day the first date''s');
select results_eq(
  format($$select occurrence_date from public.preview_update_transfer(%L, p_count => 3)$$, tests.id('y_q')),
  $$values ('2026-11-30'::date), ('2027-02-28'::date), ('2027-05-31'::date)$$,
  'R-ACCOUNT-300: every three months from the first date''s month, on its day clamped to the month (31: 30 November, 28 February)');
select throws_ok(format($$select * from public.create_transfer(%L, 'X', %L, %L, 1, 'day_of_month', p_cadence => 'half_yearly', p_first_date => '2026-12-01')$$,
                        tests.id('y'), tests.id('y_main'), tests.id('y_sav')),
  'P0001', 'invalid_cadence', 'R-ACCOUNT-300: monthly, quarterly or yearly');
select throws_ok(format($$select * from public.create_transfer(%L, 'X', %L, %L, 1, 'day_of_month', p_day_of_month => 30, p_first_date => '2026-12-01')$$,
                        tests.id('y'), tests.id('y_main'), tests.id('y_sav')),
  'P0001', 'invalid_first_date', 'R-ACCOUNT-300: the first date falls on the day given');
select throws_ok(format($$select * from public.create_transfer(%L, 'X', %L, %L, 1, 'pay_date', p_cadence => 'yearly')$$,
                        tests.id('y'), tests.id('y_main'), tests.id('y_sav')),
  'P0001', 'invalid_schedule', 'R-ACCOUNT-300: a pay-date transfer takes no cadence');
select throws_ok(format($$select * from public.create_transfer(%L, 'X', %L, %L, 1, 'day_of_month', p_first_date => '2040-01-01')$$,
                        tests.id('y'), tests.id('y_main'), tests.id('y_sav')),
  'P0001', 'invalid_first_date', 'R-ACCOUNT-300: at most ten years ahead');
-- switching a chosen-income transfer to a fixed day
select tests.remember('y_inc', public.add_income(tests.id('y'), 'Bonus', 100000, 15, 'none', null, tests.id('y_p1')));
select tests.remember('y_c', (select id from public.create_transfer(tests.id('y'), 'Chosen', tests.id('y_main'), tests.id('y_sav'),
  1000, 'pay_date', 0, null, tests.id('y_inc'), p_from_period_id => tests.this_period(tests.id('y')))));
select results_eq(
  format($$select schedule::text, income_id, offset_days, day_of_month, cadence::text, first_date
           from public.update_transfer(%L, 1, p_schedule => 'day_of_month', p_day_of_month => 3)$$, tests.id('y_c')),
  $$values ('day_of_month', null::uuid, null::integer, 3, 'monthly', '2026-11-03'::date)$$,
  'R-ACCOUNT-300: a chosen-income transfer switched to a fixed day drops the income and the offset, monthly from its period');

-- ===========================================================================
-- One undo out of every state; what is recorded stays (R-ACCOUNT-301, R-ACCOUNT-305, D-424, D-429)
-- ===========================================================================
select pg_temp.budget('d');
select tests.remember('d_t', (select id from public.create_transfer(tests.id('d'), 'Standing order', tests.id('d_main'), tests.id('d_sav'),
  100000, 'day_of_month', p_day_of_month => 1, p_is_automatic => true, p_category_id => tests.id('d_cat'), p_from_period_id => tests.id('d_p1'))));
select is((select count(*)::integer from pg_temp.txs(tests.id('d_t'))), 2, 'R-ACCOUNT-074: (setup: 1 October and 1 November)');
select lives_ok(format($$select * from public.update_transfer(%L, 1, p_is_automatic => false, p_from_period_id => %L)$$, tests.id('d_t'), tests.id('d_p1')),
  'R-ACCOUNT-305: made manual by a correction over every period');
select results_eq(
  format($$select p.seq, c.status, c.assumed, c.transaction_id is not null from public.periods as p
           cross join lateral public.get_transfer_checklist(p.id) as c where p.budget_id = %L and c.transfer_id = %L order by p.seq$$,
         tests.id('d'), tests.id('d_t')),
  $$values (1, 'done', true, true), (2, 'done', true, true)$$,
  'R-ACCOUNT-305: what the catch-up recorded on the due dates stays (a manual occurrence done, with its transaction)');
select throws_ok(format($$select * from public.mark_transfer_not_done(%L, %L, 1)$$, tests.id('d_t'), tests.id('d_p2')),
  'P0001', 'transfer_is_manual', 'R-ACCOUNT-004: not done is for an automatic occurrence');
select throws_ok(format($$select * from public.skip_transfer(%L, %L, 1)$$, tests.id('d_t'), tests.id('d_p2')),
  'P0001', 'transfer_already_marked', 'R-ACCOUNT-005: done, so undo it first');
select results_eq(
  format($$select status, transaction_id, mark_revision from public.undo_transfer_mark(%L, %L, 1)$$, tests.id('d_t'), tests.id('d_p2')),
  $$values ('to_do', null::uuid, 0)$$,
  'R-ACCOUNT-301: undo leads out: to do for the terms now in force, its transaction deleted (the reviewer: nothing_to_undo)');
select is((select status from public.skip_transfer(tests.id('d_t'), tests.id('d_p2'), 0)), 'skipped', 'R-ACCOUNT-005: (skipped)');
select lives_ok(format($$select * from public.update_transfer(%L, 2, p_is_automatic => true, p_from_period_id => %L)$$, tests.id('d_t'), tests.id('d_p2')),
  'R-ACCOUNT-305: made automatic again');
select results_eq(
  format($$select status, is_automatic from public.get_transfer_checklist(%L) where transfer_id = %L$$, tests.id('d_p2'), tests.id('d_t')),
  $$values ('skipped', true)$$,
  'R-ACCOUNT-305: a member''s skip stays when the transfer is made automatic');
select throws_ok(format($$select * from public.skip_transfer(%L, %L, 1)$$, tests.id('d_t'), tests.id('d_p2')),
  'P0001', 'transfer_is_automatic', 'R-ACCOUNT-004: an automatic transfer is not skipped');
select throws_ok(format($$select * from public.mark_transfer_not_done(%L, %L, 1)$$, tests.id('d_t'), tests.id('d_p2')),
  'P0001', 'transfer_already_marked', 'R-ACCOUNT-004: not done after a member''s mark: undo it first');
select results_eq(
  format($$select status, transaction_id is not null, assumed from public.undo_transfer_mark(%L, %L, 1)$$, tests.id('d_t'), tests.id('d_p2')),
  $$values ('done', true, true)$$,
  'R-ACCOUNT-301: undone, the automatic occurrence is assumed done, its transaction made within the call');
select throws_ok(format($$select * from public.undo_transfer_mark(%L, %L, 1)$$, tests.id('d_t'), tests.id('d_p2')),
  'P0001', 'nothing_to_undo', 'R-ACCOUNT-301: the catch-up''s transaction is the unmarked state: mark it not done instead');
select throws_ok(format($$select * from public.undo_transfer_mark(%L, %L, null)$$, tests.id('d_t'), tests.id('d_p2')),
  'P0001', 'invalid_revision', 'R-CONCURRENCY-230: a mark call names the revision it read');
select throws_ok(format($$select * from public.mark_transfer_not_done(%L, %L, 0)$$, tests.id('d_t'), tests.id('d_p2')),
  'P0001', 'record_changed', 'R-CONCURRENCY-230: and an older one is refused');
-- an amount edited after the due date leaves that period's transaction as it was
select lives_ok(format($$select * from public.update_transfer(%L, 3, p_amount => 120000)$$, tests.id('d_t')),
  'R-ACCOUNT-305: (the amount edited from the current period, after its due date)');
select results_eq(
  format($$select c.amount, x.amount from public.get_transfer_checklist(%L) as c join public.transactions as x on x.id = c.transaction_id
           where c.transfer_id = %L$$, tests.id('d_p2'), tests.id('d_t')),
  $$values (120000::bigint, 100000::bigint)$$,
  'R-ACCOUNT-305: an amount edited on or after the due date does not change that period''s transaction');
-- the day moves: the catch-up's transaction of the old date goes, the new date gets one; the
-- preview says so, with the counts
select results_eq(
  format($$select occurrence_date, created_at_once, created_at_once_count, transactions_removed_count, marks_unplanned_count
           from public.preview_update_transfer(%L, p_day_of_month => 3, p_count => 1)$$, tests.id('d_t')),
  $$values ('2026-11-03'::date, true, 1, 1, 0)$$,
  'R-ACCOUNT-303: the edit preview counts what goes and what is made');
select lives_ok(format($$select * from public.update_transfer(%L, 4, p_day_of_month => 3)$$, tests.id('d_t')), 'R-ACCOUNT-303: (the edit)');
select results_eq(format($$select occurrence_date, date from pg_temp.txs(%L)$$, tests.id('d_t')),
  $$values ('2026-10-01'::date, '2026-10-01'::date), ('2026-11-03'::date, '2026-11-03'::date)$$,
  'R-ACCOUNT-302: as the preview said');
-- a member's mark on an occurrence the plan no longer has: listed, flagged, undone
select tests.remember('d_m', (select id from public.create_transfer(tests.id('d'), 'By hand', tests.id('d_main'), tests.id('d_sav'),
  500, 'day_of_month', p_day_of_month => 10, p_category_id => tests.id('d_cat'), p_from_period_id => tests.this_period(tests.id('d')))));
select tests.remember('d_mtx', (select transaction_id from public.mark_transfer_done(tests.id('d_m'), tests.id('d_p2'), 0)));
select results_eq(
  format($$select marks_unplanned_count from public.preview_update_transfer(%L, p_day_of_month => 12, p_count => 1)$$, tests.id('d_m')),
  $$values (1)$$,
  'R-ACCOUNT-303: the preview counts the member''s marks whose occurrence goes');
select lives_ok(format($$select * from public.update_transfer(%L, 1, p_day_of_month => 12)$$, tests.id('d_m')), 'R-ACCOUNT-301: (moved to the 12th)');
select results_eq(
  format($$select occurrence_date, status, planned, transaction_id from public.get_transfer_checklist(%L) where transfer_id = %L order by occurrence_date$$,
         tests.id('d_p2'), tests.id('d_m')),
  format($$values ('2026-11-10'::date, 'done', false, %L::uuid), ('2026-11-12'::date, 'to_do', true, null::uuid)$$, tests.id('d_mtx')),
  'R-ACCOUNT-301: the member''s done stays, flagged, beside the new occurrence to do');
select results_eq(
  format($$select count(*)::integer from public.undo_transfer_mark(%L, %L, 1, '2026-11-10')$$, tests.id('d_m'), tests.id('d_p2')),
  $$values (0)$$,
  'R-ACCOUNT-301: undo removes it');
select is((select count(*)::integer from public.transactions where id = tests.id('d_mtx')), 0,
  'R-ACCOUNT-301: with its transaction');
-- a done date before the transfer counts
select throws_ok(format($$select * from public.mark_transfer_done(%L, %L, 0, '2026-10-20')$$, tests.id('d_m'), tests.id('d_p2')),
  'P0001', 'before_transfer_start', 'R-ACCOUNT-305: a done date lies on or after the transfer''s first counted day');
select tests.remember('d_t2', (select id from public.create_transfer(tests.id('d'), 'Past', tests.id('d_main'), tests.id('d_sav'),
  700, 'day_of_month', p_day_of_month => 1, p_from_period_id => tests.id('d_p1'))));
select results_eq(
  format($$select done_on from public.mark_transfer_done(%L, %L, 0)$$, tests.id('d_t2'), tests.id('d_p1')),
  $$values ('2026-10-01'::date)$$,
  'R-ACCOUNT-005: in a past period, done defaults to the due date');

-- ===========================================================================
-- Ending keeps what was recorded; nothing after the end (R-ACCOUNT-234, D-380, D-424)
-- ===========================================================================
select results_eq(
  format($$select outcome, occurrences_removed, marks_kept, transactions_kept from public.preview_end_transfer(%L, %L)$$,
         tests.id('d_t'), tests.id('d_p2')),
  $$values ('ended', 0, 1, 1)$$,
  'R-ACCOUNT-233: the end preview counts the occurrences it removes and the marks and transactions it keeps');
select is(public.end_transfer(tests.id('d_t'), 5, tests.id('d_p2')), 'ended', 'R-ACCOUNT-234: ended from the current period');
select results_eq(
  format($$select status, planned, is_ended, transaction_id is not null from public.get_transfer_checklist(%L) where transfer_id = %L$$,
         tests.id('d_p2'), tests.id('d_t')),
  $$values ('done', false, true, true)$$,
  'R-ACCOUNT-234: the catch-up''s transaction stays, listed as ended');
select pg_temp.day('2026-12-05');
select public.ensure_periods(tests.id('d'));
select is((select count(*)::integer from pg_temp.txs(tests.id('d_t'))), 2, 'R-ACCOUNT-234: nothing is created after the end');
select lives_ok(format($$select * from public.update_transfer(%L, 2, p_amount => 99, p_from_period_id => %L)$$, tests.id('d_m'), tests.id('d_p2')),
  'R-ACCOUNT-302: (a later change of the plan)');
select is((select count(*)::integer from pg_temp.txs(tests.id('d_t'))), 2, 'R-ACCOUNT-234: does not remove what the end kept');
select is_empty(format($$select * from tests.moneyflow_violations(%L)$$, tests.id('d')), 'R-ACCOUNT-301: the invariants hold');
select pg_temp.day('2026-11-16');

-- ===========================================================================
-- A correction from a past period: its own terms, until the next change (R-VERSION-071, Q-221)
-- ===========================================================================
select pg_temp.budget('c');
select tests.remember('c_t', (select id from public.create_transfer(tests.id('c'), 'Corrected', tests.id('c_main'), tests.id('c_sav'),
  1000, 'pay_date', p_from_period_id => tests.id('c_p1'))));
select lives_ok(format($$select * from public.update_transfer(%L, 1, p_amount => 3000)$$, tests.id('c_t')), 'R-VERSION-071: (from now: 3000)');
select results_eq(
  format($$select created_at_once_count, count(*)::integer from public.preview_update_transfer(%L, p_is_automatic => true,
           p_category_id => %L, p_from_period_id => %L, p_count => 60) group by 1$$, tests.id('c_t'), tests.id('c_cat'), tests.id('c_p1')),
  $$values (1, 1)$$,
  'R-ACCOUNT-303: a correction from the first period governs it until the next change: one row, one transaction at once');
-- the write a preview runs is a step of its own: a statement that already used its step's bound
-- of transactions still previews what the write alone does (D-432)
create function pg_temp.preview_after_full_step(p_transfer uuid, p_budget uuid, p_cat uuid, p_from uuid) returns integer
language plpgsql as $f$
declare v integer;
begin
  -- this statement's step has made more transactions than any bound (the key: private.step_key)
  perform set_config('budget_tracker.catch_up_made', statement_timestamp()::text || '/' || p_budget::text || '|1000000', true);
  select max(created_at_once_count) into v from public.preview_update_transfer(p_transfer, p_is_automatic => true,
    p_category_id => p_cat, p_from_period_id => p_from, p_count => 60);
  return v;
end;
$f$;
select is(pg_temp.preview_after_full_step(tests.id('c_t'), tests.id('c'), tests.id('c_cat'), tests.id('c_p1')), 1,
  'R-ACCOUNT-303: the write a preview runs starts its own catch-up step (its bound of transactions afresh)');
-- an amount alone runs no write: the plan as it is at the new amount, as the write would say it
select results_eq(
  format($$select occurrence_date, due_date, amount, is_automatic, created_at_once_count, transactions_removed_count, marks_unplanned_count
           from public.preview_update_transfer(%L, p_amount => 4321, p_count => 12) order by 1$$, tests.id('c_t')),
  format($$select occurrence_date, due_date, amount, is_automatic, created_at_once_count, transactions_removed_count, marks_unplanned_count
           from public.preview_update_transfer(%L, p_amount => 4321, p_is_automatic => false, p_count => 12) order by 1$$, tests.id('c_t')),
  'R-ACCOUNT-303: a preview of an amount alone answers what the write answers');
select is((select bool_and(amount = 4321) and count(*) = 12 from public.preview_update_transfer(tests.id('c_t'), p_amount => 4321, p_count => 12)), true,
  'R-ACCOUNT-303: every occurrence at the new amount');
select throws_ok(format($$select * from public.preview_update_transfer(%L, p_amount => 0)$$, tests.id('c_t')),
  'P0001', 'invalid_amount', 'R-ACCOUNT-303: with the write''s checks of the new terms');
select lives_ok(format($$select * from public.update_transfer(%L, 2, p_is_automatic => true, p_category_id => %L, p_from_period_id => %L)$$,
                       tests.id('c_t'), tests.id('c_cat'), tests.id('c_p1')),
  'Q-221: the correction');
select results_eq(format($$select occurrence_date, amount from pg_temp.txs(%L)$$, tests.id('c_t')),
  $$values (null::date, 1000::bigint)$$,
  'R-VERSION-071: the past period''s transaction takes that period''s terms (1000), not the latest (3000), and only up to the next change');

-- ===========================================================================
-- An income deleted outright (D-426); the dashboard (R-ACCOUNT-241); next due (R-ACCOUNT-002)
-- ===========================================================================
select pg_temp.budget('i');
select tests.remember('i_inc', public.add_income(tests.id('i'), 'Short-lived', 100000, 10, 'none'));
select tests.remember('i_t', (select id from public.create_transfer(tests.id('i'), 'After it', tests.id('i_main'), tests.id('i_sav'),
  1000, 'pay_date', 1, null, tests.id('i_inc'), p_from_period_id => tests.this_period(tests.id('i')))));
select is(public.remove_income(tests.id('i_inc'), 1), 'deleted', 'D-426: (the income added and removed in the same period is deleted)');
select results_eq(
  format($$select income_id, follows_primary from public.transfer_overview where id = %L$$, tests.id('i_t')),
  $$values (null::uuid, true)$$,
  'D-426: the transfer follows the primary income and says so (never silently reset)');
select is((select count(*)::integer from public.get_transfer_checklist(tests.id('i_p2')) where transfer_id = tests.id('i_t')), 0,
  'R-ACCOUNT-427: deleted in this period: the primary''s occurrence of this period (due 26 Oct, past that day) is not planned');
-- a manual pay-date transfer of this period, overdue, for the dashboard below
select tests.remember('i_manual', (select id from public.create_transfer(tests.id('i'), 'Manual', tests.id('i_main'), tests.id('i_sav'),
  1000, 'pay_date', p_from_period_id => tests.this_period(tests.id('i')))));
select tests.remember('i_auto', (select id from public.create_transfer(tests.id('i'), 'Automatic', tests.id('i_main'), tests.id('i_sav'),
  1000, 'day_of_month', p_day_of_month => 1, p_is_automatic => true, p_from_period_id => tests.this_period(tests.id('i')))));
select results_eq(
  format($$select transfers_to_do, transfers_overdue from public.get_transfers_to_do(%L)$$, tests.id('i')),
  $$values (1, 1)$$,
  'R-ACCOUNT-241: the dashboard counts manual occurrences only (the automatic one is not to do)');
select tests.remember('i_today', (select id from public.create_transfer(tests.id('i'), 'Today', tests.id('i_main'), tests.id('i_sav'),
  1000, 'day_of_month', p_day_of_month => 16, p_from_period_id => tests.this_period(tests.id('i')))));
select is((select next_due_date from public.transfer_overview where id = tests.id('i_today')), '2026-11-16'::date,
  'R-ACCOUNT-002: due today is the next due date');
select lives_ok(format($$select * from public.set_budget_end_date(%L, %s, '2026-11-20')$$, tests.id('i'),
                       (select revision from public.budgets where id = tests.id('i'))), 'R-BUDGET-008: (the budget ends this period)');
select is((select next_due_date from public.transfer_overview where id = tests.id('i_auto')), null::date,
  'R-ACCOUNT-002: no next due date after the budget''s end');
select results_eq(
  format($$select count(*)::integer, bool_and(not projected) from public.preview_update_transfer(%L, p_count => 60)$$, tests.id('i_today')),
  $$values (1, true)$$,
  'R-ACCOUNT-233: the preview projects nothing beyond the budget''s end');
select throws_ok(format($$select * from public.preview_update_transfer(%L, p_count => 61)$$, tests.id('i_today')),
  'P0001', 'invalid_limit', 'R-ACCOUNT-233: at most 60 rows');
select throws_ok(format($$select * from public.preview_update_transfer(%L, p_count => 0)$$, tests.id('i_today')),
  'P0001', 'invalid_limit', 'R-ACCOUNT-233: at least one');

-- ===========================================================================
-- The catch-up step is bounded in transactions (R-PERIOD-300, D-427)
-- ===========================================================================
select pg_temp.budget('s');
select tests.remember('s_t', (select id from public.create_transfer(tests.id('s'), 'Weekly-ish', tests.id('s_main'), tests.id('s_sav'),
  100, 'day_of_month', p_day_of_month => 2, p_is_automatic => true, p_category_id => tests.id('s_cat'), p_from_period_id => tests.this_period(tests.id('s')))));
select tests.clear_authentication();
create or replace function private.limit_catch_up_transactions() returns integer language sql immutable set search_path = '' as $f$ select 1 $f$;
select tests.set_today('2027-03-03');
select tests.authenticate_as('gina');
create temp table s_steps (i serial, n integer, caught_up boolean, made integer) on commit drop;
grant all on s_steps to authenticated;
grant all on sequence s_steps_i_seq to authenticated;
create function pg_temp.s_step() returns void language plpgsql as $$
declare
  v integer := public.ensure_periods(tests.id('s'));
begin
  insert into s_steps (n, caught_up, made)
  values (v, (select caught_up from public.my_budgets where id = tests.id('s')),
          (select count(*)::integer from public.transactions where budget_id = tests.id('s')));
end $$;
-- (one statement each: a step is per statement)
select pg_temp.s_step();
select pg_temp.s_step();
select pg_temp.s_step();
select pg_temp.s_step();
select pg_temp.s_step();
select results_eq($$select n > 0, caught_up, made from s_steps order by i$$,
  $$values (true, false, 2), (true, false, 3), (true, false, 4), (false, true, 5), (false, true, 5)$$,
  'R-PERIOD-300: each step makes at most its bound (one here); a step that stops early never answers 0, and 0 means caught up');
select is((select count(distinct occurrence_date)::integer from pg_temp.txs(tests.id('s_t'))), 5,
  'R-PERIOD-300: none twice, none skipped (2 November to 2 March)');
select tests.clear_authentication();
create or replace function private.limit_catch_up_transactions() returns integer language sql immutable set search_path = '' as $f$ select 4000 $f$;
select tests.set_today('2026-11-16');
select tests.authenticate_as('gina');

-- ===========================================================================
-- The previews of income edits, a primary switch and boundary moves count what they do to the
-- transfers (R-ACCOUNT-303, D-428)
-- ===========================================================================
select pg_temp.budget('v');
select tests.remember('v_inc', public.add_income(tests.id('v'), 'Partner', 300000, 10, 'none', null, tests.id('v_p1')));
select tests.remember('v_t', (select id from public.create_transfer(tests.id('v'), 'After the partner', tests.id('v_main'),
  tests.id('v_sav'), 1000, 'pay_date', 0, null, tests.id('v_inc'), true, tests.id('v_cat'), tests.id('v_p1'))));
select results_eq(format($$select occurrence_date from pg_temp.txs(%L)$$, tests.id('v_t')),
  $$values ('2026-10-10'::date), ('2026-11-10'::date)$$, 'R-ACCOUNT-301: (setup: the partner''s pay dates)');
select results_eq(
  format($$select transfer_transactions_removed, transfer_transactions_created, transfer_marks_unplanned
           from public.preview_update_income(%L, p_pay_day => 5)$$, tests.id('v_inc')),
  $$values (1, 1, 0)$$,
  'R-ACCOUNT-303: an income edit''s preview counts the transfers'' transactions its new pay dates remove and create');
select lives_ok(format($$select public.update_income(%L, 1, p_pay_day => 5)$$, tests.id('v_inc')), 'R-ACCOUNT-303: (the edit)');
select results_eq(format($$select occurrence_date from pg_temp.txs(%L)$$, tests.id('v_t')),
  $$values ('2026-10-10'::date), ('2026-11-05'::date)$$,
  'R-ACCOUNT-302: as its preview said (the past period keeps its terms)');
select results_eq(
  format($$select transfer_transactions_removed, transfer_transactions_created, transfer_marks_unplanned
           from public.preview_set_primary_income(%L)$$, tests.id('v_inc')),
  $$values (0, 0, 0)$$,
  'R-ACCOUNT-428: a switch of the primary to the income the transfer chose counts for it from the next period: nothing of this period moves, and the preview says so');
select tests.remember('v_d', (select id from public.create_transfer(tests.id('v'), 'On the 26th', tests.id('v_main'),
  tests.id('v_sav'), 2000, 'day_of_month', p_day_of_month => 26, p_is_automatic => true, p_category_id => tests.id('v_cat'), p_from_period_id => tests.this_period(tests.id('v')))));
select results_eq(
  format($$select accepted, transfer_transactions_removed, transfer_transactions_created from public.preview_move_period_start(%L, '2026-10-27')$$,
         tests.id('v_p2')),
  $$values (true, 1, 0)$$,
  'R-ACCOUNT-303: a boundary move''s preview counts the transaction it removes (26 October falls before the transfer counts)');
select lives_ok(format($$select public.move_period_start(%L, %s, '2026-10-27')$$, tests.id('v_p2'),
                       (select revision from public.periods where id = tests.id('v_p2'))), 'R-ACCOUNT-303: (the move)');
select is((select count(*)::integer from pg_temp.txs(tests.id('v_d'))), 0, 'R-ACCOUNT-302: as its preview said');
select is_empty(format($$select * from tests.moneyflow_violations(%L)$$, tests.id('v')), 'R-ACCOUNT-302: the invariants hold');

-- ===========================================================================
-- Edges: the first counted day, capped pay dates, keys given twice, dues that move, marks
-- that stay, the monthly share of what is in force (R-ACCOUNT-300 to R-ACCOUNT-305, D-421)
-- ===========================================================================
-- (another member's budgets: one owns at most 20)
select set_config('test.actor', 'gina2', false);
-- a fixed day with a first date in the past, created in a period that is then reopened: nothing
-- before its first counted day
select pg_temp.budget('e1');
select pg_temp.day('2026-11-26');
select public.ensure_periods(tests.id('e1'));
select tests.remember('e1_p3', pg_temp.period_at(tests.id('e1'), '2026-11-26'));
select tests.remember('e1_t', (select id from public.create_transfer(tests.id('e1'), 'Monthly', tests.id('e1_main'), tests.id('e1_sav'),
  100, 'day_of_month', p_is_automatic => true, p_category_id => tests.id('e1_cat'), p_first_date => '2026-11-01')));
select lives_ok(format($$select * from public.reopen_previous_period(%L, %L, %s)$$, tests.id('e1'), tests.id('e1_p3'),
                       (select revision from public.periods where id = tests.id('e1_p3'))), 'R-ACCOUNT-306: (reopened)');
select results_eq(
  format($$select occurrence_date, status from public.get_transfer_checklist(%L) where transfer_id = %L$$, tests.id('e1_p2'), tests.id('e1_t')),
  $$values ('2026-12-01'::date, 'upcoming')$$,
  'R-ACCOUNT-305: the reopened period has no occurrence before the transfer''s first counted day (1 November), only 1 December');
-- a chosen income's pay date plus the offset is capped at its period's end
select pg_temp.budget('e2');
select tests.remember('e2_inc', public.add_income(tests.id('e2'), 'Partner', 300000, 15, 'none', null, tests.id('e2_p1')));
select tests.remember('e2_t', (select id from public.create_transfer(tests.id('e2'), 'Late', tests.id('e2_main'), tests.id('e2_sav'),
  100, 'pay_date', 31, null, tests.id('e2_inc'), p_from_period_id => tests.this_period(tests.id('e2')))));
select results_eq(
  format($$select occurrence_date, due_date from public.get_transfer_checklist(%L) where transfer_id = %L$$, tests.id('e2_p2'), tests.id('e2_t')),
  $$values ('2026-11-15'::date, '2026-11-24'::date)$$,
  'R-ACCOUNT-301: a pay date plus the offset, never after the end of the period containing the pay date');
-- the chosen income paid on the primary's day, the primary's salary late, the chosen income ended
select pg_temp.budget('e3');
select tests.remember('e3_inc', public.add_income(tests.id('e3'), 'Partner', 300000, 25, 'none', null, tests.id('e3_p1')));
select tests.remember('e3_t', (select id from public.create_transfer(tests.id('e3'), 'Partner''s', tests.id('e3_main'), tests.id('e3_sav'),
  100, 'pay_date', 0, null, tests.id('e3_inc'), false, null, tests.id('e3_p1'))));
select lives_ok(format($$select * from public.set_expected_pay_date(%L, %L, %s, '2026-11-28')$$, tests.id('e3'), tests.id('e3_p2'),
                       (select revision from public.periods where id = tests.id('e3_p2'))), 'R-ACCOUNT-301: (the salary is expected late)');
select pg_temp.day('2026-11-28');
select public.ensure_periods(tests.id('e3'));
select tests.remember('e3_p3', pg_temp.period_at(tests.id('e3'), '2026-11-28'));
select is(public.remove_income(tests.id('e3_inc'), (select revision from public.incomes where id = tests.id('e3_inc'))), 'ended',
  'R-ACCOUNT-071: (the partner''s income ends: the transfer follows the primary income)');
select results_eq(
  format($$select (select string_agg(occurrence_date::text, ',' order by occurrence_date) from public.get_transfer_checklist(%1$L) where transfer_id = %3$L),
                  (select count(*)::integer from public.get_transfer_checklist(%2$L) where transfer_id = %3$L)$$,
         tests.id('e3_p2'), tests.id('e3_p3'), tests.id('e3_t')),
  $$values ('2026-10-25,2026-11-25', 0)$$,
  'R-ACCOUNT-301: the partner''s 25 November is its own occurrence, in the period containing it; ended on 28 Nov, the late period''s own (due that day) is not planned (D-492)');
-- a salary recorded 16 days early, then the next on its scheduled day: each period its own occurrence
select pg_temp.budget('e4');
select tests.remember('e4_t', (select id from public.create_transfer(tests.id('e4'), 'Payday', tests.id('e4_main'), tests.id('e4_sav'),
  100, 'pay_date', p_from_period_id => tests.id('e4_p1'))));
select lives_ok(format($$select * from public.record_early_pay_date(%L, %L, %s, '2026-11-09')$$, tests.id('e4'), tests.id('e4_p2'),
                       (select revision from public.periods where id = tests.id('e4_p2'))), 'R-ACCOUNT-302: (a salary 16 days early)');
select pg_temp.day('2026-11-26');
select public.ensure_periods(tests.id('e4'));
select results_eq(
  format($$select p.start_date, (select string_agg(c.occurrence_seq || '/' || c.due_date, ',') from public.get_transfer_checklist(p.id) as c where c.transfer_id = %L)
           from public.periods as p where p.budget_id = %L and p.seq >= 3 order by p.seq$$, tests.id('e4_t'), tests.id('e4')),
  $$values ('2026-11-09'::date, '3/2026-11-09'), ('2026-11-25'::date, '4/2026-11-25')$$,
  'R-ACCOUNT-511: two salaries in one month, two periods, each with its own occurrence');
-- a due date that moves after today: the catch-up's transaction goes until it is due again
select pg_temp.budget('e5');
select tests.remember('e5_inc', public.add_income(tests.id('e5'), 'Partner', 300000, 20, 'none', null, tests.id('e5_p1')));
select tests.remember('e5_t', (select id from public.create_transfer(tests.id('e5'), 'Partner + 5', tests.id('e5_main'), tests.id('e5_sav'),
  100, 'pay_date', 5, null, tests.id('e5_inc'), true, tests.id('e5_cat'), tests.id('e5_p1'))));
select pg_temp.day('2026-11-23');
select lives_ok(format($$select * from public.record_early_pay_date(%L, %L, %s, '2026-11-23')$$, tests.id('e5'), tests.id('e5_p2'),
                       (select revision from public.periods where id = tests.id('e5_p2'))), 'R-ACCOUNT-302: (the salary comes on the 23rd)');
select results_eq(format($$select occurrence_date, date from pg_temp.txs(%L) where occurrence_date = '2026-11-20'$$, tests.id('e5_t')),
  $$values ('2026-11-20'::date, '2026-11-22'::date)$$,
  'R-ACCOUNT-301: (due on the period''s last day, the 22nd: made)');
select lives_ok(format($$select * from public.reopen_previous_period(%L, %L, %s)$$, tests.id('e5'),
                       pg_temp.period_at(tests.id('e5'), '2026-11-23'),
                       (select revision from public.periods where id = pg_temp.period_at(tests.id('e5'), '2026-11-23'))),
  'R-ACCOUNT-302: (it has not come: reopen; the period now ends on the 24th)');
select is((select count(*)::integer from pg_temp.txs(tests.id('e5_t')) where occurrence_date = '2026-11-20'), 0,
  'R-ACCOUNT-302: the occurrence is due on the 24th now: the catch-up''s transaction goes until then');
select pg_temp.day('2026-11-24');
select public.ensure_periods(tests.id('e5'));
select results_eq(format($$select date from pg_temp.txs(%L) where occurrence_date = '2026-11-20'$$, tests.id('e5_t')),
  $$values ('2026-11-24'::date)$$, 'R-ACCOUNT-302: and comes back on its due date, once');
-- a member's done stays when the transfer is made automatic: not done asks for undo first
select pg_temp.budget('e6');
select tests.remember('e6_t', (select id from public.create_transfer(tests.id('e6'), 'By hand', tests.id('e6_main'), tests.id('e6_sav'),
  100, 'day_of_month', p_day_of_month => 1, p_category_id => tests.id('e6_cat'), p_from_period_id => tests.this_period(tests.id('e6')))));
select lives_ok(format($$select * from public.mark_transfer_done(%L, %L, 0)$$, tests.id('e6_t'), tests.id('e6_p2')), 'R-ACCOUNT-305: (done)');
select lives_ok(format($$select * from public.update_transfer(%L, 1, p_is_automatic => true)$$, tests.id('e6_t')), 'R-ACCOUNT-305: (made automatic)');
select throws_ok(format($$select * from public.mark_transfer_not_done(%L, %L, 1)$$, tests.id('e6_t'), tests.id('e6_p2')),
  'P0001', 'transfer_already_marked', 'R-ACCOUNT-305: a member''s done stays: not done is refused until it is undone');
-- created in a period whose salary came late: the period's own occurrence is its (it counts from
-- that period)
select pg_temp.budget('e7');
select lives_ok(format($$select * from public.set_expected_pay_date(%L, %L, %s, '2026-11-28')$$, tests.id('e7'), tests.id('e7_p2'),
                       (select revision from public.periods where id = tests.id('e7_p2'))), 'R-ACCOUNT-302: (the salary is expected on the 28th)');
select pg_temp.day('2026-11-28');
select public.ensure_periods(tests.id('e7'));
select tests.remember('e7_t', (select id from public.create_transfer(tests.id('e7'), 'Payday', tests.id('e7_main'), tests.id('e7_sav'), 100, 'pay_date', p_from_period_id => tests.this_period(tests.id('e7')))));
select results_eq(
  format($$select t.starts_on, c.occurrence_seq, c.due_date from public.transfers as t
           cross join lateral public.get_transfer_checklist(%L) as c where t.id = %L and c.transfer_id = t.id$$,
         pg_temp.period_at(tests.id('e7'), '2026-11-28'), tests.id('e7_t')),
  $$values ('2026-11-28'::date, 3, '2026-11-28'::date)$$,
  'R-ACCOUNT-511: created in a period whose salary came late, its own occurrence is the period''s, due the day the salary came');
-- a new day keeps a yearly transfer's month
select pg_temp.budget('e8');
select tests.remember('e8_t', (select id from public.create_transfer(tests.id('e8'), 'Yearly', tests.id('e8_main'), tests.id('e8_sav'),
  100, 'day_of_month', p_cadence => 'yearly', p_first_date => '2026-12-20')));
select results_eq(
  format($$select first_date, day_of_month, next_due_date from public.update_transfer(%L, 1, p_day_of_month => 10)$$, tests.id('e8_t')),
  $$values ('2026-12-10'::date, 10, '2026-12-10'::date)$$,
  'R-ACCOUNT-300: a new day without a first date keeps the schedule''s phase (December stays its month)');
-- a preview whose terms govern no occurrence carries its counts in one row
select pg_temp.budget('e9');
select lives_ok(format($$select * from public.set_budget_end_date(%L, %s, '2026-11-20')$$, tests.id('e9'),
                       (select revision from public.budgets where id = tests.id('e9'))), 'R-BUDGET-008: (the budget ends this period)');
select tests.remember('e9_t', (select id from public.create_transfer(tests.id('e9'), 'Spring', tests.id('e9_main'), tests.id('e9_sav'),
  100, 'day_of_month', p_cadence => 'yearly', p_first_date => '2027-03-01')));
select results_eq(
  format($$select occurrence_date, created_at_once_count, transactions_removed_count, marks_unplanned_count
           from public.preview_update_transfer(%L, p_amount => 5)$$, tests.id('e9_t')),
  $$values (null::date, 0, 0, 0)$$,
  'R-ACCOUNT-303: terms that govern no occurrence: one row with the counts only');
-- committed: what is in force in the period, at the terms then; category_overview the terms now
select pg_temp.budget('e10');
select tests.remember('e10_a', (select id from public.create_transfer(tests.id('e10'), 'A', tests.id('e10_main'), tests.id('e10_sav'),
  1000, 'pay_date', p_category_id => tests.id('e10_cat'), p_from_period_id => tests.id('e10_p1'))));
select tests.remember('e10_b', (select id from public.create_transfer(tests.id('e10'), 'B', tests.id('e10_main'), tests.id('e10_sav'),
  2000, 'pay_date', p_category_id => tests.id('e10_cat'), p_from_period_id => tests.id('e10_p1'))));
select is(public.end_transfer(tests.id('e10_b'), 1), 'ended', 'R-ACCOUNT-238: (B ends from the current period)');
select lives_ok(format($$select * from public.update_transfer(%L, 1, p_amount => 4000)$$, tests.id('e10_a')), 'R-ACCOUNT-238: (A from now: 4000)');
select results_eq(
  format($$select (select transfer_committed_total from public.period_summaries where id = %L),
                  (select transfer_committed_total from public.period_summaries where id = %L),
                  (select transfer_committed_amount from public.category_overview where id = %L)$$,
         tests.id('e10_p1'), tests.id('e10_p2'), tests.id('e10_cat')),
  $$values (3000::bigint, 4000::bigint, 4000::bigint)$$,
  'R-ACCOUNT-238: committed: the transfers in force in each period at their terms then (an ended one no more), and now');
-- past use never blocks closing an account; one a transfer named is ended, never deleted
select pg_temp.budget('e12');
select tests.remember('e12_old', (select id from public.create_account(tests.id('e12'), 'Old', 'savings', p_from_period_id => tests.id('e12_p1'))));
select tests.remember('e12_t', (select id from public.create_transfer(tests.id('e12'), 'Past', tests.id('e12_main'), tests.id('e12_old'),
  100, 'day_of_month', p_day_of_month => 1, p_from_period_id => tests.id('e12_p1'))));
select lives_ok(format($$select * from public.mark_transfer_done(%L, %L, 0)$$, tests.id('e12_t'), tests.id('e12_p1')), 'R-ACCOUNT-232: (setup)');
select is(public.end_transfer(tests.id('e12_t'), 1), 'ended', 'R-ACCOUNT-232: (setup: the transfer ends from now)');
select is(public.close_account(tests.id('e12_old'), 1), 'ended',
  'R-ACCOUNT-232: an account used only in the past can close; it is ended, not deleted');
select tests.remember('e12_new', (select id from public.create_account(tests.id('e12'), 'New', 'cash')));
select tests.remember('e12_v', (select id from public.create_transfer(tests.id('e12'), 'Void', tests.id('e12_main'), tests.id('e12_new'),
  100, 'day_of_month', p_day_of_month => 1, p_from_period_id => tests.this_period(tests.id('e12')))));
select lives_ok(format($$select * from public.mark_transfer_done(%L, %L, 0)$$, tests.id('e12_v'), tests.id('e12_p2')), 'R-ACCOUNT-232: (setup)');
select is(public.end_transfer(tests.id('e12_v'), 1), 'ended', 'R-ACCOUNT-232: (setup: kept void, its terms naming the account)');
select is(public.close_account(tests.id('e12_new'), 1), 'ended',
  'R-ACCOUNT-232: an account a transfer named is ended, never deleted, even closed from its first period');
-- the subscriptions' catch-up is bounded per step too
select pg_temp.budget('e11');
select tests.remember('e11_s', (select id from public.create_subscription(tests.id('e11'), 'Monthly', 1000, 'monthly', tests.id('e11_cat'), '2026-11-17')));
select tests.clear_authentication();
create or replace function private.limit_catch_up_transactions() returns integer language sql immutable set search_path = '' as $f$ select 1 $f$;
select tests.set_today('2027-03-20');
select tests.authenticate_as('gina2');
select ok(public.ensure_periods(tests.id('e11')) > 0, 'R-PERIOD-300: (a step)');
select results_eq(
  format($$select (select count(*)::integer from public.transactions where subscription_id = %L),
                  (select caught_up from public.my_budgets where id = %L)$$, tests.id('e11_s'), tests.id('e11')),
  $$values (1, false)$$,
  'R-PERIOD-300: the subscriptions'' charges too: one step makes at most its bound, the rest stays due');
select ok(public.ensure_periods(tests.id('e11')) > 0, 'R-PERIOD-300: a step that stops early never answers 0');
select tests.clear_authentication();
create or replace function private.limit_catch_up_transactions() returns integer language sql immutable set search_path = '' as $f$ select 4000 $f$;
select tests.authenticate_as('gina2');
select public.ensure_periods(tests.id('e11'));
select is((select count(*)::integer from public.transactions where subscription_id = tests.id('e11_s')), 5,
  'R-PERIOD-300: none skipped, none twice (17 November to 17 March)');
select set_config('test.actor', 'gina', false);
select pg_temp.day('2026-11-16');

-- ===========================================================================
-- At most 1000 rows in a checklist (R-APP-170)
-- ===========================================================================
select pg_temp.budget('k');
select count(*) from (select public.create_transfer(tests.id('k'), 'K' || g, tests.id('k_main'), tests.id('k_sav'), 100 * g,
  'day_of_month', p_day_of_month => g, p_from_period_id => tests.this_period(tests.id('k'))) from generate_series(1, 3) as g) as x;
select tests.clear_authentication();
create or replace function private.limit_checklist_rows() returns integer language sql immutable set search_path = '' as $f$ select 2 $f$;
select tests.authenticate_as('gina');
select results_eq(
  format($$select status, name, period_id = %L from public.get_transfer_checklist(%L)$$, tests.id('k_p2'), tests.id('k_p2')),
  $$values ('to_do', 'K1', true), ('more', '2', true)$$,
  'R-APP-170: beyond the bound, the checklist lists the first rows and a last one saying how many more there are');
select tests.clear_authentication();
create or replace function private.limit_checklist_rows() returns integer language sql immutable set search_path = '' as $f$ select 3 $f$;
select tests.authenticate_as('gina');
select is((select count(*)::integer from public.get_transfer_checklist(tests.id('k_p2')) where status <> 'more'), 3,
  'R-APP-170: exactly the bound is all listed');
select tests.clear_authentication();
create or replace function private.limit_checklist_rows() returns integer language sql immutable set search_path = '' as $f$ select 1000 $f$;
select tests.authenticate_as('gina');

-- ===========================================================================
-- Another user, and an anonymous visitor (R-SECURITY-002 to R-SECURITY-004)
-- ===========================================================================
select tests.authenticate_as('hugo');
select throws_ok(format($$select * from public.mark_transfer_done(%L, %L, 0, null, null, '2026-11-10')$$, tests.id('d_m'), tests.id('d_p2')),
  'P0001', 'transfer_not_found', 'R-SECURITY-004: another user names no occurrence of a budget he is not in');
select throws_ok(format($$select * from public.preview_create_transfer(%L, %L, %L, 1, 'day_of_month', p_cadence => 'yearly', p_first_date => '2026-12-01')$$,
                        tests.id('y'), tests.id('y_main'), tests.id('y_sav')),
  'P0001', 'budget_not_found', 'R-SECURITY-004: nor previews a transfer there');
select is((select count(*)::integer from public.transfer_occurrences where budget_id = tests.id('d')), 0,
  'R-SECURITY-002: and reads none of its marks');
select tests.authenticate_as_anon();
select throws_ok(format($$select * from public.undo_transfer_mark(%L, %L, 1, '2026-11-10')$$, tests.id('d_m'), tests.id('d_p2')),
  '42501', null, 'R-SECURITY-003: an anonymous visitor calls none of them');
select tests.clear_authentication();

-- ===========================================================================
-- A retried create_transfer answers only to a current member (R-SECURITY-002, D-390)
-- ===========================================================================
select pg_temp.budget('rm');
select tests.remember('rm_inv', public.invite_member(tests.id('rm'), tests.get_user_email('gina2')));
select tests.authenticate_as('gina2');
select public.accept_invitation(tests.id('rm_inv'));
select tests.remember('rm_req', extensions.gen_random_uuid());
select tests.remember('rm_t', (select id from public.create_transfer(tests.id('rm'), 'Retried', tests.id('rm_main'), tests.id('rm_sav'),
  100, 'pay_date', p_client_id => tests.id('rm_req'), p_from_period_id => tests.this_period(tests.id('rm')))));
select tests.remember('rm_areq', extensions.gen_random_uuid());
select tests.remember('rm_a', (select id from public.create_account(tests.id('rm'), 'Retried account', 'savings',
  p_client_id => tests.id('rm_areq'))));
select tests.authenticate_as('gina');
select lives_ok(format($$select public.remove_member(%L, %L)$$, tests.id('rm'), tests.get_user_id('gina2')), 'R-SECURITY-002: (gina2 removed)');
select tests.authenticate_as('gina2');
select throws_ok(format($$select * from public.create_transfer(%L, 'Retried', %L, %L, 100, 'pay_date', p_client_id => %L)$$,
                        tests.id('rm'), tests.id('rm_main'), tests.id('rm_sav'), tests.id('rm_req')),
  'P0001', 'budget_not_found', 'R-SECURITY-002: a removed member replaying a create_transfer is refused before the request is looked up');
select throws_ok(format($$select * from public.create_account(%L, 'Retried account', 'savings', p_client_id => %L)$$,
                        tests.id('rm'), tests.id('rm_areq')),
  'P0001', 'budget_not_found', 'R-SECURITY-002: a removed member replaying a create_account is refused before the request is looked up');
select tests.clear_authentication();

-- ===========================================================================
-- Behind with the transfers' transactions, its periods all there: catching_up (R-PERIOD-250, D-433)
-- ===========================================================================
select pg_temp.budget('g');
select tests.remember('g_t', (select id from public.create_transfer(tests.id('g'), 'Rent share', tests.id('g_main'), tests.id('g_sav'),
  100, 'day_of_month', p_day_of_month => 2, p_is_automatic => true, p_category_id => tests.id('g_cat'), p_from_period_id => tests.this_period(tests.id('g')))));
select tests.clear_authentication();
-- (as postgres: its next transaction due in August and not made, as after a long absence)
update public.transfers set next_due = '2026-08-01' where id = tests.id('g_t');
select tests.authenticate_as('gina');
select throws_ok(format($$select * from public.update_transfer(%L, %s, p_amount => 200)$$, tests.id('g_t'),
                        (select revision from public.transfers where id = tests.id('g_t'))),
  'P0001', 'catching_up', 'R-PERIOD-250: a transaction due more than 62 days ago not made yet: a write answers catching_up');
select throws_ok(format($$select * from public.get_transfer_checklist(%L)$$, pg_temp.period_at(tests.id('g'), '2026-11-16')),
  'P0001', 'catching_up', 'R-PERIOD-250: and so does a read');
select lives_ok(format($$select public.ensure_periods(%L)$$, tests.id('g')), 'R-PERIOD-250: ensure_periods catches it up');
select lives_ok(format($$select * from public.update_transfer(%L, %s, p_amount => 200)$$, tests.id('g_t'),
                       (select revision from public.transfers where id = tests.id('g_t'))),
  'R-PERIOD-250: then the write goes through');
select tests.clear_authentication();

select * from finish();
rollback;
