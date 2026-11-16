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

210 rules (164 active, 42 planned), 24 conventions, 72 decisions, 16 open questions. 0 rules and conventions are marked **TEST PENDING**.

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
  Rules: R-BUDGET-005, R-BUDGET-006, R-BUDGET-007, R-BUDGET-008, R-BUDGET-013, R-MEMBER-003
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
  Rules: R-VERSION-001, R-VERSION-005, R-VERSION-006, R-INCOME-051, R-INCOME-052
- **US-INCOME-003** As a budget member, I want to make another income the primary one, so that periods follow the salary that really sets our rhythm.
  Rules: R-INCOME-006, R-INCOME-007, R-INCOME-008, R-INCOME-053
- **US-INCOME-004** As a budget member, I want to remove an income, so that it stops counting without rewriting past periods.
  Rules: R-INCOME-001, R-INCOME-009, R-INCOME-012, R-INCOME-051

#### F-PERIOD Periods (in-progress)

Pay-day-to-pay-day periods, created on demand, with manual boundaries.

- **US-PERIOD-001** As a budget member, I want periods to run from pay day to pay day of the primary income, so that the salary is always day one of the period.
  Rules: R-PERIOD-001, R-PERIOD-002, R-PERIOD-003, R-PERIOD-004, R-PERIOD-005, R-PERIOD-006, R-PERIOD-008, R-PERIOD-009, R-PERIOD-010, R-PERIOD-017, R-PERIOD-018, R-PERIOD-050, R-PERIOD-052
- **US-PERIOD-002** As a budget member, I want to move a period boundary when the salary arrived on another day, so that public holidays do not put transactions in the wrong period.
  Rules: R-PERIOD-012, R-PERIOD-013, R-PERIOD-014, R-PERIOD-020, R-PERIOD-051
- **US-PERIOD-003** As a budget member, I want past periods to stay as they were when the primary income's terms change, so that history does not shift under me.
  Rules: R-PERIOD-007, R-PERIOD-011, R-VERSION-007, R-VERSION-008

### Step 3: Categories, transactions, period progress view (planned)

#### F-CATEGORY Categories and expectations (planned)

Two-level categories with monthly or yearly expectations, and the amount left to assign.

- **US-CATEGORY-001** As a budget member, I want to split the budget into categories and subcategories with a monthly expectation each, so that I know how much I plan to spend on what.
  Rules: R-CATEGORY-001, R-CATEGORY-002, R-VERSION-002
- **US-CATEGORY-002** As a budget member, I want to enter a yearly amount for a yearly cost, so that it is spread as one twelfth per month.
  Rules: R-CATEGORY-003, R-CATEGORY-004, R-CATEGORY-005
- **US-CATEGORY-003** As a budget member, I want to see the amount left to assign, so that every franc of the budget has a purpose.
  Rules: R-CATEGORY-006

#### F-TRANSACTION Transactions (planned)

Manual transactions, landing in the period that contains their date.

- **US-TRANSACTION-001** As a budget member, I want to record a transaction with an amount, a date and a category, so that spending is tracked against the budget.
  Rules: R-TRANSACTION-001, R-TRANSACTION-002, R-TRANSACTION-003, R-TRANSACTION-004, R-TRANSACTION-006
- **US-TRANSACTION-002** As a budget member, I want to enter or correct a transaction in a past period, so that late receipts still land in the right period.
  Rules: R-TRANSACTION-007, R-TRANSACTION-008

#### F-PROGRESS Period progress view (planned)

Each period tracked against its expectations, with its result.

- **US-PROGRESS-001** As a budget member, I want to see how the current period is going against the expectations, so that I can adjust before the period ends.
  Rules: R-PROGRESS-001
- **US-PROGRESS-002** As a budget member, I want to see a period's surplus or deficit, so that I know how the period went.
  Rules: R-PROGRESS-002

### Step 4: Subscriptions and debts (planned)

#### F-SUBSCRIPTION Subscriptions (planned)

Recurring charges and their next charge date.

- **US-SUBSCRIPTION-001** As a budget member, I want to track subscriptions and see when each will next be charged, so that recurring costs do not surprise me.
  Rules: R-SUBSCRIPTION-001, R-SUBSCRIPTION-002, R-VERSION-003

#### F-DEBT Debts (planned)

Debts with planned payments, their evolution and expected end date.

- **US-DEBT-001** As a budget member, I want to record a debt with its principal, interest rate and planned monthly payment, so that I can follow it down to zero.
  Rules: R-DEBT-001, R-DEBT-002, R-VERSION-004
- **US-DEBT-002** As a budget member, I want payments assigned to a debt to reduce what remains, and to see its evolution and expected end date, so that I know when it will be paid off.
  Rules: R-DEBT-003, R-DEBT-004, R-DEBT-005

### Step 5: Period comparison charts (planned)

#### F-COMPARE Period comparison (planned)

Browsing past periods and comparing them in charts.

- **US-COMPARE-001** As a budget member, I want to browse past periods and compare them, for example over a year, so that I see how our spending evolves.
  Rules: R-COMPARE-001, R-COMPARE-002

### Step 6: Import (CSV and Claude) (planned)

#### F-IMPORT Import (planned)

Bulk import of transactions from CSV or by a Claude session, through one database function.

- **US-IMPORT-001** As a budget member, I want to paste or upload a CSV of transactions, so that I do not type them one by one.
  Rules: R-IMPORT-001, R-IMPORT-002, R-IMPORT-003, R-IMPORT-004, R-IMPORT-005, R-TRANSACTION-005
- **US-IMPORT-002** As a Claude session, I want to import transactions by running the import script of this repository, so that a member can delegate the import without giving Claude raw database access.
  Rules: R-IMPORT-001, R-IMPORT-006, R-SECURITY-005
- **US-IMPORT-003** As a budget member, I want imported transactions to be marked to review and categorised from saved merchant rules, so that I check them quickly and categorisation improves over time.
  Rules: R-IMPORT-004, R-IMPORT-007

### Step 7: Accounts and the money flow diagram (planned)

#### F-MONEYFLOW Accounts and money flow (planned)

Accounts, planned transfers after payday, a per-period checklist and the money flow diagram.

- **US-MONEYFLOW-001** As a budget member, I want to define my accounts and the transfers planned between them after payday, so that the money goes where it should every period.
  Rules: R-ACCOUNT-001, R-ACCOUNT-002, R-ACCOUNT-003, R-ACCOUNT-004
- **US-MONEYFLOW-002** As a budget member, I want a per-period checklist of the manual transfers, so that I do not forget one.
  Rules: R-ACCOUNT-005
- **US-MONEYFLOW-003** As a budget member, I want a diagram of the planned flow of money, so that I see the whole plan at a glance.
  Rules: R-ACCOUNT-006, R-ACCOUNT-007

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
- **R-INCOME-051** Changing or removing an income from an earlier period is offered only as an explicit option, off by default, with a warning that past periods' totals change.
  _active · enforced by test · F-INCOME_
  - Related: R-VERSION-010, R-INCOME-015, D-065
  - Source: code: src/features/income/components/income-form-dialog.tsx; code: src/features/income/components/remove-income-dialog.tsx
- **R-INCOME-052** Before new terms of the primary income are saved, the form says what they do to the current period: that it closes at once (the next month's pay date under the new terms has already come), the day it now ends, or, when its end was set by hand, the 14-day rule that decides; Save waits until this is known, and the form says so when it cannot be checked.
  _active · enforced by test · F-INCOME_
  - Related: R-PERIOD-026, R-VERSION-008
  - Source: code: src/features/income/components/income-form-dialog.tsx
- **R-INCOME-053** Making another income primary is confirmed first, with what it does to the current period (it may close at once) and how to undo that.
  _active · enforced by test · F-INCOME_
  - Related: R-INCOME-052, R-INCOME-008, R-PERIOD-026
  - Source: code: src/features/income/components/make-primary-dialog.tsx
- **R-INCOME-017** Only an income in force in the current period can become the primary income.
  _active · enforced by test · F-INCOME_
  - Related: R-INCOME-008
  - Source: owner-request: coordinator decision on the second step 2 database review, 2026-11-16; docs/database.md: RPCs

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
- **R-PERIOD-018** A period's income total is the sum of the incomes in force in that period, each at the version in force for that period.
  _active · enforced by test · F-PERIOD_
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
  - Related: D-062, D-082
  - Source: owner-request: coordinator decisions on the step 2 database review, 2026-11-15; docs/database.md: RPCs
- **R-PERIOD-024** A boundary that is not the one before the latest period cannot move to today or later.
  _retired · enforced by review · F-PERIOD_
  - Why: With the 14-day rule (R-PERIOD-020) no such move can be requested; the database still refuses it (boundary_after_today) as a defence.
  - Retired: The boundary operations of D-082 replace the position-dependent move; no operation can move an earlier boundary to after today (R-PERIOD-012, R-PERIOD-022).
  - Related: D-062, D-082
  - Source: owner-request: coordinator decisions on the step 2 database review, 2026-11-15; docs/database.md: RPCs
- **R-PERIOD-025** Every boundary operation has an inverse: an expected pay date is reset to the projection, an early close is undone by reopening the previous period (and the reverse), and a moved boundary is moved back.
  _active · enforced by test · F-PERIOD_
  - Related: D-063, D-082
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
- **R-PERIOD-051** The periods page offers boundary changes as what happened to a salary (it arrived on another day, it has not arrived yet, the next one arrived early), shows the resulting dates before saving, and offers a reset to the schedule for every boundary set by hand.
  _active · enforced by test · F-PERIOD_
  - Related: R-PERIOD-023, R-PERIOD-025, D-063
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

### Versioning: edits never rewrite the past

- **R-VERSION-001** An edit to an income's terms creates a new version effective from the current period.
  _active · enforced by test · F-INCOME_
  - Source: domain: Versioning: edits never rewrite the past
- **R-VERSION-002** An edit to a category expectation creates a new version effective from the current period.
  _planned · enforced by test · F-CATEGORY_
  - Source: domain: Versioning: edits never rewrite the past
- **R-VERSION-003** An edit to a subscription creates a new version effective from the current period.
  _planned · enforced by test · F-SUBSCRIPTION_
  - Source: domain: Versioning: edits never rewrite the past
- **R-VERSION-004** An edit to a debt's terms creates a new version effective from the current period.
  _planned · enforced by test · F-DEBT_
  - Source: domain: Versioning: edits never rewrite the past
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

### Categories and subcategories

- **R-CATEGORY-001** Categories have two levels at most: a category and optional subcategories.
  _planned · enforced by test · F-CATEGORY_
  - Why: Example: insurance -> insurance/car, insurance/health, insurance/home.
  - Source: domain: Category and subcategory
- **R-CATEGORY-002** The monthly expectation is set on each subcategory, or on the category itself when it has no subcategories.
  _planned · enforced by test · F-CATEGORY_
  - Source: domain: Category and subcategory
- **R-CATEGORY-003** An expectation amount is entered per month or per year.
  _planned · enforced by test · F-CATEGORY_
  - Source: domain: Category and subcategory
- **R-CATEGORY-004** Yearly amounts are stored as yearly.
  _planned · enforced by test · F-CATEGORY_
  - Source: domain: Category and subcategory
- **R-CATEGORY-005** Yearly amounts are shown as one twelfth per month.
  _planned · enforced by test · F-CATEGORY_
  - Related: Q-002
  - Source: domain: Category and subcategory
- **R-CATEGORY-006** Budget total minus the sum of expectations is the amount left to assign.
  _planned · enforced by test · F-CATEGORY_
  - Related: Q-003
  - Source: domain: Category and subcategory

### Transactions

- **R-TRANSACTION-001** A transaction has an amount, a date, and a category or subcategory.
  _planned · enforced by test · F-TRANSACTION_
  - Related: Q-004
  - Source: domain: Transaction
- **R-TRANSACTION-002** A transaction has an optional description.
  _planned · enforced by test · F-TRANSACTION_
  - Source: domain: Transaction
- **R-TRANSACTION-003** A transaction has an optional link to a debt or a subscription.
  _planned · enforced by test · F-TRANSACTION_
  - Related: Q-005
  - Source: domain: Transaction
- **R-TRANSACTION-004** Transactions are created manually in the UI.
  _planned · enforced by test · F-TRANSACTION_
  - Source: domain: Transaction
- **R-TRANSACTION-005** Transactions are also importable in bulk.
  _planned · enforced by test · F-IMPORT_
  - Source: domain: Transaction
- **R-TRANSACTION-006** A transaction belongs to the period whose date range contains its date.
  _planned · enforced by test · F-TRANSACTION_
  - Source: domain: Period
- **R-TRANSACTION-007** A back-dated transaction lands in the right past period.
  _planned · enforced by test · F-TRANSACTION_
  - Source: domain: Period
- **R-TRANSACTION-008** Past periods stay editable.
  _planned · enforced by test · F-TRANSACTION_
  - Related: Q-011
  - Source: domain: Period

### Period progress and result

- **R-PROGRESS-001** At the end of a period, category balances reset.
  _planned · enforced by test · F-PROGRESS_
  - Related: D-039
  - Source: domain: Period
- **R-PROGRESS-002** The period's surplus or deficit is shown as its result.
  _planned · enforced by test · F-PROGRESS_
  - Related: Q-012
  - Source: domain: Period

### Subscriptions

- **R-SUBSCRIPTION-001** A subscription has a price, a pay date, a cadence, and a category.
  _planned · enforced by test · F-SUBSCRIPTION_
  - Related: Q-006
  - Source: domain: Subscription
- **R-SUBSCRIPTION-002** The app shows when the next charge of a subscription will occur.
  _planned · enforced by test · F-SUBSCRIPTION_
  - Source: domain: Subscription

### Debts

- **R-DEBT-001** Debts can be created, updated and deleted.
  _planned · enforced by test · F-DEBT_
  - Source: domain: Debt
- **R-DEBT-002** A debt has a principal, an optional interest rate, and a planned monthly payment.
  _planned · enforced by test · F-DEBT_
  - Source: domain: Debt
- **R-DEBT-003** A transaction assigned to a debt reduces its remaining amount.
  _planned · enforced by test · F-DEBT_
  - Related: Q-007
  - Source: domain: Debt
- **R-DEBT-004** The app shows the evolution of a debt.
  _planned · enforced by test · F-DEBT_
  - Source: domain: Debt
- **R-DEBT-005** The app shows the expected end date of a debt.
  _planned · enforced by test · F-DEBT_
  - Related: Q-007
  - Source: domain: Debt

### Browsing and comparing periods

- **R-COMPARE-001** Users can browse past periods.
  _planned · enforced by test · F-COMPARE_
  - Related: Q-010
  - Source: domain: Period
- **R-COMPARE-002** Users can compare periods, for example in a yearly chart.
  _planned · enforced by test · F-COMPARE_
  - Source: domain: Period

### Import

- **R-IMPORT-001** There is one import function, in the database, behind every way of importing.
  _planned · enforced by test · F-IMPORT_
  - Source: domain: Import (including by a Claude session)
- **R-IMPORT-002** The import function validates rows.
  _planned · enforced by test · F-IMPORT_
  - Source: domain: Import (including by a Claude session)
- **R-IMPORT-003** The import function skips duplicates.
  _planned · enforced by test · F-IMPORT_
  - Related: Q-009
  - Source: domain: Import (including by a Claude session)
- **R-IMPORT-004** The import function marks imported transactions "to review".
  _planned · enforced by test · F-IMPORT_
  - Source: domain: Import (including by a Claude session)
- **R-IMPORT-005** The import is reachable from a paste/CSV screen in the app.
  _planned · enforced by test · F-IMPORT_
  - Source: domain: Import (including by a Claude session)
- **R-IMPORT-006** The import is reachable from a script in this repository that a Claude Code session can run.
  _planned · enforced by test · F-IMPORT_
  - Related: Q-013
  - Source: domain: Import (including by a Claude session)
- **R-IMPORT-007** Merchant-to-category rules are saved so categorisation improves over time.
  _planned · enforced by test · F-IMPORT_
  - Related: Q-014
  - Source: domain: Import (including by a Claude session)

### Accounts and planned transfers (money flow)

- **R-ACCOUNT-001** The user defines accounts (salary account, savings, third pillar, tax reserve, possibly at different banks).
  _planned · enforced by test · F-MONEYFLOW_
  - Source: domain: Account and planned transfer (money flow)
- **R-ACCOUNT-002** The user defines planned transfers between accounts, such as "payday + 2 days: 1000 CHF from A to Savings".
  _planned · enforced by test · F-MONEYFLOW_
  - Related: Q-008, Q-015
  - Source: domain: Account and planned transfer (money flow)
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

A period runs from one salary to the day before the next. Stored periods are facts: only the boundary operations move a stored boundary. The schedule (the primary income's pay day and weekend rule) only predicts the next pay date. Structural invariants only, none depending on terms: contiguous, non-overlapping, none starting after today or after the budget's end date, each 7 to 92 days long.

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

### D-083 Merging the latest period re-keys what was keyed to it (accepted)

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

## Open questions

- **Q-001** (resolved by D-045) May a member add, edit or remove an income that belongs to another member?
  - Context: The source says "Each member adds their own incomes (person A adds income A, person B adds income B)" and also "every member can read and edit everything in the budget". The step 2 code lets any member add an income for another member (add_income p_user_id) and change any income's terms.
  - Related: R-INCOME-002, R-MEMBER-001
  - Source: domain: Income; domain: Budget; docs/database.md: RPCs
- **Q-002** How is one twelfth of a yearly amount rounded to whole rappen, and must twelve monthly shares add up to the yearly amount exactly?
  - Context: Yearly amounts are stored as yearly and shown as one twelfth per month; amounts are integer rappen, so most yearly amounts do not divide by twelve.
  - Related: R-CATEGORY-005, R-MONEY-002
  - Source: domain: Category and subcategory; domain: Money
- **Q-003** Which "budget total" does the amount left to assign use: the monthly total of the incomes in force now, or the income total of a given period?
  - Context: The source defines the amount left to assign as "budget total minus the sum of expectations" and the budget as starting "from the monthly total of its incomes"; incomes are versioned per period.
  - Related: R-CATEGORY-006, R-PERIOD-018
  - Source: domain: Category and subcategory; domain: Period
- **Q-004** What does the sign of a transaction amount mean (spending, refund, extra income), and may a transaction be put on a category that has subcategories?
  - Context: A transaction "has an amount, a date, and a category or subcategory"; nothing says how refunds or money coming in are recorded, nor whether a parent category with subcategories can hold transactions directly.
  - Related: R-TRANSACTION-001
  - Source: domain: Transaction
- **Q-005** Can a transaction be linked to both a debt and a subscription, or to at most one of them?
  - Context: The source says "optional link to a debt or a subscription".
  - Related: R-TRANSACTION-003
  - Source: domain: Transaction
- **Q-006** Which cadences does a subscription support, what is its "pay date" (a date or a day of the month), and does the weekend rule apply to it?
  - Context: A subscription "has a price, a pay date, a cadence, and a category"; nothing more is said.
  - Related: R-SUBSCRIPTION-001, R-SUBSCRIPTION-002
  - Source: domain: Subscription
- **Q-007** How does the interest rate affect a debt's remaining amount and expected end date, and is the remaining amount the principal minus the transactions assigned to it?
  - Context: A debt has "a principal, an optional interest rate, and a planned monthly payment"; "a transaction assigned to a debt reduces the remaining amount".
  - Related: R-DEBT-003, R-DEBT-005
  - Source: domain: Debt
- **Q-008** Which payday does a planned transfer refer to ("payday + 2 days"): the actual pay date of the primary income (period start), or of a chosen income?
  - Context: Example from the source: "payday + 2 days: 1000 CHF from A to Savings". A budget can have several incomes with different pay days.
  - Related: R-ACCOUNT-002
  - Source: domain: Account and planned transfer (money flow)
- **Q-009** What makes an imported row a duplicate (same date, amount and description; an import id; something else)?
  - Context: The import function "skips duplicates"; nothing defines a duplicate.
  - Related: R-IMPORT-003
  - Source: domain: Import (including by a Claude session)
- **Q-010** Is browsing past periods part of step 3 (period progress view) or step 5 (period comparison charts)?
  - Context: The source lists "Users can browse past periods and compare them (for example a yearly chart)" in one sentence; the build order names a "period progress view" in step 3 and "period comparison charts" in step 5. This spec puts both under step 5 for now.
  - Related: R-COMPARE-001
  - Source: domain: Period; domain: Build order
- **Q-011** What exactly stays editable in a past period: its transactions only, or also its boundaries and other data?
  - Context: "Past periods stay editable" comes right after back-dated transactions, while versioning says edits to incomes, expectations, subscriptions and debts never rewrite the past. The step 2 code already lets members move the boundaries of past periods.
  - Related: R-TRANSACTION-008, R-PERIOD-012
  - Source: domain: Period; domain: Versioning: edits never rewrite the past
- **Q-012** What is a period's surplus or deficit measured against: its income total, or the sum of its expectations?
  - Context: "At the end of a period, category balances reset. The period's surplus or deficit is shown as its result."
  - Related: R-PROGRESS-001, R-PROGRESS-002
  - Source: domain: Period
- **Q-013** How does the import script a Claude session runs authenticate, given that Claude does not get raw database access to real data?
  - Context: The import is reachable "from a script in this repo that a Claude Code session can run", and "Claude does not get raw database access to real data". The likely reading is that it calls the import function as a signed-in member, but the source does not say.
  - Related: R-IMPORT-006, R-SECURITY-005
  - Source: domain: Import (including by a Claude session)
- **Q-014** How are merchant-to-category rules created: automatically when a user categorises an imported transaction, or explicitly by the user?
  - Context: "Merchant-to-category rules are saved so categorisation improves over time."
  - Related: R-IMPORT-007
  - Source: domain: Import (including by a Claude session)
- **Q-015** Are planned transfers versioned like incomes (edits effective from the current period)?
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
- **Q-030** What should happen to a budget and its incomes when a member's or the owner's account is deleted?
  - Context: No client path deletes accounts yet. Today, deleting the owner's account deletes their budgets for every member (R-BUDGET-016), and deleting a member's account keeps their incomes with a null owner without the member rules: an income that is primary stays active and primary (review finding 8). Settle before any account-deletion feature.
  - Related: R-BUDGET-016, R-MEMBER-007, R-MEMBER-009
  - Source: owner-request: coordinator decisions on the step 2 database review, 2026-11-15
- **Q-018** When two members edit the same income at the same time, should the second save be refused (for example with a version check) instead of silently overwriting the first?
  - Context: Today the last write wins without a warning: update_income_terms and the rename both replace what is there. Every member can edit every income (D-045), so two members of a household can edit the same salary from two browsers.
  - Related: D-045, R-VERSION-006
  - Source: owner-request: step 2 frontend review, finding 11

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
- **Amount left to assign**: Budget total minus the sum of expectations.
- **Category balance**: What is left of a category within a period. Reset at the end of each period.
- **Period result**: The surplus or deficit of a period.
- **Transaction** (French UI: _Transactions_): An amount on a date, in a category or subcategory, with an optional description and an optional link to a debt or a subscription.
- **Subscription** (French UI: _Abonnements_): A recurring charge with a price, a pay date, a cadence and a category.
- **Next charge** (French UI: _prochain prélèvement_): When a subscription will next be charged.
- **Debt** (French UI: _Dettes_): Money owed, with a principal, an optional interest rate and a planned monthly payment.
- **Remaining amount**: What is still owed on a debt; transactions assigned to the debt reduce it.
- **Account** (French UI: _comptes_): A place money is kept (salary account, savings, third pillar, tax reserve), possibly at different banks.
- **Planned transfer**: A planned movement of money between two accounts relative to payday, such as "payday + 2 days: 1000 CHF from A to Savings". Flagged automatic or manual.
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
