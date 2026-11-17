-- Database fix round 4, should-fix 3: two behaviours earlier rounds called untestable, each with two
-- sessions (dblink, as 97h): a client id replayed behind the owner's removal of that member
-- answers budget_not_found, never the stored row (membership is checked again once the lock is
-- held, D-390: an access property); and preview_reopen behind a member's write waits for it and
-- then previews what it left, the transfer's transaction removed included (the preview takes the
-- budget lock before it reads, D-432). Like 97h, this test commits throwaway users and budgets and
-- deletes them at the end (its assertions run on its own rows).
begin;
select plan(6);
create extension if not exists dblink with schema extensions;

create or replace function pg_temp.conn() returns text language sql as $$
  select format('host=%s port=%s dbname=postgres user=postgres password=postgres',
                host(inet_server_addr()), inet_server_port())
$$;
select extensions.dblink_connect(c, pg_temp.conn()) from unnest(array['setup', 'one', 'two']) as c;
select extensions.dblink_exec(c, $$set statement_timeout = '60s'$$) from unnest(array['setup', 'one', 'two']) as c;
select extensions.dblink_exec('setup', $$delete from auth.users where email like 'race97l+%@test.local'$$);

create or replace function pg_temp.mkuser(tag text) returns uuid language plpgsql as $$
declare
  id uuid := extensions.gen_random_uuid();
begin
  perform extensions.dblink_exec('setup', 'reset role');
  perform extensions.dblink_exec('setup', format($q$
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                            raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values ('00000000-0000-0000-0000-000000000000', %1$L, 'authenticated', 'authenticated',
            'race97l+' || %2$L || '+' || %1$L || '@test.local', '', now(), '{}', '{}', now(), now())$q$,
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
create temp table ids (name text primary key, id uuid) on commit drop;
create or replace function pg_temp.id(n text) returns uuid language sql as $$ select id from ids where name = n $$;

insert into ids values ('owner', pg_temp.mkuser('owner')), ('member', pg_temp.mkuser('member')), ('owner2', pg_temp.mkuser('owner2'));

-- ===========================================================================
-- A client id replayed behind the owner's removal of the member (R-APP-340, D-390)
-- ===========================================================================
select pg_temp.act_as('setup', pg_temp.id('owner'));
insert into ids values ('budget', pg_temp.q('setup', $$select public.create_budget('Race97l', 'Salary', 600000, 25, 'none',
  (date_trunc('month', private.today()) - interval '2 months')::date)::text$$)::uuid);
insert into ids values ('inv', pg_temp.q('setup', format($$select public.invite_member(%L, %L)::text$$, pg_temp.id('budget'),
  (select email from auth.users where id = pg_temp.id('member'))))::uuid);
select pg_temp.act_as('setup', pg_temp.id('member'));
select pg_temp.q('setup', format($$select 'done' from (select public.accept_invitation(%L)) as x$$, pg_temp.id('inv')));
insert into ids values ('cid', extensions.gen_random_uuid());
select is(pg_temp.q('setup', format($$select count(*)::text from public.add_transaction(%L, 'extra_income', 4200, private.today(),
  p_client_id => %L)$$, pg_temp.id('budget'), pg_temp.id('cid'))), '1', 'R-APP-340: (setup) the member records a transaction with a client id');
select pg_temp.act_as('one', pg_temp.id('owner'));
select pg_temp.act_as('two', pg_temp.id('member'));
select extensions.dblink_exec('one', 'begin');
select pg_temp.q('one', format($$select 'done' from (select public.remove_member(%L, %L)) as x$$, pg_temp.id('budget'), pg_temp.id('member')));
select is(pg_temp.send_and_wait('two', format($$select count(*)::text from public.add_transaction(%L, 'extra_income', 4200,
  private.today(), p_client_id => %L)$$, pg_temp.id('budget'), pg_temp.id('cid'))), 1,
  'R-APP-340: the member''s replay waits behind the owner''s removal');
select extensions.dblink_exec('one', 'commit');
select is(pg_temp.result('two'), 'error: budget_not_found',
  'R-APP-340: once the removal is committed the replay answers budget_not_found, never the stored row (client_id_no_recheck_after_lock)');

-- ===========================================================================
-- preview_reopen behind a member's write: it waits, then previews what the write left, the
-- transfer's transaction removed included (R-ACCOUNT-303, D-432)
-- ===========================================================================
select pg_temp.act_as('setup', pg_temp.id('owner2'));
insert into ids values ('b2', pg_temp.q('setup', $$select public.create_budget('Race97l two', 'Salary', 600000,
  least(extract(day from private.today() - 10)::integer, 28), 'none',
  (date_trunc('month', private.today()) - interval '2 months')::date)::text$$)::uuid);
insert into ids values ('cur', pg_temp.q('setup', format($q$select id::text from public.periods where budget_id = %L
                                                           and private.today() between start_date and end_date$q$, pg_temp.id('b2')))::uuid);
insert into ids values ('main', pg_temp.q('setup', format($$select id::text from public.create_account(%L, 'Main', 'current')$$, pg_temp.id('b2')))::uuid);
insert into ids values ('sav', pg_temp.q('setup', format($$select id::text from public.create_account(%L, 'Savings', 'savings')$$, pg_temp.id('b2')))::uuid);
insert into ids values ('cat', pg_temp.q('setup', format($$select id::text from public.create_category(%L, 'Saving', p_amount => 1000)$$,
  pg_temp.id('b2')))::uuid);
insert into ids values ('t', pg_temp.q('setup', format($$select id::text from public.create_transfer(%L, 'Standing order', %L, %L, 1000,
  'pay_date', p_is_automatic => true, p_category_id => %L, p_from_period_id => %L)$$, pg_temp.id('b2'), pg_temp.id('main'),
  pg_temp.id('sav'), pg_temp.id('cat'), pg_temp.id('cur')))::uuid);
select is(pg_temp.q('setup', format($$select count(*)::text from public.transaction_list where transfer_id = %L$$, pg_temp.id('t'))), '1',
  'R-ACCOUNT-303: (setup) the standing order''s transaction of this period was made');
select pg_temp.act_as('one', pg_temp.id('owner2'));
select pg_temp.act_as('two', pg_temp.id('owner2'));
select extensions.dblink_exec('one', 'begin');
select pg_temp.q('one', format($$select count(*)::text from public.set_expected_pay_date(%L, %L, %s, private.today() + 20)$$,
  pg_temp.id('b2'), pg_temp.id('cur'), pg_temp.q('setup', format('select revision::text from public.periods where id = %L', pg_temp.id('cur')))));
select is(pg_temp.send_and_wait('two', format($$select coalesce(string_agg(change, ',' order by change), '-') from public.preview_reopen(%L)
  where record_kind = 'transfer' and record_id = %L$$, pg_temp.id('b2'), pg_temp.id('t'))), 1,
  'R-ACCOUNT-303: the reopen''s preview waits behind the member''s write (it takes the lock before it reads)');
select extensions.dblink_exec('one', 'commit');
select matches(pg_temp.result('two'), 'transaction_removed',
  'R-ACCOUNT-303: then it previews what the write left: the transfer''s transaction removed (preview_reopen_no_lock_first)');

-- Clean up what was committed.
select extensions.dblink_exec('setup', 'reset role');
select extensions.dblink_exec('setup', format('delete from public.budgets where id in (%L, %L)', pg_temp.id('budget'), pg_temp.id('b2')));
select extensions.dblink_exec('setup', $$delete from auth.users where email like 'race97l+%@test.local'$$);
select extensions.dblink_disconnect(c) from unnest(array['setup', 'one', 'two']) as c;

select * from finish();
rollback;
