\echo == W3. D-493 ("nothing dated before today unless the member asks") and a weekend rule. Pay day 20 (period 20 Oct..19 Nov 2026).
\echo    Sat 24 Oct 2026: the member makes "Rent" = fixed day 25, weekend rule previous, with no period and no first date. 25 Oct is a Sunday: due Fri 23 Oct.
\o /dev/null
select pg_temp.day('2026-10-24');
select pg_temp.setup('w', 20);
\o
select occurrence_kind, occurrence_date, due_date, projected, created_at_once, created_at_once_count
from public.preview_create_transfer(tests.id('w'), tests.id('w_main'), tests.id('w_sav'), 150000, 'day_of_month', p_day_of_month => 25, p_is_automatic => true, p_category_id => tests.id('w_cat'), p_weekend_rule => 'previous', p_count => 2);
\o /dev/null
select tests.remember('w_a', (select id from public.create_transfer(tests.id('w'), 'Rent', tests.id('w_main'), tests.id('w_sav'), 150000, 'day_of_month', p_day_of_month => 25, p_is_automatic => true, p_category_id => tests.id('w_cat'), p_weekend_rule => 'previous')));
select tests.remember('w_m', (select id from public.create_transfer(tests.id('w'), 'By hand', tests.id('w_main'), tests.id('w_sav'), 20000, 'day_of_month', p_day_of_month => 25, p_category_id => tests.id('w_cat'), p_weekend_rule => 'previous')));
\o
select name, starts_on, first_date, next_due_date from public.transfer_overview where budget_id = tests.id('w') order by name;
select * from pg_temp.see('w') where seq >= 2;
select * from pg_temp.tx(tests.id('w_a'));
select * from public.get_transfers_to_do(tests.id('w'));
\echo   the manual one, later (26 Nov, its period is past): done with no date given (the default is its due date), then with the date 24 Oct
select pg_temp.day('2026-11-26');
select public.mark_transfer_done(tests.id('w_m'), (pg_temp.per('w', 2)).id, 0, p_occurrence_date => '2026-10-25', p_occurrence_kind => 'fixed_day');
select occurrence_date, due_date, status, done_on from public.mark_transfer_done(tests.id('w_m'), (pg_temp.per('w', 2)).id, 0, '2026-10-24', p_occurrence_date => '2026-10-25', p_occurrence_kind => 'fixed_day');
\o /dev/null
select tests.clear_authentication();
\o
