\echo == N1. a main-income transfer made the day after payday with no period named (D-493: "the first occurrence is the next one on or after today"),
\echo    then the period is reopened (the salary had not come) and the salary is recorded two days later.
\o /dev/null
select pg_temp.day('2026-11-26');
select pg_temp.setup('n', 25);
select tests.remember('n_t', (select id from public.create_transfer(tests.id('n'), 'Savings', tests.id('n_main'), tests.id('n_sav'), 100000, 'pay_date', p_is_automatic => true, p_category_id => tests.id('n_cat'))));
select tests.remember('n_m', (select id from public.create_transfer(tests.id('n'), 'By hand', tests.id('n_main'), tests.id('n_sav'), 20000, 'pay_date', p_category_id => tests.id('n_cat'))));
select tests.remember('n_c', (select id from public.create_transfer(tests.id('n'), 'Control (names Salary)', tests.id('n_main'), tests.id('n_sav'), 5000, 'pay_date', p_income_id => tests.id('n_sal'), p_is_automatic => true, p_category_id => tests.id('n_cat'))));
\o
\echo   26 Nov (period 25 Nov..24 Dec): made today, counts from the next payday
select name, starts_on, starts_seq, next_due_date from public.transfer_overview where budget_id = tests.id('n') order by name;
\echo   27 Nov: the salary of 25 Nov had not come: reopen (preview, write); 28 Nov: it came (preview, write)
select pg_temp.day('2026-11-27');
select record_kind, record_name, change from public.preview_reopen(tests.id('n'));
\o /dev/null
select public.reopen_previous_period(tests.id('n'), (pg_temp.cur('n')).id, (pg_temp.cur('n')).revision);
\o
select name, starts_on, starts_seq, next_due_date from public.transfer_overview where budget_id = tests.id('n') order by name;
select pg_temp.day('2026-11-28');
select accepted, refusal, transfer_transactions_removed, transfer_transactions_created from public.preview_record_early_pay_date(tests.id('n'), '2026-11-28');
\o /dev/null
select public.record_early_pay_date(tests.id('n'), (pg_temp.cur('n')).id, (pg_temp.cur('n')).revision, '2026-11-28');
\o
\echo   28 Nov: the new period started today, two days after the transfers were made
select * from pg_temp.see('n') where seq >= 2;
select name, starts_on, starts_seq, next_due_date from public.transfer_overview where budget_id = tests.id('n') order by name;
select * from public.get_transfers_to_do(tests.id('n'));
\o /dev/null
select pg_temp.day('2026-12-26');
select public.ensure_periods(tests.id('n'));
\o
\echo   26 Dec: everything recorded
select 'Savings' t, * from pg_temp.tx(tests.id('n_t')) union all select 'By hand', * from pg_temp.tx(tests.id('n_m')) union all select 'Control', * from pg_temp.tx(tests.id('n_c')) order by 1, 2;
select * from pg_temp.see('n') where seq >= 2;
\o /dev/null
select tests.clear_authentication();
\o
