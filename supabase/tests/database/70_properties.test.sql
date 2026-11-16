-- Property test: after any sequence of the public operations, in any order, on any day,
-- the period invariants hold, nothing gets stuck, no raw error reaches the client, and no
-- closed period's total changes except through an operation that names it. Step 3 adds
-- category and transaction operations to the sequences, step 4 subscription and debt
-- operations (automatic charges, confirmations, payments, interest, adjustments).
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
--   * an edit based on an older revision is refused;
--   * step 4 (tests.step4_violations): no subscription charged twice for a date, no interest
--     entry without its period and at most one per debt and period, every debt's remaining
--     amount and every period's committed total equal a naive recomputation from the rows;
--     every subscription and debt has a category in force in every period it is in force;
--   * step 4, independent models (S5 of the step 4 review): the charges created since the last
--     check are exactly the scheduled dates of a naive schedule (the nominal day the run asked
--     for, tracked by the run), at the price and category of the terms in force in their period,
--     and none comes back once dismissed; each new period's interest is one twelfth of the rate
--     on a naive balance, half up; each debt's projection equals a naive recomputation, its end
--     date a naive walk of the future periods.
-- Closed totals now include the committed total. Before each step the budget is opened (its
-- catch-up runs), so the charges a long absence left due count as what the budget held.
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
  ('invalid_cursor'),
  -- step 4
  ('subscription_not_found'), ('debt_not_found'), ('adjustment_not_found'), ('subscription_ended'),
  ('debt_ended'), ('invalid_charge_date'), ('invalid_interest_rate'), ('subscription_limit_reached'),
  ('debt_limit_reached'), ('adjustment_limit_reached'), ('invalid_link'), ('debt_not_in_force'),
  ('subscription_not_in_force'), ('not_a_charge'), ('category_in_use'), ('debt_has_history'),
  ('before_debt_opened'), ('catching_up'), ('preview_required');

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
                 case k when 'income' then 'public.incomes' when 'category' then 'public.categories'
                        when 'subscription' then 'public.subscriptions' when 'debt' then 'public.debts'
                        when 'adjustment' then 'public.debt_adjustments' else 'public.transactions' end, cond)
    into v_ids using k, b;
  if v_ids is null then
    return null;
  end if;
  return v_ids[1 + floor(random() * cardinality(v_ids))::integer];
end;
$$;
-- Record the automatic charges of a budget the run has not seen yet, in a deterministic order:
-- by charge date, then by when the run made the subscription.
create or replace function pg_temp.made_charges(b uuid) returns void language sql as $$
  insert into made (kind, budget, id)
  select 'charge', b, t.id from public.transactions as t join made as s on s.id = t.subscription_id
  where t.budget_id = b and t.charge_date is not null and not exists (select 1 from made as m where m.id = t.id)
  order by t.charge_date, s.ord
$$;
-- Record the adjustment an operation just made (at most one per step).
create or replace function pg_temp.made_adjustments(b uuid) returns void language sql as $$
  insert into made (kind, budget, id)
  select 'adjustment', b, a.id from public.debt_adjustments as a
  where a.budget_id = b and not exists (select 1 from made as m where m.id = a.id)
$$;
-- Step 4 models. model_h: the last day the run has checked a subscription's charges up to.
-- model_day: the nominal day the run asked for, per subscription and the period it applies from.
-- seen_periods: periods whose interest was checked.
create temp table model_h (sub uuid primary key, h date not null) on commit drop;
create temp table model_day (sub uuid not null, eff integer not null, day integer not null, primary key (sub, eff)) on commit drop;
create temp table seen_periods (id uuid primary key) on commit drop;
-- charges the run itself edited, moved, unlinked or removed: the schedule says nothing of them
create temp table touched_charges (sub uuid not null, charge_date date not null, primary key (sub, charge_date)) on commit drop;
grant select, insert, update, delete on model_h, model_day, seen_periods, touched_charges to authenticated;
create or replace function pg_temp.touched(x public.transactions) returns void language sql as $$
  insert into touched_charges select x.subscription_id, x.charge_date where x.charge_date is not null on conflict do nothing
$$;
create or replace function pg_temp.model_day_at(s uuid, seq integer) returns integer language sql as $$
  select m.day from model_day as m where m.sub = s and m.eff <= seq order by m.eff desc limit 1
$$;
-- The charges oracle: what was created for each subscription since the last check, against a
-- naive schedule; then the checked horizon moves.
create or replace function pg_temp.charge_oracle(b uuid) returns setof text language plpgsql as $$
declare
  v_h date := least(private.today(), (select max(p.end_date) from public.periods as p where p.budget_id = b));
  r record;
  v_exp text[];
  v_act text[];
begin
  -- subscriptions the run made since the last check start from their first period's start
  insert into model_h (sub, h)
  select s.id, (select p.start_date - 1 from public.periods as p where p.budget_id = b and p.seq = s.first_seq)
  from public.subscriptions as s join made as m on m.id = s.id
  where s.budget_id = b and not exists (select 1 from model_h as x where x.sub = s.id);
  for r in select s.*, mh.h from public.subscriptions as s join model_h as mh on mh.sub = s.id where s.budget_id = b loop
    -- the nominal day of every version is the one the run asked for
    if exists (select 1 from public.subscription_versions as v where v.subscription_id = r.id
               and v.charge_day is distinct from pg_temp.model_day_at(r.id, v.effective_from_seq)) then
      return next format('subscription %s: a version lost its nominal day %s', r.name, pg_temp.model_day_at(r.id, r.first_seq));
    end if;
    if r.h < v_h then
      select coalesce(array_agg(format('%s/%s/%s', d, v.price, v.category_id) order by d), '{}') into v_exp
      from public.periods as p
      cross join lateral (select x.price, x.category_id, x.anchor_date, x.cadence, x.effective_from_seq from public.subscription_versions as x
                          where x.subscription_id = r.id and x.effective_from_seq <= p.seq order by x.effective_from_seq desc limit 1) as v
      cross join lateral tests.naive_charge_dates(v.anchor_date, v.cadence::text, pg_temp.model_day_at(r.id, v.effective_from_seq),
                                                  greatest(p.start_date, r.h + 1), least(p.end_date, v_h)) as d
      where p.budget_id = b and p.seq >= r.first_seq and (r.end_seq is null or p.seq < r.end_seq)
        and p.end_date > r.h and p.start_date <= v_h
        and not exists (select 1 from touched_charges as x where x.sub = r.id and x.charge_date = d);
      select coalesce(array_agg(format('%s/%s/%s', t.charge_date, t.amount, t.category_id) order by t.charge_date), '{}') into v_act
      from public.transactions as t where t.subscription_id = r.id and t.charge_date > r.h and t.charge_date <= v_h
        and not exists (select 1 from touched_charges as x where x.sub = r.id and x.charge_date = t.charge_date);
      if v_exp <> v_act then
        return next format('subscription %s charges after %s: expected %s, created %s', r.name, r.h, v_exp, v_act);
      end if;
    end if;
    -- a charge dated where the run had already checked, which it never saw: one came back
    if exists (select 1 from public.transactions as t where t.subscription_id = r.id and t.charge_date <= r.h
               and not exists (select 1 from made as m where m.id = t.id)) then
      return next format('subscription %s: a charge dated on or before %s appeared again', r.name, r.h);
    end if;
    update model_h set h = greatest(h, v_h) where sub = r.id;
  end loop;
end;
$$;
-- The interest oracle. A period's interest is fixed when the period is created, and every
-- operation catches up before it writes, so a period created during a step saw the debts and
-- their rows as they stood at the end of the step before: debt_snap and ledger_snap keep that
-- state. For each period created since the last check, in order: one twelfth of the rate then
-- in force on the naive balance, half up, for each debt then in force; nothing for the others.
create temp table debt_snap (debt uuid primary key, budget uuid not null, principal bigint not null, first_seq integer not null,
                             end_seq integer, rate numeric not null) on commit drop;
create temp table ledger_snap (debt uuid not null, id uuid primary key, amount bigint not null) on commit drop;
grant select, insert, update, delete on debt_snap, ledger_snap to authenticated;
create or replace function pg_temp.interest_oracle(b uuid) returns setof text language plpgsql as $$
declare
  p record;
  d record;
  v_balance numeric;
  v_expected bigint;
begin
  for p in select x.* from public.periods as x where x.budget_id = b and not exists (select 1 from seen_periods as s where s.id = x.id)
           order by x.seq loop
    for d in select x.id, x.name, s.principal, s.first_seq, s.end_seq, s.rate, s.debt is not null as known, i.amount as actual
             from public.debts as x
             left join debt_snap as s on s.debt = x.id
             left join public.debt_interest as i on i.debt_id = x.id and i.period_id = p.id
             where x.budget_id = b loop
      v_expected := 0;
      if d.known and d.first_seq <= p.seq and (d.end_seq is null or p.seq < d.end_seq) and d.rate > 0 then
        v_balance := d.principal
          + coalesce((select sum(i.amount) from public.debt_interest as i join public.periods as q on q.id = i.period_id
                      where i.debt_id = d.id and q.seq < p.seq), 0)
          + coalesce((select sum(l.amount) from ledger_snap as l where l.debt = d.id), 0);
        if v_balance > 0 then
          v_expected := round(v_balance * d.rate / 1200);
        end if;
      end if;
      if coalesce(d.actual, 0) <> v_expected then
        return next format('debt %s, period %s: interest %s, naive %s on %s', d.name, p.seq, d.actual, v_expected, v_balance);
      end if;
    end loop;
    insert into seen_periods values (p.id);
  end loop;
  -- the state the next step's new periods will see
  delete from ledger_snap as l using debt_snap as s where s.debt = l.debt and s.budget = b;
  delete from debt_snap where budget = b;
  insert into debt_snap
  select x.id, x.budget_id, x.principal, x.first_seq, x.end_seq,
         (select v.interest_rate from public.debt_versions as v where v.debt_id = x.id order by v.effective_from_seq desc limit 1)
  from public.debts as x where x.budget_id = b;
  insert into ledger_snap
  select t.debt_id, t.id, -t.amount from public.transactions as t where t.budget_id = b and t.debt_id is not null
  union all
  select a.debt_id, a.id, a.amount from public.debt_adjustments as a where a.budget_id = b;
end;
$$;
-- The projection oracle: every debt in force against tests.naive_projection.
create or replace function pg_temp.projection_oracle(b uuid) returns setof text language sql as $$
  select format('debt %s: projection %s, naive %s', o.name, row(o.payoff, o.payments_left, o.expected_end_date), row(n.*))
  from public.debt_overview as o cross join lateral tests.naive_projection(o.id) as n
  where o.budget_id = b and o.is_active
    and (o.payoff::text is distinct from n.status or o.payments_left is distinct from n.payments_left
         or (n.walked and o.expected_end_date is distinct from n.end_date))
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
  select coalesce(jsonb_object_agg(seq, jsonb_build_array(income_total, expected_total, spent_total, committed_total)), '{}')
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

select plan(17);

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
  v_sub public.subscriptions;
  v_debt public.debts;
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
    -- the periods the budgets start with have no interest to check (row-level security: this user's)
    insert into seen_periods select p.id from public.periods as p on conflict do nothing;
    perform tests.clear_authentication();

    for v_step in 1..v_steps loop
      v_name := (array['b1', 'b2', 'b3'])[1 + floor(random() * 3)::integer];
      v_budget := tests.id(v_user || v_name);
      v_today := private.today();
      v_r := random();
      -- Step 2 operations take 40 % of the steps, step 3 operations 35 %, step 4 operations 25 %.
      v_k := floor(random() * 20)::integer;
      if v_k < 8 then
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
      elsif v_k < 15 then
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
      else
        v_op := case
          when v_r < 0.12 then 'create_subscription'
          when v_r < 0.22 then 'create_subscription_backdated'
          when v_r < 0.29 then 'update_subscription'
          when v_r < 0.33 then 'correct_subscription'
          when v_r < 0.36 then 'end_subscription'
          when v_r < 0.38 then 'end_subscription_from'
          when v_r < 0.45 then 'confirm_charge'
          when v_r < 0.51 then 'dismiss_charge'
          when v_r < 0.58 then 'create_debt'
          when v_r < 0.61 then 'create_debt_backdated'
          when v_r < 0.66 then 'update_debt'
          when v_r < 0.69 then 'correct_debt'
          when v_r < 0.78 then 'add_payment'
          when v_r < 0.83 then 'adjust_debt'
          when v_r < 0.85 then 'delete_adjustment'
          when v_r < 0.88 then 'remove_debt'
          when v_r < 0.91 then 'link_transaction'
          when v_r < 0.93 then 'stale_step4_edit'
          else 'long_absence'
        end;
      end if;

      -- The member opens the budget first: charges a long absence left due are created now.
      perform tests.authenticate_as(v_user);
      perform public.ensure_periods(v_budget);
      perform tests.clear_authentication();
      perform pg_temp.made_charges(v_budget);
      v_before := pg_temp.closed_totals(v_budget, v_today);
      v_touched := '{}';
      v_from := null;
      v_income := null;
      v_amount := null;

      v_outcome := 'ok';
      begin
        if v_op = 'advance_day' then
          perform tests.set_today(v_today + 1 + floor(random() * 12)::integer);
        elsif v_op = 'long_absence' then
          -- nobody opens the budgets for up to 40 days: periods, charges and interest are caught up
          perform tests.set_today(v_today + 1 + floor(random() * 40)::integer);
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
              p_pay_day => v_pay_day, p_from_period_id => v_period.id, p_previewed_end_date => v_preview_end);
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
            delete from model_day as o using public.subscriptions as s
            where s.id = o.sub and s.budget_id = v_budget and o.eff = v_touched[1]
              and exists (select 1 from model_day as n where n.sub = o.sub and n.eff = v_touched[1] + 1);
            update model_day as o set eff = v_touched[1] from public.subscriptions as s
            where s.id = o.sub and s.budget_id = v_budget and o.eff = v_touched[1] + 1;
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
              perform pg_temp.touched(v_tx);
              if v_tx.id is not null then
                v_touched := pg_temp.seqs_of(v_budget, array[v_date, v_tx.date]);
                perform public.update_transaction(v_tx.id, v_tx.revision, v_kind, v_amount, v_date, v_category);
              end if;
            end if;
          elsif v_op = 'delete_transaction' then
            v_pick := pg_temp.pick('transaction', v_budget);
            select * into v_tx from public.transactions where id = v_pick;
            perform pg_temp.touched(v_tx);
            if v_tx.id is not null then
              v_touched := pg_temp.seqs_of(v_budget, array[v_tx.date]);
              perform public.delete_transaction(v_tx.id, v_tx.revision);
            end if;
          elsif v_op = 'stale_edit' then
            -- an edit based on an older revision must be refused and change nothing
            v_pick := pg_temp.pick('transaction', v_budget, 't.revision > 1');
            select * into v_tx from public.transactions where id = v_pick;
            perform pg_temp.touched(v_tx);
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
          elsif v_op in ('create_subscription', 'create_subscription_backdated', 'create_debt', 'create_debt_backdated') then
            if v_op like '%backdated' then
              v_from := v_period.seq;
            end if;
            begin
              v_category := pg_temp.pick('category', v_budget,
                format('t.id in (select category_id from public.list_categories_for_date(%L, %L))', v_budget,
                       case when v_from is not null then v_period.start_date else v_today end));
            exception when sqlstate 'P0001' then
              v_category := null;
            end;
            if v_category is null then
              v_category := pg_temp.pick('category', v_budget);
            end if;
            if v_op like 'create_subscription%' then
              v_date := v_today + floor(random() * 200)::integer - 180;
              -- half of them at the end of a month (29th to 31st), whose dates clamp
              if random() < 0.5 then
                v_date := (date_trunc('month', v_date) + interval '1 month')::date - 1 - floor(random() * 3)::integer;
              end if;
              v_pick := (select s.id from public.create_subscription(v_budget, 'Sub ' || v_step,
                1 + floor(random() * 50000)::bigint,
                (array['monthly', 'quarterly', 'half_yearly', 'yearly'])[1 + floor(random() * 4)::integer]::public.subscription_cadence,
                v_category, v_date,
                case when v_from is not null then v_period.id end) as s);
              perform pg_temp.made('subscription', v_budget, v_pick);
              insert into model_day values (v_pick, (select first_seq from public.subscriptions where id = v_pick), extract(day from v_date)::integer);
            else
              perform pg_temp.made('debt', v_budget, (select d.id from public.create_debt(v_budget, 'Debt ' || v_step,
                1000 + floor(random() * 2000000)::bigint, v_category, floor(random() * 100000)::bigint,
                (array[0, 0, 1.5, 4.875, 12, 100])[1 + floor(random() * 6)::integer],
                case when v_from is not null then v_period.id end) as d));
            end if;
          elsif v_op in ('update_subscription', 'correct_subscription') then
            v_pick := pg_temp.pick('subscription', v_budget);
            select * into v_sub from public.subscriptions where id = v_pick;
            if v_sub.id is not null then
              if v_op = 'correct_subscription' then
                v_from := v_period.seq;
                perform public.update_subscription(v_sub.id, v_sub.revision, p_price => 1 + floor(random() * 50000)::bigint,
                  p_from_period_id => v_period.id);
              else
                v_k := floor(random() * 4)::integer;
                if v_k = 0 then
                  perform public.update_subscription(v_sub.id, v_sub.revision, p_price => 1 + floor(random() * 50000)::bigint);
                elsif v_k = 1 then
                  perform public.update_subscription(v_sub.id, v_sub.revision,
                    p_cadence => (array['monthly', 'quarterly', 'half_yearly', 'yearly'])[1 + floor(random() * 4)::integer]::public.subscription_cadence);
                elsif v_k = 2 then
                  v_date := v_today + floor(random() * 70)::integer;
                  if random() < 0.5 then
                    v_date := greatest((date_trunc('month', v_date) + interval '1 month')::date - 1 - floor(random() * 3)::integer, v_today + 1);
                  end if;
                  perform public.update_subscription(v_sub.id, v_sub.revision, p_next_charge_date => v_date);
                  -- the nominal day the member asked for, from the period the edit applies
                  insert into model_day values (v_sub.id, greatest(v_sub.first_seq,
                    (select p.seq from public.periods as p where p.budget_id = v_budget and v_today between p.start_date and p.end_date)),
                    extract(day from v_date)::integer)
                  on conflict (sub, eff) do update set day = excluded.day;
                else
                  v_pick := pg_temp.pick('category', v_budget);
                  perform public.update_subscription(v_sub.id, v_sub.revision, p_category_id => v_pick);
                end if;
              end if;
            end if;
          elsif v_op in ('end_subscription', 'end_subscription_from') then
            v_pick := pg_temp.pick('subscription', v_budget);
            select * into v_sub from public.subscriptions where id = v_pick;
            if v_sub.id is not null then
              if v_op = 'end_subscription_from' then
                v_from := v_period.seq;
              end if;
              perform public.end_subscription(v_sub.id, v_sub.revision, case when v_from is not null then v_period.id end);
            end if;
          elsif v_op in ('confirm_charge', 'dismiss_charge') then
            v_pick := pg_temp.pick('charge', v_budget,
              case when v_op = 'confirm_charge' then 't.review_state = ''awaiting_confirmation''' else 'true' end);
            select * into v_tx from public.transactions where id = v_pick;
            perform pg_temp.touched(v_tx);
            if v_tx.id is not null then
              if v_op = 'confirm_charge' then
                perform public.confirm_subscription_charge(v_tx.id, v_tx.revision);
              else
                v_touched := pg_temp.seqs_of(v_budget, array[v_tx.date]);
                perform public.dismiss_subscription_charge(v_tx.id, v_tx.revision);
              end if;
            else
              v_outcome := 'nothing to pick';
            end if;
          elsif v_op in ('update_debt', 'correct_debt', 'remove_debt') then
            v_pick := pg_temp.pick('debt', v_budget);
            select * into v_debt from public.debts where id = v_pick;
            if v_debt.id is not null then
              if v_op = 'remove_debt' then
                if random() < 0.3 then
                  v_from := v_period.seq;
                end if;
                perform public.remove_debt(v_debt.id, v_debt.revision, case when v_from is not null then v_period.id end);
              elsif v_op = 'correct_debt' then
                v_from := v_period.seq;
                perform public.update_debt(v_debt.id, v_debt.revision,
                  p_interest_rate => (array[0, 2.5, 12])[1 + floor(random() * 3)::integer], p_from_period_id => v_period.id);
              else
                perform public.update_debt(v_debt.id, v_debt.revision,
                  p_interest_rate => case when random() < 0.5 then (array[0, 3, 6.125])[1 + floor(random() * 3)::integer] end,
                  p_monthly_payment => case when random() < 0.7 then floor(random() * 100000)::bigint end,
                  p_principal => case when random() < 0.2 then 1000 + floor(random() * 100000)::bigint end);
              end if;
            end if;
          elsif v_op = 'add_payment' then
            v_pick := pg_temp.pick('debt', v_budget);
            select * into v_debt from public.debts where id = v_pick;
            if v_debt.id is not null then
              select min(start_date) into v_first from public.periods where budget_id = v_budget;
              v_date := v_first + floor(random() * (least(v_today, (select max(end_date) from public.periods where budget_id = v_budget)) - v_first + 3))::integer;
              v_touched := pg_temp.seqs_of(v_budget, array[v_date]);
              perform pg_temp.made('transaction', v_budget,
                (select l.id from public.add_transaction(v_budget, 'expense', 1 + floor(random() * 80000)::bigint, v_date,
                                                         (select o.category_id from public.debt_overview as o where o.id = v_debt.id), 'Payment ' || v_step, p_debt_id => v_debt.id) as l));
            end if;
          elsif v_op = 'adjust_debt' then
            v_pick := pg_temp.pick('debt', v_budget);
            select * into v_debt from public.debts where id = v_pick;
            if v_debt.id is not null then
              select min(start_date) into v_first from public.periods where budget_id = v_budget;
              perform public.adjust_debt_balance(v_debt.id, v_debt.revision, floor(random() * 2000000)::bigint,
                v_first + floor(random() * (v_today - v_first + 2))::integer);
              perform pg_temp.made_adjustments(v_budget);
            end if;
          elsif v_op = 'delete_adjustment' then
            v_pick := pg_temp.pick('adjustment', v_budget);
            if v_pick is not null then
              perform public.delete_debt_adjustment(v_pick,
                (select d.revision from public.debts as d join public.debt_adjustments as a on a.debt_id = d.id where a.id = v_pick));
            end if;
          elsif v_op = 'link_transaction' then
            v_pick := pg_temp.pick('transaction', v_budget);
            select * into v_tx from public.transactions where id = v_pick;
            perform pg_temp.touched(v_tx);
            if v_tx.id is not null then
              v_r := random();
              if v_r < 0.4 then
                v_pick := pg_temp.pick('debt', v_budget);
                perform public.link_transaction(v_tx.id, v_tx.revision, v_pick);
              elsif v_r < 0.7 then
                v_pick := pg_temp.pick('subscription', v_budget);
                perform public.link_transaction(v_tx.id, v_tx.revision, null, v_pick);
              else
                perform public.link_transaction(v_tx.id, v_tx.revision);
              end if;
            end if;
          elsif v_op = 'stale_step4_edit' then
            -- an edit based on an older revision must be refused
            v_pick := pg_temp.pick('subscription', v_budget, 't.revision > 1');
            select * into v_sub from public.subscriptions where id = v_pick;
            if v_sub.id is not null then
              perform public.update_subscription(v_sub.id, v_sub.revision - 1, 'Stale');
              insert into failures values (v_seed, v_step, v_name, v_op, 'a stale subscription edit was accepted');
            else
              v_pick := pg_temp.pick('debt', v_budget, 't.revision > 1');
              select * into v_debt from public.debts where id = v_pick;
              if v_debt.id is not null then
                perform public.adjust_debt_balance(v_debt.id, v_debt.revision - 1, 0);
                insert into failures values (v_seed, v_step, v_name, v_op, 'a stale debt edit was accepted');
              end if;
            end if;
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

      -- Every period's totals equal a naive recomputation and the sum of its progress rows;
      -- the step 4 invariants hold.
      perform tests.authenticate_as(v_user);
      for v_problem in select pg_temp.totals_disagree(v_budget) loop
        insert into failures values (v_seed, v_step, v_name, v_op, v_problem);
      end loop;
      for v_problem in select tests.step4_violations(v_budget) loop
        insert into failures values (v_seed, v_step, v_name, v_op, v_problem);
      end loop;
      perform tests.clear_authentication();
      for v_problem in select pg_temp.charge_oracle(v_budget) union all select pg_temp.interest_oracle(v_budget)
                       union all select pg_temp.projection_oracle(v_budget) loop
        insert into failures values (v_seed, v_step, v_name, v_op, v_problem);
      end loop;
      perform pg_temp.made_charges(v_budget);

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
  'R-PERIOD-031 R-PERIOD-032 R-PERIOD-029 R-PERIOD-005 R-PERIOD-020 R-PERIOD-022 R-VERSION-011 R-VERSION-013 R-SECURITY-007 R-PROGRESS-092 R-TRANSACTION-093 R-CATEGORY-092 R-VERSION-014 R-CONCURRENCY-070 R-SUBSCRIPTION-111 R-DEBT-003 R-DEBT-111 R-SUBSCRIPTION-079 R-VERSION-110 R-SUBSCRIPTION-073 R-SUBSCRIPTION-130 R-DEBT-073 R-DEBT-005 R-CATEGORY-130: across all seeds, every step kept the invariants (no transaction outside every period or on a group, no charge twice, no interest without its period or twice in one), nothing got stuck, only documented errors reached the client, every period''s totals and committed total equalled a naive recomputation and its progress rows, every debt''s remaining amount equalled one from its rows, closed income, expected, spent and committed totals changed only where named, edits were in force at once, a reopen kept the terms in force, and no stale edit was accepted'
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
select cmp_ok((select count(*)::integer from runs where outcome = 'ok' and op like '%subscription%'),
  '>=', 40, 'R-VERSION-003: the runs created, edited, corrected and ended many subscriptions');
select cmp_ok((select count(*)::integer from made where kind = 'charge'), '>=', 45,
  'R-SUBSCRIPTION-073 Q-054: which were charged automatically, many times, also after long absences');
select cmp_ok((select count(*)::integer from runs where outcome = 'ok' and op in ('confirm_charge', 'dismiss_charge')),
  '>=', 10, 'R-SUBSCRIPTION-075 R-SUBSCRIPTION-077: and charges were confirmed or dismissed');
select cmp_ok((select count(*)::integer from runs where outcome = 'ok' and op in ('create_debt', 'create_debt_backdated', 'update_debt', 'correct_debt', 'add_payment', 'adjust_debt', 'delete_adjustment', 'remove_debt')),
  '>=', 60, 'R-VERSION-004 R-DEBT-075: the runs recorded, paid, adjusted and removed many debts');
select cmp_ok((select count(*)::integer from public.debt_interest as i join made as m on m.id = i.debt_id),
  '>=', 15, 'R-DEBT-073: and interest was added to them');
select cmp_ok((select count(*)::integer from runs), '=', 8 * (select steps from prop_config),
  'R-PERIOD-009: every step ran');

select diag('automatic charges created: ' || (select count(*) from made where kind = 'charge'));
select diag('fingerprint of the walks: ' || md5(string_agg(format('%s/%s/%s/%s/%s', seed, step, budget, op, outcome), ',' order by seed, step)))
from runs;
select diag(op || ' / ' || split_part(outcome, ':', 1) || coalesce(':' || nullif(split_part(outcome, ':', 2), ''), '') || ' x' || count(*))
from runs group by op, outcome order by op, count(*) desc;

select * from finish();
rollback;
