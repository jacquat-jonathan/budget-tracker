-- Database fix round 4 (re-check 4): an occurrence is told apart by its own kind (must-fix 1,
-- R-ACCOUNT-460), a pay-date transfer happens once per pay date of its income whatever the
-- primary does (must-fix 2, R-ACCOUNT-461), keys derived from the previous key (Q-311,
-- R-ACCOUNT-463), what the app recorded by itself sits on its due date (R-ACCOUNT-462), the
-- overview's next due date (R-ACCOUNT-464), the should-fixes and the reviewer's surviving breaks.
begin;
select no_plan();

select tests.create_user('kai', 'Kai');
select tests.create_user('kim', 'Kim');
select tests.create_user('kit', 'Kit');
select tests.set_today('2026-11-16');
select tests.authenticate_as('kai');

create function pg_temp.day(d date, who text default 'kai') returns void language plpgsql as $$
begin
  perform tests.clear_authentication();
  perform tests.set_today(d);
  perform tests.authenticate_as(who);
end $$;
-- a budget paid on p_day, started in September 2026, with Main, Savings and the category Saving
create function pg_temp.budget(n text, p_day integer default 25, p_rule public.weekend_rule default 'none')
returns void language plpgsql as $$
declare
  b uuid;
  p1 uuid;
begin
  b := public.create_budget('Budget ' || n, 'Salary', 600000, p_day, p_rule, '2026-09-01');
  p1 := (select id from public.periods where budget_id = b and seq = 1);
  perform tests.remember(n, b);
  perform tests.remember(n || '_p1', p1);
  perform tests.remember(n || '_inc', (select primary_income_id from public.budgets where id = b));
  perform tests.remember(n || '_main', (select id from public.create_account(b, 'Main', 'current', p_from_period_id => p1)));
  perform tests.remember(n || '_sav', (select id from public.create_account(b, 'Savings', 'savings', p_from_period_id => p1)));
  perform tests.remember(n || '_cat', (select id from public.create_category(b, 'Saving', p_amount => 100000, p_from_period_id => p1)));
end $$;
create function pg_temp.cur(n text) returns public.periods language sql as $$
  select p.* from public.periods as p
  where p.budget_id = tests.id(n) and (select public.get_today()) between p.start_date and p.end_date $$;
create function pg_temp.period_at(n text, d date) returns uuid language sql as $$
  select id from public.periods where budget_id = tests.id(n) and d between start_date and end_date $$;
create function pg_temp.rev(t uuid) returns integer language sql as $$
  select revision from public.transfers where id = t $$;
-- every period of a budget with its checklist rows of one transfer: key, due date, status, planned,
-- [f] for a fixed day
create function pg_temp.rows(n text, t uuid) returns table (seq integer, start_date date, rows text) language sql as $$
  select p.seq, p.start_date,
         coalesce((select string_agg(c.occurrence_date || '/' || coalesce(c.due_date::text, '-') || '/' || c.status
                                     || case when c.planned then '' else '/unplanned' end
                                     || case when c.occurrence_kind = 'fixed_day' then '[f]' else '' end,
                                     ';' order by c.occurrence_date, c.occurrence_kind)
                   from public.get_transfer_checklist(p.id) as c where c.transfer_id = t), '')
  from public.periods as p where p.budget_id = tests.id(n) order by p.seq $$;
create function pg_temp.txs(t uuid) returns text language sql as $$
  select coalesce(string_agg(x.date::text, ',' order by x.date), '') from public.transaction_list as x where x.transfer_id = t $$;
create function pg_temp.new_transfer(n text, name text, p_auto boolean default true, p_from uuid default null,
                                     p_income uuid default null, p_amount bigint default 100000)
returns uuid language sql as $$
  select id from public.create_transfer(tests.id(n), name, tests.id(n || '_main'), tests.id(n || '_sav'), p_amount, 'pay_date',
    p_is_automatic => p_auto, p_category_id => tests.id(n || '_cat'), p_from_period_id => p_from, p_income_id => p_income) $$;
-- a transfer's marks as the checklist rows show them, with the transaction's date
create function pg_temp.marks(t uuid) returns text language sql security definer as $$
  select coalesce(string_agg(o.occurrence_date || '/' || o.kind || '/' || o.mark || '/' || coalesce(o.done_on::text, '-')
                             || '/' || coalesce((select x.date::text from public.transactions as x where x.transfer_occurrence_id = o.id), '-'),
                             ';' order by o.occurrence_date, o.kind), '')
  from public.transfer_occurrences as o where o.transfer_id = t $$;
create function pg_temp.keys(n text) returns text language sql security definer as $$
  select string_agg(p.start_date || '=' || p.pay_key, ',' order by p.seq) from public.periods as p where p.budget_id = tests.id(n) $$;
create function pg_temp.salary_change_to_5(n text) returns void language sql as $$
  select public.update_income(tests.id(n || '_inc'), (select revision from public.incomes where id = tests.id(n || '_inc')), p_pay_day => 5,
    p_previewed_end_date => (select end_date from public.preview_update_income(tests.id(n || '_inc'), p_pay_day => 5)));
  select public.record_early_pay_date(tests.id(n), (pg_temp.cur(n)).id, (pg_temp.cur(n)).revision, '2026-12-05');
$$;

-- ===========================================================================
-- Must-fix 1 (R-ACCOUNT-460): a payday and a fixed day with one key are two occurrences, each
-- told apart by its own kind, never by which of them exists. The reviewer's settings: the pay day
-- changes from 25 to 5 on 5 Dec; "Savings" on payday from the period 5 Feb..; on 6 Mar changed from
-- now to a standing order on the 5th, first 5 Mar.
-- ===========================================================================
select pg_temp.day('2026-12-05');
select pg_temp.budget('s2');
select pg_temp.salary_change_to_5('s2');
select pg_temp.day('2027-02-10');
select public.ensure_periods(tests.id('s2'));
select tests.remember('s2_t', pg_temp.new_transfer('s2', 'Savings', p_from => (pg_temp.cur('s2')).id));
select pg_temp.day('2027-03-06');
select public.ensure_periods(tests.id('s2'));
select public.update_transfer(tests.id('s2_t'), pg_temp.rev(tests.id('s2_t')), p_schedule => 'day_of_month', p_day_of_month => 5,
  p_first_date => '2027-03-05');
select is(pg_temp.keys('s2'),
  '2026-09-25=2026-09-25,2026-10-25=2026-10-25,2026-11-25=2026-11-25,2026-12-05=2026-12-05,2027-01-05=2027-01-05,2027-02-05=2027-02-05,2027-03-05=2027-03-05',
  'R-ACCOUNT-463: after the change of pay day every period is keyed by its own payday');
select is(pg_temp.marks(tests.id('s2_t')), '2027-02-05/payday/done/2027-02-05/2027-02-05;2027-03-05/fixed_day/done/2027-03-05/2027-03-05',
  'R-ACCOUNT-460: (setup) 5 Feb on payday and 5 Mar the standing order, each recorded on its due date');
savepoint s2a;
-- (a) corrected from the period 5 Feb.. too: the 5 Feb transaction goes with its occurrence, 5 Mar stays
select results_eq(
  format($$select created_at_once_count, transactions_removed_count, marks_unplanned_count
           from public.preview_update_transfer(%L, p_schedule => 'day_of_month', p_day_of_month => 5, p_first_date => '2027-03-05',
                                               p_from_period_id => %L, p_count => 1)$$, tests.id('s2_t'), pg_temp.period_at('s2', '2027-02-05')),
  $$values (0, 1, 0)$$, 'R-ACCOUNT-460: the correction''s preview removes one transaction');
select public.update_transfer(tests.id('s2_t'), pg_temp.rev(tests.id('s2_t')), p_schedule => 'day_of_month', p_day_of_month => 5,
  p_first_date => '2027-03-05', p_from_period_id => pg_temp.period_at('s2', '2027-02-05'));
select is(pg_temp.txs(tests.id('s2_t')), '2027-03-05', 'R-ACCOUNT-460: corrected away, the 5 Feb transaction goes with its occurrence');
select is((select rows from pg_temp.rows('s2', tests.id('s2_t')) where start_date = '2027-03-05'), '2027-03-05/2027-03-05/done[f]',
  'R-ACCOUNT-460: the period 5 Mar.. lists its standing order, done on its own date');
select is((select rows from pg_temp.rows('s2', tests.id('s2_t')) where start_date = '2027-02-05'), '',
  'R-ACCOUNT-460: the period 5 Feb.. lists nothing');
select is_empty(format($$select * from tests.moneyflow_violations(%L)$$, tests.id('s2')), 'R-ACCOUNT-460: the model agrees (s2 a)');
rollback to savepoint s2a;
-- (b) instead the period 5 Mar.. is reopened (expected 8 Mar): its terms are the reopened period's
select public.reopen_previous_period(tests.id('s2'), (pg_temp.cur('s2')).id, (pg_temp.cur('s2')).revision, '2027-03-08');
select is(pg_temp.txs(tests.id('s2_t')), '2027-03-05', 'R-ACCOUNT-460: after the reopen the standing order of 5 Mar stays, the payday goes');
select is(pg_temp.marks(tests.id('s2_t')), '2027-03-05/fixed_day/done/2027-03-05/2027-03-05',
  'R-ACCOUNT-460: its mark is its own, not the payday''s');
select pg_temp.day('2027-03-08');
select public.ensure_periods(tests.id('s2'));
select is(pg_temp.txs(tests.id('s2_t')), '2027-03-05', 'R-ACCOUNT-460: the salary of 8 Mar: still one transaction for 5 Mar');
select is((select rows from pg_temp.rows('s2', tests.id('s2_t')) where start_date = '2027-02-05'), '2027-03-05/2027-03-05/done[f]',
  'R-ACCOUNT-460: listed by the period containing 5 Mar, done on 5 Mar');
select is_empty(format($$select * from tests.moneyflow_violations(%L)$$, tests.id('s2')), 'R-ACCOUNT-460: the model agrees (s2 b)');

-- s5: a fixed day 5 (first 5 Mar) recorded 5 Mar, then the period 5 Feb..4 Mar corrected to "on
-- payday": 5 Feb is created at once, 5 Mar keeps its one transaction
select pg_temp.day('2026-12-05');
select pg_temp.budget('s5');
select pg_temp.salary_change_to_5('s5');
select pg_temp.day('2027-03-06');
select public.ensure_periods(tests.id('s5'));
select tests.remember('s5_t', (select id from public.create_transfer(tests.id('s5'), 'Savings', tests.id('s5_main'), tests.id('s5_sav'), 100000,
  'day_of_month', p_day_of_month => 5, p_first_date => '2027-03-05', p_is_automatic => true, p_category_id => tests.id('s5_cat'),
  p_from_period_id => pg_temp.period_at('s5', '2027-02-05'))));
select public.update_transfer(tests.id('s5_t'), pg_temp.rev(tests.id('s5_t')), p_amount => 110000);
select results_eq(
  format($$select occurrence_date, due_date, created_at_once, created_at_once_count, transactions_removed_count
           from public.preview_update_transfer(%L, p_schedule => 'pay_date', p_from_period_id => %L, p_count => 3)$$,
         tests.id('s5_t'), pg_temp.period_at('s5', '2027-02-05')),
  $$values ('2027-02-05'::date, '2027-02-05'::date, true, 1, 0)$$,
  'R-ACCOUNT-460: the preview flags the row due 5 Feb as created at once, nothing else');
select public.update_transfer(tests.id('s5_t'), pg_temp.rev(tests.id('s5_t')), p_schedule => 'pay_date',
  p_from_period_id => pg_temp.period_at('s5', '2027-02-05'));
select is(pg_temp.txs(tests.id('s5_t')), '2027-02-05,2027-03-05', 'R-ACCOUNT-460: one transaction on 5 Feb, one on 5 Mar, none doubled');
select is((select string_agg(x.amount::text, ',' order by x.date) from public.transaction_list as x where x.transfer_id = tests.id('s5_t')),
  '100000,100000', 'R-ACCOUNT-460: the 5 Mar transaction keeps its amount');
select is_empty(format($$select * from tests.moneyflow_violations(%L)$$, tests.id('s5')), 'R-ACCOUNT-460: the model agrees (s5)');

-- s1: by hand: both rows marked done by a member, then the correction: the payday's mark is no
-- longer planned; each row is undone with one call built from what it shows
select pg_temp.day('2026-12-05');
select pg_temp.budget('s1');
select pg_temp.salary_change_to_5('s1');
select pg_temp.day('2027-02-10');
select public.ensure_periods(tests.id('s1'));
select tests.remember('s1_t', pg_temp.new_transfer('s1', 'By hand', false, (pg_temp.cur('s1')).id, p_amount => 20000));
select public.mark_transfer_done(tests.id('s1_t'), (pg_temp.cur('s1')).id, 0);
select pg_temp.day('2027-03-06');
select public.ensure_periods(tests.id('s1'));
select public.update_transfer(tests.id('s1_t'), pg_temp.rev(tests.id('s1_t')), p_schedule => 'day_of_month', p_day_of_month => 5,
  p_first_date => '2027-03-05');
select public.mark_transfer_done(tests.id('s1_t'), (pg_temp.cur('s1')).id, 0, p_done_on => '2027-03-05');
select public.update_transfer(tests.id('s1_t'), pg_temp.rev(tests.id('s1_t')), p_schedule => 'day_of_month', p_day_of_month => 5,
  p_first_date => '2027-03-05', p_from_period_id => pg_temp.period_at('s1', '2027-02-05'));
select results_eq(
  $$select start_date, rows from pg_temp.rows('s1', tests.id('s1_t')) where start_date >= '2027-02-05'$$,
  $$values ('2027-02-05'::date, '2027-02-05/-/done/unplanned'), ('2027-03-05', '2027-03-05/2027-03-05/done[f]')$$,
  'R-ACCOUNT-460: the payday''s mark is listed by its own period, no longer planned; the standing order keeps its own');
select is(pg_temp.txs(tests.id('s1_t')), '2027-02-10,2027-03-05', 'R-ACCOUNT-460: both transactions stay with their marks');
select lives_ok(format($$select * from public.undo_transfer_mark(%L, %L, %s, %L, %L)$$, tests.id('s1_t'),
  pg_temp.period_at('s1', '2027-02-05'), c.mark_revision, c.occurrence_date, c.occurrence_kind), 'R-ACCOUNT-301: undo of the unplanned row')
from public.get_transfer_checklist(pg_temp.period_at('s1', '2027-02-05')) as c where c.transfer_id = tests.id('s1_t');
select lives_ok(format($$select * from public.undo_transfer_mark(%L, %L, %s, %L, %L)$$, tests.id('s1_t'),
  (pg_temp.cur('s1')).id, c.mark_revision, c.occurrence_date, c.occurrence_kind), 'R-ACCOUNT-301: undo of the planned row')
from public.get_transfer_checklist((pg_temp.cur('s1')).id) as c where c.transfer_id = tests.id('s1_t');
select is(pg_temp.marks(tests.id('s1_t')), '', 'R-ACCOUNT-301: both marks undone, nothing left');
select is((select rows from pg_temp.rows('s1', tests.id('s1_t')) where start_date = '2027-03-05'), '2027-03-05/2027-03-05/to_do[f]',
  'R-ACCOUNT-301: the standing order is to do again; the payday row is gone');
select is_empty(format($$select * from tests.moneyflow_violations(%L)$$, tests.id('s1')), 'R-ACCOUNT-460: the model agrees (s1)');

-- R-ACCOUNT-305 kept: a payday changed to a fixed day on the same date in the same period keeps its
-- mark and transaction, and back again
select pg_temp.day('2026-11-27');
select pg_temp.budget('c5');
select tests.remember('c5_t', pg_temp.new_transfer('c5', 'Payday to fixed', false, tests.id('c5_p1')));
select public.mark_transfer_done(tests.id('c5_t'), (pg_temp.cur('c5')).id, 0, p_done_on => '2026-11-25');
select public.update_transfer(tests.id('c5_t'), pg_temp.rev(tests.id('c5_t')), p_schedule => 'day_of_month', p_day_of_month => 25,
  p_first_date => '2026-11-25');
select is((select rows from pg_temp.rows('c5', tests.id('c5_t')) where start_date = '2026-11-25'), '2026-11-25/2026-11-25/done[f]',
  'R-ACCOUNT-305: the mark survives an edit from payday to a fixed day on the same date');
select public.update_transfer(tests.id('c5_t'), pg_temp.rev(tests.id('c5_t')), p_schedule => 'pay_date');
select is((select rows from pg_temp.rows('c5', tests.id('c5_t')) where start_date = '2026-11-25'), '2026-11-25/2026-11-25/done',
  'R-ACCOUNT-305: and back to payday');
select is(pg_temp.txs(tests.id('c5_t')), '2026-11-25', 'R-ACCOUNT-305: one transaction throughout');


-- ===========================================================================
-- Must-fix 2 (R-ACCOUNT-461, R-ACCOUNT-464): a pay-date transfer happens once per pay date of its
-- income, whichever income is the primary. A household: the primary paid on p_first, Ben on
-- p_second; "First savings" names the primary, "Ben savings" names Ben, "Joint" names none; all
-- automatic, linked, from the first period.
-- ===========================================================================
create function pg_temp.house(n text, p_first integer, p_second integer, p_rule public.weekend_rule default 'none')
returns void language plpgsql as $$
begin
  perform pg_temp.budget(n, p_first, p_rule);
  perform tests.remember(n || '_ben', public.add_income(tests.id(n), 'Ben', 400000, p_second, p_rule, p_from_period_id => tests.id(n || '_p1')));
  perform tests.remember(n || '_ta', pg_temp.new_transfer(n, 'First savings', p_from => tests.id(n || '_p1'), p_income => tests.id(n || '_inc')));
  perform tests.remember(n || '_tb', pg_temp.new_transfer(n, 'Ben savings', p_from => tests.id(n || '_p1'), p_income => tests.id(n || '_ben'),
                                                         p_amount => 50000));
  perform tests.remember(n || '_tj', pg_temp.new_transfer(n, 'Joint', p_from => tests.id(n || '_p1'), p_amount => 20000));
end $$;
create function pg_temp.switch(n text, p_income text) returns void language sql as $$
  select public.set_primary_income(tests.id(n || p_income), (select revision from public.budgets where id = tests.id(n)),
    (select end_date from public.preview_set_primary_income(tests.id(n || p_income))));
$$;
create function pg_temp.since(t uuid, d date) returns text language sql as $$
  select coalesce(string_agg(x.date::text, ',' order by x.date), '') from public.transaction_list as x
  where x.transfer_id = t and x.date >= d $$;
create function pg_temp.next_due(t uuid) returns date language sql as $$
  select next_due_date from public.transfer_overview where id = t $$;

-- 25th to the 10th, switched on 12 Dec (after Ben's pay day in the period)
select pg_temp.day('2026-12-12');
select pg_temp.house('p', 25, 10);
select results_eq(
  format($$select transfer_transactions_removed, transfer_transactions_created, transfer_marks_unplanned
           from public.preview_set_primary_income(%L)$$, tests.id('p_ben')),
  $$values (0, 0, 0)$$, 'R-ACCOUNT-428: the switch''s preview: nothing recorded changes, nothing is due at once');
select pg_temp.switch('p', '_ben');
select results_eq(
  format($$select name, next_due_date from public.transfer_overview where budget_id = %L order by name$$, tests.id('p')),
  $$values ('Ben savings', '2027-01-10'::date), ('First savings', '2026-12-25'), ('Joint', '2027-01-10')$$,
  'R-ACCOUNT-464: after the switch the next due dates are Ann''s 25 Dec and Ben''s 10 Jan');
select is((select rows from pg_temp.rows('p', tests.id('p_ta')) where start_date = '2026-11-25'),
  '2026-11-25/2026-11-25/done;2026-12-25/2026-12-25/upcoming',
  'R-ACCOUNT-461: the switch period keeps the old primary''s payday and plans its own pay date after the switch day');
select pg_temp.day('2027-02-11');
select public.ensure_periods(tests.id('p'));
select is(pg_temp.since(tests.id('p_ta'), '2026-11-01'), '2026-11-25,2026-12-25,2027-01-25',
  'R-ACCOUNT-461: Ann''s savings on each of Ann''s paydays: 25 Nov, 25 Dec, 25 Jan');
select is(pg_temp.since(tests.id('p_tb'), '2026-11-01'), '2026-11-10,2026-12-10,2027-01-10,2027-02-10',
  'R-ACCOUNT-461: Ben''s savings on each of Ben''s paydays: 10 Nov, 10 Dec, 10 Jan, 10 Feb');
select is(pg_temp.since(tests.id('p_tj'), '2026-11-01'), '2026-11-25,2027-01-10,2027-02-10',
  'R-ACCOUNT-461: a transfer naming no income: once per period (25 Nov, then 10 Jan and 10 Feb)');
select is((select pay_key from public.periods where budget_id = tests.id('p') and start_date = '2027-01-10'), '2027-01-10'::date,
  'R-ACCOUNT-463: the new primary''s first period is keyed by its first pay date after the switch day');
select is_empty(format($$select * from tests.moneyflow_violations(%L)$$, tests.id('p')), 'R-ACCOUNT-461: the model agrees (25th to 10th)');

-- the other way round: the 10th to the 25th, switched on 12 Dec
select pg_temp.day('2026-12-12');
select pg_temp.house('q', 10, 25);
select pg_temp.switch('q', '_ben');
select results_eq(
  format($$select name, next_due_date from public.transfer_overview where budget_id = %L order by name$$, tests.id('q')),
  $$values ('Ben savings', '2026-12-25'::date), ('First savings', '2027-01-10'), ('Joint', '2026-12-25')$$,
  'R-ACCOUNT-464: (10th to 25th) the next due dates agree with the plan');
select pg_temp.day('2027-02-11');
select public.ensure_periods(tests.id('q'));
select is(pg_temp.since(tests.id('q_ta'), '2026-11-01'), '2026-11-10,2026-12-10,2027-01-10,2027-02-10',
  'R-ACCOUNT-461: (10th to 25th) the old primary''s savings on each of its paydays');
select is(pg_temp.since(tests.id('q_tb'), '2026-11-01'), '2026-11-25,2026-12-25,2027-01-25',
  'R-ACCOUNT-461: (10th to 25th) the new primary''s savings on each of its paydays');
select is_empty(format($$select * from tests.moneyflow_violations(%L)$$, tests.id('q')), 'R-ACCOUNT-461: the model agrees (10th to 25th)');

-- a switch before the new primary's pay day in the period (5 Dec)
select pg_temp.day('2026-12-05');
select pg_temp.house('r', 25, 10);
select pg_temp.switch('r', '_ben');
select results_eq(
  format($$select name, next_due_date from public.transfer_overview where budget_id = %L order by name$$, tests.id('r')),
  $$values ('Ben savings', '2026-12-10'::date), ('First savings', '2026-12-25'), ('Joint', '2026-12-10')$$,
  'R-ACCOUNT-464: (switch on 5 Dec) the next due dates agree with the plan');
select pg_temp.day('2027-01-11');
select public.ensure_periods(tests.id('r'));
select is(pg_temp.since(tests.id('r_ta'), '2026-11-01'), '2026-11-25,2026-12-25',
  'R-ACCOUNT-461: (switch on 5 Dec) Ann''s 25 Dec, now in Ben''s period, as a non-primary pay date');
select is(pg_temp.since(tests.id('r_tb'), '2026-11-01'), '2026-11-10,2026-12-10,2027-01-10',
  'R-ACCOUNT-461: (switch on 5 Dec) Ben''s 10 Dec starts his first period');
select is_empty(format($$select * from tests.moneyflow_violations(%L)$$, tests.id('r')), 'R-ACCOUNT-461: the model agrees (switch on 5 Dec)');

-- two switches in one period: to Ben and back on 12 and 15 Dec: nothing changes
select pg_temp.day('2026-12-12');
select pg_temp.house('t2', 25, 10);
select pg_temp.switch('t2', '_ben');
select pg_temp.day('2026-12-15');
select pg_temp.switch('t2', '_inc');
select results_eq(
  format($$select name, next_due_date from public.transfer_overview where budget_id = %L order by name$$, tests.id('t2')),
  $$values ('Ben savings', '2027-01-10'::date), ('First savings', '2026-12-25'), ('Joint', '2026-12-25')$$,
  'R-ACCOUNT-464: (two switches, back) the next due dates are as before');
select pg_temp.day('2027-02-11');
select public.ensure_periods(tests.id('t2'));
select is(pg_temp.since(tests.id('t2_ta'), '2026-11-01'), '2026-11-25,2026-12-25,2027-01-25',
  'R-ACCOUNT-461: (two switches in one period, back) Ann''s savings once per payday');
select is(pg_temp.since(tests.id('t2_tb'), '2026-11-01'), '2026-11-10,2026-12-10,2027-01-10,2027-02-10',
  'R-ACCOUNT-461: (two switches in one period, back) Ben''s savings once per payday');
select is(pg_temp.since(tests.id('t2_tj'), '2026-11-01'), '2026-11-25,2026-12-25,2027-01-25',
  'R-ACCOUNT-461: (two switches in one period, back) a transfer naming no income follows Ann still');
select is_empty(format($$select * from tests.moneyflow_violations(%L)$$, tests.id('t2')), 'R-ACCOUNT-461: the model agrees (two switches)');

-- two switches in one period to two other incomes: Ann to Ben on 12 Dec, then to Cy (18th) on 15 Dec
select pg_temp.day('2026-12-12');
select pg_temp.house('t3', 25, 10);
select tests.remember('t3_cy', public.add_income(tests.id('t3'), 'Cy', 300000, 18, 'none', p_from_period_id => tests.id('t3_p1')));
select tests.remember('t3_tc', pg_temp.new_transfer('t3', 'Cy savings', p_from => tests.id('t3_p1'), p_income => tests.id('t3_cy'),
                                                    p_amount => 30000));
select pg_temp.switch('t3', '_ben');
select pg_temp.day('2026-12-15');
select pg_temp.switch('t3', '_cy');
select pg_temp.day('2027-02-19');
select public.ensure_periods(tests.id('t3'));
select is(pg_temp.since(tests.id('t3_ta'), '2026-11-01'), '2026-11-25,2026-12-25,2027-01-25',
  'R-ACCOUNT-461: (Ann to Ben to Cy in one period) Ann''s savings once per payday');
select is(pg_temp.since(tests.id('t3_tb'), '2026-11-01'), '2026-11-10,2026-12-10,2027-01-10,2027-02-10',
  'R-ACCOUNT-461: (Ann to Ben to Cy) Ben never became the primary: once per payday');
select is(pg_temp.since(tests.id('t3_tc'), '2026-11-01'), '2026-11-18,2026-12-18,2027-01-18,2027-02-18',
  'R-ACCOUNT-461: (Ann to Ben to Cy) Cy''s savings once per payday');
select is_empty(format($$select * from tests.moneyflow_violations(%L)$$, tests.id('t3')), 'R-ACCOUNT-461: the model agrees (to Cy)');

-- a switch, then a reopen of the switch period (the 25 Nov salary had not come; expected 10 Jan)
select pg_temp.day('2026-12-12');
select pg_temp.house('sr', 25, 10);
select pg_temp.switch('sr', '_ben');
select pg_temp.day('2026-12-13');
select public.reopen_previous_period(tests.id('sr'), (pg_temp.cur('sr')).id, (pg_temp.cur('sr')).revision);
select results_eq(
  format($$select name, next_due_date from public.transfer_overview where budget_id = %L order by name$$, tests.id('sr')),
  $$values ('Ben savings', '2027-01-10'::date), ('First savings', '2026-12-25'), ('Joint', '2027-01-10')$$,
  'R-ACCOUNT-464: (switch, then reopen) the next due dates agree with the plan');
select pg_temp.day('2027-02-11');
select public.ensure_periods(tests.id('sr'));
select is(pg_temp.since(tests.id('sr_ta'), '2026-10-01'), '2026-10-25,2026-12-25,2027-01-25',
  'R-ACCOUNT-461: (switch, reopen) the salary of 25 Nov did not come; Ann''s 25 Dec and 25 Jan are recorded');
select is(pg_temp.since(tests.id('sr_tb'), '2026-10-01'), '2026-10-10,2026-11-10,2026-12-10,2027-01-10,2027-02-10',
  'R-ACCOUNT-461: (switch, reopen) Ben''s savings once per payday');
select is_empty(format($$select * from tests.moneyflow_violations(%L)$$, tests.id('sr')), 'R-ACCOUNT-461: the model agrees (switch, reopen)');

-- a switch back in the next period: Ann to Ben on 12 Dec, Ben to Ann on 15 Jan
select pg_temp.day('2026-12-12');
select pg_temp.house('sb', 25, 10);
select pg_temp.switch('sb', '_ben');
select pg_temp.day('2027-01-15');
select public.ensure_periods(tests.id('sb'));
select pg_temp.switch('sb', '_inc');
select results_eq(
  format($$select name, next_due_date from public.transfer_overview where budget_id = %L order by name$$, tests.id('sb')),
  $$values ('Ben savings', '2027-02-10'::date), ('First savings', '2027-01-25'), ('Joint', '2027-01-25')$$,
  'R-ACCOUNT-464: (switch back) the next due dates agree with the plan');
select pg_temp.day('2027-03-11');
select public.ensure_periods(tests.id('sb'));
select is(pg_temp.since(tests.id('sb_ta'), '2026-11-01'), '2026-11-25,2026-12-25,2027-01-25,2027-02-25',
  'R-ACCOUNT-461: (switch back) Ann''s savings once per payday');
select is(pg_temp.since(tests.id('sb_tb'), '2026-11-01'), '2026-11-10,2026-12-10,2027-01-10,2027-02-10,2027-03-10',
  'R-ACCOUNT-461: (switch back) Ben''s savings once per payday');
select is_empty(format($$select * from tests.moneyflow_violations(%L)$$, tests.id('sb')), 'R-ACCOUNT-461: the model agrees (switch back)');

-- weekend shifts (the previous working day): 10 Jan 2027 is a Sunday, Ben is paid on Friday 8 Jan
select pg_temp.day('2026-12-12');
select pg_temp.house('w', 25, 10, 'previous');
select pg_temp.switch('w', '_ben');
select is(pg_temp.next_due(tests.id('w_tb')), '2027-01-08'::date, 'R-ACCOUNT-464: (weekend) Ben''s next payday is Friday 8 Jan');
select pg_temp.day('2027-02-11');
select public.ensure_periods(tests.id('w'));
select is(pg_temp.since(tests.id('w_ta'), '2026-11-01'), '2026-11-25,2026-12-25,2027-01-25',
  'R-ACCOUNT-461: (weekend) Ann''s savings once per payday');
select is(pg_temp.since(tests.id('w_tb'), '2026-11-01'), '2026-11-10,2026-12-10,2027-01-08,2027-02-10',
  'R-ACCOUNT-461: (weekend) Ben''s savings once per payday, 8 Jan for the 10th');
select is((select pay_key from public.periods where budget_id = tests.id('w') and start_date = '2027-01-08'), '2027-01-08'::date,
  'R-ACCOUNT-463: (weekend) the new primary''s first period is keyed by its shifted pay date');
select is_empty(format($$select * from tests.moneyflow_violations(%L)$$, tests.id('w')), 'R-ACCOUNT-461: the model agrees (weekend)');


-- the household properties hold in every budget above (tests.household_violations, R-ACCOUNT-461,
-- R-ACCOUNT-462, R-ACCOUNT-464)
select is_empty(format($$select b, v from unnest(array['s2','s5','s1','c5','p','q','r','t2','t3','sr','sb','w']) as b
                         cross join lateral tests.household_violations(tests.id(b)) as v$$),
  'R-ACCOUNT-461 R-ACCOUNT-462 R-ACCOUNT-464: the household properties hold in every budget of this file');

-- ===========================================================================
-- Q-311 (R-ACCOUNT-463): the reviewer's I2. The November salary came 17 days late (12 Dec): the
-- member moves the start; later the December period, with a mark made by hand, is reopened and
-- the salary recorded again on 28 Dec: the same key, the mark still planned, nothing to do again
-- ===========================================================================
select pg_temp.day('2026-12-27', 'kim');
select pg_temp.budget('i2');
select tests.remember('i2_t', pg_temp.new_transfer('i2', 'By hand', false, tests.id('i2_p1'), p_amount => 20000));
select public.move_period_start(pg_temp.period_at('i2', '2026-11-25'),
  (select revision from public.periods where id = pg_temp.period_at('i2', '2026-11-25')), '2026-12-12');
select public.mark_transfer_done(tests.id('i2_t'), (pg_temp.cur('i2')).id, 0);
select is((select pay_key from public.periods where id = (pg_temp.cur('i2')).id), '2026-12-25'::date,
  'R-ACCOUNT-463: (setup) the December period is keyed 25 Dec');
select public.reopen_previous_period(tests.id('i2'), (pg_temp.cur('i2')).id, (pg_temp.cur('i2')).revision, '2026-12-28');
select pg_temp.day('2026-12-28', 'kim');
select public.ensure_periods(tests.id('i2'));
select is((select pay_key from public.periods where id = (pg_temp.cur('i2')).id), '2026-12-25'::date,
  'R-ACCOUNT-463: the salary recorded again on 28 Dec gives the same key, although the start before it moved');
select is((select rows from pg_temp.rows('i2', tests.id('i2_t')) where start_date = '2026-12-28'), '2026-12-25/2026-12-28/done',
  'R-ACCOUNT-463: the mark made by hand is still that occurrence''s, planned');
select results_eq(format($$select transfers_to_do, transfers_overdue from public.get_transfers_to_do(%L)$$, tests.id('i2')),
  $$values (1, 1)$$, 'R-ACCOUNT-463: the December transfer is not to do again (only November''s, never marked)');

-- after a change of pay day from the 25th to the 26th the next salary is keyed 26 Dec, not 26 Nov
select pg_temp.day('2026-11-27', 'kim');
select pg_temp.budget('k26');
select public.update_income(tests.id('k26_inc'), (select revision from public.incomes where id = tests.id('k26_inc')), p_pay_day => 26,
  p_previewed_end_date => (select end_date from public.preview_update_income(tests.id('k26_inc'), p_pay_day => 26)));
select pg_temp.day('2026-12-27', 'kim');
select public.ensure_periods(tests.id('k26'));
select is((select pay_key from public.periods where id = (pg_temp.cur('k26')).id), '2026-12-26'::date,
  'R-ACCOUNT-463: after a change of pay day to the 26th, the next salary is keyed 26 Dec');

-- ===========================================================================
-- R-ACCOUNT-462: what the app recorded by itself sits on its occurrence's due date
-- ===========================================================================
-- an early salary shortens the period: an offset occurrence capped at the period's end moves
select pg_temp.day('2026-11-20', 'kim');
select pg_temp.budget('rd');
select tests.remember('rd_t', (select id from public.create_transfer(tests.id('rd'), 'Late in the month', tests.id('rd_main'),
  tests.id('rd_sav'), 1000, 'pay_date', p_offset_days => 20, p_is_automatic => true, p_category_id => tests.id('rd_cat'),
  p_from_period_id => tests.id('rd_p1'))));
select is(pg_temp.since(tests.id('rd_t'), '2026-10-20'), '2026-11-14', 'R-ACCOUNT-462: (setup) 25 Oct plus 20 days, on 14 Nov');
select public.record_early_pay_date(tests.id('rd'), (pg_temp.cur('rd')).id, (pg_temp.cur('rd')).revision, '2026-11-10');
select is(pg_temp.since(tests.id('rd_t'), '2026-10-20'), '2026-11-09',
  'R-ACCOUNT-462: the salary came on 10 Nov: the occurrence is due 9 Nov (its period''s last day), and so is the transaction');
select is_empty(format($$select * from tests.household_violations(%L)$$, tests.id('rd')),
  'R-ACCOUNT-462: the household properties hold (early salary)');
-- another offset from now: the transaction moves; edited by the member, it stays
select pg_temp.day('2026-11-30', 'kim');
select pg_temp.budget('ro');
select tests.remember('ro_t', (select id from public.create_transfer(tests.id('ro'), 'Plain', tests.id('ro_main'), tests.id('ro_sav'),
  1000, 'pay_date', p_offset_days => 3, p_is_automatic => true, p_category_id => tests.id('ro_cat'), p_from_period_id => (pg_temp.cur('ro')).id)));
select tests.remember('ro_e', (select id from public.create_transfer(tests.id('ro'), 'Edited', tests.id('ro_main'), tests.id('ro_sav'),
  1000, 'pay_date', p_offset_days => 3, p_is_automatic => true, p_category_id => tests.id('ro_cat'), p_from_period_id => (pg_temp.cur('ro')).id)));
select public.update_transaction(x.id, x.revision, 'expense', x.amount, x.date, x.category_id, 'checked')
from public.transaction_list as x where x.transfer_id = tests.id('ro_e');
select results_eq(
  format($$select transactions_removed_count, created_at_once_count from public.preview_update_transfer(%L, p_offset_days => 1, p_count => 1)$$,
         tests.id('ro_t')),
  $$values (1, 1)$$, 'R-ACCOUNT-462: the edit''s preview counts the transaction moved: one removed, one created');
select public.update_transfer(tests.id('ro_t'), pg_temp.rev(tests.id('ro_t')), p_offset_days => 1);
select public.update_transfer(tests.id('ro_e'), pg_temp.rev(tests.id('ro_e')), p_offset_days => 1);
select is(pg_temp.txs(tests.id('ro_t')), '2026-11-26', 'R-ACCOUNT-462: another offset from now: the app''s transaction is on 26 Nov');
select is(pg_temp.txs(tests.id('ro_e')), '2026-11-28', 'R-ACCOUNT-462: a transaction the member edited stays on its date');
-- should-fix 5: unlinked from its category since, a moved start leaves it
select pg_temp.day('2026-11-27', 'kim');
select pg_temp.budget('ru');
select tests.remember('ru_t', pg_temp.new_transfer('ru', 'Unlinked since', p_from => (pg_temp.cur('ru')).id, p_amount => 50000));
select public.update_transfer(tests.id('ru_t'), pg_temp.rev(tests.id('ru_t')), p_clear_category => true);
select results_eq(format($$select transfer_transactions_removed, transfer_transactions_created from public.preview_move_period_start(%L, '2026-11-27')$$,
                         (pg_temp.cur('ru')).id),
  $$values (0, 0)$$, 'R-ACCOUNT-425: the preview of the move counts nothing for an occurrence unlinked since');
select public.move_period_start((pg_temp.cur('ru')).id, (pg_temp.cur('ru')).revision, '2026-11-27');
select is(pg_temp.txs(tests.id('ru_t')), '2026-11-25',
  'R-ACCOUNT-425: unlinked from its category since, the transaction stays as it was (not removed, not made again)');

-- ===========================================================================
-- Should-fix 2 (R-ACCOUNT-427): an income added and removed in one period, a transfer made for it
-- ===========================================================================
create function pg_temp.side_job(n text) returns void language plpgsql as $$
declare
  v_job uuid;
  v_rev integer;
begin
  perform pg_temp.day('2026-11-20', 'kim');
  perform pg_temp.budget(n);
  v_job := public.add_income(tests.id(n), 'Side job', 30000, 10, 'none');
  perform tests.remember(n || '_job', v_job);
  perform tests.remember(n || '_t', (select id from public.create_transfer(tests.id(n), 'From the side job', tests.id(n || '_main'),
    tests.id(n || '_sav'), 30000, 'pay_date', p_income_id => v_job, p_is_automatic => true,
    p_category_id => tests.id(n || '_cat'), p_from_period_id => (pg_temp.cur(n)).id)));
  select i.revision into v_rev from public.incomes as i where i.id = v_job;
  perform public.remove_income(v_job, v_rev);
end $$;
-- (a) edited in the next period, then that period reopened: nothing dated a month back appears
select pg_temp.side_job('ka');
select is(pg_temp.txs(tests.id('ka_t')), '2026-11-10', 'R-ACCOUNT-427: (setup) the side job''s 10 Nov stays, nothing dated 25 Oct');
select pg_temp.day('2026-11-26', 'kim');
select public.ensure_periods(tests.id('ka'));
select public.update_transfer(tests.id('ka_t'), pg_temp.rev(tests.id('ka_t')), p_amount => 35000);
select is(pg_temp.txs(tests.id('ka_t')), '2026-11-10,2026-11-25', 'R-ACCOUNT-427: (setup) the next payday recorded');
select ok(not exists (select 1 from public.preview_reopen(tests.id('ka'), '2026-11-28') where record_kind = 'transfer' and change = 'transaction_created'),
  'R-ACCOUNT-427: the reopen''s preview creates nothing');
select public.reopen_previous_period(tests.id('ka'), (pg_temp.cur('ka')).id, (pg_temp.cur('ka')).revision, '2026-11-28');
select is(pg_temp.txs(tests.id('ka_t')), '2026-11-10',
  'R-ACCOUNT-427: after the reopen no transaction dated 25 Oct appears at the new amount (the guard belongs to the period)');
select is_empty(format($$select * from tests.moneyflow_violations(%L)$$, tests.id('ka')), 'R-ACCOUNT-427: the model agrees (a)');
-- (b) the salary recorded on 19 Nov, the day before the removal: the old period plans no payday,
-- the new period has its row
select pg_temp.side_job('kb');
select public.record_early_pay_date(tests.id('kb'), (pg_temp.cur('kb')).id, (pg_temp.cur('kb')).revision, '2026-11-19');
select is(pg_temp.txs(tests.id('kb_t')), '2026-11-10,2026-11-19',
  'R-ACCOUNT-427: the salary of 19 Nov has its transfer, and nothing dated 25 Oct appears');
select is((select rows from pg_temp.rows('kb', tests.id('kb_t')) where start_date = '2026-11-19'), '2026-11-25/2026-11-19/done',
  'R-ACCOUNT-427: the new period lists its row');
select is_empty(format($$select * from tests.moneyflow_violations(%L)$$, tests.id('kb')), 'R-ACCOUNT-427: the model agrees (b)');
-- due on the removal day itself: not planned (it was due that day)
select pg_temp.day('2026-11-25', 'kim');
select pg_temp.budget('kd');
select tests.remember('kd_job', public.add_income(tests.id('kd'), 'Side job', 30000, 10, 'none'));
select tests.remember('kd_t', (select id from public.create_transfer(tests.id('kd'), 'From the side job', tests.id('kd_main'),
  tests.id('kd_sav'), 30000, 'pay_date', p_income_id => tests.id('kd_job'), p_is_automatic => true,
  p_category_id => tests.id('kd_cat'), p_from_period_id => (pg_temp.cur('kd')).id)));
select public.remove_income(tests.id('kd_job'), (select revision from public.incomes where id = tests.id('kd_job')));
select is((select rows from pg_temp.rows('kd', tests.id('kd_t')) where start_date = '2026-11-25'), '',
  'R-ACCOUNT-427: removed on the day the primary''s occurrence is due: it is not planned (it was due that day)');
-- the next period is not touched by the guard
select pg_temp.day('2026-12-26', 'kim');
select public.ensure_periods(tests.id('kd'));
select is(pg_temp.txs(tests.id('kd_t')), '2026-12-25', 'R-ACCOUNT-427: the next period''s payday has its transfer');

-- ===========================================================================
-- Two marks no longer planned with one key, in one period: end the transfer with both rows
-- marked, undo twice, each by its row (R-ACCOUNT-301, R-ACCOUNT-460). An early salary (5 Nov,
-- keyed 25 Nov) and a fixed day 25 from the next period: key 25 Nov twice
-- ===========================================================================
select pg_temp.day('2026-11-05', 'kim');
select pg_temp.budget('two');
select tests.remember('two_t', pg_temp.new_transfer('two', 'By hand', false, tests.id('two_p1')));
select public.record_early_pay_date(tests.id('two'), (pg_temp.cur('two')).id, (pg_temp.cur('two')).revision, '2026-11-05');
select pg_temp.day('2026-11-26', 'kim');
select public.ensure_periods(tests.id('two'));
select public.update_transfer(tests.id('two_t'), pg_temp.rev(tests.id('two_t')), p_schedule => 'day_of_month', p_day_of_month => 25,
  p_first_date => '2026-11-25');
select public.mark_transfer_done(tests.id('two_t'), pg_temp.period_at('two', '2026-11-05'), 0, '2026-11-06');
select public.mark_transfer_done(tests.id('two_t'), (pg_temp.cur('two')).id, 0, '2026-11-25');
select results_eq(
  $$select start_date, rows from pg_temp.rows('two', tests.id('two_t')) where start_date >= '2026-11-05'$$,
  $$values ('2026-11-05'::date, '2026-11-25/2026-11-05/done'), ('2026-11-25', '2026-11-25/2026-11-25/done[f]')$$,
  'R-ACCOUNT-460: (setup) the early payday keyed 25 Nov and the fixed 25 Nov, each marked');
select is(public.end_transfer(tests.id('two_t'), pg_temp.rev(tests.id('two_t')), pg_temp.period_at('two', '2026-11-05')), 'ended',
  'R-ACCOUNT-460: (the transfer is ended from the early period)');
select is((select rows from pg_temp.rows('two', tests.id('two_t')) where start_date = '2026-11-25'),
  '2026-11-25/-/done/unplanned;2026-11-25/-/done/unplanned[f]',
  'R-ACCOUNT-460: the period containing 25 Nov lists both marks, no longer planned, with one key and two kinds');
select throws_ok(format($$select * from public.undo_transfer_mark(%L, %L, 1, '2026-11-25')$$, tests.id('two_t'), (pg_temp.cur('two')).id),
  'P0001', 'occurrence_required', 'R-ACCOUNT-460: the key alone names neither');
select lives_ok(format($$select * from public.undo_transfer_mark(%L, %L, 1, '2026-11-25', 'fixed_day')$$, tests.id('two_t'), (pg_temp.cur('two')).id),
  'R-ACCOUNT-301: the first undo, by its row (key and kind)');
select lives_ok(format($$select * from public.undo_transfer_mark(%L, %L, 1, '2026-11-25', 'payday')$$, tests.id('two_t'), (pg_temp.cur('two')).id),
  'R-ACCOUNT-301: the second undo, by its row');
select is(pg_temp.marks(tests.id('two_t')), '', 'R-ACCOUNT-301: no mark is left');
select is(pg_temp.txs(tests.id('two_t')), '', 'R-ACCOUNT-301: and no transaction');

select * from finish();
rollback;
