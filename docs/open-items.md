# Open items

What is not done, not decided or not verified. Questions for the owner are open questions in
`spec/spec.json` (listed in `docs/spec.md`); this file holds the rest. Hand-written.

## Waiting for the owner

All as open questions, none blocks anything:

- Planned transfers: `Q-355`, `Q-356`, `Q-357`, `Q-358` (four behaviours left as they are),
  `Q-310` (a yearly or quarterly transfer shows its whole amount in the month it runs),
  `Q-374` (a done mark when an income's end is corrected to an earlier period), `Q-375` (a
  transaction dated before its transfer was made, after a period start moved back).
- Reopen: `Q-365` (the database's default end when no date is given).
- Import: `Q-366` (one call to categorise many imported rows; the review makes two requests
  per row).
- Account and budget: `Q-367` (change email), `Q-368` (delete account), `Q-369` (hand a
  budget over), `Q-370` (roles beyond owner and member), `Q-371` (ask the current password
  when changing it).
- Colour: `Q-320` (one colour per category group across Budget, Compare and the money flow).
- Wording: `Q-372` (should "The other pages show ..." name the pages), `Q-373` (a kept mark
  after a reopen: its own sentence).
- Deployment: `Q-376` (move `private.period_keyed_tables` so no dump flag is needed).
- History: `Q-377` (scrub an early commit holding a short amount string).
- The older questions in `docs/spec.md`, in particular the statement-format ones (`Q-200` to
  `Q-216`) and `Q-280`, `Q-281`.

## Tests that would not catch a deliberate break

Found by the independent review of planned transfers; the code is right, the tests are loose.
Breaks that no test notices today:

- manual transfers recorded by the catch-up;
- the next due date limited to the current period, or using the latest terms for the first
  version;
- a carry-over matched by due date, or only in the first period;
- an income name on period rows;
- "due today" treated as upcoming;
- the period number filter, or the number not passed to the row lock;
- "today" treated as next month at creation;
- the income preview starting from the current period;
- the money flow's planned and set-aside figures taken from listed rows, extra income as
  zero, spent a day short.

## Never verified

- A hosted Supabase project, Infomaniak's Apache, real email.
- Browsers other than Chromium, real phones (only a 390 px emulation), screen readers (an
  axe scan found nothing on 13 pages, light and dark; that is not a screen reader).
- Real bank PDFs in a real browser. The statement readers ran on text extracted from real
  statements and on the anonymised fixtures in `test-fixtures/`, never on the bank's newest
  PDF in a browser (the browser check used text-item JSON fixtures).
- A schedule whose dates move within one kind of transfer (a fixed day to another day): the
  edit form's note about dropped to-dos does not cover it, and the preview counts only
  transactions and marks (`R-ACCOUNT-562`).

## At deployment

Follow `docs/deployment.md`. What can only be known there is listed under "What can only be
known once it is deployed" and "Statements not verified": the hosted request body and rate
limits (`Q-280`, `Q-281`, step 6), "Confirm email" on (step 4), mail delivery (step 13),
Infomaniak's Apache honouring `public/.htaccess` (step 12), the Content-Security-Policy
narrowed to the project and checked (step 9). Until the first deployment migrations are
corrected in place (`D-450`); after it every schema change is a new migration.

## Working in this repository

Also in `CLAUDE.md`. Kept here:

- If a returned shape changes, regenerate `src/lib/database.types.ts` (CI diffs it) and keep
  `docs/database.md` true: it is the contract the screens follow.
- The owner's real bank statements never enter the repository, the network or a report; only
  the anonymised fixtures under `test-fixtures/` are approved. Statements are parsed in the
  browser and the file never leaves the device.
- Push only to `claude/keen-fermi-0uttfr` unless the owner says otherwise; the pull request
  stays unmerged until the owner says so.
