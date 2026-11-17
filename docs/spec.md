# Budget Tracker specification

<!-- Generated from spec/spec.json by `npm run spec:render`. Do not edit by hand. -->

> Generated from [`spec/spec.json`](../spec/spec.json) by `npm run spec:render`; do not edit
> this file. Change the spec, render, and run `npm run spec:check`.

A personal / household budget tracker. A budget starts from the monthly total of its incomes, is split into categories and subcategories with a monthly expectation each, and is tracked period by period against the transactions the user records. It also tracks subscriptions, debts, and the planned flow of money between accounts. CHF only. UI in English and French.

## Contents

- [Build steps and features](#build-steps-and-features)
- [Business rules](#business-rules)
- [Conventions](#conventions)
- [Decisions](#decisions)
- [Open questions](#open-questions)
- [Glossary](#glossary)
- [Actors](#actors)
- [How to read this](#how-to-read-this)

546 rules (536 active, 0 planned), 24 conventions, 317 decisions, 40 open questions. 0 rules and conventions are marked **TEST PENDING**.

## Build steps and features

### Step 1: Scaffold: app shell, auth, sidebar layout, local Supabase, CI and deploy pipeline (done)

#### F-SHELL App shell (done)

Sidebar layout and navigation, English and French UI, theme, money and date formatting helpers, error and not-found pages.

- **US-SHELL-001** As a signed-in user, I want to move between the sections of the app from a sidebar, so that I always know where I am and how to get elsewhere.
  Rules: R-APP-001, R-APP-002
- **US-SHELL-002** As a signed-in user, I want to use the app in English or in French and have it remember my choice, so that everyone in the household can read it in their language.
  Rules: R-I18N-001, R-I18N-002
- **US-SHELL-003** As a signed-in user, I want to see amounts in Swiss francs with Swiss formatting and dates as dd.mm.yyyy, so that figures read the way I am used to.
  Rules: R-MONEY-001, R-MONEY-003, R-DATE-001

#### F-AUTH Accounts and sign-in (done)

Sign-up with email confirmation, sign-in, password reset by email link, sign-out; safe on a shared household computer.

- **US-AUTH-001** As an anonymous visitor, I want to create an account with my display name, email and password, so that I can keep my own budgets.
  Rules: R-AUTH-004, R-AUTH-005, R-AUTH-006, R-AUTH-007, R-AUTH-008, R-AUTH-012
- **US-AUTH-002** As an anonymous visitor, I want to sign in and land on the page I was trying to open, so that I can carry on where I wanted to go.
  Rules: R-AUTH-001, R-AUTH-002, R-AUTH-003, R-AUTH-009, R-AUTH-010, R-AUTH-011, R-AUTH-015
- **US-AUTH-003** As an anonymous visitor, I want to reset a forgotten password from an email link, so that I can get back into my account.
  Rules: R-AUTH-013, R-AUTH-016, R-AUTH-017, R-AUTH-018, R-AUTH-022, R-AUTH-024
- **US-AUTH-004** As a signed-in user, I want an email link opened on our shared computer never to change or expose the wrong account, so that two people can share one browser safely.
  Rules: R-AUTH-019, R-AUTH-020, R-AUTH-021, R-AUTH-023, R-AUTH-025, R-AUTH-026, R-AUTH-027
- **US-AUTH-005** As an anonymous visitor, I want to be told clearly when an email link has expired and to get a new one, so that I am not stuck with a dead link.
  Rules: R-AUTH-014, R-AUTH-015

#### F-PROFILE Profiles (done)

One profile per user, created on sign-up, holding the display name.

- **US-PROFILE-001** As a signed-in user, I want my display name to be kept in my profile and changeable only by me, so that the people I share a budget with know who I am.
  Rules: R-PROFILE-001, R-PROFILE-002

#### F-PLATFORM Local Supabase, CI and deployment (done)

Local Supabase stack, row-level security baseline, CI, and the manual deploy to Infomaniak.

- **US-PLATFORM-001** As a signed-in user, I want my data to be protected by the database itself, so that nobody reaches it by going around the app.
  Rules: R-SECURITY-001, R-SECURITY-005

### Step 2: Budgets and members, incomes, periods (in-progress)

#### F-BUDGET Budgets (in-progress)

Create, rename, end and delete a budget, created atomically with its first income and period.

- **US-BUDGET-001** As a signed-in user, I want to create a budget with its first income in one step, so that I can start tracking at once and the budget is never half set up.
  Rules: R-BUDGET-002, R-BUDGET-003, R-BUDGET-010, R-BUDGET-011, R-BUDGET-012, R-PERIOD-015, R-PERIOD-016, R-PERIOD-019, R-BUDGET-050, R-APP-004, R-APP-005
- **US-BUDGET-002** As a signed-in user, I want to belong to several budgets, so that I can keep a personal budget next to the household one.
  Rules: R-BUDGET-004, R-SECURITY-002, R-SECURITY-003, R-SECURITY-004, R-BUDGET-051, R-BUDGET-053
- **US-BUDGET-003** As a budget owner, I want to give a budget an end date or run it indefinitely, so that tracking stops when the budget is no longer needed.
  Rules: R-BUDGET-005, R-BUDGET-006, R-BUDGET-007, R-BUDGET-008, R-BUDGET-013, R-MEMBER-003, R-BUDGET-054
- **US-BUDGET-004** As a budget member, I want to rename a budget, so that its name stays meaningful.
  Rules: R-BUDGET-009, R-MEMBER-001
- **US-BUDGET-005** As a budget owner, I want to delete a budget with everything in it, so that I can remove one I no longer use.
  Rules: R-BUDGET-001, R-BUDGET-009, R-MEMBER-002, R-BUDGET-052

#### F-MEMBERS Members and invitations (in-progress)

Invite people by email, accept or decline, leave, remove members.

- **US-MEMBERS-001** As a budget owner, I want to invite someone by email address, so that we can run the household budget together.
  Rules: R-INVITE-001, R-INVITE-002, R-INVITE-005, R-INVITE-006, R-MEMBER-004, R-MEMBER-010, R-MEMBER-050
- **US-MEMBERS-002** As an invited person, I want to see the invitations addressed to my verified email and accept or decline them, so that I join only the budgets I want.
  Rules: R-INVITE-003, R-INVITE-004, R-BUDGET-050
- **US-MEMBERS-003** As a budget member, I want to leave a budget, so that I stop sharing it without affecting its history.
  Rules: R-MEMBER-005, R-MEMBER-006, R-MEMBER-007, R-MEMBER-008
- **US-MEMBERS-004** As a budget owner, I want to remove a member, so that only the right people share the budget.
  Rules: R-MEMBER-004, R-MEMBER-007, R-MEMBER-008, R-MEMBER-009, R-MEMBER-050
- **US-MEMBERS-005** As a budget member, I want to see who the other members are, so that I know with whom I share the budget.
  Rules: R-PROFILE-003, R-MEMBER-001

#### F-INCOME Incomes (in-progress)

Versioned monthly incomes per member, one of them primary, with a weekend rule.

- **US-INCOME-001** As a budget member, I want to add my income with its amount, pay day and weekend rule, so that it counts in the budget's monthly total.
  Rules: R-INCOME-002, R-INCOME-003, R-INCOME-004, R-INCOME-005, R-INCOME-010, R-INCOME-011, R-INCOME-013, R-INCOME-014, R-MONEY-002, R-PAYDATE-001, R-PAYDATE-002, R-PAYDATE-003, R-PAYDATE-004, R-PAYDATE-005, R-PAYDATE-006, R-PAYDATE-007, R-INCOME-050
- **US-INCOME-002** As a budget member, I want to change an income's terms when my salary changes, so that the change applies from now on and past periods stay as they were.
  Rules: R-VERSION-001, R-VERSION-005, R-VERSION-006, R-INCOME-051, R-INCOME-054, R-INCOME-055, R-INCOME-100
- **US-INCOME-003** As a budget member, I want to make another income the primary one, so that periods follow the salary that really sets our rhythm.
  Rules: R-INCOME-006, R-INCOME-007, R-INCOME-008, R-INCOME-054, R-INCOME-055
- **US-INCOME-004** As a budget member, I want to remove an income, so that it stops counting without rewriting past periods.
  Rules: R-INCOME-001, R-INCOME-009, R-INCOME-012, R-INCOME-051

#### F-PERIOD Periods (in-progress)

Pay-day-to-pay-day periods, created on demand, with manual boundaries.

- **US-PERIOD-001** As a budget member, I want periods to run from pay day to pay day of the primary income, so that the salary is always day one of the period.
  Rules: R-PERIOD-001, R-PERIOD-002, R-PERIOD-003, R-PERIOD-004, R-PERIOD-005, R-PERIOD-006, R-PERIOD-008, R-PERIOD-009, R-PERIOD-010, R-PERIOD-017, R-PERIOD-018, R-PERIOD-050, R-PERIOD-052, R-PERIOD-300
- **US-PERIOD-002** As a budget member, I want to move a period boundary when the salary arrived on another day, so that public holidays do not put transactions in the wrong period.
  Rules: R-PERIOD-012, R-PERIOD-013, R-PERIOD-014, R-PERIOD-020, R-PERIOD-051, R-PERIOD-053, R-PERIOD-100, R-PERIOD-055
- **US-PERIOD-003** As a budget member, I want past periods to stay as they were when the primary income's terms change, so that history does not shift under me.
  Rules: R-PERIOD-007, R-PERIOD-011, R-VERSION-007, R-VERSION-008

### Step 3: Categories, transactions, period progress view (in-progress)

#### F-CATEGORY Categories and expectations (in-progress)

Two-level categories with monthly or yearly expectations, and the amount left to assign.

- **US-CATEGORY-001** As a budget member, I want to split the budget into categories and subcategories with a monthly expectation each, so that I know how much I plan to spend on what.
  Rules: R-CATEGORY-001, R-CATEGORY-002, R-VERSION-002, R-CATEGORY-090, R-CATEGORY-092, R-CATEGORY-093, R-CATEGORY-094, R-CATEGORY-096, R-CATEGORY-050, R-CATEGORY-051, R-CATEGORY-102
- **US-CATEGORY-002** As a budget member, I want to enter a yearly amount for a yearly cost, so that it is spread as one twelfth per month.
  Rules: R-CATEGORY-003, R-CATEGORY-004, R-CATEGORY-005, R-CATEGORY-070, R-CATEGORY-091, R-CATEGORY-050
- **US-CATEGORY-003** As a budget member, I want to see the amount left to assign in a period, negative when I have assigned more than the income, so that every franc of the budget has a purpose.
  Rules: R-CATEGORY-006, R-CATEGORY-071, R-CATEGORY-050
- **US-CATEGORY-004** As a budget member, I want to delete a category I no longer need, so that it leaves the budget from now on while past periods keep it.
  Rules: R-CATEGORY-072, R-CATEGORY-073, R-CATEGORY-095, R-CATEGORY-052, R-CATEGORY-101, R-CATEGORY-054, R-CATEGORY-120
- **US-CATEGORY-005** As a budget member, I want to change a category's expectation from now on, or explicitly correct it from an earlier period, so that past periods stay as they were unless I fix a mistake on purpose.
  Rules: R-VERSION-002, R-VERSION-070, R-CATEGORY-053, R-CATEGORY-100, R-CATEGORY-101, R-CATEGORY-054, R-VERSION-140
- **US-CATEGORY-006** As a budget member, I want my save to be refused, with a message to reload, when another member changed the same thing in the meantime, so that I never silently overwrite their change.
  Rules: R-CONCURRENCY-070, R-CONCURRENCY-090, R-CONCURRENCY-091, R-CONCURRENCY-100

#### F-TRANSACTION Transactions (in-progress)

Manual transactions, landing in the period that contains their date.

- **US-TRANSACTION-001** As a budget member, I want to record a transaction with an amount, a date and a category, so that spending is tracked against the budget.
  Rules: R-TRANSACTION-001, R-TRANSACTION-002, R-TRANSACTION-004, R-TRANSACTION-006, R-TRANSACTION-072, R-TRANSACTION-073, R-TRANSACTION-090, R-TRANSACTION-094, R-TRANSACTION-095, R-TRANSACTION-050, R-TRANSACTION-051
- **US-TRANSACTION-002** As a budget member, I want to add, edit or delete a transaction in a past period, so that late receipts still land in the right period.
  Rules: R-TRANSACTION-007, R-TRANSACTION-008, R-TRANSACTION-091, R-TRANSACTION-093, R-TRANSACTION-050, R-TRANSACTION-100
- **US-TRANSACTION-003** As a budget member, I want to record money coming back as a refund, so that it reduces what was spent in its category.
  Rules: R-TRANSACTION-070, R-TRANSACTION-071, R-TRANSACTION-092, R-TRANSACTION-050

#### F-PROGRESS Period progress view (in-progress)

Each period, the current one and past ones, tracked against its expectations, with its result.

- **US-PROGRESS-001** As a budget member, I want to see how the current period is going against the expectations, with overspent categories shown as such, so that I can adjust before the period ends.
  Rules: R-PROGRESS-001, R-PROGRESS-071, R-PROGRESS-091, R-PROGRESS-050
- **US-PROGRESS-002** As a budget member, I want to see a period's surplus or deficit, and each category's result, so that I know how the period went.
  Rules: R-PROGRESS-002, R-PROGRESS-070, R-PROGRESS-092, R-PROGRESS-050
- **US-PROGRESS-003** As a budget member, I want to browse past periods and see the progress view of each, so that I can look back at how any period went.
  Rules: R-COMPARE-001, R-PROGRESS-090, R-PROGRESS-050

### Step 4: Subscriptions and debts (in-progress)

#### F-SUBSCRIPTION Subscriptions (in-progress)

Recurring charges and their next charge date.

- **US-SUBSCRIPTION-001** As a budget member, I want to track subscriptions and see when each will next be charged, so that recurring costs do not surprise me.
  Rules: R-SUBSCRIPTION-001, R-SUBSCRIPTION-002, R-SUBSCRIPTION-070, R-SUBSCRIPTION-071, R-SUBSCRIPTION-072, R-VERSION-003, R-SUBSCRIPTION-110, R-SUBSCRIPTION-114, R-CATEGORY-110, R-SUBSCRIPTION-120, R-SUBSCRIPTION-121, R-SUBSCRIPTION-122, R-SUBSCRIPTION-124, R-SUBSCRIPTION-140, R-SUBSCRIPTION-141
- **US-SUBSCRIPTION-002** As a budget member, I want each subscription charge to be recorded automatically on its charge date, and to confirm from the home page that it really went through, so that I do not enter recurring charges by hand and still catch one that failed.
  Rules: R-SUBSCRIPTION-073, R-SUBSCRIPTION-074, R-SUBSCRIPTION-075, R-SUBSCRIPTION-076, R-SUBSCRIPTION-077, R-SUBSCRIPTION-078, R-SUBSCRIPTION-111, R-SUBSCRIPTION-112, R-SUBSCRIPTION-113, R-TRANSACTION-003, R-VERSION-110, R-SUBSCRIPTION-123, R-SUBSCRIPTION-142
- **US-SUBSCRIPTION-003** As a budget member, I want to see a subscription's monthly cost as committed within its category's expectation, so that I see how much of the category is already spoken for.
  Rules: R-SUBSCRIPTION-079, R-PROGRESS-120

#### F-DEBT Debts (in-progress)

Debts with planned payments, their evolution and expected end date.

- **US-DEBT-001** As a budget member, I want to record a debt with its principal, interest rate and planned monthly payment, so that I can follow it down to zero.
  Rules: R-DEBT-001, R-DEBT-002, R-DEBT-070, R-DEBT-072, R-VERSION-004, R-DEBT-110, R-DEBT-114, R-DEBT-120, R-DEBT-140
- **US-DEBT-002** As a budget member, I want payments linked to a debt to reduce what remains, interest to be added to it, and to see its history and expected end date, so that I know when it will be paid off, or that it never will at this pace.
  Rules: R-DEBT-003, R-DEBT-004, R-DEBT-005, R-DEBT-071, R-DEBT-073, R-DEBT-074, R-DEBT-111, R-DEBT-112, R-DEBT-113, R-TRANSACTION-110, R-DEBT-121, R-DEBT-122, R-DEBT-123
- **US-DEBT-003** As a budget member, I want to adjust a debt's balance by hand, so that it matches my bank statement.
  Rules: R-DEBT-075, R-DEBT-122

### Step 5: Period comparison charts (in-progress)

#### F-COMPARE Period comparison (in-progress)

Comparing periods in charts. Browsing a past period and its progress view is part of step 3 (F-PROGRESS).

- **US-COMPARE-001** As a budget member, I want to compare the income, spending and result of the last 12 periods in a chart, so that I see how our spending evolves.
  Rules: R-COMPARE-002, R-COMPARE-171, R-COMPARE-172, R-COMPARE-173, R-COMPARE-190, R-COMPARE-191, R-COMPARE-195
- **US-COMPARE-002** As a budget member, I want to see the spending per category across periods, so that I see which categories grow or shrink.
  Rules: R-COMPARE-070, R-COMPARE-170, R-COMPARE-174, R-COMPARE-192, R-COMPARE-193
- **US-COMPARE-003** As a budget member, I want to put two periods side by side, so that I see exactly what changed between them.
  Rules: R-COMPARE-071, R-COMPARE-173, R-COMPARE-174, R-COMPARE-194

### Step 6: Import (statements, CSV and Claude) (in-progress)

#### F-IMPORT Import (in-progress)

Bulk import of transactions from PDF bank and card statements, from CSV, or by a Claude session, through one database function.

- **US-IMPORT-001** As a budget member, I want to paste or upload a CSV of transactions, so that I do not type them one by one.
  Rules: R-IMPORT-001, R-IMPORT-002, R-IMPORT-003, R-IMPORT-004, R-IMPORT-005, R-IMPORT-070, R-IMPORT-071, R-IMPORT-072, R-IMPORT-073, R-IMPORT-080, R-IMPORT-082, R-TRANSACTION-005, R-IMPORT-200, R-IMPORT-203, R-IMPORT-204, R-IMPORT-206, R-IMPORT-208, R-IMPORT-209
- **US-IMPORT-002** As a Claude session, I want to import transactions by running the import script of this repository with an import token, so that a member can delegate the import without giving Claude raw database access.
  Rules: R-IMPORT-001, R-IMPORT-006, R-IMPORT-076, R-SECURITY-005, R-IMPORT-205, R-SECURITY-200
- **US-IMPORT-003** As a budget member, I want imported transactions to be marked to review until I confirm them, categorised from saved merchant rules, and to save a new rule in one click when I categorise one, so that I check them quickly and categorisation improves over time.
  Rules: R-IMPORT-004, R-IMPORT-007, R-IMPORT-079, R-IMPORT-081, R-IMPORT-201, R-IMPORT-202, R-IMPORT-207
- **US-IMPORT-004** As a budget member, I want to create import tokens for one budget in Settings, and revoke them, so that I control what a Claude session can do, and can stop it at any time.
  Rules: R-IMPORT-074, R-IMPORT-075, R-IMPORT-076, R-IMPORT-077, R-IMPORT-205
- **US-IMPORT-005** As a budget member, I want to edit the merchant-to-category rules in Settings, so that I can fix a rule that puts a merchant in the wrong category.
  Rules: R-IMPORT-078
- **US-IMPORT-006** As a budget member, I want to open a PDF statement of my Migros Bank account, my Migros Bank credit card or my Yuh account in the app, so that its transactions are imported without typing them or mapping columns.
  Rules: R-IMPORT-084, R-IMPORT-085, R-IMPORT-086, R-IMPORT-087, R-IMPORT-088, R-IMPORT-089, R-IMPORT-090, R-IMPORT-095, R-IMPORT-096, R-IMPORT-097, R-IMPORT-098, R-IMPORT-099, R-IMPORT-100, R-IMPORT-101, R-IMPORT-102
- **US-IMPORT-007** As a budget member, I want card-bill payments, transfers between my own accounts, salaries and other credits to be recognised when I import a statement, so that nothing is counted twice and I decide what each credit is.
  Rules: R-IMPORT-091, R-IMPORT-092, R-IMPORT-093, R-IMPORT-094

### Step 7: Accounts and the money flow diagram (in-progress)

#### F-MONEYFLOW Accounts and money flow (in-progress)

Accounts, planned transfers after payday, a per-period checklist and the money flow diagram.

- **US-MONEYFLOW-001** As a budget member, I want to define my accounts and the transfers planned between them after payday, so that the money goes where it should every period.
  Rules: R-ACCOUNT-001, R-ACCOUNT-002, R-ACCOUNT-003, R-ACCOUNT-004, R-ACCOUNT-070, R-ACCOUNT-071, R-VERSION-071, R-ACCOUNT-230, R-ACCOUNT-231, R-ACCOUNT-232, R-ACCOUNT-233, R-ACCOUNT-234, R-ACCOUNT-236, R-ACCOUNT-306, R-ACCOUNT-300, R-ACCOUNT-301, R-ACCOUNT-302, R-ACCOUNT-303
- **US-MONEYFLOW-002** As a budget member, I want a per-period checklist of the manual transfers, so that I do not forget one.
  Rules: R-ACCOUNT-005, R-ACCOUNT-240, R-ACCOUNT-241, R-CONCURRENCY-230, R-ACCOUNT-305
- **US-MONEYFLOW-003** As a budget member, I want a diagram of the planned flow of money, so that I see the whole plan at a glance.
  Rules: R-ACCOUNT-006, R-ACCOUNT-007, R-ACCOUNT-075, R-ACCOUNT-235
- **US-MONEYFLOW-004** As a budget member, I want to link a planned transfer to a category, so that its transaction is created when it is done, so that savings, third pillar or tax transfers count in the budget without being entered twice.
  Rules: R-ACCOUNT-072, R-ACCOUNT-073, R-ACCOUNT-074, R-ACCOUNT-238, R-CATEGORY-230, R-ACCOUNT-304

## Business rules

### App shell

- **R-APP-001** A signed-in user sees the app shell: the sidebar navigation and the page they opened.
  _active · enforced by test · F-SHELL_
  - Source: code: src/app/routes.tsx
- **R-APP-002** An unknown path shows a "page not found" page.
  _active · enforced by test · F-SHELL_
  - Source: code: src/app/routes.tsx
- **R-APP-003** The app refuses to start without its Supabase settings and names the missing variables.
  _active · enforced by test · F-SHELL_
  - Source: README.md: Setup; code: src/main.tsx
- **R-APP-004** A refused or failed database call is shown as a translated message: each stable error code of the contract has its own text, and anything else a generic one; the raw error is never shown.
  _active · enforced by test · F-BUDGET_
  - Related: D-027, D-047
  - Source: docs/database.md: Error messages; code: src/lib/db-errors.ts
- **R-APP-005** After a write fails, the data it acted on is read again, so a row that changed or disappeared meanwhile is never left on screen.
  _active · enforced by test · F-BUDGET_
  - Related: R-APP-004, D-047
  - Source: code: src/hooks/use-app-mutation.ts
- **R-APP-006** When a dialog closes (cancelled, dismissed or saved), keyboard focus returns to what opened it; for a dialog opened from a row's menu, to that row's menu button, and to the page's heading when that row is gone.
  _active · enforced by test · F-SHELL_
  - Source: owner-request: coordinator, step 2 browser review fixes, 2026-11-16; code: src/components/dialog-focus-context.ts
- **R-APP-007** A write is sent once: submitting the same form again (or clicking again) while its write is in flight sends nothing more, however fast it happens.
  _active · enforced by test · F-SHELL_
  - Related: D-047
  - Source: owner-request: coordinator, step 2 browser review fixes, 2026-11-16; code: src/hooks/use-app-mutation.ts
- **R-APP-170** No read returns more rows than the API delivers in one response (1000) without paging: a list that can grow beyond it is read a page at a time (periods, transactions, a debt's history); the kinds read one row each (categories, subscriptions, debts) are bounded at 900 rows per budget, void ones included; the spending per category returns one row per category line; and the reopen preview lists at most 1000 rows, the last one counting the rest.
  _active · enforced by test · F-PLATFORM_
  - Related: D-264, R-TRANSACTION-095, R-DEBT-135, R-COMPARE-070
  - Source: owner-request: coordinator finding on the step 5 database (API row limit), 2026-11-16; code: supabase/migrations/20261117100000_subscriptions_debts.sql; code: supabase/migrations/20261118100000_period_comparison.sql
- **R-APP-250** A call that creates a record (a transaction, an income, a category, a subscription, a debt, an account, a planned transfer) accepts a client-generated request id: sent again by the same member for the same budget, call and arguments, it creates nothing and answers what the first call created; any other use of a known id is refused (request_reused) and reveals nothing.
  _active · enforced by test · F-PLATFORM_
  - Related: D-390, Q-090
  - Source: owner-request: coordinator, screen review of steps 4 and 5, 2026-11-16; code: supabase/migrations
- **R-APP-280** A save that has nothing to send (every field as recorded) keeps the window open and says so; it never closes with a success message.
  _active · enforced by test · F-PLATFORM_
  - Related: R-VERSION-140
  - Source: owner-request: coordinator, independent review of the step 4 and step 5 screens at a24615e, 2026-11-16; code: src/components/nothing-to-save.tsx
- **R-APP-281** No call waits without end: a call unanswered after 30 seconds fails like a lost connection (a read shows an error with a retry, a write says what a lost answer means for it).
  _active · enforced by review · F-PLATFORM_
  - Related: D-401
  - Source: owner-request: coordinator, independent review of the step 4 and step 5 screens at a24615e, 2026-11-16; code: src/lib/supabase.ts
- **R-APP-282** Every count in a message is grouped like amounts (12'345), in both languages, by the one helper that formats counts; the plural is chosen from the number.
  _active · enforced by test · F-PLATFORM_
  - Related: C-MONEY-003, D-402
  - Source: owner-request: coordinator, independent review of the step 4 and step 5 screens at a24615e, 2026-11-16; code: src/lib/i18n.ts
- **R-APP-340** A call with a client request id checks membership before the id, the catch-up gate and the budget lock: a signed-in outsider or a removed member gets budget_not_found for every budget and client id; a replay answers a current member only rows of the budget it names, and nothing for a record removed since.
  _active · enforced by test · F-PLATFORM_
  - Related: D-461, R-APP-250
  - Source: owner-request: coordinator brief for the step 6 database fix round 2 (re-review at 747686c), 2026-11-16; code: supabase/migrations/20261121100000_client_requests.sql

### Accounts and sign-in

- **R-AUTH-001** A signed-out visitor who opens an app page is sent to sign-in, and back to the page they asked for once signed in.
  _active · enforced by test · F-AUTH_
  - Source: code: src/app/route-guards.tsx
- **R-AUTH-002** A signed-in user who opens the sign-in or sign-up page is sent on into the app.
  _active · enforced by test · F-AUTH_
  - Source: code: src/app/route-guards.tsx
- **R-AUTH-003** The page to return to after sign-in is always an in-app path, never an auth page and never another site.
  _active · enforced by test · F-AUTH_
  - Source: code: src/app/paths.ts
- **R-AUTH-004** Sign-up asks for a display name, an email address and a password, and stores the display name with the new account.
  _active · enforced by test · F-AUTH_
  - Source: code: src/features/auth/pages/sign-up-page.tsx
- **R-AUTH-005** A new password has at least 8 characters.
  _active · enforced by test · F-AUTH_
  - Source: code: src/features/auth/schemas.ts
- **R-AUTH-006** A display name is required and has at most 80 characters.
  _active · enforced by test · F-AUTH_
  - Source: code: src/features/auth/schemas.ts
- **R-AUTH-007** When the account needs email confirmation, sign-up tells the user to check their inbox instead of signing them in.
  _active · enforced by test · F-AUTH_
  - Source: code: src/features/auth/pages/sign-up-page.tsx
- **R-AUTH-008** When sign-up returns a session, the user goes straight into the app.
  _active · enforced by test · F-AUTH_
  - Source: code: src/features/auth/pages/sign-up-page.tsx
- **R-AUTH-009** Sign-in validates the email and password fields before calling Supabase.
  _active · enforced by test · F-AUTH_
  - Source: code: src/features/auth/pages/sign-in-page.tsx
- **R-AUTH-010** The email address is submitted trimmed.
  _active · enforced by test · F-AUTH_
  - Source: code: src/features/auth/schemas.ts
- **R-AUTH-011** An error from Supabase Auth is shown as a translated message, never as the raw error.
  _active · enforced by test · F-AUTH_
  - Source: code: src/features/auth/auth-errors.ts
- **R-AUTH-012** A confirmation (non-recovery) email link signs the user straight in.
  _active · enforced by test · F-AUTH_
  - Source: code: src/features/auth/auth-bootstrap.ts
- **R-AUTH-013** Email-link tokens are removed from the address bar and from browser history: the token-bearing history entry is replaced, not followed by a new one.
  _active · enforced by test · F-AUTH_
  - Related: D-013
  - Source: code: src/features/auth/auth-redirect.ts
- **R-AUTH-014** An expired, used or invalid email link is explained, with a way to request a new confirmation email or a new password-reset link.
  _active · enforced by test · F-AUTH_
  - Source: code: src/features/auth/components/link-error-alert.tsx
- **R-AUTH-015** When sign-in fails because the email is not confirmed, the app offers to resend the confirmation email, with the address filled in.
  _active · enforced by test · F-AUTH_
  - Source: code: src/features/auth/pages/sign-in-page.tsx
- **R-AUTH-016** The new-password form shows only while recovery mode is active for the signed-in session (invariant A).
  _active · enforced by test · F-AUTH_
  - Related: D-014
  - Source: code: src/features/auth/recovery.ts; code: src/features/auth/auth-invariants.test.tsx
- **R-AUTH-017** The new-password form names the account whose password it changes (invariant A).
  _active · enforced by test · F-AUTH_
  - Source: code: src/features/auth/auth-invariants.test.tsx
- **R-AUTH-018** In recovery mode every app page leads to the new-password form, wherever the link landed, until the password is saved or the user signs out (invariant A).
  _active · enforced by test · F-AUTH_
  - Source: code: src/app/route-guards.tsx
- **R-AUTH-019** The outcome of an email link that just landed is never discarded because another session exists (invariant B).
  _active · enforced by test · F-AUTH_
  - Source: code: src/features/auth/auth-bootstrap.ts
- **R-AUTH-020** An email link never falls through to the new-password form for a different account (invariant B).
  _active · enforced by test · F-AUTH_
  - Source: code: src/features/auth/auth-bootstrap.ts
- **R-AUTH-021** Parked link tokens and the recovery flag belong to one user and one attempt: they are dropped on a definite answer, on sign-out, when the user dismisses the notice, and when another sign-in takes over (invariant C).
  _active · enforced by test · F-AUTH_
  - Related: D-015
  - Source: code: src/features/auth/auth-redirect.ts; code: src/features/auth/auth-provider.tsx
- **R-AUTH-022** When an email link cannot be checked for a transient reason, it is kept for this tab only, never in a URL, and reloading the tab retries it.
  _active · enforced by test · F-AUTH_
  - Related: D-015
  - Source: code: src/features/auth/auth-redirect.ts
- **R-AUTH-023** Signing in with a password ends recovery mode (invariant D).
  _active · enforced by test · F-AUTH_
  - Source: code: src/features/auth/recovery.ts
- **R-AUTH-024** Every state of the reset-password page has one consistent message and one way on (invariant E).
  _active · enforced by test · F-AUTH_
  - Source: code: src/features/auth/pages/reset-password-page.tsx
- **R-AUTH-025** One user's cached data is never shown to another: the query cache is cleared when the signed-in user changes or signs out, and kept across a token refresh of the same user.
  _active · enforced by test · F-AUTH_
  - Related: D-017
  - Source: code: src/features/auth/auth-provider.tsx
- **R-AUTH-026** When a valid email link for one account is opened while another account is signed in, the app says that the browser is now signed in as the link's account, and that the other account was signed out here.
  _active · enforced by test · F-AUTH_
  - Source: code: src/features/auth/auth-bootstrap.ts; code: src/features/auth/components/account-switched-alert.tsx
- **R-AUTH-027** The new-password form is emptied whenever the signed-in user changes, so text typed for one account is never saved as another account's password.
  _active · enforced by test · F-AUTH_
  - Related: R-AUTH-017
  - Source: code: src/features/auth/pages/reset-password-page.tsx

### Profiles

- **R-PROFILE-001** Every user has a profile, created when they sign up.
  _active · enforced by test · F-PROFILE_
  - Source: code: supabase/migrations/20261115151317_create_profiles.sql
- **R-PROFILE-002** A user can change only their own display name, and no other column of their profile.
  _active · enforced by test · F-PROFILE_
  - Source: code: supabase/migrations/20261115151317_create_profiles.sql
- **R-PROFILE-003** A user can read their own profile and the profiles of people who share a budget with them now, and no others.
  _active · enforced by test · F-MEMBERS_
  - Related: D-088
  - Source: docs/database.md: Reading
- **R-PROFILE-004** A former member's income keeps its owner's display name; members who never shared the budget with them cannot read their profile or email.
  _active · enforced by test · F-PROFILE_
  - Related: D-074, D-088
  - Source: owner-request: coordinator decisions on the step 2 database review, 2026-11-15; docs/database.md: RPCs
- **R-PROFILE-005** A profile's email is the account's email and follows it when it changes; the user cannot change it on the profile.
  _active · enforced by test · F-PROFILE_
  - Related: D-074
  - Source: owner-request: coordinator decisions on the step 2 database review, 2026-11-15; docs/database.md: RPCs

### Security

- **R-SECURITY-001** All access control is row-level security in Postgres.
  _active · enforced by test · F-PLATFORM_
  - Why: The browser talks to Supabase directly, so RLS is the only line of defence.
  - Related: D-003
  - Source: domain: Security
- **R-SECURITY-002** A user sees and changes only the data of budgets they are a member of.
  _active · enforced by test · F-BUDGET_
  - Source: domain: Security
- **R-SECURITY-003** An anonymous visitor can read or change no budget data.
  _active · enforced by test · F-BUDGET_
  - Source: docs/database.md: Conventions; CLAUDE.md: Rules
- **R-SECURITY-004** A request for a budget, income, period or invitation the caller cannot see is answered as "not found", never as "forbidden".
  _active · enforced by test · F-BUDGET_
  - Related: D-028
  - Source: docs/database.md: Conventions
- **R-SECURITY-005** Claude does not get raw database access to real data.
  _active · enforced by review · F-PLATFORM_
  - Source: domain: Import (including by a Claude session)
- **R-SECURITY-006** Reading a budget's current period never waits for other members' writes.
  _active · enforced by test · F-PERIOD_
  - Related: D-069
  - Source: owner-request: coordinator decisions on the step 2 database review, 2026-11-15; docs/database.md: RPCs
- **R-SECURITY-007** Operations that race each other answer with a contract error, never a raw database error.
  _active · enforced by test · F-INCOME_
  - Related: D-069
  - Source: owner-request: coordinator decisions on the step 2 database review, 2026-11-15; docs/database.md: RPCs
- **R-SECURITY-200** A visitor without a session can call only the token import; every other import function and every import table refuses them.
  _active · enforced by test · F-IMPORT_
  - Related: D-316, R-SECURITY-003
  - Source: owner-request: coordinator brief for the step 6 database (import), 2026-11-16; code: supabase/migrations/20261119100000_import.sql
- **R-SECURITY-250** Every name and description goes through one cleaner: control, bidirectional and zero-width characters are removed (a joiner between two visible characters stays, R-SECURITY-341), other white space becomes one space, and the result is trimmed; markup and formulas stay text (the screens escape, an export neutralises).
  _active · enforced by test · F-IMPORT_
  - Related: D-376
  - Source: owner-request: coordinator review of the step 6 database (import), 2026-11-16; code: supabase/migrations/20261119100000_import.sql
- **R-SECURITY-251** A token's answer never depends on the budget's content beyond coarse states (room for fewer than 250 transactions, D-451; far behind; the import storage of the day used up, D-452; its budget's lock held for more than a second, D-453): every argument is checked before anything of the budget, and a token cannot name the "to categorise" category.
  _active · enforced by test · F-IMPORT_
  - Related: D-371, R-IMPORT-076
  - Source: owner-request: coordinator review of the step 6 database (import), 2026-11-16; code: supabase/migrations/20261119100000_import.sql
- **R-SECURITY-252** Every call with a valid token that does work counts toward its limits, whatever its outcome (cancelled included); a busy answer (token_busy, imports_busy) does no work and does not count; the check and the count are one step under the token's own lock, over windows of whole minutes (R-SECURITY-342).
  _active · enforced by test · F-IMPORT_
  - Related: D-370
  - Source: owner-request: coordinator review of the step 6 database (import), 2026-11-16; code: supabase/migrations/20261119100000_import.sql
- **R-SECURITY-253** A token stops when its creator leaves the budget, is removed from it, or deletes their account.
  _active · enforced by test · F-IMPORT_
  - Related: D-370, R-IMPORT-205
  - Source: owner-request: coordinator review of the step 6 database (import), 2026-11-16; code: supabase/migrations/20261119100000_import.sql
- **R-SECURITY-254** A token import records the token, never the caller, and cannot be called by GET (read-only calls are refused before the token is looked at).
  _active · enforced by test · F-IMPORT_
  - Related: D-370
  - Source: owner-request: coordinator review of the step 6 database (import), 2026-11-16; code: supabase/migrations/20261119100000_import.sql
- **R-SECURITY-340** A token call never waits for another token call: the same token busy answers token_busy, every slot for token work taken answers imports_busy, both at once, doing no work and counting nothing; a working call takes at most 250 rows, waits at most a second for its budget (budget_busy), and counts even when cancelled (call_cancelled).
  _active · enforced by test · F-IMPORT_
  - Related: D-453, R-SECURITY-252
  - Source: owner-request: coordinator brief for the step 6 database fix round 2 (re-review at 747686c), 2026-11-16; code: supabase/migrations/20261119100000_import.sql
- **R-SECURITY-341** The cleaner keeps a zero-width joiner or non-joiner between two characters that are not white space and removes it elsewhere; it removes interlinear annotation marks and the language tag; a text with nothing visible left is empty.
  _active · enforced by test · F-IMPORT_
  - Related: D-454, R-SECURITY-250
  - Source: owner-request: coordinator brief for the step 6 database fix round 2 (re-review at 747686c), 2026-11-16; code: supabase/migrations/20261119100000_import.sql
- **R-SECURITY-342** A token call counts toward the hour for at least 60 and at most 61 minutes and toward the day for at least 24 hours and at most 24 hours and 1 minute.
  _active · enforced by test · F-IMPORT_
  - Related: D-463, R-SECURITY-252
  - Source: owner-request: coordinator brief for the step 6 database fix round 2 (re-review at 747686c), 2026-11-16; code: supabase/migrations/20261119100000_import.sql
- **R-SECURITY-343** A token adds chunks only to a batch it created; any other existing batch id answers import_batch_conflict, a chunk already recorded included.
  _active · enforced by test · F-IMPORT_
  - Related: D-464
  - Source: owner-request: coordinator brief for the step 6 database fix round 2 (re-review at 747686c), 2026-11-16; code: supabase/migrations/20261119100000_import.sql
- **R-SECURITY-344** The token call checks its batch id, chunk and statement dates itself: a malformed one answers invalid_batch, invalid_chunk or invalid_date, never a raw cast error.
  _active · enforced by test · F-IMPORT_
  - Related: D-465
  - Source: owner-request: coordinator brief for the step 6 database fix round 2 (re-review at 747686c), 2026-11-16; code: supabase/migrations/20261119100000_import.sql
- **R-SECURITY-345** A token call is refused with transaction_limit_reached whenever the budget has room for fewer than 250 transactions, whatever rows it sends; a member is told how many rows would fit.
  _active · enforced by test · F-IMPORT_
  - Related: D-451, R-SECURITY-251
  - Source: owner-request: coordinator brief for the step 6 database fix round 2 (re-review at 747686c), 2026-11-16; code: supabase/migrations/20261119100000_import.sql

### Money

- **R-MONEY-001** CHF is the only currency.
  _active · enforced by review · F-SHELL_
  - Why: Nothing in the data model carries a currency, so a test cannot prove the absence of a second one.
  - Source: domain: Money
- **R-MONEY-002** Money amounts are stored as integer rappen (centimes), never as floats.
  _active · enforced by test · F-INCOME_
  - Related: C-MONEY-002
  - Source: domain: Money
- **R-MONEY-003** Money is displayed with Swiss formatting.
  _active · enforced by test · F-SHELL_
  - Related: D-009
  - Source: domain: Money

### Dates

- **R-DATE-001** Dates are displayed as dd.mm.yyyy.
  _active · enforced by test · F-SHELL_
  - Source: domain: Money

### Languages

- **R-I18N-001** The UI is available in English and in French.
  _active · enforced by test · F-SHELL_
  - Source: domain: Product in one paragraph
- **R-I18N-002** The UI language the user chooses is remembered in the browser and set as the page language.
  _active · enforced by test · F-SHELL_
  - Source: code: src/lib/i18n.ts

### Budgets

- **R-BUDGET-001** Everything else (incomes, categories, subscriptions, debts, transactions, periods, accounts) belongs to exactly one budget.
  _active · enforced by test · F-BUDGET_
  - Source: domain: Budget
- **R-BUDGET-002** The creator of a budget is its owner.
  _active · enforced by test · F-BUDGET_
  - Source: domain: Budget
- **R-BUDGET-003** The owner is a member of the budget, assigned by default when it is created.
  _active · enforced by test · F-BUDGET_
  - Source: domain: Budget
- **R-BUDGET-004** A user can belong to several budgets.
  _active · enforced by test · F-BUDGET_
  - Source: domain: Budget
- **R-BUDGET-005** A budget runs indefinitely or until an end date.
  _active · enforced by test · F-BUDGET_
  - Source: domain: Budget
- **R-BUDGET-006** A budget is always a monthly budget.
  _active · enforced by review · F-BUDGET_
  - Source: domain: Budget
- **R-BUDGET-007** An end date only stops period generation.
  _active · enforced by test · F-BUDGET_
  - Source: domain: Budget
- **R-BUDGET-008** A budget's end is the end date the owner entered: no period starts after it, and the period containing it is the last one and ends at its normal end, which is the end shown.
  _active · enforced by test · F-BUDGET_
  - Related: D-032, D-067, D-086
  - Source: domain: Budget
- **R-BUDGET-009** Budgets can be created, modified and deleted.
  _active · enforced by test · F-BUDGET_
  - Source: domain: Budget
- **R-BUDGET-010** Creating a budget is one atomic step that also creates its first income, as the primary income, and its first period.
  _active · enforced by test · F-BUDGET_
  - Source: domain: Budget
- **R-BUDGET-011** A budget never exists without an income and a period.
  _active · enforced by test · F-BUDGET_
  - Source: domain: Budget
- **R-BUDGET-012** A user can own at most 20 budgets.
  _active · enforced by test · F-BUDGET_
  - Related: D-029
  - Source: docs/database.md: RPCs
- **R-BUDGET-013** An end date can be set at most ten years ahead.
  _active · enforced by test · F-BUDGET_
  - Related: D-029
  - Source: docs/database.md: RPCs
- **R-BUDGET-050** A signed-in user who belongs to no budget is shown the first-run setup (create a budget, or accept an invitation addressed to them) instead of the app pages.
  _active · enforced by test · F-BUDGET_
  - Related: D-046
  - Source: code: src/features/budgets/budget-routes.tsx
- **R-BUDGET-051** The budget a user works in is remembered for that user in this browser, also when it was chosen for them as a fallback, so a rename elsewhere never moves them to another budget; when it is no longer one of theirs (deleted, left, or they were removed), the app moves to another of their budgets, or to the first-run setup when none is left.
  _active · enforced by test · F-BUDGET_
  - Related: D-046, C-QUERY-001
  - Source: code: src/features/budgets/current-budget-provider.tsx
- **R-BUDGET-052** Deleting a budget asks the owner to type the budget's name first.
  _active · enforced by test · F-BUDGET_
  - Source: code: src/features/settings/budget-settings.tsx
- **R-BUDGET-014** The end shown for a budget follows later changes of the terms by itself; the last period is never a stub.
  _active · enforced by test · F-BUDGET_
  - Related: D-067, D-086
  - Source: owner-request: coordinator decisions on the step 2 database review, 2026-11-15; docs/database.md: RPCs
- **R-BUDGET-015** The end of the last period of a budget with an end date can be set by hand in one call, like the current period's end, and the end shown follows it.
  _active · enforced by test · F-BUDGET_
  - Related: D-067, D-086
  - Source: owner-request: coordinator decisions on the step 2 database review, 2026-11-15; docs/database.md: RPCs
- **R-BUDGET-016** Deleting the owner's account deletes their budgets, for every member.
  _active · enforced by test · F-BUDGET_
  - Why: Current behaviour, recorded so it is not changed by accident; open question Q-030.
  - Related: Q-030
  - Source: owner-request: coordinator decisions on the step 2 database review, 2026-11-15; docs/database.md: RPCs
- **R-BUDGET-017** A budget can be created with its end date in the same atomic step.
  _active · enforced by test · F-BUDGET_
  - Related: D-071, Q-017
  - Source: owner-request: coordinator decisions on the step 2 database review, 2026-11-15; docs/database.md: RPCs
- **R-BUDGET-018** Deleting a budget or cancelling an invitation that does not happen says why: not found (or already gone), or not the owner.
  _active · enforced by test · F-BUDGET_
  - Related: D-072
  - Source: owner-request: coordinator decisions on the step 2 database review, 2026-11-15; docs/database.md: RPCs
- **R-BUDGET-053** A page and everything open on it (dialogs, forms) belong to the budget they were opened for: when the current budget changes, they are discarded, so nothing typed for one budget is saved into another.
  _active · enforced by test · F-BUDGET_
  - Related: R-BUDGET-051, C-QUERY-001
  - Source: code: src/components/layout/app-layout.tsx
- **R-BUDGET-054** The budget settings show the end date the owner entered and the last day that results from it, and say that the last period is the one containing that date.
  _active · enforced by test · F-BUDGET_
  - Related: D-086, R-BUDGET-008
  - Source: code: src/features/settings/budget-settings.tsx
- **R-BUDGET-055** When the budget a user is working in stops being theirs while they use it (deleted by the owner, or they were removed), the app says so by name, names the budget it moved to (or the first-run setup), and says that anything typed there and not saved was discarded, until dismissed; not when they deleted or left it themselves.
  _active · enforced by test · F-BUDGET_
  - Related: R-BUDGET-051, R-BUDGET-053
  - Source: owner-request: coordinator, step 2 browser review fixes, 2026-11-16; code: src/features/budgets/current-budget-provider.tsx
- **R-BUDGET-130** Once a budget has ended, its subscriptions and debts can still be corrected from an earlier period, their charges answered, payments recorded within its periods and balances adjusted (dated on its last day by default); changes from the current period, which no longer exists, are refused.
  _active · enforced by test · F-SUBSCRIPTION_
  - Related: R-BUDGET-008, D-206
  - Source: owner-request: coordinator addendum to the step 4 database review (screens asks), 2026-11-16; code: supabase/migrations/20261117100000_subscriptions_debts.sql
- **R-BUDGET-150** Once the budget has ended, the subscriptions and debts screens still offer adding, editing and ending, each as a correction from one of its periods (the correction choice ticked and fixed, saying why), recording payments and adjusting balances within its periods (an adjustment left on its default date sent without one, so the database dates it on the budget's last day), and answering charges; nothing from the current period is offered.
  _active · enforced by test · F-SUBSCRIPTION_
  - Related: R-BUDGET-130, D-206
  - Source: owner-request: coordinator, step 4 screens review round 2, 2026-11-16; code: src/components/form/correction-toggle.tsx; code: src/features/subscriptions/components/subscription-form-dialog.tsx; code: src/features/debts/components/debt-form-dialog.tsx
- **R-BUDGET-280** The app takes a budget for ended only from the budget's own end: it has an end date, it is caught up, and the database then gives no current period. A missing current period alone (a catch-up under way) never makes a page say the budget has ended, and never turns an edit into a correction: an open form keeps its state.
  _active · enforced by test · F-SUBSCRIPTION_
  - Related: R-BUDGET-150, R-PERIOD-190, D-400, Q-251
  - Source: owner-request: coordinator, independent review of the step 4 and step 5 screens at a24615e, 2026-11-16; code: src/features/budgets/budget-ended.ts

### Members and roles

- **R-MEMBER-001** Every member can read and edit everything in the budget.
  _active · enforced by test · F-MEMBERS_
  - Source: domain: Budget
- **R-MEMBER-002** Only the owner can delete the budget.
  _active · enforced by test · F-MEMBERS_
  - Related: R-BUDGET-018
  - Source: domain: Budget
- **R-MEMBER-003** Only the owner can change the budget's end date.
  _active · enforced by test · F-MEMBERS_
  - Source: domain: Budget
- **R-MEMBER-004** Only the owner can manage members and invitations.
  _active · enforced by test · F-MEMBERS_
  - Source: domain: Budget
- **R-MEMBER-005** A member can leave a budget.
  _active · enforced by test · F-MEMBERS_
  - Source: domain: Budget
- **R-MEMBER-006** The owner cannot leave the budget; they delete it instead.
  _active · enforced by test · F-MEMBERS_
  - Source: domain: Budget
- **R-MEMBER-007** Removing a member, or a member leaving, ends their incomes from the current period.
  _active · enforced by test · F-MEMBERS_
  - Related: D-030
  - Source: domain: Budget
- **R-MEMBER-008** Past periods keep the incomes of a member who was removed or left.
  _active · enforced by test · F-MEMBERS_
  - Source: domain: Budget
- **R-MEMBER-009** A member whose income is the primary income cannot be removed until another income is made primary.
  _active · enforced by test · F-MEMBERS_
  - Related: D-031
  - Source: domain: Budget
- **R-MEMBER-010** A budget has at most 20 members.
  _active · enforced by test · F-MEMBERS_
  - Related: D-029
  - Source: docs/database.md: RPCs
- **R-MEMBER-050** The app offers owner-only actions (change the end date, delete the budget, invite, cancel an invitation, remove a member) only to the owner; a plain member is told that only the owner can do them. The database still enforces this on its own.
  _active · enforced by test · F-MEMBERS_
  - Related: R-MEMBER-002, R-MEMBER-003, R-MEMBER-004
  - Source: code: src/features/settings/budget-settings.tsx; code: src/features/settings/members-settings.tsx
- **R-MEMBER-011** A member removed (or leaving) after the budget ended has their incomes end from the first period created if the budget resumes.
  _active · enforced by test · F-MEMBERS_
  - Related: D-090
  - Source: owner-request: coordinator decision on the third step 2 database review, 2026-11-16; docs/database.md: RPCs
- **R-MEMBER-250** A user belongs to at most 50 budgets (owned ones included): accepting an invitation or creating a budget beyond that is refused (membership_limit_reached); the invitations shown to an invitee come a page at a time.
  _active · enforced by test · F-MEMBERS_
  - Related: D-385, R-APP-170
  - Source: owner-request: coordinator review of the step 5 database and the step 4 re-review fixes, 2026-11-16; code: supabase/migrations

### Invitations

- **R-INVITE-001** The owner adds people to a budget by inviting an email address.
  _active · enforced by test · F-MEMBERS_
  - Source: domain: Budget
- **R-INVITE-002** The app sends no email for an invitation.
  _active · enforced by review · F-MEMBERS_
  - Source: domain: Budget
- **R-INVITE-003** The invited person sees the invitation after signing in with an account whose verified email matches the invited address, and not otherwise.
  _active · enforced by test · F-MEMBERS_
  - Source: domain: Budget
- **R-INVITE-004** The invited person accepts or declines an unexpired invitation.
  _active · enforced by test · F-MEMBERS_
  - Related: R-INVITE-007
  - Source: domain: Budget
- **R-INVITE-005** Inviting never reveals whether an address has an account.
  _active · enforced by test · F-MEMBERS_
  - Source: domain: Budget
- **R-INVITE-006** A budget has at most 20 pending invitations.
  _active · enforced by test · F-MEMBERS_
  - Related: D-029
  - Source: docs/database.md: RPCs
- **R-INVITE-007** An invitation expires 30 days after it was last sent; an expired invitation is not shown and cannot be accepted or declined.
  _active · enforced by test · F-MEMBERS_
  - Related: D-068
  - Source: owner-request: coordinator decisions on the step 2 database review, 2026-11-15; docs/database.md: RPCs
- **R-INVITE-008** The invited person sees who invited them by name and email.
  _active · enforced by test · F-MEMBERS_
  - Related: D-068
  - Source: owner-request: coordinator decisions on the step 2 database review, 2026-11-15; docs/database.md: RPCs
- **R-INVITE-009** Inviting the same address again returns the same invitation and renews it.
  _active · enforced by test · F-MEMBERS_
  - Related: D-033, D-068
  - Source: owner-request: coordinator decisions on the step 2 database review, 2026-11-15; docs/database.md: RPCs
- **R-INVITE-010** A cancelled or expired invitation can never be accepted, even by an accept that races the cancel.
  _active · enforced by test · F-MEMBERS_
  - Related: D-069
  - Source: owner-request: coordinator decisions on the step 2 database review, 2026-11-15; docs/database.md: RPCs
- **R-INVITE-011** Accepting, declining, cancelling and re-sending an invitation never deadlock with each other.
  _active · enforced by test · F-MEMBERS_
  - Related: D-087
  - Source: owner-request: coordinator decision on the second step 2 database review, 2026-11-16; docs/database.md: RPCs

### Incomes

- **R-INCOME-001** A budget has at least one income.
  _active · enforced by test · F-INCOME_
  - Source: domain: Income
- **R-INCOME-002** Any member can add, edit and remove any income of the budget, including one that belongs to another member; a new income belongs to the member who adds it unless they choose another member.
  _active · enforced by test · F-INCOME_
  - Related: D-045, Q-001, R-INCOME-050
  - Source: owner-request: product owner decision on Q-001, 2026-11-15; code: src/features/income/components/income-form-dialog.tsx
- **R-INCOME-003** All incomes of the budget sum into the budget's monthly total.
  _active · enforced by test · F-INCOME_
  - Source: domain: Income
- **R-INCOME-004** An income has an amount and a nominal pay day of the month.
  _active · enforced by test · F-INCOME_
  - Source: domain: Income
- **R-INCOME-005** Each income has its own weekend rule; the default is `nearest`.
  _active · enforced by test · F-INCOME_
  - Source: domain: Income
- **R-INCOME-006** Exactly one income of the budget is the primary income.
  _active · enforced by test · F-INCOME_
  - Source: domain: Income
- **R-INCOME-007** The primary income defines the periods.
  _active · enforced by test · F-INCOME_
  - Source: domain: Income
- **R-INCOME-008** The primary income can be switched to another income.
  _active · enforced by test · F-INCOME_
  - Source: domain: Income
- **R-INCOME-009** The last income of a budget cannot be removed.
  _active · enforced by test · F-INCOME_
  - Source: domain: Income
- **R-INCOME-010** Incomes are monthly.
  _active · enforced by review · F-INCOME_
  - Related: D-038
  - Source: domain: Income
- **R-INCOME-011** Each income in force counts once per period, whatever its own pay day.
  _active · enforced by test · F-INCOME_
  - Source: domain: Income
- **R-INCOME-012** Removing an income that has already counted in a past period ends it from the current period instead of deleting it (unless the removal is an explicit correction from an earlier period, R-INCOME-015).
  _active · enforced by test · F-INCOME_
  - Related: D-030, R-INCOME-015
  - Source: domain: Income
- **R-INCOME-013** A budget has at most 50 incomes in force; ended incomes do not count.
  _active · enforced by test · F-INCOME_
  - Related: D-029, D-066
  - Source: docs/database.md: RPCs
- **R-INCOME-014** An income amount is from 1 rappen to CHF 10 million (1 000 000 000 rappen).
  _active · enforced by test · F-INCOME_
  - Related: D-029
  - Source: docs/database.md: Conventions
- **R-INCOME-050** The database lets any member of a budget add an income for another member and change or remove another member's income.
  _active · enforced by test · F-INCOME_
  - Related: D-045, R-INCOME-002
  - Source: owner-request: product owner decision on Q-001, 2026-11-15; docs/database.md: RPCs
- **R-INCOME-015** An income can be removed from an earlier period as an explicit correction; removed from the period it started in, it is deleted.
  _active · enforced by test · F-INCOME_
  - Related: D-065
  - Source: owner-request: coordinator decisions on the step 2 database review, 2026-11-15; docs/database.md: RPCs
- **R-INCOME-016** A budget holds at most 500 incomes in all, ended ones included.
  _active · enforced by test · F-INCOME_
  - Related: D-066
  - Source: owner-request: coordinator decisions on the step 2 database review, 2026-11-15; docs/database.md: RPCs
- **R-INCOME-051** Changing or removing an income from an earlier period is offered only as an explicit option, off by default, with a warning that past periods' totals change; a changed term is said to apply from the chosen period until the next change already recorded.
  _active · enforced by test · F-INCOME_
  - Related: R-VERSION-010, R-VERSION-012, R-INCOME-015, D-084
  - Source: code: src/features/income/components/income-form-dialog.tsx; code: src/features/income/components/remove-income-dialog.tsx
- **R-INCOME-052** Before new terms of the primary income are saved, the form says what they do to the current period: that it closes at once (the next month's pay date under the new terms has already come), the day it now ends, or, when its end was set by hand, the 14-day rule that decides; Save waits until this is known, and the form says so when it cannot be checked.
  _retired · enforced by test · F-INCOME_
  - Retired: A change of terms can no longer close or move a period (R-PERIOD-029); the form instead reports the next pay date the database then expects (R-INCOME-054).
  - Related: R-PERIOD-026, R-VERSION-008, R-PERIOD-029, R-INCOME-054
  - Source: code: src/features/income/components/income-form-dialog.tsx
- **R-INCOME-053** Making another income primary is confirmed first, with what it does to the current period (it may close at once) and how to undo that.
  _retired · enforced by test · F-INCOME_
  - Retired: Switching the primary income can no longer close or move a period (R-PERIOD-029), so it needs no confirmation; the app reports the next pay date the database then expects (R-INCOME-054).
  - Related: R-INCOME-052, R-INCOME-008, R-PERIOD-026, R-PERIOD-029, R-INCOME-054
  - Source: code: src/features/income/components/make-primary-dialog.tsx
- **R-INCOME-017** Only an income in force in the current period can become the primary income.
  _active · enforced by test · F-INCOME_
  - Related: R-INCOME-008
  - Source: owner-request: coordinator decision on the second step 2 database review, 2026-11-16; docs/database.md: RPCs
- **R-INCOME-054** After the primary income's terms change or another income becomes primary, the app says when the next salary is now expected, as read back from the database.
  _active · enforced by test · F-INCOME_
  - Related: R-PERIOD-029, R-PERIOD-030
  - Source: code: src/features/income/income-mutations.ts
- **R-INCOME-055** Before new pay terms of the primary income are saved, and before another income is made primary, the app shows the expected next pay date that would result, from the database's preview, and Save waits for it; an end set by hand is said to stay as set. The previewed end goes back with the save, which is refused if the period would now end on another day.
  _active · enforced by test · F-INCOME_
  - Related: R-PERIOD-036, R-INCOME-054, R-PERIOD-014
  - Source: code: src/features/income/pay-date-preview.ts; code: src/features/income/components/pay-date-preview-notice.tsx; owner-request: coordinator, frontend adaptation to the step 3 database review fixes, 2026-11-16
- **R-INCOME-056** Every place that announces the primary income's next salary (the dashboard, the income card, the periods page, the message after saving, the previews before saving) gives the same date, the day after the current period ends (projected or set by hand), never the schedule's next pay date; in the budget's last period it announces the budget's end instead, and an ended budget announces none. Another income's card shows its own next pay date only while the budget runs and not after its end.
  _active · enforced by test · F-INCOME_
  - Related: D-135, R-PERIOD-010, R-INCOME-054, R-INCOME-055, R-BUDGET-008
  - Source: owner-request: coordinator, step 2 browser review fixes, 2026-11-16; code: src/features/periods/next-salary.ts
- **R-INCOME-100** An income's name and terms are edited in one call, which returns the new revision; terms not given keep their value.
  _active · enforced by test · F-INCOME_
  - Related: D-150, R-CONCURRENCY-090
  - Source: owner-request: coordinator, step 3 database review, 2026-11-16; code: supabase/migrations/20261116120000_categories_transactions_progress.sql
- **R-INCOME-150** An edit of the primary income that may move the current period's end (a new pay day or weekend rule, any correction) shows the preview's end first and always sends it (p_previewed_end_date); when the database still answers preview_required, the form shows the preview and asks to save again.
  _active · enforced by test · F-SUBSCRIPTION_
  - Related: R-PERIOD-134, D-205
  - Source: owner-request: coordinator, step 4 screens review round 2, 2026-11-16; code: src/features/income/components/income-form-dialog.tsx

### Pay dates and the weekend rule

- **R-PAYDATE-001** With the weekend rule `nearest`, a pay day that falls on a Saturday is paid the Friday before.
  _active · enforced by test · F-INCOME_
  - Source: domain: Income
- **R-PAYDATE-002** With the weekend rule `nearest`, a pay day that falls on a Sunday is paid the Monday after.
  _active · enforced by test · F-INCOME_
  - Source: domain: Income
- **R-PAYDATE-003** With the weekend rule `previous`, a pay day that falls on a Saturday or a Sunday is paid the Friday before.
  _active · enforced by test · F-INCOME_
  - Source: domain: Income
- **R-PAYDATE-004** With the weekend rule `next`, a pay day that falls on a Saturday or a Sunday is paid the Monday after.
  _active · enforced by test · F-INCOME_
  - Source: domain: Income
- **R-PAYDATE-005** With the weekend rule `none`, a pay day is paid on its day even on a weekend.
  _active · enforced by test · F-INCOME_
  - Source: domain: Income
- **R-PAYDATE-006** A pay day of 29, 30 or 31 is clamped to the last day of shorter months before the weekend rule is applied.
  _active · enforced by test · F-INCOME_
  - Source: domain: Income
- **R-PAYDATE-007** The weekend rule is one of `nearest`, `previous`, `next` and `none`.
  _active · enforced by test · F-INCOME_
  - Source: domain: Income

### Periods

- **R-PERIOD-001** A period starts on the actual (weekend-adjusted) pay date of the primary income.
  _active · enforced by test · F-PERIOD_
  - Why: Example with a nominal 25th: if 25 January is a Saturday, the period starts Friday 24 January.
  - Source: domain: Period
- **R-PERIOD-002** A period ends the day before the next period starts; by default, the day before the next pay date given by the projection rule (R-PERIOD-030).
  _active · enforced by test · F-PERIOD_
  - Related: D-060, D-081
  - Source: domain: Period
- **R-PERIOD-003** The salary (the primary income) is always day one of its period.
  _active · enforced by test · F-PERIOD_
  - Source: domain: Period
- **R-PERIOD-004** Periods are stored rows with a start and an end date.
  _active · enforced by test · F-PERIOD_
  - Source: domain: Period
- **R-PERIOD-005** The periods of a budget are contiguous.
  _active · enforced by test · F-PERIOD_
  - Source: domain: Period
- **R-PERIOD-006** The periods of a budget never overlap.
  _active · enforced by test · F-PERIOD_
  - Source: domain: Period
- **R-PERIOD-007** Past periods are not recomputed when the income's pay day later changes.
  _active · enforced by test · F-PERIOD_
  - Source: domain: Period
- **R-PERIOD-008** Only periods up to the current one exist as rows.
  _active · enforced by test · F-PERIOD_
  - Source: domain: Period
- **R-PERIOD-009** Periods are created on demand.
  _active · enforced by test · F-PERIOD_
  - Source: domain: Period
- **R-PERIOD-010** The current period's end date is a projection: the day before the next pay date given by the projection rule, unless set by hand.
  _active · enforced by test · F-PERIOD_
  - Related: D-060, D-081
  - Source: domain: Period
- **R-PERIOD-011** When the primary income's terms change or another income becomes primary, the current period's end is re-projected unless it was set by hand, and never to a date before today.
  _active · enforced by test · F-PERIOD_
  - Related: D-080, R-PERIOD-026, R-PERIOD-029
  - Source: domain: Period
- **R-PERIOD-012** The user can move the boundary between two existing periods to a date up to today, to match when a salary really arrived; moving it back undoes it.
  _active · enforced by test · F-PERIOD_
  - Why: Public holidays.
  - Related: D-061, D-082
  - Source: domain: Period; domain: Income
- **R-PERIOD-013** The user can set the date the next salary is expected (after today): the current period, including the final period of a budget with an end date, ends the day before.
  _active · enforced by test · F-PERIOD_
  - Why: Public holidays.
  - Related: D-061, D-082
  - Source: domain: Period
- **R-PERIOD-014** A manual boundary is never overwritten by recomputation.
  _active · enforced by test · F-PERIOD_
  - Source: domain: Period
- **R-PERIOD-015** When creating a budget the user chooses the month to start tracking from; the default is the current period.
  _active · enforced by test · F-PERIOD_
  - Source: domain: Period
- **R-PERIOD-016** The month to start tracking from can be earlier than the current period.
  _active · enforced by test · F-PERIOD_
  - Why: So that past transactions can be entered.
  - Source: domain: Period
- **R-PERIOD-017** "Today" is the calendar date in Europe/Zurich, decided by the database, not by the browser's clock or UTC.
  _active · enforced by test · F-PERIOD_
  - Related: D-026
  - Source: domain: Period
- **R-PERIOD-018** A period's income total is the sum of the incomes in force in that period, each at the version in force for that period, plus the extra incomes dated in it.
  _active · enforced by test · F-PERIOD_
  - Related: R-TRANSACTION-092, D-143
  - Source: domain: Period
- **R-PERIOD-019** A budget can start tracking at most 60 months back.
  _active · enforced by test · F-PERIOD_
  - Related: D-029
  - Source: docs/database.md: RPCs
- **R-PERIOD-020** Every period is 7 to 92 days long; boundary operations that would break this are refused.
  _active · enforced by test · F-PERIOD_
  - Related: D-029, D-061, D-066, D-080, D-085
  - Source: docs/database.md: RPCs
- **R-PERIOD-050** When a budget is opened, the app asks the database to create its missing periods (ensure_periods) and refreshes what depends on them when any were created.
  _active · enforced by test · F-PERIOD_
  - Related: R-PERIOD-009
  - Source: docs/database.md: Reading; code: src/features/budgets/current-budget-provider.tsx
- **R-PERIOD-021** There is one period per calendar month: each period belongs to one month and starts on that month's salary, consecutive periods have consecutive months, and no month has two periods, so a month's salary never counts twice.
  _retired · enforced by test · F-PERIOD_
  - Retired: Periods are no longer tied to calendar months (D-080): a period runs from salary to salary.
  - Related: D-060, D-080
  - Source: owner-request: coordinator decisions on the step 2 database review, 2026-11-15; docs/database.md: RPCs
- **R-PERIOD-022** No period ever starts after today.
  _active · enforced by test · F-PERIOD_
  - Related: D-062
  - Source: owner-request: coordinator decisions on the step 2 database review, 2026-11-15; docs/database.md: RPCs
- **R-PERIOD-023** When the salary that started the latest period has not arrived yet, the latest period is merged into the previous one, which is current again and ends before the expected date (after today) or at its projection.
  _active · enforced by test · F-PERIOD_
  - Related: D-062, D-082, D-089
  - Source: owner-request: coordinator decisions on the step 2 database review, 2026-11-15; docs/database.md: RPCs
- **R-PERIOD-024** A boundary that is not the one before the latest period cannot move to today or later.
  _retired · enforced by review · F-PERIOD_
  - Why: With the 14-day rule (R-PERIOD-020) no such move can be requested; the database still refuses it (boundary_after_today) as a defence.
  - Retired: The boundary operations of D-082 replace the position-dependent move; no operation can move an earlier boundary to after today (R-PERIOD-012, R-PERIOD-022).
  - Related: D-062, D-082
  - Source: owner-request: coordinator decisions on the step 2 database review, 2026-11-15; docs/database.md: RPCs
- **R-PERIOD-025** Every boundary operation has an inverse for the boundary: an expected pay date is reset to the projection, an early close is undone by reopening the previous period (and the reverse), and a moved boundary is moved back. Undoing a reopen restores the boundary only; what was recorded in the merged period stays with the reopened one.
  _active · enforced by test · F-PERIOD_
  - Related: D-063, D-082, D-089
  - Source: owner-request: coordinator decisions on the step 2 database review, 2026-11-15; docs/database.md: RPCs
- **R-PERIOD-026** When the primary income's terms change or another income becomes primary, a manual end of the current period is kept while it lies within 14 days of the new schedule, and is reset to the schedule otherwise.
  _retired · enforced by test · F-PERIOD_
  - Retired: A change of terms never touches a manual end (R-PERIOD-014, D-080); the 14-day rule is gone.
  - Related: D-073, D-080
  - Source: owner-request: coordinator decisions on the step 2 database review, 2026-11-15; docs/database.md: RPCs
- **R-PERIOD-027** The database gives the valid months to start a budget from, with the date each first period would start, so the client never computes them.
  _active · enforced by test · F-PERIOD_
  - Related: D-070
  - Source: owner-request: coordinator decisions on the step 2 database review, 2026-11-15; docs/database.md: RPCs
- **R-PERIOD-028** The database gives its "today" for display, with the current period and on its own, so the client never uses the browser's clock.
  _active · enforced by test · F-PERIOD_
  - Related: D-070, Q-016
  - Source: owner-request: coordinator decisions on the step 2 database review, 2026-11-15; docs/database.md: RPCs
- **R-PERIOD-051** The periods page labels periods by their dates and offers the boundary operations as what happened to a salary (the next one is expected on another day, and reset; it arrived early; this period's salary has not arrived yet; it actually arrived on another day), each showing the resulting dates and how to undo it before saving.
  _active · enforced by test · F-PERIOD_
  - Related: R-PERIOD-012, R-PERIOD-013, R-PERIOD-023, R-PERIOD-025, R-PERIOD-033, R-PERIOD-034, D-082
  - Source: code: src/features/periods/periods-page.tsx
- **R-PERIOD-052** Reads that depend on which periods exist wait for ensure_periods, are read again after each of its runs (at least every 15 minutes while the page is open), and show an error with a retry when it fails; whether a budget has ended is the database's answer, never the absence of a current row.
  _active · enforced by test · F-PERIOD_
  - Related: R-PERIOD-050, R-PERIOD-028
  - Source: code: src/features/budgets/budget-queries.ts
- **R-PERIOD-029** A change of terms (an edit, a correction, switching the primary income) never moves a stored boundary; its only effect on periods is to re-project the current period's end when it was not set by hand.
  _active · enforced by test · F-PERIOD_
  - Related: D-080
  - Source: owner-request: coordinator decision on the second step 2 database review, 2026-11-16; docs/database.md: RPCs
- **R-PERIOD-030** The next pay date after a period is the first actual pay date of the primary income, under the terms in force, at least 15 days after the period's start (and, when re-projecting after a change of terms, after today).
  _active · enforced by test · F-PERIOD_
  - Related: D-081
  - Source: owner-request: coordinator decision on the second step 2 database review, 2026-11-16; docs/database.md: RPCs
- **R-PERIOD-031** A budget can never get stuck: creating the missing periods always succeeds, each starting the day after the previous one ends, until one contains today or the budget's end is reached; after a very long absence a read may create them over several calls, each keeping its progress (R-PERIOD-130).
  _active · enforced by test · F-PERIOD_
  - Related: D-080, D-270
  - Source: owner-request: coordinator decision on the second step 2 database review, 2026-11-16; docs/database.md: RPCs
- **R-PERIOD-032** Every write first creates the missing periods up to today, then acts.
  _active · enforced by test · F-PERIOD_
  - Related: D-082
  - Source: owner-request: coordinator decision on the second step 2 database review, 2026-11-16; docs/database.md: RPCs
- **R-PERIOD-033** The expected next pay date set by hand can be reset to the projection.
  _active · enforced by test · F-PERIOD_
  - Related: D-082
  - Source: owner-request: coordinator decision on the second step 2 database review, 2026-11-16; docs/database.md: RPCs
- **R-PERIOD-034** When the salary arrives early, the current period closes and the next one starts on the day it arrived (today or earlier).
  _active · enforced by test · F-PERIOD_
  - Related: D-082
  - Source: owner-request: coordinator decision on the second step 2 database review, 2026-11-16; docs/database.md: RPCs
- **R-PERIOD-035** Before reopening, a member can list everything the reopen would move into the previous period, for every kind of record, and what it would replace.
  _active · enforced by test · F-PERIOD_
  - Related: D-092
  - Source: owner-request: coordinator decision on the third step 2 database review, 2026-11-16; docs/database.md: RPCs
- **R-PERIOD-036** Before saving, a member can see what the current period's end and expected next pay date would become under proposed terms (a correction from an earlier period included) or a proposed primary income: the preview takes the write's arguments and is computed exactly as the write does, and the write can be refused when its result no longer matches the preview.
  _active · enforced by test · F-PERIOD_
  - Related: D-092, D-157
  - Source: owner-request: coordinator decision on the third step 2 database review, 2026-11-16; docs/database.md: RPCs
- **R-PERIOD-037** When the primary income's pay day or weekend rule is corrected after that month's salary was already due, the current period extends to the following month until the user records what happened; the app asks, offering only the operation that fits and that the database can accept: the early pay date for a new salary (due at least 7 days after the period started), moving the period's start for this period's own salary (due fewer than 7 days after it started), and nothing when neither can be saved.
  _active · enforced by test · F-PERIOD_
  - Why: Frontend behaviour; the database part is R-PERIOD-029, R-PERIOD-034 and R-PERIOD-012.
  - Related: D-081, R-PERIOD-034, R-PERIOD-012, R-PERIOD-054
  - Source: owner-request: coordinator decision on the third step 2 database review, 2026-11-16; docs/database.md: RPCs; owner-request: coordinator, step 2 browser review fixes, 2026-11-16
- **R-PERIOD-053** Before "this period's salary has not arrived yet" is confirmed, the app lists, from the database's preview, each thing recorded in the period being removed (incomes, and categories in their own words) and what will happen to it (applies to the reopened period, replaces what that period had, or disappears), says when nothing was recorded, and says that recording the salary again later restores the dates only; it cannot be confirmed until that list has been read, and when it cannot be read the dialog says so and offers to read it again.
  _active · enforced by test · F-PERIOD_
  - Related: R-PERIOD-035, R-PERIOD-023, R-VERSION-013
  - Source: code: src/features/periods/periods-page.tsx; owner-request: coordinator, step 2 browser review fixes, 2026-11-16
- **R-PERIOD-054** The app offers "the salary arrived early" and "this period's salary actually arrived on another day" only when some date for it can be saved (every period 7 to 92 days long, an arrival today or earlier and not after the end date entered); otherwise the action is shown unavailable with the reason. Its dialog gives the dates that can work, and a date outside them is neither previewed nor sent. The database still decides.
  _active · enforced by test · F-PERIOD_
  - Related: R-PERIOD-020, R-PERIOD-034, R-PERIOD-012, R-BUDGET-008
  - Source: owner-request: coordinator, step 2 browser review fixes, 2026-11-16; code: src/features/periods/boundary-ranges.ts
- **R-PERIOD-055** Every period action sends the period the user was looking at (its id and revision). When the database refuses it because that period changed (another member acted first, or an earlier attempt already went through), the action is closed, the periods are read again and the page says so; nothing is retried automatically. A start set by hand can be moved back to the schedule's day, which clears its "set by hand" mark (R-PERIOD-151).
  _active · enforced by test · F-PERIOD_
  - Related: R-CONCURRENCY-100, R-PERIOD-100, R-PERIOD-051, D-151, D-152, Q-091, R-PERIOD-151
  - Source: owner-request: coordinator, frontend adaptation to the step 3 database review fixes, 2026-11-16; code: src/features/periods/periods-page.tsx; owner-request: coordinator, step 4 screens review round 2, 2026-11-16
- **R-PERIOD-100** A boundary moved to where the schedule puts it (the previous period's projected end) is not marked as set by hand, and a past boundary can be moved back to the schedule without giving a date.
  _active · enforced by test · F-PERIOD_
  - Related: D-152, Q-071, R-PERIOD-014, R-PERIOD-025
  - Source: owner-request: project coordinator decision on the step 3 database review, 2026-11-16 (the product owner asked to proceed on the coordinator's defaults); code: supabase/migrations/20261116120000_categories_transactions_progress.sql
- **R-PERIOD-130** A catch-up step creates at most 120 periods (ten years), and at most about two seconds of work, with their interest and charges; ensure_periods and get_current_period keep their step; until the budget is caught up my_budgets.caught_up is false, get_current_period gives no row, and every other call answers catching_up (R-PERIOD-180).
  _active · enforced by test · F-PERIOD_
  - Related: R-PERIOD-031, D-270, D-276
  - Source: owner-request: coordinator review of the step 4 database, 2026-11-16; code: supabase/migrations/20261117100000_subscriptions_debts.sql
- **R-PERIOD-131** The end date of a future period, as the debt projection uses it, is the one the catch-up will give it under the terms in force, whatever the current period's end (set by hand early or late).
  _active · enforced by test · F-DEBT_
  - Related: R-DEBT-005, D-203
  - Source: owner-request: coordinator review of the step 4 database, 2026-11-16; code: supabase/migrations/20261117100000_subscriptions_debts.sql
- **R-PERIOD-132** Undoing a reopen with the original date leaves the closed period's end as the schedule put it: the end counts as set by hand only when the salary did not arrive on the schedule's day.
  _active · enforced by test · F-PERIOD_
  - Related: R-PERIOD-012, D-152
  - Source: owner-request: coordinator review of the step 4 database, 2026-11-16; code: supabase/migrations/20261117100000_subscriptions_debts.sql
- **R-PERIOD-133** preview_move_period_start says, without changing anything, which start a move to the schedule would give a period and whether the move would be accepted now, with the refusal's code when not.
  _active · enforced by test · F-PERIOD_
  - Related: Q-091
  - Source: owner-request: coordinator review of the step 4 database, 2026-11-16; code: supabase/migrations/20261117100000_subscriptions_debts.sql
- **R-PERIOD-134** An edit of the primary income's terms that moves the current period's end must send the end its preview showed; without it the write is refused (preview_required) rather than moving the end unseen.
  _active · enforced by test · F-INCOME_
  - Related: R-PERIOD-036, D-205
  - Source: owner-request: coordinator review of the step 4 database, 2026-11-16; code: supabase/migrations/20261117100000_subscriptions_debts.sql
- **R-PERIOD-150** After a very long absence (my_budgets.caught_up false) the app catches the budget up before showing any page: it calls ensure_periods until it answers 0 and meanwhile says "Catching up on the time since your last visit…", with no figure; a failure is said with a retry. No page shows a budget as ended or empty while it is being caught up.
  _active · enforced by test · F-SUBSCRIPTION_
  - Related: R-PERIOD-130, D-270, D-231
  - Source: owner-request: coordinator, step 4 screens review round 2, 2026-11-16; code: src/features/budgets/budget-routes.tsx; code: src/features/budgets/budget-queries.ts
- **R-PERIOD-151** "Move this period's start back to the schedule" is offered from preview_move_period_start: with the start it would give when the move would be accepted, disabled with the refusal in words when not, and not at all when the period already starts there; the confirmation names the dates.
  _active · enforced by test · F-SUBSCRIPTION_
  - Related: R-PERIOD-133, R-PERIOD-100, D-233
  - Source: owner-request: coordinator, step 4 screens review round 2, 2026-11-16; code: src/features/periods/periods-page.tsx
- **R-PERIOD-180** No call of any kind creates more than one bounded step of periods, however often it calls the catch-up: ensure_periods and get_current_period do one step and keep it; every other read, preview and write does at most its own roll-over (R-PERIOD-250) and, when the budget is still behind, answers catching_up and changes nothing.
  _active · enforced by test · F-PERIOD_
  - Related: D-270, D-387, R-PERIOD-130
  - Source: owner-request: coordinator, independent re-review of the step 4 database fixes, 2026-11-16; code: supabase/migrations/20261117100000_subscriptions_debts.sql; code: supabase/migrations/20261118100000_period_comparison.sql
- **R-PERIOD-250** A budget whose last period ended more than 62 days before today (or its end date), or that has room for transactions and a subscription charge or a transfer's transaction due that long ago not made yet, is caught up only by ensure_periods and get_current_period: every other call answers catching_up at once, before taking the budget lock and without doing any work; ensure_periods and get_current_period wait at most two seconds for a lock another session holds, then answer catching_up, never the statement timeout.
  _active · enforced by test · F-PERIOD_
  - Related: D-387, R-PERIOD-180, D-433
  - Source: owner-request: coordinator review of the step 5 database and the step 4 re-review fixes, 2026-11-16; code: supabase/migrations
- **R-PERIOD-190** Whatever read or write answers catching_up (a tab left open across a long absence), the app catches the budget up (ensure_periods until it answers 0) behind the catching-up screen, then reads every query of the budget again; the page stays mounted underneath, so a refused save keeps what was typed and says that nothing was saved and that it can be saved again now. A catch-up that ends within a moment shows nothing different.
  _active · enforced by test · F-SUBSCRIPTION_
  - Related: R-PERIOD-180, R-PERIOD-150, D-270, D-291
  - Source: owner-request: coordinator, step 4 screens adapted to the database re-review and step 5, 2026-11-16; code: src/features/budgets/budget-routes.tsx
- **R-PERIOD-191** Periods are read a page at a time with list_periods (120, newest first); the periods page shows the newest and offers the older ones on request, saying how many are listed.
  _active · enforced by test · F-PERIOD_
  - Related: R-APP-170, D-292
  - Source: owner-request: coordinator, step 4 screens adapted to the database re-review and step 5, 2026-11-16; code: src/features/budgets/budget-queries.ts; code: src/features/periods/periods-page.tsx
- **R-PERIOD-192** Every period picker (the transactions filter, a correction's or a removal's period, a new record's first period, the progress view's step back) reaches the oldest period: while older periods exist than those read, its last entry "Older periods…" reads the next page.
  _active · enforced by test · F-PERIOD_
  - Related: R-PERIOD-191, D-292
  - Source: owner-request: coordinator, step 4 screens adapted to the database re-review and step 5, 2026-11-16; code: src/features/budgets/older-periods.ts
- **R-PERIOD-193** A reopen preview that lists at most 1000 changes says how many more there are, in words, from its 'more' row.
  _active · enforced by test · F-PERIOD_
  - Related: R-PERIOD-053, R-APP-170
  - Source: owner-request: coordinator, step 4 screens adapted to the database re-review and step 5, 2026-11-16; code: src/features/periods/periods-page.tsx
- **R-PERIOD-280** A read answered catching_up is not a failure: it is not retried meanwhile and never shows an error card; the page waits (a placeholder) while the budget is caught up, then reads again.
  _active · enforced by test · F-PERIOD_
  - Related: R-PERIOD-190, R-COMPARE-175
  - Source: owner-request: coordinator, independent review of the step 4 and step 5 screens at a24615e, 2026-11-16; code: src/components/states.tsx
- **R-PERIOD-281** A period named in the address (a filter, a comparison side) keeps its meaning beyond the pages of periods loaded: it is read by its id and shown in its picker; an id that is not a uuid is never sent.
  _active · enforced by test · F-PERIOD_
  - Related: R-PERIOD-191
  - Source: owner-request: coordinator, independent review of the step 4 and step 5 screens at a24615e, 2026-11-16; code: src/features/budgets/budget-queries.ts
- **R-PERIOD-320** The confirmations that move a period's start ("this period's salary actually arrived on …" and "back to the schedule") say, as preview_move_period_start answers for that start, how many debts lose the interest added at the period's start (D-386).
  _active · enforced by test · F-PERIOD_
  - Related: D-386, R-PERIOD-151
  - Source: owner-request: coordinator brief for the step 6 screens (part A, contract changes), 2026-11-16; code: src/features/periods/periods-page.tsx
- **R-PERIOD-300** One catch-up step creates at most a bounded number of transactions per budget (4000, and about two seconds of work), leaving the rest due, none skipped; a step that stops before creating every one due never answers 0 from ensure_periods.
  _active · enforced by test · F-PERIOD_
  - Related: D-427, R-PERIOD-180
  - Source: owner-request: coordinator brief for the step 7 occurrence model redesign, after the independent review of 747686c, 2026-11-16; code: supabase/migrations/20261120100000_money_flow.sql

### Versioning: edits never rewrite the past

- **R-VERSION-001** An edit to an income's terms creates a new version effective from the current period.
  _active · enforced by test · F-INCOME_
  - Source: domain: Versioning: edits never rewrite the past
- **R-VERSION-002** An edit to a category expectation creates a new version effective from the current period.
  _active · enforced by test · F-CATEGORY_
  - Source: domain: Versioning: edits never rewrite the past
- **R-VERSION-003** An edit to a subscription's terms (price, cadence, category, schedule) creates a new version effective from the current period; charges already created never change.
  _active · enforced by test · F-SUBSCRIPTION_
  - Source: domain: Versioning: edits never rewrite the past; owner-request: project coordinator decision for step 4, 2026-11-16 (the product owner asked to proceed on the coordinator's defaults); code: supabase/migrations/20261117100000_subscriptions_debts.sql
- **R-VERSION-004** An edit to a debt's terms (interest rate, planned monthly payment) creates a new version effective from the current period; interest already added never changes.
  _active · enforced by test · F-DEBT_
  - Source: domain: Versioning: edits never rewrite the past; owner-request: project coordinator decision for step 4, 2026-11-16 (the product owner asked to proceed on the coordinator's defaults); code: supabase/migrations/20261117100000_subscriptions_debts.sql
- **R-VERSION-070** An edit to a category expectation can, as an explicit "correct an earlier period" choice, apply from an earlier period instead of the current one.
  _active · enforced by test · F-CATEGORY_
  - Why: The same optional correction as for incomes (D-065); like an income correction, it applies until the next existing change (D-084).
  - Related: D-107, D-065, D-084
  - Source: owner-request: product owner decisions on the open questions, 2026-11-16
- **R-VERSION-071** An edit to a planned transfer creates a new version effective from the current period.
  _active · enforced by test · F-MONEYFLOW_
  - Related: D-121, Q-015
  - Source: owner-request: product owner decisions on the open questions, 2026-11-16; code: supabase/migrations/20261120100000_money_flow.sql
- **R-VERSION-005** Past periods keep reading the version that was in force at the time.
  _active · enforced by test · F-INCOME_
  - Source: domain: Versioning: edits never rewrite the past
- **R-VERSION-006** Several edits within the same period overwrite that period's version rather than piling up.
  _active · enforced by test · F-INCOME_
  - Source: domain: Versioning: edits never rewrite the past
- **R-VERSION-007** A change to the primary income's pay day or weekend rule does not move the start of the current period, or any other stored boundary.
  _active · enforced by test · F-PERIOD_
  - Related: D-080
  - Source: domain: Versioning: edits never rewrite the past
- **R-VERSION-008** A change to the primary income's pay day or weekend rule applies from the next pay date after today: the current period's end is re-projected to the day before it.
  _active · enforced by test · F-PERIOD_
  - Related: D-060, D-081
  - Source: domain: Versioning: edits never rewrite the past
- **R-VERSION-009** Writing a version for a period discards the versions keyed to later periods, so terms just saved hold from that period on and are never shadowed.
  _retired · enforced by test · F-INCOME_
  - Retired: Nothing is keyed beyond the latest period any more (R-VERSION-011, D-083), so there are no later versions to discard.
  - Related: D-064, D-083
  - Source: owner-request: coordinator decisions on the step 2 database review, 2026-11-15; docs/database.md: RPCs
- **R-VERSION-010** An income's terms can be corrected from an earlier period of the income, as an explicit correction; normal edits never change past periods.
  _active · enforced by test · F-INCOME_
  - Related: D-065, D-084
  - Source: owner-request: coordinator decisions on the step 2 database review, 2026-11-15; docs/database.md: RPCs
- **R-VERSION-011** Nothing is keyed beyond the latest period: when the latest period is merged into the previous one, everything keyed to it is re-keyed to the previous period, the later write winning, so a change made now is in force now.
  _active · enforced by test · F-INCOME_
  - Related: D-083
  - Source: owner-request: coordinator decision on the second step 2 database review, 2026-11-16; docs/database.md: RPCs
- **R-VERSION-012** A correction from an earlier period applies from that period until the next existing change; later versions are left alone.
  _active · enforced by test · F-INCOME_
  - Related: D-084
  - Source: owner-request: coordinator decision on the second step 2 database review, 2026-11-16; docs/database.md: RPCs
- **R-VERSION-013** When the latest period is merged into the previous one, what was keyed to the merged period always wins over what the previous period had for the same record, so the terms in force before the reopen are still in force after it.
  _active · enforced by test · F-INCOME_
  - Related: D-089
  - Source: owner-request: coordinator decision on the third step 2 database review, 2026-11-16; docs/database.md: RPCs
- **R-VERSION-014** A table keyed to periods is checked when it registers for merges, and a merge never fails because a row that would never be in force is referenced by other rows (it is kept as a void row).
  _active · enforced by test · F-INCOME_
  - Related: D-091
  - Source: owner-request: coordinator decision on the third step 2 database review, 2026-11-16; docs/database.md: RPCs
- **R-VERSION-100** Registering a table for merges is refused unless a validity table's checks on first_seq and end_seq accept a void row and a version table has a foreign key from its entity column to its entity table.
  _active · enforced by test · F-INCOME_
  - Related: D-155, D-091, R-VERSION-014
  - Source: owner-request: coordinator, step 3 database review, 2026-11-16; code: supabase/migrations/20261116120000_categories_transactions_progress.sql
- **R-VERSION-110** Subscriptions, debts and their terms take part in a reopen like incomes and categories (what the merged period recorded replaces the reopened period's, and the preview lists it), and a reopen never loses a charge, a payment or an adjustment.
  _active · enforced by test · F-SUBSCRIPTION_
  - Related: D-174
  - Source: owner-request: database developer decision for step 4, within the coordinator's brief, 2026-11-16; code: supabase/migrations/20261117100000_subscriptions_debts.sql
- **R-VERSION-140** A correction from an earlier period, for an income, a category, a subscription or a debt, starts from the terms in force in the period chosen, as get_income_terms, get_category_terms, get_subscription_terms or get_debt_terms give them, and sends only what the user changed from them (a group of values that belong together whole); one that changes nothing is not sent as a correction. The period is chosen before the terms, and the form says the values shown are that period's.
  _active · enforced by test · F-INCOME_
  - Related: R-VERSION-012, D-160, D-210, R-VERSION-132, D-230
  - Source: owner-request: coordinator, step 4 screens review round 1, 2026-11-16; code: src/features/budgets/terms-at.ts; owner-request: coordinator, step 4 screens review round 2, 2026-11-16
- **R-VERSION-130** No version of a category, subscription, debt or income is kept at or after its end; a reopen that leaves a category without referrers deletes it rather than leaving it void.
  _active · enforced by test · F-SUBSCRIPTION_
  - Related: R-VERSION-014, D-208
  - Source: owner-request: coordinator review of the step 4 database, 2026-11-16; code: supabase/migrations/20261117100000_subscriptions_debts.sql
- **R-VERSION-131** Extending a category back stretches its first terms to the new first period; a correction from that period runs to the next change the user made.
  _active · enforced by test · F-CATEGORY_
  - Related: R-CATEGORY-093
  - Source: owner-request: coordinator review of the step 4 database, 2026-11-16; code: supabase/migrations/20261117100000_subscriptions_debts.sql
- **R-VERSION-132** The terms of a subscription, debt, category or income in force in a chosen period can be read, with the period they took effect; where the record is not in force (before it starts, from its end on) there are no terms.
  _active · enforced by test · F-SUBSCRIPTION_
  - Source: owner-request: coordinator addendum to the step 4 database review (screens asks), 2026-11-16; code: supabase/migrations/20261117100000_subscriptions_debts.sql
- **R-VERSION-133** A correction from a chosen period applies up to the period before the next existing change or end, and that period is given with the terms.
  _active · enforced by test · F-SUBSCRIPTION_
  - Related: R-VERSION-132
  - Source: owner-request: coordinator addendum to the step 4 database review (screens asks), 2026-11-16; code: supabase/migrations/20261117100000_subscriptions_debts.sql
- **R-VERSION-150** A correction form says how far the correction reaches, from the database's until_period_id: "from <start> up to the period ending <end>; from <next>, the terms recorded later stay", or "from <start> on"; when the record did not exist in the period chosen (in_force false: not yet, or no longer, its end period included), it says so in words and offers no save.
  _active · enforced by test · F-SUBSCRIPTION_
  - Related: R-VERSION-133, R-VERSION-140, D-230
  - Source: owner-request: coordinator, step 4 screens review round 2, 2026-11-16; code: src/features/budgets/correction-reach.tsx; code: src/features/budgets/terms-at.ts; owner-request: coordinator, step 4 screens adapted to the database re-review and step 5, 2026-11-16

### Categories and subcategories

- **R-CATEGORY-001** Categories have two levels at most: a category and optional subcategories.
  _active · enforced by test · F-CATEGORY_
  - Why: Example: insurance -> insurance/car, insurance/health, insurance/home.
  - Source: domain: Category and subcategory
- **R-CATEGORY-002** The monthly expectation is set on each subcategory, or on the category itself when it has never had subcategories; a category with subcategories has no expectation of its own: its expected amount is the sum of its subcategories'.
  _active · enforced by test · F-CATEGORY_
  - Related: R-CATEGORY-090, D-141
  - Source: domain: Category and subcategory
- **R-CATEGORY-003** An expectation amount is entered per month or per year.
  _active · enforced by test · F-CATEGORY_
  - Source: domain: Category and subcategory
- **R-CATEGORY-004** Yearly amounts are stored as yearly.
  _active · enforced by test · F-CATEGORY_
  - Source: domain: Category and subcategory
- **R-CATEGORY-005** A yearly amount is shown per month as one twelfth of it, rounded to the nearest rappen, a half rappen upwards.
  _active · enforced by test · F-CATEGORY_
  - Related: Q-002, D-100, Q-050, D-140, R-CATEGORY-091
  - Source: domain: Category and subcategory; owner-request: product owner decisions on the open questions, 2026-11-16
- **R-CATEGORY-006** A period's amount left to assign is its income total (extra incomes included) minus the sum of the expectations in force in that period.
  _active · enforced by test · F-CATEGORY_
  - Related: Q-003, D-101, R-PERIOD-018
  - Source: domain: Category and subcategory; owner-request: product owner decisions on the open questions, 2026-11-16
- **R-CATEGORY-070** The twelve monthly shares of a yearly amount are not adjusted to add up to the yearly amount.
  _active · enforced by test · F-CATEGORY_
  - Why: Example: CHF 100.00 a year is shown as CHF 8.33 a month; twelve shares make CHF 99.96.
  - Related: D-100, R-CATEGORY-005
  - Source: owner-request: product owner decisions on the open questions, 2026-11-16
- **R-CATEGORY-071** Expectations that add up to more than a period's income total are accepted, and the amount left to assign is then shown as a negative amount.
  _active · enforced by test · F-CATEGORY_
  - Related: D-106, R-CATEGORY-006
  - Source: owner-request: product owner decisions on the open questions, 2026-11-16
- **R-CATEGORY-072** Deleting a category that has transactions or has counted in a past period ends it from the current period; past periods keep it, and its transactions are never deleted.
  _active · enforced by test · F-CATEGORY_
  - Related: D-107, D-030
  - Source: owner-request: product owner decisions on the open questions, 2026-11-16
- **R-CATEGORY-073** Deleting a category that has no transactions and never counted in a past period removes it.
  _active · enforced by test · F-CATEGORY_
  - Why: "Like incomes" (D-030): what never counted is deleted, not ended.
  - Related: D-107, D-030
  - Source: owner-request: product owner decisions on the open questions, 2026-11-16
- **R-CATEGORY-090** A category becomes a group when its first subcategory is created and stays one: a group holds no expectation and takes no transaction, and its expected amount and spending are the sums of its subcategories'.
  _active · enforced by test · F-CATEGORY_
  - Why: Even once its subcategories are gone, a group stays a group (Q-081), so its history never mixes the two shapes.
  - Related: D-141, R-CATEGORY-002, R-TRANSACTION-072, Q-081
  - Source: owner-request: project coordinator decisions on the step 3 open questions, 2026-11-16 (the product owner asked to proceed on the coordinator's defaults); code: supabase/migrations/20261116120000_categories_transactions_progress.sql
- **R-CATEGORY-091** A total for a period (expected, left to assign) adds the rounded monthly shares, so what is displayed adds up.
  _active · enforced by test · F-CATEGORY_
  - Why: Example: two yearly amounts of 6 rappen expect 1 + 1 = 2 rappen a month, not 12 / 12 = 1.
  - Related: D-140, Q-050, R-CATEGORY-005
  - Source: owner-request: project coordinator decisions on the step 3 open questions, 2026-11-16 (the product owner asked to proceed on the coordinator's defaults); code: supabase/migrations/20261116120000_categories_transactions_progress.sql
- **R-CATEGORY-092** When the first subcategory is added to a category that already has transactions or a non-zero expectation, they move, with every past expectation, to a subcategory created with it (named by the client, shown as "Other"), so no transaction is ever left on a category that has subcategories and no period's totals change.
  _active · enforced by test · F-CATEGORY_
  - Related: D-141, Q-051, R-TRANSACTION-072
  - Source: owner-request: project coordinator decisions on the step 3 open questions, 2026-11-16 (the product owner asked to proceed on the coordinator's defaults); code: supabase/migrations/20261116120000_categories_transactions_progress.sql
- **R-CATEGORY-093** A category is created from the current period, or, as an explicit choice, from an earlier period; a subcategory is never in force outside its group.
  _active · enforced by test · F-CATEGORY_
  - Why: Back-dating lets transactions be entered for the periods before the categories were set up (R-PERIOD-016).
  - Related: D-065, R-TRANSACTION-091
  - Source: owner-request: project coordinator brief for the step 3 database, 2026-11-16; code: supabase/migrations/20261116120000_categories_transactions_progress.sql
- **R-CATEGORY-094** A budget has at most 200 categories and subcategories in force and 500 in all (void rows, kept only for their transactions, not counted); an expectation amount, per month or per year, is from 0 to CHF 10 million; and at most 900 categories rows in all, void ones included (R-APP-170).
  _active · enforced by test · F-CATEGORY_
  - Related: D-148, D-153, D-264
  - Source: owner-request: project coordinator brief for the step 3 database, 2026-11-16; code: supabase/migrations/20261116120000_categories_transactions_progress.sql
- **R-CATEGORY-095** Ending a category ends its subcategories with it, within its own validity; a category or subcategory with transactions that would never be in force is kept as a void row, so its transactions still count where they are dated.
  _active · enforced by test · F-CATEGORY_
  - Related: R-CATEGORY-072, R-VERSION-014, D-147
  - Source: owner-request: project coordinator brief for the step 3 database, 2026-11-16; code: supabase/migrations/20261116120000_categories_transactions_progress.sql
- **R-CATEGORY-096** Categories are ordered among their siblings; a reorder lists exactly the siblings not ended, and is refused when another member added or removed one meanwhile. Reordering is not an edit of a category.
  _active · enforced by test · F-CATEGORY_
  - Related: Q-084
  - Source: owner-request: project coordinator brief for the step 3 database, 2026-11-16; code: supabase/migrations/20261116120000_categories_transactions_progress.sql
- **R-CATEGORY-050** The budget page lists the categories in force now in their order, each with its amount per month as the database gives it (a yearly amount also as entered), a group with its subcategories and their total, and the current period's income, total planned and amount left to assign, a negative amount shown as assigned beyond the income; removed categories are listed apart.
  _active · enforced by test · F-CATEGORY_
  - Related: R-CATEGORY-006, R-CATEGORY-071, R-CATEGORY-005, C-LOGIC-003
  - Source: owner-request: coordinator brief for the step 3 screens, 2026-11-16; code: src/features/budget/budget-page.tsx
- **R-CATEGORY-051** Before the first subcategory of a category is saved, the app says that the category becomes a group and, when it has an amount or transactions, that they move to a new subcategory "Other"; the translated name of "Other" is always sent with a new subcategory.
  _active · enforced by test · F-CATEGORY_
  - Related: R-CATEGORY-092, R-CATEGORY-090, D-141
  - Source: owner-request: coordinator brief for the step 3 screens, 2026-11-16; code: src/features/budget/components/category-form-dialog.tsx
- **R-CATEGORY-052** Before a category is removed, the app says which of the two will happen, from the database's own answer: deleted (it never counted and has no transactions), no longer planned from the current period with past periods keeping it and its transactions kept, or, when it was added this period and has transactions, kept without an amount; that its subcategories go with it; and it offers removal from an earlier period only as an explicit option with a warning.
  _active · enforced by test · F-CATEGORY_
  - Related: R-CATEGORY-072, R-CATEGORY-073, R-CATEGORY-095
  - Source: owner-request: coordinator brief for the step 3 screens, 2026-11-16; code: src/features/budget/components/end-category-dialog.tsx; owner-request: coordinator, step 3 screens review fixes, 2026-11-16
- **R-CATEGORY-053** A new amount is said to apply from the current period; correcting an earlier period is offered only as an explicit option, off by default, with a warning that past periods change; a group's amount is not editable (it is the total of its subcategories).
  _active · enforced by test · F-CATEGORY_
  - Related: R-VERSION-002, R-VERSION-070, R-INCOME-051
  - Source: owner-request: coordinator brief for the step 3 screens, 2026-11-16; code: src/features/budget/components/category-form-dialog.tsx
- **R-CATEGORY-054** A category can be counted from an earlier period and a removed one restored, each said beforehand: counting from an earlier period is an explicit correction that changes those periods' plans and results; restoring plans it again from the current period with nothing expected in the periods between (their totals unchanged), or, as an explicit correction, as if it had never ended (the only way in an ended budget); a subcategory needs its group in force first. A category removed in the period it was added (never planned) is listed among the removed ones while it has transactions and can be restored; one removed from the current period is restored from that period, as if it had never been removed, without a correction to choose. A removed category restored by another member first is said so, and cannot be restored again.
  _active · enforced by test · F-CATEGORY_
  - Related: R-CATEGORY-100, R-CATEGORY-101, R-VERSION-070
  - Source: owner-request: coordinator, frontend adaptation to the step 3 database review fixes, 2026-11-16; code: src/features/budget/components/category-history-dialog.tsx
- **R-CATEGORY-100** An existing category can be made to count from an earlier period, as an explicit correction, with its earliest expectation there unless another amount is given; a subcategory never before its group.
  _active · enforced by test · F-CATEGORY_
  - Related: D-154, Q-082, R-VERSION-070
  - Source: owner-request: project coordinator decision on the step 3 database review, 2026-11-16 (the product owner asked to proceed on the coordinator's defaults); code: supabase/migrations/20261116120000_categories_transactions_progress.sql
- **R-CATEGORY-101** An ended category can be restored: from the current period, expecting nothing in the periods between its end and now, or, as an explicit correction, from the period it ended, as if it had never ended; a subcategory needs its group in force.
  _active · enforced by test · F-CATEGORY_
  - Related: D-154, Q-082, R-CATEGORY-072
  - Source: owner-request: project coordinator decision on the step 3 database review, 2026-11-16 (the product owner asked to proceed on the coordinator's defaults); code: supabase/migrations/20261116120000_categories_transactions_progress.sql
- **R-CATEGORY-102** Reading and changing a budget's categories and transactions costs what that budget holds, never what other budgets hold.
  _active · enforced by test · F-CATEGORY_
  - Related: D-153
  - Source: owner-request: coordinator, step 3 database review, 2026-11-16; code: supabase/migrations/20261116120000_categories_transactions_progress.sql
- **R-CATEGORY-110** A category that a subscription or debt in force still uses cannot be removed; one that any subscription or debt references is ended, never deleted; adding its first subcategory moves its subscriptions and debts to "Other" with its transactions.
  _active · enforced by test · F-SUBSCRIPTION_
  - Related: D-179
  - Source: owner-request: database developer decision for step 4, within the coordinator's brief, 2026-11-16; code: supabase/migrations/20261117100000_subscriptions_debts.sql
- **R-CATEGORY-120** Removing a category that a subscription or debt in force uses (category_overview.in_use) is not offered, from now or from an earlier period: the confirmation says it cannot be removed yet, what uses it and where to end or move it.
  _active · enforced by test · F-CATEGORY_
  - Related: R-CATEGORY-110, D-179
  - Source: owner-request: coordinator brief for the step 4 screens, 2026-11-16; code: src/features/budget/components/category-in-use.tsx; owner-request: coordinator, step 4 screens review round 1, 2026-11-16
- **R-CATEGORY-130** In every period where a subscription or debt is in force, the category of its terms in force then is in force too: new terms, corrections, ending or extending a category and reopens all keep it so.
  _active · enforced by test · F-SUBSCRIPTION_
  - Related: R-CATEGORY-110, D-179
  - Source: owner-request: coordinator review of the step 4 database, 2026-11-16; code: supabase/migrations/20261117100000_subscriptions_debts.sql
- **R-CATEGORY-131** When a category cannot end because subscriptions or debts still use it, the refusal names them.
  _active · enforced by test · F-SUBSCRIPTION_
  - Related: R-CATEGORY-110
  - Source: owner-request: coordinator addendum to the step 4 database review (screens asks), 2026-11-16; code: supabase/migrations/20261117100000_subscriptions_debts.sql
- **R-CATEGORY-150** When the database refuses to end a category because subscriptions or debts use it (category_in_use), the dialog lists them from the refusal's detail, each with a way to it; the up-front check (category_overview.in_use) stays.
  _active · enforced by test · F-SUBSCRIPTION_
  - Related: R-CATEGORY-131, R-CATEGORY-120
  - Source: owner-request: coordinator, step 4 screens review round 2, 2026-11-16; code: src/features/budget/category-users.ts; code: src/features/budget/components/end-category-dialog.tsx
- **R-CATEGORY-200** The "to categorise" category takes no subcategory and no expectation, can be renamed, and cannot end while it holds transactions.
  _active · enforced by test · F-IMPORT_
  - Related: D-312
  - Source: owner-request: coordinator brief for the step 6 database (import), 2026-11-16; code: supabase/migrations/20261119100000_import.sql
- **R-CATEGORY-230** A category that the terms of a planned transfer use from a period on cannot end from then (category_in_use names the transfer), and its first subcategory moves the transfer's category to "Other".
  _active · enforced by test · F-MONEYFLOW_
  - Related: R-CATEGORY-130, R-CATEGORY-131, R-CATEGORY-110, R-ACCOUNT-072
  - Source: owner-request: coordinator brief for the step 7 database (accounts and money flow), 2026-11-16; code: supabase/migrations/20261120100000_money_flow.sql
- **R-CATEGORY-250** Only an imported transaction still to review can be in "to categorise": no hand-typed transaction, subscription, debt, planned transfer or merchant rule uses it; it does not count toward the 200 categories in force; my_budgets names it only while it is in force.
  _active · enforced by test · F-IMPORT_
  - Related: D-375, R-CATEGORY-200
  - Source: owner-request: coordinator review of the step 6 database (import), 2026-11-16; code: supabase/migrations/20261119100000_import.sql
- **R-CATEGORY-320** "To categorise" is marked in words wherever categories are listed (the budget page, progress, compare); it is offered as a target in no transaction, subscription, debt or rule form (an import waiting in it is edited to a real category); its form changes only the name, and its removal is not offered while it holds transactions, saying why.
  _active · enforced by test · F-IMPORT_
  - Related: R-CATEGORY-200, R-CATEGORY-250, D-447
  - Source: owner-request: coordinator brief for the step 6 screens (part B, import), 2026-11-16; code: src/features/categories/category-queries.ts
- **R-CATEGORY-340** An imported transaction waiting in "to categorise" can be edited while it keeps that category.
  _active · enforced by test · F-IMPORT_
  - Related: D-460, R-CATEGORY-250
  - Source: owner-request: coordinator brief for the step 6 database fix round 2 (re-review at 747686c), 2026-11-16; code: supabase/migrations/20261119100000_import.sql

### Transactions

- **R-TRANSACTION-001** A transaction has a positive amount in integer rappen, a date, and a category: one without subcategories, or one of its subcategories. An extra income has no category.
  _active · enforced by test · F-TRANSACTION_
  - Related: Q-004, D-102, R-TRANSACTION-092
  - Source: domain: Transaction; owner-request: product owner decisions on the open questions, 2026-11-16
- **R-TRANSACTION-002** A transaction has an optional description.
  _active · enforced by test · F-TRANSACTION_
  - Source: domain: Transaction
- **R-TRANSACTION-003** A transaction has an optional link to at most one of a debt or a subscription.
  _active · enforced by test · F-SUBSCRIPTION_
  - Why: Built with step 4, when debts and subscriptions exist: the transactions table takes the link columns then without reshaping (docs/database.md, "For later tables").
  - Related: Q-005, D-111
  - Source: domain: Transaction; owner-request: product owner decisions on the open questions, 2026-11-16
- **R-TRANSACTION-004** Transactions are created manually in the UI.
  _active · enforced by test · F-TRANSACTION_
  - Source: domain: Transaction
- **R-TRANSACTION-005** Transactions are also importable in bulk.
  _active · enforced by test · F-IMPORT_
  - Source: domain: Transaction
- **R-TRANSACTION-006** A transaction belongs to the period whose date range contains its date; the period is never stored, so it follows the date through every boundary operation.
  _active · enforced by test · F-TRANSACTION_
  - Source: domain: Period
- **R-TRANSACTION-007** A back-dated transaction lands in the right past period.
  _active · enforced by test · F-TRANSACTION_
  - Source: domain: Period
- **R-TRANSACTION-008** In a past period, transactions can be added, edited and deleted freely.
  _active · enforced by test · F-TRANSACTION_
  - Why: The rest of a past period changes only through its own path: boundaries through the period actions, incomes and expectations through the explicit "correct an earlier period" option (D-105).
  - Related: Q-011, D-105
  - Source: domain: Period; owner-request: product owner decisions on the open questions, 2026-11-16
- **R-TRANSACTION-070** A transaction is an expense unless the user marks it as a refund.
  _active · enforced by test · F-TRANSACTION_
  - Related: D-102
  - Source: owner-request: product owner decisions on the open questions, 2026-11-16
- **R-TRANSACTION-071** A refund reduces what was spent in its category in its period.
  _active · enforced by test · F-TRANSACTION_
  - Related: D-102
  - Source: owner-request: product owner decisions on the open questions, 2026-11-16
- **R-TRANSACTION-072** When a category has subcategories, a transaction goes on one of its subcategories, never on the category itself.
  _active · enforced by test · F-TRANSACTION_
  - Related: D-102, Q-051
  - Source: owner-request: product owner decisions on the open questions, 2026-11-16
- **R-TRANSACTION-073** A transaction is never refused because it takes its category over its expectation.
  _active · enforced by test · F-TRANSACTION_
  - Related: D-106
  - Source: owner-request: product owner decisions on the open questions, 2026-11-16
- **R-TRANSACTION-090** A transaction is dated from the first period's start to today, and not after the last period's end.
  _active · enforced by test · F-TRANSACTION_
  - Why: Not after today, rather than up to the current period's end: a change of the primary income's terms re-projects the current period's end and could otherwise leave a future-dated transaction outside every period (D-145).
  - Related: D-145, Q-083, R-TRANSACTION-093
  - Source: owner-request: project coordinator brief for the step 3 database, 2026-11-16; code: supabase/migrations/20261116120000_categories_transactions_progress.sql
- **R-TRANSACTION-091** A transaction goes on a category in force in the period containing its date; a back-dated one may use a category that has since ended.
  _active · enforced by test · F-TRANSACTION_
  - Related: D-144, Q-053, R-TRANSACTION-008
  - Source: owner-request: project coordinator decisions on the step 3 open questions, 2026-11-16 (the product owner asked to proceed on the coordinator's defaults); code: supabase/migrations/20261116120000_categories_transactions_progress.sql
- **R-TRANSACTION-092** Money coming in that is neither a salary nor a refund is recorded as an extra income, with a date, an amount and a description and no category; it adds to the income total of the period containing its date and to nothing else.
  _active · enforced by test · F-TRANSACTION_
  - Related: D-143, Q-052, R-PERIOD-018
  - Source: owner-request: project coordinator decisions on the step 3 open questions, 2026-11-16 (the product owner asked to proceed on the coordinator's defaults); code: supabase/migrations/20261116120000_categories_transactions_progress.sql
- **R-TRANSACTION-093** Transactions follow their date through every boundary operation, and no operation can leave a transaction outside every period.
  _active · enforced by test · F-TRANSACTION_
  - Related: D-145, R-TRANSACTION-006, R-PERIOD-012, R-PERIOD-023, R-PERIOD-034
  - Source: owner-request: project coordinator brief for the step 3 database, 2026-11-16; code: supabase/migrations/20261116120000_categories_transactions_progress.sql
- **R-TRANSACTION-094** A transaction amount is from 1 rappen to CHF 10 million, a description at most 500 characters, and a budget holds at most 50 000 transactions.
  _active · enforced by test · F-TRANSACTION_
  - Related: D-148, D-153
  - Source: owner-request: project coordinator brief for the step 3 database, 2026-11-16; code: supabase/migrations/20261116120000_categories_transactions_progress.sql
- **R-TRANSACTION-095** Each transaction keeps who recorded it; the list is read in pages of at most 200, newest first in a stable order, by a cursor, and can be filtered by dates, category and kind.
  _active · enforced by test · F-TRANSACTION_
  - Related: D-149, D-088
  - Source: owner-request: project coordinator brief for the step 3 database, 2026-11-16; code: supabase/migrations/20261116120000_categories_transactions_progress.sql; docs/database.md: Transactions
- **R-TRANSACTION-050** The transaction form records an expense, a refund or an extra income (no category); its date is limited to what the database accepts (the first period's start to today, or an ended budget's last day) and today by default; its category choices are read from the database for the date and read again whenever the date changes, a failed read is shown with a retry, and a transaction being edited keeps the category it already has even when that category is no longer planned on its date (shown as such), only while the date stays within the transaction's own period (D-159); moved to another period, a category no longer planned there must be chosen again, and the form says so; "save and add another" keeps the kind, date and category for the next receipt.
  _active · enforced by test · F-TRANSACTION_
  - Related: R-TRANSACTION-090, R-TRANSACTION-091, R-TRANSACTION-092, R-TRANSACTION-004
  - Source: owner-request: coordinator brief for the step 3 screens, 2026-11-16; code: src/features/transactions/components/transaction-form-dialog.tsx; owner-request: coordinator, step 3 screens review fixes, 2026-11-16
- **R-TRANSACTION-051** The transactions page lists transactions newest first, grouped by day, a page at a time through the database's cursor, once the filters are known; it is filtered by period (the current one by default), category (a group with its subcategories; one without a plan only when a link chose it) and kind, the filters kept in the address; a period or category the budget does not have falls back to all.
  _active · enforced by test · F-TRANSACTION_
  - Related: R-TRANSACTION-095, D-149
  - Source: owner-request: coordinator brief for the step 3 screens, 2026-11-16; code: src/features/transactions/transactions-page.tsx; owner-request: coordinator, step 3 screens review fixes, 2026-11-16
- **R-TRANSACTION-100** A transaction may always keep the category it already has while it stays in the same period; the category must be in force in the period of its date only when the category or the period changes.
  _active · enforced by test · F-TRANSACTION_
  - Related: D-159, R-TRANSACTION-091, R-CATEGORY-095
  - Source: owner-request: project coordinator decision on the step 3 database review, 2026-11-16 (the product owner asked to proceed on the coordinator's defaults); code: supabase/migrations/20261116120000_categories_transactions_progress.sql
- **R-TRANSACTION-110** A transaction linked to a debt or a subscription is an expense; a debt payment is in the category of the debt's terms in force in the period of its date; the debt or subscription is in force in the period of the date, except that a linked transaction keeping its period and category keeps its link.
  _active · enforced by test · F-DEBT_
  - Related: D-177, D-207
  - Source: owner-request: database developer decision for step 4, within the coordinator's brief, 2026-11-16; code: supabase/migrations/20261117100000_subscriptions_debts.sql
- **R-TRANSACTION-131** One call can change a transaction and its debt or subscription link together, checked against the new fields, all or nothing.
  _active · enforced by test · F-DEBT_
  - Related: Q-111, D-218
  - Source: owner-request: coordinator review of the step 4 database, 2026-11-16; code: supabase/migrations/20261117100000_subscriptions_debts.sql
- **R-TRANSACTION-132** The transactions list can be filtered to one subscription, one debt, or the charges awaiting confirmation.
  _active · enforced by test · F-SUBSCRIPTION_
  - Related: R-TRANSACTION-095
  - Source: owner-request: coordinator review of the step 4 database, 2026-11-16; owner-request: coordinator addendum to the step 4 database review (screens asks), 2026-11-16; code: supabase/migrations/20261117100000_subscriptions_debts.sql
- **R-TRANSACTION-150** "See its transactions" from a subscription, "See its payments" from a debt, and the charges card's link to the others open the transactions list filtered to that subscription, that debt or the charges awaiting confirmation, over all periods; the filter is shown, kept in the address and removable, and one that names no record of the budget is dropped.
  _active · enforced by test · F-SUBSCRIPTION_
  - Related: R-TRANSACTION-132, R-TRANSACTION-051
  - Source: owner-request: coordinator, step 4 screens review round 2, 2026-11-16; code: src/features/transactions/transactions-page.tsx; code: src/app/paths.ts
- **R-TRANSACTION-180** The transactions list says, per transaction, whether it is a payment of a debt that has ended (and so cannot be changed, unlinked or deleted).
  _active · enforced by test · F-DEBT_
  - Related: R-DEBT-134, D-274
  - Source: owner-request: coordinator addendum (screens round 2 findings), 2026-11-16; code: supabase/migrations/20261117100000_subscriptions_debts.sql
- **R-TRANSACTION-280** The dates a transaction may take start at the budget's first period, read by itself, whatever pages of periods are loaded.
  _active · enforced by test · F-TRANSACTION_
  - Related: R-TRANSACTION-090, R-PERIOD-191
  - Source: owner-request: coordinator, independent review of the step 4 and step 5 screens at a24615e, 2026-11-16; code: src/features/budgets/budget-queries.ts

### Period progress and result

- **R-PROGRESS-001** At the end of a period, category balances reset.
  _active · enforced by test · F-PROGRESS_
  - Related: D-039
  - Source: domain: Period
- **R-PROGRESS-002** A period's result is its income total minus the total spent in it, shown as a surplus when positive and a deficit when negative.
  _active · enforced by test · F-PROGRESS_
  - Related: Q-012, D-103, R-PERIOD-018
  - Source: domain: Period; owner-request: product owner decisions on the open questions, 2026-11-16
- **R-PROGRESS-070** A category's result in a period is its expectation in force in that period minus what was spent in it.
  _active · enforced by test · F-PROGRESS_
  - Related: D-103
  - Source: owner-request: product owner decisions on the open questions, 2026-11-16
- **R-PROGRESS-071** A category whose spending in a period exceeds its expectation is shown as overspent.
  _active · enforced by test · F-PROGRESS_
  - Related: D-106
  - Source: owner-request: product owner decisions on the open questions, 2026-11-16
- **R-PROGRESS-090** The progress of any period, current or past, can be read: per category and subcategory the expectation in force then, what was spent and the result, and the period's income, expected, left to assign, spent and result.
  _active · enforced by test · F-PROGRESS_
  - Related: R-COMPARE-001, D-104
  - Source: owner-request: project coordinator brief for the step 3 database, 2026-11-16; code: supabase/migrations/20261116120000_categories_transactions_progress.sql
- **R-PROGRESS-091** A category with transactions dated in a period where it is not in force is shown in that period with nothing expected and its spending counted; what was spent in a category may be negative when refunds exceed expenses.
  _active · enforced by test · F-PROGRESS_
  - Related: D-147, R-CATEGORY-095, R-TRANSACTION-071
  - Source: owner-request: project coordinator brief for the step 3 database, 2026-11-16; code: supabase/migrations/20261116120000_categories_transactions_progress.sql
- **R-PROGRESS-092** A period's totals always equal the sum of its progress rows, computed by the same database functions.
  _active · enforced by test · F-PROGRESS_
  - Related: C-LOGIC-001, R-CATEGORY-091
  - Source: owner-request: project coordinator brief for the step 3 database, 2026-11-16; code: supabase/migrations/20261116120000_categories_transactions_progress.sql
- **R-PROGRESS-050** The dashboard shows the progress of one period, the current one by default (the last once the budget has ended): its income, planned, spent and result as a surplus or a deficit, and per category and subcategory what was planned, spent and is left, each figure under its column header, overspending marked by the database's flag and drawn in proportion (the share beyond the plan), not as a full bar; earlier and later periods are browsed in place, the Periods page links each period to its progress, and each category leads to its transactions in that period.
  _active · enforced by test · F-PROGRESS_
  - Related: R-PROGRESS-090, R-PROGRESS-071, R-PROGRESS-002, R-COMPARE-001, D-137
  - Source: owner-request: coordinator brief for the step 3 screens, 2026-11-16; code: src/features/progress/period-progress-card.tsx; owner-request: coordinator, step 3 screens review fixes, 2026-11-16
- **R-PROGRESS-120** What subscriptions commit is shown with the planned amount it is part of, never added to it and never next to what is spent, left or the name: under the planned figure of the period ("Includes CHF x for subscriptions"), under each category's amount on the budget page and in the planned column of the progress view, and on a narrow card as a sentence that names the planned amount ("The CHF y planned include CHF x for subscriptions").
  _active · enforced by test · F-SUBSCRIPTION_
  - Related: R-SUBSCRIPTION-079, D-173
  - Source: owner-request: coordinator brief for the step 4 screens, 2026-11-16; code: src/features/progress/period-progress-card.tsx; code: src/features/budget/budget-page.tsx; owner-request: coordinator, step 4 screens review round 1, 2026-11-16

### Subscriptions

- **R-SUBSCRIPTION-001** A subscription has a price, a first charge date, a cadence, and a category.
  _active · enforced by test · F-SUBSCRIPTION_
  - Related: Q-006, D-108
  - Source: domain: Subscription; owner-request: product owner decisions on the open questions, 2026-11-16
- **R-SUBSCRIPTION-002** The app shows when the next charge of a subscription will occur.
  _active · enforced by test · F-SUBSCRIPTION_
  - Source: domain: Subscription
- **R-SUBSCRIPTION-070** A subscription's cadence is monthly, quarterly, half-yearly or yearly.
  _active · enforced by test · F-SUBSCRIPTION_
  - Related: D-108
  - Source: owner-request: product owner decisions on the open questions, 2026-11-16
- **R-SUBSCRIPTION-071** After its first charge date, a subscription is charged once per cadence interval on its nominal day of the month (the day of the first charge date, or of a next charge date given with a change), clamped to the length of each month; a clamped date never moves the nominal day.
  _active · enforced by test · F-SUBSCRIPTION_
  - Why: Example: first charged on 31 January, monthly: 28 (or 29) February, 31 March, 30 April.
  - Related: D-108, D-200
  - Source: owner-request: product owner decisions on the open questions, 2026-11-16
- **R-SUBSCRIPTION-072** No weekend rule applies to a subscription's charge dates.
  _active · enforced by test · F-SUBSCRIPTION_
  - Related: D-108
  - Source: owner-request: product owner decisions on the open questions, 2026-11-16
- **R-SUBSCRIPTION-073** On each charge date up to today, in a period where the subscription is in force, a transaction for the price in force in that period is created automatically in its category, linked to the subscription; charges are created by the catch-up that also creates periods (when a member opens the budget, and before every write), so dates missed while nobody opened the app are caught up.
  _active · enforced by test · F-SUBSCRIPTION_
  - Related: D-109, Q-054, D-171
  - Source: owner-request: product owner decisions on the open questions, 2026-11-16; owner-request: project coordinator decision for step 4, 2026-11-16 (the product owner asked to proceed on the coordinator's defaults); code: supabase/migrations/20261117100000_subscriptions_debts.sql
- **R-SUBSCRIPTION-074** A transaction created from a subscription can be edited or deleted like any other transaction.
  _active · enforced by test · F-SUBSCRIPTION_
  - Related: D-109
  - Source: owner-request: product owner decisions on the open questions, 2026-11-16
- **R-SUBSCRIPTION-075** An automatically created subscription charge is marked as awaiting confirmation until a member confirms that it went through; editing it does not confirm it.
  _active · enforced by test · F-SUBSCRIPTION_
  - Related: D-109
  - Source: owner-request: product owner decisions on the open questions, 2026-11-16; owner-request: project coordinator decision for step 4, 2026-11-16 (the product owner asked to proceed on the coordinator's defaults); code: supabase/migrations/20261117100000_subscriptions_debts.sql
- **R-SUBSCRIPTION-076** The dashboard shows a notification for each subscription charge awaiting confirmation, asking whether it really went through.
  _active · enforced by test · F-SUBSCRIPTION_
  - Related: D-109
  - Source: owner-request: product owner decisions on the open questions, 2026-11-16; owner-request: coordinator brief for the step 4 screens, 2026-11-16; code: src/features/subscriptions/components/charges-to-confirm-card.tsx
- **R-SUBSCRIPTION-077** Answering that a subscription charge did not go through removes its transaction, and that charge is never created again.
  _active · enforced by test · F-SUBSCRIPTION_
  - Related: D-109, Q-054, D-171
  - Source: owner-request: product owner decisions on the open questions, 2026-11-16; owner-request: project coordinator decision for step 4, 2026-11-16 (the product owner asked to proceed on the coordinator's defaults); code: supabase/migrations/20261117100000_subscriptions_debts.sql
- **R-SUBSCRIPTION-078** A subscription charge awaiting confirmation counts in totals from the moment it is created.
  _active · enforced by test · F-SUBSCRIPTION_
  - Why: Assumption stated in D-109, by analogy with imported transactions (D-118); the product owner was not asked.
  - Related: D-109, D-118
  - Source: owner-request: product owner decisions on the open questions, 2026-11-16
- **R-SUBSCRIPTION-079** A subscription's monthly cost (its price divided by the months of its cadence, rounded half up to the rappen) is shown as committed within its category's expectation, for each period in which it is in force, not added on top of it.
  _active · enforced by test · F-SUBSCRIPTION_
  - Related: D-110, Q-050, D-173
  - Source: owner-request: product owner decisions on the open questions, 2026-11-16; owner-request: project coordinator decision for step 4, 2026-11-16 (the product owner asked to proceed on the coordinator's defaults); code: supabase/migrations/20261117100000_subscriptions_debts.sql
- **R-SUBSCRIPTION-110** A budget has at most 50 subscriptions in force and 200 in all (void ones not counted); a price is 1 to 1 000 000 000 rappen; a schedule date is at most ten years ahead; and at most 900 subscriptions rows in all, void ones included (R-APP-170).
  _active · enforced by test · F-SUBSCRIPTION_
  - Why: Abuse bounds, generous for a household: with them a catch-up after years of absence stays within a few seconds.
  - Related: D-180, D-264
  - Source: owner-request: database developer decision for step 4, within the coordinator's brief, 2026-11-16; code: supabase/migrations/20261117100000_subscriptions_debts.sql
- **R-SUBSCRIPTION-111** A subscription is charged at most once per scheduled date, however many members open the budget at once or retry: a charge deleted or answered as not gone through is never created again, and no edit, correction or reopen creates a charge for a date already passed.
  _active · enforced by test · F-SUBSCRIPTION_
  - Related: D-171, D-175
  - Source: owner-request: database developer decision for step 4, within the coordinator's brief, 2026-11-16; code: supabase/migrations/20261117100000_subscriptions_debts.sql
- **R-SUBSCRIPTION-112** A subscription counts from the start of its first period: its charges due from then up to today are created when it is created (from an earlier period, as an explicit correction, too). Automatic charges count towards the transaction limit; when the budget is full they wait, none skipped, until there is room. A change that would lose a held charge is refused (R-SUBSCRIPTION-180).
  _active · enforced by test · F-SUBSCRIPTION_
  - Related: D-176
  - Source: owner-request: database developer decision for step 4, within the coordinator's brief, 2026-11-16; code: supabase/migrations/20261117100000_subscriptions_debts.sql
- **R-SUBSCRIPTION-113** Ending a subscription stops its charges from that period on and keeps it in the past; one that never counted before that period and has no transaction is deleted instead. Its charges are never deleted.
  _active · enforced by test · F-SUBSCRIPTION_
  - Related: D-174
  - Source: owner-request: database developer decision for step 4, within the coordinator's brief, 2026-11-16; code: supabase/migrations/20261117100000_subscriptions_debts.sql
- **R-SUBSCRIPTION-114** Changing a subscription's schedule from now sets the date of its next charge (after today), and the later ones follow from it at its cadence; a new cadence without a date continues from the next charge of the current schedule.
  _active · enforced by test · F-SUBSCRIPTION_
  - Related: D-170
  - Source: owner-request: database developer decision for step 4, within the coordinator's brief, 2026-11-16; code: supabase/migrations/20261117100000_subscriptions_debts.sql
- **R-SUBSCRIPTION-120** The subscriptions page lists the subscriptions in force with their price and cadence, category, next charge date, monthly cost and, in words with an icon, how many charges await confirmation; the total committed per month is the current period's committed figure; ended subscriptions are folded away; with none, the page says what subscriptions are for and offers to add one. Every date and figure is the database's.
  _active · enforced by test · F-SUBSCRIPTION_
  - Related: R-SUBSCRIPTION-002, R-SUBSCRIPTION-079, C-LOGIC-003
  - Source: owner-request: coordinator brief for the step 4 screens, 2026-11-16; code: src/features/subscriptions/subscriptions-page.tsx
- **R-SUBSCRIPTION-121** The subscription form previews the charges its save would make, as preview_create_subscription and preview_update_subscription give them for exactly the save's arguments (a correction's period included), and says in words how many are recorded at once, to confirm (charged_at_once), or that no charge falls before the budget ends; it never computes a schedule itself. An edit says that new terms apply from the current period and past periods keep theirs; a new next charge date from now must be after today; counting from an earlier period is an explicit, warned correction.
  _active · enforced by test · F-SUBSCRIPTION_
  - Related: R-SUBSCRIPTION-071, R-SUBSCRIPTION-114, D-170, D-193, R-SUBSCRIPTION-133, D-230
  - Source: owner-request: coordinator brief for the step 4 screens, 2026-11-16; code: src/features/subscriptions/components/subscription-form-dialog.tsx; owner-request: coordinator, step 4 screens review round 2, 2026-11-16; code: src/features/subscriptions/components/charge-dates-preview.tsx; code: src/features/subscriptions/subscription-queries.ts
- **R-SUBSCRIPTION-122** A subscription's price, cadence and new next charge date are one field for concurrent edits: shown as one value of the other member's version, kept or taken whole by "Keep mine", and saved together whenever any of them differs.
  _active · enforced by test · F-SUBSCRIPTION_
  - Related: D-160, R-CONCURRENCY-091, D-196
  - Source: owner-request: coordinator brief for the step 4 screens, 2026-11-16; code: src/features/subscriptions/subscription-views.ts; code: src/features/subscriptions/subscription-mutations.ts
- **R-SUBSCRIPTION-123** The transactions list marks automatic charges and, in words with an icon, those awaiting confirmation, and lets a member answer them there as on the dashboard; debt payments name their debt.
  _active · enforced by test · F-SUBSCRIPTION_
  - Related: R-SUBSCRIPTION-075, R-SUBSCRIPTION-076, D-195
  - Source: owner-request: coordinator brief for the step 4 screens, 2026-11-16; code: src/features/transactions/transactions-page.tsx
- **R-SUBSCRIPTION-124** Removing a subscription says beforehand, from the database's answer (preview_end_subscription), whether it is deleted or ended from the current period (its charges kept, those awaiting confirmation still to answer); ending it from an earlier period is an explicit, warned correction.
  _active · enforced by test · F-SUBSCRIPTION_
  - Related: R-SUBSCRIPTION-113, R-SUBSCRIPTION-136
  - Source: owner-request: coordinator brief for the step 4 screens, 2026-11-16; code: src/features/subscriptions/components/end-subscription-dialog.tsx; owner-request: coordinator, step 4 screens review round 2, 2026-11-16
- **R-SUBSCRIPTION-140** A subscription's edit form, as a correction, starts from the price, cadence and category of the period chosen and sends only what changed; it is not saved before the subscription has been read afresh; when another member ended the subscription meanwhile, it says so once and offers no save.
  _active · enforced by test · F-SUBSCRIPTION_
  - Related: R-VERSION-140, R-CONCURRENCY-091, D-210
  - Source: owner-request: coordinator, step 4 screens review round 1, 2026-11-16; code: src/features/subscriptions/components/subscription-form-dialog.tsx; code: src/features/subscriptions/subscription-mutations.ts
- **R-SUBSCRIPTION-141** Ending a subscription or a debt, from now or from an earlier period, says beforehand the one outcome preview_end_subscription or preview_remove_debt gives for that period: deleted, ended, or the refusal in words (then nothing can be confirmed); the title and the button say the same, never "End or delete".
  _active · enforced by test · F-SUBSCRIPTION_
  - Related: R-SUBSCRIPTION-124, R-DEBT-122, D-214, Q-131, R-SUBSCRIPTION-136, R-DEBT-138, D-220
  - Source: owner-request: coordinator, step 4 screens review round 1, 2026-11-16; code: src/features/subscriptions/components/end-subscription-dialog.tsx; code: src/features/debts/components/remove-debt-dialog.tsx; owner-request: coordinator, step 4 screens review round 2, 2026-11-16; code: src/features/budgets/removal-preview.ts
- **R-SUBSCRIPTION-142** The dashboard's charges card says how many charges await in all (my_budgets.charges_awaiting), lists the five oldest with a link to the others (the transactions filtered to those awaiting), and offers "All went through" behind a confirmation that states how many and the dates they span, then says how many were confirmed, also when that is not the number stated; it names a charge by its own date (with the date it was scheduled for when it was moved), and after an answer keeps the focus in the list (the next charge, or the page heading once none is left). The transactions list filtered to the charges awaiting offers the same "All went through".
  _active · enforced by test · F-SUBSCRIPTION_
  - Related: R-SUBSCRIPTION-076, D-212, R-SUBSCRIPTION-134, R-SUBSCRIPTION-135
  - Source: owner-request: coordinator, step 4 screens review round 1, 2026-11-16; code: src/features/subscriptions/components/charges-to-confirm-card.tsx; owner-request: coordinator, step 4 screens review round 2, 2026-11-16; code: src/features/subscriptions/components/confirm-all-charges.tsx
- **R-SUBSCRIPTION-130** A subscription's terms keep its nominal day of the month apart from its anchor date: a schedule re-anchored on a clamped date (a change of cadence without a date) keeps charging on the nominal day, never drifting to the clamped one.
  _active · enforced by test · F-SUBSCRIPTION_
  - Related: R-SUBSCRIPTION-071, D-200
  - Source: owner-request: coordinator review of the step 4 database, 2026-11-16; code: supabase/migrations/20261117100000_subscriptions_debts.sql
- **R-SUBSCRIPTION-131** A charge is pending only when a subscription's next scheduled date has come and the budget has room for it; a read with nothing due neither waits for a writer nor writes; a subscription's revision and updated_at change with an edit, never with the catch-up's bookkeeping.
  _active · enforced by test · F-SUBSCRIPTION_
  - Related: R-SECURITY-006, D-204
  - Source: owner-request: coordinator review of the step 4 database, 2026-11-16; code: supabase/migrations/20261117100000_subscriptions_debts.sql
- **R-SUBSCRIPTION-132** A subscription's next charge date is not given when it falls after the budget's end (it will never be charged).
  _active · enforced by test · F-SUBSCRIPTION_
  - Related: R-SUBSCRIPTION-002
  - Source: owner-request: coordinator review of the step 4 database, 2026-11-16; code: supabase/migrations/20261117100000_subscriptions_debts.sql
- **R-SUBSCRIPTION-133** The charge dates a subscription form previews come from the database with the write's own arguments and schedule (preview_create_subscription, preview_update_subscription), so the charges then created are the ones shown.
  _active · enforced by test · F-SUBSCRIPTION_
  - Related: R-SUBSCRIPTION-121, D-193
  - Source: owner-request: coordinator review of the step 4 database, 2026-11-16; code: supabase/migrations/20261117100000_subscriptions_debts.sql
- **R-SUBSCRIPTION-134** A member can confirm, in one call, every charge awaiting confirmation up to a date; two members doing it at once confirm each charge once.
  _active · enforced by test · F-SUBSCRIPTION_
  - Related: R-SUBSCRIPTION-075, D-195
  - Source: owner-request: coordinator review of the step 4 database, 2026-11-16; code: supabase/migrations/20261117100000_subscriptions_debts.sql
- **R-SUBSCRIPTION-135** The number of charges awaiting confirmation in a budget is read with the budget (my_budgets.charges_awaiting).
  _active · enforced by test · F-SUBSCRIPTION_
  - Related: R-SUBSCRIPTION-076
  - Source: owner-request: coordinator addendum to the step 4 database review (screens asks), 2026-11-16; code: supabase/migrations/20261117100000_subscriptions_debts.sql
- **R-SUBSCRIPTION-136** What ending a subscription from a chosen period would do (deleted, ended, or the refusal) can be asked beforehand, with the same conditions as the write.
  _active · enforced by test · F-SUBSCRIPTION_
  - Related: R-SUBSCRIPTION-113, R-SUBSCRIPTION-124
  - Source: owner-request: coordinator addendum to the step 4 database review (screens asks), 2026-11-16; code: supabase/migrations/20261117100000_subscriptions_debts.sql
- **R-SUBSCRIPTION-150** A subscription's charge day is said as the day of the month, and for the 29th to the 31st as "on the 31st, or on the last day of a shorter month"; an edit that changes only the cadence says that the charge day stays.
  _active · enforced by test · F-SUBSCRIPTION_
  - Related: R-SUBSCRIPTION-130
  - Source: owner-request: coordinator, step 4 screens review round 2, 2026-11-16; code: src/features/subscriptions/subscription-views.ts
- **R-SUBSCRIPTION-151** A subscription in force without a next charge date, in a budget with an end date, says "No further charge before the budget ends".
  _active · enforced by test · F-SUBSCRIPTION_
  - Related: R-SUBSCRIPTION-132
  - Source: owner-request: coordinator, step 4 screens review round 2, 2026-11-16; code: src/features/subscriptions/subscriptions-page.tsx
- **R-SUBSCRIPTION-180** While a charge of a subscription is due and held back by the transaction limit, its schedule (cadence or next charge date, from now or as a correction) cannot change and it cannot end (charge_held_back, in the previews too); its name, price and category can; its next charge date shows the held date, and so does the first date of its schedule preview.
  _active · enforced by test · F-SUBSCRIPTION_
  - Related: D-271, D-388, R-SUBSCRIPTION-112
  - Source: owner-request: coordinator, independent re-review of the step 4 database fixes, 2026-11-16; code: supabase/migrations/20261117100000_subscriptions_debts.sql
- **R-SUBSCRIPTION-190** A subscription whose next charge date has come is shown as waiting since that date, with the reason in words (the budget holds the most transactions it can); charge_held_back, from a schedule change, an end or the end dialog's preview, is said in words with what to do first.
  _active · enforced by test · F-SUBSCRIPTION_
  - Related: R-SUBSCRIPTION-180, D-271
  - Source: owner-request: coordinator, step 4 screens adapted to the database re-review and step 5, 2026-11-16; code: src/features/subscriptions/subscriptions-page.tsx
- **R-SUBSCRIPTION-191** After a charge is answered (it went through, or it did not after its confirmation), from the dashboard card or the transactions filtered to those awaiting, the focus goes to the charge now in its place, else to a named place (the page's heading, the period filter), never to the page's body; the filtered list offers both answers on each row; removing a link filter moves the focus to the next filter or the period filter.
  _active · enforced by test · F-SUBSCRIPTION_
  - Related: R-SUBSCRIPTION-142, R-TRANSACTION-150
  - Source: owner-request: coordinator, final review of the step 4 screens (addendum C), 2026-11-16; code: src/features/subscriptions/components/charges-to-confirm-card.tsx; code: src/features/transactions/transactions-page.tsx
- **R-SUBSCRIPTION-320** When the schedule preview of a subscription edit is refused because a charge is held back (charge_held_back, D-388), the form says so before saving and does not offer the save.
  _active · enforced by test · F-SUBSCRIPTION_
  - Related: D-388, R-SUBSCRIPTION-121
  - Source: owner-request: coordinator brief for the step 6 screens (part A, contract changes), 2026-11-16; code: src/features/subscriptions/components/subscription-form-dialog.tsx

### Debts

- **R-DEBT-001** Debts can be created, updated and removed: a debt that never counted and has no payment, interest or adjustment is deleted; otherwise it ends and keeps its history.
  _active · enforced by test · F-DEBT_
  - Source: domain: Debt; owner-request: project coordinator decision for step 4, 2026-11-16 (the product owner asked to proceed on the coordinator's defaults); code: supabase/migrations/20261117100000_subscriptions_debts.sql
- **R-DEBT-002** A debt has a principal, an optional interest rate, and a planned monthly payment.
  _active · enforced by test · F-DEBT_
  - Source: domain: Debt
- **R-DEBT-003** A debt's remaining amount is its principal plus the interest added to it plus its balance adjustments, minus the payments linked to it; it may be negative when overpaid.
  _active · enforced by test · F-DEBT_
  - Related: Q-007, D-113
  - Source: domain: Debt; owner-request: product owner decisions on the open questions, 2026-11-16; owner-request: project coordinator decision for step 4, 2026-11-16 (the product owner asked to proceed on the coordinator's defaults); code: supabase/migrations/20261117100000_subscriptions_debts.sql
- **R-DEBT-004** The app shows a debt's history: its payments, the interest added each period and its balance adjustments.
  _active · enforced by test · F-DEBT_
  - Related: D-113
  - Source: domain: Debt; owner-request: product owner decisions on the open questions, 2026-11-16
- **R-DEBT-005** The app shows a debt's expected end date, projected from its remaining amount, its interest rate and its planned monthly payment in force now: the end of the period in which the last planned payment falls.
  _active · enforced by test · F-DEBT_
  - Related: Q-007, D-113
  - Source: domain: Debt; owner-request: product owner decisions on the open questions, 2026-11-16; owner-request: project coordinator decision for step 4, 2026-11-16 (the product owner asked to proceed on the coordinator's defaults); code: supabase/migrations/20261117100000_subscriptions_debts.sql
- **R-DEBT-070** A debt is tied to one category at a time; the category is part of its terms, so a change from a period on keeps the category of the periods before.
  _active · enforced by test · F-DEBT_
  - Related: D-112, D-207
  - Source: owner-request: product owner decisions on the open questions, 2026-11-16
- **R-DEBT-071** A debt payment is a normal transaction in the debt's category, linked to the debt.
  _active · enforced by test · F-DEBT_
  - Related: D-112, R-TRANSACTION-003
  - Source: owner-request: product owner decisions on the open questions, 2026-11-16
- **R-DEBT-072** Only money the household owes is tracked as a debt; money owed to the household is not.
  _active · enforced by review · F-DEBT_
  - Related: D-112
  - Source: owner-request: product owner decisions on the open questions, 2026-11-16
- **R-DEBT-073** When a period is created, however it comes to exist (roll-over, catch-up over several periods, an early salary), each debt in force in it, opened before its start, that has an interest rate and a positive balance from everything dated before the period's start gets one twelfth of its yearly rate applied to that balance, rounded half up to the rappen, added to it as an interest entry of that period.
  _active · enforced by test · F-DEBT_
  - Related: D-113, Q-055, D-272
  - Source: owner-request: product owner decisions on the open questions, 2026-11-16; owner-request: project coordinator decision for step 4, 2026-11-16 (the product owner asked to proceed on the coordinator's defaults); code: supabase/migrations/20261117100000_subscriptions_debts.sql
- **R-DEBT-074** When the planned monthly payment is less than or equal to one period's interest on the remaining amount, the app says the debt never ends instead of showing an end date.
  _active · enforced by test · F-DEBT_
  - Related: D-113, Q-055, D-272
  - Source: owner-request: product owner decisions on the open questions, 2026-11-16; owner-request: project coordinator decision for step 4, 2026-11-16 (the product owner asked to proceed on the coordinator's defaults); code: supabase/migrations/20261117100000_subscriptions_debts.sql
- **R-DEBT-075** A member can adjust a debt's balance to match the bank statement: the database adds an adjustment entry for the difference, so the remaining amount becomes the balance entered.
  _active · enforced by test · F-DEBT_
  - Related: D-113
  - Source: owner-request: product owner decisions on the open questions, 2026-11-16; owner-request: project coordinator decision for step 4, 2026-11-16 (the product owner asked to proceed on the coordinator's defaults); code: supabase/migrations/20261117100000_subscriptions_debts.sql
- **R-DEBT-110** A budget has at most 50 debts in force and 200 in all (void ones not counted) and 5000 balance adjustments; a principal and a planned payment are at most 1 000 000 000 rappen, a rate 0 to 100 % with at most three decimals, and a remaining amount never grows beyond CHF 10 billion; and at most 900 debts rows in all, void ones included (R-APP-170).
  _active · enforced by test · F-DEBT_
  - Why: Abuse bounds; the balance bound keeps every amount within range however long interest runs.
  - Related: D-180, D-264
  - Source: owner-request: database developer decision for step 4, within the coordinator's brief, 2026-11-16; code: supabase/migrations/20261117100000_subscriptions_debts.sql
- **R-DEBT-111** Interest is applied at most once per debt and period, however many members open the budget at once or retry, and a reopen followed by a new roll-over applies it once again.
  _active · enforced by test · F-DEBT_
  - Related: D-272
  - Source: owner-request: database developer decision for step 4, within the coordinator's brief, 2026-11-16; code: supabase/migrations/20261117100000_subscriptions_debts.sql
- **R-DEBT-112** The expected end is projected period by period: the planned payment still due in the current period first, then each later period adds its interest and receives the planned payment; beyond 600 periods (50 years) the answer is that the debt never ends.
  _active · enforced by test · F-DEBT_
  - Related: D-272, D-181
  - Source: owner-request: database developer decision for step 4, within the coordinator's brief, 2026-11-16; code: supabase/migrations/20261117100000_subscriptions_debts.sql
- **R-DEBT-113** A reopen that merges a period removes the interest that period added (and the reopen preview says so); removing a debt with history ends it and keeps its payments, interest and adjustments, and its remaining amount.
  _active · enforced by test · F-DEBT_
  - Related: D-272, D-174
  - Source: owner-request: database developer decision for step 4, within the coordinator's brief, 2026-11-16; code: supabase/migrations/20261117100000_subscriptions_debts.sql
- **R-DEBT-114** A debt's principal can be corrected only while it has no payment, interest or adjustment; afterwards its balance is adjusted instead. A correction of its terms from an earlier period never recomputes interest already added.
  _active · enforced by test · F-DEBT_
  - Related: D-178
  - Source: owner-request: database developer decision for step 4, within the coordinator's brief, 2026-11-16; code: supabase/migrations/20261117100000_subscriptions_debts.sql
- **R-DEBT-120** A debt's interest rate is typed as a percentage, optional, from 0 to 100 with at most three decimals (a comma or a dot), read and checked as a decimal string, never through float arithmetic, and sent exactly as typed.
  _active · enforced by test · F-DEBT_
  - Related: R-DEBT-110, C-MONEY-001
  - Source: owner-request: coordinator brief for the step 4 screens, 2026-11-16; code: src/lib/interest-rate.ts
- **R-DEBT-121** The debts page shows each debt in force with its remaining amount, how much is paid off (a bar with its figure in words, from paid_percent), its planned payment and rate, and the database's projection in words: "Paid off", "Ends around <month year> · N payments left" said to be an estimate (and, when expected_end_after_budget_end, that this is after the budget ends), or a "Never ends at this payment" warning with an icon; and what is still owed in all, with how many debts owe it, from debt_totals. An overpaid debt is shown as paid off and overpaid by overpaid_by, never with a negative remaining amount. Nothing is added up in the client. With no planned payment, it says so rather than "never ends".
  _active · enforced by test · F-DEBT_
  - Related: R-DEBT-005, R-DEBT-074, R-DEBT-112, D-191, R-DEBT-132, R-DEBT-133, R-DEBT-136, R-DEBT-137, D-216
  - Source: owner-request: coordinator brief for the step 4 screens, 2026-11-16; code: src/features/debts/debts-page.tsx; code: src/features/debts/components/payoff.tsx; owner-request: coordinator, step 4 screens review round 1, 2026-11-16; owner-request: coordinator, step 4 screens review round 2, 2026-11-16; code: src/features/debts/debt-queries.ts
- **R-DEBT-122** A debt's page shows its evolution as a step chart of the balance by date, each kind of event with its own mark, and the same history as a table (its text alternative): the chart reads the history oldest first, a page at a time, up to 10 000 events and says where it stops when the history is longer; the table lists the latest events first (R-DEBT-191). Payments lead to their transactions. It records a payment, adjusts the balance (the user types the balance the bank shows and is told the database stores the difference), deletes an adjustment (with the debt's revision), edits the debt (its principal only while it has no history), removes it, saying beforehand whether it is deleted or ended, and links to its payments among the transactions.
  _active · enforced by test · F-DEBT_
  - Related: R-DEBT-004, R-DEBT-075, R-DEBT-114, D-190, D-192, R-DEBT-135, D-232, R-DEBT-191, D-290
  - Source: owner-request: coordinator brief for the step 4 screens, 2026-11-16; code: src/features/debts/debt-detail-page.tsx; code: src/features/debts/components/debt-chart.tsx; code: src/features/debts/components/adjust-balance-dialog.tsx; code: src/features/debts/components/remove-debt-dialog.tsx; owner-request: coordinator, step 4 screens review round 2, 2026-11-16; owner-request: coordinator, step 4 screens adapted to the database re-review and step 5, 2026-11-16
- **R-DEBT-123** The transaction form offers "This is a payment on …" for an expense, among the debts not ended (and the one a payment already pays); a payment stays an expense; on an existing transaction the fields and the link change in one update_transaction call (p_relink), so a refused save leaves the transaction and both debts as they were, and the message names the database's reason.
  _active · enforced by test · F-DEBT_
  - Related: R-DEBT-071, R-TRANSACTION-110, D-177, D-194, R-TRANSACTION-131, D-218
  - Source: owner-request: coordinator brief for the step 4 screens, 2026-11-16; code: src/features/transactions/components/transaction-form-dialog.tsx; code: src/features/transactions/transaction-mutations.ts; owner-request: coordinator, step 4 screens review round 2, 2026-11-16
- **R-DEBT-140** A debt's edit form, as a correction, starts from the category, rate and planned payment of the period chosen (get_debt_terms) and sends only what changed, the category offered being those in force in that period; the starting amount can be edited only while the debt, as read afresh, has no history (a payment recorded meanwhile locks it); when another member ended the debt meanwhile, the form says so once and offers no save.
  _active · enforced by test · F-DEBT_
  - Related: R-VERSION-140, R-DEBT-114, D-210, D-219, D-230
  - Source: owner-request: coordinator, step 4 screens review round 1, 2026-11-16; code: src/features/debts/components/debt-form-dialog.tsx; code: src/features/debts/debt-mutations.ts; owner-request: coordinator, step 4 screens review round 2, 2026-11-16
- **R-DEBT-131** A debt's principal is the balance on its opened date; no payment, balance adjustment or interest is dated before it, also after a period's boundaries change, so its history always starts with the opening. A debt recorded from an earlier period is opened on that period's start.
  _active · enforced by test · F-DEBT_
  - Related: D-202, D-386, R-DEBT-003
  - Source: owner-request: coordinator review of the step 4 database, 2026-11-16; code: supabase/migrations/20261117100000_subscriptions_debts.sql
- **R-DEBT-132** A projected end after the budget's end is flagged as such (expected_end_after_budget_end).
  _active · enforced by test · F-DEBT_
  - Related: R-DEBT-005
  - Source: owner-request: coordinator review of the step 4 database, 2026-11-16; code: supabase/migrations/20261117100000_subscriptions_debts.sql
- **R-DEBT-133** What a budget still owes is the sum of the positive remaining amounts of its debts in force (an overpaid or paid-off debt adds nothing), given with the number of debts still owing.
  _active · enforced by test · F-DEBT_
  - Related: Q-110, D-216
  - Source: owner-request: coordinator addendum to the step 4 database review (screens asks), 2026-11-16; code: supabase/migrations/20261117100000_subscriptions_debts.sql
- **R-DEBT-134** An ended debt is frozen: no payment can be linked to it, changed or removed, no balance adjustment added or removed, and none of its fields or terms changed (update_debt answers debt_ended), so its remaining amount stays.
  _active · enforced by test · F-DEBT_
  - Related: R-DEBT-113, D-209
  - Source: owner-request: coordinator review of the step 4 database, 2026-11-16; code: supabase/migrations/20261117100000_subscriptions_debts.sql
- **R-DEBT-135** A debt's history is read a page at a time (at most 1000 rows), each page continuing after the last row of the one before, the running balance over the whole history.
  _active · enforced by test · F-DEBT_
  - Related: R-DEBT-004
  - Source: owner-request: coordinator review of the step 4 database, 2026-11-16; code: supabase/migrations/20261117100000_subscriptions_debts.sql
- **R-DEBT-136** The amount a debt is overpaid by is given (zero unless its remaining amount is negative).
  _active · enforced by test · F-DEBT_
  - Related: R-DEBT-003
  - Source: owner-request: coordinator addendum to the step 4 database review (screens asks), 2026-11-16; code: supabase/migrations/20261117100000_subscriptions_debts.sql
- **R-DEBT-137** A debt's paid share is its payments as a whole percent, rounded down, of its principal plus its interest plus its adjustments: 100 exactly when nothing remains, 0 while nothing has been paid.
  _active · enforced by test · F-DEBT_
  - Related: D-215
  - Source: owner-request: coordinator addendum to the step 4 database review (screens asks), 2026-11-16; code: supabase/migrations/20261117100000_subscriptions_debts.sql
- **R-DEBT-138** What removing a debt from a chosen period would do (deleted, ended, or the refusal) can be asked beforehand, with the same conditions as the write.
  _active · enforced by test · F-DEBT_
  - Related: R-DEBT-001
  - Source: owner-request: coordinator addendum to the step 4 database review (screens asks), 2026-11-16; code: supabase/migrations/20261117100000_subscriptions_debts.sql
- **R-DEBT-150** A payment or a balance adjustment is not dated before the debt was opened: the payment form, its debt choice and the adjust dialog say the earliest date, refuse an earlier one before sending, and the database's before_debt_opened reads the same.
  _active · enforced by test · F-DEBT_
  - Related: R-DEBT-131, D-202
  - Source: owner-request: coordinator, step 4 screens review round 2, 2026-11-16; code: src/features/transactions/components/transaction-form-dialog.tsx; code: src/features/debts/components/adjust-balance-dialog.tsx
- **R-DEBT-151** An ended debt is frozen on screen too: its payments can be looked at but not changed, deleted or relinked, it cannot be adjusted and its adjustments cannot be deleted; the actions are absent or disabled with the reason, and the database's debt_ended is said for what was tried (a new payment, a payment change, an adjustment, an adjustment's deletion).
  _active · enforced by test · F-DEBT_
  - Related: R-DEBT-134, D-209
  - Source: owner-request: coordinator, step 4 screens review round 2, 2026-11-16; code: src/features/transactions/components/transaction-form-dialog.tsx; code: src/features/transactions/transactions-page.tsx; code: src/features/debts/debt-detail-page.tsx
- **R-DEBT-152** In the transaction form, choosing the debt a payment is for sets its category: the category of the debt's terms in force in the period of the date (get_debt_terms), said under the choice; a debt not in force on that date is said so and nothing is saved.
  _active · enforced by test · F-DEBT_
  - Related: R-TRANSACTION-110, D-207
  - Source: owner-request: coordinator, step 4 screens review round 2, 2026-11-16; code: src/features/transactions/components/transaction-form-dialog.tsx
- **R-DEBT-180** A period's interest for a debt is computed once, when the period is created, on the balance from everything dated before the period's start (opening, payments, adjustments, earlier interest), whatever day the catch-up runs; a debt not opened before the period's start gets none for it; a period created again after a reopen gets it again by the same rule.
  _active · enforced by test · F-DEBT_
  - Related: R-DEBT-073, D-272
  - Source: owner-request: coordinator, independent re-review of the step 4 database fixes, 2026-11-16; code: supabase/migrations/20261117100000_subscriptions_debts.sql
- **R-DEBT-181** A debt's history can also be read newest first, a page at a time with the same cursor, each row with the same running balance as oldest first.
  _active · enforced by test · F-DEBT_
  - Related: R-DEBT-135, D-275
  - Source: owner-request: coordinator addendum (screens round 2 findings), 2026-11-16; code: supabase/migrations/20261117100000_subscriptions_debts.sql
- **R-DEBT-190** An ended debt cannot be edited: its menu says why, its form (if open) offers no save with the reason, and update_debt's debt_ended reads the same.
  _active · enforced by test · F-DEBT_
  - Related: R-DEBT-134, R-DEBT-151
  - Source: owner-request: coordinator, step 4 screens adapted to the database re-review and step 5, 2026-11-16; code: src/features/debts/components/debt-form-dialog.tsx
- **R-DEBT-191** A debt's history table shows the latest events first, 50 at a time, older ones read with get_debt_history's newest-first cursor; the chart reads oldest first.
  _active · enforced by test · F-DEBT_
  - Related: R-DEBT-122, R-DEBT-135, D-290
  - Source: owner-request: coordinator, step 4 screens adapted to the database re-review and step 5, 2026-11-16; code: src/features/debts/debt-detail-page.tsx
- **R-DEBT-340** A period's start cannot move to on or before the opening of a debt that has an interest entry in that period (interest_before_opening, also in the preview); no interest entry is ever removed by a moved start.
  _active · enforced by test · F-DEBT_
  - Related: D-467, R-DEBT-131
  - Source: owner-request: coordinator follow-up to the step 6 database fix round 2 (5f57c5a), 2026-11-16; code: supabase/migrations/20261117100000_subscriptions_debts.sql

### Browsing and comparing periods

- **R-COMPARE-001** Users can browse past periods and see the progress view of each.
  _active · enforced by test · F-PROGRESS_
  - Why: Built with step 3 (D-104); the id keeps its original area.
  - Related: Q-010, D-104
  - Source: domain: Period; owner-request: product owner decisions on the open questions, 2026-11-16
- **R-COMPARE-002** For each of the last periods (12 by default; 6, 12 or 24 to choose), up to the current one, the comparison shows the income total, the total spent, the result and the planned total, the current period marked as still running; the figures are those of the period's own totals.
  _active · enforced by test · F-COMPARE_
  - Related: D-114, D-260
  - Source: domain: Period; owner-request: product owner decisions on the open questions, 2026-11-16; owner-request: coordinator brief for the step 5 database (period comparison), 2026-11-16; code: supabase/migrations/20261118100000_period_comparison.sql
- **R-COMPARE-070** For the same periods, the comparison shows the spending and the planned amount per category: groups and ordinary categories at the top level, a group's subcategories below it; each category is one line across the periods, and in each period its figures are those of that period's progress view; one row per category line, its per-period figures aligned with the periods of the trend.
  _active · enforced by test · F-COMPARE_
  - Related: D-114, D-260
  - Source: owner-request: product owner decisions on the open questions, 2026-11-16; owner-request: coordinator brief for the step 5 database (period comparison), 2026-11-16; code: supabase/migrations/20261118100000_period_comparison.sql
- **R-COMPARE-071** The user can show any two periods of the budget side by side (by default the last two completed periods, or the last two periods when fewer than two are completed): per category the spending and the planned amount in each and the difference in spending, B minus A, and the same for the totals (income, spent, result, committed); each side says whether it is still running or completed.
  _active · enforced by test · F-COMPARE_
  - Related: D-114, D-260, D-384
  - Source: owner-request: product owner decisions on the open questions, 2026-11-16; owner-request: coordinator brief for the step 5 database (period comparison), 2026-11-16; code: supabase/migrations/20261118100000_period_comparison.sql
- **R-COMPARE-170** In every period of a comparison, the top-level category lines add up exactly to the period's total spent (expenses minus refunds; extra income is not spending), and so do the subcategory and ordinary category lines; every expense or refund has a category, so no spending is left outside the lines.
  _active · enforced by test · F-COMPARE_
  - Related: R-PROGRESS-002, D-262
  - Source: owner-request: coordinator brief for the step 5 database (period comparison), 2026-11-16; code: supabase/migrations/20261118100000_period_comparison.sql
- **R-COMPARE-171** A comparison covers the last 1 to 24 periods up to the current one, or up to the last one once the budget has ended, oldest first; a budget with fewer periods gives all it has; a period merged by a reopen is no longer one of them.
  _active · enforced by test · F-COMPARE_
  - Related: R-PERIOD-130, D-263
  - Source: owner-request: coordinator brief for the step 5 database (period comparison), 2026-11-16; code: supabase/migrations/20261118100000_period_comparison.sql
- **R-COMPARE-172** Averages per period (income, spent, result, and spent per category) are taken over the completed periods of the range only, to the rappen with halves rounded away from zero, and are empty (not zero) when no period of the range is completed; a category also has an average over the completed periods of the range in which it was in force or had spending, empty when there is none.
  _active · enforced by test · F-COMPARE_
  - Related: D-261, D-383, Q-160
  - Source: owner-request: coordinator brief for the step 5 database (period comparison), 2026-11-16; code: supabase/migrations/20261118100000_period_comparison.sql
- **R-COMPARE-173** Each period of a comparison gives its start, its end and its number of days; amounts are never scaled to the period's length.
  _active · enforced by test · F-COMPARE_
  - Related: Q-080, R-PERIOD-020
  - Source: owner-request: coordinator brief for the step 5 database (period comparison), 2026-11-16; code: supabase/migrations/20261118100000_period_comparison.sql
- **R-COMPARE-174** A category is one line across periods by its identity, under its current name and in its current place, also when it was renamed, ended, restored, emptied into "Other" or left void by a reopen; where it was not in force it plans nothing (empty, not zero) but still counts what was spent on it; in two periods side by side, a period where the category has nothing at all is empty, not zero.
  _active · enforced by test · F-COMPARE_
  - Related: R-CATEGORY-095, D-262
  - Source: owner-request: coordinator brief for the step 5 database (period comparison), 2026-11-16; code: supabase/migrations/20261118100000_period_comparison.sql
- **R-COMPARE-175** The comparison reads catch the budget up like opening it does and write nothing else; while a very long absence is still being caught up they answer that it is (catching_up) instead of a shortened range.
  _active · enforced by test · F-COMPARE_
  - Related: R-PERIOD-130, R-SECURITY-006
  - Source: owner-request: coordinator brief for the step 5 database (period comparison), 2026-11-16; code: supabase/migrations/20261118100000_period_comparison.sql
- **R-COMPARE-176** Only members of a budget can read its comparison; another user and an anonymous visitor get nothing.
  _active · enforced by test · F-COMPARE_
  - Related: R-SECURITY-002, C-DBTEST-002, C-DBTEST-003
  - Source: owner-request: coordinator brief for the step 5 database (period comparison), 2026-11-16; code: supabase/migrations/20261118100000_period_comparison.sql
- **R-COMPARE-190** The comparison is its own page, "Compare", in the sidebar right after the dashboard, with three views: the trend, the categories over time and two periods side by side. The view and its choices (6, 12 or 24 periods, the selected period, the lines drawn, the planned amounts shown, periods A and B, the order) are in the address, so a link opens the same view; the page loads with its charts only when opened.
  _active · enforced by test · F-COMPARE_
  - Related: R-COMPARE-002, R-COMPARE-070, R-COMPARE-071, R-COMPARE-171, D-295
  - Source: owner-request: coordinator, step 4 screens adapted to the database re-review and step 5, 2026-11-16; code: src/features/compare/compare-page.tsx
- **R-COMPARE-191** The trend shows, for each period of the range, its dates, its number of days, its income, spending, planned total and result as get_period_trend gives them, in two charts (income and spending as columns with the planned total as a line; the result as columns from zero) and in a table listing every figure. The running period is marked in words and said never to be averaged; the averages say over how many completed periods they are taken, or "no completed period yet" instead of an amount; when period lengths differ by more than a tenth the page says amounts are not adjusted for length. Selecting a period offers to open it and to compare it with another.
  _active · enforced by test · F-COMPARE_
  - Related: R-COMPARE-002, R-COMPARE-172, R-COMPARE-173, D-296, D-297
  - Source: owner-request: coordinator, step 4 screens adapted to the database re-review and step 5, 2026-11-16; code: src/features/compare/components/trend-view.tsx
- **R-COMPARE-192** The categories view lists every category line by period as get_category_trend gives it: groups at the top level, opened on their subcategories (the open ones kept in the address); each period column with its dates, its number of days and the year where it changes; each line's average after the periods; in each period the spending (a link to that category's transactions in that period, also when they net to zero), the planned amount on request, spending above the plan marked with a sign and words, and "—", said as not planned, where the category was not in force and nothing was recorded (never 0). When period lengths differ by more than a tenth it says amounts are not adjusted. A chart draws up to five lines the user picks (every tick counts, however quick), by default the three top-level lines with the highest average; each line has the hue, the mark and the dash of its slot, kept while others are added or removed, and the running period is shaded and named. On a phone the name column is narrow and wraps, so at 320 px at least one whole period column is readable beside it, and a focused cell is never hidden under the sticky column or header.
  _active · enforced by test · F-COMPARE_
  - Related: R-COMPARE-070, R-COMPARE-174, D-297, D-405, D-407
  - Source: owner-request: coordinator, step 4 screens adapted to the database re-review and step 5, 2026-11-16; code: src/features/compare/components/categories-view.tsx; owner-request: coordinator, independent review of the step 4 and step 5 screens at a24615e, 2026-11-16
- **R-COMPARE-193** The categories view shows its lines only against the periods they belong to: get_category_trend's period_ids must equal get_period_trend's periods for the same count; when they differ (a period was created or merged between the two reads) both are read again, three times in all, and then the view reports an error with a retry rather than misaligned figures.
  _active · enforced by test · F-COMPARE_
  - Related: R-COMPARE-070, R-COMPARE-170
  - Source: owner-request: coordinator, step 4 screens adapted to the database re-review and step 5, 2026-11-16; code: src/features/compare/compare-queries.ts; owner-request: coordinator, independent review of the step 4 and step 5 screens at a24615e, 2026-11-16
- **R-COMPARE-194** Side by side, the database chooses the default periods (no id sent); the user picks A and B among every period (older ones on request, a chosen old one still shown in its picker) and can swap them. The totals (income, spent, result, planned, subscriptions) then each category, in the budget's order or biggest changes first, show A, B and the difference B minus A with its sign, an arrow and its direction in words (never colour alone); on request each category's planned amount in A and B and its difference; a side with nothing is "—", said in words; each period's length is shown. On a phone each row stacks so the difference is read without scrolling sideways, nine-figure amounts included.
  _active · enforced by test · F-COMPARE_
  - Related: R-COMPARE-071, R-COMPARE-173, D-298
  - Source: owner-request: coordinator, step 4 screens adapted to the database re-review and step 5, 2026-11-16; code: src/features/compare/components/side-by-side-view.tsx; owner-request: coordinator, independent review of the step 4 and step 5 screens at a24615e, 2026-11-16
- **R-COMPARE-195** The compare page says so when a comparison needs a second period, when the budget has no categories yet, and when the budget has ended (the range ends at its last period); a read that fails says so with a retry; a read answered catching_up is handled like any other (R-PERIOD-190).
  _active · enforced by test · F-COMPARE_
  - Related: R-COMPARE-171, R-COMPARE-175, R-PERIOD-190
  - Source: owner-request: coordinator, step 4 screens adapted to the database re-review and step 5, 2026-11-16; code: src/features/compare/compare-page.tsx
- **R-COMPARE-280** Wherever periods are labelled by day and month (chart axes, column headers), the year is written on the first one and wherever it changes, visibly, so no label stands for two years.
  _active · enforced by test · F-COMPARE_
  - Related: R-COMPARE-173
  - Source: owner-request: coordinator, independent review of the step 4 and step 5 screens at a24615e, 2026-11-16; code: src/features/compare/compare-format.ts
- **R-COMPARE-281** A difference is written with its sign before the currency in both directions ("+CHF 192.92", "−CHF 192.92"), everywhere a difference is shown; other negative amounts keep the money formatter's form.
  _active · enforced by test · F-COMPARE_
  - Related: C-MONEY-003
  - Source: owner-request: coordinator, independent review of the step 4 and step 5 screens at a24615e, 2026-11-16; code: src/features/compare/compare-format.ts
- **R-COMPARE-282** A comparison chart takes the width while its periods fit (24 periods from 1024 px); when they do not, it scrolls inside its own frame: the value axis (with its unit, CHF) stays in view outside the frame, the frame shows whole periods only and opens on the newest, says that earlier periods are to the left, and can be focused (named) and scrolled with the keyboard.
  _active · enforced by test · F-COMPARE_
  - Related: D-297, D-406
  - Source: owner-request: coordinator, independent review of the step 4 and step 5 screens at a24615e, 2026-11-16; code: src/features/compare/components/chart-frame.tsx
- **R-COMPARE-283** A period in the address that is not one of the current budget's (another budget's, deleted, or not an id at all) is never sent as such: the comparison falls back to the default periods, says so in words and offers the pickers; choosing another budget drops the choices that named the previous budget's periods and lines.
  _active · enforced by test · F-COMPARE_
  - Related: R-PERIOD-281, D-404, Q-252
  - Source: owner-request: coordinator, independent review of the step 4 and step 5 screens at a24615e, 2026-11-16; code: src/features/compare/components/side-by-side-view.tsx
- **R-COMPARE-284** "Compare with…" on a period of the trend puts that period as B and the one before it as A (the first period has none: A is left to pick), so a period is never compared with itself.
  _active · enforced by test · F-COMPARE_
  - Related: R-COMPARE-071
  - Source: owner-request: coordinator, independent review of the step 4 and step 5 screens at a24615e, 2026-11-16; code: src/features/compare/components/trend-view.tsx

### Import

- **R-IMPORT-001** There is one import function, in the database, behind every way of importing.
  _active · enforced by test · F-IMPORT_
  - Source: domain: Import (including by a Claude session)
- **R-IMPORT-002** The import function validates rows.
  _active · enforced by test · F-IMPORT_
  - Source: domain: Import (including by a Claude session)
- **R-IMPORT-003** The import function skips duplicates.
  _active · enforced by test · F-IMPORT_
  - Related: Q-009, D-115
  - Source: domain: Import (including by a Claude session)
- **R-IMPORT-004** The import function marks imported transactions "to review".
  _active · enforced by test · F-IMPORT_
  - Source: domain: Import (including by a Claude session)
- **R-IMPORT-005** The import is reachable from a paste/CSV screen in the app.
  _active · enforced by test · F-IMPORT_
  - Source: domain: Import (including by a Claude session)
- **R-IMPORT-006** The import is reachable from a script in this repository that a Claude Code session can run, authenticated with an import token.
  _active · enforced by test · F-IMPORT_
  - Related: Q-013, D-116
  - Source: domain: Import (including by a Claude session); owner-request: product owner decisions on the open questions, 2026-11-16
- **R-IMPORT-007** When a member categorises an imported transaction, the app offers, in one click, to always put that merchant in that category.
  _active · enforced by test · F-IMPORT_
  - Related: Q-014, D-117, Q-057
  - Source: domain: Import (including by a Claude session); owner-request: product owner decisions on the open questions, 2026-11-16
- **R-IMPORT-070** An imported row is a duplicate when an existing transaction of the same kind, whatever its origin (typed, imported or a charge), has the same date, amount and description; each existing transaction absorbs one row, so two identical rows against one existing transaction import one, and rows of one import are never duplicates of each other.
  _active · enforced by test · F-IMPORT_
  - Related: D-115, D-313
  - Source: owner-request: product owner decisions on the open questions, 2026-11-16; owner-request: coordinator brief for the step 6 database (import), 2026-11-16; code: supabase/migrations/20261119100000_import.sql
- **R-IMPORT-071** When the file gives a bank transaction id, an imported row is also a duplicate when an existing transaction of the budget has the same bank transaction id.
  _active · enforced by test · F-IMPORT_
  - Related: D-115, D-313
  - Source: owner-request: product owner decisions on the open questions, 2026-11-16; owner-request: coordinator brief for the step 6 database (import), 2026-11-16; code: supabase/migrations/20261119100000_import.sql
- **R-IMPORT-072** The import summary lists the rows skipped as duplicates.
  _active · enforced by test · F-IMPORT_
  - Related: D-115
  - Source: owner-request: product owner decisions on the open questions, 2026-11-16
- **R-IMPORT-073** The user can import a row skipped as a duplicate anyway.
  _active · enforced by test · F-IMPORT_
  - Related: D-115, Q-056
  - Source: owner-request: product owner decisions on the open questions, 2026-11-16
- **R-IMPORT-074** A member creates import tokens in Settings.
  _active · enforced by test · F-IMPORT_
  - Related: D-116
  - Source: owner-request: product owner decisions on the open questions, 2026-11-16
- **R-IMPORT-075** An import token is tied to one budget and imports only into it.
  _active · enforced by test · F-IMPORT_
  - Related: D-116
  - Source: owner-request: product owner decisions on the open questions, 2026-11-16
- **R-IMPORT-076** An import token can only add transactions through the import function; it cannot read anything.
  _active · enforced by test · F-IMPORT_
  - Related: D-116, R-SECURITY-005
  - Source: owner-request: product owner decisions on the open questions, 2026-11-16
- **R-IMPORT-077** An import token can be revoked, after which it is refused.
  _active · enforced by test · F-IMPORT_
  - Related: D-116
  - Source: owner-request: product owner decisions on the open questions, 2026-11-16
- **R-IMPORT-078** Merchant-to-category rules can be edited in Settings.
  _active · enforced by test · F-IMPORT_
  - Related: D-117
  - Source: owner-request: product owner decisions on the open questions, 2026-11-16
- **R-IMPORT-079** An imported transaction whose merchant has a merchant-to-category rule is put in that rule's category.
  _active · enforced by test · F-IMPORT_
  - Why: What "categorisation improves over time" means once rules exist.
  - Related: D-117, Q-057
  - Source: domain: Import (including by a Claude session); owner-request: product owner decisions on the open questions, 2026-11-16
- **R-IMPORT-080** An imported transaction counts in totals as soon as it is imported, before it is reviewed.
  _active · enforced by test · F-IMPORT_
  - Related: D-118
  - Source: owner-request: product owner decisions on the open questions, 2026-11-16
- **R-IMPORT-081** An imported transaction stays "to review" until a member confirms it.
  _active · enforced by test · F-IMPORT_
  - Related: D-118, R-IMPORT-004
  - Source: owner-request: product owner decisions on the open questions, 2026-11-16
- **R-IMPORT-082** The generic CSV import lets the user map the file's columns to the transaction fields.
  _active · enforced by test · F-IMPORT_
  - Related: D-119, D-126
  - Source: owner-request: product owner decisions on the open questions, 2026-11-16
- **R-IMPORT-083** The import offers presets for the exports of Migros Bank, Raiffeisen, One, Yuh and Twint.
  _retired · enforced by test · F-IMPORT_
  - Retired: D-126 replaced the source list: the import reads the PDF statements of R-IMPORT-084, and Raiffeisen, One and Twint have no preset.
  - Related: D-119, Q-058, D-126
  - Source: owner-request: product owner decisions on the open questions, 2026-11-16
- **R-IMPORT-084** The import reads three kinds of PDF statement: the Migros Bank private-account statement, the Migros Bank credit-card bill (Viseca) and the Yuh account statement.
  _active · enforced by test · F-IMPORT_
  - Related: D-126
  - Source: owner-request: product owner decision on the import sources, with sample statements, 2026-11-16; docs/import-sources.md: Import sources: statement layouts
- **R-IMPORT-085** The import recognises the kind of a statement from its content, and refuses, with an explanation, a PDF it does not recognise or one without a text layer.
  _active · enforced by test · F-IMPORT_
  - Related: D-126, R-IMPORT-084
  - Source: owner-request: coordinator decisions on the sample statements for the import, 2026-11-16; docs/import-sources.md: Recognising the document
- **R-IMPORT-086** A statement is parsed in the browser; the PDF file is never uploaded or stored, and only the extracted transactions reach the import function.
  _active · enforced by review · F-IMPORT_
  - Why: No test can prove that a file is never sent; review the import code for any upload of the file or its text.
  - Related: D-127
  - Source: owner-request: coordinator decisions on the sample statements for the import, 2026-11-16
- **R-IMPORT-087** Every entry of a statement's transaction table becomes exactly one candidate transaction; opening and closing balances, carried-forward lines, subtotals and totals, the previous bill total, the payment received on a card bill and card headings never do.
  _active · enforced by test · F-IMPORT_
  - Related: R-IMPORT-084
  - Source: owner-request: coordinator decisions on the sample statements for the import, 2026-11-16; docs/import-sources.md: What is not a transaction
- **R-IMPORT-088** A parsed statement must add up to what it prints (column totals, running balances, card and bill totals); otherwise the import is refused with an explanation, and nothing is imported.
  _active · enforced by test · F-IMPORT_
  - Why: A parser that misses or misreads a line on a layout it does not know would otherwise import wrong amounts silently.
  - Related: R-IMPORT-084, R-IMPORT-087
  - Source: owner-request: coordinator decisions on the sample statements for the import, 2026-11-16; docs/import-sources.md: What a parser must guarantee
- **R-IMPORT-089** Statement amounts (thousands separator ', two decimals, a trailing minus for a credit on the card bill) are read exactly into integer rappen, and statement dates (DD.MM.YY or DD.MM.YYYY) into calendar dates without a time zone.
  _active · enforced by test · F-IMPORT_
  - Related: R-MONEY-002
  - Source: owner-request: coordinator decisions on the sample statements for the import, 2026-11-16; docs/import-sources.md: Numbers and dates
- **R-IMPORT-090** The date of an imported transaction is the purchase date when the statement gives one, otherwise the booking date.
  _active · enforced by test · F-IMPORT_
  - Related: D-128
  - Source: owner-request: coordinator decisions on the sample statements for the import, 2026-11-16
- **R-IMPORT-091** A card-bill payment and a transfer between the owner's own accounts are flagged on import and skipped by default; the user can import them anyway.
  _active · enforced by test · F-IMPORT_
  - Related: D-129, D-314
  - Source: owner-request: coordinator decisions on the sample statements for the import, 2026-11-16; docs/import-sources.md: Recognising special entries; owner-request: coordinator brief for the step 6 database (import), 2026-11-16; code: supabase/migrations/20261119100000_import.sql
- **R-IMPORT-092** The import remembers, per budget, kind of flag and counterparty, what a member chose for a flagged entry (import or skip) and proposes the same choice for such entries the next time.
  _active · enforced by test · F-IMPORT_
  - Related: D-129, D-314
  - Source: owner-request: coordinator decisions on the sample statements for the import, 2026-11-16; owner-request: coordinator brief for the step 6 database (import), 2026-11-16; code: supabase/migrations/20261119100000_import.sql
- **R-IMPORT-093** A salary credit is skipped on import: one the source calls a salary, or of the amount of an income in force, dated within five days either side of a period start (R-IMPORT-259); the member may import it as extra income.
  _active · enforced by test · F-IMPORT_
  - Related: D-130, D-377
  - Source: owner-request: coordinator decisions on the sample statements for the import, 2026-11-16; owner-request: coordinator brief for the step 6 database (import), 2026-11-16; code: supabase/migrations/20261119100000_import.sql
- **R-IMPORT-094** Every other credit is proposed for review, as a refund in a category or as extra income.
  _active · enforced by test · F-IMPORT_
  - Related: D-130, Q-066
  - Source: owner-request: coordinator decisions on the sample statements for the import, 2026-11-16
- **R-IMPORT-095** A securities purchase is imported as an ordinary transaction for the user to categorise.
  _active · enforced by test · F-IMPORT_
  - Related: D-131
  - Source: owner-request: coordinator decisions on the sample statements for the import, 2026-11-16
- **R-IMPORT-096** Interest and fee lines of a statement are imported as transactions.
  _active · enforced by test · F-IMPORT_
  - Related: D-132
  - Source: owner-request: coordinator decisions on the sample statements for the import, 2026-11-16
- **R-IMPORT-097** A foreign-currency purchase is imported with the CHF amount billed, fees included, and a description that keeps the original currency and amount.
  _active · enforced by test · F-IMPORT_
  - Related: D-133
  - Source: owner-request: coordinator decisions on the sample statements for the import, 2026-11-16
- **R-IMPORT-098** The statement parsers read the French versions of the three statements.
  _active · enforced by test · F-IMPORT_
  - Related: D-134, Q-061
  - Source: owner-request: coordinator decisions on the sample statements for the import, 2026-11-16
- **R-IMPORT-099** The statement fixtures in the repository contain no real data: they are anonymised outside the repository and pass a leak check against the real statement before they enter the working tree.
  _active · enforced by review · F-IMPORT_
  - Why: The leak check needs the real statement, which must never enter the repository, so it cannot run in CI.
  - Related: R-IMPORT-100
  - Source: owner-request: coordinator decisions on the sample statements for the import, 2026-11-16
- **R-IMPORT-100** Each statement parser produces exactly the expected result of every anonymised fixture of its source (test-fixtures/statements).
  _active · enforced by test · F-IMPORT_
  - Related: R-IMPORT-084, R-IMPORT-099
  - Source: owner-request: coordinator decisions on the sample statements for the import, 2026-11-16
- **R-IMPORT-101** A TWINT transaction id or a Yuh reference is kept as the bank transaction id of the imported transaction; a QR payment reference is not, because it repeats from one payment to the next.
  _active · enforced by test · F-IMPORT_
  - Why: The QR reference of a card-bill payment is built from the card account number, so every monthly payment of that card has the same reference.
  - Related: R-IMPORT-071, D-115
  - Source: owner-request: coordinator decisions on the sample statements for the import, 2026-11-16; docs/import-sources.md: Recognising special entries
- **R-IMPORT-102** The review of an imported statement shows, for each transaction, the extra data the statement gives: purchase time, value date, card, original currency and amount, exchange rate, fee, merchant category and security.
  _active · enforced by test · F-IMPORT_
  - Related: R-IMPORT-004
  - Source: owner-request: coordinator decisions on the sample statements for the import, 2026-11-16
- **R-IMPORT-210** A statement file that is not a PDF, is password-protected or corrupt, is larger than 10 MB or has more than 50 pages is refused with its reason; reading a PDF fetches nothing over the network; a reader that cannot be loaded and any fault while reading give a refusal, never an error.
  _active · enforced by test · F-IMPORT_
  - Related: D-332, R-IMPORT-085, R-IMPORT-086
  - Source: owner-request: coordinator brief for the step 6 statement parsers, 2026-11-16
- **R-IMPORT-211** Inside a recognised statement, an entry of a type the parser does not know is kept, described by its first text line only, with its direction's default (imported if a debit, reviewed if a credit); an entry labelled as a known type that does not match that type's layout or column, an item outside the table's columns and a rotated or right-to-left item inside the table refuse the statement.
  _active · enforced by test · F-IMPORT_
  - Related: D-337, R-IMPORT-087
  - Source: owner-request: coordinator brief for the step 6 statement parsers, 2026-11-16
- **R-IMPORT-212** The statement parsers flag a card-bill payment (a payment or standing order whose payee names Viseca, in any case) and a transfer between the owner's own accounts (the holder's name, in either order, at the holder's address), and propose to skip them by default.
  _active · enforced by test · F-IMPORT_
  - Related: R-IMPORT-091, D-129, D-334
  - Source: owner-request: coordinator, review round of the step 6 statement parsers, 2026-11-16
- **R-IMPORT-213** The statement parsers propose for review every credit that is not a salary, a card-bill payment or an own transfer.
  _active · enforced by test · F-IMPORT_
  - Related: R-IMPORT-094, D-130
  - Source: owner-request: coordinator, review round of the step 6 statement parsers, 2026-11-16
- **R-IMPORT-214** The statement parsers return, for each entry, the extra data the statement prints: purchase date and time, booking and value dates, card, original currency and amount, exchange rate, fee, merchant category, location and security.
  _active · enforced by test · F-IMPORT_
  - Related: R-IMPORT-102
  - Source: owner-request: coordinator, review round of the step 6 statement parsers, 2026-11-16
- **R-IMPORT-215** On a card bill, a dated row with a trailing minus before the first card section is the payment received, whatever its label, and never an entry; a row there that is neither the previous bill total, a payment nor a known charge (late-payment interest, a fee) refuses the bill.
  _active · enforced by test · F-IMPORT_
  - Related: R-IMPORT-087, D-335
  - Source: owner-request: coordinator, review round of the step 6 statement parsers, 2026-11-16
- **R-IMPORT-216** A text layer with a page far from A4 (outside 500 to 700 by 700 to 1000 pt), more than 5000 text items on a page or more than 20 000 in the document is refused, and a file still being read after 20 seconds is refused and its reader stopped.
  _active · enforced by test · F-IMPORT_
  - Related: D-338, R-IMPORT-210
  - Source: owner-request: coordinator, review round of the step 6 statement parsers, 2026-11-16
- **R-IMPORT-217** A purchase date after its booking date, or more than 366 days before it, refuses the statement.
  _active · enforced by test · F-IMPORT_
  - Related: D-339, R-IMPORT-090
  - Source: owner-request: coordinator, review round of the step 6 statement parsers, 2026-11-16
- **R-IMPORT-218** A bank transaction id printed on more than one entry of a statement is kept for none of them; the entries stay.
  _active · enforced by test · F-IMPORT_
  - Related: D-336, R-IMPORT-101
  - Source: owner-request: coordinator, review round of the step 6 statement parsers, 2026-11-16
- **R-IMPORT-219** The rows sent to the import function hold only the keys of its contract, within its bounds (descriptions shortened at a character boundary, details keys dropped in a stated order, too long ids dropped, each said in the result), and never the counterparty's phone number, address or IBAN, the statement's text lines, QR references, balances or the holder's name and address.
  _active · enforced by test · F-IMPORT_
  - Related: D-340, R-IMPORT-086
  - Source: owner-request: coordinator, review round of the step 6 statement parsers, 2026-11-16
- **R-IMPORT-220** An entry of 0.00 stays in the statement for the user to see, with nothing to import, and produces no row for the import function.
  _active · enforced by test · F-IMPORT_
  - Related: D-341
  - Source: owner-request: coordinator, review round of the step 6 statement parsers, 2026-11-16
- **R-IMPORT-200** An imported expense or refund without a category from the member or a rule goes to the budget's "to categorise" category, created at the first import that needs it; every transaction keeps a category, so every total and comparison still adds up.
  _active · enforced by test · F-IMPORT_
  - Related: D-312, R-COMPARE-170
  - Source: owner-request: coordinator brief for the step 6 database (import), 2026-11-16; code: supabase/migrations/20261119100000_import.sql
- **R-IMPORT-201** A merchant rule matches a row when the row's merchant key (from its merchant, else its description: lower case, accents and punctuation removed, the statement's words and a processor prefix dropped) contains the rule's fragment; the longest fragment wins, and a rule applies only where its category is in force.
  _active · enforced by test · F-IMPORT_
  - Related: D-311, Q-057
  - Source: owner-request: coordinator brief for the step 6 database (import), 2026-11-16; code: supabase/migrations/20261119100000_import.sql
- **R-IMPORT-202** Creating a rule in one click can move, in the same call, the other transactions to review waiting in "to categorise" whose key contains it; the answer says how many moved; transactions already in a real category stay.
  _active · enforced by test · F-IMPORT_
  - Related: D-117, D-311
  - Source: owner-request: coordinator brief for the step 6 database (import), 2026-11-16; code: supabase/migrations/20261119100000_import.sql
- **R-IMPORT-203** A row is a possible match of an existing transaction of the same kind that was not imported, with the same amount and a date within three days either way; it is skipped by default, and when the match is a charge awaiting confirmation the import confirms it; each existing transaction absorbs one row of a batch.
  _active · enforced by test · F-IMPORT_
  - Related: D-373, Q-068
  - Source: owner-request: coordinator brief for the step 6 database (import), 2026-11-16; code: supabase/migrations/20261119100000_import.sql
- **R-IMPORT-204** Skipped rows of a batch can be imported anyway, one by one or all at once, through the same import.
  _active · enforced by test · F-IMPORT_
  - Related: R-IMPORT-073, D-313
  - Source: owner-request: coordinator brief for the step 6 database (import), 2026-11-16; code: supabase/migrations/20261119100000_import.sql
- **R-IMPORT-205** An import token imports only with the default choices and never confirms a charge; it reads nothing back beyond counts and the reasons of rows refused for their own content; an unknown, expired or revoked token, or one whose creator is no longer a member, gets one refusal before any lock or catch-up; its calls and rows are limited over rolling windows of 60 minutes and 24 hours.
  _active · enforced by test · F-IMPORT_
  - Related: D-116, D-370, D-371, R-SECURITY-005
  - Source: owner-request: coordinator brief for the step 6 database (import), 2026-11-16; code: supabase/migrations/20261119100000_import.sql
- **R-IMPORT-206** A member can undo an import batch once: its transactions still to review are deleted, the confirmed ones and the charges it confirmed stay, and it takes no more rows.
  _active · enforced by test · F-IMPORT_
  - Related: D-320
  - Source: owner-request: coordinator brief for the step 6 database (import), 2026-11-16; code: supabase/migrations/20261119100000_import.sql
- **R-IMPORT-207** A category's first subcategory moves its merchant rules to "Other"; a category deleted takes its rules with it; an ended category's rules stay and apply where it is in force.
  _active · enforced by test · F-IMPORT_
  - Related: D-311, R-CATEGORY-110
  - Source: owner-request: coordinator brief for the step 6 database (import), 2026-11-16; code: supabase/migrations/20261119100000_import.sql
- **R-IMPORT-208** An import is sent as a batch of up to 100 chunks of up to 500 rows (250 by a token) under an id the caller generates; a chunk sent again records nothing and answers as the first time; a chunk the transaction limit cannot hold is refused whole, saying how many rows would fit.
  _active · enforced by test · F-IMPORT_
  - Related: D-310, R-APP-170
  - Source: owner-request: coordinator brief for the step 6 database (import), 2026-11-16; code: supabase/migrations/20261119100000_import.sql
- **R-IMPORT-209** A transaction to review is confirmed one by one or all at once, never while it is in "to categorise"; the budget says how many are to review and the transactions list can show only them or one batch.
  _active · enforced by test · F-IMPORT_
  - Related: D-118, D-312
  - Source: owner-request: coordinator brief for the step 6 database (import), 2026-11-16; code: supabase/migrations/20261119100000_import.sql
- **R-IMPORT-250** What is stored of a row that was not imported is bounded: its known keys within their limits, and only the names of unknown keys; a call whose rows exceed 2 MB is refused whole when the function starts; the request body itself is read and parsed before the function runs, bounded only by the gateway (Q-280).
  _active · enforced by test · F-IMPORT_
  - Related: D-378
  - Source: owner-request: coordinator review of the step 6 database (import), 2026-11-16; code: supabase/migrations/20261119100000_import.sql
- **R-IMPORT-251** Each existing transaction absorbs at most one row of a batch, as its duplicate or its match, counted over the whole batch whatever chunks it is sent in, in whatever order, and however often a chunk is sent again.
  _active · enforced by test · F-IMPORT_
  - Related: D-372, D-373
  - Source: owner-request: coordinator review of the step 6 database (import), 2026-11-16; code: supabase/migrations/20261119100000_import.sql
- **R-IMPORT-252** A preview names the batch its rows will be sent in; a preview with no batch id says what the first chunk of a new batch does, exactly as the write.
  _active · enforced by test · F-IMPORT_
  - Related: D-310
  - Source: owner-request: coordinator review of the step 6 database (import), 2026-11-16; code: supabase/migrations/20261119100000_import.sql
- **R-IMPORT-253** A transaction's review state changes only through confirming it (one or all); an edit, a link or an unlink leaves a transaction to review to review.
  _active · enforced by test · F-IMPORT_
  - Related: R-IMPORT-209
  - Source: owner-request: coordinator review of the step 6 database (import), 2026-11-16; code: supabase/migrations/20261119100000_import.sql
- **R-IMPORT-254** An imported transaction keeps the amount, date and description it was first imported with; a statement line equal to those is a duplicate even after the member edited the transaction.
  _active · enforced by test · F-IMPORT_
  - Related: D-372
  - Source: owner-request: coordinator review of the step 6 database (import), 2026-11-16; code: supabase/migrations/20261119100000_import.sql
- **R-IMPORT-255** The merchant key handles a reference after the merchant, the statement's leading words, a processor prefix, any script, and letters such as ß and œ; the key of a key is itself.
  _active · enforced by test · F-IMPORT_
  - Related: D-381, R-IMPORT-201
  - Source: owner-request: coordinator review of the step 6 database (import), 2026-11-16; code: supabase/migrations/20261119100000_import.sql
- **R-IMPORT-256** A budget holds at most 10 import tokens that can still be used; a revoked or expired token can be deleted, and those kept are pruned to the newest 20 and to 365 days.
  _active · enforced by test · F-IMPORT_
  - Related: D-370
  - Source: owner-request: coordinator review of the step 6 database (import), 2026-11-16; code: supabase/migrations/20261119100000_import.sql
- **R-IMPORT-257** Import batches, skipped rows and remembered choices are read through paged functions only; a budget keeps at most 1000 remembered choices, the least recently used going first.
  _active · enforced by test · F-IMPORT_
  - Related: D-370, R-SECURITY-003
  - Source: owner-request: coordinator review of the step 6 database (import), 2026-11-16; code: supabase/migrations/20261119100000_import.sql
- **R-IMPORT-258** A batch's counts add up to the rows it received, also after rows are imported anyway; a row imported anyway answers with its original chunk and row number, and can be imported anyway again once its transaction is deleted.
  _active · enforced by test · F-IMPORT_
  - Related: R-IMPORT-204
  - Source: owner-request: coordinator review of the step 6 database (import), 2026-11-16; code: supabase/migrations/20261119100000_import.sql
- **R-IMPORT-259** A credit of exactly an income's amount is a salary when it is dated within five days either side of a period start: on or after the start of its own period, or before the start of the next period (projected when that period does not exist yet), at the income's amount in force in that period.
  _active · enforced by test · F-IMPORT_
  - Related: D-377, R-IMPORT-093
  - Source: owner-request: coordinator review of the step 6 database (import), 2026-11-16; code: supabase/migrations/20261119100000_import.sql
- **R-IMPORT-260** Neither undoing a batch nor applying a merchant rule changes a transaction linked to a subscription, a debt or a planned transfer, or a frozen one; undo says how many it kept and why.
  _active · enforced by test · F-IMPORT_
  - Related: D-379
  - Source: owner-request: coordinator review of the step 6 database (import), 2026-11-16; code: supabase/migrations/20261119100000_import.sql
- **R-IMPORT-261** A possible match goes to the row nearest in date (either way, within three days, same kind and amount); ties go to the earlier row, then to a charge awaiting confirmation.
  _active · enforced by test · F-IMPORT_
  - Related: D-373
  - Source: owner-request: coordinator review of the step 6 database (import), 2026-11-16; code: supabase/migrations/20261119100000_import.sql
- **R-IMPORT-262** Every refusal of the import is a stable code: a decimal amount is invalid_amount for its row, two budgets racing for one batch id get import_batch_conflict, a bad name for "to categorise" is invalid_name.
  _active · enforced by test · F-IMPORT_
  - Related: D-310
  - Source: owner-request: coordinator review of the step 6 database (import), 2026-11-16; code: supabase/migrations/20261119100000_import.sql
- **R-IMPORT-320** A statement the reader refuses is explained in words for every reason it gives (with the control, both figures, the language or the limit where it has one); the line in question is shown on the device only, apart from the explanation, and is never logged, stored or sent; nothing is sent to the budget.
  _active · enforced by test · F-IMPORT_
  - Related: R-IMPORT-085, D-342
  - Source: owner-request: coordinator brief for the step 6 screens (part B, import), 2026-11-16; code: src/features/import/statement-words.ts
- **R-IMPORT-321** The preview is asked under the batch id the import will use, with exactly the rows it will send; a changed choice is asked again (debounced), the rows whose answer is on its way are marked as being checked and never shown as current, and the import is offered only once every part has a current answer; the summary counts the rows the database answered, and no amount is added up in the client.
  _active · enforced by test · F-IMPORT_
  - Related: R-IMPORT-252, D-442
  - Source: owner-request: coordinator brief for the step 6 screens (part B, import), 2026-11-16; code: src/features/import/use-import.ts
- **R-IMPORT-322** The import sends its parts in order under one batch id; a part whose answer is lost is sent again with the same number and the same rows; a budget that must catch up first is caught up and the part sent again; the transaction limit stops the import and says how many rows would fit and that nothing of that part was written.
  _active · enforced by test · F-IMPORT_
  - Related: R-IMPORT-208, D-442
  - Source: owner-request: coordinator brief for the step 6 screens (part B, import), 2026-11-16; code: src/features/import/use-import.ts
- **R-IMPORT-323** While an import is sent, leaving the page asks first; an interrupted import is noted on the device (its batch id and a fingerprint of its rows, never the rows) and the page says so; the same statement opened again goes on under the same batch, so what was recorded is not recorded twice.
  _active · enforced by test · F-IMPORT_
  - Related: R-IMPORT-208, D-443
  - Source: owner-request: coordinator brief for the step 6 screens (part B, import), 2026-11-16; code: src/features/import/pending-import.ts
- **R-IMPORT-324** The CSV import reads quoted cells (separators, doubled quotes and line breaks inside), a byte-order mark and CRLF, detects the separator among comma, semicolon and tab and lets the user change it; asks for the date format whenever the dates can be read more than one way; reads amounts into integer rappen without floating-point arithmetic, in either decimal style, with a stated sign or two columns; lists every line it cannot read with its line number and why, and sends none of them; remembers the mapping per budget on the device only.
  _active · enforced by test · F-IMPORT_
  - Related: R-IMPORT-082, D-444
  - Source: owner-request: coordinator brief for the step 6 screens (part B, import), 2026-11-16; code: src/features/import/csv/csv-map.ts
- **R-IMPORT-325** Text from a bank file or a token (descriptions, merchants, details, token and category names) is rendered as text only, never as markup or a link, isolated so that right-to-left characters cannot reorder the words around it, and wraps rather than widening the page.
  _active · enforced by test · F-IMPORT_
  - Related: R-SECURITY-250, D-376
  - Source: owner-request: coordinator brief for the step 6 screens (part B, import), 2026-11-16; code: src/components/external-text.tsx
- **R-IMPORT-326** A new import token's secret is shown once, with a copy button and where to put it (the environment of the session that runs the script, never a conversation); it is held only in that dialog while it is open: never in the address, browser storage, the query or mutation cache, or a log.
  _active · enforced by test · F-IMPORT_
  - Related: R-IMPORT-074, D-446
  - Source: owner-request: coordinator brief for the step 6 screens (part B, import), 2026-11-16; code: src/features/import/settings/import-tokens.tsx
- **R-IMPORT-340** A statement previewed part by part with preview_import_part answers, for each part, the rows and counts the write of the same parts in the same order then gives (absent changes by others), with the totals of each part and of the statement so far: rows by action, and the rows to import by kind, count and amount.
  _active · enforced by test · F-IMPORT_
  - Related: D-455, R-IMPORT-252
  - Source: owner-request: coordinator brief for the step 6 database fix round 2 (re-review at 747686c), 2026-11-16; code: supabase/migrations/20261119100000_import.sql
- **R-IMPORT-341** A budget's import storage is bounded: in a rolling 24 hours at most 20 000 rows submitted, 50 new batches (import_limit_reached) and 20 tokens created, deleted ones included (token_limit_reached); kept at most 2 000 batches (empty ones go first), the newest 20 000 skipped rows and the newest 50 chunk answers of at most 7 days (an older chunk sent again answers chunk_expired).
  _active · enforced by test · F-IMPORT_
  - Related: D-452, R-IMPORT-250
  - Source: owner-request: coordinator brief for the step 6 database fix round 2 (re-review at 747686c), 2026-11-16; code: supabase/migrations/20261119100000_import.sql
- **R-IMPORT-342** The merchant key does bounded work: the text is cut to 200 characters first and a text still changing after 10 steps keeps that cut text as its key, which stays idempotent.
  _active · enforced by test · F-IMPORT_
  - Related: D-453, R-IMPORT-255
  - Source: owner-request: coordinator brief for the step 6 database fix round 2 (re-review at 747686c), 2026-11-16; code: supabase/migrations/20261119100000_import.sql
- **R-IMPORT-343** The duplicate lookup by content reads by index, as the transaction is now and as first imported; values as first imported exist on imported transactions only.
  _active · enforced by test · F-IMPORT_
  - Related: D-462, R-IMPORT-254
  - Source: owner-request: coordinator brief for the step 6 database fix round 2 (re-review at 747686c), 2026-11-16; code: supabase/migrations/20261119100000_import.sql
- **R-IMPORT-344** A valid skipped row is kept as the preview showed it (free text cleaned), so importing it anyway imports that row and the same statement line imported again is its duplicate by bank id.
  _active · enforced by test · F-IMPORT_
  - Related: D-466, R-IMPORT-073
  - Source: owner-request: coordinator brief for the step 6 database fix round 2 (re-review at 747686c), 2026-11-16; code: supabase/migrations/20261119100000_import.sql
- **R-IMPORT-345** Only a choice the member sent for a flagged row is remembered, never a default; an own transfer without description or merchant is remembered under the key own_transfer.
  _active · enforced by test · F-IMPORT_
  - Related: D-456, R-IMPORT-092
  - Source: owner-request: coordinator brief for the step 6 database fix round 2 (re-review at 747686c), 2026-11-16; code: supabase/migrations/20261119100000_import.sql
- **R-IMPORT-346** A member can forget a remembered choice; the default applies again.
  _active · enforced by test · F-IMPORT_
  - Related: D-458
  - Source: owner-request: coordinator brief for the step 6 database fix round 2 (re-review at 747686c), 2026-11-16; code: supabase/migrations/20261119100000_import.sql
- **R-IMPORT-347** A rule's preview answers the fragment as stored, the rule already covering it and how many waiting transactions the rule would move, as the rule then does.
  _active · enforced by test · F-IMPORT_
  - Related: D-457, R-IMPORT-201
  - Source: owner-request: coordinator brief for the step 6 database fix round 2 (re-review at 747686c), 2026-11-16; code: supabase/migrations/20261119100000_import.sql
- **R-IMPORT-348** One batch can be read by its id, as the list gives it, by members of its budget only.
  _active · enforced by test · F-IMPORT_
  - Related: D-459
  - Source: owner-request: coordinator brief for the step 6 database fix round 2 (re-review at 747686c), 2026-11-16; code: supabase/migrations/20261119100000_import.sql
- **R-IMPORT-349** The import script reads a quote inside an unquoted CSV field as an ordinary character; only a quote at the start of a field opens a quoted field.
  _active · enforced by test · F-IMPORT_
  - Related: R-IMPORT-006
  - Source: owner-request: coordinator brief for the step 6 database fix round 2 (re-review at 747686c), 2026-11-16; code: scripts/import/import.mjs

### Accounts and planned transfers (money flow)

- **R-ACCOUNT-001** The user defines accounts (salary account, savings, third pillar, tax reserve, possibly at different banks).
  _active · enforced by test · F-MONEYFLOW_
  - Source: domain: Account and planned transfer (money flow); code: supabase/migrations/20261120100000_money_flow.sql
- **R-ACCOUNT-002** The user defines planned transfers between accounts, such as "payday + 2 days: 1000 CHF from A to Savings" or "on the 1st: 200 CHF from A to the tax reserve".
  _active · enforced by test · F-MONEYFLOW_
  - Related: Q-008, Q-015, D-120, D-121
  - Source: domain: Account and planned transfer (money flow); owner-request: product owner decisions on the open questions, 2026-11-16; code: supabase/migrations/20261120100000_money_flow.sql
- **R-ACCOUNT-003** Each planned transfer is flagged automatic or manual.
  _active · enforced by test · F-MONEYFLOW_
  - Source: domain: Account and planned transfer (money flow); code: supabase/migrations/20261120100000_money_flow.sql
- **R-ACCOUNT-004** An automatic transfer (standing order) is assumed done.
  _active · enforced by test · F-MONEYFLOW_
  - Source: domain: Account and planned transfer (money flow); code: supabase/migrations/20261120100000_money_flow.sql
- **R-ACCOUNT-005** Manual transfers are shown as a per-period checklist.
  _active · enforced by test · F-MONEYFLOW_
  - Source: domain: Account and planned transfer (money flow); code: supabase/migrations/20261120100000_money_flow.sql
- **R-ACCOUNT-006** The money flow diagram is drawn from the plan of transfers.
  _active · enforced by test · F-MONEYFLOW_
  - Source: domain: Account and planned transfer (money flow); code: supabase/migrations/20261120100000_money_flow.sql
- **R-ACCOUNT-007** The app has no bank connection and does not depend on detecting automatic transactions.
  _active · enforced by review · F-MONEYFLOW_
  - Related: D-040
  - Source: domain: Account and planned transfer (money flow); code: supabase/migrations/20261120100000_money_flow.sql
- **R-ACCOUNT-070** A planned transfer is scheduled either as an offset in days from the actual pay date of a chosen income, or on a fixed day of the month.
  _active · enforced by test · F-MONEYFLOW_
  - Related: D-120, Q-059
  - Source: owner-request: product owner decisions on the open questions, 2026-11-16; code: supabase/migrations/20261120100000_money_flow.sql
- **R-ACCOUNT-071** A planned transfer scheduled from a pay date refers to the primary income unless the user chooses another income.
  _active · enforced by test · F-MONEYFLOW_
  - Related: D-120, Q-059
  - Source: owner-request: product owner decisions on the open questions, 2026-11-16; code: supabase/migrations/20261120100000_money_flow.sql
- **R-ACCOUNT-072** A planned transfer can be linked to a category.
  _active · enforced by test · F-MONEYFLOW_
  - Why: Examples: savings, third pillar, taxes.
  - Related: D-122
  - Source: owner-request: product owner decisions on the open questions, 2026-11-16; code: supabase/migrations/20261120100000_money_flow.sql
- **R-ACCOUNT-073** Marking a manual transfer linked to a category as done creates its transaction in that category.
  _active · enforced by test · F-MONEYFLOW_
  - Related: D-122, Q-060
  - Source: owner-request: product owner decisions on the open questions, 2026-11-16; code: supabase/migrations/20261120100000_money_flow.sql
- **R-ACCOUNT-074** An automatic transfer linked to a category creates its transaction in that category.
  _active · enforced by test · F-MONEYFLOW_
  - Related: D-122, Q-060
  - Source: owner-request: product owner decisions on the open questions, 2026-11-16; code: supabase/migrations/20261120100000_money_flow.sql
- **R-ACCOUNT-075** Account balances are not tracked: the money flow diagram shows flows only.
  _active · enforced by review · F-MONEYFLOW_
  - Related: D-123
  - Source: owner-request: product owner decisions on the open questions, 2026-11-16; code: supabase/migrations/20261120100000_money_flow.sql
- **R-ACCOUNT-230** A budget has at most 50 accounts and 50 planned transfers in force, and 200 of each in all (void ones not counted); each overview stays within 900 rows.
  _active · enforced by test · F-MONEYFLOW_
  - Related: D-357, R-APP-170
  - Source: owner-request: coordinator brief for the step 7 database (accounts and money flow), 2026-11-16; code: supabase/migrations/20261120100000_money_flow.sql
- **R-ACCOUNT-231** The accounts named by a planned transfer's or an income's terms, and the category of a transfer's terms (a leaf), are in force in every period those terms govern.
  _active · enforced by test · F-MONEYFLOW_
  - Related: D-350, D-351, R-CATEGORY-130
  - Source: owner-request: coordinator brief for the step 7 database (accounts and money flow), 2026-11-16; code: supabase/migrations/20261120100000_money_flow.sql
- **R-ACCOUNT-232** Closing an account that the terms of a transfer or an income still use from then on is refused, naming what uses it; an account never named and never counted before is deleted instead; earlier periods keep a closed account.
  _active · enforced by test · F-MONEYFLOW_
  - Related: D-350, R-CATEGORY-131
  - Source: owner-request: coordinator brief for the step 7 database (accounts and money flow), 2026-11-16; code: supabase/migrations/20261120100000_money_flow.sql
- **R-ACCOUNT-233** The previews of creating and editing a planned transfer give, with the write's own code, the due dates and amounts of the periods its terms govern (the next periods at their projected boundaries) and the transactions the write creates at once; the preview of ending one gives its outcome and what it removes.
  _active · enforced by test · F-MONEYFLOW_
  - Related: D-354, R-ACCOUNT-239
  - Source: owner-request: coordinator brief for the step 7 database (accounts and money flow), 2026-11-16; code: supabase/migrations/20261120100000_money_flow.sql
- **R-ACCOUNT-234** Ending a planned transfer removes its occurrences from that period on; every mark already made and every transaction link stay, and the period's checklist still lists the transfer, flagged as ended; a transfer that never counted before and was never marked is deleted instead.
  _active · enforced by test · F-MONEYFLOW_
  - Related: D-380
  - Source: owner-request: coordinator brief for the step 7 database (accounts and money flow), 2026-11-16; code: supabase/migrations/20261120100000_money_flow.sql; owner-request: coordinator review of the step 6 database, step 7 change, 2026-11-16
- **R-ACCOUNT-235** The money flow of a period adds up: its incomes total the period's salaries, each income flows into its account or into "not assigned", and each account shows what comes in, what goes out and what stays (negative when more is planned out than comes in), never a balance.
  _active · enforced by test · F-MONEYFLOW_
  - Related: D-356, R-ACCOUNT-006, R-ACCOUNT-075
  - Source: owner-request: coordinator brief for the step 7 database (accounts and money flow), 2026-11-16; code: supabase/migrations/20261120100000_money_flow.sql
- **R-ACCOUNT-236** An income can name the account it is paid into, as part of its terms, versioned with them.
  _active · enforced by test · F-MONEYFLOW_
  - Related: D-351
  - Source: owner-request: coordinator brief for the step 7 database (accounts and money flow), 2026-11-16; code: supabase/migrations/20261120100000_money_flow.sql
- **R-ACCOUNT-237** A reopen moves a mark of the merged period to the reopened period when that period has none for the transfer; otherwise the mark goes, the catch-up's transaction with it, a member's transaction staying as an ordinary transaction; preview_reopen lists each.
  _retired · enforced by test · F-MONEYFLOW_
  - Retired: D-430 replaced moving and removing the merged period's marks with marks keyed by date that a reopen never moves (R-ACCOUNT-306).
  - Related: D-358, R-VERSION-011
  - Source: owner-request: coordinator brief for the step 7 database (accounts and money flow), 2026-11-16; code: supabase/migrations/20261120100000_money_flow.sql
- **R-ACCOUNT-238** A planned transfer linked to a category commits its planned amount in that category in each period it is in force, shown apart from the subscriptions' committed amount.
  _active · enforced by test · F-MONEYFLOW_
  - Related: D-359, R-SUBSCRIPTION-079
  - Source: owner-request: coordinator brief for the step 7 database (accounts and money flow), 2026-11-16; code: supabase/migrations/20261120100000_money_flow.sql
- **R-ACCOUNT-239** A planned transfer has exactly one occurrence in each period it is in force. Its due date is the first date with the chosen day on or after the period's start (clamped to the month's length, no weekend rule), or the chosen income's actual pay date in the period plus an offset of 0 to 31 days (the period's start for the primary income, and where the chosen income is not in force); never after the period's last day.
  _retired · enforced by test · F-MONEYFLOW_
  - Retired: D-420 replaced "exactly one occurrence per period, capped at its last day" with occurrences on the calendar or per pay date (R-ACCOUNT-300, R-ACCOUNT-301).
  - Related: D-352, R-ACCOUNT-070, R-ACCOUNT-071
  - Source: owner-request: coordinator brief for the step 7 database (accounts and money flow), 2026-11-16; code: supabase/migrations/20261120100000_money_flow.sql
- **R-ACCOUNT-240** Deleting the transaction of a done transfer puts it back: a manual one is to do again; an automatic one is not done and its transaction is not created again. Undoing a mark restores what the occurrence is without one: to do, or assumed done with its transaction.
  _active · enforced by test · F-MONEYFLOW_
  - Related: D-353, D-360
  - Source: owner-request: coordinator brief for the step 7 database (accounts and money flow), 2026-11-16; code: supabase/migrations/20261120100000_money_flow.sql
- **R-ACCOUNT-241** The dashboard counts the manual transfers of the current period and of the period before it still to do, and those of them whose due date has passed.
  _active · enforced by test · F-MONEYFLOW_
  - Related: D-361, R-ACCOUNT-005
  - Source: owner-request: coordinator brief for the step 7 database (accounts and money flow), 2026-11-16; code: supabase/migrations/20261120100000_money_flow.sql
- **R-ACCOUNT-300** A planned transfer on a fixed day follows a calendar schedule like a subscription: a cadence (monthly, quarterly or yearly), a first date and its day of the month, clamped to the month's length, with no weekend rule; each date is an occurrence of the period that contains it, due that day, so a period may have none or several.
  _active · enforced by test · F-MONEYFLOW_
  - Related: D-420, D-422, R-ACCOUNT-070
  - Source: owner-request: coordinator brief for the step 7 occurrence model redesign, after the independent review of 747686c, 2026-11-16; code: supabase/migrations/20261120100000_money_flow.sql
- **R-ACCOUNT-301** Every occurrence is identified by its date: a pay-date transfer has one occurrence per pay date of its income in the period, keyed by the scheduled pay date and due on the actual pay date plus the offset, never after the end of the period containing it; marks are kept by that date, a call names the occurrence when its period has several, a member's mark whose occurrence is no longer planned stays listed in the period of its date, flagged, and one undo leads out of every mark.
  _active · enforced by test · F-MONEYFLOW_
  - Related: D-420, D-424, D-429, R-ACCOUNT-071
  - Source: owner-request: coordinator brief for the step 7 occurrence model redesign, after the independent review of 747686c, 2026-11-16; code: supabase/migrations/20261120100000_money_flow.sql
- **R-ACCOUNT-302** Each period carries the scheduled pay date of the salary that started it; after any change of the plan the catch-up keeps exactly one transaction for each automatic occurrence linked to a category that is due (unless a member marked it or the budget is full) and none of its own for anything else, so a reopen followed by recording the salary again leaves one transaction for that payday.
  _active · enforced by test · F-MONEYFLOW_
  - Related: D-420, D-421, D-423, D-424, D-430
  - Source: owner-request: coordinator brief for the step 7 occurrence model redesign, after the independent review of 747686c, 2026-11-16; code: supabase/migrations/20261120100000_money_flow.sql
- **R-ACCOUNT-303** Every preview of a change the catch-up follows (creating, editing, correcting or ending a transfer, a reopen) says, with counts, which transactions of the catch-up it removes and creates and which members' marks lose or regain their occurrence, computed by the write itself (for an amount alone, which changes none of them, without running it).
  _active · enforced by test · F-MONEYFLOW_
  - Related: D-428, R-ACCOUNT-233, D-432
  - Source: owner-request: coordinator brief for the step 7 occurrence model redesign, after the independent review of 747686c, 2026-11-16; code: supabase/migrations/20261120100000_money_flow.sql
- **R-ACCOUNT-304** The committed figures and the money flow count a transfer's monthly share (a quarterly or yearly amount divided by its months, half up), and the reads carry the real amount and cadence beside it.
  _active · enforced by test · F-MONEYFLOW_
  - Related: D-425, R-ACCOUNT-238
  - Source: owner-request: coordinator brief for the step 7 occurrence model redesign, after the independent review of 747686c, 2026-11-16; code: supabase/migrations/20261120100000_money_flow.sql
- **R-ACCOUNT-305** What was recorded stays: an occurrence keeps its mark and transaction when the transfer is later made manual or automatic, corrected or ended, a transaction already made keeps its amount and category when the terms are edited later, and a done date lies on or after the transfer's first counted day.
  _active · enforced by test · F-MONEYFLOW_
  - Related: D-421, D-424
  - Source: owner-request: coordinator brief for the step 7 occurrence model redesign, after the independent review of 747686c, 2026-11-16; code: supabase/migrations/20261120100000_money_flow.sql
- **R-ACCOUNT-306** A reopen moves no mark: the catch-up's transaction of the merged period's payday goes until that salary is recorded again, a member's mark there stays flagged and is the same occurrence again then, and preview_reopen lists each of these per occurrence.
  _active · enforced by test · F-MONEYFLOW_
  - Related: D-430, R-ACCOUNT-237
  - Source: owner-request: coordinator brief for the step 7 occurrence model redesign, after the independent review of 747686c, 2026-11-16; code: supabase/migrations/20261120100000_money_flow.sql
- **R-ACCOUNT-307** A real payday never goes without its pay-date transfer: every period has a scheduled pay date of its own as its key, the next one no period has when the projected one is taken, so several salaries in one month give as many occurrences, the same keys through a reopen and the salary recorded again, and each occurrence is listed once, in the period that plans it, whatever its key.
  _active · enforced by test · F-MONEYFLOW_
  - Related: D-420, D-490, R-ACCOUNT-301, R-ACCOUNT-302
  - Source: owner-request: coordinator decisions on the independent review of the step 7 redesign (2264e82), M1 with C1, 2026-11-16; code: supabase/migrations/20261120100000_money_flow.sql
- **R-ACCOUNT-308** Deleting a budget, or its owner's login, never fails because of its transfers: the transfers' bookkeeping (looking at the plan again, an income gone, a transaction's mark) does nothing while the budget itself is being deleted, also within the transaction that created it; any refusal is a named code (P0001).
  _active · enforced by test · F-MONEYFLOW_
  - Related: D-423, D-426, R-MEMBER-002, R-BUDGET-009
  - Source: owner-request: coordinator decisions on the independent review of the step 7 redesign (2264e82), M2 with C5, 2026-11-16; code: supabase/migrations/20261120100000_money_flow.sql
- **R-ACCOUNT-309** Moving a period's start moves the automatic transfer transactions the app recorded by itself to their new due date, in the right period, as a reopen and the salary recorded that day would; a member's own mark stays where the member put it, and the move's preview counts what moves.
  _active · enforced by test · F-MONEYFLOW_
  - Related: D-424, D-491, R-PERIOD-100, R-ACCOUNT-303
  - Source: owner-request: coordinator decisions on the independent review of the step 7 redesign (2264e82), M3, 2026-11-16; code: supabase/migrations/20261120100000_money_flow.sql

### Concurrent edits

- **R-CONCURRENCY-070** When two members edit the same record at the same time, the second save is refused (record_changed): someone else changed it and it must be reloaded.
  _active · enforced by test · F-CATEGORY_
  - Why: Applies to every editable record. Built with step 3, for the editable records of step 2 (starting with incomes) as well as for those of step 3; every later feature follows it (D-124).
  - Related: D-124, Q-018, D-045, R-CONCURRENCY-090, D-142
  - Source: owner-request: product owner decisions on the open questions, 2026-11-16
- **R-CONCURRENCY-090** Every editable record has a revision that changes with every change to it; every edit or removal sends the revision the client read and is refused with record_changed when it differs. There are no direct writes.
  _active · enforced by test · F-CATEGORY_
  - Related: D-142, R-CONCURRENCY-070, D-006, D-150
  - Source: owner-request: project coordinator brief for the step 3 database, 2026-11-16; code: supabase/migrations/20261116120000_categories_transactions_progress.sql; docs/database.md: Concurrent edits
- **R-CONCURRENCY-091** An edit form or removal confirmation reads its record by id, never from a list, and saves over the version it opened. When another member changes a field it shows (the save is refused, or a later read shows it), it says so with their values field by field: with nothing typed it takes their version; with something typed it keeps what was typed and lets the user load their version or keep theirs, and keeping theirs saves only the fields they edited. Values that only mean something together (a category's amount and cadence, an income's pay day and weekend rule) are one field throughout: an edit to any part keeps and sends the whole group as the form shows it, and a group not edited takes the other member's version whole (D-160). The note that the form took their version goes once the user types or saves. A change to fields it does not show (the user's own save in another form, another member's change elsewhere) is taken silently. A record deleted meanwhile is said to be gone and cannot be saved; a category ended meanwhile is said to be removed, and one turned into a group meanwhile is said so and only its name can still be saved, with the typed amount named so it is not lost silently.
  _active · enforced by test · F-CATEGORY_
  - Related: R-CONCURRENCY-070, D-142, D-136, D-160
  - Source: owner-request: project coordinator brief for the step 3 database, 2026-11-16; code: src/hooks/use-edit-base.ts; owner-request: coordinator, step 3 screens review fixes, 2026-11-16
- **R-CONCURRENCY-100** A boundary operation names the period the client saw (its id and revision) and is refused with record_changed when that period changed or is gone, so a second click, a retry or another member's concurrent action never applies the operation twice.
  _active · enforced by test · F-CATEGORY_
  - Related: D-151, R-CONCURRENCY-070, R-PERIOD-023, R-PERIOD-034
  - Source: owner-request: coordinator, step 3 database review, 2026-11-16; code: supabase/migrations/20261116120000_categories_transactions_progress.sql
- **R-CONCURRENCY-130** A change to a subcategory raises its group's revision, so removing the group confirmed from an older read is refused.
  _active · enforced by test · F-CATEGORY_
  - Related: R-CATEGORY-052
  - Source: owner-request: coordinator review of the step 4 database, 2026-11-16; code: supabase/migrations/20261117100000_subscriptions_debts.sql
- **R-CONCURRENCY-131** Changing which income is primary gives both incomes involved a new revision, so an edit opened before is refused.
  _active · enforced by test · F-INCOME_
  - Related: R-INCOME-055
  - Source: owner-request: coordinator review of the step 4 database, 2026-11-16; code: supabase/migrations/20261117100000_subscriptions_debts.sql
- **R-CONCURRENCY-150** When a save is refused because another member changed the record in a way the form does not show (the primary switch moves both incomes' revisions; a first subcategory makes its category a group), the form says that something it does not show changed and that what was typed is kept, naming no field the other member did not change; where the change has its own notice (a category now a group), that notice alone is shown. A correction being typed keeps what was typed when its period's terms are read again.
  _active · enforced by test · F-SUBSCRIPTION_
  - Related: R-CONCURRENCY-091, D-160, R-VERSION-140
  - Source: owner-request: coordinator, step 4 screens review round 2, 2026-11-16; code: src/features/income/components/income-form-dialog.tsx; code: src/features/budget/components/category-form-dialog.tsx; code: src/features/budgets/terms-at.ts
- **R-CONCURRENCY-230** A mark of a transfer's occurrence names the revision of the mark the member read (0: none); a mark made or changed since is refused with record_changed.
  _active · enforced by test · F-MONEYFLOW_
  - Related: D-360, R-CONCURRENCY-070
  - Source: owner-request: coordinator brief for the step 7 database (accounts and money flow), 2026-11-16; code: supabase/migrations/20261120100000_money_flow.sql
- **R-CONCURRENCY-190** "Keep mine" keeps exactly the fields (or D-160 groups) the user changed in this form, measured against what the form showed when they changed them, and takes every other field from what the database says now for what is being edited: the record's current values for an edit from now; for a correction, the chosen period's terms read again (a change another member made from now never enters the correction). "Load their version" uses the same "now". Every form field belongs to a view or is a declared control (the correction switch, its period, whose income it is): a field in neither fails the form's tests. Changing a correction's period keeps the values the user typed in fields they changed.
  _active · enforced by test · F-SUBSCRIPTION_
  - Related: R-CONCURRENCY-091, D-160, R-VERSION-140, D-294
  - Source: owner-request: coordinator, final review of the step 4 screens (addendum C), 2026-11-16; code: src/hooks/use-concurrent-form.ts; code: src/features/budgets/terms-at.ts
- **R-CONCURRENCY-191** A save whose answer is lost (network) is never reported as someone else's change: when the record read again holds what the form sent, the form says it was saved; when it does not, it says the connection failed and nothing was saved, and what was typed stays.
  _active · enforced by test · F-SUBSCRIPTION_
  - Related: R-CONCURRENCY-091, R-CONCURRENCY-190
  - Source: owner-request: coordinator, final review of the step 4 screens (addendum C), 2026-11-16; code: src/hooks/use-concurrent-form.ts; code: src/components/changed-elsewhere.tsx
- **R-CONCURRENCY-280** An edit form says its change was saved only after a save whose answer was lost on the way (a failed connection), and only when the record now holds every value the form sent; a save the database refused (record_changed) is never reported as saved, even when another member saved the same value in one of its fields: the form keeps what was typed and offers the choice between their version and keeping one's own.
  _active · enforced by test · F-SUBSCRIPTION_
  - Related: R-CONCURRENCY-190, R-CONCURRENCY-191, R-CONCURRENCY-091
  - Source: owner-request: coordinator, independent review of the step 4 and step 5 screens at a24615e, 2026-11-16; code: src/hooks/use-concurrent-form.ts
- **R-CONCURRENCY-281** When the answer to an add (a new transaction, category, income, subscription or debt) is lost on the way, the form says it may have been saved and to check the list before saving again, never that nothing was saved.
  _retired · enforced by test · F-SUBSCRIPTION_
  - Retired: D-440: every add form sends one request id (p_client_id, D-390), so saving again after a lost answer records once; R-CONCURRENCY-320 says what the form says now.
  - Related: R-CONCURRENCY-191, Q-250
  - Source: owner-request: coordinator, independent review of the step 4 and step 5 screens at a24615e, 2026-11-16; code: src/components/changed-elsewhere.tsx
- **R-CONCURRENCY-320** When the answer to an add (a new transaction, category, income, subscription or debt) is lost on the way, the form keeps what was entered and says that saving again is safe; the retry carries the same request id and is recorded once. A request id the database calls reused gets a new one, and the form says plainly that the values had already been saved with other content and to check the list.
  _active · enforced by test · F-SUBSCRIPTION_
  - Related: R-APP-250, D-390, D-440, R-CONCURRENCY-281
  - Source: owner-request: coordinator brief for the step 6 screens (part A, contract changes), 2026-11-16; code: src/hooks/use-client-id.ts

## Conventions

### Money

- **C-MONEY-001** Money is integer rappen in code.
  _active · enforced by test_
  - Related: D-007
  - Source: CLAUDE.md: Rules
- **C-MONEY-002** Money is integer rappen in the database.
  _active · enforced by test_
  - Related: D-007, R-MONEY-002
  - Source: CLAUDE.md: Rules
- **C-MONEY-003** Money is formatted only at the edge.
  _active · enforced by review_
  - Source: CLAUDE.md: Rules

### Dates

- **C-DATE-001** Calendar dates (`YYYY-MM-DD`) and timestamps are different things.
  _active · enforced by test_
  - Related: D-010
  - Source: CLAUDE.md: Rules
- **C-DATE-002** Never run a calendar date through a time zone.
  _active · enforced by test_
  - Related: D-010
  - Source: CLAUDE.md: Rules

### Languages

- **C-I18N-001** Every user-facing string exists in both `en` and `fr`.
  _active · enforced by test_
  - Source: CLAUDE.md: Rules

### Row-level security

- **C-RLS-001** Every table has row-level security enabled.
  _active · enforced by test_
  - Source: CLAUDE.md: Rules
- **C-RLS-002** A table's row-level security is enabled, with policies, in the same migration that creates it.
  _active · enforced by review_
  - Source: CLAUDE.md: Rules
- **C-RLS-003** Access rules use the shared membership helpers in the `private` schema; a new table's policies call them rather than re-deriving membership.
  _active · enforced by review_
  - Related: D-035
  - Source: CLAUDE.md: Rules

### Where domain logic lives

- **C-LOGIC-001** Period, pay-date and versioning logic has one implementation, in the database (SQL functions).
  _active · enforced by review_
  - Related: D-024
  - Source: CLAUDE.md: Rules
- **C-LOGIC-002** Period, pay-date and versioning logic is tested with pgTAP.
  _active · enforced by test_
  - Related: D-024
  - Source: CLAUDE.md: Rules
- **C-LOGIC-003** The client reads period, pay-date and versioning results; it never recomputes them.
  _active · enforced by review_
  - Related: D-024
  - Source: CLAUDE.md: Rules

### Client queries

- **C-QUERY-001** Client queries for budget data are keyed by budget id.
  _active · enforced by review_
  - Source: CLAUDE.md: Rules

### Database tests

- **C-DBTEST-001** Database tests (pgTAP, `supabase/tests/`) must pass on a database that already holds data: scope assertions to the test's own rows.
  _active · enforced by review_
  - Source: CLAUDE.md: Rules
- **C-DBTEST-002** Every table gets tests proving what another user cannot do.
  _active · enforced by review_
  - Source: CLAUDE.md: Rules
- **C-DBTEST-003** Every table gets tests proving what an anonymous visitor cannot do.
  _active · enforced by review_
  - Source: CLAUDE.md: Rules

### Content-Security-Policy

- **C-CSP-001** The production Content-Security-Policy is `script-src 'self'`.
  _active · enforced by test_
  - Related: D-018
  - Source: CLAUDE.md: Rules
- **C-CSP-002** No inline scripts.
  _active · enforced by test_
  - Source: CLAUDE.md: Rules

### Secrets and configuration

- **C-SECRET-001** Never commit secrets.
  _active · enforced by review_
  - Source: CLAUDE.md: Rules
- **C-SECRET-002** Only the Supabase URL and publishable (anon) key reach the browser, through `VITE_` variables.
  _active · enforced by review_
  - Source: CLAUDE.md: Rules

### This specification

- **C-SPEC-001** A change in behaviour or a new decision updates `spec/spec.json` in the same change.
  _active · enforced by review_
  - Related: D-001
  - Source: owner-request
- **C-SPEC-002** Generated files (`docs/spec.md` and the generated block of `CLAUDE.md`) are never edited by hand: change `spec/spec.json` and run `npm run spec:render`.
  _active · enforced by lint_
  - Checked by: npm script `spec:check`; CI step `npm run spec:check` (.github/workflows/ci.yml, job frontend)
  - Related: D-001
  - Source: owner-request
- **C-SPEC-003** Every active rule or convention with enforcement `test` has a test whose description names its id, and no test names an id that is unknown or not active.
  _active · enforced by lint_
  - Checked by: npm script `spec:check`; CI step `npm run spec:check` (.github/workflows/ci.yml, job frontend)
  - Related: D-001, D-042
  - Source: owner-request
- **C-SPEC-004** Ids are stable: never renumber or reuse one; retire a rule or supersede a decision instead of deleting it.
  _active · enforced by review_
  - Why: spec:check only notices an id that disappeared since the base commit (HEAD by default); it cannot tell a reused id from the original.
  - Source: owner-request

## Decisions

### D-001 The structured spec is the source of truth (accepted)

spec/spec.json holds the glossary, actors, features and user stories, rules, decisions, conventions and open questions. docs/spec.md and the conventions block of CLAUDE.md are generated from it, and npm run spec:check fails when the spec, its tests or its generated views disagree.

**Why:** Prose cannot be checked; a structured file with ids lets code that breaks a rule be caught early.

**Rejected:**

- Keeping docs/domain.md as the prose source of truth: readable, but nothing can check it.
- Hand-maintained copies of the rules in several files: they drift.

Related: C-SPEC-001, C-SPEC-002, C-SPEC-003

Source: owner-request

### D-002 docs/domain.md is the source of truth for product behaviour (superseded by D-001)

docs/domain.md recorded the product owner's requirements and the decisions taken on top of them, updated when a decision changed.

**Why:** One readable place for product behaviour.

**Rejected:** none recorded.

Source: domain: introduction

### D-003 Static single-page app on Supabase, no custom server (accepted)

The app is a static SPA (Vite, React, TypeScript strict, Tailwind, shadcn/ui) that calls Supabase (Postgres, Auth, RLS) directly from the browser with supabase-js. No Node and no PHP at runtime.

**Why:** Any static host can serve the build, and access control lives in one place: RLS.

**Rejected:**

- A custom server or API in front of the database.
- Running Node or PHP on the hosting.

Related: R-SECURITY-001

Source: CLAUDE.md: Stack; README.md

### D-004 Infomaniak static hosting with an .htaccess SPA fallback (accepted)

dist/ is served as static files by Infomaniak Apache web hosting. public/.htaccess serves index.html for unknown paths, but a missing file under assets/ is a real 404, and every module-specific block is wrapped in <IfModule>.

**Why:** Deep links and reloads work; serving HTML in place of a missing script would hide the error behind a MIME type failure; a missing module must not turn the site into a 500.

**Rejected:**

- Serving index.html for missing assets.

Source: CLAUDE.md: Stack; code: public/.htaccess

### D-005 Manual deploy workflow, gated by the CI checks (accepted)

The Deploy GitHub workflow runs only when started by hand. It checks the variables and the CSP, runs lint, typecheck and tests, builds, and syncs dist/ to the site folder with rsync over SSH. A rollback is a deploy of an earlier ref.

**Why:** A manual run on a broken ref cannot ship it; the server keeps its .well-known folder.

**Rejected:** none recorded.

Source: docs/deployment.md; code: .github/workflows/deploy.yml

### D-006 Migrations go out before the code and stay backwards compatible (accepted)

Migrations are pushed to the hosted project before deploying a release that needs them, and are kept compatible with the previous release (add first, remove in a later release), or fixed forward.

**Why:** The new code never runs against an old schema, and a rollback does not undo migrations.

**Rejected:**

- Relying on a rollback to undo a migration.

Source: docs/deployment.md

### D-007 Money is integer rappen (accepted)

Amounts are integer rappen (1 CHF = 100 rappen) in the database (bigint) and in code (a safe integer number), and are formatted only at the edge.

**Why:** Exact arithmetic.

**Rejected:**

- Floats.

Related: R-MONEY-002, C-MONEY-001, C-MONEY-002, C-MONEY-003

Source: domain: Money; CLAUDE.md: Rules

### D-008 CHF only (accepted)

The app handles one currency, the Swiss franc.

**Why:** A household budget in Switzerland.

**Rejected:** none recorded.

Related: R-MONEY-001

Source: domain: Product in one paragraph; domain: Money

### D-009 Swiss money format, the same in both languages (accepted)

Amounts are shown as "CHF 1'234.50" (apostrophe for thousands, dot for rappen, sign before the digits: "CHF -12.00"), whatever the UI language. Input accepts an optional CHF, a sign, ' or ’ or spaces between thousands, a dot or a comma with at most two decimals, and the Swiss ".-" for whole francs.

**Why:** The source asks for Swiss formatting; one format avoids ambiguity between languages.

**Rejected:** none recorded.

Related: R-MONEY-003

Source: code: src/lib/money.ts

### D-010 Two kinds of date, one formatter each (accepted)

Calendar dates (YYYY-MM-DD) and timestamps (with a time and an explicit zone) each have their own formatter, and each rejects the other kind and any invalid input with a RangeError. Typed dates are dd.mm.yyyy, one-digit day and month allowed.

**Why:** They cannot be mixed up at a call site, and an invalid input never prints a plausible-looking wrong date.

**Rejected:**

- A single formatter that guesses the kind of value.

Related: C-DATE-001, C-DATE-002, R-DATE-001

Source: code: src/lib/date.ts

### D-011 Tests run in Europe/Zurich (accepted)

Vitest runs with TZ=Europe/Zurich.

**Why:** A non-UTC zone with summer time makes time-zone shifts visible in tests.

**Rejected:**

- Running tests in UTC, where shifts go unnoticed.

Source: code: vite.config.ts

### D-012 Auth email links use the implicit flow (accepted)

supabase-js is configured with flowType implicit: confirmation and password-reset links carry the session in the URL fragment.

**Why:** Links then also work when opened in another browser or on another device.

**Rejected:**

- PKCE: it needs the code verifier stored by the browser that requested the email.

Related: R-AUTH-012

Source: code: src/lib/supabase.ts

### D-013 The app reads email links itself and replaces the history entry (accepted)

detectSessionInUrl is off. At start-up, before the router or the Supabase client sees the URL, the app takes tokens or errors out of the URL by replacing the current history entry, and the auth bootstrap hands the tokens to supabase-js.

**Why:** supabase-js clears the fragment with location.hash = "", which pushes a new history entry and leaves the token-bearing URL one Back step away.

**Rejected:**

- Letting supabase-js detect the session in the URL.

Related: R-AUTH-013

Source: code: src/lib/supabase.ts; code: src/features/auth/auth-redirect.ts

### D-014 Recovery mode is tied to one sign-in (accepted)

The recovery flag in localStorage names the user and the session key of the sign-in the recovery link created; recovery mode is active only while that exact session is current. Tabs learn of changes through the storage event.

**Why:** It never applies to another user, nor to the same user after a fresh password sign-in, and a leftover flag is inert even before it is cleaned up. Every tab sharing the session sees it.

**Rejected:**

- A flag that is not tied to one sign-in, which would hold another user or a later password sign-in on the form.

Related: R-AUTH-016, R-AUTH-021, R-AUTH-023

Source: code: src/features/auth/recovery.ts

### D-015 Undecided link tokens are parked for one tab (accepted)

Until the bootstrap has a definite answer for link tokens, they are kept in sessionStorage (this tab only, never in a URL or history entry), for at most 24 hours, together with the session key current when they were parked. A reload retries them only if nobody signed in or out in between.

**Why:** A network failure while validating a link must not burn it.

**Rejected:**

- Dropping the link on a network failure.
- Keeping the tokens in the URL.

Related: R-AUTH-021, R-AUTH-022

Source: code: src/features/auth/auth-redirect.ts; code: src/features/auth/auth-bootstrap.ts

### D-016 Session identity from the unverified session_id claim (accepted)

A sign-in is identified by the session_id claim of its access token (stable across refreshes, new with every sign-in), or by the user id when there is none. The token payload is decoded without verifying its signature.

**Why:** It is used only to tell sessions apart in this browser, never to grant access: the server checks every request.

**Rejected:** none recorded.

Source: code: src/features/auth/session-identity.ts

### D-017 Clear the query cache when the user changes (accepted)

The TanStack Query cache is cleared whenever the signed-in user changes, including sign-out.

**Why:** Never show one user's cached data to another.

**Rejected:** none recorded.

Related: R-AUTH-025

Source: code: src/features/auth/auth-provider.tsx

### D-018 Zod runs jitless (accepted)

z.config({ jitless: true }) runs before any schema is parsed.

**Why:** The production CSP forbids eval; Zod's probe for new Function is caught, but the browser still reports a CSP violation.

**Rejected:**

- Zod's default probe and compiled parsers.

Related: C-CSP-001

Source: code: src/lib/zod-config.ts

### D-019 Validation messages are translation keys (accepted)

Form schemas return translation keys; forms translate them when rendering. Passwords need 8 characters, display names at most 80.

**Why:** The language can change while an error is shown.

**Rejected:** none recorded.

Related: R-AUTH-005, R-AUTH-006

Source: code: src/features/auth/schemas.ts

### D-020 Language detection (accepted)

The UI language is the stored choice, else the browser language, reduced to en or fr ("fr-CH" -> "fr"), with English as the fallback. French text uses a narrow no-break space before ? ! : and ;.

**Why:** Respect an explicit choice, then the browser.

**Rejected:** none recorded.

Related: R-I18N-002

Source: code: src/lib/i18n.ts; code: src/locales/fr/translation.ts

### D-021 Email confirmation stays on in production (accepted)

Email confirmation is kept on for production, with a custom SMTP server for real use.

**Why:** The free tier sender sends only a few emails per hour.

**Rejected:** none recorded.

Source: docs/deployment.md

### D-022 Narrow connect-src to the project, checked at deploy (accepted)

The CSP connect-src should list only the project URL (https and wss); the Deploy workflow stops before building when VITE_SUPABASE_URL is not allowed by connect-src, and checks the policy that actually ships.

**Why:** The browser may only talk to origins the CSP allows.

**Rejected:** none recorded.

Source: docs/deployment.md; code: .github/scripts/check-csp.mjs

### D-023 Domain logic is pure and unit-tested in the client (superseded by D-024)

Period, pay-date and versioning logic is pure and unit-tested.

**Why:** Testable logic.

**Rejected:** none recorded.

Source: CLAUDE.md: Rules (commit c5df8db)

### D-024 Domain logic has one implementation, in the database (accepted)

Period, pay-date and versioning logic has one implementation, in the database (SQL functions, tested with pgTAP). The client reads the results; it never recomputes them.

**Why:** One implementation cannot disagree with itself; the database must enforce the invariants anyway.

**Rejected:**

- A second implementation in the client (D-023).

Related: C-LOGIC-001, C-LOGIC-002, C-LOGIC-003

Source: CLAUDE.md: Rules (commit 7700940)

### D-025 Periods are numbered; versions refer to period numbers (accepted)

Periods are numbered per budget (seq 1, 2, ...). Income validity (first_seq, end_seq) and versions (effective_from_seq) refer to seq, not to dates. An income counts in period p when first_seq <= p and (end_seq is null or p < end_seq), at the version with the greatest effective_from_seq <= p.

**Why:** Moving a period boundary never changes which version applies.

**Rejected:**

- Versions effective from a date.

Related: R-PERIOD-018, R-VERSION-005

Source: docs/database.md: Conventions; code: supabase/migrations/20261115220913_budgets_members_incomes_periods.sql

### D-026 "Today" comes from one database function (accepted)

A database function returns the Europe/Zurich calendar date; it is the only source of the current date, and the browser never sends "today". Tests pin it by replacing the function inside their transaction.

**Why:** One clock for every rule that depends on the date.

**Rejected:**

- The browser's clock.
- UTC.

Related: R-PERIOD-017

Source: docs/database.md: Conventions; code: supabase/migrations/20261115220913_budgets_members_incomes_periods.sql

### D-027 Writes go through RPCs with stable error codes (accepted)

Writes that touch several rows or carry invariants go through security definer RPCs that check membership themselves. The client writes directly only budgets.name and incomes.name (members) and deletes budgets and invitations (owner). RPC errors are SQLSTATE P0001 with a stable snake_case message that the client maps to translated text.

**Why:** Invariants are enforced in one place; the client can translate every error.

**Rejected:** none recorded.

Source: docs/database.md; code: supabase/migrations/20261115220913_budgets_members_incomes_periods.sql

### D-028 Not found, never forbidden (accepted)

A request for a budget, income, period or invitation the caller cannot see is answered as not found; reads of rows outside one's budgets return no rows, never an error.

**Why:** Non-members cannot tell a budget they may not see from one that does not exist.

**Rejected:** none recorded.

Related: R-SECURITY-004

Source: docs/database.md: Conventions

### D-029 Limits (superseded by D-066)

At most 20 owned budgets per user, 20 members per budget, 20 pending invitations per budget, 50 incomes per budget (ended ones included). Income amounts from 1 to 1 000 000 000 rappen. A budget starts at most 60 months back; an end date at most ten years ahead; a period is never empty and at most 70 days long. The limits are defined in one place in the migration.

**Why:** Bound the work of every RPC and keep abuse cheap.

**Rejected:** none recorded.

Related: R-BUDGET-012, R-BUDGET-013, R-MEMBER-010, R-INVITE-006, R-INCOME-013, R-INCOME-014, R-PERIOD-019, R-PERIOD-020

Source: docs/database.md

### D-030 An income that never counted is deleted, not ended (accepted)

Removing an income deletes it if it never counted in a past period, and otherwise ends it from the current period. The same applies to the incomes of a member who is removed or leaves.

**Why:** An income added by mistake leaves no trace; history is kept otherwise.

**Rejected:** none recorded.

Related: R-INCOME-012, R-MEMBER-007

Source: docs/database.md: RPCs

### D-031 The primary income also blocks leaving (accepted)

A member whose income is the primary income can neither be removed nor leave until another income is made primary.

**Why:** The budget must keep a primary income.

**Rejected:** none recorded.

Related: R-MEMBER-009, R-MEMBER-005

Source: docs/database.md: RPCs

### D-032 An end date snaps forward to a period end (superseded by D-067)

Setting an end date moves it forward to the end of the period that contains it, projected with the primary income's current terms. Clearing it resumes period generation. An end date that would delete existing periods is refused, and a boundary that is the budget's end date is changed through the end date.

**Why:** The end date always falls on a period boundary without deleting history.

**Rejected:** none recorded.

Related: R-BUDGET-008

Source: docs/database.md: RPCs

### D-033 Invitations are idempotent per address (accepted)

Inviting the same address again returns the same invitation; addresses are stored lower case; inviting a member's address is refused (already_member).

**Why:** Members' emails are visible to the owner anyway, so already_member reveals nothing new.

**Rejected:** none recorded.

Related: R-INVITE-005

Source: docs/database.md: RPCs; code: supabase/migrations/20261115220913_budgets_members_incomes_periods.sql

### D-034 Database conventions (accepted)

Functions the API must not call live in the private schema, which the Data API does not expose. Functions use search_path = '' and schema-qualified names. Privileges are granted explicitly (auto_expose_new_tables = false): revoke everything from the API roles, then grant only what the policies allow. Policies call (select auth.uid()).

**Why:** Nothing is exposed by accident, and auth.uid() is evaluated once per statement.

**Rejected:** none recorded.

Source: code: supabase/migrations/20261115151317_create_profiles.sql

### D-035 Shared membership helpers (accepted)

Policies use private.member_budget_ids() and private.owned_budget_ids() as `budget_id in (select ...)`; the helpers are security definer.

**Why:** The helper runs once per statement and never re-enters the policies of budget_members (no recursion).

**Rejected:**

- Re-deriving membership in every policy.

Related: C-RLS-003

Source: code: supabase/migrations/20261115220913_budgets_members_incomes_periods.sql; docs/database.md: For later tables

### D-036 Invariants are constraint triggers checked at commit (accepted)

Invariants (owner is a member, primary income is active, every income has a version from its first period, periods numbered and contiguous up to the end date) are constraint triggers checked at commit.

**Why:** Multi-row RPCs can pass through intermediate states.

**Rejected:** none recorded.

Source: code: supabase/migrations/20261115220913_budgets_members_incomes_periods.sql

### D-037 Period creation is serialised per budget (superseded by D-069)

Every function that creates or moves periods first locks the budget row; ensure_periods is idempotent and safe under concurrent calls.

**Why:** Concurrent callers run one after the other and cannot create duplicate periods.

**Rejected:** none recorded.

Source: code: supabase/migrations/20261115220913_budgets_members_incomes_periods.sql; docs/database.md: RPCs

### D-038 Deferred: 13th salary and one-off incomes (accepted)

Incomes are monthly for now; a 13th salary or a one-off income comes later.

**Why:** Not needed for the first version.

**Rejected:** none recorded.

Related: R-INCOME-010

Source: domain: Income

### D-039 Deferred: per-category rollover (accepted)

Category balances reset at the end of each period; per-category rollover may come later as an opt-in.

**Why:** Keep the first version simple.

**Rejected:** none recorded.

Related: R-PROGRESS-001

Source: domain: Period

### D-040 No bank connection; actuals may be overlaid later (accepted)

The money flow diagram is drawn from the plan. The app has no bank connection, so it does not depend on detecting automatic transactions. Actuals may be overlaid later.

**Why:** No bank integration.

**Rejected:**

- Detecting automatic transactions from a bank feed.

Related: R-ACCOUNT-007

Source: domain: Account and planned transfer (money flow)

### D-041 Deferred: import from a connector (accepted)

Import is reachable from a paste/CSV screen and a repository script first, and later from a connector.

**Why:** Ship the two paths that need no extra integration first.

**Rejected:** none recorded.

Source: domain: Import (including by a Claude session)

### D-042 Temporary "test pending" marker for untagged database tests (accepted)

A rule or convention whose proof lives in supabase/tests may carry a visible testPending marker until those tests are tagged with ids. spec:check reports every marker as a warning, with a count, and errors on a marker anywhere else (planned rule, enforcement other than test).

**Why:** The database tests were being edited by another developer when the spec was introduced; the check must pass without silently passing or weakening those rules.

**Rejected:**

- Silently treating untagged rules as covered.
- Downgrading them to enforcement review.

Source: owner-request

### D-043 Profiles are created by a database trigger (accepted)

A trigger on auth.users creates the profile at sign-up from the display name sent as sign-up metadata. Clients cannot insert or delete profiles; deleting the user cascades.

**Why:** Every user has a profile without a client round trip.

**Rejected:** none recorded.

Related: R-PROFILE-001

Source: code: supabase/migrations/20261115151317_create_profiles.sql; code: src/features/profile/use-profile.ts

### D-044 Deploying in a subfolder (accepted)

VITE_BASE_PATH sets both Vite's base and the router basename at build time; .htaccess works out the base path itself.

**Why:** The same build works at a domain root or in a subfolder.

**Rejected:** none recorded.

Source: README.md: Environment variables; code: public/.htaccess

### D-045 Members manage every income of the budget (accepted)

Any member of a budget can add, edit and remove any income in that budget, including one belonging to another member. A new income belongs to the member who adds it by default; the form lets them choose another member. Decided by the product owner on 2026-11-15.

**Why:** It matches "every member can read and edit everything in the budget" and what the database already does.

**Rejected:**

- Members can only add and edit their own incomes.

Related: Q-001, R-INCOME-002, R-INCOME-050, R-MEMBER-001

Source: owner-request: product owner decision on Q-001, 2026-11-15

### D-046 The current budget is a per-user browser preference (accepted)

The budget a user works in is kept in localStorage under a key that names the user; when it is missing or no longer in my_budgets, the first budget by name is used (and not stored until the user chooses). my_budgets is refetched on window focus and after any "not found" answer. Users without a budget are routed to /welcome; app pages require a budget.

**Why:** Reloads keep the choice, two people sharing a browser keep their own, and a budget that disappears is replaced at once.

**Rejected:**

- Storing the choice in the database: a per-browser convenience, not budget data.
- Putting the budget id in every URL: longer links and more routing for a household app.

Related: R-BUDGET-050, R-BUDGET-051

Source: code: src/features/budgets/current-budget-provider.tsx; code: src/features/budgets/budget-routes.tsx

### D-047 One mutation pattern with one error mapping (accepted)

Writes go through useAppMutation: pending state, a translated success toast, the error either inline (forms, dialogs) or as a toast (one-click actions), and invalidation of the affected queries (everything of a budget sits under ["budget", id]). Errors are mapped in src/lib/db-errors.ts only, with a generic translated fallback, and a call may word some codes its own way (for example "already deleted" for delete_budget); the list of codes is checked against the contract's error table; a "not found" answer is always toasted and refetches my budgets.

**Why:** Later features copy one pattern; a new error code is one line plus its two translations.

**Rejected:** none recorded.

Related: R-APP-004, D-027, C-QUERY-001

Source: code: src/hooks/use-app-mutation.ts; code: src/lib/db-errors.ts

### D-048 Day N of M uses the browser's date, display only (superseded by D-070)

The dashboard's "day N of M" counts calendar days from the current period's start to the browser's local date, clamped to the period. Which period is current, its dates and its totals come from the database. To be replaced if the contract provides today (Q-016).

**Why:** The contract gives no "today"; the number is cosmetic and never sent back.

**Rejected:** none recorded.

Related: Q-016, R-PERIOD-017, C-LOGIC-003

Source: code: src/features/dashboard/period-progress.ts

### D-060 One period per calendar month (superseded by D-080)

Each period belongs to one calendar month (periods.month) and starts on that month's salary (anchor_date, the scheduled actual pay date). Consecutive periods have consecutive months. A period's projected end is the day before the actual pay date of the next month's nominal pay day under the terms in force for the next period. A mid-period change of the primary's pay day or weekend rule therefore applies to the next month's pay date.

**Why:** An early salary, a close-by nominal date or a pay-day change could otherwise cut a period short and count a month's salary twice.

**Rejected:**

- Projecting the end from the first pay date after the period start: an early salary created a 2-day period and a second salary in the same month (review finding 1).

Related: R-PERIOD-021, R-PERIOD-002, R-PERIOD-010, R-VERSION-008

Source: owner-request: coordinator decisions on the step 2 database review, 2026-11-15; docs/database.md: RPCs; code: supabase/migrations/20261115220913_budgets_members_incomes_periods.sql

### D-061 A manual boundary lies within 14 days of its salary (superseded by D-080)

A boundary set by hand must leave the next period starting within 14 days of the scheduled pay date of its month. This bound replaces the 70-day period length limit as the abuse limit.

**Why:** It covers public holidays and late or early salaries, and stops repeated early closes from creating periods without salaries.

**Rejected:**

- A maximum period length of 70 days: allowed several 1-day periods each with the full income.

Related: R-PERIOD-020, R-PERIOD-012, R-PERIOD-013

Source: owner-request: coordinator decisions on the step 2 database review, 2026-11-15; docs/database.md: RPCs; code: supabase/migrations/20261115220913_budgets_members_incomes_periods.sql

### D-062 No period starts after today (superseded by D-080)

Periods exist only up to the one containing today. Moving the boundary before the latest period to today or later means the salary has not arrived yet: the latest period is removed and the previous one is current again with that end. Moving any earlier boundary to today or later is refused.

**Why:** A future period made an earlier one current again and let an edit be written to a closed period while the next one kept stale terms (review finding 2).

**Rejected:** none recorded.

Related: R-PERIOD-022, R-PERIOD-023, R-PERIOD-024

Source: owner-request: coordinator decisions on the step 2 database review, 2026-11-15; docs/database.md: RPCs; code: supabase/migrations/20261115220913_budgets_members_incomes_periods.sql

### D-063 Every manual boundary operation has an inverse (superseded by D-082)

move_period_boundary(period, null) resets the boundary after a period to the schedule; any move can be moved back. Closing a period early is undone by moving or resetting that boundary, which removes the period started early if its salary is still to come.

**Why:** One-way operations any member can trigger turn a mistake into permanent damage.

**Rejected:** none recorded.

Related: R-PERIOD-025

Source: owner-request: coordinator decisions on the step 2 database review, 2026-11-15; docs/database.md: RPCs; code: supabase/migrations/20261115220913_budgets_members_incomes_periods.sql

### D-064 Writing a version discards later versions (superseded by D-083)

Writing a version for period s deletes the versions of the same entity keyed to later periods, through one generic trigger (private.discard_later_versions) that every versioned table (incomes now; categories, subscriptions and debts later) uses.

**Why:** A version left for a later period (after a late salary removed that period) would otherwise shadow the edit just saved.

**Rejected:** none recorded.

Related: R-VERSION-009

Source: owner-request: coordinator decisions on the step 2 database review, 2026-11-15; docs/database.md: RPCs; code: supabase/migrations/20261115220913_budgets_members_incomes_periods.sql

### D-065 Explicit corrections of the past are allowed, implicit ones never (accepted)

Normal edits and removals apply from the current period. update_income_terms and remove_income take an optional from-period (default current) so a mistake, including a back-dated one, can be corrected or the income removed from the period it started in (which deletes it).

**Why:** A back-dated typo otherwise stayed in every past total for good (review finding 3a).

**Rejected:** none recorded.

Related: R-VERSION-010, R-INCOME-015

Source: owner-request: coordinator decisions on the step 2 database review, 2026-11-15; docs/database.md: RPCs; code: supabase/migrations/20261115220913_budgets_members_incomes_periods.sql

### D-066 Limits (revised) (superseded by D-085)

At most 20 owned budgets per user, 20 members per budget, 20 pending (unexpired) invitations per budget, 50 incomes in force and 500 incomes in all per budget. Income amounts from 1 to 1 000 000 000 rappen. A budget starts at most 60 months back; an end date at most ten years ahead. A manual boundary lies within 14 days of its salary (D-061). The limits are defined in one place in the migration.

**Why:** Counting ended incomes made the income limit a lifetime limit (review finding 3b); the period-length limit did not stop abuse (D-061).

**Rejected:** none recorded.

Related: R-BUDGET-012, R-BUDGET-013, R-MEMBER-010, R-INVITE-006, R-INCOME-013, R-INCOME-016, R-INCOME-014, R-PERIOD-019, R-PERIOD-020

Source: owner-request: coordinator decisions on the step 2 database review, 2026-11-15; docs/database.md: RPCs; code: supabase/migrations/20261115220913_budgets_members_incomes_periods.sql

### D-067 The end date is a final month (superseded by D-086)

A budget stores its final month (end_month). Setting an end date picks the month whose period contains it; the end date shown is that period's end (projected while it does not exist), so it follows later changes of the terms and is always a normal boundary. The final boundary is adjusted like any other, in one call. An end date that would delete existing periods is refused.

**Why:** A stored end date became a stub period with a full month's income when the terms changed (review finding 10).

**Rejected:** none recorded.

Related: R-BUDGET-008, R-BUDGET-014, R-BUDGET-015

Source: owner-request: coordinator decisions on the step 2 database review, 2026-11-15; docs/database.md: RPCs; code: supabase/migrations/20261115220913_budgets_members_incomes_periods.sql

### D-068 Invitations expire and name the inviter (accepted)

Invitations expire 30 days after they were last sent; re-inviting renews the same invitation. list_my_invitations returns the inviter's name and email. Invitation security depends on Supabase Auth "Confirm email" staying on in the hosted project (docs/deployment.md).

**Why:** A display name is chosen by its owner and proves nothing; an invitation should not stay valid for ever.

**Rejected:** none recorded.

Related: R-INVITE-007, R-INVITE-008, R-INVITE-009, D-021

Source: owner-request: coordinator decisions on the step 2 database review, 2026-11-15; docs/database.md: RPCs; code: supabase/migrations/20261115220913_budgets_members_incomes_periods.sql

### D-069 Budget writes take an advisory lock; reads take none (accepted)

Every RPC that changes a budget's periods, incomes or members takes a transaction-level advisory lock for the budget and only then reads the rows it checks. ensure_periods and get_current_period take no lock when there is nothing to create. Accepting an invitation locks the invitation row.

**Why:** A row lock on the budget blocked page loads behind any transaction inserting rows of the budget (review finding 6); reading before locking gave raw errors and let a cancelled invitation be accepted (findings 4 and 7).

**Rejected:** none recorded.

Related: R-SECURITY-006, R-SECURITY-007, R-INVITE-010, R-PERIOD-009

Source: owner-request: coordinator decisions on the step 2 database review, 2026-11-15; docs/database.md: RPCs; code: supabase/migrations/20261115220913_budgets_members_incomes_periods.sql

### D-070 The database gives "today" and the start months (accepted)

period_summaries (and so get_current_period) carry the database's today; get_today() returns it on its own; get_start_months(pay day, weekend rule) returns today and the valid start months with the date each first period would start.

**Why:** The client must never use the browser's clock for what the database decides (Q-016).

**Rejected:** none recorded.

Related: R-PERIOD-027, R-PERIOD-028, R-PERIOD-017, Q-016

Source: owner-request: coordinator decisions on the step 2 database review, 2026-11-15; docs/database.md: RPCs; code: supabase/migrations/20261115220913_budgets_members_incomes_periods.sql

### D-071 create_budget takes the end date (accepted)

create_budget has an optional end date, applied in the same transaction.

**Why:** A second call could fail and leave a budget without the end date the user asked for (Q-017).

**Rejected:** none recorded.

Related: R-BUDGET-017, Q-017

Source: owner-request: coordinator decisions on the step 2 database review, 2026-11-15; docs/database.md: RPCs; code: supabase/migrations/20261115220913_budgets_members_incomes_periods.sql

### D-072 Deletes go through RPCs that say why (accepted)

Deleting a budget and cancelling an invitation are RPCs (delete_budget, cancel_invitation) that answer budget_not_found / invitation_not_found or not_owner; the client has no direct delete privilege on these tables.

**Why:** A direct delete affecting no rows cannot tell "not allowed" from "already gone".

**Rejected:** none recorded.

Related: R-BUDGET-018, R-MEMBER-002, R-MEMBER-004

Source: owner-request: coordinator decisions on the step 2 database review, 2026-11-15; docs/database.md: RPCs; code: supabase/migrations/20261115220913_budgets_members_incomes_periods.sql

### D-073 A manual end survives a terms change only within 14 days (superseded by D-080)

When the primary's terms change or the primary is switched, a manual end of the current period is kept while it lies within 14 days of the new schedule, and reset to the schedule otherwise.

**Why:** Keeping it unconditionally would let the next period start more than 14 days from its salary (D-061).

**Rejected:**

- Refusing the terms change: blocks the user for a boundary they may have forgotten.

Related: R-PERIOD-026, R-PERIOD-014

Source: owner-request: coordinator decisions on the step 2 database review, 2026-11-15; docs/database.md: RPCs; code: supabase/migrations/20261115220913_budgets_members_incomes_periods.sql

### D-074 Profiles carry the email and stay readable for income labels (superseded by D-088)

profiles.email mirrors the account email (trigger on auth.users). Members can read the profiles of co-members and of anyone with an income in their budgets.

**Why:** Member lists show emails; a former member's ended income must keep its owner's name.

**Rejected:** none recorded.

Related: R-PROFILE-004, R-PROFILE-005

Source: owner-request: coordinator decisions on the step 2 database review, 2026-11-15; docs/database.md: RPCs; code: supabase/migrations/20261115220913_budgets_members_incomes_periods.sql

### D-080 Periods are salary to salary; stored periods are facts (accepted)

A period runs from one salary to the day before the next. Stored periods are facts: only the boundary operations move a stored boundary. The schedule (the primary income's pay day and weekend rule) only predicts the next pay date. Structural invariants only, none depending on terms: contiguous, non-overlapping, none starting after today or after the budget's end date, each 7 to 92 days long. Known limits of the model: a first salary arriving 8 to 14 days after a period started is skipped by the projection until recorded by hand (record_early_pay_date); two salaries closer than 7 days cannot be separate periods.

**Why:** The month anchor and the 14-day rule (D-060, D-061) tied stored periods to the terms currently in force: budgets got stuck (every period call failing) and real pay-day changes, such as from the 5th to the 25th within one month, could not be represented.

**Rejected:**

- One period per calendar month within 14 days of its scheduled salary (D-060, D-061): see why.

Related: R-PERIOD-020, R-PERIOD-022, R-PERIOD-029, R-PERIOD-031

Source: owner-request: coordinator decision on the second step 2 database review, 2026-11-16; docs/database.md: RPCs; code: supabase/migrations/20261115220913_budgets_members_incomes_periods.sql

### D-081 The projection rule (accepted)

The next pay date after a period is the first actual pay date, under the primary income's terms in force, at least 15 days after the period's start; the projected end is the day before. When re-projecting because terms changed, the next pay date must also be after today, so the current period stays current. One pure function (private.next_salary_date).

**Why:** Periods generated this way are never shorter than 15 days, an early salary never creates a stub, and a change of terms never closes a period retroactively.

**Rejected:** none recorded.

Related: R-PERIOD-002, R-PERIOD-010, R-PERIOD-030, R-VERSION-008

Source: owner-request: coordinator decision on the second step 2 database review, 2026-11-16; docs/database.md: RPCs; code: supabase/migrations/20261115220913_budgets_members_incomes_periods.sql

### D-082 Boundary operations, each with an inverse (accepted)

Four operations: set_expected_pay_date (the current period's end, after today; null resets it to the projection); record_early_pay_date (the salary arrived early: the next period starts on a date up to today); reopen_previous_period (the salary has not arrived yet: the latest period is merged into the previous one, which ends before a future date or at its projection; the inverse of an early close); move_period_start (moves the boundary between two existing periods to a date up to today; undone by moving it back). Every write RPC catches the periods up to today first. The length bounds are the abuse limit.

**Why:** Each real-life case has one clear operation, and each has an inverse.

**Rejected:**

- One move_period_boundary operation whose meaning depended on the period's position: hard to use and to undo.

Related: R-PERIOD-012, R-PERIOD-013, R-PERIOD-023, R-PERIOD-025, R-PERIOD-032, R-PERIOD-033, R-PERIOD-034

Source: owner-request: coordinator decision on the second step 2 database review, 2026-11-16; docs/database.md: RPCs; code: supabase/migrations/20261115220913_budgets_members_incomes_periods.sql

### D-083 Merging the latest period re-keys what was keyed to it (superseded by D-089)

When the latest period is merged into the previous one, everything keyed to it (income versions, incomes starting or ending there, and so the primary switch) is re-keyed to the previous period, the later write winning. Nothing is ever keyed beyond the latest period (constraint trigger). One shared mechanism: private.rekey_period over the registry private.period_keyed_tables, which later versioned tables (categories, subscriptions, debts) join.

**Why:** A change made "now" must always be in force now; the discard-later-versions mechanism (D-064) is no longer needed.

**Rejected:** none recorded.

Related: R-VERSION-011

Source: owner-request: coordinator decision on the second step 2 database review, 2026-11-16; docs/database.md: RPCs; code: supabase/migrations/20261115220913_budgets_members_incomes_periods.sql

### D-084 A correction applies until the next change (accepted)

A correction from period K writes the version at K and leaves later versions alone: it applies from K until the next existing change.

**Why:** Correcting one early period rewrote every later period (review finding 3).

**Rejected:** none recorded.

Related: R-VERSION-010, R-VERSION-012, D-065

Source: owner-request: coordinator decision on the second step 2 database review, 2026-11-16; docs/database.md: RPCs; code: supabase/migrations/20261115220913_budgets_members_incomes_periods.sql

### D-085 Limits (revised again) (accepted)

At most 20 owned budgets per user, 20 members per budget, 20 pending (unexpired) invitations per budget, 50 incomes in force and 500 incomes in all per budget. Income amounts from 1 to 1 000 000 000 rappen. A budget starts at most 60 months back; an end date at most ten years ahead. A period is 7 to 92 days long (generated periods at least 15 by construction). The limits are defined in one place in the migration.

**Why:** The 14-day rule is gone (D-080); the length bounds are the abuse limit for boundary operations.

**Rejected:** none recorded.

Related: R-BUDGET-012, R-BUDGET-013, R-MEMBER-010, R-INVITE-006, R-INCOME-013, R-INCOME-016, R-INCOME-014, R-PERIOD-019, R-PERIOD-020

Source: owner-request: coordinator decision on the second step 2 database review, 2026-11-16; docs/database.md: RPCs; code: supabase/migrations/20261115220913_budgets_members_incomes_periods.sql

### D-086 The budget end is the date entered (accepted)

The budget stores the end date the owner entered. No period starts after it; the period containing it is the last and ends at its normal projected end. The end shown (my_budgets.end_date) is that period's end and follows later term changes by itself; it can be adjusted like the current period's end.

**Why:** A stored final month tied the end to the calendar-month model (D-067).

**Rejected:** none recorded.

Related: R-BUDGET-008, R-BUDGET-014, R-BUDGET-015

Source: owner-request: coordinator decision on the second step 2 database review, 2026-11-16; docs/database.md: RPCs; code: supabase/migrations/20261115220913_budgets_members_incomes_periods.sql

### D-087 One lock order (accepted)

Every RPC takes the budget's advisory lock before any row lock; accept_invitation, decline_invitation and cancel_invitation included.

**Why:** accept_invitation locked the invitation row before the budget while invite_member did the opposite, which deadlocked (review finding 4).

**Rejected:** none recorded.

Related: R-INVITE-011, D-069

Source: owner-request: coordinator decision on the second step 2 database review, 2026-11-16; docs/database.md: RPCs; code: supabase/migrations/20261115220913_budgets_members_incomes_periods.sql

### D-088 A former member keeps only their name (accepted)

Members read the profiles (name and email) of people who share a budget with them now. A former member's income keeps its owner's display name through income_overview.user_display_name only.

**Why:** A later joiner could read the email of a former member they never shared the budget with (review finding 5).

**Rejected:** none recorded.

Related: R-PROFILE-003, R-PROFILE-004

Source: owner-request: coordinator decision on the second step 2 database review, 2026-11-16; docs/database.md: RPCs; code: supabase/migrations/20261115220913_budgets_members_incomes_periods.sql

### D-100 A yearly amount shows as one twelfth, rounded to the rappen (accepted)

A yearly amount is stored as yearly. The monthly figure shown is one twelfth of it, rounded to the nearest rappen. The twelve monthly shares are not required to add up exactly to the yearly amount. Decided by the product owner on 2026-11-16.

**Why:** Answer to Q-002. A simple, predictable monthly figure matters more than a few rappen of difference over a year.

**Rejected:**

- Spreading the remainder over some months so that twelve shares add up exactly to the yearly amount.

Related: Q-002, R-CATEGORY-004, R-CATEGORY-005, R-CATEGORY-070, Q-050

Source: owner-request: product owner decisions on the open questions, 2026-11-16

### D-101 Left to assign is per period (accepted)

The amount left to assign for a period is that period's income total minus the sum of the category expectations in force in that period. Decided by the product owner on 2026-11-16.

**Why:** Answer to Q-003. Incomes and expectations are both versioned per period, so the two sides of the subtraction must come from the same period.

**Rejected:**

- The monthly total of the incomes in force now.

Related: Q-003, R-CATEGORY-006, R-PERIOD-018

Source: owner-request: product owner decisions on the open questions, 2026-11-16

### D-102 Transactions are positive expenses, with a refund option, on the lowest level (accepted)

A transaction is an expense entered as a positive amount. A "refund" option records money coming back; a refund reduces what was spent in its category. When a category has subcategories, a transaction goes on a subcategory, never on the parent category. Decided by the product owner on 2026-11-16.

**Why:** Answer to Q-004. Users enter what they paid as they see it on the receipt; tracking happens where the expectations are set (R-CATEGORY-002).

**Rejected:**

- Signed amounts, with a negative amount for money coming back.
- Transactions directly on a category that has subcategories.

Related: Q-004, R-TRANSACTION-001, R-TRANSACTION-070, R-TRANSACTION-071, R-TRANSACTION-072, Q-051, Q-052

Source: owner-request: product owner decisions on the open questions, 2026-11-16

### D-103 A period's result is income minus spending (accepted)

A period's result is its income total minus the total spent in it: a surplus when positive, a deficit when negative. Per category, the result is the expected amount minus what was spent. Decided by the product owner on 2026-11-16.

**Why:** Answer to Q-012. It tells the household whether it lived within its income, whatever was assigned.

**Rejected:**

- Measuring the period's result against the sum of its expectations.

Related: Q-012, R-PROGRESS-002, R-PROGRESS-070

Source: owner-request: product owner decisions on the open questions, 2026-11-16

### D-104 Browsing past periods is part of step 3 (accepted)

Browsing a past period and seeing its progress view belongs to step 3 (period progress view). The comparison charts stay in step 5. Decided by the product owner on 2026-11-16.

**Why:** Answer to Q-010. A past period's progress view is the same view as the current one; only the charts are new work.

**Rejected:**

- Browsing past periods only with the comparison charts of step 5.

Related: Q-010, R-COMPARE-001

Source: owner-request: product owner decisions on the open questions, 2026-11-16

### D-105 What stays editable in a past period (accepted)

In a past period, transactions can be added, edited and deleted freely. Its boundaries are changed through the period actions. Incomes and category expectations are changed only through the explicit "correct an earlier period" option. Decided by the product owner on 2026-11-16.

**Why:** Answer to Q-011. Late receipts and corrections of what was spent are normal; changing the plan of a past period must be deliberate.

**Rejected:**

- Only transactions are editable in a past period.
- Everything in a past period is editable freely.

Related: Q-011, R-TRANSACTION-008, R-PERIOD-012, D-065, D-082, R-VERSION-070

Source: owner-request: product owner decisions on the open questions, 2026-11-16

### D-106 Overspending and over-assigning are never blocked (accepted)

Overspending a category and assigning more than the income are never blocked. An overspent category is shown as overspent; assigning more than the income shows a negative amount left to assign. Decided by the product owner on 2026-11-16.

**Why:** The app records what happens and shows it; it does not stop the household from recording reality or planning.

**Rejected:**

- Refusing a transaction or an expectation that goes over the limit.

Related: R-TRANSACTION-073, R-PROGRESS-071, R-CATEGORY-071

Source: owner-request: product owner decisions on the open questions, 2026-11-16

### D-107 Categories end like incomes; expectations are versioned like incomes (accepted)

Deleting a category that has transactions or has counted in a past period ends it from the current period and keeps it in past periods, like incomes (D-030); one that has neither is deleted. Category expectations are versioned like incomes: an edit applies from the current period, with the same optional "correct an earlier period" (D-065). Decided by the product owner on 2026-11-16.

**Why:** Past periods must keep showing what was planned and spent in them.

**Rejected:**

- Deleting a category together with its transactions and its history.

Related: R-CATEGORY-072, R-CATEGORY-073, R-VERSION-002, R-VERSION-070, D-030, D-065, Q-053

Source: owner-request: product owner decisions on the open questions, 2026-11-16

### D-108 Subscription cadences and charge dates (accepted)

Subscription cadences are monthly, quarterly, half-yearly and yearly. A subscription has a first charge date and then repeats on the same day of the month, clamped to the month's length. No weekend rule applies to subscriptions. Decided by the product owner on 2026-11-16.

**Why:** Answer to Q-006. Providers charge on a calendar day, weekends included.

**Rejected:**

- Applying the incomes' weekend rule to subscription charges.

Related: Q-006, R-SUBSCRIPTION-001, R-SUBSCRIPTION-070, R-SUBSCRIPTION-071, R-SUBSCRIPTION-072

Source: owner-request: product owner decisions on the open questions, 2026-11-16

### D-109 Subscription charges are recorded automatically and confirmed on the dashboard (accepted)

On its charge date, a subscription's transaction is created automatically, marked as coming from the subscription, and can be edited or deleted. The dashboard shows a notification for each such automatic charge asking the user to confirm that it really went through; until confirmed it is marked as awaiting confirmation. The user can instead say it did not go through, which removes it. Assumption (not asked of the product owner): a charge awaiting confirmation counts in totals immediately, like imported transactions (D-118). Decided by the product owner on 2026-11-16.

**Why:** Recurring charges should not have to be typed in, but a failed or cancelled charge must not stay in the budget unnoticed.

**Rejected:**

- Entering subscription charges by hand.

Related: R-SUBSCRIPTION-073, R-SUBSCRIPTION-074, R-SUBSCRIPTION-075, R-SUBSCRIPTION-076, R-SUBSCRIPTION-077, R-SUBSCRIPTION-078, D-118, Q-054

Source: owner-request: product owner decisions on the open questions, 2026-11-16

### D-110 A subscription is committed inside its category (accepted)

A subscription's monthly cost is shown as "committed" inside its category's expectation, not added on top of it. Decided by the product owner on 2026-11-16.

**Why:** The category's expectation stays the whole plan for that kind of spending; the subscription shows how much of it is already spoken for.

**Rejected:**

- Adding subscriptions on top of the category expectations.

Related: R-SUBSCRIPTION-079, Q-050

Source: owner-request: product owner decisions on the open questions, 2026-11-16

### D-111 A transaction links to at most one of a debt or a subscription (accepted)

A transaction links to at most one of a debt or a subscription. Decided by the product owner on 2026-11-16.

**Why:** Answer to Q-005.

**Rejected:**

- Linking a transaction to both a debt and a subscription.

Related: Q-005, R-TRANSACTION-003

Source: owner-request: product owner decisions on the open questions, 2026-11-16

### D-112 Debts belong to a category; payments are transactions (accepted)

A debt is tied to a category. A payment is a normal transaction in that category, linked to the debt. Only debts the household owes are tracked, not money owed to it. Decided by the product owner on 2026-11-16.

**Why:** Debt payments are spending like any other and must count in the budget without being entered twice.

**Rejected:**

- Tracking money owed to the household as well.

Related: R-DEBT-070, R-DEBT-071, R-DEBT-072

Source: owner-request: product owner decisions on the open questions, 2026-11-16

### D-113 Remaining amount, interest and expected end of a debt (accepted)

A debt's remaining amount is the principal plus accrued interest minus the payments linked to it. When the debt has an interest rate, once per period one twelfth of the yearly rate is applied to the remaining balance and added to it, and shown in the debt's history. The expected end date is projected from the planned monthly payment; when the payment does not cover the interest, the app says the debt never ends. A manual "adjust balance" entry lets the user match their bank statement. Decided by the product owner on 2026-11-16.

**Why:** Answer to Q-007. A simple model the user can check against the bank, with an escape hatch when the bank computes differently.

**Rejected:**

- Remaining amount as the principal minus the payments, ignoring interest.

Related: Q-007, R-DEBT-003, R-DEBT-004, R-DEBT-005, R-DEBT-073, R-DEBT-074, R-DEBT-075, Q-055

Source: owner-request: product owner decisions on the open questions, 2026-11-16

### D-114 The comparison charts (accepted)

Step 5 has these charts: income, spent and result per period over the last 12 periods; spending per category across periods; and two periods side by side. The product owner leaves latitude to include anything else that brings value to the user, and sets a quality bar: keep it beautiful. Decided by the product owner on 2026-11-16.

**Why:** These answer the household's questions: how are we doing over the year, where does the money go, what changed.

**Rejected:** none recorded.

Related: R-COMPARE-002, R-COMPARE-070, R-COMPARE-071

Source: owner-request: product owner decisions on the open questions, 2026-11-16

### D-115 What an import duplicate is (accepted)

An imported row is a duplicate when it has the same date, amount and description as an existing transaction, or the same bank transaction id when the file has one. Duplicates are skipped and listed in the import summary, with an "import anyway" option. Decided by the product owner on 2026-11-16.

**Why:** Answer to Q-009. Re-importing an overlapping export must not double the spending, but two genuine identical purchases must still be possible.

**Rejected:**

- Silently dropping duplicates with no way to import them.

Related: Q-009, R-IMPORT-003, R-IMPORT-070, R-IMPORT-071, R-IMPORT-072, R-IMPORT-073, Q-056

Source: owner-request: product owner decisions on the open questions, 2026-11-16

### D-116 The import script authenticates with an import token (accepted)

The script a Claude session runs authenticates with an import token the user creates in Settings. A token is tied to one budget, can only add transactions through the import function (it cannot read anything), and can be revoked. Decided by the product owner on 2026-11-16.

**Why:** Answer to Q-013. Claude never gets raw database access to real data (R-SECURITY-005), nor the member's own credentials.

**Rejected:**

- The script signs in as the member.

Related: Q-013, R-IMPORT-006, R-IMPORT-074, R-IMPORT-075, R-IMPORT-076, R-IMPORT-077, R-SECURITY-005

Source: owner-request: product owner decisions on the open questions, 2026-11-16

### D-117 Merchant rules are offered in one click (accepted)

When the user categorises an imported transaction, the app offers "always put this merchant in this category?" with one click. The rules are editable in Settings. Decided by the product owner on 2026-11-16.

**Why:** Answer to Q-014. The user stays in control of the rules, at the cost of one click.

**Rejected:**

- Saving a rule automatically whenever an imported transaction is categorised.

Related: Q-014, R-IMPORT-007, R-IMPORT-078, R-IMPORT-079, Q-057

Source: owner-request: product owner decisions on the open questions, 2026-11-16

### D-118 Imported transactions count at once and wait for review (accepted)

Imported transactions count in totals immediately and are flagged "to review" until the user confirms them. Decided by the product owner on 2026-11-16.

**Why:** Totals stay close to reality right after an import, and the flag still shows what has not been checked.

**Rejected:**

- Leaving imported transactions out of the totals until they are reviewed.

Related: R-IMPORT-004, R-IMPORT-080, R-IMPORT-081

Source: owner-request: product owner decisions on the open questions, 2026-11-16

### D-119 Generic CSV import plus presets for the household's sources (superseded by D-126)

The import offers a generic CSV import with column mapping, plus presets for the product owner's sources: Migros Bank, Raiffeisen, One, Yuh and Twint. Which product "One" is and what each source exports are open (Q-058). Decided by the product owner on 2026-11-16.

**Why:** Any bank's export can be imported, and the household's own sources need no mapping.

**Rejected:** none recorded.

Related: R-IMPORT-082, R-IMPORT-083, Q-058

Source: owner-request: product owner decisions on the open questions, 2026-11-16

### D-120 How a planned transfer is scheduled (accepted)

A planned transfer is scheduled either as an offset in days from a chosen income's actual pay date (the primary income by default), or on a fixed day of the month. Decided by the product owner on 2026-11-16.

**Why:** Answer to Q-008. Members are paid on different days, and some transfers follow the calendar rather than a salary.

**Rejected:**

- Always counting from the primary income's pay date (the period start).

Related: Q-008, R-ACCOUNT-002, R-ACCOUNT-070, R-ACCOUNT-071, Q-059

Source: owner-request: product owner decisions on the open questions, 2026-11-16

### D-121 Planned transfers are versioned like incomes (accepted)

Planned transfers are versioned like incomes: an edit applies from the current period. Decided by the product owner on 2026-11-16.

**Why:** Answer to Q-015. Past periods' checklists and flows keep showing the plan that was in force.

**Rejected:**

- Edits to a planned transfer rewrite every period.

Related: Q-015, R-VERSION-071, R-ACCOUNT-002

Source: owner-request: product owner decisions on the open questions, 2026-11-16

### D-122 A planned transfer can create its transaction in a category (accepted)

A planned transfer can be linked to a category (for example savings, third pillar, taxes). When it is marked done, or when it is automatic, the transaction is created in that category, so it is not entered twice. Decided by the product owner on 2026-11-16.

**Why:** Transfers to savings, the third pillar or the tax reserve are part of the budget; recording them once avoids double entry.

**Rejected:**

- Entering the transfer's transaction by hand as well.

Related: R-ACCOUNT-072, R-ACCOUNT-073, R-ACCOUNT-074, Q-060

Source: owner-request: product owner decisions on the open questions, 2026-11-16

### D-123 No account balances (accepted)

Account balances are not tracked; the money flow diagram shows flows only. Decided by the product owner on 2026-11-16.

**Why:** The app has no bank connection (D-040); balances kept by hand would drift from the bank's.

**Rejected:**

- Tracking a balance per account.

Related: R-ACCOUNT-075, D-040

Source: owner-request: product owner decisions on the open questions, 2026-11-16

### D-124 Concurrent edits: the second save is refused (accepted)

When two members edit the same thing at the same time, the second save is refused with a message that it was changed by someone else and must be reloaded. This applies to every editable record, starting with incomes. It is implemented with step 3, for the existing step 2 records as well. Decided by the product owner on 2026-11-16.

**Why:** Answer to Q-018. Every member can edit everything (D-045); silently losing another member's change is worse than asking to reload.

**Rejected:**

- The last write wins without a warning (the step 2 behaviour).

Related: Q-018, R-CONCURRENCY-070, D-045

Source: owner-request: product owner decisions on the open questions, 2026-11-16

### D-125 Account deletion comes after step 7 (accepted)

There is no account deletion until after step 7. When it is built, an owner must first transfer ownership of their budgets or delete them, and a member deleting their account counts as leaving the budget. Until then, R-BUDGET-016 records the database behaviour only; no client path deletes accounts. Decided by the product owner on 2026-11-16.

**Why:** Answer to Q-030. Deleting the owner's account must not delete a budget other members rely on, and a deleted member's incomes must follow the leaving rules (R-MEMBER-007, R-MEMBER-009).

**Rejected:**

- Deleting the owner's account deletes their budgets for every member.

Related: Q-030, R-BUDGET-016, R-MEMBER-007, R-MEMBER-009

Source: owner-request: product owner decisions on the open questions, 2026-11-16

### D-089 In a merge, the merged period always wins (accepted)

When the latest period is merged into the previous one, everything keyed to the merged (later) period is re-keyed to the previous one and replaces what the previous period had for the same record, whatever the write times. So the terms in force before a reopen are still in force after it. Nothing is ever keyed beyond the latest period. One shared mechanism (private.rekey_period over private.period_keyed_tables). What the reopened period loses can be listed beforehand (preview_reopen). The inverse of a reopen (record_early_pay_date with the original date) restores the boundary only: what was recorded in the merged period then belongs to the reopened period, and moving it back needs explicit corrections.

**Why:** "The later write wins" let a correction of the previous period, written after a raise in the new period, undo the raise; re-keyed versions got fresh write times and beat later corrections (review finding 1).

**Rejected:**

- The later write wins (D-083).

Related: R-VERSION-011, R-VERSION-013, R-PERIOD-023, R-PERIOD-035

Source: owner-request: coordinator decision on the third step 2 database review, 2026-11-16; docs/database.md: RPCs; code: supabase/migrations/20261115220913_budgets_members_incomes_periods.sql

### D-090 Removing a member from an ended budget takes effect if it resumes (accepted)

Removing a member (or a member leaving) after the budget has ended leaves its history as it is and marks their incomes in force (incomes.ended_after_last); if the budget ever resumes, they end from the first period created after the end.

**Why:** Nothing may be keyed beyond the latest period, yet the removal must hold when an owner clears the end date (review finding 2).

**Rejected:** none recorded.

Related: R-MEMBER-011, R-MEMBER-008

Source: owner-request: coordinator decision on the third step 2 database review, 2026-11-16; docs/database.md: RPCs; code: supabase/migrations/20261115220913_budgets_members_incomes_periods.sql

### D-091 What a period-keyed table must provide (accepted)

A table registers in private.period_keyed_tables, checked at registration: all need id uuid and budget_id uuid; validity tables first_seq integer, end_seq integer, a text name column and a check allowing end_seq = first_seq; version tables an entity column (uuid) referencing a registered validity table, effective_from_seq integer and a unique constraint on (entity, effective_from_seq). In a merge, a validity row that would never be in force is deleted, or kept as a void row (end_seq = first_seq, never in force) when other rows reference it, so a reopen never fails on a foreign key.

**Why:** Step 3 registers categories, which transactions reference; the merge must neither fail at reopen time nor silently need columns nobody documented (review finding 4).

**Rejected:** none recorded.

Related: R-VERSION-014

Source: owner-request: coordinator decision on the third step 2 database review, 2026-11-16; docs/database.md: RPCs; code: supabase/migrations/20261115220913_budgets_members_incomes_periods.sql

### D-092 Previews before writes (accepted)

preview_reopen lists, from the registry, every change a reopen would move (record kind, id, name, added / ended / removed / terms_changed / made_primary, and whether it replaces the previous period's own entry). preview_expected_pay_date gives the current period's end and expected pay date for proposed terms or a proposed primary, through the same function the write uses (private.reprojected_end).

**Why:** The UI must be able to warn before a lossy reopen and show the effect of a pay-day change before it is saved.

**Rejected:** none recorded.

Related: R-PERIOD-035, R-PERIOD-036

Source: owner-request: coordinator decision on the third step 2 database review, 2026-11-16; docs/database.md: RPCs; code: supabase/migrations/20261115220913_budgets_members_incomes_periods.sql

### D-140 A half rappen rounds up; totals add the rounded shares (accepted)

One twelfth of a yearly amount is rounded half up to the rappen. A total shown for a period (expected, left to assign, results) adds the rounded monthly shares, so what is displayed adds up. Decided by the project coordinator on 2026-11-16, on the product owner's instruction to proceed on the coordinator's defaults.

**Why:** Answer to Q-050. A user adding up the monthly figures on screen gets the total shown.

**Rejected:**

- Rounding the exact sum of the yearly amounts: the total would differ from the sum of the figures shown.
- Banker's rounding: unfamiliar, for no benefit at this size.

Related: Q-050, D-100, R-CATEGORY-005, R-CATEGORY-091

Source: owner-request: project coordinator decisions on the step 3 open questions, 2026-11-16 (the product owner asked to proceed on the coordinator's defaults); code: supabase/migrations/20261116120000_categories_transactions_progress.sql

### D-141 The first subcategory makes a group; what the category held moves to "Other" (accepted)

A category becomes a group (categories.is_group) when its first subcategory is created, and stays one. When it already had transactions or a non-zero expectation, those, with every past expectation version, move to a subcategory created with it, named by the client (shown as "Other"), valid from the category's first period. A group holds no expectation and no transaction; its figures are the sums of its subcategories'. Decided by the project coordinator on 2026-11-16, on the product owner's instruction to proceed on the coordinator's defaults.

**Why:** Answer to Q-051. No transaction is ever left on a category that has subcategories (D-102), past periods keep their totals, and a category that stays a group keeps one shape across its history.

**Rejected:**

- Refusing the first subcategory while the category has transactions: the user would have to move them by hand.
- Turning a group back into a leaf when its last subcategory goes: open as Q-081.

Related: Q-051, D-102, R-CATEGORY-090, R-CATEGORY-092, R-TRANSACTION-072

Source: owner-request: project coordinator decisions on the step 3 open questions, 2026-11-16 (the product owner asked to proceed on the coordinator's defaults); code: supabase/migrations/20261116120000_categories_transactions_progress.sql

### D-142 Concurrent edits: one revision per record (superseded by D-150)

Every editable record (budget, income, category, transaction, and every later one) has an integer revision, raised by a trigger whenever its row changes and explicitly when a dependent row changes (an income's terms, a category's expectation). Every edit or removal RPC takes p_expected_revision and refuses with record_changed when it differs; the write RPCs take the budget lock first, so a second save waits for the first and then sees the new revision. Step 3 RPCs require it (invalid_revision when missing). Step 2's update_income_terms, remove_income and set_budget_end_date take it as an optional last argument, and the direct renames of budgets and incomes stay, so the previous release keeps working (D-006); new rename_budget and rename_income RPCs check it. A later release makes it required and revokes the direct renames. Reordering categories is not a revision change; a reorder is refused instead when the set of siblings changed.

**Why:** Answer to Q-018 and D-124 as one mechanism that later steps reuse: a column, a trigger, an argument and an error code.

**Rejected:**

- Comparing updated_at timestamps: two writes in one transaction share a timestamp.
- Requiring the revision on step 2 RPCs at once: the deployed client would fail until the frontend ships.

Related: D-124, D-006, R-CONCURRENCY-070, R-CONCURRENCY-090

Source: owner-request: project coordinator brief for the step 3 database, 2026-11-16; code: supabase/migrations/20261116120000_categories_transactions_progress.sql; docs/database.md: Concurrent edits

### D-143 An extra income is a transaction of its own kind (accepted)

Money coming in that is neither a salary nor a refund is a transaction of kind extra_income, with a date, an amount, an optional description and no category. It adds to the income total of the period containing its date (period_summaries.extra_income_total, included in income_total) and to nothing else. Decided by the project coordinator on 2026-11-16, on the product owner's instruction to proceed on the coordinator's defaults (the kind of record is the database developer's choice).

**Why:** Answer to Q-052. One list, one form, one date rule and one paging contract for everything recorded by date; an import (step 6) produces credits and debits alike.

**Rejected:**

- A separate table of extra incomes: a second list and form with the same rules.
- A one-off income among the monthly incomes: incomes are monthly and versioned (D-038).

Related: Q-052, D-038, D-102, R-TRANSACTION-092, R-PERIOD-018

Source: owner-request: project coordinator decisions on the step 3 open questions, 2026-11-16 (the product owner asked to proceed on the coordinator's defaults); code: supabase/migrations/20261116120000_categories_transactions_progress.sql

### D-144 A back-dated transaction may use an ended category (accepted)

A transaction goes on a category in force in the period containing its date. A back-dated transaction may therefore use a category that has since ended, when it was in force in that period; a category not yet in force then, or already ended then, is refused (category_not_in_force). list_categories_for_date gives the categories a date may use. Decided by the project coordinator on 2026-11-16, on the product owner's instruction to proceed on the coordinator's defaults.

**Why:** Answer to Q-053. Late receipts land where they belong (D-105) without reviving the category.

**Rejected:** none recorded.

Related: Q-053, D-105, D-107, R-TRANSACTION-091

Source: owner-request: project coordinator decisions on the step 3 open questions, 2026-11-16 (the product owner asked to proceed on the coordinator's defaults); code: supabase/migrations/20261116120000_categories_transactions_progress.sql

### D-145 Transactions are dated up to today (accepted)

A transaction is dated from the first period's start to today, and not after the last period's end (ended budgets). No period id is stored: a transaction belongs to the period containing its date and follows it through every boundary operation. With dates up to today no operation can leave a transaction outside every period (every operation keeps the current period's end on or after today, and the first period's start never moves); a deferred constraint checks it.

**Why:** The brief allowed dates up to the current period's end. But a change of the primary income's terms re-projects that end (R-PERIOD-011) and could leave a future-dated transaction outside every period; refusing a pay-day change because of a future-dated receipt would couple unrelated actions. Transactions record what happened; planned charges are subscriptions (step 4).

**Rejected:**

- Dates up to the current period's end, refusing any boundary or terms change that would leave one outside (as briefed): see why.
- Storing the period id on each transaction: it would have to be rewritten by every boundary operation.

Related: R-TRANSACTION-090, R-TRANSACTION-093, Q-083

Source: owner-request: project coordinator brief for the step 3 database, 2026-11-16; code: supabase/migrations/20261116120000_categories_transactions_progress.sql

### D-146 A merge voids or deletes rows one at a time (step 2 fix) (accepted)

private.rekey_period deletes each validity row that would never be in force after a merge on its own, and keeps it as a void row only when that delete fails on a foreign key. Step 2 tried one delete for all such rows and, if any was referenced, voided all of them, so an unreferenced income or category could linger as a void row.

**Why:** Found while registering categories, whose subcategories and transactions reference them (D-091).

**Rejected:** none recorded.

Related: D-091, R-VERSION-014

Source: code: supabase/migrations/20261116120000_categories_transactions_progress.sql

### D-147 What the progress view counts (accepted)

A period's progress has one row per category and subcategory in force in it, and one for every category with transactions dated in it even when not in force then (an ended or void category, or one whose period changed through a boundary operation): expected 0, spending counted. Spending is expenses minus refunds and may be negative. Each expectation counts once per period whatever the period's length, like an income (R-INCOME-011). Totals are the sums of the rows, computed by the same functions (private.expectations_in_force, private.spending_between).

**Why:** No transaction may drop out of the totals (the period result would lie), and the totals must never disagree with the rows.

**Rejected:**

- Hiding categories not in force: their spending would vanish from the rows but not from the result.

Related: R-PROGRESS-091, R-PROGRESS-092, R-CATEGORY-095, Q-080

Source: owner-request: project coordinator brief for the step 3 database, 2026-11-16; code: supabase/migrations/20261116120000_categories_transactions_progress.sql

### D-148 Limits for categories and transactions (superseded by D-153)

Per budget at most 200 categories and subcategories in force and 2000 in all, and 200 000 transactions. Expectation amounts from 0 to 1 000 000 000 rappen as entered (per month or per year); transaction amounts from 1 to 1 000 000 000 rappen; descriptions at most 500 characters; a page of the transaction list at most 200 rows. Defined in one place in the step 3 migration.

**Why:** Abuse bounds that no household reaches, and that keep every read bounded and every sum far inside bigint.

**Rejected:** none recorded.

Related: R-CATEGORY-094, R-TRANSACTION-094, D-085

Source: owner-request: project coordinator brief for the step 3 database, 2026-11-16; code: supabase/migrations/20261116120000_categories_transactions_progress.sql

### D-149 The transaction list is paged by a cursor in an RPC (accepted)

list_transactions returns a page of at most 200 rows in the stable order (date desc, created_at desc, id desc); the next page passes the last row's date, created_at and id. Filters: dates, category (a group includes its subcategories), kind. Each page is an index range scan, however deep.

**Why:** Offset paging slows down and shifts when rows are added; a keyset needs a unique order, and an RPC keeps the bound and the index use in the database.

**Rejected:**

- PostgREST offset paging (.range) on the view: unstable and slow deep in a long history.

Related: R-TRANSACTION-095

Source: owner-request: project coordinator brief for the step 3 database, 2026-11-16; code: supabase/migrations/20261116120000_categories_transactions_progress.sql; docs/database.md: Transactions

### D-126 Import sources: three PDF statements and the generic CSV import (accepted)

The import sources are the Migros Bank private-account statement, the Migros Bank credit-card bill (issued through Viseca and downloaded from its "one" app or portal) and the Yuh account statement, all as PDF files. Raiffeisen is dropped. TWINT needs no source of its own, because its entries appear in the Migros Bank account statement. The generic CSV import with column mapping stays. Decided by the product owner on 2026-11-16.

**Why:** Answer to Q-058. These are the statements the household receives; the product owner provided one sample of each, and none of them is a CSV export.

**Rejected:**

- Presets for Raiffeisen and for a TWINT export (D-119): the household does not need Raiffeisen, and TWINT entries are already in the Migros Bank statement.

Related: Q-058, D-119, R-IMPORT-082, R-IMPORT-083, R-IMPORT-084, R-IMPORT-085

Source: owner-request: product owner decision on the import sources, with sample statements, 2026-11-16

### D-127 Statements are parsed in the browser (accepted)

A statement is parsed in the browser; the PDF file never leaves the device. Only the extracted transactions are sent to the import function and saved. Decided by the project coordinator on 2026-11-16 as a default; the product owner may overrule it.

**Why:** A statement holds much more personal data than its transactions (address, IBAN, balances, other people's names and phone numbers); a file that is never uploaded needs no protection on the server. The app has no server of its own, so parsing in the browser also needs no new backend.

**Rejected:**

- Uploading the PDF to Supabase storage and parsing it on the server.

Related: D-126, R-IMPORT-086

Source: owner-request: coordinator decisions on the sample statements for the import, 2026-11-16

### D-128 An imported transaction is dated by its purchase date (accepted)

The date of an imported transaction is the purchase date when the statement gives one, otherwise the booking date. The value date is not used. Decided by the project coordinator on 2026-11-16 as a default; the product owner may overrule it.

**Why:** The purchase date is when the money was spent, so the spending lands in the right period; booking dates lag one to four days behind and would move purchases made at the end of a period into the next one.

**Rejected:**

- Always the booking date.
- The value date.

Related: R-IMPORT-090

Source: owner-request: coordinator decisions on the sample statements for the import, 2026-11-16

### D-129 Card-bill payments and own transfers are not expenses (accepted)

A payment of a credit-card bill and a transfer between the owner's own accounts are not expenses: the import flags them and skips them by default, and the user can import them anyway. The user's choice is remembered and proposed as the default the next time. Decided by the project coordinator on 2026-11-16 as a default; the product owner may overrule it.

**Why:** The card's purchases are imported from the card bill itself, so importing its payment too would count them twice; a transfer to one's own account moves money without spending it.

**Rejected:**

- Importing them like any other debit for the user to delete.
- Dropping them without telling the user.

Related: R-IMPORT-091, R-IMPORT-092, Q-063, Q-064

Source: owner-request: coordinator decisions on the sample statements for the import, 2026-11-16

### D-130 Salary credits are skipped, other credits are reviewed (accepted)

A salary credit that matches one of the budget's incomes is skipped, because that income already counts. Every other credit is proposed for review, either as a refund in a category or as extra income. Decided by the project coordinator on 2026-11-16 as a default; the product owner may overrule it.

**Why:** Incomes are planned in the budget, so importing the salary as well would count it twice. Most other credits are refunds or shares of a bill paid back, not income.

**Rejected:**

- Importing every credit as income.

Related: R-IMPORT-093, R-IMPORT-094, Q-065, Q-066

Source: owner-request: coordinator decisions on the sample statements for the import, 2026-11-16

### D-131 Investment purchases are ordinary transactions (accepted)

A securities purchase, such as a savings-plan purchase on Yuh, is imported as an ordinary transaction for the user to categorise. Decided by the project coordinator on 2026-11-16 as a default; the product owner may overrule it.

**Why:** The budget has no investment accounts yet; an ordinary transaction keeps the money visible and lets the user choose its category.

**Rejected:**

- Skipping investment purchases.
- Recording them as transfers to an investment account.

Related: R-IMPORT-095, Q-067

Source: owner-request: coordinator decisions on the sample statements for the import, 2026-11-16

### D-132 Interest and fee lines are imported (accepted)

Interest and fee lines of a statement, such as the late-payment interest of a card bill, are imported as transactions. Decided by the project coordinator on 2026-11-16 as a default; the product owner may overrule it.

**Why:** They are money spent; leaving them out would hide real costs from the budget.

**Rejected:**

- Skipping interest and fee lines.

Related: R-IMPORT-096

Source: owner-request: coordinator decisions on the sample statements for the import, 2026-11-16

### D-133 A foreign-currency purchase counts in CHF, fees included (accepted)

For a purchase in a foreign currency, the amount is the CHF amount billed, fees included, and the original currency and amount are kept in the description. Decided by the project coordinator on 2026-11-16 as a default; the product owner may overrule it.

**Why:** The CHF amount is what left the account (CHF is the only currency, R-MONEY-001); the original amount helps the user recognise the purchase.

**Rejected:**

- The converted amount alone, with the fee as a separate transaction.

Related: R-IMPORT-097, R-MONEY-001

Source: owner-request: coordinator decisions on the sample statements for the import, 2026-11-16

### D-134 French statements are supported first (accepted)

The statement parsers support the French versions of the three statements first; another language is added when a sample of it is available. Decided by the project coordinator on 2026-11-16 as a default; the product owner may overrule it.

**Why:** The samples are in French, and a parser can only be trusted once it is tested against a real layout.

**Rejected:**

- Supporting German, Italian and English from the start, without samples.

Related: R-IMPORT-098, Q-061

Source: owner-request: coordinator decisions on the sample statements for the import, 2026-11-16

### D-135 The next salary is announced from the current period (accepted)

For the primary income the app announces the next salary as the day after the current period's end (nextSalary, src/features/periods/next-salary.ts), never income_overview.next_pay_date: the period's end already holds an early salary, a date set by hand and the projection. In the budget's last period the app announces the budget's end, and once the budget has ended nothing. Other incomes keep their own schedule's next pay date.

**Why:** The step 2 browser review found the dashboard and the income card announcing the schedule (10.12) while the Periods page announced the period (11.01) for the salary that had just arrived early.

**Rejected:**

- income_overview.next_pay_date for the primary income: it is the schedule's next pay date on or after today and knows nothing of boundaries.

Related: R-INCOME-056, R-PERIOD-010, D-081

Source: owner-request: coordinator, step 2 browser review fixes, 2026-11-16

### D-136 Edit forms read their record by id and compare what they show (accepted)

Every edit form and removal confirmation reads its record by id (useRecord), independently of the list, filter or page it was opened from, and keeps the version it opened (useEditBase) whose revision it sends. The record's revision is its one revision source, but a form compares only the fields it shows: a newer revision that leaves them as they were becomes its base in silence (the user's own save in another form, another member changing another field). When a shown field changed: with nothing typed the form takes the other version and says what changed; with something typed it lists the other member's values field by field and offers "Load their version" or "Keep mine", which keeps only the fields the user edited (react-hook-form's dirty fields) so the save sends only those. A record deleted meanwhile is said to be gone. Built once (src/hooks/use-edit-base.ts, src/hooks/use-concurrent-form.ts, src/components/changed-elsewhere.tsx, src/features/budgets/record-queries.ts) and used by incomes, the budget's name and end date, categories and transactions; steps 4 to 7 reuse it.

**Why:** The first version looked the record up in whatever list was loaded (a transaction moved to another period by another member read as a dead end), compared revisions only (saving one settings form flagged the other) and, after "Keep mine", sent every field, reverting the other member's untouched changes. D-124 asks to refuse the second save; reloading the form would lose what was typed, and silently retrying would overwrite the other member.

**Rejected:**

- Looking the record up in the loaded list.
- Comparing revisions only.
- "Keep mine" sending every field of the form.
- Reloading the form with the other version, discarding what was typed.

Related: D-124, D-142, R-CONCURRENCY-091

Source: owner-request: coordinator brief for the step 3 screens, 2026-11-16; owner-request: coordinator, step 3 screens review fixes, 2026-11-16

### D-137 Period progress lives on the dashboard (accepted)

The progress view of a period is one component on the dashboard, below the current period, showing the current period by default and any other through ?period=<id> with previous / next buttons. The Periods page links each period there, and each category row links to the transactions page filtered by that period and category. Every figure is the database's (period_summaries, get_period_progress); only the length of a row's bar is computed in the client, for display.

**Why:** One implementation for the current and past periods (D-104), where people look first; the Periods page stays about boundaries.

**Rejected:**

- A separate progress page per period: a second place showing the same figures.

Related: D-104, R-PROGRESS-050, R-COMPARE-001

Source: owner-request: coordinator brief for the step 3 screens, 2026-11-16

### D-150 Revisions are required; no direct writes (accepted)

Nothing is deployed, so every edit and removal RPC requires p_expected_revision (invalid_revision when missing), including step 2's set_budget_end_date, remove_income and set_primary_income (the budget's revision, since the primary income is a budget field). The direct renames of budgets and incomes are removed (no update privilege, no policy); renames go through rename_budget and update_income, which edits an income's name and terms in one call and returns its new revision (replacing rename_income and update_income_terms). Ordering categories stays outside the revision (D-142).

**Why:** D-142 kept step 2's revision optional and the direct renames for a deployed release; there is none, and a check that a client may skip protects nothing. One income edit saves the two-call sequence that had to thread a revision between calls.

**Rejected:**

- Keeping the optional argument for one release (D-142): no release to stay compatible with.

Related: D-142, D-124, R-CONCURRENCY-090, R-INCOME-100

Source: owner-request: coordinator, step 3 database review, 2026-11-16; code: supabase/migrations/20261116120000_categories_transactions_progress.sql

### D-151 Boundary operations name the period they act on (accepted)

Periods have a revision. set_expected_pay_date, record_early_pay_date and reopen_previous_period take the current period's id and revision as the client read them (period_summaries.revision), and move_period_start the moved period's revision; each is refused with record_changed when that period is no longer current, changed or is gone. A write paired with a preview (update_income, set_primary_income) can send p_previewed_end_date and is refused when the current period would end on another day than the preview showed.

**Why:** A reopen called twice, by two members or by a retry after a timeout, merged two periods and lost the merged period's own records (review finding 1).

**Rejected:**

- An idempotency key per request: it guards retries but not two members acting on what they each saw.

Related: R-CONCURRENCY-100, R-PERIOD-036, D-082

Source: owner-request: coordinator, step 3 database review, 2026-11-16; code: supabase/migrations/20261116120000_categories_transactions_progress.sql

### D-152 A boundary on the schedule's day is not set by hand (accepted)

move_period_start marks the previous period's end as set by hand only when the boundary is not where the schedule puts it (the previous period's projected end, the day before); moving it back clears the mark. Without a date, move_period_start moves the boundary to the schedule. Decided by the project coordinator on 2026-11-16, on the product owner's instruction to proceed on the coordinator's defaults.

**Why:** Answer to Q-071: moving a boundary and moving it back left both periods marked as set by hand, and nothing could clear the mark on a past period.

**Rejected:**

- Dropping the mark for past periods: it still says the boundary differs from the schedule.

Related: Q-071, R-PERIOD-100, R-PERIOD-014

Source: owner-request: project coordinator decision on the step 3 database review, 2026-11-16 (the product owner asked to proceed on the coordinator's defaults); code: supabase/migrations/20261116120000_categories_transactions_progress.sql

### D-153 Limits (revised); costs depend on the budget's own rows (accepted)

Per budget at most 200 categories and subcategories in force and 500 in all, void rows not counted, and 50 000 transactions; amounts, descriptions and pages as in D-148. Every read and write costs what the budget holds: no query scans another budget's rows (lookups by category are planned for the actual id), and each deferred check of a row checks that row, so a merge or a move to "Other" at the limits stays within a few seconds (the hosted statement timeout is 8 s).

**Why:** D-148's bounds were far beyond a household and a free-tier database; the categories page scanned every budget's transactions, and a reopen with 2000 categories took 13 s because each row's check scanned the whole budget (review findings 4 and limits).

**Rejected:** none recorded.

Related: D-148, R-CATEGORY-094, R-TRANSACTION-094, R-CATEGORY-102

Source: owner-request: coordinator, step 3 database review, 2026-11-16; code: supabase/migrations/20261116120000_categories_transactions_progress.sql

### D-154 Count from an earlier period, and restore (accepted)

Two explicit corrections, like the others: extend_category makes a category count from an earlier period (its earliest expectation there unless an amount is given; a subcategory never before its group), and restore_category restores an ended category from the current period, expecting nothing in the periods between its end and now so that their totals do not change, or, as a correction, from the period it ended, as if it had never ended (a subcategory needs its group in force). Both keep the group and subcategory shape and are reported by preview_reopen like any other recorded change. Decided by the project coordinator on 2026-11-16, on the product owner's instruction to proceed on the coordinator's defaults.

**Why:** Answer to Q-082 and review finding 5: a category could not be made to count before its first period, so older transactions (and later the import of older statements) were refused, and an ended category with transactions could neither be restored nor recreated.

**Rejected:**

- Recreating the category under the same name: two histories for one thing.

Related: Q-082, D-065, R-CATEGORY-100, R-CATEGORY-101

Source: owner-request: project coordinator decision on the step 3 database review, 2026-11-16 (the product owner asked to proceed on the coordinator's defaults); code: supabase/migrations/20261116120000_categories_transactions_progress.sql

### D-155 The registry checks what it promises (accepted)

private.check_period_keyed_table also refuses a validity table whose check constraints on first_seq and end_seq alone refuse a void row (each is evaluated for first_seq = end_seq = 1), and a version table with no foreign key from its entity column to its entity table.

**Why:** D-091 and the docs said both were checked; the step 2 check accepted either (review).

**Rejected:** none recorded.

Related: D-091, R-VERSION-100

Source: owner-request: coordinator, step 3 database review, 2026-11-16; code: supabase/migrations/20261116120000_categories_transactions_progress.sql

### D-156 Client types show what can be null (accepted)

get_period_progress and list_categories_for_date return named row types (public.category_progress_row, public.category_choice), so the generated types mark their fields as nullable; reorder_categories takes p_parent_id last, optional (null: the top level). docs/database.md says which fields are actually never null.

**Why:** The generated types claimed amount, cadence and parent_id were never null and required a parent id for the top level (review finding 6).

**Rejected:** none recorded.

Related: R-PROGRESS-090

Source: owner-request: coordinator, step 3 database review, 2026-11-16; code: supabase/migrations/20261116120000_categories_transactions_progress.sql

### D-157 Previews take the write's arguments (accepted)

preview_expected_pay_date is replaced by preview_update_income (the income and the terms and correction period update_income takes) and preview_set_primary_income (the income), computed with the write's own helpers (private.income_edit_seq, private.income_new_terms, private.reprojected_end), including a correction shadowed by a later version.

**Why:** The old preview could not express a correction from an earlier period, and previewed a shadowed correction wrongly (review).

**Rejected:** none recorded.

Related: D-092, R-PERIOD-036, D-151

Source: owner-request: coordinator, step 3 database review, 2026-11-16; code: supabase/migrations/20261116120000_categories_transactions_progress.sql

### D-158 Corrections work in an ended budget (accepted)

An explicit correction names its period and works in an ended budget: create_category with p_from_period_id is accepted there like update_category, end_category, extend_category and add_transaction; only what applies from the current period answers budget_ended.

**Why:** create_category refused a correction that the other category RPCs accepted (review).

**Rejected:** none recorded.

Related: D-065, R-CATEGORY-093

Source: owner-request: coordinator, step 3 database review, 2026-11-16; code: supabase/migrations/20261116120000_categories_transactions_progress.sql

### D-159 A transaction keeps its category in its period (accepted)

A transaction may always keep the category it already has while it stays in the same period; the in-force check applies only when the category or the period changes. Decided by the project coordinator on 2026-11-16.

**Why:** A transaction whose category had ended, or had been voided by a reopen, could not be edited at all (review finding 3).

**Rejected:** none recorded.

Related: R-TRANSACTION-100, D-144

Source: owner-request: project coordinator decision on the step 3 database review, 2026-11-16 (the product owner asked to proceed on the coordinator's defaults); code: supabase/migrations/20261116120000_categories_transactions_progress.sql

### D-160 Values that only mean something together are one field for concurrent edits (accepted)

A view of a record's fields (FieldView in src/hooks/use-edit-base.ts) can name several form fields as one group: a category's amount and cadence, an income's pay day and weekend rule (step 4: a subscription's price and cadence). The group is one field everywhere a concurrent edit looks: detection and the banner compare and show it as one value; "Keep mine" keeps the whole group as the form shows it when the user edited any part of it, and takes the other member's version whole when they edited none; and the save sends the whole group when any part differs. This amends D-136's "keeps only the fields the user edited" for groups.

**Why:** Keeping dirty fields one by one combined two members' edits into a value neither chose: with 200.00 per month, Sam set 50.00 per month while Ann switched the cadence to per year, and "Keep mine" sent only the cadence, storing 50.00 per year, which neither chose; Ann's form showed 200.00 per year, which is what is now kept.

**Rejected:**

- Keeping each dirty form field on its own (D-136 as first built).
- Treating the whole record as one field: an untouched name would revert the other member's rename.

Related: D-136, R-CONCURRENCY-091

Source: owner-request: coordinator, step 3 final review, 2026-11-16; code: src/hooks/use-concurrent-form.ts

### D-170 Editing a subscription's schedule sets its next charge (accepted)

A subscription's terms carry the date its schedule counts from. An edit from now that gives a next charge date (after today) makes it the next charge, the later ones following at the cadence; a new cadence without a date continues from the next charge date of the current schedule; any other edit keeps the schedule. A charge already created never moves and a date already passed is never charged. A correction from an earlier period may name any date: it changes the terms recorded for those periods and the charges still to come, never those already created. Decided by the project coordinator on 2026-11-16 (step 4 brief: decide what an edit to the schedule does to the next charge date).

**Why:** The user thinks of a schedule change as "the next charge is then"; anchoring the new schedule on that date cannot move or duplicate a charge already made.

**Rejected:**

- Recomputing the whole schedule from the first charge date under the new cadence, which could skip or repeat a charge around the change.

Related: R-SUBSCRIPTION-114, R-VERSION-003

Source: owner-request: project coordinator decision for step 4, 2026-11-16 (the product owner asked to proceed on the coordinator's defaults); code: supabase/migrations/20261117100000_subscriptions_debts.sql

### D-171 Charges are created by the catch-up, exactly once per date (accepted)

There is no server, so subscription charges are created by the same catch-up that creates periods: whenever a member opens the budget and before every write, every charge date up to the database's today that has not been materialised is created, exactly once per subscription and date however many members or tabs trigger it at once (under the budget lock). Missed dates are caught up. Each subscription keeps a watermark (charged_through) that only moves forward, so a charge that was deleted or answered as not gone through is never created again for that date, and no edit, correction or reopen creates a charge for a date already passed. Decided by the project coordinator on 2026-11-16, on the product owner's instruction to proceed on the coordinator's defaults.

**Why:** Answer to Q-054. A watermark rather than one tombstone per dismissed charge: the same guarantee, with nothing to keep for dismissed dates.

**Rejected:**

- A scheduled job: there is no server (D-003).
- Recreating a dismissed charge on the next catch-up.

Related: Q-054, D-109, R-SUBSCRIPTION-073, R-SUBSCRIPTION-077, R-SUBSCRIPTION-111

Source: owner-request: project coordinator decision for step 4, 2026-11-16 (the product owner asked to proceed on the coordinator's defaults); code: supabase/migrations/20261117100000_subscriptions_debts.sql

### D-172 Interest at period creation; the projection and "never" (superseded by D-272)

Interest is applied when a new period is created, on the balance at that moment, as one twelfth of the yearly rate rounded half up to the rappen, as an entry of that period in the debt's history (dated at the period's start). It is applied exactly once per debt and period however the period came to exist (roll-over, catch-up over several periods, an early salary), and a reopen that merges a period removes the interest entry that period created. No interest on a balance of zero or less. A planned payment less than or equal to one period's interest means the debt never ends. The projection has a horizon of 600 periods (50 years) beyond which it answers "never". Decided by the project coordinator on 2026-11-16, on the product owner's instruction to proceed on the coordinator's defaults.

**Why:** Answer to Q-055. Periods run salary to salary, so the period, not the calendar month, is the step of interest; tying the entry to its period keeps a reopen exact.

**Rejected:**

- Interest at the end of a period, after its payments: the end of the current period is not a fact until the next one starts.

Related: Q-055, D-113, R-DEBT-073, R-DEBT-074, R-DEBT-111, R-DEBT-112, R-DEBT-113

Source: owner-request: project coordinator decision for step 4, 2026-11-16 (the product owner asked to proceed on the coordinator's defaults); code: supabase/migrations/20261117100000_subscriptions_debts.sql

### D-173 A non-monthly subscription's monthly cost (accepted)

The monthly cost of a subscription, for the committed figure, is its price divided by the number of months in its cadence (1, 3, 6, 12), rounded half up to the rappen; totals add the rounded monthly costs (as D-140). The charge itself counts in full in the period containing its date. Decided by the project coordinator on 2026-11-16, on the product owner's instruction to proceed on the coordinator's defaults.

**Why:** Answer to the subscription part of Q-050, the same rule as yearly expectations (D-140).

**Rejected:** none recorded.

Related: Q-050, D-140, D-110, R-SUBSCRIPTION-079

Source: owner-request: project coordinator decision for step 4, 2026-11-16 (the product owner asked to proceed on the coordinator's defaults); code: supabase/migrations/20261117100000_subscriptions_debts.sql

### D-174 Subscriptions and debts are versioned like incomes; ending follows the established rule (accepted)

A subscription's terms (price, cadence, category, schedule) and a debt's terms (interest rate, planned monthly payment) are versioned like incomes and category amounts, through the registry (private.period_keyed_tables), so committed figures and projections for past periods use the terms in force then, and a reopen treats them like any other recorded change. Ending or deleting follows the established rule: something that has counted in the past is ended from now and kept in the past; something that never counted is deleted. A debt with linked payments, or a subscription with charges, is never silently destroyed (a reopen keeps it as a void row). Decided by the project coordinator on 2026-11-16, on the product owner's instruction to proceed on the coordinator's defaults.

**Why:** One mechanism for every versioned record; the user's history is never lost to a removal or a reopen.

**Rejected:** none recorded.

Related: D-083, D-089, D-091, R-VERSION-003, R-VERSION-004, R-VERSION-110, R-SUBSCRIPTION-113, R-DEBT-113

Source: owner-request: project coordinator decision for step 4, 2026-11-16 (the product owner asked to proceed on the coordinator's defaults); code: supabase/migrations/20261117100000_subscriptions_debts.sql

### D-175 A charge is a transaction with its scheduled date and a review state (accepted)

An automatic charge is an ordinary expense transaction linked to its subscription, with the scheduled date it was created for (charge_date, unique per subscription; the transaction's own date may be edited) and review_state 'awaiting_confirmation' until a member confirms it (confirm_subscription_charge). "Did not go through" (dismiss_subscription_charge) deletes it; delete_transaction does the same. Editing a charge keeps it a charge and does not confirm it. The column review_state is the one step 6 planned for imports (D-118), which adds its own value.

**Why:** A charge must count in totals at once (D-109) and be edited like any transaction (R-SUBSCRIPTION-074): it is one. A single review state serves both automatic charges and, later, imports.

**Rejected:**

- A separate table of charges pointing at transactions: two records for one fact.

Related: D-109, D-118, R-SUBSCRIPTION-075, R-SUBSCRIPTION-111

Source: owner-request: database developer decision for step 4, within the coordinator's brief, 2026-11-16; code: supabase/migrations/20261117100000_subscriptions_debts.sql

### D-176 A subscription counts from its first period (accepted)

A subscription is in force from the period it is created in (or, as an explicit correction, from an earlier one); its charges are the scheduled dates on or after its first charge date in the periods where it is in force, so creating it creates at once, awaiting confirmation, the charges of its first period up to today (for a back-dated one, those of the earlier periods too). Dates before its first period are never charged. When the budget is at its transaction limit, charges wait (the watermark stops before the first that does not fit) and are created once there is room.

**Why:** A first charge date in the past sets the schedule without flooding closed periods with charges the user may have recorded by hand; an explicit correction is the only way to add charges to closed periods. Waiting at the limit never loses a charge.

**Rejected:**

- Charging every date since the first charge date, back to the budget's start.
- Skipping charges that do not fit the limit.

Related: R-SUBSCRIPTION-112, D-158

Source: owner-request: database developer decision for step 4, within the coordinator's brief, 2026-11-16; code: supabase/migrations/20261117100000_subscriptions_debts.sql

### D-177 Links: payments are expenses in the debt's category (accepted)

A transaction is linked through add_transaction (p_debt_id or p_subscription_id) or link_transaction (which also unlinks; unlinking a charge makes it an ordinary confirmed transaction). update_transaction keeps the link. A linked transaction is an expense; a debt payment is in the debt's category; the debt or subscription is in force in the period of the date; a linked transaction keeping its period and category keeps its link even when the debt's category changed or it ended (as D-159). A refund is never a payment.

**Why:** Step 3 callers of update_transaction send every field; a link they do not know of must not be dropped. Payments in the debt's category keep the category's spending and the debt's payments the same money.

**Rejected:**

- Refunds linked to a debt as reversed payments.

Related: D-111, D-112, D-159, R-TRANSACTION-003, R-TRANSACTION-110, R-DEBT-071

Source: owner-request: database developer decision for step 4, within the coordinator's brief, 2026-11-16; code: supabase/migrations/20261117100000_subscriptions_debts.sql

### D-178 Debt principal, balance adjustments and corrections (accepted)

A debt's principal can change only while it has no payment, interest or adjustment (a typo at creation); afterwards the balance is adjusted. adjust_debt_balance takes the balance the bank shows and the database stores the difference as a dated entry (no entry when there is none), so a payment recorded meanwhile cannot make it wrong; an adjustment can be deleted. A correction of a debt's terms from an earlier period records the terms for those periods and the projection, and never recomputes interest already added (each entry records the rate and balance it used); a wrong past interest is fixed with an adjustment. Ending a debt keeps its remaining amount. A debt created from an earlier period (a correction) starts its history at that period's start and gets no interest for periods that already existed.

**Why:** Interest entries are facts of the moment a period was created; recomputing them could not reproduce that moment.

**Rejected:**

- Recomputing every later interest entry after a rate correction.

Related: R-DEBT-075, R-DEBT-114, D-113

Source: owner-request: database developer decision for step 4, within the coordinator's brief, 2026-11-16; code: supabase/migrations/20261117100000_subscriptions_debts.sql

### D-179 Categories in use by subscriptions and debts (accepted)

end_category refuses (category_in_use) a category that a subscription or debt in force from that period still uses; one that any subscription version or debt references is ended rather than deleted, like one with transactions. Adding the first subcategory to a category with subscriptions or debts needs "Other", and moves them there with its transactions and expectations (create_category redefined). category_overview gains in_use and accounts for the references in removal_deletes.

**Why:** Otherwise a removal would fail on a foreign key, a charge would land on a category not in force or on a group, or a debt's payments would have nowhere to go.

**Rejected:**

- Ending the subscriptions and debts with the category.

Related: D-141, D-146, R-CATEGORY-110

Source: owner-request: database developer decision for step 4, within the coordinator's brief, 2026-11-16; code: supabase/migrations/20261117100000_subscriptions_debts.sql

### D-180 Limits for subscriptions and debts (accepted)

Per budget at most 50 subscriptions in force and 200 in all, 50 debts in force and 200 in all (void rows not counted), and 5000 balance adjustments; prices, principals and planned payments up to 1 000 000 000 rappen; interest rates 0 to 100 % with three decimals; a schedule date at most ten years ahead; a debt's balance never grows beyond 1 000 000 000 000 rappen through interest or an adjustment. Automatic charges count towards the 50 000 transactions (D-153). Defined in one place in the step 4 migration.

**Why:** Abuse bounds: with 50 monthly subscriptions, ten years of absence create 6000 charges in one catch-up, within the hosted statement timeout.

**Rejected:** none recorded.

Related: D-153, R-SUBSCRIPTION-110, R-DEBT-110

Source: owner-request: database developer decision for step 4, within the coordinator's brief, 2026-11-16; code: supabase/migrations/20261117100000_subscriptions_debts.sql

### D-181 The payoff projection (accepted)

debt_overview projects, for a debt in force in a budget with a current period: 'paid_off' when nothing remains; otherwise the planned payment still due in the current period (the planned payment minus what was paid in it) is paid first, then each later period adds its interest and receives the planned payment, until nothing remains ('ends', with payments_left and expected_end_date, the projected end of the period of the last payment, future periods following the primary income's schedule) or the planned payment does not exceed a period's interest or the horizon is reached ('never').

**Why:** Counting this period's payment once, whether or not it was made yet, keeps the end date stable through the period.

**Rejected:** none recorded.

Related: D-272, R-DEBT-005, R-DEBT-112

Source: owner-request: database developer decision for step 4, within the coordinator's brief, 2026-11-16; code: supabase/migrations/20261117100000_subscriptions_debts.sql

### D-190 Charts: shadcn chart (Recharts), theme colours, lazy route (accepted)

Charts use shadcn's chart component on Recharts. Series colours are the theme tokens --chart-1 to --chart-5, set for light and dark to the palette of D-405 (every pair validated for colour-vision deficiencies, each at least 3:1 on the card); identity is never colour alone (lines have their own mark and dash, there is a legend and a table). The page that draws a chart is its own lazily loaded route, so Recharts never reaches the first load. A debt's chart is a step line of the balance on a time axis (dates spaced by days, no time zone), its value axis scaled to the balances so a few payments show (zero drawn when in range).

**Why:** Step 5 needs more charts; shadcn's component fits the existing UI kit; the production Content-Security-Policy allows the inline style element it writes (style-src 'unsafe-inline') and no script.

**Rejected:**

- A hand-drawn SVG chart (no library): step 5 would redo it.

Related: R-DEBT-122, C-CSP-001, D-405

Source: owner-request: coordinator brief for the step 4 screens, 2026-11-16; owner-request: coordinator, independent review of the step 4 and step 5 screens at a24615e, 2026-11-16

### D-191 The client adds up no debt amounts (superseded by D-216)

The debts page shows what is still owed in all, and how many debts owe it, as debt_totals gives them (D-216); each debt's paid share and overpaid amount are paid_percent and overpaid_by. Nothing about a debt is added up or computed in the client. (Until the database gave the total, the page added up the remaining amounts of the debts in force.)

**Why:** C-LOGIC-003: the database owns the figures; Q-110 asked for the total and D-216 answered it. Reworded rather than superseded: the migration that gives the total names this decision.

**Rejected:** none recorded.

Related: R-DEBT-121, Q-110, C-LOGIC-003, D-216

Source: owner-request: coordinator brief for the step 4 screens, 2026-11-16; owner-request: coordinator, step 4 screens review round 2, 2026-11-16

### D-192 A debt has its own page (accepted)

Each debt opens on its own route (/debts/<id>), with its figures, chart, history and actions; an unknown or deleted id says the debt does not exist. A payment in the history leads to the transactions of its period (there is no page for one transaction).

**Why:** The chart and the history need room, and the route can be loaded lazily (D-190).

**Rejected:** none recorded.

Related: R-DEBT-122, D-190

Source: owner-request: coordinator brief for the step 4 screens, 2026-11-16

### D-193 What the subscription form previews (accepted)

The form asks the database for the dates (subscription_charge_dates) of the schedule it describes: a new subscription from its first charge date, starting at the period it counts from, the dates up to today flagged as charged at once; an edit with a new next charge date from that date; a new cadence alone, from now, from the current next charge date; otherwise the current schedule from its next charge. The next charge date of an edit is optional (blank keeps the schedule) and, from now, must be after today.

**Why:** D-170 decides what an edit does to the schedule; the form must show it before saving without computing a schedule itself (C-LOGIC-003).

**Rejected:** none recorded.

Related: R-SUBSCRIPTION-121, D-170

Source: owner-request: coordinator brief for the step 4 screens, 2026-11-16

### D-194 Changing a transaction's debt link takes several calls (superseded by D-218)

update_transaction never changes a link (D-177), so an edit that changes the debt a transaction pays calls link_transaction to remove the old link before the fields change, update_transaction, then link_transaction to add the new one, each with the revision the previous call returned. They are not one transaction: a failure part-way leaves the steps already done (the form shows the error, the lists are read again).

**Why:** Removing first and linking last keeps every intermediate state valid (a payment is always in its debt's category). Q-111 asks for one call.

**Rejected:** none recorded.

Related: R-DEBT-123, D-177, Q-111, D-218

Source: owner-request: coordinator brief for the step 4 screens, 2026-11-16

### D-195 Answering an automatic charge (accepted)

A charge awaiting confirmation is answered from the dashboard card or from the transactions list. "It went through" confirms at once; "It did not go through" asks first and says the charge will not be created again for that date. When another member answered first (record_changed, or the charge is gone), the list is read again and a message says so; nothing is resent.

**Why:** Dismissing deletes a transaction for good (R-SUBSCRIPTION-077); confirming is harmless.

**Rejected:** none recorded.

Related: R-SUBSCRIPTION-076, R-SUBSCRIPTION-077, R-SUBSCRIPTION-123

Source: owner-request: coordinator brief for the step 4 screens, 2026-11-16

### D-196 A subscription's terms are one group for concurrent edits (accepted)

Applying D-160 to subscriptions: price, cadence and the new next charge date of the edit form are one group (a new cadence moves the schedule, so the date belongs with it). A debt's rate and planned payment stay independent fields.

**Why:** A price kept from one member and a cadence from another would charge an amount nobody chose (the step 3 category case).

**Rejected:** none recorded.

Related: D-160, R-SUBSCRIPTION-122

Source: owner-request: coordinator brief for the step 4 screens, 2026-11-16

### D-210 A correction starts from the terms of its period (superseded by D-230)

The correction forms (incomes, categories, subscriptions, debts) read the terms in force in the period chosen from the version tables the contract makes readable (income_versions, category_expectations, subscription_versions, debt_versions: the row with the greatest effective_from_seq not after the period's seq), show them as the starting values, and send only what the user changes from them. Until the database gives these terms itself (Q-130), this lookup is the client's one use of the version tables.

**Why:** Sending today's terms with every correction wrote them over the past: a category changed alone took the price from 19.90 to 24.90 in period 1.

**Rejected:**

- Showing today's terms and sending only changed fields: the user cannot see what they are correcting.

Related: R-VERSION-140, Q-130, C-LOGIC-003, D-219, D-230

Source: owner-request: coordinator, step 4 screens review round 1, 2026-11-16

### D-211 An overpaid debt is paid off; the total counts what is still owed (accepted)

A debt whose remaining amount is negative is shown as "Paid off · overpaid by CHF x", its figure labelled "Overpaid", never "Remaining CHF -x". The total across debts counts only debts that still owe something (overpaid and paid-off ones add nothing and are not counted in "N debts"); the database will give it (round 2).

**Why:** Decided by the coordinator after the review: a negative "remaining" reads as an error.

**Rejected:** none recorded.

Related: D-191, R-DEBT-121, D-216

Source: owner-request: coordinator, step 4 screens review round 1, 2026-11-16

### D-212 A charge is named by its own date (accepted)

An automatic charge is named to the user by the date of its transaction, the date the lists show; when a member moved it, the date it was scheduled for is added ("scheduled for"), and the dismissal says the charge will not be created again for its scheduled date.

**Why:** The row, the button names and the removal dialog showed two different dates for one charge.

**Rejected:** none recorded.

Related: R-SUBSCRIPTION-142, D-175

Source: owner-request: coordinator, step 4 screens review round 1, 2026-11-16

### D-213 The debt chart: one point per date, round ticks, few marks (accepted)

The chart draws one point per date (the balance after its last event) on to today; its tooltip lists every event of the date with its amount and resulting balance. Value ticks are round (1, 2, 2.5 or 5 times a power of ten rappen, with rappen shown when needed); time ticks fall on month or year starts beyond three months. Beyond 24 dates only balance adjustments are marked (interest comes every period and would bury the line); the opening is a hollow square, a payment a dot. The history table shows the latest 12 events until all are asked for. A debt with only its opening shows a sentence instead. The chart is one named image, not a keyboard stop; the table is its text.

**Why:** The review found repeated labels, buried lines and same-day events hidden behind one another.

**Rejected:** none recorded.

Related: D-190, R-DEBT-122

Source: owner-request: coordinator, step 4 screens review round 1, 2026-11-16

### D-214 Ending from an earlier period says both outcomes (superseded by D-220)

Whether a removal deletes is known beforehand only for a removal from now (removal_deletes). Ending a subscription or a debt from an earlier period is therefore offered as "End or delete", saying when each happens, until the database answers for a chosen period (Q-131).

**Why:** The dialog said "End" and the database deleted.

**Rejected:** none recorded.

Related: R-SUBSCRIPTION-141, Q-131, D-220

Source: owner-request: coordinator, step 4 screens review round 1, 2026-11-16

### D-200 A subscription's nominal day is kept apart from its anchor (accepted)

Each version of a subscription's terms stores its nominal day of the month (charge_day, 1 to 31) beside the anchor date: the day of the first charge date, or of a next charge date given with a change. Charge dates fall on that day, clamped to each month's length. A change of cadence without a date re-anchors on the next charge of the current schedule and keeps the nominal day.

**Why:** A schedule re-anchored on a clamped date (28 February) otherwise drifts to the 28th for good.

**Rejected:**

- Deriving the day from the anchor date: a clamped anchor loses the day (the review's S2 finding).

Related: R-SUBSCRIPTION-071, R-SUBSCRIPTION-130, D-170

Source: owner-request: coordinator review of the step 4 database, 2026-11-16; code: supabase/migrations/20261117100000_subscriptions_debts.sql

### D-201 Catch-up in bounded steps, no runaway error (superseded by D-270)

A read's catch-up (ensure_periods, get_current_period, the charge list, the previews) creates at most 120 periods per call with their interest and charges and keeps them; my_budgets.caught_up says whether more remains and the client calls ensure_periods until it returns 0. A write catches up in full first. Step 2's period_generation_runaway error is gone: the loop is bounded by the dates, so opening a budget always succeeds and progresses after any absence.

**Why:** Review finding M2: after about 13 years of absence a budget could never be opened again.

**Rejected:**

- Raising the runaway limit: still a cliff, only further away.

Related: R-PERIOD-031, R-PERIOD-130, D-080, D-180

Source: owner-request: coordinator review of the step 4 database, 2026-11-16; code: supabase/migrations/20261117100000_subscriptions_debts.sql

### D-202 A debt's opened date bounds its history (accepted)

A debt has an opened date (opened_on): today for a debt recorded from now, its first period's start for one recorded from an earlier period. Payments and balance adjustments dated before it are refused with before_debt_opened.

**Why:** The principal is the balance on the opened date; an entry before it would count twice or not at all.

**Rejected:**

- Moving opened_on back to the earliest entry: the principal would no longer be the balance on that date.

Related: R-DEBT-131, D-178

Source: owner-request: coordinator review of the step 4 database, 2026-11-16; code: supabase/migrations/20261117100000_subscriptions_debts.sql

### D-203 Future period ends follow the catch-up (accepted)

The debt projection takes the end of the k-th future period from the catch-up's own projected end: the next period starts the day after the current one ends, whatever its end (set by hand early or late), and later ones follow the pay schedule in force.

**Why:** Review finding M1: a closed form from the current period's start was wrong when its end had been set early.

**Rejected:**

- A separate closed form from the current period: a second implementation (C-LOGIC-001).

Related: R-DEBT-005, R-PERIOD-131, C-LOGIC-001

Source: owner-request: coordinator review of the step 4 database, 2026-11-16; code: supabase/migrations/20261117100000_subscriptions_debts.sql

### D-204 A charge is pending when its date is due (accepted)

Each subscription keeps the first scheduled date not yet charged (next_due). The fast path of every read checks it without the lock; only a due date with room in the budget makes a read take the lock and write. The bookkeeping columns (charged_through, next_due) change neither the revision nor updated_at.

**Why:** Review finding S4: a read crossing a day with no charge due took the lock and touched every subscription row.

**Rejected:** none recorded.

Related: R-SUBSCRIPTION-131, R-SECURITY-006

Source: owner-request: coordinator review of the step 4 database, 2026-11-16; code: supabase/migrations/20261117100000_subscriptions_debts.sql

### D-205 Moving the period end through an income edit needs its preview (accepted)

update_income on the primary income takes p_previewed_end_date; when the edit would move the current period's end, a missing or different value is refused with preview_required.

**Why:** A step 3 leftover from the review: the end of the current period moved without the member having seen it.

**Rejected:** none recorded.

Related: R-PERIOD-134, R-PERIOD-036

Source: owner-request: coordinator review of the step 4 database, 2026-11-16; code: supabase/migrations/20261117100000_subscriptions_debts.sql

### D-206 A balance adjustment without a date (accepted)

adjust_debt_balance without a date dates the adjustment at the charge horizon: today, or the budget's last day once the budget has ended.

**Why:** An ended budget has no today in it; its last day is the latest date an entry can have.

**Rejected:**

- Refusing an adjustment without a date in an ended budget.

Related: R-DEBT-075, R-BUDGET-130

Source: owner-request: coordinator review of the step 4 database, 2026-11-16; code: supabase/migrations/20261117100000_subscriptions_debts.sql

### D-207 A debt's category is part of its terms (accepted)

The category moves from the debt to its versions (debt_versions.category_id): a change of category from a period on keeps the payments of earlier periods in the category they were in, and the coverage rule (R-CATEGORY-130) is checked per version like a subscription's.

**Why:** Review finding S1: a debt's category changed for all periods at once, leaving earlier payments in another category than their debt.

**Rejected:**

- Keeping one category per debt and refusing a change once paid.

Related: R-DEBT-070, R-TRANSACTION-110, R-CATEGORY-130, D-177

Source: owner-request: coordinator review of the step 4 database, 2026-11-16; code: supabase/migrations/20261117100000_subscriptions_debts.sql

### D-208 Reopen re-keys referrers before categories and trims versions at an end (accepted)

The period registry gets a merge order: subscriptions, debts and incomes are re-keyed before categories, and after the merge any version at or after its row's end is deleted; a category whose only referrers the reopen removed is deleted with them.

**Why:** A review step 3 leftover: after a reopen a version could sit at the end (never in force) or a void category remain.

**Rejected:** none recorded.

Related: R-VERSION-130, D-146

Source: owner-request: coordinator review of the step 4 database, 2026-11-16; code: supabase/migrations/20261117100000_subscriptions_debts.sql

### D-209 An ended debt is frozen (accepted)

Once a debt has ended, its payments cannot be added, changed or deleted and its adjustments cannot be added or deleted (debt_ended); its remaining amount stays as it was when it ended.

**Why:** Ending a debt keeps its history (R-DEBT-113); changing it afterwards would change a closed record nobody looks at.

**Rejected:**

- Allowing payments dated in the periods the debt was in force.

Related: R-DEBT-134, R-DEBT-113

Source: owner-request: coordinator review of the step 4 database, 2026-11-16; code: supabase/migrations/20261117100000_subscriptions_debts.sql

### D-215 A debt's paid share (accepted)

debt_overview.paid_percent is the payments over principal plus interest plus adjustments, a whole percent rounded down, 100 exactly when nothing remains, 0 while nothing has been paid (and when the total owed is not positive with nothing paid).

**Why:** Rounding down never shows 100 % for a debt that still owes a rappen.

**Rejected:**

- Payments over principal only: interest would let it exceed 100 % while still owing.

Related: R-DEBT-137

Source: owner-request: coordinator addendum to the step 4 database review (screens asks), 2026-11-16; code: supabase/migrations/20261117100000_subscriptions_debts.sql

### D-216 The database gives the total still owed (accepted)

A view debt_totals gives per budget the sum of the positive remaining amounts of its debts in force and the number still owing; overpaid and paid-off debts add nothing.

**Why:** Answer to Q-110: the client no longer adds amounts up (C-LOGIC-003), and an overpaid debt cannot hide another's debt.

**Rejected:**

- Adding up debt_overview.remaining in the client (D-191).

Related: Q-110, R-DEBT-133, D-191, D-211

Source: owner-request: coordinator addendum to the step 4 database review (screens asks), 2026-11-16; code: supabase/migrations/20261117100000_subscriptions_debts.sql

### D-217 Hot helper functions are plpgsql (accepted)

Helpers called per row or per period by the views (totals, spans, reading_seq, the projection) are plpgsql, so their plans are kept for the session; a SQL function with a search_path setting is planned again on each call. A lookup that a generic plan would scan sequentially disables sequential scans in the function rather than forcing custom plans.

**Why:** The pages at the limits (50 subscriptions, 50 debts, 200 categories, 120 periods) must read in about 250 ms.

**Rejected:**

- force_custom_plan: one planning per call again.

Related: C-LOGIC-001

Source: owner-request: coordinator review of the step 4 database, 2026-11-16; code: supabase/migrations/20261117100000_subscriptions_debts.sql

### D-218 Changing a transaction and its link in one call (accepted)

update_transaction takes p_relink: with it, p_debt_id and p_subscription_id (both null: no link) replace the link in the same call, checked against the new fields; without it the link is kept as before.

**Why:** Answer to Q-111: a payment is never left half-changed by a failure between calls.

**Rejected:**

- Keeping three calls (D-194).

Related: Q-111, R-TRANSACTION-131, D-194

Source: owner-request: coordinator review of the step 4 database, 2026-11-16; code: supabase/migrations/20261117100000_subscriptions_debts.sql

### D-219 The database gives the terms in force in a chosen period (accepted)

get_subscription_terms, get_debt_terms, get_category_terms and get_income_terms (record id, period id) return the terms of the record in force in that period, the period they took effect (terms_from_period_id) and the first period of the next existing change or of its end (until_period_id), so a correction form starts from them without reading the version tables and can say up to which period the correction applies.

**Why:** Answer to Q-130: the rule "the version with the greatest effective_from_seq not after the period" stays in the database (C-LOGIC-001, C-LOGIC-003); D-210's client lookup can be replaced by these calls.

**Rejected:**

- A column per period on the overviews: one row per record and period would multiply the views.

Related: Q-130, D-210, R-VERSION-132, R-VERSION-133, R-VERSION-140

Source: owner-request: coordinator addendum to the step 4 database review (screens asks), 2026-11-16; code: supabase/migrations/20261117100000_subscriptions_debts.sql

### D-220 The database says beforehand what a removal from a chosen period does (accepted)

preview_end_subscription and preview_remove_debt (record id, period id; null: the current period) answer what end_subscription / remove_debt from that period would do now: deleted, ended, or the refusal's code, with the same conditions as the writes.

**Why:** Answer to Q-131: removal_deletes covers a removal from now only; the dialogs of D-214 can say the one outcome that applies for an earlier period.

**Rejected:** none recorded.

Related: Q-131, D-214, R-SUBSCRIPTION-136, R-DEBT-138, R-SUBSCRIPTION-141

Source: owner-request: coordinator addendum to the step 4 database review (screens asks), 2026-11-16; code: supabase/migrations/20261117100000_subscriptions_debts.sql

### D-230 Corrections read the terms of their period from the database (accepted)

The correction forms (incomes, categories, subscriptions, debts) read the terms in force in the period chosen with get_income_terms, get_category_terms, get_subscription_terms and get_debt_terms, show them as the starting values, say how far the correction reaches (until_period_id), offer no save when the record was not in force there, and send only what the user changes. The client no longer reads the version tables.

**Why:** D-219 gives these terms in the database (C-LOGIC-001); the client's own lookup of the version tables (D-210) was the one place it chose a version itself.

**Rejected:**

- Keeping the version-table lookup (D-210): it duplicated the database's choice of version.

Related: R-VERSION-140, R-VERSION-150, D-219, C-LOGIC-003, D-210

Source: owner-request: coordinator, step 4 screens review round 2, 2026-11-16

### D-231 A long absence is caught up in words, without progress (accepted)

While a very long absence is caught up, the app shows only "Catching up on the time since your last visit…" and a short explanation, no progress bar and no figure, then loads the pages.

**Why:** Answer to Q-121 by default: ensure_periods says how many periods it made, not how many remain, so a bar would invent its end; a step takes up to about 3 s plus its commit (D-276), and a long absence a few steps.

**Rejected:**

- A progress bar from the periods made so far: the total is unknown.

Related: Q-121, R-PERIOD-150, D-270, D-276

Source: owner-request: coordinator, step 4 screens review round 2, 2026-11-16; owner-request: coordinator, step 4 screens adapted to the database re-review and step 5, 2026-11-16

### D-232 The debt chart reads up to 10 000 events (superseded by D-290)

The debt page reads get_debt_history 1000 rows a page; the chart reads pages by itself until the history ends or 10 000 events, and then says where it stops; the table shows 50 rows at a time, oldest first (the order the database pages in), reading the next page when its rows are shown.

**Why:** A debt with 20 000 payments must not freeze the page, and the chart of an ordinary debt must show all of it; ten pages are about 2 MB and a few hundred milliseconds.

**Rejected:**

- Reading the whole history whatever its size: a very long one would be read and drawn at once.
- The table newest first: the database pages oldest first only (Q-141).

Related: R-DEBT-122, R-DEBT-135, D-213, D-290

Source: owner-request: coordinator, step 4 screens review round 2, 2026-11-16

### D-233 Back to the schedule from the database's preview (accepted)

The periods page asks preview_move_period_start when the menu of a period whose previous end was set by hand opens: it offers the move with the start it would give when accepted, disabled with the refusal in words when not, and nothing when already on the schedule.

**Why:** Answer to Q-091, with R-PERIOD-133: the client offers only what the database would accept and names its date.

**Rejected:** none recorded.

Related: Q-091, R-PERIOD-151, R-PERIOD-133

Source: owner-request: coordinator, step 4 screens review round 2, 2026-11-16

### D-260 Three reads, one per view, built on the progress code (accepted)

get_period_trend (one row per period), get_category_trend (one row per category line and period) and get_period_comparison (a 'total' row, then one row per category) answer each comparison view in one call. Their figures are read from period_summaries and private.category_progress, the code behind get_period_progress, so they cannot disagree with the progress view. Averages, differences, lengths and the range's flags are columns, repeated where a view needs them on every row.

**Why:** One implementation of every figure (C-LOGIC-001), nothing for the client to compute (C-LOGIC-003), and typed rows the generated types describe.

**Rejected:**

- JSON documents: untyped for the client.
- Separate calls for the totals and the averages: more than one call per view.

Related: R-COMPARE-002, R-COMPARE-070, R-COMPARE-071, C-LOGIC-001, C-LOGIC-003, D-264

Source: owner-request: coordinator brief for the step 5 database (period comparison), 2026-11-16; code: supabase/migrations/20261118100000_period_comparison.sql

### D-261 Averages over the completed periods, rounded half away from zero (superseded by D-383)

An average is the sum over the completed periods of the range divided by their number, rounded to the rappen with halves away from zero (also for a negative result); null when none is completed. The average result is the average of the results, so it can differ by a rappen from the average income minus the average spent. A category's average spent divides by every completed period of the range, including those where it was not in force (they count what was spent, usually nothing).

**Why:** The running period is incomplete and would pull averages down; one rounding rule for all averages; a category's average is comparable with the trend's.

**Rejected:**

- Averaging a category only over the periods it was in force (Q-160).
- Banker's rounding: unusual for amounts shown to people.

Related: R-COMPARE-172, Q-160

Source: owner-request: database developer decision for step 5, within the coordinator's brief, 2026-11-16; code: supabase/migrations/20261118100000_period_comparison.sql

### D-262 Empty versus zero in the comparison (accepted)

planned is empty when the category is not in force in the period (the progress view's expected 0 means nothing planned because it does not exist then). In the trend, a period without a progress row for a line is not in force, spent 0, committed 0. Side by side, a period where the category has no progress row is empty on every figure; the differences count an empty side as nothing spent or committed, and planned_difference is empty unless both plan something. There is no uncategorised line: an expense or refund always has a category.

**Why:** The brief asks that "not in force" and "nothing spent" stay distinct; the difference must stay a number so the lines add up to the totals' difference.

**Rejected:** none recorded.

Related: R-COMPARE-174, R-COMPARE-170

Source: owner-request: database developer decision for step 5, within the coordinator's brief, 2026-11-16; code: supabase/migrations/20261118100000_period_comparison.sql

### D-263 Range of 1 to 24 periods; catching up first (accepted)

p_count accepts 1 to 24 (12 by default; the screens offer 6, 12 and 24), invalid_limit otherwise. The range ends at the current period, or at the last one once the budget has ended. The reads catch up like get_current_period; when a very long absence is not yet caught up they raise catching_up (the bounded catch-up of that call is not kept, the client calls ensure_periods until it returns 0, as my_budgets.caught_up says).

**Why:** 24 periods at the limits answer within the time budget; a range that silently stopped years before today would mislead.

**Rejected:**

- Answering the periods that exist so far: a trend that ends years ago without saying so.

Related: R-COMPARE-171, R-COMPARE-175, D-270

Source: owner-request: database developer decision for step 5, within the coordinator's brief, 2026-11-16; code: supabase/migrations/20261118100000_period_comparison.sql

### D-264 Every read fits in one API response, or is paged (accepted)

The API returns at most 1000 rows per request (max_rows, not raised) and cuts a longer answer silently. So: get_category_trend returns one row per category line with the per-period figures as arrays aligned with its period_ids (the periods of get_period_trend with the same p_count); a budget holds at most 900 categories, 900 subscriptions and 900 debts, void rows included (the earlier limits of D-153 and D-180, which do not count void rows, stay; this bound only stops a budget accumulating void rows without end); the periods are read with list_periods, newest first, at most 200 a page; preview_reopen lists at most 1000 rows, the 1000th saying how many more changes there are. Every other read is bounded below 1000 by a limit (see docs/database.md).

**Why:** Coordinator finding: 42 lines over 24 periods already passed 1000 rows, and the limits gave 4800; the screen would have drawn a partial answer without an error. Void rows are kept only for their transactions and were not counted, so without a bound the category, subscription and debt reads could pass 1000 too.

**Rejected:**

- Raising max_rows: the cut stays, only further away.
- Counting void rows in the 500 / 200 limits: reopens D-153 and D-180 for a case only abuse reaches.
- Paging every per-category read: the comparison and progress views must add up within one answer.

Related: R-APP-170, D-153, D-180, D-260, R-COMPARE-070

Source: owner-request: coordinator finding on the step 5 database (API row limit), 2026-11-16; code: supabase/migrations/20261117100000_subscriptions_debts.sql; code: supabase/migrations/20261118100000_period_comparison.sql

### D-270 No call does an unbounded catch-up (superseded by D-387)

A catch-up step creates at most 120 periods with their interest and charges (D-276 also bounds its time). ensure_periods and get_current_period do one step and keep it; my_budgets.caught_up says whether more remains, and the client calls ensure_periods until it returns 0. Every other read, preview and write (all of them through private.read_catch_up, private.current_period or private.lock_and_catch_up) does at most one step and, when the budget is still behind, answers catching_up and changes nothing (its step is rolled back with it). A write no longer catches up in full. Step 2's period_generation_runaway error stays gone. Supersedes D-201.

**Why:** Re-review finding 1: seven previews created every missing period in one call (480 after 40 years) and timed out over HTTP, and catching_up was never answered. A write catching up in full would hit the statement timeout at the limits.

**Rejected:**

- Writes catching up in full: the statement timeout at the limits.
- Raising the step size: the same cliff later.

Related: R-PERIOD-130, R-PERIOD-180, R-PERIOD-031, D-080, D-180

Source: owner-request: coordinator, independent re-review of the step 4 database fixes, 2026-11-16; code: supabase/migrations/20261117100000_subscriptions_debts.sql; code: supabase/migrations/20261118100000_period_comparison.sql

### D-271 A held-back charge blocks schedule changes (accepted)

While a subscription's next scheduled date has come and its charge is held back by the transaction limit, update_subscription refuses a change of cadence or a next charge date (from now or as a correction) and end_subscription refuses to end it, with charge_held_back, changing nothing; preview_end_subscription says so as its refusal. A name, price or category change is allowed: the held charge is created, once there is room, with the terms in force in its own period, so it cannot be lost. subscription_overview.next_charge_date shows the held date meanwhile.

**Why:** Re-review finding 3: a cadence change while a charge waited moved the schedule past the held date, so the charge was never created (R-SUBSCRIPTION-112: none skipped).

**Rejected:**

- Creating the held charge at the moment of the edit: the budget has no room for it.

Related: R-SUBSCRIPTION-180, R-SUBSCRIPTION-112, D-176

Source: owner-request: coordinator, independent re-review of the step 4 database fixes, 2026-11-16; code: supabase/migrations/20261117100000_subscriptions_debts.sql

### D-272 Interest on the balance before the period, at period creation; the projection and "never" (accepted)

A period's interest for a debt is computed when the period is created, on the debt's balance from everything dated before the period's start (its opening, payments, adjustments and earlier interest), whatever day the catch-up runs, as one twelfth of the yearly rate rounded half up to the rappen, as an entry of that period in the debt's history (dated at the period's start). A debt whose opened_on is not before the period's start gets no interest for that period; its first comes with the next one, so the history always starts with the opening. It is computed once: a payment or adjustment back-dated later does not recompute it (an adjustment exists for that). It is applied exactly once per debt and period however the period came to exist; a reopen that merges a period removes its entry and creating the period again computes it by the same rule, so redoing without other changes gives the same amount. No interest on a balance of zero or less. A planned payment less than or equal to one period's interest means the debt never ends; the projection has a horizon of 600 periods (50 years). Supersedes D-172.

**Why:** Re-review finding 4: interest on the balance at the moment of the catch-up gave an entry dated before the opening (an early pay date) and a different amount for a period created again after a payment dated inside it. The projection already assumes this rule (each period's interest on what remains after the previous period).

**Rejected:**

- The balance at the moment of creation: depends on the day the catch-up runs.

Related: R-DEBT-073, R-DEBT-180, R-DEBT-131, R-DEBT-074, R-DEBT-111, R-DEBT-112, R-DEBT-113, Q-055, D-113

Source: owner-request: coordinator, independent re-review of the step 4 database fixes, 2026-11-16; code: supabase/migrations/20261117100000_subscriptions_debts.sql

### D-273 No terms where a record is not in force (accepted)

get_subscription_terms, get_debt_terms, get_category_terms and get_income_terms answer in_force false and every term, terms_from_period_id and until_period_id null for a period where the record is not in force (before it starts, from its end on), so a correction form cannot offer to correct a period the record does not cover.

**Why:** Re-review: from the end period on the last terms came back with in_force false, which the form could have offered to correct.

**Rejected:** none recorded.

Related: R-VERSION-132, R-VERSION-133, D-219

Source: owner-request: coordinator, independent re-review of the step 4 database fixes, 2026-11-16; code: supabase/migrations/20261117100000_subscriptions_debts.sql

### D-274 The transactions list says which payments are frozen (accepted)

transaction_list has debt_ended: true for a payment of a debt that has ended (it cannot be changed, unlinked or deleted, D-209), false otherwise. Nothing is frozen for an ended subscription: its charges can still be edited, confirmed, dismissed or deleted, so there is no subscription counterpart.

**Why:** Screens round 2 (Q-140): the list read debt_overview to know which payments were frozen.

**Rejected:** none recorded.

Related: R-TRANSACTION-180, R-DEBT-134, D-209, Q-140

Source: owner-request: coordinator addendum (screens round 2 findings), 2026-11-16; code: supabase/migrations/20261117100000_subscriptions_debts.sql

### D-275 A debt's history newest first (accepted)

get_debt_history takes p_newest_first (default false): the same rows newest first, the four-part cursor (date, kind, created_at, entry_id) then continuing towards older rows; balance is computed over the whole history in the oldest-first order, so it is the same in both directions.

**Why:** Screens round 2 (Q-141): the history table starts with the latest events.

**Rejected:** none recorded.

Related: R-DEBT-181, R-DEBT-135, Q-141

Source: owner-request: coordinator addendum (screens round 2 findings), 2026-11-16; code: supabase/migrations/20261117100000_subscriptions_debts.sql

### D-276 A catch-up step's work is bounded in time too (accepted)

A step stops creating periods after about two seconds of work (at least one period per call), then creates the charges due in what it created. Measured locally with 50 subscriptions and 50 debts with interest after 100 years: statement at most 3.0 s, commit at most 0.6 s, 44 to 120 periods per step; a period costs about three times more at 1200 periods of history than at 120 (deferred checks and the budget's transactions), so the time bound, not the period bound, keeps each step under the 8 s statement timeout.

**Why:** Re-review: the tenth 120-period step after 100 years took 11.6 s over HTTP.

**Rejected:**

- A fixed smaller step: still unbounded in time as the history grows.

Related: R-PERIOD-130, D-270

Source: owner-request: coordinator, independent re-review of the step 4 database fixes, 2026-11-16; code: supabase/migrations/20261117100000_subscriptions_debts.sql

### D-310 One import, in batches of idempotent chunks (accepted)

private.import_plan decides what each row does and private.import_apply does it; preview_import, import_transactions, import_with_token and import_skipped_anyway all use them. Rows are JSON objects (date, amount in integer rappen, direction, description, merchant, bank_transaction_id, hint, details, and a member's action, kind, category). A batch has an id the caller generates and up to 100 chunks of up to 500 rows (50 000 rows); a chunk sent again answers as the first time and records nothing. A chunk is all or nothing, refused before anything is written when the transaction limit cannot hold it (detail: how many would fit).

**Why:** The write must equal the preview, and a statement larger than one answer (R-APP-170) must survive a lost response without double imports.

**Rejected:**

- A server-generated batch id: a retried first call would open a second batch.

Related: R-IMPORT-001, R-IMPORT-208, Q-090

Source: owner-request: coordinator brief for the step 6 database (import), 2026-11-16; code: supabase/migrations/20261119100000_import.sql

### D-311 The merchant key and merchant rules (accepted)

The database computes a row's merchant key: its merchant field, else its description, lower-cased, accents and punctuation removed, spaces collapsed, the statement's own words (achat, crédit, débit TWINT, paiement, ordre permanent, paiement de salaire) and a processor prefix ("PayUp *", "XYZ*") dropped. A rule holds a fragment and a category and matches a key that contains it; the longest matching fragment wins; a rule whose category is not in force on a row's date does not apply to it. The one-click offer proposes the transaction's whole key; Settings can shorten it. A category's first subcategory moves its rules to Other; deleting a category deletes its rules.

**Why:** Answer to Q-057: one implementation of the key, robust to the bank's cut names, capitals and processor prefixes (docs/import-sources.md).

**Rejected:**

- Exact match on the description: rarely matches again.

Related: Q-057, R-IMPORT-079, R-IMPORT-201, R-IMPORT-207

Source: owner-request: coordinator brief for the step 6 database (import), 2026-11-16; code: supabase/migrations/20261119100000_import.sql

### D-312 Uncategorised imports go to a "to categorise" category (superseded by D-375)

Each budget gets, at its first import that needs it, one ordinary top-level category flagged as its "to categorise" place (the name the caller passes; from the first period; created even at the 200 / 500 category limits, within the 900-row bound). Rows without a member's category or an applying rule land there. It is renamable, has no expectation, takes no subcategory, cannot end while it holds transactions, and a transaction in it cannot be confirmed.

**Why:** Every expense and refund keeps a category, so totals, progress and comparison keep adding up; the review has one place to empty.

**Rejected:**

- A null category for imported rows: breaks every per-category sum.

Related: R-IMPORT-200, R-CATEGORY-200, R-IMPORT-209

Source: owner-request: coordinator brief for the step 6 database (import), 2026-11-16; code: supabase/migrations/20261119100000_import.sql

### D-313 Duplicates are counted (superseded by D-372)

Rows of one import are never duplicates of each other. A row is compared with every existing transaction of the same kind, whatever its origin: the same bank transaction id, else the same date, amount and description. Each existing transaction absorbs at most one row, so the same statement imported twice imports nothing the second time. Import anyway is per row or for all skipped rows of a batch.

**Why:** Answer to Q-056 (coordinator decision).

**Rejected:** none recorded.

Related: Q-056, R-IMPORT-003, R-IMPORT-070, R-IMPORT-071, R-IMPORT-204

Source: owner-request: coordinator brief for the step 6 database (import), 2026-11-16; code: supabase/migrations/20261119100000_import.sql

### D-314 Flagged entries and remembered choices (accepted)

Card-bill payments and own transfers (from the source's hint) are skipped by default; a transfer to another person, also of the household, is an ordinary expense unless skipped. A member's choice for a flagged row (import or skip) is remembered per budget (not per member), per kind of flag and counterparty key, and proposed next time; a token's import remembers nothing.

**Why:** Answer to Q-063 and Q-064 (coordinator decision).

**Rejected:** none recorded.

Related: Q-063, Q-064, R-IMPORT-091, R-IMPORT-092, D-129

Source: owner-request: coordinator brief for the step 6 database (import), 2026-11-16; code: supabase/migrations/20261119100000_import.sql

### D-315 Reconciliation by possible match (superseded by D-373)

A row is a possible match of an existing transaction of the same kind that was not imported (typed, or a charge), with the same amount and a date within three days. Default: skip the row; when the match is a charge awaiting confirmation, the import confirms it and the preview says so; the member can import the row anyway. Each existing transaction absorbs one row. With a token, matches are skipped and left for the member.

**Why:** Answer to Q-068 (coordinator decision).

**Rejected:** none recorded.

Related: Q-068, R-IMPORT-203

Source: owner-request: coordinator brief for the step 6 database (import), 2026-11-16; code: supabase/migrations/20261119100000_import.sql

### D-316 Import tokens (superseded by D-370)

A member creates a token for one budget with a name and an expiry (30 days by default, at most a year); the secret (bti_ and 244 random bits) is answered once and only its SHA-256 is stored. At most 10 active and 100 tokens a budget. import_with_token is the only function callable without a session: an unknown, expired or revoked token gets invalid_token after one index lookup, before any lock or catch-up. A token imports with the default choices only, never confirms a charge, remembers nothing, and its answer is counts and the reasons of rows refused for their own content (budget-dependent outcomes are not told). Per token: 60 calls and 5000 rows an hour, 300 calls and 20 000 rows a day. Revoking takes the budget lock; a member leaving (or removed, or deleted) revokes the tokens they created.

**Why:** D-116 and R-SECURITY-005: a token can only add, cannot read, and a stolen one does bounded, reviewable harm.

**Rejected:**

- Telling the token which rows were duplicates: an oracle on the budget's transactions.

Related: D-116, R-IMPORT-075, R-IMPORT-076, R-IMPORT-077, R-IMPORT-205, R-SECURITY-200

Source: owner-request: coordinator brief for the step 6 database (import), 2026-11-16; code: supabase/migrations/20261119100000_import.sql

### D-317 A salary credit (superseded by D-377)

A credit is a salary credit when the source says so (hint salary) or when its amount equals the amount of an income in force in the period of its date and its date is within five days of that period's start. It is skipped by default; imported anyway it is extra income. A different amount than the planned income changes nothing by itself; the preview shows the planned amount beside the row's.

**Why:** Answer to Q-065 (coordinator decision).

**Rejected:** none recorded.

Related: Q-065, R-IMPORT-093, D-130

Source: owner-request: coordinator brief for the step 6 database (import), 2026-11-16; code: supabase/migrations/20261119100000_import.sql

### D-318 A credit reviewed as a refund (accepted)

A credit is a refund by default (in the category a rule or the member gives, else "to categorise"), counted in the period of its date, and may take the category's spending below zero; the member may make it extra income instead.

**Why:** Answer to Q-066 (coordinator decision).

**Rejected:** none recorded.

Related: Q-066, R-IMPORT-094

Source: owner-request: coordinator brief for the step 6 database (import), 2026-11-16; code: supabase/migrations/20261119100000_import.sql

### D-319 What a batch records (accepted)

A batch records its source kind, the statement's date range, its counts (rows, imported, duplicates, flagged, matches, skipped by choice, invalid, charges confirmed), who imported (the member, or the token and its name) and when; never a file name, an account or a card number. Its skipped rows are kept, with why, for the member.

**Why:** Q-070 stays open for accounts (step 7); the review needs to know what each import did.

**Rejected:** none recorded.

Related: Q-070, R-IMPORT-072

Source: owner-request: coordinator brief for the step 6 database (import), 2026-11-16; code: supabase/migrations/20261119100000_import.sql

### D-320 Undoing an import batch (accepted)

A member can undo a batch once: its transactions still to review are deleted, the confirmed ones stay, charges it confirmed stay confirmed, remembered choices stay; the answer says how many of each. An undone batch takes no more chunks.

**Why:** Coordinator decision; a wrong import is removed without touching what was already reviewed.

**Rejected:** none recorded.

Related: R-IMPORT-206

Source: owner-request: coordinator brief for the step 6 database (import), 2026-11-16; code: supabase/migrations/20261119100000_import.sql

### D-321 Choices of the database developer for the import (accepted)

Beyond the coordinator's defaults: a credit defaults to a refund (not extra income); hint transfer_to_person names a transfer to another person (imported by default, its choice remembered); details may also carry location; a row with an unknown key is refused; a token's answer counts rows refused for the budget's sake as received; "import anyway" drops a row's original kind and category (the review decides); the "to categorise" category is created even at the category limits.

**Why:** Each keeps the token free of reads and the review in one place; the rest follow the sources (docs/import-sources.md).

**Rejected:** none recorded.

Related: D-312, D-314, D-316, D-318

Source: owner-request: database developer decision for step 6, within the coordinator's brief, 2026-11-16; code: supabase/migrations/20261119100000_import.sql

### D-350 Accounts (accepted)

An account has a name, a kind (current or salary, savings, third pillar, tax reserve, investment, cash, credit card, other), an optional bank label and an optional member it belongs to (none: shared). It counts from a period and can be closed from a period, like a category; earlier periods keep it. Its name, kind, label and holder are not versioned: a rename shows everywhere, past periods included. It keeps its holder after the member leaves (shown as a former member); an account whose holder deleted their login becomes shared. No balance (D-123).

**Why:** The coordinator's defaults for step 7; renames read like categories'. Closing an account a member held when they leave would break the transfers of the others.

**Rejected:**

- Versioning the name or the kind.
- Closing a member's accounts when they leave.

Related: R-ACCOUNT-001, R-ACCOUNT-230, R-ACCOUNT-232, D-123

Source: owner-request: coordinator brief for the step 7 database (accounts and money flow), 2026-11-16; code: supabase/migrations/20261120100000_money_flow.sql

### D-351 The account an income is paid into (accepted)

An income can name the account it is paid into: part of its terms (optional), versioned with them, changed from the current period or as a correction like an amount. An income with no account flows into one "not assigned" node of the money flow, so its totals still add up.

**Why:** The flow starts where the salary arrives, which changes when a member changes bank.

**Rejected:**

- A field of the income itself, the same in every period.

Related: R-ACCOUNT-236, R-ACCOUNT-235, R-VERSION-001

Source: owner-request: coordinator brief for the step 7 database (accounts and money flow), 2026-11-16; code: supabase/migrations/20261120100000_money_flow.sql

### D-352 Schedules and due dates of planned transfers (superseded by D-420)

A transfer has exactly one occurrence in each period it is in force. On a fixed day of the month (1 to 31): the first date with that day on or after the period's start, clamped to the month's length, no weekend rule. From a pay date: the chosen income's actual pay date in the period plus 0 to 31 days (never negative); the primary income's actual pay date in a period is the period's start (an early salary and a moved boundary included); another income's is its first actual pay date on or after the period's start, under its terms then. Where the chosen income is not in force (ended, its member gone), the transfer follows the primary income, and the checklist and overview say so. A due date is never after the period's last day. Answers Q-059.

**Why:** The coordinator's defaults. A period starts on the primary salary, so its start is that salary's actual date, whatever moved it; this needs no other record of past pay dates.

**Rejected:**

- A weekend rule for fixed days.
- Negative offsets.
- Several occurrences per period, or none.

Related: R-ACCOUNT-070, R-ACCOUNT-071, R-ACCOUNT-239, Q-059, D-120

Source: owner-request: coordinator brief for the step 7 database (accounts and money flow), 2026-11-16; code: supabase/migrations/20261120100000_money_flow.sql

### D-353 Transactions of transfers linked to a category (accepted)

An automatic transfer is assumed done on its due date, without confirmation (only subscription charges are confirmed). Linked to a category, its transaction is created by the catch-up on its due date: dated then, at the planned amount of its period, confirmed, exactly once, held back at the transaction limit; marked not done, its transaction is deleted and not created again; undoing that creates it again. A manual transfer linked to a category gets its transaction when marked done, dated the done date, with the amount moved (default the planned amount); undoing "done" deletes it. Deleting the transaction puts the occurrence back (a manual one to do, an automatic one not done). Editing its amount or date is allowed and shows on the occurrence. Answers Q-060.

**Why:** The coordinator's defaults: recorded once (D-122), and the transaction exists exactly when the transfer counts as done.

**Rejected:**

- Automatic transfers awaiting confirmation like subscription charges.
- Undoing "done" keeping the transaction.

Related: R-ACCOUNT-004, R-ACCOUNT-073, R-ACCOUNT-074, R-ACCOUNT-240, Q-060, D-122

Source: owner-request: coordinator brief for the step 7 database (accounts and money flow), 2026-11-16; code: supabase/migrations/20261120100000_money_flow.sql

### D-354 Occurrences are computed, marks are stored (superseded by D-423)

An occurrence is computed from the transfer's terms in force in a period and that period's boundaries; only what was done is stored: one mark at most per transfer and period (done, skipped, not done), the catch-up's included. The catch-up settles each transfer's periods in order (transfers.settled_seq) within its bounded step, after the subscription charges. An edit or a correction of the terms settles again the periods it governs, so an automatic linked occurrence already due without a mark gets its transaction then, past periods of a correction included.

**Why:** Past occurrences follow the plan as corrected without rows to rewrite; settling again after an edit keeps "a transaction exists exactly when an automatic linked transfer counts as done" true for every period.

**Rejected:**

- A row per transfer and period.
- Never creating a transaction for a period already passed after a correction, as for subscription charges (Q-221).

Related: R-ACCOUNT-074, R-ACCOUNT-233, R-ACCOUNT-239, D-270, D-276, Q-221

Source: owner-request: database developer decision for step 7, within the coordinator's brief, 2026-11-16; code: supabase/migrations/20261120100000_money_flow.sql

### D-355 Nothing deletes a transfer's transaction implicitly (superseded by D-380)

Only a member's act deletes a transfer's transaction: undoing "done", marking an automatic transfer not done, or deleting the transaction. Ending a transfer, closing what it uses, or a member leaving keeps it: when its mark goes, the transaction stays as an ordinary one. The one exception is a reopen (D-358).

**Why:** A transaction is money the member sees in the totals; it never disappears behind an edit of the plan.

**Rejected:**

- Deleting the catch-up's transactions when a transfer ends from their period.

Related: R-ACCOUNT-234, R-ACCOUNT-240, D-353

Source: owner-request: database developer decision for step 7, within the coordinator's brief, 2026-11-16; code: supabase/migrations/20261120100000_money_flow.sql

### D-356 The money flow read (accepted)

One call, get_money_flow, typed rows (income, not_assigned, account, transfer, total), from the plan in force in the chosen period (default the current one), never from transactions: incomes at their amounts then (salaries only: their total is period_summaries.salary_total; extra incomes are actual transactions, not plan), transfers at their planned amounts, every account in force with what comes in, what goes out and what stays (in minus out, flagged when negative). No balance.

**Why:** The coordinator's defaults; a diagram of the plan stays the same whatever was spent.

**Rejected:**

- Extra incomes in the flow.
- Reading actual transfers.

Related: R-ACCOUNT-006, R-ACCOUNT-235, R-ACCOUNT-075

Source: owner-request: coordinator brief for the step 7 database (accounts and money flow), 2026-11-16; code: supabase/migrations/20261120100000_money_flow.sql

### D-357 Limits of accounts and transfers (accepted)

50 accounts and 50 planned transfers in force, 200 of each in all (void ones not counted), 900 rows of each a budget (R-APP-170); previews list at most 60 occurrences; an offset is at most 31 days; a bank label at most 100 characters.

**Why:** Like subscriptions and debts; every read stays within the API's 1000 rows.

**Rejected:** none recorded.

Related: R-ACCOUNT-230, R-APP-170

Source: owner-request: coordinator brief for the step 7 database (accounts and money flow), 2026-11-16; code: supabase/migrations/20261120100000_money_flow.sql

### D-358 Reopen and the marks of the merged period (superseded by D-382)

A mark of the merged period moves to the reopened period when that period has none for the transfer. Otherwise it goes: one made by the catch-up with its transaction (made again if the period comes back, like a debt's interest), a member's leaving its transaction as an ordinary one. A transfer ended in the merged period ends in the reopened one, and its marks there go the same way. Every transfer is settled again from the reopened period.

**Why:** The reopened period keeps what happened in it; the catch-up's assumption of the merged period would otherwise be counted twice once the period comes back.

**Rejected:**

- Keeping the catch-up's transaction as an ordinary one (counted twice later).

Related: R-ACCOUNT-237, R-VERSION-011, D-355

Source: owner-request: database developer decision for step 7, within the coordinator's brief, 2026-11-16; code: supabase/migrations/20261120100000_money_flow.sql

### D-359 Transfers in the committed amounts (accepted)

A linked transfer's planned amount is committed in its category in each period it is in force, as its own figure: transfer_committed in get_period_progress, transfer_committed_amount in category_overview, transfer_committed_total in period_summaries; never added to the subscriptions' committed amount, so every existing figure is unchanged.

**Why:** The coordinator's default ("yes, as its own kind"); keeping it apart avoids changing what committed meant.

**Rejected:**

- Adding it to committed.

Related: R-ACCOUNT-238, R-SUBSCRIPTION-079

Source: owner-request: coordinator brief for the step 7 database (accounts and money flow), 2026-11-16; code: supabase/migrations/20261120100000_money_flow.sql

### D-360 Marks of an occurrence (accepted)

A mark is made from no mark (revision 0) and undone back to none; changing a mark means undoing it first. Only a manual transfer is marked done or skipped, only an automatic one not done. Done's date defaults to today in the current period, else to the due date, and is never after today. Every mark and undo names the revision of the mark the member read.

**Why:** One state per occurrence and one way between states keep two members' marks from crossing (R-CONCURRENCY-230).

**Rejected:**

- Changing a mark in place.

Related: R-ACCOUNT-005, R-ACCOUNT-240, R-CONCURRENCY-230

Source: owner-request: database developer decision for step 7, within the coordinator's brief, 2026-11-16; code: supabase/migrations/20261120100000_money_flow.sql

### D-361 The dashboard counts of manual transfers (accepted)

my_budgets.transfers_to_do and transfers_overdue count the current period's manual transfers still to do and, of those, the ones whose due date has passed; past periods' unfinished ones show in their own checklist only.

**Why:** A bounded read on every page; a forgotten transfer of an earlier period is rare and visible in that period.

**Rejected:**

- Counting every past period (unbounded over the budget's life).

Related: R-ACCOUNT-241, Q-222

Source: owner-request: database developer decision for step 7, within the coordinator's brief, 2026-11-16; code: supabase/migrations/20261120100000_money_flow.sql

### D-370 Import tokens (revised) (accepted)

A member creates a token for one budget with a name and an expiry (30 days by default, at most a year); the secret (bti_ and 244 random bits) is answered once and only its SHA-256 is stored. At most 10 tokens that can still be used a budget; a revoked or expired one can be deleted, and those kept are pruned to the newest 20 and 365 days. import_with_token is the only function callable without a session, by POST only (a GET is refused with read_only_call before the token is looked at). An unknown, expired or revoked token, or one whose creator left, was removed or deleted their account, gets invalid_token after one index lookup, before any lock or catch-up. A call never waits for another token call: the same token busy, or every slot for token work taken, answers token_busy or imports_busy at once, doing nothing and counting nothing (D-453). Every call that does work counts, whatever its outcome, cancelled included: 60 calls and 5000 rows within any 60 minutes, 300 calls and 20 000 rows within any 24 hours (by whole minutes: a call counts 60 to 61 minutes and 24 hours to 24 hours and 1 minute, D-463), checked and counted in one step under the token's lock; a refusal after the count is answered in the error column, not raised. A token call takes at most 250 rows. The batch records the token, never the caller. Batches, skipped rows and remembered choices are read through paged functions only.

**Why:** The step 6 review: a refused call must cost the attacker too, parallel calls must not pass the limit together, fixed hourly windows let twice the limit through at the boundary, tokens must not pile up, and a token in a URL ends up in logs.

**Rejected:**

- Counting only successful calls: free probing.
- Fixed clock-hour windows.

Related: D-116, R-IMPORT-256, R-IMPORT-257, R-SECURITY-252, R-SECURITY-253, R-SECURITY-254

Source: owner-request: coordinator review of the step 6 database (import), 2026-11-16; code: supabase/migrations/20261119100000_import.sql

### D-371 What a token is told (accepted)

A token's answer does not depend on the budget's content: every argument is checked before anything of the budget, "to categorise" is created under its fixed name (the token cannot name it), and a token is never told how many rows would fit. Coarse states still reach it, because a script must be able to say why nothing was imported: the budget is nearly full (transaction_limit_reached, refused whenever it has room for fewer than 250 transactions, D-451), the budget is far behind (catching_up), its import storage of the day is used up (import_limit_reached, D-452), and its lock was held for more than a second (budget_busy, D-453).

**Why:** Answer to Q-191 and the step 6 review (F1): any budget-dependent difference is an oracle on the budget's transactions.

**Rejected:**

- Hiding the two coarse states: the script could not explain a refusal.

Related: Q-191, R-SECURITY-251, R-IMPORT-076

Source: owner-request: coordinator review of the step 6 database (import), 2026-11-16; code: supabase/migrations/20261119100000_import.sql

### D-372 Duplicates are counted per batch (accepted)

Rows of one batch are never duplicates of each other. A row is compared with every existing transaction of the same kind, whatever its origin: the same bank transaction id, else the same date, amount and description, either as the transaction is now or as it was first imported. Each existing transaction absorbs at most one row of the batch, counted over all its chunks, whatever order they arrive in and however often one is sent again; the same statement imported twice imports nothing the second time. Import anyway is per row or for all skipped rows of a batch.

**Why:** The step 6 review (F4, F17): counting per chunk let a statement split in two chunks import a duplicate, and editing an imported transaction made the same line import again.

**Rejected:** none recorded.

Related: D-115, R-IMPORT-003, R-IMPORT-070, R-IMPORT-251, R-IMPORT-254

Source: owner-request: coordinator review of the step 6 database (import), 2026-11-16; code: supabase/migrations/20261119100000_import.sql

### D-373 Possible matches: nearest date, once per batch (accepted)

A row is a possible match of an existing transaction of the same kind that was not imported (typed, or a charge), with the same amount and a date within three days either way; descriptions are not compared. Each existing transaction goes to the row nearest in date (ties: the earlier row, then a charge awaiting confirmation) and absorbs at most one row of the batch. Default: skip the row; when the match is a charge awaiting confirmation the import confirms it and the preview says so; the member can import the row anyway. The batch counts its matched rows. With a token, matches are skipped and left for the member.

**Why:** Answer to Q-192: bank descriptions rarely look like what a member typed, so comparing them would miss most matches; the nearest date is the likeliest pair.

**Rejected:**

- Matching only when the descriptions look alike.

Related: Q-192, R-IMPORT-203, R-IMPORT-261

Source: owner-request: coordinator review of the step 6 database (import), 2026-11-16; code: supabase/migrations/20261119100000_import.sql

### D-374 Confirming a frozen import (accepted)

Confirming an imported transaction changes no amount, date, category or link, so it is allowed on a frozen transaction (a payment of an ended debt).

**Why:** Undo keeps frozen transactions (D-379); the member must still be able to empty the review.

**Rejected:** none recorded.

Related: R-IMPORT-209, D-379

Source: owner-request: coordinator review of the step 6 database (import), 2026-11-16; code: supabase/migrations/20261119100000_import.sql

### D-375 "To categorise" is the import's place only (accepted)

Each budget gets, at its first import that needs it, one top-level category flagged as its "to categorise" place (the name the member passes, a fixed name for a token; from the first period; created even at the category limits). Only imported transactions still to review can be in it: no hand-typed transaction, subscription, debt, planned transfer or merchant rule uses it, and it does not count toward the 200 categories in force. It is renamable, has no expectation, takes no subcategory, cannot end while it holds transactions, and a transaction in it cannot be confirmed. my_budgets names it only while it is in force; category_overview flags it.

**Why:** Answer to Q-190 and the step 6 review (F12): it is a waiting room, not a category to plan with.

**Rejected:** none recorded.

Related: Q-190, R-IMPORT-200, R-CATEGORY-200, R-CATEGORY-250

Source: owner-request: coordinator review of the step 6 database (import), 2026-11-16; code: supabase/migrations/20261119100000_import.sql

### D-376 One cleaner for free text (accepted)

Every name and description of every step goes through one helper: control characters and bidirectional or zero-width formatting characters are removed, every other run of white space becomes one space, and the result is trimmed, before validation and before any comparison. An import's details are stored normalised the same way. Markup and spreadsheet formulas stay as text: the screens escape them, and an export must neutralise them.

**Why:** The step 6 review (F13): the same text must compare equal wherever it came from, and invisible characters must not hide what a name says.

**Rejected:** none recorded.

Related: R-SECURITY-250

Source: owner-request: coordinator review of the step 6 database (import), 2026-11-16; code: supabase/migrations/20261119100000_import.sql

### D-377 A salary credit (revised) (accepted)

A credit is a salary credit when the source says so (hint salary) or when its amount equals an income's amount and its date is within five days either side of a period start: on or after the start of its own period, or before the start of the next period (projected when it does not exist yet), at the income's amount in force in that period. It is skipped by default; imported anyway it is extra income. A different amount changes nothing by itself; the preview shows the planned amount beside the row's.

**Why:** The step 6 review (F9): a salary paid a few days before the period it starts was missed.

**Rejected:** none recorded.

Related: Q-065, R-IMPORT-093, R-IMPORT-259, D-130

Source: owner-request: coordinator review of the step 6 database (import), 2026-11-16; code: supabase/migrations/20261119100000_import.sql

### D-378 Refused rows are stored bounded (accepted)

Of a row that was not imported, only its known keys are kept, each within its limit, and only the names of unknown keys; a call whose rows argument exceeds 2 MB is refused whole (invalid_rows) before any row is read; the request body itself is read and parsed before the function runs, so what bounds it there is the gateway (not verified for the hosted project: Q-280).

**Why:** The step 6 review (F3): a stolen token could otherwise store megabytes of arbitrary JSON per call.

**Rejected:** none recorded.

Related: R-IMPORT-250

Source: owner-request: coordinator review of the step 6 database (import), 2026-11-16; code: supabase/migrations/20261119100000_import.sql

### D-379 Undo and rules leave linked and frozen transactions alone (accepted)

Undoing a batch deletes only its transactions still to review that are linked to nothing; one linked to a subscription, a debt or a planned transfer stays (it is frozen or belongs to that record) and is counted as kept_linked, the confirmed ones as kept_confirmed. Applying a merchant rule at once moves only transactions to review in "to categorise" that are linked to nothing. Every bulk write of steps 6 and 7 was checked against the freeze rules.

**Why:** The step 6 review (F5): undo deleted a frozen debt payment and a rule moved a linked charge.

**Rejected:** none recorded.

Related: R-IMPORT-260, R-IMPORT-206, D-374

Source: owner-request: coordinator review of the step 6 database (import), 2026-11-16; code: supabase/migrations/20261119100000_import.sql

### D-380 Ending a transfer keeps what was done (accepted)

Only a member's act deletes a transfer's transaction: undoing "done", marking an automatic transfer not done, or deleting the transaction. Ending a transfer removes its occurrences from that period on but keeps every mark already made and every transaction link; a period's checklist lists the transfers in force plus those with a mark or a transaction there, flagged as ended (is_ended); preview_end_transfer answers only the outcome or the refusal. The one exception is a reopen (D-382).

**Why:** The step 6 review's step 7 change: what a member recorded is history; ending the plan must not rewrite it.

**Rejected:**

- Removing the marks from the end on (the step 7 version).

Related: R-ACCOUNT-234, R-ACCOUNT-240

Source: owner-request: coordinator review of the step 6 database, step 7 change, 2026-11-16; code: supabase/migrations/20261120100000_money_flow.sql

### D-381 The merchant key's cases (accepted)

The key is the merchant field when it has a letter or digit, else the description; lower case, accents removed (ß, œ, æ, ø spelled out), any script kept; the statement's leading words dropped and a '*' resolved repeatedly: a processor before the merchant ("payup *shop" is "shop"), a merchant before a reference ("amazon.de*ab12cd" is "amazon.de"). The key of a key is itself.

**Why:** The step 6 review: the listed cases gave keys that no rule could match.

**Rejected:** none recorded.

Related: R-IMPORT-201, R-IMPORT-255, D-311

Source: owner-request: coordinator review of the step 6 database (import), 2026-11-16; code: supabase/migrations/20261119100000_import.sql

### D-382 Reopen and the marks of the merged period (revised) (superseded by D-430)

A mark of the merged period moves to the reopened period when that period has none for the transfer. Otherwise it goes: one made by the catch-up with its transaction (made again if the period comes back, like a debt's interest), a member's leaving its transaction as an ordinary one. Marks of periods where a transfer is no longer in force after the merge stay, like any mark of an ended transfer (D-380). Every transfer is settled again from the reopened period.

**Why:** D-380: an ended transfer keeps its marks; the reopen follows the same rule.

**Rejected:** none recorded.

Related: R-ACCOUNT-237, R-VERSION-011, D-380

Source: owner-request: coordinator review of the step 6 database, step 7 change, 2026-11-16; code: supabase/migrations/20261120100000_money_flow.sql

### D-383 Averages over the completed periods, and a category's own average (accepted)

An average is the sum over the completed periods of the range divided by their number, rounded to the rappen with halves away from zero (also for a negative result); null when none is completed. The average result is the average of the results, so it can differ by a rappen from the average income minus the average spent. A category's average spent divides by every completed period of the range (so the categories' averages add up to the trend's); beside it, active_average_spent divides by active_count, the completed periods of the range in which the category was in force or had spending (null when that count is 0), for a category that started or stopped inside the range.

**Why:** Answer to Q-160 (coordinator decision): Daycare, CHF 800 in each of its 3 periods of 11, showed an average of 218.18.

**Rejected:**

- Replacing the average over the whole range: the lines would no longer add up to the trend.

Related: Q-160, R-COMPARE-172

Source: owner-request: coordinator review of the step 5 database and the step 4 re-review fixes, 2026-11-16; code: supabase/migrations

### D-384 The comparison's default and its running periods (accepted)

With no period given, get_period_comparison compares the last two completed periods when two exist, otherwise the last two periods (B the current period, or the last once the budget has ended). With only A given, B is the current (or last) period; with only B given, A is the one before. Every row says, per side, whether it is the current period (a_is_current, b_is_current) and whether it is completed (a_is_completed, b_is_completed; null for a missing side A).

**Why:** Answer to Q-161 (coordinator decision): on day 4 of the running period the default showed a difference of -1606.00, which read as a large saving.

**Rejected:**

- Keeping the current period as the default B.

Related: Q-161, R-COMPARE-071

Source: owner-request: coordinator review of the step 5 database and the step 4 re-review fixes, 2026-11-16; code: supabase/migrations

### D-385 Memberships and invitations are bounded (accepted)

A user belongs to at most 50 budgets, owned ones included (owned stays at 20): accepting an invitation or creating a budget beyond that answers membership_limit_reached; both are serialised per user. list_my_invitations is paged: oldest first, p_limit 1 to 200 (default 50), next page after the last row's created_at and id.

**Why:** Answer to Q-162 (coordinator decision): my_budgets took 3.5 s for 1000 rows and would be cut silently; 1020 pending invitations came back as 1000.

**Rejected:** none recorded.

Related: Q-162, R-MEMBER-250, R-APP-170

Source: owner-request: coordinator review of the step 5 database and the step 4 re-review fixes, 2026-11-16; code: supabase/migrations

### D-386 Interest and moved boundaries (revised) (accepted)

D-272 holds as a statement about the stored data after any change of a period's boundaries: a period's interest entry exists only for a debt opened before the period's start. A start may not move to on or before the opening of a debt that has an interest entry in that period: the change is refused with interest_before_opening and nothing is removed (D-467; a trigger on the period's start, so every boundary operation is covered); preview_move_period_start gives that refusal, and its interest_removed is always 0. The other way, a start moved later so that a debt is now opened before the start of a period without an entry, adds nothing: interest is computed once, when the period is created, on the balance before its start, and computing it afterwards would charge a period that began, as recorded, before the debt existed, on a balance that already includes later rows.

**Why:** The step 5 review (M1): a moved start put a period's interest before the debt's opening, so the history began with interest.

**Rejected:**

- Adding the interest when a start moves later: a retroactive charge on a balance that is no longer the one before the start.

Related: D-272, R-DEBT-131

Source: owner-request: coordinator review of the step 5 database and the step 4 re-review fixes, 2026-11-16; code: supabase/migrations

### D-387 Far behind, only the catch-up calls work (accepted)

A call other than ensure_periods and get_current_period answers catching_up at once, before the budget lock and without any work, when the budget's last period ended more than 62 days before today (or its end date); within that it does its own roll-over as before. Only ensure_periods and get_current_period (and create_budget, for its first periods) do multi-period work, one step per call (at most 120 periods and about two seconds), however often the catch-up is called within one statement. They wait at most two seconds for a lock another session holds, then answer catching_up, so the client's loop tries again and never meets the statement timeout. Supersedes D-270 (whose bound and step stay).

**Why:** The step 5 review (S1, S5): a refused call did a whole step under the lock and discarded it, so six calls at once ran into the 8 s timeout, ensure_periods included; clearing the end date of a long-ended budget did two steps in one call.

**Rejected:**

- Every call doing a step and discarding it (the D-270 behaviour).

Related: R-PERIOD-180, R-PERIOD-250, R-PERIOD-130, D-276

Source: owner-request: coordinator review of the step 5 database and the step 4 re-review fixes, 2026-11-16; code: supabase/migrations

### D-388 A held charge in the schedule preview (accepted)

preview_update_subscription refuses with charge_held_back where update_subscription would (a new cadence or next charge date while a charge is held), and its schedule starts with the held date, the next charge date subscription_overview shows.

**Why:** The step 5 review (S4): the preview answered dates the write then refused, and started a month late.

**Rejected:** none recorded.

Related: R-SUBSCRIPTION-180, D-271

Source: owner-request: coordinator review of the step 5 database and the step 4 re-review fixes, 2026-11-16; code: supabase/migrations

### D-389 The overviews compute only what can differ (accepted)

category_overview computes the per-row helpers only where their answer can differ: a category not in force now (ended, void) has no committed amount, no transfer committed amount and is in no use (terms may only use a category in force, R-CATEGORY-130), and one that started before now never deletes on removal (its references are not looked up).

**Why:** The step 5 review (S8): at the 900-row cap, committed_amount, removal_deletes and in_use cost most of category_overview's 1.2 to 1.6 s.

**Rejected:** none recorded.

Related: R-APP-170, R-CATEGORY-110

Source: owner-request: coordinator review of the step 5 database and the step 4 re-review fixes, 2026-11-16; code: supabase/migrations

### D-390 A retried add records once (accepted)

add_transaction, add_income, create_category, create_subscription, create_debt, create_account and create_transfer take an optional p_client_id (a uuid the client generates once per user action and sends with every retry). The first call records the id with the ids of the rows it created (kept 7 days); the same id sent again by the same member, for the same budget, the same call and the same arguments, creates nothing and answers those rows as they are now (none if deleted since). The same id from another member, for another budget, another call or other arguments is refused with request_reused before anything is written, and the refusal says nothing about the first request. The check runs under the budget lock, so a double click waits for the first call and answers its rows. Retries of the other writes are already harmless: edits, ends, marks (mark_transfer_done) and balance adjustments (adjust_debt_balance) name the revision they read and answer record_changed on a retry; an import chunk is idempotent by batch and chunk.

**Why:** Answer to Q-090 (coordinator decision): a lost answer made the screen say nothing was saved, the user saved again, and the transaction was recorded twice.

**Rejected:**

- Overwriting or returning another member's record for a reused id.

Related: Q-090, R-APP-250, R-TRANSACTION-001

Source: owner-request: coordinator, screen review of steps 4 and 5, 2026-11-16; code: supabase/migrations

### D-391 Over the plan, from the progress view (accepted)

get_category_trend has is_overspent (boolean[], aligned with period_ids): get_period_progress's is_overspent of the line in each period, false where the line has no progress row. get_period_comparison's category rows have a_is_overspent and b_is_overspent, the progress view's flag of each side (null where the side has no row, and on the total row). The client never decides it from spent and planned.

**Why:** The screen review: the Compare page decided spent > planned in the client, which differs from the progress view for a category not in force with spending (C-LOGIC-003).

**Rejected:** none recorded.

Related: R-COMPARE-070, R-COMPARE-071, R-PROGRESS-002

Source: owner-request: coordinator, screen review of steps 4 and 5, 2026-11-16; code: supabase/migrations

### D-392 The budget's first and last day in my_budgets (accepted)

my_budgets.first_period_start is the first period's start, the earliest date the budget accepts a transaction; my_budgets.end_date (already there) is the ended budget's last day (the end of the period containing the end date entered, projected while it does not exist).

**Why:** The screen review: beyond 120 periods the transaction form only had the first page of list_periods.

**Rejected:** none recorded.

Related: R-BUDGET-004, R-TRANSACTION-006

Source: owner-request: coordinator, screen review of steps 4 and 5, 2026-11-16; code: supabase/migrations

### D-393 Removing a mark looks at the occurrence again (superseded by D-423)

Every removal of a transfer's mark (undoing it, deleting the transaction of a manual one) moves the transfer's watermark (settled_seq) back before that period, so the catch-up looks at the occurrence again; undoing a mark of an automatic linked occurrence that is due creates its transaction within the same call. Deleting the transaction of a done occurrence follows the terms in force for it now: an automatic transfer is then not done (its transaction is never created again), whoever marked it; a manual one is to do again.

**Why:** The step 7 review (M1): the watermark stayed past a period whose mark was removed, so an automatic linked occurrence showed done, held back, with no transaction, for good.

**Rejected:** none recorded.

Related: R-ACCOUNT-074, R-ACCOUNT-240, D-354

Source: owner-request: coordinator, independent review of the step 7 database (79afb45), 2026-11-16; code: supabase/migrations/20261120100000_money_flow.sql

### D-395 The dashboard counts the period before too (accepted)

transfers_to_do and transfers_overdue (my_budgets) count the manual occurrences still to do of the current period and of the period before it.

**Why:** Answer to Q-222 (coordinator decision): a transfer left undone at the end of a period must not vanish from the dashboard the day the salary arrives.

**Rejected:** none recorded.

Related: Q-222, R-ACCOUNT-241

Source: owner-request: coordinator, independent review of the step 7 database (79afb45), 2026-11-16; code: supabase/migrations/20261120100000_money_flow.sql

### D-396 A kept income is not checked as newly chosen (accepted)

An edit of a pay-date transfer validates only an income it chooses (p_income_id): the income kept from the terms before may have ended, and the transfer then follows the primary income (follows_primary), as it already did.

**Why:** The step 7 review: once the chosen income had ended, every edit and the preview with no argument answered income_not_in_force until the client cleared the income.

**Rejected:** none recorded.

Related: R-ACCOUNT-071, R-VERSION-071

Source: owner-request: coordinator, independent review of the step 7 database (79afb45), 2026-11-16; code: supabase/migrations/20261120100000_money_flow.sql

### D-397 No end while a transaction is held back (accepted)

Ending a transfer from a period is refused with transfer_held_back while an automatic linked occurrence from that period on is due and waits for room (the budget holds the most transactions): ending would drop it for good. Free room first, as for a subscription's held charge (charge_held_back). preview_end_transfer gives it as the refusal.

**Why:** The step 7 review: in a full budget, ending from the current period dropped that period's held occurrence.

**Rejected:** none recorded.

Related: R-ACCOUNT-234, R-SUBSCRIPTION-180

Source: owner-request: coordinator, independent review of the step 7 database (79afb45), 2026-11-16; code: supabase/migrations/20261120100000_money_flow.sql

### D-398 The previews say what is created at once, counted (accepted)

preview_create_transfer and preview_update_transfer mark created_at_once only where the budget has room (in order), and give on every row created_at_once_count: how many transactions the write creates at once over every period it governs, beyond the at most p_count rows listed.

**Why:** The step 7 review: created_at_once was true in a full budget where nothing is created, and a correction over 63 periods created 63 while the preview listed 60.

**Rejected:** none recorded.

Related: R-ACCOUNT-233, Q-221

Source: owner-request: coordinator, independent review of the step 7 database (79afb45), 2026-11-16; code: supabase/migrations/20261120100000_money_flow.sql

### D-399 The comparison carries the transfers' committed figure (accepted)

get_period_trend has transfer_committed_total, get_category_trend transfer_committed (bigint[] aligned with period_ids, the progress view's figure of the line), and get_period_comparison a_transfer_committed, b_transfer_committed and transfer_committed_difference (total row: the periods' totals; category rows: the progress view's figure), apart from the subscriptions' committed figures.

**Why:** The step 7 review: the comparison reads showed the subscriptions' committed amounts only.

**Rejected:** none recorded.

Related: R-ACCOUNT-238, R-COMPARE-071

Source: owner-request: coordinator, independent review of the step 7 database (79afb45), 2026-11-16; code: supabase/migrations/20261120100000_money_flow.sql

### D-290 The history table newest first, the chart oldest first (accepted)

The debt page reads get_debt_history twice: the table newest first (p_newest_first) 50 rows a page, older ones on request; the chart oldest first, 1000 rows a page, up to 10 000 events, saying where it stops.

**Why:** The database now pages newest first (answer to Q-141): the latest events, the ones a member looks for, come first; D-232's reason for oldest first no longer holds.

**Rejected:** none recorded.

Related: D-232, Q-141, R-DEBT-191

Source: owner-request: coordinator, step 4 screens adapted to the database re-review and step 5, 2026-11-16

### D-291 catching_up is handled in one place (accepted)

One component watches every query and mutation of the budget for catching_up: it runs ensure_periods until 0 behind the catching-up screen (shown only after 700 ms), then reads the budget's queries again. Pages stay mounted, so forms keep what was typed; a refused save says to save again.

**Why:** Since D-270 every call but ensure_periods and get_current_period answers catching_up when the budget is behind; handling it per screen would miss some, and remounting pages would lose what was typed. A catch-up of one step (a new day) ends in about 100 ms: a flash of the full screen helps nobody.

**Rejected:**

- Remounting the page after the catch-up: loses form content.

Related: D-270, R-PERIOD-190, D-231

Source: owner-request: coordinator, step 4 screens adapted to the database re-review and step 5, 2026-11-16

### D-292 Older periods are read on request, from every picker (accepted)

usePeriods reads list_periods 120 at a time; the periods page has a button for older periods, and every period picker ends with "Older periods…", which reads the next page (the list stays open for the next choice).

**Why:** R-APP-170: a budget's periods grow without bound and the API cuts an answer at 1000 rows. Ten years fit in one page, so the entry is rarely seen.

**Rejected:**

- Loading every page at once: what the paging is for.

Related: R-APP-170, R-PERIOD-191, R-PERIOD-192

Source: owner-request: coordinator, step 4 screens adapted to the database re-review and step 5, 2026-11-16

### D-293 Frozen payments from the list itself (accepted)

The transactions list and form read transaction_list.debt_ended to know that a payment's debt has ended; they no longer read debt_overview for it.

**Why:** Answer to Q-140: the database gives the flag on the row.

**Rejected:** none recorded.

Related: Q-140, R-DEBT-151

Source: owner-request: coordinator, step 4 screens adapted to the database re-review and step 5, 2026-11-16

### D-294 Typed values survive a change of correction period (accepted)

When the user picks another correction period, the fields they changed keep what they typed; the others take the new period's terms (the rule of "Keep mine").

**Why:** Replacing typed values without notice loses work; saying what was replaced is noisier than keeping it.

**Rejected:**

- Saying what was replaced and replacing it anyway.

Related: R-CONCURRENCY-190

Source: owner-request: coordinator, final review of the step 4 screens (addendum C), 2026-11-16

### D-295 Compare is a page of its own after the dashboard (accepted)

The comparison is a sidebar page placed right after the dashboard, with three views reached by links whose choices live in the address; Recharts is loaded only with this page. No dashboard card for step 5.

**Why:** The comparison is read often and for a while; a page of its own keeps the dashboard light and its first load small, and the address makes a view shareable between members.

**Rejected:**

- Tabs inside the periods or progress page.
- A dashboard card with a small trend (optional in the brief; left out for now).

Related: R-COMPARE-190

Source: owner-request: coordinator, step 4 screens adapted to the database re-review and step 5, 2026-11-16

### D-296 Say lengths differ beyond a tenth (accepted)

The trend says that period lengths differ and amounts are not adjusted only when the longest period of the range is more than 1.1 times the shortest (from the days the database gives); periods of 28 to 31 days do not trigger it.

**Why:** The note matters after an early pay date or a reopened period; under every ordinary range it would be noise.

**Rejected:**

- Always showing the note.
- Amounts per day (R-COMPARE-173 forbids scaling).

Related: R-COMPARE-173, R-COMPARE-191

Source: owner-request: coordinator, step 4 screens adapted to the database re-review and step 5, 2026-11-16

### D-297 Chart forms of the comparison (accepted)

Income and spending as columns side by side with the planned total as a line on one money axis; the result in a chart of its own, columns from zero (position tells a surplus from a deficit); category lines as a line chart of at most five user-picked lines, each in the hue of its slot. Every chart is one named image whose text alternative is the table under it; on a phone a wide range scrolls inside the chart's own frame, opening on the newest periods.

**Why:** One scale per chart; a slot keeps its colour so identity never moves with rank; five hues is what stays distinguishable.

**Rejected:**

- Two y-axes on one chart.
- Stacked areas of every category.
- A chart of every line.

Related: R-COMPARE-191, R-COMPARE-192

Source: owner-request: coordinator, step 4 screens adapted to the database re-review and step 5, 2026-11-16

### D-298 Side by side on a phone (accepted)

Below the small breakpoint each row of the side-by-side tables shows its name, then A and B next to each other, then the difference on a line of its own, each figure labelled; wider screens keep the table.

**Why:** The difference is what the view is for: it must be seen without scrolling sideways, also with eight-figure amounts at 320 px.

**Rejected:**

- A table scrolling sideways on phones.

Related: R-COMPARE-194

Source: owner-request: coordinator, step 4 screens adapted to the database re-review and step 5, 2026-11-16

### D-330 Rounded figures are checked within 0.05 (accepted)

Where a statement prints a product it rounds (an amount times an exchange rate, a processing fee as a percentage, a CHF amount charged abroad plus its fee), the parser accepts the printed figure when it differs from the exact product by less than CHF 0.05; a securities quantity times its price must give the amount within one unit of the quantity's last decimal times the price, plus one rappen. Every sum, subtotal, carried-forward line, total and running balance must match exactly.

**Why:** R-IMPORT-088 asks for the arithmetic the statement prints to be checked, but the banks' rounding rules are not known (Q-205): every CHF figure of the card-bill sample is a multiple of 0.05, and one row differs from its printed parts by 0.02. A bound below 0.05 accepts any rounding to 0.05 (nearest, up or down) and still refuses a misread digit.

**Rejected:**

- Requiring exact products, which refuses real statements.
- Not checking rates and fees, which lets a misread rate through.

Related: R-IMPORT-088, R-IMPORT-097, Q-205

Source: owner-request: coordinator brief for the step 6 statement parsers, 2026-11-16

### D-331 Unknown entry types are kept, malformed known ones refused (superseded by D-337)

Inside a statement the parser recognises, an entry of a type it does not know (a cash withdrawal, an interest or fee line, a Yuh sale ...) is kept with its printed text as description and the default of its direction; a hint is added only from a leading label (Retrait, Intérêt, Frais ...). An entry that starts like a known type (Achat, Débit TWINT, Paiement, a Yuh Achat with security lines) but does not match its pattern refuses the statement, as does any item outside the table's columns or any amount the parser cannot explain.

**Why:** The samples show few entry types; refusing every statement with a new type would make the import useless, while the column totals and balances still prove that every unknown entry has the right amount (R-IMPORT-088). A known type that does not match is a sign the layout changed.

**Rejected:**

- Refusing a statement with any unknown entry type.
- Skipping lines the parser does not understand.

Related: R-IMPORT-087, R-IMPORT-211, Q-201, Q-202, Q-203

Source: owner-request: coordinator brief for the step 6 statement parsers, 2026-11-16

### D-332 pdf.js loaded on demand, fetching nothing (accepted)

Statements are read with pdfjs-dist 6.4.299, the version the fixtures were captured with, imported dynamically on the first read so that the main bundle does not grow. Its worker is a same-origin file emitted by the build (production CSP: script-src 'self', worker-src 'self' blob:). No CMap, standard font, ICC profile or wasm decoder is configured or fetched (fetching in the worker and wasm are off), fonts are not installed into the page, and the bytes are passed in memory. Files above 10 MB or 50 pages are refused before or right after opening.

**Why:** D-127 keeps the file in the browser; fetching resources from a CDN would leak that a statement is being read and break the CSP. Bank statements embed their fonts and need none of these resources for their text. Monthly statements are a few pages and well under 1 MB, so the bounds leave a wide margin while stopping a hostile file early.

**Rejected:**

- Bundling pdf.js in the main chunk.
- Loading the worker or resources from a CDN.
- A newer pdf.js than the fixtures were captured with.

Related: D-127, R-IMPORT-086, R-IMPORT-210

Source: owner-request: coordinator brief for the step 6 statement parsers, 2026-11-16

### D-333 Parsers return codes and data; the screens own the words (superseded by D-342)

A parse returns the recognised source, what identifies the statement (its period or bill date), one entry per transaction with codes (direction, hint, proposed handling) and the extra data, the controls it checked, and the full source-specific document in the shape of the fixtures' expected.json. A refusal is a typed reason with its figures (the control, the printed and computed amounts) or the line it could not read. The English notes of expected.json (handling.why, skipped.reason) are kept for the fixture comparison as developer notes; the screens translate the codes, never these notes.

**Why:** The screens are bilingual (R-I18N) and R-IMPORT-100 compares the parse with expected.json exactly.

**Rejected:**

- Returning user-facing messages from the parsers.

Related: R-IMPORT-085, R-IMPORT-088, R-IMPORT-100

Source: owner-request: coordinator brief for the step 6 statement parsers, 2026-11-16

### D-334 An own transfer needs the holder's name and address (accepted)

A payment or standing order on the Migros Bank account, and a transfer received on Yuh, is flagged as a transfer between the owner's own accounts when the counterparty's name has the same words as the holder's name (in either order) and its street and town lines equal the holder's address, compared without case, punctuation or spacing (Yuh prints "Chemin du Test, 12"). The country line and the IBAN are not compared.

**Why:** docs/import-sources.md names the name and the address as the only clues on the Migros Bank statement, and says a payment to another person at the same address is not an own transfer (Q-063). Applying the same test to Yuh keeps one rule for both and flags the sample's transfer.

**Rejected:**

- The name alone, which would flag a namesake.

Related: D-129, R-IMPORT-091, Q-063, Q-208

Source: owner-request: coordinator brief for the step 6 statement parsers, 2026-11-16

### D-335 Any credit before the first card is the payment received (accepted)

On a card bill, a dated row with a trailing minus before the first card section is the payment received, whatever its label ("Votre paiement - Merci", with LSV, partial, upper case or another wording), and is skipped like it. A debit row there must be the late-payment interest or a fee, or the bill is refused.

**Why:** Review: under any other label the payment came out as a credit to review while the bill still added up, so no control fired and the card-bill payment would have been counted twice. Matching the position and the sign, not the words, holds for every wording.

**Rejected:**

- Matching the label "Votre paiement - Merci" only.

Related: R-IMPORT-215, D-129, Q-215

Source: owner-request: coordinator, review round of the step 6 statement parsers, 2026-11-16

### D-336 A repeated bank id identifies no transaction (accepted)

A bank transaction id (TWINT id, Yuh reference) printed on more than one entry of the same statement is not a transaction id: every entry carrying it gets none, and all the entries stay. This also answers whether a TWINT id can repeat: the parser does not assume it cannot.

**Why:** With "same bank id means duplicate", a repeated id (a reversal, a split booking, a misprint) would lose a transaction; an entry without an id is still imported. Identical genuine entries with different ids keep their ids.

**Rejected:**

- Keeping the id on the first entry only.
- Refusing the statement.

Related: R-IMPORT-218, R-IMPORT-101, D-115

Source: owner-request: coordinator, review round of the step 6 statement parsers, 2026-11-16

### D-337 Unknown entries described by their first line; text outside tables ignored (accepted)

Inside a statement the parser recognises, an entry of a type it does not know is kept, described by its first text line only (the other lines, which can name people, addresses or IBANs, stay in textLines on the device), with the default of its direction; a hint comes only from a leading label (Retrait, Intérêt, Frais ...) or from the statement's own category line, never from a word inside a merchant name. An entry that starts like a known type but does not match its pattern or its column, any item outside the table's columns, and a rotated or right-to-left item inside a table refuse the statement. Text outside the tables is ignored: page headers and footers, the lines after "Montant dû" on the card bill, and Yuh lines outside a currency table.

**Why:** Supersedes D-331, whose wording ("any item outside the table's columns refuses") did not say that rotated items were dropped and text outside the tables ignored, and whose descriptions of unknown entries could carry a third party's address and IBAN.

**Rejected:**

- Refusing a statement with any unknown entry type.
- Skipping lines the parser does not understand.
- The whole entry text as description.

Related: R-IMPORT-087, R-IMPORT-211, D-331, Q-201, Q-202, Q-203

Source: owner-request: coordinator, review round of the step 6 statement parsers, 2026-11-16

### D-338 Bounds on items, page size and time (accepted)

Each read has its own pdf.js worker, stopped when the read ends. A page outside 500 to 700 by 700 to 1000 pt is refused before its text is read; the text is streamed and the read stops beyond 5000 items on a page or 20 000 in the document; after 20 seconds the worker is terminated and the file refused. Lines are grouped in one pass over the items sorted by baseline. The same item and page bounds apply to a text layer given directly to the parser. A reader that cannot be loaded (offline, a release replaced its chunk) is a refusal of its own, and any other fault while reading a refusal too: the entry point never throws.

**Why:** Review: a 425 kB PDF with one very tall page and 120 000 lines stalled the main thread for 53 s, and a 916 kB PDF inflating to 300 MB of text operators took 33 s and 1.7 GB. The real statements have at most 219 items per page and read in well under a second, so the bounds leave a wide margin.

**Rejected:**

- No bounds beyond file size and page count.
- Parsing in a worker of our own (the bounds make the main-thread work small).

Related: R-IMPORT-216, R-IMPORT-210, D-332

Source: owner-request: coordinator, review round of the step 6 statement parsers, 2026-11-16

### D-339 Purchase dates must be plausible (accepted)

A purchase date after its booking date, or more than 366 days before it, refuses the statement with the control named and both dates. Value dates are not compared with purchase dates (Q-209).

**Why:** The purchase date decides the budget period of the transaction (D-128); a misread or misprinted year would put it in a period years away while every amount still adds up.

**Rejected:**

- Accepting any date.
- Clamping a wrong date to the booking date.

Related: R-IMPORT-217, D-128, Q-209

Source: owner-request: coordinator, review round of the step 6 statement parsers, 2026-11-16

### D-340 How entries become import rows (accepted)

toImportBatch(statement) returns the source (migros_account, migros_card, yuh), the statement's dates (its period; for a card bill the day after the previous bill to the bill date), the rows in statement order each with its entry number beside it, the entries not sent with a code, and the adjustments made. A row has date, amount, direction, description (cut to 500 characters at a code-point boundary), merchant (200), bank_transaction_id (dropped, not cut, above 100), hint and details. Details: purchase_time, booking_date, value_date, card, original_currency with original_amount in that currency's minor unit, exchange_rate as the printed decimal string, fee in rappen, merchant_category, security (the ISIN), location (place and country code); above 2000 bytes they are dropped in this order: location, security, merchant_category, exchange_rate, original amount and currency together, fee, card, value_date, purchase_time, booking_date. An own transfer goes without description and merchant (its payee is the holder). transfer_to_person is given to a TWINT payment to a phone number only: the statements do not show whether the payee of a payment or standing order is a person.

**Why:** The import function refuses a row with any other key or out of its bounds; shortening in a stated way and saying so keeps the import going and visible. Integers and decimal strings keep money exact.

**Rejected:**

- Refusing a statement with a field too long.
- Truncating ids.
- Guessing persons from payee names.

Related: R-IMPORT-219, R-IMPORT-220, Q-213, Q-214

Source: owner-request: coordinator, review round of the step 6 statement parsers, 2026-11-16

### D-341 Entries of 0.00 are shown, not imported (accepted)

An entry of 0.00 (a currency conversion rounded to nothing) stays in the entry list with the handling nothing-to-import, and the mapping lists it among the entries not sent, with the code zero-amount.

**Why:** The import function refuses an amount of 0, and leaving the line out of the list would make the statement look incomplete next to the PDF.

**Rejected:**

- Dropping the entry.
- Sending it and letting the database refuse it.

Related: R-IMPORT-220, Q-212

Source: owner-request: coordinator, review round of the step 6 statement parsers, 2026-11-16

### D-342 The screens get codes and entries, never the source document (accepted)

parseStatementText and readStatementFile return the source, the identity (period or bill date), the statement dates, the entries and the controls, never the source-specific document with the holder, IBAN, balances and the English notes of expected.json. parseStatementDocument returns that document too, for the fixture comparison only. Refusal texts may hold a statement line or reference: they may be shown on the device and are never logged or sent.

**Why:** Supersedes D-333: a screen cannot show what it does not receive; R-IMPORT-100 still compares the full document.

**Rejected:**

- Exposing the document and relying on review.

Related: R-IMPORT-100, D-333, R-IMPORT-086

Source: owner-request: coordinator, review round of the step 6 statement parsers, 2026-11-16

### D-400 An ended budget is one with an end and no current period, caught up (accepted)

The client says a budget has ended only when my_budgets has an end date, the budget is caught up (my_budgets.caught_up, no catch-up running) and get_current_period gives no row. Pages wait and forms hold their state otherwise.

**Why:** Mid catch-up get_current_period gives no row although nothing has ended; taking that for the end turned edits into corrections and dropped typed values.

**Rejected:**

- "No current period" alone (the earlier rule).

Related: R-BUDGET-280, Q-251

Source: owner-request: coordinator, independent review of the step 4 and step 5 screens at a24615e, 2026-11-16

### D-401 Calls give up after 30 seconds (accepted)

Every call to the database through supabase-js is given up after 30 seconds without an answer, as a lost connection.

**Why:** A read that never answers showed skeletons for ever; 30 s is far above every measured call (a catch-up step included) and short enough for a person waiting.

**Rejected:**

- No limit.
- A limit per query.

Related: R-APP-281

Source: owner-request: coordinator, independent review of the step 4 and step 5 screens at a24615e, 2026-11-16

### D-402 Counts are grouped by the translation layer (accepted)

Every {{count}} in a translated message goes through the same count formatter (formatCount): the translations need no change and no caller can forget it; other interpolated values are untouched.

**Why:** Counts were raw in some messages and grouped in others ("And 12345 more changes", "50 000").

**Rejected:**

- Formatting at each call site.

Related: R-APP-282

Source: owner-request: coordinator, independent review of the step 4 and step 5 screens at a24615e, 2026-11-16

### D-403 A frozen payment opens as a read-only view (accepted)

A payment of an ended debt opens titled "Payment of an ended debt", every field shown and disabled, with Close and no Save.

**Why:** An "Edit transaction" window whose fields look editable and whose Save is disabled invites edits that can never be saved.

**Rejected:**

- The edit form with Save disabled.

Related: R-DEBT-151

Source: owner-request: coordinator, independent review of the step 4 and step 5 screens at a24615e, 2026-11-16

### D-404 A shared comparison link opens in the viewer's current budget (accepted)

The address holds the view and its choices but not the budget: a link opens in the current budget of whoever opens it. Period ids that are not that budget's fall back to the defaults, said in words; switching budget in the sidebar drops period and line choices.

**Why:** The budget is chosen in the sidebar for every page; putting it in one page's address would make that page behave unlike the others. Whether every address should name its budget is left open (Q-252).

**Rejected:**

- Keeping a stale period id and showing an error that a retry cannot fix.
- The budget id in this page's address only.

Related: R-COMPARE-283, Q-252

Source: owner-request: coordinator, independent review of the step 4 and step 5 screens at a24615e, 2026-11-16

### D-405 Chart palette re-derived: all pairs apart under every colour-vision deficiency (accepted)

The five chart tokens are, light: #3c5296, #d06002, #0da3a8, #a668f9, #812f52 (each at least 3:1 on the white card); dark: #2265db, #df692a, #14a185, #a77fd4, #a9348d (at least 3:1 on the dark card). Chosen by a search in OKLCH and checked over all pairs (not only neighbours) by two measures: the dataviz validator (OKLab: light worst 12.0 protan/deutan, 14.4 tritan, normal vision 16.4; dark 11.0 and 9.9, normal vision 17.4; target 8, normal-vision floor 15) and the reviewer's (Machado 2009 simulation, CIE76: every pair at least 29.5 light and 22.8 dark under protan, deutan and tritan; floor 20). Lines also carry their slot's mark and dash. D-190's claim that "marks have shapes" was not true of the category chart before this change, and the earlier light tokens were 2.2 to 4.4:1 on the card; D-190 is corrected to point here.

**Why:** Five lines can all cross, so every pair must stay apart, under deuteranopia, protanopia and tritanopia, in both themes; the debt chart uses the same tokens and keeps passing.

**Rejected:**

- Keeping the reference palette's lighter steps with a contrast relief.
- Colour only, without marks and dashes.

Related: D-190, R-COMPARE-192

Source: owner-request: coordinator, independent review of the step 4 and step 5 screens at a24615e, 2026-11-16

### D-406 How a comparison chart scrolls (accepted)

Columns need at least 24 px per period, lines 20 px; the frame is divided into as many whole periods as fit and the content is that width times the number of periods, so scrolling to the newest end leaves no period cut at either edge. The value axis is drawn outside the frame on the chart's own ticks, with CHF at its top.

**Why:** At 1280 px with the sidebar, 24 periods at 44 px each overflowed and the scrolled-in axis was out of view; a frame that holds whole periods never shows half of one.

**Rejected:**

- Squeezing every period into the width on a phone (unreadable columns).
- An axis inside the scrolling content.

Related: R-COMPARE-282

Source: owner-request: coordinator, independent review of the step 4 and step 5 screens at a24615e, 2026-11-16

### D-407 The categories table on a phone (accepted)

Below the small breakpoint the sticky name column is 7 rem (112 px) wide and its name wraps to two lines; the average comes after the periods, so the first column beside the name is a whole period. Wider screens keep a 14 rem name column.

**Why:** The 248 px name column left 6 px for figures at 320 px; the table is the chart's text alternative and must be readable there.

**Rejected:**

- Dropping the sticky column on phones (the name scrolls away from its figures).
- One category at a time on phones (no overview).

Related: R-COMPARE-192

Source: owner-request: coordinator, independent review of the step 4 and step 5 screens at a24615e, 2026-11-16

### D-440 One request id per add, from the form (accepted)

Every add form (transaction, category, income, subscription, debt) generates one request id when it opens and sends it as p_client_id with every save; it gets a new one after a save went through (the transaction form's "save and add another" included) and after request_reused, and keeps it after a lost answer or any other refusal, so the same save sent again records once. A refusal changes nothing in the database, so keeping the id after one is safe: a corrected save with the same id is a first use. The lost-answer message now says that saving again is safe; request_reused says the values were already saved with other content and to check the list before saving again.

**Why:** Answers Q-250 with the database's D-390. An id per request (not per form) would make a retry a new add; an id per action across edits of the values would be refused as reused, which the form then says in words.

**Rejected:**

- A new id per click (a retry after a lost answer would record twice).
- Keeping the id after request_reused (every later save would be refused).

Related: D-390, R-APP-250, R-CONCURRENCY-320, Q-250

Source: owner-request: coordinator brief for the step 6 screens (part A, contract changes), 2026-11-16

### D-441 The comparison screens take what the database now gives (accepted)

Side by side opens on the database's default (the last two completed periods) and says in words, under the picker, in the column heading and in the period list, which chosen side is still running (a_is_current, b_is_current). The categories view shows active_average_spent ("over the N periods it was in use") under the average where active_count differs from completed_count, and both views take "over the plan" from the database's flags. Transfers' committed figures (step 7) are read but not shown yet. The transaction form's earliest date is my_budgets.first_period_start (D-392), read with the budget's counts.

**Why:** D-383, D-384, D-391 and D-392 give these figures; the client no longer decides them.

**Rejected:**

- Hiding a running side (the user may want it, it is only marked).

Related: D-383, D-384, D-391, D-392, Q-181, R-COMPARE-071, R-COMPARE-192

Source: owner-request: coordinator brief for the step 6 screens (part A, contract changes), 2026-11-16

### D-442 The import page: read here, previewed under the import's own batch, sent in parts (accepted)

A PDF is read with readStatementFile (pdf.js and the parsers load on the first file, in chunks of their own) and mapped with toImportBatch; a CSV is mapped on the page. The client generates the batch id when the rows are ready and names it in every preview and every part. A member's choice is sent only where it differs from what the database proposes (a row's action, a credit's kind, a category in force on its date), so choices are remembered only where the member made one. The preview is asked per part of 500 rows, again 400 ms after the last change; the import is offered only once every part's answer is current, then sends the same rows. The rows are drawn 100 at a time with a filter (all, to import, skipped, invalid); the statement's extra data is in a disclosure per row. After the import: the counts from the answers, the rows not imported (list_import_skipped_rows) with "import anyway", the link to the review and undo.

**Why:** R-IMPORT-252 and R-IMPORT-208 ask the preview to equal the write; the page must stay usable with 1200 rows on a phone.

**Rejected:**

- Sending every choice explicitly (it would remember choices the member never made).
- One preview call for all rows (the function takes 500).

Source: owner-request: coordinator brief for the step 6 screens (part B, import), 2026-11-16

### D-443 An interrupted import is resumed by opening the same file (accepted)

While parts are sent the page asks before leaving. The batch id, the parts confirmed, the source and a SHA-256 fingerprint of the rows are kept in localStorage (never the rows: they hold bank data); after a reload the page says an import stopped after part n of m. Opening the same statement again (same fingerprint) reuses the batch id: every part is sent again and those already recorded answer as before. A finished import removes the note; "forget it" removes it by hand.

**Why:** The rows must not be stored on the device; the import is idempotent by batch and part, so sending all parts again is safe.

**Rejected:**

- Keeping the rows to resume without the file (bank data in browser storage).

Source: owner-request: coordinator brief for the step 6 screens (part B, import), 2026-11-16

### D-444 The CSV mapping (accepted)

The separator is detected among semicolon, comma and tab (the one that splits the first lines into equal numbers of cells, the most cells winning) and can be changed; a file that is not UTF-8 is read as Windows-1252. The header's names pre-fill the mapping for the user to check. A date format fills itself only when it alone reads every date; otherwise the user chooses among DD.MM.YYYY, DD.MM.YY, MM.DD.YYYY, DD/MM/YYYY, MM/DD/YYYY, YYYY-MM-DD and DD-MM-YYYY. Amounts: one signed column (the user says what a negative is) or money out and money in; a decimal point or comma; apostrophes, spaces or the other mark as thousands separators; a trailing minus or brackets; more than two non-zero decimals is refused, never rounded. The statement dates sent are the earliest and latest row dates. The mapping is remembered per budget and header in localStorage.

**Why:** R-IMPORT-082; Swiss exports use semicolons, decimal commas and DD.MM.YYYY, and 03.04 is ambiguous.

**Rejected:**

- Guessing day-first for ambiguous dates.

Source: owner-request: coordinator brief for the step 6 screens (part B, import), 2026-11-16

### D-445 The review in the transactions list (accepted)

A "to review" filter (review=1) and an import's filter (batch=<id>) are chips kept in the address; each imported row shows "to review" or "needs a category", a confirm button (none, with why, while in "to categorise") and the statement's data in a disclosure. Confirm all applies to the batch when one is filtered. After an edit gives an imported transaction to review a real category, the page offers "always put this merchant in this category?" with the merchant key the database computed and the number of others waiting in "to categorise" whose key contains it (read from list_transactions, up to 200); not offered when a rule's fragment is already contained in the key. One click calls create_merchant_rule with p_apply and says how many moved.

**Why:** R-IMPORT-007, R-IMPORT-209; the database has no preview of a rule (Q-271).

**Rejected:** none recorded.

Source: owner-request: coordinator brief for the step 6 screens (part B, import), 2026-11-16

### D-446 An import token's secret stays in its dialog (accepted)

create_import_token is called from the mutation, which hands the secret to the dialog's state and returns only the token id, so the mutation cache never holds it; closing the dialog drops it. The dialog says it is shown once, offers a copy button, and says to put it in the environment of the session that runs the script as BUDGET_IMPORT_TOKEN, never in a conversation (docs/import-script.md).

**Why:** R-IMPORT-074, R-SECURITY-005.

**Rejected:** none recorded.

Source: owner-request: coordinator brief for the step 6 screens (part B, import), 2026-11-16

### D-447 "To categorise" in the screens (accepted)

Pickers (transaction, subscription, debt, rule) drop the categories flagged is_to_categorise from list_categories_for_date / category_overview. An import waiting there opens in the transaction form with no category chosen, so saving it gives it a real one. The budget page lists it with a mark ("Import"), "No plan", what it is for, and an edit form that changes the name only; "add a subcategory" is not offered and "remove" is disabled with the reason while it holds transactions. Progress and compare mark its line. category_to_categorise is worded for what was tried: a plan, a subcategory, ending it, a rule, a typed transaction, a subscription, a debt, or confirming a transaction still in it.

**Why:** R-CATEGORY-200, R-CATEGORY-250; conservative where update_transaction's rule for keeping it is unclear (Q-273).

**Rejected:** none recorded.

Source: owner-request: coordinator brief for the step 6 screens (part B, import), 2026-11-16

### D-448 Page strings load with the pages (accepted)

The strings of the import (step 6), the comparison (step 5) and the subscriptions, debts, charges and corrections (step 4) are three chunks (src/locales/groups), loaded with the budget pages by their lazy routes, which wait for them before rendering, so no key shows while they load. The first load keeps the shell, the sign-in pages, the errors and the catch-up screen. Their keys stay typed from the English files. The tests load every group up front.

**Why:** The import strings had grown the first load from 186 to 244 kB (53 to 70 kB gzip); with the comparison and step 4 strings moved too, it is 135 kB (41 kB gzip).

**Rejected:**

- Loading only the current language (a language switch would then wait for a chunk).

Related: R-I18N-001, D-442

Source: owner-request: coordinator, follow-up to the step 6 screens at 40a20ed, 2026-11-16

### D-450 Migrations before the first deployment (accepted)

No database has been deployed yet. Until the first deployment, any migration file may be corrected in place, whichever step it belongs to; the first deployment freezes every migration file then present, and from then on every change is a new migration.

**Why:** Fix rounds of a step under review would otherwise stack migrations that only repair code nobody has run, and the reviewed file would no longer be the one that runs.

**Rejected:**

- A new migration for every fix from the start: the reviewed code and the code that runs drift apart before anything is deployed.

Source: owner-request: coordinator brief for the step 6 database fix round 2 (re-review at 747686c), 2026-11-16; owner-request: coordinator follow-up to the step 6 database fix round 2 (5f57c5a), 2026-11-16

### D-451 What a token learns of the room (accepted)

A token call is refused with transaction_limit_reached whenever the budget has room for fewer transactions than a token call's maximum rows (250), whatever rows it sends and before any planning: a token learns one bit ("nearly full"), never the count. A signed-in member keeps the exact answer (detail {"fits": n}).

**Why:** Counting only the rows sent let a token learn the exact room below 500 by sending 1, 2, 3 rows that can never be imported (the re-review's should-fix 1).

**Rejected:**

- Refusing only when the rows sent do not fit: an exact oracle of the room.

Related: D-371, R-SECURITY-251, R-SECURITY-345

Source: owner-request: coordinator brief for the step 6 database fix round 2 (re-review at 747686c), 2026-11-16; code: supabase/migrations/20261119100000_import.sql

### D-452 Import storage per budget is bounded (accepted)

Whatever members and tokens do, a budget's import storage is bounded. Within a rolling 24 hours (members and tokens together): 20 000 rows submitted to a write and 50 new batches (import_limit_reached), 20 tokens created, deleted ones included (token_limit_reached). Kept: 2 000 batches (at the limit, the oldest batches that hold no transaction and no skipped row any more go first; import_limit_reached when none can), the newest 20 000 skipped rows (older ones go; the batch's counts stay), the newest 50 chunk answers and none older than 7 days (a chunk whose answer is forgotten stays recorded, so sending it again answers chunk_expired and never imports it twice), and staged preview parts for a day, at most 100. Measured with incompressible text at every limit: a skipped row takes about 3 kB and a 500-row chunk answer about 380 kB, so a day adds at most about 85 MB and all that is kept beyond the transactions is at most about 110 MB (skipped rows 66 MB, chunk answers 19 MB, staged parts 11 MB, recorded chunks and batches about 15 MB).

**Why:** The re-review stored 39 MB in 7 s through chunks and recycled 30 tokens in 4.4 s: each call was bounded, nothing bounded the total.

**Rejected:**

- Refusing at the kept limits only: a stolen token could block imports for good.
- Only a time-based pruning: no total bound.

Related: D-378, R-IMPORT-250, R-IMPORT-341

Source: owner-request: coordinator brief for the step 6 database fix round 2 (re-review at 747686c), 2026-11-16; code: supabase/migrations/20261119100000_import.sql

### D-453 Token calls never queue (accepted)

A token call never waits for another token call: another call of the same token doing work answers token_busy at once, and when the two slots for token work (all budgets together) are taken the call answers imports_busy at once; neither does any work or counts, and the script waits and sends again. A working call waits at most a second for its budget's lock (budget_busy, counted) and takes at most 250 rows (a member's call 500); with the merchant key's bounded steps and the duplicate lookup by index its database time stays far within the anon statement timeout (measured worst case about 0.3 s on a 45 000-transaction budget). Were it cancelled all the same, it answers call_cancelled and still counts. A visitor with only the publishable key can still make PostgREST read and parse a request body of any size the gateway lets through (Q-280) and receive invalid_token; every other function is refused.

**Why:** A cancelled transaction cannot be counted, and calls of one token waiting on its lock piled up until the API stalled for every budget (re-review M-2).

**Rejected:**

- Counting in a separate committed transaction (dblink): an extension and a connection per call for what bounded work and try-locks already give.
- Keeping 500 rows a token call: under a 40-loop hammer on a loaded machine one call in 170 hit the statement timeout.

Related: D-370, R-SECURITY-252, R-SECURITY-340

Source: owner-request: coordinator brief for the step 6 database fix round 2 (re-review at 747686c), 2026-11-16; code: supabase/migrations/20261119100000_import.sql

### D-454 The cleaner keeps joiners where text needs them (revises D-376) (accepted)

A zero-width joiner or non-joiner stays between two characters that are not white space (an emoji sequence, Persian or Indic text) and goes elsewhere; interlinear annotation marks (U+FFF9 to U+FFFB) and the language tag (U+E0001) go; a text left with nothing visible (only Hangul fillers, blank braille patterns, joiners, variation selectors or tag characters) is empty, so a name made only of them is refused (invalid_name). Tag characters after a flag stay.

**Why:** Removing every joiner broke emoji families and Persian words, while names made of invisible fillers passed as non-empty (re-review, cleaner).

**Rejected:**

- Removing the fillers everywhere: some are real characters of Hangul or braille text.

Related: D-376, R-SECURITY-250, R-SECURITY-341

Source: owner-request: coordinator brief for the step 6 database fix round 2 (re-review at 747686c), 2026-11-16; code: supabase/migrations/20261119100000_import.sql

### D-455 A statement previewed in parts (answers Q-270 and Q-274) (accepted)

preview_import_part(p_budget_id, p_batch_id, p_part, p_rows) previews part p_part of a statement before any part is written: it takes into account what the batch's parts before it absorb (duplicates, matches) and the choices they send, as well as the chunks already written, so for a statement up to 100 parts of 500 rows its counts and per-row answers equal what import_transactions then does with the same parts in the same order, absent changes by others. It answers one object: rows (as preview_import), part and statement totals (rows and each action; the rows to import by kind, count and amount), the parts covered, the room and whether the statement fits. Previewing a part again forgets the staged parts from it on. preview_import keeps its shape.

**Why:** The screens compared the write with a per-part preview that could not know what earlier parts absorb; the summary had no amounts because the client never adds them (C-LOGIC-003).

**Rejected:**

- Previewing the whole statement in one call: answers beyond 1000 rows.
- Changing preview_import's answer: the screens read its rows.

Related: R-IMPORT-252, R-IMPORT-340, Q-270, Q-274

Source: owner-request: coordinator brief for the step 6 database fix round 2 (re-review at 747686c), 2026-11-16; code: supabase/migrations/20261119100000_import.sql

### D-456 Remembered choices are the member's own (answers Q-276; revises D-314) (accepted)

Only a choice the member sent with a row (action import or skip, or "import anyway") is remembered; a default the import applied is not. A row's choice_key is the key its choice is remembered under: its merchant key, or own_transfer for an own transfer without description and merchant (no merchant key can contain "_"), so an own transfer's choice is remembered too.

**Why:** The contract called them a member's choices while the import stored every default, and an own transfer without a description had no key at all.

**Rejected:**

- A key per account for own transfers: the row carries no account.

Related: D-314, R-IMPORT-092, R-IMPORT-345, Q-276

Source: owner-request: coordinator brief for the step 6 database fix round 2 (re-review at 747686c), 2026-11-16; code: supabase/migrations/20261119100000_import.sql

### D-457 A rule's preview (answers Q-271) (accepted)

preview_merchant_rule(p_budget_id, p_fragment, p_category_id) answers, without writing, the fragment as it would be stored, the existing rule that already covers it (the one the import picks: the longest fragment it contains), whether a rule with that fragment exists, and how many transactions waiting in "to categorise" the rule would move to that category (one implementation with the rule's apply).

**Why:** The screens repeated the "contains" test in the client over at most 200 transactions (C-LOGIC-003).

**Rejected:** none recorded.

Related: R-IMPORT-201, R-IMPORT-347, Q-271

Source: owner-request: coordinator brief for the step 6 database fix round 2 (re-review at 747686c), 2026-11-16; code: supabase/migrations/20261119100000_import.sql

### D-458 Forget a remembered choice (answers Q-272) (accepted)

forget_import_choice(p_budget_id, p_flag, p_counterparty_key) deletes a remembered choice; the next import of that entry applies the default again. It answers whether one was forgotten.

**Why:** A member could only override a choice at the next import.

**Rejected:** none recorded.

Related: R-IMPORT-092, R-IMPORT-346, Q-272

Source: owner-request: coordinator brief for the step 6 database fix round 2 (re-review at 747686c), 2026-11-16; code: supabase/migrations/20261119100000_import.sql

### D-459 One batch by its id (answers Q-275) (accepted)

get_import_batch(p_batch_id) answers the batch as list_import_batches gives it, to members of its budget (import_batch_not_found otherwise).

**Why:** A summary or a link to one batch had to scan pages.

**Rejected:**

- A p_batch_id argument on list_import_batches: another overload of a paged call.

Related: R-IMPORT-257, R-IMPORT-348, Q-275

Source: owner-request: coordinator brief for the step 6 database fix round 2 (re-review at 747686c), 2026-11-16; code: supabase/migrations/20261119100000_import.sql

### D-460 Editing in "to categorise" (answers Q-273) (accepted)

An imported transaction waiting in "to categorise" can be edited (amount, date, description, links) while it keeps that category; update_transaction refuses only moving a transaction into it, and confirming it there.

**Why:** The guard already allowed it; the contract did not say so.

**Rejected:** none recorded.

Related: R-CATEGORY-250, R-CATEGORY-340, Q-273

Source: owner-request: coordinator brief for the step 6 database fix round 2 (re-review at 747686c), 2026-11-16; code: supabase/migrations/20261119100000_import.sql

### D-461 Client request ids answer members only (revises D-390) (accepted)

A call with p_client_id checks membership first: before the id is looked at, before the catch-up gate and before the budget lock (and again under the lock). A signed-in outsider or a removed member gets budget_not_found for every budget and every client id; a replay answers a current member only rows of the budget it names; add_income replayed after the income was removed answers no income, like the other calls.

**Why:** A removed member replaying a client id read the budget's current rows for 7 days, and an outsider learned request_reused and catching_up (re-review M-1).

**Rejected:** none recorded.

Related: D-390, R-APP-250, R-APP-340

Source: owner-request: coordinator brief for the step 6 database fix round 2 (re-review at 747686c), 2026-11-16; code: supabase/migrations/20261121100000_client_requests.sql

### D-462 The duplicate lookup reads by index (accepted)

A row's duplicate by content is looked up twice, each by index: as the transaction is now (budget, kind, amount, date) and as first imported (budget, original amount and date, imported transactions only); the earlier match wins. The values as first imported belong to imported transactions only (a check constraint).

**Why:** The one-query form could not use an index and scanned the budget for every row: 6 to 7.5 s for a 500-row preview at 45 000 transactions (re-review M-3).

**Rejected:** none recorded.

Related: D-372, R-IMPORT-254, R-IMPORT-343

Source: owner-request: coordinator brief for the step 6 database fix round 2 (re-review at 747686c), 2026-11-16; code: supabase/migrations/20261119100000_import.sql

### D-463 Token windows by whole minutes (accepted)

A token's calls and rows are kept by minute; the whole minute a call was made in counts, so a call counts toward the hour for at least 60 and at most 61 minutes, and toward the day for at least 24 hours and at most 24 hours and 1 minute. The limits hold over any 60 minutes and any 24 hours.

**Why:** Counting minutes strictly after now minus an hour let a call drop out after 59 minutes (re-review should-fix 8); one row per minute keeps the bookkeeping bounded.

**Rejected:**

- One row per call: unbounded rows for refused calls.

Related: D-370, R-SECURITY-252, R-SECURITY-342

Source: owner-request: coordinator brief for the step 6 database fix round 2 (re-review at 747686c), 2026-11-16; code: supabase/migrations/20261119100000_import.sql

### D-464 A token adds only to its own batches (accepted)

A token adds chunks only to a batch it created; any other existing batch id (a member's, another token's, another budget's) answers import_batch_conflict, also for a chunk already recorded, so a token cannot read another batch's answers.

**Why:** A token knowing a member's batch id could add to it and replay its chunks (re-review should-fix 7).

**Rejected:** none recorded.

Related: D-371, R-SECURITY-343

Source: owner-request: coordinator brief for the step 6 database fix round 2 (re-review at 747686c), 2026-11-16; code: supabase/migrations/20261119100000_import.sql

### D-465 The token call takes its arguments as text (accepted)

import_with_token takes the batch id, the chunk and the statement dates as text and checks them itself (invalid_batch, invalid_chunk, invalid_date), so a malformed argument answers its code instead of a raw cast error. What happens before the function runs cannot be caught by it: a body that is not JSON (PGRST102), or nested so deep that parsing exceeds the stack (54001), is answered by PostgREST or the database parser.

**Why:** Raw 22P02 and 22008 errors with a datestyle hint reached anonymous callers (re-review should-fix 6).

**Rejected:** none recorded.

Related: R-SECURITY-344, D-453

Source: owner-request: coordinator brief for the step 6 database fix round 2 (re-review at 747686c), 2026-11-16; code: supabase/migrations/20261119100000_import.sql

### D-466 "Import anyway" imports the row previewed (accepted)

A valid row that was skipped is kept as the preview showed it, its free text cleaned (description, merchant, bank transaction id, details), so importing it anyway imports that row and a later import of the same statement line finds it by its bank id. An invalid row is kept as before (bounded, D-378).

**Why:** The kept row was the raw text cut to the limit before cleaning: a padded description or bank id was imported shorter than previewed and no longer matched (re-review should-fix 4).

**Rejected:** none recorded.

Related: D-378, R-IMPORT-073, R-IMPORT-344

Source: owner-request: coordinator brief for the step 6 database fix round 2 (re-review at 747686c), 2026-11-16; code: supabase/migrations/20261119100000_import.sql

### D-467 A moved start never removes interest (answers Q-282) (accepted)

move_period_start, and any other change of a period's start, is refused with interest_before_opening while the new start would be on or before the opening of a debt that has an interest entry in that period; preview_move_period_start refuses the same way. Nothing is removed, so a start moved and moved back loses nothing, and debt_interest.balance always agrees with the history.

**Why:** Removing the entry made a round trip lose the interest for good and left the next entry computed on a balance the history no longer shows (Q-282).

**Rejected:**

- Suspending the entry and restoring it: the later entries disagree with the history while it is suspended.
- Recomputing every later entry: amounts the member has seen change, and a move back still loses the entry.

Related: D-386, D-272, R-DEBT-131, R-DEBT-340, Q-282

Source: owner-request: coordinator follow-up to the step 6 database fix round 2 (5f57c5a), 2026-11-16; code: supabase/migrations/20261117100000_subscriptions_debts.sql

### D-420 Occurrences are keyed by date, not by period (accepted)

An occurrence of a planned transfer is identified by a date, its key, never by a period. A fixed-day transfer follows the calendar exactly like a subscription: a cadence (monthly, quarterly or yearly), a first date that sets the phase, and a nominal day clamped to the month's length, its dates computed by the subscriptions' own schedule code; each date is the key and the due date of an occurrence of the period that contains it, so a short period can have none and a long one two, and a yearly payment is one occurrence a year. A pay-date transfer has one occurrence per pay date of its income in the period: for a chosen income in force, each of its actual pay dates in the period (key = that date); otherwise (the primary income, a chosen income not in force or deleted) one occurrence keyed by the period's scheduled pay date. Every period stores the scheduled pay date of the salary that started it (periods.pay_key): the previous period's projected end plus one by the projection rule when the period is created, the first period's start for the first; a reopen deletes the merged period with its key, and recording that salary again creates the same key. A period is never without a key: when that date is already another period's, it takes the next scheduled pay date no period has (D-490); a key two periods give a transfer (switching between its chosen income and the primary one) belongs to the earlier period. Marks are stored by transfer and key.

**Why:** The review (M2, M3): keyed by period, one real transfer could be recorded twice after a reopen, and short and long periods produced transactions the bank never made. A key that does not move with boundaries makes "the same occurrence" well defined across early and late salaries, reopens and boundary moves. A stored scheduled pay date is needed because the primary income's history is not versioned per period (a primary switch would otherwise change every past key).

**Rejected:**

- Keying the primary income's occurrence by the period's start: a salary recorded again on another day would make a member's mark a different occurrence.
- Computing the scheduled pay date from the current primary income's terms: a primary switch or a pay-day edit would move past keys and orphan marks.
- Giving a colliding period the next scheduled date: every later period's key would shift by a month.

Related: R-ACCOUNT-300, R-ACCOUNT-301, R-ACCOUNT-302, D-352, Q-220, Q-224, D-490

Source: owner-request: coordinator brief for the step 7 occurrence model redesign, after the independent review of 747686c, 2026-11-16; owner-request: database developer decision for the step 7 occurrence model, within the coordinator's brief, 2026-11-16; code: supabase/migrations/20261120100000_money_flow.sql

### D-421 A transfer's first counted day (accepted)

A transfer counts from the first day of the period it is created in, or corrected from, or that period's scheduled pay date when it is earlier (a salary that came late): transfers.starts_on. Nothing before it is planned, and a done date must lie on or after it (before_transfer_start). It stays a date when a reopen moves the transfer's first period into the reopened one, so that period's own earlier payday is not planned.

**Why:** The handover's trap: a transfer created in a merged period had its first period moved into the reopened one, which then had its own occurrence of a payday the transfer never knew (the root of M2).

**Rejected:**

- Freezing first_seq through a reopen: the registry merges validity for every record kind alike.

Related: R-ACCOUNT-302, R-ACCOUNT-305, D-420

Source: owner-request: coordinator brief for the step 7 occurrence model redesign, after the independent review of 747686c, 2026-11-16; owner-request: database developer decision for the step 7 occurrence model, within the coordinator's brief, 2026-11-16; code: supabase/migrations/20261120100000_money_flow.sql

### D-422 Due dates of occurrences (accepted)

A fixed-day occurrence is due on its date, never capped. A pay-date occurrence is due on the actual pay date plus the offset (0 to 31 days), never after the last day of the period that contains the actual pay date; for the primary income the actual pay date is the period's start, whatever moved it. Answers Q-224: a fixed-day transfer has no occurrence in a period that does not contain its date.

**Why:** What the bank does: a standing order runs on its calendar date whatever the salary does.

**Rejected:**

- Capping a fixed date onto a short period's last day (two transfers a few days apart, one the bank never made).

Related: R-ACCOUNT-300, R-ACCOUNT-301, Q-224, D-352

Source: owner-request: coordinator brief for the step 7 occurrence model redesign, after the independent review of 747686c, 2026-11-16; code: supabase/migrations/20261120100000_money_flow.sql

### D-423 The transfers' watermark is a date and moves back on every change of the plan (accepted)

Each transfer has a watermark by due date (settled_through: every occurrence due up to it is settled), the due date of its next automatic linked occurrence waiting (next_due) and a flag that its plan changed (needs_check). Triggers move the watermark back and set the flag on every change of what the plan derives from: a period inserted, a boundary moved or a period deleted, an income's terms or validity (for transfers choosing it), the transfer's terms or validity, and every removal of a mark. The catch-up then looks at the transfer again from its watermark (D-424). The writes that change the plan (transfer edits and ends, marks, income edits and removals, a primary switch, member removal, every boundary operation and reopen) run that catch-up before they answer, so their answer shows the result; any other path is settled by the next catch-up (my_budgets.caught_up is false until then). Never created twice: one mark per transfer and key, one transaction per mark; none skipped: the watermark passes a due date only once every occurrence due by then is settled.

**Why:** M1 and the reviewer's dead ends came from a watermark by period that changes of the plan did not move consistently; triggers cover every path, including those of earlier steps.

**Rejected:**

- A deferred trigger at commit: a test transaction (pgTAP) never commits, and the write's answer would be stale.

Related: R-ACCOUNT-302, R-ACCOUNT-074, D-354, D-393

Source: owner-request: coordinator brief for the step 7 occurrence model redesign, after the independent review of 747686c, 2026-11-16; owner-request: database developer decision for the step 7 occurrence model, within the coordinator's brief, 2026-11-16; code: supabase/migrations/20261120100000_money_flow.sql

### D-424 What the catch-up removes and what stays (accepted)

After a change of the plan the catch-up removes its own marks (and their transactions) whose occurrence is no longer planned or no longer due, and creates the transactions of the automatic linked occurrences due without a mark. It keeps its own mark of an occurrence still planned whatever the new terms: made manual, unlinked, another amount or category (what was recorded on the due date stays; undo leads out). A moved period start is the exception: the catch-up's own marks whose due date the move changed are made again on the new due date (D-491). Ending a transfer turns the catch-up's marks of occurrences it removes into kept marks (by_catch_up false), so nothing recorded goes. A member's mark never goes with a change of the plan: one whose occurrence is no longer planned is listed in the checklist of the period containing its date, flagged (planned false; is_ended when the transfer is not in force there), until undone or until its occurrence is planned again (the salary recorded again).

**Why:** The brief's reconcile step, read together with its rule that an occurrence keeps its mark or transaction when the transfer is made manual, corrected or ended: only an occurrence that is gone or not yet due loses the catch-up's transaction.

**Rejected:**

- Removing the catch-up's transaction when the transfer is made manual from the current period: the bank did the transfer on its due date.
- Removing a member's mark whose occurrence is gone: it would go silently.

Related: R-ACCOUNT-301, R-ACCOUNT-302, R-ACCOUNT-305, D-380, D-423, D-491

Source: owner-request: coordinator brief for the step 7 occurrence model redesign, after the independent review of 747686c, 2026-11-16; owner-request: database developer decision for the step 7 occurrence model, within the coordinator's brief, 2026-11-16; code: supabase/migrations/20261120100000_money_flow.sql

### D-425 Committed figures and the money flow use the monthly share (accepted)

A quarterly or yearly transfer counts its amount divided by its months, rounded half up to the rappen by the subscriptions' own rule (private.subscription_monthly_cost), in every committed figure and in the money flow, in each period it is in force; a monthly or pay-date transfer counts its amount. The reads carry the real amount and cadence beside it (transfer_overview: amount, cadence, monthly_amount; get_money_flow: amount is the monthly share, planned_amount and cadence the real ones). Answers Q-220 with D-420.

**Why:** A yearly payment counted in full in one period and nothing in the others would make the plan of most periods wrong; subscriptions already count a monthly share.

**Rejected:** none recorded.

Related: R-ACCOUNT-304, R-ACCOUNT-238, Q-220

Source: owner-request: coordinator brief for the step 7 occurrence model redesign, after the independent review of 747686c, 2026-11-16; code: supabase/migrations/20261120100000_money_flow.sql

### D-426 A deleted income does not reset a transfer silently (accepted)

When an income a transfer's terms name is deleted outright (added and removed in the same period), the terms keep that they named one (transfer_versions.income_gone): the transfer follows the primary income and says so (follows_primary), like a chosen income that ended.

**Why:** The review: the foreign key set the income to null and the transfer looked as if it had always followed the primary income.

**Rejected:**

- Refusing to delete an income a transfer names: removing a mistaken income would need the transfer edited first.

Related: R-ACCOUNT-071, D-396

Source: owner-request: coordinator brief for the step 7 occurrence model redesign, after the independent review of 747686c, 2026-11-16; code: supabase/migrations/20261120100000_money_flow.sql

### D-427 A catch-up step creates a bounded number of transactions (accepted)

One catch-up step creates at most 4000 subscription charges and transfer transactions per budget and statement, and stops after about two seconds of work once it has created some (limit_catch_up_work); what is left stays due, none skipped, for the next step. A step that stops before creating every one due answers at least 1 from ensure_periods, so 0 still means caught up, and my_budgets.caught_up stays false.

**Why:** The review measured 11 s for one ensure_periods call over HTTP once a full budget got room for 36 000 transactions, and a statement timeout at 48 000.

**Rejected:**

- A lower transaction limit: the backlog would still be unbounded per step.

Related: R-PERIOD-300, D-276, D-387

Source: owner-request: coordinator brief for the step 7 occurrence model redesign, after the independent review of 747686c, 2026-11-16; code: supabase/migrations/20261120100000_money_flow.sql

### D-428 The previews run the write and roll it back (accepted)

preview_create_transfer, preview_update_transfer and preview_reopen run the write itself in a subtransaction they roll back, and compare the transfers' marks before and after: the catch-up's transactions created and removed, the members' marks whose occurrence is no longer planned or planned again. The create and edit previews give these as counts on every row (created_at_once_count, transactions_removed_count, marks_unplanned_count) and, when the terms govern no occurrence, one row with only the counts (occurrence_date null); preview_reopen gives one row per occurrence (transaction_removed, transaction_created, mark_unplanned, mark_planned_again). preview_end_transfer counts the occurrences it removes and the marks and transactions it keeps. A preview that runs the write takes the budget lock like the write.

**Why:** Every preview of a change that the catch-up follows must say truthfully what it does; the write's own code is the only way to be sure.

**Rejected:**

- Recomputing the effect with what-if boundaries: a second implementation of the plan.

Related: R-ACCOUNT-233, R-ACCOUNT-303, D-398

Source: owner-request: coordinator brief for the step 7 occurrence model redesign, after the independent review of 747686c, 2026-11-16; owner-request: database developer decision for the step 7 occurrence model, within the coordinator's brief, 2026-11-16; code: supabase/migrations/20261120100000_money_flow.sql

### D-429 Marks name their occurrence (accepted)

mark_transfer_done, skip_transfer, mark_transfer_not_done and undo_transfer_mark keep p_period_id and take an optional p_occurrence_date, needed only when the period lists several occurrences of the transfer (occurrence_required); a date that is not one of them answers transfer_not_in_force. The checklist has one row per occurrence with its key. Undo puts any mark back to the unmarked state for the terms then in force (a manual occurrence to do; an automatic one assumed done, its transaction made within the call when linked and due); the catch-up's transaction of an automatic linked occurrence is that state already (nothing_to_undo: mark it not done). A mark listed but no longer planned can only be undone, which removes it with its transaction.

**Why:** Several occurrences in a period (D-420), and no state from which no call leads out (the review's dead ends).

**Rejected:**

- Marks keyed by period: a long period has two occurrences.

Related: R-ACCOUNT-301, R-ACCOUNT-240, D-360

Source: owner-request: coordinator brief for the step 7 occurrence model redesign, after the independent review of 747686c, 2026-11-16; code: supabase/migrations/20261120100000_money_flow.sql

### D-430 Reopen and the transfers (revised again) (accepted)

A reopen moves no mark: marks are keyed by date (D-420). The merged period's scheduled pay date is no longer planned, so the catch-up's transaction of a primary pay-date occurrence there goes, and comes back once the salary is recorded again (dated the day it came); a member's mark there stays, listed by its date and flagged, and is the same occurrence again once the salary is recorded again. Fixed-day occurrences keep their dates and their marks. A transfer created in the merged period counts from its first counted day (D-421), so the reopened period gets no occurrence of its own earlier payday. preview_reopen lists each effect per occurrence (D-428).

**Why:** M2: a reopen followed by recording the salary again must leave exactly one transaction for that payday's standing order.

**Rejected:**

- Moving the merged period's marks to the reopened period (D-382): the same payday then exists twice once the salary is recorded again.

Related: R-ACCOUNT-306, R-ACCOUNT-302, D-382, D-358

Source: owner-request: coordinator brief for the step 7 occurrence model redesign, after the independent review of 747686c, 2026-11-16; code: supabase/migrations/20261120100000_money_flow.sql

### D-431 create_transfer's full signature is set up after the retry guard (accepted)

create_transfer takes p_cadence and p_first_date. Its retry guard (D-390) comes from the client-request migration, which runs after step 7's; that migration is not changed, so step 7 keeps the first signature for it to wrap, and the migration 20261122100000_transfer_schedule.sql replaces the guarded call with the full signature over step 7's private.create_transfer_core.

**Why:** Every migration but step 7's is frozen; nothing is deployed, but the order of the files is fixed.

**Rejected:**

- Editing the client-request migration.

Related: D-390, R-ACCOUNT-300

Source: owner-request: database developer decision for the step 7 occurrence model, within the coordinator's brief, 2026-11-16; code: supabase/migrations/20261122100000_transfer_schedule.sql

### D-432 How a preview runs the write (accepted)

A preview that runs the write (D-428: preview_create_transfer, preview_update_transfer, preview_reopen, preview_update_income, preview_set_primary_income, preview_move_period_start) takes the budget lock before it reads the revisions and marks it compares, so behind a member's write in flight it waits and then previews what that write left instead of answering record_changed; inside its subtransaction the catch-up step starts afresh (its bound of transactions and its time, D-427), as the write's own statement would. preview_update_transfer with an amount alone (no other term, no p_from_period_id) runs no write and takes no lock: it applies the write's checks of the new terms and answers the plan as it is at the new amount, every count 0.

**Why:** A preview re-asked at keystroke pace must not fail because another member saved meanwhile, must hit a limit exactly where the write would, and should not queue behind writers for the most common edit (the amount), which moves no occurrence and touches no transaction already made.

**Rejected:**

- Reading before taking the lock: behind a writer the write then refuses with record_changed after waiting.
- Running the write for an amount alone too: it waits for every writer of the budget for an answer known without it.

Related: D-428, D-427, R-ACCOUNT-303

Source: owner-request: coordinator follow-up on the step 7 redesign (2264e82), 2026-11-16; code: supabase/migrations/20261120100000_money_flow.sql

### D-433 A budget behind with its charges or transfers is catching up (accepted)

catch_up_gate also answers catching_up (before the lock, doing nothing) when a subscription charge or an automatic transfer's transaction due more than 62 days before today (or the budget's end) is not made yet and the budget has room for transactions; a full budget is not behind (its charges and transactions wait for room, as before). Only ensure_periods and get_current_period then catch up, one bounded step at a time.

**Why:** With all its periods there but tens of thousands of transfer transactions still to make (a budget opened after decades), every read and write passed the gate and queued on the budget lock behind the others' steps (each up to two seconds), so a screen of eight calls at once ran into the statement timeout (18 timeouts in 40 rounds at 40 years).

**Rejected:**

- Making the step smaller: the queue grows with the number of calls a screen makes, not with the step.

Related: D-387, D-427, R-PERIOD-250, R-PERIOD-300

Source: owner-request: coordinator follow-up on the step 7 redesign (2264e82), 2026-11-16; code: supabase/migrations/20261120100000_money_flow.sql

### D-490 A period is never without a key; occurrences are found by their key (accepted)

Every period has a scheduled pay date as its key (periods.pay_key). When the date the projection gives (the previous period's projected end plus one) is already another period's key (a salary recorded 15 or more days early, then the next one; several salaries in one month), the period takes the next scheduled pay date of the primary income's terms no period has. The key depends only on the earlier periods, so a reopen and the salary recorded again give the same key, and the backfill of existing budgets follows the same rule in order. Because a key can then lie a month or more from its period, every lookup of an occurrence goes by the stored key: the periods that can plan a key are the one whose pay_key it is and the one containing the date, wherever they lie (private.transfer_plan_keys). This covers transfer_planned, the checklist's marks planned elsewhere, the catch-up's check of its own marks, the previews' snapshot of marks, deleting a transaction (not done, not deleted) and end_transfer (a mark still planned is not frozen). When both periods give a transfer the same key, it belongs to the earlier one. Answers Q-260.

**Why:** With the earlier rule a real payday lost its pay-date transfer after a salary that came 15 or more days early (one transfer for three salaries recorded in one month), and lookups that searched only the neighbouring periods missed keys two periods away: a mark listed twice, deleting its transaction deleted the mark so the catch-up created the transaction again, and ending a transfer froze a mark still planned.

**Rejected:**

- Keying such a period by its actual start: a key is then not stable across a reopen and the salary recorded on another day.
- Searching more neighbouring periods: any fixed window can be exceeded by repeated early salaries.

Related: D-420, D-424, D-429, R-ACCOUNT-301, R-ACCOUNT-302, R-ACCOUNT-307, R-ACCOUNT-240, Q-260

Source: owner-request: coordinator decisions on the independent review of the step 7 redesign (2264e82), M1 with C1, 2026-11-16; code: supabase/migrations/20261120100000_money_flow.sql

### D-491 Moving a period's start moves what the app recorded by itself (accepted)

After move_period_start, an automatic transaction the catch-up made for an occurrence of the two periods whose boundary moved sits on the occurrence's new due date, in the right period, exactly as after a reopen and the salary recorded on that day: the catch-up's own mark (by_catch_up) whose done date is not the new due date goes with its transaction and the catch-up makes it again (on the new due date, at the terms in force there; when that date is still ahead, once it is due). A member's own mark (done or skipped by hand, with its date) stays where the member put it. preview_move_period_start counts each moved transaction once removed and once created. The move's refusal for a debt's interest (interest_before_opening, D-467) is answered by the preview as by the write, with every count 0.

**Why:** The member says when the salary really came; the standing order the app recorded on the old day then showed two transfers in the period before and none in the moved one, with a checklist row done before the period started, while saying the same thing another way (reopen, then record the salary) dated it on the new day.

**Rejected:**

- Keeping the transaction on its old date (D-424 as first written): the two ways to say when the salary came gave different budgets.
- Re-dating the transaction in place: a move would then keep an amount the terms no longer give, unlike a reopen and the salary recorded again.

Related: D-424, D-430, D-467, R-ACCOUNT-309, R-PERIOD-100

Source: owner-request: coordinator decisions on the independent review of the step 7 redesign (2264e82), M3, 2026-11-16; code: supabase/migrations/20261120100000_money_flow.sql

## Open questions

- **Q-001** (resolved by D-045) May a member add, edit or remove an income that belongs to another member?
  - Context: The source says "Each member adds their own incomes (person A adds income A, person B adds income B)" and also "every member can read and edit everything in the budget". The step 2 code lets any member add an income for another member (add_income p_user_id) and change any income's terms.
  - Related: R-INCOME-002, R-MEMBER-001
  - Source: domain: Income; domain: Budget; docs/database.md: RPCs
- **Q-002** (resolved by D-100) How is one twelfth of a yearly amount rounded to whole rappen, and must twelve monthly shares add up to the yearly amount exactly?
  - Context: Yearly amounts are stored as yearly and shown as one twelfth per month; amounts are integer rappen, so most yearly amounts do not divide by twelve.
  - Related: R-CATEGORY-005, R-MONEY-002
  - Source: domain: Category and subcategory; domain: Money
- **Q-003** (resolved by D-101) Which "budget total" does the amount left to assign use: the monthly total of the incomes in force now, or the income total of a given period?
  - Context: The source defines the amount left to assign as "budget total minus the sum of expectations" and the budget as starting "from the monthly total of its incomes"; incomes are versioned per period.
  - Related: R-CATEGORY-006, R-PERIOD-018
  - Source: domain: Category and subcategory; domain: Period
- **Q-004** (resolved by D-102) What does the sign of a transaction amount mean (spending, refund, extra income), and may a transaction be put on a category that has subcategories?
  - Context: A transaction "has an amount, a date, and a category or subcategory"; nothing says how refunds or money coming in are recorded, nor whether a parent category with subcategories can hold transactions directly.
  - Related: R-TRANSACTION-001
  - Source: domain: Transaction
- **Q-005** (resolved by D-111) Can a transaction be linked to both a debt and a subscription, or to at most one of them?
  - Context: The source says "optional link to a debt or a subscription".
  - Related: R-TRANSACTION-003
  - Source: domain: Transaction
- **Q-006** (resolved by D-108) Which cadences does a subscription support, what is its "pay date" (a date or a day of the month), and does the weekend rule apply to it?
  - Context: A subscription "has a price, a pay date, a cadence, and a category"; nothing more is said.
  - Related: R-SUBSCRIPTION-001, R-SUBSCRIPTION-002
  - Source: domain: Subscription
- **Q-007** (resolved by D-113) How does the interest rate affect a debt's remaining amount and expected end date, and is the remaining amount the principal minus the transactions assigned to it?
  - Context: A debt has "a principal, an optional interest rate, and a planned monthly payment"; "a transaction assigned to a debt reduces the remaining amount".
  - Related: R-DEBT-003, R-DEBT-005
  - Source: domain: Debt
- **Q-008** (resolved by D-120) Which payday does a planned transfer refer to ("payday + 2 days"): the actual pay date of the primary income (period start), or of a chosen income?
  - Context: Example from the source: "payday + 2 days: 1000 CHF from A to Savings". A budget can have several incomes with different pay days.
  - Related: R-ACCOUNT-002
  - Source: domain: Account and planned transfer (money flow)
- **Q-009** (resolved by D-115) What makes an imported row a duplicate (same date, amount and description; an import id; something else)?
  - Context: The import function "skips duplicates"; nothing defines a duplicate.
  - Related: R-IMPORT-003
  - Source: domain: Import (including by a Claude session)
- **Q-010** (resolved by D-104) Is browsing past periods part of step 3 (period progress view) or step 5 (period comparison charts)?
  - Context: The source lists "Users can browse past periods and compare them (for example a yearly chart)" in one sentence; the build order names a "period progress view" in step 3 and "period comparison charts" in step 5. This spec puts both under step 5 for now.
  - Related: R-COMPARE-001
  - Source: domain: Period; domain: Build order
- **Q-011** (resolved by D-105) What exactly stays editable in a past period: its transactions only, or also its boundaries and other data?
  - Context: "Past periods stay editable" comes right after back-dated transactions, while versioning says edits to incomes, expectations, subscriptions and debts never rewrite the past. The step 2 code already lets members move the boundaries of past periods.
  - Related: R-TRANSACTION-008, R-PERIOD-012
  - Source: domain: Period; domain: Versioning: edits never rewrite the past
- **Q-012** (resolved by D-103) What is a period's surplus or deficit measured against: its income total, or the sum of its expectations?
  - Context: "At the end of a period, category balances reset. The period's surplus or deficit is shown as its result."
  - Related: R-PROGRESS-001, R-PROGRESS-002
  - Source: domain: Period
- **Q-013** (resolved by D-116) How does the import script a Claude session runs authenticate, given that Claude does not get raw database access to real data?
  - Context: The import is reachable "from a script in this repo that a Claude Code session can run", and "Claude does not get raw database access to real data". The likely reading is that it calls the import function as a signed-in member, but the source does not say.
  - Related: R-IMPORT-006, R-SECURITY-005
  - Source: domain: Import (including by a Claude session)
- **Q-014** (resolved by D-117) How are merchant-to-category rules created: automatically when a user categorises an imported transaction, or explicitly by the user?
  - Context: "Merchant-to-category rules are saved so categorisation improves over time."
  - Related: R-IMPORT-007
  - Source: domain: Import (including by a Claude session)
- **Q-015** (resolved by D-121) Are planned transfers versioned like incomes (edits effective from the current period)?
  - Context: The versioning rule lists incomes, category expectations, subscriptions and debts; it does not mention accounts or planned transfers, which also appear on a per-period checklist.
  - Related: R-ACCOUNT-002, R-ACCOUNT-005
  - Source: domain: Versioning: edits never rewrite the past; domain: Account and planned transfer (money flow)
- **Q-016** (resolved by D-070) Should the database return "today" (or the day number within the current period) so that the client never uses the browser's date?
  - Context: The dashboard shows "day N of M" of the current period; the contract returns the period but not the Europe/Zurich date the database decided it with, so N comes from the browser (D-048) and can differ around midnight or in another time zone.
  - Related: D-048, R-PERIOD-017
  - Source: code: src/features/dashboard/period-progress.ts; docs/database.md: Conventions
- **Q-017** (resolved by D-071) Should create_budget take the end date, so that a budget with an end date is created in one atomic step?
  - Context: The first-run form asks for an optional end date; create_budget has no such argument, so the client calls set_budget_end_date afterwards. If that second call fails, the budget exists without its end date and the user is told so.
  - Related: R-BUDGET-010, R-BUDGET-005
  - Source: code: src/features/budgets/budget-mutations.ts; docs/database.md: RPCs
- **Q-030** (resolved by D-125) What should happen to a budget and its incomes when a member's or the owner's account is deleted?
  - Context: No client path deletes accounts yet. Today, deleting the owner's account deletes their budgets for every member (R-BUDGET-016), and deleting a member's account keeps their incomes with a null owner without the member rules: an income that is primary stays active and primary (review finding 8). Settle before any account-deletion feature.
  - Related: R-BUDGET-016, R-MEMBER-007, R-MEMBER-009
  - Source: owner-request: coordinator decisions on the step 2 database review, 2026-11-15
- **Q-018** (resolved by D-124) When two members edit the same income at the same time, should the second save be refused (for example with a version check) instead of silently overwriting the first?
  - Context: Today the last write wins without a warning: update_income_terms and the rename both replace what is there. Every member can edit every income (D-045), so two members of a household can edit the same salary from two browsers.
  - Related: D-045, R-VERSION-006
  - Source: owner-request: step 2 frontend review, finding 11
- **Q-050** (resolved by D-140) How is a half rappen rounded when one twelfth (or another monthly share) falls exactly between two rappen, and do the totals (left to assign, results, committed amounts) add up the rounded monthly shares or round the exact sum?
  - Context: D-100 says one twelfth rounded to the nearest rappen. A yearly amount that is 6 rappen more than a multiple of 12 gives exactly half a rappen (CHF 1.50 a year gives 12.5 rappen), and the tie rule is not given. D-110 also needs a monthly cost for quarterly, half-yearly and yearly subscriptions; the answers do not say it uses the same rounding.
  - Related: D-100, D-110, R-CATEGORY-005, R-SUBSCRIPTION-079, D-173
  - Source: owner-request: product owner decisions on the open questions, 2026-11-16
- **Q-051** (resolved by D-141) What happens to the transactions already on a category when the user adds its first subcategory?
  - Context: D-102: when a category has subcategories, a transaction goes on a subcategory, never on the parent. A category without subcategories holds transactions directly, so adding a subcategory later would leave them on the parent (they could be moved, refused, or kept for past periods only).
  - Related: D-102, R-TRANSACTION-072, R-CATEGORY-002
  - Source: owner-request: product owner decisions on the open questions, 2026-11-16
- **Q-052** (resolved by D-143) How is money coming in that is neither a salary nor a refund (a gift, a resale, a reimbursement from a third party) recorded?
  - Context: Q-004 asked about extra income; D-102 answers spending and refunds only. Incomes are monthly, and one-off incomes are deferred (D-038).
  - Related: D-102, D-038, R-TRANSACTION-070
  - Source: owner-request: product owner decisions on the open questions, 2026-11-16
- **Q-053** (resolved by D-144) Can a transaction be added to, or moved into, a category that has ended, when its date falls in a period where the category was still in force?
  - Context: D-105 lets transactions in past periods be added and edited freely; D-107 ends a deleted category from the current period while past periods keep it.
  - Related: D-105, D-107, R-TRANSACTION-008, R-CATEGORY-072
  - Source: owner-request: product owner decisions on the open questions, 2026-11-16
- **Q-054** (resolved by D-171) When are automatic subscription charges created, given that there is no server: are charge dates missed while nobody opened the app created later, back-dated, and is a charge whose transaction was deleted or answered "did not go through" ever created again?
  - Context: D-109: the transaction is created on the charge date, can be deleted, and is removed when the user says it did not go through. The app is a static SPA on Supabase (D-003), so creation can only happen when the database is next called. Also open: whether editing the subscription (a new version) changes charges already created.
  - Related: D-109, D-003, R-SUBSCRIPTION-073, R-SUBSCRIPTION-077
  - Source: owner-request: product owner decisions on the open questions, 2026-11-16
- **Q-055** (resolved by D-172) When in a period is a debt's interest applied (at its start or end, before or after that period's payments), how is it rounded to the rappen, and does a payment exactly equal to the interest count as "never ends"?
  - Context: D-113: once per period, one twelfth of the yearly rate is applied to the remaining balance and added to it; when the planned payment does not cover the interest the app says the debt never ends. Periods run salary to salary, not by calendar month (D-080), and the expected end date needs a date for each future interest step.
  - Related: D-113, R-DEBT-073, R-DEBT-074
  - Source: owner-request: product owner decisions on the open questions, 2026-11-16
- **Q-056** (resolved by D-313) Are identical rows within the same file duplicates of each other, are refunds and manually entered transactions compared too, and is "import anyway" chosen per row or for all skipped rows?
  - Context: D-115 compares an imported row with existing transactions. Two identical purchases on one day (two coffees) appear as two identical rows in one export; the answer does not say whether the second is skipped.
  - Related: D-115, R-IMPORT-070, R-IMPORT-071, R-IMPORT-073
  - Source: owner-request: product owner decisions on the open questions, 2026-11-16
- **Q-057** (resolved by D-311) What identifies a merchant for a merchant-to-category rule: the whole description, a part of it, or a field of the bank export?
  - Context: D-117 offers "always put this merchant in this category?". Bank descriptions often carry a date, a card number or a location around the merchant name, so an exact match on the description would rarely match again. The sample statements show that the bank cuts merchant names at 24 characters, that one merchant can be printed in different capitals or with different processor prefixes, and that chains add a branch number (docs/import-sources.md). The card bill adds a merchant category line.
  - Related: D-117, R-IMPORT-007, R-IMPORT-079, R-IMPORT-084
  - Source: owner-request: product owner decisions on the open questions, 2026-11-16
- **Q-058** (resolved by D-126) Which product is "One", what export formats do Migros Bank, Raiffeisen, One, Yuh and Twint actually offer, and can the product owner provide sample export files?
  - Context: D-119 asks for presets for these five sources. "One" may be Viseca's "one" credit-card portal; that is unconfirmed. Twint may offer no export at all. Sample export files are needed before the presets can be built.
  - Related: D-119, R-IMPORT-083, D-126
  - Source: owner-request: product owner decisions on the open questions, 2026-11-16
- **Q-059** (resolved by D-352) For a planned transfer on a fixed day of the month, is the day clamped to the month's length and does a weekend rule apply; may a pay-date offset be negative; and what happens to a transfer whose chosen income ends?
  - Context: D-120 allows an offset in days from a chosen income's actual pay date, or a fixed day of the month. Subscriptions clamp and use no weekend rule (D-108), but nothing says the same for transfers. An income ends when it is removed or its member leaves (R-MEMBER-007).
  - Related: D-120, R-ACCOUNT-070, R-ACCOUNT-071, R-MEMBER-007
  - Source: owner-request: product owner decisions on the open questions, 2026-11-16
- **Q-060** (resolved by D-353) On which date is the transaction of an automatic transfer linked to a category created, does it wait for confirmation like a subscription charge, and does unmarking a manual transfer as done remove its transaction?
  - Context: D-122: when a transfer linked to a category is marked done, or when it is automatic, its transaction is created in that category. Automatic transfers are assumed done (R-ACCOUNT-004); subscription charges, also automatic, wait for confirmation (D-109).
  - Related: D-122, D-109, R-ACCOUNT-073, R-ACCOUNT-074, R-ACCOUNT-004
  - Source: owner-request: product owner decisions on the open questions, 2026-11-16
- **Q-040** Should an edit be able to apply from the next period ("from the next salary") instead of the current one?
  - Context: An edit always applies to the current period (R-VERSION-001), so a raise entered before its salary arrives changes the current period's total. A later option could key the edit to the next period, which needs a way to hold a change for a period that does not exist yet without breaking "nothing keyed beyond the latest period" (R-VERSION-011).
  - Related: R-VERSION-001, R-VERSION-011
  - Source: owner-request: coordinator decision on the third step 2 database review, 2026-11-16
- **Q-080** Should a category's expectation be scaled for a period much longer or shorter than a month, such as a reopened period of 60 to 92 days?
  - Context: Each expectation counts once per period, like an income (D-147, R-INCOME-011). A reopened period (R-PERIOD-023) can last up to 92 days and still expects one month of each category, while two months of spending land in it.
  - Related: D-147, R-PERIOD-020, R-PERIOD-023
  - Source: code: supabase/migrations/20261116120000_categories_transactions_progress.sql
- **Q-081** Should a category whose subcategories have all been deleted become an ordinary category again, able to hold an expectation and transactions?
  - Context: D-141: a category stays a group once it had a subcategory, so an empty group expects nothing and takes no transaction until a subcategory is added.
  - Related: D-141, R-CATEGORY-090
  - Source: code: supabase/migrations/20261116120000_categories_transactions_progress.sql
- **Q-082** (resolved by D-154) Should an ended category be restorable (in force again from the current period) instead of being created anew?
  - Context: Ending is final today (R-CATEGORY-072); a new category with the same name starts a new history, so past periods and the new one show two separate rows.
  - Related: R-CATEGORY-072, D-107
  - Source: code: supabase/migrations/20261116120000_categories_transactions_progress.sql
- **Q-083** Are future-dated transactions needed (a bill known in advance), and if so how should they behave when the period they fall in has not started yet?
  - Context: D-145 limits dates to today. Planned recurring charges are subscriptions (step 4), whose charges are created on the charge date (D-109).
  - Related: D-145, R-TRANSACTION-090, D-109
  - Source: owner-request: project coordinator brief for the step 3 database, 2026-11-16
- **Q-084** Should two members reordering the same categories at the same time be detected, like other concurrent edits?
  - Context: A reorder is refused when the set of categories changed meanwhile (R-CATEGORY-096), but two reorders of the same set: the later wins. Ordering is not a revision of a category (D-142), so a reorder never blocks another member's edit.
  - Related: R-CATEGORY-096, D-142, D-124
  - Source: code: supabase/migrations/20261116120000_categories_transactions_progress.sql
- **Q-061** Will any member import statements in German, Italian or English, and can the product owner provide a sample of each?
  - Context: D-134 supports the French versions first. The labels, and possibly the date and number formats, differ in other languages; each language needs a sample before its parser can be tested.
  - Related: D-134, R-IMPORT-098
  - Source: owner-request: coordinator decisions on the sample statements for the import, 2026-11-16
- **Q-062** Do Migros Bank e-banking and Yuh also offer a CSV or camt.053 export of the same transactions, and should the import prefer it to the PDF?
  - Context: A structured export would be sturdier than reading a PDF layout, which the banks can change without notice. The samples provided are PDF only.
  - Related: D-126, R-IMPORT-084
  - Source: owner-request: coordinator decisions on the sample statements for the import, 2026-11-16
- **Q-063** (resolved by D-314) How is a transfer to another member of the household treated, for example a standing order to a partner at the same address: an expense, a transfer between the household's accounts, or something else?
  - Context: The Migros Bank statement shows no IBAN for a payee, so the import recognises an own transfer only by the holder's name and address (D-129). A standing order to another person at the same address looks like any other payment.
  - Related: D-129, R-IMPORT-091
  - Source: owner-request: coordinator decisions on the sample statements for the import, 2026-11-16
- **Q-064** (resolved by D-314) What exactly is remembered when the user imports or skips a flagged entry: the choice per kind of entry, per counterparty or per account, and for the whole budget or for the member only?
  - Context: D-129 says the choice is remembered and proposed next time, without saying for what.
  - Related: D-129, R-IMPORT-092
  - Source: owner-request: coordinator decisions on the sample statements for the import, 2026-11-16
- **Q-065** (resolved by D-317) When does a salary credit match one of the budget's incomes: same amount, same payer, a date near the expected pay date, or a combination; and what happens when the amount differs from the planned income?
  - Context: D-130 skips a salary credit that matches an income. The Migros Bank statement marks it "Paiement de salaire" with the employer's name, but gives no reference to the income.
  - Related: D-130, R-IMPORT-093
  - Source: owner-request: coordinator decisions on the sample statements for the import, 2026-11-16
- **Q-066** (resolved by D-318) When a credit is reviewed as a refund, in which period and category does it count, and can it reduce a category below zero?
  - Context: D-130 proposes other credits as a refund in a category or as extra income. TWINT money received from a person is often a share of a bill paid earlier, possibly in another period.
  - Related: D-130, R-IMPORT-094
  - Source: owner-request: coordinator decisions on the sample statements for the import, 2026-11-16
- **Q-067** Should regular investment purchases (a savings plan) count as spending in the period, or as savings that the money flow of step 7 shows as a transfer?
  - Context: D-131 imports them as ordinary transactions until accounts exist. On the Yuh statement a purchase is a debit like any other, with the security, quantity, price and fees on its continuation lines.
  - Related: D-131, R-IMPORT-095
  - Source: owner-request: coordinator decisions on the sample statements for the import, 2026-11-16
- **Q-068** (resolved by D-315) How is an imported card or bank line reconciled with a transaction already in the budget for the same charge, such as an automatic subscription charge or a manually entered expense?
  - Context: R-IMPORT-070 treats a row as a duplicate only when date, amount and description are the same; a statement line has the bank's description and often a different date (D-128), so the same charge would be counted twice.
  - Related: R-IMPORT-070, D-115, Q-056
  - Source: owner-request: coordinator decisions on the sample statements for the import, 2026-11-16
- **Q-069** Are cash withdrawals expenses when they are made, or transfers to a cash wallet whose spending is entered by hand?
  - Context: No cash withdrawal appeared in the samples, but the Migros Bank account statement will show them.
  - Related: R-IMPORT-084
  - Source: owner-request: coordinator decisions on the sample statements for the import, 2026-11-16
- **Q-070** Does the household have other cards or accounts to import, such as a partner's card, a supplementary card on the same card account, or another member's Yuh account, and should each import be tied to one of the budget's accounts?
  - Context: The samples cover one debit card, one credit card and one Yuh account of one member. A card bill has one section per card. Step 7 introduces accounts.
  - Related: R-IMPORT-084
  - Source: owner-request: coordinator decisions on the sample statements for the import, 2026-11-16
- **Q-071** (resolved by D-152) Should a past boundary moved by hand and then moved back to where the projection put it stop being marked "set by hand"?
  - Context: move_period_start and record_early_pay_date always set periods.end_is_manual = true, also when the date goes back to its original day, and the contract has no way to clear the mark on a past period (set_expected_pay_date resets only the current period's end). The client cannot tell a past boundary that matches the schedule (C-LOGIC-003). The periods page now explains on the badge that the mark stays after moving back. Options: the database clears end_is_manual when a boundary is moved back to its projected date, or the mark is dropped for past periods.
  - Related: R-PERIOD-012, R-PERIOD-025, R-PERIOD-014
  - Source: owner-request: coordinator, step 2 browser review fixes, 2026-11-16
- **Q-090** (resolved by D-390) Should add_transaction take a client-generated id, so that a double-submitted or retried save records the transaction once?
  - Context: The boundary operations name the period they act on (D-151), so a retry is refused; an add has no record to name yet. The review recorded a double-submitted add_transaction as two rows. The screens disable the button while saving, but a retry after a lost response would still record twice.
  - Related: D-151, R-CONCURRENCY-100, R-TRANSACTION-095
  - Source: owner-request: coordinator, step 3 database review, 2026-11-16
- **Q-091** (resolved by D-233) Should the database say where the schedule would put a period's start, and whether moving it back there would be accepted?
  - Context: "Move this period's start back to the schedule" calls move_period_start without a date; the client cannot know the schedule's day (C-LOGIC-003), so the confirmation names no date and the action is offered even when the database will refuse it (invalid_boundary), which the dialog then says. Options: a period_summaries.scheduled_start column (null when it equals the start), or preview_move_period_start(p_period_id) returning the scheduled date and whether it fits between the neighbouring periods, so the action is offered only when it can work and names its date.
  - Related: R-PERIOD-055, D-152, C-LOGIC-003, D-233
  - Source: owner-request: coordinator, step 3 final review, 2026-11-16
- **Q-100** When the transaction limit holds automatic charges back, should the app tell the members?
  - Context: D-176: charges wait, none skipped, until there is room; nothing tells the user that some are waiting. Reaching 50 000 transactions takes decades of normal use.
  - Related: D-176, R-SUBSCRIPTION-112
  - Source: owner-request: database developer decision for step 4, within the coordinator's brief, 2026-11-16
- **Q-101** Should a price change also update the charges already created and still awaiting confirmation?
  - Context: D-170: charges already created never change; a member edits a charge awaiting confirmation like any transaction. A price rise announced after a charge was created leaves that charge at the old price.
  - Related: D-170, R-VERSION-003
  - Source: owner-request: database developer decision for step 4, within the coordinator's brief, 2026-11-16
- **Q-102** Should an old charge awaiting confirmation be confirmed automatically after some time?
  - Context: D-175: a charge awaits confirmation until a member answers; the dashboard list can grow if nobody does. It counts in totals meanwhile (R-SUBSCRIPTION-078).
  - Related: D-175, R-SUBSCRIPTION-076
  - Source: owner-request: database developer decision for step 4, within the coordinator's brief, 2026-11-16
- **Q-110** (resolved by D-216) Should the database give the total remaining across a budget's debts?
  - Context: D-191: the debts page adds up debt_overview.remaining for the debts in force. A database total would follow C-LOGIC-003 to the letter and could exclude or include ended debts by rule.
  - Related: D-191, R-DEBT-121
  - Source: owner-request: coordinator brief for the step 4 screens, 2026-11-16
- **Q-111** (resolved by D-218) Should one call change a transaction and its debt link together?
  - Context: D-194: changing the debt a transaction pays takes up to three calls (unlink, update, link), not atomic; a failure part-way leaves part of the change.
  - Related: D-194, D-177
  - Source: owner-request: coordinator brief for the step 4 screens, 2026-11-16
- **Q-112** Should the transaction form also link a transaction to a subscription (a charge recorded by hand)?
  - Context: add_transaction and link_transaction accept p_subscription_id; the step 4 screens offer only the debt link, as the brief asked. A charge recorded by hand would show as a subscription charge without being an automatic one.
  - Related: R-TRANSACTION-003, D-177
  - Source: owner-request: coordinator brief for the step 4 screens, 2026-11-16
- **Q-130** (resolved by D-219) Should the database give the terms a record had in force in a given period?
  - Context: D-210: the correction forms read the version tables and pick the row in force themselves. A function per record (or one column on the views by period) would keep that rule in the database (C-LOGIC-001).
  - Related: D-210, R-VERSION-140
  - Source: owner-request: coordinator, step 4 screens review round 1, 2026-11-16
- **Q-131** (resolved by D-220) Should the database say beforehand whether a removal from a given earlier period deletes?
  - Context: D-214: removal_deletes describes a removal from now only; for an earlier period the dialogs say both outcomes.
  - Related: D-214, R-SUBSCRIPTION-141
  - Source: owner-request: coordinator, step 4 screens review round 1, 2026-11-16
- **Q-120** Can an ended debt be restored, or a payment recorded after it ended?
  - Context: D-209 freezes an ended debt: a payment forgotten before it was removed cannot be added any more. Undoing the removal is possible only as a correction of its end (none exists for debts yet).
  - Related: D-209, R-DEBT-134
  - Source: owner-request: coordinator review of the step 4 database, 2026-11-16
- **Q-121** (resolved by D-231) Should the app show progress while a very long absence is caught up?
  - Context: D-201: after more than ten years away, reading a budget takes several ensure_periods calls (120 periods each); my_budgets.caught_up is false meanwhile and get_current_period answers no row.
  - Related: D-270, R-PERIOD-130, D-231
  - Source: owner-request: coordinator review of the step 4 database, 2026-11-16
- **Q-140** (resolved by D-293) Should transaction_list say that a payment's debt has ended?
  - Context: D-209: a payment of an ended debt cannot be changed or deleted. transaction_list gives debt_id and debt_name only, so the transactions list reads debt_overview to know which payments are frozen and disable their actions. A column debt_ended (or a frozen flag) would let the list say so from its own row.
  - Related: D-209, R-DEBT-151
  - Source: owner-request: coordinator, step 4 screens review round 2, 2026-11-16
- **Q-141** (resolved by D-290) Should get_debt_history also page newest first?
  - Context: D-232: the history table shows the oldest events first because get_debt_history pages only in that order; for a long history the latest events, the ones a member usually looks for, are many pages away. A p_newest_first flag with the mirrored cursor would let the table start with them.
  - Related: D-232, R-DEBT-135, D-290
  - Source: owner-request: coordinator, step 4 screens review round 2, 2026-11-16
- **Q-160** (resolved by D-383) Should a category's average spent count only the periods where it was in force?
  - Context: D-261: it divides by every completed period of the range, so a category added three periods ago averages over all twelve and looks smaller than its usual spending. Counting only periods in force would make the per-category averages not add up to the trend's average spent.
  - Related: D-261, R-COMPARE-172
  - Source: owner-request: database developer decision for step 5, within the coordinator's brief, 2026-11-16
- **Q-161** (resolved by D-384) Should the current, still running period be compared by default, or the last completed one?
  - Context: R-COMPARE-071 (coordinator decision): B defaults to the current period and A to the one before, so early in a period B shows little spending against a whole period A.
  - Related: R-COMPARE-071
  - Source: owner-request: database developer decision for step 5, within the coordinator's brief, 2026-11-16
- **Q-162** (resolved by D-385) Should the number of budgets a user can belong to be limited?
  - Context: D-264: my_budgets returns one row per budget the user belongs to. A user owns at most 20, but nothing limits the budgets they are invited to; past 1000 the API would cut the list. No screen pages it.
  - Related: D-264, R-APP-170, R-BUDGET-004
  - Source: owner-request: coordinator finding on the step 5 database (API row limit), 2026-11-16
- **Q-190** (resolved by D-375) Should the "to categorise" category count towards the 200 categories in force?
  - Context: D-312: it is created even at the limit, then counts like any category, so a budget at 200 must end one before adding its own next category.
  - Related: D-312, R-CATEGORY-094
  - Source: owner-request: database developer decision for step 6, within the coordinator's brief, 2026-11-16
- **Q-191** (resolved by D-371) Should a token's refusals also hide that the budget is full or far behind?
  - Context: D-316: transaction_limit_reached and catching_up reach the token, telling it one fact each about the budget; hiding them would leave the script unable to say why nothing was imported.
  - Related: D-316, R-IMPORT-076
  - Source: owner-request: database developer decision for step 6, within the coordinator's brief, 2026-11-16
- **Q-192** (resolved by D-373) Should a possible match only count when the descriptions also look alike?
  - Context: D-315: a typed purchase and a different purchase of the same amount within three days are matched, and the row is skipped (listed for the member) until imported anyway.
  - Related: D-315, R-IMPORT-203
  - Source: owner-request: database developer decision for step 6, within the coordinator's brief, 2026-11-16
- **Q-220** (resolved by D-425) Should planned transfers support other cadences, such as a yearly third-pillar payment?
  - Context: D-352: one occurrence in each period a transfer is in force. A yearly payment is entered as a manual transfer the member skips, or created and ended each year.
  - Related: D-352, R-ACCOUNT-002
  - Source: owner-request: database developer decision for step 7, within the coordinator's brief, 2026-11-16
- **Q-221** Should a correction that makes a transfer automatic and linked in past periods create those periods' transactions?
  - Context: D-354 creates them, so a transaction exists exactly when the transfer counts as done; a correction of a subscription never creates charges for dates already passed.
  - Related: D-354, R-SUBSCRIPTION-073
  - Source: owner-request: database developer decision for step 7, within the coordinator's brief, 2026-11-16
- **Q-222** (resolved by D-395) Should the dashboard also count manual transfers left to do in past periods?
  - Context: D-361 counts the current period only.
  - Related: D-361, R-ACCOUNT-241
  - Source: owner-request: database developer decision for step 7, within the coordinator's brief, 2026-11-16
- **Q-223** Should a closed account be restorable, like a category, rather than created again?
  - Context: Step 7 has no restore for accounts; a correction can only close it from an earlier period.
  - Related: D-350, R-ACCOUNT-232
  - Source: owner-request: database developer decision for step 7, within the coordinator's brief, 2026-11-16
- **Q-224** (resolved by D-422) When a period is short (an early salary), should a fixed-day transfer whose day falls after the period's end be due on the period's last day, or have no occurrence in that period?
  - Context: D-352 caps the due date at the period's last day, so one calendar day can lead to two occurrences close together (the short period's last day, then the day in the next period).
  - Related: D-352, R-ACCOUNT-239
  - Source: owner-request: database developer decision for step 7, within the coordinator's brief, 2026-11-16
- **Q-180** Should list_transactions list the charges awaiting confirmation oldest first?
  - Context: The dashboard shows the oldest awaiting charges first (list_charges_awaiting_confirmation, at most 200, no paging); the transactions list filtered to them (p_awaiting_only) pages newest first only, so the two orders differ and the oldest of hundreds are pages away. An oldest-first order for that filter, with its cursor, would let the list match the card.
  - Related: R-TRANSACTION-132, R-SUBSCRIPTION-191
  - Source: owner-request: coordinator, final review of the step 4 screens (addendum C), 2026-11-16
- **Q-181** Should the database give what the screens still derive from its lists?
  - Context: Four derivations without money remain in the client (C-LOGIC-003, borderline): the period containing a typed date (picked from list_periods' rows, to read a debt's terms for a payment); the nominal day of a typed first charge date (its day number, for the words under the preview); the last period a correction reaches (the period before until_period_id, taken as seq - 1 from the list); and the subscriptions and debts that use a category now (filtered from their lists, for the warning before a removal). The database could give period_id for a date, the preview's nominal day, until_period's predecessor, and category_overview's users. A fifth, from the review of the step 5 screens: "over the plan" in the categories view is decided in the client (spent > planned), which differs from the database only for a category not in force with spending; the database is to give the flag per period. Update (step 6 screens, D-441): the fifth is closed; the categories view and side by side take "over the plan" from get_category_trend.is_overspent and get_period_comparison's a_is_overspent / b_is_overspent (D-391). The first four remain.
  - Related: C-LOGIC-003, R-DEBT-152, R-VERSION-150, R-CATEGORY-120, R-COMPARE-192, D-391
  - Source: owner-request: coordinator, final review of the step 4 screens (addendum C), 2026-11-16
- **Q-200** How does the Migros Bank account statement print a negative balance (an overdraft)?
  - Context: The sample has no negative balance and docs/import-sources.md says the account statements print no negative numbers. A balance with a sign is refused for now as an unreadable amount, so an overdrawn statement cannot be imported until a sample shows the format.
  - Related: R-IMPORT-089
  - Source: owner-request: coordinator brief for the step 6 statement parsers, 2026-11-16
- **Q-201** How are the Migros Bank account entries that were not in the sample labelled: cash withdrawals, interest and fees at period end, incoming transfers, eBill and direct debits, TWINT refunds, and TWINT payments to foreign phone numbers?
  - Context: D-331 keeps them as printed. The parser assumes, without a sample, that a line starting with "Retrait" is a cash withdrawal, "Intérêt" an interest line and "Frais", "Commission", "Taxe" or "Tenue de compte" a fee, and that a TWINT phone number is "+" and 6 to 15 digits. A label that differs only loses the hint.
  - Related: D-331, Q-069
  - Source: owner-request: coordinator brief for the step 6 statement parsers, 2026-11-16
- **Q-202** What do card-bill rows not in the sample look like: an annual fee or other charge, a cash advance, a refund, a first bill without a previous total, a partial payment and a bill with a credit balance?
  - Context: The parser assumes an annual fee is a header row (two dates, no card) whose text starts with "Cotisation", "Frais", "Taxe" or "Commission"; that a cash advance has "retrait" in its details or category; that a refund is a card row with a trailing " -"; and that a missing previous total counts as zero. A bill total labelled otherwise than "Montant total de la facture en notre faveur" (for a credit balance) is refused as an unexpected line.
  - Related: D-331, R-IMPORT-096
  - Source: owner-request: coordinator brief for the step 6 statement parsers, 2026-11-16
- **Q-203** How does the Yuh statement show sales, dividends, fees, currency exchange, Yuh card purchases, TWINT, outgoing transfers and savings-account movements?
  - Context: Only securities purchases ("Achat" with security lines) and incoming transfers ("Virement de") were in the sample. Any other row is kept as printed (D-331): a sale or dividend becomes a credit to review, which may be wrong for an investment account (Q-067).
  - Related: D-331, Q-067
  - Source: owner-request: coordinator brief for the step 6 statement parsers, 2026-11-16
- **Q-204** With several currency sections on a Yuh statement, what do the page 1 opening and closing balances hold, and should movements in another currency be imported (converted, or as their CHF counterpart) rather than refused?
  - Context: The parser checks every section on its own and the per-currency closing balances of page 1, but compares the page 1 opening and closing balances only when the statement has one section. Movements in a section other than CHF refuse the statement (the budget is CHF only, R-MONEY-001).
  - Related: D-126, R-IMPORT-084
  - Source: owner-request: coordinator brief for the step 6 statement parsers, 2026-11-16
- **Q-205** Does Viseca round every CHF figure of the card bill (converted amounts, fees, a CHF amount charged abroad plus its fee) to 0.05, and how?
  - Context: Every CHF figure of the sample is a multiple of 0.05. docs/import-sources.md says a CHF amount charged abroad "may differ by 0.01 from the sum of the printed figures", but the sample's row of 11.62 plus a fee of 0.20 is billed 11.80, a difference of 0.02. D-330 accepts differences below 0.05.
  - Related: D-330, R-IMPORT-088
  - Source: owner-request: coordinator brief for the step 6 statement parsers, 2026-11-16
- **Q-206** On a card bill of more than two pages, is "Total intermédiaire de la carte" the card's total so far or only the rows of that page, and can one row's lines be split across a page break?
  - Context: The sample has one page break, where both readings give the same figure. The parser takes the total so far (it is carried forward as "Report de la carte") and lets a row's continuation lines follow on the next page, after the carried-forward lines.
  - Related: R-IMPORT-088
  - Source: owner-request: coordinator brief for the step 6 statement parsers, 2026-11-16
- **Q-207** How does Yuh print amounts of 1000 or more?
  - Context: No amount of 1000 or more was in the sample. The parser accepts the Migros Bank form (1'234.50, with ' or ’) and plain digits (1234.50), and refuses anything else as unreadable.
  - Related: R-IMPORT-089
  - Source: owner-request: coordinator brief for the step 6 statement parsers, 2026-11-16
- **Q-208** How are the holder's name and address printed for a joint account, a couple or a holder with a title, on each statement?
  - Context: The parser reads the holder from page 1: on the Migros Bank account, the lines after a numeric code and one salutation line (the last two lines being street and town); on Yuh, the line before street and town, without a leading "Monsieur", "Madame" or similar; on the card bill, "Titulaire du compte". When the block cannot be read, no own transfer is flagged (D-334).
  - Related: D-334, Q-063, Q-070
  - Source: owner-request: coordinator brief for the step 6 statement parsers, 2026-11-16
- **Q-209** On the Migros Bank account statement, is the value date of a card purchase always its purchase date?
  - Context: It is for every card purchase of the sample and, per the reviewer, for all 51 of the real statement. The parser does not enforce it from one statement (D-339).
  - Related: D-339
  - Source: owner-request: coordinator, review round of the step 6 statement parsers, 2026-11-16
- **Q-210** When a Yuh currency table runs over a page break, is its heading repeated on the next page?
  - Context: The parser continues a table only under a repeated heading; a continuation without one is refused. No sample had a Yuh table over two pages.
  - Related: R-IMPORT-087
  - Source: owner-request: coordinator, review round of the step 6 statement parsers, 2026-11-16
- **Q-211** How are Yuh amounts aligned under their headings?
  - Context: In the sample the debits end about 5.6 pt left of the DÉBIT heading's right edge; the parser places an amount by its right edge within the heading span plus 4 pt, so a credit left-aligned with its heading would be refused.
  - Related: R-IMPORT-087
  - Source: owner-request: coordinator, review round of the step 6 statement parsers, 2026-11-16
- **Q-212** Should entries of 0.00 be shown in the review at all?
  - Context: The card fixture has an invented 0.00 row (a conversion rounded to nothing); the real bill has none. D-341 shows it with nothing to import.
  - Related: D-341
  - Source: owner-request: coordinator, review round of the step 6 statement parsers, 2026-11-16
- **Q-213** May the import guess that the payee of a payment or standing order is a private person (no legal-form word such as AG, SA, GmbH, Sàrl), to give it the transfer_to_person hint?
  - Context: The statements do not say; only a TWINT payment to a phone number shows a person. D-340 gives no hint otherwise.
  - Related: D-340, Q-063
  - Source: owner-request: coordinator, review round of the step 6 statement parsers, 2026-11-16
- **Q-214** Does the import function require row dates inside p_statement_from to p_statement_to?
  - Context: Rows are dated by purchase date (D-128), which can precede the statement period: a purchase of 31 March in the April account statement, a card purchase before the previous bill date.
  - Related: D-340, D-128
  - Source: owner-request: coordinator, review round of the step 6 statement parsers, 2026-11-16
- **Q-215** Can a card bill carry a credit before the first card that is not a payment (a refunded fee or interest), and how is it labelled?
  - Context: D-335 takes every such credit for the payment received, so a refunded fee there would not be imported.
  - Related: D-335
  - Source: owner-request: coordinator, review round of the step 6 statement parsers, 2026-11-16
- **Q-216** Should an own transfer still be recognised when the payee lines carry a message, a "c/o" line or abbreviations ("Ch." for "Chemin")?
  - Context: D-334 compares the street and town lines exactly (without case and punctuation); such a payment is imported as an ordinary expense, which the user can skip.
  - Related: D-334, Q-208
  - Source: owner-request: coordinator, review round of the step 6 statement parsers, 2026-11-16
- **Q-250** (resolved by D-440) Should an add carry a client-generated id so a retry after a lost answer records it once?
  - Context: R-CONCURRENCY-281: today a lost answer on an add can only be described ("it may have been saved"); the coordinator has asked the database for an idempotency id on adds, to be wired in the next round.
  - Related: R-CONCURRENCY-281
  - Source: owner-request: coordinator, independent review of the step 4 and step 5 screens at a24615e, 2026-11-16
- **Q-251** Should my_budgets say directly whether the budget has ended?
  - Context: D-400: the client combines three answers (end date, caught_up, no current period). A has_ended column would make the rule one read and remove the wait during a catch-up.
  - Related: R-BUDGET-280, D-400
  - Source: owner-request: coordinator, independent review of the step 4 and step 5 screens at a24615e, 2026-11-16
- **Q-252** Should addresses name their budget, so a shared link opens the budget it was made in?
  - Context: D-404: the current budget is chosen in the sidebar and not in any address; a comparison link opened by a member whose current budget differs falls back to the defaults (R-COMPARE-283). Naming the budget in every address would make shared links exact.
  - Related: D-404, R-COMPARE-283
  - Source: owner-request: coordinator, independent review of the step 4 and step 5 screens at a24615e, 2026-11-16
- **Q-270** (resolved by D-455) Should preview_import take the rows of the batch's earlier parts that are not written yet, so that a later part's preview accounts for them?
  - Context: A part is previewed on its own; a row of part 2 that duplicates or matches the same existing transaction as a row of part 1 is previewed as absorbing it, but at the write part 1 absorbs it first. The screens compare the answers with the preview and say how many rows turned out differently (D-442). Only imports above 500 rows are affected.
  - Related: R-IMPORT-252, R-IMPORT-251
  - Source: owner-request: coordinator brief for the step 6 screens (part B, import), 2026-11-16
- **Q-271** (resolved by D-457) Should the database preview a merchant rule: whether an existing rule already covers a key, and how many transactions waiting in "to categorise" it would move?
  - Context: The one-click offer decides "already covered" and counts the others by testing whether the database's keys contain a fragment in the client (D-445), which repeats R-IMPORT-201's "contains" and reads at most 200 waiting transactions; the count after the click is the database's (moved).
  - Related: R-IMPORT-007, R-IMPORT-201, C-LOGIC-003
  - Source: owner-request: coordinator brief for the step 6 screens (part B, import), 2026-11-16
- **Q-272** (resolved by D-458) Should a member be able to forget a remembered choice for a flagged entry?
  - Context: list_import_choices shows them; no call deletes one. The settings card says to choose otherwise at the next import instead.
  - Related: R-IMPORT-092
  - Source: owner-request: coordinator brief for the step 6 screens (part B, import), 2026-11-16
- **Q-273** (resolved by D-460) Can an imported transaction waiting in "to categorise" be edited (amount, note) while it stays there, or must every update give it a real category?
  - Context: docs/database.md says update_transaction refuses "to categorise" for a transaction moved into it; it does not say whether one already there may keep it. The form asks for a real category (the conservative reading, D-447). Observed on the local stack: update_transaction with the "to categorise" category unchanged and a new note is accepted, so the database allows it; the contract should say so before the form relaxes.
  - Related: R-CATEGORY-250
  - Source: owner-request: coordinator brief for the step 6 screens (part B, import), 2026-11-16
- **Q-274** (resolved by D-455) Should the preview give the total amount to import (money out and money in), for the summary above the table?
  - Context: The summary counts rows from the answers; it shows no amount, since the client never adds amounts (C-LOGIC-003). preview_import would have to return per-call totals by action.
  - Related: R-IMPORT-252, C-LOGIC-003
  - Source: owner-request: coordinator brief for the step 6 screens (part B, import), 2026-11-16
- **Q-275** (resolved by D-459) Should one batch be readable by its id (list_import_batches with p_batch_id)?
  - Context: After an import the summary counts the answers rather than reading the batch's own counts, which the paged list gives only by scanning pages; a link to one batch cannot be opened either.
  - Related: R-IMPORT-257
  - Source: owner-request: coordinator brief for the step 6 screens (part B, import), 2026-11-16
- **Q-276** (resolved by D-456) How should a choice for an own transfer be remembered, and should the import remember the default of a flagged row the member did not change?
  - Context: toImportBatch sends an own transfer without description and merchant (R-IMPORT-219: the payee is the holder), so its merchant key is empty and a choice for it cannot be remembered (R-IMPORT-092); on the local stack, importing it by choice stored no import_choices row. Conversely, after a first import of the Migros Bank fixture with no action sent, import_choices held a row for every transfer to a person (import) and for the card-bill payment (skip): the database remembers defaults too, which the contract describes as "a member's choice".
  - Related: R-IMPORT-092, R-IMPORT-219, D-314
  - Source: owner-request: coordinator brief for the step 6 screens (part B, import), 2026-11-16
- **Q-280** What bounds a request body before import_with_token runs on the hosted project, and is anything needed in front of it?
  - Context: PostgREST reads and parses the whole body before the function runs; locally a 50 MB body with an unknown token was parsed in 1.0 s and 200 MB in 4.1 s, the database growing from 0.33 to 1.77 GiB. The function checks 2 MB only once it runs. To verify at the deployment step: the hosted gateway's body limit; if it is large, a limit in front of the API (docs/deployment.md).
  - Related: R-IMPORT-250, D-378, D-453
  - Source: owner-request: coordinator brief for the step 6 database fix round 2 (re-review at 747686c), 2026-11-16
- **Q-281** Should anonymous calls be rate-limited before the database (per address, at the gateway)?
  - Context: Busy answers cost about 1.5 ms each and count nothing; 40 parallel loops on one token still take connections from the API's pool, and a member of another budget then saw a median of 115 to 206 ms (worst 635 ms) instead of 7 to 9 ms. Only a limit in front of PostgREST can bound that; to check at the deployment step with Q-280.
  - Related: D-453, R-SECURITY-340
  - Source: owner-request: coordinator brief for the step 6 database fix round 2 (re-review at 747686c), 2026-11-16
- **Q-282** (resolved by D-467) When a period start moves onto or before a debt's opening and back again, how should the debt's interest come back, and should the later entries follow the history?
  - Context: D-386 removes the period's interest entry when its start moves to on or before the opening (a trigger in the step 4 migration, private.drop_interest_before_opening) and adds nothing when it moves later again, because interest is computed once, when the period is created. So after a start moves onto the opening day and back, the debt is lower for good by the removed entry (120.00 in the re-review), and the next period's entry keeps the balance it was computed on (debt_interest.balance 1 212 000 while the history's balance before it is now 1 200 000). Options: (a) refuse the move while the period holds an interest entry of a debt opened on or after the new start (a refusal code, shown by preview_move_period_start as it already counts interest_removed): the history stays exact and nothing is lost, at the cost of a restriction; (b) keep the entry but mark it suspended while the start is on or before the opening, and restore it when the start moves after the opening again: the round trip is exact, but while suspended the later entries' balance disagrees by the suspended amount; (c) on any removal, recompute every later entry of that debt from the history: balance always agrees, but amounts the member has seen change, and a move back still loses the entry unless combined with (b). Recommended: (a). Any option changes the step 4 migration's trigger and its preview, which under D-450 is a new migration (or the money-flow rewrite), so it was not fixed in this round.
  - Related: D-386, D-272, R-DEBT-131
  - Source: owner-request: coordinator brief for the step 6 database fix round 2 (re-review at 747686c), 2026-11-16; code: supabase/migrations/20261117100000_subscriptions_debts.sql
- **Q-260** (resolved by D-490) A period created on a scheduled pay date the budget already used (a salary recorded more than 15 days early, then the next one on its scheduled day) has no primary pay-date occurrence. When both salaries are real, should that period's pay-date transfers get an occurrence (for example keyed by its actual start), so a real payday's standing order is not missing from its checklist?
  - Context: D-420 gives a key to one period only, so a reopen and the salary recorded again find the same mark. Example: pay day 25, a salary recorded on 9 November for 25 November: that period's "Savings 500" (pay date, automatic) is keyed 25 November and its transaction dated 9 November; the period the schedule then starts on 25 November gets no key, so its checklist has no "Savings" row and the catch-up makes no transaction for it. The next period (25 December) is keyed as usual. If the 25 November salary is real, one standing order is missing from the budget until a member records it as a plain transaction.
  - Related: D-420, R-ACCOUNT-301, R-ACCOUNT-302
  - Source: owner-request: coordinator follow-up on the step 7 redesign (2264e82), 2026-11-16; code: supabase/migrations/20261120100000_money_flow.sql

## Glossary

- **Budget** (French UI: _Budget_): The container of everything else: incomes, categories, subscriptions, debts, transactions, periods and accounts. Always a monthly budget.
- **Owner**: The member who created the budget. Only the owner can delete it, change its end date, or manage members and invitations.
- **Member**: A person who belongs to a budget (the owner included). Every member can read and edit everything in the budget.
- **Invitation**: An offer to join a budget, addressed by the owner to an email address. The invited person accepts or declines it after signing in with a matching verified email.
- **Income** (French UI: _Revenus_): A monthly amount with a nominal pay day, belonging to one member of the budget. The incomes of a budget sum into its monthly total.
- **Primary income**: The one income of a budget whose pay dates define the periods.
- **Nominal pay day** (French UI: _jour de paie_): The day of the month an income is due, for example the 25th, before clamping to the month length and before the weekend rule.
- **Actual pay date**: The date an income is really paid in a given month: the nominal pay day clamped to the month length, then moved by the weekend rule (or overridden by hand).
- **Weekend rule**: Per income: how a pay day that falls on a Saturday or Sunday moves. One of nearest (default), previous, next, none.
- **Period** (French UI: _Périodes_): The span from one actual pay date of the primary income to the day before the next one. A stored row with a start and an end date.
- **Current period**: The period that contains today. The last period that exists as a row; its end date is a projection.
- **Period boundary**: The point between the end of one period and the start of the next. It can be moved by hand; a manual boundary is never recomputed.
- **Projected end**: The current period end computed as the day before the next actual pay date of the primary income.
- **Period number (seq)**: The 1-based number of a period within its budget. Income validity and versions refer to it, not to dates.
- **In force**: An income is in force in a period when it started at or before that period and has not ended before it; a version is in force when it is the latest one effective at or before that period.
- **Income total**: Of a period: the sum of the incomes in force in that period, each at the version in force for that period.
- **Monthly total**: The sum of all incomes of the budget; the amount the budget starts from.
- **Version**: The terms of an income (and later of a category expectation, a subscription or a debt) in force from a given period on. Edits create versions; they never rewrite the past.
- **Category** (French UI: _Catégories_): The first level of the budget split, for example insurance. Holds the monthly expectation when it has no subcategories.
- **Subcategory** (French UI: _sous-catégories_): The optional second (and last) level under a category, for example insurance/car.
- **Monthly expectation** (French UI: _montants prévus_): The amount planned for a category or subcategory per month, entered per month or per year.
- **Amount left to assign**: Of a period: its income total minus the sum of the expectations in force in that period. Negative when more is assigned than the income. See D-101, D-106.
- **Category balance**: What is left of a category within a period. Reset at the end of each period.
- **Period result**: The surplus or deficit of a period: its income total minus the total spent in it. Per category: the expectation minus what was spent. See D-103.
- **Transaction** (French UI: _Transactions_): An amount on a date, in a category or subcategory, with an optional description and an optional link to a debt or a subscription.
- **Subscription** (French UI: _Abonnements_): A recurring charge with a price, a first charge date, a cadence (monthly, quarterly, half-yearly or yearly) and a category. See D-108.
- **Next charge** (French UI: _prochain prélèvement_): When a subscription will next be charged.
- **Debt** (French UI: _Dettes_): Money owed, with a principal, an optional interest rate and a planned monthly payment.
- **Remaining amount**: What is still owed on a debt; transactions assigned to the debt reduce it.
- **Account** (French UI: _comptes_): A place money is kept (salary account, savings, third pillar, tax reserve), possibly at different banks.
- **Planned transfer**: A planned movement of money between two accounts, scheduled as an offset in days from an income's actual pay date (such as "payday + 2 days: 1000 CHF from A to Savings") or on a fixed day of the month. Flagged automatic or manual. See D-120.
- **Automatic transfer**: A planned transfer done by a standing order; assumed done.
- **Manual transfer**: A planned transfer the user makes by hand; shown as a per-period checklist.
- **Money flow** (French UI: _Flux financiers_): The plan of transfers between accounts after payday, drawn as a diagram.
- **Import**: Bulk creation of transactions through the one import function in the database, from a paste/CSV screen, a repository script a Claude session can run, and later a connector.
- **To review**: The mark an imported transaction carries until the user has checked it.
- **Merchant-to-category rule**: A saved mapping from a merchant to a category, so categorisation of imports improves over time.
- **Rappen**: The hundredth of a Swiss franc (centime). Every amount is an integer number of rappen.
- **CHF**: Swiss franc, the only currency.
- **Today**: The calendar date in Europe/Zurich, decided by the database.
- **Calendar date**: A day written YYYY-MM-DD (Postgres date): not an instant, never converted through a time zone.
- **Timestamp**: An instant with a time and a zone (Postgres timestamptz), shown as the local calendar date of that instant.
- **Edge**: The point where money or dates enter or leave the app as text: display and input. Formatting and parsing happen only there.
- **Row-level security (RLS)**: Postgres policies deciding which rows each user may read or change. The only access control of the app.
- **Recovery mode**: The state after a password-recovery link signed a user in: they must choose a new password before using the app. Tied to that exact sign-in.
- **Email link**: A link Supabase Auth sends by email (sign-up confirmation, password recovery, email change) that brings the user back to the app with a session or an error.
- **Parked link**: Email-link tokens kept for one tab (sessionStorage, never a URL) after their check failed for a transient reason, so a reload retries.
- **Session key**: The identity of one sign-in: the session_id claim of the access token, or the user id when there is none.
- **Publishable key**: The Supabase anon key meant for the browser. With the project URL, the only configuration that reaches the browser.
- **Display name** (French UI: _Nom affiché_): The name a user chooses at sign-up, kept in their profile.
- **Profile**: One row per user, created on sign-up, with their display name and email.
- **Dashboard** (French UI: _Tableau de bord_): The home page of the app: the current period at a glance.

## Actors

- **anonymous visitor** (A-VISITOR): Someone who is not signed in. Can sign up, sign in, follow email links and nothing else; reads and changes no data.
- **signed-in user** (A-USER): Anyone signed in, before or regardless of belonging to a given budget. Relative to a budget they are not a member of, they are "another user" and can see or change nothing in it.
- **budget owner** (A-OWNER): The member who created a budget. Everything a member can do, plus delete the budget, change its end date, and manage members and invitations.
- **budget member** (A-MEMBER): A person who belongs to a budget, the owner included unless stated. Reads and edits everything in the budget.
- **invited person** (A-INVITEE): Someone whose email address the owner invited. Sees the invitation after signing in with an account whose verified email matches, then accepts or declines it.
- **Claude session** (A-CLAUDE): A Claude Code session that imports transactions by running the import script of this repository. Never gets raw database access to real data.

## How to read this

- Ids are stable and never renumbered: `R-<AREA>-NNN` business rules, `C-<AREA>-NNN`
  conventions, `D-NNN` decisions, `Q-NNN` open questions, `F-<NAME>` features,
  `US-<FEATURE>-NNN` user stories, `A-<NAME>` actors, `G-<TERM>` glossary terms.
- A rule is _active_ when its feature is done or in progress, _planned_ otherwise.
- Enforcement: _test_ means a test names the id in its description (grep the id to find
  it); _lint_ means a named mechanical check (npm script, ESLint rule, CI step);
  _review_ means it cannot be checked mechanically and reviewers check it.
- **TEST PENDING** is a temporary marker: the proof is in `supabase/tests` but those
  tests do not name the id yet. `npm run spec:check` reports these as warnings.
- Sources:
  - `domain`: docs/domain.md, the prose domain model this spec replaced (last version: commit 0ea3e1b). Section names after the colon follow that file.
  - `CLAUDE.md`: The project instructions, Rules section, before the spec took it over.
  - `README.md`: The repository README.
  - `docs/database.md`: The database API contract written with step 2 (backend).
  - `docs/deployment.md`: Build and deployment notes.
  - `code`: Behaviour or a choice visible only in the code or its comments; the path follows.
  - `owner-request`: The product owner's request that introduced this structured spec and its check.
  - `docs/import-sources.md`: The analysis of the product owner's sample statements (Migros Bank account, Migros Bank credit card, Yuh), written to prepare step 6; section names after the colon follow that file.
