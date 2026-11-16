# Importing with a token (scripts/import)

A member can let a Claude Code session, or any other program, add transactions to one budget
without giving it a login or any database credential (R-IMPORT-006, R-SECURITY-005, D-116).
The program gets an **import token** and the project's public settings, and nothing else.

## For the member

1. In Settings, create an import token for the budget (a name, an expiry of 1 to 365 days,
   30 by default). The secret is shown once. Only its hash is stored; it cannot be shown
   again.
2. Put it in the environment of the session **before the session starts**, as
   `BUDGET_IMPORT_TOKEN` (for a cloud session: the environment's settings; locally: the
   shell that starts it). Never paste it into the conversation: what is typed there is part
   of the transcript.
3. Afterwards, review what was imported (everything arrives "to review") and revoke the
   token when the session is done, or delete it once revoked. A token also stops when it
   expires, when the member who created it leaves or is removed from the budget, and when
   their account is deleted. A budget holds at most 10 tokens that can still be used.

## For the session

```sh
# BUDGET_IMPORT_TOKEN is already set by the member; never print, store or ask for it
export SUPABASE_URL=https://<project>.supabase.co
export SUPABASE_ANON_KEY=<publishable key>    # public, from the app's settings
node scripts/import/import.mjs rows.csv --dry-run   # checks the file, sends nothing
node scripts/import/import.mjs rows.csv --source csv --from 2026-10-25 --to 2026-11-24
```

The file is a JSON array of rows in the import row format (`docs/database.md` › Import), or a
CSV with a header line: `date` (`YYYY-MM-DD` or `DD.MM.YYYY`), `amount` (CHF, `12.50`,
`1'234.50`), and optionally `direction` (`debit` / `credit`), `description`, `merchant`,
`bank_transaction_id`, `hint`. Without a `direction` column the amounts must be signed
(`-12.50` a debit, `+12.50` a credit): an unsigned amount is never guessed, and the script
refuses to send a file that has one, unless `--all-debits` says every row without a direction
is a debit (a card statement). A quote that is never closed refuses the whole file.

The script sends 500 rows a call under one batch id, sends a chunk again after a network
failure (up to three tries) or a statement timeout (once), under the same batch id and chunk
number (the database records it once), and prints how many rows were received and which were
refused for their own content. To continue a batch that stopped half-way, run it again with
`--batch-id <id>`. A call is refused whole above 2 MB (`invalid_rows`); the gateway's body
limit is the outer bound.

The session may:
- run the script with the token the member put in the environment;
- read and write the file of rows it prepares.

The session must not:
- ask the member for the token, pass it as an argument, print it, write it to a file, or
  commit it;
- ask for, or use, a member's login, the service role key, the database password or any
  other credential (R-SECURITY-005);
- expect to read anything back: the token cannot list transactions, duplicates, categories
  or anything else of the budget, by design.

## What a token can and cannot do (the attacker's view)

**With the publishable key only** (anyone, since it ships with the app): the only database
function callable without a session is `import_with_token`, by POST only (a GET, which would
put the token in the gateway's logs, is refused with `read_only_call` before the token is
looked at). Without a valid token it answers `invalid_token`, the same for an unknown,
expired or revoked token, or one whose creator left the budget, after one index lookup by the
secret's SHA-256 and before any lock or catch-up. A token is `bti_` and 244 random bits: it
cannot be guessed. Every table and view answers `42501` to an anonymous visitor
(C-DBTEST-003).

**With a stolen token** (until it is revoked or expires):
- it can add rows to that one budget only, through the import, at most 60 calls and 5000
  rows within any 60 minutes and 300 calls and 20 000 rows within any 24 hours. Every call
  with a valid token counts, whatever its outcome (a refused call counts as a call), and the
  check and the count are one step under the token's own lock, so parallel calls cannot
  pass the limit together. A day's abuse is bounded, and every row waits "to review" in a
  batch the member can undo whole;
- it cannot choose a kind, a category or "import anyway" (default choices only), cannot
  confirm a subscription charge (possible matches are skipped), cannot remember choices, and
  can create at most the budget's "to categorise" category (once, under its fixed name: the
  token cannot name it);
- it reads nothing: its answer is how many rows were received and the reasons of rows
  refused for their own content; whether a row was a duplicate, a match, flagged, or outside
  the budget's periods is not told (no oracle on the budget's transactions). Every argument
  is checked before anything of the budget, so a malformed call learns nothing either. It
  does learn two coarse facts about the budget from refusals: that it is more than one
  catch-up step behind (`catching_up`), and that it is full (`transaction_limit_reached`,
  without saying how many rows would fit);
- it can fill the budget towards the 50 000-transaction limit over days; the member revokes
  the token and undoes its batches (`undo_import_batch`). The rows it sends that are skipped
  are stored bounded: a refused row keeps only its known fields (unknown keys are named, not
  stored), and a call above 2 MB is refused whole.

The batch records the token (its id and name), never the caller. Revoking takes the budget
lock: an import in progress finishes, the next call is refused (a call that waited for the
budget lock re-checks the token).
