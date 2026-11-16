-- Guard rail for every table, present and future: RLS is the only line of defence, so no
-- table of the app may exist without row-level security enabled: in the exposed schemas and in
-- every other schema the app creates (private included); only the platform's own schemas and
-- the tests' helpers are left out.
begin;
select plan(1);

select is_empty(
  $$
    select n.nspname || '.' || c.relname
    from pg_catalog.pg_class as c
    join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
    where c.relkind in ('r', 'p')
      and n.nspname not like 'pg\_%'
      and n.nspname not in ('information_schema', 'auth', 'storage', 'realtime', '_realtime', 'supabase_migrations',
                            'supabase_functions', 'vault', 'extensions', 'graphql', 'net', 'pgsodium', 'cron', 'pgbouncer', 'tests')
      and not c.relrowsecurity
  $$,
  'C-RLS-001: every table of the app, in every schema it creates, has row-level security enabled'
);

select * from finish();
rollback;
