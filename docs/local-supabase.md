# Local Supabase

The app talks to a local Supabase stack (Postgres, Auth, REST API, mail catcher) in Docker
during development. Everything lives in `supabase/`:

| Path                   | What                                                        |
| ---------------------- | ----------------------------------------------------------- |
| `supabase/config.toml` | Local stack settings (ports, auth URLs, email confirmation) |
| `supabase/migrations/` | Schema, one SQL file per change, applied in name order      |
| `supabase/seed.sql`    | Local-only sample data, loaded after migrations             |
| `supabase/tests/`      | pgTAP database tests, mostly row-level security             |

The Supabase CLI is a dev dependency (`supabase` in `package.json`), so after `npm install`
every command below runs through `npx supabase` or the `npm run db:*` scripts. All CLI
commands target the local stack unless you pass `--remote`.

## Prerequisites

- Node 22 and `npm install` done.
- Docker Desktop (macOS, Windows) or Docker Engine (Linux), running. The first start pulls
  about 2 GB of images.
- Free ports 54321 to 54324.

## Start, stop, reset

| Command            | What it does                                                          |
| ------------------ | --------------------------------------------------------------------- |
| `npm run db:start` | Start the stack. First run applies all migrations and `seed.sql`.     |
| `npm run db:stop`  | Stop the containers. Data is kept for the next start.                 |
| `npm run db:reset` | Drop the local database, re-apply every migration and `seed.sql`.     |
| `npx supabase status` | Print the URLs and keys again.                                     |

`db:start` prints the values for your `.env.local`:

```
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_PUBLISHABLE_KEY=<the "Publishable" key printed by db:start>
```

The local keys are well-known defaults; they are not secrets, but never use them for the
hosted project.

## Local tools

- **Studio** (table editor, SQL editor, auth users): http://127.0.0.1:54323
- **Mail inbox** (Mailpit): http://127.0.0.1:54324. Auth emails are never sent for real
  locally; password-reset and magic-link emails land here.
- **Database**: `postgresql://postgres:postgres@127.0.0.1:54322/postgres` (psql, TablePlus...).

Email confirmation is off locally, so signing up signs you in at once. Auth redirects are
allowed to the Vite dev server (http://localhost:5173 and 127.0.0.1:5173, including
`/reset-password`) and the preview server on port 4173. Changes to `config.toml`
need `npm run db:stop && npm run db:start`.

## Add a migration

1. `npx supabase migration new <short_name>` creates
   `supabase/migrations/<timestamp>_<short_name>.sql`.
2. Write the SQL. Follow the conventions in the first migration
   (`*_create_profiles.sql`):
   - enable row-level security and create the policies **in the same migration** as the
     table;
   - grant privileges explicitly (`revoke all ... from anon, authenticated`, then grant
     only what the policies allow). New tables get no API access by default
     (`auto_expose_new_tables = false` in `config.toml`);
   - write policies with `(select auth.uid())`, not bare `auth.uid()`;
   - put helper and `security definer` functions in the `private` schema, with
     `set search_path = ''` and schema-qualified names.
3. `npm run db:reset` to apply it from scratch.
4. Add tests (below), regenerate types (below), commit all three together.

Never edit a migration that has been pushed to the hosted project: add a new one.
You can also change the schema in Studio and capture it with
`npx supabase db diff -f <short_name>`, but read the generated file before committing.

## Run the database tests

```
npm run db:test
```

runs every file in `supabase/tests/database/` with pgTAP against the running stack.
`00_helpers.test.sql` runs first and installs helpers in a `tests` schema of the local
database; the other files run inside `begin ... rollback`, so they leave no data behind.

The helpers, for every new table's tests:

```sql
select tests.create_user('alice', 'Alice');   -- auth user + profile, returns the id
select tests.authenticate_as('alice');        -- act as Alice (role authenticated, JWT claims)
select tests.authenticate_as_anon();          -- act as a signed-out visitor
select tests.clear_authentication();          -- back to postgres (bypasses RLS)
select tests.get_user_id('alice');
select tests.get_user_email('alice');         -- for invitations
select tests.create_user('eve', 'Eve', false);  -- an account whose email is not verified
select tests.set_today('2026-11-15');         -- pin the database's "today" (as postgres)
select * from tests.period_violations(<budget id>);  -- independent period invariant check
                                              -- (also categories and transactions)
select * from tests.naive_totals(<period id>);  -- a period's totals recomputed from the rows
select tests.naive_committed(<period id>);    -- step 4: its committed total, from the rows
select tests.naive_remaining(<debt id>);      -- step 4: a debt's remaining amount, from the rows
select * from tests.step4_violations(<budget id>);  -- step 4 invariants (charges once,
                                              -- interest once per period, naive figures,
                                              -- categories in force, no entry before a
                                              -- debt's opened_on, no version at an end);
                                              -- call it as a member of the budget
select * from tests.naive_charge_dates(<anchor>, 'monthly', <day>, <from>, <to>);
                                              -- step 4: a schedule's dates, walked naively
select * from tests.naive_projection(<debt id>);  -- step 4: a debt's payoff, payments left
                                              -- and end, walked period by period
select tests.naive_next_pay(<from>, <pay day>, 'nearest');  -- the next actual pay date
select tests.remember('budget', public.create_budget(...));  -- name an id ...
select tests.id('budget');                    -- ... and use it under any role
select tests.reopen_previous_period(<budget id>);  -- step 2's argument lists for the RPCs
                                              -- that now name a revision or a period
```

The `tests.*` callers with step 2's argument lists (`set_expected_pay_date`,
`record_early_pay_date`, `reopen_previous_period`, `move_period_start`,
`update_income_terms`, `remove_income`, `set_primary_income`, `set_budget_end_date`,
`preview_expected_pay_date`) read, as the caller, the revision or current period a client
would have read and then call the RPC. Use them in tests about behaviour; test the
concurrency guard itself by calling the RPCs directly (`62`, `86`, `88`).

Deferred constraint triggers (period contiguity, one primary income, ...) only fire at
commit, and tests roll back, so assert them with
`select lives_ok('set constraints all immediate', '...')` followed by
`set constraints all deferred;`. The client contract the tests protect is in
`docs/database.md`. Name the spec rule id a test proves in its description
(`'R-PERIOD-030: ...'`); `npm run spec:check` checks every test-enforced rule has one.
`70_properties.test.sql` runs random sequences of every public operation (step 2's for
8 steps in 23, the category and transaction ones for 7, the subscription, debt and import
ones, with absences of up to 40 days, for 5, the account, transfer and mark ones for 3) for
eight fixed seeds (250 steps each, two to three minutes) and checks the invariants after each
step, including every period's totals against `tests.naive_totals` and its progress rows,
`tests.step4_violations` and `tests.moneyflow_violations` (marks only where their transfer
is in force, every automatic linked occurrence due has its mark, due dates equal to
`tests.naive_transfer_due`, accounts and categories in force, every period's money flow adding
up), and that the previews of creating, editing and ending a transfer equal the write. It also
keeps its own models of step 4 and checks them after each step: the charges created since
the last check against `tests.naive_charge_dates` (the nominal day the run asked for, the
price and category of the terms in force in each period), every new period's interest
against a naive balance (the state the step before left, since a period's interest is fixed
when it is created), every debt's projection against `tests.naive_projection`, and each
transaction the catch-up makes for a transfer, once, when first seen, against a naive due
date and the terms in force in its period. Before each step the budget is opened
(`ensure_periods`) and what that catch-up made is checked at once, so charges an absence left
due count as what the budget held, and an operation changing terms from now on is not taken
for a wrong charge. A seed walks the same
way on any database: every pick comes from the run's own rows in creation order
(`pg_temp.pick`), never from a scan whose order depends on what else the database holds, and
a pick is never called inside a `where` clause (it would run once per row scanned). A failure
names its seed and step; to replay it, keep only that seed in `seeds`. The `fingerprint`
diagnostic changes exactly when a walk changes. To run it longer, add seeds or raise the step
count in the `seeds` / `prop_config` tables at the top of the file (do not commit that), then
run it with `00_helpers.test.sql`.

`91_period_comparison.test.sql` checks the step 5 comparison reads against `period_summaries`
and `get_period_progress` (renamed, ended, restored, "Other" and void categories, a reopen, an
ended budget, catching up, access); the property test also checks them every fourth step.

`91b_step5_review.test.sql` holds the regression tests of the step 5 review: a moved start and
the debts' interest, far-behind budgets answering `catching_up` at once, `ensure_periods`
waiting about two seconds for a lock another connection holds (one `dblink` connection that
only takes an advisory lock; nothing is committed), one step per call, the time bound (the
test replaces `private.limit_catch_up_work()`), the comparison's flags, default and second
average, the membership limit and paged invitations, the held charge's preview, `preview_reopen`
at exactly 1000 changes, and the access and terms cases the earlier tests left open.

`97_import.test.sql` covers the import (preview equal to the write, validation, duplicates by
count, flags, salaries, matches, merchant rules, "to categorise", review, undo, chunks, tokens,
access); `97b_import_concurrency.test.sql` races two members sending one chunk, an import
against an undo, against a category's end, and a token import against its revocation (dblink,
like `98`), and two calls of one token at its last allowed call.
`97e_import_review.test.sql` holds the regression tests of the step 6 review: a token's answer
for every budget state (a matrix), rolling windows and their edges, tokens ending with their
creator, token limits and deletion, bounded stored rows, duplicates and matches counted per
batch across chunks, replays and out-of-order chunks, edited imports, null-batch previews,
undo and rules leaving linked and frozen transactions alone, clean error codes, the salary
window, "to categorise" restrictions, the shared text cleaner, merchant keys, the batch's
counts after "import anyway", paged reads, and a GET refused. The import script is described
in `docs/import-script.md`.

`97c_money_flow.test.sql` covers accounts, planned transfers and their versions, due dates,
the checklist and its marks, the transactions of linked transfers (by a mark or by the
catch-up, held back at the limit), the money flow, an income's account, closing an account,
ending a transfer, reopen, members, limits and access; `97d_money_flow_concurrency.test.sql`
races two members marking (and undoing) the same occurrence, an early salary against an edit
of a transfer, and closing an account against a transfer created on it (dblink; it runs on the
real today).

`97f_money_flow_review.test.sql` holds the first fixes of the step 7 review: removing a mark
never leaves an automatic linked occurrence without its transaction, the dashboard's count, an
ended chosen income does not block an edit, ending while a transaction is held back, the
previews' counts, and the comparison's transfer-committed figure.

`99_step4_review.test.sql` holds the regression tests of the step 4 database review (one
section per finding: the projection's period ends, catch-up after 13 and 40 years, category
coverage, the nominal day, opened dates, due charges, previews, and the contract additions).

`60_concurrency.test.sql`, `62_concurrent_edits.test.sql`, `97b`, `97d` and
`98_step4_concurrency.test.sql` are the exceptions to the rollback rule: each opens extra connections with `dblink` (local credentials
`postgres`/`postgres`) to race two callers, commits throwaway users and budgets, and
deletes them at the end (and at the start, should an earlier run have failed half-way).

Test at least: the owner can do what the policies allow; another user cannot read or
change the row; anon gets nothing. Scope every assertion to rows the test created
(`where id = tests.get_user_id('alice')`), never count or scan a whole table: your local
database may hold users you signed up through the app, and the tests must still pass.
`tests.create_user` inserts users with no privileges on public tables, like the Auth
server's `supabase_auth_admin`, so a sign-up trigger that needs more privileges fails the
tests as it would fail real sign-ups. `01_rls_enabled.test.sql` fails if any table in
`public` lacks RLS. CI also runs `npx supabase db advisors --fail-on warn` (Supabase's
security and performance linter); run it yourself after a schema change.

To run one file, run the helpers too:
`npx supabase test db supabase/tests/database/00_helpers.test.sql supabase/tests/database/profiles.test.sql`.

## Smoke test over the API

The pgTAP suite calls the functions in SQL; `npm run db:smoke` (`scripts/db/smoke-http.mjs`)
calls them as the browser does, through PostgREST and Auth: sign-up, the main step 2, 3 and
4 RPCs and views, the error contract (`P0001` and its message), what an anonymous visitor
and a non-member get, and two members racing the same reopen and the same subscription
charge. It needs the whole
stack (`npm run db:start`, not `supabase db start`) and reads the URL and publishable key
from `npx supabase status`, or from `SUPABASE_URL` and `SUPABASE_ANON_KEY`. It creates
throwaway users (`@smoke.test`) that `npm run db:reset` removes. CI does not run it (its
database job starts the database only); run it before handing over a contract change.

## Regenerate TypeScript types

After any schema change, with the stack running:

```
npm run db:types
```

writes `src/lib/database.types.ts` from the local schema. Commit it; CI fails when it is
out of date. Do not edit or reformat it by hand.

## Hosted project (free tier): link and push migrations

One-time:

1. Create a project at https://supabase.com/dashboard (free plan, region close to your
   users, for example Zurich or Frankfurt). Keep the database password in your password
   manager.
2. `npx supabase login` (opens the browser).
3. `npx supabase link --project-ref <ref>`. The ref is the 20-letter id in the dashboard
   URL (`/project/<ref>`) and in Project Settings > General. It asks for the database
   password.

Each time migrations change (merged to `main`, tests green):

```
npx supabase migration list --remote     # what is applied where
npx supabase db push --remote --dry-run  # what would be applied
npx supabase db push --remote
```

`--remote` is required: without it the CLI targets the local stack. `seed.sql` is not
pushed. Then set up the hosted Auth URLs as described in `docs/deployment.md`.

Free-tier projects pause after a week without activity; resume them from the dashboard.
