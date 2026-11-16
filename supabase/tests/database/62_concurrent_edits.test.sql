-- Concurrent edits (step 3): two members save the same record at the same time; the second
-- save waits for the first, then is refused with record_changed. Also step 3 writes racing
-- each other get contract errors. Like 60_concurrency.test.sql, this test opens its own
-- connections with dblink, commits throwaway users and budgets, and deletes them at the end
-- (and at the start, should an earlier run have failed half-way).
begin;
select plan(21);

create extension if not exists dblink with schema extensions;

create or replace function pg_temp.conn() returns text language sql as $$
  select format('host=%s port=%s dbname=postgres user=postgres password=postgres',
                host(inet_server_addr()), inet_server_port())
$$;
select extensions.dblink_connect(c, pg_temp.conn()) from unnest(array['setup', 'one', 'two']) as c;
select extensions.dblink_exec('setup', $$delete from auth.users where email like 'edit+%@test.local'$$);

create or replace function pg_temp.mkuser(tag text) returns uuid language plpgsql as $$
declare
  id uuid := extensions.gen_random_uuid();
begin
  perform extensions.dblink_exec('setup', 'reset role');
  perform extensions.dblink_exec('setup', format($q$
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                            raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values ('00000000-0000-0000-0000-000000000000', %1$L, 'authenticated', 'authenticated',
            'edit+' || %2$L || '+' || %1$L || '@test.local', '', now(), '{}', '{}', now(), now())$q$,
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
  perform 1 from extensions.dblink_get_result(c, false) as t (v text);
  return v;
end;
$$;
-- Session one runs sql_one in an open transaction; session two then sends sql_two, which must
-- wait; one commits; returns two's outcome (and whether it waited, as 'waited: ' prefix).
create or replace function pg_temp.race(sql_one text, sql_two text) returns text language plpgsql as $$
declare
  v_busy integer;
begin
  perform extensions.dblink_exec('one', 'begin');
  perform pg_temp.q('one', sql_one);
  v_busy := pg_temp.send_and_wait('two', sql_two);
  perform extensions.dblink_exec('one', 'commit');
  return case when v_busy = 1 then 'waited, then ' else 'did not wait, then ' end || pg_temp.result('two');
end;
$$;

create temp table ids (name text primary key, id uuid) on commit drop;
create or replace function pg_temp.id(n text) returns uuid language sql as $$ select id from ids where name = n $$;
-- read a value as postgres on the setup connection (committed state)
create or replace function pg_temp.read(sql text) returns text language plpgsql as $$
begin
  perform extensions.dblink_exec('setup', 'reset role');
  return pg_temp.q('setup', sql);
end;
$$;

-- ===========================================================================
-- Setup: a budget with two members, a category and a transaction (committed)
-- ===========================================================================
insert into ids values ('alice', pg_temp.mkuser('alice')), ('bob', pg_temp.mkuser('bob'));
select pg_temp.act_as('setup', pg_temp.id('alice'));
insert into ids values ('budget', pg_temp.q('setup', $$
  select public.create_budget('Edits', 'Salary', 500000, 25, 'nearest',
                              (date_trunc('month', private.today()) - interval '2 months')::date)::text$$)::uuid);
insert into ids values ('inv', pg_temp.q('setup', format('select public.invite_member(%L, %L)::text', pg_temp.id('budget'),
  (select email from auth.users where id = pg_temp.id('bob'))))::uuid);
select pg_temp.act_as('setup', pg_temp.id('bob'));
select pg_temp.q('setup', format('select public.accept_invitation(%L)::text', pg_temp.id('inv')));
select pg_temp.act_as('setup', pg_temp.id('alice'));
insert into ids values
  ('income', (pg_temp.read(format('select primary_income_id::text from public.budgets where id = %L', pg_temp.id('budget'))))::uuid);
select pg_temp.act_as('setup', pg_temp.id('alice'));
insert into ids values ('food', pg_temp.q('setup', format($$select id::text from public.create_category(%L, 'Food', p_amount => 1000)$$, pg_temp.id('budget')))::uuid);
insert into ids values ('tx', pg_temp.q('setup', format($$select id::text from public.add_transaction(%L, 'expense', 100, private.today(), %L)$$,
  pg_temp.id('budget'), pg_temp.id('food')))::uuid);
select extensions.dblink_exec('setup', 'reset role');
select is(pg_temp.read(format('select revision::text from public.transactions where id = %L', pg_temp.id('tx'))), '1', 'setup: a committed transaction at revision 1');
select pg_temp.act_as('one', pg_temp.id('alice'));
select pg_temp.act_as('two', pg_temp.id('bob'));

-- ===========================================================================
-- The same record, saved twice from the same revision
-- ===========================================================================
select is(
  pg_temp.race(
    format($$select revision::text from public.update_transaction(%L, 1, 'expense', 200, private.today(), %L)$$, pg_temp.id('tx'), pg_temp.id('food')),
    format($$select revision::text from public.update_transaction(%L, 1, 'expense', 300, private.today(), %L)$$, pg_temp.id('tx'), pg_temp.id('food'))),
  'waited, then error: record_changed',
  'R-CONCURRENCY-070 R-SECURITY-007: two members edit the same transaction: the second save waits, then is refused'
);
select is(pg_temp.read(format('select amount::text from public.transactions where id = %L', pg_temp.id('tx'))), '200',
  'R-CONCURRENCY-070: the first save is kept, not silently overwritten');

select is(
  pg_temp.race(
    format('select public.delete_transaction(%L, 2)::text', pg_temp.id('tx')),
    format($$select revision::text from public.update_transaction(%L, 2, 'expense', 300, private.today(), %L)$$, pg_temp.id('tx'), pg_temp.id('food'))),
  'waited, then error: transaction_not_found',
  'R-CONCURRENCY-070 R-SECURITY-007: editing a transaction another member is deleting: a contract error'
);

select pg_temp.act_as('setup', pg_temp.id('alice'));
select is(
  pg_temp.race(
    format('select revision::text from public.update_category(%L, 1, p_amount => 2000)', pg_temp.id('food')),
    format('select revision::text from public.update_category(%L, 1, p_amount => 3000)', pg_temp.id('food'))),
  'waited, then error: record_changed',
  'R-CONCURRENCY-070: two members change the same expectation: the second is refused'
);
select is(pg_temp.read(format('select amount::text from public.category_overview where id = %L', pg_temp.id('food'))), '2000',
  'R-CONCURRENCY-070: the first expectation is kept');
select is(
  pg_temp.race(
    format('select revision::text from public.update_category(%L, 2, %L)', pg_temp.id('food'), 'Groceries'),
    format('select public.end_category(%L, 2)', pg_temp.id('food'))),
  'waited, then error: record_changed',
  'R-CONCURRENCY-070: removing a category another member is renaming is refused'
);

select is(
  pg_temp.race(
    format($$select public.update_income_terms(%L, 510000, 25, 'nearest', null, 1)::text$$, pg_temp.id('income')),
    format($$select public.update_income_terms(%L, 520000, 25, 'nearest', null, 1)::text$$, pg_temp.id('income'))),
  'waited, then error: record_changed',
  'R-CONCURRENCY-070: two members change the same income: the second is refused'
);
select is(pg_temp.read(format('select amount::text from public.income_overview where id = %L', pg_temp.id('income'))), '510000',
  'R-CONCURRENCY-070: the first change of terms is kept');
select is(
  pg_temp.race(
    format('select public.rename_income(%L, %L, 2)::text', pg_temp.id('income'), 'Pay'),
    format('select public.rename_income(%L, %L, 2)::text', pg_temp.id('income'), 'Wage')),
  'waited, then error: record_changed',
  'R-CONCURRENCY-070: two members rename the same income: the second is refused'
);
select is(
  pg_temp.race(
    format('select public.rename_budget(%L, %L, 1)::text', pg_temp.id('budget'), 'Ours'),
    format('select public.rename_budget(%L, %L, 1)::text', pg_temp.id('budget'), 'Mine')),
  'waited, then error: record_changed',
  'R-CONCURRENCY-070: two members rename the budget: the second is refused'
);
select is(pg_temp.read(format('select name from public.budgets where id = %L', pg_temp.id('budget'))), 'Ours',
  'R-CONCURRENCY-070: the first name is kept');

-- Without the revision (step 2 callers of the previous release) the last write still wins.
select is(
  pg_temp.race(
    format($$select public.update_income_terms(%L, 530000, 25, 'nearest')::text$$, pg_temp.id('income')),
    format($$select public.update_income_terms(%L, 540000, 25, 'nearest')::text$$, pg_temp.id('income'))),
  'waited, then ',
  'R-CONCURRENCY-090: a step 2 caller that sends no revision is not checked (until it is required, D-142)'
);

-- ===========================================================================
-- Step 3 writes racing each other get contract errors
-- ===========================================================================
select pg_temp.act_as('setup', pg_temp.id('alice'));
insert into ids values ('brief', pg_temp.q('setup', format($$select id::text from public.create_category(%L, 'Brief')$$, pg_temp.id('budget')))::uuid);
insert into ids values ('home', pg_temp.q('setup', format($$select id::text from public.create_category(%L, 'Home', p_amount => 500)$$, pg_temp.id('budget')))::uuid);
select is(
  pg_temp.race(
    format('select public.end_category(%L, 1)', pg_temp.id('brief')),
    format($$select id::text from public.add_transaction(%L, 'expense', 1, private.today(), %L)$$, pg_temp.id('budget'), pg_temp.id('brief'))),
  'waited, then error: category_not_found',
  'R-SECURITY-007: a transaction on a category another member is deleting gets category_not_found'
);
select is(
  pg_temp.race(
    format($$select id::text from public.create_category(%L, 'Repairs', %L, p_other_name => 'Other')$$, pg_temp.id('budget'), pg_temp.id('home')),
    format($$select id::text from public.add_transaction(%L, 'expense', 1, private.today(), %L)$$, pg_temp.id('budget'), pg_temp.id('home'))),
  'waited, then error: category_is_group',
  'R-SECURITY-007 R-TRANSACTION-072: a transaction on a category that another member is splitting gets category_is_group'
);
select is(
  pg_temp.read(format($$select count(*)::text from public.transactions as t join public.categories as c on c.id = t.category_id
                       where c.budget_id = %L and c.is_group$$, pg_temp.id('budget'))),
  '0', 'R-TRANSACTION-072: so no transaction is on a group');

-- Two members adding transactions at once both succeed (one waits for the other).
select is(
  pg_temp.race(
    format($$select id::text from public.add_transaction(%L, 'extra_income', 1, private.today())$$, pg_temp.id('budget')),
    format($$select 'added' from public.add_transaction(%L, 'extra_income', 2, private.today())$$, pg_temp.id('budget'))),
  'waited, then added',
  'R-SECURITY-007: two members recording transactions at once: both are recorded'
);
select is(
  pg_temp.read(format($$select count(*)::text from public.transactions where budget_id = %L and kind = 'extra_income'$$, pg_temp.id('budget'))),
  '2', 'R-SECURITY-007: two extra incomes');

-- Reads never wait for a writer.
select extensions.dblink_exec('one', 'begin');
select pg_temp.q('one', format($$select id::text from public.add_transaction(%L, 'extra_income', 3, private.today())$$, pg_temp.id('budget')));
select is(
  pg_temp.send_and_wait('two', format('select count(*)::text from public.get_period_progress((select id from public.periods where budget_id = %L order by seq desc limit 1))', pg_temp.id('budget'))),
  0, 'R-SECURITY-006: reading the progress does not wait for a member recording a transaction');
select isnt(pg_temp.result('two'), null, 'R-SECURITY-006: and answers');
select extensions.dblink_exec('one', 'rollback');

select is(pg_temp.read(format('select count(*)::text from tests.period_violations(%L)', pg_temp.id('budget'))), '0',
  'R-TRANSACTION-093 R-PERIOD-005: and every invariant holds');

-- Clean up what was committed.
select extensions.dblink_exec('setup', 'reset role');
select extensions.dblink_exec('setup', $$delete from auth.users where email like 'edit+%@test.local'$$);
select extensions.dblink_disconnect(c) from unnest(array['setup', 'one', 'two']) as c;

select * from finish();
rollback;
