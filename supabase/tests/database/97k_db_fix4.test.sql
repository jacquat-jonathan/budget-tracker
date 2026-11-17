-- Database fix round 4 (re-check 4), as amended by round 5 (D-610): occurrences told apart by
-- their kind (R-ACCOUNT-460, R-ACCOUNT-510), a transfer naming an income once per scheduled pay
-- date of that income whatever the primary does (R-ACCOUNT-512), one naming none once per period
-- (R-ACCOUNT-511), what the app recorded by itself sits on its due date (R-ACCOUNT-462), the
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
         coalesce((select string_agg(coalesce(c.occurrence_date::text, '#' || c.occurrence_seq) || '/' || coalesce(c.due_date::text, '-') || '/' || c.status
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
  select coalesce(string_agg(coalesce(o.occurrence_date::text, '#' || o.occurrence_seq) || '/' || o.kind || '/' || o.mark || '/' || coalesce(o.done_on::text, '-')
                             || '/' || coalesce((select x.date::text from public.transactions as x where x.transfer_occurrence_id = o.id), '-'),
                             ';' order by o.occurrence_date, o.kind), '')
  from public.transfer_occurrences as o where o.transfer_id = t $$;
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
select is(pg_temp.marks(tests.id('s2_t')), '2027-03-05/fixed_day/done/2027-03-05/2027-03-05;#6/period/done/2027-02-05/2027-02-05',
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
  $$values (null::date, '2027-02-05'::date, true, 1, 0)$$,
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
  $$values ('2027-02-05'::date, '#6/-/done/unplanned'), ('2027-03-05', '2027-03-05/2027-03-05/done[f]')$$,
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
select is((select rows from pg_temp.rows('c5', tests.id('c5_t')) where start_date = '2026-11-25'), '#3/2026-11-25/done',
  'R-ACCOUNT-305: and back to payday');
select is(pg_temp.txs(tests.id('c5_t')), '2026-11-25', 'R-ACCOUNT-305: one transaction throughout');


-- ===========================================================================
-- Must-fix 2 (R-ACCOUNT-512, R-ACCOUNT-464): a pay-date transfer happens once per pay date of its
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
  $$values (0, 0, 0)$$, 'R-ACCOUNT-512: the switch''s preview: nothing recorded changes, nothing is due at once');
select pg_temp.switch('p', '_ben');
select results_eq(
  format($$select name, next_due_date from public.transfer_overview where budget_id = %L order by name$$, tests.id('p')),
  $$values ('Ben savings', '2027-01-10'::date), ('First savings', '2026-12-25'), ('Joint', '2027-01-10')$$,
  'R-ACCOUNT-464: after the switch the next due dates are Ann''s 25 Dec and Ben''s 10 Jan');
select is((select rows from pg_temp.rows('p', tests.id('p_ta')) where start_date = '2026-11-25'),
  '2026-11-25/2026-11-25/done;2026-12-25/2026-12-25/upcoming',
  'R-ACCOUNT-512: the switch period keeps the old primary''s payday and plans its own pay date after the switch day');
select pg_temp.day('2027-02-11');
select public.ensure_periods(tests.id('p'));
select is(pg_temp.since(tests.id('p_ta'), '2026-11-01'), '2026-11-25,2026-12-25,2027-01-25',
  'R-ACCOUNT-512: Ann''s savings on each of Ann''s paydays: 25 Nov, 25 Dec, 25 Jan');
select is(pg_temp.since(tests.id('p_tb'), '2026-11-01'), '2026-11-10,2026-12-10,2027-01-10,2027-02-10',
  'R-ACCOUNT-512: Ben''s savings on each of Ben''s paydays: 10 Nov, 10 Dec, 10 Jan, 10 Feb');
select is(pg_temp.since(tests.id('p_tj'), '2026-11-01'), '2026-11-25,2027-01-10,2027-02-10',
  'R-ACCOUNT-512: a transfer naming no income: once per period (25 Nov, then 10 Jan and 10 Feb)');
select is_empty(format($$select * from tests.moneyflow_violations(%L)$$, tests.id('p')), 'R-ACCOUNT-512: the model agrees (25th to 10th)');

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
  'R-ACCOUNT-512: (10th to 25th) the old primary''s savings on each of its paydays');
select is(pg_temp.since(tests.id('q_tb'), '2026-11-01'), '2026-11-25,2026-12-25,2027-01-25',
  'R-ACCOUNT-512: (10th to 25th) the new primary''s savings on each of its paydays');
select is_empty(format($$select * from tests.moneyflow_violations(%L)$$, tests.id('q')), 'R-ACCOUNT-512: the model agrees (10th to 25th)');

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
  'R-ACCOUNT-512: (switch on 5 Dec) Ann''s 25 Dec, now in Ben''s period, as a non-primary pay date');
select is(pg_temp.since(tests.id('r_tb'), '2026-11-01'), '2026-11-10,2026-12-10,2027-01-10',
  'R-ACCOUNT-512: (switch on 5 Dec) Ben''s 10 Dec starts his first period');
select is_empty(format($$select * from tests.moneyflow_violations(%L)$$, tests.id('r')), 'R-ACCOUNT-512: the model agrees (switch on 5 Dec)');

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
  'R-ACCOUNT-512: (two switches in one period, back) Ann''s savings once per payday');
select is(pg_temp.since(tests.id('t2_tb'), '2026-11-01'), '2026-11-10,2026-12-10,2027-01-10,2027-02-10',
  'R-ACCOUNT-512: (two switches in one period, back) Ben''s savings once per payday');
select is(pg_temp.since(tests.id('t2_tj'), '2026-11-01'), '2026-11-25,2026-12-25,2027-01-25',
  'R-ACCOUNT-512: (two switches in one period, back) a transfer naming no income follows Ann still');
select is_empty(format($$select * from tests.moneyflow_violations(%L)$$, tests.id('t2')), 'R-ACCOUNT-512: the model agrees (two switches)');

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
  'R-ACCOUNT-512: (Ann to Ben to Cy in one period) Ann''s savings once per payday');
select is(pg_temp.since(tests.id('t3_tb'), '2026-11-01'), '2026-11-10,2026-12-10,2027-01-10,2027-02-10',
  'R-ACCOUNT-512: (Ann to Ben to Cy) Ben never became the primary: once per payday');
select is(pg_temp.since(tests.id('t3_tc'), '2026-11-01'), '2026-11-18,2026-12-18,2027-01-18,2027-02-18',
  'R-ACCOUNT-512: (Ann to Ben to Cy) Cy''s savings once per payday');
select is_empty(format($$select * from tests.moneyflow_violations(%L)$$, tests.id('t3')), 'R-ACCOUNT-512: the model agrees (to Cy)');

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
select is(pg_temp.since(tests.id('sr_ta'), '2026-10-01'), '2026-10-25,2026-11-25,2026-12-25,2027-01-25',
  'R-ACCOUNT-512: (switch, reopen) a transfer naming Ann follows her schedule: 25 Nov too, whether her salary came');
select is(pg_temp.since(tests.id('sr_tb'), '2026-10-01'), '2026-10-10,2026-11-10,2026-12-10,2027-01-10,2027-02-10',
  'R-ACCOUNT-512: (switch, reopen) Ben''s savings once per payday');
select is_empty(format($$select * from tests.moneyflow_violations(%L)$$, tests.id('sr')), 'R-ACCOUNT-512: the model agrees (switch, reopen)');

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
  'R-ACCOUNT-512: (switch back) Ann''s savings once per payday');
select is(pg_temp.since(tests.id('sb_tb'), '2026-11-01'), '2026-11-10,2026-12-10,2027-01-10,2027-02-10,2027-03-10',
  'R-ACCOUNT-512: (switch back) Ben''s savings once per payday');
select is_empty(format($$select * from tests.moneyflow_violations(%L)$$, tests.id('sb')), 'R-ACCOUNT-512: the model agrees (switch back)');

-- weekend shifts (the previous working day): 10 Jan 2027 is a Sunday, Ben is paid on Friday 8 Jan
select pg_temp.day('2026-12-12');
select pg_temp.house('w', 25, 10, 'previous');
select pg_temp.switch('w', '_ben');
select is(pg_temp.next_due(tests.id('w_tb')), '2027-01-08'::date, 'R-ACCOUNT-464: (weekend) Ben''s next payday is Friday 8 Jan');
select pg_temp.day('2027-02-11');
select public.ensure_periods(tests.id('w'));
select is(pg_temp.since(tests.id('w_ta'), '2026-11-01'), '2026-11-25,2026-12-25,2027-01-25',
  'R-ACCOUNT-512: (weekend) Ann''s savings once per payday');
select is(pg_temp.since(tests.id('w_tb'), '2026-11-01'), '2026-11-10,2026-12-10,2027-01-08,2027-02-10',
  'R-ACCOUNT-512: (weekend) Ben''s savings once per payday, 8 Jan for the 10th');
select is_empty(format($$select * from tests.moneyflow_violations(%L)$$, tests.id('w')), 'R-ACCOUNT-512: the model agrees (weekend)');


-- the household properties hold in every budget above (tests.household_violations, R-ACCOUNT-512,
-- R-ACCOUNT-462, R-ACCOUNT-464)
select is_empty(format($$select b, v from unnest(array['s2','s5','s1','c5','p','q','r','t2','t3','sr','sb','w']) as b
                         cross join lateral tests.household_violations(tests.id(b)) as v$$),
  'R-ACCOUNT-512 R-ACCOUNT-462 R-ACCOUNT-464: the household properties hold in every budget of this file');

-- ===========================================================================
-- Q-311 (R-ACCOUNT-511): the reviewer's I2. The November salary came 17 days late (12 Dec): the
-- member moves the start; later the December period, with a mark made by hand, is reopened and
-- the salary recorded again on 28 Dec: the same key, the mark still planned, nothing to do again
-- ===========================================================================
select pg_temp.day('2026-12-27', 'kim');
select pg_temp.budget('i2');
select tests.remember('i2_t', pg_temp.new_transfer('i2', 'By hand', false, tests.id('i2_p1'), p_amount => 20000));
select public.move_period_start(pg_temp.period_at('i2', '2026-11-25'),
  (select revision from public.periods where id = pg_temp.period_at('i2', '2026-11-25')), '2026-12-12');
select public.mark_transfer_done(tests.id('i2_t'), (pg_temp.cur('i2')).id, 0);
select public.reopen_previous_period(tests.id('i2'), (pg_temp.cur('i2')).id, (pg_temp.cur('i2')).revision, '2026-12-28');
select pg_temp.day('2026-12-28', 'kim');
select public.ensure_periods(tests.id('i2'));
select is((select rows from pg_temp.rows('i2', tests.id('i2_t')) where start_date = '2026-12-28'), '#4/2026-12-28/done',
  'R-ACCOUNT-511: the mark made by hand is still that occurrence''s, planned');
select results_eq(format($$select transfers_to_do, transfers_overdue from public.get_transfers_to_do(%L)$$, tests.id('i2')),
  $$values (1, 1)$$, 'R-ACCOUNT-511: the December transfer is not to do again (only November''s, never marked)');

-- after a change of pay day from the 25th to the 26th the next salary is scheduled 26 Dec, not 26 Nov
select pg_temp.day('2026-11-27', 'kim');
select pg_temp.budget('k26');
select public.update_income(tests.id('k26_inc'), (select revision from public.incomes where id = tests.id('k26_inc')), p_pay_day => 26,
  p_previewed_end_date => (select end_date from public.preview_update_income(tests.id('k26_inc'), p_pay_day => 26)));
select pg_temp.day('2026-12-27', 'kim');
select public.ensure_periods(tests.id('k26'));

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
select is((select rows from pg_temp.rows('kb', tests.id('kb_t')) where start_date = '2026-11-19'), '#3/2026-11-19/done',
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
-- Two marks no longer planned: end the transfer with both rows
-- marked, undo twice, each by its row (R-ACCOUNT-301, R-ACCOUNT-460). An early salary (5 Nov) and
-- a fixed day 25 from the next period
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
  $$values ('2026-11-05'::date, '#3/2026-11-05/done'), ('2026-11-25', '2026-11-25/2026-11-25/done[f]')$$,
  'R-ACCOUNT-460: (setup) the early period''s own occurrence and the fixed 25 Nov, each marked');
select is(public.end_transfer(tests.id('two_t'), pg_temp.rev(tests.id('two_t')), pg_temp.period_at('two', '2026-11-05')), 'ended',
  'R-ACCOUNT-460: (the transfer is ended from the early period)');
select results_eq($$select start_date, rows from pg_temp.rows('two', tests.id('two_t')) where start_date >= '2026-11-05'$$,
  $$values ('2026-11-05'::date, '#3/-/done/unplanned'), ('2026-11-25', '2026-11-25/-/done/unplanned[f]')$$,
  'R-ACCOUNT-460: each mark, no longer planned, is listed by its own period');
select lives_ok(format($$select * from public.undo_transfer_mark(%L, %L, 1, '2026-11-25', 'fixed_day')$$, tests.id('two_t'), (pg_temp.cur('two')).id),
  'R-ACCOUNT-301: the first undo, by its row (date and kind)');
select lives_ok(format($$select * from public.undo_transfer_mark(%L, %L, 1, null, 'period', 3)$$, tests.id('two_t'),
  pg_temp.period_at('two', '2026-11-05')), 'R-ACCOUNT-301: the second undo, by its row (kind and number)');
select is(pg_temp.marks(tests.id('two_t')), '', 'R-ACCOUNT-301: no mark is left');
select is(pg_temp.txs(tests.id('two_t')), '', 'R-ACCOUNT-301: and no transaction');


-- ===========================================================================
-- Should-fix 1 (R-ACCOUNT-465, R-ACCOUNT-422, R-ACCOUNT-423): the money flow. A linked transfer
-- into an everyday account never leaves the spendable pool
-- ===========================================================================
-- the budget's income paid into Main, its category Saving planned 0
create function pg_temp.flow_setup(n text) returns void language plpgsql as $$
declare
  v_inc uuid := tests.id(n || '_inc');
  v_cat uuid := tests.id(n || '_cat');
  v_rev integer;
begin
  select i.revision into v_rev from public.income_overview as i where i.id = v_inc;
  perform public.update_income(v_inc, v_rev, p_account_id => tests.id(n || '_main'), p_from_period_id => tests.id(n || '_p1'));
  select c.revision into v_rev from public.category_overview as c where c.id = v_cat;
  perform public.update_category(v_cat, v_rev, p_amount => 0, p_from_period_id => tests.id(n || '_p1'));
end $$;
create function pg_temp.flow(n text) returns table (row_kind text, name text, amount bigint, stays bigint, spendable boolean,
  expected bigint, transfer_share bigint, spent bigint, transfer_spent bigint, left_amount bigint, is_negative boolean,
  display_order integer)
language sql as $$
  select f.row_kind, f.name, f.amount, f.stays, f.spendable, f.expected, f.transfer_share, f.spent, f.transfer_spent, f.left_amount,
         f.is_negative, f.display_order
  from public.get_money_flow(tests.id(n)) as f $$;
create function pg_temp.flow_total(n text) returns text language sql as $$
  select f.amount || ' = ' || f.set_aside || ' + ' || f.spendable_amount || ' = ' || f.set_aside || ' + ' || f.planned_spending || ' + '
         || f.not_planned || ' = ' || f.set_aside || ' + ' || f.actual_spending || ' + ' || f.left_amount
         || case when f.is_negative then ' (negative)' else '' end
  from public.get_money_flow(tests.id(n)) as f where f.row_kind = 'total' $$;

select pg_temp.day('2026-11-20', 'kit');
select pg_temp.budget('f2');
select pg_temp.flow_setup('f2');
select tests.remember('f2_cash', (select id from public.create_account(tests.id('f2'), 'Cash', 'cash', p_from_period_id => tests.id('f2_p1'))));
select tests.remember('f2_pm', (select id from public.create_category(tests.id('f2'), 'Pocket money', p_amount => 50000, p_from_period_id => tests.id('f2_p1'))));
select tests.remember('f2_food', (select id from public.create_category(tests.id('f2'), 'Food', p_amount => 80000, p_from_period_id => tests.id('f2_p1'))));
select public.create_transfer(tests.id('f2'), 'Pocket money', tests.id('f2_main'), tests.id('f2_cash'), 50000, 'pay_date',
  p_is_automatic => true, p_category_id => tests.id('f2_pm'), p_from_period_id => (pg_temp.cur('f2')).id);
select public.add_transaction(tests.id('f2'), 'expense', 30000, '2026-11-05', tests.id('f2_food'));
select results_eq(
  $$select name, amount, transfer_share, spent, transfer_spent, left_amount from pg_temp.flow('f2') where row_kind = 'spending' order by name$$,
  $$values ('Food'::text, 80000::bigint, 0::bigint, 30000::bigint, 0::bigint, 50000::bigint),
           ('Pocket money', 50000, 0, 50000, 0, 0)$$,
  'R-ACCOUNT-465 R-ACCOUNT-466: a transfer into the cash wallet: its share is planned spending and its transaction is spent; each row''s own left');
select is(pg_temp.flow_total('f2'), '600000 = 0 + 600000 = 0 + 130000 + 470000 = 0 + 80000 + 520000',
  'R-ACCOUNT-422: income = set aside + spendable = planned + not planned = spent + left');
select results_eq(
  format($$select planned_spending, actual_spending from public.get_money_flow(%L) where row_kind = 'total'$$, tests.id('f2')),
  format($$select expected_total, spent_total from public.period_summaries where id = %L$$, (pg_temp.cur('f2')).id),
  'R-ACCOUNT-465: the flow''s planned and spent agree with the period summary');

-- all eight account kinds; a set-aside transfer's share capped at what its category expects
select pg_temp.budget('f8');
select pg_temp.flow_setup('f8');
select tests.remember('f8_' || k, (select id from public.create_account(tests.id('f8'), 'Acc ' || k, k::public.account_kind,
                                                                         p_from_period_id => tests.id('f8_p1'))))
from unnest(array['cash', 'credit_card', 'other', 'third_pillar', 'tax_reserve', 'investment']) as k;
select public.create_transfer(tests.id('f8'), 'To ' || k, tests.id('f8_main'), tests.id('f8_' || k), 10000, 'pay_date',
  p_from_period_id => tests.id('f8_p1'))
from unnest(array['cash', 'credit_card', 'other', 'third_pillar', 'tax_reserve', 'investment']) as k;
select public.create_transfer(tests.id('f8'), 'To savings', tests.id('f8_main'), tests.id('f8_sav'), 100000, 'pay_date',
  p_category_id => tests.id('f8_cat'), p_from_period_id => tests.id('f8_p1'));
select public.update_category(tests.id('f8_cat'), (select revision from public.categories where id = tests.id('f8_cat')),
  p_amount => 60000, p_from_period_id => tests.id('f8_p1'));
select results_eq(
  $$select name, spendable from pg_temp.flow('f8') where row_kind = 'account' order by name$$,
  $$values ('Acc cash'::text, true), ('Acc credit_card', true), ('Acc investment', false), ('Acc other', true),
           ('Acc tax_reserve', false), ('Acc third_pillar', false), ('Main', true), ('Savings', false)$$,
  'R-ACCOUNT-423: current, cash, credit card and other are spendable; savings, third pillar, tax reserve and investment are set aside');
select is(pg_temp.flow_total('f8'), '600000 = 130000 + 470000 = 130000 + 0 + 470000 = 130000 + 0 + 470000',
  'R-ACCOUNT-423: set aside = what stays on the four set-aside accounts (1 000 + 3 x 100)');
select results_eq(
  $$select expected, transfer_share, amount, left_amount from pg_temp.flow('f8') where row_kind = 'spending'$$,
  $$values (60000::bigint, 60000::bigint, 0::bigint, 0::bigint)$$,
  'R-ACCOUNT-422: a set-aside transfer''s share is at most what its category expects (1 000 against 600)');

-- rows: a category neither planned nor spent has none; one spent but not planned has one (left
-- negative); the display order, not the name; not_planned exactly 0 is not negative; "not
-- assigned" is spendable
select pg_temp.budget('fr');
select public.update_category(tests.id('fr_cat'), (select revision from public.categories where id = tests.id('fr_cat')),
  p_amount => 0, p_from_period_id => tests.id('fr_p1'));
select tests.remember('fr_z', (select id from public.create_category(tests.id('fr'), 'Z first by order', p_amount => 0, p_from_period_id => tests.id('fr_p1'))));
select tests.remember('fr_b', (select id from public.create_category(tests.id('fr'), 'B plan', p_amount => 600000, p_from_period_id => tests.id('fr_p1'))));
select public.add_transaction(tests.id('fr'), 'expense', 2500, '2026-11-05', tests.id('fr_z'));
select results_eq(
  $$select name, amount, spent, left_amount, is_negative from pg_temp.flow('fr') where row_kind = 'spending' order by name$$,
  $$values ('B plan'::text, 600000::bigint, 0::bigint, 600000::bigint, false), ('Z first by order', 0, 2500, -2500, true)$$,
  'R-ACCOUNT-422 R-ACCOUNT-466: no row for a category neither planned nor spent; one spent but not planned, its own left negative');
select is((select string_agg(x.name, ',' order by x.o) from (select f.name, row_number() over () as o from pg_temp.flow('fr') as f) as x
           where x.name in ('B plan', 'Z first by order')),
  'Z first by order,B plan', 'R-ACCOUNT-422: spending rows in the categories'' display order, not by name');
select is((select f.not_planned::text || '/' || f.is_negative from public.get_money_flow(tests.id('fr')) as f where f.row_kind = 'total'),
  '0/false', 'R-ACCOUNT-422: not planned exactly 0 is not negative');
select results_eq($$select stays, spendable from pg_temp.flow('fr') where row_kind = 'not_assigned'$$,
  $$values (600000::bigint, true)$$, 'R-ACCOUNT-423: the incomes paid into no account are spendable');


-- ===========================================================================
-- The reviewer's surviving breaks (re-check 4), transfers
-- ===========================================================================
-- the chosen income ended in the period (D-492's branch): the first counted day is compared with
-- the salary's day, never the key (R-ACCOUNT-511), and the salary the transfer was made from counts
select pg_temp.day('2026-11-20', 'kit');
select pg_temp.budget('ea');
select public.record_early_pay_date(tests.id('ea'), (pg_temp.cur('ea')).id, (pg_temp.cur('ea')).revision, '2026-11-20');
select tests.remember('ea_par', public.add_income(tests.id('ea'), 'Partner', 300000, 10, 'none', p_from_period_id => tests.id('ea_p1')));
select pg_temp.day('2026-11-22', 'kit');
select tests.remember('ea_t', (select id from public.create_transfer(tests.id('ea'), 'After the partner', tests.id('ea_main'), tests.id('ea_sav'),
  1000, 'pay_date', p_offset_days => 5, p_income_id => tests.id('ea_par'), p_is_automatic => true, p_category_id => tests.id('ea_cat'))));
select tests.model_made_from_today(tests.id('ea_t'));
select is(public.remove_income(tests.id('ea_par'), (select revision from public.incomes where id = tests.id('ea_par'))), 'ended',
  'R-ACCOUNT-511: (the partner''s income ends today, in the period it was chosen in)');
select is((select rows from pg_temp.rows('ea', tests.id('ea_t')) where start_date = '2026-11-20'), '',
  'R-ACCOUNT-511: the salary came on 20 Nov (scheduled 25 Nov), before the transfer was made on 22 Nov: no occurrence, also where its chosen income ended');
select is_empty(format($$select * from tests.moneyflow_violations(%L)$$, tests.id('ea')), 'R-ACCOUNT-511: the model agrees (ended, A)');
-- made from its period while the salary was late (scheduled 25 Nov, came 28 Nov), the income ended,
-- then the salary recorded earlier (23 Nov): it is the salary the transfer was made from
select pg_temp.day('2026-11-28', 'kit');
select pg_temp.budget('eb');
select tests.remember('eb_par', public.add_income(tests.id('eb'), 'Partner', 300000, 10, 'none', p_from_period_id => tests.id('eb_p1')));
select public.move_period_start((pg_temp.cur('eb')).id, (pg_temp.cur('eb')).revision, '2026-11-28');
select tests.remember('eb_t', (select id from public.create_transfer(tests.id('eb'), 'After the partner', tests.id('eb_main'), tests.id('eb_sav'),
  1000, 'pay_date', p_offset_days => 10, p_income_id => tests.id('eb_par'), p_is_automatic => true, p_category_id => tests.id('eb_cat'),
  p_from_period_id => (pg_temp.cur('eb')).id)));
select is(public.remove_income(tests.id('eb_par'), (select revision from public.incomes where id = tests.id('eb_par'))), 'ended',
  'R-ACCOUNT-511: (the partner''s income ends on 28 Nov)');
select public.move_period_start((pg_temp.cur('eb')).id, (pg_temp.cur('eb')).revision, '2026-11-23');
select is((select rows from pg_temp.rows('eb', tests.id('eb_t')) where start_date = '2026-11-23'), '#3/2026-12-03/upcoming',
  'R-ACCOUNT-511: recorded on 23 Nov, before its first counted day, the salary it was made from still counts (its period), where its income ended');

-- the same payday late by more than 15 days: still one (the new primary's late salary)
select pg_temp.day('2026-12-05', 'kit');
select pg_temp.house('lt', 25, 10);
select pg_temp.switch('lt', '_ben');
select pg_temp.day('2026-12-30', 'kit');
select public.ensure_periods(tests.id('lt'));
select public.move_period_start((pg_temp.cur('lt')).id, (pg_temp.cur('lt')).revision, '2026-12-30');
select is(pg_temp.since(tests.id('lt_tb'), '2026-11-01'), '2026-11-10,2026-12-10',
  'R-ACCOUNT-510: Ben''s December salary came 20 days late (30 Dec, scheduled 10 Dec): one transfer, on his 10 Dec, not two');
select is_empty(format($$select * from tests.household_violations(%L)$$, tests.id('lt')), 'R-ACCOUNT-512: the household properties hold (late)');

-- marks on the later of two rows with one date: an early salary (5 Nov, scheduled 25 Nov) and a fixed
-- day 25 from the next period (R-ACCOUNT-460)
select pg_temp.day('2026-11-05', 'kit');
select pg_temp.budget('lm');
select tests.remember('lm_t', pg_temp.new_transfer('lm', 'By hand', false, tests.id('lm_p1')));
select public.record_early_pay_date(tests.id('lm'), (pg_temp.cur('lm')).id, (pg_temp.cur('lm')).revision, '2026-11-05');
select pg_temp.day('2026-11-26', 'kit');
select public.ensure_periods(tests.id('lm'));
select public.update_transfer(tests.id('lm_t'), pg_temp.rev(tests.id('lm_t')), p_schedule => 'day_of_month', p_day_of_month => 25,
  p_first_date => '2026-11-25');
select results_eq(format($$select transfers_to_do, transfers_overdue from public.get_transfers_to_do(%L)$$, tests.id('lm')),
  $$values (2, 2)$$, 'R-ACCOUNT-460: (both rows with key 25 Nov are to do, each counted)');
select public.mark_transfer_done(tests.id('lm_t'), (pg_temp.cur('lm')).id, 0, '2026-11-25', p_occurrence_kind => 'fixed_day');
select results_eq(
  $$select start_date, rows from pg_temp.rows('lm', tests.id('lm_t')) where start_date >= '2026-11-05'$$,
  $$values ('2026-11-05'::date, '#3/2026-11-05/to_do'), ('2026-11-25', '2026-11-25/2026-11-25/done[f]')$$,
  'R-ACCOUNT-460: done on the later row marks that row only');
select results_eq(format($$select transfers_to_do, transfers_overdue from public.get_transfers_to_do(%L)$$, tests.id('lm')),
  $$values (1, 1)$$, 'R-ACCOUNT-460: the dashboard counts the earlier row still to do');
select public.delete_transaction(x.id, x.revision) from public.transaction_list as x where x.transfer_id = tests.id('lm_t');
select results_eq(
  $$select start_date, rows from pg_temp.rows('lm', tests.id('lm_t')) where start_date >= '2026-11-05'$$,
  $$values ('2026-11-05'::date, '#3/2026-11-05/to_do'), ('2026-11-25', '2026-11-25/2026-11-25/to_do[f]')$$,
  'R-ACCOUNT-460: deleting its transaction puts the later row back to do, the earlier untouched');
select public.mark_transfer_done(tests.id('lm_t'), pg_temp.period_at('lm', '2026-11-05'), 0, '2026-11-06');
select is(public.end_transfer(tests.id('lm_t'), pg_temp.rev(tests.id('lm_t')), (pg_temp.cur('lm')).id), 'ended',
  'R-ACCOUNT-460: (ended from the period of the later row)');
select results_eq(
  $$select start_date, rows from pg_temp.rows('lm', tests.id('lm_t')) where start_date >= '2026-11-05'$$,
  $$values ('2026-11-05'::date, '#3/2026-11-05/done'), ('2026-11-25', '')$$,
  'R-ACCOUNT-460: ending it keeps the earlier row''s mark, still planned, and lists nothing for the later period');
-- automatic: not done on the later row leaves the earlier row's transaction
select pg_temp.day('2026-11-05', 'kit');
select pg_temp.budget('la');
select tests.remember('la_t', pg_temp.new_transfer('la', 'Automatic', true, tests.id('la_p1')));
select public.record_early_pay_date(tests.id('la'), (pg_temp.cur('la')).id, (pg_temp.cur('la')).revision, '2026-11-05');
select pg_temp.day('2026-11-26', 'kit');
select public.ensure_periods(tests.id('la'));
select public.update_transfer(tests.id('la_t'), pg_temp.rev(tests.id('la_t')), p_schedule => 'day_of_month', p_day_of_month => 25,
  p_first_date => '2026-11-25');
select is(pg_temp.since(tests.id('la_t'), '2026-11-01'), '2026-11-05,2026-11-25', 'R-ACCOUNT-460: (setup) both recorded');
select public.mark_transfer_not_done(tests.id('la_t'), (pg_temp.cur('la')).id, c.mark_revision, '2026-11-25', 'fixed_day')
from public.get_transfer_checklist((pg_temp.cur('la')).id) as c where c.transfer_id = tests.id('la_t');
select is(pg_temp.since(tests.id('la_t'), '2026-11-01'), '2026-11-05',
  'R-ACCOUNT-460: not done on the later row removes its transaction only');
select is(pg_temp.marks(tests.id('la_t')) like '%2026-11-25/fixed_day/not_done/-/-;%#3/period/done/2026-11-05/2026-11-05%', true,
  'R-ACCOUNT-460: each row keeps its own mark');

-- R-ACCOUNT-424: a reopen that ends a transfer one period earlier keeps the catch-up's own mark of
-- an occurrence still planned (it is not frozen)
select pg_temp.day('2026-11-26', 'kit');
select pg_temp.budget('rk');
select tests.remember('rk_t', pg_temp.new_transfer('rk', 'Standing', true, tests.id('rk_p1')));
select is(public.end_transfer(tests.id('rk_t'), pg_temp.rev(tests.id('rk_t')), (pg_temp.cur('rk')).id), 'ended',
  'R-ACCOUNT-424: (ended from the current period)');
select public.reopen_previous_period(tests.id('rk'), (pg_temp.cur('rk')).id, (pg_temp.cur('rk')).revision, '2026-11-28');
select results_eq(
  format($$select occurrence_seq, by_catch_up from public.transfer_occurrences where transfer_id = %L order by 1$$, tests.id('rk_t')),
  $$values (1, true), (2, false), (3, false)$$,
  'R-ACCOUNT-424: the reopen keeps the mark of the period the end now removes, and leaves the one still planned to the catch-up');

-- ===========================================================================
-- The reviewer's surviving breaks, import (R-IMPORT-420, D-452, D-522, D-523)
-- ===========================================================================
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
create function pg_temp.row1(n integer, d date default '2026-11-10') returns jsonb language sql as $$
  select jsonb_build_array(jsonb_build_object('date', d, 'amount', n, 'direction', 'debit', 'description', 'Shop ' || n)) $$;
select pg_temp.day('2026-11-16', 'kit');
select tests.remember('im', public.create_budget('Import survivors', 'Salary', 600000, 25, 'none', '2026-09-01'));
-- the 2001st import kept is refused naming imports_kept (2 kept here)
select tests.clear_authentication();
create or replace function private.limit_import_batches_kept() returns integer language sql immutable set search_path = '' as $f$ select 2 $f$;
select pg_temp.day('2026-11-16', 'kit');
select public.import_transactions(tests.id('im'), gen_random_uuid(), 1, pg_temp.row1(9001), 'csv');
select public.import_transactions(tests.id('im'), gen_random_uuid(), 1, pg_temp.row1(9002), 'csv');
select is(pg_temp.refusal(format($$select * from public.import_transactions(%L, gen_random_uuid(), 1, %L, 'csv')$$, tests.id('im'),
  pg_temp.row1(9003))), 'import_limit_reached {"limit" : "imports_kept"}',
  'R-IMPORT-420: beyond the imports kept, a new import is refused naming imports_kept in its detail');
select tests.clear_authentication();
create or replace function private.limit_import_batches_kept() returns integer language sql immutable set search_path = '' as $f$ select 2000 $f$;
select pg_temp.day('2026-11-16', 'kit');
-- import anyway: an id of another batch, the same id twice, an unknown id alone
create temp table imk on commit drop as
  select * from public.import_transactions(tests.id('im'), gen_random_uuid(), 1, pg_temp.row1(9001), 'csv');
grant select on imk to authenticated;
select is((select action from imk), 'skip_duplicate', 'D-523: (setup) a duplicate is skipped and kept');
select tests.clear_authentication();
select tests.remember('imk_row', (select id from public.import_skipped_rows where budget_id = tests.id('im') limit 1));
select tests.remember('imk_batch', (select batch_id from public.import_skipped_rows where budget_id = tests.id('im') limit 1));
select tests.remember('imk_other', (select id from public.import_batches where budget_id = tests.id('im') and id <> tests.id('imk_batch')
                                     order by created_at limit 1));
select pg_temp.day('2026-11-16', 'kit');
select results_eq(
  format($$select action, reason, valid from public.import_skipped_anyway(%L, array[%L::uuid])$$, tests.id('imk_other'), tests.id('imk_row')),
  $$values ('not_kept'::text, 'not_kept'::text, false)$$,
  'D-523: a skipped row of another batch is not kept by this one: one not_kept row');
select is((select count(*)::integer from public.import_skipped_anyway(tests.id('imk_batch'),
                                                                      array['00000000-0000-0000-0000-00000000abcd'::uuid,
                                                                            '00000000-0000-0000-0000-00000000abcd'::uuid])),
  1, 'D-523: an id sent twice answers one row');
select results_eq(
  format($$select action, reason, valid from public.import_skipped_anyway(%L, array[gen_random_uuid()])$$, tests.id('imk_batch')),
  $$values ('not_kept'::text, 'not_kept'::text, false)$$,
  'D-523: an unknown id alone (nothing imported) still answers its not_kept row');
-- a written part whose answer is forgotten: chunk_expired (D-522)
select tests.remember('imw', gen_random_uuid());
select public.import_transactions(tests.id('im'), tests.id('imw'), 1, pg_temp.row1(9101), 'csv');
select tests.clear_authentication();
create or replace function private.limit_import_answers_kept() returns integer language sql immutable set search_path = '' as $f$ select 0 $f$;
select pg_temp.day('2026-11-16', 'kit');
select public.import_transactions(tests.id('im'), tests.id('imw'), 2, pg_temp.row1(9102), 'csv');
select is(pg_temp.refusal(format($$select public.preview_import_part(%L, %L, 1, %L)$$, tests.id('im'), tests.id('imw'), pg_temp.row1(9101))),
  'chunk_expired', 'D-522: previewing a written part whose answer is no longer kept answers chunk_expired');
select tests.clear_authentication();
create or replace function private.limit_import_answers_kept() returns integer language sql immutable set search_path = '' as $f$ select 50 $f$;
select pg_temp.day('2026-11-16', 'kit');


-- ===========================================================================
-- This round's own surviving breaks
-- ===========================================================================
-- end_transfer leaves the catch-up's marks of fixed days still planned in earlier periods to it
-- (it looks at each mark's own kind)
select pg_temp.day('2026-11-26', 'kit');
select pg_temp.budget('ef');
select tests.remember('ef_t', (select id from public.create_transfer(tests.id('ef'), 'On the 5th', tests.id('ef_main'), tests.id('ef_sav'),
  1000, 'day_of_month', p_day_of_month => 5, p_is_automatic => true, p_category_id => tests.id('ef_cat'),
  p_from_period_id => tests.id('ef_p1'))));
select is(public.end_transfer(tests.id('ef_t'), pg_temp.rev(tests.id('ef_t')), (pg_temp.cur('ef')).id), 'ended',
  'R-ACCOUNT-460: (a fixed-day transfer ended from the current period)');
select results_eq(
  format($$select occurrence_date, kind::text, by_catch_up from public.transfer_occurrences where transfer_id = %L order by 1$$, tests.id('ef_t')),
  $$values ('2026-10-05'::date, 'fixed_day'::text, true), ('2026-11-05', 'fixed_day', true)$$,
  'R-ACCOUNT-460: the catch-up''s marks of fixed days still planned stay its own (not frozen by the end)');

-- a period's own mark no longer planned is listed by its own period, the fixed day by the period
-- containing it
select pg_temp.day('2026-11-05', 'kit');
select pg_temp.budget('ok');
select tests.remember('ok_t', pg_temp.new_transfer('ok', 'By hand', false, tests.id('ok_p1')));
select public.record_early_pay_date(tests.id('ok'), (pg_temp.cur('ok')).id, (pg_temp.cur('ok')).revision, '2026-11-05');
select public.mark_transfer_done(tests.id('ok_t'), (pg_temp.cur('ok')).id, 0, '2026-11-05');
select pg_temp.day('2026-11-26', 'kit');
select public.ensure_periods(tests.id('ok'));
select public.update_transfer(tests.id('ok_t'), pg_temp.rev(tests.id('ok_t')), p_schedule => 'day_of_month', p_day_of_month => 25,
  p_first_date => '2026-11-25', p_from_period_id => pg_temp.period_at('ok', '2026-11-05'));
select results_eq($$select start_date, rows from pg_temp.rows('ok', tests.id('ok_t')) where start_date >= '2026-11-05'$$,
  $$values ('2026-11-05'::date, '#3/-/done/unplanned'), ('2026-11-25', '2026-11-25/2026-11-25/to_do[f]')$$,
  'R-ACCOUNT-460: the period''s own mark no longer planned stays listed by its period; the fixed day is the next period''s, to do');

-- a transfer naming Ann follows her schedule whenever her salary is recorded (her December salary
-- 13 days early, then Ben made the primary); "Joint" naming none follows the periods
select pg_temp.day('2026-12-01', 'kit');
select pg_temp.house('eb2', 25, 20);
select tests.remember('eb2_par', public.add_income(tests.id('eb2'), 'Partner', 200000, 25, 'none', p_from_period_id => tests.id('eb2_p1')));
select public.set_expected_pay_date(tests.id('eb2'), (pg_temp.cur('eb2')).id, (pg_temp.cur('eb2')).revision, '2026-12-12');
select pg_temp.day('2026-12-12', 'kit');
select public.ensure_periods(tests.id('eb2'));
select public.set_expected_pay_date(tests.id('eb2'), (pg_temp.cur('eb2')).id, (pg_temp.cur('eb2')).revision, '2026-12-20');
select pg_temp.switch('eb2', '_ben');
select pg_temp.day('2026-12-26', 'kit');
select public.ensure_periods(tests.id('eb2'));
select is(pg_temp.since(tests.id('eb2_ta'), '2026-12-01'), '2026-12-25',
  'R-ACCOUNT-512: Ann''s December transfer is on her scheduled 25 Dec, once, though her salary came on 12 Dec');
select public.update_transfer(tests.id('eb2_tj'), pg_temp.rev(tests.id('eb2_tj')), p_income_id => tests.id('eb2_par'));
select is(pg_temp.since(tests.id('eb2_tj'), '2026-12-01'), '2026-12-12,2026-12-25',
  'R-ACCOUNT-510: "Joint": the period of 12 Dec''s own occurrence, then from the next period the partner''s 25 Dec, never compared');
select is_empty(format($$select * from tests.household_violations(%L)$$, tests.id('eb2')), 'R-ACCOUNT-512: the household properties hold (eb2)');

-- the old primary's salary 13 days early, then a switch: a transfer naming her is on her schedule
select pg_temp.day('2026-12-12', 'kit');
select pg_temp.house('ek', 25, 10);
select public.record_early_pay_date(tests.id('ek'), (pg_temp.cur('ek')).id, (pg_temp.cur('ek')).revision, '2026-12-12');
select pg_temp.day('2026-12-15', 'kit');
select pg_temp.switch('ek', '_ben');
select pg_temp.day('2027-01-11', 'kit');
select public.ensure_periods(tests.id('ek'));
select is(pg_temp.since(tests.id('ek_ta'), '2026-12-01'), '2026-12-25',
  'R-ACCOUNT-512: Ann''s salary of 12 Dec, then the switch: one transfer for December, on her 25 Dec');

-- a switch back in the same period is no switch, also with the period's end set by hand
select pg_temp.day('2026-12-01', 'kit');
select pg_temp.house('sx', 25, 10);
select public.set_expected_pay_date(tests.id('sx'), (pg_temp.cur('sx')).id, (pg_temp.cur('sx')).revision, '2027-01-10');
select pg_temp.day('2026-12-12', 'kit');
select pg_temp.switch('sx', '_ben');
select pg_temp.day('2026-12-15', 'kit');
select pg_temp.switch('sx', '_inc');
select pg_temp.day('2027-01-11', 'kit');
select public.ensure_periods(tests.id('sx'));
select is(pg_temp.since(tests.id('sx_ta'), '2026-12-01'), '2026-12-25',
  'R-ACCOUNT-512: Ann''s December transfer is on her 25 Dec, whatever day her salary came (10 Jan) and the switches');
select is(pg_temp.since(tests.id('sx_tj'), '2026-12-01'), '2027-01-10',
  'R-ACCOUNT-511: "Joint" follows the period: the salary of 10 Jan');

-- after a switch the new primary's salary comes 21 days early (20 Dec, for 10 Jan): a transfer naming
-- him has his 10 Dec, and 10 Jan on the schedule
select pg_temp.day('2026-12-12', 'kit');
select pg_temp.house('ef2', 25, 10);
select pg_temp.switch('ef2', '_ben');
select pg_temp.day('2026-12-20', 'kit');
select public.record_early_pay_date(tests.id('ef2'), (pg_temp.cur('ef2')).id, (pg_temp.cur('ef2')).revision, '2026-12-20');
select is(pg_temp.since(tests.id('ef2_tb'), '2026-12-01'), '2026-12-10',
  'R-ACCOUNT-512: Ben''s 10 Dec; his salary of 20 Dec (for 10 Jan) is not a transfer before 10 Jan');
select is(pg_temp.since(tests.id('ef2_tj'), '2026-12-01'), '2026-12-20',
  'R-ACCOUNT-511: "Joint": the period his early salary started has its own occurrence');

-- a salary 18 days late, recorded after a reopen: the next key after the previous one (25 Dec)
select pg_temp.day('2026-12-27', 'kit');
select pg_temp.budget('lk2');
select public.reopen_previous_period(tests.id('lk2'), (pg_temp.cur('lk2')).id, (pg_temp.cur('lk2')).revision, '2027-01-12');
select pg_temp.day('2027-01-12', 'kit');
select public.ensure_periods(tests.id('lk2'));

-- already_recorded (Q-322): a mark from before the change, not one the change makes
select pg_temp.day('2026-11-26', 'kit');
select pg_temp.budget('ar');
select tests.remember('ar_t', pg_temp.new_transfer('ar', 'Standing', true, tests.id('ar_p1')));
select results_eq(
  format($$select occurrence_date, already_recorded, occurrence_kind::text from public.preview_update_transfer(%L, p_amount => 120000, p_count => 4)
           where not projected$$, tests.id('ar_t')),
  $$values (null::date, true, 'period'::text)$$,
  'R-ACCOUNT-303: the edit''s preview says which occurrences are already recorded (and stay as they are)');
select results_eq(
  format($$select occurrence_date, created_at_once, already_recorded from public.preview_create_transfer(%L, %L, %L, 1000, 'pay_date',
           p_is_automatic => true, p_category_id => %L, p_from_period_id => %L, p_count => 1)$$,
         tests.id('ar'), tests.id('ar_main'), tests.id('ar_sav'), tests.id('ar_cat'), (pg_temp.cur('ar')).id),
  $$values (null::date, true, false)$$,
  'R-ACCOUNT-303: an occurrence the write creates at once is not already recorded');

-- R-ACCOUNT-427: deleted outright on 20 Nov, the primary's occurrence of that period not yet due
-- then (offset 28: due 22 Nov) is still planned
select pg_temp.day('2026-11-20', 'kit');
select pg_temp.budget('kg');
select tests.remember('kg_job', public.add_income(tests.id('kg'), 'Side job', 30000, 10, 'none'));
select tests.remember('kg_t', (select id from public.create_transfer(tests.id('kg'), 'Four weeks on', tests.id('kg_main'), tests.id('kg_sav'),
  30000, 'pay_date', p_offset_days => 28, p_income_id => tests.id('kg_job'), p_is_automatic => true, p_category_id => tests.id('kg_cat'),
  p_from_period_id => (pg_temp.cur('kg')).id)));
select is(public.remove_income(tests.id('kg_job'), (select revision from public.incomes where id = tests.id('kg_job'))), 'deleted',
  'R-ACCOUNT-427: (the side job is deleted outright on 20 Nov)');
select is((select rows from pg_temp.rows('kg', tests.id('kg_t')) where start_date = '2026-10-25'), '#2/2026-11-22/upcoming',
  'R-ACCOUNT-427: the primary''s occurrence not yet due that day (22 Nov) is planned');

-- R-ACCOUNT-426: a move to the start the period already has changes nothing, the end set by hand
-- on the scheduled day included
select pg_temp.day('2026-11-20', 'kit');
select pg_temp.budget('mz');
select public.set_expected_pay_date(tests.id('mz'), (pg_temp.cur('mz')).id, (pg_temp.cur('mz')).revision, '2026-11-25');
select pg_temp.day('2026-11-26', 'kit');
select public.ensure_periods(tests.id('mz'));
create temp table mz_before on commit drop as
  select end_is_manual, revision from public.periods where id = pg_temp.period_at('mz', '2026-11-20');
grant select on mz_before to authenticated;
select public.move_period_start((pg_temp.cur('mz')).id, (pg_temp.cur('mz')).revision);
select results_eq(format($$select end_is_manual, revision from public.periods where id = %L$$, pg_temp.period_at('mz', '2026-11-20')),
  $$select end_is_manual, revision from mz_before$$,
  'R-ACCOUNT-426: a move to the start the period has leaves the period before exactly as it was');

select * from finish();
rollback;
