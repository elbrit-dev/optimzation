# Deploying to Netlify as a standalone site

**Live:** https://elbrit-account-audit.netlify.app
**Admin:** https://app.netlify.com/projects/elbrit-account-audit
**Project ID:** `af138dcb-a416-4a31-acc9-7ee9804fb173` · team `elbrit-dev`

**No environment variables are used.** Nothing to configure in the Netlify UI.

---

## How access works — two independent layers

**1. Login (auth layer).** A Netlify **edge function** runs in front of every
request. Without a valid session cookie you are redirected to `/login.html` and
`index.html` is never served. `/api/*` returns `401 AUTH_REQUIRED`.

- Password is PBKDF2-SHA256, 210k iterations, random salt.
- Session is an HMAC-SHA256 signed cookie: `HttpOnly; Secure; SameSite=Lax`,
  12 hours. `HttpOnly` means page scripts — and any XSS — cannot read it.
- **Fails closed:** with no password configured the gate serves a "locked" page
  and refuses `/api/*`. It never defaults to open.

**2. Credentials (data layer).** Resolved in this order:

1. the dashboard's own form (kept in that browser's `localStorage`)
2. `lib/credentials.mjs`, written once by `set-credentials.mjs`
3. env vars, if you prefer them

With (2) filled in you sign in and the report just loads — no token, no JSON, on
any device. Verified from a browser with empty `localStorage`.

**Stored credentials are only ever used for a request with a valid session
cookie**, checked at the edge *and again inside* `report.mjs`. The second check is
not redundant: it is what stops a removed or misconfigured edge gate from turning
stored credentials into a public staff-data endpoint. `selftest-auth.mjs` pins
that an unauthenticated caller gets `401` **even when credentials are stored** —
that exact leak existed once (an anonymous POST used server-side env credentials)
and was caught by this test.

## Store the credentials once

```bash
node tools/auth-audit-dashboard/set-credentials.mjs      # uses erp-token.txt + the key path in CONFIG
node tools/auth-audit-dashboard/set-credentials.mjs --erp "key:secret" --key /path/to/sa.json
node tools/auth-audit-dashboard/set-credentials.mjs --clear
```

Then redeploy — the file is bundled into the functions.

### Why not Firestore

Reading anything out of Firestore requires a Google credential, and the credential
being stored **is** that credential, so it can never bootstrap itself. Netlify
Blobs would work but needs an npm dependency; a bundled file needs none.

### Fresh clone

`lib/credentials.mjs` and `lib/auth-secrets.mjs` are **gitignored** — they hold a
live service-account key, ERP token and session signing key. Copy the
`.example.mjs` templates to those names and run `set-password.mjs` then
`set-credentials.mjs` before the first deploy.

## Set or change the password

```bash
node tools/auth-audit-dashboard/set-password.mjs "your password"
node tools/auth-audit-dashboard/set-password.mjs --generate   # random, printed once
```

Writes the hash, salt and a fresh session secret into `lib/auth-secrets.mjs`,
which is **bundled into the functions at deploy time** — that is why no env var
is needed. A new session secret invalidates every existing login, which is what
you want after a password change. **Redeploy afterwards.**

> `passwordHash` is a non-reversible derivation, but `sessionSecret` is a live
> signing key — anyone with it can mint a session. Keep this repo private, and
> re-run `set-password.mjs` after any exposure. `AUTH_PASSWORD_HASH`,
> `AUTH_PASSWORD_SALT` and `AUTH_SESSION_SECRET` env vars override the file if
> you'd rather keep them off disk.

## Deploying — always use `--no-build`

```bash
cd tools/auth-audit-dashboard
netlify deploy --no-build --prod --dir=public --functions=netlify/functions
```

### ⚠️ Why `--no-build` is not optional

There is nothing to build, but if a build *runs*, Netlify's framework detection
finds the Next.js app at the repo root and injects `@netlify/plugin-nextjs`,
which then fails with *"publish directory does not contain expected Next.js build
output"*. Three things keep that away, all in place:

1. **`--no-build`** on every deploy — the one that actually matters. The site
   still has `next build` stored as a UI build command from `sites:create`
   auto-detection, and clearing it via the API did not stick.
2. **No `command` in `netlify.toml`** — even a no-op `echo` triggers a build.
3. **A local `package.json`** with no `next` dependency, so detection anchors
   here instead of walking up.

### If you connect the Git repo for automatic deploys

Set **Base directory** to `tools/auth-audit-dashboard` and leave the build command
empty. Without the base set, the CLI resolves `publish` to `<repo-root>/public`
and merges the root `netlify.toml` headers — verified, `netlify dev` from this
folder reported `publish: C:\...\elbrit\public`.

## Verify after every deploy

```bash
node selftest.mjs         # 76 checks — matching logic
node selftest-auth.mjs    # 19 checks — endpoint fails closed without credentials
node selftest-login.mjs   # 36 checks — password, session, cookie, gate
node selftest-permissions.mjs # 19 checks — permission ownership rules
```

Then confirm the live gate:

```bash
S=https://elbrit-account-audit.netlify.app
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" $S/     # 302 -> /login.html
curl -s $S/api/report                                            # 401 AUTH_REQUIRED
```

If `/` returns 200 without a session, **stop** — the gate is not running.

## How it holds up

Measured against live ERP + Firebase (2026-08-11), through the deployed function:

- **2.0 s** per report — 954 employees, 634 user records, 345 Firebase accounts.
  Netlify's synchronous function ceiling is **10 s**.
- **1.2 MB** JSON response; Netlify's cap is **6 MB**.
- ERP paging is 2000 rows/request, so Employee and User are one round trip each.

Both limits scale with headcount. If the report ever starts timing out, paginate
server-side rather than raising the page size further.

## Operational notes

- **Report cached 60 s** per warm instance, keyed by credential set so caches
  never bleed between callers. **Refresh** forces a refetch.
- **`/api/status` and `/api/erp-token` do not exist here** — those are local-only
  conveniences. Deployed config is the in-page credentials form.
- **Headers**: `noindex`, `no-store`, `DENY` framing, `no-referrer`; plus
  `robots.txt` disallowing everything.
- **Rotating the ERP token** is just re-entering it in the dashboard. Nothing
  server-side to change, no redeploy.
