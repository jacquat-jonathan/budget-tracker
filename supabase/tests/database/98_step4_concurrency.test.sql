-- Step 4 under real concurrency: charges and interest are created exactly once when two
-- members open the budget at the same moment, and racing confirmations, adjustments and
-- early salaries get contract errors. Like 60_concurrency, this test opens its own
-- connections with dblink, commits throwaway users and budgets, and deletes them at the end
-- (and at the start, should an earlier run have failed half-way).
begin;
select plan(18);

create extension if not exists dblink with schema extensions;

create or replace function pg_temp.conn() returns text language sql as $$
  select format('host=%s port=%s dbname=postgres user=postgres password=postgres',
                host(inet_server_addr()), inet_server_port())
$$;

select extensions.dblink_connect(c, pg_temp.conn()) from unnest(array['setup', 'one', 'two']) as c;
select extensions.dblink_exec('setup', $$delete from auth.users where email like 'race4+%@test.local'$$);

create or replace function pg_temp.mkuser(tag text) returns uuid language plpgsql as $$
declare
  id uuid := extensions.gen_random_uuid();
begin
  perform extensions.dblink_exec('setup', 'reset role');
  perform extensions.dblink_exec('setup', format($q$
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                            raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values ('00000000-0000-0000-0000-000000000000', %1$L, 'authenticated', 'authenticated',
            'race4+' || %2$L || '+' || %1$L || '@test.local', '', now(), '{}', '{}', now(), now())$q$,
    id, tag));
  return id;
end;
$$;

create or replace function pg_temp.act_as(c text, user_id uuid) returns void language plpgsql as $$
begin
  perform extensions.dblink_exec(c, 'reset role');
  perform extensions.dblink_exec(c, format('set request.jwt.claims to %L; set role authenticated',
    json_build_object('sub', user_id, 'role', 'authenticated')));
end;
$$;

create or replace function pg_temp.q(c text, sql text) returns text language sql as $$
  select v from extensions.dblink(c, sql) as t (v text)
$$;

create or replace function pg_temp.send_and_wait(c text, sql text) returns integer language plpgsql as $$
begin
  perform extensions.dblink_send_query(c, sql);
  perform pg_sleep(0.5);
  return extensions.dblink_is_busy(c);
end;
$$;

create or replace function pg_temp.result(c text) returns text language plpgsql as $$
declare
  v text;
begin
  for i in 1..100 loop
    exit when extensions.dblink_is_busy(c) = 0;
    perform pg_sleep(0.1);
  end loop;
  if extensions.dblink_is_busy(c) = 1 then
    perform extensions.dblink_cancel_query(c);
    perform 1 from extensions.dblink_get_result(c, false) as t (v text);
    perform 1 from extensions.dblink_get_result(c, false) as t (v text);
    return 'timeout';
  end if;
  begin
    select t.v into v from extensions.dblink_get_result(c) as t (v text);
  exception when others then
    v := 'error: ' || sqlerrm;
  end;
  perform 1 from extensions.dblink_get_result(c, false) as t (v text);  -- drain
  return v;
end;
$$;

create temp table ids (name text primary key, id uuid) on commit drop;
create or replace function pg_temp.id(n text) returns uuid language sql as $$ select id from ids where name = n $$;

-- ===========================================================================
-- Setup: a budget six months old with a subscription and a debt from its first period,
-- cut back to its first period with nothing charged yet (as after a long absence).
-- ===========================================================================
insert into ids values ('owner', pg_temp.mkuser('owner')), ('member', pg_temp.mkuser('member'));
select pg_temp.act_as('setup', pg_temp.id('owner'));
insert into ids values ('budget', pg_temp.q('setup', $$
  select public.create_budget('Race4', 'Salary', 600000, 1, 'nearest',
                              (date_trunc('month', private.today()) - interval '6 months')::date)::text$$)::uuid);
insert into ids values ('p1', pg_temp.q('setup', format('select id::text from public.periods where budget_id = %L and seq = 1', pg_temp.id('budget')))::uuid);
insert into ids values ('cat', pg_temp.q('setup', format($$select id::text from public.create_category(%L, 'Bills', p_from_period_id => %L)$$,
                                                          pg_temp.id('budget'), pg_temp.id('p1')))::uuid);
insert into ids values ('sub', pg_temp.q('setup', format($$select id::text from public.create_subscription(%L, 'Phone', 2500, 'monthly', %L,
                                                            (select start_date + 3 from public.periods where id = %L), %L)$$,
                                                          pg_temp.id('budget'), pg_temp.id('cat'), pg_temp.id('p1'), pg_temp.id('p1')))::uuid);
insert into ids values ('debt', pg_temp.q('setup', format($$select id::text from public.create_debt(%L, 'Loan', 1000000, %L, 20000, 6, %L)$$,
                                                           pg_temp.id('budget'), pg_temp.id('cat'), pg_temp.id('p1')))::uuid);
insert into ids values ('inv', pg_temp.q('setup', format('select public.invite_member(%L, %L)::text',
                                 pg_temp.id('budget'), (select email from auth.users where id = pg_temp.id('member'))))::uuid);
select pg_temp.act_as('setup', pg_temp.id('member'));
select pg_temp.q('setup', format('select public.accept_invitation(%L)::text', pg_temp.id('inv')));
select extensions.dblink_exec('setup', 'reset role');
create temp table expected (charges integer, periods integer) on commit drop;
insert into expected select
  pg_temp.q('setup', format('select count(*)::text from public.transactions where subscription_id = %L', pg_temp.id('sub')))::integer,
  pg_temp.q('setup', format('select count(*)::text from public.periods where budget_id = %L', pg_temp.id('budget')))::integer;
select extensions.dblink_exec('setup', format($$
  begin;
  set local session_replication_role = replica;
  delete from public.transactions where budget_id = %1$L;
  delete from public.debt_interest where budget_id = %1$L;
  delete from public.periods where budget_id = %1$L and seq > 1;
  update public.subscriptions set charged_through = (select start_date - 1 from public.periods where id = %2$L),
    next_due = (select start_date from public.periods where id = %2$L) where id = %3$L;
  commit$$, pg_temp.id('budget'), pg_temp.id('p1'), pg_temp.id('sub')));
select ok((select charges >= 5 and periods >= 6 from expected), 'setup: six periods and their charges are due');

-- ===========================================================================
-- Two members open the budget at the same moment (R-SUBSCRIPTION-111, R-DEBT-111)
-- ===========================================================================
select pg_temp.act_as('one', pg_temp.id('owner'));
select pg_temp.act_as('two', pg_temp.id('member'));
select extensions.dblink_exec('one', 'begin');
create temp table first_result on commit drop as
  select pg_temp.q('one', format('select public.ensure_periods(%L)::text', pg_temp.id('budget')))::integer as created;
select is(
  pg_temp.send_and_wait('two', format('select count(*)::text from public.get_current_period(%L)', pg_temp.id('budget'))),
  1,
  'R-SUBSCRIPTION-111: the second member waits for the first catch-up instead of charging alongside it'
);
select extensions.dblink_exec('one', 'commit');
select is(pg_temp.result('two'), '1', 'R-SUBSCRIPTION-111: and then reads the current period');
select is((select created from first_result), (select periods - 1 from expected), 'R-PERIOD-009: the first created the missing periods');
select is(pg_temp.q('setup', format('select count(*)::text from public.transactions where subscription_id = %L', pg_temp.id('sub')))::integer,
          (select charges from expected),
  'R-SUBSCRIPTION-073 R-SUBSCRIPTION-111: every due charge exists exactly once');
select is(pg_temp.q('setup', format('select count(*)::text from (select 1 from public.transactions where subscription_id = %L group by charge_date having count(*) > 1) as d',
                                    pg_temp.id('sub'))), '0',
  'R-SUBSCRIPTION-111: none twice');
select is(pg_temp.q('setup', format('select count(*)::text from public.debt_interest where debt_id = %L', pg_temp.id('debt')))::integer,
          (select periods - 1 from expected),
  'R-DEBT-111: one interest entry per period created, however many members opened the budget');
select is(pg_temp.q('setup', format('select count(*)::text from tests.step4_violations(%L)', pg_temp.id('budget'))), '0',
  'R-DEBT-003 R-SUBSCRIPTION-079: the step 4 invariants hold after the race');

-- ===========================================================================
-- Two members confirm the same charge, both from the revision they read (R-CONCURRENCY-070)
-- ===========================================================================
insert into ids values ('charge', pg_temp.q('setup', format('select id::text from public.transactions where subscription_id = %L order by date limit 1',
                                                             pg_temp.id('sub')))::uuid);
select pg_temp.act_as('one', pg_temp.id('owner'));
select pg_temp.act_as('two', pg_temp.id('member'));
select extensions.dblink_exec('one', 'begin');
select pg_temp.q('one', format('select review_state from public.confirm_subscription_charge(%L, 1)', pg_temp.id('charge')));
select is(pg_temp.send_and_wait('two', format('select public.dismiss_subscription_charge(%L, 1)::text', pg_temp.id('charge'))), 1,
  'R-CONCURRENCY-070: a member saying "did not go through" waits while another confirms');
select extensions.dblink_exec('one', 'commit');
select is(pg_temp.result('two'), 'error: record_changed', 'R-CONCURRENCY-070: and is told the charge changed');
select is(pg_temp.q('setup', format('select review_state from public.transactions where id = %L', pg_temp.id('charge'))), 'confirmed',
  'R-SUBSCRIPTION-075: the charge stays, confirmed');

-- ===========================================================================
-- Two members adjust the same debt at once (R-DEBT-075, R-CONCURRENCY-070)
-- ===========================================================================
create temp table debt_rev (rev integer) on commit drop;
insert into debt_rev select pg_temp.q('setup', format('select revision::text from public.debts where id = %L', pg_temp.id('debt')))::integer;
select extensions.dblink_exec('one', 'begin');
select pg_temp.q('one', format('select remaining::text from public.adjust_debt_balance(%L, %s, 900000)', pg_temp.id('debt'), (select rev from debt_rev)));
select is(pg_temp.send_and_wait('two', format('select remaining::text from public.adjust_debt_balance(%L, %s, 800000)', pg_temp.id('debt'), (select rev from debt_rev))), 1,
  'R-CONCURRENCY-070: a second adjustment waits for the first');
select extensions.dblink_exec('one', 'commit');
select is(pg_temp.result('two'), 'error: record_changed', 'R-CONCURRENCY-070: and is refused');
select is(pg_temp.q('setup', format('select remaining::text from public.debt_overview where id = %L', pg_temp.id('debt'))), '900000',
  'R-DEBT-075: the remaining amount is the one the first member entered');

-- ===========================================================================
-- Two members reopen the period at once, then the salary is recorded again: the merged
-- period's interest goes once and comes back once (R-DEBT-111, R-DEBT-113)
-- ===========================================================================
create temp table cur (id uuid, revision integer, start_date date) on commit drop;
insert into cur select (string_to_array(v, ','))[1]::uuid, (string_to_array(v, ','))[2]::integer, (string_to_array(v, ','))[3]::date
from (select pg_temp.q('setup', format($$select id || ',' || revision || ',' || start_date from public.periods
                                         where budget_id = %L and private.today() between start_date and end_date$$, pg_temp.id('budget'))) as v) as x;
select extensions.dblink_exec('one', 'begin');
select pg_temp.q('one', format('select seq::text from public.reopen_previous_period(%L, %L, %s, private.today() + 1)',
                               pg_temp.id('budget'), (select id from cur), (select revision from cur)));
select is(pg_temp.send_and_wait('two', format('select seq::text from public.reopen_previous_period(%L, %L, %s, private.today() + 1)',
                                              pg_temp.id('budget'), (select id from cur), (select revision from cur))), 1,
  'R-CONCURRENCY-100: a second reopen waits for the first');
select extensions.dblink_exec('one', 'commit');
select is(pg_temp.result('two'), 'error: record_changed', 'R-CONCURRENCY-100: and is refused, so one period is merged');
select is(pg_temp.q('setup', format('select count(*)::text from public.debt_interest where debt_id = %L', pg_temp.id('debt')))::integer,
          (select periods - 2 from expected),
  'R-DEBT-113: the merged period''s interest is removed once');
select pg_temp.act_as('setup', pg_temp.id('owner'));
select pg_temp.q('setup', format($$select seq::text from public.record_early_pay_date(%1$L,
    (select id from public.periods where budget_id = %1$L and private.today() between start_date and end_date),
    (select revision from public.periods where budget_id = %1$L and private.today() between start_date and end_date), %2$L)$$,
  pg_temp.id('budget'), (select start_date from cur)));
select extensions.dblink_exec('setup', 'reset role');
select is(pg_temp.q('setup', format('select count(*)::text from public.debt_interest where debt_id = %L', pg_temp.id('debt')))::integer,
          (select periods - 1 from expected),
  'R-DEBT-111: recording the salary again applies the period''s interest once');

-- Clean up what was committed.
select extensions.dblink_exec('setup', 'reset role');
select extensions.dblink_exec('setup', $$delete from auth.users where email like 'race4+%@test.local'$$);
select extensions.dblink_disconnect(c) from unnest(array['setup', 'one', 'two']) as c;

select * from finish();
rollback;
