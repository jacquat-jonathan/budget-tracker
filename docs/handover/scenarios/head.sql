-- review-db6 scenario head (three kinds; no keys): a member (role authenticated, public API only); everything rolled back.
\set ON_ERROR_STOP off
\set ON_ERROR_ROLLBACK on
\pset pager off
begin;
\o /dev/null
select tests.create_user('rq_ann', 'Ann');
select tests.create_user('rq_bob', 'Bob');
\o
create function pg_temp.setup(k text, p_day integer, p_start date default '2026-09-01', p_rule public.weekend_rule default 'none') returns void language plpgsql as $$
declare
  b uuid := public.create_budget('Budget ' || k, 'Salary', 600000, p_day, p_rule, p_start);
  p1 uuid;
begin
  select id into p1 from public.periods where budget_id = b and seq = 1;
  perform tests.remember(k, b);
  perform tests.remember(k || '_p1', p1);
  perform tests.remember(k || '_sal', (select primary_income_id from public.my_budgets where id = b));
  perform tests.remember(k || '_main', (select id from public.create_account(b, 'Main', 'current', p_from_period_id => p1)));
  perform tests.remember(k || '_sav', (select id from public.create_account(b, 'Savings', 'savings', p_from_period_id => p1)));
  perform tests.remember(k || '_cat', (select id from public.create_category(b, 'Saving', p_amount => 100000, p_from_period_id => p1)));
end $$;
create function pg_temp.day(d date, who text default 'rq_ann') returns void language plpgsql as $$
begin
  perform tests.clear_authentication(); perform tests.set_today(d); perform tests.authenticate_as(who);
end $$;
create function pg_temp.cur(k text) returns public.periods language sql as $$
  select p.* from public.periods as p where p.budget_id = tests.id(k) and (select public.get_today()) between p.start_date and p.end_date $$;
create function pg_temp.per(k text, s integer) returns public.periods language sql as $$
  select p.* from public.periods as p where p.budget_id = tests.id(k) and p.seq = s $$;
-- every period with the checklist rows of one transfer (or all)
create function pg_temp.see(k text, t uuid default null) returns table (seq integer, period text, checklist text) language sql as $$
  select s.seq, s.start_date || '..' || s.end_date,
         coalesce((select string_agg(case when t is null then c.name || ': ' else '' end || '[' || c.occurrence_kind || ' ' || coalesce(c.occurrence_date::text, '#' || c.occurrence_seq) || ']'
                                     || ' due ' || coalesce(c.due_date::text, '-') || ' ' || c.status
                                     || case when c.planned then '' else ' (planned=false)' end || case when c.is_ended then ' (ended)' else '' end
                                     || case when c.follows_primary then ' (follows primary)' else '' end || case when c.assumed then ' (assumed)' else '' end
                                     || coalesce(' income ' || c.income_name, '')
                                     || coalesce(' done_on ' || c.done_on, '') || case when c.transaction_id is not null then ' tx' else '' end, E'\n'
                                     order by coalesce(c.due_date, c.occurrence_date), c.occurrence_seq, c.name)
                   from public.get_transfer_checklist(s.id) as c where t is null or c.transfer_id = t), '(no row)')
  from public.period_summaries as s where s.budget_id = tests.id(k)
  order by s.seq $$;
create function pg_temp.tx(t uuid) returns table (date date, amount bigint, description text, okind text, odate date, oseq integer) language sql as $$
  select x.date, x.amount, x.description, x.transfer_occurrence_kind::text, x.transfer_occurrence_date, x.transfer_occurrence_seq
  from public.transaction_list as x where x.transfer_id = t order by x.date $$;
create function pg_temp.marks(t uuid) returns table (kind text, odate date, oseq integer, mark public.transfer_mark, by_catch_up boolean, done_on date, tx_date date, tx_rev integer) language sql security definer as $$
  select o.kind::text, o.occurrence_date, o.occurrence_seq, o.mark, o.by_catch_up, o.done_on,
         (select x.date from public.transactions x where x.transfer_occurrence_id = o.id), (select x.revision from public.transactions x where x.transfer_occurrence_id = o.id)
  from public.transfer_occurrences as o where o.transfer_id = t order by coalesce(o.occurrence_date, o.done_on), 1 $$;
create function pg_temp.rev(tbl text, i uuid) returns integer language plpgsql as $$
declare r integer; begin execute format('select revision from public.%I where id = $1', tbl) into r using i; return r; end $$;
create function pg_temp.tk(t uuid) returns table (starts_on date, starts_seq integer, first_seq integer, end_seq integer, gone_seq integer, gone_on date) language sql security definer as $$
  select t.starts_on, t.starts_seq, t.first_seq, t.end_seq, t.income_gone_seq, t.income_gone_on from public.transfers as t where t.id = $1 $$;
create function pg_temp.vers(t uuid) returns table (from_seq integer, amount bigint, schedule public.transfer_schedule, income text, income_gone boolean, offset_days integer, dom integer, anchor date, wrule text, auto boolean, linked boolean) language sql security definer as $$
  select v.effective_from_seq, v.amount, v.schedule, (select i.name from public.incomes i where i.id = v.income_id), v.income_gone, v.offset_days, v.day_of_month, v.anchor_date, v.weekend_rule::text, v.is_automatic, v.category_id is not null
  from public.transfer_versions as v where v.transfer_id = t order by 1 $$;
create function pg_temp.nd(k text) returns table (name text, next_due_date date) language sql as $$
  select name, next_due_date from public.transfer_overview where budget_id = tests.id(k) order by name $$;
