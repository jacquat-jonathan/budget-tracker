-- Two browsers calling ensure_periods at the same moment.
--
-- Concurrency needs real, committed data in separate sessions, so this test opens its own
-- connections with dblink (local database, default local credentials) and deletes the
-- user and budget it commits. The main transaction only observes and rolls back.
begin;
select plan(6);

create extension if not exists dblink with schema extensions;

-- dblink only lets postgres (not a superuser) connect with a password, and the server
-- trusts loopback connections without one, so connect back to the address this session
-- came in on (the test runner reaches the database over the Docker network).
create or replace function pg_temp.conn() returns text language sql as $$
  select format('host=%s port=%s dbname=postgres user=postgres password=postgres',
                host(inet_server_addr()), inet_server_port())
$$;

select extensions.dblink_connect('setup', pg_temp.conn());
select extensions.dblink_connect('first', pg_temp.conn());
select extensions.dblink_connect('second', pg_temp.conn());

-- Setup, committed: a user and a budget started six months ago, then cut back to its first
-- period so that the next ensure_periods call has several periods to create.
create temp table race (user_id uuid, budget_id uuid, full_count integer) on commit drop;
insert into race (user_id) values (extensions.gen_random_uuid());

-- Leftovers of an earlier run that failed half-way.
select extensions.dblink_exec('setup', $$delete from auth.users where email like 'race+%@test.local'$$);

select extensions.dblink_exec('setup', format($$
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', %1$L, 'authenticated', 'authenticated',
          'race+' || %1$L || '@test.local', '', now(), '{}', '{}', now(), now())$$,
  (select user_id from race)));

select extensions.dblink_exec('setup', format(
  'set request.jwt.claims to %L; set role authenticated',
  json_build_object('sub', (select user_id from race), 'role', 'authenticated')));
update race set budget_id = (
  select b from extensions.dblink('setup', $$
    select public.create_budget('Race', 'Salary', 100000, 1, 'nearest',
                                (date_trunc('month', private.today()) - interval '6 months')::date)$$
  ) as t (b uuid)
);
select extensions.dblink_exec('setup', 'reset role');
update race set full_count = (
  select n from extensions.dblink('setup', format(
    'select count(*)::integer from public.periods where budget_id = %L', (select budget_id from race)
  )) as t (n integer)
);
select extensions.dblink_exec('setup', format($$
  begin;
  set local session_replication_role = replica;
  delete from public.periods where budget_id = %L and seq > 1;
  commit$$, (select budget_id from race)));

select ok(
  (select full_count from race) >= 6,
  'setup: the budget had periods for at least six months, now cut back to one'
);

-- Both sessions act as the budget's owner.
select extensions.dblink_exec(c, format(
  'set request.jwt.claims to %L; set role authenticated',
  json_build_object('sub', (select user_id from race), 'role', 'authenticated')))
from unnest(array['first', 'second']) as c;

-- The first caller creates the periods inside an open transaction ...
select extensions.dblink_exec('first', 'begin');
create temp table first_result on commit drop as
  select created from extensions.dblink('first', format(
    'select public.ensure_periods(%L)', (select budget_id from race))) as t (created integer);

-- ... while the second caller starts at the same time.
select extensions.dblink_send_query('second', format(
  'select public.ensure_periods(%L)', (select budget_id from race)));
select pg_sleep(0.5);
select is(
  extensions.dblink_is_busy('second'), 1,
  'the second caller waits for the first instead of creating periods alongside it'
);

select extensions.dblink_exec('first', 'commit');

create temp table second_result on commit drop as
  select created from extensions.dblink_get_result('second') as t (created integer);
-- Drain the end-of-results marker of the async query.
select * from extensions.dblink_get_result('second') as t (created integer);

select is(
  (select created from first_result), (select full_count - 1 from race),
  'the first caller creates the missing periods'
);
select is(
  (select created from second_result), 0,
  'the second caller succeeds and creates nothing'
);
select is(
  (select n from extensions.dblink('setup', format(
    'select count(*)::integer from public.periods where budget_id = %L', (select budget_id from race)
  )) as t (n integer)),
  (select full_count from race),
  'no period is duplicated'
);
select is(
  (select n from extensions.dblink('setup', format($$
    select count(*)::integer from (
      select seq, start_date, lag(end_date) over (order by seq) as prev_end,
             row_number() over (order by seq) as rn
      from public.periods where budget_id = %L) s
    where s.seq <> s.rn or (s.prev_end is not null and s.start_date <> s.prev_end + 1)$$,
    (select budget_id from race))) as t (n integer)),
  0,
  'and the periods are contiguous'
);

-- Clean up what was committed.
select extensions.dblink_exec('setup', format(
  'delete from auth.users where id = %L', (select user_id from race)));
select extensions.dblink_disconnect(c) from unnest(array['setup', 'first', 'second']) as c;

select * from finish();
rollback;
