\echo == W4. M1 without any action of the member: the app is not opened for a whole period. Pay day 25 (rule none); 25 Oct 2026 is a Sunday.
\echo    "Rent" = fixed day 25, weekend rule previous, automatic, linked, made 20 Sep 2026 (first 25 Sep). The app is next opened on 26 Nov.
\o /dev/null
select pg_temp.day('2026-09-20');
select pg_temp.setup('w', 25, '2026-08-01');
select tests.remember('w_t', (select id from public.create_transfer(tests.id('w'), 'Rent', tests.id('w_main'), tests.id('w_sav'), 150000, 'day_of_month', p_day_of_month => 25, p_is_automatic => true, p_category_id => tests.id('w_cat'), p_weekend_rule => 'previous')));
select tests.remember('w_c', (select id from public.create_transfer(tests.id('w'), 'Control (no weekend rule)', tests.id('w_main'), tests.id('w_sav'), 1000, 'day_of_month', p_day_of_month => 25, p_is_automatic => true, p_category_id => tests.id('w_cat'))));
\o
select * from pg_temp.nd('w');
select pg_temp.day('2026-11-26');
select public.ensure_periods(tests.id('w'));
select public.ensure_periods(tests.id('w'));
select public.ensure_periods(tests.id('w'));
select caught_up from public.my_budgets where id = tests.id('w');
\echo   26 Nov: the periods and Rent's rows; its transactions; the control's
select * from pg_temp.see('w', tests.id('w_t'));
select * from pg_temp.tx(tests.id('w_t'));
select * from pg_temp.tx(tests.id('w_c'));
select * from pg_temp.nd('w');
\o /dev/null
select tests.clear_authentication();
\o
