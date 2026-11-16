-- Review of the step 7 database (first round of fixes): an automatic linked occurrence never
-- loses its transaction when a mark is removed (M1), the dashboard counts the period before too (Q-222), a kept
-- income that has ended does not block an edit, ending while a transaction is held back, the
-- previews' counts, and the comparison's transfer-committed figure.
begin;
select plan(19);

select tests.create_user('ann', 'Ann');
select tests.set_today('2026-11-16');
select tests.authenticate_as('ann');
select tests.remember('b', public.create_budget('Review7', 'Salary', 600000, 25, 'nearest', '2026-09-01'));
select tests.remember('cur', (select id from public.periods where budget_id = tests.id('b') and private.today() between start_date and end_date));
select tests.remember('cat', (select id from public.create_category(tests.id('b'), 'Savings', p_amount => 150000,
  p_from_period_id => (select id from public.periods where budget_id = tests.id('b') and seq = 1))));
select tests.remember('main', (select id from public.create_account(tests.id('b'), 'Main', 'current',
  p_from_period_id => (select id from public.periods where budget_id = tests.id('b') and seq = 1))));
select tests.remember('sav', (select id from public.create_account(tests.id('b'), 'Savings', 'savings',
  p_from_period_id => (select id from public.periods where budget_id = tests.id('b') and seq = 1))));
create function pg_temp.row_of(t uuid, p uuid) returns text language sql as $$
  select row(c.status, c.held_back, c.transaction_id is not null)::text from public.get_transfer_checklist(p) as c where c.transfer_id = t
$$;

-- ===========================================================================
-- M1: removing a mark never leaves an automatic linked occurrence without its transaction
-- ===========================================================================
-- 1. not done by mistake, something else settles, the mark undone
select tests.remember('t1', (select id from public.create_transfer(tests.id('b'), 'Standing order', tests.id('main'), tests.id('sav'), 100000,
  'day_of_month', p_day_of_month => 20, p_is_automatic => true, p_category_id => tests.id('cat'))));
select is((select status from public.mark_transfer_not_done(tests.id('t1'), tests.id('cur'), 0) where transfer_id = tests.id('t1')),
  'not_done', 'setup: marked not done by mistake');
select count(*) from public.create_transfer(tests.id('b'), 'Other', tests.id('main'), tests.id('sav'), 5000, 'day_of_month', p_day_of_month => 28);
select is((select status from public.undo_transfer_mark(tests.id('t1'), tests.id('cur'), 1) where transfer_id = tests.id('t1')),
  'upcoming', 'R-ACCOUNT-240: the mark undone, it is upcoming again');
select tests.clear_authentication();
select tests.set_today('2026-11-21');
select tests.authenticate_as('ann');
select public.ensure_periods(tests.id('b'));
select is(pg_temp.row_of(tests.id('t1'), tests.id('cur')), row('done', false, true)::text,
  'R-ACCOUNT-074 D-393: once due it is done with its transaction (the watermark went back with the mark)');
select is((select caught_up from public.my_budgets where id = tests.id('b')), true, 'R-PERIOD-130: and the budget is caught up');
-- 2. manual, marked done, made automatic, its transaction deleted: not done
select tests.remember('t2', (select id from public.create_transfer(tests.id('b'), 'Manual then automatic', tests.id('main'), tests.id('sav'), 2000,
  'day_of_month', p_day_of_month => 18, p_category_id => tests.id('cat'))));
select count(*) from public.mark_transfer_done(tests.id('t2'), tests.id('cur'), 0);
select count(*) from public.update_transfer(tests.id('t2'), 1, p_is_automatic => true);
select public.delete_transaction(t.id, t.revision) from public.transaction_list as t where t.transfer_id = tests.id('t2');
select is(pg_temp.row_of(tests.id('t2'), tests.id('cur')), row('not_done', false, false)::text,
  'R-ACCOUNT-240 D-393: deleting the transaction of an automatic transfer says it did not happen, whoever marked it');
-- 3. manual, skipped, made automatic, the mark undone: done with its transaction
select tests.remember('t3', (select id from public.create_transfer(tests.id('b'), 'Skipped then automatic', tests.id('main'), tests.id('sav'), 3000,
  'day_of_month', p_day_of_month => 17, p_category_id => tests.id('cat'))));
select count(*) from public.skip_transfer(tests.id('t3'), tests.id('cur'), 0);
select count(*) from public.update_transfer(tests.id('t3'), 1, p_is_automatic => true);
select is((select row(status, transaction_id is not null)::text from public.undo_transfer_mark(tests.id('t3'), tests.id('cur'), 1) where transfer_id = tests.id('t3')),
  row('done', true)::text, 'R-ACCOUNT-240 D-393: undone, the automatic occurrence gets its transaction at once');
-- 4. the same with a mark that is not the catch-up's, its transaction deleted after the terms went manual again
select is((select count(*)::integer from public.transaction_list where transfer_id in (tests.id('t1'), tests.id('t3'))), 2,
  'R-ACCOUNT-074: one transaction each');
select is_empty(format('select * from tests.moneyflow_violations(%L)', tests.id('b')), 'R-ACCOUNT-231: the step 7 invariants hold');

-- ===========================================================================
-- A kept income that has ended does not block an edit (D-396)
-- ===========================================================================
select tests.remember('side', public.add_income(tests.id('b'), 'Side', 100000, 1, 'nearest',
  p_from_period_id => (select id from public.periods where budget_id = tests.id('b') and seq = 1)));
select tests.remember('t5', (select id from public.create_transfer(tests.id('b'), 'Side order', tests.id('main'), tests.id('sav'), 1000,
  'pay_date', p_offset_days => 2, p_income_id => tests.id('side'))));
select public.remove_income(tests.id('side'), (select revision from public.incomes where id = tests.id('side')));
select lives_ok(format('select * from public.preview_update_transfer(%L)', tests.id('t5')),
  'D-396: the preview with no argument works once the chosen income has ended');
select lives_ok(format('select * from public.update_transfer(%L, %s, p_amount => 1200)', tests.id('t5'),
                       (select revision from public.transfers where id = tests.id('t5'))),
  'D-396: so does an edit of the amount alone (the kept income is not checked as newly chosen)');
select throws_ok(format('select * from public.update_transfer(%L, %s, p_income_id => %L)', tests.id('t5'),
                       (select revision from public.transfers where id = tests.id('t5')), tests.id('side')),
  'P0001', 'income_not_in_force', 'D-396: choosing it again is refused');

-- ===========================================================================
-- A full budget: ending refused while held back, previews create nothing (D-397, D-398)
-- ===========================================================================
select tests.clear_authentication();
do $$ begin
  execute format('create or replace function private.limit_transactions() returns integer language sql immutable set search_path = '''' as $f$ select %s $f$',
                 (select count(*) from public.transactions where budget_id = tests.id('b')));
end $$;
select tests.authenticate_as('ann');
select tests.remember('t6', (select id from public.create_transfer(tests.id('b'), 'Held', tests.id('main'), tests.id('sav'), 7000,
  'pay_date', p_offset_days => 0, p_is_automatic => true, p_category_id => tests.id('cat'))));
select is((select row(status, held_back)::text from public.get_transfer_checklist(
             (select id from public.periods where budget_id = tests.id('b') and private.today() between start_date and end_date))
           where transfer_id = tests.id('t6')), row('done', true)::text, 'setup: its transaction is held back');
select throws_ok(format('select public.end_transfer(%L, %s)', tests.id('t6'), (select revision from public.transfers where id = tests.id('t6'))),
  'P0001', 'transfer_held_back', 'D-397: ending it would drop the held transaction: refused');
select is((select refusal from public.preview_end_transfer(tests.id('t6'))), 'transfer_held_back', 'D-397: the preview says so');
select is((select row(bool_or(created_at_once), min(created_at_once_count))::text
           from public.preview_create_transfer(tests.id('b'), tests.id('main'), tests.id('sav'), 100, 'pay_date', p_offset_days => 0,
                                               p_is_automatic => true, p_category_id => tests.id('cat'), p_count => 3)),
          row(false, 0)::text, 'D-398: in a full budget the preview creates nothing at once, and says how many (0)');
select tests.clear_authentication();
create or replace function private.limit_transactions() returns integer language sql immutable set search_path = '' as $f$ select 50000 $f$;
select tests.authenticate_as('ann');
select is((select min(created_at_once_count) from public.preview_create_transfer(tests.id('b'), tests.id('main'), tests.id('sav'), 100, 'pay_date',
             p_offset_days => 0, p_is_automatic => true, p_category_id => tests.id('cat'),
             p_from_period_id => (select id from public.periods where budget_id = tests.id('b') and seq = 1), p_count => 1)),
          (select count(*)::integer from public.periods where budget_id = tests.id('b')),
  'D-398: the count covers every period the terms govern, beyond the rows listed');

-- ===========================================================================
-- The comparison carries the transfers' committed figure (D-399)
-- ===========================================================================
select is_empty(format($$select 1 from public.get_period_trend(%L) as t join public.period_summaries as s on s.id = t.period_id
                         where t.transfer_committed_total <> s.transfer_committed_total$$, tests.id('b')),
  'D-399: the trend gives each period''s transfer-committed total');
select is((select b_transfer_committed from public.get_period_comparison(tests.id('b'), null,
             (select id from public.periods where budget_id = tests.id('b') and private.today() between start_date and end_date)) where kind = 'total'),
          (select transfer_committed_total from public.period_summaries where budget_id = tests.id('b') and is_current),
  'D-399: the comparison gives each side''s transfer-committed total');
select is((select bool_and(transfer_committed[array_length(transfer_committed, 1)] =
                           coalesce((select g.transfer_committed from public.get_period_progress(period_ids[array_length(period_ids, 1)]) as g
                                     where g.category_id = t.category_id), 0))
           from public.get_category_trend(tests.id('b')) as t), true,
  'D-399: and each line of the category trend its own, per period');

select * from finish();
rollback;
