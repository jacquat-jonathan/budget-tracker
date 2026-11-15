# Deployment

Production is a static build (`dist/`) on Infomaniak web hosting (Apache), talking to a
hosted Supabase project. The `Deploy` GitHub workflow builds the app and uploads it with
rsync over SSH. It only runs when started by hand.

```
GitHub Actions: npm ci -> npm run build (VITE_* variables) -> rsync dist/ over SSH -> Infomaniak
Browser -> Infomaniak (HTML, JS, CSS)    Browser -> Supabase (data, auth; RLS enforces access)
```

## One-time setup

### 1. Hosted Supabase project

Create it and push the migrations as described in `docs/local-supabase.md` ("Hosted
project"). Then note two values from the dashboard:

- **Project URL**: Project Settings > Data API (or the "Connect" button), like
  `https://abcdefghijklmnopqrst.supabase.co`.
- **Publishable key**: Project Settings > API Keys, the `sb_publishable_...` key. It is
  meant for the browser; RLS protects the data. Never use the secret key in the app.

### 2. Infomaniak: site folder and SSH access

In the Infomaniak Manager (manager.infomaniak.com), Web Hosting > your hosting:

1. **Site folder.** Under Sites, open (or create) the site for your domain and note its
   folder, for example `sites/budget.example.ch`. If the app lives in a subfolder of an
   existing site (for example `https://example.ch/budget/`), the folder is that site's
   folder plus `/budget`, and `VITE_BASE_PATH` is `/budget/`.
2. **HTTPS.** Install the free Let's Encrypt certificate for the site and enable the
   option that forces HTTPS.
3. **SSH user.** Under FTP / SSH, create a user with SSH access (or enable SSH on an
   existing one). Note the **server** (host name shown there, for example
   `xxxx.ftp.infomaniak.com`), the **user name** and the **port** (22 unless shown
   otherwise).
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

   Check `ssh -i ./budget_deploy_key -p 22 <user>@<server> 'rsync --version'` logs in
   without a password and prints a version; the deploy needs rsync on the server.
5. **Host key** (so the workflow can tell it is talking to the real server):

   ```
   ssh-keyscan -p 22 <server>
   ```

   Keep the output lines. Cross-check: `ssh-keyscan -p 22 <server> | ssh-keygen -lf -`
   must show the same fingerprint your own `ssh` printed (or stored in your
   `~/.ssh/known_hosts`) when you first logged in.

### 3. GitHub: environment, secrets and variables

In the repository, Settings > Environments > New environment, name it `production`.
Optionally add yourself as required reviewer and restrict deployment branches to `main`.

Add in the `production` environment:

| Kind     | Name              | Value                                                      |
| -------- | ----------------- | ---------------------------------------------------------- |
| Secret   | `SSH_PRIVATE_KEY` | Full contents of `budget_deploy_key` (the private key)     |
| Variable | `SSH_HOST`        | The Infomaniak SSH server                                  |
| Variable | `SSH_USER`        | The SSH user name                                          |
| Variable | `SSH_PORT`        | Optional; defaults to 22                                   |
| Variable | `SSH_KNOWN_HOSTS` | The `ssh-keyscan` output lines from step 2.5               |
| Variable | `DEPLOY_PATH`     | The site folder from step 2.1, relative to the SSH user's home (for example `sites/budget.example.ch`) or absolute |

Add under Settings > Secrets and variables > Actions > Variables (repository variables):

| Name                            | Value                                                 |
| ------------------------------- | ----------------------------------------------------- |
| `VITE_SUPABASE_URL`             | Project URL from step 1                               |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Publishable key from step 1                           |
| `VITE_BASE_PATH`                | `/` at the domain root, or `/budget/` for a subfolder |

Then delete the local `budget_deploy_key` files, or keep the private key only in your
password manager.

### 4. Supabase Auth URLs for production

In the Supabase dashboard, Authentication > URL Configuration:

- **Site URL**: the production address, for example `https://budget.example.ch` (with the
  subfolder if any: `https://example.ch/budget`).
- **Redirect URLs**: add `https://budget.example.ch/reset-password` (password reset)
  and `https://budget.example.ch/**`.

Also under Authentication: keep email confirmation on for production (Sign In / Providers
> Email). The built-in email sender of the free tier sends only a few emails per hour; for
real use, set a custom SMTP server (Authentication > Emails > SMTP Settings), for example
your Infomaniak mail account.

### 5. Tighten the Content-Security-Policy (recommended)

`public/.htaccess` allows the browser to connect to any `*.supabase.co` project. Once the
project URL is known, replace in the `Content-Security-Policy` line

```
connect-src 'self' https://*.supabase.co wss://*.supabase.co;
```

with your project only:

```
connect-src 'self' https://abcdefghijklmnopqrst.supabase.co wss://abcdefghijklmnopqrst.supabase.co;
```

commit, and deploy. If the project is served from a custom domain instead of
`*.supabase.co`, list that domain (https and wss) the same way, or the app cannot reach
Supabase. The Deploy workflow checks this and stops before building when
`VITE_SUPABASE_URL` is not allowed by `connect-src`. After deploying, open the site with
the browser developer tools console: other CSP violations are reported there.

## Deploy

GitHub > Actions > **Deploy** > Run workflow, choose `main`, Run. The job first checks the
variables and that the CSP allows `VITE_SUPABASE_URL`, then runs the same checks as CI
(`npm run lint`, `npm run typecheck`, `npm test`); any failure stops it before anything is
uploaded. It then builds with the variables above and syncs `dist/` to the site folder: changed files are replaced, files no
longer in the build are deleted (the server's `.well-known/` folder is kept). Its log
lists every file it changed.

Before deploying a release that adds migrations, push them to the hosted project first
(`npx supabase db push --remote`), so the new code never runs against an old schema.

## Roll back

Run the Deploy workflow again with the **ref** input set to the last good tag or commit
SHA (find it in the commit history or a previous Deploy run). It rebuilds that version
and replaces the site. Tagging each deploy (`git tag deploy-2026-11-15 && git push --tags`)
makes this easier.

A rollback does not undo database migrations. Keep migrations backwards compatible with
the previous release (add columns and tables first, remove them in a later release), or
fix forward with a new migration.

## Troubleshooting

- `Host key verification failed`: `SSH_KNOWN_HOSTS` does not match `SSH_HOST`/`SSH_PORT`
  (with a port other than 22 the lines must start with `[server]:port`, which
  `ssh-keyscan -p` produces), or Infomaniak changed the key. Re-run step 2.5 and verify
  the fingerprint before updating the variable.
- `Permission denied (publickey)`: the public key is not in `~/.ssh/authorized_keys` of
  that SSH user, or `SSH_PRIVATE_KEY` is incomplete (it must include the `BEGIN` and `END`
  lines).
- Blank page after deploy: `VITE_BASE_PATH` does not match where the site is served.
- Reloading a page gives 404: `.htaccess` is missing in the site folder or `mod_rewrite`
  is off.
