# Budget Tracker

Household budget tracker. Read `docs/domain.md` before touching domain logic: it is the
source of truth for product behaviour and the decisions already taken.

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
- `docs/` domain model, local Supabase and deployment notes.

## Rules

- Money is integer rappen in the database and in code; format only at the edge.
- Every table has row-level security enabled, with policies, in the same migration that
  creates it.
- Period, pay-date and versioning logic is pure and unit-tested.
- Database tests (pgTAP, `supabase/tests/`) must pass on a database that already holds
  data: scope assertions to the test's own rows. Every table gets tests proving what
  another user and an anonymous visitor cannot do.
- Calendar dates (`YYYY-MM-DD`) and timestamps are different things; never run a calendar
  date through a time zone.
- The production Content-Security-Policy is `script-src 'self'`: no inline scripts.
- Every user-facing string exists in both `en` and `fr`.
- Never commit secrets. Only the Supabase URL and publishable (anon) key reach the browser,
  through `VITE_` variables.

## Checks

Run before reporting work as done: `npm run lint`, `npm run typecheck`, `npm test`,
`npm run build`.
