# Database API (client contract)

What the browser client may read, write and call. The generated types are in
`src/lib/database.types.ts` (`Database['public']`). Schema: the migrations in
`supabase/migrations/`; behaviour and rule ids: `docs/spec.md`. Each relation and RPC
below lists the rule ids it implements.

## Conventions

- **Money**: integer rappen (`bigint`, a `number` in TypeScript). Income amounts are
  1 to 1 000 000 000 (CHF 10 million). (R-MONEY-002, R-INCOME-014)
- **Dates**: calendar dates are `YYYY-MM-DD` strings (`date`); never convert them through
  a time zone. Timestamps (`*_at`) are ISO strings. (C-DATE-001, C-DATE-002)
- **Today** is the Europe/Zurich date, decided by the database. Never use the browser's
  clock for anything the database decides or shows as "today": read `today` from
  `period_summaries` / `get_current_period`, `get_start_months`, or call `get_today()`.
  (R-PERIOD-017, R-PERIOD-028)
- **Periods** run from one salary to the day before the next. Stored periods are facts:
  only the boundary operations below move a stored boundary. The schedule only predicts
  the next pay date: the first actual pay date of the primary income, under the terms in
  force, at least 15 days after the period's start (and after today when re-projecting
  after a change of terms). Every period is 7 to 92 days long; none starts after today or
  after the budget's end date. (R-PERIOD-020, R-PERIOD-022, R-PERIOD-029, R-PERIOD-030)
- **Period numbers**: periods are numbered per budget (`seq` 1, 2, ...). Income validity
  and versions refer to `seq` (`first_seq`, `end_seq`, `terms_from_seq`). An income counts
  in period `p` when `first_seq <= p` and (`end_seq` is null or `p < end_seq`). Nothing is
  ever keyed beyond the latest period. Identify a period by its dates in the UI; `seq` may
  change meaning when a period is merged (reopen). (R-PERIOD-018, R-VERSION-011)
- **Reads** are plain `select`s on the tables and views below; RLS returns only the rows of
  budgets you are a member of. Anything else returns no rows (never an error). Always
  filter by `budget_id` (the API returns at most 1000 rows per request). (R-SECURITY-002)
- **Writes** go through the RPCs (`supabase.rpc(name, args)`), except the two direct
  renames listed below. Argument names start with `p_`; arguments with a default may be
  omitted (omit, rather than send `null`, to use the default). Every write RPC first
  creates the missing periods up to today. (R-PERIOD-032)
- **Errors**: RPC errors have `code: 'P0001'` and a stable `message` from the table at the
  end; map the message to translated text. Other codes the client can meet: `42501` (no
  privilege: a column or operation the client may not touch) and `23514` (a check
  constraint on a direct rename: blank or untrimmed name). A request for a budget, income,
  period or invitation you cannot see is answered as "not found", never "forbidden".
  **Any other code is a bug**: report it. (R-SECURITY-004, R-SECURITY-007)
- **Roles**: every member reads and edits everything in the budget, including other
  members' incomes. Owner-only: delete the budget, set the end date, invite, cancel
  invitations, remove members. Anonymous visitors can do nothing. (R-MEMBER-001 to
  R-MEMBER-004, R-INCOME-050, R-SECURITY-003)
- **Embedding**: `budgets` has two relationships to `incomes` (its incomes, and its primary
  income). Disambiguate embeds, for example
  `budgets?select=*,incomes!incomes_budget_id_fkey(*)`; otherwise PostgREST answers
  PGRST201. Prefer the views.

## Reading

| Relation | Rows | Columns (beyond the obvious) | Rules |
| --- | --- | --- | --- |
| `my_budgets` (view) | budgets I belong to | `id`, `name`, `owner_id`, `primary_income_id`, `end_date_entered` (the end date the owner entered; null: no end), `end_date` (the end shown: the end of the period containing the date entered, projected while that period does not exist), `is_owner`, `created_at`, `updated_at` | R-BUDGET-004, R-BUDGET-008, R-BUDGET-014 |
| `budget_member_list` (view) | members of my budgets | `budget_id`, `user_id`, `role` (`'owner'` \| `'member'`), `display_name` (may be null), `email`, `joined_at` | R-MEMBER-001, R-PROFILE-003 |
| `budget_invitations` | pending invitations; **owner only** | `id`, `budget_id`, `email` (lower case), `invited_by`, `created_at`, `expires_at` (30 days after the last invite; an expired one cannot be accepted, re-invite to renew) | R-MEMBER-004, R-INVITE-007, R-INVITE-009 |
| `income_overview` (view) | incomes, ended ones included | `id`, `budget_id`, `user_id` (whose income; null if their account was deleted), `user_display_name` (also for a former member), `name`, `is_primary`, `is_active` (in force in the current period), `first_seq`, `end_seq`, terms in force now `amount`, `pay_day`, `weekend_rule`, `terms_from_seq`, `next_pay_date` (first actual pay date on or after today; null when ended) | R-INCOME-003, R-INCOME-006, R-VERSION-001, R-PROFILE-004 |
| `period_summaries` (view) | existing periods | `id`, `budget_id`, `seq`, `start_date`, `end_date` (inclusive), `end_is_manual`, `is_current`, `today`, `income_total` (incomes in force in the period, each at the version in force then) | R-PERIOD-004, R-PERIOD-018, R-INCOME-011, R-PERIOD-028 |
| `profiles` | me and people who share a budget with me now | `id`, `display_name`, `email` | R-PROFILE-002, R-PROFILE-003, R-PROFILE-005 |

The underlying tables `budgets`, `budget_members`, `incomes`, `income_versions` (the
version history: `income_id`, `effective_from_seq`, `amount`, `pay_day`, `weekend_rule`)
and `periods` are readable with the same rules; prefer the views.

Periods exist only up to the current one and are created on demand. Before showing
periods, call `ensure_periods` (or `get_current_period`, which does it), for example when a
budget is opened. These are cheap when nothing needs creating, never wait for other
writers, and cannot fail on a budget you can see. (R-PERIOD-008, R-PERIOD-009,
R-PERIOD-031, R-SECURITY-006)

`weekend_rule` is `'nearest'` (Sat -> Fri, Sun -> Mon, the default), `'previous'` (-> Fri),
`'next'` (-> Mon) or `'none'`. (R-PAYDATE-001 to R-PAYDATE-007)

## Direct writes

| Operation | Who | Notes |
| --- | --- | --- |
| `update budgets set name` | members | trimmed, 1-100 characters (else `23514`); no other column is writable (R-BUDGET-009) |
| `update incomes set name` | members | as for budgets; terms change through `update_income_terms` |
| `update profiles set display_name` | myself | unchanged from step 1 (R-PROFILE-002) |

## RPCs

All are callable by signed-in users only. "Member" means the call fails with
`budget_not_found` (or `income_not_found`, `period_not_found`, `invitation_not_found`) for
anyone else.

### Today and start months

**`get_today() -> date`** The database's today. (R-PERIOD-017, R-PERIOD-028)

**`get_start_months(p_pay_day, p_weekend_rule = 'nearest') -> {today, month, start_date, is_default}[]`**
For the primary income's terms: the months a new budget may start from, newest first: the
current period's month (`is_default`), then each month back to 60 months before this
month, each with the date its first period would start. Errors: `invalid_pay_day`,
`invalid_weekend_rule`. (R-PERIOD-015, R-PERIOD-016, R-PERIOD-019, R-PERIOD-027)

### Budgets

**`create_budget(p_name, p_income_name, p_amount, p_pay_day, p_weekend_rule = 'nearest', p_start_month = null, p_end_date = null) -> uuid`**
Anyone signed in. Creates the budget (caller = owner), its first income (primary, for the
caller), its periods and, if given, its end date, in one step; returns the budget id.
`p_start_month` is any date in the month to start from (one of `get_start_months`); omitted,
the current period. Errors: `invalid_name`, `invalid_amount`, `invalid_pay_day`,
`invalid_weekend_rule`, `invalid_start_month`, `budget_limit_reached` (20 owned budgets),
and those of `set_budget_end_date`. (R-BUDGET-002, R-BUDGET-003, R-BUDGET-010,
R-BUDGET-011, R-BUDGET-012, R-BUDGET-017, R-PERIOD-001, R-PERIOD-015, R-PERIOD-016,
R-PERIOD-019, R-PERIOD-022)

**`set_budget_end_date(p_budget_id, p_end_date = null) -> my_budgets[]`** (one row)
Owner. Stores the end date entered: no period starts after it; the period containing it is
the last one and ends at its normal end, which `my_budgets.end_date` shows and which follows
later changes of the terms. Omit `p_end_date` to clear it and resume period generation.
Errors: `not_owner`, `end_date_before_last_period` (before the latest period starts),
`invalid_end_date` (more than ten years ahead, or not a valid date). (R-MEMBER-003,
R-BUDGET-005, R-BUDGET-007, R-BUDGET-008, R-BUDGET-013, R-BUDGET-014)

**`delete_budget(p_budget_id) -> void`** Owner. Deletes the budget and everything in it.
Errors: `budget_not_found` (also when already deleted), `not_owner`. (R-MEMBER-002,
R-BUDGET-009, R-BUDGET-018)

### Members and invitations

**`invite_member(p_budget_id, p_email) -> uuid`** Owner. Returns the invitation id; inviting
the same address again returns the same id and renews it for 30 days. The answer is the same
whether or not the address has an account. Errors: `not_owner`, `invalid_email`,
`already_member`, `invitation_limit_reached` (20 pending, expired ones excluded).
(R-INVITE-001, R-INVITE-005, R-INVITE-006, R-INVITE-009, R-INVITE-011)

**`cancel_invitation(p_invitation_id) -> void`** Owner. Errors: `invitation_not_found` (also
when already accepted, declined or cancelled), `not_owner`. (R-MEMBER-004, R-BUDGET-018,
R-INVITE-010, R-INVITE-011)

**`list_my_invitations() -> {id, budget_id, budget_name, invited_by_name, invited_by_email, created_at, expires_at}[]`**
Unexpired invitations addressed to my **verified** email. An unverified account sees none.
(R-INVITE-003, R-INVITE-007, R-INVITE-008)

**`accept_invitation(p_invitation_id) -> uuid`** (budget id) and
**`decline_invitation(p_invitation_id) -> void`**. Only for an unexpired invitation
addressed to my verified email. Errors: `invitation_not_found` (also for someone else's,
an expired or a cancelled invitation), `member_limit_reached` (20 members).
(R-INVITE-003, R-INVITE-004, R-INVITE-007, R-INVITE-010, R-INVITE-011, R-MEMBER-010)

**`remove_member(p_budget_id, p_user_id) -> void`** Owner. **`leave_budget(p_budget_id) -> void`**
Member other than the owner. The person's incomes end from the current period (or are
deleted if they never counted in a past period); in a budget that has ended they stay as
they are. Errors: `not_owner`, `member_not_found`, `owner_cannot_leave`,
`member_has_primary_income` (make another income primary first). (R-MEMBER-004 to
R-MEMBER-009)

### Incomes

**`add_income(p_budget_id, p_name, p_amount, p_pay_day, p_weekend_rule = 'nearest', p_user_id = null, p_from_period_id = null) -> uuid`**
Member. `p_user_id`: whose income (default the caller; must be a member).
`p_from_period_id`: a period of this budget from which it counts (default the current one;
an earlier one back-dates it). Errors: `invalid_*`, `member_not_found`, `period_not_found`,
`income_limit_reached` (50 incomes in force, or 500 incomes in all including ended ones),
`budget_ended`. (R-INCOME-003, R-INCOME-013, R-INCOME-016, R-INCOME-050)

**`update_income_terms(p_income_id, p_amount, p_pay_day, p_weekend_rule, p_from_period_id = null) -> void`**
Member. New terms from the current period; past periods keep theirs; a second edit in the
same period replaces the first. With `p_from_period_id`, an explicit correction: the terms
apply from that period until the next existing change. For the primary income no stored
boundary moves; the current period's end, unless set by hand, is re-projected to the day
before the next pay date after today. Errors: `income_not_found`, `invalid_*`,
`income_ended`, `invalid_period` (before the income starts), `period_not_found`,
`budget_ended`. (R-VERSION-001, R-VERSION-005 to R-VERSION-008, R-VERSION-010,
R-VERSION-012, R-PERIOD-011, R-PERIOD-029, R-INCOME-050)

**`set_primary_income(p_income_id) -> void`** Member. Only an income in force in the current
period. Re-projects the current period's end as above. Errors: `income_not_found`,
`income_ended`, `income_not_in_force`, `budget_ended`. (R-INCOME-007, R-INCOME-008,
R-INCOME-017, R-PERIOD-029)

**`remove_income(p_income_id, p_from_period_id = null) -> 'deleted' | 'ended'`** Member.
From the current period by default, or, as an explicit correction, from an earlier period.
Removed from the period it started in (or earlier) it is deleted; otherwise it ends there.
Errors: `income_not_found`, `income_is_primary` (this also protects the last income),
`income_ended`, `period_not_found`, `budget_ended`. (R-INCOME-009, R-INCOME-012,
R-INCOME-015, R-INCOME-050)

### Periods

**`ensure_periods(p_budget_id) -> integer`** Member. Creates the missing periods up to the
current one (never one starting after the end date) and returns how many. Idempotent;
concurrent calls are safe. (R-PERIOD-008, R-PERIOD-009, R-PERIOD-031)

**`get_current_period(p_budget_id) -> period_summaries[]`** Member. Ensures periods, then
returns the current period as one row, or no row when the budget has ended.
(R-PERIOD-010, R-PERIOD-028, R-PERIOD-031, R-SECURITY-006)

The four boundary operations below each have an inverse; refusals answer
`invalid_boundary` (a period would be shorter than 7 or longer than 92 days, a date is in
the wrong range, or not a valid date) or `budget_ended` (no current period).
(R-PERIOD-012, R-PERIOD-013, R-PERIOD-014, R-PERIOD-020, R-PERIOD-023, R-PERIOD-025,
R-PERIOD-033, R-PERIOD-034)

**`set_expected_pay_date(p_budget_id, p_pay_date = null) -> period_summaries[]`** (the
current period) Member. The next salary is expected on `p_pay_date` (after today): the
current period ends the day before, and that end is kept through changes of terms. Omit
`p_pay_date` to reset the end to the projection. Inverse: call again, or reset.

**`record_early_pay_date(p_budget_id, p_pay_date) -> period_summaries[]`** (the new current
period) Member. The salary arrived early, on `p_pay_date` (today or earlier, not after the
budget's end date): the current period ends the day before and the next one starts on that
day. Inverse: `reopen_previous_period`.

**`reopen_previous_period(p_budget_id, p_pay_date = null) -> period_summaries[]`** (the
reopened period) Member. The salary that started the current period has not arrived yet:
the current period is merged into the previous one, which is current again and ends the day
before `p_pay_date` (after today), or at its projection when omitted. Everything recorded in
the merged period (income versions, incomes added or ended, a primary switch) now belongs
to the reopened one. Inverse: `record_early_pay_date` with the original date.
(R-VERSION-011)

**`move_period_start(p_period_id, p_start_date) -> void`** Member. Moves the boundary between
a period and the one before it: the period starts on `p_start_date` (today or earlier), the
previous one ends the day before. Errors also: `period_not_found`. Inverse: move it back.

### Pure helper

**`pay_date(p_year, p_month, p_pay_day, p_weekend_rule = 'nearest') -> date`** The actual pay
date of a nominal pay day in a month (clamped to the month's length, then the weekend rule),
for previews in forms. Error: `invalid_pay_day`. (R-PAYDATE-001 to R-PAYDATE-007)

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
| `end_date_before_last_period` | the end date is before the latest period starts |
| `income_is_primary` | switch the primary income first |
| `income_ended` | the income has ended (for that period) |
| `income_not_in_force` | the income is not in force in the current period |
| `budget_ended` | no current period: the budget is past its end date |
| `budget_limit_reached`, `member_limit_reached`, `invitation_limit_reached`, `income_limit_reached` | a limit (20 owned budgets, 20 members, 20 pending invitations, 50 incomes in force or 500 in all) |

## For later tables

Every budget-owned table (categories, transactions, ...) has a `budget_id`, RLS enabled
in its migration, and policies of the form
`budget_id in (select private.member_budget_ids())` (members) or
`budget_id in (select private.owned_budget_ids())` (owner) (C-RLS-001 to C-RLS-003).
Write RPCs check membership (`private.assert_member`), take `private.lock_budget` before
any row lock, catch the periods up (`private.lock_and_catch_up`), and only then read the
rows they check. A versioned table has an entity column, an `effective_from_seq` column
and a unique key on both, and registers in `private.period_keyed_tables` (kind
`'version'`) so that merging a period re-keys it; a table with `first_seq` / `end_seq`
registers with kind `'validity'` (R-VERSION-011).
