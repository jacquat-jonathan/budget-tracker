-- Property test: after any sequence of the public operations below, in any order, on any
-- day, the period invariants hold and the totals of closed periods never change.
--
-- A fixed seed makes the sequence reproducible. Operations a member may legitimately be
-- refused (P0001 errors such as invalid_boundary) are fine; any other error is a failure:
-- the client only ever sees contract errors.
--
-- Operations: advance the day; edit an income's terms (current period); add an income;
-- remove an income; switch the primary income; move the latest boundary; move the boundary
-- before the latest (late salary / reopen); move an older boundary; reset a boundary to the
-- schedule; ensure_periods; get_current_period. None of them is an explicit correction of
-- the past, so closed periods must keep their totals.
begin;
select plan(5);

select tests.create_user('alice', 'Alice');
select tests.set_today('2026-01-10');
select setseed(0.4242);

select tests.authenticate_as('alice');
select tests.remember('b1', public.create_budget('Twenty-fifth', 'Salary', 500000, 25, 'nearest', '2025-10-01'));
select tests.remember('b2', public.create_budget('Month end', 'Salary', 600000, 31, 'next'));
select tests.remember('b3', public.create_budget('First', 'Salary', 400000, 1, 'previous'));
select tests.clear_authentication();

create temp table runs (step integer, budget text, op text, outcome text) on commit drop;
create temp table failures (step integer, budget text, op text, problem text) on commit drop;

do $prop$
declare
  v_step integer;
  v_budget_name text;
  v_budget uuid;
  v_op text;
  v_r double precision;
  v_today date;
  v_income uuid;
  v_period public.periods;
  v_target date;
  v_outcome text;
  v_closed_before jsonb;
  v_closed_after jsonb;
  v_problem text;
begin
  for v_step in 1..450 loop
    v_budget_name := (array['b1', 'b2', 'b3'])[1 + floor(random() * 3)::integer];
    v_budget := tests.id(v_budget_name);
    v_today := private.today();
    v_r := random();
    v_op := case
      when v_r < 0.14 then 'advance_day'
      when v_r < 0.26 then 'update_terms'
      when v_r < 0.33 then 'add_income'
      when v_r < 0.39 then 'remove_income'
      when v_r < 0.45 then 'set_primary'
      when v_r < 0.60 then 'move_latest'
      when v_r < 0.74 then 'move_before_latest'
      when v_r < 0.80 then 'move_older'
      when v_r < 0.88 then 'reset_boundary'
      when v_r < 0.94 then 'ensure'
      else 'current'
    end;

    select coalesce(jsonb_object_agg(seq, income_total), '{}') into v_closed_before
    from public.period_summaries where budget_id = v_budget and end_date < v_today;

    v_outcome := 'ok';
    begin
      if v_op = 'advance_day' then
        perform tests.set_today(v_today + 1 + floor(random() * 12)::integer);
      else
        perform tests.authenticate_as('alice');
        if v_op = 'update_terms' then
          select id into v_income from public.incomes
          where budget_id = v_budget and end_seq is null order by random() limit 1;
          perform public.update_income_terms(
            v_income, (100000 + floor(random() * 800000))::bigint, 1 + floor(random() * 31)::integer,
            (array['nearest', 'previous', 'next', 'none'])[1 + floor(random() * 4)::integer]::public.weekend_rule);
        elsif v_op = 'add_income' then
          perform public.add_income(v_budget, 'Extra', (1000 + floor(random() * 300000))::bigint,
                                    1 + floor(random() * 31)::integer);
        elsif v_op = 'remove_income' then
          select i.id into v_income from public.incomes as i join public.budgets as b on b.id = i.budget_id
          where i.budget_id = v_budget and i.end_seq is null and i.id <> b.primary_income_id
          order by random() limit 1;
          if v_income is not null then
            perform public.remove_income(v_income);
          end if;
        elsif v_op = 'set_primary' then
          select id into v_income from public.incomes
          where budget_id = v_budget and end_seq is null order by random() limit 1;
          perform public.set_primary_income(v_income);
        elsif v_op in ('move_latest', 'move_before_latest', 'move_older', 'reset_boundary') then
          select p.* into v_period from public.periods as p
          where p.budget_id = v_budget
            and p.seq = (select max(seq) from public.periods where budget_id = v_budget)
                        - case v_op when 'move_latest' then 0
                                    when 'move_before_latest' then 1
                                    when 'move_older' then 2 + floor(random() * 4)::integer
                                    else floor(random() * 2)::integer end;
          if v_period.id is not null then
            v_target := v_period.end_date + floor(random() * 33)::integer - 16;
            perform public.move_period_boundary(
              v_period.id, case when v_op = 'reset_boundary' then null else v_target end);
          end if;
        elsif v_op = 'ensure' then
          perform public.ensure_periods(v_budget);
        else
          perform public.get_current_period(v_budget);
        end if;
        perform tests.clear_authentication();
      end if;
    exception
      when sqlstate 'P0001' then
        v_outcome := 'refused: ' || sqlerrm;
        perform tests.clear_authentication();
      when others then
        v_outcome := 'ERROR ' || sqlstate || ': ' || sqlerrm;
        perform tests.clear_authentication();
        insert into failures values (v_step, v_budget_name, v_op, v_outcome);
    end;
    insert into runs values (v_step, v_budget_name, v_op, v_outcome);

    -- Invariants, checked independently of the migration ...
    for v_problem in select tests.period_violations(v_budget) loop
      insert into failures values (v_step, v_budget_name, v_op, v_problem);
    end loop;
    -- ... and by the database's own constraint triggers.
    begin
      set constraints all immediate;
      set constraints all deferred;
    exception when others then
      insert into failures values (v_step, v_budget_name, v_op, 'constraint: ' || sqlerrm);
    end;

    -- Closed periods keep their totals (they may only gain company, never change).
    select coalesce(jsonb_object_agg(seq, income_total), '{}') into v_closed_after
    from public.period_summaries
    where budget_id = v_budget and seq::text in (select jsonb_object_keys(v_closed_before));
    if v_closed_after <> v_closed_before then
      insert into failures values (v_step, v_budget_name, v_op,
        'closed totals changed: ' || v_closed_before::text || ' -> ' || v_closed_after::text);
    end if;
  end loop;
end;
$prop$;

select is_empty(
  'select step, budget, op, problem from failures order by step',
  'R-PERIOD-021 R-PERIOD-022 R-PERIOD-005 R-VERSION-005: after 450 random operations every invariant held, no raw error reached the client and no closed period''s total changed'
);
select cmp_ok(
  (select count(*)::integer from runs where outcome = 'ok' and op in ('move_latest', 'move_before_latest', 'move_older', 'reset_boundary')),
  '>=', 40,
  'R-PERIOD-012: the run exercised many accepted boundary moves'
);
select cmp_ok(
  (select count(*)::integer from runs where outcome like 'refused: invalid_boundary%'),
  '>=', 10,
  'R-PERIOD-020: and many refused ones'
);
select cmp_ok(
  (select count(*)::integer from runs where outcome = 'ok' and op = 'update_terms'),
  '>=', 20,
  'R-PERIOD-011: and many terms changes'
);
select cmp_ok(
  (select max(seq) from public.periods where budget_id = tests.id('b1')),
  '>=', 15,
  'R-PERIOD-009: over more than a year of days'
);

select diag(op || ' / ' || split_part(outcome, ':', 1) || coalesce(':' || nullif(split_part(outcome, ':', 2), ''), '') || ' x' || count(*))
from runs group by op, outcome order by op, count(*) desc;

select * from finish();
rollback;
