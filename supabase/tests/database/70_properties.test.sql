-- Property test: after any sequence of the public operations, in any order, on any day,
-- the period invariants hold, nothing gets stuck, no raw error reaches the client, and no
-- closed period's total changes except through an operation that names it.
--
-- Deterministic: a fixed list of seeds; each seed runs on fresh budgets with its own user.
-- To run it longer locally, raise the seed list or tests.prop_steps below and run
--   npx supabase test db supabase/tests/database/00_helpers.test.sql supabase/tests/database/70_properties.test.sql
--
-- After every step it checks:
--   * the operation succeeded or was refused with a documented P0001 code;
--   * get_current_period and ensure_periods succeed, and the budget has a current period
--     unless it has ended (an end date before today);
--   * the structural invariants (tests.period_violations, and the constraint triggers),
--     including that nothing is keyed beyond the latest period;
--   * the total of every closed period is unchanged, except periods an explicit correction
--     or back-dating names (from that period on) and periods a boundary operation touches;
--   * an edit just saved (current period) is the terms in force now.
begin;

create temp table seeds (seed double precision) on commit drop;
insert into seeds values (0.11), (0.23), (0.37), (0.41), (0.53), (0.67), (0.79), (0.83);
create temp table prop_config (steps integer) on commit drop;
insert into prop_config values (110);

create temp table runs (seed double precision, step integer, budget text, op text, outcome text) on commit drop;
create temp table failures (seed double precision, step integer, budget text, op text, problem text) on commit drop;
create temp table documented_codes (code text primary key) on commit drop;
insert into documented_codes values
  ('budget_not_found'), ('income_not_found'), ('period_not_found'), ('member_not_found'),
  ('invitation_not_found'), ('not_owner'), ('owner_cannot_leave'), ('member_has_primary_income'),
  ('already_member'), ('invalid_name'), ('invalid_amount'), ('invalid_pay_day'),
  ('invalid_weekend_rule'), ('invalid_email'), ('invalid_start_month'), ('invalid_end_date'),
  ('invalid_boundary'), ('invalid_period'), ('end_date_before_last_period'), ('income_is_primary'),
  ('income_ended'), ('income_not_in_force'), ('budget_ended'), ('budget_limit_reached'),
  ('member_limit_reached'), ('invitation_limit_reached'), ('income_limit_reached');

select plan(6);

do $prop$
declare
  v_seed double precision;
  v_user text;
  v_step integer;
  v_steps integer := (select steps from prop_config);
  v_name text;
  v_budget uuid;
  v_op text;
  v_r double precision;
  v_today date;
  v_income uuid;
  v_period public.periods;
  v_k integer;
  v_amount bigint;
  v_outcome text;
  v_before jsonb;
  v_after jsonb;
  v_touched integer[];
  v_from integer;
  v_problem text;
  v_rows integer;
  v_ended boolean;
begin
  for v_seed in select seed from seeds order by seed loop
    perform setseed(v_seed);
    v_user := 'prop' || replace(v_seed::text, '.', '_');
    perform tests.create_user(v_user, 'Prop');
    perform tests.set_today('2026-01-10');
    perform tests.authenticate_as(v_user);
    perform tests.remember(v_user || 'b1', public.create_budget('Twenty-fifth', 'Salary', 500000, 25, 'nearest', '2025-09-01'));
    perform tests.remember(v_user || 'b2', public.create_budget('Month end', 'Salary', 600000, 31, 'next'));
    perform tests.remember(v_user || 'b3', public.create_budget('First', 'Salary', 400000, 1, 'previous', '2025-12-01'));
    perform tests.clear_authentication();

    for v_step in 1..v_steps loop
      v_name := (array['b1', 'b2', 'b3'])[1 + floor(random() * 3)::integer];
      v_budget := tests.id(v_user || v_name);
      v_today := private.today();
      v_r := random();
      v_op := case
        when v_r < 0.14 then 'advance_day'
        when v_r < 0.24 then 'update_terms'
        when v_r < 0.30 then 'correct_terms'
        when v_r < 0.35 then 'add_income'
        when v_r < 0.38 then 'add_income_backdated'
        when v_r < 0.42 then 'remove_income'
        when v_r < 0.44 then 'remove_income_from'
        when v_r < 0.49 then 'set_primary'
        when v_r < 0.52 then 'set_end_date'
        when v_r < 0.54 then 'clear_end_date'
        when v_r < 0.62 then 'set_expected_pay_date'
        when v_r < 0.66 then 'reset_expected_pay_date'
        when v_r < 0.74 then 'record_early_pay_date'
        when v_r < 0.83 then 'reopen_previous_period'
        when v_r < 0.91 then 'move_period_start'
        when v_r < 0.96 then 'ensure'
        else 'current'
      end;

      select coalesce(jsonb_object_agg(seq, income_total), '{}') into v_before
      from public.period_summaries where budget_id = v_budget and end_date < v_today;
      v_touched := '{}';
      v_from := null;
      v_income := null;
      v_amount := null;

      v_outcome := 'ok';
      begin
        if v_op = 'advance_day' then
          perform tests.set_today(v_today + 1 + floor(random() * 12)::integer);
        else
          perform tests.authenticate_as(v_user);
          select p.* into v_period from public.periods as p
          where p.budget_id = v_budget order by random() limit 1;
          if v_op = 'update_terms' then
            select id into v_income from public.incomes
            where budget_id = v_budget and end_seq is null order by random() limit 1;
            v_amount := 100000 + floor(random() * 800000)::bigint;
            perform public.update_income_terms(v_income, v_amount, 1 + floor(random() * 31)::integer,
              (array['nearest', 'previous', 'next', 'none'])[1 + floor(random() * 4)::integer]::public.weekend_rule);
          elsif v_op = 'correct_terms' then
            select id into v_income from public.incomes where budget_id = v_budget order by random() limit 1;
            v_from := v_period.seq;
            perform public.update_income_terms(v_income, 100000 + floor(random() * 800000)::bigint,
              1 + floor(random() * 31)::integer, 'nearest', v_period.id);
          elsif v_op = 'add_income' then
            perform public.add_income(v_budget, 'Extra', 1000 + floor(random() * 300000)::bigint,
                                      1 + floor(random() * 31)::integer);
          elsif v_op = 'add_income_backdated' then
            v_from := v_period.seq;
            perform public.add_income(v_budget, 'Back-dated', 1000 + floor(random() * 300000)::bigint,
                                      1 + floor(random() * 31)::integer, 'nearest', null, v_period.id);
          elsif v_op in ('remove_income', 'remove_income_from') then
            select i.id into v_income from public.incomes as i join public.budgets as b on b.id = i.budget_id
            where i.budget_id = v_budget and i.id <> b.primary_income_id order by random() limit 1;
            if v_income is not null then
              if v_op = 'remove_income' then
                perform public.remove_income(v_income);
              else
                v_from := v_period.seq;
                perform public.remove_income(v_income, v_period.id);
              end if;
            end if;
          elsif v_op = 'set_primary' then
            select id into v_income from public.incomes where budget_id = v_budget order by random() limit 1;
            perform public.set_primary_income(v_income);
          elsif v_op = 'set_end_date' then
            perform public.set_budget_end_date(v_budget, v_today + floor(random() * 200)::integer - 20);
          elsif v_op = 'clear_end_date' then
            perform public.set_budget_end_date(v_budget, null);
          elsif v_op = 'set_expected_pay_date' then
            perform public.set_expected_pay_date(v_budget, v_today + floor(random() * 45)::integer - 3);
          elsif v_op = 'reset_expected_pay_date' then
            perform public.set_expected_pay_date(v_budget);
          elsif v_op = 'record_early_pay_date' then
            perform public.record_early_pay_date(v_budget, v_today - floor(random() * 10)::integer + 1);
          elsif v_op = 'reopen_previous_period' then
            select array[max(seq) - 1] into v_touched from public.periods where budget_id = v_budget;
            perform public.reopen_previous_period(v_budget,
              case when random() < 0.5 then null else v_today + floor(random() * 15)::integer end);
          elsif v_op = 'move_period_start' then
            v_touched := array[v_period.seq - 1, v_period.seq];
            perform public.move_period_start(v_period.id, v_period.start_date + floor(random() * 21)::integer - 10);
          elsif v_op = 'ensure' then
            perform public.ensure_periods(v_budget);
          else
            perform public.get_current_period(v_budget);
          end if;
        end if;
      exception
        when sqlstate 'P0001' then
          v_outcome := 'refused: ' || sqlerrm;
          if not exists (select 1 from documented_codes where code = sqlerrm) then
            insert into failures values (v_seed, v_step, v_name, v_op, 'undocumented code ' || sqlerrm);
          end if;
        when others then
          v_outcome := 'ERROR ' || sqlstate || ': ' || sqlerrm;
          insert into failures values (v_seed, v_step, v_name, v_op, v_outcome);
      end;
      perform tests.clear_authentication();
      insert into runs values (v_seed, v_step, v_name, v_op, v_outcome);

      -- Never stuck: both period calls work, and there is a current period unless ended.
      begin
        perform tests.authenticate_as(v_user);
        perform public.ensure_periods(v_budget);
        select count(*) into v_rows from public.get_current_period(v_budget);
        perform tests.clear_authentication();
        select b.end_date is not null and b.end_date < private.today() into v_ended
        from public.budgets as b where b.id = v_budget;
        if v_rows = 0 and not v_ended then
          insert into failures values (v_seed, v_step, v_name, v_op, 'no current period');
        end if;
      exception when others then
        perform tests.clear_authentication();
        insert into failures values (v_seed, v_step, v_name, v_op, 'stuck: ' || sqlstate || ' ' || sqlerrm);
      end;

      for v_problem in select tests.period_violations(v_budget) loop
        insert into failures values (v_seed, v_step, v_name, v_op, v_problem);
      end loop;
      begin
        set constraints all immediate;
        set constraints all deferred;
      exception when others then
        insert into failures values (v_seed, v_step, v_name, v_op, 'constraint: ' || sqlerrm);
      end;

      -- Closed totals, except what the operation names or touches.
      select coalesce(jsonb_object_agg(seq, income_total), '{}') into v_after
      from public.period_summaries
      where budget_id = v_budget and seq::text in (select jsonb_object_keys(v_before));
      if v_outcome = 'ok' then
        select coalesce(jsonb_object_agg(key, value), '{}') into v_before
        from jsonb_each(v_before)
        where not (key::integer = any (v_touched)) and (v_from is null or key::integer < v_from);
        select coalesce(jsonb_object_agg(key, value), '{}') into v_after
        from jsonb_each(v_after)
        where not (key::integer = any (v_touched)) and (v_from is null or key::integer < v_from);
      end if;
      if v_after <> v_before then
        insert into failures values (v_seed, v_step, v_name, v_op,
          'closed totals changed: ' || v_before::text || ' -> ' || v_after::text);
      end if;

      -- An edit just saved is the terms in force now.
      if v_op = 'update_terms' and v_outcome = 'ok' and v_income is not null then
        if not exists (select 1 from public.income_overview where id = v_income and amount = v_amount) then
          insert into failures values (v_seed, v_step, v_name, v_op, 'the edit just saved is not in force now');
        end if;
      end if;
    end loop;
  end loop;
end;
$prop$;

select is_empty(
  'select seed, step, budget, op, problem from failures order by seed, step',
  'R-PERIOD-031 R-PERIOD-032 R-PERIOD-029 R-PERIOD-005 R-PERIOD-020 R-PERIOD-022 R-VERSION-011 R-SECURITY-007: across all seeds, every step kept the invariants, nothing got stuck, only documented errors reached the client, closed totals changed only where named, and edits were in force at once'
);
select cmp_ok(
  (select count(*)::integer from runs where outcome = 'ok'
     and op in ('set_expected_pay_date', 'reset_expected_pay_date', 'record_early_pay_date',
                'reopen_previous_period', 'move_period_start')),
  '>=', 150, 'R-PERIOD-025: the runs exercised many accepted boundary operations'
);
select cmp_ok((select count(*)::integer from runs where outcome = 'ok' and op = 'reopen_previous_period'),
  '>=', 20, 'R-PERIOD-023: including reopened periods');
select cmp_ok((select count(*)::integer from runs where outcome like 'refused: invalid_boundary%'),
  '>=', 30, 'R-PERIOD-020: and many refused ones');
select cmp_ok((select count(*)::integer from runs where outcome = 'ok' and op in ('correct_terms', 'add_income_backdated', 'remove_income_from')),
  '>=', 40, 'R-VERSION-012: and many explicit corrections');
select cmp_ok((select count(*)::integer from runs), '=', 8 * (select steps from prop_config),
  'R-PERIOD-009: every step ran');

select diag(op || ' / ' || split_part(outcome, ':', 1) || coalesce(':' || nullif(split_part(outcome, ':', 2), ''), '') || ' x' || count(*))
from runs group by op, outcome order by op, count(*) desc;

select * from finish();
rollback;
