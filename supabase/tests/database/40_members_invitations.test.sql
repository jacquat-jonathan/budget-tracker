-- Members, roles and invitations.
begin;
select plan(48);

select tests.create_user('alice', 'Alice');
select tests.create_user('bob', 'Bob');
select tests.create_user('carol', 'Carol');
select tests.create_user('dave', 'Dave');
select tests.create_user('eve', 'Eve', false);   -- email not verified
select tests.set_today('2026-11-15');

select tests.authenticate_as('alice');
select tests.remember('b', public.create_budget('Home', 'Alice salary', 500000, 25, 'nearest', '2026-09-01'));

-- ---------------------------------------------------------------------------
-- Inviting
-- ---------------------------------------------------------------------------
select tests.remember('inv_bob', public.invite_member(tests.id('b'), tests.get_user_email('bob')));
select is(
  public.invite_member(tests.id('b'), '  ' || upper(tests.get_user_email('bob')) || ' '),
  tests.id('inv_bob'),
  'inviting the same address again (any case, spaces) returns the same invitation'
);
select results_eq(
  format('select email, invited_by from public.budget_invitations where budget_id = %L', tests.id('b')),
  format('values (%L, %L::uuid)', tests.get_user_email('bob'), tests.get_user_id('alice')),
  'the owner sees the pending invitation, stored in lower case'
);
select throws_ok(
  format('select public.invite_member(%L, %L)', tests.id('b'), tests.get_user_email('alice')),
  'P0001', 'already_member', 'inviting a member is rejected'
);
select throws_ok(
  format('select public.invite_member(%L, %L)', tests.id('b'), 'not-an-email'),
  'P0001', 'invalid_email', 'an invalid address is rejected'
);
-- Same answer whether or not an account exists: no enumeration.
select isnt(
  public.invite_member(tests.id('b'), 'nobody-has-this-' || extensions.gen_random_uuid() || '@test.local'),
  null,
  'inviting an address without an account succeeds like any other'
);
select tests.remember('inv_eve', public.invite_member(tests.id('b'), tests.get_user_email('eve')));
select tests.remember('inv_dave', public.invite_member(tests.id('b'), tests.get_user_email('dave')));

-- ---------------------------------------------------------------------------
-- The invited person's side
-- ---------------------------------------------------------------------------
select tests.authenticate_as('bob');
select results_eq(
  'select id, budget_id, budget_name, invited_by_name from public.list_my_invitations()',
  format('values (%L::uuid, %L::uuid, %L, %L)', tests.id('inv_bob'), tests.id('b'), 'Home', 'Alice'),
  'the invited person sees the budget name and who invited them'
);
select is_empty(
  format('select 1 from public.budgets where id = %L', tests.id('b')),
  'but not the budget itself before accepting'
);

select tests.authenticate_as('carol');
select is_empty('select 1 from public.list_my_invitations()', 'someone else sees no invitations');
select throws_ok(
  format('select public.accept_invitation(%L)', tests.id('inv_bob')),
  'P0001', 'invitation_not_found', 'an invitation addressed to someone else cannot be accepted'
);
select throws_ok(
  format('select public.decline_invitation(%L)', tests.id('inv_bob')),
  'P0001', 'invitation_not_found', 'nor declined'
);
select is_empty(
  format('select 1 from public.budget_invitations where id = %L', tests.id('inv_bob')),
  'nor read'
);

select tests.authenticate_as('eve');
select is_empty('select 1 from public.list_my_invitations()',
  'a user whose email is not verified sees no invitations');
select throws_ok(
  format('select public.accept_invitation(%L)', tests.id('inv_eve')),
  'P0001', 'invitation_not_found', 'and cannot accept one addressed to that email'
);

select tests.authenticate_as('dave');
select lives_ok(format('select public.decline_invitation(%L)', tests.id('inv_dave')), 'declining');
select tests.authenticate_as('alice');
select is_empty(
  format('select 1 from public.budget_invitations where id = %L', tests.id('inv_dave')),
  'removes the invitation'
);

select tests.authenticate_as('bob');
select is(public.accept_invitation(tests.id('inv_bob')), tests.id('b'), 'accepting returns the budget id');
select results_eq(
  format('select user_id, role, display_name, email from public.budget_member_list where budget_id = %L order by role desc',
         tests.id('b')),
  format('values (%L::uuid, %L, %L, %L), (%L::uuid, %L, %L, %L)',
         tests.get_user_id('alice'), 'owner', 'Alice', tests.get_user_email('alice'),
         tests.get_user_id('bob'), 'member', 'Bob', tests.get_user_email('bob')),
  'the new member sees every member with name, email and role'
);
select is(
  (select display_name from public.profiles where id = tests.get_user_id('alice')),
  'Alice',
  'co-members can read each other''s profiles'
);
select results_eq(
  format('select is_owner from public.my_budgets where id = %L', tests.id('b')),
  $$values (false)$$,
  'my_budgets shows the budget, not owned'
);
select is_empty('select 1 from public.list_my_invitations()', 'the accepted invitation is gone');
select is_empty(
  format('select 1 from public.budget_invitations where budget_id = %L', tests.id('b')),
  'a plain member cannot read the budget''s invitations'
);
select tests.authenticate_as('carol');
select is_empty(
  format('select 1 from public.profiles where id = %L', tests.get_user_id('alice')),
  'non-members cannot read the members'' profiles'
);

-- Owner cancels an invitation; a member cannot.
select tests.authenticate_as('bob');
delete from public.budget_invitations where id = tests.id('inv_eve');
select tests.authenticate_as('alice');
select isnt_empty(
  format('select 1 from public.budget_invitations where id = %L', tests.id('inv_eve')),
  'a member''s delete of an invitation does nothing'
);
delete from public.budget_invitations where id = tests.id('inv_eve');
select is_empty(
  format('select 1 from public.budget_invitations where id = %L', tests.id('inv_eve')),
  'the owner cancels it'
);

-- ---------------------------------------------------------------------------
-- Roles: what a plain member cannot do
-- ---------------------------------------------------------------------------
select tests.authenticate_as('bob');
select throws_ok(format('select public.invite_member(%L, %L)', tests.id('b'), 'x@test.local'),
  'P0001', 'not_owner', 'a member cannot invite');
select throws_ok(format('select public.remove_member(%L, %L)', tests.id('b'), tests.get_user_id('alice')),
  'P0001', 'not_owner', 'a member cannot remove members');
select throws_ok(format('select public.set_budget_end_date(%L, %L)', tests.id('b'), '2027-01-01'),
  'P0001', 'not_owner', 'a member cannot set the end date');
delete from public.budgets where id = tests.id('b');
select isnt_empty(format('select 1 from public.budgets where id = %L', tests.id('b')),
  'a member''s delete of the budget does nothing');
select throws_ok(
  format('update public.budgets set owner_id = %L where id = %L', tests.get_user_id('bob'), tests.id('b')),
  '42501', null, 'a member cannot make themselves owner');
select throws_ok(
  format('insert into public.budget_members (budget_id, user_id) values (%L, %L)', tests.id('b'), tests.get_user_id('carol')),
  '42501', null, 'a member cannot add members directly');
update public.budgets set name = 'Our home' where id = tests.id('b');
select is((select name from public.budgets where id = tests.id('b')), 'Our home', 'a member can rename the budget');

-- ---------------------------------------------------------------------------
-- Leaving and removal end the person's incomes from the current period
-- ---------------------------------------------------------------------------
select tests.remember('bob_past', public.add_income(tests.id('b'), 'Bob salary', 300000, 25, 'nearest', null,
  (select id from public.periods where budget_id = tests.id('b') and seq = 1)));
select tests.remember('bob_now', public.add_income(tests.id('b'), 'Bob bonus', 1000, 25));

select tests.authenticate_as('alice');
select throws_ok(format('select public.leave_budget(%L)', tests.id('b')),
  'P0001', 'owner_cannot_leave', 'the owner cannot leave');
select throws_ok(format('select public.remove_member(%L, %L)', tests.id('b'), tests.get_user_id('alice')),
  'P0001', 'owner_cannot_leave', 'the owner cannot remove themselves');
select throws_ok(format('select public.remove_member(%L, %L)', tests.id('b'), tests.get_user_id('carol')),
  'P0001', 'member_not_found', 'removing a non-member');

select public.set_primary_income(tests.id('bob_past'));
select throws_ok(format('select public.remove_member(%L, %L)', tests.id('b'), tests.get_user_id('bob')),
  'P0001', 'member_has_primary_income', 'a member with the primary income cannot be removed');
select tests.authenticate_as('bob');
select throws_ok(format('select public.leave_budget(%L)', tests.id('b')),
  'P0001', 'member_has_primary_income', 'nor leave');
select public.set_primary_income((select id from public.incomes where budget_id = tests.id('b') and user_id = tests.get_user_id('alice')));

select lives_ok(format('select public.leave_budget(%L)', tests.id('b')), 'a member leaves');
select is_empty(format('select 1 from public.budgets where id = %L', tests.id('b')),
  'and no longer sees the budget');
select tests.authenticate_as('alice');
select results_eq(
  format('select id, end_seq from public.incomes where budget_id = %L and user_id = %L', tests.id('b'), tests.get_user_id('bob')),
  format('values (%L::uuid, 2)', tests.id('bob_past')),
  'their income that counted in the past ends from the current period; the new one is deleted'
);
select results_eq(
  format('select seq, income_total from public.period_summaries where budget_id = %L order by seq', tests.id('b')),
  $$values (1, 800000::bigint), (2, 500000::bigint)$$,
  'past periods keep their income'
);

-- ---------------------------------------------------------------------------
-- Limits
-- ---------------------------------------------------------------------------
select lives_ok(
  format($q$do $d$ begin for i in 1..(20 - (select count(*) from public.budget_invitations where budget_id = %L)) loop
           perform public.invite_member(%L, 'filler' || i || '@test.local'); end loop; end $d$$q$,
         tests.id('b'), tests.id('b')),
  'filling up to 20 pending invitations'
);
select throws_ok(format('select public.invite_member(%L, %L)', tests.id('b'), 'one-more@test.local'),
  'P0001', 'invitation_limit_reached', 'the 21st pending invitation is rejected');

select tests.clear_authentication();
select tests.create_user('filler' || i) from generate_series(1, 19) as i;
insert into public.budget_members (budget_id, user_id)
select tests.id('b'), tests.get_user_id('filler' || i) from generate_series(1, 19) as i;
delete from public.budget_invitations where budget_id = tests.id('b') and email like 'filler%';
select tests.authenticate_as('alice');
select tests.remember('inv_carol', public.invite_member(tests.id('b'), tests.get_user_email('carol')));
select tests.authenticate_as('carol');
select throws_ok(format('select public.accept_invitation(%L)', tests.id('inv_carol')),
  'P0001', 'member_limit_reached', 'a budget has at most 20 members');

select tests.authenticate_as('alice');
select lives_ok(
  $q$do $d$ begin for i in 1..(20 - (select count(*) from public.my_budgets where is_owner)) loop
       perform public.create_budget('Budget ' || i, 'Salary', 1000, 1); end loop; end $d$$q$,
  'creating budgets up to 20 owned'
);
select throws_ok($$select public.create_budget('One too many', 'Salary', 1000, 1)$$,
  'P0001', 'budget_limit_reached', 'the 21st owned budget is rejected');

-- ---------------------------------------------------------------------------
-- Deleting
-- ---------------------------------------------------------------------------
select tests.authenticate_as('alice');
delete from public.budgets where id = tests.id('b');
select tests.clear_authentication();
select is_empty(
  format($$select 1 from public.budgets where id = %1$L
           union all select 1 from public.budget_members where budget_id = %1$L
           union all select 1 from public.incomes where budget_id = %1$L
           union all select 1 from public.income_versions where budget_id = %1$L
           union all select 1 from public.periods where budget_id = %1$L
           union all select 1 from public.budget_invitations where budget_id = %1$L$$, tests.id('b')),
  'the owner deletes the budget with everything in it'
);
select lives_ok('set constraints all immediate', 'deleting a budget leaves no invariant broken');
set constraints all deferred;

select tests.authenticate_as('carol');
select tests.remember('carol_b', public.create_budget('Carol budget', 'Salary', 1000, 1));
select tests.clear_authentication();
delete from auth.users where id = tests.get_user_id('carol');
select is_empty(
  format('select 1 from public.budgets where id = %L', tests.id('carol_b')),
  'deleting the owner''s account deletes their budgets'
);

select * from finish();
rollback;
