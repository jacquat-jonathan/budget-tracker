-- Members, roles and invitations.
begin;
select plan(66);

select tests.create_user('alice', 'Alice');
select tests.create_user('bob', 'Bob');
select tests.create_user('carol', 'Carol');
select tests.create_user('dave', 'Dave');
select tests.create_user('eve', 'Eve', false);   -- email not verified
select tests.set_today('2026-11-15');

select tests.authenticate_as('alice');
select tests.remember('b', public.create_budget('Home', 'Alice salary', 500000, 25, 'nearest', '2026-09-01'));
select results_eq(
  format('select owner_id, is_owner from public.my_budgets where id = %L', tests.id('b')),
  format('values (%L::uuid, true)', tests.get_user_id('alice')),
  'R-BUDGET-002 R-BUDGET-003: the creator is the owner and a member'
);

-- ---------------------------------------------------------------------------
-- Inviting
-- ---------------------------------------------------------------------------
select tests.remember('inv_bob', public.invite_member(tests.id('b'), tests.get_user_email('bob')));
select tests.clear_authentication();
update public.budget_invitations set expires_at = now() + interval '1 day' where id = tests.id('inv_bob');
select tests.authenticate_as('alice');
select is(
  public.invite_member(tests.id('b'), '  ' || upper(tests.get_user_email('bob')) || ' '),
  tests.id('inv_bob'),
  'R-INVITE-009: inviting the same address again (any case, spaces) returns the same invitation'
);
select results_eq(
  format('select email, invited_by, expires_at > now() + interval ''29 days'' from public.budget_invitations where budget_id = %L', tests.id('b')),
  format('values (%L, %L::uuid, true)', tests.get_user_email('bob'), tests.get_user_id('alice')),
  'R-INVITE-001 R-INVITE-009: the owner sees the pending invitation in lower case, renewed for 30 days'
);
select throws_ok(
  format('select public.invite_member(%L, %L)', tests.id('b'), tests.get_user_email('alice')),
  'P0001', 'already_member', 'R-INVITE-001: inviting a member is rejected'
);
select throws_ok(
  format('select public.invite_member(%L, %L)', tests.id('b'), 'not-an-email'),
  'P0001', 'invalid_email', 'R-INVITE-001: an invalid address is rejected'
);
select isnt(
  public.invite_member(tests.id('b'), 'nobody-has-this-' || extensions.gen_random_uuid() || '@test.local'),
  null,
  'R-INVITE-005: inviting an address without an account succeeds like any other'
);
select tests.remember('inv_eve', public.invite_member(tests.id('b'), tests.get_user_email('eve')));
select tests.remember('inv_dave', public.invite_member(tests.id('b'), tests.get_user_email('dave')));

-- ---------------------------------------------------------------------------
-- The invited person's side
-- ---------------------------------------------------------------------------
select tests.authenticate_as('bob');
select results_eq(
  'select id, budget_id, budget_name, invited_by_name, invited_by_email from public.list_my_invitations()',
  format('values (%L::uuid, %L::uuid, %L, %L, %L)', tests.id('inv_bob'), tests.id('b'), 'Home', 'Alice', tests.get_user_email('alice')),
  'R-INVITE-003 R-INVITE-008: the invited person sees the budget name and who invited them, with their email'
);
select is_empty(
  format('select 1 from public.budgets where id = %L', tests.id('b')),
  'R-SECURITY-002: but not the budget itself before accepting'
);

select tests.authenticate_as('carol');
select is_empty('select 1 from public.list_my_invitations()', 'R-INVITE-003: someone else sees no invitations');
select throws_ok(
  format('select public.accept_invitation(%L)', tests.id('inv_bob')),
  'P0001', 'invitation_not_found', 'R-INVITE-003 R-SECURITY-004: an invitation addressed to someone else cannot be accepted'
);
select throws_ok(
  format('select public.decline_invitation(%L)', tests.id('inv_bob')),
  'P0001', 'invitation_not_found', 'R-INVITE-003: nor declined'
);
select is_empty(
  format('select 1 from public.budget_invitations where id = %L', tests.id('inv_bob')),
  'R-INVITE-003: nor read'
);

select tests.authenticate_as('eve');
select is_empty('select 1 from public.list_my_invitations()',
  'R-INVITE-003: a user whose email is not verified sees no invitations');
select throws_ok(
  format('select public.accept_invitation(%L)', tests.id('inv_eve')),
  'P0001', 'invitation_not_found', 'R-INVITE-003: and cannot accept one addressed to that email'
);

-- Expiry
select tests.clear_authentication();
update public.budget_invitations set expires_at = now() - interval '1 second' where id = tests.id('inv_dave');
select tests.authenticate_as('dave');
select is_empty('select 1 from public.list_my_invitations()', 'R-INVITE-007: an expired invitation is not listed');
select throws_ok(format('select public.accept_invitation(%L)', tests.id('inv_dave')),
  'P0001', 'invitation_not_found', 'R-INVITE-007 R-INVITE-010: nor can it be accepted');
select tests.authenticate_as('alice');
select is(public.invite_member(tests.id('b'), tests.get_user_email('dave')), tests.id('inv_dave'),
  'R-INVITE-007 R-INVITE-009: the owner re-invites: the same invitation is valid again');
select tests.authenticate_as('dave');
select lives_ok(format('select public.decline_invitation(%L)', tests.id('inv_dave')), 'R-INVITE-004: declining');
select tests.authenticate_as('alice');
select is_empty(
  format('select 1 from public.budget_invitations where id = %L', tests.id('inv_dave')),
  'R-INVITE-004: removes the invitation'
);

select tests.authenticate_as('bob');
select tests.remember('bob_own', public.create_budget('Bob alone', 'Bob salary', 300000, 25));
select is(public.accept_invitation(tests.id('inv_bob')), tests.id('b'), 'R-INVITE-004: accepting returns the budget id');
select is(
  (select count(*)::integer from public.my_budgets where id in (tests.id('b'), tests.id('bob_own'))),
  2,
  'R-BUDGET-004: a user can belong to several budgets'
);
select results_eq(
  format('select user_id, role, display_name, email from public.budget_member_list where budget_id = %L order by role desc',
         tests.id('b')),
  format('values (%L::uuid, %L, %L, %L), (%L::uuid, %L, %L, %L)',
         tests.get_user_id('alice'), 'owner', 'Alice', tests.get_user_email('alice'),
         tests.get_user_id('bob'), 'member', 'Bob', tests.get_user_email('bob')),
  'R-MEMBER-001: the new member sees every member with name, email and role'
);
select is(
  (select display_name from public.profiles where id = tests.get_user_id('alice')),
  'Alice',
  'R-PROFILE-003: co-members can read each other''s profiles'
);
select is_empty('select 1 from public.list_my_invitations()', 'R-INVITE-004: the accepted invitation is gone');
select is_empty(
  format('select 1 from public.budget_invitations where budget_id = %L', tests.id('b')),
  'R-MEMBER-004: a plain member cannot read the budget''s invitations'
);
select tests.authenticate_as('carol');
select is_empty(
  format('select 1 from public.profiles where id = %L', tests.get_user_id('alice')),
  'R-PROFILE-003: non-members cannot read the members'' profiles'
);

-- Owner cancels an invitation; a member cannot; each refusal says why.
select tests.authenticate_as('bob');
select throws_ok(format('select public.cancel_invitation(%L)', tests.id('inv_eve')),
  'P0001', 'not_owner', 'R-MEMBER-004 R-BUDGET-018: a member cannot cancel an invitation, and is told why');
select throws_ok(format('delete from public.budget_invitations where id = %L', tests.id('inv_eve')),
  '42501', null, 'R-MEMBER-004: nor delete it directly');
select tests.authenticate_as('alice');
select lives_ok(format('select public.cancel_invitation(%L)', tests.id('inv_eve')), 'R-MEMBER-004: the owner cancels it');
select is_empty(
  format('select 1 from public.budget_invitations where id = %L', tests.id('inv_eve')),
  'R-MEMBER-004: and it is gone'
);
select throws_ok(format('select public.cancel_invitation(%L)', tests.id('inv_eve')),
  'P0001', 'invitation_not_found', 'R-BUDGET-018: cancelling it again says it is gone');

-- ---------------------------------------------------------------------------
-- Roles: what a plain member cannot do
-- ---------------------------------------------------------------------------
select tests.authenticate_as('bob');
select throws_ok(format('select public.invite_member(%L, %L)', tests.id('b'), 'x@test.local'),
  'P0001', 'not_owner', 'R-MEMBER-004: a member cannot invite');
select throws_ok(format('select public.remove_member(%L, %L)', tests.id('b'), tests.get_user_id('alice')),
  'P0001', 'not_owner', 'R-MEMBER-004: a member cannot remove members');
select throws_ok(format('select public.set_budget_end_date(%L, %L)', tests.id('b'), '2027-01-01'),
  'P0001', 'not_owner', 'R-MEMBER-003: a member cannot set the end date');
select throws_ok(format('select public.delete_budget(%L)', tests.id('b')),
  'P0001', 'not_owner', 'R-MEMBER-002 R-BUDGET-018: a member cannot delete the budget, and is told why');
select throws_ok(format('delete from public.budgets where id = %L', tests.id('b')),
  '42501', null, 'R-MEMBER-002: nor delete it directly');
select throws_ok(
  format('update public.budgets set owner_id = %L where id = %L', tests.get_user_id('bob'), tests.id('b')),
  '42501', null, 'R-BUDGET-002: a member cannot make themselves owner');
select throws_ok(
  format('insert into public.budget_members (budget_id, user_id) values (%L, %L)', tests.id('b'), tests.get_user_id('carol')),
  '42501', null, 'R-MEMBER-004: a member cannot add members directly');
update public.budgets set name = 'Our home' where id = tests.id('b');
select is((select name from public.budgets where id = tests.id('b')), 'Our home',
  'R-BUDGET-009 R-MEMBER-001: a member can rename the budget');

-- ---------------------------------------------------------------------------
-- Leaving and removal end the person's incomes from the current period
-- ---------------------------------------------------------------------------
select tests.remember('bob_past', public.add_income(tests.id('b'), 'Bob salary', 300000, 25, 'nearest', null,
  (select id from public.periods where budget_id = tests.id('b') and seq = 1)));
select tests.remember('bob_now', public.add_income(tests.id('b'), 'Bob bonus', 1000, 25));

select tests.authenticate_as('alice');
select throws_ok(format('select public.leave_budget(%L)', tests.id('b')),
  'P0001', 'owner_cannot_leave', 'R-MEMBER-006: the owner cannot leave');
select throws_ok(format('select public.remove_member(%L, %L)', tests.id('b'), tests.get_user_id('alice')),
  'P0001', 'owner_cannot_leave', 'R-MEMBER-006: the owner cannot remove themselves');
select throws_ok(format('select public.remove_member(%L, %L)', tests.id('b'), tests.get_user_id('carol')),
  'P0001', 'member_not_found', 'R-MEMBER-004: removing a non-member');

select public.set_primary_income(tests.id('bob_past'));
select throws_ok(format('select public.remove_member(%L, %L)', tests.id('b'), tests.get_user_id('bob')),
  'P0001', 'member_has_primary_income', 'R-MEMBER-009: a member with the primary income cannot be removed');
select tests.authenticate_as('bob');
select throws_ok(format('select public.leave_budget(%L)', tests.id('b')),
  'P0001', 'member_has_primary_income', 'R-MEMBER-009: nor leave');
select public.set_primary_income((select id from public.incomes where budget_id = tests.id('b') and user_id = tests.get_user_id('alice')));

select lives_ok(format('select public.leave_budget(%L)', tests.id('b')), 'R-MEMBER-005: a member leaves');
select is_empty(format('select 1 from public.budgets where id = %L', tests.id('b')),
  'R-MEMBER-005: and no longer sees the budget');
select tests.authenticate_as('alice');
select results_eq(
  format('select id, end_seq from public.incomes where budget_id = %L and user_id = %L', tests.id('b'), tests.get_user_id('bob')),
  format('values (%L::uuid, 2)', tests.id('bob_past')),
  'R-MEMBER-007: their income that counted in the past ends from the current period; the new one is deleted'
);
select results_eq(
  format('select seq, income_total from public.period_summaries where budget_id = %L order by seq', tests.id('b')),
  $$values (1, 800000::bigint), (2, 500000::bigint)$$,
  'R-MEMBER-008: past periods keep their income'
);
select is(
  (select user_display_name from public.income_overview where id = tests.id('bob_past')),
  'Bob',
  'R-PROFILE-004: the former member''s ended income keeps their name'
);

-- ---------------------------------------------------------------------------
-- Limits
-- ---------------------------------------------------------------------------
select lives_ok(
  format($q$do $d$ begin for i in 1..(20 - (select count(*) from public.budget_invitations where budget_id = %L)) loop
           perform public.invite_member(%L, 'filler' || i || '@test.local'); end loop; end $d$$q$,
         tests.id('b'), tests.id('b')),
  'R-INVITE-006: filling up to 20 pending invitations'
);
select throws_ok(format('select public.invite_member(%L, %L)', tests.id('b'), 'one-more@test.local'),
  'P0001', 'invitation_limit_reached', 'R-INVITE-006: the 21st pending invitation is rejected');
select tests.clear_authentication();
update public.budget_invitations set expires_at = now() - interval '1 second'
where budget_id = tests.id('b') and email = 'filler1@test.local';
select tests.authenticate_as('alice');
select lives_ok(format('select public.invite_member(%L, %L)', tests.id('b'), 'one-more@test.local'),
  'R-INVITE-006 R-INVITE-007: expired invitations do not count');

select tests.clear_authentication();
select tests.create_user('filler' || i) from generate_series(1, 19) as i;
insert into public.budget_members (budget_id, user_id)
select tests.id('b'), tests.get_user_id('filler' || i) from generate_series(1, 19) as i;
delete from public.budget_invitations where budget_id = tests.id('b');
select tests.authenticate_as('alice');
select tests.remember('inv_carol', public.invite_member(tests.id('b'), tests.get_user_email('carol')));
select tests.authenticate_as('carol');
select throws_ok(format('select public.accept_invitation(%L)', tests.id('inv_carol')),
  'P0001', 'member_limit_reached', 'R-MEMBER-010: a budget has at most 20 members');

select tests.authenticate_as('alice');
select lives_ok(
  $q$do $d$ begin for i in 1..(20 - (select count(*) from public.my_budgets where is_owner)) loop
       perform public.create_budget('Budget ' || i, 'Salary', 1000, 1); end loop; end $d$$q$,
  'R-BUDGET-012: creating budgets up to 20 owned'
);
select throws_ok($$select public.create_budget('One too many', 'Salary', 1000, 1)$$,
  'P0001', 'budget_limit_reached', 'R-BUDGET-012: the 21st owned budget is rejected');

-- ---------------------------------------------------------------------------
-- Removal from a budget that has ended changes none of its history
-- ---------------------------------------------------------------------------
select tests.authenticate_as('dave');
select tests.remember('over', public.create_budget('Over', 'Dave salary', 500000, 25, 'nearest', '2026-09-01'));
select public.set_budget_end_date(tests.id('over'), '2026-11-01');   -- final month: October
select tests.remember('inv_bob2', public.invite_member(tests.id('over'), tests.get_user_email('bob')));
select tests.authenticate_as('bob');
select public.accept_invitation(tests.id('inv_bob2'));
select tests.remember('bob_over', public.add_income(tests.id('over'), 'Bob salary', 200000, 25, 'nearest', null,
  (select id from public.periods where budget_id = tests.id('over') and seq = 1)));
select tests.clear_authentication();
select tests.set_today('2026-12-10');
select tests.authenticate_as('dave');
select lives_ok(format('select public.remove_member(%L, %L)', tests.id('over'), tests.get_user_id('bob')),
  'R-MEMBER-007: removing a member after the budget has ended');
select results_eq(
  format('select end_seq from public.incomes where id = %L', tests.id('bob_over')),
  $$values (3)$$,
  'R-MEMBER-008: ends their income after the last period'
);
select results_eq(
  format('select seq, income_total from public.period_summaries where budget_id = %L order by seq', tests.id('over')),
  $$values (1, 700000::bigint), (2, 700000::bigint)$$,
  'R-MEMBER-008: every period of the ended budget keeps its income'
);

-- ---------------------------------------------------------------------------
-- Invariants against direct writes by a privileged role
-- ---------------------------------------------------------------------------
select tests.clear_authentication();
select lives_ok('set constraints all immediate', 'R-BUDGET-003 R-INCOME-006: invariants hold');
set constraints all deferred;
delete from public.budget_members where budget_id = tests.id('over') and user_id = tests.get_user_id('dave');
select throws_ok('set constraints all immediate', '23514', 'owner_must_be_member',
  'R-BUDGET-003: the owner''s membership cannot be removed while the budget exists');
set constraints all deferred;
insert into public.budget_members (budget_id, user_id) values (tests.id('over'), tests.get_user_id('dave'));
update public.incomes set end_seq = 2
where id = (select primary_income_id from public.budgets where id = tests.id('over'));
select throws_ok('set constraints all immediate', '23514', 'primary_income_must_be_active',
  'R-INCOME-006: the primary income cannot be ended');
set constraints all deferred;
update public.incomes set end_seq = null
where id = (select primary_income_id from public.budgets where id = tests.id('over'));

-- ---------------------------------------------------------------------------
-- Deleting
-- ---------------------------------------------------------------------------
select tests.authenticate_as('alice');
select lives_ok(format('select public.delete_budget(%L)', tests.id('b')), 'R-BUDGET-009: the owner deletes the budget');
select throws_ok(format('select public.delete_budget(%L)', tests.id('b')),
  'P0001', 'budget_not_found', 'R-BUDGET-018: deleting it again says it is gone');
select tests.clear_authentication();
select is_empty(
  format($$select 1 from public.budgets where id = %1$L
           union all select 1 from public.budget_members where budget_id = %1$L
           union all select 1 from public.incomes where budget_id = %1$L
           union all select 1 from public.income_versions where budget_id = %1$L
           union all select 1 from public.periods where budget_id = %1$L
           union all select 1 from public.budget_invitations where budget_id = %1$L$$, tests.id('b')),
  'R-MEMBER-002 R-BUDGET-009 R-BUDGET-001: the owner deletes the budget with everything in it'
);
select lives_ok('set constraints all immediate', 'R-BUDGET-011: deleting a budget leaves no invariant broken');
set constraints all deferred;

select tests.authenticate_as('carol');
select tests.remember('carol_b', public.create_budget('Carol budget', 'Salary', 1000, 1));
select tests.clear_authentication();
delete from auth.users where id = tests.get_user_id('carol');
select is_empty(
  format('select 1 from public.budgets where id = %L', tests.id('carol_b')),
  'R-BUDGET-016: deleting the owner''s account deletes their budgets'
);

select * from finish();
rollback;
