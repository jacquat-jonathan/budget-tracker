-- Guard rail for every table, present and future: RLS is the only line of defence, so no
-- table in an API-exposed schema may exist without row-level security enabled.
begin;
select plan(1);

select is_empty(
  $$
    select n.nspname || '.' || c.relname
    from pg_catalog.pg_class as c
    join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
    where c.relkind in ('r', 'p')
      and n.nspname in ('public', 'graphql_public')
      and not c.relrowsecurity
  $$,
  'every table in an exposed schema has row-level security enabled'
);

select * from finish();
rollback;
