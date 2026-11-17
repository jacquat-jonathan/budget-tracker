-- Step 6 under real concurrency: two members sending the same chunk of a batch, an import
-- racing the undo of its batch, an import racing the end of a rule's category, and a token
-- import racing the token's revocation. Like 98_step4_concurrency, this test opens its own
-- connections with dblink, commits throwaway users and budgets, and deletes them at the end.
begin;
select plan(16);

create extension if not exists dblink with schema extensions;

create or replace function pg_temp.conn() returns text language sql as $$
  select format('host=%s port=%s dbname=postgres user=postgres password=postgres',
                host(inet_server_addr()), inet_server_port())
$$;
select extensions.dblink_connect(c, pg_temp.conn()) from unnest(array['setup', 'one', 'two']) as c;
-- a statement that waits without bound fails in seconds instead of hanging the run
select extensions.dblink_exec(c, 'set statement_timeout = ''60s''') from unnest(array['setup', 'one', 'two']) as c;
select extensions.dblink_exec('setup', $$delete from auth.users where email like 'race6+%@test.local'$$);

create or replace function pg_temp.mkuser(tag text) returns uuid language plpgsql as $$
declare
  id uuid := extensions.gen_random_uuid();
begin
  perform extensions.dblink_exec('setup', 'reset role');
  perform extensions.dblink_exec('setup', format($q$
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                            raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values ('00000000-0000-0000-0000-000000000000', %1$L, 'authenticated', 'authenticated',
            'race6+' || %2$L || '+' || %1$L || '@test.local', '', now(), '{}', '{}', now(), now())$q$,
    id, tag));
  return id;
end;
$$;
create or replace function pg_temp.act_as(c text, user_id uuid) returns void language plpgsql as $$
begin
  perform extensions.dblink_exec(c, 'reset role');
  if user_id is null then
    perform extensions.dblink_exec(c, 'set role anon');
  else
    perform extensions.dblink_exec(c, format('set request.jwt.claims to %L; set role authenticated',
      json_build_object('sub', user_id, 'role', 'authenticated')));
  end if;
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
create temp table secrets (name text primary key, secret text) on commit drop;

insert into ids values ('owner', pg_temp.mkuser('owner')), ('member', pg_temp.mkuser('member'));
select pg_temp.act_as('setup', pg_temp.id('owner'));
insert into ids values ('budget', pg_temp.q('setup', $$select public.create_budget('Race6', 'Salary', 600000, 25, 'nearest',
  (date_trunc('month', private.today()) - interval '2 months')::date)::text$$)::uuid);
insert into ids values ('fun', pg_temp.q('setup', format($$select id::text from public.create_category(%L, 'Fun',
  p_from_period_id => (select id from public.periods where budget_id = %L and seq = 1))$$, pg_temp.id('budget'), pg_temp.id('budget')))::uuid);
select pg_temp.q('setup', format($$select rule_id::text from public.create_merchant_rule(%L, 'kino', %L)$$, pg_temp.id('budget'), pg_temp.id('fun')));
insert into ids values ('inv', pg_temp.q('setup', format('select public.invite_member(%L, %L)::text',
  pg_temp.id('budget'), (select email from auth.users where id = pg_temp.id('member'))))::uuid);
insert into secrets values ('token', pg_temp.q('setup', format($$select token from public.create_import_token(%L, 'Race')$$, pg_temp.id('budget'))));
insert into ids values ('token', pg_temp.q('setup', format($$select id::text from public.import_tokens where budget_id = %L$$, pg_temp.id('budget')))::uuid);
select pg_temp.act_as('setup', pg_temp.id('member'));
select pg_temp.q('setup', format('select public.accept_invitation(%L)::text', pg_temp.id('inv')));
insert into ids values ('batch', extensions.gen_random_uuid()), ('batch2', extensions.gen_random_uuid());
create or replace function pg_temp.rows(description text) returns text language sql as $$
  select format('[{"date": "%s", "amount": 1500, "direction": "debit", "description": "%s"}]', private.today(), description)
$$;

-- ===========================================================================
-- Two members send the same chunk at once: it is recorded once (R-IMPORT-208)
-- ===========================================================================
select pg_temp.act_as('one', pg_temp.id('owner'));
select pg_temp.act_as('two', pg_temp.id('member'));
select extensions.dblink_exec('one', 'begin');
select pg_temp.q('one', format($$select string_agg(action, ',') from public.import_transactions(%L, %L, 1, %L, 'csv')$$,
                               pg_temp.id('budget'), pg_temp.id('batch'), pg_temp.rows('same chunk')));
select is(pg_temp.send_and_wait('two', format($$select string_agg(action, ',') from public.import_transactions(%L, %L, 1, %L, 'csv')$$,
                                              pg_temp.id('budget'), pg_temp.id('batch'), pg_temp.rows('same chunk'))), 1,
  'R-IMPORT-208: the second member''s send waits for the first');
select extensions.dblink_exec('one', 'commit');
select is(pg_temp.result('two'), 'import', 'R-IMPORT-208: and gets the first answer');
select is(pg_temp.q('setup', format('select count(*)::text from public.transactions where import_batch_id = %L', pg_temp.id('batch'))), '1',
  'R-IMPORT-208: the chunk is recorded once');

-- ===========================================================================
-- An import racing the undo of its batch (R-IMPORT-206)
-- ===========================================================================
select extensions.dblink_exec('one', 'begin');
select pg_temp.q('one', format('select deleted::text from public.undo_import_batch(%L)', pg_temp.id('batch')));
select is(pg_temp.send_and_wait('two', format($$select string_agg(action, ',') from public.import_transactions(%L, %L, 2, %L, 'csv')$$,
                                              pg_temp.id('budget'), pg_temp.id('batch'), pg_temp.rows('after undo'))), 1,
  'R-IMPORT-206: a chunk sent during the undo waits');
select extensions.dblink_exec('one', 'commit');
select is(pg_temp.result('two'), 'error: batch_undone', 'R-IMPORT-206: and is refused: the batch is undone');

-- ===========================================================================
-- An import racing the end of a rule's category (R-IMPORT-201)
-- ===========================================================================
select extensions.dblink_exec('one', 'begin');
select pg_temp.q('one', format('select public.end_category(%L, %s)', pg_temp.id('fun'),
                               pg_temp.q('setup', format('select revision::text from public.categories where id = %L', pg_temp.id('fun')))));
select pg_temp.send_and_wait('two', format($$select string_agg(coalesce(category_source, '-'), ',') from public.import_transactions(%L, %L, 1, %L, 'csv')$$,
                                           pg_temp.id('budget'), pg_temp.id('batch2'), pg_temp.rows('Kino Rex')));
select extensions.dblink_exec('one', 'commit');
select is(pg_temp.result('two'), 'to_categorise',
  'R-IMPORT-201: an import that waited for the end of a rule''s category no longer uses the rule');

-- ===========================================================================
-- A token import racing the token's revocation (R-IMPORT-077, R-IMPORT-205, R-SECURITY-340)
-- ===========================================================================
-- the import waits for the budget lock at most a second: the revocation commits as soon as the
-- import is seen waiting, and the import, finding the token revoked under the lock, is refused
create or replace function pg_temp.wait_blocked() returns boolean language plpgsql as $$
begin
  for i in 1..2000 loop
    if exists (select 1 from pg_catalog.pg_locks where not granted) then
      return true;
    end if;
    perform pg_sleep(0.005);
  end loop;
  return false;
end;
$$;
select extensions.dblink_exec('one', 'begin');
select pg_temp.q('one', format('select public.revoke_import_token(%L)::text', pg_temp.id('token')));
select pg_temp.act_as('two', null);
select extensions.dblink_send_query('two', format($$select coalesce(error, received::text) from public.import_with_token(%L, %L, '1', %L)$$,
                                                  (select secret from secrets where name = 'token'), extensions.gen_random_uuid(), pg_temp.rows('token')));
select ok(pg_temp.wait_blocked(), 'R-IMPORT-205: a token import during the revocation waits for the budget');
select extensions.dblink_exec('one', 'commit');
select is(pg_temp.result('two'), 'invalid_token', 'R-IMPORT-077: and is refused once the token is revoked (in error: the call was counted)');
select extensions.dblink_exec('setup', 'reset role');
select is(pg_temp.q('setup', format('select count(*)::text from public.import_batches where budget_id = %L and token_id is not null', pg_temp.id('budget'))), '0',
  'R-IMPORT-077: nothing of it was recorded');

-- the budget lock held longer than a second: budget_busy, counted, nothing written
select pg_temp.act_as('setup', pg_temp.id('owner'));
insert into secrets values ('slow', pg_temp.q('setup', format($$select token from public.create_import_token(%L, 'Slow')$$, pg_temp.id('budget'))));
select extensions.dblink_exec('one', 'reset role');
select extensions.dblink_exec('one', 'begin');
select pg_temp.q('one', format('select private.lock_budget(%L)::text', pg_temp.id('budget')));
select is(pg_temp.q('two', format($$select coalesce(error, received::text) from public.import_with_token(%L, %L, '1', %L)$$,
                                  (select secret from secrets where name = 'slow'), extensions.gen_random_uuid(), pg_temp.rows('slow'))),
  'budget_busy', 'R-SECURITY-340: a token call waits at most a second for its budget, then answers budget_busy');
select extensions.dblink_exec('one', 'commit');
select extensions.dblink_exec('setup', 'reset role');
select is(pg_temp.q('setup', format($$select sum(u.calls)::text from private.import_token_usage as u join public.import_tokens as t on t.id = u.token_id
                                      where t.budget_id = %L and t.name = 'Slow'$$, pg_temp.id('budget'))), '1',
  'R-SECURITY-252: and that call is counted');

-- ===========================================================================
-- Two calls of one token: the second answers token_busy at once (R-SECURITY-340, R-SECURITY-252)
-- ===========================================================================
select pg_temp.act_as('setup', pg_temp.id('owner'));
insert into secrets values ('race', pg_temp.q('setup', format($$select token from public.create_import_token(%L, 'Race 2')$$, pg_temp.id('budget'))));
insert into secrets values ('other', pg_temp.q('setup', format($$select token from public.create_import_token(%L, 'Other')$$, pg_temp.id('budget'))));
insert into secrets values ('third', pg_temp.q('setup', format($$select token from public.create_import_token(%L, 'Third')$$, pg_temp.id('budget'))));
select extensions.dblink_exec('setup', 'reset role');
select extensions.dblink_exec('setup', format($$insert into private.import_token_usage
  select t.id, date_trunc('minute', clock_timestamp()) - interval '10 minutes', 59, 0 from public.import_tokens as t
  where t.budget_id = %L and t.name = 'Race 2'$$, pg_temp.id('budget')));
select pg_temp.act_as('one', null);
select pg_temp.act_as('two', null);
select extensions.dblink_exec('one', 'begin');
select pg_temp.q('one', format($$select coalesce(error, received::text) from public.import_with_token(%L, %L, '1', %L)$$,
                               (select secret from secrets where name = 'race'), extensions.gen_random_uuid(), pg_temp.rows('race one')));
select is(pg_temp.q('two', format($$select coalesce(error, received::text) from public.import_with_token(%L, %L, '1', %L)$$,
                                  (select secret from secrets where name = 'race'), extensions.gen_random_uuid(), pg_temp.rows('race two'))),
  'token_busy', 'R-SECURITY-340: a second call of the same token never waits: token_busy at once');
-- 'one' holds a slot; a call of another token in an open transaction holds the other
select pg_temp.act_as('setup', null);
select extensions.dblink_exec('setup', 'begin');
select pg_temp.q('setup', format($$select coalesce(error, received::text) from public.import_with_token(%L, %L, '1', %L)$$,
                                 (select secret from secrets where name = 'other'), extensions.gen_random_uuid(), pg_temp.rows('other')));
select is((select error from public.import_with_token((select secret from secrets where name = 'third'), extensions.gen_random_uuid()::text, '1',
                                                      '[{"date": "2026-11-14", "amount": 3, "direction": "debit"}]')),
  'imports_busy', 'R-SECURITY-340: with every slot doing work, a third token answers imports_busy at once');
select extensions.dblink_exec('setup', 'commit');
select extensions.dblink_exec('one', 'commit');
select is(pg_temp.q('two', format($$select coalesce(error, received::text) from public.import_with_token(%L, %L, '1', %L)$$,
                                  (select secret from secrets where name = 'race'), extensions.gen_random_uuid(), pg_temp.rows('race three'))),
  'token_rate_limited', 'R-SECURITY-252: the busy answer was not counted: 59 + the first call make 60, the next is refused');

-- ===========================================================================
-- A double click with one client id: the second call waits for the first (R-APP-250)
-- ===========================================================================
insert into ids values ('click', extensions.gen_random_uuid());
create temp table clicks (n integer, id text) on commit drop;
select pg_temp.act_as('one', pg_temp.id('owner'));
select pg_temp.act_as('two', pg_temp.id('owner'));
select extensions.dblink_exec('one', 'begin');
insert into clicks select 1, pg_temp.q('one', format($$select id::text from public.add_transaction(%L, 'extra_income', 321, private.today(), p_client_id => %L)$$,
                                                     pg_temp.id('budget'), pg_temp.id('click')));
select is(pg_temp.send_and_wait('two', format($$select id::text from public.add_transaction(%L, 'extra_income', 321, private.today(), p_client_id => %L)$$,
                                              pg_temp.id('budget'), pg_temp.id('click'))), 1,
  'R-APP-250: the same request sent again while the first is still running waits for it (the budget lock)');
select extensions.dblink_exec('one', 'commit');
select is(pg_temp.result('two'), (select id from clicks where n = 1),
  'R-APP-250: and answers what the first call recorded, creating nothing more');

-- Clean up what was committed.
select extensions.dblink_exec('setup', 'reset role');
select extensions.dblink_exec('setup', $$delete from auth.users where email like 'race6+%@test.local'$$);
select extensions.dblink_disconnect(c) from unnest(array['setup', 'one', 'two']) as c;

select * from finish();
rollback;
