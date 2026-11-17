-- Step 7 occurrences under real concurrency: marks named by their date, an edit moving the
-- occurrence a member marks, previews that run the write, the catch-up from several sessions,
-- an end racing the catch-up and a reopen racing a mark. Like 97d, this test opens its own
-- connections with dblink, commits throwaway users and budgets, and deletes them at the end
-- (its assertions run on its own rows; the transaction it runs in only holds the pgTAP plan).
begin;
select plan(22);
create extension if not exists dblink with schema extensions;

create or replace function pg_temp.conn() returns text language sql as $$
  select format('host=%s port=%s dbname=postgres user=postgres password=postgres',
                host(inet_server_addr()), inet_server_port())
$$;
select extensions.dblink_connect(c, pg_temp.conn()) from unnest(array['setup', 'one', 'two', 'three']) as c;
select extensions.dblink_exec(c, $$set statement_timeout = '60s'$$) from unnest(array['setup', 'one', 'two', 'three']) as c;  -- a regression fails, never hangs
select extensions.dblink_exec('setup', $$delete from auth.users where email like 'race7h+%@test.local'$$);

create or replace function pg_temp.mkuser(tag text) returns uuid language plpgsql as $$
declare
  id uuid := extensions.gen_random_uuid();
begin
  perform extensions.dblink_exec('setup', 'reset role');
  perform extensions.dblink_exec('setup', format($q$
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                            raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values ('00000000-0000-0000-0000-000000000000', %1$L, 'authenticated', 'authenticated',
            'race7h+' || %2$L || '+' || %1$L || '@test.local', '', now(), '{}', '{}', now(), now())$q$,
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
create or replace function pg_temp.rev(t uuid, p uuid, k date) returns text language sql as $$
  select pg_temp.q('setup', format($q$select coalesce((select revision from public.transfer_occurrences
                                      where transfer_id = %L and occurrence_date = %L), 0)::text$q$, t, k))
$$;

insert into ids values ('owner', pg_temp.mkuser('owner')), ('member', pg_temp.mkuser('member'));
select pg_temp.act_as('setup', pg_temp.id('owner'));
-- the current period started about ten days ago (no weekend rule)
insert into ids values ('budget', pg_temp.q('setup', $$select public.create_budget('Race7h', 'Salary', 600000,
  least(extract(day from private.today() - 10)::integer, 28), 'none',
  (date_trunc('month', private.today()) - interval '2 months')::date)::text$$)::uuid);
insert into ids values ('p1', pg_temp.q('setup', format($$select id::text from public.periods where budget_id = %L and seq = 1$$,
  pg_temp.id('budget')))::uuid);
insert into ids values ('cat', pg_temp.q('setup', format($$select id::text from public.create_category(%L, 'Savings',
  p_from_period_id => %L)$$, pg_temp.id('budget'), pg_temp.id('p1')))::uuid);
insert into ids values ('main', pg_temp.q('setup', format($$select id::text from public.create_account(%L, 'Main', 'current',
  p_from_period_id => %L)$$, pg_temp.id('budget'), pg_temp.id('p1')))::uuid);
insert into ids values ('sav', pg_temp.q('setup', format($$select id::text from public.create_account(%L, 'Savings', 'savings',
  p_from_period_id => %L)$$, pg_temp.id('budget'), pg_temp.id('p1')))::uuid);
insert into ids values ('pc', pg_temp.current_period()::uuid);
-- manual, a fixed day: the day before yesterday, from the current period
insert into ids values ('m', pg_temp.q('setup', format($$select id::text from public.create_transfer(%L, 'By hand', %L, %L, 1000,
  'day_of_month', p_first_date => private.today() - 2, p_category_id => %L)$$, pg_temp.id('budget'), pg_temp.id('main'), pg_temp.id('sav'),
  pg_temp.id('cat')))::uuid);
-- automatic, linked, from the pay date (the period's start): its transaction is made at once
insert into ids values ('a', pg_temp.q('setup', format($$select id::text from public.create_transfer(%L, 'Standing order', %L, %L, 2000,
  'pay_date', 0, p_is_automatic => true, p_category_id => %L, p_from_period_id => %L)$$, pg_temp.id('budget'), pg_temp.id('main'),
  pg_temp.id('sav'), pg_temp.id('cat'), pg_temp.id('pc')))::uuid);
create temp table k (m date, a date) on commit drop;
insert into k select pg_temp.q('setup', format($$select occurrence_date::text from public.get_transfer_checklist(%L) where transfer_id = %L$$,
                                               pg_temp.id('pc'), pg_temp.id('m')))::date,
                     pg_temp.q('setup', format($$select occurrence_date::text from public.get_transfer_checklist(%L) where transfer_id = %L$$,
                                               pg_temp.id('pc'), pg_temp.id('a')))::date;
insert into ids values ('inv', pg_temp.q('setup', format('select public.invite_member(%L, %L)::text',
  pg_temp.id('budget'), (select email from auth.users where id = pg_temp.id('member'))))::uuid);
select pg_temp.act_as('setup', pg_temp.id('member'));
select pg_temp.q('setup', format('select public.accept_invitation(%L)::text', pg_temp.id('inv')));
select pg_temp.act_as('one', pg_temp.id('owner'));
select pg_temp.act_as('two', pg_temp.id('member'));
select pg_temp.act_as('three', pg_temp.id('member'));

-- ===========================================================================
-- Two members marking the same occurrence, named by its date (R-CONCURRENCY-230, R-ACCOUNT-301)
-- ===========================================================================
select extensions.dblink_exec('one', 'begin');
select pg_temp.q('one', format($$select status from public.skip_transfer(%L, %L, 0, %L)$$, pg_temp.id('m'), pg_temp.id('pc'), (select m from k)));
select is(pg_temp.send_and_wait('two', format($$select status from public.mark_transfer_done(%L, %L, 0, p_occurrence_date => %L)$$,
                                              pg_temp.id('m'), pg_temp.id('pc'), (select m from k))), 1,
  'R-CONCURRENCY-230: a second mark of the same occurrence waits');
select extensions.dblink_exec('one', 'commit');
select is(pg_temp.result('two'), 'error: record_changed', 'R-CONCURRENCY-230: and is refused: it was marked meanwhile');

-- ===========================================================================
-- An undo against a mark based on the same read (R-CONCURRENCY-230)
-- ===========================================================================
select extensions.dblink_exec('one', 'begin');
select pg_temp.q('one', format($$select status from public.undo_transfer_mark(%L, %L, 1, %L)$$, pg_temp.id('m'), pg_temp.id('pc'), (select m from k)));
select is(pg_temp.send_and_wait('two', format($$select status from public.undo_transfer_mark(%L, %L, 1, %L)$$,
                                              pg_temp.id('m'), pg_temp.id('pc'), (select m from k))), 1,
  'R-CONCURRENCY-230: an undo during another undo waits');
select extensions.dblink_exec('one', 'commit');
select is(pg_temp.result('two'), 'error: record_changed', 'R-CONCURRENCY-230: and is refused: the mark is gone');
select is(pg_temp.rev(pg_temp.id('m'), pg_temp.id('pc'), (select m from k)), '0', 'R-ACCOUNT-301: no mark left');

-- ===========================================================================
-- A mark against an edit that moves the occurrence away (R-ACCOUNT-301, R-ACCOUNT-302)
-- ===========================================================================
select extensions.dblink_exec('one', 'begin');
select pg_temp.q('one', format($$select first_date::text from public.update_transfer(%L, 1, p_first_date => private.today() - 1)$$, pg_temp.id('m')));
select is(pg_temp.send_and_wait('two', format($$select status from public.mark_transfer_done(%L, %L, 0, p_occurrence_date => %L)$$,
                                              pg_temp.id('m'), pg_temp.id('pc'), (select m from k))), 1,
  'R-ACCOUNT-301: a mark of an occurrence an edit is moving waits');
select extensions.dblink_exec('one', 'commit');
select is(pg_temp.result('two'), 'error: transfer_not_in_force', 'R-ACCOUNT-301: and is refused: that occurrence is no longer planned');
select is(pg_temp.q('setup', format($$select count(*)::text from public.transfer_occurrences where transfer_id = %L$$, pg_temp.id('m'))), '0',
  'R-ACCOUNT-301: nothing was marked on a date the plan no longer has');

-- ===========================================================================
-- A preview runs the write under the budget lock: it waits for a writer; reads do not
-- (R-ACCOUNT-303)
-- ===========================================================================
select extensions.dblink_exec('one', 'begin');
select pg_temp.q('one', format($$select amount::text from public.update_transfer(%L, 2, p_amount => 1500)$$, pg_temp.id('m')));
select is(pg_temp.send_and_wait('two', format($$select count(*)::text from public.preview_update_transfer(%L, p_day_of_month => 5)$$,
                                              pg_temp.id('m'))), 1,
  'R-ACCOUNT-303: a preview that runs the write waits for a writer holding the budget');
select is(pg_temp.q('three', format($$select count(*)::text from public.transfer_overview where budget_id = %L$$, pg_temp.id('budget'))), '2',
  'R-SECURITY-006: reads do not wait meanwhile');
select is(pg_temp.q('three', format($$select count(*)::text from public.preview_update_transfer(%L, p_amount => 900)$$, pg_temp.id('m'))) > '0', true,
  'R-ACCOUNT-303: nor does a preview of an amount alone (it runs no write)');
select extensions.dblink_exec('one', 'commit');
select is(pg_temp.result('two') ~ '^[0-9]+$', true,
  'R-ACCOUNT-303: the preview answers once the writer commits, on what the writer left (not record_changed)');
select is(pg_temp.q('setup', format($$select amount::text from public.transfer_versions where transfer_id = %L order by effective_from_seq desc limit 1$$,
                                    pg_temp.id('m'))), '1500',
  'R-ACCOUNT-303: and left nothing of its own run behind');

-- ===========================================================================
-- The catch-up from several sessions: the transaction of an automatic occurrence is made once
-- (R-ACCOUNT-302, R-PERIOD-300)
-- ===========================================================================
-- (the catch-up's mark removed as postgres: the occurrence is due again, its watermark back)
select extensions.dblink_exec('setup', 'reset role');
select extensions.dblink_exec('setup', format($$delete from public.transactions where transfer_occurrence_id in
  (select id from public.transfer_occurrences where transfer_id = %1$L); delete from public.transfer_occurrences where transfer_id = %1$L$$,
  pg_temp.id('a')));
select pg_temp.act_as('setup', pg_temp.id('owner'));
select extensions.dblink_exec('one', 'begin');
select pg_temp.q('one', format($$select public.ensure_periods(%L)::text$$, pg_temp.id('budget')));
select is(pg_temp.send_and_wait('two', format($$select public.ensure_periods(%L)::text$$, pg_temp.id('budget'))), 1,
  'R-PERIOD-180: a second catch-up waits for the first');
select extensions.dblink_exec('one', 'commit');
select is(pg_temp.result('two'), '0', 'R-PERIOD-180: and then finds nothing to do');
select is(pg_temp.q('setup', format($$select count(*)::text from public.transaction_list where transfer_id = %L$$, pg_temp.id('a'))), '1',
  'R-ACCOUNT-302: one transaction for the occurrence');

-- ===========================================================================
-- Ending a transfer against the catch-up making its transaction (R-ACCOUNT-234)
-- ===========================================================================
select extensions.dblink_exec('setup', 'reset role');
select extensions.dblink_exec('setup', format($$delete from public.transactions where transfer_occurrence_id in
  (select id from public.transfer_occurrences where transfer_id = %1$L); delete from public.transfer_occurrences where transfer_id = %1$L$$,
  pg_temp.id('a')));
select pg_temp.act_as('setup', pg_temp.id('owner'));
select extensions.dblink_exec('one', 'begin');
select pg_temp.q('one', format($$select public.ensure_periods(%L)::text$$, pg_temp.id('budget')));
select is(pg_temp.send_and_wait('two', format($$select public.end_transfer(%L, 1)$$, pg_temp.id('a'))), 1,
  'R-ACCOUNT-234: an end while the catch-up makes the transaction waits');
select extensions.dblink_exec('one', 'commit');
select is(pg_temp.result('two'), 'ended', 'R-ACCOUNT-234: and ends it');
select is(pg_temp.q('setup', format($$select count(*)::text || '/' || bool_and(not o.by_catch_up)::text
                                     from public.transaction_list as x join public.transfer_occurrences as o on o.transfer_id = x.transfer_id
                                     and o.occurrence_date = x.transfer_occurrence_date where x.transfer_id = %L$$, pg_temp.id('a'))), '1/true',
  'R-ACCOUNT-234: the transaction made stays, kept by the end');

-- ===========================================================================
-- A reopen against a mark of the merged period (R-ACCOUNT-306)
-- ===========================================================================
select pg_temp.q('setup', format($$select count(*)::text from public.record_early_pay_date(%L, %L, %s, private.today())$$,
  pg_temp.id('budget'), pg_temp.id('pc'),
  pg_temp.q('setup', format('select revision::text from public.periods where id = %L', pg_temp.id('pc')))));
insert into ids values ('pn', pg_temp.current_period()::uuid);
insert into ids values ('p', pg_temp.q('setup', format($$select id::text from public.create_transfer(%L, 'Payday', %L, %L, 300,
  'pay_date', 0, p_from_period_id => %L)$$, pg_temp.id('budget'), pg_temp.id('main'), pg_temp.id('sav'), pg_temp.id('pc')))::uuid);
select extensions.dblink_exec('one', 'begin');
select pg_temp.q('one', format($$select count(*)::text from public.reopen_previous_period(%L, %L, %s)$$, pg_temp.id('budget'), pg_temp.id('pn'),
  pg_temp.q('setup', format('select revision::text from public.periods where id = %L', pg_temp.id('pn')))));
select is(pg_temp.send_and_wait('two', format($$select status from public.skip_transfer(%L, %L, 0)$$, pg_temp.id('p'), pg_temp.id('pn'))), 1,
  'R-ACCOUNT-306: a mark of the period being merged waits');
select extensions.dblink_exec('one', 'commit');
select is(pg_temp.result('two'), 'error: period_not_found', 'R-ACCOUNT-306: and is refused: the period is gone');
select is(pg_temp.q('setup', format($$select count(*)::text from public.transfer_occurrences where transfer_id = %L$$, pg_temp.id('p'))), '0',
  'R-ACCOUNT-306: no mark was made');

-- Clean up what was committed.
select extensions.dblink_exec('setup', 'reset role');
select extensions.dblink_exec('setup', $$delete from auth.users where email like 'race7h+%@test.local'$$);
select extensions.dblink_exec('setup', format('delete from public.budgets where id = %L', pg_temp.id('budget')));
select extensions.dblink_disconnect(c) from unnest(array['setup', 'one', 'two', 'three']) as c;

select * from finish();
rollback;
