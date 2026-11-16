# Importing with a token (scripts/import)

A member can let a Claude Code session, or any other program, add transactions to one budget
without giving it a login or any database credential (R-IMPORT-006, R-SECURITY-005, D-116).
The program gets an **import token** and the project's public settings, and nothing else.

## For the member

1. In Settings, create an import token for the budget (a name, an expiry of 1 to 365 days,
   30 by default). The secret is shown once: copy it into the session's environment as
   `BUDGET_IMPORT_TOKEN`. Only its hash is stored; it cannot be shown again.
2. Afterwards, review what was imported (everything arrives "to review") and revoke the
   token when the session is done. A token also stops when it expires, and when the member
   who created it leaves the budget.

## For the session

```sh
export BUDGET_IMPORT_TOKEN=bti_...            # given by the member; never print or store it
export SUPABASE_URL=https://<project>.supabase.co
export SUPABASE_ANON_KEY=<publishable key>    # public, from the app's settings
node scripts/import/import.mjs rows.csv --dry-run   # checks the file, sends nothing
node scripts/import/import.mjs rows.csv --source csv --from 2026-10-25 --to 2026-11-24
```

The file is a JSON array of rows in the import row format (`docs/database.md` › Import), or a
CSV with a header line: `date` (`YYYY-MM-DD` or `DD.MM.YYYY`), `amount` (CHF, `12.50`,
`1'234.50`; negative for a debit unless a `direction` column says `debit` / `credit`), and
optionally `description`, `merchant`, `bank_transaction_id`, `hint`. The script sends 500
rows a call under one batch id, sends a chunk again after a network failure (the database
records it once), and prints how many rows were received and which were refused for their own
content. To continue a batch that stopped half-way, run it again with `--batch-id <id>`.

The session may:
- run the script with the token from the environment;
- read and write the file of rows it prepares.

The session must not:
- pass the token as an argument, print it, write it to a file, or commit it;
- ask for, or use, a member's login, the service role key, the database password or any
  other credential (R-SECURITY-005);
- expect to read anything back: the token cannot list transactions, duplicates, categories
  or anything else of the budget, by design.

## What a token can and cannot do (the attacker's view)

**With the publishable key only** (anyone, since it ships with the app): the only database
function callable without a session is `import_with_token`. Without a valid token it answers
`invalid_token`, the same for an unknown, expired or revoked token, after one index lookup by
the secret's SHA-256 and before any lock or catch-up (measured: about 2 ms over HTTP whatever
the token). A token is `bti_` and 244 random bits: it cannot be guessed. Every table and view
answers `42501` to an anonymous visitor (C-DBTEST-003).

**With a stolen token** (until it is revoked or expires):
- it can add rows to that one budget only, through the import, at most 60 calls and 5000
  rows an hour and 300 calls and 20 000 rows a day (so a day's abuse is bounded, and every
  row waits "to review" in a batch the member can undo whole);
- it cannot choose a kind, a category or "import anyway" (default choices only), cannot
  confirm a subscription charge (possible matches are skipped), cannot remember choices, and
  can create at most the budget's "to categorise" category (once);
- it reads nothing: its answer is how many rows were received and the reasons of rows
  refused for their own content; whether a row was a duplicate, a match, flagged, or outside
  the budget's periods is not told (no oracle on the budget's transactions). It does learn
  two facts about the budget from refusals: that it is more than one catch-up step behind
  (`catching_up`), and that it is full (`transaction_limit_reached`);
- it can fill the budget towards the 50 000-transaction limit over days; the member revokes
  the token and undoes its batches (`undo_import_batch`).

Revoking takes the budget lock: an import in progress finishes, the next call is refused.
