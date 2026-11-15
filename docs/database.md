# Database API (client contract)

What the browser client may read, write and call. The generated types are in
`src/lib/database.types.ts` (`Database['public']`). Schema: the migrations in
`supabase/migrations/`; behaviour: `docs/domain.md`.

## Conventions

- **Money**: integer rappen (`bigint`, a `number` in TypeScript). Income amounts are
  1 to 1 000 000 000 (CHF 10 million).
- **Dates**: calendar dates are `YYYY-MM-DD` strings (`date`); never convert them through
  a time zone. Timestamps (`*_at`) are ISO strings.
- **Today** is the Europe/Zurich date, decided by the database. Never send "today" from
  the browser.
- **Periods** are numbered per budget: `seq` 1, 2, ... Income validity and versions refer to
  `seq` (`first_seq`, `end_seq`, `terms_from_seq`), so moving a boundary never changes
  which version applies. An income counts in period `p` when
  `first_seq <= p` and (`end_seq` is null or `p < end_seq`).
- **Reads** are plain `select`s on the tables and views below; RLS returns only the rows of
  budgets you are a member of. Anything else returns no rows (never an error).
- **Writes** go through the RPCs (`supabase.rpc(name, args)`), except the few direct
  updates and deletes listed below. Argument names start with `p_`.
- **Errors**: RPC errors have `code: 'P0001'` and a stable `message` from the table at the
  end; map the message to translated text. Other codes the client can meet:
  `42501` (no privilege: a column or operation the client may not touch),
  `23514` (a check constraint, for example a name that is blank or not trimmed on a
  direct update). A request for a budget, income, period or invitation you cannot see is
  answered as "not found", never "forbidden".
- **Roles**: every member reads and edits everything in the budget. Owner-only: delete the
  budget, set the end date, invite, cancel invitations, remove members. Anonymous visitors
  can do nothing.

## Reading

| Relation | Rows | Columns (beyond the obvious) |
| --- | --- | --- |
| `my_budgets` (view) | budgets I belong to | `id`, `name`, `owner_id`, `primary_income_id`, `end_date` (null: no end), `is_owner`, `created_at`, `updated_at` |
| `budget_member_list` (view) | members of my budgets | `budget_id`, `user_id`, `role` (`'owner'` \| `'member'`), `display_name` (may be null), `email`, `joined_at` |
| `budget_invitations` | pending invitations; **owner only** | `id`, `budget_id`, `email` (lower case), `invited_by`, `created_at` |
| `income_overview` (view) | incomes, ended ones included | `id`, `budget_id`, `user_id` (whose income; null if their account was deleted), `name`, `is_primary`, `is_active`, `first_seq`, `end_seq`, current terms `amount`, `pay_day`, `weekend_rule`, `terms_from_seq`, `next_pay_date` (first actual pay date on or after today; null when ended) |
| `period_summaries` (view) | existing periods | `id`, `budget_id`, `seq`, `start_date`, `end_date` (inclusive), `end_is_manual`, `is_current`, `income_total` (incomes in force in the period, each at the version in force then) |
| `profiles` | me and people who share a budget with me | `id`, `display_name`, `email` |

The underlying tables `budgets`, `budget_members`, `incomes`, `income_versions` (the
version history: `income_id`, `effective_from_seq`, `amount`, `pay_day`, `weekend_rule`)
and `periods` are readable with the same rules; prefer the views.

Periods exist only up to the current one and are created on demand. Before showing
periods, call `ensure_periods` (or `get_current_period`, which does it), for example when a
budget is opened.

`weekend_rule` is `'nearest'` (Sat -> Fri, Sun -> Mon, the default), `'previous'` (-> Fri),
`'next'` (-> Mon) or `'none'`.

## Direct writes

| Operation | Who | Notes |
| --- | --- | --- |
| `update budgets set name` | members | trimmed, 1-100 characters (else `23514`); no other column is writable |
| `delete from budgets` | owner | deletes everything in the budget; a member's delete affects 0 rows |
| `update incomes set name` | members | as for budgets; terms change through `update_income_terms` |
| `update profiles set display_name` | myself | unchanged from step 1 |
| `delete from budget_invitations` | owner | cancels an invitation |

## RPCs

All are callable by signed-in users only. "Member" means the call fails with
`budget_not_found` (or `income_not_found`, `period_not_found`) for anyone else.

### Budgets

**`create_budget(p_name, p_income_name, p_amount, p_pay_day, p_weekend_rule = 'nearest', p_start_month = null) -> uuid`**
Anyone signed in. Creates the budget (caller = owner), its first income (primary, for the
caller) and its periods, in one step; returns the budget id. `p_start_month` is any date in
the month to start tracking from; null means the current period. The first period starts
on that month's actual pay date, which must not be after today; at most 60 months back.
Errors: `invalid_name`, `invalid_amount`, `invalid_pay_day`, `invalid_weekend_rule`,
`invalid_start_month`, `budget_limit_reached` (20 owned budgets).

**`set_budget_end_date(p_budget_id, p_end_date) -> date`**
Owner. Sets the last day tracked, moved forward to the end of the period that contains
`p_end_date` (projected with the primary income's current terms); returns the stored date.
`null` clears it and resumes period generation. Errors: `not_owner`,
`end_date_before_last_period` (it would delete periods), `invalid_end_date` (more than ten
years ahead).

### Members and invitations

**`invite_member(p_budget_id, p_email) -> uuid`** Owner. Returns the invitation id; inviting
the same address again returns the same id. The answer is the same whether or not the
address has an account. Errors: `not_owner`, `invalid_email`, `already_member`,
`invitation_limit_reached` (20 pending).

**`list_my_invitations() -> {id, budget_id, budget_name, invited_by_name, created_at}[]`**
Invitations addressed to my **verified** email. An unverified account sees none.

**`accept_invitation(p_invitation_id) -> uuid`** (budget id) and
**`decline_invitation(p_invitation_id) -> void`**. Only for an invitation addressed to my
verified email. Errors: `invitation_not_found` (also for someone else's invitation),
`member_limit_reached` (20 members).

**`remove_member(p_budget_id, p_user_id) -> void`** Owner. **`leave_budget(p_budget_id) -> void`**
Member other than the owner. The person's incomes end from the current period (or are
deleted if they never counted in a past period). Errors: `not_owner`, `member_not_found`,
`owner_cannot_leave`, `member_has_primary_income` (make another income primary first).

### Incomes

**`add_income(p_budget_id, p_name, p_amount, p_pay_day, p_weekend_rule = 'nearest', p_user_id = null, p_from_period_id = null) -> uuid`**
Member. `p_user_id`: whose income (default the caller; must be a member).
`p_from_period_id`: a period of this budget from which it counts (default the current one;
an earlier one back-dates it). Errors: `invalid_*`, `member_not_found`, `period_not_found`,
`income_limit_reached` (50 per budget, ended ones included), `budget_ended`.

**`update_income_terms(p_income_id, p_amount, p_pay_day, p_weekend_rule) -> void`**
Member. New terms from the current period; past periods keep theirs. A second edit in the
same period replaces the first. For the primary income the current period keeps its start
and its projected end moves to the day before the first new pay date after today (unless
set by hand). Errors: `income_not_found`, `invalid_*`, `income_ended`, `budget_ended`.

**`set_primary_income(p_income_id) -> void`** Member. Re-projects the current period's end
as above. Errors: `income_not_found`, `income_ended`.

**`remove_income(p_income_id) -> 'deleted' | 'ended'`** Member. Deleted if it never counted
in a past period, otherwise ended from the current period. Errors: `income_not_found`,
`income_is_primary` (this also protects the last income), `income_ended`.

### Periods

**`ensure_periods(p_budget_id) -> integer`** Member. Creates the missing periods up to the
current one (or the end date) and returns how many. Idempotent; concurrent calls are safe.

**`get_current_period(p_budget_id) -> period_summaries[]`** Member. Ensures periods, then
returns the current period as one row, or no row when the budget has ended.

**`move_period_boundary(p_period_id, p_new_end) -> void`** Member. Sets the period's last day
(and so the next period's first day) by hand, for example when a public holiday moved the
salary; such a boundary is never recomputed. On the last period it sets the current
period's end; a date before today closes it and starts the next one. `p_new_end = null` on
the last period clears the manual end and re-projects it. Errors: `period_not_found`,
`invalid_boundary` (period would be empty or over 70 days, or it would swallow the next
period, or `null` on a period that is not the last), `boundary_is_budget_end`.

### Pure helper

**`pay_date(p_year, p_month, p_pay_day, p_weekend_rule = 'nearest') -> date`** The actual pay
date of a nominal pay day in a month (clamped to the month's length, then the weekend rule),
for previews in forms. Error: `invalid_pay_day`.

## Error messages

| Message | Meaning |
| --- | --- |
| `not_authenticated` | no signed-in user |
| `budget_not_found`, `income_not_found`, `period_not_found`, `member_not_found`, `invitation_not_found` | does not exist or not visible to you |
| `not_owner` | only the owner may do this |
| `owner_cannot_leave` | the owner deletes the budget instead |
| `member_has_primary_income` | make another income primary first |
| `already_member` | the invited address belongs to a member |
| `invalid_name`, `invalid_amount`, `invalid_pay_day`, `invalid_weekend_rule`, `invalid_email`, `invalid_start_month`, `invalid_end_date`, `invalid_boundary` | invalid argument |
| `end_date_before_last_period` | the end date would remove existing periods |
| `boundary_is_budget_end` | this boundary is the budget's end date; change the end date instead |
| `income_is_primary` | switch the primary income first |
| `income_ended` | the income has ended |
| `budget_ended` | no current period: the budget is past its end date |
| `budget_limit_reached`, `member_limit_reached`, `invitation_limit_reached`, `income_limit_reached` | a limit (20 owned budgets, 20 members, 20 pending invitations, 50 incomes) |

## For later tables

Every budget-owned table (categories, transactions, ...) has a `budget_id`, RLS enabled
in its migration, and policies of the form
`budget_id in (select private.member_budget_ids())` (members) or
`budget_id in (select private.owned_budget_ids())` (owner). Multi-row or invariant-bearing
writes are `security definer` RPCs that start with `private.assert_member(budget_id)` and
take `private.lock_budget(budget_id)` when they create or move periods. Versioned terms
use `effective_from_seq` like `income_versions`.
