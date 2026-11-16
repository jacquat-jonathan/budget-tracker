# Database API (client contract)

What the browser client may read, write and call. The generated types are in
`src/lib/database.types.ts` (`Database['public']`). Schema: the migrations in
`supabase/migrations/`; behaviour and rule ids: `docs/spec.md`. Each relation and RPC
below lists the rule ids it implements.

## Conventions

- **Money**: integer rappen (`bigint`, a `number` in TypeScript). Income amounts are
  1 to 1 000 000 000 (CHF 10 million); expectation amounts 0 to 1 000 000 000 as entered
  (per month or per year); transaction amounts and subscription prices 1 to 1 000 000 000;
  debt principals 1 to 1 000 000 000, planned payments 0 to 1 000 000 000. Every amount the
  database returns is a whole number of rappen, already rounded where a rule says so: never
  divide or round in the client. A debt's interest rate is the one non-money number: a
  yearly percentage with at most three decimals (`4.875` is 4.875 %), a `number` in JSON.
  (R-MONEY-002, R-INCOME-014, R-CATEGORY-094, R-TRANSACTION-094, R-SUBSCRIPTION-110,
  R-DEBT-110)
- **Revisions** (concurrent edits): every editable record (`budgets`, `incomes`,
  `periods`, `categories`, `transactions`, `subscriptions`, `debts`) has a `revision` integer. Every edit or removal
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
  change meaning when a period is merged (reopen). Categories, subscriptions and debts use
  the same validity (`first_seq`, `end_seq`) and their expectations and terms the same
  versions (`effective_from_seq`). Transactions carry no period: they belong to the period
  containing their `date`.
  (R-PERIOD-018, R-VERSION-011, R-TRANSACTION-006)
- **Reads** are plain `select`s on the tables and views below; RLS returns only the rows of
  budgets you are a member of. Anything else returns no rows (never an error). Always
  filter by `budget_id` (the API returns at most 1000 rows per request). (R-SECURITY-002)
- **Writes** go through the RPCs (`supabase.rpc(name, args)`); the only direct write left
  is your own profile's display name. Argument names start with `p_`; arguments with a
  default may be omitted (omit, rather than send `null`, to use the default). Every write
  RPC first catches the budget up to today: the missing periods (with the debts' interest)
  and the subscription charges due. (R-PERIOD-032, R-SUBSCRIPTION-073)
- **Cost**: every read and write costs what the budget holds, never what other budgets
  hold. (R-CATEGORY-102)
- **Errors**: RPC errors have `code: 'P0001'` and a stable `message` from the table at the
  end; map the message to translated text. Other codes the client can meet: `42501` (no
  privilege: a table or operation the client may not touch). A request for a budget, income,
  period, invitation, category, transaction, subscription, debt or adjustment you cannot see
  is answered as "not found", never "forbidden"; so is an id of another budget passed with
  your own.
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
| `my_budgets` (view) | budgets I belong to | `id`, `name`, `owner_id`, `primary_income_id`, `end_date_entered` (the end date the owner entered; null: no end), `end_date` (the end shown: the end of the period containing the date entered, projected while that period does not exist), `is_owner`, `created_at`, `updated_at`, `caught_up` (false while a very long absence still needs more `ensure_periods` calls), `charges_awaiting` (how many automatic charges await confirmation) | R-BUDGET-004, R-BUDGET-008, R-BUDGET-014, R-PERIOD-130, R-SUBSCRIPTION-135 |
| `budget_member_list` (view) | members of my budgets | `budget_id`, `user_id`, `role` (`'owner'` \| `'member'`), `display_name` (may be null), `email`, `joined_at` | R-MEMBER-001, R-PROFILE-003 |
| `budget_invitations` | pending invitations; **owner only** | `id`, `budget_id`, `email` (lower case), `invited_by`, `created_at`, `expires_at` (30 days after the last invite; an expired one cannot be accepted, re-invite to renew) | R-MEMBER-004, R-INVITE-007, R-INVITE-009 |
| `income_overview` (view) | incomes, ended ones included | `id`, `budget_id`, `user_id` (whose income; null if their account was deleted), `user_display_name` (also for a former member), `name`, `is_primary`, `is_active` (in force in the current period), `first_seq`, `end_seq`, terms in force now `amount`, `pay_day`, `weekend_rule`, `terms_from_seq`, `next_pay_date` (first actual pay date on or after today; null when ended) | R-INCOME-003, R-INCOME-006, R-VERSION-001, R-PROFILE-004 |
| `period_summaries` (view) | existing periods | `id`, `budget_id`, `seq`, `start_date`, `end_date` (inclusive), `end_is_manual`, `is_current`, `today`, `income_total` (`salary_total` + `extra_income_total`), `salary_total` (incomes in force in the period, each at the version in force then: the sum of the incomes' own amounts, so the income page's total for the current period is this figure), `extra_income_total` (extra incomes dated in it), `expected_total` (the rounded monthly shares of the expectations in force, added up), `spent_total` (expenses minus refunds dated in it, automatic charges and debt payments included; may be negative), `left_to_assign` (`income_total - expected_total`; negative when over-assigned), `result` (`income_total - spent_total`: a surplus when positive, a deficit when negative), `committed_total` (the monthly costs of the subscriptions in force in the period: part of `expected_total`, never added to it) | R-PERIOD-004, R-PERIOD-018, R-INCOME-011, R-PERIOD-028, R-CATEGORY-006, R-CATEGORY-071, R-CATEGORY-091, R-PROGRESS-002, R-PROGRESS-090, R-TRANSACTION-092, R-SUBSCRIPTION-078, R-SUBSCRIPTION-079 |
| `category_overview` (view) | categories and subcategories, ended and void ones included | `id`, `budget_id`, `parent_id` (null: top level), `name`, `sort_order` (among siblings), `is_group` (has, or had, subcategories: no expectation of its own), `is_active` (in force in the current period), `first_seq`, `end_seq`, expectation in force now: `amount` (as entered), `cadence` (`'monthly'` \| `'yearly'`), `monthly_amount` (the monthly share; for a group, the total of its active subcategories), `terms_from_seq`; `has_transactions` (itself or its subcategories), `removal_deletes` (removing it now deletes it instead of ending it: no transactions, no subscription or debt on it, never counted in a past period), `revision`; `committed_amount` (the monthly costs of the subscriptions on it in force now; a group: its subcategories'), `in_use` (the terms of a subscription or debt in force now or later use it or a subcategory: `end_category` from now refuses it with `category_in_use`) | R-CATEGORY-001 to R-CATEGORY-005, R-CATEGORY-072, R-CATEGORY-073, R-CATEGORY-090, R-CATEGORY-110, R-SUBSCRIPTION-079 |
| `transaction_list` (view) | transactions | `id`, `budget_id`, `kind` (`'expense'` \| `'refund'` \| `'extra_income'`), `amount` (positive), `date`, `period_id` (the period containing the date), `category_id` (null for an extra income), `category_name`, `parent_category_id`, `parent_category_name`, `description` (may be null), `recorded_by` (null if their account was deleted, and for an automatic charge), `recorded_by_name` (also for a former member), `revision`, `created_at`, `updated_at`, `subscription_id` and `subscription_name` (linked to a subscription), `debt_id` and `debt_name` (a debt payment), `charge_date` (an automatic charge: the scheduled date it was created for; null for a transaction a member recorded), `review_state` (enum `review_state`: `'confirmed'` \| `'awaiting_confirmation'`). List it with `list_transactions` (paged); select it directly only by `id` | R-TRANSACTION-001, R-TRANSACTION-002, R-TRANSACTION-003, R-TRANSACTION-006, R-TRANSACTION-095, R-SUBSCRIPTION-075 |
| `subscription_overview` (view) | subscriptions, ended and void ones included | `id`, `budget_id`, `name`, `is_active` (in force in the current period), `first_seq`, `end_seq`, terms in force now: `price`, `cadence` (`'monthly'` \| `'quarterly'` \| `'half_yearly'` \| `'yearly'`), `category_id`, `category_name`, `parent_category_id`, `parent_category_name`, `anchor_date` (the date the schedule counts from: the first charge date, or the next charge date given when the schedule last changed), `terms_from_seq`; `monthly_cost` (its committed amount: price / months of the cadence, rounded half up), `next_charge_date` (the next scheduled date not yet charged; null once ended, when the budget has ended, or when it falls after the budget's end), `charged_through` (every charge up to this date is settled), `charge_count` (its automatic charges), `awaiting_count` (of which awaiting confirmation), `removal_deletes` (removing it now deletes it instead of ending it), `revision`, `created_at`, `updated_at` (an edit; never the catch-up), `charge_day` (the nominal day of the month, 1 to 31, of the terms in force now) | R-SUBSCRIPTION-001, R-SUBSCRIPTION-002, R-SUBSCRIPTION-070, R-SUBSCRIPTION-079, R-SUBSCRIPTION-130, R-SUBSCRIPTION-132, R-VERSION-003 |
| `debt_overview` (view) | debts, ended and void ones included | `id`, `budget_id`, `name`, `category_id`, `category_name`, `parent_category_id`, `parent_category_name` (the category of the terms in force now; for an ended debt, of its last terms), `principal`, `opened_on`, `is_active`, `first_seq`, `end_seq`, terms in force now: `interest_rate`, `monthly_payment`, `terms_from_seq`; `interest_total`, `adjustment_total` (signed), `paid_total`, `remaining` (`principal + interest_total + adjustment_total - paid_total`; negative when overpaid), `payoff` (enum `debt_payoff`: `'paid_off'` \| `'ends'` \| `'never'`; null for an ended debt, or when the budget has ended), `payments_left` (the planned payments still needed, this period's included while still due; 0 for `'paid_off'`; null for `'never'` and when `payoff` is null), `expected_end_date` (the projected end of the period of the last planned payment; null unless `'ends'`), `has_history` (a payment, interest or adjustment exists: the principal can no longer change), `removal_deletes`, `revision`, `created_at`, `updated_at`, `expected_end_after_budget_end` (the projected end falls after the budget's end: say so rather than show the date as a plan; false when there is no end date), `overpaid_by` (how much more than owed was paid; 0 unless `remaining` is negative), `paid_percent` (the payments as a whole percent of principal + interest + adjustments, rounded down: 100 exactly when `remaining` is 0 or less, 0 while nothing has been paid) | R-DEBT-001 to R-DEBT-005, R-DEBT-070, R-DEBT-074, R-DEBT-112, R-DEBT-132, R-DEBT-136, R-DEBT-137, R-VERSION-004 |
| `debt_totals` (view) | one row per budget with a debt in force now | `budget_id`, `remaining_total` (the positive remaining amounts of its debts in force, added up: an overpaid or paid-off debt adds nothing), `owing_count` (how many debts in force still owe something). No row: no debt in force (show 0) | R-DEBT-133, D-216 |
| `profiles` | me and people who share a budget with me now | `id`, `display_name`, `email` | R-PROFILE-002, R-PROFILE-003, R-PROFILE-005 |

`my_budgets`, `income_overview` and `period_summaries` also have `revision` (for a period:
what a boundary operation names).

The underlying tables `budgets`, `budget_members`, `incomes`, `income_versions` (the
version history: `income_id`, `effective_from_seq`, `amount`, `pay_day`, `weekend_rule`),
`periods`, `categories`, `category_expectations` (`category_id`, `effective_from_seq`,
`amount`, `cadence`), `transactions`, `subscriptions`, `subscription_versions`
(`subscription_id`, `effective_from_seq`, `price`, `cadence`, `category_id`, `anchor_date`,
`charge_day`), `debts`, `debt_versions` (`debt_id`, `effective_from_seq`, `interest_rate`,
`monthly_payment`, `category_id`), `debt_adjustments` (`debt_id`, `date`, `amount`, `note`, `created_by`)
and `debt_interest` (`debt_id`, `period_id`, `amount`, `rate`, `balance`: the remaining
amount it was computed on) are readable with the same rules; prefer the views and RPCs.

A **void** category (`first_seq = end_seq`) was never in force; it exists only because
transactions are dated on it (removed in the period it started in, or left behind by a
reopen). Show it only where the progress view lists it. (R-CATEGORY-095, R-VERSION-014)

Periods exist only up to the current one and are created on demand. Before showing
periods, call `ensure_periods` (or `get_current_period`, which does it), for example when a
budget is opened. The same catch-up creates the subscription charges due up to today
(missed dates included) and, with each new period, the debts' interest.

- **Nothing to do** (the usual case: the current period exists and no subscription's next
  scheduled date has come): the call reads, takes no lock and writes nothing, so it never
  waits for a writer. (R-SECURITY-006, R-SUBSCRIPTION-131)
- **Something to do**: the call takes the budget lock (a concurrent caller waits for it and
  then finds nothing to do) and creates at most **120 periods** (ten years) with their
  interest and the charges due in them, and keeps them. It does not fail for a budget you
  can see, however long the absence (no "runaway" error any more).
- **A very long absence** (more than ten years): `my_budgets.caught_up` stays false and
  `get_current_period` returns no row until the periods reach today; call `ensure_periods`
  again until it returns 0 (each call keeps its progress; measured locally: 120 periods
  with 50 subscriptions and 50 debts with interest in under 2 s per call). Writes catch up
  in full before they act; reads that need the current period while it is still being
  caught up answer `catching_up`.

(R-PERIOD-008, R-PERIOD-009, R-PERIOD-031, R-PERIOD-130, R-SECURITY-006,
R-SUBSCRIPTION-073, R-SUBSCRIPTION-111, R-DEBT-073, R-DEBT-111, D-201, D-204)

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
end on another day, and (`preview_required`) when the edit moves the current period's end
and no `p_previewed_end_date` was sent (R-PERIOD-134, D-205). Errors: `income_not_found`,
`record_changed`, `invalid_revision`, `preview_required`,
`invalid_name`, `invalid_amount`, `invalid_pay_day`, `invalid_weekend_rule`,
`income_ended`, `invalid_period` (before the income starts, or `p_from_period_id` without
new terms), `period_not_found`, `budget_ended`. (R-INCOME-100, R-VERSION-001, R-VERSION-005
to R-VERSION-008, R-VERSION-010, R-VERSION-012, R-PERIOD-011, R-PERIOD-029, R-PERIOD-036,
R-INCOME-050, R-CONCURRENCY-070)

**`set_primary_income(p_income_id, p_expected_revision, p_previewed_end_date = null) -> void`**
Member. `p_expected_revision`: **the budget's** (`my_budgets.revision`: the primary income
is a budget field). Only an income in force in the current period. Re-projects the current
period's end as above; show it first with `preview_set_primary_income` and send its
`end_date` as `p_previewed_end_date`. Both incomes whose primary status changes get a new
revision: an edit of either opened before the switch is refused with `record_changed`
(R-CONCURRENCY-131). Errors: `income_not_found`, `record_changed`, `invalid_revision`,
`income_ended`, `income_not_in_force`, `budget_ended`. (R-INCOME-007, R-INCOME-008,
R-INCOME-017, R-PERIOD-029, R-CONCURRENCY-070)

**`get_income_terms(p_income_id, p_period_id) -> {period_id, in_force, amount, pay_day, weekend_rule, terms_from_period_id, until_period_id}[]`**
(one row) Member. See "Terms in a chosen period" below. (R-VERSION-132, R-VERSION-133)

**`remove_income(p_income_id, p_expected_revision, p_from_period_id = null) -> 'deleted' | 'ended'`** Member.
`p_expected_revision`: the income's (also `record_changed`, `invalid_revision`).
From the current period by default, or, as an explicit correction, from an earlier period.
Removed from the period it started in (or earlier) it is deleted; otherwise it ends there.
Errors: `income_not_found`, `income_is_primary` (this also protects the last income),
`income_ended`, `period_not_found`, `budget_ended`. (R-INCOME-009, R-INCOME-012,
R-INCOME-015, R-INCOME-050)

### Periods

**`ensure_periods(p_budget_id) -> integer`** Member. Creates missing periods towards the
current one (never one starting after the end date), at most 120 per call, with their
interest and charges, and returns how many it created: 0 means caught up. Idempotent;
concurrent calls are safe. (R-PERIOD-008, R-PERIOD-009, R-PERIOD-031, R-PERIOD-130)

**`get_current_period(p_budget_id) -> period_summaries[]`** Member. Ensures periods (one
bounded step), then returns the current period as one row; no row when the budget has
ended, or when a very long absence still needs more `ensure_periods` calls
(`my_budgets.caught_up` false). (R-PERIOD-010, R-PERIOD-028, R-PERIOD-031, R-PERIOD-130,
R-SECURITY-006)

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
day. The closed period's `end_is_manual` is true only when `p_pay_date` is not the
schedule's day, so undoing a reopen with the original date leaves the boundary on the
schedule. Inverse: `reopen_previous_period`. (R-BUDGET-007, R-PERIOD-132)

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
period, for every kind of record (`record_kind` is `'income'`, `'category'` (a category
or subcategory; `'terms_changed'` is a changed expectation), `'subscription'` or `'debt'`
(`'terms_changed'`: changed terms); later steps add kinds without client changes). A
category, subscription or debt `'removed'` that has transactions (or, for a debt,
adjustments) is kept as a void row, and its transactions keep counting in the reopened
period. `change`: `'added'`, `'ended'`, `'removed'` (it would never be in force after the
reopen), `'terms_changed'`, `'made_primary'`, `'interest_removed'` (a debt: the interest
the merged period added goes; it comes back once if the period is created again). `replaces_previous`: the
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

**`preview_move_period_start(p_period_id) -> {period_id, scheduled_start, accepted, refusal}[]`**
(one row) Member. What `move_period_start` without a date would do now: `scheduled_start`
(the start the schedule gives), and whether the move would be accepted (`accepted`; when
not, `refusal` is the code the write would answer, or `'already_on_schedule'` when the period
already starts there). Computed with the write's own checks; changes nothing. Errors:
`period_not_found`. (R-PERIOD-133, Q-091)

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
**first** subcategory makes the parent a group: if it had transactions, a non-zero
expectation, or subscriptions or debts on it, they (with all its past expectations) move to
a subcategory named `p_other_name` created with it, valid from the parent's first period,
so no period's totals change (R-CATEGORY-110). Always send `p_other_name` (the translated "Other") when adding the first
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
after the group's new end, with transactions, is kept void at that end). A category that a
subscription or debt still uses (itself or a subcategory) in some period from then on is
refused (`category_in_use`, shown beforehand by `category_overview.in_use` for a removal
now: end or move the subscription or debt first). The error's **detail** names what uses
it, as JSON text `[{"kind": "subscription" | "debt", "id": "…", "name": "…"}]` (supabase-js:
`error.details`), so the message can say which ones (R-CATEGORY-131). One that any
subscription or debt references is ended, never deleted. Errors: `category_not_found`, `record_changed`, `invalid_revision`,
`category_ended`, `category_in_use`, `period_not_found`, `budget_ended`. (R-CATEGORY-072,
R-CATEGORY-073, R-CATEGORY-095, R-CATEGORY-110)

**`extend_category(p_category_id, p_expected_revision, p_from_period_id, p_amount = null, p_cadence = null) -> category_overview[]`** (one row)
Explicit correction: make an existing category count from an earlier period
`p_from_period_id` (before its first period), with the expectation `p_amount` / `p_cadence`
there, each defaulting to its earliest expectation; later expectations stay (with no amount,
its first expectation is stretched back, so a correction from the new first period runs to
the next change the user made). A subcategory never before its group (extend the group
first); a group takes no amount. Use it when older
transactions need a category that was set up later. Errors: `category_not_found`,
`record_changed`, `invalid_revision`, `invalid_period` (not earlier than its first period,
or before its group's), `period_not_found`, `category_is_group` (an amount for a group),
`invalid_amount`, `invalid_cadence`, `category_limit_reached` (a void row now counts).
(R-CATEGORY-100, R-VERSION-131, D-154)

**`get_category_terms(p_category_id, p_period_id) -> {period_id, in_force, amount, cadence, terms_from_period_id, until_period_id}[]`**
(one row) Member. See "Terms in a chosen period" below. (R-VERSION-132, R-VERSION-133)

A change to a subcategory (added, changed, ended, deleted, its expectation changed) raises
its group's `revision`, so removing the group confirmed from an older read answers
`record_changed` (R-CONCURRENCY-130).

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

**`add_transaction(p_budget_id, p_kind, p_amount, p_date, p_category_id = null, p_description = null, p_debt_id = null, p_subscription_id = null) -> transaction_list[]`** (one row: the new transaction)
Member. `p_description` is trimmed; blank means none. Recorded by the caller. With
`p_debt_id`, a **debt payment**: an `'expense'` in the category of the debt's terms in force
in the period of its date (`debt_overview.category_id` for a payment dated now;
`get_debt_terms` for another period), dated on or after its `opened_on`, in a period where
the debt is in force, and the debt not ended; with `p_subscription_id`, a charge recorded by
hand (an expense, the subscription in force in the period of the date); never both.
Errors: `budget_not_found`, `invalid_kind`, `invalid_amount` (1 to 1 000 000 000),
`invalid_description` (over 500 characters), `invalid_date` (missing or not a valid date),
`date_outside_periods` (before the first period, after today, or after an ended budget's
last period), `category_required` (an expense or refund without one), `invalid_category`
(an extra income with one), `category_not_found` (not a category of this budget),
`category_is_group`, `category_not_in_force` (not in force in the period of the date),
`invalid_link` (both links, a linked refund or extra income, a payment in another category
than the debt's), `debt_not_found`, `subscription_not_found` (not of this budget),
`debt_not_in_force`, `subscription_not_in_force` (not in force in the period of the date),
`debt_ended` (an ended debt takes no payment), `before_debt_opened` (dated before the
debt's `opened_on`), `transaction_limit_reached` (50 000 per budget, automatic charges
included). (R-TRANSACTION-003, R-TRANSACTION-110, R-DEBT-071, R-DEBT-131, R-DEBT-134)

**`update_transaction(p_transaction_id, p_expected_revision, p_kind, p_amount, p_date, p_category_id = null, p_description = null, p_relink = false, p_debt_id = null, p_subscription_id = null) -> transaction_list[]`** (one row)
Member. Replaces every field: send them all (an omitted category or description becomes
none). A transaction may keep the category it already has while it stays in the same period,
even when that category is no longer in force there (ended, voided by a reopen, or out of
the period after a boundary moved); the category must be in force in the period of the
date only when the category or the period changes. **The link**: without `p_relink` it is
kept (`p_debt_id` / `p_subscription_id` ignored); with `p_relink = true` it becomes
`p_debt_id` / `p_subscription_id` (both null: no link) in the same call, checked against the
new fields, all or nothing (R-TRANSACTION-131, D-218). An automatic charge keeps its
`charge_date` and `review_state` while it stays linked (editing a charge does not confirm
it); relinking it makes it an ordinary confirmed transaction. A linked transaction stays an
expense; a payment moved to another category or period must still satisfy its link. A
payment of an ended debt cannot change (`debt_ended`). Errors: `transaction_not_found`,
`record_changed`, `invalid_revision`, and those of `add_transaction` except the limit.
(R-TRANSACTION-100, R-TRANSACTION-110, R-SUBSCRIPTION-074, R-DEBT-134, D-159, D-177)

**`link_transaction(p_transaction_id, p_expected_revision, p_debt_id = null, p_subscription_id = null) -> transaction_list[]`** (one row)
Member. Links an existing transaction to a debt (it becomes a payment) or a subscription,
or unlinks it (both omitted). The same checks as `add_transaction`'s link, for the
transaction's kind, category and date. Unlinking (or relinking) an automatic charge makes it
an ordinary confirmed transaction; it is never created again. Neither linking to nor
unlinking from an ended debt (`debt_ended`). Errors: `transaction_not_found`,
`record_changed`, `invalid_revision`, `invalid_link`, `debt_not_found`,
`subscription_not_found`, `debt_not_in_force`, `subscription_not_in_force`, `debt_ended`,
`before_debt_opened`. (R-TRANSACTION-003, R-TRANSACTION-110, R-DEBT-071, R-DEBT-131,
R-DEBT-134)

**`delete_transaction(p_transaction_id, p_expected_revision) -> void`** Member. Errors:
`transaction_not_found`, `record_changed`, `invalid_revision`, `debt_ended` (a payment of an
ended debt). (R-DEBT-134)

**`list_transactions(p_budget_id, p_limit = 50, p_from_date = null, p_to_date = null, p_category_id = null, p_kind = null, p_before_date = null, p_before_created_at = null, p_before_id = null, p_subscription_id = null, p_debt_id = null, p_awaiting_only = false) -> transaction_list[]`**
Member. **The way to list transactions.** One page, newest first, in the stable order
`date desc, created_at desc, id desc`, at most `p_limit` rows (1 to 200). Filters, all
optional and combinable: `p_from_date` / `p_to_date` (inclusive; for a period, its
`start_date` and `end_date`), `p_category_id` (a leaf, or a group with all its
subcategories), `p_kind`, `p_subscription_id` (its charges and the transactions linked to
it), `p_debt_id` (its payments), `p_awaiting_only` (the charges awaiting confirmation; each
of these three reads its own index). **Next page**: pass the last row's `date`, `created_at` and `id`
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
`invalid_cursor` (some but not all of the three), `category_not_found`,
`subscription_not_found`, `debt_not_found` (not of this budget). (R-TRANSACTION-095,
R-TRANSACTION-132, D-149)

### Period progress

**`get_period_progress(p_period_id) -> category_progress_row[]`** (`{category_id, parent_id, name, is_group, in_force, amount, cadence, expected, spent, result, is_overspent, transaction_count, display_order, committed}`)
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
`committed`: the monthly costs of the subscriptions in force in the period on that leaf (a
group: its subcategories'), shown **inside** `expected` ("CHF 19.90 of CHF 50 committed"),
never added to it; it may exceed `expected`. A category not in force that carries a
committed amount gets a row too, like one with transactions. Balances do not carry over
from one period to the next. **Nulls**: `parent_id` is null for a top-level row; `amount`
and `cadence` are null for a group and for a row not in force; every other field is never
null (the generated type marks them all nullable). Errors: `period_not_found`.
(R-PROGRESS-001, R-PROGRESS-002, R-PROGRESS-070, R-PROGRESS-071, R-PROGRESS-090 to
R-PROGRESS-092, R-COMPARE-001, R-SUBSCRIPTION-079, D-147, D-173)

### Subscriptions

A subscription has a name, a **price** (charged in full on each charge date), a **cadence**
(`'monthly'`, `'quarterly'`, `'half_yearly'`, `'yearly'`), a **category** (a leaf) and a
**schedule**: from its first charge date it repeats every 1, 3, 6 or 12 months on its
**nominal day** of the month (`charge_day`: the day of the first charge date, or of a next
charge date given with a change), clamped to the month's length (31 January monthly: 28 or
29 February, 31 March, 30 April), weekends included. A clamped date never moves the nominal
day: a schedule re-anchored on 28 February keeps charging on the 31st where the month has
one (R-SUBSCRIPTION-130, D-200). Its terms are versioned like a category's expectation; its
validity is `first_seq` / `end_seq`. Its monthly cost (price / months, rounded half up) is
**committed** within its category's expectation for each period in which it is in force.
(R-SUBSCRIPTION-001, R-SUBSCRIPTION-002, R-SUBSCRIPTION-070 to R-SUBSCRIPTION-072,
R-SUBSCRIPTION-079, D-108, D-110, D-173)

**Automatic charges.** The catch-up (`ensure_periods`, `get_current_period`, every write)
creates, for every scheduled date up to today in a period where the subscription is in
force, an `'expense'` transaction at the price in force in that period, in its category,
linked to it, with `charge_date` set and `review_state = 'awaiting_confirmation'`. It counts
in the totals at once. Each date is charged at most once, however many members open the
budget at once; dates missed while nobody opened the app are caught up; a charge that was
deleted or answered "did not go through" is never created again; no edit, correction or
reopen creates a charge for a date already passed. A new subscription counts from the start
of the period it is created in: its charges of that period up to today are created at once
(awaiting confirmation); created as a correction from an earlier period, so are those of the
earlier periods. When the budget holds 50 000 transactions, charges wait (none is skipped)
until there is room, and are then created at the price and category of the terms in force in
their own period. A charge is due when a subscription's next scheduled date has come; only
then does a read take the lock and write (R-SUBSCRIPTION-131, D-204). (R-SUBSCRIPTION-073,
R-SUBSCRIPTION-075, R-SUBSCRIPTION-078, R-SUBSCRIPTION-111, R-SUBSCRIPTION-112, D-109,
D-171, D-175, D-176)

**The dashboard** (R-SUBSCRIPTION-076): call `get_current_period` (which catches up), then
`list_charges_awaiting_confirmation(p_budget_id)`; for each row show its
`subscription_name`, `amount`, `date` and `category_name`, and offer "it went through"
(`confirm_subscription_charge` with the row's `id` and `revision`) and "it did not go
through" (`dismiss_subscription_charge`, same arguments), or "all went through"
(`confirm_subscription_charges`). On `record_changed`, reload the list (another member
answered first). `my_budgets.charges_awaiting` gives the budget's count (for a badge, without
listing), `subscription_overview.awaiting_count` the count per subscription. In the
transaction list, `charge_date` marks an automatic charge and `review_state` whether it
awaits confirmation; `list_transactions(..., p_awaiting_only => true)` lists only those.

All subscription RPCs are for members; each catches up first, and each that changes an
existing subscription takes `p_expected_revision` (from `subscription_overview`).

**`subscription_charge_dates(p_first_charge_date, p_cadence, p_from = null, p_count = 12) -> date[]`**
(a set of dates) Pure: the next `p_count` (1 to 60) charge dates of a schedule on or after
`p_from` (default: the first charge date), its nominal day the first date's. For a form, use
the two previews below instead: they answer with the write's own arguments and schedule.
Errors: `invalid_charge_date`, `invalid_cadence`, `invalid_limit`. (R-SUBSCRIPTION-071)

**`preview_create_subscription(p_budget_id, p_cadence, p_first_charge_date, p_from_period_id = null, p_count = 12) -> {charge_date, charged_at_once}[]`**
The charges `create_subscription` with these arguments would make: from the start of the
period it counts from, at most `p_count` (1 to 60) scheduled dates, never beyond the
budget's end; `charged_at_once`: up to today, created with it (awaiting confirmation).
Changes nothing. Errors: those of `create_subscription` for these arguments, and
`invalid_limit`. (R-SUBSCRIPTION-133)

**`preview_update_subscription(p_subscription_id, p_price = null, p_cadence = null, p_category_id = null, p_next_charge_date = null, p_from_period_id = null, p_count = 12) -> date[]`**
(a set of dates) The next charge dates `update_subscription` with the same arguments would
produce: the scheduled dates not yet charged, at most `p_count`, under the terms that would
then be in force from the current period on (a correction shadowed by a later change changes
none of them), never beyond the budget's end; none for an ended subscription. Changes
nothing. Errors: those of `update_subscription` for these arguments, and `invalid_limit`.
(R-SUBSCRIPTION-133)

**`create_subscription(p_budget_id, p_name, p_price, p_cadence, p_category_id, p_first_charge_date, p_from_period_id = null) -> subscription_overview[]`** (one row)
In force from the current period, or, as an explicit correction, from `p_from_period_id`.
`p_first_charge_date` may be in the past (it sets the nominal day and phase of the
schedule; only dates from the subscription's first period are charged) or up to ten years
ahead. The category must be a leaf in force in **every period from then on** (an ending
category refuses it: `category_not_in_force`). Errors: `budget_not_found`,
`invalid_name`, `invalid_amount` (1 to 1 000 000 000), `invalid_cadence`,
`invalid_charge_date`, `category_required`, `category_not_found`, `category_is_group`,
`category_not_in_force`, `period_not_found`, `subscription_limit_reached` (50 in force, 200
in all, void ones not counted), `budget_ended` (no current period and no correction).
(R-SUBSCRIPTION-001, R-SUBSCRIPTION-110, R-SUBSCRIPTION-112)

**`update_subscription(p_subscription_id, p_expected_revision, p_name = null, p_price = null, p_cadence = null, p_category_id = null, p_next_charge_date = null, p_from_period_id = null) -> subscription_overview[]`** (one row)
Rename and/or change the terms (each omitted keeps its value). New terms apply from the
current period; past periods keep theirs; a second change in the same period replaces the
first; with `p_from_period_id`, an explicit correction until the next existing change.
Charges already created never change. **The schedule** (D-170): `p_next_charge_date` (after
today) is the date of the next charge, and later ones follow from it at the cadence; a new
cadence without a date continues from the next charge date of the current schedule; any
other edit keeps the schedule. A correction may name any date (it changes the schedule
recorded for those periods and the charges still to come). A next charge date also sets
the nominal day; a new cadence without a date keeps it. The category of the new terms must
be in force in every period they cover (up to the next existing change, or open-ended).
Show the effect with `preview_update_subscription` (same arguments). Errors:
`subscription_not_found`,
`record_changed`, `invalid_revision`, `invalid_name`, `invalid_amount`, `invalid_cadence`,
`invalid_charge_date`, `category_not_found`, `category_is_group`, `category_not_in_force`,
`subscription_ended` (no new terms from now for an ended one; a correction within its
validity), `invalid_period` (before it started, or `p_from_period_id` without new terms),
`period_not_found`, `budget_ended`. (R-VERSION-003, R-VERSION-005, R-VERSION-006,
R-VERSION-012, R-SUBSCRIPTION-114, R-SUBSCRIPTION-130, R-CATEGORY-130, R-CONCURRENCY-070)

**`end_subscription(p_subscription_id, p_expected_revision, p_from_period_id = null) -> 'deleted' | 'ended'`**
From the current period, or as a correction from an earlier one: no charge from then on.
Deleted when it never counted before that period and has no transaction
(`subscription_overview.removal_deletes` says so beforehand); otherwise ended, keeping its
charges (kept void when it would never be in force). Charges awaiting confirmation still
await an answer. Errors: `subscription_not_found`, `record_changed`, `invalid_revision`,
`subscription_ended`, `period_not_found`, `budget_ended`. (R-SUBSCRIPTION-113)

**`preview_end_subscription(p_subscription_id, p_from_period_id = null) -> {outcome, refusal}[]`**
(one row) What `end_subscription` from that period (default: the current one) would do now:
`outcome` `'deleted'` or `'ended'`, or `outcome` null and `refusal` the code the write would
answer (`subscription_ended`, `budget_ended`, `period_not_found`). Changes nothing. Errors:
`subscription_not_found`. (R-SUBSCRIPTION-136)

**`confirm_subscription_charge(p_transaction_id, p_expected_revision) -> transaction_list[]`** (one row)
The charge went through: `review_state` becomes `'confirmed'` (already confirmed: nothing
changes). **`dismiss_subscription_charge(p_transaction_id, p_expected_revision) -> void`**
It did not go through: the transaction is deleted and never created again. Both: the
transaction's revision; errors `transaction_not_found`, `record_changed`,
`invalid_revision`, `not_a_charge` (not an automatic charge). (R-SUBSCRIPTION-075,
R-SUBSCRIPTION-077)

**`confirm_subscription_charges(p_budget_id, p_through_date = null) -> integer`** Confirms
every charge of the budget awaiting confirmation dated up to `p_through_date` (default:
today) and returns how many. Under the budget lock: two members doing it at once confirm each
charge once (the second gets 0). No revision: it acts on what is awaiting when it runs.
Errors: `budget_not_found`, `invalid_date`. (R-SUBSCRIPTION-134)

**`list_charges_awaiting_confirmation(p_budget_id, p_limit = 50) -> transaction_list[]`**
The automatic charges awaiting confirmation, oldest first, at most `p_limit` (1 to 200).
Catches up first, like `get_current_period`. Errors: `budget_not_found`, `invalid_limit`.
(R-SUBSCRIPTION-075, R-SUBSCRIPTION-076)

### Debts

A debt the household owes: a name, a **principal** (the balance on its `opened_on`), and
versioned terms: a **category** (a leaf: payments are expenses there; part of the terms
since this round, so a change from a period on keeps earlier payments where they are,
D-207), a yearly **interest rate** (percent, three decimals; 0: none) and a **planned
monthly payment** (per period; 0: none). Its **remaining amount** is
`principal + interest + adjustments - payments` (`debt_overview.remaining`), computed by the
database from its rows; it may be negative when overpaid (`overpaid_by`). What the budget
still owes in all is `debt_totals.remaining_total` (only positive remaining amounts of debts
in force; `owing_count` of them), so the client adds nothing up (D-216). No payment or
adjustment is dated before `opened_on` (`before_debt_opened`, D-202). An **ended debt is
frozen**: no payment can be linked to it, changed or deleted, and no adjustment added or
deleted (`debt_ended`, D-209). (R-DEBT-001 to R-DEBT-003, R-DEBT-070 to R-DEBT-072,
R-DEBT-131, R-DEBT-133, R-DEBT-134, R-DEBT-136, D-111 to D-113)

**Interest** (R-DEBT-073, R-DEBT-111, R-DEBT-113, D-172): when a period is created, however
it comes to exist (roll-over, catch-up over several periods, an early salary), each debt in
force in it with a rate and a positive remaining amount gets one interest entry: one twelfth
of the rate in force then on the remaining amount at that moment, rounded half up. Exactly
once per debt and period; a reopen that merges the period removes its entry
(`preview_reopen` says `'interest_removed'`), and creating the period again adds it again,
once. Interest already added is never recomputed (corrections of the rate apply to later
periods; fix a past amount with an adjustment).

**Payments** are transactions: `add_transaction(..., p_debt_id)` (an expense in the category
of the debt's terms in force in the period of its date) or `link_transaction`, or
`update_transaction(..., p_relink => true, p_debt_id => ...)` to change the fields and the
link together. They count in the category's spending and the period's
totals like any expense, and reduce the remaining amount. (R-DEBT-071, R-TRANSACTION-003)

**The projection** (R-DEBT-005, R-DEBT-074, R-DEBT-112, D-181), in `debt_overview`, under the
terms in force now: `payoff = 'paid_off'` when nothing remains; otherwise the planned payment
still due in the current period (the planned payment minus what was paid in it) is paid
first, then every later period adds its interest and receives the planned payment.
`'ends'`: `payments_left` and `expected_end_date` (the projected end of the period of the
last payment, exactly as the catch-up will create those periods under the terms in force,
whatever the current period's end: R-PERIOD-131, D-203; a later change of the primary
income's schedule moves it); `expected_end_after_budget_end` when it falls after the
budget's end (R-DEBT-132). `'never'`: the planned payment does not exceed one period's
interest (equal counts as never), or the debt would run beyond 600 periods (50 years).
`'paid_off'`: `payments_left` 0. All null for an ended debt. `paid_percent` (D-215): the
payments over principal + interest + adjustments, a whole percent rounded down, 100 exactly
when nothing remains, 0 while nothing has been paid; show it beside `payoff`, which stays
the answer to "is it paid off".

**The chart of a debt's evolution** reads `get_debt_history(p_debt_id)` page by page: one
row per event, oldest first, with `date`, `kind`, `amount` (its effect) and `balance` (the
remaining amount after it); plot `balance` against `date` (a step line), and mark the kinds.
Group by `period_id` for one point per period.

All debt RPCs are for members; each catches up first, and each that changes an existing
debt takes `p_expected_revision` (from `debt_overview`).

**`create_debt(p_budget_id, p_name, p_principal, p_category_id, p_monthly_payment, p_interest_rate = null, p_from_period_id = null) -> debt_overview[]`** (one row)
In force from the current period (`opened_on` today), or, as a correction, from
`p_from_period_id` (`opened_on` that period's start; no interest is added for periods that
already exist). The category must be a leaf in force in every period from then on. Errors:
`budget_not_found`,
`invalid_name`, `invalid_amount` (principal 1 to 1 000 000 000, payment 0 to
1 000 000 000), `invalid_interest_rate` (0 to 100, at most three decimals),
`category_required`, `category_not_found`, `category_is_group`, `category_not_in_force`,
`period_not_found`, `debt_limit_reached` (50 in force, 200 in all), `budget_ended`.
(R-DEBT-001, R-DEBT-002, R-DEBT-070, R-DEBT-110, R-DEBT-131, R-CATEGORY-130)

**`update_debt(p_debt_id, p_expected_revision, p_name = null, p_category_id = null, p_principal = null, p_interest_rate = null, p_monthly_payment = null, p_from_period_id = null) -> debt_overview[]`** (one row)
`p_name`; `p_principal` (only while `has_history` is false, otherwise `debt_has_history`:
adjust the balance instead); terms `p_category_id` / `p_interest_rate` /
`p_monthly_payment` (each omitted keeps its value) from the current period, or as a
correction from `p_from_period_id` until the next change. A new category applies to the
periods the new terms cover (payments dated in earlier periods stay where they are) and must
be a leaf in force in all of them. Errors: `debt_not_found`,
`record_changed`, `invalid_revision`, `invalid_name`, `invalid_amount`,
`invalid_interest_rate`, `category_not_found`, `category_is_group`, `category_not_in_force`,
`debt_has_history`, `debt_ended`, `invalid_period`, `period_not_found`, `budget_ended`.
(R-VERSION-004, R-VERSION-012, R-DEBT-070, R-DEBT-114, R-CATEGORY-130)

**`remove_debt(p_debt_id, p_expected_revision, p_from_period_id = null) -> 'deleted' | 'ended'`**
Deleted when it never counted before that period and has no payment, interest or
adjustment (`debt_overview.removal_deletes`); otherwise ended from that period: no more
interest, no new payments dated from then on, and its history and remaining amount stay.
Errors: `debt_not_found`, `record_changed`, `invalid_revision`, `debt_ended`,
`period_not_found`, `budget_ended`. (R-DEBT-001, R-DEBT-113)

**`preview_remove_debt(p_debt_id, p_from_period_id = null) -> {outcome, refusal}[]`** (one
row) What `remove_debt` from that period (default: the current one) would do now, like
`preview_end_subscription`. Errors: `debt_not_found`. (R-DEBT-138)

**`adjust_debt_balance(p_debt_id, p_expected_revision, p_balance, p_date = null, p_note = null) -> debt_overview[]`** (one row)
Match the bank statement: send the balance the bank shows (`p_balance`, 0 to
1 000 000 000 000); the database records the difference as an adjustment dated `p_date`
(default today, or the budget's last day once it has ended, D-206; from the debt's
`opened_on` to today) with an optional note (up to 500 characters), so `remaining` becomes
`p_balance`. No entry when there is no difference. Errors: `debt_not_found`,
`record_changed`, `invalid_revision`, `invalid_amount`, `invalid_date`,
`date_outside_periods`, `before_debt_opened`, `debt_ended`, `invalid_description`,
`adjustment_limit_reached` (5000 per budget). (R-DEBT-075, R-DEBT-131, R-DEBT-134)

**`delete_debt_adjustment(p_adjustment_id, p_expected_revision) -> debt_overview[]`** (one row)
`p_expected_revision`: **the debt's**. Errors: `adjustment_not_found`, `record_changed`,
`invalid_revision`, `debt_ended`. (R-DEBT-075, R-DEBT-134)

**`get_debt_history(p_debt_id, p_limit = 500, p_after_date = null, p_after_kind = null, p_after_created_at = null, p_after_id = null) -> debt_history_row[]`** (`{entry_id, kind, date, amount, balance, period_id, description, created_at}`)
`kind`: `'opened'` (the principal, on `opened_on`), `'interest'` (on its period's start),
`'adjustment'`, `'payment'` (`amount` negative; `entry_id` is the transaction's). Oldest
first; on one date the principal, then interest, then adjustments and payments together in
the order they were recorded (`created_at`, then `entry_id`). `description`: the
adjustment's note or the payment's description (may be null). **Paged**: at most `p_limit`
rows (1 to 1000); for the next page pass the last row's `date`, `kind`, `created_at` and
`entry_id` as `p_after_date`, `p_after_kind`, `p_after_created_at`, `p_after_id` (all four);
a page shorter than `p_limit` is the last. `balance` is always over the whole history, so the
last row of the last page has `remaining`. With TanStack Query, `useInfiniteQuery` keyed by
budget id and debt id. Errors: `debt_not_found`, `invalid_limit`, `invalid_cursor`.
(R-DEBT-004, R-DEBT-135)

**`get_debt_terms(p_debt_id, p_period_id) -> {period_id, in_force, category_id, interest_rate, monthly_payment, terms_from_period_id, until_period_id}[]`**
and **`get_subscription_terms(p_subscription_id, p_period_id) -> {period_id, in_force, price, cadence, category_id, anchor_date, charge_day, terms_from_period_id, until_period_id}[]`**
(one row each) Member. See "Terms in a chosen period". (R-VERSION-132, R-VERSION-133)

### Terms in a chosen period

`get_subscription_terms`, `get_debt_terms`, `get_category_terms` and `get_income_terms`
(each `(p_<record>_id, p_period_id)`, one row) give, for a correction form, the terms of the
record in force in that period (`in_force` false and the terms null when the record is not
in force there), the period they took effect (`terms_from_period_id`), and
`until_period_id`: the first period of the next existing change or of the record's end (null:
open-ended, or beyond the latest period). A correction from `p_period_id` applies up to the
period before `until_period_id`: say so in the form ("from March to June; July has its own
terms"). Errors: `<record>_not_found`, `period_not_found`. (R-VERSION-132, R-VERSION-133)

### In an ended budget

Once a budget has ended (no current period), step 4 allows (R-BUDGET-008, R-BUDGET-130):

- reads: every view, `list_transactions`, `get_debt_history`, the terms reads, the previews
  of corrections (`preview_update_subscription` with `p_from_period_id`;
  `preview_end_subscription` / `preview_remove_debt` answer `budget_ended` as `refusal`
  without a period);
- answering charges: `confirm_subscription_charge`, `dismiss_subscription_charge`,
  `confirm_subscription_charges`;
- transactions within the periods: `add_transaction` (also a payment, with `p_debt_id`),
  `update_transaction`, `link_transaction`, `delete_transaction`;
- debts: `adjust_debt_balance` (without a date: dated on the budget's last day, D-206),
  `delete_debt_adjustment`;
- corrections, with `p_from_period_id`: `create_subscription`, `update_subscription`,
  `end_subscription`, `create_debt`, `update_debt`, `remove_debt`.

Refused with `budget_ended`: the same writes without `p_from_period_id` (they act from the
current period), and `preview_create_subscription` without `p_from_period_id`. No charge or
interest is created after the budget's last period.

### Period comparison

Three reads, one per view (D-260). Every figure comes from the database, from the same code
as `period_summaries` and `get_period_progress`, so the comparison always agrees with the
progress view; the client only draws. All are for members (`budget_not_found` for anyone
else, also before any argument error); each catches the budget up like `get_current_period`
(no lock and no write when nothing is due) and writes nothing else. After a very long absence
not yet caught up (`my_budgets.caught_up` false) they answer `catching_up`: call
`ensure_periods` until it returns 0, then read again. Key their queries by budget id (and
`p_count`, or the two period ids). (R-COMPARE-175, R-COMPARE-176, D-263)

**The range** (R-COMPARE-171): `p_count` periods (1 to 24, default 12; the screens offer 6,
12 and 24; otherwise `invalid_limit`) ending at the current period, or at the last period once
the budget has ended, oldest first. A budget with fewer periods gives all it has. A period
merged by a reopen is gone; its spending is in the reopened one. Periods are 7 to 92 days
long: each row gives `start_date`, `end_date` (inclusive) and `days`; amounts are never scaled
(Q-080). (R-COMPARE-173)

**Averages** (R-COMPARE-172, D-261): over the **completed** periods of the range only
(`end_date` before today; the running period is never averaged), to the rappen with halves
rounded away from zero (-2.5 → -3). `completed_count` says how many; with none, every average
is **null** (show "no completed period yet"), never 0. `average_result` is the average of the
results: it may differ by one rappen from `average_income - average_spent`.

**`get_period_trend(p_budget_id, p_count = 12) -> {...}[]`** (one row per period of the
range, by `seq`) (R-COMPARE-002)

| Column | Meaning |
| --- | --- |
| `period_id`, `seq`, `start_date`, `end_date`, `days` | the period |
| `is_current` | the period containing today: still running (mark it) |
| `is_completed` | it ended before today (an ended budget: every period) |
| `income_total`, `salary_total`, `extra_income_total`, `spent_total`, `expected_total` (the planned total), `committed_total`, `result` | exactly that period's `period_summaries` row |
| `completed_count`, `average_income`, `average_spent`, `average_result` | the range's averages, the same on every row (null when `completed_count` is 0) |

**`get_category_trend(p_budget_id, p_count = 12) -> {...}[]`** (one row per category line and
period of the same range; ordered by `display_order`, then `seq`) (R-COMPARE-070, R-COMPARE-170,
R-COMPARE-174)

A **line** is a category (group, subcategory or ordinary category) that has a row in
`get_period_progress` of at least one period of the range; it has a row in **every** period of
the range. It is the category's id, under its **current** `name` and place (`parent_id`,
`display_order`), whatever happened to it meanwhile: renamed, ended, restored, emptied into
"Other" by its first subcategory, or left void by a removal or a reopen. Show the top level
(`parent_id` null: groups and ordinary categories) and open a group (`is_group`) on its
subcategories (`parent_id` = the group).

| Column | Meaning |
| --- | --- |
| `category_id`, `parent_id`, `name`, `is_group`, `display_order` | the line (the same on all its rows) |
| `period_id`, `seq`, `start_date`, `end_date`, `days`, `is_current`, `is_completed` | the period of this row |
| `in_force` | the category is in force in that period |
| `planned` | the monthly share of its expectation then (a group: its subcategories'); **null when not in force** (not 0) |
| `spent` | expenses minus refunds dated in the period (may be negative); 0 when nothing; also counted where it was not in force |
| `committed` | the subscriptions' monthly costs on it then, inside `planned` |
| `transaction_count` | its transactions in the period |
| `completed_count`, `average_spent` | the line's average spent over the completed periods of the range (every completed period counts, also those where it was not in force: Q-160); null when none is completed |

**Adds up, exactly**: in each period the `spent` of the top-level lines add up to the trend's
`spent_total`, and so do the lines with `is_group` false. There is no "uncategorised" line:
every expense and refund has a category, and extra income is income, never spending (as in
`period_summaries` and `get_period_progress`). (R-COMPARE-170, D-262)

**`get_period_comparison(p_budget_id, p_period_a_id = null, p_period_b_id = null) -> {...}[]`**
(R-COMPARE-071, R-COMPARE-174)

Any two periods of the budget, in either order. Defaults: B is the current period (the last
one once the budget has ended), A the one before B; when B is the first period, side A is
empty (`a_period_id` and every `a_*` null). The first row has `kind = 'total'`; then one row
per category with a progress row in A or in B (`kind = 'category'`), by `display_order`. Every
row repeats `a_period_id`, `a_start_date`, `a_end_date`, `a_days` and the same for B.

| Column | `kind = 'total'` | `kind = 'category'` |
| --- | --- | --- |
| `category_id`, `parent_id`, `name`, `is_group`, `display_order` | null | the category (current name) |
| `a_in_force`, `b_in_force` | the side exists | in force in that period |
| `a_planned`, `b_planned` | `expected_total` | its planned amount; null when not in force there or when the side has nothing on it |
| `planned_difference` | B minus A (null without A) | B minus A; null unless both sides plan something |
| `a_spent`, `b_spent` | `spent_total` | spent; **null when that period has nothing on the category** (not in force and nothing spent or committed) |
| `spent_difference` | B minus A | B minus A, an empty side counting as nothing spent (never null) |
| `a_committed`, `b_committed`, `committed_difference` | `committed_total`, B minus A | likewise |
| `a_transaction_count`, `b_transaction_count` | the period's transactions on categories | the category's |
| `a_income`, `b_income`, `income_difference`, `a_result`, `b_result`, `result_difference` | `income_total`, `result`, B minus A | null |

The totals are the periods' `period_summaries` rows and each side's categories its
`get_period_progress` rows; the top-level `spent_difference` values add up to the total's.
Errors: `budget_not_found`, `period_not_found` (an id that is not a period of this budget),
`catching_up`.

**Nulls**: the generated types mark every column of these three functions as non-null; the
columns this section says may be null (`planned`, the averages, every `a_*` and `b_*` figure
of a side with nothing, the category columns of the total row, the income and result columns
of category rows, `planned_difference`) are nullable: type them as such in the client.

Measured locally at the limits (63 periods, 200 categories, 50 000 transactions, 50
subscriptions and 50 debts in force): `get_period_trend` 24 periods 46 ms, `get_category_trend`
24 periods (4800 rows) 97 ms, `get_period_comparison` 19 to 25 ms (medians).

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
transactions (`transaction_list.revision`: also a charge's confirmation and a link),
subscriptions (`subscription_overview.revision`: name, terms, validity; not the charges
the catch-up creates, nor its bookkeeping), debts (`debt_overview.revision`: name,
principal, terms (the category included), validity, adjustments; not payments or interest).
A category group's revision also moves with any change to its subcategories
(R-CONCURRENCY-130); a primary switch moves both incomes' (R-CONCURRENCY-131). A reopen changes the records it re-keys (their
revision moves). A write paired with a preview (`update_income`, `set_primary_income`)
takes the previewed end too (`p_previewed_end_date`; `update_income` refuses an edit that
moves the end without it: `preview_required`). The order of categories is the one
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
| `category_in_use` | a subscription or debt uses the category from that period on: end or move it first; the error's detail lists them as JSON `[{kind, id, name}]` |

Step 4 messages:

| Message | Meaning |
| --- | --- |
| `subscription_not_found`, `debt_not_found`, `adjustment_not_found` | does not exist (any more) or not visible to you |
| `subscription_ended`, `debt_ended` | it has ended (for that period); an ended debt is frozen: no payment or adjustment can be added, changed or removed |
| `before_debt_opened` | a payment or adjustment dated before the debt's `opened_on` |
| `catching_up` | after a very long absence the budget is still being caught up: call `ensure_periods` until it returns 0, then retry |
| `preview_required` | an income edit that moves the current period's end needs the end its preview showed (`p_previewed_end_date`) |
| `invalid_charge_date` | not a valid date, more than ten years ahead, or (a new schedule from now) not after today |
| `invalid_interest_rate` | not 0 to 100, or more than three decimals |
| `invalid_link` | a transaction linked to both, a linked refund or extra income, or a payment outside the debt's category |
| `debt_not_in_force`, `subscription_not_in_force` | not in force in the period of the transaction's date |
| `not_a_charge` | only an automatic charge can be confirmed or dismissed |
| `debt_has_history` | the principal of a debt with payments, interest or adjustments cannot change: adjust the balance |
| `subscription_limit_reached`, `debt_limit_reached`, `adjustment_limit_reached` | a limit (50 subscriptions in force or 200 in all; 50 debts in force or 200 in all; 5000 adjustments) |

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
(record kind `'category'`) and `category_expectations`; step 4 `subscriptions`
(`'subscription'`), `subscription_versions`, `debts` (`'debt'`) and `debt_versions`, and a
`merge_order` (referrers re-keyed before what they reference: categories last); after a
merge, a version at or after its row's end is deleted (D-208). A row
referencing a registered row of another table through a plain foreign key also needs its
own `budget_id` foreign key to `budgets` with `on delete cascade` (as
`subscription_versions` and `debt_adjustments` have), or deleting the budget can check the
plain reference before the cascade reaches the referencing row.

Every new editable table follows "Concurrent edits" above: a `revision` column, the
`private.bump_revision` trigger, a required `p_expected_revision` on its edit RPCs.

Every query costs what the budget holds (R-CATEGORY-102): filter by `budget_id` or by a
row's own id or category through an index; a lookup by a value with very uneven counts
(such as a category id) in a function must not fall back to a sequential scan (`set
enable_seqscan = off` in the function, as `private.category_has_transactions`); a helper
called per row or per period by a view is plpgsql, whose plans are kept for the session (a
SQL function with a `set` clause is planned again on every call, D-217); a deferred check
of a row checks that row, not the whole budget, so operations touching hundreds of rows
stay fast (D-153).

Rows dated rather than keyed to periods (like transactions) store the date only, and must
keep it within the budget's periods; `private.check_transactions_in_periods` is the model.

### Transactions in later steps

The `transactions` table takes later columns without reshaping, each nullable or defaulted
so existing rows and RPCs keep working, each added in that step's migration with its index
and its check:

- **Step 4, links (done; R-TRANSACTION-003, D-111, D-112, D-175)**: `subscription_id uuid`
  and `debt_id uuid`, each a composite foreign key `(…, budget_id)` to its table, plain (a
  subscription or debt with transactions is ended, never deleted; a merge keeps it void),
  with `check (num_nonnulls(subscription_id, debt_id) <= 1)`, a check that a linked
  transaction is an expense, and an index each; `charge_date date` (unique with
  `subscription_id`) and `review_state public.review_state not null default 'confirmed'`
  (an enum: `'confirmed'`, `'awaiting_confirmation'` for automatic charges).
- **Step 6, imports (D-115, D-118)**: `source text not null default 'manual'` (with a check
  listing the sources), `external_id text` with a unique index on
  `(budget_id, source, external_id) where external_id is not null` for duplicates; and a
  new value of the enum `review_state`, `'to_review'`, for imported rows, which count in
  totals at once (D-118): `alter type public.review_state add value` and extend
  `transactions_awaiting_is_charge` (which ties a state other than `'confirmed'` to a charge). The import RPC inserts many rows under one budget lock,
  with the same checks as `add_transaction` (shared helpers: `private.transaction_period_seq`,
  `private.assert_transaction_category`).
- `add_transaction` gains optional arguments for the new columns (default null, at the
  end), so step 3 callers keep working; `update_transaction` keeps columns it does not take
  (step 4: the links, changed by `link_transaction`); `transaction_list` appends the new
  columns at its end.
