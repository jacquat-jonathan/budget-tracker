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
  perform private.ensure_periods(p_budget_id, private.limit_catch_up_periods());
  if not private.caught_up(p_budget_id) then
    raise exception 'catching_up' using errcode = 'P0001';
  end if;
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

-- R-COMPARE-172, D-261: an average over n periods, to the rappen, halves away from zero (null
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
  completed_count integer, average_income bigint, average_spent bigint, average_result bigint
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
             s.committed_total, s.result
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
           private.compare_average(a.result, a.n)
    from r cross join a
    order by r.seq;
end;
$$;

-- ===========================================================================
-- R-COMPARE-070, R-COMPARE-170, R-COMPARE-172, R-COMPARE-174: spending per category across
-- the same periods
-- ===========================================================================

-- One row per category line and period of the range (the range of get_period_trend with the
-- same p_count): every category, group or subcategory that has a progress row
-- (get_period_progress) in some period of the range, in every period of the range. A line is
-- the category's id, under its current name and place. In a period: the figures of its
-- progress row (spent: expenses minus refunds; planned: the expectation's monthly share, null
-- when the category is not in force there; committed: subscriptions' monthly costs); a period
-- where it has no progress row: not in force, planned null, spent 0, committed 0. The rows of
-- top-level lines (parent_id null) of a period add up to that period's spent_total, and so do
-- its leaves (is_group false). average_spent: over the completed periods of the range, as in
-- get_period_trend (null when none is completed). Members. Errors: as get_period_trend.
create or replace function public.get_category_trend(p_budget_id uuid, p_count integer default 12)
returns table (
  category_id uuid, parent_id uuid, name text, is_group boolean, display_order integer,
  period_id uuid, seq integer, start_date date, end_date date, days integer,
  is_current boolean, is_completed boolean,
  in_force boolean, planned bigint, spent bigint, committed bigint, transaction_count integer,
  completed_count integer, average_spent bigint
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
    rows_ as (
      select ps.id as pid, g.*
      from ps cross join lateral private.category_progress(p_budget_id, ps.seq, ps.start_date, ps.end_date) as g
    ),
    lines as (select distinct x.category_id from rows_ as x),
    n as (select pg_catalog.count(*)::integer as n from ps where ps.end_date < v_today),
    grid as (
      select l.category_id, ps.id as pid, ps.seq, ps.start_date, ps.end_date,
             x.in_force, x.expected, x.spent, x.committed, x.transaction_count
      from lines as l cross join ps
      left join rows_ as x on x.category_id = l.category_id and x.pid = ps.id
    ),
    avgs as (
      select g.category_id, pg_catalog.sum(coalesce(g.spent, 0)) filter (where g.end_date < v_today) as s
      from grid as g group by g.category_id
    )
    select c.id, c.parent_id, c.name, c.is_group, o.display_order,
           g.pid, g.seq, g.start_date, g.end_date, (g.end_date - g.start_date + 1)::integer,
           (v_today between g.start_date and g.end_date), (g.end_date < v_today),
           coalesce(g.in_force, false),
           case when g.in_force then g.expected end,
           coalesce(g.spent, 0)::bigint, coalesce(g.committed, 0)::bigint, coalesce(g.transaction_count, 0),
           n.n, private.compare_average(coalesce(a.s, 0), n.n)
    from grid as g
    join public.categories as c on c.id = g.category_id
    join private.category_display_order(p_budget_id) as o on o.category_id = c.id
    join avgs as a on a.category_id = g.category_id
    cross join n
    order by o.display_order, g.seq;
end;
$$;

-- ===========================================================================
-- R-COMPARE-071, R-COMPARE-173, R-COMPARE-174: two periods side by side
-- ===========================================================================

-- Periods A and B of the budget (default: B the current period, or the last once the budget
-- has ended; A the one before B, none when B is the first). The first row (kind 'total') holds
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
  a_result bigint, b_result bigint, result_difference bigint
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
begin
  v_last := private.compare_reading_seq(p_budget_id);
  if p_period_b_id is null then
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
             ga.transaction_count as an, gb.transaction_count as bn
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
           (select pg_catalog.sum(x.transaction_count)::integer from ga as x where x.parent_id is null),
           (select coalesce(pg_catalog.sum(x.transaction_count), 0)::integer from gb as x where x.parent_id is null),
           (select sa.income_total from sa), (select sb.income_total from sb),
           (select sb.income_total from sb) - coalesce((select sa.income_total from sa), 0),
           (select sa.result from sa), (select sb.result from sb),
           (select sb.result from sb) - coalesce((select sa.result from sa), 0)
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
             null::bigint, null::bigint, null::bigint, null::bigint, null::bigint, null::bigint
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
  public.get_period_comparison(uuid, uuid, uuid)
from public, anon, authenticated;

grant execute on function
  public.get_period_trend(uuid, integer),
  public.get_category_trend(uuid, integer),
  public.get_period_comparison(uuid, uuid, uuid)
to authenticated;
