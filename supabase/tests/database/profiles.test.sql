begin;
select plan(27);

-- ---------------------------------------------------------------------------
-- Structure
-- ---------------------------------------------------------------------------
select has_table('public', 'profiles', 'profiles table exists');
select policies_are(
  'public', 'profiles',
  array['Users can read their own and co-members'' profiles', 'Users can update their own profile'],
  'R-PROFILE-002 R-PROFILE-003: profiles has exactly the select and update policies'
);

-- ---------------------------------------------------------------------------
-- Sign-up trigger
-- ---------------------------------------------------------------------------
-- tests.create_user inserts into auth.users with no privileges on public tables, like the
-- Auth server's supabase_auth_admin, so these calls fail if the trigger only works for a
-- privileged role.
select lives_ok(
  $$select tests.create_user('alice', 'Alice')$$,
  'R-PROFILE-001: a sign-up inserted with the Auth server''s privileges succeeds'
);
select tests.create_user('bob', 'Bob');
select tests.create_user('nameless');
select tests.create_user('blank', '   ');

select is(
  (
    select p.prosecdef and p.proconfig @> array['search_path=""']
    from pg_catalog.pg_proc as p
    where p.oid = 'private.handle_new_user()'::regprocedure
  ),
  true,
  'R-PROFILE-001: handle_new_user is security definer with an empty search_path'
);

select is(
  (select display_name from public.profiles where id = tests.get_user_id('alice')),
  'Alice',
  'R-PROFILE-001: sign-up creates a profile with display_name from user metadata'
);
select is(
  (select display_name from public.profiles where id = tests.get_user_id('nameless')),
  null,
  'R-PROFILE-001: sign-up without display_name creates a profile with a null name'
);
select is(
  (select display_name from public.profiles where id = tests.get_user_id('blank')),
  null,
  'R-PROFILE-001: a blank display_name is stored as null'
);

-- ---------------------------------------------------------------------------
-- Signed-in user: own row only
-- ---------------------------------------------------------------------------
select tests.authenticate_as('alice');

select results_eq(
  'select id from public.profiles',
  array[tests.get_user_id('alice')],
  'R-PROFILE-003: a user who shares no budget sees only their own profile'
);
select is_empty(
  format('select 1 from public.profiles where id = %L', tests.get_user_id('bob')),
  'R-PROFILE-003: a user cannot read another user''s profile by id'
);

select lives_ok(
  format(
    'update public.profiles set display_name = %L where id = %L',
    'Hacked', tests.get_user_id('bob')
  ),
  'R-PROFILE-002: updating another user''s profile runs but matches no row'
);

select lives_ok(
  $$update public.profiles set display_name = 'Alice Smith' where id = (select auth.uid())$$,
  'R-PROFILE-002: a user can update their own display_name'
);

select throws_ok(
  format(
    'update public.profiles set id = %L where id = (select auth.uid())',
    tests.get_user_id('bob')
  ),
  '42501',
  null,
  'R-PROFILE-002: a user cannot change the id of their profile'
);
select throws_ok(
  $$update public.profiles set created_at = now() - interval '1 day'$$,
  '42501',
  null,
  'R-PROFILE-002: a user cannot change created_at'
);
select throws_ok(
  format(
    $$update public.profiles set display_name = %L where id = (select auth.uid())$$,
    repeat('x', 101)
  ),
  '23514',
  null,
  'R-PROFILE-002: display_name longer than 100 characters is rejected'
);

select throws_ok(
  format(
    $$insert into public.profiles (id, display_name) values (%L, 'Fake')$$,
    extensions.gen_random_uuid()
  ),
  '42501',
  null,
  'R-PROFILE-001: a user cannot insert a profile'
);
select throws_ok(
  'delete from public.profiles',
  '42501',
  null,
  'R-PROFILE-002: a user cannot delete profiles'
);

select throws_ok(
  $$update public.profiles set email = 'spoof@test.local' where id = (select auth.uid())$$,
  '42501',
  null,
  'R-PROFILE-002: a user cannot change the email on their profile'
);

select tests.clear_authentication();

select is(
  (select display_name from public.profiles where id = tests.get_user_id('bob')),
  'Bob',
  'R-PROFILE-002: the other user''s profile is unchanged'
);
select is(
  (select display_name from public.profiles where id = tests.get_user_id('alice')),
  'Alice Smith',
  'R-PROFILE-002: the own update was applied'
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
  'R-PROFILE-002: updating a profile sets updated_at'
);

-- ---------------------------------------------------------------------------
-- Anonymous visitor: no access at all
-- ---------------------------------------------------------------------------
select tests.authenticate_as_anon();

select throws_ok(
  'select * from public.profiles',
  '42501',
  null,
  'R-SECURITY-003: anon cannot read profiles'
);
select throws_ok(
  $$update public.profiles set display_name = 'Anon'$$,
  '42501',
  null,
  'R-SECURITY-003: anon cannot update profiles'
);
select throws_ok(
  format(
    $$insert into public.profiles (id) values (%L)$$,
    extensions.gen_random_uuid()
  ),
  '42501',
  null,
  'R-SECURITY-003: anon cannot insert profiles'
);

select tests.clear_authentication();

-- ---------------------------------------------------------------------------
-- The profile's email follows the account's email.
-- ---------------------------------------------------------------------------
select is(
  (select email from public.profiles where id = tests.get_user_id('alice')),
  tests.get_user_email('alice'),
  'R-PROFILE-005: a new profile has the account''s email'
);
update auth.users set email = 'alice-new+' || id || '@test.local' where id = tests.get_user_id('alice');
select is(
  (select email from public.profiles where id = tests.get_user_id('alice')),
  'alice-new+' || tests.get_user_id('alice') || '@test.local',
  'R-PROFILE-005: when the account''s email changes, the profile follows'
);

-- ---------------------------------------------------------------------------
-- Deleting the auth user removes the profile.
-- ---------------------------------------------------------------------------
delete from auth.users where id = tests.get_user_id('bob');
select is_empty(
  format('select 1 from public.profiles where id = %L', tests.get_user_id('bob')),
  'R-PROFILE-001: deleting an auth user deletes their profile'
);

select is(
  (
    select count(*)::int
    from public.profiles
    where id in (
      tests.get_user_id('alice'), tests.get_user_id('nameless'), tests.get_user_id('blank')
    )
  ),
  3,
  'R-PROFILE-001: the other test users keep their profiles'
);

select * from finish();
rollback;
