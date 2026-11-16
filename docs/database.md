# Database API (client contract)

What the browser client may read, write and call. The generated types are in
`src/lib/database.types.ts` (`Database['public']`). Schema: the migrations in
`supabase/migrations/`; behaviour and rule ids: `docs/spec.md`. Each relation and RPC
below lists the rule ids it implements.

## Conventions

- **Money**: integer rappen (`bigint`, a `number` in TypeScript). Income amounts are
  1 to 1 000 000 000 (CHF 10 million); expectation amounts 0 to 1 000 000 000 as entered
  (per month or per year); transaction amounts 1 to 1 000 000 000. Every amount the
  database returns is a whole number of rappen, already rounded where a rule says so: never
  divide or round in the client. (R-MONEY-002, R-INCOME-014, R-CATEGORY-094, R-TRANSACTION-094)
- **Revisions** (concurrent edits): every editable record (`budgets`, `incomes`,
  `periods`, `categories`, `transactions`) has a `revision` integer. Every edit or removal
  **requires** the revision you read, as `p_expected_revision` (a boundary operation: the
  period's id and revision); when another member changed the record since, or your own
  earlier attempt already did, the call fails with `record_changed`: reload the record and
  let the user redo or confirm their change. See "Concurrent edits" below.
  (R-CONCURRENCY-070, R-CONCURRENCY-090, R-CONCURRENCY-100)
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
  change meaning when a period is merged (reopen). Categories use the same validity
  (`first_seq`, `end_seq`) and their expectations the same versions (`effective_from_seq`).
  Transactions carry no period: they belong to the period containing their `date`.
  (R-PERIOD-018, R-VERSION-011, R-TRANSACTION-006)
- **Reads** are plain `select`s on the tables and views below; RLS returns only the rows of
  budgets you are a member of. Anything else returns no rows (never an error). Always
  filter by `budget_id` (the API returns at most 1000 rows per request). (R-SECURITY-002)
- **Writes** go through the RPCs (`supabase.rpc(name, args)`); the only direct write left
  is your own profile's display name. Argument names start with `p_`; arguments with a
  default may be omitted (omit, rather than send `null`, to use the default). Every write
  RPC first creates the missing periods up to today. (R-PERIOD-032)
- **Cost**: every read and write costs what the budget holds, never what other budgets
  hold. (R-CATEGORY-102)
- **Errors**: RPC errors have `code: 'P0001'` and a stable `message` from the table at the
  end; map the message to translated text. Other codes the client can meet: `42501` (no
  privilege: a table or operation the client may not touch). A request for a budget, income,
  period, invitation, category or transaction you cannot see is answered as "not found",
  never "forbidden"; so is an id of another budget passed with your own.
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
| `period_summaries` (view) | existing periods | `id`, `budget_id`, `seq`, `start_date`, `end_date` (inclusive), `end_is_manual`, `is_current`, `today`, `income_total` (`salary_total` + `extra_income_total`), `salary_total` (incomes in force in the period, each at the version in force then), `extra_income_total` (extra incomes dated in it), `expected_total` (the rounded monthly shares of the expectations in force, added up), `spent_total` (expenses minus refunds dated in it; may be negative), `left_to_assign` (`income_total - expected_total`; negative when over-assigned), `result` (`income_total - spent_total`: a surplus when positive, a deficit when negative) | R-PERIOD-004, R-PERIOD-018, R-INCOME-011, R-PERIOD-028, R-CATEGORY-006, R-CATEGORY-071, R-CATEGORY-091, R-PROGRESS-002, R-PROGRESS-090, R-TRANSACTION-092 |
| `category_overview` (view) | categories and subcategories, ended and void ones included | `id`, `budget_id`, `parent_id` (null: top level), `name`, `sort_order` (among siblings), `is_group` (has, or had, subcategories: no expectation of its own), `is_active` (in force in the current period), `first_seq`, `end_seq`, expectation in force now: `amount` (as entered), `cadence` (`'monthly'` \| `'yearly'`), `monthly_amount` (the monthly share; for a group, the total of its active subcategories), `terms_from_seq`; `has_transactions` (itself or its subcategories), `removal_deletes` (removing it now deletes it instead of ending it), `revision` | R-CATEGORY-001 to R-CATEGORY-005, R-CATEGORY-072, R-CATEGORY-073, R-CATEGORY-090 |
| `transaction_list` (view) | transactions | `id`, `budget_id`, `kind` (`'expense'` \| `'refund'` \| `'extra_income'`), `amount` (positive), `date`, `period_id` (the period containing the date), `category_id` (null for an extra income), `category_name`, `parent_category_id`, `parent_category_name`, `description` (may be null), `recorded_by` (null if their account was deleted), `recorded_by_name` (also for a former member), `revision`, `created_at`, `updated_at`. List it with `list_transactions` (paged); select it directly only by `id` | R-TRANSACTION-001, R-TRANSACTION-002, R-TRANSACTION-006, R-TRANSACTION-095 |
| `profiles` | me and people who share a budget with me now | `id`, `display_name`, `email` | R-PROFILE-002, R-PROFILE-003, R-PROFILE-005 |

`my_budgets`, `income_overview` and `period_summaries` also have `revision` (for a period:
what a boundary operation names).

The underlying tables `budgets`, `budget_members`, `incomes`, `income_versions` (the
version history: `income_id`, `effective_from_seq`, `amount`, `pay_day`, `weekend_rule`),
`periods`, `categories`, `category_expectations` (`category_id`, `effective_from_seq`,
`amount`, `cadence`) and `transactions` are readable with the same rules; prefer the views
and RPCs.

A **void** category (`first_seq = end_seq`) was never in force; it exists only because
transactions are dated on it (removed in the period it started in, or left behind by a
reopen). Show it only where the progress view lists it. (R-CATEGORY-095, R-VERSION-014)

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
| `update profiles set display_name` | myself | unchanged from step 1 (R-PROFILE-002) |

Nothing else: budgets and incomes are renamed through `rename_budget` and `update_income`,
which check the revision (D-150); a direct `update` answers `42501`.

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

**`set_budget_end_date(p_budget_id, p_expected_revision, p_end_date = null) -> my_budgets[]`** (one row)
Owner. Stores the end date entered: no period starts after it; the period containing it is
the last one and ends at its normal end, which `my_budgets.end_date` shows and which follows
later changes of the terms. Omit `p_end_date` to clear it and resume period generation.
`p_expected_revision`: the budget's, from `my_budgets`. Errors: `not_owner`,
`end_date_before_last_period` (before the latest period starts), `invalid_end_date` (more
than ten years ahead, or not a valid date), `record_changed`, `invalid_revision`.
(R-MEMBER-003, R-BUDGET-005, R-BUDGET-007, R-BUDGET-008, R-BUDGET-013, R-BUDGET-014,
R-CONCURRENCY-070)

**`rename_budget(p_budget_id, p_name, p_expected_revision) -> integer`** (the new revision)
Member. Errors: `invalid_name`, `record_changed`, `invalid_revision` (none sent).
(R-BUDGET-009, R-CONCURRENCY-070)

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
deleted if they never counted in a past period). In a budget that has ended its history
stays as it is, and the incomes end from the first period created if the budget resumes
(`income_overview.is_active` is false for them meanwhile). Errors: `not_owner`, `member_not_found`, `owner_cannot_leave`,
`member_has_primary_income` (make another income primary first). (R-MEMBER-004 to
R-MEMBER-009, R-MEMBER-011)

### Incomes

**`add_income(p_budget_id, p_name, p_amount, p_pay_day, p_weekend_rule = 'nearest', p_user_id = null, p_from_period_id = null) -> uuid`**
Member. `p_user_id`: whose income (default the caller; must be a member).
`p_from_period_id`: a period of this budget from which it counts (default the current one;
an earlier one back-dates it). Errors: `invalid_*`, `member_not_found`, `period_not_found`,
`income_limit_reached` (50 incomes in force, or 500 incomes in all including ended ones),
`budget_ended`. (R-INCOME-003, R-INCOME-013, R-INCOME-016, R-INCOME-050)

**`update_income(p_income_id, p_expected_revision, p_name = null, p_amount = null, p_pay_day = null, p_weekend_rule = null, p_from_period_id = null, p_previewed_end_date = null) -> integer`** (the new revision)
Member. One edit of an income: its name (`p_name`) and/or its terms (any of `p_amount`,
`p_pay_day`, `p_weekend_rule`; each one omitted keeps the value in force there).
`p_expected_revision`: the income's, from `income_overview`. New terms apply from the
current period; past periods keep theirs; a second edit in the same period replaces the
first. With `p_from_period_id`, an explicit correction: the terms apply from that period
until the next existing change. For the primary income no stored boundary moves; the
current period's end, unless set by hand, is re-projected to the day before the next pay
date after today (at most 92 days from the period's start). Show the effect first with
`preview_update_income` (same arguments) and send the `end_date` it returned as
`p_previewed_end_date`: the save is refused (`record_changed`) when the period would now
end on another day. Errors: `income_not_found`, `record_changed`, `invalid_revision`,
`invalid_name`, `invalid_amount`, `invalid_pay_day`, `invalid_weekend_rule`,
`income_ended`, `invalid_period` (before the income starts, or `p_from_period_id` without
new terms), `period_not_found`, `budget_ended`. (R-INCOME-100, R-VERSION-001, R-VERSION-005
to R-VERSION-008, R-VERSION-010, R-VERSION-012, R-PERIOD-011, R-PERIOD-029, R-PERIOD-036,
R-INCOME-050, R-CONCURRENCY-070)

**`set_primary_income(p_income_id, p_expected_revision, p_previewed_end_date = null) -> void`**
Member. `p_expected_revision`: **the budget's** (`my_budgets.revision`: the primary income
is a budget field). Only an income in force in the current period. Re-projects the current
period's end as above; show it first with `preview_set_primary_income` and send its
`end_date` as `p_previewed_end_date`. Errors: `income_not_found`, `record_changed`,
`invalid_revision`, `income_ended`, `income_not_in_force`, `budget_ended`. (R-INCOME-007,
R-INCOME-008, R-INCOME-017, R-PERIOD-029, R-CONCURRENCY-070)

**`remove_income(p_income_id, p_expected_revision, p_from_period_id = null) -> 'deleted' | 'ended'`** Member.
`p_expected_revision`: the income's (also `record_changed`, `invalid_revision`).
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

**Each names the period it acts on**, as the client read it from `period_summaries`:
`p_period_id` and `p_expected_revision` (the current period for the first three; the moved
period for `move_period_start`). When that period is no longer the current one, has changed,
or is gone, the call is refused with `record_changed`: another member acted first, or this
is a retry of a call that already succeeded (a second "the salary has not arrived" would
otherwise merge a second period). Reload the periods and show the user where things are;
never retry automatically. Missing: `invalid_revision`. (R-CONCURRENCY-100, D-151)

**`set_expected_pay_date(p_budget_id, p_period_id, p_expected_revision, p_pay_date = null) -> period_summaries[]`** (the
current period) Member. The next salary is expected on `p_pay_date` (after today): the
current period ends the day before, and that end is kept through changes of terms. Omit
`p_pay_date` to reset the end to the projection. Inverse: call again, or reset.

**`record_early_pay_date(p_budget_id, p_period_id, p_expected_revision, p_pay_date) -> period_summaries[]`** (the new current
period) Member. The salary arrived early, on `p_pay_date` (today or earlier, not after the
budget's end date): the current period ends the day before and the next one starts on that
day. Inverse: `reopen_previous_period`. (R-BUDGET-007)

**`reopen_previous_period(p_budget_id, p_period_id, p_expected_revision, p_pay_date = null) -> period_summaries[]`** (the
reopened period) Member. `p_period_id`: the current period, the one to merge. The salary that started the current period has not arrived yet:
the current period is merged into the previous one, which is current again and ends the day
before `p_pay_date` (after today, the end then counts as set by hand), or at its projection
when omitted. Everything recorded in the merged period (income versions, incomes added or
ended, a primary switch) now belongs to the reopened one, and **replaces** what the
reopened period had for the same record, whatever was written later, so the terms in force
before the reopen are still in force after it. An income that would then never be in force
(added in the previous period and ended in the merged one) is removed. Call
`preview_reopen` first to warn the user. Inverse of the **boundary**:
`record_early_pay_date` with the original date; this does not move back what was recorded
in the merged period, which stays with the reopened period (moving it back needs explicit
corrections). (R-VERSION-011, R-VERSION-013)

**`preview_reopen(p_budget_id) -> {record_kind, record_id, record_name, change, replaces_previous}[]`**
Member. What `reopen_previous_period` would move, one row per change recorded in the current
period, for every kind of record (`record_kind` is `'income'` or `'category'`, a category
or subcategory; `'terms_changed'` for a category is a changed expectation; later steps add
kinds without client changes). A category `'removed'` that has transactions is kept as a
void row, and its transactions keep counting in the reopened period. `change`: `'added'`, `'ended'`, `'removed'` (it would never be in
force after the reopen), `'terms_changed'`, `'made_primary'`. `replaces_previous`: the
previous period has its own entry for that record that the reopen would replace. Errors:
`budget_ended`, `invalid_boundary` (the first period has nothing to reopen). (R-PERIOD-035)

**`preview_update_income(p_income_id, p_amount = null, p_pay_day = null, p_weekend_rule = null, p_from_period_id = null) -> {period_id, end_date, expected_pay_date, end_is_manual}[]`**
and **`preview_set_primary_income(p_income_id) -> {period_id, end_date, expected_pay_date, end_is_manual}[]`**
(one row each) Member. What the current period's end and expected next pay date would become
if `update_income` were called with the same terms and correction period (a correction
shadowed by a later version changes nothing, and the preview says so; an income that is not
the primary moves nothing), or if that income became primary. Computed with the write's own
functions; an end set by hand stays as it is (`end_is_manual`). Pass the returned
`end_date` to the write as `p_previewed_end_date`. Changes nothing (like
`get_current_period`, it first creates missing periods). Errors: `income_not_found`,
`budget_ended`, `income_ended`, `income_not_in_force`, `invalid_period`,
`period_not_found`, `invalid_amount`, `invalid_pay_day`, `invalid_weekend_rule`.
(R-PERIOD-036, D-157)

**`move_period_start(p_period_id, p_expected_revision, p_start_date = null) -> void`** Member. Moves the boundary between
a period and the one before it: the period starts on `p_start_date` (today or earlier, and
not after the budget's end date), the previous one ends the day before. Omit `p_start_date`
to move it to where the schedule puts it (the previous period's projected end, the day
before). The previous period's `end_is_manual` is true unless the boundary is on the
schedule's day, so moving it back clears the mark. Errors also: `period_not_found`. Inverse:
move it back. (R-PERIOD-100, D-152)

### Pure helper

**`pay_date(p_year, p_month, p_pay_day, p_weekend_rule = 'nearest') -> date`** The actual pay
date of a nominal pay day in a month (clamped to the month's length, then the weekend rule),
for previews in forms. Error: `invalid_pay_day`. (R-PAYDATE-001 to R-PAYDATE-007)

### Categories

Two levels. A top-level category is either a **leaf** (it has an expectation and takes
transactions) or a **group** (`is_group`: it has subcategories, which are leaves). A
category becomes a group when its first subcategory is created and stays one, even when
its subcategories are later gone (an empty group expects nothing and takes nothing; add a
subcategory). A group's expected amount and spending are its subcategories' added up. An
expectation is entered per month or per year; a yearly amount is stored as yearly and
counts one twelfth per period, rounded half up to the rappen (`monthly_amount`). Each
expectation counts once per period, whatever the period's length. The database computes
every figure: never divide or add up shares in the client. (R-CATEGORY-001 to
R-CATEGORY-005, R-CATEGORY-070, R-CATEGORY-090, R-CATEGORY-091, D-140, D-141, D-147)

All category RPCs are for members; each catches the periods up first, and each that
changes an existing category takes `p_expected_revision` (from `category_overview`).

**`create_category(p_budget_id, p_name, p_parent_id = null, p_amount = 0, p_cadence = 'monthly', p_from_period_id = null, p_other_name = null) -> category_overview[]`** (one row: the new category)
A category, or with `p_parent_id` a subcategory of that top-level category, with its
expectation, in force from the current period or, as an explicit correction, from an
earlier period `p_from_period_id` (a subcategory never before its group). Adding the
**first** subcategory makes the parent a group: if it had transactions or a non-zero
expectation, they (with all its past expectations) move to a subcategory named
`p_other_name` created with it, valid from the parent's first period, so no period's totals
change. Always send `p_other_name` (the translated "Other") when adding the first
subcategory; it is used only when needed. In an ended budget only a correction
(`p_from_period_id`) is accepted. Errors: `budget_not_found`, `invalid_name` (also for
`p_other_name`), `invalid_amount` (below 0 or above 1 000 000 000), `invalid_cadence`,
`period_not_found`, `category_not_found` (parent), `invalid_parent` (the parent is a
subcategory), `category_ended` (the parent has ended), `invalid_period` (before the
parent's first period), `other_name_required`, `category_limit_reached` (200 in force, 500
in all, void rows not counted), `budget_ended` (no current period and no
`p_from_period_id`). (R-CATEGORY-001, R-CATEGORY-002, R-CATEGORY-090, R-CATEGORY-092,
R-CATEGORY-093, R-CATEGORY-094)

**`update_category(p_category_id, p_expected_revision, p_name = null, p_amount = null, p_cadence = null, p_from_period_id = null) -> category_overview[]`** (one row)
Rename (`p_name`) and/or change the expectation (`p_amount` and/or `p_cadence`; the one
omitted keeps its value). The new expectation applies from the current period; past
periods keep theirs; a second change in the same period replaces the first. With
`p_from_period_id`, an explicit correction: from that period until the next existing change.
Returns the category with its new `revision`. Errors: `category_not_found`,
`record_changed`, `invalid_revision`, `invalid_name`, `invalid_amount`, `invalid_cadence`,
`category_is_group` (a group has no expectation), `category_ended` (no current period
change for an ended category; a correction must fall within its validity),
`invalid_period` (a correction before it started, or `p_from_period_id` without an
expectation change), `period_not_found`, `budget_ended`. (R-VERSION-002, R-VERSION-005,
R-VERSION-006, R-VERSION-012, R-VERSION-070, R-CONCURRENCY-070)

**`reorder_categories(p_budget_id, p_category_ids, p_parent_id = null) -> void`**
Sets the order of the categories under `p_parent_id` (null: the top level) that have not
ended: `p_category_ids` lists exactly those ids, in the new order. Ended ones keep their
place for past periods. Not a revision change. Errors: `budget_not_found`,
`category_not_found` (parent), `record_changed` (the list is not exactly the current
siblings: someone added or removed one; reload). (R-CATEGORY-096)

**`end_category(p_category_id, p_expected_revision, p_from_period_id = null) -> 'deleted' | 'ended'`**
Removes a category, with its subcategories, from the current period or, as an explicit
correction, from an earlier one. One that never counted before that period and has no
transactions (itself or its subcategories) is deleted; otherwise it ends there and earlier
periods keep it. Its transactions are never deleted: a row with transactions that would
never be in force is kept void, and those transactions still count where they are dated
(with nothing expected). `category_overview.removal_deletes` says beforehand which it will
be for a removal now. A group's subcategories end within its own validity (one created
after the group's new end, with transactions, is kept void at that end). Errors:
`category_not_found`, `record_changed`, `invalid_revision`, `category_ended`,
`period_not_found`, `budget_ended`. (R-CATEGORY-072, R-CATEGORY-073, R-CATEGORY-095)

**`extend_category(p_category_id, p_expected_revision, p_from_period_id, p_amount = null, p_cadence = null) -> category_overview[]`** (one row)
Explicit correction: make an existing category count from an earlier period
`p_from_period_id` (before its first period), with the expectation `p_amount` / `p_cadence`
there, each defaulting to its earliest expectation; later expectations stay. A subcategory
never before its group (extend the group first); a group takes no amount. Use it when older
transactions need a category that was set up later. Errors: `category_not_found`,
`record_changed`, `invalid_revision`, `invalid_period` (not earlier than its first period,
or before its group's), `period_not_found`, `category_is_group` (an amount for a group),
`invalid_amount`, `invalid_cadence`, `category_limit_reached` (a void row now counts).
(R-CATEGORY-100, D-154)

**`restore_category(p_category_id, p_expected_revision, p_from_period_id = null, p_amount = null, p_cadence = null) -> category_overview[]`** (one row)
Restore an ended category. Default: in force again from the current period with `p_amount` /
`p_cadence` (each defaulting to its last expectation), and nothing expected in the periods
between its end and now, so their totals do not change. With `p_from_period_id` (which must
be the period it ended, `end_seq`): an explicit correction, as if it had never ended. A
subcategory needs its group in force (restore the group first); a group's subcategories stay
as they are. Errors: `category_not_found`, `record_changed`, `invalid_revision`,
`category_not_ended`, `invalid_period`, `period_not_found`, `category_ended` (its group has
ended), `category_is_group`, `invalid_amount`, `invalid_cadence`, `category_limit_reached`,
`budget_ended` (default, no current period). (R-CATEGORY-101, D-154)

**`list_categories_for_date(p_budget_id, p_date) -> category_choice[]`** (`{category_id, parent_id, name, parent_name, display_order}`)
The leaves a transaction dated `p_date` may use: those in force in the period containing it
(a category ended since is included for dates where it was in force), in display order.
`parent_id` and `parent_name` are null for a top-level category; the other fields are never
null (the generated type marks them all nullable). The answer depends only on the period
containing the date: cache it per period (key: budget id and `period_id`) and invalidate it
when categories change or the periods move; fetch it again only when the date moves to
another period. When editing a transaction that stays in its period, also offer the
category it already has (it may keep it, R-TRANSACTION-100). Errors: `budget_not_found`,
`invalid_date`, `date_outside_periods`. (R-TRANSACTION-091)

### Transactions

A transaction is an **expense** (positive amount, on a leaf), a **refund** (positive
amount, on a leaf, reducing what was spent in it) or an **extra income** (no category,
adding to its period's income total and to nothing else). It belongs to the period
containing its date, which is never stored: boundary operations move it with its date. Dates
run from the first period's start to **today** (the database's), and not after the last
period's end, so no operation can leave a transaction outside every period. Past periods'
transactions are added, edited and deleted freely. Never refused for going over an
expectation. (R-TRANSACTION-001 to R-TRANSACTION-008, R-TRANSACTION-070 to R-TRANSACTION-073,
R-TRANSACTION-090 to R-TRANSACTION-095, D-143, D-145)

**`add_transaction(p_budget_id, p_kind, p_amount, p_date, p_category_id = null, p_description = null) -> transaction_list[]`** (one row: the new transaction)
Member. `p_description` is trimmed; blank means none. Recorded by the caller. Errors:
`budget_not_found`, `invalid_kind`, `invalid_amount` (1 to 1 000 000 000),
`invalid_description` (over 500 characters), `invalid_date` (missing or not a valid date),
`date_outside_periods` (before the first period, after today, or after an ended budget's
last period), `category_required` (an expense or refund without one), `invalid_category`
(an extra income with one), `category_not_found` (not a category of this budget),
`category_is_group`, `category_not_in_force` (not in force in the period of the date),
`transaction_limit_reached` (50 000 per budget).

**`update_transaction(p_transaction_id, p_expected_revision, p_kind, p_amount, p_date, p_category_id = null, p_description = null) -> transaction_list[]`** (one row)
Member. Replaces every field: send them all (an omitted category or description becomes
none). A transaction may keep the category it already has while it stays in the same period,
even when that category is no longer in force there (ended, voided by a reopen, or out of
the period after a boundary moved); the category must be in force in the period of the
date only when the category or the period changes. Errors: `transaction_not_found`,
`record_changed`, `invalid_revision`, and those of `add_transaction` except the limit.
(R-TRANSACTION-100, D-159)

**`delete_transaction(p_transaction_id, p_expected_revision) -> void`** Member. Errors:
`transaction_not_found`, `record_changed`, `invalid_revision`.

**`list_transactions(p_budget_id, p_limit = 50, p_from_date = null, p_to_date = null, p_category_id = null, p_kind = null, p_before_date = null, p_before_created_at = null, p_before_id = null) -> transaction_list[]`**
Member. **The way to list transactions.** One page, newest first, in the stable order
`date desc, created_at desc, id desc`, at most `p_limit` rows (1 to 200). Filters, all
optional and combinable: `p_from_date` / `p_to_date` (inclusive; for a period, its
`start_date` and `end_date`), `p_category_id` (a leaf, or a group with all its
subcategories), `p_kind`. **Next page**: pass the last row's `date`, `created_at` and `id`
as `p_before_date`, `p_before_created_at`, `p_before_id` (all three, unchanged, with the
same filters); a page shorter than `p_limit` is the last. Pages stay correct when rows are
added or edited meanwhile (no offsets). Cost: without filters, or with dates, each page is
an index range scan however deep (about 10 ms at 50 000 rows); with `p_category_id`, the
database reads that category's (or group's) transactions and sorts them; with `p_kind`, it
reads the budget's transactions newest first until the page is full, so a rare kind (extra
incomes) may read them all. Both stay within the budget's own rows (at most 50 000, under
20 ms measured).
With TanStack Query, `useInfiniteQuery` keyed by budget id and filters, `getNextPageParam`
returning the last row's three values. Errors: `budget_not_found`, `invalid_limit`,
`invalid_cursor` (some but not all of the three), `category_not_found`. (R-TRANSACTION-095,
D-149)

### Period progress

**`get_period_progress(p_period_id) -> category_progress_row[]`** (`{category_id, parent_id, name, is_group, in_force, amount, cadence, expected, spent, result, is_overspent, transaction_count, display_order}`)
Member. The progress of any period, current or past (browse by period id from
`period_summaries`): one row per category and subcategory in force in it, and one for every
category with transactions dated in it even when not in force then (`in_force` false,
`expected` 0: an ended or void category, or one moved by a boundary operation). For a leaf:
`amount` and `cadence` as entered in the version in force then, `expected` its monthly share,
`spent` expenses minus refunds (may be negative), `result = expected - spent`,
`is_overspent = spent > expected`, `transaction_count`. A group (`is_group`, `amount` and
`cadence` null) adds up its subcategories; its subcategories follow it. Rows come ordered by
`display_order` (top level by `sort_order`, each group's subcategories after it). The
period's totals are in `period_summaries` and always equal the sum of the leaf rows.
Balances do not carry over from one period to the next. **Nulls**: `parent_id` is null for a
top-level row; `amount` and `cadence` are null for a group and for a row not in force; every
other field is never null (the generated type marks them all nullable). Errors:
`period_not_found`.
(R-PROGRESS-001, R-PROGRESS-002, R-PROGRESS-070, R-PROGRESS-071, R-PROGRESS-090 to
R-PROGRESS-092, R-COMPARE-001, D-147)

## Concurrent edits

One mechanism for every editable record, now and in later steps (R-CONCURRENCY-070,
R-CONCURRENCY-090, R-CONCURRENCY-100, D-150, D-151):

1. The record has `revision integer not null default 1`, raised by the trigger
   `private.bump_revision(<columns to ignore>)` whenever its row changes (a statement that
   changes nothing leaves it as it is), and explicitly (`revision = revision + 1`) when a
   dependent row changes: an income's terms, a category's expectation.
2. The client reads `revision` with the record and sends it back as `p_expected_revision`
   with every edit and removal; it is required (`invalid_revision` when missing).
3. The RPC takes the budget lock, reads the record, and calls
   `private.assert_revision(actual, expected)`: `record_changed` when they differ. Because
   of the lock, two saves of the same record run one after the other, and the second sees
   the revision the first wrote.
4. On `record_changed` the client reloads the record and tells the user another member
   changed it (R-CONCURRENCY-091).

Records and where their revision is: budgets (`my_budgets.revision`: name, end date,
primary income), incomes (`income_overview.revision`: name, terms, removal), periods
(`period_summaries.revision`: their dates; named with the period's id by every boundary
operation, so a retried or concurrent one is refused), categories
(`category_overview.revision`: name, expectation, validity, removal; not the order),
transactions (`transaction_list.revision`). A reopen changes the records it re-keys (their
revision moves). A write paired with a preview (`update_income`, `set_primary_income`)
takes the previewed end too (`p_previewed_end_date`). The order of categories is the one
exception: a reorder is refused when the set of siblings changed, but two reorders of the
same set end with the later one (Q-084). There are no direct writes. An add has no record
to name yet: a double-submitted `add_transaction` records twice (Q-090); disable the save
button while it runs.

## Error messages

| Message | Meaning |
| --- | --- |
| `record_changed` | someone changed the record since you read it (or a reorder's list is no longer the current one): reload |
| `invalid_revision` | the RPC needs `p_expected_revision` and none was sent |
| `category_not_found`, `transaction_not_found` | does not exist (any more) or not visible to you |
| `invalid_cadence`, `invalid_kind`, `invalid_description`, `invalid_date`, `invalid_category`, `invalid_parent`, `invalid_limit`, `invalid_cursor` | invalid argument |
| `date_outside_periods` | a transaction date before the first period, after today, or after an ended budget's last period |
| `category_required` | an expense or refund needs a category |
| `category_is_group` | the category has subcategories: use one of them (or: a group has no expectation) |
| `category_not_in_force` | the category is not in force in the period of the transaction's date |
| `category_ended` | the category has ended (for that period), or its group has |
| `category_not_ended` | only an ended category can be restored |
| `other_name_required` | adding the first subcategory to a category with transactions or an expectation needs `p_other_name` |
| `category_limit_reached`, `transaction_limit_reached` | a limit (200 categories in force or 500 in all, void rows not counted; 50 000 transactions) |

Step 2 messages:

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
rows they check.

A table keyed to periods registers in `private.period_keyed_tables` in its migration, so
that merging a period re-keys it and `preview_reopen` reports it. The registration is
checked when it is inserted and refused (`period_keyed_table_invalid`) unless the table
provides (R-VERSION-014, R-VERSION-100):

- all: `id uuid` and `budget_id uuid`;
- kind `'validity'` (rows in force from `first_seq` to before `end_seq`): `first_seq
  integer`, `end_seq integer`, a text name column (`name_column`), and no check that
  refuses `end_seq = first_seq` (a void row, never in force): every check constraint on
  `first_seq` and `end_seq` alone is evaluated for `first_seq = end_seq = 1` (a check that
  also involves other columns is not evaluated: do not make one refuse a void row);
- kind `'version'` (one row per entity and period): an entity column (`entity_column`,
  `uuid`) with a foreign key to a registered validity table (`entity_table`),
  `effective_from_seq integer`, and a unique constraint on (entity, `effective_from_seq`).

In a merge, versions keyed to the merged period replace those of the previous period; for
validity rows the start and end move with the merge, and a row that would never be in force
is deleted, or kept as a void row when other rows reference it (one row at a time, D-146),
so the reopen never fails. A table referencing a registered validity table must use a
plain, non-deferrable foreign key without cascade (as `transactions.category_id` does), so
that the merge sees the reference and keeps the row void. Step 3 registers `categories`
(record kind `'category'`) and `category_expectations`.

Every new editable table follows "Concurrent edits" above: a `revision` column, the
`private.bump_revision` trigger, a required `p_expected_revision` on its edit RPCs.

Every query costs what the budget holds (R-CATEGORY-102): filter by `budget_id` or by a
row's own id or category through an index; a lookup by a value with very uneven counts
(such as a category id) in a function is planned for the actual value
(`set plan_cache_mode = force_custom_plan`, as `private.category_has_transactions`); a
deferred check of a row checks that row, not the whole budget, so operations touching
hundreds of rows stay fast (D-153).

Rows dated rather than keyed to periods (like transactions) store the date only, and must
keep it within the budget's periods; `private.check_transactions_in_periods` is the model.

### Transactions in later steps

The `transactions` table takes later columns without reshaping, each nullable or defaulted
so existing rows and RPCs keep working, each added in that step's migration with its index
and its check:

- **Step 4, links (R-TRANSACTION-003, D-111, D-112)**: `subscription_id uuid` and
  `debt_id uuid`, each a composite foreign key `(…, budget_id)` to its table (same budget),
  plain (no cascade: removing a debt or subscription unlinks or is refused, decided then),
  with `check (num_nonnulls(subscription_id, debt_id) <= 1)` and an index each. A debt
  payment is an `'expense'` in the debt's category; the progress and totals need no change.
- **Step 6, imports (D-115, D-118)**: `source text not null default 'manual'` (with a check
  listing the sources), `external_id text` with a unique index on
  `(budget_id, source, external_id) where external_id is not null` for duplicates, and
  `review_state text not null default 'confirmed'` (`'to_review'` for imported rows, which
  count in totals at once, D-118). The import RPC inserts many rows under one budget lock,
  with the same checks as `add_transaction` (shared helpers: `private.transaction_period_seq`,
  `private.assert_transaction_category`).
- `add_transaction` / `update_transaction` gain optional arguments for the new columns
  (default null, at the end), so step 3 callers keep working; `transaction_list` appends
  the new columns at its end.
