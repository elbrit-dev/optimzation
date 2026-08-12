# Firebase Auth user list — accounts created today

`scripts/firebase-auth-users.mjs` lists Firebase Authentication accounts from
project `elbrit-sso-d01d9` and, by default, shows only the ones **created today**
in IST (`Asia/Kolkata`).

Zero npm dependencies — plain Node 18+ (`fetch`, `node:crypto`). It does not use
`firebase-admin`, which isn't installed in this repo.

---

## Quick start

```bash
# accounts created today (IST)
node scripts/firebase-auth-users.mjs --key="C:/Users/bbhar/Downloads/elbrit-sso-d01d9-4d7291fcaa38.json"
```

Set the key once and you can drop the flag:

```powershell
$env:GOOGLE_APPLICATION_CREDENTIALS = "C:/Users/bbhar/Downloads/elbrit-sso-d01d9-4d7291fcaa38.json"
node scripts/firebase-auth-users.mjs
```

Sample output (run 2026-08-11):

```
CREATED (Asia/Kolkata)  PROVIDER    EMAIL                        NAME                    UID
----------------------  ----------  ---------------------------  ----------------------  ----------------------------
2026-08-11 13:14:20     google.com  dupati.harish@elbrit.org     Dupati Harish           8ialPFy9SZg64bMSqFjiSUeXVY12
2026-08-11 13:15:51     phone                        +9179052…                           XS42qeXF46ccazcBhTLsUx734O02
...

71 account(s) — google.com: 26, phone: 45
(307 accounts total in elbrit-sso-d01d9)
```

Progress/diagnostic lines go to **stderr**, the list goes to **stdout**, so
`--json`/`--csv` pipe cleanly.

---

## Authentication

The script needs a Google OAuth access token with `cloud-platform` scope for a
principal that can read Identity Toolkit accounts (Firebase Authentication
Admin, Firebase Admin, Owner, or the project's `firebase-adminsdk` SA).

Resolution order:

| # | Source | How |
|---|--------|-----|
| 1 | `--token=ya29...` | explicit access token |
| 2 | `$FIREBASE_ACCESS_TOKEN` | explicit access token |
| 3 | `--key=PATH` | service-account JSON key |
| 4 | `$GOOGLE_APPLICATION_CREDENTIALS` | service-account JSON key |
| 5 | `$FIREBASE_SA_KEY` | service-account JSON key |
| 6 | *(fallback)* | `gcloud auth print-access-token` for the active account |

With a key file the script mints the JWT and exchanges it for a token itself —
no `google-auth-library`, no gcloud state.

**Use the service account, not `it@elbrit.org`.** That user sits under the
`elbrit.org` Cloud session control policy, so its gcloud token expires and
reauth needs an interactive password — it is unusable non-interactively. Service
accounts never reauth. Existing key:
`C:\Users\bbhar\Downloads\elbrit-sso-d01d9-4d7291fcaa38.json`
(SA `firebase-adminsdk-fbsvc@elbrit-sso-d01d9.iam.gserviceaccount.com`).

Note that `iam.disableServiceAccountKeyCreation` is enforced on the org, so a
**new** key can't be downloaded without an org-policy override. If that key is
ever lost, use `gcloud auth application-default login` and pass the resulting
ADC file, or activate the SA and let the script fall back to gcloud.

---

## Flags

| Flag | Default | Meaning |
|------|---------|---------|
| `--project=ID` | `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, else `elbrit-sso-d01d9` | Firebase project |
| `--date=YYYY-MM-DD` | today | single day, interpreted in `--tz` |
| `--days=N` | – | last N days including today; overrides `--date` |
| `--all` | – | no date filter, every account |
| `--tz=ZONE` | `Asia/Kolkata` | IANA zone that defines the day boundary |
| `--field=NAME` | `createdAt` | filter/sort on `createdAt`, `lastLoginAt` or `lastRefreshAt` |
| `--sort=WHICH` | `created` | `created` (oldest first), `email`, `provider` |
| `--json` | – | JSON array to stdout |
| `--csv` | – | CSV to stdout |
| `--out=PATH` | – | also write CSV to a file |
| `--key` / `--token` | – | see Authentication |
| `--quiet` | – | suppress stderr progress |

### Examples

```bash
# a specific past day
node scripts/firebase-auth-users.mjs --date=2026-08-10

# this week's signups as CSV on disk (gitignored)
node scripts/firebase-auth-users.mjs --days=7 --out=firebase-auth-week.csv

# accounts created today that have never actually signed in
node scripts/firebase-auth-users.mjs --json | jq '[.[] | select(.signedIn == false)]'

# who logged in today (rather than who was created today)
node scripts/firebase-auth-users.mjs --field=lastLoginAt

# UTC day instead of IST
node scripts/firebase-auth-users.mjs --tz=UTC

# full account dump
node scripts/firebase-auth-users.mjs --all --out=firebase-auth-all.csv
```

---

## Output fields

The table shows a subset; `--json` returns all of these per account.

| Field | Notes |
|-------|-------|
| `uid` | Firebase UID (`localId` in the API). Preserved across the 2026-07 migration. |
| `email` | Empty for phone-only accounts. |
| `phoneNumber` | E.164, empty for Google-only accounts. |
| `displayName` | From the Google profile; usually empty for phone accounts. |
| `providers` | Pipe-joined, e.g. `google.com`, `phone`, `google.com|phone`. |
| `emailVerified` / `disabled` | booleans |
| `createdAtMs` | raw epoch ms (the API returns it as a string) |
| `createdAtLocal` | `YYYY-MM-DD HH:mm:ss` in `--tz` |
| `createdAtUtc` | ISO 8601 |
| `lastLoginLocal` | last credential sign-in |
| `lastRefreshLocal` | last ID-token refresh — a better "last active" signal than `lastLoginAt` |
| `signedIn` | `false` when the account has no `lastLoginAt` at all |

---

## How it works, and the one real caveat

**Firebase Auth has no server-side date filter.** The only list endpoint is
Identity Toolkit `accounts:batchGet`:

```
GET https://identitytoolkit.googleapis.com/v1/projects/{projectId}/accounts:batchGet
      ?maxResults=1000&nextPageToken=...
Authorization: Bearer <access token>
```

It takes no query on `createdAt` — this is the same endpoint behind
`admin.auth().listUsers()` and `firebase auth:export`. So the script pages
through **every** account (1000/page) and filters on the date client-side. At
~307 accounts that's a single page and effectively instant; it stays fine into
the tens of thousands. If this project ever reaches hundreds of thousands of
users, move signup tracking into Firestore (write a doc on first login and query
it by date) rather than scanning Auth.

Because the filter is client-side, `--tz` is applied by formatting each
`createdAt` into a `YYYY-MM-DD` string in that zone and comparing strings — no
UTC-offset arithmetic, correct across DST.

### Alternative: the Firebase CLI

Same data, coarser:

```bash
firebase auth:export users.json --project elbrit-sso-d01d9 --format=json
```

That dumps every account (including password hashes) with no filtering, and
requires an interactive `firebase login` — which is exactly what fails for
`it@elbrit.org`. The script is the non-interactive path.

---

## PII

Output contains emails, phone numbers, display names and UIDs. `.gitignore`
covers `firebase-auth-*.csv`, `firebase-auth-*.json`, `elbrit-users.json` and
`*-firebase-adminsdk-*.json` — keep exports out of commits and don't leave them
in shared folders.
