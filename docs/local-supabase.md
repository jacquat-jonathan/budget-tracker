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
`/auth/update-password`) and the preview server on port 4173. Changes to `config.toml`
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
```

Test at least: the owner can do what the policies allow; another user cannot read or
change the row; anon gets nothing. `01_rls_enabled.test.sql` fails if any table in
`public` lacks RLS. CI also runs `npx supabase db advisors --fail-on warn` (Supabase's
security and performance linter); run it yourself after a schema change.

To run one file, run the helpers too:
`npx supabase test db supabase/tests/database/00_helpers.test.sql supabase/tests/database/profiles.test.sql`.

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
