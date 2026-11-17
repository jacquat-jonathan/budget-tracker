# Handover

Written 2026-11-17 at commit `0d5e677`, when the building session was stopped by the owner.
A new session should read this file, then `CLAUDE.md`, then the parts of `docs/spec.md` it
needs. Delete this file (and `docs/handover/`) once everything under "Open work" is closed.

## Where things stand

- Branch `claude/keen-fermi-0uttfr`, head `0d5e677`. CI is green on it (frontend job and
  database job). Draft pull request: number 1 of this repository. **The owner asked that
  it is not merged yet.**
- Nothing is deployed. The owner deploys when the implementation is finished;
  `docs/deployment.md` is the step-by-step guide (hosted Supabase, Infomaniak Apache).
- All seven build steps are built: scaffold; budgets, members, incomes, periods; categories,
  transactions, progress; subscriptions and debts; period comparison; statement import;
  accounts, planned transfers and money flow.
- In `spec/spec.json` every feature is `done` except `F-MONEYFLOW` (step 7), which stays
  `in-progress` until the open work below is closed.
- Checks on `0d5e677`: `npm run lint`, `npm run typecheck`, `npm run build`,
  `npm run spec:check` pass; `npx vitest run` 78 files, 1094 tests pass; the database suite
  through `npx supabase test db` 44 files, 2774 tests pass.

## Open work, in order

### 1. Database: three defects in planned transfers (found by an independent review)

Reproduction scripts are in `docs/handover/scenarios/` (see `run.sh` there). Each is a
rolled-back scenario against the local database. None of the three is fixed.

**M1, must fix. A fixed-day transfer with weekend rule `previous` or `nearest` can lose its
transaction for good.** Script `w2_weekend_lost.sql`; controls `w1_weekend_boundary.sql` and
`w4_weekend_absent.sql` (both behave correctly today and must still do so after the fix).

- When: the scheduled date is the first day of a period that starts on a weekend, so the due
  date falls one or two days before that period exists. If anything makes the catch-up look at
  that transfer in those days, the transaction is never made.
- Case A: "Rent", fixed day 25, rule previous, automatic, linked to a category. Sunday
  25 Oct 2026 is due Friday 23 Oct. On Saturday 24 Oct the amount is edited from now. On
  25 Oct the period starts and the checklist row reads done (assumed) with no transaction;
  there is still none a month later and the period's spent is 0.
- Case C: on 24 Oct the salary is set as expected on 26 Oct (the transaction of 23 Oct is
  made), then cleared the same day (the preview says 1 removed, 0 created). It is never made
  again.
- Not affected: nobody touching the transfer in that window; a whole period without opening
  the app; manual transfers (they are listed to do, overdue).
- Cause, as the reviewer read it (verify): `materialise_transfers` only takes
  `due_date > settled_through`, and the period INSERT branch of `transfers_recheck_trigger`
  sets `next_due` without moving the watermark back.
- Proposed fix: in that INSERT branch move `settled_through` back to `new.start_date - 3`, as
  the UPDATE branch already does. Add pgTAP tests for cases A and C naming `R-ACCOUNT-302`.

**S-A, should fix. A main-income transfer made mid-period skips a real payday after a
reopen.** Script `n1_starts_seq_reopen.sql`.

- "Savings" (names no income) is made on 26 Nov with no period named, so `starts_seq` is 4.
  A reopen on 27 Nov merges the period, and `next_due_date` jumps to 25 Jan: the 25 Dec payday
  is skipped. This contradicts `D-493` (the first occurrence is the next one on or after
  today).
- Proposed fix: when a reopen merges period N, set `starts_seq = N` for transfers whose
  `starts_seq = N + 1`. Check that no occurrence then appears that is due before the transfer
  was made. Add a test.

**S-B, should fix. A fixed day with a weekend rule can be recorded before the day the
transfer was made.** Script `w3_weekend_first.sql`.

- Made on Saturday 24 Oct with no period and no first date, day 25, rule previous: a
  transaction dated Friday 23 Oct is recorded at once (breaks `R-ACCOUNT-315`). The manual twin
  is overdue at once, and `mark_transfer_done` with the default date answers
  `before_transfer_start`.
- Proposed fix: the first scheduled date is the first one whose due date is on or after
  `starts_on`. The preview and the write must agree. Add a test.

**Contract wording to correct in the same round** (`docs/database.md`, and `spec/spec.json`
where the same sentence lives):

- The `Q-357` example says "1 removed, 1 created, 1 moved" for Ben's pay day moving from the
  10th to the 12th; the database answers moved 0.
- `D-612` / `R-ACCOUNT-464`: "moving the clock to that day produces exactly that occurrence" is
  not true for a fixed day whose due date falls before the start of its not-yet-existing
  period. It may become true once M1 is fixed; check, then word it truthfully.
- The documented result of `get_transfer_terms` omits `weekend_rule`.
- Stale words from the removed design: a migration comment near line 1024 of
  `supabase/migrations/20261120100000_money_flow.sql` ("its key"); the contract's checklist
  text "whose key lies in the period"; `supabase/tests/database/97k_db_fix4.test.sql` line 658
  and two test descriptions saying "keyed".

Smaller findings of the same review, not planned, for the owner to weigh:

- An income's end corrected to an earlier period: a member's done mark becomes unplanned and
  the same payday is to do again (marks carry over only in `update_transfer`).
- A period start moved to before the day a transfer was made gives a transaction dated before
  the transfer was made.
- `private.period_keyed_tables` is filled by the migrations, so a plain data dump does not
  restore (duplicate key). `docs/deployment.md` documents dump flags that exclude it. The
  reviewer would move the table to a schema the data dump does not list, so no flag has to be
  remembered.
- Tests do not catch these deliberate breaks of the new code (names are the reviewer's):
  manual transfers recorded by the catch-up; next due date limited to the current period or
  using the latest terms for the first version; carry-over matched by due date or only in the
  first period; an income name on period rows; "due today" treated as upcoming; the period
  number filter or the number not passed to the row lock; "today" treated as next month at
  creation; the income preview starting from the current period; the money flow's planned and
  set-aside figures taken from listed rows, extra income as zero, spent a day short.

### 2. Screens: findings of a re-check that was stopped part-way

The screens re-check had built a household in the browser and compared every press and every
preview with the database (all agreed: each press changed only its own row; 12 changes of a
transfer's kind matched their previews; import review by row and in bulk with a refusal
mid-run matched). It was stopped before: the weekend-rule rows after their date, "the salary
arrived early" and the expected pay date with affected transfers (non-zero counts were never
seen in a browser), make primary, move start, reopen with marks, the money flow line against
the dashboard, dark theme, an accessibility scan, a large budget, and the production
Content-Security-Policy run for the last two rounds.

Should fix:

- Editing a fixed-day transfer to "the main income's payday": its unmarked overdue to-do in the
  current period disappears, and the preview says nothing about it (its first row is the next
  period's). Either the preview tells it (needs a figure from the database) or the form says
  that to-dos of the current period under the old schedule are dropped. Decide which is true
  to `Q-357` first.

Wording (English seen; check the French twins):

- The weekend-rule help always explains "Nearest: …" whichever rule is chosen; "The checklist
  keeps its date; only when it is due moves." is awkward.
- A row says the date twice: "<date> · on the payday of "Tom's salary", <the same date>". With
  an offset, "due <date> · on the payday of "Side job", <two days earlier>" reads as a
  contradiction: say "2 days after the payday of …".
- The form's foot says "Nothing dated before today is recorded." and then "It plans from today:
  nothing dated before today is recorded."
- A kept mark of a transfer that no longer names an income says "on its income's payday,
  <date>" without saying which income.
- The Budget total says "Includes CHF 2'888.00 for planned transfers" while two categories are
  committed above plan, so not all of that figure is inside the planned total.
- Open choices left by the developer: whether "The other pages show …" on the money flow
  should name the pages; whether a kept mark after a reopen deserves its own sentence instead
  of "the schedule or a payday moved".

Notes:

- The From and To selects of the transfer form have no placeholder.
- Changing the password asks for no current password.
- On import review, the sticky merchant-rule offer can cover the last row's category picker
  when the list just fills the screen.

### 3. Close step 7

After 1 and 2: mark `F-MONEYFLOW` done in `spec/spec.json`, run `npm run spec:render`, and
delete this handover.

### 4. Deployment (when the owner decides)

Follow `docs/deployment.md`. Verify there what could not be verified locally: the hosted
request body limit and rate limits (`Q-280`, `Q-281`), that "Confirm email" is on, mail
delivery, Infomaniak's Apache honouring `public/.htaccess`.

## Decisions waiting for the owner (none blocks the fixes)

- `Q-355` to `Q-358`: four planned-transfer behaviours left as they are (a reopen replays the
  stretch with today's terms; an app transaction a member edited goes with its occurrence;
  "from now" means from the start of the current period; a main-income transfer is once per
  period).
- `Q-310`: a yearly or quarterly transfer linked to a category shows its whole amount in the
  month it runs.
- `Q-365`: the database's default end for a reopen with no date.
- `Q-366`: a bulk "categorise imports" call (the review screen makes two requests per row).
- `Q-367` to `Q-370`: email change, account deletion, owner hand-over, member roles.
- `Q-320`: one colour per category group shared by Budget, Compare and the money flow.
- An early commit in this branch's history contains a short amount string that by coincidence
  also appears in one of the owner's statements. It was offered to be scrubbed from history;
  the default is to leave it.
- Older open questions are listed in `docs/spec.md`.

## Never verified anywhere

A hosted Supabase project; Infomaniak's Apache; real email; browsers other than Chromium; real
phones; screen readers; real bank PDFs in a real browser outside the local test runs.

## How to work in this repository

- The five checks before reporting work as done are in `CLAUDE.md`. Also run, as its own
  command, `node .github/scripts/check-csp.mjs public/.htaccess https://example.supabase.co`.
- Run database tests the way CI does: `npx supabase test db` (pg_prove). A helper statement in
  a test file that prints a bare `ok` row is counted as a test and fails the run; this broke CI
  once. Tests must also pass on a database that already holds data (`C-DBTEST-001`).
- If a returned shape changes, regenerate `src/lib/database.types.ts` (CI diffs it) and keep
  `docs/database.md` true: it is the contract the screens follow.
- Migrations are corrected in place until the first deployment (`D-450`). After the first
  deployment every schema change is a new migration.
- A change in behaviour updates `spec/spec.json` in the same change; new rules, decisions and
  questions take the next free id; then `npm run spec:render`.
- Local memory was tight (15 GB): one Supabase stack at a time, `npx vitest run --maxWorkers=2`.
- Statements: the owner's real bank statements must never enter the repository, the network or
  a report. Only the anonymised fixtures under `test-fixtures/` were approved. Statements are
  parsed in the browser; the file never leaves the device.
- Push only to `claude/keen-fermi-0uttfr` unless the owner says otherwise.

## Suggested prompts for the next sessions

1. "Read `docs/HANDOVER.md`. Fix the three database defects under 'Open work 1' (M1, S-A, S-B)
   with a pgTAP test each, correct the contract wording listed there, run the scenarios in
   `docs/handover/scenarios/` and the full checks, and push."
2. "Read `docs/HANDOVER.md`. Fix the screens findings under 'Open work 2' in English and
   French, with tests, run the full checks, and push."
3. "Read `docs/HANDOVER.md`. Do 'Open work 3', then walk me through `docs/deployment.md`."
