-- Reopening a period (merge), its preview, the expected-pay-date preview, the 92-day clamp,
-- boundary operations against the end date, and the closed form of the end shown.
-- Dates worked out independently (pay day 25, weekend rule nearest unless stated).
begin;
select plan(39);

select tests.create_user('alice', 'Alice');
select tests.create_user('mallory', 'Mallory');

create or replace function pg_temp.day(d date) returns void language plpgsql as $$
begin
  perform tests.clear_authentication();
  perform tests.set_today(d);
  perform tests.authenticate_as('alice');
end;
$$;
create or replace function pg_temp.primary_of(b uuid) returns uuid language sql as $$
  select primary_income_id from public.budgets where id = b
$$;
create or replace function pg_temp.income(b uuid, n text) returns uuid language sql as $$
  select id from public.incomes where budget_id = b and name = n
$$;

-- ===========================================================================
-- 15 November 2026
-- ===========================================================================
select pg_temp.day('2026-11-15');
select tests.remember('tie', public.create_budget('Tie-break', 'Salary', 500000, 25));
select tests.remember('chain', public.create_budget('Chain', 'Salary', 500000, 25, 'nearest', '2026-09-01'));
select tests.remember('clamp', public.create_budget('Clamp', 'Salary', 500000, 25));
select tests.remember('prev', public.create_budget('Preview', 'Salary', 500000, 25));
select tests.remember('fin', public.create_budget('Final', 'Salary', 500000, 25, 'nearest', null, '2026-12-01'));

-- The expected-pay-date preview uses the logic of the write.
select results_eq(
  format('select end_date, expected_pay_date, end_is_manual from public.preview_expected_pay_date(%L, 5)', tests.id('prev')),
  $$values ('2026-12-03'::date, '2026-12-04'::date, false)$$,
  'R-PERIOD-036: pay day 5 would end the current period on 3 Dec (5 Dec is a Saturday: paid Friday 4)'
);
select public.update_income_terms(pg_temp.primary_of(tests.id('prev')), 500000, 5, 'nearest');
select is((select end_date from public.periods where budget_id = tests.id('prev') and seq = 1), '2026-12-03'::date,
  'R-PERIOD-036: and the write does exactly that');
select tests.remember('prev_other', public.add_income(tests.id('prev'), 'Other', 100000, 10));
select results_eq(
  format('select end_date, expected_pay_date from public.preview_expected_pay_date(%L, p_income_id => %L)',
         tests.id('prev'), tests.id('prev_other')),
  $$values ('2026-12-09'::date, '2026-12-10'::date)$$,
  'R-PERIOD-036: switching the primary to the income paid on the 10th would end it on 9 Dec'
);
select public.set_primary_income(tests.id('prev_other'));
select is((select end_date from public.periods where budget_id = tests.id('prev') and seq = 1), '2026-12-09'::date,
  'R-PERIOD-036: and the switch does exactly that');
select public.set_expected_pay_date(tests.id('prev'), '2026-12-20');
select results_eq(
  format('select end_date, expected_pay_date, end_is_manual from public.preview_expected_pay_date(%L, 25)', tests.id('prev')),
  $$values ('2026-12-19'::date, '2026-12-20'::date, true)$$,
  'R-PERIOD-036 R-PERIOD-014: an end set by hand would not change'
);
select throws_ok(
  format('select public.preview_expected_pay_date(%L, p_income_id => %L)', tests.id('prev'), pg_temp.primary_of(tests.id('tie'))),
  'P0001', 'income_not_found', 'R-SECURITY-004: an income of another budget is not found');
select throws_ok(format('select public.preview_expected_pay_date(%L, 32)', tests.id('prev')),
  'P0001', 'invalid_pay_day', 'R-PERIOD-036: invalid terms are refused');
select tests.authenticate_as('mallory');
select throws_ok(format('select public.preview_expected_pay_date(%L)', tests.id('prev')),
  'P0001', 'budget_not_found', 'R-SECURITY-002: a non-member cannot preview');
select throws_ok(format('select public.preview_reopen(%L)', tests.id('prev')),
  'P0001', 'budget_not_found', 'R-SECURITY-002: nor preview a reopen');
select tests.authenticate_as('alice');
select throws_ok(format('select public.preview_reopen(%L)', tests.id('prev')),
  'P0001', 'invalid_boundary', 'R-PERIOD-035: the first period has nothing to reopen');

-- ===========================================================================
-- 25 November 2026: changes recorded in the new period
-- ===========================================================================
select pg_temp.day('2026-11-25');
select public.ensure_periods(b) from unnest(array[tests.id('tie'), tests.id('chain'), tests.id('clamp')]) as b;
-- A table registered with the merge, like categories in step 3: a row ended in the latest
-- period that would never be in force after a merge, and referenced by another row.
select tests.clear_authentication();
create table public.tst_items (
  id uuid primary key default gen_random_uuid(),
  budget_id uuid not null,
  name text not null,
  first_seq integer not null,
  end_seq integer,
  check (end_seq is null or end_seq >= first_seq)
);
create table public.tst_refs (id uuid primary key default gen_random_uuid(), item_id uuid not null references public.tst_items);
select lives_ok(
  $$insert into private.period_keyed_tables (table_name, kind, record_kind, name_column) values ('public.tst_items', 'validity', 'item', 'name')$$,
  'R-VERSION-014: a table that provides what the merge needs registers'
);
create table public.tst_bad (id uuid primary key, budget_id uuid, label text);
select throws_like(
  $$insert into private.period_keyed_tables (table_name, kind, record_kind, name_column) values ('public.tst_bad', 'validity', 'bad', 'label')$$,
  'period_keyed_table_invalid%first_seq%',
  'R-VERSION-014: one that does not is refused when it registers, not when a reopen runs'
);
create table public.tst_versions (id uuid primary key, budget_id uuid, item_id uuid, effective_from_seq integer);
select throws_like(
  $$insert into private.period_keyed_tables (table_name, kind, record_kind, entity_column, entity_table) values ('public.tst_versions', 'version', 'item', 'item_id', 'public.tst_items')$$,
  'period_keyed_table_invalid%unique%',
  'R-VERSION-014: a version table needs its unique key'
);
insert into public.tst_items (id, budget_id, name, first_seq, end_seq)
values ('00000000-0000-0000-0000-0000000000a1', tests.id('clamp'), 'Groceries', 1, 2);
insert into public.tst_refs (item_id) values ('00000000-0000-0000-0000-0000000000a1');
select tests.authenticate_as('alice');

-- tie: a raise in the new period, then a correction of the previous period written later
select public.update_income_terms(pg_temp.income(tests.id('tie'), 'Salary'), 600000, 25, 'nearest');
select public.update_income_terms(pg_temp.income(tests.id('tie'), 'Salary'), 510000, 25, 'nearest',
  (select id from public.periods where budget_id = tests.id('tie') and seq = 1));
-- chain: a new primary, and the old income removed
select tests.remember('chain_new', public.add_income(tests.id('chain'), 'New', 700000, 25));
select public.set_primary_income(tests.id('chain_new'));
select public.remove_income(pg_temp.income(tests.id('chain'), 'Salary'));
select results_eq(
  format('select record_kind, record_name, change, replaces_previous from public.preview_reopen(%L) order by record_name, change', tests.id('chain')),
  $$values ('income', 'New', 'added', false), ('income', 'New', 'made_primary', false), ('income', 'Salary', 'ended', false)$$,
  'R-PERIOD-035: the reopen preview lists every change recorded in the latest period'
);

-- ===========================================================================
-- 26 November 2026: the salaries have not arrived
-- ===========================================================================
select pg_temp.day('2026-11-26');
select results_eq(
  format('select record_name, change, replaces_previous from public.preview_reopen(%L)', tests.id('tie')),
  $$values ('Salary', 'terms_changed', true)$$,
  'R-PERIOD-035: the preview says the raise would replace the previous period''s terms'
);
select lives_ok(format('select public.reopen_previous_period(%L, %L)', tests.id('tie'), '2026-11-28'),
  'R-PERIOD-023: reopening with the date the salary is expected');
select results_eq(
  format('select end_date, end_is_manual from public.periods where budget_id = %L and seq = 1', tests.id('tie')),
  $$values ('2026-11-27'::date, true)$$,
  'R-PERIOD-023 R-PERIOD-014: the reopened period ends the day before, set by hand'
);
select results_eq(
  format('select amount, terms_from_seq from public.income_overview where id = %L', pg_temp.income(tests.id('tie'), 'Salary')),
  $$values (600000::bigint, 1)$$,
  'R-VERSION-013: the merged period''s terms win over the later-written correction: the terms in force before the reopen are still in force'
);
select results_eq(
  format('select effective_from_seq, amount from public.income_versions where income_id = %L order by 1', pg_temp.income(tests.id('tie'), 'Salary')),
  $$values (1, 600000::bigint)$$,
  'R-VERSION-013 R-VERSION-011: one version, nothing beyond the latest period'
);

select lives_ok(format('select public.reopen_previous_period(%L)', tests.id('chain')), 'R-PERIOD-023: first reopen of the chain');
select results_eq(
  format('select name, is_primary, is_active, first_seq, end_seq from public.income_overview where budget_id = %L order by name', tests.id('chain')),
  $$values ('New', true, true, 2, null::integer), ('Salary', false, false, 1, 2)$$,
  'R-VERSION-011: the income ended in the merged period stays ended in the reopened one'
);
select results_eq(
  format('select record_name, change from public.preview_reopen(%L) order by record_name, change', tests.id('chain')),
  $$values ('New', 'added'), ('New', 'made_primary'), ('Salary', 'removed')$$,
  'R-PERIOD-035: before the second reopen the preview says the old income would be removed altogether'
);
select lives_ok(format('select public.reopen_previous_period(%L)', tests.id('chain')), 'R-PERIOD-023: second reopen of the chain');
select results_eq(
  format('select seq, start_date, end_date, income_total from public.period_summaries where budget_id = %L', tests.id('chain')),
  $$values (1, '2026-09-25'::date, '2026-12-24'::date, 700000::bigint)$$,
  'R-PERIOD-023 R-VERSION-011: one period from 25 Sep with the single new income, as the preview said'
);
select is_empty(format('select * from tests.period_violations(%L)', tests.id('chain')),
  'R-VERSION-011: and nothing keyed beyond it');

select results_eq(
  format('select record_kind, record_name, change from public.preview_reopen(%L)', tests.id('clamp')),
  $$values ('item', 'Groceries', 'removed')$$,
  'R-PERIOD-035 R-VERSION-014: the preview covers every registered table'
);
select lives_ok(format('select public.reopen_previous_period(%L)', tests.id('clamp')), 'R-PERIOD-023: clamp, first reopen');
select tests.clear_authentication();
select results_eq(
  $$select first_seq, end_seq from public.tst_items where id = '00000000-0000-0000-0000-0000000000a1'$$,
  $$values (1, 1)$$,
  'R-VERSION-014: a row that would never be in force but is referenced is kept as a void row, and the reopen succeeds'
);
drop table public.tst_refs, public.tst_versions, public.tst_bad;
delete from private.period_keyed_tables where table_name = 'public.tst_items'::regclass;
drop table public.tst_items;
select tests.authenticate_as('alice');

-- ===========================================================================
-- 10 December 2026: boundary operations respect the end date (finding 3)
-- ===========================================================================
select pg_temp.day('2026-12-10');
select results_eq(
  format('select seq, start_date, end_date, is_current from public.get_current_period(%L)', tests.id('fin')),
  $$values (2, '2026-11-25'::date, '2026-12-24'::date, true)$$,
  'R-BUDGET-008: the period containing the end date (1 Dec) is the last and is current'
);
select throws_ok(format('select public.record_early_pay_date(%L, %L)', tests.id('fin'), '2026-12-05'),
  'P0001', 'invalid_boundary', 'R-PERIOD-034 R-BUDGET-007: an early salary after the end date would start a period after it: refused');
select throws_ok(
  format('select public.move_period_start(%L, %L)', (select id from public.periods where budget_id = tests.id('fin') and seq = 2), '2026-12-05'),
  'P0001', 'invalid_boundary', 'R-PERIOD-012 R-BUDGET-007: moving the last start past the end date is a contract error');

-- ===========================================================================
-- 25-26 December 2026, 20 January 2027: the 92-day clamp is reachable
-- ===========================================================================
select pg_temp.day('2026-12-25');
select is(public.ensure_periods(tests.id('clamp')), 1, 'R-PERIOD-009: the next salary starts a period');
select pg_temp.day('2026-12-26');
select lives_ok(format('select public.reopen_previous_period(%L)', tests.id('clamp')), 'R-PERIOD-023: clamp, second reopen');
select results_eq(
  format('select start_date, end_date from public.periods where budget_id = %L', tests.id('clamp')),
  $$values ('2026-10-26'::date, '2027-01-24'::date)$$,
  'R-PERIOD-020: a 91-day period'
);
select pg_temp.day('2027-01-20');
select results_eq(
  format('select end_date from public.preview_expected_pay_date(%L, 20)', tests.id('clamp')),
  $$values ('2027-01-25'::date)$$,
  'R-PERIOD-036 R-PERIOD-020: pay day 20 would put the next salary on 19 Feb, so the end is clamped to 92 days'
);
select public.update_income_terms(pg_temp.primary_of(tests.id('clamp')), 500000, 20, 'nearest');
select is((select end_date from public.periods where budget_id = tests.id('clamp')), '2027-01-25'::date,
  'R-PERIOD-020 R-PERIOD-029: the re-projection is clamped to 92 days');

-- ===========================================================================
-- The end shown: closed form against a period-by-period walk
-- ===========================================================================
select tests.clear_authentication();
create or replace function pg_temp.walked_end(b uuid, e date) returns date language plpgsql as $$
declare
  p public.periods;
  n integer := 0;
begin
  select * into p from public.periods where budget_id = b order by seq desc limit 1;
  if e <= p.end_date then
    return (select end_date from public.periods where budget_id = b and e between start_date and end_date);
  end if;
  while p.end_date < e loop
    p.start_date := p.end_date + 1;
    p.seq := p.seq + 1;
    p.end_date := private.projected_end(b, p.start_date, p.seq);
    n := n + 1;
    exit when n > 200;
  end loop;
  return p.end_date;
end;
$$;
create temp table end_checks (b uuid, e date, closed date, walked date) on commit drop;
do $$
declare
  b uuid;
  e date;
begin
  for b in select unnest(array[tests.id('tie'), tests.id('clamp'), tests.id('prev'), tests.id('chain')]) loop
    for e in select d::date from generate_series(date '2027-01-26', date '2036-01-01', interval '29 days') as d loop
      update public.budgets set end_date = e where id = b;
      insert into end_checks values (b, e, private.budget_end_date(b), pg_temp.walked_end(b, e));
    end loop;
    update public.budgets set end_date = null where id = b;
  end loop;
end;
$$;
select is_empty(
  'select * from end_checks where closed is distinct from walked',
  'R-BUDGET-008 R-BUDGET-014: the end shown (closed form) equals a period-by-period walk for 450 end dates and four schedules'
);
select cmp_ok((select count(*)::integer from end_checks), '>=', 400, 'R-BUDGET-008: enough end dates were checked');

select lives_ok('set constraints all immediate', 'R-PERIOD-005 R-VERSION-011: every invariant holds');
set constraints all deferred;

select * from finish();
rollback;
