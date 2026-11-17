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
- **At most 1000 rows per answer** (R-APP-170, D-264): the API cuts a longer answer
  **without an error**. Every read below fits, or is paged; the largest answers at the limits:

  | Read | Most rows | Bound by |
  | --- | --- | --- |
  | `period_summaries` for a whole budget | unbounded (one per period, for the budget's whole life) | **page with `list_periods`** (at most 200) |
  | `list_periods`, `list_transactions`, `list_charges_awaiting_confirmation` | 200 | `p_limit` |
  | `get_debt_history` | 1000 | `p_limit` (1 to 1000) |
  | `category_overview`, `get_period_progress`, `get_category_trend` | 900 | 900 categories per budget, void ones included |
  | `get_period_comparison` | 901 | the same, plus its total row |
  | `subscription_overview`, `debt_overview` | 900 | 900 subscriptions / debts per budget, void ones included |
  | `income_overview` | 500 | 500 incomes in all (a void income is deleted) |
  | `preview_reopen` | 1000 | listed up to 1000, the last row counting the rest |
  | `get_period_trend` | 24 | `p_count` |
  | `list_categories_for_date` | 501 | the categories in force on that date: 200 in force now, but a date in a past period may have up to the 500 categories of the budget in force, plus "to categorise" |
  | `budget_member_list` (one budget), `budget_invitations` (one budget) | 20 | members, pending invitations |
  | `debt_totals`, `get_*_terms`, the one-row previews and RPCs | 1 | |
  | `preview_create_subscription`, `preview_update_subscription`, `subscription_charge_dates` | 60 | `p_count` |
  | `preview_import`, `import_transactions`, `import_skipped_anyway` | 500 | rows per call |
  | `preview_import_part` | 500 | rows in `rows` (one JSON object) |
  | `import_with_token` | 250 | rows per call (a token call) |
  | `list_import_batches`, `list_import_skipped_rows`, `list_import_choices` | 200 | `p_limit` (the tables themselves are not selectable) |
  | `merchant_rule_list` (one budget) | 500 | 500 rules a budget |
  | `account_overview`, `transfer_overview` (one budget) | 900 | 900 accounts / transfers per budget, void ones included |
  | `get_money_flow` | about 900 | the incomes (500 in all), accounts and transfers (200 each, not void) in force in the period, plus two |
  | `get_transfer_checklist` | 1000 | one row per occurrence (a transfer can have several in a long period) and per mark no longer planned; beyond 1000, the first 999 and a last row with `status` `'more'` (its `name` the number not listed) |
  | `preview_create_transfer`, `preview_update_transfer` | 60 | `p_count` |
  | `import_token_list` (one budget) | 30 | 10 that can be used, plus the newest 20 revoked or expired (pruned after 365 days) |
    | `my_budgets` | 50 | the budgets you belong to (R-MEMBER-250: 20 owned, 50 in all) |
  | `list_my_invitations` | 200 | `p_limit` |
  | the tables (`transactions`, `subscription_versions`, ...) | unbounded | select them only by id or by one record's id |
- **Writes** go through the RPCs (`supabase.rpc(name, args)`); the only direct write left
  is your own profile's display name.
- **A retried add records once** (R-APP-250, D-390): `add_transaction`, `add_income`,
  `create_category`, `create_subscription`, `create_debt`, `create_account` and
  `create_transfer` take `p_client_id`, a uuid the client generates **once per user action**
  (when the form is submitted, not per request) and sends again with every retry of it. Sent
  again by the same member, for the same budget, the same call and the same arguments, it
  creates nothing and answers the rows the first call created, as they are now (none if
  deleted since). Any other use of a known id (another member, another budget, another call,
  other arguments) is refused with `request_reused` before anything is written, and says
  nothing about the first request. **Membership comes first** (R-APP-340, D-461): a signed-in
  outsider or a removed member gets `budget_not_found` for every budget and every client id,
  known or not, far behind or not; a replay answers a current member only rows of the budget it
  names, and nothing for a record removed since (`add_income` then answers null). Ids are kept
  7 days. Without `p_client_id` the calls behave
  as before. The other writes need nothing: edits, ends, marks (`mark_transfer_done`) and
  `adjust_debt_balance` name the revision they read (a retry answers `record_changed`: read
  again and show what is there), and an import chunk is idempotent by batch and chunk. Argument names start with `p_`; arguments with a
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
| `my_budgets` (view) | budgets I belong to | `id`, `name`, `owner_id`, `primary_income_id`, `end_date_entered` (the end date the owner entered; null: no end), `end_date` (the end shown: the end of the period containing the date entered, projected while that period does not exist), `is_owner`, `created_at`, `updated_at`, `caught_up` (false while the budget needs more `ensure_periods` calls: after an absence, and whenever a subscription charge or a transfer's transaction is due and not yet created), `charges_awaiting` (how many automatic charges await confirmation), `to_review` (how many transactions are to review: imported and not yet confirmed; step 6), `to_categorise_category_id` (the budget's "to categorise" category while it is in force; null when there is none or it has ended; step 6), `transfers_to_do`, `transfers_overdue` (the manual transfers of the current period and of the period before it still to do, and of those the overdue ones; R-ACCOUNT-241, D-395), `first_period_start` (the first period's start: the earliest date a transaction can have, whatever the number of periods; D-392; the last date is `end_date` once the budget has an end, otherwise today) | R-BUDGET-004, R-BUDGET-008, R-BUDGET-014, R-PERIOD-130, R-SUBSCRIPTION-135, R-IMPORT-081, R-CATEGORY-250, R-ACCOUNT-241 |
| `budget_member_list` (view) | members of my budgets | `budget_id`, `user_id`, `role` (`'owner'` \| `'member'`), `display_name` (may be null), `email`, `joined_at` | R-MEMBER-001, R-PROFILE-003 |
| `budget_invitations` | pending invitations; **owner only** | `id`, `budget_id`, `email` (lower case), `invited_by`, `created_at`, `expires_at` (30 days after the last invite; an expired one cannot be accepted, re-invite to renew) | R-MEMBER-004, R-INVITE-007, R-INVITE-009 |
| `income_overview` (view) | incomes, ended ones included | `id`, `budget_id`, `user_id` (whose income; null if their account was deleted), `user_display_name` (also for a former member), `name`, `is_primary`, `is_active` (in force in the current period), `first_seq`, `end_seq`, terms in force now `amount`, `pay_day`, `weekend_rule`, `terms_from_seq`, `next_pay_date` (first actual pay date on or after today; null when ended), `account_id`, `account_name` (the account it is paid into, terms in force now; null: none) | R-INCOME-003, R-INCOME-006, R-VERSION-001, R-PROFILE-004, R-ACCOUNT-236 |
| `period_summaries` (view) | existing periods | `id`, `budget_id`, `seq`, `start_date`, `end_date` (inclusive), `end_is_manual`, `is_current`, `today`, `income_total` (`salary_total` + `extra_income_total`), `salary_total` (incomes in force in the period, each at the version in force then: the sum of the incomes' own amounts, so the income page's total for the current period is this figure), `extra_income_total` (extra incomes dated in it), `expected_total` (the rounded monthly shares of the expectations in force, added up), `spent_total` (expenses minus refunds dated in it, automatic charges and debt payments included; may be negative), `left_to_assign` (`income_total - expected_total`; negative when over-assigned), `result` (`income_total - spent_total`: a surplus when positive, a deficit when negative), `committed_total` (the monthly costs of the subscriptions in force in the period: part of `expected_total`, never added to it), `transfer_committed_total` (the monthly shares of the transfers linked to a category in force in the period: also part of `expected_total`, never added to it; R-ACCOUNT-238, R-ACCOUNT-304) | R-PERIOD-004, R-PERIOD-018, R-INCOME-011, R-PERIOD-028, R-CATEGORY-006, R-CATEGORY-071, R-CATEGORY-091, R-PROGRESS-002, R-PROGRESS-090, R-TRANSACTION-092, R-SUBSCRIPTION-078, R-SUBSCRIPTION-079 |
| `category_overview` (view) | categories and subcategories, ended and void ones included | `id`, `budget_id`, `parent_id` (null: top level), `name`, `sort_order` (among siblings), `is_group` (has, or had, subcategories: no expectation of its own), `is_active` (in force in the current period), `first_seq`, `end_seq`, expectation in force now: `amount` (as entered), `cadence` (`'monthly'` \| `'yearly'`), `monthly_amount` (the monthly share; for a group, the total of its active subcategories), `terms_from_seq`; `has_transactions` (itself or its subcategories), `removal_deletes` (removing it now deletes it instead of ending it: no transactions, no subscription or debt on it, never counted in a past period), `revision`; `committed_amount` (the monthly costs of the subscriptions on it in force now; a group: its subcategories'), `in_use` (the terms of a subscription or debt in force now or later use it or a subcategory: `end_category` from now refuses it with `category_in_use`; transfers count too, R-CATEGORY-230), `transfer_committed_amount` (the planned amounts of the transfers on it in force now; a group: its subcategories'), `is_to_categorise` (the budget's "to categorise" category, step 6: offer it nowhere but the review) | R-CATEGORY-001 to R-CATEGORY-005, R-CATEGORY-072, R-CATEGORY-073, R-CATEGORY-090, R-CATEGORY-110, R-SUBSCRIPTION-079 |
| `transaction_list` (view) | transactions | `id`, `budget_id`, `kind` (`'expense'` \| `'refund'` \| `'extra_income'`), `amount` (positive), `date`, `period_id` (the period containing the date), `category_id` (null for an extra income), `category_name`, `parent_category_id`, `parent_category_name`, `description` (may be null), `recorded_by` (null if their account was deleted, and for an automatic charge), `recorded_by_name` (also for a former member), `revision`, `created_at`, `updated_at`, `subscription_id` and `subscription_name` (linked to a subscription), `debt_id` and `debt_name` (a debt payment), `charge_date` (an automatic charge: the scheduled date it was created for; null for a transaction a member recorded), `review_state` (enum `review_state`: `'confirmed'` \| `'awaiting_confirmation'` (a charge) \| `'to_review'` (imported, not yet confirmed; step 6)), `debt_ended` (a payment of a debt that has ended: frozen, it cannot be changed, unlinked or deleted; false otherwise; an ended subscription freezes nothing, D-274). Step 6 appends `import_batch_id` (null: not imported), `import_source` (its batch's source), `bank_transaction_id`, `merchant`, `merchant_key`, `details` (normalised, see "Import"), `in_to_categorise` (it sits in "to categorise"); step 7 `transfer_id`, `transfer_name`, `transfer_occurrence_date` (the transaction of a transfer's occurrence, and that occurrence's key date; null otherwise, R-ACCOUNT-073). List it with `list_transactions` (paged); select it directly only by `id` | R-TRANSACTION-001, R-TRANSACTION-002, R-TRANSACTION-003, R-TRANSACTION-006, R-TRANSACTION-095, R-SUBSCRIPTION-075 |
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
  then finds nothing to do) and does **one step**: at most 120 periods (ten years), and at
  most about two seconds of work (D-276), with their interest and the charges and planned
  transfers' transactions due in them, at most 4000 of those per budget (R-PERIOD-300, D-427).
  A step that stops at a bound before everything due is created answers at least 1 from
  `ensure_periods` (0 always means caught up).
- **No call does more than one step** (R-PERIOD-180, R-PERIOD-250, D-387), however often it
  calls the catch-up internally. `ensure_periods` and `get_current_period` keep their step.
- **Far behind** (the budget's last period ended more than **62 days** before today, or
  before its end date; or, D-433, its periods are all there but a subscription charge or a
  transfer's transaction due more than 62 days ago is not made yet and the budget has room for
  it, as when a budget is opened after years and the periods' steps finished before the
  transactions' ones): only `ensure_periods` and `get_current_period` (and `create_budget`,
  for its first periods) catch up. Every other call that catches up answers **`catching_up`
  at once**, before taking the budget lock and without doing any work. Within 62 days, such a
  call does its own roll-over (the step) and goes on; when the budget is still behind after
  it, it answers `catching_up` and changes nothing.
- **Another session holds the lock**: `ensure_periods` and `get_current_period` wait at most
  **two seconds**, then answer `catching_up` (never the statement timeout): the client's loop
  simply calls again. Other calls wait for the lock as before (the holder's step is bounded).
- **Which reads catch up**: `get_current_period`, `ensure_periods`, the comparison reads, the
  previews, `get_money_flow`, `get_transfer_checklist` and every write. `list_periods`,
  `list_transactions`, `get_period_progress`, `get_debt_history`, the `get_*_terms` reads,
  `list_categories_for_date` and the views read what is stored: they never catch up and never
  answer `catching_up` (so `list_periods` of a budget that is behind shows no current
  period). Open a budget with `get_current_period`.
- **A long absence**: `my_budgets.caught_up` is false and `get_current_period` returns no
  row; call `ensure_periods` until it returns 0 (each call keeps its step), then read or
  write. `caught_up` is also false whenever a subscription charge or a planned transfer's
  transaction is due and not yet created (a short absence, or a held charge with room again):
  any call that catches up creates it. Measured locally over HTTP (one constant today) with 50
  automatic linked transfers, 50 subscriptions and 50 debts with interest after 100 years
  away: 24 steps (15 of 35 to 120 periods, then the charges and transfers' transactions up to
  the 50 000 limit, 4000 a step), each at most 2.8 s, 50 s in all (under the API's 8 s
  statement timeout). A full budget 60 years away, its transactions held back: each step about
  0.1 s; once room for 36 000 transactions is freed, 9 steps of 4000, each at most 1.5 s (80
  years and 48 000: 12 steps, each at most 2.0 s). `debt_overview` for that budget's 50 debts:
  40 ms at 120 periods, 230 ms at 1200 (it grows with each debt's interest entries; at the
  documented limits, 63 periods and 200 debts, 150 ms).

(R-PERIOD-008, R-PERIOD-009, R-PERIOD-031, R-PERIOD-130, R-PERIOD-180, R-SECURITY-006,
R-SUBSCRIPTION-073, R-SUBSCRIPTION-111, R-DEBT-073, R-DEBT-111, R-PERIOD-250, D-387, D-204, D-276)

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
`membership_limit_reached` (you belong to 50 budgets, owned ones included),
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

**`list_my_invitations(p_limit = 50, p_after_created_at = null, p_after_id = null) -> {id, budget_id, budget_name, invited_by_name, invited_by_email, created_at, expires_at}[]`**
Unexpired invitations addressed to my **verified** email, oldest first, **a page at a time**:
1 to 200 rows (`invalid_limit`); for the next page pass the last row's `created_at` and `id`
(both, `invalid_cursor` otherwise). An unverified account sees none. (R-INVITE-003,
R-INVITE-007, R-INVITE-008, R-MEMBER-250, D-385)

**`accept_invitation(p_invitation_id) -> uuid`** (budget id) and
**`decline_invitation(p_invitation_id) -> void`**. Only for an unexpired invitation
addressed to my verified email. Errors: `invitation_not_found` (also for someone else's,
an expired or a cancelled invitation), `member_limit_reached` (20 members),
`membership_limit_reached` (you already belong to 50 budgets). (R-INVITE-003, R-INVITE-004,
R-INVITE-007, R-INVITE-010, R-INVITE-011, R-MEMBER-010, R-MEMBER-250)

**`remove_member(p_budget_id, p_user_id) -> void`** Owner. **`leave_budget(p_budget_id) -> void`**
Member other than the owner. The person's incomes end from the current period (or are
deleted if they never counted in a past period). In a budget that has ended its history
stays as it is, and the incomes end from the first period created if the budget resumes
(`income_overview.is_active` is false for them meanwhile). Errors: `not_owner`, `member_not_found`, `owner_cannot_leave`,
`member_has_primary_income` (make another income primary first). (R-MEMBER-004 to
R-MEMBER-009, R-MEMBER-011)

### Incomes

**`add_income(p_budget_id, p_name, p_amount, p_pay_day, p_weekend_rule = 'nearest', p_user_id = null, p_from_period_id = null, p_account_id = null, p_client_id = null) -> uuid`**
Member. `p_user_id`: whose income (default the caller; must be a member).
`p_from_period_id`: a period of this budget from which it counts (default the current one;
an earlier one back-dates it). Errors: `invalid_*`, `member_not_found`, `period_not_found`,
`income_limit_reached` (50 incomes in force, or 500 incomes in all including ended ones),
`budget_ended`. (R-INCOME-003, R-INCOME-013, R-INCOME-016, R-INCOME-050)

**`update_income(p_income_id, p_expected_revision, p_name = null, p_amount = null, p_pay_day = null, p_weekend_rule = null, p_from_period_id = null, p_previewed_end_date = null, p_account_id = null, p_clear_account = false) -> integer`** (the new revision)
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

**`get_income_terms(p_income_id, p_period_id) -> {period_id, in_force, amount, pay_day, weekend_rule, terms_from_period_id, until_period_id, account_id}[]`**
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
current one (never one starting after the end date), one step per call (at most 120, and
about two seconds of work), with their interest and charges, and returns how many it
created: 0 means caught up. Idempotent;
concurrent calls are safe. (R-PERIOD-008, R-PERIOD-009, R-PERIOD-031, R-PERIOD-130)

**`list_periods(p_budget_id, p_limit = 120, p_before_seq = null) -> period_summaries[]`**
Member. The periods, newest first, at most `p_limit` (1 to 200); the next page with
`p_before_seq` = the last row's `seq`; a page shorter than `p_limit` is the last. **Use it to
list periods** instead of selecting `period_summaries` for the whole budget: a budget's
periods grow without bound (one a month for as long as it lives, more with early salaries),
and the API cuts an answer at 1000 rows without an error. Errors: `budget_not_found`,
`invalid_limit`. (R-APP-170)

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
or subcategory; `'terms_changed'` is a changed expectation), `'subscription'`, `'debt'`,
`'account'` or `'transfer'` (`'terms_changed'`: changed terms); later steps add kinds without
client changes; for a transfer also one row per occurrence the reopen affects:
`'transaction_removed'`, `'transaction_created'`, `'mark_unplanned'`, `'mark_planned_again'`,
see "Accounts and money flow"; found by running the reopen at its default end and rolling it
back). A
category, subscription or debt `'removed'` that has transactions (or, for a debt,
adjustments) is kept as a void row, and its transactions keep counting in the reopened
period. `change`: `'added'`, `'ended'`, `'removed'` (it would never be in force after the
reopen), `'terms_changed'`, `'made_primary'`, `'interest_removed'` (a debt: the interest
the merged period added goes; it comes back once if the period is created again). `replaces_previous`: the
previous period has its own entry for that record that the reopen would replace. Errors:
`budget_ended`, `invalid_boundary` (the first period has nothing to reopen). (R-PERIOD-035). At most 1000 rows: when the
period changed more records than that (only near several limits at once), the first 999 are
listed and the 1000th has `record_kind = 'more'`, `change = 'more'`, `record_id` null and
`record_name` the number of changes not listed ("and 123 more"). **`'more'` is a new
`record_kind`**: the screen must handle it (show the count), unlike the kinds a later step
adds to the registry. Exactly 1000 changes are all listed. (R-APP-170)


**`preview_update_income(p_income_id, p_amount = null, p_pay_day = null, p_weekend_rule = null, p_from_period_id = null) -> {period_id, end_date, expected_pay_date, end_is_manual, transfer_transactions_removed, transfer_transactions_created, transfer_marks_unplanned}[]`**
and **`preview_set_primary_income(p_income_id) -> {period_id, end_date, expected_pay_date, end_is_manual, transfer_transactions_removed, transfer_transactions_created, transfer_marks_unplanned}[]`**
(one row each) Member. What the current period's end and expected next pay date would become
if `update_income` were called with the same terms and correction period (a correction
shadowed by a later version changes nothing, and the preview says so; an income that is not
the primary moves nothing), or if that income became primary. Computed with the write's own
functions; an end set by hand stays as it is (`end_is_manual`). Pass the returned
`end_date` to the write as `p_previewed_end_date`. Changes nothing (like
`get_current_period`, it first does one catch-up step; `catching_up` when still behind). Errors: `income_not_found`,
`budget_ended`, `income_ended`, `income_not_in_force`, `invalid_period`,
`period_not_found`, `invalid_amount`, `invalid_pay_day`, `invalid_weekend_rule`.
(R-PERIOD-036, D-157)

**`move_period_start(p_period_id, p_expected_revision, p_start_date = null) -> void`** Member. Moves the boundary between
a period and the one before it: the period starts on `p_start_date` (today or earlier, and
not after the budget's end date), the previous one ends the day before. Omit `p_start_date`
to move it to where the schedule puts it (the previous period's projected end, the day
before). The previous period's `end_is_manual` is true unless the boundary is on the
schedule's day, so moving it back clears the mark. A debt opened on or after the new start
loses its interest entry of the period, so its history still starts with the opening; moving
the start later again adds no interest back (interest is computed once, when a period is
created: D-386, R-DEBT-131). Errors also: `period_not_found`. Inverse: move it back.
(R-PERIOD-100, D-152)

**`preview_move_period_start(p_period_id, p_start_date = null) -> {period_id, scheduled_start, accepted, refusal, interest_removed, transfer_transactions_removed, transfer_transactions_created, transfer_marks_unplanned}[]`**
(one row) Member. What `move_period_start` to `p_start_date` (default: the scheduled start)
would do now: `scheduled_start` (the start the schedule gives), and whether the move would be
accepted (`accepted`; when not, `refusal` is the code the write would answer, or
`'already_on_schedule'` when the period already starts there); `interest_removed`: how many
debts lose their interest entry of the period, because the new start is on or before their
opening (D-386; show it like the reopen preview's `'interest_removed'`). Computed with the write's own checks; like every read it first does
the catch-up step (and answers `catching_up` when the budget is still behind), and changes
nothing else. The last three columns: what the move does to the planned transfers, found by running
it and rolling it back (R-ACCOUNT-303: the catch-up's transactions it removes and creates, the
members' marks whose occurrence it moves away; 0 when refused). Errors: `period_not_found`,
`catching_up`. (R-PERIOD-133, Q-091)

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

**`create_category(p_budget_id, p_name, p_parent_id = null, p_amount = 0, p_cadence = 'monthly', p_from_period_id = null, p_other_name = null, p_client_id = null) -> category_overview[]`** (one row: the new category)
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

**`add_transaction(p_budget_id, p_kind, p_amount, p_date, p_category_id = null, p_description = null, p_debt_id = null, p_subscription_id = null, p_client_id = null) -> transaction_list[]`** (one row: the new transaction)
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
committed amount gets a row too, like one with transactions. `transfer_committed`: the
planned amounts of the transfers linked to that leaf in force in the period (a group: its
subcategories'), also inside `expected`, apart from `committed` (R-ACCOUNT-238). Balances do not carry over
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

All subscription RPCs are for members; each first does one catch-up step (`catching_up` when the budget is still behind, R-PERIOD-180), and each that changes an
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
With no term argument (a form not yet changed) it answers the schedule as it stands. A
charge held back comes first, at its held date (`subscription_overview.next_charge_date`), and
a new cadence or next charge date is refused with `charge_held_back` like the write
(R-SUBSCRIPTION-180, D-388). (R-SUBSCRIPTION-133)

**`create_subscription(p_budget_id, p_name, p_price, p_cadence, p_category_id, p_first_charge_date, p_from_period_id = null, p_client_id = null) -> subscription_overview[]`** (one row)
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
validity; its name can still change), `charge_held_back` (a new cadence or next charge date while a charge waits for room), `invalid_period` (before it started, or `p_from_period_id` without new terms),
`period_not_found`, `budget_ended`. (R-VERSION-003, R-VERSION-005, R-VERSION-006,
R-VERSION-012, R-SUBSCRIPTION-114, R-SUBSCRIPTION-130, R-CATEGORY-130, R-CONCURRENCY-070)

**`end_subscription(p_subscription_id, p_expected_revision, p_from_period_id = null) -> 'deleted' | 'ended'`**
From the current period, or as a correction from an earlier one: no charge from then on.
Deleted when it never counted before that period and has no transaction
(`subscription_overview.removal_deletes` says so beforehand); otherwise ended, keeping its
charges (kept void when it would never be in force). Charges awaiting confirmation still
await an answer. Errors: `subscription_not_found`, `record_changed`, `invalid_revision`,
`subscription_ended`, `charge_held_back` (see below), `period_not_found`, `budget_ended`.
(R-SUBSCRIPTION-113)

**A charge held back** (R-SUBSCRIPTION-180, D-271): while a subscription's next scheduled
date has come and its charge waits for room (the budget holds 50 000 transactions),
`subscription_overview.next_charge_date` shows that held date, and changing its schedule
(`update_subscription` with a new `p_cadence` or a `p_next_charge_date`, from now or as a
correction) or ending it (`end_subscription`) is refused with `charge_held_back`, changing
nothing (`preview_end_subscription` gives it as `refusal`; `preview_update_subscription`
answers the same error for those arguments, D-388). The same cadence sent again is not a
change. A new name, price or category is allowed: once there is room the held charge is
created with the terms in force in its own period. Note: the held charge takes a price edited
after its due date in the same period, while the same charge in a budget with room was
created at the earlier price (as D-271 documents). Free room first (delete transactions), then
change the schedule.

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
Catches up first (one step; `catching_up` when still behind). Errors: `budget_not_found`, `invalid_limit`.
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

**Interest** (R-DEBT-073, R-DEBT-111, R-DEBT-113, R-DEBT-180, D-272): when a period is
created, however it comes to exist (roll-over, catch-up over several periods, an early
salary), each debt in force in it **opened before its start**, with a rate, gets one
interest entry: one twelfth of the rate in force then on its balance from **everything dated
before the period's start** (opening, payments, adjustments, earlier interest), rounded half
up; none on a balance of zero or less. The day the catch-up runs does not matter. A debt
opened on or after the period's start gets its first interest with the next period, so a
history always starts with the opening. Exactly once per debt and period; a reopen that
merges the period removes its entry (`preview_reopen` says `'interest_removed'`), and
creating the period again computes it again by the same rule (the same amount when nothing
dated before it changed). Interest already added is never recomputed, also when a payment or
adjustment is back-dated later (corrections of the rate apply to later periods; fix a past
amount with an adjustment).

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

All debt RPCs are for members; each first does one catch-up step (`catching_up` when the budget is still behind), and each that changes an existing
debt takes `p_expected_revision` (from `debt_overview`).

**`create_debt(p_budget_id, p_name, p_principal, p_category_id, p_monthly_payment, p_interest_rate = null, p_from_period_id = null, p_client_id = null) -> debt_overview[]`** (one row)
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
`debt_has_history`, `debt_ended` (**any** edit of an ended debt: it is frozen, D-209),
`invalid_period`, `period_not_found`, `budget_ended`. (R-VERSION-004, R-VERSION-012, R-DEBT-070,
R-DEBT-114, R-DEBT-134, R-CATEGORY-130)

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

**`get_debt_history(p_debt_id, p_limit = 500, p_after_date = null, p_after_kind = null, p_after_created_at = null, p_after_id = null, p_newest_first = false) -> debt_history_row[]`** (`{entry_id, kind, date, amount, balance, period_id, description, created_at}`)
`kind`: `'opened'` (the principal, on `opened_on`), `'interest'` (on its period's start),
`'adjustment'`, `'payment'` (`amount` negative; `entry_id` is the transaction's). Oldest
first; on one date the principal, then interest, then adjustments and payments together in
the order they were recorded (`created_at`, then `entry_id`). `description`: the
adjustment's note or the payment's description (may be null). **Paged**: at most `p_limit`
rows (1 to 1000); for the next page pass the last row's `date`, `kind`, `created_at` and
`entry_id` as `p_after_date`, `p_after_kind`, `p_after_created_at`, `p_after_id` (all four);
a page shorter than `p_limit` is the last. `balance` is always over the whole history, so the
last row of the last page has `remaining`. **Newest first** (`p_newest_first = true`): the
same rows in reverse order, the first page starting with the latest event; the cursor is the
same four values of the last row, and the next page continues towards older rows; `balance`
is the same as oldest first (the remaining amount after the event). With TanStack Query,
`useInfiniteQuery` keyed by budget id, debt id and direction. A row back-dated between two
pages shifts the balances of the later pages: after any write, read all pages again. Errors: `debt_not_found`,
`invalid_limit`, `invalid_cursor`. (R-DEBT-004, R-DEBT-135, R-DEBT-181, D-275)

**`get_debt_terms(p_debt_id, p_period_id) -> {period_id, in_force, category_id, interest_rate, monthly_payment, terms_from_period_id, until_period_id}[]`**
and **`get_subscription_terms(p_subscription_id, p_period_id) -> {period_id, in_force, price, cadence, category_id, anchor_date, charge_day, terms_from_period_id, until_period_id}[]`**
(one row each) Member. See "Terms in a chosen period". (R-VERSION-132, R-VERSION-133)

### Terms in a chosen period

`get_subscription_terms`, `get_debt_terms`, `get_category_terms` and `get_income_terms`
(each `(p_<record>_id, p_period_id)`, one row) give, for a correction form, the terms of the
record in force in that period, the period they took effect (`terms_from_period_id`), and
`until_period_id`: the first period of the next existing change or of the record's end (null:
open-ended, or beyond the latest period). A correction from `p_period_id` applies up to the
period before `until_period_id`: say so in the form ("from March to June; July has its own
terms"). Where the record is **not in force** (before its first period, or from its end
period on), `in_force` is false and every term, `terms_from_period_id` and `until_period_id`
are null: there is nothing to correct there (D-273). Errors: `<record>_not_found`,
`period_not_found`. (R-VERSION-132, R-VERSION-133)

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

**Averages** (R-COMPARE-172, D-383): over the **completed** periods of the range only
(`end_date` before today; the running period is never averaged), to the rappen with halves
rounded away from zero (-2.5 → -3). `completed_count` says how many; with none, every average
is **null** (show "no completed period yet"), never 0. `average_result` is the average of the
results: it may differ by one rappen from `average_income - average_spent`. A category line
also has `active_count` and `active_average_spent`: over the completed periods of the range
in which it was in force or had spending, for a category that started or stopped inside the
range (Daycare, 800 in 3 of 11 periods: `average_spent` 218.18, `active_average_spent` 800);
null when `active_count` is 0 (Q-160).

**`get_period_trend(p_budget_id, p_count = 12) -> {...}[]`** (one row per period of the
range, by `seq`) (R-COMPARE-002)

| Column | Meaning |
| --- | --- |
| `period_id`, `seq`, `start_date`, `end_date`, `days` | the period |
| `is_current` | the period containing today: still running (mark it) |
| `is_completed` | it ended before today (an ended budget: every period) |
| `income_total`, `salary_total`, `extra_income_total`, `spent_total`, `expected_total` (the planned total), `committed_total`, `result` | exactly that period's `period_summaries` row |
| `completed_count`, `average_income`, `average_spent`, `average_result` | the range's averages, the same on every row (null when `completed_count` is 0) |
| `transfer_committed_total` | the period's `period_summaries.transfer_committed_total`: the planned transfers' committed amounts, apart from `committed_total` (D-399) |

**`get_category_trend(p_budget_id, p_count = 12) -> {...}[]`** (**one row per category
line**, ordered by `display_order`; the periods are arrays on the row) (R-COMPARE-070,
R-COMPARE-170, R-COMPARE-174, R-APP-170)

A **line** is a category (group, subcategory or ordinary category) that has a row in
`get_period_progress` of at least one period of the range. It is the category's id, under its
**current** `name` and place (`parent_id`, `display_order`), whatever happened to it
meanwhile: renamed, ended, restored, emptied into "Other" by its first subcategory, or left
void by a removal or a reopen. Show the top level (`parent_id` null: groups and ordinary
categories) and open a group (`is_group`) on its subcategories (`parent_id` = the group). A
budget holds at most 900 categories, void ones included, so the answer always fits in one
response.

**The periods**: `period_ids` (the same on every row) lists the range's periods, oldest
first, and is exactly the `period_id` column of `get_period_trend` with the same `p_count`
(one range, computed the same way): read both, take each period's dates, `days`,
`is_current` and `is_completed` from the trend, and check `period_ids` against the trend's ids
(if they differ, a period was created or merged between the two calls: read both again).
A boundary moved, or a transaction added, between the two calls does not change the ids and
cannot be detected this way: read both again after any write.
Element *i* of every array below is the period `period_ids[i]` (1-based in SQL, 0-based in
JavaScript).

| Column | Meaning |
| --- | --- |
| `category_id`, `parent_id`, `name`, `is_group`, `display_order` | the line |
| `period_ids` | `uuid[]`: the range, oldest first (see above) |
| `in_force` | `boolean[]`: in force in each period |
| `planned` | `bigint[]`: the monthly share of its expectation then (a group: its subcategories'); **a null element where not in force** (not 0) |
| `spent` | `bigint[]`: expenses minus refunds dated in each period (may be negative); 0 when nothing; also counted where it was not in force |
| `committed` | `bigint[]`: the subscriptions' monthly costs on it, inside `planned` |
| `transaction_count` | `integer[]`: its transactions in each period |
| `completed_count`, `average_spent` | the line's average spent over the completed periods of the range (every completed period counts, also those where it was not in force, so the lines add up to the trend's); null when none is completed |
| `active_count`, `active_average_spent` | its average over the completed periods of the range in which it was in force or had spending (D-383); null when `active_count` is 0 |
| `transfer_committed` | `bigint[]`: the planned transfers' committed amount on the line in each period, apart from `committed` (D-399) |
| `is_overspent` | `boolean[]`: "over the plan" in each period, exactly `get_period_progress.is_overspent` of the line (false where it has no progress row); never compute it from `spent` and `planned` (D-391) |

A budget without categories gives no rows (the periods are still in `get_period_trend`).

**Adds up, exactly**: for each period *i*, `spent[i]` of the top-level lines adds up to the
trend's `spent_total` of that period, and so does `spent[i]` of the lines with `is_group`
false. There is no "uncategorised" line:
every expense and refund has a category, and extra income is income, never spending (as in
`period_summaries` and `get_period_progress`). (R-COMPARE-170, D-262)

**`get_period_comparison(p_budget_id, p_period_a_id = null, p_period_b_id = null) -> {...}[]`**
(R-COMPARE-071, R-COMPARE-174)

Any two periods of the budget, in either order. **Defaults** (D-384, answers Q-161): with
neither given, the **last two completed periods** when two exist, otherwise the last two
periods (B the current period, or the last once the budget has ended); with only A given, B
is the current (or last) period; with only B given, A is the one before B. When B is the first
period, side A is empty: `a_period_id` and every `a_*` figure null, and `a_in_force` false.
Every row says whether each side is still running: `a_is_current`, `b_is_current` (the period
containing today) and `a_is_completed`, `b_is_completed` (it ended before today); null for an
empty side A. Mark a running side, so its smaller spending is never read as a saving. The first row has `kind = 'total'`; then one row
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
| `a_transaction_count`, `b_transaction_count` | the period's transactions on categories (0 when there are none; null only for an empty side A) | the category's |
| `a_is_current`, `a_is_completed`, `b_is_current`, `b_is_completed` | each side running or completed (the same on every row) | the same |
| `a_is_overspent`, `b_is_overspent` | null | that side's `get_period_progress.is_overspent`; null where the side has no row (D-391) |
| `a_transfer_committed`, `b_transfer_committed`, `transfer_committed_difference` | the periods' `transfer_committed_total`, B minus A | the progress view's `transfer_committed`; the difference counts an empty side as 0 (D-399) |
| `a_income`, `b_income`, `income_difference`, `a_result`, `b_result`, `result_difference` | `income_total`, `result`, B minus A | null |

The totals are the periods' `period_summaries` rows and each side's categories its
`get_period_progress` rows; the top-level `spent_difference` values add up to the total's.
Errors: `budget_not_found`, `period_not_found` (an id that is not a period of this budget),
`catching_up`.

**Nulls**: the generated types mark every column of these three functions as non-null; the
columns this section says may be null (the `planned` elements, the averages, every `a_*` and `b_*` figure
of a side with nothing, the category columns of the total row, the income and result columns
of category rows, `planned_difference`) are nullable: type them as such in the client.

Measured locally over HTTP at the limits (63 periods, 200 categories, 50 000 transactions, 50
subscriptions and 50 debts in force), medians: `get_period_trend` 24 periods 41 ms (24 rows,
10 kB); `get_category_trend` 24 periods 67 ms (200 rows, 333 kB uncompressed; 6 periods
124 kB); `get_period_comparison` 22 to 23 ms (201 rows, 155 kB).

### Import

One implementation behind every way of importing (R-IMPORT-001): `private.import_plan`
decides what each row does, `private.import_apply` does exactly that. `preview_import`,
`import_transactions`, `import_with_token` and `import_skipped_anyway` all go through them, so
the write always does what the preview said for the same rows, choices and batch (D-310,
R-IMPORT-252).

**The row** (the parser's output, R-IMPORT-002, R-IMPORT-102). A JSON object; any other key is
refused (`invalid_row`). Text fields go through the shared cleaner first (D-376): control,
bidirectional and zero-width characters removed, other white space one space, trimmed (D-454,
R-SECURITY-341: a zero-width joiner or non-joiner between two characters that are not white
space stays, for emoji sequences and Persian or Indic text; a text with nothing visible left,
only fillers, blank patterns, joiners, selectors or tags, is empty, so such a name answers
`invalid_name`).

| Key | Required | Meaning |
| --- | --- | --- |
| `date` | yes | calendar date `YYYY-MM-DD`, no time zone (the purchase date when the statement gives one, D-128) |
| `amount` | yes | positive integer rappen, 1 to 1 000 000 000, a JSON number without a decimal point (`12.0` is `invalid_amount`, R-IMPORT-262) |
| `direction` | yes | `'debit'` (money out) or `'credit'` (money in) |
| `description` | no | the statement's text, at most 500 characters after cleaning (also what duplicates compare) |
| `merchant` | no | the merchant or counterparty as the statement names it, at most 200 characters (the merchant key is computed from it, else from the description) |
| `bank_transaction_id` | no | the bank's id of the line (TWINT id, Yuh reference; never a QR reference, R-IMPORT-101), at most 100 characters |
| `hint` | no | what the source says the line is: `card_bill_payment`, `own_transfer`, `transfer_to_person`, `salary`, `interest`, `fee`, `securities_purchase`, `cash_withdrawal`, `refund` |
| `details` | no | the extra data: an object with only the keys `purchase_time`, `booking_date`, `value_date`, `card`, `original_currency`, `original_amount`, `exchange_rate`, `fee`, `merchant_category`, `security`, `location`, each a string or a number; at most 2000 bytes. Stored **normalised**: each string cleaned like any text, empty ones dropped (an empty object is stored as null) |
| `action` | no, member only | `'import'` or `'skip'` when the member's choice differs from the default |
| `kind` | no, member only | a debit is always `'expense'`; a credit `'refund'` (default) or `'extra_income'` |
| `category_id` | no, member only | a leaf in force in the period of the date (not for extra income, not "to categorise") |

The whole `p_rows` argument of one call: an array of 1 to 500 rows (250 for a token) and at
most **2 MB** (`invalid_rows`), checked when the function starts, before any row is read
(R-IMPORT-250). The request body itself is read and parsed by the API before the function
runs: what bounds it there is the gateway, not yet verified for the hosted project (Q-280). A
body that is not JSON is answered by PostgREST (`PGRST102`); one nested too deep to parse by
the database parser (`54001`): neither reaches the function.

**What a row does** (`import_row_result`, one per row, in order):

| Column | Meaning |
| --- | --- |
| `row_no`, `chunk` | the row as sent: its position in the call (from 1) and the chunk it was sent in (null in a preview). A row imported anyway answers with its original chunk and row number (R-IMPORT-258) |
| `valid`, `reason` | false and the code when the row cannot be imported: its own content (`invalid_row`, `invalid_date`, `invalid_amount`, `invalid_direction`, `invalid_description`, `invalid_merchant`, `invalid_bank_transaction_id`, `invalid_hint`, `invalid_details`, `invalid_kind`, `invalid_category`, `invalid_action`, `choice_not_allowed`) or the budget (`date_outside_periods`: before the first period or after today; `category_not_found`, `category_is_group`, `category_not_in_force`, `category_to_categorise`) |
| `action` | `import`; `skip_duplicate`; `skip_flagged` (a flagged entry or a salary skipped by default); `skip_matched` (a possible match, kept apart); `confirm_match` (the match is a charge awaiting confirmation: the row is not imported and the charge is confirmed); `skip_chosen` (the member said skip); `invalid` |
| `kind`, `category_id`, `category_source` | what it is imported as; `category_source` `choice`, `rule` (`rule_id`) or `to_categorise` (`category_id` null in the preview until the first write creates the category); null for extra income |
| `date`, `amount`, `direction`, `description`, `merchant_key` | the row as read (cleaned); the key a merchant rule matches on |
| `flag`, `remembered_choice`, `choice_key` | `card_bill_payment`, `own_transfer`, `transfer_to_person` or `salary`; the choice the budget remembers for that kind of flag and that key (`import` / `skip`); the key a choice for the row is remembered under (its merchant key, or `own_transfer` for an own transfer without description and merchant; null when the row has no flag that remembers) |
| `duplicate_of` | the existing transaction the row duplicates |
| `match_of`, `match_is_charge` | the existing transaction it possibly matches, and whether that is a charge awaiting confirmation |
| `salary_income_id`, `salary_income_amount` | for a salary: the income and its planned amount, to show beside the row's amount |
| `transaction_id` | the write only: the transaction created |

**The rules** (D-311, D-314, D-372, D-373, D-377):

- **Duplicates, counted per batch** (R-IMPORT-003, R-IMPORT-070, R-IMPORT-071, R-IMPORT-251,
  R-IMPORT-254, D-372): a row is a duplicate of an existing transaction of the same kind (any
  origin: typed, imported, a charge) with the same bank transaction id, or else the same date,
  amount and description, **either as the transaction is now or as it was first imported**
  (an imported transaction keeps its original `import_amount`, `import_date`,
  `import_description`, never changed). Each existing transaction absorbs at most one row
  **of the batch**, counted over all its chunks, whatever order they arrive in and however
  often one is sent again: 2 identical rows against 1 existing transaction, one skipped, one
  imported, also when the two rows travel in different chunks; importing the same statement
  twice imports nothing the second time. Rows of one batch are never compared with each other.
  Both lookups read by index (R-IMPORT-343): about 0.1 s for a 500-row preview on a budget of
  45 000 transactions.
- **Flags** (R-IMPORT-091, R-IMPORT-092, D-314): a card-bill payment and an own transfer are
  skipped by default; a transfer to another person is imported by default. **Only a choice the
  member sent** with a flagged row (`action` `import` or `skip`, or "import anyway") is
  remembered, never a default the import applied (R-IMPORT-345, D-456): per budget, kind of
  flag and `choice_key` (the merchant key; `own_transfer` for an own transfer without
  description and merchant), and proposed next time (`remembered_choice`); at most 1000 a
  budget, the least recently used going first (R-IMPORT-257). A token's import remembers
  nothing. `forget_import_choice` forgets one (below).
- **Salary** (R-IMPORT-093, R-IMPORT-259, D-130, D-377): a credit the source calls a salary,
  or of exactly an income's amount dated within **five days either side of a period start**
  (on or after the start of its own period, or before the start of the next period, projected
  when that period does not exist yet), at the income's amount in force in that period, is
  skipped by default; imported anyway it is extra income. A different amount changes nothing
  by itself.
- **Other credits** (R-IMPORT-094): a refund (in the period of its date, may take the category
  below zero), or extra income when the member says so.
- **Possible match** (R-IMPORT-203, R-IMPORT-261, D-373): an existing transaction of the same
  kind that was not imported (typed, or a charge), with the same amount and a date within
  three days either way, not already absorbed by the batch; descriptions are not compared.
  Each existing transaction goes to the row **nearest in date** (ties: the earlier row, then a
  charge awaiting confirmation) and absorbs one row of the batch. Default: skip the row; when
  it is a charge awaiting confirmation the import confirms it (`confirm_match`); the member
  can import the row anyway. The batch counts them (`matched_count`). With a token, matches
  are skipped and never confirmed.
- **Category** (R-IMPORT-079, R-IMPORT-200, D-311, D-375): the member's choice, else the
  merchant rule whose fragment the row's key contains (the longest; only where its category is
  in force on the date), else the budget's **"to categorise"** category.
- **The merchant key** (R-IMPORT-201, R-IMPORT-255, D-381): the `merchant` field when it has a
  letter or digit, else the description; lower case, accents removed (ß, œ, æ, ø spelled
  out), any script kept, punctuation other than `* . & -` a space; then, until nothing
  changes, the statement's leading words (`achat`, `credit`, `debit`, `credit twint`, `debit
  twint`, `twint`, `paiement de salaire`, `paiement`, `ordre permanent`) dropped and a `*`
  resolved: a processor before the merchant (`payup *shop` → `shop`), a merchant before a
  reference (`amazon.de*ab12cd` → `amazon.de`). The key of a key is itself. Bounded work
  (R-IMPORT-342): the normalised text is cut to 200 characters first, and a text that still
  changes after 10 steps keeps that cut text as its key.

**The "to categorise" category** (R-IMPORT-200, R-CATEGORY-200, R-CATEGORY-250, D-375): one
top-level leaf per budget, flagged `is_to_categorise` (`category_overview.is_to_categorise`,
`transaction_list.in_to_categorise`, `my_budgets.to_categorise_category_id` while it is in
force, null otherwise), created by the first import that needs it, from the first period,
even at the category limits: with the name the member passes (`p_to_categorise_name`,
default "To categorise"; `invalid_name` when it is not a valid name, checked before anything
else), under the fixed name "To categorise" for a token. It is the import's waiting room only:
- only imported transactions still to review can be in it: `add_transaction` and
  `update_transaction` refuse it (`category_to_categorise`), and a transaction in it cannot be
  confirmed (give it a category first with `update_transaction`, which keeps it to review);
- a transaction waiting in it **can be edited while it stays there** (amount, date,
  description, links: `update_transaction` with its category unchanged, R-CATEGORY-340,
  D-460); only moving a transaction into it is refused;
- no subscription, debt, planned transfer or merchant rule can use it
  (`category_to_categorise`);
- it does not count toward the 200 categories in force (answers Q-190);
- it can be renamed, takes no expectation and no subcategory, and cannot end while it holds
  transactions (`category_to_categorise`). It counts in every total like any category.

**`preview_import(p_budget_id, p_batch_id, p_rows) -> import_row_result[]`** Member. What
`import_transactions` would do with the same rows now, in the batch `p_batch_id` (what its
earlier chunks absorbed is taken into account). With `p_batch_id` null: what the first chunk
of a new batch does (R-IMPORT-252). Changes nothing but one catch-up step. Errors:
`budget_not_found`, `invalid_rows`, `catching_up`.

**`preview_import_part(p_budget_id, p_batch_id, p_part, p_rows) -> jsonb`** Member (R-IMPORT-340,
D-455, answers Q-270 and Q-274). For a statement above 500 rows, previewed **before any part is
written**: part `p_part` (1 to 100) of the batch `p_batch_id` (the id the write will use)
answers what `import_transactions` will do with the same rows as chunk `p_part`, once chunks 1
to `p_part - 1` are written with the rows previewed as parts 1 to `p_part - 1`: what those
parts absorb (duplicates, matches) and the choices they send are taken into account, as are the
batch's chunks already written. So, absent changes by others, the counts and per-row answers
the member sees before importing equal what the write then does (one exception: a row going to
a "to categorise" category that does not exist yet has `category_id` null here and the new id
in the write). Send the parts in order; previewing a part again forgets the staged parts from
it on. Staged parts are kept a day, at most 100 a budget. The answer is one object:
- `rows`: the rows, as `preview_import` answers them;
- `part`, `statement`: the totals of this part and of the staged parts 1 to `p_part`:
  `rows`, one count per action (`import`, `skip_duplicate`, `skip_flagged`, `skip_matched`,
  `confirm_match`, `skip_chosen`, `invalid`), and of the rows to import, by kind, the count and
  the sum in rappen (`expense_count`, `expense_amount`, `refund_count`, `refund_amount`,
  `extra_income_count`, `extra_income_amount`);
- `parts`: the part numbers `statement` covers; `room`: how many transactions the budget can
  still take; `fits`: whether the statement's rows to import fit.
Errors: `budget_not_found`, `invalid_batch`, `invalid_chunk` (the part), `invalid_rows`,
`import_batch_conflict`, `batch_undone`, `catching_up`.

**`import_transactions(p_budget_id, p_batch_id, p_chunk, p_rows, p_source, p_statement_from = null, p_statement_to = null, p_to_categorise_name = null) -> import_row_result[]`**
Member. Imports one chunk of a batch, exactly as the preview says, all or nothing.
- **The batch**: the caller generates its id (a UUID) and sends the statement in chunks of at
  most **500 rows**, numbered 1 to **100** (so at most 50 000 rows a batch, the transaction
  limit), in any order. The first chunk to arrive creates the batch with its `p_source`
  (`'csv'`, `'migros_account'`, `'migros_card'`, `'yuh'`, `'script'`, `'other'`) and the
  statement's date range; the batch records who (the member, or the token: never the caller
  of a token import), when and its counts.
- **Idempotent** (R-IMPORT-208): a chunk sent again (same batch, same number) records nothing
  and answers what it answered the first time, whatever rows it carries: retry freely after a
  lost answer.
- Imported transactions are **`to_review`** (R-IMPORT-004), count in the totals at once
  (R-IMPORT-080), and land in past periods too; nothing else of a past period changes.
- **The transaction limit**: when the budget has no room for the rows to import, the chunk is
  refused before anything is written: `transaction_limit_reached` with detail
  `{"fits": n}` (how many rows would fit; a member only, never a token).
- **Import storage is bounded per budget** (R-IMPORT-341, D-452), members and tokens
  together: within any 24 hours at most **20 000 rows** submitted to a write and **50 new
  batches** (`import_limit_reached`); kept at most **2 000 batches** (at the limit, the
  oldest batches that hold no transaction and no skipped row any more go first;
  `import_limit_reached` when none can), the newest **20 000 skipped rows** (older ones go:
  `list_import_skipped_rows` no longer lists them and they cannot be imported anyway; the
  batch's counts stay) and the newest **50 chunk answers**, none older than 7 days (a chunk
  sent again after its answer was forgotten answers `chunk_expired` and is never imported
  twice). Worst case, measured with incompressible text at every limit: about 85 MB a day and
  110 MB kept beyond the transactions.
- Every argument is checked before anything of the budget. Errors: `invalid_name` (first),
  `budget_not_found`, `invalid_batch`, `invalid_chunk`, `invalid_source`, `invalid_date` (the
  range), `invalid_rows`, `import_batch_conflict` (the id is another budget's batch, also when
  two budgets race for a new id), `batch_undone`, `chunk_expired`, `transaction_limit_reached`,
  `category_limit_reached`, `import_limit_reached`, `catching_up`.

**`import_skipped_anyway(p_batch_id, p_skipped_row_ids = null) -> import_row_result[]`**
Member. Imports skipped rows of a batch anyway (R-IMPORT-073, R-IMPORT-204, R-IMPORT-258): the
given ones, or all that are not invalid and not already imported (at most 500 a call; call
again for more). Each is planned again now with action `import`, its original kind and
category dropped (the review decides), and answers with its original `chunk` and `row_no`. The
batch's counts move from the skip reason to `imported_count`, so they still add up to
`row_count`. A row whose transaction was deleted since can be imported anyway again. A valid
row is kept as the preview showed it, its free text cleaned, so importing it anyway imports that
row (R-IMPORT-344, D-466): the same description, and a bank transaction id a later import of the
same statement still finds. Errors:
`import_batch_not_found`, `batch_undone`, `transaction_limit_reached`, `catching_up`.

**Review** (R-IMPORT-081, R-IMPORT-209, R-IMPORT-253):
- `my_budgets.to_review`: how many transactions are to review. `list_transactions(...,
  p_to_review_only => true)` lists them (newest first, paged as usual); `p_import_batch_id`
  lists one batch's.
- The review state changes **only** through `confirm_import` / `confirm_imports`: editing,
  linking or unlinking a transaction to review leaves it to review.
- **`confirm_import(p_transaction_id, p_expected_revision) -> transaction_list[]`** to_review
  becomes confirmed; nothing else changes, so a frozen transaction (a payment of an ended debt)
  can be confirmed (D-374). Errors: `transaction_not_found`, `record_changed`,
  `invalid_revision`, `not_to_review`, `category_to_categorise`, `catching_up`.
- **`confirm_imports(p_budget_id, p_batch_id = null) -> {confirmed, left_to_categorise}`**
  every transaction to review (of the batch) not in "to categorise". Errors:
  `budget_not_found`, `import_batch_not_found`, `catching_up`.
- **`undo_import_batch(p_batch_id) -> {deleted, kept_confirmed, kept_linked, charges_confirmed}`**
  (R-IMPORT-206, R-IMPORT-260, D-379): deletes the batch's transactions still to review that
  are linked to nothing. It keeps, and counts: the confirmed ones (`kept_confirmed`), those
  still to review but linked to a subscription, a debt or a planned transfer, frozen or not
  (`kept_linked`), and the charges it confirmed (`charges_confirmed`, they stay confirmed).
  Remembered choices stay. Once (`batch_undone`); the batch then takes no more chunks. Errors:
  `import_batch_not_found`, `batch_undone`, `catching_up`.
- **Reads are paged only** (R-IMPORT-257): members cannot select `import_batches`,
  `import_skipped_rows` or `import_choices` directly (`42501`); the views below are the
  calls' row shapes.
- **`list_import_batches(p_budget_id, p_limit = 50, p_before_created_at = null, p_before_id = null) -> import_batch_list[]`**
  newest first, 1 to 200 a page (cursor: the last row's `created_at` and `id`). Columns:
  `id`, `budget_id`, `source`, `statement_from`, `statement_to`, `created_by` (null for a
  token's batch), `created_by_name`, `token_id`, `token_name`, `created_at`, `chunk_count`,
  `row_count`, `imported_count`, `duplicate_count`, `flagged_count`, `matched_count`,
  `chosen_skip_count`, `invalid_count` (these add up to `row_count`), `charges_confirmed_count`,
  `to_review_count`, `undone_at`, `undone_by`. Errors: `budget_not_found`, `invalid_limit`,
  `invalid_cursor`.
- **`get_import_batch(p_batch_id) -> import_batch_list[]`** (R-IMPORT-348, D-459, answers
  Q-275) one batch by its id, as the list gives it. Error: `import_batch_not_found`.
- **`list_import_skipped_rows(p_batch_id, p_limit = 100, p_after_chunk = null, p_after_row_no = null) -> import_skipped_rows[]`**
  (R-IMPORT-072) the rows not imported, in order, 1 to 200 a page (cursor: the last row's
  `chunk` and `row_no`): `id`, `chunk`, `row_no`, `reason` (`duplicate`, `flagged`, `matched`,
  `chosen`, `invalid`), `detail` (the flag or the invalid row's code), `duplicate_of`,
  `match_of`, `row_data` (what is kept of the row: its known keys within their limits, only
  the **names** of unknown keys under `unknown_keys`, R-IMPORT-250), `imported_transaction_id`
  (once imported anyway; null again if that transaction is deleted), `imported_at`. Errors:
  `import_batch_not_found`, `invalid_limit`, `invalid_cursor`.
- **`list_import_choices(p_budget_id, p_limit = 100, p_after_flag = null, p_after_key = null) -> import_choices[]`**
  the remembered choices, by flag then key, 1 to 200 a page (cursor: the last row's `flag`
  and `counterparty_key`): `budget_id`, `flag`, `counterparty_key`, `choice`, `updated_at`,
  `updated_by`. Errors: `budget_not_found`, `invalid_limit`, `invalid_cursor`.
- **`forget_import_choice(p_budget_id, p_flag, p_counterparty_key) -> boolean`** (R-IMPORT-346,
  D-458, answers Q-272) forgets a remembered choice (true; false when there was none); the next
  import of that entry applies the default again. Error: `budget_not_found`.

**Merchant rules** (R-IMPORT-078, R-IMPORT-079, R-IMPORT-007, D-311): `merchant_rule_list`
(view): `id`, `budget_id`, `fragment`, `category_id`, `category_name`, `parent_category_id`,
`parent_category_name`, `category_in_force`, `created_by`, `revision`, `created_at`,
`updated_at`. At most 500 rules a budget.
- **`create_merchant_rule(p_budget_id, p_fragment, p_category_id, p_apply = false) -> {rule_id, fragment, revision, moved}`**
  the fragment is normalised like a key (1 to 100 characters). **One click** (D-117): after
  `update_transaction` gave the transaction its category, offer the transaction's whole
  `merchant_key` as the fragment (Settings can shorten it) with `p_apply => true`: the other
  transactions to review waiting in "to categorise" whose key contains it, and that are linked
  to nothing, move to the category where it is in force on their date; `moved` says how many
  (R-IMPORT-260).
- **`preview_merchant_rule(p_budget_id, p_fragment, p_category_id = null) -> {fragment, covered_by_rule_id, covered_by_fragment, rule_exists, would_move}`**
  (R-IMPORT-347, D-457, answers Q-271) without writing: the fragment as it would be stored; the
  existing rule that already covers it (the one the import would pick for that key: the
  longest fragment it contains; null when none); whether a rule with this very fragment
  exists; and how many transactions waiting in "to categorise" the rule would move to
  `p_category_id` (exactly what `p_apply` then moves, absent other changes; with no category:
  those whose key contains the fragment). Errors: `budget_not_found`, `invalid_fragment`,
  `category_not_found`, `category_is_group`, `category_to_categorise`, `category_ended`.
- **`update_merchant_rule(p_rule_id, p_expected_revision, p_fragment = null, p_category_id = null, p_apply = false)`**,
  **`delete_merchant_rule(p_rule_id, p_expected_revision)`**.
- The category: a leaf of the budget, not "to categorise", not ended. Errors:
  `invalid_fragment`, `category_not_found`, `category_is_group`, `category_to_categorise`,
  `category_ended`, `merchant_rule_exists`, `merchant_rule_limit_reached`,
  `merchant_rule_not_found`, `record_changed`, `invalid_revision`, `catching_up`.
- When the category ends, the rule stays and applies only where the category is in force; a
  restored category applies again; a category's first subcategory moves its rules to "Other"
  (a rule counts as a reference, so "Other" is required); a category deleted (it never
  counted) takes its rules with it (R-IMPORT-207).

**Import tokens** (R-IMPORT-074 to R-IMPORT-077, R-IMPORT-205, R-IMPORT-256,
R-SECURITY-251 to R-SECURITY-254, D-116, D-370, D-371):
- **`create_import_token(p_budget_id, p_name, p_expires_in_days = 30) -> {token_id, token, expires_at}`**
  Member. Expiry 1 to 365 days. The secret (`bti_` and 64 hex characters) is answered **once**;
  only its SHA-256 is stored. At most **10 tokens that can still be used** a budget
  (`token_limit_reached`), and at most **20 created within any 24 hours**, deleted ones
  included (`token_limit_reached`, D-452); revoked and expired ones are kept for the batch
  list, the newest 20 for at most 365 days, older ones pruned when a token is created. Errors
  also `invalid_name`, `invalid_expiry`.
- `import_token_list` (view): `id`, `budget_id`, `name`, `created_by`, `created_by_name`,
  `created_at`, `expires_at`, `last_used_at`, `revoked_at`, `is_active` (can still be used:
  not revoked, not expired, its creator still a member). Never the secret.
- **`revoke_import_token(p_token_id)`** Member; at once and for good (an import in progress
  finishes first; the next call is refused). Error `token_not_found`.
- **`delete_import_token(p_token_id)`** Member; a revoked or expired token only
  (`token_active` otherwise: revoke it first); its batches keep its name. Error
  `token_not_found`.
- A token stops when its creator **leaves**, **is removed** from the budget, or **deletes
  their account** (R-SECURITY-253): it is revoked, and refused from then on.
- **`import_with_token(p_token, p_batch_id, p_chunk, p_rows, p_source = 'script', p_statement_from = null, p_statement_to = null) -> {received, refused, refused_rows, error}`**
  callable **without a session** (the publishable key only), **by POST only** (a GET runs
  read-only and is refused with `read_only_call` before the token is looked at: the token
  would sit in the gateway's logs). `p_batch_id`, `p_chunk` and the statement dates are
  **text** (a JSON string or number), checked by the function (R-SECURITY-344, D-465): a
  malformed one answers `invalid_batch`, `invalid_chunk` or `invalid_date`, never a raw cast
  error. Order of work:
  1. `read_only_call`; then the token: unknown, expired, revoked, or its creator no longer a
     member: `invalid_token`, one answer, before any lock or catch-up. Only these two are
     **raised** (HTTP error).
  2. **Never waiting for another token call** (R-SECURITY-340, D-453): while another call of
     the same token is working, `error = 'token_busy'` at once; while both slots for token work
     (all budgets together) are taken, `error = 'imports_busy'` at once. These two do no work
     and **do not count**: wait a moment and send the same chunk again.
  3. **The call is counted**, whatever comes next (R-SECURITY-252): under the token's own
     lock, the calls and rows of the last hour and the last 24 hours are checked and this call
     added in one step. Limits: 60 calls and 5000 rows within any 60 minutes, 300 calls and
     20 000 rows within any 24 hours, kept by whole minutes (a call counts toward the hour for
     60 to 61 minutes and toward the day for 24 hours to 24 hours and 1 minute,
     R-SECURITY-342); over: `error = 'token_rate_limited'` (the refused call counts as a
     call).
  4. Every argument is checked before anything of the budget (at most **250 rows**), then the
     rows are imported into the token's budget through the same code, with the **default
     choices** only (a row with `action`, `kind` or `category_id` is refused:
     `choice_not_allowed`), everything to review, recorded by nobody (the batch names the
     token), possible matches skipped and never confirmed, "to categorise" created under its
     fixed name. A token adds only to a batch it created: any other existing batch id
     (a member's, another token's, another budget's) answers `import_batch_conflict`, a chunk
     already recorded included (R-SECURITY-343). The call waits at most a second for its
     budget (`budget_busy`) and its work is bounded, so it ends far within the anon statement
     timeout (3 s); were it cancelled all the same, it answers `call_cancelled` and still
     counts.
  It reads nothing back (R-SECURITY-251, D-371): `received` (rows taken into the batch,
  whatever they became), `refused` and `refused_rows` (`[{row, reason}]`) for rows refused
  for their own content only; the member sees the rest in the batch. The answer does not
  depend on the budget's content beyond coarse states: the budget has room for fewer than 250
  transactions (`transaction_limit_reached`, whatever the rows sent, no `fits`: one bit,
  R-SECURITY-345, D-451), it is far behind (`catching_up`), its import storage of the day is
  used up (`import_limit_reached`), its lock was held for more than a second (`budget_busy`).
  A refusal after the count comes back in **`error`** (with `received` 0), not raised:
  `token_rate_limited`, `invalid_batch`, `invalid_chunk`, `invalid_source`, `invalid_date`,
  `invalid_rows`, `import_batch_conflict`, `batch_undone`, `chunk_expired`,
  `transaction_limit_reached`, `category_limit_reached`, `import_limit_reached`,
  `catching_up`, `budget_busy`, `call_cancelled`; `token_busy` and `imports_busy` before the
  count.

**Free text on screens and in exports** (D-376): names, descriptions, merchants and details
are stored cleaned but otherwise as typed or imported: they may contain markup (`<b>`) or a
spreadsheet formula (`=HYPERLINK(...)`). The screens always render them as text (React
escapes; never `dangerouslySetInnerHTML`), and a CSV or spreadsheet export must neutralise a
cell starting with `=`, `+`, `-`, `@`, a tab or a carriage return (prefix `'`).

### Accounts and money flow

Accounts, the transfers planned between them, their occurrences and the per-period checklist,
the transactions of transfers linked to a category, and the money flow diagram (F-MONEYFLOW).
Everything is **plan**: no balance is ever kept or shown (R-ACCOUNT-075, D-123), and the flow
never reads transactions (R-ACCOUNT-006). Nothing depends on a bank connection (R-ACCOUNT-007).

**Accounts** (R-ACCOUNT-001, D-350). `account_overview` (view; one row per account, closed and
void ones included): `id`, `budget_id`, `name`, `kind` (enum `account_kind`: `'current'`,
`'savings'`, `'third_pillar'`, `'tax_reserve'`, `'investment'`, `'cash'`, `'credit_card'`,
`'other'`), `bank_label` (may be null), `user_id` (the member it belongs to; null: shared),
`user_display_name`, `user_is_member` (null for a shared account; false once that member left:
say "former member"), `is_active` (in force in the current period), `first_seq`, `end_seq`,
`in_use` (the terms of a transfer or an income in force now or later name it: `close_account`
from now refuses it), `removal_deletes` (closing it now deletes it: never named, never counted
before), `revision`, `created_at`, `updated_at`. The name, kind, label and holder are **not
versioned**: a rename shows in every period, past ones included (as for categories). An account
counts from a period and can be closed from a period; earlier periods keep it, so their
checklist and diagram do not change.

- **`create_account(p_budget_id, p_name, p_kind, p_bank_label = null, p_user_id = null, p_from_period_id = null, p_client_id = null) -> account_overview[]`** (one row)
  In force from the current period, or as a correction from `p_from_period_id`. Errors:
  `budget_not_found`, `invalid_name`, `invalid_account_kind`, `invalid_bank_label` (over 100
  characters; blank is none), `member_not_found` (`p_user_id` not a member), `period_not_found`,
  `account_limit_reached` (50 in force, 200 in all, void ones not counted; 900 rows),
  `budget_ended` (no current period and no correction), `request_reused`.
- **`update_account(p_account_id, p_expected_revision, p_name = null, p_kind = null, p_bank_label = null, p_user_id = null, p_clear_bank_label = false, p_clear_user = false) -> account_overview[]`** (one row)
  Each omitted keeps its value; `p_clear_*` removes the label or the holder (with a value too:
  `invalid_arguments`). Allowed on a closed account. Errors: `account_not_found`,
  `record_changed`, `invalid_revision`, `invalid_name`, `invalid_bank_label`,
  `member_not_found`, `invalid_arguments`.
- **`close_account(p_account_id, p_expected_revision, p_from_period_id = null) -> 'deleted' | 'ended'`**
  From the current period, or as a correction from an earlier one (R-ACCOUNT-232). Refused
  while a transfer's or an income's terms use it **from then on** (past use never blocks):
  `account_in_use`, whose **detail** names them as JSON text
  `[{"kind": "income" | "transfer", "id": "…", "name": "…"}]` (supabase-js `error.details`;
  incomes first, then transfers, by name): change or end them first. An account that anything
  ever named is ended, never deleted. Errors also: `account_not_found`, `record_changed`,
  `invalid_revision`, `account_ended`, `period_not_found`, `budget_ended`. There is no
  reopening of a closed account in this step (Q-223): create a new one.
- **`preview_close_account(p_account_id, p_from_period_id = null) -> {outcome, refusal, used_by}[]`**
  (one row) What `close_account` would do now, with its own checks: `outcome` `'deleted'` /
  `'ended'`, or `refusal` the code and, for `account_in_use`, `used_by` the same JSON array.

**The account an income is paid into** (R-ACCOUNT-236, D-351) is part of the income's terms,
versioned with them: `income_overview.account_id` / `account_name` (terms in force now),
`get_income_terms(...).account_id` (in a chosen period). `add_income(..., p_account_id = null, p_client_id = null)`
and `update_income(..., p_account_id = null, p_clear_account = false)`: a new account (or none)
is a change of terms like an amount, from the current period or, with `p_from_period_id`, as a
correction until the next existing change; omitted, the account in force there is kept. The
account must be in force wherever those terms apply: `account_not_in_force`; another budget's:
`account_not_found`; `p_account_id` with `p_clear_account`: `invalid_arguments`. An account
change never moves a period's end.

#### Planned transfers

`transfer_overview` (view; one row per transfer, ended and void ones included): `id`,
`budget_id`, `name`, `is_active`, `first_seq`, `end_seq`, the **terms in force now**:
`from_account_id`, `from_account_name`, `to_account_id`, `to_account_name`, `amount` (the real
amount of one occurrence), `schedule` (enum `transfer_schedule`: `'pay_date'` |
`'day_of_month'`), `offset_days` (0 to 31; null for a fixed day), `day_of_month` (1 to 31; null
for a pay date), `cadence` (enum `subscription_cadence`, here `'monthly'`, `'quarterly'` or
`'yearly'`; null for a pay date), `first_date` (the fixed-day schedule's first date: its phase;
null for a pay date), `monthly_amount` (what the plan counts per period: `amount` for a monthly
or pay-date transfer, `amount` divided by 3 or 12 rounded half up for a quarterly or yearly one,
as a subscription's monthly cost; R-ACCOUNT-304), `income_id` / `income_name` (the chosen
income; null: the primary income), `is_automatic`, `category_id`, `category_name`,
`parent_category_id`, `parent_category_name` (null: no transaction), `terms_from_seq`;
`follows_primary` (the chosen income is not in force now, or was deleted: the transfer follows
the primary income, say so; D-426), `next_due_date` (the first occurrence due today or later:
in the current period, else in the next periods at their projected boundaries; null once ended,
when the budget has ended, or after its end date), `starts_on` (its first counted day, D-421),
`has_history` (something was marked or created for it), `removal_deletes` (ending it now deletes
it), `transaction_count` (its transactions still linked), `revision`, `created_at`,
`updated_at`. Terms are versioned like an income's: an edit applies from the current period,
past periods keep theirs, a second edit in the same period replaces the first, a correction
applies from its period until the next existing change. The name is not versioned. To say
"CHF 7'056.00 once a year", show `amount` with `cadence`; for "CHF 588.00 a month", use
`monthly_amount`.

#### Occurrences (D-420 to D-422; R-ACCOUNT-300, R-ACCOUNT-301)

An **occurrence** is one execution of a transfer the plan expects. It is identified by a date,
its **key** (`occurrence_date`), never by a period, and has a **due date** (`due_date`):

- **A fixed day** (`'day_of_month'`) follows the calendar exactly like a subscription: from its
  `first_date`, every 1, 3 or 12 months, on `day_of_month` clamped to the month's length
  (31: 30 November, 28 or 29 February), no weekend rule. Each date is the key and the due date of
  an occurrence of the **period that contains it**. A short period (an early salary) can have
  none, a long one two, and a yearly payment is one occurrence a year.
- **A pay date** (`'pay_date'`): one occurrence per pay date of its income in the period, due on
  the actual pay date plus `offset_days`, never after the last day of the period containing that
  pay date.
  - The **primary income** (no income chosen, or the chosen one not in force there or deleted):
    one occurrence per period. Its key is the period's **scheduled pay date** (the date the
    schedule gave for the salary that started the period, stored on the period), its due date
    the period's start (the actual pay date, whatever moved it) plus the offset. An early
    salary on the 20th for the 25th: key the 25th, due the 20th plus the offset; a late one on
    the 28th: key the 25th, due the 28th plus the offset. A reopen and the salary recorded again
    (on any day) give back the same key. **A period is never without a key** (D-490): when
    that scheduled date is already another period's (a salary recorded 15 or more days early,
    then the next one; several salaries in one month), the period takes the **next scheduled
    pay date no period has**. Every payday therefore has its pay-date occurrence; three salaries
    recorded in one month give three. Keys are unique in a budget and derived only from the
    earlier periods, so they stay the same through a reopen and the salary recorded again. A
    key can then lie a month or more after its period: it is an identifier to send back in the
    mark calls, **not a date to show**; show `due_date`.

    **Example** (pay day 25, no weekend rule; a standing order "Savings, 500, pay date,
    automatic"). Before: the period 25 Oct to 24 Nov is keyed 25 Oct; its checklist has one
    "Savings" row, done by the catch-up, transaction 500 on 25 Oct. The salary is recorded on 9
    Nov (for 25 Nov, 16 days early). After: 25 Oct to 8 Nov keeps key 25 Oct and its
    transaction; 9 Nov to 24 Nov is keyed **25 Nov**, due 9 Nov: one "Savings" row, a
    transaction of 500 on 9 Nov. The period the schedule then starts on **25 Nov** would have
    25 Nov as its key, which is used, so it is keyed **25 Dec** (the next scheduled pay date no
    period has): one "Savings" row due 25 Nov, a transaction of 500 on 25 Nov. The period after
    it is keyed 25 Jan, and so on: each payday its own transfer. A transfer that follows
    another income chosen, or a fixed day, is keyed by its own dates as below.
  - **Another income chosen** and in force in the period: each of its actual pay dates in the
    period (its terms then, its weekend rule) is a key; a period with none of them has no
    occurrence, a long one can have several.
- Nothing before the transfer's **first counted day** (`starts_on`: the start of the period it
  was created in or corrected from, or that period's scheduled pay date when the salary came
  late; it stays a date through a reopen).

The read model: **one checklist row per occurrence**; **one mark per transfer and key**; one
transaction per mark at most.

- **`create_transfer(p_budget_id, p_name, p_from_account_id, p_to_account_id, p_amount, p_schedule, p_offset_days = null, p_day_of_month = null, p_income_id = null, p_is_automatic = false, p_category_id = null, p_from_period_id = null, p_cadence = null, p_first_date = null, p_client_id = null) -> transfer_overview[]`** (one row)
  Membership is checked first, before `p_client_id` is looked up: a retry answers only to a
  current member (anyone else gets `budget_not_found`, whatever the id).
  From the current period, or as a correction from `p_from_period_id` (the earlier periods'
  occurrences then exist too). `'pay_date'` takes `p_offset_days` (default 0) and optionally
  `p_income_id` (an income in force in that period). `'day_of_month'` takes `p_cadence`
  (default `'monthly'`; `'monthly'`, `'quarterly'` or `'yearly'`) and `p_first_date` and/or
  `p_day_of_month`: with only the day, the first date is the first date with that day on or
  after the start of its first period; with only the first date, the day is its day; with both,
  the first date must fall on that day (clamped). The first date may lie in the past (it sets
  the phase) or up to ten years ahead. Both accounts (different) and the category (optional, a
  leaf) must be in force in every period from then on. Its transactions already due (automatic
  and linked) are created with it (within the catch-up's bound, below). Errors:
  `budget_not_found`, `invalid_name`, `invalid_amount` (1 to 1 000 000 000), `invalid_schedule`
  (arguments of the other schedule: a cadence or first date for a pay date, an offset or income
  for a fixed day), `invalid_offset`, `invalid_day`, `invalid_cadence`, `invalid_first_date`,
  `invalid_automatic` (null), `account_required`, `account_not_found`, `same_account`,
  `account_not_in_force`, `income_not_found`, `income_not_in_force`, `category_not_found`,
  `category_is_group`, `category_not_in_force`, `category_to_categorise`, `period_not_found`,
  `transfer_limit_reached` (50 in force, 200 in all, void ones not counted; 900 rows),
  `budget_ended`, `request_reused`.
- **`update_transfer(p_transfer_id, p_expected_revision, p_name = null, p_from_account_id = null, p_to_account_id = null, p_amount = null, p_schedule = null, p_offset_days = null, p_day_of_month = null, p_income_id = null, p_is_automatic = null, p_category_id = null, p_clear_income = false, p_clear_category = false, p_from_period_id = null, p_cadence = null, p_first_date = null) -> transfer_overview[]`** (one row)
  A rename and/or new terms (each omitted keeps the value in force there; `p_clear_income`:
  back to the primary income; `p_clear_category`: no category). Switching to `'day_of_month'`
  needs a day or a first date (`invalid_day`) and drops the income and offset; switching to
  `'pay_date'` defaults the offset to 0. A new day without a first date keeps the schedule's
  phase (the first date moves to that day in its month); a new cadence keeps the first date.
  After the edit the catch-up looks at the occurrences again (below): an automatic linked
  occurrence due without a mark gets its transaction (in past periods too for a correction:
  Q-221, bounded and counted by the preview); the catch-up's transaction of an occurrence that
  no longer exists (another day, another pay date) goes; **what was recorded stays**: a
  transaction already made keeps its amount and category (an amount edited on or after the due
  date does not change that period's transaction), and an occurrence keeps its mark and
  transaction when made manual or automatic (R-ACCOUNT-305). Errors: those of `create_transfer`,
  and `transfer_not_found`, `record_changed`, `invalid_revision`, `transfer_ended` (no new terms
  from now for an ended transfer; a correction within its validity), `invalid_period` (before it
  started, or `p_from_period_id` without new terms), `invalid_arguments` (a value and its
  `p_clear_*` together).
- **`end_transfer(p_transfer_id, p_expected_revision, p_from_period_id = null) -> 'deleted' | 'ended'`**
  No occurrence from then on (R-ACCOUNT-234). Deleted when it never counted before that period
  and nothing was marked or created for it (`transfer_overview.removal_deletes`); otherwise
  ended. **Nothing recorded goes** (D-380, D-424): every mark stays, the catch-up's included, and
  so does every transaction's link; the checklist of the period containing a kept mark lists
  it with `planned` false and `is_ended` true. Errors: `transfer_not_found`, `record_changed`,
  `invalid_revision`, `transfer_ended`, `period_not_found`, `budget_ended`, `transfer_held_back`
  (an automatic linked occurrence from then on is due and waits for room: ending would drop it;
  free room first, D-397).
- **`get_transfer_terms(p_transfer_id, p_period_id) -> {period_id, in_force, from_account_id, to_account_id, amount, schedule, offset_days, day_of_month, income_id, is_automatic, category_id, terms_from_period_id, until_period_id, cadence, first_date}[]`**
  (one row) See "Terms in a chosen period".

#### Previews (R-ACCOUNT-233, R-ACCOUNT-303, D-428)

Each first does one catch-up step (`catching_up` when still behind) and changes nothing. The
create and edit previews **run the write itself and roll it back**, so they answer what the
write does, errors included (`transfer_limit_reached` too), and take the budget lock like it.

**Which previews run the write** (D-428). These run it inside a subtransaction and roll it back:
`preview_create_transfer`, `preview_update_transfer` (unless only `p_amount` is given, below),
`preview_reopen` (its transfer rows), `preview_update_income`, `preview_set_primary_income` and
`preview_move_period_start` (when the move is accepted). These do not, and never wait for a
writer: `preview_end_transfer`, `preview_close_account`, and `preview_update_transfer` with
`p_amount` alone (no `p_from_period_id`): an amount changes no occurrence, no due date and no
transaction already made, so it answers the plan as it is at the new amount, after the write's
own checks of the new terms (`invalid_amount` and the rest), with every count 0. What this means
for a screen:

- A preview that runs the write **takes the budget lock first**, before it reads the revisions
  and marks it compares: behind a member's write in flight it waits for it (as long as that
  write holds the budget), then previews what that write left; it never answers
  `record_changed` for a write that happened while it waited. Reads (`get_transfer_checklist`,
  the views, `my_budgets`) and the previews above that do not run the write do not wait.
- The write runs **as its own statement would**: its catch-up step starts afresh (the bound of
  transactions a step creates and the step's time, D-427), so a preview hits a limit exactly
  where the write would.
- **Nothing is left behind**: every row, watermark (`settled_through`, `next_due`,
  `needs_check`), mark and transaction the write touched is rolled back with the
  subtransaction; no client request is recorded (a preview takes no `p_client_id`); the schema
  has no sequences and sends no notifications. Checked by fingerprinting every table of
  `public` and `private` before and after a battery of every preview.
- **Cost**, at the documented limits (64 periods, 200 transfers, 50 in force, 45 000
  transactions; HTTP, median): an amount alone 22 ms, a day of month 48 ms, a correction over
  60 periods 81 ms, a create 38 ms (60 rows: 82 ms), `preview_reopen` about 370 ms (about half
  is the reopen itself recomputing every transfer's two merged periods; bounded by the 200
  transfers and the two periods, not by the budget's age). Two members re-asking a preview at
  keystroke pace (every 150 ms) at once: median 72 ms, worst 133 ms.

- **`preview_create_transfer(p_budget_id, p_from_account_id, p_to_account_id, p_amount, p_schedule, p_offset_days = null, p_day_of_month = null, p_income_id = null, p_is_automatic = false, p_category_id = null, p_from_period_id = null, p_count = 6, p_cadence = null, p_first_date = null)`**
  and **`preview_update_transfer(p_transfer_id, <the update's term arguments and p_from_period_id>, p_count = 6, p_cadence = null, p_first_date = null)`**
  `-> {period_id, start_date, end_date, projected, occurrence_date, due_date, amount, is_automatic, category_id, follows_primary, created_at_once, created_at_once_count, transactions_removed_count, marks_unplanned_count}[]`:
  the first `p_count` (1 to 60) occurrences the terms would govern, by due date: those of the
  existing periods (`period_id`), then, while the terms are open-ended, those of the next
  periods at their projected boundaries (`projected`, `period_id` null; the terms then in force;
  never after the budget's end; a yearly transfer is looked for up to `12 × p_count` periods
  ahead). `created_at_once`: the write creates this occurrence's transaction. On **every row**:
  `created_at_once_count` (how many transactions the write creates, also beyond the rows
  listed), `transactions_removed_count` (how many transactions of the catch-up it removes: their
  occurrence moved away), `marks_unplanned_count` (how many members' marks lose their
  occurrence: they stay, flagged). When the terms govern no occurrence, **one row** carries the
  counts with `occurrence_date` and the other fields null. With no term argument,
  `preview_update_transfer` answers the terms in force from the current period. Errors: those of
  the write, and `invalid_limit`.
- **`preview_end_transfer(p_transfer_id, p_from_period_id = null) -> {outcome, refusal, occurrences_removed, marks_kept, transactions_kept}[]`**
  (one row) `outcome` `'deleted'` / `'ended'`, or `refusal` the write's code (`transfer_ended`,
  `transfer_held_back`, `budget_ended`, `period_not_found`; the counts are then 0);
  `occurrences_removed`: the occurrences of the existing periods it removes from the plan (none
  of them marked); `marks_kept` / `transactions_kept`: the marks (and their transactions) of the
  occurrences it removes, which stay, listed as ended.
- The previews of the other changes the catch-up follows say what they do to the transfers, with
  the write's own code (D-428): `preview_reopen` (rows of `record_kind` `'transfer'`, below),
  `preview_move_period_start`, `preview_update_income` and `preview_set_primary_income` (three
  new columns at their end: `transfer_transactions_removed`, `transfer_transactions_created`,
  `transfer_marks_unplanned`; 0 when the write would be refused).

#### The checklist (R-ACCOUNT-004, R-ACCOUNT-005, R-ACCOUNT-301)

**`get_transfer_checklist(p_period_id) -> transfer_checklist_row[]`** Member; any period,
current or past; catches up first. **One row per occurrence** planned in the period, plus one per
mark whose occurrence is **no longer planned** and whose key lies in the period (the first
period lists earlier keys, the latest later ones), ordered by due date (key for a row with
none), then name: `transfer_id`, `period_id`, `occurrence_date` (the key: name it in the mark
calls; a pay-date key can lie outside the period, D-490, so show `due_date`), `name`, `from_account_id` / `from_account_name`, `to_account_id` / `to_account_name`,
`amount` (planned, the terms in force in that period; for an unplanned row, the terms there or
nearest), `due_date` (null for an unplanned row), `is_automatic`, `category_id` /
`category_name`, `status`, `is_overdue`, `held_back`, `follows_primary`, `done_on`,
`amount_moved`, `transaction_id`, `transaction_revision`, `mark_revision`, `recorded_by`,
`recorded_by_name`, `is_ended` (the transfer is not in force in this period), `planned` (false:
a mark kept although its occurrence is no longer planned: the schedule, the pay dates, the
boundaries or the end moved it away; only undo acts on it, which removes it with its
transaction), `cadence`, `assumed` (done without a member's mark: an automatic occurrence
assumed done, or the catch-up's transaction). `status`:

| Status | Manual | Automatic |
| --- | --- | --- |
| `'to_do'` | nothing marked (`is_overdue` once its due date has passed) | never |
| `'upcoming'` | never | before its due date |
| `'done'` | marked done (`done_on`, `amount_moved`), or the catch-up's transaction kept from when it was automatic (`assumed`) | from its due date, without confirmation (assumed done), or marked done while it was manual |
| `'skipped'` | marked skipped | marked skipped while it was manual |
| `'not_done'` | marked not done while it was automatic | marked not done |
| `'more'` | the 1000th row of a period that lists more: `name` is how many more (only with very many unplanned marks; R-APP-170) | |

`done_on` / `amount_moved`: the transaction's date and amount when it has one (an edit of the
transaction shows here), else what was marked. `held_back`: an automatic linked occurrence due
whose transaction waits for room (the budget holds 50 000 transactions); it is created, dated
its due date, once there is room. `mark_revision`: the revision of the occurrence's mark, **0
when nothing is marked**; send it as `p_expected_revision` (R-CONCURRENCY-230): a mark made or
changed since is refused with `record_changed` (reload the checklist).

The four mark calls take the period and, **when the period has several occurrences of the
transfer**, the occurrence (`p_occurrence_date`, the row's `occurrence_date`; always sending it
is fine). Each returns the occurrence's new checklist row (none after undoing an unplanned mark).

- **`mark_transfer_done(p_transfer_id, p_period_id, p_expected_revision, p_done_on = null, p_amount = null, p_occurrence_date = null) -> transfer_checklist_row[]`**
  A planned manual occurrence was done: on `p_done_on` (default today when the period is the
  current one, else its due date; any date of the budget's periods up to today, and on or after
  the transfer's first counted day: `before_transfer_start`) with the amount actually moved
  (default the planned amount). **Linked to a category, its transaction is created** there (an
  expense, recorded by the caller, dated `p_done_on`; R-ACCOUNT-073).
- **`skip_transfer(p_transfer_id, p_period_id, p_expected_revision, p_occurrence_date = null)`**
  A planned manual occurrence was skipped.
- **`mark_transfer_not_done(p_transfer_id, p_period_id, p_expected_revision, p_occurrence_date = null)`**
  A planned automatic occurrence did not happen (before or after its due date): the catch-up's
  transaction, if made, is **deleted**, and none is created for it again.
- **`undo_transfer_mark(p_transfer_id, p_period_id, p_expected_revision, p_occurrence_date = null)`**
  Back to what the occurrence is without a mark, **by the terms in force for it now**: a manual
  one to do (the transaction of "done", whoever made it, deleted); an automatic one assumed done,
  its transaction created within the same call when linked and due (later, by the catch-up, once
  due). An unplanned mark is removed with its transaction. No state is left from which no call
  leads out.
- Errors: `transfer_not_found`, `period_not_found`, `transfer_not_in_force` (no occurrence of
  it in that period, or `p_occurrence_date` is none of them; also done, skip and not done asked
  of an unplanned mark), `occurrence_required` (several occurrences there: name one),
  `invalid_revision`, `record_changed`, `transfer_already_marked` (undo the mark first),
  `transfer_is_automatic` (done or skipped asked of an automatic occurrence), `transfer_is_manual`
  (not done asked of a manual one), `nothing_to_undo` (no mark, or the catch-up's transaction of
  an automatic linked occurrence: that is already the unmarked state; mark it not done),
  `invalid_date`, `date_outside_periods`, `before_transfer_start`, `invalid_amount`,
  `category_not_in_force` (the done date falls where the category is not in force),
  `transaction_limit_reached`, `catching_up`.

#### Transactions of transfers (R-ACCOUNT-072 to R-ACCOUNT-074, R-ACCOUNT-240, R-ACCOUNT-302)

A transfer linked to a category creates **one expense per occurrence** in that category: a
manual one when marked done; an **automatic one by the catch-up on its due date** (dated then,
at the amount and in the category of the terms in force in its period, `review_state`
`'confirmed'`, `recorded_by` null), **exactly once, none skipped**, held back at the transaction
limit. A transfer without a category never creates a transaction. In `transaction_list`:
`transfer_id`, `transfer_name`, `transfer_occurrence_date` (the occurrence's key; the date of a
manual one done late may lie in another period). Such a transaction can be edited (amount,
date, category, description; it shows on the occurrence) but stays an expense with no other
link (`invalid_link`). **Deleting it says the transfer did not happen**, by the terms in force
for the occurrence now: an automatic one is not done (and not created again), whoever marked
it; a manual one is to do again; an unplanned mark goes.

**The catch-up and changes of the plan** (D-423, D-424). Each transfer has a watermark by due
date. Every change of what the plan derives from (a period created, a boundary moved, a reopen,
an income's terms or end, a primary switch, the transfer's terms or end, a mark removed) moves
it back, and the catch-up then looks at the transfer again from there: **its own transactions
whose occurrence is no longer planned, or not yet due, go**; the automatic linked occurrences
due without a mark get theirs. A **member's mark never goes** this way: it stays, listed in the
period containing its key with `planned` false, until undone or until its occurrence is planned
again (the same salary recorded again after a reopen). The writes that change the plan settle
this before they answer, so their answer and the next reads show the result.

**The catch-up's step is bounded** (R-PERIOD-300, D-427): one step creates at most 4000
subscription charges and transfer transactions per budget, and stops after about two seconds of
work once it has created some; the rest stays due, none skipped. A step that stops early
answers at least 1 from `ensure_periods` and leaves `my_budgets.caught_up` false: the client's
loop (`ensure_periods` until 0) carries on.

**Committed amounts** (R-ACCOUNT-238, R-ACCOUNT-304, D-359, D-425). A linked transfer's
**monthly share** is committed in its category in each period it is in force, as **its own
figure**, never added to the subscriptions' `committed`: `get_period_progress(...).transfer_committed`
(a group: its subcategories'), `category_overview.transfer_committed_amount` (now),
`period_summaries.transfer_committed_total`, and the comparison reads (D-399). Word it as
"CHF 1000 of CHF 1500 planned as a transfer"; the subscriptions' figures and every existing
total are unchanged. Ended transfers count only where they were in force.

#### The money flow (R-ACCOUNT-006, R-ACCOUNT-235, R-ACCOUNT-304, D-356)

**`get_money_flow(p_budget_id, p_period_id = null) -> {row_kind, id, name, source_id, target_id, amount, inflow, outflow, stays, is_negative, account_kind, user_id, is_automatic, period_id, planned_amount, cadence}[]`**
Member; for a chosen period (default the current one: `budget_ended` when there is none);
catches up first. From the plan in force in that period only, never from transactions. Rows,
in this order:

| `row_kind` | One per | Fields |
| --- | --- | --- |
| `'income'` | income in force in the period | `id` = `source_id` (the income), `name`, `amount` (its amount then), `target_id` (its account then; **null: the "not assigned" node**), `user_id` |
| `'not_assigned'` | at most one, only when an income names no account | `inflow` = `stays` (those incomes), `outflow` 0 |
| `'account'` | account in force in the period, flows or not | `id`, `name`, `account_kind`, `user_id`, `inflow` (incomes and transfers in), `outflow` (transfers out), `stays` (= inflow - outflow: what the plan leaves there this period; **not a balance**), `is_negative` (more planned out than in: show a warning) |
| `'transfer'` | transfer in force in the period | `id`, `name`, `source_id` (from account) -> `target_id` (to account), `amount` (**its monthly share**: what the plan moves per period), `planned_amount` and `cadence` (its real amount and cadence: "CHF 7'056.00 once a year"; `cadence` null for a pay date), `is_automatic` |
| `'total'` | one | `amount` = `inflow` = the incomes added up (**= `period_summaries.salary_total`**: salaries only; extra incomes are actual transactions, not plan), `outflow` = the transfers' monthly shares added up |

Everything adds up: the `stays` of the accounts and "not assigned" total the incomes. At most
about 900 rows (500 incomes, 200 accounts and 200 transfers at the limits). Draw the Sankey from
`'income'` and `'transfer'` rows (`source_id` -> `target_id`, null target = the
`'not_assigned'` node). Errors: `budget_not_found`, `period_not_found`, `budget_ended`,
`catching_up`.

**Dashboard** (R-ACCOUNT-241, D-395): `my_budgets.transfers_to_do` (the manual occurrences of
the current period and of the period before it with no mark) and `transfers_overdue` (of those,
due date passed); automatic ones never count; 0 when the budget has ended. Older periods'
unfinished ones show in their own checklist only.

#### Reopen (R-ACCOUNT-306, D-430)

Accounts, transfers and their terms are merged like every validity and version table
(`preview_reopen` kinds `'account'` and `'transfer'`). **A reopen moves no mark**: marks are
keyed by date. The merged period's scheduled pay date is no longer planned (its salary has not
come), so the catch-up's transaction of a primary pay-date occurrence there goes, and comes back
once the salary is recorded again, dated the day it came; a member's mark there stays, flagged,
and is the same occurrence again then. Fixed-day occurrences keep their dates and marks (they
now belong to the reopened period). A transfer created in the merged period counts from its
first counted day, so the reopened period gets no occurrence of its own earlier payday. A
transfer ended in the merged period now ends in the reopened one; its marks there stay, listed
as ended. `preview_reopen` lists one row per occurrence the reopen affects: `record_kind`
`'transfer'`, `change` `'transaction_removed'` (the catch-up's transaction goes),
`'transaction_created'`, `'mark_unplanned'` (a member's mark stays, flagged) or
`'mark_planned_again'`, `replaces_previous` false. These kinds replace step 7's first
`'mark_moved'`, `'mark_removed'` and `'transaction_unlinked'`, which no longer occur.

**Members** (R-MEMBER-007). A member who leaves or is removed keeps the accounts they held
(`user_is_member` false); their incomes end, so transfers that chose one follow the primary
income from then on (`follows_primary`), and the catch-up looks at their occurrences again. A
person who deletes their login leaves those accounts shared (`user_id` null).

**Limits** (R-ACCOUNT-230, D-357, R-APP-170): 50 accounts and 50 transfers in force, 200 of each
in all (void ones not counted), 900 rows of each a budget; previews 1 to 60 occurrences; offset 0
to 31 days; a first date at most ten years ahead; bank label 100 characters; one mark per
transfer and occurrence; a checklist at most 1000 rows (the last one `'more'` beyond that).

**In an ended budget**: reads, the checklist and marks of its periods, and the writes with
`p_from_period_id` (corrections) work; the writes from the current period answer
`budget_ended`. No occurrence and no transaction after the last period.

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
principal, terms (the category included), validity, adjustments; not payments or interest),
accounts (`account_overview.revision`: name, kind, label, holder, closing), transfers
(`transfer_overview.revision`: name, terms, end; not what the catch-up settles), and a
transfer's mark in a period (`get_transfer_checklist(...).mark_revision`, 0 when none: every
mark and undo names it, R-CONCURRENCY-230).
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
| `category_limit_reached`, `transaction_limit_reached` | a limit (200 categories in force or 500 in all, void rows not counted, and 900 rows in all with them; 50 000 transactions) |
| `category_in_use` | a subscription or debt uses the category from that period on: end or move it first; the error's detail lists them as JSON `[{kind, id, name}]` |

Step 4 messages:

| Message | Meaning |
| --- | --- |
| `subscription_not_found`, `debt_not_found`, `adjustment_not_found` | does not exist (any more) or not visible to you |
| `subscription_ended`, `debt_ended` | it has ended (for that period); an ended debt is frozen: no payment or adjustment can be added, changed or removed |
| `before_debt_opened` | a payment or adjustment dated before the debt's `opened_on` |
| `catching_up` | the budget is behind: more than 62 days (answered at once, nothing done), or still behind after this call's step; or, from `ensure_periods` / `get_current_period`, another session holds the budget for more than two seconds. Call `ensure_periods` until it returns 0, then retry; nothing was changed |
| `charge_held_back` | a charge of the subscription waits for room (transaction limit): its schedule cannot change and it cannot end until the charge is created |
| `membership_limit_reached` | you already belong to 50 budgets (owned ones included): leave one first |
| `transfer_held_back` | an automatic linked occurrence of the transfer is due and waits for room (transaction limit): it cannot end until the transaction is created |
| `request_reused` | this `p_client_id` was already used for another request: generate a new one per user action |
| `invalid_rows` | the import rows are not a JSON array of 1 to 500 rows (250 for a token), or exceed 2 MB in all |
| `invalid_batch`, `invalid_chunk`, `invalid_source`, `invalid_expiry`, `invalid_fragment` | invalid argument (a batch id, a chunk number 1 to 100, an import source, a token expiry 1 to 365 days, a rule fragment) |
| `import_batch_conflict` | that batch id belongs to another budget (also when two budgets race for a new id) |
| `import_batch_not_found`, `merchant_rule_not_found`, `token_not_found` | does not exist (any more) or not visible to you |
| `batch_undone` | the batch was undone: it takes no more chunks and nothing more is imported from it |
| `not_to_review` | only a transaction to review can be confirmed as reviewed |
| `category_to_categorise` | "to categorise" cannot do this (a subcategory, an expectation, an end while it holds transactions, the category of a rule, a subscription, a debt, a planned transfer, a typed transaction or a transaction moved into it), or a transaction in it cannot be confirmed |
| `merchant_rule_exists`, `merchant_rule_limit_reached`, `token_limit_reached` | one rule per fragment; 500 rules; 10 tokens that can still be used a budget, or 20 created within 24 hours |
| `token_active` | revoke the token before deleting it |
| `read_only_call` | the token import was called by GET: call it by POST |
| `invalid_token` | the import token is unknown, expired or revoked, or its creator is no longer a member |
| `token_rate_limited` | the token sent too much (60 calls / 5000 rows within any 60 minutes, 300 calls / 20 000 rows within any 24 hours; every call that does work counts); in the token import's `error` column |
| `preview_required` | an income edit that moves the current period's end needs the end its preview showed (`p_previewed_end_date`) |
| `invalid_charge_date` | not a valid date, more than ten years ahead, or (a new schedule from now) not after today |
| `invalid_interest_rate` | not 0 to 100, or more than three decimals |
| `invalid_link` | a transaction linked to both, a linked refund or extra income, or a payment outside the debt's category |
| `debt_not_in_force`, `subscription_not_in_force` | not in force in the period of the transaction's date |
| `not_a_charge` | only an automatic charge can be confirmed or dismissed |
| `debt_has_history` | the principal of a debt with payments, interest or adjustments cannot change: adjust the balance |
| `subscription_limit_reached`, `debt_limit_reached`, `adjustment_limit_reached` | a limit (50 subscriptions in force or 200 in all; 50 debts in force or 200 in all; 900 rows of each with void ones; 5000 adjustments) |

Step 7 messages:

| Message | Meaning |
| --- | --- |
| `account_not_found`, `transfer_not_found` | does not exist (any more) or not visible to you |
| `account_ended`, `transfer_ended` | it has closed / ended (for that period) |
| `account_in_use` | a transfer's or an income's terms use the account from that period on: change or end them first; the error's detail lists them as JSON `[{kind, id, name}]` |
| `account_not_in_force` | an account (of a transfer or an income) is not in force in every period the terms apply to |
| `account_required`, `same_account` | a transfer needs two accounts, and two different ones |
| `invalid_account_kind`, `invalid_bank_label`, `invalid_schedule`, `invalid_offset`, `invalid_day`, `invalid_automatic`, `invalid_arguments` | invalid argument (no kind; a label over 100 characters; the other schedule's argument; an offset 0 to 31; a day 1 to 31; automatic null; a value and its `p_clear_*` together) |
| `transfer_not_in_force` | the transfer has no occurrence in that period (or none on the date named; or the mark's occurrence is no longer planned: only undo acts on it) |
| `transfer_already_marked` | the occurrence is already marked: undo the mark first |
| `transfer_is_automatic`, `transfer_is_manual` | done and skipped are for manual transfers, not done for automatic ones |
| `nothing_to_undo` | the occurrence has no mark (or its transaction was made by the catch-up: mark it not done) |
| `occurrence_required` | the period has several occurrences of the transfer: name one (`p_occurrence_date`) |
| `before_transfer_start` | a done date before the transfer's first counted day (`transfer_overview.starts_on`) |
| `invalid_first_date` | a fixed-day transfer's first date is not a valid date, more than ten years ahead, or not on its day of the month |
| `account_limit_reached`, `transfer_limit_reached` | 50 in force or 200 in all (void ones not counted), 900 rows a budget |

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

## Error messages added by the step 6 fix round 2

Stable messages added by the second fix round of step 6 (D-451 to D-466). They are listed here,
apart from the table above, until the screens know them (`src/lib/db-errors.ts` and both
locales): until then a member who meets `import_limit_reached` or `chunk_expired` sees the
generic message. The other four reach only the import script (`import_with_token`'s `error`
column). Move them into the table above when the screens add them.

| Message | Meaning |
| --- | --- |
| `token_busy`, `imports_busy` | another call of this token is working, or every slot for token work is taken: nothing was done or counted; send the same chunk again after a pause (token import's `error` column) |
| `budget_busy` | the token import waited a second for its budget, held by another call: nothing written (counted); send again |
| `call_cancelled` | the token import was cancelled (statement timeout): nothing written, counted; send again |
| `import_limit_reached` | the budget's import storage is used up: 20 000 rows or 50 new batches within 24 hours, or 2 000 batches kept that all still hold something |
| `chunk_expired` | that chunk was recorded but its answer is no longer kept: it is not imported again (list the batch's rows instead) |

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
merge, a version at or after its row's end is deleted (D-208). Step 7 registers `accounts`
(`'account'`, with categories in the last `merge_order`), `transfers` (`'transfer'`) and
`transfer_versions`; the marks of transfers (`transfer_occurrences`) are keyed by date, not by
period, so a merge moves none (D-430). A row
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
- **Step 6, imports (done; D-115, D-118, D-310)**: `import_batch_id` (a composite foreign
  key to `import_batches`), `bank_transaction_id`, `merchant`, `merchant_key`, `details`
  (jsonb, bounded); the enum value `'to_review'` (added in a migration of its own, since a
  new enum value is usable only once committed) and `transactions_review_state_valid`
  (`awaiting_confirmation` needs a charge, `to_review` an import). Duplicates are counted,
  not unique (an "import anyway" may record one twice), so there is no unique index; lookups
  use `(budget_id, bank_transaction_id)` and `(budget_id, kind, amount, date)`. The import
  inserts under one budget lock with `add_transaction`'s checks
  (`private.transaction_period_seq`, `private.assert_transaction_category`).
- **Step 7, transfers (done; D-122, D-353, D-380, D-420)**: `transfer_occurrence_id`, a
  composite foreign key to `transfer_occurrences` (one mark per transfer and occurrence date)
  with `on delete set null (transfer_occurrence_id)` (the code removes a mark first, then its
  transaction), unique (one transaction per occurrence), counted in `transactions_one_link` and
  `transactions_link_kind`; a trigger keeps it an expense with no other link (`invalid_link`),
  and another puts the occurrence back when the transaction is deleted.
- `add_transaction` gains optional arguments for the new columns (default null, at the
  end), so step 3 callers keep working; `update_transaction` keeps columns it does not take
  (step 4: the links, unless it is called with `p_relink`; `link_transaction` changes them
  too); `transaction_list` appends the new columns at its end.
