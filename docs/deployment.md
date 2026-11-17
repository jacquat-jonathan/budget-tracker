# Deployment

Production is a static build (`dist/`) on Infomaniak web hosting (Apache), talking to a
hosted Supabase project. Nothing runs on the web server but Apache: the browser loads the
app's files from Infomaniak and talks to Supabase directly.

```
GitHub Actions: npm ci -> lint, typecheck, tests -> npm run build (VITE_* variables) -> rsync dist/ over SSH -> Infomaniak
Browser -> Infomaniak (HTML, JS, CSS)    Browser -> Supabase (data, auth; row-level security enforces access)
```

This guide is written to be followed top to bottom by someone who has never done it. Each
step ends with **Check**: what you should see before going on. Where something could not be
checked from this repository or from the Supabase CLI's own help, the guide says **not
verified** and tells you what to look for. The dashboard menu names below are the ones
known when this was written; Supabase renames them from time to time (not verified).

Contents:

- [What you need](#what-you-need)
- [First deployment, step by step](#first-deployment-step-by-step) (steps 1 to 14)
- [Serving the app from a subfolder](#serving-the-app-from-a-subfolder)
- [Every later deployment](#every-later-deployment)
- [Backups](#backups)
- [Email templates](#email-templates)
- [The free project pauses after a week without use](#the-free-project-pauses-after-a-week-without-use)
- [Roll back](#roll-back)
- [What can only be known once it is deployed](#what-can-only-be-known-once-it-is-deployed)
- [Troubleshooting](#troubleshooting)
- [Statements not verified](#statements-not-verified)

## What you need

- A computer with Node.js 22 or newer, npm, Git and **Docker** (running). Docker is needed for
  `npx supabase db dump` (backups), which runs `pg_dump` in a container. Run `npm install` in
  the repository once; the Supabase CLI is a dev dependency (`npx supabase --version` prints
  the pinned version, 3.1.0 when this was written).
- A Supabase account (https://supabase.com) and an Infomaniak web hosting with SSH access.
- Admin rights on the GitHub repository (for the deploy workflow's secrets).
- A password manager for: the database password, the SSH deploy key, the publishable key.
- `psql` (PostgreSQL client) only if you will ever restore a backup.

## First deployment, step by step

### 1. Create the hosted Supabase project

At https://supabase.com/dashboard, create a project: a name, a strong **database password**
(save it in your password manager), and a region close to you (for example Zurich or
Frankfurt).

Note three values from the dashboard (Project Settings; the "Connect" button shows them too):

- **Project ref**: the 20 letters in the dashboard address (`/project/<ref>`).
- **Project URL**: `https://<ref>.supabase.co`.
- **Publishable key**: Project Settings > API Keys, the `sb_publishable_...` key. It is meant
  for the browser; row-level security protects the data. **Never** use the secret key (or the
  old service-role key) in the app, in a `VITE_` variable or in a file you commit.

**Check:** the dashboard shows the project as running, and you have the ref, the URL, the
publishable key and the database password written down.

### 2. Link the repository to the project

In the repository:

```sh
npx supabase login                         # opens the browser
npx supabase link --project-ref <ref>      # asks for the database password
```

**Check:** `npx supabase migration list --remote` prints every file of
`supabase/migrations/` in the **Local** column and nothing in the **Remote** column.

### 3. Push the migrations, all of them at once

The migrations are guaranteed to work **only as a whole chain** (D-450): three files call or
read what a later file creates (the step 4 file's `private.lock_and_catch_up` calls
`private.catch_up_gate`; the step 5 comparison reads and the step 6 import read columns that
the step 7 file adds). So apply all of them, in order, in one push; never a part of the chain.

```sh
npx supabase db push --remote --dry-run    # lists every migration it would apply
npx supabase db push --remote
```

`--remote` is required: without it the CLI works on the local stack. `supabase/seed.sql` is
local sample data and is **not** pushed (do not add `--include-seed`).

**Check:** `npx supabase migration list --remote` shows the same version in the Local and the
Remote column on every line, and `npx supabase db push --remote --dry-run` says the remote
database is up to date (locally the same command answers "Local database is up to date.").

From now on the migrations that were pushed are **frozen**: never edit one of those files.
Every later database change is a **new** migration file (D-450).

### 4. Set the authentication settings

In the dashboard, Authentication (menu names not verified, look for these settings):

1. **Confirm email: on** (Sign In / Providers > Email). **It must stay on**: invitations are
   matched to accounts by verified email, and with confirmation off any sign-up counts as
   verified, so anyone could register an invited address and accept that invitation.
2. **Minimum password length: 8 or more** (same place). The app asks for at least 8
   characters at sign-up, on the new-password page and in Settings (`PASSWORD_MIN_LENGTH` in
   `src/features/auth/schemas.ts`); the project must not accept shorter ones from other
   clients. (The local stack's `supabase/config.toml` says 6; the app still asks for 8.)
3. **Secure password change:** if you turn it on, the project asks for a recent sign-in
   before a password change; the app then says "sign out and sign in again, then change your
   password". Off is how the local stack runs (`secure_password_change = false`).
4. **Site URL and redirect URLs** (URL Configuration). The app sends exactly two kinds of
   links by email (read from `src/features/auth/pages/` and `src/lib/base-path.ts`):

   | Email | Link sends the user to | Built by |
   | ----- | ---------------------- | -------- |
   | Confirm your email (sign-up, and "resend the confirmation") | the app's root: `https://budget.example.ch/` | `appUrl()` in `sign-up-page.tsx`, `resend-confirmation-page.tsx` |
   | Reset your password | `https://budget.example.ch/reset-password` | `appUrl('reset-password')` in `forgot-password-page.tsx` |

   Set **Site URL** to the app's root (`https://budget.example.ch`), and add both URLs above
   to **Redirect URLs**, exactly (with `https`, without a trailing slash after
   `reset-password`). Under a subfolder, both include it:
   `https://example.ch/budget/` and `https://example.ch/budget/reset-password` (see
   [Serving the app from a subfolder](#serving-the-app-from-a-subfolder)). A link whose
   address is not in the list is sent to the Site URL instead, and the reset page is then not
   reached.

**Check:** the four settings show the values above. Step 13 tests them for real.

### 5. Set up email sending

The project's built-in sender sends only a few emails per hour (not verified: check the
number shown in the dashboard's rate limits). For a household that signs up, confirms and
sometimes resets a password, set your own SMTP server (Authentication > Emails > SMTP
Settings), for example your Infomaniak mail account: host, port, user, password, sender
address and name. Then paste the templates of [Email templates](#email-templates): by
default the emails are in English only.

**Check:** the SMTP settings are saved, and the "Confirm signup" and "Reset password"
templates show your text. Step 13 sends both for real.

### 6. Check the request body limit and the rate limits (Q-280, Q-281)

The import token's function `import_with_token` can be called with the publishable key alone
(that is how the import script works, `docs/import-script.md`). The API reads the whole
request body before the function runs, and the function refuses rows above 2 MB only once it
runs; locally nothing bounds the body (a 200 MB body was parsed in about 4 s). What the
import itself needs: a member's screen sends at most 500 rows a call and the script 250, well
under 2 MB, so **a body limit between 2 and about 10 MB is good**; a much larger one (or none)
lets anyone holding the publishable key make the database parse very large bodies.

Run these from your computer against **your** project (they send nothing to anyone else and
use an unknown token, so nothing is written):

```sh
export URL=https://<ref>.supabase.co
export KEY=<publishable key>
# A body of about N megabytes, with an unknown token.
body() { node -e "const n=+process.argv[1];process.stdout.write(JSON.stringify({p_token:'bti_none',p_batch_id:'00000000-0000-4000-8000-000000000000',p_chunk:1,p_rows:[{pad:'x'.repeat(n*1024*1024)}]}))" "$1"; }
for mb in 1 3 10 50; do
  body $mb > /tmp/body.json
  printf '%s MB: ' $mb
  curl -sS -o /dev/null -w '%{http_code}\n' -X POST "$URL/rest/v1/rpc/import_with_token" \
    -H "apikey: $KEY" -H "Content-Type: application/json" --data-binary @/tmp/body.json
done
```

- **Good:** 1 and 3 MB answer **400** with the function's own refusal
  (`{"code":"P0001",...,"message":"invalid_token"}`, as the local stack answers), and 10 or
  50 MB answer **413** (or the connection is refused) quickly: the gateway bounds the body.
- **Not good:** 50 MB answers like 1 MB, after a few seconds: nothing bounds the body. Then
  do not hand out import tokens until a limit is in front of the API (a proxy, or the
  platform's network restrictions); write the answer into Q-280 in `spec/spec.json`.

Rate limit per address (Q-281): send 300 quick calls with an unknown token and count the
answers:

```sh
seq 300 | xargs -P 20 -I{} curl -s -o /dev/null -w '%{http_code}\n' -X POST \
  "$URL/rest/v1/rpc/import_with_token" -H "apikey: $KEY" -H "Content-Type: application/json" \
  -d '{"p_token":"bti_none","p_batch_id":"00000000-0000-4000-8000-000000000000","p_chunk":1,"p_rows":[]}' \
  | sort | uniq -c
```

- **Good:** some answers are **429** (too many requests): the gateway limits per address.
- **Not good:** all 300 are **400** (the function's own `invalid_token`, as on the local
  stack): nothing limits calls per address.
  Many parallel calls then take connections from the API's pool and slow every budget down
  (locally from 7 to 9 ms to a median of 115 to 206 ms). Decide with Q-281 whether to accept
  that or to put a limit in front of the API, and write the answer there.

**Check:** you have both answers written down, and Q-280 and Q-281 say what was found.

### 7. Infomaniak: site folder, HTTPS and SSH access

In the Infomaniak Manager (manager.infomaniak.com), Web Hosting > your hosting:

1. **Site folder.** Under Sites, open (or create) the site for your domain and note its
   folder, for example `sites/budget.example.ch`. If the app lives in a subfolder of an
   existing site (for example `https://example.ch/budget/`), the folder is that site's folder
   plus `/budget`, and `VITE_BASE_PATH` is `/budget/`.
2. **HTTPS.** Install the free Let's Encrypt certificate for the site and enable the option
   that forces HTTPS.
3. **SSH user.** Under FTP / SSH, create a user with SSH access (or enable SSH on an existing
   one). Note the **server** (host name shown there, for example `xxxx.ftp.infomaniak.com`),
   the **user name** and the **port** (22 unless shown otherwise).
4. **Deploy key.** On your computer, make a key used only for deploys, without a passphrase:

   ```
   ssh-keygen -t ed25519 -N "" -C "budget-tracker deploy" -f ./budget_deploy_key
   ```

   Log in once with the SSH user's password and add the public key:

   ```
   ssh -p 22 <user>@<server>
   mkdir -p ~/.ssh && chmod 700 ~/.ssh
   echo "<contents of budget_deploy_key.pub>" >> ~/.ssh/authorized_keys
   chmod 600 ~/.ssh/authorized_keys
   ```

5. **Host key** (so the workflow can tell it is talking to the real server):

   ```
   ssh-keyscan -p 22 <server>
   ```

   Keep the output lines. Cross-check: `ssh-keyscan -p 22 <server> | ssh-keygen -lf -` must
   show the same fingerprint your own `ssh` printed (or stored in your `~/.ssh/known_hosts`)
   when you first logged in.

**Check:** `ssh -i ./budget_deploy_key -p 22 <user>@<server> 'rsync --version'` logs in without
a password and prints a version (the deploy needs rsync on the server), and the site's
address opens over https (an empty folder may show an Infomaniak page or an error: fine).

### 8. GitHub: environment, secrets and variables

In the repository, Settings > Environments > New environment, name it `production`.
Optionally add yourself as required reviewer and restrict deployment branches to `main`.

Add in the `production` environment:

| Kind     | Name              | Value                                                      |
| -------- | ----------------- | ---------------------------------------------------------- |
| Secret   | `SSH_PRIVATE_KEY` | Full contents of `budget_deploy_key` (the private key)     |
| Variable | `SSH_HOST`        | The Infomaniak SSH server                                  |
| Variable | `SSH_USER`        | The SSH user name                                          |
| Variable | `SSH_PORT`        | Optional; defaults to 22                                   |
| Variable | `SSH_KNOWN_HOSTS` | The `ssh-keyscan` output lines from step 7.5               |
| Variable | `DEPLOY_PATH`     | The site folder from step 7.1, relative to the SSH user's home (for example `sites/budget.example.ch`) or absolute |

Add under Settings > Secrets and variables > Actions > Variables (repository variables):

| Name                            | Value                                                 |
| ------------------------------- | ----------------------------------------------------- |
| `VITE_SUPABASE_URL`             | Project URL from step 1                               |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Publishable key from step 1                           |
| `VITE_BASE_PATH`                | `/` at the domain root, or `/budget/` for a subfolder |

Only these two `VITE_SUPABASE_*` values (and the base path) reach the browser. Then delete
the local `budget_deploy_key` files, or keep the private key only in your password manager.

**Check:** the environment lists one secret and five variables (four without `SSH_PORT`), and
the repository lists the three variables.

### 9. Narrow the Content-Security-Policy to your project (recommended)

`public/.htaccess` allows the browser to connect to any `*.supabase.co` project. Replace in
its `Content-Security-Policy` line

```
connect-src 'self' https://*.supabase.co wss://*.supabase.co;
```

with your project only:

```
connect-src 'self' https://<ref>.supabase.co wss://<ref>.supabase.co;
```

and commit. If the project is served from a custom domain instead of `*.supabase.co`, list
that domain (https and wss) the same way, or the app cannot reach Supabase. Keep
`script-src 'self'` as it is: the app has no inline script (C-CSP-001, C-CSP-002).

**Check:** `node .github/scripts/check-csp.mjs public/.htaccess https://<ref>.supabase.co`
prints nothing and exits 0 (`echo $?` prints 0).

### 10. Check, once more, that the migrations are on the project

The Deploy workflow **does not check that the migrations were pushed**: it only builds and
uploads the app, and a new app on an old schema fails at run time. Before every deployment
that comes with migrations, and before this first one:

```sh
npx supabase migration list --remote       # every line has the same Local and Remote version
npx supabase db push --remote --dry-run    # nothing to apply
```

**Check:** no line has an empty Remote column, and the dry run lists no migration.

### 11. Build and upload

**With the Deploy workflow** (the usual way): GitHub > Actions > **Deploy** > Run workflow,
choose `main`, Run. The job checks the variables and that the CSP allows `VITE_SUPABASE_URL`,
runs the same checks as CI (`npm run lint`, `npm run typecheck`, `npm test`), builds with the
variables of step 8, checks the built `dist/.htaccess` again and syncs `dist/` to the site
folder: changed files are replaced, files no longer in the build are deleted (the server's
`.well-known/` folder is kept). Its log lists every file it changed.

**By hand** (if you do not use GitHub Actions):

```sh
VITE_SUPABASE_URL=https://<ref>.supabase.co \
VITE_SUPABASE_PUBLISHABLE_KEY=<publishable key> \
VITE_BASE_PATH=/ \
npm run build
ls -a dist        # must list .htaccess, index.html, theme-init.js, favicon.svg and assets/
```

Upload the **contents** of `dist/` (not the folder itself) to the site folder, including the
hidden file `.htaccess` (some FTP programs hide files starting with a dot: turn that off), for
example `rsync -rlt --delete-after --filter='P .well-known/' -e "ssh -p 22" dist/ <user>@<server>:<site folder>/`
(the filter keeps the server's certificate folder).

**Check:** the workflow run is green (or your upload finished), and the site folder holds
`index.html`, `.htaccess`, `theme-init.js`, `favicon.svg` and `assets/`.

### 12. Check the site from outside

Replace `https://budget.example.ch` with your address (add the subfolder if any):

```sh
SITE=https://budget.example.ch
# Every app address answers with the app (deep links and reloads, links from emails).
for p in / /transactions /settings /reset-password; do
  curl -s -o /dev/null -w "$p %{http_code} %{content_type}\n" "$SITE$p"; done
# A missing build file is a real 404, never the app's page.
curl -s -o /dev/null -w '%{http_code}\n' "$SITE/assets/does-not-exist.js"
# Headers of the page and of one built file.
curl -sI "$SITE/" | grep -iE 'content-security-policy|cache-control|strict-transport|x-frame'
ASSET=$(curl -s "$SITE/" | grep -o 'assets/index-[^"]*\.js' | head -1)
curl -sI "$SITE/$ASSET" | grep -iE 'cache-control|content-type'
```

**Check:**

- the four app addresses answer `200 text/html`, and the missing file `404`;
- the page has `Content-Security-Policy: ... script-src 'self' ...` with your `connect-src`,
  `Cache-Control: no-cache`, `Strict-Transport-Security` and `X-Frame-Options: DENY`;
- the built file has `Cache-Control: public, max-age=31536000, immutable` and
  `Content-Type: text/javascript`;
- in a browser, open the site, reload on `/transactions`, and open the developer tools'
  console: no error, in particular no "Content Security Policy" violation.

These rules were checked with stock Apache 2.4 (the `httpd:2.4` container), at the root and
in a `/budget/` subfolder; whether Infomaniak's Apache honours all of them is only known here.

### 13. Sign up and confirm

1. Open the site, sign up with your own address and a password of at least 8 characters.
   The app says to check your inbox.
2. Open the confirmation email (in your language if you pasted the templates), follow the
   link: you land in the app, signed in, on the welcome page. Create your budget.
3. Sign out, choose "Forgot your password?", follow the reset email's link: you land on the
   new-password page. Choose a new password; you are signed in.
4. In Settings > My account, change the password once more and sign in again with it.

**Check:** both emails arrived from your sender, both links landed on the right page (not on
the Site URL's root for the reset), and the last password works.

### 14. Import a statement

1. On the Import page, choose a bank statement (PDF) or a CSV export, check the preview and
   import. The transactions appear "to review"; give them a category on the review list.
2. If you will use the **import script** (`docs/import-script.md`): create a token in
   **Settings > Import > Import tokens** (it is shown only once), put it in the environment
   of the program that runs the script as `BUDGET_IMPORT_TOKEN`, run the script with
   `--dry-run` first, then for real; afterwards revoke the token in the same place.

**Check:** the imported transactions are in the budget, and a second import of the same file
says they are already there (duplicates).

## Serving the app from a subfolder

A subfolder (for example `https://example.ch/budget/`) is supported:

- **Build:** set `VITE_BASE_PATH=/budget/`. `vite.config.ts` makes it Vite's `base` (every
  asset address starts with `/budget/`, `index.html` included, checked in a build), and
  `src/lib/base-path.ts` makes it the router's basename and the base of the links sent by
  email.
- **`.htaccess`:** no change. It works out its folder by itself (the `BASE` rule) and sends
  every unknown address under the folder to that folder's `index.html`. Upload `dist/`'s
  contents into the subfolder.
- **Supabase:** Site URL `https://example.ch/budget`, Redirect URLs
  `https://example.ch/budget/` and `https://example.ch/budget/reset-password`.
- **CSP:** unchanged; `form-action 'self'` and `base-uri 'self'` cover the subfolder.

If the parent site has its own `.htaccess` with rewrite rules, they apply before the
subfolder's (Apache reads both); check step 12's addresses under the subfolder.

## Every later deployment

1. Merge to `main` with CI green.
2. **If the release adds migrations**, push them first, so the new app never runs on an old
   schema: `npx supabase db push --remote --dry-run`, then `npx supabase db push --remote`.
   Never edit a migration that was pushed; add a new one.
3. **Check the migrations by hand** (step 10): the Deploy workflow does not.
4. Run the Deploy workflow (step 11) and repeat the checks of step 12.
5. Optionally tag the deploy: `git tag deploy-2026-11-15 && git push --tags`.

## Backups

**What the hosted project keeps, as far as this repository and the CLI can tell:** the CLI
has `npx supabase backups list` (lists the linked project's *physical* backups) and
`npx supabase backups restore --timestamp <seconds>` (point-in-time recovery). Whether the
free plan keeps any backup, for how long, and whether you can download it is **not verified**
here: after step 2, run `npx supabase backups list` and look in the dashboard (Database >
Backups) for what is listed and for how many days. If nothing is listed, or nothing you can
download, **your own dumps are the only backup**. Take them anyway: they are yours, outside
Supabase.

**Take a dump** (needs Docker running; flags checked with `npx supabase db dump --help` of
the pinned CLI 3.1.0):

```sh
mkdir -p ~/budget-backups/$(date +%F)
npx supabase db dump --remote --data-only --use-copy \
  --schema auth,public,private --exclude private.period_keyed_tables \
  -f ~/budget-backups/$(date +%F)/data.sql
npx supabase db dump --remote -f ~/budget-backups/$(date +%F)/schema.sql   # for reference
```

Run it from the repository folder (where `supabase/` is linked) or add
`--workdir <repository>`. Why these flags:

- `--schema auth,public,private`: the app's data is in `public` and `private`, the accounts
  in `auth` (so the file holds email addresses and password hashes: keep it like a
  password). The app uses no other schema (no file storage); a dump of every schema also
  holds storage tables that the restore is not allowed to write (`permission denied`,
  seen locally).
- `--exclude private.period_keyed_tables`: that table is filled by the migrations
  themselves; restored on top of them it collides (`duplicate key`, seen locally).
- The migration history (`supabase_migrations`) is never in a data dump; the migrations
  recreate it.

`schema.sql` is not needed for the restore below (the migrations make the schema); keep it to
see what the database looked like at that date.

**Where to keep it:** outside the computer and outside Supabase, encrypted: for example an
encrypted archive (`gpg -c data.sql`, then delete the plain file) on a drive you own and in a
second place (kDrive, another disk). Keep several dates; delete old ones on purpose.

**How often:** after each month's import at least, and before every release with migrations.

**Restore into a new project:**

1. Create a new project and link it (steps 1 and 2).
2. Push the migrations of the **same release** as the dump (step 3): this creates the schema,
   the migration history and the table left out of the dump.
3. Load the data in one transaction that stops at the first error (`data.sql` turns off
   triggers while it loads):

   ```sh
   psql "<connection string>" --single-transaction --variable ON_ERROR_STOP=1 --file data.sql
   ```

   The connection string is in the dashboard (the "Connect" button, with your database
   password).
4. Do steps 4, 5 and 9 to 13 again for the new project (its URL and keys are new). Existing
   accounts sign in with the passwords they had.

This was rehearsed on the local stack (2026-11-17): a household with 6 accounts, 1 budget,
71 transactions, 5 periods and 4 transfers was dumped with the command above, the database
reset to the migrations only (`npx supabase db reset --no-seed`), the file loaded with the
`psql` command above, and every count came back equal. **Not verified** against a hosted
project, where the `postgres` role's rights on the `auth` schema may differ: if the load stops
with a permission error on `auth`, write down the message and ask Supabase support how to
import users.

## Email templates

The app uses two of Supabase Auth's email templates; leave the others as they are (the app
never sends a magic link, an invitation email, or an email change):

| Template (dashboard name, not verified) | Sent when | Link goes to |
| ---------------------------------------- | --------- | ------------ |
| Confirm signup | sign-up, and "Resend the confirmation email" | the app's root |
| Reset password | "Forgot your password?" | `/reset-password` |

Supabase cannot pick a language per person without custom code (not verified for the
hosted project), so the templates below are **bilingual**: French and English in one email.
Paste them in Authentication > Emails > Templates. Keep `{{ .ConfirmationURL }}` exactly as
written: Supabase replaces it with the link. (Both were checked on the local stack, which
runs the same Auth server, with `[auth.email.template.confirmation]` and
`[auth.email.template.recovery]` in a copy of `supabase/config.toml`: both emails arrived with
the subject, both languages and a working link; see `docs/local-supabase.md`.)

**Confirm signup**, subject: `Confirmez votre adresse e-mail / Confirm your email address`

```html
<h2>Confirmez votre adresse e-mail</h2>
<p>Vous avez créé un compte Budget Tracker avec cette adresse. Pour l’activer, ouvrez ce lien :</p>
<p><a href="{{ .ConfirmationURL }}">Confirmer mon adresse e-mail</a></p>
<p>Si vous n’avez rien demandé, ignorez ce message : aucun compte ne sera activé.</p>
<hr />
<h2>Confirm your email address</h2>
<p>You created a Budget Tracker account with this address. To activate it, open this link:</p>
<p><a href="{{ .ConfirmationURL }}">Confirm my email address</a></p>
<p>If you did not ask for this, ignore this message: no account will be activated.</p>
```

**Reset password**, subject: `Choisissez un nouveau mot de passe / Choose a new password`

```html
<h2>Choisissez un nouveau mot de passe</h2>
<p>Quelqu’un a demandé à réinitialiser le mot de passe du compte Budget Tracker lié à cette adresse. Ouvrez ce lien pour en choisir un nouveau :</p>
<p><a href="{{ .ConfirmationURL }}">Choisir un nouveau mot de passe</a></p>
<p>Si ce n’était pas vous, ignorez ce message : votre mot de passe ne change pas.</p>
<hr />
<h2>Choose a new password</h2>
<p>Someone asked to reset the password of the Budget Tracker account linked to this address. Open this link to choose a new one:</p>
<p><a href="{{ .ConfirmationURL }}">Choose a new password</a></p>
<p>If this was not you, ignore this message: your password does not change.</p>
```

The link works once and for a limited time (set by the project, not verified); the app says
so and offers a new one when an old link is opened.

## The free project pauses after a week without use

A free-plan project is paused after about a week without activity (as `docs/local-supabase.md`
said before; the exact rule is **not verified**: check the dashboard and Supabase's plan
page). While it is paused the site still loads, but every page says it cannot reach the
server, nobody can sign in, and the import script fails (what the app shows is not
verified: it has not run against a paused project). To resume: open the dashboard, open
the project and choose to restore (resume) it; it takes a few minutes. Nothing is lost by a
pause (not verified: check what the dashboard says about long pauses). Using the app at
least once a week avoids it.

## Roll back

Run the Deploy workflow again with the **ref** input set to the last good tag or commit SHA
(find it in the commit history or a previous Deploy run). It rebuilds that version and
replaces the site. Tagging each deploy (`git tag deploy-2026-11-15 && git push --tags`)
makes this easier.

A rollback does not undo database migrations. Keep migrations backwards compatible with the
previous release (add columns and tables first, remove them in a later release), or fix
forward with a new migration. A dump taken before the release (see [Backups](#backups)) is
the way back for the data.

## What can only be known once it is deployed

- Whether Infomaniak's Apache honours every rule of `.htaccess`: the rewrite to
  `index.html`, the real 404 for missing files under `assets/`, the security headers
  (including the Content-Security-Policy), the caching headers and compression. They were
  checked with stock Apache 2.4 only. Step 12 checks them on the real host.
- The hosted project's request body limit and rate limits (step 6, Q-280, Q-281).
- Email delivery: whether the confirmation and reset emails arrive, from your sender, and
  are not filtered as spam (step 13).
- Real bank PDFs in a real browser: the statement readers were tested with synthetic files
  and text extracted from real statements, never with your bank's newest PDF (step 14).
- The free plan's backups and pausing rules (sections above).

## Troubleshooting

- `Host key verification failed`: `SSH_KNOWN_HOSTS` does not match `SSH_HOST`/`SSH_PORT`
  (with a port other than 22 the lines must start with `[server]:port`, which `ssh-keyscan
  -p` produces), or Infomaniak changed the key. Re-run step 7.5 and verify the fingerprint
  before updating the variable.
- `Permission denied (publickey)`: the public key is not in `~/.ssh/authorized_keys` of that
  SSH user, or `SSH_PRIVATE_KEY` is incomplete (it must include the `BEGIN` and `END` lines).
- Blank page after deploy: `VITE_BASE_PATH` does not match where the site is served.
- Reloading a page gives 404: `.htaccess` is missing in the site folder (hidden files not
  uploaded) or `mod_rewrite` is off.
- Pages cannot load their data ("Cannot reach the server"): the project may be paused (see
  above), or the CSP's `connect-src` does not allow the project (the browser console says so).
- The reset link lands on the app's root instead of the new-password page:
  `/reset-password` is missing from the Redirect URLs (step 4).

## Statements not verified

Everything in this list could not be checked from the repository or the CLI's help; each is
said where it is used:

- The dashboard's menu names and labels (Authentication settings, Emails, Templates, SMTP,
  URL Configuration, Database > Backups, Connect).
- The built-in email sender's hourly limit, and how long an email link stays valid.
- What the free plan backs up, for how long, and whether it can be downloaded; whether
  `backups restore` is available on it.
- The free plan's pausing rule and what happens after a long pause.
- That Supabase cannot choose an email's language per person without custom code.
- The hosted gateway's body limit and rate limits, and that it answers 413 and 429 (step 6
  checks them).
- Infomaniak's Apache configuration (modules, `AllowOverride`, whether `Header` and `<If>`
  are allowed in `.htaccess`).
- The restore of a dump into a hosted project, in particular writing the `auth` schema
  (checked only against the local stack).
