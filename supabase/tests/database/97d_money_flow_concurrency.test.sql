-- Step 7 under real concurrency: two members marking the same transfer done, two undoing the
-- same mark, a new period (the salary came early) racing an edit of a transfer, and closing an
-- account racing a transfer created on it. Like 97b_import_concurrency, this test opens its own
-- connections with dblink, commits throwaway users and budgets, and deletes them at the end.
-- It runs on the real today: the budget's pay day is about ten days ago, so the current period
-- is long enough for an early salary today.
begin;
select plan(13);

create extension if not exists dblink with schema extensions;

create or replace function pg_temp.conn() returns text language sql as $$
  select format('host=%s port=%s dbname=postgres user=postgres password=postgres',
                host(inet_server_addr()), inet_server_port())
$$;
select extensions.dblink_connect(c, pg_temp.conn()) from unnest(array['setup', 'one', 'two']) as c;
select extensions.dblink_exec('setup', $$delete from auth.users where email like 'race7+%@test.local'$$);

create or replace function pg_temp.mkuser(tag text) returns uuid language plpgsql as $$
declare
  id uuid := extensions.gen_random_uuid();
begin
  perform extensions.dblink_exec('setup', 'reset role');
  perform extensions.dblink_exec('setup', format($q$
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                            raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values ('00000000-0000-0000-0000-000000000000', %1$L, 'authenticated', 'authenticated',
            'race7+' || %2$L || '+' || %1$L || '@test.local', '', now(), '{}', '{}', now(), now())$q$,
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
create or replace function pg_temp.current_period() returns text language sql as $$
  select pg_temp.q('setup', format($q$select id::text from public.periods where budget_id = %L
                                     and private.today() between start_date and end_date$q$, pg_temp.id('budget')))
$$;

insert into ids values ('owner', pg_temp.mkuser('owner')), ('member', pg_temp.mkuser('member'));
select pg_temp.act_as('setup', pg_temp.id('owner'));
-- the current period started about ten days ago (no weekend rule)
insert into ids values ('budget', pg_temp.q('setup', $$select public.create_budget('Race7', 'Salary', 600000,
  least(extract(day from private.today() - 10)::integer, 28), 'none',
  (date_trunc('month', private.today()) - interval '3 months')::date)::text$$)::uuid);
insert into ids values ('p1', pg_temp.q('setup', format($$select id::text from public.periods where budget_id = %L and seq = 1$$,
  pg_temp.id('budget')))::uuid);
insert into ids values ('cat', pg_temp.q('setup', format($$select id::text from public.create_category(%L, 'Savings',
  p_from_period_id => %L)$$, pg_temp.id('budget'), pg_temp.id('p1')))::uuid);
insert into ids values ('main', pg_temp.q('setup', format($$select id::text from public.create_account(%L, 'Main', 'current',
  p_from_period_id => %L)$$, pg_temp.id('budget'), pg_temp.id('p1')))::uuid);
insert into ids values ('sav', pg_temp.q('setup', format($$select id::text from public.create_account(%L, 'Savings', 'savings',
  p_from_period_id => %L)$$, pg_temp.id('budget'), pg_temp.id('p1')))::uuid);
insert into ids values ('spare', pg_temp.q('setup', format($$select id::text from public.create_account(%L, 'Spare', 'cash',
  p_from_period_id => %L)$$, pg_temp.id('budget'), pg_temp.id('p1')))::uuid);
-- manual, linked, due on the period's start: due now
insert into ids values ('t', pg_temp.q('setup', format($$select id::text from public.create_transfer(%L, 'Savings', %L, %L, 50000,
  'pay_date', 0, p_category_id => %L, p_from_period_id => %L)$$, pg_temp.id('budget'), pg_temp.id('main'), pg_temp.id('sav'),
  pg_temp.id('cat'), pg_temp.id('p1')))::uuid);
insert into ids values ('inv', pg_temp.q('setup', format('select public.invite_member(%L, %L)::text',
  pg_temp.id('budget'), (select email from auth.users where id = pg_temp.id('member'))))::uuid);
select pg_temp.act_as('setup', pg_temp.id('member'));
select pg_temp.q('setup', format('select public.accept_invitation(%L)::text', pg_temp.id('inv')));
insert into ids values ('pc', pg_temp.current_period()::uuid);

-- ===========================================================================
-- Two members mark the same transfer done at once (R-CONCURRENCY-230, R-ACCOUNT-073)
-- ===========================================================================
select pg_temp.act_as('one', pg_temp.id('owner'));
select pg_temp.act_as('two', pg_temp.id('member'));
select extensions.dblink_exec('one', 'begin');
select pg_temp.q('one', format($$select status from public.mark_transfer_done(%L, %L, 0)$$, pg_temp.id('t'), pg_temp.id('pc')));
select is(pg_temp.send_and_wait('two', format($$select status from public.mark_transfer_done(%L, %L, 0)$$, pg_temp.id('t'), pg_temp.id('pc'))), 1,
  'R-CONCURRENCY-230: the second member''s mark waits for the first');
select extensions.dblink_exec('one', 'commit');
select is(pg_temp.result('two'), 'error: record_changed', 'R-CONCURRENCY-230: and is refused: it was marked meanwhile');
select is(pg_temp.q('setup', format($$select count(*)::text from public.transaction_list where transfer_id = %L and transfer_period_id = %L$$,
                                    pg_temp.id('t'), pg_temp.id('pc'))), '1',
  'R-ACCOUNT-073: one transaction for the occurrence');

-- ===========================================================================
-- Two members undo the same mark at once (R-CONCURRENCY-230, R-ACCOUNT-240)
-- ===========================================================================
select extensions.dblink_exec('one', 'begin');
select pg_temp.q('one', format($$select status from public.undo_transfer_mark(%L, %L, 1)$$, pg_temp.id('t'), pg_temp.id('pc')));
select is(pg_temp.send_and_wait('two', format($$select status from public.undo_transfer_mark(%L, %L, 1)$$, pg_temp.id('t'), pg_temp.id('pc'))), 1,
  'R-CONCURRENCY-230: an undo during another member''s undo waits');
select extensions.dblink_exec('one', 'commit');
select is(pg_temp.result('two'), 'error: record_changed', 'R-CONCURRENCY-230: and is refused: the mark is gone');
select is(pg_temp.q('setup', format($$select status || '/' || coalesce(transaction_id::text, 'none') from public.get_transfer_checklist(%L)
                                     where transfer_id = %L$$, pg_temp.id('pc'), pg_temp.id('t'))), 'to_do/none',
  'R-ACCOUNT-240: to do again, its transaction deleted once');

-- ===========================================================================
-- The salary comes early (a new period) while a member edits the transfer (R-VERSION-071)
-- ===========================================================================
select extensions.dblink_exec('one', 'begin');
select pg_temp.q('one', format($$select seq::text from public.record_early_pay_date(%L, %L, %s, private.today())$$,
  pg_temp.id('budget'), pg_temp.id('pc'),
  pg_temp.q('setup', format('select revision::text from public.periods where id = %L', pg_temp.id('pc')))));
select is(pg_temp.send_and_wait('two', format($$select amount::text from public.update_transfer(%L, 1, p_amount => 70000)$$, pg_temp.id('t'))), 1,
  'R-VERSION-071: an edit during the period change waits');
select extensions.dblink_exec('one', 'commit');
select is(pg_temp.result('two'), '70000', 'R-VERSION-071: and is saved');
select is(pg_temp.q('setup', format($$select string_agg(effective_from_seq::text, ',' order by effective_from_seq)
                                     from public.transfer_versions where transfer_id = %L$$, pg_temp.id('t'))),
  pg_temp.q('setup', format($$select '1,' || seq::text from public.periods where budget_id = %L and private.today() between start_date and end_date$$,
                            pg_temp.id('budget'))),
  'R-VERSION-071: from the new current period');
select is(pg_temp.q('setup', format($$select amount::text from public.get_transfer_checklist(%L) where transfer_id = %L$$,
                                    pg_temp.id('pc'), pg_temp.id('t'))), '50000',
  'R-VERSION-071: the period just closed keeps the terms it had');

-- ===========================================================================
-- Closing an account while a member creates a transfer on it (R-ACCOUNT-231, R-ACCOUNT-232)
-- ===========================================================================
select extensions.dblink_exec('one', 'begin');
select pg_temp.q('one', format($$select public.close_account(%L, 1)$$, pg_temp.id('spare')));
select is(pg_temp.send_and_wait('two', format($$select name from public.create_transfer(%L, 'Late', %L, %L, 100, 'pay_date')$$,
                                              pg_temp.id('budget'), pg_temp.id('main'), pg_temp.id('spare'))), 1,
  'R-ACCOUNT-231: a transfer created while its account closes waits');
select extensions.dblink_exec('one', 'commit');
select is(pg_temp.result('two'), 'error: account_not_in_force', 'R-ACCOUNT-231: and is refused: the account has closed');
select is(pg_temp.q('setup', format($$select count(*)::text from public.transfers where budget_id = %L and name = 'Late'$$, pg_temp.id('budget'))), '0',
  'R-ACCOUNT-232: no transfer on a closed account');

-- Clean up what was committed.
select extensions.dblink_exec('setup', 'reset role');
select extensions.dblink_exec('setup', $$delete from auth.users where email like 'race7+%@test.local'$$);
select extensions.dblink_exec('setup', format('delete from public.budgets where id = %L', pg_temp.id('budget')));
select extensions.dblink_disconnect(c) from unnest(array['setup', 'one', 'two']) as c;

select * from finish();
rollback;
