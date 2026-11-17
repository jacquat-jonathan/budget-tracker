-- Step 5: period comparison (F-COMPARE). Read functions only: the trend of the last periods,
-- the spending per category across them, and two periods side by side. Every figure comes from
-- the same internal code as period_summaries (the view itself) and get_period_progress
-- (private.category_progress), so the comparison can never disagree with the progress view
-- (C-LOGIC-001, C-LOGIC-003). No table, no write: a read catches up exactly like
-- get_current_period (bounded, no lock when nothing is due) and writes nothing else.

-- ===========================================================================
-- Shared helpers
-- ===========================================================================

-- R-COMPARE-171: the most periods one comparison read covers.
create or replace function private.limit_compare_periods() returns integer
language sql immutable set search_path = '' as $$ select 24 $$;

-- R-COMPARE-171, R-COMPARE-175: the read's catch-up and the last period of a range: the current
-- period, or the last one once the budget has ended. A very long absence not yet caught up
-- answers catching_up (call ensure_periods until it returns 0), so a range never silently ends
-- before today. Members only (budget_not_found).
create or replace function private.compare_reading_seq(p_budget_id uuid)
returns integer
language plpgsql
volatile
set search_path = ''
as $$
begin
  perform private.assert_member(p_budget_id);
  perform private.read_catch_up(p_budget_id);  -- the one catch-up of every read (D-387)
  return private.reading_seq(p_budget_id);
end;
$$;

-- R-COMPARE-070, R-COMPARE-174: the display order of every category of the budget, from its
-- current place (top level by sort_order, each group's subcategories after it), the same keys
-- as private.category_progress, so a line keeps one place across periods.
create or replace function private.category_display_order(p_budget_id uuid)
returns table (category_id uuid, display_order integer)
language sql
stable
set search_path = ''
as $$
  select c.id,
         (pg_catalog.row_number() over (
            order by coalesce(p.sort_order, c.sort_order), coalesce(p.name, c.name), coalesce(c.parent_id, c.id),
                     c.parent_id is not null, c.sort_order, c.name, c.id))::integer
  from public.categories as c
  left join public.categories as p on p.id = c.parent_id
  where c.budget_id = p_budget_id
$$;

-- R-COMPARE-172, D-383: an average over n periods, to the rappen, halves away from zero (null
-- when n is 0: there is nothing to average).
create or replace function private.compare_average(p_sum numeric, p_n integer)
returns bigint
language sql
immutable
set search_path = ''
as $$
  select case when p_n > 0 then pg_catalog.round(p_sum / p_n)::bigint end
$$;

-- ===========================================================================
-- R-COMPARE-002, R-COMPARE-171, R-COMPARE-172, R-COMPARE-173: the trend of the last periods
-- ===========================================================================

-- The last p_count (1 to 24) periods up to the current one (or the last, once the budget has
-- ended), oldest first, each with its period_summaries figures, its length, and whether it is
-- still running; and, repeated on every row, the averages over the completed periods of the
-- range (null when none is completed). Members. Errors: budget_not_found, invalid_limit,
-- catching_up.
create or replace function public.get_period_trend(p_budget_id uuid, p_count integer default 12)
returns table (
  period_id uuid, seq integer, start_date date, end_date date, days integer,
  is_current boolean, is_completed boolean,
  income_total bigint, salary_total bigint, extra_income_total bigint,
  spent_total bigint, expected_total bigint, committed_total bigint, result bigint,
  completed_count integer, average_income bigint, average_spent bigint, average_result bigint,
  transfer_committed_total bigint
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_last integer;
begin
  if p_count is null or p_count not between 1 and private.limit_compare_periods() then
    perform private.assert_member(p_budget_id);
    raise exception 'invalid_limit' using errcode = 'P0001';
  end if;
  v_last := private.compare_reading_seq(p_budget_id);
  return query
    with r as (
      select s.id, s.seq, s.start_date, s.end_date, (s.end_date - s.start_date + 1) as days, s.is_current,
             (s.end_date < s.today) as is_completed,
             s.income_total, s.salary_total, s.extra_income_total, s.spent_total, s.expected_total,
             s.committed_total, s.result, s.transfer_committed_total
      from public.period_summaries as s
      where s.budget_id = p_budget_id and s.seq between v_last - p_count + 1 and v_last
    ),
    a as (
      select pg_catalog.count(*)::integer as n,
             pg_catalog.sum(r.income_total) as income, pg_catalog.sum(r.spent_total) as spent,
             pg_catalog.sum(r.result) as result
      from r where r.is_completed
    )
    select r.id, r.seq, r.start_date, r.end_date, r.days, r.is_current, r.is_completed,
           r.income_total, r.salary_total, r.extra_income_total, r.spent_total, r.expected_total,
           r.committed_total, r.result,
           a.n, private.compare_average(a.income, a.n), private.compare_average(a.spent, a.n),
           private.compare_average(a.result, a.n), r.transfer_committed_total
    from r cross join a
    order by r.seq;
end;
$$;

-- ===========================================================================
-- R-COMPARE-070, R-COMPARE-170, R-COMPARE-172, R-COMPARE-174, R-APP-170: spending per
-- category across the same periods
-- ===========================================================================

-- One row per category line (D-264: at most one row per category of the budget, never lines
-- times periods, so the answer stays within the API's 1000 rows): every category, group or
-- subcategory that has a progress row (get_period_progress) in some period of the range of
-- get_period_trend with the same p_count. A line is the category's id, under its current name
-- and place. The per-period figures are arrays aligned with period_ids (the range, oldest
-- first, the same on every row and equal to get_period_trend's period_id column): in a period
-- with a progress row, its figures (spent: expenses minus refunds; planned: the expectation's
-- monthly share, null when the category is not in force there; committed: subscriptions'
-- monthly costs); in a period without one: not in force, planned null, spent 0, committed 0,
-- transaction_count 0. The spent elements of the top-level lines (parent_id null) at one
-- position add up to that period's spent_total, and so do those of the leaves (is_group
-- false). average_spent: over the completed periods of the range, as in get_period_trend (null
-- when none is completed). is_overspent: get_period_progress's flag of the line in each period
-- (false where it has no progress row; D-391). Q-160, D-383: active_count and active_average_spent, over the
-- completed periods of the range in which the line was in force or had spending (a category
-- that started or stopped inside the range is averaged over its own periods; null when that
-- count is 0). Members. Errors: as get_period_trend.
create or replace function public.get_category_trend(p_budget_id uuid, p_count integer default 12)
returns table (
  category_id uuid, parent_id uuid, name text, is_group boolean, display_order integer,
  period_ids uuid[], in_force boolean[], planned bigint[], spent bigint[], committed bigint[],
  transaction_count integer[], completed_count integer, average_spent bigint,
  active_count integer, active_average_spent bigint,
  is_overspent boolean[], transfer_committed bigint[]
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_last integer;
  v_today date;
begin
  if p_count is null or p_count not between 1 and private.limit_compare_periods() then
    perform private.assert_member(p_budget_id);
    raise exception 'invalid_limit' using errcode = 'P0001';
  end if;
  v_last := private.compare_reading_seq(p_budget_id);
  v_today := private.today();
  return query
    with ps as (
      select p.id, p.seq, p.start_date, p.end_date
      from public.periods as p
      where p.budget_id = p_budget_id and p.seq between v_last - p_count + 1 and v_last
    ),
    ids as (select pg_catalog.array_agg(ps.id order by ps.seq) as period_ids from ps),
    rows_ as (
      select ps.id as pid, g.*
      from ps cross join lateral private.category_progress(p_budget_id, ps.seq, ps.start_date, ps.end_date) as g
    ),
    lines as (select distinct x.category_id from rows_ as x),
    n as (select pg_catalog.count(*)::integer as n from ps where ps.end_date < v_today),
    grid as (
      select l.category_id, ps.seq, ps.end_date,
             coalesce(x.in_force, false) as in_force,
             case when x.in_force then x.expected end as planned,
             coalesce(x.spent, 0)::bigint as spent, coalesce(x.committed, 0)::bigint as committed,
             coalesce(x.transaction_count, 0) as transaction_count,
             coalesce(x.is_overspent, false) as is_overspent,
             coalesce(x.transfer_committed, 0)::bigint as transfer_committed
      from lines as l cross join ps
      left join rows_ as x on x.category_id = l.category_id and x.pid = ps.id
    ),
    agg as (
      select g.category_id,
             pg_catalog.array_agg(g.in_force order by g.seq) as in_force,
             pg_catalog.array_agg(g.planned order by g.seq) as planned,
             pg_catalog.array_agg(g.spent order by g.seq) as spent,
             pg_catalog.array_agg(g.committed order by g.seq) as committed,
             pg_catalog.array_agg(g.transaction_count order by g.seq) as transaction_count,
             pg_catalog.array_agg(g.is_overspent order by g.seq) as is_overspent,
             pg_catalog.array_agg(g.transfer_committed order by g.seq) as transfer_committed,
             coalesce(pg_catalog.sum(g.spent) filter (where g.end_date < v_today), 0) as completed_spent,
             (pg_catalog.count(*) filter (where g.end_date < v_today
                                            and (g.in_force or g.spent <> 0 or g.transaction_count > 0)))::integer as active_n,
             pg_catalog.sum(g.spent) filter (where g.end_date < v_today
                                              and (g.in_force or g.spent <> 0 or g.transaction_count > 0)) as active_spent
      from grid as g group by g.category_id
    )
    select c.id, c.parent_id, c.name, c.is_group, o.display_order,
           ids.period_ids, a.in_force, a.planned, a.spent, a.committed, a.transaction_count,
           n.n, private.compare_average(a.completed_spent, n.n),
           a.active_n, private.compare_average(a.active_spent, a.active_n),
           a.is_overspent, a.transfer_committed
    from agg as a
    join public.categories as c on c.id = a.category_id
    join private.category_display_order(p_budget_id) as o on o.category_id = c.id
    cross join n cross join ids
    order by o.display_order;
end;
$$;

-- ===========================================================================
-- R-APP-170: the periods, a page at a time
-- ===========================================================================

-- The periods of the budget as period_summaries rows, newest first, at most p_limit (1 to
-- 200, default 120: ten years of monthly periods), before seq p_before_seq when given (the
-- last row's seq of the page before). A budget may hold more periods than the API returns in
-- one request (a long life, short periods): page through them rather than selecting the
-- whole view. Members. Errors: budget_not_found, invalid_limit.
create or replace function public.list_periods(p_budget_id uuid, p_limit integer default 120, p_before_seq integer default null)
returns setof public.period_summaries
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.assert_member(p_budget_id);
  if p_limit is null or p_limit not between 1 and 200 then
    raise exception 'invalid_limit' using errcode = 'P0001';
  end if;
  return query
    select s.* from public.period_summaries as s
    where s.budget_id = p_budget_id and (p_before_seq is null or s.seq < p_before_seq)
    order by s.seq desc
    limit p_limit;
end;
$$;

-- ===========================================================================
-- R-APP-170: preview_reopen within one response
-- ===========================================================================

-- As in step 2 (the changes of private.merge_impact, in its order; the same catch-up and
-- errors), and at most 1000 rows: when the period changed more records than that (only
-- possible near several limits at once), the first 999 are listed and a last row says how many
-- more there are (record_kind 'more', record_id null, record_name the count, change 'more').
create or replace function public.preview_reopen(p_budget_id uuid)
returns table (record_kind text, record_id uuid, record_name text, change text, replaces_previous boolean)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_current public.periods;
  v_rows record;
  v_n integer := 0;
begin
  perform private.assert_member(p_budget_id);
  v_current := private.current_period(p_budget_id);
  if v_current.id is null then
    raise exception 'budget_ended' using errcode = 'P0001';
  end if;
  if v_current.seq = 1 then
    raise exception 'invalid_boundary' using errcode = 'P0001';
  end if;
  for v_rows in select * from private.merge_impact(p_budget_id, v_current.seq, v_current.seq - 1) loop
    v_n := v_n + 1;
    if v_n <= 999 then
      record_kind := v_rows.record_kind; record_id := v_rows.record_id; record_name := v_rows.record_name;
      change := v_rows.change; replaces_previous := v_rows.replaces_previous;
      return next;
    elsif v_n = 1000 then
      -- held back: the 1000th row is listed only if it is the last one
      record_kind := v_rows.record_kind; record_id := v_rows.record_id; record_name := v_rows.record_name;
      change := v_rows.change; replaces_previous := v_rows.replaces_previous;
    end if;
  end loop;
  if v_n = 1000 then
    return next;
  elsif v_n > 1000 then
    record_kind := 'more'; record_id := null; record_name := (v_n - 999)::text; change := 'more'; replaces_previous := false;
    return next;
  end if;
end;
$$;

-- ===========================================================================
-- R-COMPARE-071, R-COMPARE-173, R-COMPARE-174: two periods side by side
-- ===========================================================================

-- Periods A and B of the budget. Default (Q-161, D-384): with neither given, the last two
-- completed periods when two exist, otherwise the last two periods (B the current period, or
-- the last once the budget has ended); with only A given, B is the current (or last) period;
-- with only B given, A is the one before B (none when B is the first). Every row says whether
-- each side is still running (a_is_current, b_is_current) or completed (a_is_completed,
-- b_is_completed; null for a missing side A), so a running period is never read as a saving.
-- a_transfer_committed, b_transfer_committed, transfer_committed_difference: the planned
-- transfers' committed amounts, apart from the subscriptions' (D-399). a_is_overspent,
-- b_is_overspent (category rows): get_period_progress's is_overspent of that
-- side, null where the side has no row (D-391).
-- The first row (kind 'total') holds
-- the totals of each side (period_summaries) and their differences, B minus A; then one row
-- (kind 'category') per category with a progress row in A or in B, in display order. A side
-- where the category has no progress row is null (not in force there and nothing on it); a
-- side with a row gives its figures, planned null when not in force. spent_difference is B
-- minus A, a missing side counting as nothing spent; planned_difference is null unless both
-- sides plan something. The periods' dates and lengths are repeated on every row. Members.
-- Errors: budget_not_found, period_not_found (an id not of this budget), catching_up.
create or replace function public.get_period_comparison(
  p_budget_id uuid,
  p_period_a_id uuid default null,
  p_period_b_id uuid default null
)
returns table (
  kind text,
  category_id uuid, parent_id uuid, name text, is_group boolean, display_order integer,
  a_period_id uuid, a_start_date date, a_end_date date, a_days integer,
  b_period_id uuid, b_start_date date, b_end_date date, b_days integer,
  a_in_force boolean, b_in_force boolean,
  a_planned bigint, b_planned bigint, planned_difference bigint,
  a_spent bigint, b_spent bigint, spent_difference bigint,
  a_committed bigint, b_committed bigint, committed_difference bigint,
  a_transaction_count integer, b_transaction_count integer,
  a_income bigint, b_income bigint, income_difference bigint,
  a_result bigint, b_result bigint, result_difference bigint,
  a_is_current boolean, a_is_completed boolean, b_is_current boolean, b_is_completed boolean,
  a_is_overspent boolean, b_is_overspent boolean,
  a_transfer_committed bigint, b_transfer_committed bigint, transfer_committed_difference bigint
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_last integer;
  v_a public.periods;
  v_b public.periods;
  v_today date;
  v_a_current boolean;
  v_a_completed boolean;
  v_b_current boolean;
  v_b_completed boolean;
begin
  v_last := private.compare_reading_seq(p_budget_id);
  v_today := private.today();
  if p_period_b_id is null and p_period_a_id is null then
    -- the last completed period when the one before it exists too
    select p.* into v_b from public.periods as p
    where p.budget_id = p_budget_id and p.seq <= v_last and p.end_date < v_today and p.seq > 1
    order by p.seq desc limit 1;
    if v_b.id is null then
      select p.* into v_b from public.periods as p where p.budget_id = p_budget_id and p.seq = v_last;
    end if;
  elsif p_period_b_id is null then
    select p.* into v_b from public.periods as p where p.budget_id = p_budget_id and p.seq = v_last;
  else
    select p.* into v_b from public.periods as p where p.id = p_period_b_id and p.budget_id = p_budget_id;
    if v_b.id is null then
      raise exception 'period_not_found' using errcode = 'P0001';
    end if;
  end if;
  if p_period_a_id is null then
    select p.* into v_a from public.periods as p where p.budget_id = p_budget_id and p.seq = v_b.seq - 1;
  else
    select p.* into v_a from public.periods as p where p.id = p_period_a_id and p.budget_id = p_budget_id;
    if v_a.id is null then
      raise exception 'period_not_found' using errcode = 'P0001';
    end if;
  end if;
  if v_a.id is not null then
    v_a_current := v_today between v_a.start_date and v_a.end_date;
    v_a_completed := v_a.end_date < v_today;
  end if;
  v_b_current := v_today between v_b.start_date and v_b.end_date;
  v_b_completed := v_b.end_date < v_today;
  return query
    select q.* from (
    with sa as (select s.* from public.period_summaries as s where s.id = v_a.id),
    sb as (select s.* from public.period_summaries as s where s.id = v_b.id),
    ga as (select g.* from private.category_progress(p_budget_id, v_a.seq, v_a.start_date, v_a.end_date) as g where v_a.id is not null),
    gb as (select g.* from private.category_progress(p_budget_id, v_b.seq, v_b.start_date, v_b.end_date) as g),
    j as (
      select coalesce(ga.category_id, gb.category_id) as cid, ga.in_force as ai, gb.in_force as bi,
             case when ga.in_force then ga.expected end as ap, case when gb.in_force then gb.expected end as bp,
             ga.spent as asp, gb.spent as bsp, ga.committed as ac, gb.committed as bc,
             ga.transaction_count as an, gb.transaction_count as bn,
             ga.is_overspent as ao, gb.is_overspent as bo,
             ga.transfer_committed as atc, gb.transfer_committed as btc
      from ga full join gb on gb.category_id = ga.category_id
    )
    select 'total'::text as kind, null::uuid, null::uuid, null::text, null::boolean, null::integer as display_order,
           v_a.id, v_a.start_date, v_a.end_date, (v_a.end_date - v_a.start_date + 1)::integer,
           v_b.id, v_b.start_date, v_b.end_date, (v_b.end_date - v_b.start_date + 1)::integer,
           v_a.id is not null, true,
           (select sa.expected_total from sa), (select sb.expected_total from sb),
           (select sb.expected_total from sb) - (select sa.expected_total from sa),
           (select sa.spent_total from sa), (select sb.spent_total from sb),
           (select sb.spent_total from sb) - coalesce((select sa.spent_total from sa), 0),
           (select sa.committed_total from sa), (select sb.committed_total from sb),
           (select sb.committed_total from sb) - coalesce((select sa.committed_total from sa), 0),
           case when v_a.id is not null
                then (select coalesce(pg_catalog.sum(x.transaction_count), 0)::integer from ga as x where x.parent_id is null) end,
           (select coalesce(pg_catalog.sum(x.transaction_count), 0)::integer from gb as x where x.parent_id is null),
           (select sa.income_total from sa), (select sb.income_total from sb),
           (select sb.income_total from sb) - coalesce((select sa.income_total from sa), 0),
           (select sa.result from sa), (select sb.result from sb),
           (select sb.result from sb) - coalesce((select sa.result from sa), 0),
           v_a_current, v_a_completed, v_b_current, v_b_completed, null::boolean, null::boolean,
           (select sa.transfer_committed_total from sa), (select sb.transfer_committed_total from sb),
           (select sb.transfer_committed_total from sb) - coalesce((select sa.transfer_committed_total from sa), 0)
    union all
    select * from (
      select 'category'::text, c.id, c.parent_id, c.name, c.is_group, o.display_order,
             v_a.id, v_a.start_date, v_a.end_date, (v_a.end_date - v_a.start_date + 1)::integer,
             v_b.id, v_b.start_date, v_b.end_date, (v_b.end_date - v_b.start_date + 1)::integer,
             coalesce(j.ai, false), coalesce(j.bi, false),
             j.ap, j.bp, j.bp - j.ap,
             j.asp, j.bsp, (coalesce(j.bsp, 0) - coalesce(j.asp, 0))::bigint,
             j.ac, j.bc, (coalesce(j.bc, 0) - coalesce(j.ac, 0))::bigint,
             j.an, j.bn,
             null::bigint, null::bigint, null::bigint, null::bigint, null::bigint, null::bigint,
             v_a_current, v_a_completed, v_b_current, v_b_completed, j.ao, j.bo,
             j.atc, j.btc, (coalesce(j.btc, 0) - coalesce(j.atc, 0))::bigint
      from j
      join public.categories as c on c.id = j.cid
      join private.category_display_order(p_budget_id) as o on o.category_id = c.id
    ) as cats
    ) as q
    order by (q.kind = 'total') desc, q.display_order;
end;
$$;

-- ===========================================================================
-- Privileges: nothing executable by default; the three reads for signed-in users
-- ===========================================================================
revoke all on function
  private.limit_compare_periods(),
  private.compare_reading_seq(uuid),
  private.category_display_order(uuid),
  private.compare_average(numeric, integer),
  public.get_period_trend(uuid, integer),
  public.get_category_trend(uuid, integer),
  public.get_period_comparison(uuid, uuid, uuid),
  public.list_periods(uuid, integer, integer),
  public.preview_reopen(uuid)
from public, anon, authenticated;

grant execute on function
  public.get_period_trend(uuid, integer),
  public.get_category_trend(uuid, integer),
  public.get_period_comparison(uuid, uuid, uuid),
  public.list_periods(uuid, integer, integer),
  public.preview_reopen(uuid)
to authenticated;
