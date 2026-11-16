-- Step 4 re-review: no call catches up more than one bounded step (every function that
-- touches the current period, found from the code, answers catching_up on a budget 40 years
-- behind); a held-back charge cannot be lost by a schedule change; interest on the balance
-- before the period's start; an ended debt is frozen for update_debt; terms only where the
-- record is in force; and the behaviours the re-review's mutants showed no test protected.
begin;
select plan(56);

select tests.create_user('ann', 'Ann');
select tests.set_today('2026-11-16');

-- ===========================================================================
-- One bounded step of catch-up per call (R-PERIOD-180, D-270)
-- ===========================================================================
select tests.authenticate_as('ann');
select tests.remember('o', public.create_budget('Old', 'Salary', 500000, 25, 'nearest', '2026-08-01'));
select tests.remember('o_cat', (select id from public.create_category(tests.id('o'), 'C', null, 5000, 'monthly',
  (select id from public.periods where budget_id = tests.id('o') and seq = 1))));
select tests.remember('o_sub', (select id from public.create_subscription(tests.id('o'), 'S', 1000, 'monthly', tests.id('o_cat'), '2026-11-10')));
select tests.remember('o_debt', (select id from public.create_debt(tests.id('o'), 'D', 100000, tests.id('o_cat'), 5000, 12)));
select tests.remember('o_tx', (select id from public.transactions where subscription_id = tests.id('o_sub') limit 1));
select public.adjust_debt_balance(tests.id('o_debt'), 1, 90000);
select tests.remember('o_adj', (select id from public.debt_adjustments where debt_id = tests.id('o_debt')));
select tests.remember('o_inc', public.add_income(tests.id('o'), 'Side', 1000, 10));
-- an edit form not yet changed, first in this session (a plan made by an earlier call with
-- arguments would hide an unassigned record): the schedule as it stands (R-SUBSCRIPTION-133)
create temp table no_arg_preview on commit drop as
  select array_agg(d) as dates from public.preview_update_subscription(tests.id('o_sub'), p_count => 3) as d;
select is((select dates from no_arg_preview),
          (select array_agg(d) from public.preview_update_subscription(tests.id('o_sub'), p_price => 1000, p_count => 3) as d),
  'R-SUBSCRIPTION-133: a preview with no term argument answers the schedule as it stands');
-- step 6: a batch, a merchant rule and an import token of this budget
select tests.remember('o_batch', gen_random_uuid());
select count(*) from public.import_transactions(tests.id('o'), tests.id('o_batch'), 1,
  '[{"date": "2026-11-16", "amount": 500, "direction": "debit", "description": "Shop"}]', 'csv');
select tests.remember('o_rule', (select rule_id from public.create_merchant_rule(tests.id('o'), 'shop', tests.id('o_cat'))));
create temp table o_token on commit drop as select token from public.create_import_token(tests.id('o'), 'Script');
grant select on o_token to authenticated;
-- step 7: two accounts and a planned transfer between them
select tests.remember('o_acc1', (select id from public.create_account(tests.id('o'), 'A', 'current')));
select tests.remember('o_acc2', (select id from public.create_account(tests.id('o'), 'B', 'savings')));
select tests.remember('o_tr', (select id from public.create_transfer(tests.id('o'), 'T', tests.id('o_acc1'), tests.id('o_acc2'),
  1000, 'pay_date')));
select tests.clear_authentication();
select tests.set_today('2066-11-16');

-- Every public function that reaches private.ensure_periods through any chain of calls, from
-- the code itself, so that a new one cannot be left out.
create temp table catch_up_fns on commit drop as
with recursive fns as (
  select p.oid, n.nspname, p.proname, p.prosrc from pg_catalog.pg_proc as p
  join pg_catalog.pg_namespace as n on n.oid = p.pronamespace where n.nspname in ('public', 'private')
), closure (oid, nspname, proname) as (
  select oid, nspname, proname from fns where nspname = 'private' and proname = 'ensure_periods'
  union
  select f.oid, f.nspname, f.proname from fns as f join closure as c on f.prosrc like '%' || c.nspname || '.' || c.proname || '(%'
)
select c.oid, c.proname from closure as c
where c.nspname = 'public' and c.proname not in ('ensure_periods', 'get_current_period', 'create_budget');
create temp table arg_values (name text primary key, value text) on commit drop;
insert into arg_values values
  ('p_budget_id', tests.id('o')::text), ('p_subscription_id', tests.id('o_sub')::text), ('p_debt_id', tests.id('o_debt')::text),
  ('p_income_id', tests.id('o_inc')::text), ('p_category_id', tests.id('o_cat')::text),
  ('p_period_id', (select id::text from public.periods where budget_id = tests.id('o') order by seq desc limit 1)),
  ('p_transaction_id', tests.id('o_tx')::text), ('p_adjustment_id', tests.id('o_adj')::text),
  ('p_user_id', tests.get_user_id('ann')::text), ('p_expected_revision', '1'), ('p_name', 'x'), ('p_amount', '100'),
  ('p_kind', 'expense'), ('p_date', '2026-11-16'), ('p_price', '100'), ('p_cadence', 'monthly'),
  ('p_first_charge_date', '2026-12-01'), ('p_principal', '100'), ('p_monthly_payment', '10'), ('p_balance', '50'),
  ('p_pay_day', '25'), ('p_pay_date', '2026-11-10'), ('p_category_ids', '{' || tests.id('o_cat') || '}'),
  ('p_from_period_id', (select id::text from public.periods where budget_id = tests.id('o') and seq = 1)),
  ('p_batch_id', tests.id('o_batch')::text), ('p_chunk', '2'), ('p_source', 'csv'),
  ('p_rows', '[{"date": "2026-11-16", "amount": 700, "direction": "debit"}]'), ('p_fragment', 'cafe'),
  ('p_rule_id', tests.id('o_rule')::text), ('p_token', (select token from o_token)),
  ('p_account_id', tests.id('o_acc1')::text), ('p_from_account_id', tests.id('o_acc1')::text),
  ('p_to_account_id', tests.id('o_acc2')::text), ('p_schedule', 'pay_date'), ('p_transfer_id', tests.id('o_tr')::text);
-- refused for what the arguments say before any catch-up (the owner can neither leave nor be
-- removed), so they touch no period either
create temp table refused_first (proname text primary key, outcome text) on commit drop;
insert into refused_first values ('leave_budget', 'owner_cannot_leave'), ('remove_member', 'owner_cannot_leave');
create temp table stale on commit drop as select count(*)::integer as n from public.periods where budget_id = tests.id('o');
grant select on refused_first, stale to authenticated;
create temp table calls on commit drop as
select f.proname,
       pg_catalog.format('select * from public.%I(%s)', f.proname,
         (select string_agg(pg_catalog.format('%I => %L::%s', a.name,
                              -- an argument whose name means another type (an account's kind)
                              case when a.name = 'p_kind' and a.type = 'public.account_kind'::regtype then 'current' else v.value end,
                              pg_catalog.format_type(a.type, null)), ', ' order by a.i)
          from pg_catalog.pg_proc as p
          cross join lateral unnest(p.proargnames[1:p.pronargs - p.pronargdefaults], p.proargtypes::oid[]) with ordinality as a (name, type, i)
          left join arg_values as v on v.name = a.name
          where p.oid = f.oid and a.i <= p.pronargs - p.pronargdefaults)) as sql,
       (select string_agg(a.name, ', ')
        from pg_catalog.pg_proc as p
        cross join lateral unnest(p.proargnames[1:p.pronargs - p.pronargdefaults]) with ordinality as a (name, i)
        where p.oid = f.oid and not exists (select 1 from arg_values as v where v.name = a.name)) as unknown_args
from catch_up_fns as f;
create temp table results (proname text, outcome text, periods integer) on commit drop;
grant select on calls to authenticated;
grant insert, select on results to authenticated;
select is_empty($$select proname, unknown_args from calls where unknown_args is not null$$,
  'setup: every required argument of those functions has a test value');
select cmp_ok((select count(*)::integer from calls), '>=', 45, 'setup: the functions that catch up were found in the code');
select tests.authenticate_as('ann');
do $$
declare
  c record;
  v_outcome text;
begin
  for c in select * from calls order by proname loop
    begin
      execute c.sql;
      v_outcome := 'no error';
    exception when others then
      v_outcome := sqlerrm;
    end;
    insert into results values (c.proname, v_outcome, (select count(*) from public.periods where budget_id = tests.id('o')));
  end loop;
end $$;
select is_empty($$select r.proname, r.outcome from results as r left join refused_first as f on f.proname = r.proname
                  where r.outcome <> coalesce(f.outcome, 'catching_up')$$,
  'R-PERIOD-180: 40 years behind, every read, preview and write answers catching_up');
select is((select max(periods) from results), (select n from stale), 'R-PERIOD-180: and none of them keeps a period it created');
select is(public.ensure_periods(tests.id('o')), 120, 'R-PERIOD-180: ensure_periods creates one step, 120 periods');
select is_empty(format('select * from public.get_current_period(%L)', tests.id('o')), 'R-PERIOD-180: get_current_period one more step, and no current period yet');
select is((select count(*)::integer from public.periods where budget_id = tests.id('o')), (select n + 240 from stale), 'R-PERIOD-180: two steps of 120 periods');
select is((select caught_up from public.my_budgets where id = tests.id('o')), false, 'R-PERIOD-130: still behind');
select throws_ok(format('select * from public.preview_end_subscription(%L)', tests.id('o_sub')), 'P0001', 'catching_up',
  'R-PERIOD-180: a preview answers catching_up rather than an outcome');
select tests.clear_authentication();

-- ===========================================================================
-- A charge held back by the transaction limit is not lost (R-SUBSCRIPTION-180, D-271)
-- ===========================================================================
select tests.set_today('2026-11-16');
select tests.authenticate_as('ann');
select tests.remember('h', public.create_budget('Held', 'Salary', 600000, 25, 'nearest', '2026-09-01'));
select tests.remember('h_cat', (select id from public.create_category(tests.id('h'), 'Bills', p_from_period_id =>
  (select id from public.periods where budget_id = tests.id('h') and seq = 1))));
select tests.remember('h_sub', (select id from public.create_subscription(tests.id('h'), 'C', 1000, 'monthly', tests.id('h_cat'), '2026-10-23',
  (select id from public.periods where budget_id = tests.id('h') and seq = 1))));
select tests.remember('h_free', (select id from public.add_transaction(tests.id('h'), 'expense', 5, '2026-11-16', tests.id('h_cat'))));
select tests.clear_authentication();
create temp table hn on commit drop as select count(*)::integer as n from public.transactions where budget_id = tests.id('h');
do $$ begin
  execute format('create or replace function private.limit_transactions() returns integer language sql immutable set search_path = '''' as $f$ select %s $f$', (select n from hn));
end $$;
set local session_replication_role = replica;  -- set the date without the trigger that keeps it
update public.subscriptions set updated_at = '2026-01-01' where id = tests.id('h_sub');
set local session_replication_role = origin;
select tests.set_today('2026-11-25');
select tests.authenticate_as('ann');
select public.ensure_periods(tests.id('h'));
select is((select next_charge_date from public.subscription_overview where id = tests.id('h_sub')), '2026-11-23'::date,
  'R-SUBSCRIPTION-180: the held charge''s date is shown as the next charge');
select is((select caught_up from public.my_budgets where id = tests.id('h')), true,
  'R-SUBSCRIPTION-131: a full budget with a held charge is caught up (nothing it has room for is due)');
select throws_ok(format('select public.update_subscription(%L, %s, p_cadence => %L)', tests.id('h_sub'),
                        (select revision from public.subscriptions where id = tests.id('h_sub')), 'quarterly'),
  'P0001', 'charge_held_back', 'R-SUBSCRIPTION-180: the cadence cannot change while a charge waits');
select throws_ok(format('select public.update_subscription(%L, %s, p_next_charge_date => %L)', tests.id('h_sub'),
                        (select revision from public.subscriptions where id = tests.id('h_sub')), '2026-12-10'),
  'P0001', 'charge_held_back', 'R-SUBSCRIPTION-180: nor the next charge date');
select throws_ok(format('select public.end_subscription(%L, %s)', tests.id('h_sub'), (select revision from public.subscriptions where id = tests.id('h_sub'))),
  'P0001', 'charge_held_back', 'R-SUBSCRIPTION-180: nor can it end');
select is((select refusal from public.preview_end_subscription(tests.id('h_sub'))), 'charge_held_back',
  'R-SUBSCRIPTION-180: the removal preview says so');
select lives_ok(format('select public.update_subscription(%L, %s, %L, 1200)', tests.id('h_sub'),
                       (select revision from public.subscriptions where id = tests.id('h_sub')), 'C renamed'),
  'R-SUBSCRIPTION-180: the name and price can change');
-- room again: a member deletes a transaction; the held charge comes, at the price of its period
select public.delete_transaction(tests.id('h_free'), (select revision from public.transactions where id = tests.id('h_free')));
select public.ensure_periods(tests.id('h'));
select is((select array_agg(row(charge_date, amount)::text order by charge_date) from public.transactions where subscription_id = tests.id('h_sub')),
          array[row('2026-10-23'::date, 1000)::text, row('2026-11-23'::date, 1000)::text],
  'R-SUBSCRIPTION-112 R-SUBSCRIPTION-180: once there is room the 23 November charge is created, none skipped, at its own period''s price');
select is((select updated_at from public.subscriptions where id = tests.id('h_sub')) > '2026-01-01', true, 'setup: the edit moved updated_at');
select tests.clear_authentication();
do $$ begin
  execute 'create or replace function private.limit_transactions() returns integer language sql immutable set search_path = '''' as $f$ select 50000 $f$';
end $$;
set local session_replication_role = replica;  -- set the date without the trigger that keeps it
update public.subscriptions set updated_at = '2026-01-01' where id = tests.id('h_sub');
set local session_replication_role = origin;
select tests.set_today('2026-12-24');
select tests.authenticate_as('ann');
select public.ensure_periods(tests.id('h'));
select is((select row(updated_at, (select count(*) from public.transactions where subscription_id = tests.id('h_sub')))::text from public.subscriptions where id = tests.id('h_sub')),
          row('2026-01-01'::timestamptz, 3)::text, 'R-SUBSCRIPTION-131: the catch-up creates the charge and leaves updated_at alone');
select tests.clear_authentication();
do $$ begin
  execute 'create or replace function private.limit_transactions() returns integer language sql immutable set search_path = '''' as $f$ select 50000 $f$';
end $$;

-- ===========================================================================
-- Interest on the balance before the period's start (R-DEBT-180, D-272)
-- ===========================================================================
select tests.set_today('2026-11-16');
select tests.authenticate_as('ann');
select tests.remember('i', public.create_budget('Interest', 'Salary', 600000, 25, 'nearest', '2026-09-01'));
select tests.remember('i_cat', (select id from public.create_category(tests.id('i'), 'Loans', p_from_period_id =>
  (select id from public.periods where budget_id = tests.id('i') and seq = 1))));
-- opened today; the salary arrived on 14 November: the new period starts before the opening
select tests.remember('i_new', (select id from public.create_debt(tests.id('i'), 'New', 100000, tests.id('i_cat'), 5000, 12)));
select tests.record_early_pay_date(tests.id('i'), '2026-11-14');
select is((select array_agg(kind order by date, kind) from public.get_debt_history(tests.id('i_new'))), array['opened'],
  'R-DEBT-180: a period starting before the debt was opened adds no interest; the history starts with the opening');
-- a debt from period 1: the interest of the next period is on the balance before its start,
-- and a period created again after a reopen gets the same interest, whatever was paid in it
select tests.remember('i_old', (select id from public.create_debt(tests.id('i'), 'Old', 500000, tests.id('i_cat'), 10000, 12,
  (select id from public.periods where budget_id = tests.id('i') and seq = 1))));
select tests.clear_authentication();
select tests.set_today('2026-12-28');
select tests.authenticate_as('ann');
select public.ensure_periods(tests.id('i'));
create temp table first_interest on commit drop as
  select i.amount, p.start_date from public.debt_interest as i join public.periods as p on p.id = i.period_id
  where i.debt_id = tests.id('i_old') order by p.seq desc limit 1;
grant select on first_interest to authenticated;
select is((select amount from first_interest), 5000::bigint,
  'R-DEBT-180: one twelfth of the rate on the balance before the period (the principal: nothing else is dated before it)');
select public.add_transaction(tests.id('i'), 'expense', 100000, '2026-12-28', tests.id('i_cat'), p_debt_id => tests.id('i_old'));
select tests.reopen_previous_period(tests.id('i'));
select tests.record_early_pay_date(tests.id('i'), (select start_date from first_interest));
select is((select i.amount from public.debt_interest as i join public.periods as p on p.id = i.period_id
           where i.debt_id = tests.id('i_old') and p.start_date = (select start_date from first_interest)),
          (select amount from first_interest),
  'R-DEBT-180: created again after a reopen, the period gets the same interest (the payment is dated inside it)');
select is((select array_agg(kind order by date, kind) filter (where date < (select opened_on from public.debts where id = tests.id('i_old')))
           from public.get_debt_history(tests.id('i_old'))), null::text[], 'R-DEBT-131: nothing is dated before the opening');

-- ===========================================================================
-- An ended debt is frozen (R-DEBT-134, D-209)
-- ===========================================================================
select tests.remember('e_debt', (select id from public.create_debt(tests.id('i'), 'No rate', 100000, tests.id('i_cat'), 5000, 0,
  (select id from public.periods where budget_id = tests.id('i') and seq = 1))));
select tests.remember('e_pay', (select id from public.add_transaction(tests.id('i'), 'expense', 1000, private.today(), tests.id('i_cat'), p_debt_id => tests.id('e_debt'))));
select public.adjust_debt_balance(tests.id('e_debt'), (select revision from public.debts where id = tests.id('e_debt')), 98000);
select tests.remember('e_adj', (select id from public.debt_adjustments where debt_id = tests.id('e_debt')));
select public.remove_debt(tests.id('e_debt'), (select revision from public.debts where id = tests.id('e_debt')),
  (select id from public.periods where budget_id = tests.id('i') and seq = 2));
select throws_ok(format('select public.update_debt(%L, %s, p_principal => 7)', tests.id('e_debt'), (select revision from public.debts where id = tests.id('e_debt'))),
  'P0001', 'debt_ended', 'R-DEBT-134: an ended debt''s principal cannot change');
select throws_ok(format('select public.update_debt(%L, %s, %L)', tests.id('e_debt'), (select revision from public.debts where id = tests.id('e_debt')), 'Renamed'),
  'P0001', 'debt_ended', 'R-DEBT-134: nor anything else of it');
select throws_ok(format('select public.update_transaction(%L, %s, %L, 1000, %L, %L, p_relink => true)', tests.id('e_pay'),
                        (select revision from public.transactions where id = tests.id('e_pay')), 'expense', private.today(), tests.id('i_cat')),
  'P0001', 'debt_ended', 'R-DEBT-134: its payment cannot be relinked away');
select throws_ok(format('select public.link_transaction(%L, %s)', tests.id('e_pay'), (select revision from public.transactions where id = tests.id('e_pay'))),
  'P0001', 'debt_ended', 'R-DEBT-134: nor unlinked');
select throws_ok(format('select public.delete_debt_adjustment(%L, %s)', tests.id('e_adj'), (select revision from public.debts where id = tests.id('e_debt'))),
  'P0001', 'debt_ended', 'R-DEBT-134: and its adjustments stay');

-- ===========================================================================
-- Debt figures and history paging (R-DEBT-136, R-DEBT-135)
-- ===========================================================================
select tests.remember('ov', (select id from public.create_debt(tests.id('i'), 'Over', 1000, tests.id('i_cat'), 100, 0)));
select public.adjust_debt_balance(tests.id('ov'), (select revision from public.debts where id = tests.id('ov')), 1500);
select public.add_transaction(tests.id('i'), 'expense', 2000, private.today(), tests.id('i_cat'), p_debt_id => tests.id('ov'));
select is((select row(remaining, overpaid_by)::text from public.debt_overview where id = tests.id('ov')), row(-500, 500)::text,
  'R-DEBT-136: overpaid by minus the remaining amount, adjustments included');

select tests.remember('pg', (select id from public.create_debt(tests.id('i'), 'Paged', 100000, tests.id('i_cat'), 100, 0)));
-- on one date: payments and adjustments recorded in turn
select public.add_transaction(tests.id('i'), 'expense', 100 * g, private.today(), tests.id('i_cat'), p_debt_id => tests.id('pg'))
from generate_series(1, 3) as g;
select public.adjust_debt_balance(tests.id('pg'), (select revision from public.debts where id = tests.id('pg')), 90001, private.today());
select public.adjust_debt_balance(tests.id('pg'), (select revision from public.debts where id = tests.id('pg')), 90002, private.today());
select public.adjust_debt_balance(tests.id('pg'), (select revision from public.debts where id = tests.id('pg')), 90003, private.today());
select tests.clear_authentication();
-- the order they were recorded in: payment, adjustment, payment, ... (created_at), unlike their ids
update public.transactions as t set created_at = '2026-12-28 10:00'::timestamptz + (r.n * 2) * interval '1 minute'
from (select id, row_number() over (order by id desc) as n from public.transactions where debt_id = tests.id('pg')) as r where r.id = t.id;
update public.debt_adjustments as a set created_at = '2026-12-28 10:00'::timestamptz + (r.n * 2 + 1) * interval '1 minute'
from (select id, row_number() over (order by id desc) as n from public.debt_adjustments where debt_id = tests.id('pg')) as r where r.id = a.id;
create temp table pages (n integer, entry_id uuid) on commit drop;
grant insert, select on pages to authenticated;
select tests.authenticate_as('ann');
do $$
declare
  r record;
  v_last record;
  v_n integer := 0;
begin
  loop
    v_n := v_n + 1;
    exit when v_n > 20;
    if v_last is null then
      select * into r from public.get_debt_history(tests.id('pg'), 1);
    else
      select * into r from public.get_debt_history(tests.id('pg'), 1, v_last.date, v_last.kind, v_last.created_at, v_last.entry_id);
    end if;
    exit when r.entry_id is null;
    insert into pages values (v_n, r.entry_id);
    v_last := r;
  end loop;
end $$;
select is((select array_agg(entry_id order by n) from pages),
          (select array_agg(entry_id) from public.get_debt_history(tests.id('pg'), 1000)),
  'R-DEBT-135: one row a page: every entry once, in order, payments and adjustments of one date by when they were recorded');

-- ===========================================================================
-- Subscriptions: watermark, previews, filters (R-SUBSCRIPTION-111, R-SUBSCRIPTION-133, R-TRANSACTION-132)
-- ===========================================================================
-- a yearly subscription from period 1: its watermark stays in period 1 until its next date
select tests.remember('y', (select id from public.create_subscription(tests.id('i'), 'Yearly', 5000, 'yearly', tests.id('i_cat'), '2026-08-26',
  (select id from public.periods where budget_id = tests.id('i') and seq = 1))));
create temp table y_before on commit drop as select count(*)::integer as n from public.transactions where subscription_id = tests.id('y');
grant select on y_before to authenticated;
select is_empty(format('select d from public.preview_update_subscription(%L, p_cadence => %L, p_next_charge_date => %L, p_from_period_id => %L) as d where d <= %L',
                       tests.id('y'), 'monthly', '2026-09-10', (select id from public.periods where budget_id = tests.id('i') and seq = 1), private.today()),
  'R-SUBSCRIPTION-133: a correction''s preview shows no date already passed');
select public.update_subscription(tests.id('y'), (select revision from public.subscriptions where id = tests.id('y')),
  p_cadence => 'monthly', p_next_charge_date => '2026-09-10', p_from_period_id => (select id from public.periods where budget_id = tests.id('i') and seq = 1));
select public.list_charges_awaiting_confirmation(tests.id('i'));  -- a read: the catch-up runs again
select is((select count(*)::integer from public.transactions where subscription_id = tests.id('y')), (select n from y_before),
  'R-SUBSCRIPTION-111: and the correction charges no date already passed');
select public.confirm_subscription_charge(x.id, x.revision)
from (select id, revision from public.transactions where subscription_id = tests.id('h_sub') order by charge_date limit 1) as x;
select is((select array_agg(charge_date order by charge_date) from public.list_transactions(tests.id('h'), 200, p_awaiting_only => true)),
          (select array_agg(charge_date order by charge_date) from public.transactions
           where subscription_id = tests.id('h_sub') and review_state = 'awaiting_confirmation'),
  'R-TRANSACTION-132: the awaiting filter lists the charges awaiting confirmation, not a confirmed one');
select public.confirm_subscription_charges(tests.id('h'));
select is_empty(format('select * from public.list_transactions(%L, 200, p_awaiting_only => true)', tests.id('h')),
  'R-TRANSACTION-132: none once all are confirmed, although the budget has charges');
select tests.set_budget_end_date(tests.id('i'), '2027-02-01');
select is_empty(format('select * from public.preview_create_subscription(%L, %L, %L, null, 24) as p where p.charge_date > private.budget_end_date(%L)',
                       tests.id('i'), 'monthly', '2026-12-05', tests.id('i')),
  'R-SUBSCRIPTION-133: a new subscription''s preview stops at the budget''s end');
select is((select count(*)::integer from public.preview_create_subscription(tests.id('i'), 'monthly', '2026-12-05', null, 24)),
          (select count(*)::integer from generate_series('2026-12-05'::date, private.budget_end_date(tests.id('i')), interval '1 month') as d
           where d >= (select start_date from public.periods where budget_id = tests.id('i') and private.today() between start_date and end_date)),
  'R-SUBSCRIPTION-133: every monthly date from its first period to the budget''s last day');

-- ===========================================================================
-- Categories and terms (R-CATEGORY-110, R-CATEGORY-130, R-VERSION-133, R-CONCURRENCY-130)
-- ===========================================================================
-- a debt moved to another category from now no longer holds its old one from now on
select tests.remember('k_a', (select id from public.create_category(tests.id('i'), 'Old loans', p_from_period_id =>
  (select id from public.periods where budget_id = tests.id('i') and seq = 1))));
select tests.remember('k_debt', (select id from public.create_debt(tests.id('i'), 'Moved', 1000, tests.id('k_a'), 100, 0,
  (select id from public.periods where budget_id = tests.id('i') and seq = 1))));
select public.update_debt(tests.id('k_debt'), (select revision from public.debts where id = tests.id('k_debt')), p_category_id => tests.id('i_cat'));
select is(public.end_category(tests.id('k_a'), (select revision from public.categories where id = tests.id('k_a'))), 'ended',
  'R-CATEGORY-110: the category a debt left can end from then on');
-- a correction to a category that ends before the next change is refused by the write
select tests.remember('k_b', (select id from public.create_category(tests.id('i'), 'Short', p_from_period_id =>
  (select id from public.periods where budget_id = tests.id('i') and seq = 1))));
select public.end_category(tests.id('k_b'), (select revision from public.categories where id = tests.id('k_b')),
  (select id from public.periods where budget_id = tests.id('i') and seq = 2));
select tests.remember('k_sub', (select id from public.create_subscription(tests.id('i'), 'Two terms', 100, 'monthly', tests.id('i_cat'), '2026-09-01',
  (select id from public.periods where budget_id = tests.id('i') and seq = 1))));
select public.update_subscription(tests.id('k_sub'), (select revision from public.subscriptions where id = tests.id('k_sub')), p_price => 200);
select throws_ok(format('select public.update_subscription(%L, %s, p_category_id => %L, p_from_period_id => %L)', tests.id('k_sub'),
                        (select revision from public.subscriptions where id = tests.id('k_sub')), tests.id('k_b'),
                        (select id from public.periods where budget_id = tests.id('i') and seq = 1)),
  'P0001', 'category_not_in_force', 'R-CATEGORY-130: a correction''s category must last until the next change');
-- terms of an ended subscription: until its end; none where it is not in force
select tests.remember('t_sub', (select id from public.create_subscription(tests.id('i'), 'Ends', 1000, 'yearly', tests.id('i_cat'), '2027-06-01',
  (select id from public.periods where budget_id = tests.id('i') and seq = 1))));
select public.end_subscription(tests.id('t_sub'), 1, (select id from public.periods where budget_id = tests.id('i') and seq = 3));
select is((select until_period_id from public.get_subscription_terms(tests.id('t_sub'), (select id from public.periods where budget_id = tests.id('i') and seq = 1))),
          (select id from public.periods where budget_id = tests.id('i') and seq = 3),
  'R-VERSION-133: a correction from period 1 runs to the subscription''s end');
select is((select row(in_force, price, terms_from_period_id, until_period_id)::text
           from public.get_subscription_terms(tests.id('t_sub'), (select id from public.periods where budget_id = tests.id('i') and seq = 3))),
          row(false, null::bigint, null::uuid, null::uuid)::text,
  'R-VERSION-133: from its end on there are no terms to correct');
-- deleting a subcategory moves its group's revision
select tests.remember('g', (select id from public.create_category(tests.id('i'), 'Group')));
select tests.remember('g_sub', (select id from public.create_category(tests.id('i'), 'Sub', tests.id('g'))));
create temp table g_rev on commit drop as select revision from public.categories where id = tests.id('g');
grant select on g_rev to authenticated;
select is(public.end_category(tests.id('g_sub'), (select revision from public.categories where id = tests.id('g_sub'))), 'deleted', 'setup: the subcategory is deleted');
select cmp_ok((select revision from public.categories where id = tests.id('g')), '>', (select revision from g_rev),
  'R-CONCURRENCY-130: deleting a subcategory moves its group''s revision');

-- ===========================================================================
-- Previews with no argument changed (R-SUBSCRIPTION-133): never an internal error
-- ===========================================================================
select is((select array_agg(d) from public.preview_update_subscription(tests.id('k_sub'), p_count => 6) as d),
          (select array_agg(d) from public.preview_update_subscription(tests.id('k_sub'), p_price => (select price from public.subscription_overview where id = tests.id('k_sub')), p_count => 6) as d),
  'R-SUBSCRIPTION-133: an edit form not yet changed previews the schedule as it stands (as with its own price)');
select is((select min(d) from public.preview_update_subscription(tests.id('k_sub'), p_count => 6) as d),
          (select next_charge_date from public.subscription_overview where id = tests.id('k_sub')),
  'R-SUBSCRIPTION-133: from its next charge');
select lives_ok(format('select * from public.preview_update_income(%L)', (select primary_income_id from public.budgets where id = tests.id('i'))),
  'R-PERIOD-036: preview_update_income with no term');
select lives_ok(format('select * from public.preview_set_primary_income(%L)', (select primary_income_id from public.budgets where id = tests.id('i'))),
  'R-PERIOD-036: preview_set_primary_income of the primary itself');
select lives_ok(format('select * from public.preview_end_subscription(%L)', tests.id('k_sub')), 'R-SUBSCRIPTION-136: preview_end_subscription with no period');
select lives_ok(format('select * from public.preview_remove_debt(%L)', tests.id('pg')), 'R-DEBT-138: preview_remove_debt with no period');
select lives_ok(format('select * from public.preview_move_period_start(%L)',
                       (select id from public.periods where budget_id = tests.id('i') and private.today() between start_date and end_date)),
  'R-PERIOD-133: preview_move_period_start');
select lives_ok(format('select * from public.preview_reopen(%L)', tests.id('i')), 'R-PERIOD-035: preview_reopen');
select lives_ok(format('select * from public.preview_create_subscription(%L, %L, %L)', tests.id('i'), 'monthly', '2027-01-15'),
  'R-SUBSCRIPTION-133: preview_create_subscription with only what it requires');

-- ===========================================================================
-- The list says which payments are frozen (R-TRANSACTION-180, D-274)
-- ===========================================================================
select is((select row(debt_ended, debt_id)::text from public.transaction_list where id = tests.id('e_pay')),
          row(true, tests.id('e_debt'))::text, 'R-TRANSACTION-180: a payment of an ended debt says so');
select is((select bool_or(debt_ended) from public.transaction_list where budget_id = tests.id('i') and id <> tests.id('e_pay')), false,
  'R-TRANSACTION-180: no other transaction is frozen');

-- ===========================================================================
-- A debt's history newest first (R-DEBT-181, D-275)
-- ===========================================================================
create temp table pages_desc (n integer, entry_id uuid, balance bigint) on commit drop;
grant insert, select on pages_desc to authenticated;
do $$
declare
  r record;
  v_last record;
  v_n integer := 0;
begin
  loop
    v_n := v_n + 1;
    exit when v_n > 20;
    if v_last is null then
      select * into r from public.get_debt_history(tests.id('pg'), 1, p_newest_first => true);
    else
      select * into r from public.get_debt_history(tests.id('pg'), 1, v_last.date, v_last.kind, v_last.created_at, v_last.entry_id, true);
    end if;
    exit when r.entry_id is null;
    insert into pages_desc values (v_n, r.entry_id, r.balance);
    v_last := r;
  end loop;
end $$;
select is((select array_agg(row(entry_id, balance)::text order by n) from pages_desc),
          (select array_agg(row(h.entry_id, h.balance)::text order by h.o desc)
           from (select x.*, row_number() over () as o from public.get_debt_history(tests.id('pg'), 1000) as x) as h),
  'R-DEBT-181: newest first, one row a page: every entry once, in reverse order, with the same balances');
select is((select entry_id from public.get_debt_history(tests.id('pg'), 1, p_newest_first => true)),
          (select h.entry_id from (select x.*, row_number() over () as o from public.get_debt_history(tests.id('pg'), 1000) as x) as h order by h.o desc limit 1),
  'R-DEBT-181: the first page starts with the latest event');

select tests.clear_authentication();
select * from finish();
rollback;
