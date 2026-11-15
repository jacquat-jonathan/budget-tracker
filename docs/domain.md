# Domain model and product decisions

This is the source of truth for what the app does. It records the product owner's
requirements and the decisions taken on top of them. Update it when a decision changes.

## Product in one paragraph

A personal / household budget tracker. A budget starts from the monthly total of its
incomes, is split into categories and subcategories with a monthly expectation each, and
is tracked period by period against the transactions the user records. It also tracks
subscriptions, debts, and the planned flow of money between accounts. CHF only. UI in
English and French.

## Entities

### Budget (the container)

- Everything else (incomes, categories, subscriptions, debts, transactions, periods,
  accounts) belongs to exactly one budget.
- A budget has members. The creator is the owner and is assigned by default; more people
  can be added. A user can belong to several budgets.
- A budget runs indefinitely or until an end date. It is always the monthly budget; an end
  date just stops period generation, and it falls on a period boundary.
- Budgets can be created, modified and deleted.
- Roles: every member can read and edit everything in the budget. Only the owner can
  delete the budget, change its end date, or manage members and invitations. A member can
  leave; the owner cannot leave (they delete the budget instead).
- Adding people: the owner invites by email address. The app sends no email. The invited
  person sees the invitation after signing in with an account whose verified email matches,
  and accepts or declines it. Inviting never reveals whether an address has an account.
- Removing a member (or a member leaving) ends their incomes from the current period;
  past periods keep them. A member whose income is the primary income cannot be removed
  until another income is made primary.
- Creating a budget is one atomic step that also creates its first income (the primary)
  and its first period, so a budget never exists without them.

### Income

- A budget must have at least one income. Each member adds their own incomes (person A
  adds income A, person B adds income B); all incomes of the budget sum into the budget's
  monthly total.
- An income has an amount and a nominal pay day of the month (for example the 25th).
- Weekend rule, per income, default: if the nominal day is a Saturday the income is paid
  the Friday before; if it is a Sunday it is paid the Monday after. A period's actual pay
  date can be overridden manually (public holidays).
- Exactly one income of the budget is the primary income. It defines the periods. The
  primary can be switched to another income; the last income of a budget cannot be removed.
- Incomes are monthly for now (a 13th salary or one-off income comes later). Each income
  in force counts once per period, whatever its own pay day.
- A pay day of 29, 30 or 31 is clamped to the last day of shorter months before the weekend
  rule is applied.
- Weekend rule options: `nearest` (Saturday -> Friday, Sunday -> Monday; the default),
  `previous` (both -> Friday), `next` (both -> Monday), `none`.
- Removing an income that has already counted in a past period ends it from the current
  period instead of deleting it.

### Period

- A period starts on the actual (weekend-adjusted) pay date of the primary income and ends
  the day before the next actual pay date. Example with a nominal 25th: if 25 January is a
  Saturday, the period starts Friday 24 January. The salary is therefore always day one of
  its period.
- Periods are stored rows with a start and end date. They are contiguous and never
  overlap. Past periods are not recomputed when the income's pay day later changes.
- Only periods up to the current one exist as rows; they are created on demand. The
  current period's end date is a projection (the day before the next actual pay date of
  the primary income); it is recomputed when the primary income's terms change, unless the
  user has set it by hand.
- The user can move the boundary between two consecutive periods, and the projected end of
  the current period, to match when the salary really arrived (public holidays). A manual
  boundary is never overwritten by recomputation.
- When creating a budget the user chooses the month to start tracking from: the current
  period by default, or an earlier month so that past transactions can be entered.
- "Today" is the calendar date in Europe/Zurich, decided by the database, not by the
  browser's clock or UTC.
- A period's income total is the sum of the incomes in force in that period, each at the
  version in force for that period.
- A transaction belongs to the period whose date range contains its date, so a back-dated
  transaction lands in the right past period. Past periods stay editable.
- At the end of a period, category balances reset. The period's surplus or deficit is
  shown as its result. (Per-category rollover may come later as an opt-in.)
- Users can browse past periods and compare them (for example a yearly chart).

### Category and subcategory

- Two levels at most: category, and optional subcategories (insurance -> insurance/car,
  insurance/health, insurance/home).
- The monthly expectation is set on each subcategory, or on the category itself when it
  has no subcategories.
- An amount is entered per month or per year. Yearly amounts are stored as yearly and
  shown as one twelfth per month.
- Budget total minus the sum of expectations is the amount left to assign.

### Transaction

- Has an amount, a date, and a category or subcategory. Optional description, optional
  link to a debt or a subscription.
- Created manually in the UI. Also importable in bulk (see Import).

### Subscription

- Has a price, a pay date, a cadence, and a category. The app shows when the next charge
  will occur.

### Debt

- Create, update, delete. Has a principal, an optional interest rate, and a planned
  monthly payment.
- A transaction assigned to a debt reduces the remaining amount. The app shows the
  evolution of the debt and its expected end date.

### Account and planned transfer (money flow)

- The user defines accounts (salary account, savings, third pillar, tax reserve, possibly
  at different banks) and planned transfers between them, such as "payday + 2 days:
  1000 CHF from A to Savings".
- Each planned transfer is flagged automatic (standing order, assumed done) or manual
  (shown as a per-period checklist).
- The money flow diagram is drawn from this plan. The app has no bank connection, so it
  does not depend on detecting automatic transactions. Actuals may be overlaid later.

## Cross-cutting rules

### Versioning: edits never rewrite the past

Any edit to an income, a category expectation, a subscription or a debt's terms creates a
new version effective from the current period. Past periods keep reading the version that
was in force at the time. Several edits within the same period overwrite that period's
version rather than piling up.

A change to the primary income's pay day or weekend rule does not move the start of the
current period, which has already happened; it applies from the next pay date.

### Money

- CHF only. Store amounts as integer rappen (centimes), never floats.
- Display with Swiss formatting; dates as dd.mm.yyyy.

### Import (including by a Claude session)

- One import function in the database validates rows, skips duplicates, and marks imported
  transactions "to review".
- It is reachable from a paste/CSV screen in the app, from a script in this repo that a
  Claude Code session can run, and later from a connector.
- Claude does not get raw database access to real data.
- Merchant-to-category rules are saved so categorisation improves over time.

### Security

- All access control is row-level security in Postgres: a user sees and changes only the
  data of budgets they are a member of. The browser talks to Supabase directly, so RLS is
  the only line of defence.

## Build order

1. Scaffold: app shell, auth, sidebar layout, local Supabase, CI and deploy pipeline.
2. Budgets and members, incomes, periods.
3. Categories, transactions, period progress view.
4. Subscriptions and debts.
5. Period comparison charts.
6. Import (CSV and Claude).
7. Accounts and the money flow diagram.
