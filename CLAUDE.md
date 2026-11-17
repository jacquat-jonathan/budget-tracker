# Budget Tracker

Household budget tracker. **`spec/spec.json` is the source of truth** for product behaviour,
the rules that constrain it, the decisions already taken and the conventions below. Read
the parts you need before touching domain logic, and do not reopen an accepted decision
without saying so.

## The spec

- Read `docs/spec.md` (generated, grouped by build step and area), or query
  `spec/spec.json` directly: `glossary`, `actors`, `features` (by build step, with status
  and `userStories`), `rules`, `decisions`, `conventions`, `openQuestions`. Its shape is
  `spec/spec.schema.json`.
- Ids are stable and never renumbered: `R-<AREA>-NNN` business rules, `C-<AREA>-NNN`
  conventions, `D-NNN` decisions, `Q-NNN` open questions, `US-<FEATURE>-NNN` user stories.
  A rule is `active` when its feature is done or in progress, `planned` otherwise.
- Enforcement `test`: a test names the id in its `describe`/`it` title (or its pgTAP
  description), so `grep -rn R-PERIOD-003 src supabase/tests` finds the proof. `lint`: a
  named npm script, ESLint rule or CI step. `review`: checked by people.
- **Standing rule:** a change in behaviour or a new decision updates `spec/spec.json` in the
  same change (a new rule, decision or open question gets the next free id), and tests for a
  new or changed rule name its id. Where the spec is ambiguous, add an open question rather
  than deciding silently.
- **Ids in code:** where a client-side rule or convention is enforced (the guard, the
  validation, the confirmation, the shared helper), one short comment names its id, and
  nowhere else; `npm run spec:check` fails on any id in `src/`, `supabase/`, `scripts/`,
  `docs/`, `README.md` or `CLAUDE.md` that is unknown, retired or superseded.
- **Generated files are never edited by hand:** `docs/spec.md` and the block between the
  `BEGIN GENERATED` / `END GENERATED` comments below. Change the spec, run
  `npm run spec:render`, commit both.
- `testPending` on a rule is a temporary marker (its pgTAP tests are not tagged yet);
  `npm run spec:check` reports it as a warning. Remove it once a test names the id.

## Stack

- Static single-page app: Vite, React, TypeScript (strict), Tailwind, shadcn/ui.
- Routing: React Router. Server state: TanStack Query. Forms: react-hook-form + zod.
- i18n: react-i18next, English and French. No hard-coded user-facing strings.
- Backend: Supabase only (Postgres, Auth, row-level security), called from the browser
  with supabase-js. No custom server.
- Hosting: Infomaniak Apache/PHP web hosting. The build output in `dist/` is served as
  static files; `public/.htaccess` handles the SPA fallback. No Node at runtime, no PHP.
- Package manager: npm.

## Layout

- `src/app/` router, route guards, paths, sidebar navigation config, providers.
- `src/components/ui/` shadcn components (generated, keep edits minimal).
- `src/components/` shared app components (layout, sidebar).
- `src/features/<feature>/` pages, components, hooks and queries of one feature.
- `src/lib/` supabase client, i18n setup, money and date helpers.
- `src/locales/{en,fr}/` translation files.
- `supabase/` config, migrations, seed. Schema changes go in a new migration, never by
  editing an applied one.
- `spec/` the specification (`spec.json`) and its schema.
- `scripts/spec/` the spec checker and renderer (`npm run spec:check`, `npm run spec:render`).
- `docs/` generated spec view (`spec.md`), database API contract, local Supabase and
  deployment notes.

## Rules

<!-- BEGIN GENERATED: conventions from spec/spec.json. Do not edit by hand: change the spec, then run `npm run spec:render`. -->
- Money is integer rappen in code. (`C-MONEY-001`, test)
- Money is integer rappen in the database. (`C-MONEY-002`, test)
- Money is formatted only at the edge. (`C-MONEY-003`, review)
- Every table has row-level security enabled. (`C-RLS-001`, test)
- A table's row-level security is enabled, with policies, in the same migration that creates
  it. (`C-RLS-002`, review)
- Access rules use the shared membership helpers in the `private` schema; a new table's
  policies call them rather than re-deriving membership. (`C-RLS-003`, review)
- Period, pay-date and versioning logic has one implementation, in the database (SQL
  functions). (`C-LOGIC-001`, review)
- Period, pay-date and versioning logic is tested with pgTAP. (`C-LOGIC-002`, test)
- The client reads period, pay-date and versioning results; it never recomputes them.
  (`C-LOGIC-003`, review)
- Client queries for budget data are keyed by budget id. (`C-QUERY-001`, review)
- Database tests (pgTAP, `supabase/tests/`) must pass on a database that already holds data:
  scope assertions to the test's own rows. (`C-DBTEST-001`, review)
- Every table gets tests proving what another user cannot do. (`C-DBTEST-002`, review)
- Every table gets tests proving what an anonymous visitor cannot do. (`C-DBTEST-003`,
  review)
- Calendar dates (`YYYY-MM-DD`) and timestamps are different things. (`C-DATE-001`, test)
- Never run a calendar date through a time zone. (`C-DATE-002`, test)
- The production Content-Security-Policy is `script-src 'self'`. (`C-CSP-001`, test)
- No inline scripts. (`C-CSP-002`, test)
- Every user-facing string exists in both `en` and `fr`. (`C-I18N-001`, test)
- Never commit secrets. (`C-SECRET-001`, review)
- Only the Supabase URL and publishable (anon) key reach the browser, through `VITE_`
  variables. (`C-SECRET-002`, review)
- A change in behaviour or a new decision updates `spec/spec.json` in the same change.
  (`C-SPEC-001`, review)
- Generated files (`docs/spec.md` and the generated block of `CLAUDE.md`) are never edited
  by hand: change `spec/spec.json` and run `npm run spec:render`. (`C-SPEC-002`, lint)
- Every active rule or convention with enforcement `test` has a test whose description names
  its id, and no test names an id that is unknown or not active. (`C-SPEC-003`, lint)
- Ids are stable: never renumber or reuse one; retire a rule or supersede a decision instead
  of deleting it. (`C-SPEC-004`, review)
<!-- END GENERATED: conventions -->

## Checks

Run before reporting work as done: `npm run lint`, `npm run typecheck`, `npm test`,
`npm run build`, `npm run spec:check`, and, as its own command,
`node .github/scripts/check-csp.mjs public/.htaccess https://example.supabase.co`.

- Database tests: `npx supabase test db` (pg_prove, as CI). A helper statement in a test file
  that prints a bare `ok` row counts as a test and fails the run.
- Memory is tight: one Supabase stack at a time, and `npx vitest run --maxWorkers=2`.
- What is still open or unverified: `docs/open-items.md`.
