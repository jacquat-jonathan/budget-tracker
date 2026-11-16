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

343 rules (279 active, 57 planned), 24 conventions, 146 decisions, 23 open questions. 1 rules and conventions are marked **TEST PENDING**.

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
  Rules: R-PERIOD-001, R-PERIOD-002, R-PERIOD-003, R-PERIOD-004, R-PERIOD-005, R-PERIOD-006, R-PERIOD-008, R-PERIOD-009, R-PERIOD-010, R-PERIOD-017, R-PERIOD-018, R-PERIOD-050, R-PERIOD-052
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
  Rules: R-CATEGORY-072, R-CATEGORY-073, R-CATEGORY-095, R-CATEGORY-052, R-CATEGORY-101, R-CATEGORY-054
- **US-CATEGORY-005** As a budget member, I want to change a category's expectation from now on, or explicitly correct it from an earlier period, so that past periods stay as they were unless I fix a mistake on purpose.
  Rules: R-VERSION-002, R-VERSION-070, R-CATEGORY-053, R-CATEGORY-100, R-CATEGORY-101, R-CATEGORY-054
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
  Rules: R-SUBSCRIPTION-001, R-SUBSCRIPTION-002, R-SUBSCRIPTION-070, R-SUBSCRIPTION-071, R-SUBSCRIPTION-072, R-VERSION-003, R-SUBSCRIPTION-110, R-SUBSCRIPTION-114, R-CATEGORY-110
- **US-SUBSCRIPTION-002** As a budget member, I want each subscription charge to be recorded automatically on its charge date, and to confirm from the home page that it really went through, so that I do not enter recurring charges by hand and still catch one that failed.
  Rules: R-SUBSCRIPTION-073, R-SUBSCRIPTION-074, R-SUBSCRIPTION-075, R-SUBSCRIPTION-076, R-SUBSCRIPTION-077, R-SUBSCRIPTION-078, R-SUBSCRIPTION-111, R-SUBSCRIPTION-112, R-SUBSCRIPTION-113, R-TRANSACTION-003, R-VERSION-110
- **US-SUBSCRIPTION-003** As a budget member, I want to see a subscription's monthly cost as committed within its category's expectation, so that I see how much of the category is already spoken for.
  Rules: R-SUBSCRIPTION-079

#### F-DEBT Debts (in-progress)

Debts with planned payments, their evolution and expected end date.

- **US-DEBT-001** As a budget member, I want to record a debt with its principal, interest rate and planned monthly payment, so that I can follow it down to zero.
  Rules: R-DEBT-001, R-DEBT-002, R-DEBT-070, R-DEBT-072, R-VERSION-004, R-DEBT-110, R-DEBT-114
- **US-DEBT-002** As a budget member, I want payments linked to a debt to reduce what remains, interest to be added to it, and to see its history and expected end date, so that I know when it will be paid off, or that it never will at this pace.
  Rules: R-DEBT-003, R-DEBT-004, R-DEBT-005, R-DEBT-071, R-DEBT-073, R-DEBT-074, R-DEBT-111, R-DEBT-112, R-DEBT-113, R-TRANSACTION-110
- **US-DEBT-003** As a budget member, I want to adjust a debt's balance by hand, so that it matches my bank statement.
  Rules: R-DEBT-075

### Step 5: Period comparison charts (planned)

#### F-COMPARE Period comparison (planned)

Comparing periods in charts. Browsing a past period and its progress view is part of step 3 (F-PROGRESS).

- **US-COMPARE-001** As a budget member, I want to compare the income, spending and result of the last 12 periods in a chart, so that I see how our spending evolves.
  Rules: R-COMPARE-002
- **US-COMPARE-002** As a budget member, I want to see the spending per category across periods, so that I see which categories grow or shrink.
  Rules: R-COMPARE-070
- **US-COMPARE-003** As a budget member, I want to put two periods side by side, so that I see exactly what changed between them.
  Rules: R-COMPARE-071

### Step 6: Import (statements, CSV and Claude) (planned)

#### F-IMPORT Import (planned)

Bulk import of transactions from PDF bank and card statements, from CSV, or by a Claude session, through one database function.

- **US-IMPORT-001** As a budget member, I want to paste or upload a CSV of transactions, so that I do not type them one by one.
  Rules: R-IMPORT-001, R-IMPORT-002, R-IMPORT-003, R-IMPORT-004, R-IMPORT-005, R-IMPORT-070, R-IMPORT-071, R-IMPORT-072, R-IMPORT-073, R-IMPORT-080, R-IMPORT-082, R-TRANSACTION-005
- **US-IMPORT-002** As a Claude session, I want to import transactions by running the import script of this repository with an import token, so that a member can delegate the import without giving Claude raw database access.
  Rules: R-IMPORT-001, R-IMPORT-006, R-IMPORT-076, R-SECURITY-005
- **US-IMPORT-003** As a budget member, I want imported transactions to be marked to review until I confirm them, categorised from saved merchant rules, and to save a new rule in one click when I categorise one, so that I check them quickly and categorisation improves over time.
  Rules: R-IMPORT-004, R-IMPORT-007, R-IMPORT-079, R-IMPORT-081
- **US-IMPORT-004** As a budget member, I want to create import tokens for one budget in Settings, and revoke them, so that I control what a Claude session can do, and can stop it at any time.
  Rules: R-IMPORT-074, R-IMPORT-075, R-IMPORT-076, R-IMPORT-077
- **US-IMPORT-005** As a budget member, I want to edit the merchant-to-category rules in Settings, so that I can fix a rule that puts a merchant in the wrong category.
  Rules: R-IMPORT-078
- **US-IMPORT-006** As a budget member, I want to open a PDF statement of my Migros Bank account, my Migros Bank credit card or my Yuh account in the app, so that its transactions are imported without typing them or mapping columns.
  Rules: R-IMPORT-084, R-IMPORT-085, R-IMPORT-086, R-IMPORT-087, R-IMPORT-088, R-IMPORT-089, R-IMPORT-090, R-IMPORT-095, R-IMPORT-096, R-IMPORT-097, R-IMPORT-098, R-IMPORT-099, R-IMPORT-100, R-IMPORT-101, R-IMPORT-102
- **US-IMPORT-007** As a budget member, I want card-bill payments, transfers between my own accounts, salaries and other credits to be recognised when I import a statement, so that nothing is counted twice and I decide what each credit is.
  Rules: R-IMPORT-091, R-IMPORT-092, R-IMPORT-093, R-IMPORT-094

### Step 7: Accounts and the money flow diagram (planned)

#### F-MONEYFLOW Accounts and money flow (planned)

Accounts, planned transfers after payday, a per-period checklist and the money flow diagram.

- **US-MONEYFLOW-001** As a budget member, I want to define my accounts and the transfers planned between them after payday, so that the money goes where it should every period.
  Rules: R-ACCOUNT-001, R-ACCOUNT-002, R-ACCOUNT-003, R-ACCOUNT-004, R-ACCOUNT-070, R-ACCOUNT-071, R-VERSION-071
- **US-MONEYFLOW-002** As a budget member, I want a per-period checklist of the manual transfers, so that I do not forget one.
  Rules: R-ACCOUNT-005
- **US-MONEYFLOW-003** As a budget member, I want a diagram of the planned flow of money, so that I see the whole plan at a glance.
  Rules: R-ACCOUNT-006, R-ACCOUNT-007, R-ACCOUNT-075
- **US-MONEYFLOW-004** As a budget member, I want to link a planned transfer to a category, so that its transaction is created when it is done, so that savings, third pillar or tax transfers count in the budget without being entered twice.
  Rules: R-ACCOUNT-072, R-ACCOUNT-073, R-ACCOUNT-074

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
- **R-PERIOD-031** A budget can never get stuck: creating the missing periods always succeeds, each starting the day after the previous one ends, until one contains today or the budget's end is reached.
  _active · enforced by test · F-PERIOD_
  - Related: D-080
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
- **R-PERIOD-055** Every period action sends the period the user was looking at (its id and revision). When the database refuses it because that period changed (another member acted first, or an earlier attempt already went through), the action is closed, the periods are read again and the page says so; nothing is retried automatically. A start set by hand can be moved back to the schedule's day, which clears its "set by hand" mark.
  _active · enforced by test · F-PERIOD_
  - Related: R-CONCURRENCY-100, R-PERIOD-100, R-PERIOD-051, D-151, D-152
  - Source: owner-request: coordinator, frontend adaptation to the step 3 database review fixes, 2026-11-16; code: src/features/periods/periods-page.tsx
- **R-PERIOD-100** A boundary moved to where the schedule puts it (the previous period's projected end) is not marked as set by hand, and a past boundary can be moved back to the schedule without giving a date.
  _active · enforced by test · F-PERIOD_
  - Related: D-152, Q-071, R-PERIOD-014, R-PERIOD-025
  - Source: owner-request: project coordinator decision on the step 3 database review, 2026-11-16 (the product owner asked to proceed on the coordinator's defaults); code: supabase/migrations/20261116120000_categories_transactions_progress.sql

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
  _planned · enforced by test · F-MONEYFLOW_
  - Related: D-121, Q-015
  - Source: owner-request: product owner decisions on the open questions, 2026-11-16
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
- **R-CATEGORY-094** A budget has at most 200 categories and subcategories in force and 500 in all (void rows, kept only for their transactions, not counted); an expectation amount, per month or per year, is from 0 to CHF 10 million.
  _active · enforced by test · F-CATEGORY_
  - Related: D-148, D-153
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
- **R-CATEGORY-054** A category can be counted from an earlier period and a removed one restored, each said beforehand: counting from an earlier period is an explicit correction that changes those periods' plans and results; restoring plans it again from the current period with nothing expected in the periods between (their totals unchanged), or, as an explicit correction, as if it had never ended (the only way in an ended budget); a subcategory needs its group in force first.
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
  _planned · enforced by test · F-IMPORT_
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
- **R-TRANSACTION-050** The transaction form records an expense, a refund or an extra income (no category); its date is limited to what the database accepts (the first period's start to today, or an ended budget's last day) and today by default; its category choices are read from the database for the date and read again whenever the date changes, a failed read is shown with a retry, and a transaction being edited keeps the category it already has even when that category is no longer planned on its date (shown as such); "save and add another" keeps the kind, date and category for the next receipt.
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
- **R-TRANSACTION-110** A transaction linked to a debt or a subscription is an expense; a debt payment is in the debt's category; the debt or subscription is in force in the period of the date, except that a linked transaction keeping its period and category keeps its link.
  _active · enforced by test · F-DEBT_
  - Related: D-177
  - Source: owner-request: database developer decision for step 4, within the coordinator's brief, 2026-11-16; code: supabase/migrations/20261117100000_subscriptions_debts.sql

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
- **R-SUBSCRIPTION-071** After its first charge date, a subscription is charged once per cadence interval on the first charge's day of the month, clamped to the length of each month.
  _active · enforced by test · F-SUBSCRIPTION_
  - Why: Example: first charged on 31 January, monthly: 28 (or 29) February, 31 March, 30 April.
  - Related: D-108
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
  _active · enforced by test · F-SUBSCRIPTION_ · **TEST PENDING** (supabase/tests)
  - Related: D-109
  - Source: owner-request: product owner decisions on the open questions, 2026-11-16
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
- **R-SUBSCRIPTION-110** A budget has at most 50 subscriptions in force and 200 in all (void ones not counted); a price is 1 to 1 000 000 000 rappen; a schedule date is at most ten years ahead.
  _active · enforced by test · F-SUBSCRIPTION_
  - Why: Abuse bounds, generous for a household: with them a catch-up after years of absence stays within a few seconds.
  - Related: D-180
  - Source: owner-request: database developer decision for step 4, within the coordinator's brief, 2026-11-16; code: supabase/migrations/20261117100000_subscriptions_debts.sql
- **R-SUBSCRIPTION-111** A subscription is charged at most once per scheduled date, however many members open the budget at once or retry: a charge deleted or answered as not gone through is never created again, and no edit, correction or reopen creates a charge for a date already passed.
  _active · enforced by test · F-SUBSCRIPTION_
  - Related: D-171, D-175
  - Source: owner-request: database developer decision for step 4, within the coordinator's brief, 2026-11-16; code: supabase/migrations/20261117100000_subscriptions_debts.sql
- **R-SUBSCRIPTION-112** A subscription counts from the start of its first period: its charges due from then up to today are created when it is created (from an earlier period, as an explicit correction, too). Automatic charges count towards the transaction limit; when the budget is full they wait, none skipped, until there is room.
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
- **R-DEBT-070** A debt is tied to one category.
  _active · enforced by test · F-DEBT_
  - Related: D-112
  - Source: owner-request: product owner decisions on the open questions, 2026-11-16
- **R-DEBT-071** A debt payment is a normal transaction in the debt's category, linked to the debt.
  _active · enforced by test · F-DEBT_
  - Related: D-112, R-TRANSACTION-003
  - Source: owner-request: product owner decisions on the open questions, 2026-11-16
- **R-DEBT-072** Only money the household owes is tracked as a debt; money owed to the household is not.
  _active · enforced by review · F-DEBT_
  - Related: D-112
  - Source: owner-request: product owner decisions on the open questions, 2026-11-16
- **R-DEBT-073** When a period is created, however it comes to exist (roll-over, catch-up over several periods, an early salary), each debt in force in it that has an interest rate and a positive remaining amount gets one twelfth of its yearly rate applied to the remaining amount at that moment, rounded half up to the rappen, added to it as an interest entry of that period.
  _active · enforced by test · F-DEBT_
  - Related: D-113, Q-055, D-172
  - Source: owner-request: product owner decisions on the open questions, 2026-11-16; owner-request: project coordinator decision for step 4, 2026-11-16 (the product owner asked to proceed on the coordinator's defaults); code: supabase/migrations/20261117100000_subscriptions_debts.sql
- **R-DEBT-074** When the planned monthly payment is less than or equal to one period's interest on the remaining amount, the app says the debt never ends instead of showing an end date.
  _active · enforced by test · F-DEBT_
  - Related: D-113, Q-055, D-172
  - Source: owner-request: product owner decisions on the open questions, 2026-11-16; owner-request: project coordinator decision for step 4, 2026-11-16 (the product owner asked to proceed on the coordinator's defaults); code: supabase/migrations/20261117100000_subscriptions_debts.sql
- **R-DEBT-075** A member can adjust a debt's balance to match the bank statement: the database adds an adjustment entry for the difference, so the remaining amount becomes the balance entered.
  _active · enforced by test · F-DEBT_
  - Related: D-113
  - Source: owner-request: product owner decisions on the open questions, 2026-11-16; owner-request: project coordinator decision for step 4, 2026-11-16 (the product owner asked to proceed on the coordinator's defaults); code: supabase/migrations/20261117100000_subscriptions_debts.sql
- **R-DEBT-110** A budget has at most 50 debts in force and 200 in all (void ones not counted) and 5000 balance adjustments; a principal and a planned payment are at most 1 000 000 000 rappen, a rate 0 to 100 % with at most three decimals, and a remaining amount never grows beyond CHF 10 billion.
  _active · enforced by test · F-DEBT_
  - Why: Abuse bounds; the balance bound keeps every amount within range however long interest runs.
  - Related: D-180
  - Source: owner-request: database developer decision for step 4, within the coordinator's brief, 2026-11-16; code: supabase/migrations/20261117100000_subscriptions_debts.sql
- **R-DEBT-111** Interest is applied at most once per debt and period, however many members open the budget at once or retry, and a reopen followed by a new roll-over applies it once again.
  _active · enforced by test · F-DEBT_
  - Related: D-172
  - Source: owner-request: database developer decision for step 4, within the coordinator's brief, 2026-11-16; code: supabase/migrations/20261117100000_subscriptions_debts.sql
- **R-DEBT-112** The expected end is projected period by period: the planned payment still due in the current period first, then each later period adds its interest and receives the planned payment; beyond 600 periods (50 years) the answer is that the debt never ends.
  _active · enforced by test · F-DEBT_
  - Related: D-172, D-181
  - Source: owner-request: database developer decision for step 4, within the coordinator's brief, 2026-11-16; code: supabase/migrations/20261117100000_subscriptions_debts.sql
- **R-DEBT-113** A reopen that merges a period removes the interest that period added (and the reopen preview says so); removing a debt with history ends it and keeps its payments, interest and adjustments, and its remaining amount.
  _active · enforced by test · F-DEBT_
  - Related: D-172, D-174
  - Source: owner-request: database developer decision for step 4, within the coordinator's brief, 2026-11-16; code: supabase/migrations/20261117100000_subscriptions_debts.sql
- **R-DEBT-114** A debt's principal can be corrected only while it has no payment, interest or adjustment; afterwards its balance is adjusted instead. A correction of its terms from an earlier period never recomputes interest already added.
  _active · enforced by test · F-DEBT_
  - Related: D-178
  - Source: owner-request: database developer decision for step 4, within the coordinator's brief, 2026-11-16; code: supabase/migrations/20261117100000_subscriptions_debts.sql

### Browsing and comparing periods

- **R-COMPARE-001** Users can browse past periods and see the progress view of each.
  _active · enforced by test · F-PROGRESS_
  - Why: Built with step 3 (D-104); the id keeps its original area.
  - Related: Q-010, D-104
  - Source: domain: Period; owner-request: product owner decisions on the open questions, 2026-11-16
- **R-COMPARE-002** A chart shows the income total, the total spent and the result of each of the last 12 periods.
  _planned · enforced by test · F-COMPARE_
  - Related: D-114
  - Source: domain: Period; owner-request: product owner decisions on the open questions, 2026-11-16
- **R-COMPARE-070** A chart shows the spending per category across periods.
  _planned · enforced by test · F-COMPARE_
  - Related: D-114
  - Source: owner-request: product owner decisions on the open questions, 2026-11-16
- **R-COMPARE-071** The user can show two periods side by side.
  _planned · enforced by test · F-COMPARE_
  - Related: D-114
  - Source: owner-request: product owner decisions on the open questions, 2026-11-16

### Import

- **R-IMPORT-001** There is one import function, in the database, behind every way of importing.
  _planned · enforced by test · F-IMPORT_
  - Source: domain: Import (including by a Claude session)
- **R-IMPORT-002** The import function validates rows.
  _planned · enforced by test · F-IMPORT_
  - Source: domain: Import (including by a Claude session)
- **R-IMPORT-003** The import function skips duplicates.
  _planned · enforced by test · F-IMPORT_
  - Related: Q-009, D-115
  - Source: domain: Import (including by a Claude session)
- **R-IMPORT-004** The import function marks imported transactions "to review".
  _planned · enforced by test · F-IMPORT_
  - Source: domain: Import (including by a Claude session)
- **R-IMPORT-005** The import is reachable from a paste/CSV screen in the app.
  _planned · enforced by test · F-IMPORT_
  - Source: domain: Import (including by a Claude session)
- **R-IMPORT-006** The import is reachable from a script in this repository that a Claude Code session can run, authenticated with an import token.
  _planned · enforced by test · F-IMPORT_
  - Related: Q-013, D-116
  - Source: domain: Import (including by a Claude session); owner-request: product owner decisions on the open questions, 2026-11-16
- **R-IMPORT-007** When a member categorises an imported transaction, the app offers, in one click, to always put that merchant in that category.
  _planned · enforced by test · F-IMPORT_
  - Related: Q-014, D-117, Q-057
  - Source: domain: Import (including by a Claude session); owner-request: product owner decisions on the open questions, 2026-11-16
- **R-IMPORT-070** An imported row is a duplicate when it has the same date, amount and description as an existing transaction of the budget.
  _planned · enforced by test · F-IMPORT_
  - Related: D-115, Q-056
  - Source: owner-request: product owner decisions on the open questions, 2026-11-16
- **R-IMPORT-071** When the file gives a bank transaction id, an imported row is also a duplicate when an existing transaction of the budget has the same bank transaction id.
  _planned · enforced by test · F-IMPORT_
  - Related: D-115, Q-056
  - Source: owner-request: product owner decisions on the open questions, 2026-11-16
- **R-IMPORT-072** The import summary lists the rows skipped as duplicates.
  _planned · enforced by test · F-IMPORT_
  - Related: D-115
  - Source: owner-request: product owner decisions on the open questions, 2026-11-16
- **R-IMPORT-073** The user can import a row skipped as a duplicate anyway.
  _planned · enforced by test · F-IMPORT_
  - Related: D-115, Q-056
  - Source: owner-request: product owner decisions on the open questions, 2026-11-16
- **R-IMPORT-074** A member creates import tokens in Settings.
  _planned · enforced by test · F-IMPORT_
  - Related: D-116
  - Source: owner-request: product owner decisions on the open questions, 2026-11-16
- **R-IMPORT-075** An import token is tied to one budget and imports only into it.
  _planned · enforced by test · F-IMPORT_
  - Related: D-116
  - Source: owner-request: product owner decisions on the open questions, 2026-11-16
- **R-IMPORT-076** An import token can only add transactions through the import function; it cannot read anything.
  _planned · enforced by test · F-IMPORT_
  - Related: D-116, R-SECURITY-005
  - Source: owner-request: product owner decisions on the open questions, 2026-11-16
- **R-IMPORT-077** An import token can be revoked, after which it is refused.
  _planned · enforced by test · F-IMPORT_
  - Related: D-116
  - Source: owner-request: product owner decisions on the open questions, 2026-11-16
- **R-IMPORT-078** Merchant-to-category rules can be edited in Settings.
  _planned · enforced by test · F-IMPORT_
  - Related: D-117
  - Source: owner-request: product owner decisions on the open questions, 2026-11-16
- **R-IMPORT-079** An imported transaction whose merchant has a merchant-to-category rule is put in that rule's category.
  _planned · enforced by test · F-IMPORT_
  - Why: What "categorisation improves over time" means once rules exist.
  - Related: D-117, Q-057
  - Source: domain: Import (including by a Claude session); owner-request: product owner decisions on the open questions, 2026-11-16
- **R-IMPORT-080** An imported transaction counts in totals as soon as it is imported, before it is reviewed.
  _planned · enforced by test · F-IMPORT_
  - Related: D-118
  - Source: owner-request: product owner decisions on the open questions, 2026-11-16
- **R-IMPORT-081** An imported transaction stays "to review" until a member confirms it.
  _planned · enforced by test · F-IMPORT_
  - Related: D-118, R-IMPORT-004
  - Source: owner-request: product owner decisions on the open questions, 2026-11-16
- **R-IMPORT-082** The generic CSV import lets the user map the file's columns to the transaction fields.
  _planned · enforced by test · F-IMPORT_
  - Related: D-119, D-126
  - Source: owner-request: product owner decisions on the open questions, 2026-11-16
- **R-IMPORT-083** The import offers presets for the exports of Migros Bank, Raiffeisen, One, Yuh and Twint.
  _retired · enforced by test · F-IMPORT_
  - Retired: D-126 replaced the source list: the import reads the PDF statements of R-IMPORT-084, and Raiffeisen, One and Twint have no preset.
  - Related: D-119, Q-058, D-126
  - Source: owner-request: product owner decisions on the open questions, 2026-11-16
- **R-IMPORT-084** The import reads three kinds of PDF statement: the Migros Bank private-account statement, the Migros Bank credit-card bill (Viseca) and the Yuh account statement.
  _planned · enforced by test · F-IMPORT_
  - Related: D-126
  - Source: owner-request: product owner decision on the import sources, with sample statements, 2026-11-16; docs/import-sources.md: Import sources: statement layouts
- **R-IMPORT-085** The import recognises the kind of a statement from its content, and refuses, with an explanation, a PDF it does not recognise or one without a text layer.
  _planned · enforced by test · F-IMPORT_
  - Related: D-126, R-IMPORT-084
  - Source: owner-request: coordinator decisions on the sample statements for the import, 2026-11-16; docs/import-sources.md: Recognising the document
- **R-IMPORT-086** A statement is parsed in the browser; the PDF file is never uploaded or stored, and only the extracted transactions reach the import function.
  _planned · enforced by review · F-IMPORT_
  - Why: No test can prove that a file is never sent; review the import code for any upload of the file or its text.
  - Related: D-127
  - Source: owner-request: coordinator decisions on the sample statements for the import, 2026-11-16
- **R-IMPORT-087** Every entry of a statement's transaction table becomes exactly one candidate transaction; opening and closing balances, carried-forward lines, subtotals and totals, the previous bill total, the payment received on a card bill and card headings never do.
  _planned · enforced by test · F-IMPORT_
  - Related: R-IMPORT-084
  - Source: owner-request: coordinator decisions on the sample statements for the import, 2026-11-16; docs/import-sources.md: What is not a transaction
- **R-IMPORT-088** A parsed statement must add up to what it prints (column totals, running balances, card and bill totals); otherwise the import is refused with an explanation, and nothing is imported.
  _planned · enforced by test · F-IMPORT_
  - Why: A parser that misses or misreads a line on a layout it does not know would otherwise import wrong amounts silently.
  - Related: R-IMPORT-084, R-IMPORT-087
  - Source: owner-request: coordinator decisions on the sample statements for the import, 2026-11-16; docs/import-sources.md: What a parser must guarantee
- **R-IMPORT-089** Statement amounts (thousands separator ', two decimals, a trailing minus for a credit on the card bill) are read exactly into integer rappen, and statement dates (DD.MM.YY or DD.MM.YYYY) into calendar dates without a time zone.
  _planned · enforced by test · F-IMPORT_
  - Related: R-MONEY-002
  - Source: owner-request: coordinator decisions on the sample statements for the import, 2026-11-16; docs/import-sources.md: Numbers and dates
- **R-IMPORT-090** The date of an imported transaction is the purchase date when the statement gives one, otherwise the booking date.
  _planned · enforced by test · F-IMPORT_
  - Related: D-128
  - Source: owner-request: coordinator decisions on the sample statements for the import, 2026-11-16
- **R-IMPORT-091** A card-bill payment and a transfer between the owner's own accounts are flagged on import and skipped by default; the user can import them anyway.
  _planned · enforced by test · F-IMPORT_
  - Related: D-129, Q-063
  - Source: owner-request: coordinator decisions on the sample statements for the import, 2026-11-16; docs/import-sources.md: Recognising special entries
- **R-IMPORT-092** The import remembers what the user chose for a flagged entry and proposes the same choice for such entries the next time.
  _planned · enforced by test · F-IMPORT_
  - Related: D-129, Q-064
  - Source: owner-request: coordinator decisions on the sample statements for the import, 2026-11-16
- **R-IMPORT-093** A salary credit that matches one of the budget's incomes is skipped on import.
  _planned · enforced by test · F-IMPORT_
  - Related: D-130, Q-065
  - Source: owner-request: coordinator decisions on the sample statements for the import, 2026-11-16
- **R-IMPORT-094** Every other credit is proposed for review, as a refund in a category or as extra income.
  _planned · enforced by test · F-IMPORT_
  - Related: D-130, Q-066
  - Source: owner-request: coordinator decisions on the sample statements for the import, 2026-11-16
- **R-IMPORT-095** A securities purchase is imported as an ordinary transaction for the user to categorise.
  _planned · enforced by test · F-IMPORT_
  - Related: D-131
  - Source: owner-request: coordinator decisions on the sample statements for the import, 2026-11-16
- **R-IMPORT-096** Interest and fee lines of a statement are imported as transactions.
  _planned · enforced by test · F-IMPORT_
  - Related: D-132
  - Source: owner-request: coordinator decisions on the sample statements for the import, 2026-11-16
- **R-IMPORT-097** A foreign-currency purchase is imported with the CHF amount billed, fees included, and a description that keeps the original currency and amount.
  _planned · enforced by test · F-IMPORT_
  - Related: D-133
  - Source: owner-request: coordinator decisions on the sample statements for the import, 2026-11-16
- **R-IMPORT-098** The statement parsers read the French versions of the three statements.
  _planned · enforced by test · F-IMPORT_
  - Related: D-134, Q-061
  - Source: owner-request: coordinator decisions on the sample statements for the import, 2026-11-16
- **R-IMPORT-099** The statement fixtures in the repository contain no real data: they are anonymised outside the repository and pass a leak check against the real statement before they enter the working tree.
  _planned · enforced by review · F-IMPORT_
  - Why: The leak check needs the real statement, which must never enter the repository, so it cannot run in CI.
  - Related: R-IMPORT-100
  - Source: owner-request: coordinator decisions on the sample statements for the import, 2026-11-16
- **R-IMPORT-100** Each statement parser produces exactly the expected result of every anonymised fixture of its source (test-fixtures/statements).
  _planned · enforced by test · F-IMPORT_
  - Related: R-IMPORT-084, R-IMPORT-099
  - Source: owner-request: coordinator decisions on the sample statements for the import, 2026-11-16
- **R-IMPORT-101** A TWINT transaction id or a Yuh reference is kept as the bank transaction id of the imported transaction; a QR payment reference is not, because it repeats from one payment to the next.
  _planned · enforced by test · F-IMPORT_
  - Why: The QR reference of a card-bill payment is built from the card account number, so every monthly payment of that card has the same reference.
  - Related: R-IMPORT-071, D-115
  - Source: owner-request: coordinator decisions on the sample statements for the import, 2026-11-16; docs/import-sources.md: Recognising special entries
- **R-IMPORT-102** The review of an imported statement shows, for each transaction, the extra data the statement gives: purchase time, value date, card, original currency and amount, exchange rate, fee, merchant category and security.
  _planned · enforced by test · F-IMPORT_
  - Related: R-IMPORT-004
  - Source: owner-request: coordinator decisions on the sample statements for the import, 2026-11-16

### Accounts and planned transfers (money flow)

- **R-ACCOUNT-001** The user defines accounts (salary account, savings, third pillar, tax reserve, possibly at different banks).
  _planned · enforced by test · F-MONEYFLOW_
  - Source: domain: Account and planned transfer (money flow)
- **R-ACCOUNT-002** The user defines planned transfers between accounts, such as "payday + 2 days: 1000 CHF from A to Savings" or "on the 1st: 200 CHF from A to the tax reserve".
  _planned · enforced by test · F-MONEYFLOW_
  - Related: Q-008, Q-015, D-120, D-121
  - Source: domain: Account and planned transfer (money flow); owner-request: product owner decisions on the open questions, 2026-11-16
- **R-ACCOUNT-003** Each planned transfer is flagged automatic or manual.
  _planned · enforced by test · F-MONEYFLOW_
  - Source: domain: Account and planned transfer (money flow)
- **R-ACCOUNT-004** An automatic transfer (standing order) is assumed done.
  _planned · enforced by test · F-MONEYFLOW_
  - Source: domain: Account and planned transfer (money flow)
- **R-ACCOUNT-005** Manual transfers are shown as a per-period checklist.
  _planned · enforced by test · F-MONEYFLOW_
  - Source: domain: Account and planned transfer (money flow)
- **R-ACCOUNT-006** The money flow diagram is drawn from the plan of transfers.
  _planned · enforced by test · F-MONEYFLOW_
  - Source: domain: Account and planned transfer (money flow)
- **R-ACCOUNT-007** The app has no bank connection and does not depend on detecting automatic transactions.
  _planned · enforced by review · F-MONEYFLOW_
  - Related: D-040
  - Source: domain: Account and planned transfer (money flow)
- **R-ACCOUNT-070** A planned transfer is scheduled either as an offset in days from the actual pay date of a chosen income, or on a fixed day of the month.
  _planned · enforced by test · F-MONEYFLOW_
  - Related: D-120, Q-059
  - Source: owner-request: product owner decisions on the open questions, 2026-11-16
- **R-ACCOUNT-071** A planned transfer scheduled from a pay date refers to the primary income unless the user chooses another income.
  _planned · enforced by test · F-MONEYFLOW_
  - Related: D-120, Q-059
  - Source: owner-request: product owner decisions on the open questions, 2026-11-16
- **R-ACCOUNT-072** A planned transfer can be linked to a category.
  _planned · enforced by test · F-MONEYFLOW_
  - Why: Examples: savings, third pillar, taxes.
  - Related: D-122
  - Source: owner-request: product owner decisions on the open questions, 2026-11-16
- **R-ACCOUNT-073** Marking a manual transfer linked to a category as done creates its transaction in that category.
  _planned · enforced by test · F-MONEYFLOW_
  - Related: D-122, Q-060
  - Source: owner-request: product owner decisions on the open questions, 2026-11-16
- **R-ACCOUNT-074** An automatic transfer linked to a category creates its transaction in that category.
  _planned · enforced by test · F-MONEYFLOW_
  - Related: D-122, Q-060
  - Source: owner-request: product owner decisions on the open questions, 2026-11-16
- **R-ACCOUNT-075** Account balances are not tracked: the money flow diagram shows flows only.
  _planned · enforced by review · F-MONEYFLOW_
  - Related: D-123
  - Source: owner-request: product owner decisions on the open questions, 2026-11-16

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
- **R-CONCURRENCY-091** An edit form or removal confirmation reads its record by id, never from a list, and saves over the version it opened. When another member changes a field it shows (the save is refused, or a later read shows it), it says so with their values field by field: with nothing typed it takes their version; with something typed it keeps what was typed and lets the user load their version or keep theirs, and keeping theirs saves only the fields they edited. A change to fields it does not show (the user's own save in another form, another member's change elsewhere) is taken silently. A record deleted meanwhile is said to be gone and cannot be saved.
  _active · enforced by test · F-CATEGORY_
  - Related: R-CONCURRENCY-070, D-142, D-136
  - Source: owner-request: project coordinator brief for the step 3 database, 2026-11-16; code: src/hooks/use-edit-base.ts; owner-request: coordinator, step 3 screens review fixes, 2026-11-16
- **R-CONCURRENCY-100** A boundary operation names the period the client saw (its id and revision) and is refused with record_changed when that period changed or is gone, so a second click, a retry or another member's concurrent action never applies the operation twice.
  _active · enforced by test · F-CATEGORY_
  - Related: D-151, R-CONCURRENCY-070, R-PERIOD-023, R-PERIOD-034
  - Source: owner-request: coordinator, step 3 database review, 2026-11-16; code: supabase/migrations/20261116120000_categories_transactions_progress.sql

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

### D-172 Interest at period creation; the projection and "never" (accepted)

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

Related: D-172, R-DEBT-005, R-DEBT-112

Source: owner-request: database developer decision for step 4, within the coordinator's brief, 2026-11-16; code: supabase/migrations/20261117100000_subscriptions_debts.sql

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
- **Q-056** Are identical rows within the same file duplicates of each other, are refunds and manually entered transactions compared too, and is "import anyway" chosen per row or for all skipped rows?
  - Context: D-115 compares an imported row with existing transactions. Two identical purchases on one day (two coffees) appear as two identical rows in one export; the answer does not say whether the second is skipped.
  - Related: D-115, R-IMPORT-070, R-IMPORT-071, R-IMPORT-073
  - Source: owner-request: product owner decisions on the open questions, 2026-11-16
- **Q-057** What identifies a merchant for a merchant-to-category rule: the whole description, a part of it, or a field of the bank export?
  - Context: D-117 offers "always put this merchant in this category?". Bank descriptions often carry a date, a card number or a location around the merchant name, so an exact match on the description would rarely match again. The sample statements show that the bank cuts merchant names at 24 characters, that one merchant can be printed in different capitals or with different processor prefixes, and that chains add a branch number (docs/import-sources.md). The card bill adds a merchant category line.
  - Related: D-117, R-IMPORT-007, R-IMPORT-079, R-IMPORT-084
  - Source: owner-request: product owner decisions on the open questions, 2026-11-16
- **Q-058** (resolved by D-126) Which product is "One", what export formats do Migros Bank, Raiffeisen, One, Yuh and Twint actually offer, and can the product owner provide sample export files?
  - Context: D-119 asks for presets for these five sources. "One" may be Viseca's "one" credit-card portal; that is unconfirmed. Twint may offer no export at all. Sample export files are needed before the presets can be built.
  - Related: D-119, R-IMPORT-083, D-126
  - Source: owner-request: product owner decisions on the open questions, 2026-11-16
- **Q-059** For a planned transfer on a fixed day of the month, is the day clamped to the month's length and does a weekend rule apply; may a pay-date offset be negative; and what happens to a transfer whose chosen income ends?
  - Context: D-120 allows an offset in days from a chosen income's actual pay date, or a fixed day of the month. Subscriptions clamp and use no weekend rule (D-108), but nothing says the same for transfers. An income ends when it is removed or its member leaves (R-MEMBER-007).
  - Related: D-120, R-ACCOUNT-070, R-ACCOUNT-071, R-MEMBER-007
  - Source: owner-request: product owner decisions on the open questions, 2026-11-16
- **Q-060** On which date is the transaction of an automatic transfer linked to a category created, does it wait for confirmation like a subscription charge, and does unmarking a manual transfer as done remove its transaction?
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
- **Q-063** How is a transfer to another member of the household treated, for example a standing order to a partner at the same address: an expense, a transfer between the household's accounts, or something else?
  - Context: The Migros Bank statement shows no IBAN for a payee, so the import recognises an own transfer only by the holder's name and address (D-129). A standing order to another person at the same address looks like any other payment.
  - Related: D-129, R-IMPORT-091
  - Source: owner-request: coordinator decisions on the sample statements for the import, 2026-11-16
- **Q-064** What exactly is remembered when the user imports or skips a flagged entry: the choice per kind of entry, per counterparty or per account, and for the whole budget or for the member only?
  - Context: D-129 says the choice is remembered and proposed next time, without saying for what.
  - Related: D-129, R-IMPORT-092
  - Source: owner-request: coordinator decisions on the sample statements for the import, 2026-11-16
- **Q-065** When does a salary credit match one of the budget's incomes: same amount, same payer, a date near the expected pay date, or a combination; and what happens when the amount differs from the planned income?
  - Context: D-130 skips a salary credit that matches an income. The Migros Bank statement marks it "Paiement de salaire" with the employer's name, but gives no reference to the income.
  - Related: D-130, R-IMPORT-093
  - Source: owner-request: coordinator decisions on the sample statements for the import, 2026-11-16
- **Q-066** When a credit is reviewed as a refund, in which period and category does it count, and can it reduce a category below zero?
  - Context: D-130 proposes other credits as a refund in a category or as extra income. TWINT money received from a person is often a share of a bill paid earlier, possibly in another period.
  - Related: D-130, R-IMPORT-094
  - Source: owner-request: coordinator decisions on the sample statements for the import, 2026-11-16
- **Q-067** Should regular investment purchases (a savings plan) count as spending in the period, or as savings that the money flow of step 7 shows as a transfer?
  - Context: D-131 imports them as ordinary transactions until accounts exist. On the Yuh statement a purchase is a debit like any other, with the security, quantity, price and fees on its continuation lines.
  - Related: D-131, R-IMPORT-095
  - Source: owner-request: coordinator decisions on the sample statements for the import, 2026-11-16
- **Q-068** How is an imported card or bank line reconciled with a transaction already in the budget for the same charge, such as an automatic subscription charge or a manually entered expense?
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
- **Q-090** Should add_transaction take a client-generated id, so that a double-submitted or retried save records the transaction once?
  - Context: The boundary operations name the period they act on (D-151), so a retry is refused; an add has no record to name yet. The review recorded a double-submitted add_transaction as two rows. The screens disable the button while saving, but a retry after a lost response would still record twice.
  - Related: D-151, R-CONCURRENCY-100, R-TRANSACTION-095
  - Source: owner-request: coordinator, step 3 database review, 2026-11-16
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
