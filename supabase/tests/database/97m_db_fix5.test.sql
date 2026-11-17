-- Database fix round 5: three kinds of schedule, each with an identity nothing else can disturb
-- (D-610). A transfer naming no income has one occurrence per period, identified by the
-- period's number (R-ACCOUNT-511); one naming an income one per scheduled pay date of that
-- income, whichever is the primary and whenever the salary is recorded (R-ACCOUNT-512); a fixed
-- day one per calendar date, with a weekend rule (R-ACCOUNT-513). The reviewer's scenarios of
-- re-check 5 (D1, D2, K5, T1, C1, C2, T2, R1), the carry-over whatever the arguments
-- (R-ACCOUNT-305), next_due_date checked by moving the clock (R-ACCOUNT-464), the previews of an
-- early or expected salary (R-ACCOUNT-516), the moved count (R-ACCOUNT-517), the checklist's
-- income (R-ACCOUNT-518), the exact snapshot bounds (R-ACCOUNT-519) and access.
begin;
select no_plan();

select tests.create_user('mia', 'Mia');
select tests.create_user('max', 'Max');
select tests.set_today('2026-11-16');
select tests.authenticate_as('mia');

create function pg_temp.day(d date, who text default 'mia') returns void language plpgsql as $$
begin
  perform tests.clear_authentication();
  perform tests.set_today(d);
  perform tests.authenticate_as(who);
  perform public.ensure_periods(b.id) from public.budgets as b
  where exists (select 1 from public.budget_members as m where m.budget_id = b.id and m.user_id = auth.uid());
end $$;
-- a budget whose salary (Ann) is paid on p_day, started in September 2026, with Main, Savings, the
-- category Saving, and Ben (paid on the 10th) and Cy (on the 18th)
create function pg_temp.budget(n text, p_day integer default 25) returns void language plpgsql as $$
declare
  b uuid;
  p1 uuid;
begin
  b := public.create_budget('Budget ' || n, 'Ann', 600000, p_day, 'none', '2026-09-01');
  p1 := (select id from public.periods where budget_id = b and seq = 1);
  perform tests.remember(n, b);
  perform tests.remember(n || '_p1', p1);
  perform tests.remember(n || '_ann', (select primary_income_id from public.budgets where id = b));
  perform tests.remember(n || '_ben', public.add_income(b, 'Ben', 400000, 10, 'none', p_from_period_id => p1));
  perform tests.remember(n || '_cy', public.add_income(b, 'Cy', 300000, 18, 'none', p_from_period_id => p1));
  perform tests.remember(n || '_main', (select id from public.create_account(b, 'Main', 'current', p_from_period_id => p1)));
  perform tests.remember(n || '_sav', (select id from public.create_account(b, 'Savings', 'savings', p_from_period_id => p1)));
  perform tests.remember(n || '_cat', (select id from public.create_category(b, 'Saving', p_amount => 100000, p_from_period_id => p1)));
end $$;
create function pg_temp.cur(n text) returns public.periods language sql as $$
  select p.* from public.periods as p
  where p.budget_id = tests.id(n) and (select public.get_today()) between p.start_date and p.end_date $$;
create function pg_temp.at(n text, d date) returns public.periods language sql as $$
  select p.* from public.periods as p where p.budget_id = tests.id(n) and d between p.start_date and p.end_date $$;
create function pg_temp.rev(t uuid) returns integer language sql as $$
  select revision from public.transfers where id = t $$;
create function pg_temp.brev(n text) returns integer language sql as $$
  select revision from public.my_budgets where id = tests.id(n) $$;
create function pg_temp.new_transfer(n text, name text, p_income text default null, p_auto boolean default true,
                                     p_from uuid default null, p_offset integer default 0, p_amount bigint default 100000)
returns uuid language sql as $$
  select id from public.create_transfer(tests.id(n), name, tests.id(n || '_main'), tests.id(n || '_sav'), p_amount, 'pay_date',
    p_offset_days => p_offset, p_is_automatic => p_auto, p_category_id => tests.id(n || '_cat'),
    p_from_period_id => coalesce(p_from, tests.id(n || '_p1')),
    p_income_id => case when p_income is not null then tests.id(n || '_' || p_income) end) $$;
-- the checklist rows of one transfer from period s on: identity (#number or date) / due / status,
-- /unplanned when no longer planned, [f] fixed day, [i] a chosen income's payday
create function pg_temp.rows(n text, t uuid, s integer default 1) returns text language sql as $$
  select coalesce(string_agg(r, ' | ' order by seq), '') from (
    select p.seq, p.seq || ':' || coalesce((select string_agg(coalesce(c.occurrence_date::text, '#' || c.occurrence_seq) || '/'
                                     || coalesce(c.due_date::text, '-') || '/' || c.status
                                     || case when c.planned then '' else '/unplanned' end
                                     || case c.occurrence_kind when 'fixed_day' then '[f]' when 'income_payday' then '[i]' else '' end,
                                     ';' order by coalesce(c.due_date, c.occurrence_date), c.occurrence_seq, c.occurrence_kind)
                   from public.get_transfer_checklist(p.id) as c where c.transfer_id = t), '') as r
    from public.periods as p where p.budget_id = tests.id(n) and p.seq >= s) as x $$;
-- the rows of the period containing d (default today), without its number
create function pg_temp.here(n text, t uuid, d date default null) returns text language sql as $$
  select btrim(regexp_replace(pg_temp.rows(n, t, p.seq), '^[0-9]+:([^|]*).*$', '\1'))
  from public.periods as p where p.budget_id = tests.id(n)
    and coalesce(d, (select public.get_today())) between p.start_date and p.end_date $$;
create function pg_temp.txs(t uuid) returns text language sql as $$
  select coalesce(string_agg(x.date::text, ',' order by x.date), '') from public.transaction_list as x where x.transfer_id = t $$;
create function pg_temp.marks(t uuid) returns text language sql security definer as $$
  select coalesce(string_agg(coalesce(o.occurrence_date::text, '#' || o.occurrence_seq) || '/' || o.kind || '/' || o.mark,
                             ';' order by o.kind, o.occurrence_seq, o.occurrence_date), '')
  from public.transfer_occurrences as o where o.transfer_id = t $$;
create function pg_temp.make_primary(n text, inc text) returns void language sql as $$
  select public.set_primary_income(tests.id(n || '_' || inc), pg_temp.brev(n),
    (select end_date from public.preview_set_primary_income(tests.id(n || '_' || inc)))) $$;
create function pg_temp.early(n text, d date) returns void language sql as $$
  select public.record_early_pay_date(tests.id(n), (pg_temp.cur(n)).id, (pg_temp.cur(n)).revision, d) $$;
create function pg_temp.expect(n text, d date) returns void language sql as $$
  select public.set_expected_pay_date(tests.id(n), (pg_temp.cur(n)).id, (pg_temp.cur(n)).revision, d) $$;
create function pg_temp.reopen(n text, d date default null) returns void language sql as $$
  select public.reopen_previous_period(tests.id(n), (pg_temp.cur(n)).id, (pg_temp.cur(n)).revision, d) $$;
create function pg_temp.ok(n text) returns boolean language sql security definer as $$
  select not exists (select 1 from tests.moneyflow_violations(tests.id(n)))
     and not exists (select 1 from tests.household_violations(tests.id(n))) $$;
create function pg_temp.problems(n text) returns text language sql security definer as $$
  select coalesce(string_agg(v, E'\n'), '') from (select tests.moneyflow_violations(tests.id(n)) as v
                                                  union all select tests.household_violations(tests.id(n))) as x $$;

-- ===========================================================================
-- T1 (re-check 5, M2): two primary switches in one period. Ann (25th) -> Ben (10th) on 12 Dec,
-- -> Cy (18th) on 27 Dec. "Ann savings" names Ann, "Joint" names none.
-- ===========================================================================
select pg_temp.day('2026-12-12');
select pg_temp.budget('t');
select tests.remember('t_ann_t', pg_temp.new_transfer('t', 'Ann savings', 'ann'));
select tests.remember('t_joint', pg_temp.new_transfer('t', 'Joint'));
select pg_temp.make_primary('t', 'ben');
select pg_temp.day('2026-12-27');
select pg_temp.make_primary('t', 'cy');
select pg_temp.day('2027-02-20');
select is(pg_temp.txs(tests.id('t_ann_t')), '2026-09-25,2026-10-25,2026-11-25,2026-12-25,2027-01-25',
  'R-ACCOUNT-512: two switches in one period: every scheduled pay date of Ann once, none dropped (T1)');
select is((select string_agg(seq || ':' || start_date, ',' order by seq) from public.periods where budget_id = tests.id('t')),
  '1:2026-09-25,2:2026-10-25,3:2026-11-25,4:2027-01-18,5:2027-02-18', '(setup) the switch period runs 25 Nov to 17 Jan');
select is(pg_temp.txs(tests.id('t_joint')), '2026-09-25,2026-10-25,2026-11-25,2027-01-18,2027-02-18',
  'R-ACCOUNT-511: "Joint" names no income: one occurrence per period, due on its start (none in December: the period is stretched)');
select is(pg_temp.rows('t', tests.id('t_joint'), 3), '3:#3/2026-11-25/done | 4:#4/2027-01-18/done | 5:#5/2027-02-18/done',
  'R-ACCOUNT-511: each period lists its own number');
select is(pg_temp.problems('t'), '', 'R-ACCOUNT-511: the independent model and the household properties agree (T1)');

-- ===========================================================================
-- D1 (re-check 5, M1): the salary 16 days early (9 Nov), the next on 25 Nov; case X: the December
-- salary 5 days early (20 Dec), on 22 Dec Ben is made the primary. Case Y: on 2 Dec Ben is made
-- the primary, his salary expected late on 14 Dec. Each transfer once for each of its paydays.
-- ===========================================================================
select pg_temp.day('2026-11-01');
select pg_temp.budget('d');
select tests.remember('d_ann_t', pg_temp.new_transfer('d', 'Ann savings', 'ann'));
select tests.remember('d_ben_t', pg_temp.new_transfer('d', 'Ben savings', 'ben'));
select tests.remember('d_joint', pg_temp.new_transfer('d', 'Joint'));
select pg_temp.day('2026-11-09');
select pg_temp.early('d', '2026-11-09');
select pg_temp.day('2026-11-25');
savepoint d1;
select pg_temp.day('2026-12-20');
select pg_temp.early('d', '2026-12-20');
select pg_temp.day('2026-12-22');
select pg_temp.make_primary('d', 'ben');
select pg_temp.day('2027-01-12');
select is(pg_temp.txs(tests.id('d_ann_t')), '2026-09-25,2026-10-25,2026-11-25,2026-12-25',
  'R-ACCOUNT-512: case X: Ann savings once for each of Ann''s scheduled dates, on the schedule (the early salaries change nothing)');
select is(pg_temp.txs(tests.id('d_ben_t')), '2026-10-10,2026-11-10,2026-12-10,2027-01-10',
  'R-ACCOUNT-512: case X: Ben savings once per pay date of Ben, before and after he became the primary');
select is(pg_temp.txs(tests.id('d_joint')), '2026-09-25,2026-10-25,2026-11-09,2026-11-25,2026-12-20,2027-01-10',
  'R-ACCOUNT-511: case X: "Joint" once per period, on the day each salary came (two in November: two periods)');
select is(pg_temp.problems('d'), '', 'R-ACCOUNT-511: the model agrees (D1 case X)');
rollback to savepoint d1;
select pg_temp.day('2026-12-02');
select pg_temp.make_primary('d', 'ben');
select pg_temp.expect('d', '2026-12-14');
select pg_temp.day('2026-12-14');
select pg_temp.day('2026-12-15');
select is(pg_temp.txs(tests.id('d_ben_t')), '2026-10-10,2026-11-10,2026-12-10',
  'R-ACCOUNT-512: case Y: Ben savings once for 10 Dec, dated on the schedule although his salary came on 14 Dec');
select is(pg_temp.txs(tests.id('d_joint')), '2026-09-25,2026-10-25,2026-11-09,2026-11-25,2026-12-14',
  'R-ACCOUNT-511: case Y: "Joint" follows the salary that came, 14 Dec');
select is(pg_temp.problems('d'), '', 'R-ACCOUNT-511: the model agrees (D1 case Y)');

-- ===========================================================================
-- D2 (re-check 5): the October salary 40 days late (4 Dec); in January Ann's salary 5 days early
-- and Ben made the primary: Ann savings once per scheduled date.
-- ===========================================================================
select pg_temp.day('2026-10-24');
select pg_temp.budget('e');
select tests.remember('e_ann_t', pg_temp.new_transfer('e', 'Ann savings', 'ann'));
select tests.remember('e_joint', pg_temp.new_transfer('e', 'Joint', p_offset => 2));
select pg_temp.expect('e', '2026-12-04');
select pg_temp.day('2026-12-04');
select pg_temp.day('2027-01-20');
select pg_temp.early('e', '2027-01-20');
select pg_temp.day('2027-01-22');
select pg_temp.make_primary('e', 'ben');
select pg_temp.day('2027-02-12');
select is(pg_temp.txs(tests.id('e_ann_t')), '2026-09-25,2026-10-25,2026-11-25,2026-12-25,2027-01-25',
  'R-ACCOUNT-512: D2: a salary 40 days late and one early change nothing for a transfer naming Ann');
select is((select count(*)::integer from public.transaction_list where transfer_id = tests.id('e_joint')),
  (select count(*)::integer from public.periods where budget_id = tests.id('e') and end_date >= '2026-09-25' and start_date + 2 <= '2027-02-12'),
  'R-ACCOUNT-511: D2: "Joint" has exactly as many occurrences as periods (the 40-day period has one)');
select is(pg_temp.problems('e'), '', 'R-ACCOUNT-511: the model agrees (D2)');

-- ===========================================================================
-- K5 (re-check 5): pay day 25 -> 5; a transfer naming none done by hand on 6 Jan; the period
-- reopened and the salary recorded again 16 days late: the mark stays planned (its period's
-- number does not change).
-- ===========================================================================
select pg_temp.day('2026-12-05');
select pg_temp.budget('k');
select public.update_income(tests.id('k_ann'), (select revision from public.incomes where id = tests.id('k_ann')), p_pay_day => 5,
  p_previewed_end_date => (select end_date from public.preview_update_income(tests.id('k_ann'), p_pay_day => 5)));
select pg_temp.early('k', '2026-12-05');
select tests.remember('k_t', pg_temp.new_transfer('k', 'By hand', p_auto => false, p_from => (pg_temp.cur('k')).id));
select pg_temp.day('2027-01-06');
select public.mark_transfer_done(tests.id('k_t'), (pg_temp.cur('k')).id, 0, '2027-01-06', p_occurrence_kind => 'period');
select is(pg_temp.rows('k', tests.id('k_t'), 5), '5:#5/2027-01-05/done', '(setup) K5: the January period''s own occurrence done by hand');
select pg_temp.reopen('k', '2027-01-21');
select is(pg_temp.rows('k', tests.id('k_t'), 4), '4:#4/2026-12-05/to_do;#5/-/done/unplanned',
  'R-ACCOUNT-511: K5: reopened, the mark of period 5 stays, listed (no longer planned) by the latest period');
select is((select next_due_date from public.transfer_overview where id = tests.id('k_t')), '2027-02-05'::date,
  'R-ACCOUNT-464: K5: the next period (5, projected from 21 Jan) is already marked: the next due date is period 6''s, 5 Feb');
select pg_temp.day('2027-01-21');
select is(pg_temp.rows('k', tests.id('k_t'), 5), '5:#5/2027-01-21/done',
  'R-ACCOUNT-511: K5: the salary recorded again 16 days late: period 5''s mark is planned again, done');
select is((select transfers_to_do from public.get_transfers_to_do(tests.id('k'))), 1,
  'R-ACCOUNT-511: K5: only December''s occurrence is to do');

-- ===========================================================================
-- dir2 late_16 (re-check 5): Ben made the primary on 2 Dec, his first salary 16 days late (26 Dec):
-- a transfer naming Ben once for 10 Dec, not again.
-- ===========================================================================
select pg_temp.day('2026-12-02');
select pg_temp.budget('l');
select tests.remember('l_t', pg_temp.new_transfer('l', 'Ben savings', 'ben'));
select pg_temp.make_primary('l', 'ben');
select pg_temp.expect('l', '2026-12-26');
select pg_temp.day('2027-02-01');
select is(pg_temp.txs(tests.id('l_t')), '2026-10-10,2026-11-10,2026-12-10,2027-01-10',
  'R-ACCOUNT-512: Ben''s first salary as the primary 16 days late: one transfer per scheduled date, never twice');
select is(pg_temp.problems('l'), '', 'R-ACCOUNT-512: the model agrees (late 16)');

-- ===========================================================================
-- R-ACCOUNT-512: a named income's pay-day change, its end, an income added later, an income
-- deleted outright, a scheduled date before the transfer's first counted day.
-- ===========================================================================
select pg_temp.day('2026-11-16');
select pg_temp.budget('i');
select tests.remember('i_t', pg_temp.new_transfer('i', 'Ben savings', 'ben', p_from => (pg_temp.cur('i')).id));
-- created from today (no period named) on 16 Nov: Ben's 10 Nov is before its first counted day
select tests.remember('i_u', (select id from public.create_transfer(tests.id('i'), 'From today', tests.id('i_main'), tests.id('i_sav'),
  1000, 'pay_date', p_income_id => tests.id('i_ben'), p_is_automatic => false)));
select tests.remember('i_v', (select id from public.create_transfer(tests.id('i'), 'Joint from today', tests.id('i_main'), tests.id('i_sav'),
  1000, 'pay_date', p_is_automatic => false)));
select tests.model_made_from_today(tests.id('i_u'));
select tests.model_made_from_today(tests.id('i_v'));

select is(pg_temp.here('i', tests.id('i_u')), '',
  'R-ACCOUNT-512: a chosen income''s scheduled date before the transfer''s first counted day (today) is not planned');
select is(pg_temp.here('i', tests.id('i_v')), '',
  'R-ACCOUNT-511: made after its period''s first day, its own occurrence counts from the next period');
select is((select starts_seq from public.transfer_overview where id = tests.id('i_v')), (pg_temp.cur('i')).seq + 1,
  'R-ACCOUNT-511: transfer_overview.starts_seq says so');
select public.update_income(tests.id('i_ben'), (select revision from public.incomes where id = tests.id('i_ben')), p_pay_day => 12);
select is(pg_temp.here('i', tests.id('i_t')), '2026-11-12/2026-11-12/done[i]',
  'R-ACCOUNT-512: Ben''s pay day changed from now (12): the current period follows the terms now in force');
select pg_temp.day('2026-12-26');
select public.remove_income(tests.id('i_ben'), (select revision from public.incomes where id = tests.id('i_ben')));
select is(pg_temp.here('i', tests.id('i_t'), '2026-12-12'), '2026-12-12/2026-12-12/done[i]',
  'R-ACCOUNT-512: Ben ended on 26 Dec: his date already due stays');
select is(pg_temp.here('i', tests.id('i_t')), '',
  'R-ACCOUNT-512: in the period he ended in, nothing dated in the past appears (its own occurrence was due on 25 Dec, D-492)');
select pg_temp.day('2027-01-26');
select is(regexp_replace(pg_temp.here('i', tests.id('i_t')), '#[0-9]+', '#'), '#/2027-01-25/done',
  'R-ACCOUNT-512: after Ben''s end the transfer follows the main income: one occurrence of its period');
select is((select follows_primary from public.transfer_overview where id = tests.id('i_t')), true, 'R-ACCOUNT-512: and says so');
select is((select follows_primary from public.get_transfer_checklist((pg_temp.cur('i')).id) where transfer_id = tests.id('i_t')), true,
  'R-ACCOUNT-512: its checklist row says it follows the main income');
-- an income added later: before it, the transfer follows the main income
select tests.remember('i_dee', public.add_income(tests.id('i'), 'Dee', 100000, 28, 'none'));
select tests.remember('i_w', pg_temp.new_transfer('i', 'Dee savings', 'dee', p_from => (pg_temp.cur('i')).id));
select is(pg_temp.here('i', tests.id('i_w')), '2027-01-28/2027-01-28/upcoming[i]',
  'R-ACCOUNT-512: an income added in this period: its own dates from then on');
select is(pg_temp.problems('i'), '', 'R-ACCOUNT-512: the model agrees (pay day, end, added later)');

-- ===========================================================================
-- R-ACCOUNT-513 (D-611, Q-261): a fixed day with a weekend rule. 22 Nov 2026 is a Sunday.
-- ===========================================================================
select pg_temp.day('2026-11-23');
select pg_temp.budget('f');
select tests.remember('f_next', (select id from public.create_transfer(tests.id('f'), 'Next', tests.id('f_main'), tests.id('f_sav'), 1000,
  'day_of_month', p_day_of_month => 22, p_first_date => '2026-10-22', p_is_automatic => true, p_category_id => tests.id('f_cat'),
  p_weekend_rule => 'next')));
select tests.remember('f_prev', (select id from public.create_transfer(tests.id('f'), 'Prev', tests.id('f_main'), tests.id('f_sav'), 1000,
  'day_of_month', p_day_of_month => 22, p_first_date => '2026-10-22', p_is_automatic => false, p_weekend_rule => 'previous')));
select tests.remember('f_sat', (select id from public.create_transfer(tests.id('f'), 'Saturday', tests.id('f_main'), tests.id('f_sav'), 1000,
  'day_of_month', p_day_of_month => 21, p_first_date => '2026-10-21', p_is_automatic => false, p_weekend_rule => 'next')));
select tests.remember('f_none', (select id from public.create_transfer(tests.id('f'), 'None', tests.id('f_main'), tests.id('f_sav'), 1000,
  'day_of_month', p_day_of_month => 22, p_first_date => '2026-10-22', p_is_automatic => false)));
select is(pg_temp.here('f', tests.id('f_next')), '2026-11-22/2026-11-23/done[f]',
  'R-ACCOUNT-513: Sunday 22 Nov with the working day after: due Monday 23 Nov, done that day');
select is((select occurrence_date from public.get_transfer_checklist((pg_temp.cur('f')).id) where transfer_id = tests.id('f_next')),
  '2026-11-22'::date, 'R-ACCOUNT-513: the occurrence is the scheduled date, 22 Nov');
select is(pg_temp.txs(tests.id('f_next')), '2026-11-23', 'R-ACCOUNT-513: the app records it on Monday 23 Nov');
select is((select due_date from public.get_transfer_checklist((pg_temp.cur('f')).id) where transfer_id = tests.id('f_sat')),
  '2026-11-23'::date, 'R-ACCOUNT-513: Saturday 21 Nov with the working day after: due Monday 23 Nov');
select is((select due_date from public.get_transfer_checklist((pg_temp.cur('f')).id) where transfer_id = tests.id('f_prev')),
  '2026-11-20'::date, 'R-ACCOUNT-513: the working day before: due Friday 20 Nov');
select is((select due_date from public.get_transfer_checklist((pg_temp.cur('f')).id) where transfer_id = tests.id('f_none')),
  '2026-11-22'::date, 'R-ACCOUNT-513: no rule (the default): due on the Sunday');
select is((select weekend_rule::text from public.transfer_overview where id = tests.id('f_none')), 'none',
  'R-ACCOUNT-513: transfer_overview.weekend_rule defaults to none for a fixed day');
select is((select weekend_rule::text from public.get_transfer_terms(tests.id('f_prev'), (pg_temp.cur('f')).id)), 'previous',
  'R-ACCOUNT-513: get_transfer_terms answers the weekend rule');
select public.update_transfer(tests.id('f_none'), pg_temp.rev(tests.id('f_none')), p_weekend_rule => 'next');
select is((select due_date from public.get_transfer_checklist((pg_temp.cur('f')).id) where transfer_id = tests.id('f_none')),
  '2026-11-23'::date, 'R-ACCOUNT-513: update_transfer changes the weekend rule alone');
select throws_ok(format($$select public.create_transfer(%L, 'X', %L, %L, 1000, 'pay_date', p_weekend_rule => 'next')$$,
  tests.id('f'), tests.id('f_main'), tests.id('f_sav')), 'P0001', 'invalid_schedule',
  'R-ACCOUNT-513: a pay-date transfer takes no weekend rule');
select public.update_transfer(tests.id('f_prev'), pg_temp.rev(tests.id('f_prev')), p_schedule => 'pay_date');
select is((select weekend_rule from public.transfer_overview where id = tests.id('f_prev')), null,
  'R-ACCOUNT-513: made a pay date, it drops the weekend rule');
select is(pg_temp.problems('f'), '', 'R-ACCOUNT-513: the model agrees (weekend rules)');

-- ===========================================================================
-- R-ACCOUNT-305 (D-615, re-check 5 S1 and C1): the carry-over of a mark when an edit changes the
-- kind on the same day in the same period, whatever arguments the call carries.
-- ===========================================================================
select pg_temp.day('2026-11-26');
select pg_temp.budget('c');
-- Ben is paid on the 25th too
select public.update_income(tests.id('c_ben'), (select revision from public.incomes where id = tests.id('c_ben')), p_pay_day => 25,
  p_from_period_id => tests.id('c_p1'));
select tests.remember('c_auto', pg_temp.new_transfer('c', 'Auto'));
select tests.remember('c_hand', pg_temp.new_transfer('c', 'By hand', p_auto => false, p_amount => 20000));
select public.mark_transfer_done(tests.id('c_hand'), (pg_temp.cur('c')).id, 0, '2026-11-26', p_occurrence_kind => 'period',
  p_occurrence_seq => (pg_temp.cur('c')).seq);
select results_eq(format($$select occurrence_date, occurrence_kind::text, already_recorded, created_at_once_count,
                                  transactions_removed_count, transactions_moved_count
                           from public.preview_update_transfer(%L, p_income_id => %L, p_count => 1)$$,
                         tests.id('c_auto'), tests.id('c_ben')),
  $$values ('2026-11-25'::date, 'income_payday', true, 0, 0, 0)$$,
  'R-ACCOUNT-305: the preview of naming Ben alone (no p_schedule): the occurrence is already recorded, nothing removed');
select public.update_transfer(tests.id('c_auto'), pg_temp.rev(tests.id('c_auto')), p_income_id => tests.id('c_ben'));
select public.update_transfer(tests.id('c_hand'), pg_temp.rev(tests.id('c_hand')), p_income_id => tests.id('c_ben'));
select is(pg_temp.marks(tests.id('c_auto')) || ' ' || pg_temp.txs(tests.id('c_auto')),
  '#1/period/done;#2/period/done;2026-11-25/income_payday/done 2026-09-25,2026-10-25,2026-11-25',
  'R-ACCOUNT-305: naming Ben alone, from now: the 25 Nov transaction is carried over, not made again (earlier periods keep theirs)');
select is(pg_temp.rows('c', tests.id('c_hand'), 3), '3:2026-11-25/2026-11-25/done[i]',
  'R-ACCOUNT-305: the mark made by hand is carried over: done, nothing to do again');
select is((select transfers_to_do from public.get_transfers_to_do(tests.id('c'))), 1,
  'R-ACCOUNT-305: nothing to do again this period (C1; only the previous period''s own occurrence, never marked)');
-- not on another day: Cy (18th) instead, from the same period
select public.update_transfer(tests.id('c_hand'), pg_temp.rev(tests.id('c_hand')), p_income_id => tests.id('c_cy'));
select is(pg_temp.rows('c', tests.id('c_hand'), 3), '3:2026-11-25/-/done/unplanned[i];2026-12-18/2026-12-18/to_do[i]',
  'R-ACCOUNT-305: on another day it is another occurrence: the mark stays, no longer planned');
-- C2: the carry-over when the new occurrence already has a mark of its own (a leftover)
select pg_temp.day('2026-11-27');
select pg_temp.budget('c2');
select tests.remember('c2_m', pg_temp.new_transfer('c2', 'By hand', p_auto => false, p_amount => 20000, p_from => (pg_temp.cur('c2')).id));
select public.mark_transfer_done(tests.id('c2_m'), (pg_temp.cur('c2')).id, 0, '2026-11-25', p_occurrence_kind => 'period');
select public.update_transfer(tests.id('c2_m'), pg_temp.rev(tests.id('c2_m')), p_schedule => 'day_of_month', p_day_of_month => 26,
  p_first_date => '2026-11-26');
select public.mark_transfer_done(tests.id('c2_m'), (pg_temp.cur('c2')).id, 0, '2026-11-26', p_occurrence_date => '2026-11-26',
  p_occurrence_kind => 'fixed_day');
select public.update_transfer(tests.id('c2_m'), pg_temp.rev(tests.id('c2_m')), p_schedule => 'day_of_month', p_day_of_month => 25,
  p_first_date => '2026-11-25');
select is(pg_temp.marks(tests.id('c2_m')), '#3/period/done;2026-11-26/fixed_day/done',
  'R-ACCOUNT-305: (C2) a fixed day to another fixed day is not a change of kind: nothing is carried over');
select public.mark_transfer_done(tests.id('c2_m'), (pg_temp.cur('c2')).id, 0, '2026-11-27', p_occurrence_date => '2026-11-25',
  p_occurrence_kind => 'fixed_day');
select lives_ok(format($$select public.update_transfer(%L, %s, p_schedule => 'pay_date')$$, tests.id('c2_m'), pg_temp.rev(tests.id('c2_m'))),
  'R-ACCOUNT-305: (C2) back to the main income''s payday while that occurrence has its own mark: no conflict');
select is(pg_temp.marks(tests.id('c2_m')), '#3/period/done;2026-11-25/fixed_day/done;2026-11-26/fixed_day/done',
  'R-ACCOUNT-305: (C2) the period''s own mark is planned again; the fixed days'' marks stay (nothing overwritten)');
select is(pg_temp.here('c2', tests.id('c2_m')), '#3/2026-11-25/done;2026-11-25/-/done/unplanned[f];2026-11-26/-/done/unplanned[f]',
  'R-ACCOUNT-305: (C2) listed: the period''s done, the two fixed days kept');
select is(pg_temp.problems('c2'), '', 'R-ACCOUNT-305: the model agrees (C2)');

-- ===========================================================================
-- T2 (re-check 5) rebuilt: two rows of one transfer with one date in one period, of two kinds (a
-- fixed day from this period, Ben's payday kept as a mark); each undone by its own kind, and the
-- previews name the kind of each row.
-- ===========================================================================
select pg_temp.day('2026-12-11');
select pg_temp.budget('w');
select tests.remember('w_t', pg_temp.new_transfer('w', 'Ben savings', 'ben', p_auto => false, p_from => (pg_temp.cur('w')).id));
select public.mark_transfer_done(tests.id('w_t'), (pg_temp.cur('w')).id, 0, '2026-12-10', p_occurrence_date => '2026-12-10',
  p_occurrence_kind => 'income_payday');
select results_eq(format($$select occurrence_date, occurrence_kind::text, already_recorded
                           from public.preview_update_transfer(%L, p_schedule => 'day_of_month', p_day_of_month => 10,
                                                               p_first_date => '2026-12-10', p_count => 2)$$, tests.id('w_t')),
  $$values ('2026-12-10'::date, 'fixed_day', true), ('2027-01-10'::date, 'fixed_day', false)$$,
  'R-ACCOUNT-510: the preview names each row''s kind (the mark is carried over to the fixed day 10 Dec)');
select public.update_transfer(tests.id('w_t'), pg_temp.rev(tests.id('w_t')), p_schedule => 'day_of_month', p_day_of_month => 10,
  p_first_date => '2026-12-10');
select public.update_transfer(tests.id('w_t'), pg_temp.rev(tests.id('w_t')), p_schedule => 'pay_date', p_income_id => tests.id('w_ben'));
select public.update_transfer(tests.id('w_t'), pg_temp.rev(tests.id('w_t')), p_schedule => 'day_of_month', p_day_of_month => 10,
  p_first_date => '2026-12-10');
select is(pg_temp.marks(tests.id('w_t')), '2026-12-10/fixed_day/done', '(setup) T2: the mark went to the fixed day and back');
-- a second mark of the other kind with the same date: Ben's payday from period 1 marked, then fixed day from this period
select pg_temp.day('2026-12-12');
select pg_temp.budget('w2');
select tests.remember('w2_t', pg_temp.new_transfer('w2', 'Two kinds', 'ben', p_auto => false, p_from => (pg_temp.cur('w2')).id));
select public.mark_transfer_done(tests.id('w2_t'), (pg_temp.cur('w2')).id, 0, '2026-12-10', p_occurrence_kind => 'income_payday');
select public.update_transfer(tests.id('w2_t'), pg_temp.rev(tests.id('w2_t')), p_schedule => 'day_of_month', p_day_of_month => 11,
  p_first_date => '2026-12-11');
select public.mark_transfer_done(tests.id('w2_t'), (pg_temp.cur('w2')).id, 0, '2026-12-11', p_occurrence_kind => 'fixed_day');
select public.update_transfer(tests.id('w2_t'), pg_temp.rev(tests.id('w2_t')), p_day_of_month => 10, p_first_date => '2026-12-10');
select is(pg_temp.rows('w2', tests.id('w2_t'), 3), '3:2026-12-10/-/done/unplanned[i];2026-12-10/2026-12-10/to_do[f];2026-12-11/-/done/unplanned[f]',
  '(setup) T2: one date, two kinds, two rows');
select throws_ok(format($$select public.undo_transfer_mark(%L, %L, 1, p_occurrence_date => '2026-12-10')$$, tests.id('w2_t'),
  (pg_temp.cur('w2')).id), 'P0001', 'occurrence_required', 'R-ACCOUNT-510: the date alone names two rows');
select is((select string_agg(status, ',') from public.undo_transfer_mark(tests.id('w2_t'), (pg_temp.cur('w2')).id, 1,
  p_occurrence_date => '2026-12-10', p_occurrence_kind => 'income_payday')), null,
  'R-ACCOUNT-510: the unplanned income payday is undone by its kind (its row goes)');
select is(pg_temp.rows('w2', tests.id('w2_t'), 3), '3:2026-12-10/2026-12-10/to_do[f];2026-12-11/-/done/unplanned[f]',
  'R-ACCOUNT-510: the fixed day 10 Dec is untouched');
select is(pg_temp.problems('w2'), '', 'R-ACCOUNT-510: the model agrees (T2)');

-- ===========================================================================
-- R1 (re-check 5) and S3: the previews of an early and an expected salary count the transfers'
-- transactions; a re-dated one counts as moved (D-614).
-- ===========================================================================
select pg_temp.day('2026-12-16');
select pg_temp.budget('r');
select tests.remember('r_t', pg_temp.new_transfer('r', 'Plus20', p_offset => 20));
select is(pg_temp.rows('r', tests.id('r_t'), 3), '3:#3/2026-12-15/done', '(setup) R1: 25 Nov + 20 = 15 Dec, recorded');
select results_eq(format($$select accepted, refusal, transfer_transactions_removed, transfer_transactions_created,
                                  transfer_transactions_moved, transfer_marks_unplanned
                           from public.preview_record_early_pay_date(%L, '2026-12-10')$$, tests.id('r')),
  $$values (true, null::text, 1, 1, 1, 0)$$,
  'R-ACCOUNT-516: "the salary came on 10 Dec": the preview counts the 15 Dec transaction moved to 9 Dec (the period now ends then)');
select is(pg_temp.txs(tests.id('r_t')), '2026-10-15,2026-11-14,2026-12-15', 'R-ACCOUNT-516: the preview changed nothing');
select pg_temp.early('r', '2026-12-10');
select is((select date::text from public.transaction_list where transfer_id = tests.id('r_t') and date >= '2026-12-01' order by date limit 1),
  '2026-12-09', 'R-ACCOUNT-516: the write moved it to 9 Dec, as the preview said');
select results_eq(format($$select accepted, refusal, transfer_transactions_removed, transfer_transactions_created
                           from public.preview_record_early_pay_date(%L, '2026-12-20')$$, tests.id('r')),
  $$values (false, 'invalid_boundary', 0, 0)$$, 'R-ACCOUNT-516: a refused early salary (after today): the refusal, counts 0');
select pg_temp.reopen('r', '2026-12-30');
select tests.remember('r_u', pg_temp.new_transfer('r', 'Plus25', p_offset => 25));
select results_eq(format($$select accepted, transfer_transactions_removed, transfer_transactions_created, transfer_transactions_moved
                           from public.preview_set_expected_pay_date(%L, '2026-12-17')$$, tests.id('r')),
  $$values (true, 0, 1, 0)$$,
  'R-ACCOUNT-516: "the next salary is expected on 17 Dec": Plus25 (due 20 Dec) is now due today, its transaction made at once');
select pg_temp.expect('r', '2026-12-17');
select is((select max(date)::text from public.transaction_list where transfer_id = tests.id('r_u')), '2026-12-16',
  'R-ACCOUNT-516: the write made it, as the preview said');
select results_eq(format($$select transactions_removed_count, created_at_once_count, transactions_moved_count
                           from public.preview_update_transfer(%L, p_offset_days => 18, p_count => 1)$$, tests.id('r_t')),
  $$values (1, 1, 1)$$, 'R-ACCOUNT-517: an offset edited from now: one transaction moved (counted removed and created too)');
select results_eq(format($$select change, count(*)::integer from public.preview_reopen(%L) where record_kind = 'transfer'
                           group by change order by change$$, tests.id('r')),
  $$values ('transaction_removed'::text, 2)$$,
  'R-ACCOUNT-517: preview_reopen lists each removal (the merged period''s own occurrences of Plus20 and Plus25); none moved');

select pg_temp.day('2026-12-16');
select pg_temp.budget('mv');
select tests.remember('mv_t', (select id from public.create_transfer(tests.id('mv'), 'On the 10th', tests.id('mv_main'), tests.id('mv_sav'),
  1000, 'day_of_month', p_day_of_month => 10, p_first_date => '2026-12-10', p_is_automatic => true, p_category_id => tests.id('mv_cat'))));
select results_eq(format($$select transactions_removed_count, created_at_once_count, transactions_moved_count
                           from public.preview_update_transfer(%L, p_day_of_month => 12, p_first_date => '2026-12-12', p_count => 1)$$,
                         tests.id('mv_t')),
  $$values (1, 1, 0)$$, 'R-ACCOUNT-517: 10 Dec removed and 12 Dec created are two occurrences: nothing moved');

-- a fixed day on Sunday 1 Nov with the working day before is due Friday 30 Oct, before its period
-- starts: a correction that plans it records it (the watermark goes back far enough)
select pg_temp.day('2026-11-16');
select pg_temp.budget('fw', 1);
select tests.remember('fw_t', (select id from public.create_transfer(tests.id('fw'), 'First', tests.id('fw_main'), tests.id('fw_sav'),
  1000, 'day_of_month', p_day_of_month => 5, p_first_date => '2026-11-05', p_is_automatic => true, p_category_id => tests.id('fw_cat'),
  p_from_period_id => (pg_temp.cur('fw')).id)));
select public.update_transfer(tests.id('fw_t'), pg_temp.rev(tests.id('fw_t')), p_day_of_month => 1, p_first_date => '2026-11-01',
  p_weekend_rule => 'previous', p_from_period_id => (pg_temp.cur('fw')).id);
select is(pg_temp.txs(tests.id('fw_t')), '2026-10-30',
  'R-ACCOUNT-513: the occurrence of Sunday 1 Nov, due Friday 30 Oct (before its period starts), is recorded by the correction');
select is(pg_temp.problems('fw'), '', 'R-ACCOUNT-513: the model agrees (due before the period)');
-- a period's own occurrence counts from its period, wherever its start moves
select pg_temp.day('2026-11-27');
select pg_temp.budget('ms');
select tests.remember('ms_t', pg_temp.new_transfer('ms', 'By hand', p_auto => false, p_from => (pg_temp.cur('ms')).id));
select public.move_period_start((pg_temp.cur('ms')).id, (pg_temp.cur('ms')).revision, '2026-11-23');
select is((select status from public.mark_transfer_done(tests.id('ms_t'), (pg_temp.cur('ms')).id, 0, '2026-11-23', p_occurrence_kind => 'period')),
  'done', 'R-ACCOUNT-511: its period now starts 23 Nov, before its first counted day: done on 23 Nov is accepted');

-- ===========================================================================
-- R-ACCOUNT-464 (D-612, re-check 5 S2): next_due_date is the first occurrence due today or later
-- with no mark, and moving the clock to that day produces exactly that occurrence.
-- ===========================================================================
select pg_temp.day('2026-11-20');
select pg_temp.budget('n');
select tests.remember('n_t', pg_temp.new_transfer('n', 'Manual Ben', 'ben', p_auto => false));
select tests.remember('n_a', pg_temp.new_transfer('n', 'Auto Joint'));
create function pg_temp.next_due_holds(n text, t uuid) returns text language plpgsql as $$
declare
  v_from date := (select public.get_today());
  v_due date := (select next_due_date from public.transfer_overview where id = t);
  v_marks uuid[] := (select array_agg(o.id) from public.transfer_occurrences as o where o.transfer_id = t);
  v_got text;
begin
  perform pg_temp.day(v_due);
  select string_agg(c.due_date || '/' || c.status, ',') into v_got
  from public.periods as p cross join lateral public.get_transfer_checklist(p.id) as c
  where p.budget_id = tests.id(n) and c.transfer_id = t and c.planned and c.due_date >= v_from and c.due_date <= v_due
    and not exists (select 1 from public.transfer_occurrences as o where o.id = any (coalesce(v_marks, '{}'))
                      and o.transfer_id = t and o.kind = c.occurrence_kind
                      and (o.occurrence_date = c.occurrence_date or o.occurrence_seq = c.occurrence_seq));
  raise exception '%', v_due || ' -> ' || coalesce(v_got, 'nothing') using errcode = 'P0060';
exception when sqlstate 'P0060' then
  execute 'discard plans';  -- no plan cached with the day moved to survives the rollback
  return sqlerrm;
end $$;
select is((select next_due_date from public.transfer_overview where id = tests.id('n_t')), '2026-12-10'::date,
  'R-ACCOUNT-464: (setup) Manual Ben next due 10 Dec');
select is(pg_temp.next_due_holds('n', tests.id('n_t')), '2026-12-10 -> 2026-12-10/to_do',
  'R-ACCOUNT-464: moving the clock to Manual Ben''s next due date: exactly that occurrence, to do');
select is(pg_temp.next_due_holds('n', tests.id('n_a')), '2026-11-25 -> 2026-11-25/done',
  'R-ACCOUNT-464: Auto Joint: the next period''s own occurrence on its projected start, recorded that day');
-- marked not done in advance: the next one is a month later
select pg_temp.day('2026-11-25');
select public.mark_transfer_not_done(tests.id('n_a'), (pg_temp.cur('n')).id,
  (select mark_revision from public.get_transfer_checklist((pg_temp.cur('n')).id) where transfer_id = tests.id('n_a')),
  p_occurrence_kind => 'period');
select is((select next_due_date from public.transfer_overview where id = tests.id('n_a')), '2026-12-25'::date,
  'R-ACCOUNT-464: an occurrence marked not done is not the next one (S2)');
select is(pg_temp.next_due_holds('n', tests.id('n_a')), '2026-12-25 -> 2026-12-25/done', 'R-ACCOUNT-464: and the clock agrees');
-- after a switch and a reopen with a mark kept for the reopened period's number
select pg_temp.day('2026-12-02');
select pg_temp.make_primary('n', 'ben');
select pg_temp.day('2026-12-10');
select public.mark_transfer_done(tests.id('n_t'), (pg_temp.cur('n')).id, 0, p_occurrence_date => '2026-12-10');
select pg_temp.reopen('n', '2026-12-14');
select is(pg_temp.next_due_holds('n', tests.id('n_a')), '2026-12-14 -> 2026-12-14/done',
  'R-ACCOUNT-464: after a switch and a reopen: the reopened salary''s day, which the clock then records');
select is(pg_temp.next_due_holds('n', tests.id('n_t')), '2027-01-10 -> 2027-01-10/to_do',
  'R-ACCOUNT-464: Manual Ben, done for 10 Dec: next 10 Jan');

-- ===========================================================================
-- R-ACCOUNT-518: the checklist row names the income of a chosen income's payday
-- ===========================================================================
select results_eq(format($$select occurrence_kind::text, income_id, income_name, occurrence_seq
                           from public.get_transfer_checklist(%L) where transfer_id = %L$$, (pg_temp.at('n', '2026-12-10')).id,
                         tests.id('n_t')),
  format($$values ('income_payday', %L::uuid, 'Ben', null::integer)$$, tests.id('n_ben')),
  'R-ACCOUNT-518: an income''s payday row has the income''s id and name');
select results_eq(format($$select occurrence_kind::text, income_id, income_name, occurrence_date, occurrence_seq
                           from public.get_transfer_checklist(%L) where transfer_id = %L and planned$$, (pg_temp.at('n', '2026-12-10')).id,
                         tests.id('n_a')),
  format($$values ('period', null::uuid, null::text, null::date, %s)$$, (pg_temp.at('n', '2026-12-10')).seq),
  'R-ACCOUNT-510: a period''s own row has its number and no date');
select results_eq(format($$select x.transfer_occurrence_kind::text, x.transfer_occurrence_seq, x.transfer_occurrence_date
                           from public.transaction_list as x where x.transfer_id = %L order by x.date desc limit 1$$, tests.id('n_a')),
  format($$values ('period', %s, null::date)$$, (select max(seq) from public.periods where budget_id = tests.id('n')
                                                 and start_date <= (select max(date) from public.transaction_list
                                                                    where transfer_id = tests.id('n_a')))),
  'R-ACCOUNT-510: transaction_list names the occurrence of a transfer''s transaction');

-- ===========================================================================
-- R-ACCOUNT-519 (D-616): end_transfer and the snapshots see every mark however old
-- ===========================================================================
select pg_temp.day('2027-03-01');
select pg_temp.budget('o');
select tests.remember('o_t', pg_temp.new_transfer('o', 'Old', 'ben'));
select results_eq(format($$select outcome, occurrences_removed, marks_kept, transactions_kept
                           from public.preview_end_transfer(%L, %L)$$, tests.id('o_t'), (pg_temp.at('o', '2026-11-01')).id),
  format($$values ('ended'::text, 1, %s, %s)$$, (select count(*) from public.transaction_list where transfer_id = tests.id('o_t')
                                                     and date >= (pg_temp.at('o', '2026-11-01')).start_date),
         (select count(*) from public.transaction_list where transfer_id = tests.id('o_t') and date >= (pg_temp.at('o', '2026-11-01')).start_date)),
  'R-ACCOUNT-519: ended from November, every transaction from then on stays, 10 Mar (not due) goes (preview)');
select public.end_transfer(tests.id('o_t'), pg_temp.rev(tests.id('o_t')), (pg_temp.at('o', '2026-11-01')).id);
select is((select count(*)::integer from public.transfer_occurrences where transfer_id = tests.id('o_t') and by_catch_up),
  (select count(*)::integer from public.transaction_list where transfer_id = tests.id('o_t') and date < (pg_temp.at('o', '2026-11-01')).start_date),
  'R-ACCOUNT-519: every mark the end leaves unplanned, however old, is kept as a member''s (only the earlier ones are still the app''s)');
select is(pg_temp.txs(tests.id('o_t')), '2026-10-10,2026-11-10,2026-12-10,2027-01-10,2027-02-10',
  'R-ACCOUNT-519: no transaction went');

-- ===========================================================================
-- The spent side of a transfer whose transaction was re-pointed to another category (re-check 5)
-- ===========================================================================
select tests.remember('o_cat2', (select id from public.create_category(tests.id('o'), 'Other', p_amount => 1000,
  p_from_period_id => tests.id('o_p1'))));
select public.update_transaction(x.id, x.revision, 'expense', x.amount, x.date, tests.id('o_cat2'))
from public.transaction_list as x where x.transfer_id = tests.id('o_t') and x.date = '2027-02-10';
select results_eq(format($$select name, transfer_spent, spent from public.get_money_flow(%L, %L) where row_kind = 'spending' order by name$$,
                         tests.id('o'), (pg_temp.at('o', '2027-02-10')).id),
  $$values ('Other'::text, 100000::bigint, 0::bigint), ('Saving', 0, 0)$$,
  'R-ACCOUNT-465: a transfer''s transaction moved to another category counts on that category''s spent side, still as a transfer');

-- ===========================================================================
-- Security: the plan's functions run as the caller; the new previews are for members only
-- ===========================================================================
select is_empty($$select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'private' and p.prosecdef and has_function_privilege('authenticated', p.oid, 'execute')
                    and p.proname not in ('account_holder_name', 'display_name_of', 'import_source', 'member_budget_ids',
                                          'member_name', 'owned_budget_ids', 'recorder_name', 'visible_profile_ids')$$,
  'R-ACCOUNT-510: every private function a signed-in role can execute runs as the caller, except the name and membership helpers');
select ok(not has_function_privilege('authenticated', 'private.preview_pay_date_change(uuid, date, boolean)', 'execute'),
  'R-ACCOUNT-516: the previews'' shared body is not callable directly');
select pg_temp.day('2027-03-01', 'max');
select throws_ok(format($$select * from public.preview_record_early_pay_date(%L, '2027-02-28')$$, tests.id('o')),
  'P0001', 'budget_not_found', 'R-ACCOUNT-516: another user cannot preview an early salary of the budget');
select throws_ok(format($$select * from public.preview_set_expected_pay_date(%L)$$, tests.id('o')),
  'P0001', 'budget_not_found', 'R-ACCOUNT-516: nor an expected one');
select tests.clear_authentication();
select tests.authenticate_as_anon();
select throws_ok(format($$select * from public.preview_set_expected_pay_date(%L)$$, tests.id('o')),
  '42501', null, 'R-ACCOUNT-516: an anonymous visitor cannot call the previews');
select tests.clear_authentication();

select * from finish();
rollback;
