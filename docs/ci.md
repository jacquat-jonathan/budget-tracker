# Continuous integration

Two workflows run the checks (`C-CI-001`, `C-CI-002`; decision `D-656`). Hand-written.

## Pull requests: `.github/workflows/ci.yml`

Required to merge. It runs every check, split over parallel jobs so the run takes about three
minutes instead of seven:

| Job | What it runs |
|---|---|
| Checks | `spec:check`, `format:check`, `lint`, `typecheck`, `build`, the CSP check on `public/.htaccess` |
| Unit tests (1/3 to 3/3) | `vitest run --shard=k/3`; the three together run every test file once |
| Database | migrations from scratch, `db lint`, advisors, the generated types diff, every pgTAP file but `70_properties` |
| Property walk (1/4 to 4/4) | `00_helpers` and `70_properties`, two of the eight seeds each |
| CI passed | succeeds only if every job above succeeded |

The property walk took about five of the six pgTAP minutes. Its seeds are independent, so each
job walks two of them: the job sets `budget_tests.prop_shard` to `k/4` for the `postgres` role
before the run, and the test keeps only the seeds at positions k and k + 4. Every invariant is
checked on every seed. Only the 23 coverage thresholds (for example "the runs exercised at least
150 accepted boundary operations") are skipped on a split run, because each one counts the
walks of all eight seeds together. `main.yml` checks them.

A new push to a pull request cancels the run it makes stale.

### Making it required (owner, once)

Settings > Rules > Rulesets > New branch ruleset, target `main`, "Require a pull request before
merging" and "Require status checks to pass", add the check **CI passed** (it must have run once
to be listed). Only that check needs to be named: it depends on all the others, so jobs can be
added or renamed without changing the rule, as long as they are listed in its `needs`.

## After a merge, and every night: `.github/workflows/main.yml`

Allowed to be slow; never cancelled, so every merge commit is checked.

| Job | What it runs |
|---|---|
| Frontend | everything the Checks and Unit tests jobs run, unsplit, then a production-style build (placeholder `VITE_` values) whose `dist/index.html`, `dist/.htaccess` and shipped CSP are checked as `deploy.yml` checks them |
| Database | migrations, `db lint`, advisors, types diff, then every pgTAP file in one database, unsplit: the property walk's coverage thresholds run here |
| HTTP smoke test | the full local stack (`supabase start`) and `npm run db:smoke` |

The nightly run catches tests that start failing because of the date: the database tests use
today's date. A red run on `main` is fixed by a new pull request.

## Running a split locally

```bash
npx vitest run --shard=2/3 --maxWorkers=2
```

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "alter role postgres set budget_tests.prop_shard = '2/4'"
```

```bash
npx supabase test db supabase/tests/database/00_helpers.test.sql supabase/tests/database/70_properties.test.sql
```

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "alter role postgres reset budget_tests.prop_shard"
```

`supabase db reset` does not clear a role setting; reset it as above when done.
