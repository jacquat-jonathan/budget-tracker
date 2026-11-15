begin;
select plan(22);

-- ---------------------------------------------------------------------------
-- Structure
-- ---------------------------------------------------------------------------
select has_table('public', 'profiles', 'profiles table exists');
select policies_are(
  'public', 'profiles',
  array['Users can read their own profile', 'Users can update their own profile'],
  'profiles has exactly the select and update policies'
);

-- ---------------------------------------------------------------------------
-- Sign-up trigger
-- ---------------------------------------------------------------------------
select tests.create_user('alice', 'Alice');
select tests.create_user('bob', 'Bob');
select tests.create_user('nameless');
select tests.create_user('blank', '   ');

select is(
  (select display_name from public.profiles where id = tests.get_user_id('alice')),
  'Alice',
  'sign-up creates a profile with display_name from user metadata'
);
select is(
  (select display_name from public.profiles where id = tests.get_user_id('nameless')),
  null,
  'sign-up without display_name creates a profile with a null name'
);
select is(
  (select display_name from public.profiles where id = tests.get_user_id('blank')),
  null,
  'a blank display_name is stored as null'
);

-- ---------------------------------------------------------------------------
-- Signed-in user: own row only
-- ---------------------------------------------------------------------------
select tests.authenticate_as('alice');

select results_eq(
  'select id from public.profiles',
  array[tests.get_user_id('alice')],
  'a user sees only their own profile'
);
select is_empty(
  format('select 1 from public.profiles where id = %L', tests.get_user_id('bob')),
  'a user cannot read another user''s profile by id'
);

select lives_ok(
  format(
    'update public.profiles set display_name = %L where id = %L',
    'Hacked', tests.get_user_id('bob')
  ),
  'updating another user''s profile runs but matches no row'
);

select lives_ok(
  $$update public.profiles set display_name = 'Alice Smith' where id = (select auth.uid())$$,
  'a user can update their own display_name'
);

select throws_ok(
  format(
    'update public.profiles set id = %L where id = (select auth.uid())',
    tests.get_user_id('bob')
  ),
  '42501',
  null,
  'a user cannot change the id of their profile'
);
select throws_ok(
  $$update public.profiles set created_at = now() - interval '1 day'$$,
  '42501',
  null,
  'a user cannot change created_at'
);
select throws_ok(
  format(
    $$update public.profiles set display_name = %L where id = (select auth.uid())$$,
    repeat('x', 101)
  ),
  '23514',
  null,
  'display_name longer than 100 characters is rejected'
);

select throws_ok(
  format(
    $$insert into public.profiles (id, display_name) values (%L, 'Fake')$$,
    extensions.gen_random_uuid()
  ),
  '42501',
  null,
  'a user cannot insert a profile'
);
select throws_ok(
  'delete from public.profiles',
  '42501',
  null,
  'a user cannot delete profiles'
);

select tests.clear_authentication();

select is(
  (select display_name from public.profiles where id = tests.get_user_id('bob')),
  'Bob',
  'the other user''s profile is unchanged'
);
select is(
  (select display_name from public.profiles where id = tests.get_user_id('alice')),
  'Alice Smith',
  'the own update was applied'
);

-- ---------------------------------------------------------------------------
-- updated_at trigger. now() is fixed within a transaction, so first back-date the row
-- with triggers disabled, then check that an update moves it to now().
-- ---------------------------------------------------------------------------
set local session_replication_role = replica;
update public.profiles set updated_at = '2000-01-01' where id = tests.get_user_id('alice');
set local session_replication_role = origin;

select tests.authenticate_as('alice');
update public.profiles set display_name = 'Alice' where id = (select auth.uid());
select tests.clear_authentication();

select is(
  (select updated_at from public.profiles where id = tests.get_user_id('alice')),
  now(),
  'updating a profile sets updated_at'
);

-- ---------------------------------------------------------------------------
-- Anonymous visitor: no access at all
-- ---------------------------------------------------------------------------
select tests.authenticate_as_anon();

select throws_ok(
  'select * from public.profiles',
  '42501',
  null,
  'anon cannot read profiles'
);
select throws_ok(
  $$update public.profiles set display_name = 'Anon'$$,
  '42501',
  null,
  'anon cannot update profiles'
);
select throws_ok(
  format(
    $$insert into public.profiles (id) values (%L)$$,
    extensions.gen_random_uuid()
  ),
  '42501',
  null,
  'anon cannot insert profiles'
);

select tests.clear_authentication();

-- ---------------------------------------------------------------------------
-- Deleting the auth user removes the profile.
-- ---------------------------------------------------------------------------
delete from auth.users where id = tests.get_user_id('bob');
select is_empty(
  $$select 1 from public.profiles p
    where not exists (select 1 from auth.users u where u.id = p.id)$$,
  'deleting an auth user deletes their profile'
);

select is(
  (select count(*)::int from public.profiles),
  3,
  'the remaining users still have their profiles'
);

select * from finish();
rollback;
