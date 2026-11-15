# Budget Tracker

A personal and household budget tracker. A budget starts from the monthly total of its
incomes, is split into categories with a monthly expectation each, and is tracked period by
period (pay day to pay day) against the transactions you record. It also tracks
subscriptions, debts and the planned flow of money between accounts. CHF only, in English
and French.

It is a static single-page app (Vite, React, TypeScript, Tailwind, shadcn/ui) that talks
directly to [Supabase](https://supabase.com) (Postgres, Auth, row-level security). There is
no custom server: the build output is plain files that any static host can serve.

- Product rules and decisions: [`docs/domain.md`](docs/domain.md)
- Running Supabase locally: [`docs/local-supabase.md`](docs/local-supabase.md)
- Building and deploying: [`docs/deployment.md`](docs/deployment.md)
- Conventions for contributors (and Claude): [`CLAUDE.md`](CLAUDE.md)

## Prerequisites

- Node.js 22 or newer, and npm
- For the local backend: Docker (or a compatible runtime) for the Supabase local stack. The
  Supabase CLI is a dev dependency and runs through `npx supabase`. See
  [`docs/local-supabase.md`](docs/local-supabase.md).

## Setup

```sh
npm install
cp .env.example .env.local     # then fill in the values, see below
npm run db:start               # start the local Supabase stack (prints URL and keys)
npm run dev                    # http://localhost:5173
```

The app refuses to start without its Supabase settings and shows which variables are
missing.

## Environment variables

Vite reads them from `.env.local` (gitignored) or from the environment at build time. Only
`VITE_` variables reach the browser: never put a secret or a service-role key in them.

| Variable                        | Required | Description                                                                                              |
| ------------------------------- | -------- | -------------------------------------------------------------------------------------------------------- |
| `VITE_SUPABASE_URL`             | yes      | Supabase project URL. Local stack: `http://127.0.0.1:54321`.                                             |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | yes      | Supabase publishable (anon) key. Local stack: printed by `npx supabase status`.                          |
| `VITE_BASE_PATH`                | no       | Path the site is served from, for a deployment in a subfolder, e.g. `/budget/`. Default `/`. Build time. |

`VITE_BASE_PATH` sets both Vite's `base` (asset URLs) and the router's basename, so links
and deep links work under a subfolder.

## Scripts

| Script              | What it does                                                                    |
| ------------------- | ------------------------------------------------------------------------------- |
| `npm run dev`       | Start the dev server with hot reload.                                           |
| `npm run build`     | Type-check and build the static site into `dist/`.                              |
| `npm run preview`   | Serve the built `dist/` locally.                                                |
| `npm run lint`      | ESLint (type-aware).                                                            |
| `npm run typecheck` | TypeScript, no output.                                                          |
| `npm test`          | Unit and component tests (Vitest, Testing Library). No backend needed.          |
| `npm run format`    | Format the code with Prettier.                                                  |
| `npm run db:start`  | Start the local Supabase stack.                                                 |
| `npm run db:stop`   | Stop it.                                                                        |
| `npm run db:reset`  | Recreate the local database from `supabase/migrations` and `supabase/seed.sql`. |
| `npm run db:test`   | Run the database tests in `supabase/tests`.                                     |
| `npm run db:types`  | Regenerate `src/lib/database.types.ts` from the local database schema.          |

Before considering a change done, run `npm run lint`, `npm run typecheck`, `npm test` and
`npm run build`.

## Project layout

```
src/
  app/              router, route guards, paths and sidebar navigation
  components/       shared app components (layout and sidebar, theme, preferences)
  components/ui/    shadcn/ui components (generated, keep edits minimal)
  features/<name>/  pages, components, hooks and queries of one feature
  lib/              Supabase client and types, i18n, money and date helpers
  locales/{en,fr}/  translations; every string exists in both languages
  test/             test setup and the Supabase mock
supabase/           Supabase config, migrations, seed and database tests
docs/               domain model, local Supabase and deployment notes
```

Add shadcn/ui components with `npx shadcn@latest add <component>`.
