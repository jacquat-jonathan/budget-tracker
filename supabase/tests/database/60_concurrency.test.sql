-- Concurrent callers. Concurrency needs real, committed data in separate sessions, so this
-- test opens its own connections with dblink (local database, default local credentials),
-- commits throwaway users and budgets, and deletes them at the end (and at the start, should
-- an earlier run have failed half-way). The main transaction only observes and rolls back.
begin;
select plan(23);

create extension if not exists dblink with schema extensions;

-- dblink only lets postgres (not a superuser) connect with a password, and the server
-- trusts loopback connections without one, so connect back to the address this session
-- came in on (the test runner reaches the database over the Docker network).
create or replace function pg_temp.conn() returns text language sql as $$
  select format('host=%s port=%s dbname=postgres user=postgres password=postgres',
                host(inet_server_addr()), inet_server_port())
$$;

select extensions.dblink_connect(c, pg_temp.conn()) from unnest(array['setup', 'one', 'two']) as c;
select extensions.dblink_exec('setup', $$delete from auth.users where email like 'race+%@test.local'$$);

-- A committed user with a verified email.
create or replace function pg_temp.mkuser(tag text) returns uuid language plpgsql as $$
declare
  id uuid := extensions.gen_random_uuid();
begin
  perform extensions.dblink_exec('setup', 'reset role');
  perform extensions.dblink_exec('setup', format($q$
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                            raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values ('00000000-0000-0000-0000-000000000000', %1$L, 'authenticated', 'authenticated',
            'race+' || %2$L || '+' || %1$L || '@test.local', '', now(), '{}', '{}', now(), now())$q$,
    id, tag));
  return id;
end;
$$;

-- Make a connection act as a signed-in user (role authenticated and its JWT claims).
create or replace function pg_temp.act_as(c text, user_id uuid) returns void language plpgsql as $$
begin
  perform extensions.dblink_exec(c, 'reset role');
  perform extensions.dblink_exec(c, format('set request.jwt.claims to %L; set role authenticated',
    json_build_object('sub', user_id, 'role', 'authenticated')));
end;
$$;

-- Run a query returning one text value on a connection.
create or replace function pg_temp.q(c text, sql text) returns text language sql as $$
  select v from extensions.dblink(c, sql) as t (v text)
$$;

-- Send a query without waiting; then, after a pause, whether it is still waiting.
create or replace function pg_temp.send_and_wait(c text, sql text) returns integer language plpgsql as $$
begin
  perform extensions.dblink_send_query(c, sql);
  perform pg_sleep(0.5);
  return extensions.dblink_is_busy(c);
end;
$$;

-- The result of the sent query: its value, or 'error: <message>'. A query still waiting
-- after 10 seconds is cancelled ('timeout'), so a broken lock fails the test instead of
-- hanging it.
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

-- ===========================================================================
-- ensure_periods: two browsers at once
-- ===========================================================================
insert into ids values ('owner', pg_temp.mkuser('owner'));
select pg_temp.act_as('setup', (select id from ids where name = 'owner'));
insert into ids values ('budget', pg_temp.q('setup', $$
  select public.create_budget('Race', 'Salary', 100000, 1, 'nearest',
                              (date_trunc('month', private.today()) - interval '6 months')::date)::text$$)::uuid);
create temp table race (full_count integer) on commit drop;
select extensions.dblink_exec('setup', 'reset role');
insert into race select pg_temp.q('setup', format(
  'select count(*)::text from public.periods where budget_id = %L', (select id from ids where name = 'budget')))::integer;
select extensions.dblink_exec('setup', format($$
  begin;
  set local session_replication_role = replica;
  delete from public.periods where budget_id = %L and seq > 1;
  commit$$, (select id from ids where name = 'budget')));
select ok((select full_count from race) >= 6, 'setup: a budget six months old, cut back to its first period');

select pg_temp.act_as(c, (select id from ids where name = 'owner')) from unnest(array['one', 'two']) as c;
select extensions.dblink_exec('one', 'begin');
create temp table first_result on commit drop as
  select pg_temp.q('one', format('select public.ensure_periods(%L)::text', (select id from ids where name = 'budget')))::integer as created;
select is(
  pg_temp.send_and_wait('two', format('select public.ensure_periods(%L)::text', (select id from ids where name = 'budget'))),
  1,
  'R-PERIOD-009: the second caller waits for the first instead of creating periods alongside it'
);
select extensions.dblink_exec('one', 'commit');
select is(pg_temp.result('two'), '0', 'R-PERIOD-009: the second caller succeeds and creates nothing');
select is((select created from first_result), (select full_count - 1 from race), 'R-PERIOD-009: the first created the missing periods');
select is(
  pg_temp.q('setup', format('select count(*)::text from public.periods where budget_id = %L', (select id from ids where name = 'budget')))::integer,
  (select full_count from race),
  'R-PERIOD-006: no period is duplicated'
);
select is(
  pg_temp.q('setup', format('select count(*)::text from tests.period_violations(%L)', (select id from ids where name = 'budget'))),
  '0',
  'R-PERIOD-005 R-PERIOD-021: and the periods are valid'
);

-- ===========================================================================
-- Reads are not blocked by writers
-- ===========================================================================
select extensions.dblink_exec('one', 'reset role');
select extensions.dblink_exec('one', 'begin');
select pg_temp.q('one', format('select id::text from public.budgets where id = %L for key share',
                               (select id from ids where name = 'budget')));
select is(
  pg_temp.send_and_wait('two', format('select seq::text from public.get_current_period(%L)', (select id from ids where name = 'budget'))),
  0,
  'R-SECURITY-006: get_current_period does not wait for a transaction holding a key-share lock on the budget (as every child insert does)'
);
select isnt(pg_temp.result('two'), null, 'R-SECURITY-006: and returns the current period');
select pg_temp.q('one', format('select (private.lock_budget(%L)).id::text', (select id from ids where name = 'budget')));
select is(
  pg_temp.send_and_wait('two', format('select seq::text from public.get_current_period(%L)', (select id from ids where name = 'budget'))),
  0,
  'R-SECURITY-006: nor for a writer holding the budget lock, when there is nothing to create'
);
select isnt(pg_temp.result('two'), null, 'R-SECURITY-006: and returns the current period');
select extensions.dblink_exec('one', 'rollback');

-- ===========================================================================
-- An invitation cancelled while it is being accepted
-- ===========================================================================
insert into ids values ('invitee', pg_temp.mkuser('invitee'));
select pg_temp.act_as('setup', (select id from ids where name = 'owner'));
insert into ids values ('inv', pg_temp.q('setup', format(
  'select public.invite_member(%L, %L)::text',
  (select id from ids where name = 'budget'),
  (select email from auth.users where id = (select id from ids where name = 'invitee'))))::uuid);
select extensions.dblink_exec('setup', 'reset role');

select pg_temp.act_as('one', (select id from ids where name = 'owner'));
select extensions.dblink_exec('one', 'begin');
select pg_temp.q('one', format('select public.cancel_invitation(%L)::text', (select id from ids where name = 'inv')));
select pg_temp.act_as('two', (select id from ids where name = 'invitee'));
select is(
  pg_temp.send_and_wait('two', format('select public.accept_invitation(%L)::text', (select id from ids where name = 'inv'))),
  1,
  'R-INVITE-010: an accept waits while the owner is cancelling the invitation'
);
select extensions.dblink_exec('one', 'commit');
select is(pg_temp.result('two'), 'error: invitation_not_found', 'R-INVITE-010: and then finds no invitation to accept');
select is(
  pg_temp.q('setup', format('select count(*)::text from public.budget_members where budget_id = %L and user_id = %L',
                            (select id from ids where name = 'budget'), (select id from ids where name = 'invitee'))),
  '0',
  'R-INVITE-010: so the cancelled invitee did not become a member'
);

-- ===========================================================================
-- Accepting while the owner re-invites the same address: one lock order, no deadlock
-- ===========================================================================
insert into ids values ('reinvitee', pg_temp.mkuser('reinvitee'));
select pg_temp.act_as('setup', (select id from ids where name = 'owner'));
insert into ids values ('inv_re', pg_temp.q('setup', format(
  'select public.invite_member(%L, %L)::text',
  (select id from ids where name = 'budget'),
  (select email from auth.users where id = (select id from ids where name = 'reinvitee'))))::uuid);
select extensions.dblink_exec('setup', 'reset role');
-- Session one holds the budget lock (as an RPC in progress would) ...
select extensions.dblink_exec('one', 'reset role');
select extensions.dblink_exec('one', 'begin');
select pg_temp.q('one', format('select (private.lock_budget(%L)).id::text', (select id from ids where name = 'budget')));
-- ... the invitee accepts (and must wait for the budget lock before touching the row) ...
select pg_temp.act_as('two', (select id from ids where name = 'reinvitee'));
select pg_temp.send_and_wait('two', format('select public.accept_invitation(%L)::text', (select id from ids where name = 'inv_re')));
-- ... and the owner, in session one, re-invites the address, which updates that row.
select extensions.dblink_exec('one', format(
  'set request.jwt.claims to %L; set role authenticated',
  json_build_object('sub', (select id from ids where name = 'owner'), 'role', 'authenticated')));
select is(
  pg_temp.q('one', format('select public.invite_member(%L, %L)::text',
    (select id from ids where name = 'budget'),
    (select email from auth.users where id = (select id from ids where name = 'reinvitee')))),
  (select id::text from ids where name = 'inv_re'),
  'R-INVITE-011: the owner''s re-invite does not deadlock with the accept'
);
select extensions.dblink_exec('one', 'commit');
select is(pg_temp.result('two'), (select id::text from ids where name = 'budget'),
  'R-INVITE-011: and the accept then succeeds');

-- ===========================================================================
-- Two invitees accepting the last free place
-- ===========================================================================
select pg_temp.mkuser('filler' || g) from generate_series(1, 17) as g;
select extensions.dblink_exec('setup', format($$
  insert into public.budget_members (budget_id, user_id)
  select %L, id from auth.users where email like 'race+filler%%@test.local'$$, (select id from ids where name = 'budget')));
insert into ids values ('first', pg_temp.mkuser('first')), ('second', pg_temp.mkuser('second'));
select pg_temp.act_as('setup', (select id from ids where name = 'owner'));
insert into ids
select 'inv_' || i.name, pg_temp.q('setup', format(
  'select public.invite_member(%L, %L)::text',
  (select id from ids where name = 'budget'), (select email from auth.users as u where u.id = i.id)))::uuid
from ids as i where i.name in ('first', 'second');
select extensions.dblink_exec('setup', 'reset role');
select is(
  pg_temp.q('setup', format('select count(*)::text from public.budget_members where budget_id = %L', (select id from ids where name = 'budget'))),
  '19',
  'setup: 19 members, one place left'
);
select pg_temp.act_as('one', (select id from ids where name = 'first'));
select pg_temp.act_as('two', (select id from ids where name = 'second'));
select extensions.dblink_exec('one', 'begin');
select pg_temp.q('one', format('select public.accept_invitation(%L)::text', (select id from ids where name = 'inv_first')));
select is(
  pg_temp.send_and_wait('two', format('select public.accept_invitation(%L)::text', (select id from ids where name = 'inv_second'))),
  1,
  'R-MEMBER-010: the second accept waits for the first'
);
select extensions.dblink_exec('one', 'commit');
select is(pg_temp.result('two'), 'error: member_limit_reached', 'R-MEMBER-010: and finds the budget full');
select is(
  pg_temp.q('setup', format('select count(*)::text from public.budget_members where budget_id = %L', (select id from ids where name = 'budget'))),
  '20',
  'R-MEMBER-010: the budget has exactly 20 members'
);

-- ===========================================================================
-- Two tabs creating the 20th budget
-- ===========================================================================
select pg_temp.act_as('setup', (select id from ids where name = 'first'));
select pg_temp.q('setup', $$select count(public.create_budget('Filler ' || g, 'Salary', 1000, 1))::text
                            from generate_series(1, 19) as g$$);
select pg_temp.act_as(c, (select id from ids where name = 'first')) from unnest(array['one', 'two']) as c;
select extensions.dblink_exec('one', 'begin');
select pg_temp.q('one', $$select public.create_budget('Twentieth', 'Salary', 1000, 1)::text$$);
select is(
  pg_temp.send_and_wait('two', $$select public.create_budget('Twenty-first', 'Salary', 1000, 1)::text$$),
  1,
  'R-BUDGET-012: a second create waits for the first'
);
select extensions.dblink_exec('one', 'commit');
select is(pg_temp.result('two'), 'error: budget_limit_reached', 'R-BUDGET-012: and finds the limit reached');

-- ===========================================================================
-- Income operations racing each other get contract errors
-- ===========================================================================
select pg_temp.act_as('setup', (select id from ids where name = 'owner'));
insert into ids values
  ('side', pg_temp.q('setup', format($$select public.add_income(%L, 'Side', 1000, 1)::text$$, (select id from ids where name = 'budget')))::uuid),
  ('extra', pg_temp.q('setup', format($$select public.add_income(%L, 'Extra', 1000, 1, 'nearest', null,
      (select id from public.periods where budget_id = %1$L and seq = 1))::text$$, (select id from ids where name = 'budget')))::uuid);
select pg_temp.act_as(c, (select id from ids where name = 'owner')) from unnest(array['one', 'two']) as c;

select extensions.dblink_exec('one', 'begin');
select pg_temp.q('one', format('select public.remove_income(%L)', (select id from ids where name = 'extra')));
select pg_temp.send_and_wait('two', format('select public.set_primary_income(%L)::text', (select id from ids where name = 'extra')));
select extensions.dblink_exec('one', 'commit');
select is(pg_temp.result('two'), 'error: income_ended',
  'R-SECURITY-007: making an income primary while another member ends it gives the contract error income_ended');

select extensions.dblink_exec('one', 'begin');
select pg_temp.q('one', format('select public.remove_income(%L)', (select id from ids where name = 'side')));
select pg_temp.send_and_wait('two', format($$select public.update_income_terms(%L, 2000, 1, 'nearest')::text$$, (select id from ids where name = 'side')));
select extensions.dblink_exec('one', 'commit');
select is(pg_temp.result('two'), 'error: income_not_found',
  'R-SECURITY-007: editing an income while another member deletes it gives the contract error income_not_found');

-- Clean up what was committed.
select extensions.dblink_exec('setup', 'reset role');
select extensions.dblink_exec('setup', $$delete from auth.users where email like 'race+%@test.local'$$);
select extensions.dblink_disconnect(c) from unnest(array['setup', 'one', 'two']) as c;

select * from finish();
rollback;
