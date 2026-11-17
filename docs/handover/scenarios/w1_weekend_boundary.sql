\echo == W1. a fixed day whose weekend rule moves its due date BEFORE the start of the period that lists it.
\echo    Pay day 25 (rule none). 25 Oct 2026 is a Sunday. "Rent" = fixed day 25, weekend rule previous (due Fri 23 Oct), automatic, linked; made 20 Oct.
\o /dev/null
select pg_temp.day('2026-10-20');
select pg_temp.setup('w', 25);
select tests.remember('w_t', (select id from public.create_transfer(tests.id('w'), 'Rent', tests.id('w_main'), tests.id('w_sav'), 150000, 'day_of_month', p_day_of_month => 25, p_is_automatic => true, p_category_id => tests.id('w_cat'), p_weekend_rule => 'previous')));
\o
select name, first_date, weekend_rule, starts_on, next_due_date from public.transfer_overview where id = tests.id('w_t');
select occurrence_kind, occurrence_date, due_date, projected, created_at_once from public.preview_update_transfer(tests.id('w_t'), p_count => 2);
savepoint a;
\echo   CASE 1: the member opens the app on Fri 23 Oct (the due date), then on Sun 25 Oct and on 30 Oct
\o /dev/null
select pg_temp.day('2026-10-23');
select public.ensure_periods(tests.id('w'));
\o
select 'on 23 Oct' as at, * from pg_temp.tx(tests.id('w_t'));
select * from pg_temp.nd('w');
\o /dev/null
select pg_temp.day('2026-10-25');
select public.ensure_periods(tests.id('w'));
\o
select 'on 25 Oct' as at, * from pg_temp.tx(tests.id('w_t'));
select * from pg_temp.see('w', tests.id('w_t'));
select * from pg_temp.marks(tests.id('w_t'));
select * from pg_temp.nd('w');
\o /dev/null
select pg_temp.day('2026-10-30');
select public.ensure_periods(tests.id('w'));
\o
select 'on 30 Oct' as at, * from pg_temp.tx(tests.id('w_t'));
select * from pg_temp.see('w', tests.id('w_t'));
select s.seq, s.spent_total, s.expected_total from public.period_summaries s where s.budget_id = tests.id('w') order by 1;
rollback to a;
\echo   CASE 2 (control): the app is not opened between 20 Oct and 25 Oct
\o /dev/null
select pg_temp.day('2026-10-25');
select public.ensure_periods(tests.id('w'));
\o
select 'on 25 Oct' as at, * from pg_temp.tx(tests.id('w_t'));
select * from pg_temp.see('w', tests.id('w_t'));
rollback to a;
\echo   CASE 3: the same on a Saturday start: fixed day 26 (Sun 25 Oct is the start; take pay day 24 -> period starts Sat 24 Oct), rule nearest: 24 Oct -> Fri 23 Oct
\o /dev/null
select pg_temp.setup('v', 24);
select tests.remember('v_t', (select id from public.create_transfer(tests.id('v'), 'Rent', tests.id('v_main'), tests.id('v_sav'), 150000, 'day_of_month', p_day_of_month => 24, p_is_automatic => true, p_category_id => tests.id('v_cat'), p_weekend_rule => 'nearest')));
select pg_temp.day('2026-10-23');
select public.ensure_periods(tests.id('v'));
select pg_temp.day('2026-10-24');
select public.ensure_periods(tests.id('v'));
select pg_temp.day('2026-10-30');
select public.ensure_periods(tests.id('v'));
\o
select * from pg_temp.tx(tests.id('v_t'));
select * from pg_temp.see('v', tests.id('v_t'));
\o /dev/null
select tests.clear_authentication();
\o
