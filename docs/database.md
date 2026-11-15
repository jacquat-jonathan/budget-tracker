# Database API (client contract)

What the browser client may read, write and call. The generated types are in
`src/lib/database.types.ts` (`Database['public']`). Schema: the migrations in
`supabase/migrations/`; behaviour and rule ids: `docs/spec.md`.

## Conventions

- **Money**: integer rappen (`bigint`, a `number` in TypeScript). Income amounts are
  1 to 1 000 000 000 (CHF 10 million).
- **Dates**: calendar dates are `YYYY-MM-DD` strings (`date`); never convert them through
  a time zone. Timestamps (`*_at`) are ISO strings.
- **Today** is the Europe/Zurich date, decided by the database. Never use the browser's
  clock for anything the database decides or shows as "today": read `today` from
  `period_summaries` / `get_current_period`, `get_start_months`, or call `get_today()`.
- **Periods**: one per calendar month (`month`, the first day of that month). A period
  starts on that month's salary and ends the day before the next month's; `anchor_date` is
  the scheduled actual pay date of its month. Periods are numbered per budget (`seq` 1, 2,
  ...). Income validity and versions refer to `seq` (`first_seq`, `end_seq`,
  `terms_from_seq`), so moving a boundary never changes which version applies. An income
  counts in period `p` when `first_seq <= p` and (`end_seq` is null or `p < end_seq`).
- **Reads** are plain `select`s on the tables and views below; RLS returns only the rows of
  budgets you are a member of. Anything else returns no rows (never an error). Always
  filter by `budget_id` (the API returns at most 1000 rows per request).
- **Writes** go through the RPCs (`supabase.rpc(name, args)`), except the two direct
  renames listed below. Argument names start with `p_`; arguments with a default may be
  omitted.
- **Errors**: RPC errors have `code: 'P0001'` and a stable `message` from the table at the
  end; map the message to translated text. Other codes the client can meet: `42501` (no
  privilege: a column or operation the client may not touch) and `23514` (a check
  constraint on a direct rename: blank or untrimmed name). A request for a budget, income,
  period or invitation you cannot see is answered as "not found", never "forbidden". Any
  other code is a bug: report it.
- **Roles**: every member reads and edits everything in the budget, including other
  members' incomes. Owner-only: delete the budget, set the end date, invite, cancel
  invitations, remove members. Anonymous visitors can do nothing.
- **Embedding**: `budgets` has two relationships to `incomes` (its incomes, and its primary
  income). Disambiguate embeds, for example
  `budgets?select=*,incomes!incomes_budget_id_fkey(*)`; otherwise PostgREST answers
  PGRST201. Prefer the views.

## Reading

| Relation | Rows | Columns (beyond the obvious) |
| --- | --- | --- |
| `my_budgets` (view) | budgets I belong to | `id`, `name`, `owner_id`, `primary_income_id`, `end_month` (final month, first day; null: no end), `end_date` (last day tracked: the final period's end, projected while it does not exist; null: no end), `is_owner`, `created_at`, `updated_at` |
| `budget_member_list` (view) | members of my budgets | `budget_id`, `user_id`, `role` (`'owner'` \| `'member'`), `display_name` (may be null), `email`, `joined_at` |
| `budget_invitations` | pending invitations; **owner only** | `id`, `budget_id`, `email` (lower case), `invited_by`, `created_at`, `expires_at` (30 days after the last invite; an expired one cannot be accepted, re-invite to renew) |
| `income_overview` (view) | incomes, ended ones included | `id`, `budget_id`, `user_id` (whose income; null if their account was deleted), `user_display_name` (also for a former member), `name`, `is_primary`, `is_active`, `first_seq`, `end_seq`, terms in force now `amount`, `pay_day`, `weekend_rule`, `terms_from_seq`, `next_pay_date` (first actual pay date on or after today; null when ended) |
| `period_summaries` (view) | existing periods | `id`, `budget_id`, `seq`, `month`, `anchor_date`, `start_date`, `end_date` (inclusive), `end_is_manual`, `is_current`, `today`, `income_total` (incomes in force in the period, each at the version in force then) |
| `profiles` | me, people who share a budget with me, and people with an income in my budgets | `id`, `display_name`, `email` |

The underlying tables `budgets`, `budget_members`, `incomes`, `income_versions` (the
version history: `income_id`, `effective_from_seq`, `amount`, `pay_day`, `weekend_rule`)
and `periods` are readable with the same rules; prefer the views.

Periods exist only up to the current one (none starts after today) and are created on
demand. Before showing periods, call `ensure_periods` (or `get_current_period`, which does
it), for example when a budget is opened. These are cheap when nothing needs creating and
never wait for other writers.

`weekend_rule` is `'nearest'` (Sat -> Fri, Sun -> Mon, the default), `'previous'` (-> Fri),
`'next'` (-> Mon) or `'none'`.

## Direct writes

| Operation | Who | Notes |
| --- | --- | --- |
| `update budgets set name` | members | trimmed, 1-100 characters (else `23514`); no other column is writable |
| `update incomes set name` | members | as for budgets; terms change through `update_income_terms` |
| `update profiles set display_name` | myself | unchanged from step 1 |

## RPCs

All are callable by signed-in users only. "Member" means the call fails with
`budget_not_found` (or `income_not_found`, `period_not_found`, `invitation_not_found`) for
anyone else.

### Today and start months

**`get_today() -> date`** The database's today.

**`get_start_months(p_pay_day, p_weekend_rule = 'nearest') -> {today, month, start_date, is_default}[]`**
For the primary income's terms: the months a new budget may start from, newest first: the
current period's month (`is_default`), then each month back to 60 months before this
month, each with the date its first period would start. Errors: `invalid_pay_day`,
`invalid_weekend_rule`.

### Budgets

**`create_budget(p_name, p_income_name, p_amount, p_pay_day, p_weekend_rule = 'nearest', p_start_month = null, p_end_date = null) -> uuid`**
Anyone signed in. Creates the budget (caller = owner), its first income (primary, for the
caller), its periods and, if given, its end date, in one step; returns the budget id.
`p_start_month` is any date in the month to start from (one of `get_start_months`); null
means the current period. Errors: `invalid_name`, `invalid_amount`, `invalid_pay_day`,
`invalid_weekend_rule`, `invalid_start_month`, `budget_limit_reached` (20 owned budgets),
and those of `set_budget_end_date`.

**`set_budget_end_date(p_budget_id, p_end_date = null) -> my_budgets[]`** (one row)
Owner. The budget's final month becomes the month whose period contains `p_end_date`;
its last day is that period's end, a normal boundary that follows later changes of the
terms. `null` clears it and resumes period generation. Errors: `not_owner`,
`end_date_before_last_period` (it would delete periods), `invalid_end_date` (more than ten
years ahead, or not a valid date).

**`delete_budget(p_budget_id) -> void`** Owner. Deletes the budget and everything in it.
Errors: `budget_not_found` (also when already deleted), `not_owner`.

### Members and invitations

**`invite_member(p_budget_id, p_email) -> uuid`** Owner. Returns the invitation id; inviting
the same address again returns the same id and renews it for 30 days. The answer is the same
whether or not the address has an account. Errors: `not_owner`, `invalid_email`,
`already_member`, `invitation_limit_reached` (20 pending, expired ones excluded).

**`cancel_invitation(p_invitation_id) -> void`** Owner. Errors: `invitation_not_found` (also
when already accepted, declined or cancelled), `not_owner`.

**`list_my_invitations() -> {id, budget_id, budget_name, invited_by_name, invited_by_email, created_at, expires_at}[]`**
Unexpired invitations addressed to my **verified** email. An unverified account sees none.

**`accept_invitation(p_invitation_id) -> uuid`** (budget id) and
**`decline_invitation(p_invitation_id) -> void`**. Only for an unexpired invitation
addressed to my verified email. Errors: `invitation_not_found` (also for someone else's,
an expired or a cancelled invitation), `member_limit_reached` (20 members).

**`remove_member(p_budget_id, p_user_id) -> void`** Owner. **`leave_budget(p_budget_id) -> void`**
Member other than the owner. The person's incomes end from the current period (or are
deleted if they never counted in a past period). Errors: `not_owner`, `member_not_found`,
`owner_cannot_leave`, `member_has_primary_income` (make another income primary first).

### Incomes

**`add_income(p_budget_id, p_name, p_amount, p_pay_day, p_weekend_rule = 'nearest', p_user_id = null, p_from_period_id = null) -> uuid`**
Member. `p_user_id`: whose income (default the caller; must be a member).
`p_from_period_id`: a period of this budget from which it counts (default the current one;
an earlier one back-dates it). Errors: `invalid_*`, `member_not_found`, `period_not_found`,
`income_limit_reached` (50 incomes in force, or 500 incomes in all including ended ones),
`budget_ended`.

**`update_income_terms(p_income_id, p_amount, p_pay_day, p_weekend_rule, p_from_period_id = null) -> void`**
Member. New terms from the current period; past periods keep theirs. A second edit in the
same period replaces the first. With `p_from_period_id`, an explicit correction: the terms
apply from that period of the income on (for example to fix a back-dated typo). Either way,
versions for later periods are discarded, so the terms just saved hold from that period on.
For the primary income the current period keeps its start and its end moves to the day
before the next month's pay date under the new terms; a manual end is kept if it is still
within 14 days of that date. Errors: `income_not_found`, `invalid_*`, `income_ended`,
`invalid_period` (before the income starts), `period_not_found`, `budget_ended`.

**`set_primary_income(p_income_id) -> void`** Member. Re-projects the current period's end
as above. Errors: `income_not_found`, `income_ended`, `income_not_in_force` (it starts in a
later period), `budget_ended`.

**`remove_income(p_income_id, p_from_period_id = null) -> 'deleted' | 'ended'`** Member.
From the current period by default, or, as an explicit correction, from an earlier period.
Removed from the period it started in (or earlier) it is deleted; otherwise it ends there
and stops counting from that period on. Errors: `income_not_found`, `income_is_primary` (this
also protects the last income), `income_ended`, `period_not_found`.

### Periods

**`ensure_periods(p_budget_id) -> integer`** Member. Creates the missing periods up to the
current one (or the final month) and returns how many. Idempotent; concurrent calls are safe.

**`get_current_period(p_budget_id) -> period_summaries[]`** Member. Ensures periods, then
returns the current period as one row, or no row when the budget has ended.

**`move_period_boundary(p_period_id, p_new_end = null) -> void`** Member. Sets the boundary
after a period (its last day, and so the next period's first day) by hand, to match when the
salary really arrived; `null` resets it to the schedule. The next period must start within
14 days of its month's scheduled pay date. By position:

- *latest period*: sets the current period's end. A date before today closes it and the
  next month's period starts (salary arrived early).
- *period before the latest*: a date on or after today means the salary has not arrived
  yet: the latest period is removed and this one is current again (undo with `null` or by
  moving the boundary back before today).
- *older periods*: moves the boundary between two closed periods.

Every move has an inverse: move back, or reset with `null`. Errors: `period_not_found`,
`invalid_boundary` (more than 14 days from the salary, the period would be empty, the next
one would be swallowed, or not a valid date), `boundary_after_today` (a boundary that is not
the latest cannot move to today or later; normally unreachable because of the 14-day rule).

### Pure helper

**`pay_date(p_year, p_month, p_pay_day, p_weekend_rule = 'nearest') -> date`** The actual pay
date of a nominal pay day in a month (clamped to the month's length, then the weekend rule),
for previews in forms. Error: `invalid_pay_day`.

## Error messages

| Message | Meaning |
| --- | --- |
| `not_authenticated` | no signed-in user |
| `budget_not_found`, `income_not_found`, `period_not_found`, `member_not_found`, `invitation_not_found` | does not exist (any more) or not visible to you |
| `not_owner` | only the owner may do this |
| `owner_cannot_leave` | the owner deletes the budget instead |
| `member_has_primary_income` | make another income primary first |
| `already_member` | the invited address belongs to a member |
| `invalid_name`, `invalid_amount`, `invalid_pay_day`, `invalid_weekend_rule`, `invalid_email`, `invalid_start_month`, `invalid_end_date`, `invalid_boundary`, `invalid_period` | invalid argument |
| `end_date_before_last_period` | the end date would remove existing periods |
| `boundary_after_today` | an earlier boundary cannot move to today or later |
| `income_is_primary` | switch the primary income first |
| `income_ended` | the income has ended (for that period) |
| `income_not_in_force` | the income only starts in a later period |
| `budget_ended` | no current period: the budget is past its end date |
| `budget_limit_reached`, `member_limit_reached`, `invitation_limit_reached`, `income_limit_reached` | a limit (20 owned budgets, 20 members, 20 pending invitations, 50 incomes in force or 500 in all) |

## For later tables

Every budget-owned table (categories, transactions, ...) has a `budget_id`, RLS enabled
in its migration, and policies of the form
`budget_id in (select private.member_budget_ids())` (members) or
`budget_id in (select private.owned_budget_ids())` (owner). Multi-row or invariant-bearing
writes are `security definer` RPCs that check membership (`private.assert_member`), take
`private.lock_budget(budget_id)`, and only then read the rows they check. Versioned terms
use an `effective_from_seq` column, a unique key on (entity, `effective_from_seq`), and the
trigger `private.discard_later_versions('<entity column>')`, like `income_versions`.
