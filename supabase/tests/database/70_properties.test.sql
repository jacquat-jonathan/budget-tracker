-- Property test: after any sequence of the public operations, in any order, on any day,
-- the period invariants hold, nothing gets stuck, no raw error reaches the client, and no
-- closed period's total changes except through an operation that names it. Step 3 adds
-- category and transaction operations to the sequences.
--
-- Deterministic: a fixed list of seeds; each seed runs on fresh budgets with its own user.
-- Every pick is made from the run's own rows in the order the run created them (pg_temp.pick),
-- never from a scan whose order depends on the database, so a seed walks the same way on any
-- database. A failure names its seed and step: to replay one, keep only that seed in `seeds`
-- (setseed runs again at the seed's start, so the walk is the same). The `fingerprint`
-- diagnostic at the end changes when, and only when, a walk changes.
-- To run it longer locally, raise the seed list or tests.prop_steps below and run
--   npx supabase test db supabase/tests/database/00_helpers.test.sql supabase/tests/database/70_properties.test.sql
--
-- After every step it checks:
--   * the operation succeeded or was refused with a documented P0001 code;
--   * get_current_period and ensure_periods succeed, and the budget has a current period
--     unless it has ended (an end date before today);
--   * the structural invariants (tests.period_violations, and the constraint triggers),
--     including that nothing is keyed beyond the latest period;
--   * the totals of every closed period (income, expected, spent) are unchanged, except
--     periods an explicit correction or back-dating names (from that period on), periods a
--     boundary operation touches, and periods containing the date of a transaction added,
--     edited (old and new date) or deleted;
--   * every period's totals equal a naive recomputation from the rows (tests.naive_totals)
--     and the sum of its progress rows; the step 3 invariants (tests.period_violations);
--   * an edit just saved (current period) is the terms or expectation in force now;
--   * an edit based on an older revision is refused.
begin;

create temp table seeds (seed double precision) on commit drop;
insert into seeds values (0.11), (0.23), (0.37), (0.41), (0.53), (0.67), (0.79), (0.83);
create temp table prop_config (steps integer) on commit drop;
insert into prop_config values (220);

create temp table runs (seed double precision, step integer, budget text, op text, outcome text) on commit drop;
create temp table failures (seed double precision, step integer, budget text, op text, problem text) on commit drop;
grant insert on failures to authenticated;
create temp table documented_codes (code text primary key) on commit drop;
insert into documented_codes values
  ('budget_not_found'), ('income_not_found'), ('period_not_found'), ('member_not_found'),
  ('invitation_not_found'), ('not_owner'), ('owner_cannot_leave'), ('member_has_primary_income'),
  ('already_member'), ('invalid_name'), ('invalid_amount'), ('invalid_pay_day'),
  ('invalid_weekend_rule'), ('invalid_email'), ('invalid_start_month'), ('invalid_end_date'),
  ('invalid_boundary'), ('invalid_period'), ('end_date_before_last_period'), ('income_is_primary'),
  ('income_ended'), ('income_not_in_force'), ('budget_ended'), ('budget_limit_reached'),
  ('member_limit_reached'), ('invitation_limit_reached'), ('income_limit_reached'),
  -- step 3
  ('category_not_found'), ('transaction_not_found'), ('invalid_cadence'), ('invalid_kind'),
  ('invalid_description'), ('invalid_date'), ('date_outside_periods'), ('invalid_category'),
  ('category_required'), ('category_is_group'), ('category_not_in_force'), ('category_ended'),
  ('invalid_parent'), ('other_name_required'), ('category_limit_reached'),
  ('transaction_limit_reached'), ('record_changed'), ('invalid_revision'), ('invalid_limit'),
  ('invalid_cursor');

create or replace function pg_temp.primary_of(b uuid) returns uuid language sql as $$
  select primary_income_id from public.budgets where id = b
$$;
-- Every row the run created, in creation order (incomes, categories, transactions).
create temp table made (ord bigserial primary key, kind text not null, budget uuid not null, id uuid not null unique) on commit drop;
grant select, insert on made to authenticated;
grant usage on sequence made_ord_seq to authenticated;
create or replace function pg_temp.made(k text, b uuid, i uuid) returns void language sql as $$
  insert into made (kind, budget, id) values (k, b, i) on conflict (id) do nothing
$$;
-- Record the categories of a budget the run has not seen yet (an "Other" made with a
-- subcategory), in a deterministic order: by name, then by when the RPC made them.
create or replace function pg_temp.made_categories(b uuid) returns void language sql as $$
  insert into made (kind, budget, id)
  select 'category', b, c.id from public.categories as c
  where c.budget_id = b and not exists (select 1 from made as m where m.id = c.id)
  order by c.name, c.created_at
$$;
-- A random existing row of kind k in budget b satisfying cond (SQL on the table, alias t),
-- chosen from the run's rows in creation order, so the pick depends only on the seed.
create or replace function pg_temp.pick(k text, b uuid, cond text default 'true') returns uuid language plpgsql as $$
declare
  v_ids uuid[];
begin
  execute format('select array_agg(m.id order by m.ord) from made as m join %s as t on t.id = m.id where m.kind = $1 and m.budget = $2 and (%s)',
                 case k when 'income' then 'public.incomes' when 'category' then 'public.categories' else 'public.transactions' end, cond)
    into v_ids using k, b;
  if v_ids is null then
    return null;
  end if;
  return v_ids[1 + floor(random() * cardinality(v_ids))::integer];
end;
$$;
-- A random period of budget b, by seq.
create or replace function pg_temp.pick_period(b uuid) returns public.periods language plpgsql as $$
declare
  v_n integer := (select count(*) from public.periods where budget_id = b);
  v public.periods;
begin
  select p.* into v from public.periods as p where p.budget_id = b order by p.seq offset floor(random() * v_n)::integer limit 1;
  return v;
end;
$$;
-- A deterministic shuffle of an array already in a deterministic order.
create or replace function pg_temp.shuffle(a uuid[]) returns uuid[] language plpgsql as $$
declare
  j integer;
  t uuid;
begin
  if a is null then
    return a;
  end if;
  for i in reverse cardinality(a)..2 loop
    j := 1 + floor(random() * i)::integer;
    t := a[i]; a[i] := a[j]; a[j] := t;
  end loop;
  return a;
end;
$$;
-- The periods containing some dates (excluded from the closed-totals check).
create or replace function pg_temp.seqs_of(b uuid, ds date[]) returns integer[] language sql as $$
  select coalesce(array_agg(p.seq), '{}') from public.periods as p
  where p.budget_id = b and exists (select 1 from unnest(ds) as d where d between p.start_date and p.end_date)
$$;
-- Closed periods' totals (income, expected, spent), keyed by seq.
create or replace function pg_temp.closed_totals(b uuid, before date) returns jsonb language sql as $$
  select coalesce(jsonb_object_agg(seq, jsonb_build_array(income_total, expected_total, spent_total)), '{}')
  from public.period_summaries where budget_id = b and end_date < before
$$;
-- Periods whose totals disagree with a naive recomputation or with their progress rows.
create or replace function pg_temp.totals_disagree(b uuid) returns setof text language sql as $$
  select format('period %s totals %s, naive %s, rows %s', s.seq,
                row(s.salary_total, s.extra_income_total, s.expected_total, s.spent_total), row(n.*), row(r.*))
  from public.period_summaries as s
  cross join lateral tests.naive_totals(s.id) as n
  cross join lateral (select coalesce(sum(expected), 0)::bigint as expected, coalesce(sum(spent), 0)::bigint as spent
                      from public.get_period_progress(s.id) where not is_group) as r
  where s.budget_id = b
    and (row(s.salary_total, s.extra_income_total, s.expected_total, s.spent_total) is distinct from row(n.*)
         or row(r.expected, r.spent) is distinct from row(s.expected_total, s.spent_total)
         or s.income_total <> s.salary_total + s.extra_income_total
         or s.left_to_assign <> s.income_total - s.expected_total
         or s.result <> s.income_total - s.spent_total)
$$;

select plan(12);

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
  v_terms_before jsonb;
  v_terms_after jsonb;
  v_preview_end date;
  v_pay_day integer;
  v_rule public.weekend_rule;
  v_category uuid;
  v_tx public.transactions;
  v_date date;
  v_first date;
  v_kind public.transaction_kind;
  v_pick uuid;  -- picks are called once, never in a WHERE clause (it would run per row scanned)
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
    perform pg_temp.made('income', tests.id(v_user || n), pg_temp.primary_of(tests.id(v_user || n)))
    from unnest(array['b1', 'b2', 'b3']) as n;
    perform tests.clear_authentication();

    for v_step in 1..v_steps loop
      v_name := (array['b1', 'b2', 'b3'])[1 + floor(random() * 3)::integer];
      v_budget := tests.id(v_user || v_name);
      v_today := private.today();
      v_r := random();
      -- Step 2 operations take half the steps, step 3 operations the other half.
      if random() < 0.5 then
      v_op := case
        when v_r < 0.14 then 'advance_day'
        when v_r < 0.21 then 'update_terms'
        when v_r < 0.24 then 'preview_then_update_primary'
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
        when v_r < 0.98 then 'current'
        else 'preview_then_correct_primary'
      end;
      else
        v_op := case
          when v_r < 0.10 then 'create_category'
          when v_r < 0.15 then 'create_category_backdated'
          when v_r < 0.22 then 'create_subcategory'
          when v_r < 0.30 then 'update_expectation'
          when v_r < 0.36 then 'correct_expectation'
          when v_r < 0.40 then 'rename_category'
          when v_r < 0.45 then 'end_category'
          when v_r < 0.48 then 'end_category_from'
          when v_r < 0.70 then 'add_transaction'
          when v_r < 0.80 then 'update_transaction'
          when v_r < 0.86 then 'delete_transaction'
          when v_r < 0.90 then 'stale_edit'
          when v_r < 0.92 then 'reorder_categories'
          when v_r < 0.95 then 'extend_category'
          when v_r < 0.98 then 'restore_category'
          else 'reopen_previous_period'
        end;
      end if;

      v_before := pg_temp.closed_totals(v_budget, v_today);
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
          v_period := pg_temp.pick_period(v_budget);
          if v_op = 'update_terms' then
            v_income := pg_temp.pick('income', v_budget, 't.end_seq is null');
            v_amount := 100000 + floor(random() * 800000)::bigint;
            perform tests.update_income_terms(v_income, v_amount, 1 + floor(random() * 31)::integer,
              (array['nearest', 'previous', 'next', 'none'])[1 + floor(random() * 4)::integer]::public.weekend_rule);
          elsif v_op = 'preview_then_update_primary' then
            v_pay_day := 1 + floor(random() * 31)::integer;
            v_rule := (array['nearest', 'previous', 'next', 'none'])[1 + floor(random() * 4)::integer]::public.weekend_rule;
            select end_date into v_preview_end from tests.preview_expected_pay_date(v_budget, v_pay_day, v_rule);
            perform tests.update_income_terms(pg_temp.primary_of(v_budget), 500000, v_pay_day, v_rule);
            if v_preview_end is distinct from (select end_date from public.periods
                                                where budget_id = v_budget and private.today() between start_date and end_date) then
              insert into failures values (v_seed, v_step, v_name, v_op, 'preview and write disagree');
            end if;
          elsif v_op = 'preview_then_correct_primary' then
            -- a correction of the primary's terms from a past period: preview, then the write
            v_pay_day := 1 + floor(random() * 31)::integer;
            v_from := v_period.seq;
            select end_date into v_preview_end
            from public.preview_update_income(pg_temp.primary_of(v_budget), null, v_pay_day, null, v_period.id);
            perform public.update_income(pg_temp.primary_of(v_budget),
              (select revision from public.incomes where id = pg_temp.primary_of(v_budget)),
              p_pay_day => v_pay_day, p_from_period_id => v_period.id);
            if v_preview_end is distinct from (select end_date from public.periods
                                                where budget_id = v_budget and private.today() between start_date and end_date) then
              insert into failures values (v_seed, v_step, v_name, v_op, 'preview and correction disagree');
            end if;
          elsif v_op = 'correct_terms' then
            v_income := pg_temp.pick('income', v_budget);
            v_from := v_period.seq;
            perform tests.update_income_terms(v_income, 100000 + floor(random() * 800000)::bigint,
              1 + floor(random() * 31)::integer, 'nearest', v_period.id);
          elsif v_op = 'add_income' then
            perform pg_temp.made('income', v_budget, public.add_income(v_budget, 'Extra', 1000 + floor(random() * 300000)::bigint,
                                      1 + floor(random() * 31)::integer));
          elsif v_op = 'add_income_backdated' then
            v_from := v_period.seq;
            perform pg_temp.made('income', v_budget, public.add_income(v_budget, 'Back-dated', 1000 + floor(random() * 300000)::bigint,
                                      1 + floor(random() * 31)::integer, 'nearest', null, v_period.id));
          elsif v_op in ('remove_income', 'remove_income_from') then
            v_income := pg_temp.pick('income', v_budget, format('t.id <> %L', pg_temp.primary_of(v_budget)));
            if v_income is not null then
              if v_op = 'remove_income' then
                perform tests.remove_income(v_income);
              else
                v_from := v_period.seq;
                perform tests.remove_income(v_income, v_period.id);
              end if;
            end if;
          elsif v_op = 'set_primary' then
            v_income := pg_temp.pick('income', v_budget);
            perform tests.set_primary_income(v_income);
          elsif v_op = 'set_end_date' then
            perform tests.set_budget_end_date(v_budget, v_today + floor(random() * 200)::integer - 20);
          elsif v_op = 'clear_end_date' then
            perform tests.set_budget_end_date(v_budget, null);
          elsif v_op = 'set_expected_pay_date' then
            perform tests.set_expected_pay_date(v_budget, v_today + floor(random() * 45)::integer - 3);
          elsif v_op = 'reset_expected_pay_date' then
            perform tests.set_expected_pay_date(v_budget);
          elsif v_op = 'record_early_pay_date' then
            perform tests.record_early_pay_date(v_budget, v_today - floor(random() * 10)::integer + 1);
          elsif v_op = 'reopen_previous_period' then
            -- The reopen catches up first, so the period it touches is the one before the
            -- latest after catching up (a budget not caught up this step may lack one).
            perform public.ensure_periods(v_budget);
            select array[max(seq) - 1] into v_touched from public.periods where budget_id = v_budget;
            perform count(*) from public.preview_reopen(v_budget);
            -- the terms in force now, for each income in force now
            select coalesce(jsonb_object_agg(id, amount), '{}') into v_terms_before
            from public.income_overview where budget_id = v_budget and is_active;
            perform tests.reopen_previous_period(v_budget,
              case when random() < 0.5 then null else v_today + floor(random() * 15)::integer end);
            select coalesce(jsonb_object_agg(id, amount), '{}') into v_terms_after
            from public.income_overview where budget_id = v_budget and is_active;
            if v_terms_after <> v_terms_before then
              insert into failures values (v_seed, v_step, v_name, v_op,
                'terms in force changed by the reopen: ' || v_terms_before::text || ' -> ' || v_terms_after::text);
            end if;
          elsif v_op = 'move_period_start' then
            v_touched := array[v_period.seq - 1, v_period.seq];
            perform tests.move_period_start(v_period.id, v_period.start_date + floor(random() * 21)::integer - 10);
          elsif v_op in ('create_category', 'create_category_backdated') then
            if v_op = 'create_category_backdated' then
              v_from := v_period.seq;
            end if;
            perform pg_temp.made('category', v_budget, (select c.id from public.create_category(v_budget, 'Cat ' || v_step, p_amount => floor(random() * 300000)::bigint,
              p_cadence => (array['monthly', 'yearly'])[1 + floor(random() * 2)::integer]::public.expectation_cadence,
              p_from_period_id => case when v_from is not null then v_period.id end) as c));
          elsif v_op = 'create_subcategory' then
            v_category := pg_temp.pick('category', v_budget, 't.parent_id is null');
            if random() < 0.3 then
              v_from := v_period.seq;
            end if;
            perform pg_temp.made('category', v_budget, (select c.id from public.create_category(v_budget, 'Sub ' || v_step, v_category, floor(random() * 100000)::bigint,
              'monthly', case when v_from is not null then v_period.id end, 'Other') as c));
            perform pg_temp.made_categories(v_budget);
          elsif v_op in ('update_expectation', 'correct_expectation') then
            v_category := pg_temp.pick('category', v_budget, 'not t.is_group');
            v_amount := floor(random() * 500000)::bigint;
            if v_op = 'correct_expectation' then
              v_from := v_period.seq;
            end if;
            perform public.update_category(v_category, (select revision from public.categories where id = v_category),
              p_amount => v_amount, p_cadence => (array['monthly', 'yearly'])[1 + floor(random() * 2)::integer]::public.expectation_cadence,
              p_from_period_id => case when v_from is not null then v_period.id end);
          elsif v_op = 'rename_category' then
            v_category := pg_temp.pick('category', v_budget);
            perform public.update_category(v_category, (select revision from public.categories where id = v_category), 'Renamed ' || v_step);
          elsif v_op in ('end_category', 'end_category_from') then
            v_category := pg_temp.pick('category', v_budget);
            if v_op = 'end_category_from' then
              v_from := v_period.seq;
            end if;
            perform public.end_category(v_category, (select revision from public.categories where id = v_category),
              case when v_from is not null then v_period.id end);
          elsif v_op in ('add_transaction', 'update_transaction') then
            -- a date from the first period's start to a little after today (some refused)
            select min(start_date) into v_first from public.periods where budget_id = v_budget;
            v_date := v_first + floor(random() * (least(v_today, (select max(end_date) from public.periods where budget_id = v_budget)) - v_first + 3))::integer;
            v_kind := case when random() < 0.8 then 'expense' when random() < 0.5 then 'refund' else 'extra_income' end;
            v_category := null;
            if v_kind <> 'extra_income' then
              if random() < 0.85 then
                begin
                  v_category := pg_temp.pick('category', v_budget,
                    format('t.id in (select category_id from public.list_categories_for_date(%L, %L))', v_budget, v_date));
                exception when sqlstate 'P0001' then
                  v_category := null;
                end;
              end if;
              if v_category is null then
                v_category := pg_temp.pick('category', v_budget);
              end if;
            end if;
            v_amount := 1 + floor(random() * 200000)::bigint;
            if v_op = 'add_transaction' then
              v_touched := pg_temp.seqs_of(v_budget, array[v_date]);
              perform pg_temp.made('transaction', v_budget,
                (select l.id from public.add_transaction(v_budget, v_kind, v_amount, v_date, v_category, 'Step ' || v_step) as l));
            else
              v_pick := pg_temp.pick('transaction', v_budget);
              select * into v_tx from public.transactions where id = v_pick;
              if v_tx.id is not null then
                v_touched := pg_temp.seqs_of(v_budget, array[v_date, v_tx.date]);
                perform public.update_transaction(v_tx.id, v_tx.revision, v_kind, v_amount, v_date, v_category);
              end if;
            end if;
          elsif v_op = 'delete_transaction' then
            v_pick := pg_temp.pick('transaction', v_budget);
            select * into v_tx from public.transactions where id = v_pick;
            if v_tx.id is not null then
              v_touched := pg_temp.seqs_of(v_budget, array[v_tx.date]);
              perform public.delete_transaction(v_tx.id, v_tx.revision);
            end if;
          elsif v_op = 'stale_edit' then
            -- an edit based on an older revision must be refused and change nothing
            v_pick := pg_temp.pick('transaction', v_budget, 't.revision > 1');
            select * into v_tx from public.transactions where id = v_pick;
            if v_tx.id is not null then
              perform public.update_transaction(v_tx.id, v_tx.revision - 1, v_tx.kind, v_tx.amount + 1, v_tx.date, v_tx.category_id);
              insert into failures values (v_seed, v_step, v_name, v_op, 'a stale transaction edit was accepted');
            else
              v_category := pg_temp.pick('category', v_budget);
              if v_category is not null then
                perform public.update_category(v_category, (select revision from public.categories where id = v_category) - 1, 'Stale');
                insert into failures values (v_seed, v_step, v_name, v_op, 'a stale category edit was accepted');
              end if;
            end if;
          elsif v_op = 'extend_category' then
            v_category := pg_temp.pick('category', v_budget);
            v_from := v_period.seq;
            perform public.extend_category(v_category, (select revision from public.categories where id = v_category), v_period.id);
          elsif v_op = 'restore_category' then
            -- from now (closed periods must not change), or as a correction from its end
            v_category := pg_temp.pick('category', v_budget, 't.end_seq is not null');
            if v_category is not null and random() < 0.4 then
              v_from := (select end_seq from public.categories where id = v_category);
              perform public.restore_category(v_category, (select revision from public.categories where id = v_category),
                (select id from public.periods where budget_id = v_budget and seq = v_from));
            elsif v_category is not null then
              perform public.restore_category(v_category, (select revision from public.categories where id = v_category));
            end if;
          elsif v_op = 'reorder_categories' then
            perform public.reorder_categories(v_budget,
              pg_temp.shuffle(array(select m.id from made as m join public.categories as c on c.id = m.id
                                    where m.budget = v_budget and c.parent_id is null and c.end_seq is null order by m.ord)));
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

      -- Every period's totals equal a naive recomputation and the sum of its progress rows.
      perform tests.authenticate_as(v_user);
      for v_problem in select pg_temp.totals_disagree(v_budget) loop
        insert into failures values (v_seed, v_step, v_name, v_op, v_problem);
      end loop;
      perform tests.clear_authentication();

      -- Closed totals, except what the operation names or touches.
      select coalesce(jsonb_object_agg(key, value), '{}') into v_after
      from jsonb_each(pg_temp.closed_totals(v_budget, v_today))
      where key in (select jsonb_object_keys(v_before));
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
      if v_op = 'update_expectation' and v_outcome = 'ok' then
        if not exists (select 1 from public.category_overview where id = v_category and amount = v_amount) then
          insert into failures values (v_seed, v_step, v_name, v_op, 'the expectation just saved is not in force now');
        end if;
      end if;
    end loop;
  end loop;
end;
$prop$;

select is_empty(
  'select seed, step, budget, op, problem from failures order by seed, step',
  'R-PERIOD-031 R-PERIOD-032 R-PERIOD-029 R-PERIOD-005 R-PERIOD-020 R-PERIOD-022 R-VERSION-011 R-VERSION-013 R-SECURITY-007 R-PROGRESS-092 R-TRANSACTION-093 R-CATEGORY-092 R-VERSION-014 R-CONCURRENCY-070: across all seeds, every step kept the invariants (no transaction outside every period or on a group), nothing got stuck, only documented errors reached the client, every period''s totals equalled a naive recomputation and its progress rows, closed income, expected and spent totals changed only where named, edits were in force at once, a reopen kept the terms in force, and no stale edit was accepted'
);
select cmp_ok((select count(*)::integer from runs where outcome = 'ok' and op in ('add_transaction', 'update_transaction', 'delete_transaction')),
  '>=', 150, 'R-TRANSACTION-008: the runs recorded, edited and deleted many transactions, in past periods too');
select cmp_ok((select count(*)::integer from runs where outcome = 'ok' and op in ('create_subcategory', 'correct_expectation', 'end_category', 'end_category_from', 'create_category_backdated')),
  '>=', 60, 'R-VERSION-070 R-CATEGORY-092: and changed categories in every way, corrections included');
select cmp_ok((select count(*)::integer from runs where outcome = 'ok' and op in ('extend_category', 'restore_category')),
  '>=', 20, 'R-CATEGORY-100 R-CATEGORY-101: including extending and restoring categories');
select cmp_ok((select count(*)::integer from runs where outcome = 'ok' and op = 'preview_then_correct_primary'),
  '>=', 5, 'R-PERIOD-036: and the previews of corrections always matched the write');
select cmp_ok((select count(*)::integer from runs where outcome = 'refused: record_changed' and op = 'stale_edit'),
  '>=', 10, 'R-CONCURRENCY-070: and refused every stale edit it tried');
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
select cmp_ok((select count(*)::integer from runs where op = 'preview_then_update_primary' and outcome = 'ok'),
  '>=', 15, 'R-PERIOD-036: the previews of the expected pay date always matched the write');
select cmp_ok((select count(*)::integer from runs), '=', 8 * (select steps from prop_config),
  'R-PERIOD-009: every step ran');

select diag('fingerprint of the walks: ' || md5(string_agg(format('%s/%s/%s/%s/%s', seed, step, budget, op, outcome), ',' order by seed, step)))
from runs;
select diag(op || ' / ' || split_part(outcome, ':', 1) || coalesce(':' || nullif(split_part(outcome, ':', 2), ''), '') || ' x' || count(*))
from runs group by op, outcome order by op, count(*) desc;

select * from finish();
rollback;
