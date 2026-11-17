\echo == W2. a fixed day due (by its weekend rule) before the start of the period that lists it, when the catch-up looked at the transfer
\echo    between that due date and the day the period is created. Pay day 25 (rule none); 25 Oct 2026 is a Sunday.
\echo    "Rent" = fixed day 25, weekend rule previous (due Fri 23 Oct), automatic, linked; made 20 Oct.
\o /dev/null
select pg_temp.day('2026-10-20');
select pg_temp.setup('w', 25);
select tests.remember('w_t', (select id from public.create_transfer(tests.id('w'), 'Rent', tests.id('w_main'), tests.id('w_sav'), 150000, 'day_of_month', p_day_of_month => 25, p_is_automatic => true, p_category_id => tests.id('w_cat'), p_weekend_rule => 'previous')));
\o
select * from pg_temp.nd('w');
savepoint a;
\echo   CASE A: Sat 24 Oct: the member raises the amount from now (1 500.00 -> 1 550.00). Preview, write. Then 25 Oct, 30 Oct, 26 Nov.
select occurrence_kind, occurrence_date, due_date, projected, created_at_once, created_at_once_count, transactions_removed_count from public.preview_update_transfer(tests.id('w_t'), p_amount => 155000, p_count => 2);
\o /dev/null
select pg_temp.day('2026-10-24');
select public.update_transfer(tests.id('w_t'), pg_temp.rev('transfers', tests.id('w_t')), p_amount => 155000);
\o
select * from pg_temp.nd('w');
\o /dev/null
select pg_temp.day('2026-10-25');
select public.ensure_periods(tests.id('w'));
\o
select 'on 25 Oct' as at, * from pg_temp.tx(tests.id('w_t'));
select * from pg_temp.see('w', tests.id('w_t'));
select * from pg_temp.nd('w');
\o /dev/null
select pg_temp.day('2026-11-26');
select public.ensure_periods(tests.id('w'));
\o
select 'on 26 Nov' as at, * from pg_temp.tx(tests.id('w_t'));
select * from pg_temp.see('w', tests.id('w_t'));
select s.seq, s.start_date, s.spent_total from public.period_summaries s where s.budget_id = tests.id('w') order by 1;
\echo   the row as the screen gets it, and what ending the transfer answers
select occurrence_date, due_date, status, assumed, held_back, transaction_id is null as no_tx from public.get_transfer_checklist((pg_temp.per('w', 2)).id) where transfer_id = tests.id('w_t');
select outcome, refusal from public.preview_end_transfer(tests.id('w_t'));
select caught_up from public.my_budgets where id = tests.id('w');
\echo   what the row allows: not done, then undo (the app then records it?)
select occurrence_date, due_date, status, assumed, transaction_id is not null as tx from public.mark_transfer_not_done(tests.id('w_t'), (pg_temp.per('w', 2)).id, 0, '2026-10-25', 'fixed_day');
select occurrence_date, due_date, status, assumed, transaction_id is not null as tx from public.undo_transfer_mark(tests.id('w_t'), (pg_temp.per('w', 2)).id, 1, '2026-10-25', 'fixed_day');
select 'after undo' as at, * from pg_temp.tx(tests.id('w_t'));
rollback to a;
\echo   CASE B: Sat 24 Oct: another transfer of the budget is untouched, but the member marks a manual occurrence of "Rent"-like transfer and undoes it
\echo           (here: a second, manual pay-date transfer is skipped and undone; Rent itself is not touched): control, Rent must be recorded
\o /dev/null
select tests.remember('w_m', (select id from public.create_transfer(tests.id('w'), 'By hand', tests.id('w_main'), tests.id('w_sav'), 20000, 'pay_date', p_from_period_id => (pg_temp.cur('w')).id)));
select pg_temp.day('2026-10-24');
select public.skip_transfer(tests.id('w_m'), (pg_temp.cur('w')).id, 0);
select public.undo_transfer_mark(tests.id('w_m'), (pg_temp.cur('w')).id, 1);
select pg_temp.day('2026-10-25');
select public.ensure_periods(tests.id('w'));
\o
select 'on 25 Oct' as at, * from pg_temp.tx(tests.id('w_t'));
rollback to a;
\echo   CASE C: Sat 24 Oct: the member says the salary is expected on Mon 26 Oct, then (same day) clears it again; 25 Oct the period starts
\o /dev/null
select pg_temp.day('2026-10-24');
select public.set_expected_pay_date(tests.id('w'), (pg_temp.cur('w')).id, (pg_temp.cur('w')).revision, '2026-10-26');
\o
select 'expected 26 Oct' as at, * from pg_temp.tx(tests.id('w_t'));
select * from pg_temp.see('w', tests.id('w_t'));
select accepted, refusal, transfer_transactions_removed, transfer_transactions_created, transfer_transactions_moved from public.preview_set_expected_pay_date(tests.id('w'));
\o /dev/null
select public.set_expected_pay_date(tests.id('w'), (pg_temp.cur('w')).id, (pg_temp.cur('w')).revision);
\o
select 'cleared' as at, * from pg_temp.tx(tests.id('w_t'));
select * from pg_temp.nd('w');
\o /dev/null
select pg_temp.day('2026-10-25');
select public.ensure_periods(tests.id('w'));
select pg_temp.day('2026-10-30');
select public.ensure_periods(tests.id('w'));
\o
select 'on 30 Oct' as at, * from pg_temp.tx(tests.id('w_t'));
select * from pg_temp.see('w', tests.id('w_t'));
rollback to a;
\echo   CASE D: manual instead of automatic, same as A: listed to do?
\o /dev/null
select public.update_transfer(tests.id('w_t'), pg_temp.rev('transfers', tests.id('w_t')), p_is_automatic => false);
select pg_temp.day('2026-10-24');
select public.update_transfer(tests.id('w_t'), pg_temp.rev('transfers', tests.id('w_t')), p_amount => 155000);
select pg_temp.day('2026-10-25');
select public.ensure_periods(tests.id('w'));
\o
select * from pg_temp.see('w', tests.id('w_t'));
select * from public.get_transfers_to_do(tests.id('w'));
\o /dev/null
select tests.clear_authentication();
\o
