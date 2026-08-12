# Account Audit Dashboard

Who in ERP hasn't created their login yet — with their role and department.

Compares **ERPNext Employees** against **Firebase Authentication accounts** and
shows the gap both ways. Run it whenever you need the numbers; no script editing.

Standalone by design: its own folder, zero npm dependencies, no build step. It
doesn't import from the Next app and the app doesn't know it exists.

```
tools/auth-audit-dashboard/
  lib/audit.mjs                    comparison logic — fetch, match, aggregate
  lib/permissions.mjs              User Permission list/create/delete + analysis
  lib/auth.mjs                     generic auth: PBKDF2 password + HMAC session
  lib/auth-secrets.mjs             password hash + session secret (generated)
  public/index.html                the dashboard
  public/login.html                the login page
  public/robots.txt                disallow all crawlers
  server.mjs                       local runtime: node HTTP on 127.0.0.1
  netlify/edge-functions/gate.mjs  auth gate — runs in front of everything
  netlify/functions/login.mjs      POST /api/login, /api/logout
  netlify/functions/report.mjs     POST /api/report
  netlify/functions/permissions.mjs  GET/POST/DELETE /api/permissions (writes ERP)
  set-password.mjs                 sets the login password (no env vars)
  set-credentials.mjs              stores the ERP token + Firebase key once
  netlify.toml                     config for its own Netlify site
  selftest.mjs                     76 checks — matching logic
  selftest-auth.mjs                19 checks — endpoint fails closed
  selftest-login.mjs               36 checks — password, session, cookie, gate
  selftest-permissions.mjs         19 checks — permission ownership rules
  start.cmd                        double-click launcher
  DEPLOY.md                        how it is deployed
```

Both runtimes share `lib/audit.mjs` and `public/index.html`, so local and
deployed can't drift apart.

---

## Running it locally

Double-click **`start.cmd`**, or:

```bash
node tools/auth-audit-dashboard/server.mjs
```

Then open **http://127.0.0.1:4820**. `Ctrl+C` to stop. No password locally — it
binds `127.0.0.1` only, so nothing outside the machine can reach it.

## Running it deployed

**https://elbrit-account-audit.netlify.app** — details in **[DEPLOY.md](DEPLOY.md)**.

**No environment variables.** Two independent layers guard it:

1. **Login.** An edge function verifies a signed session cookie *before* Netlify
   serves anything, so an unauthenticated visitor never receives `index.html`.
   Set the password with `node set-password.mjs --generate`, then redeploy.
2. **Credentials.** Stored once with `set-credentials.mjs`, so you sign in and the
   report just loads — no token or JSON to paste, on any device. The dashboard's
   own form still overrides them per browser if you want.

Both fail closed: no password configured → the gate locks the whole site; no
credentials anywhere → `428` before any upstream fetch. And stored credentials are
only usable with a valid session, verified inside the function as well as at the
edge, so losing one layer cannot expose them.

**Locally, first run asks for an ERP API token once.** Paste `api_key:api_secret`
into the page; it is verified against ERP before being saved to `erp-token.txt`
(gitignored) and reused on every later run. Get one from ERP → User → API Access
→ Generate Keys; it needs **read on Employee and on User**.

Non-secret defaults (Firebase project id, ERP URL, timezone, which employee
statuses count, port) live in the `CONFIG` block at the top of `lib/audit.mjs`.
Every value there reads an env var first and falls back to the default, but
**nothing requires env vars** — the deployed site gets its credentials from the
browser instead.

Secrets are never hardcoded: a service-account private key committed in that
file would ship inside the deployed function bundle and stay in git history
permanently, and it grants full admin over the whole Firebase project.
---

## Pages

A sidebar, not tabs. Each view is its own page with its own URL
(`#/pending`, `#/permissions`), so a view can be bookmarked or shared and a reload
lands where you were. The sidebar shows a live count per page, and the
**User permissions** badge turns red when there is a mis-assigned permission.

```
AUDIT                        MANAGE
  Today's created              User permissions
  Employee / user link
  Firebase authentications
  Still need to login
  Missing phone / email
  Total coverage
```

## User permissions — the only page that writes to ERP

Everything else in this tool reads. This page creates and deletes ERPNext
**User Permission** records, which changes what a real person can see, **immediately**.

- **Create** — pick an ERP user and a doctype, and the value box autocompletes from
  the real records (954 employees, say). Choosing a user pre-fills *their own*
  Employee id, since that is the permission people actually need.
- **Delete** — per row, and it names the exact user and value in the confirmation
  rather than asking a generic "are you sure?". Deletion is always by exact
  permission id; there is no filter-based delete, deliberately.
- **Export CSV** of the filtered rows, same as the audit pages.

### What it flags

A `User Permission` with `allow = Employee` points a user at one Employee record.
If that record belongs to **someone else**, that person can see another
employee's data. On live data: **9 of 1,327** permissions.

| Flag | Meaning |
|---|---|
| **wrong person** | the target Employee record belongs to a different user |
| **no such record** | `for_value` points at an Employee that no longer exists |
| **No employee perm** | user has no `Employee` permission at all — often why they can't see their own records |

**Ownership is judged by `user_id`, not record id** — and that distinction matters.
Comparing ids alone flagged 12, of which 3 were wrong: a user's `user_id` can sit
on more than one Employee record, either a vacant placeholder (`ajay959` is on both
`E00959` and `Vacant_Ajay Giri V01745`) or a duplicate (`birat@elbrit.org` on
`DE062` and `DE078`). Those are ERP data faults but nobody is seeing another
person's data, so they don't count. `selftest-permissions.mjs` pins both cases —
a false positive here would push you into revoking a correct permission.

### The ERP token needs write access

`User Permission` create/delete requires write scope. If the token is read-only,
ERP answers **403** and the page surfaces that verbatim, saying the token needs
write access — rather than failing vaguely.

## The six audit pages

| # | Page | Question | Rows |
|---|---|---|---|
| 1 | **Today's created** | Which Firebase accounts were created today, and did each match an employee? | Firebase accounts, `createdAt` = today |
| 2 | **Employee / user link** | Where is the Employee↔ERP-User link broken? Two faults in one place. | working employees with no `user_id`, **plus** `Left` employees whose ERP login is still enabled |
| 3 | **Firebase authentications** | Every account that exists, with the employee it belongs to (or "no match"). | all Firebase accounts |
| 4 | **Still need to login** | The follow-up list — who hasn't logged in yet, with role and department. | working employees with no confirmed login |
| 5 | **Missing phone / email** | Whose contact details are incomplete? | working employees missing `company_email` **or** a phone number anywhere |
| 6 | **Total coverage** | How far along are we, and where's the gap? | pivot by department / role / branch |

KPI cards are clickable and land on the matching tab; "Left, login active" lands
on tab 2 pre-narrowed to that problem. Every table sorts by any column, filters
by department / role / branch, and free-text searches (including partial phone
numbers).

### Filtering and export

**Quick filters** — search box, department / role / branch, and a per-tab filter
of the states that matter for that tab.

**Advanced** — a condition builder, for anything the quick filters don't cover:

- Any field on the row, not just the visible columns. `Matched on`, `Firebase UID`,
  `Employee cell`, `Relieving date` and the rest are all filterable.
- Operators suit the field, inferred from the data: text gets *contains / is /
  starts with / is empty*, booleans get *is yes / is no*, numbers get *= > <*, and
  dates get *on / before / after*.
- **Match all** or **match any** across conditions.
- Value boxes autocomplete from the distinct values actually present.
- Conditions are kept **per tab**, so switching tabs and back doesn't discard a set
  you built. Quick filters still reset, as before.
- A newly added condition is inert until you choose an operator — otherwise adding
  one would instantly empty the table.

Dates compare as `YYYY-MM-DD` prefixes, which sort lexicographically, so a
timestamp column compares correctly against a plain date with no parsing.

**Export** — two buttons, both exporting *exactly what the table is showing*:
same rows, same order, every filter applied including advanced conditions.

| Button | Columns |
|---|---|
| **Export CSV** | the visible ones |
| **All fields** | every field on the row (~40 vs ~11) |

Filenames say what they contain:
`account-audit-pending-filtered-allfields-2026-08-12-12-07.csv`. The `filtered`
marker appears whenever the export is a subset, so you can tell two downloads
apart later.

Exports carry a UTF-8 BOM so Excel reads non-ASCII names correctly, booleans come
out as `yes`/`no`, and a value starting with `=`, `+`, `-` or `@` is prefixed with
`'` so Excel can't treat a phone number or a `-` as a formula.

Verified on all six tabs: exported row count matches the visible table, unfiltered
and filtered.

### Tab 2 holds two different faults

Both are about the ERP link being wrong rather than about Firebase, which is why
they share a tab. The **Problem** column says which:

- **No user link** — a working employee with an empty `Employee.user_id`. Nothing
  to sign in with; the fix is in ERP, not Firebase. Note this includes people who
  *do* have a Firebase account matched on `company_email` or phone — the account
  works but the ERP link is still missing, which breaks anything keyed on
  `user_id`, so it's worth fixing either way.
- **Left but login still active** — status `Left` and the ERP User is still
  `enabled`. Should have been revoked at exit. Shows relieving date and last ERP
  login.

### Tab 5 is "missing either", not "missing both"

Deliberately, because of how the real data sits: **empty `company_email` is
pervasive** across field staff, while missing phones cluster in manager accounts.
A strict AND would risk rendering a near-empty table and hiding the real gap.

So the tab lists anyone missing either, the **Missing** column says which, and
`Missing BOTH phone and company email` is its own filter and KPI — sorted to the
top of the table — because that's the case that leaves someone with no route in
at all. It's the number to watch even when it's zero.

Emptiness is judged **after normalising**, not on the raw string: ERP holds
whitespace-only values (`"   "`, `" 9659824225"`) that look populated and that an
ERP-side `= ""` filter would never catch. The columns also show `user_id` and
`personal_email` so you can see whether the person is still reachable despite the
gap.

### Other flags

- **Never signed in** — account exists but `lastLoginAt` is empty (filter on tab 3).
- **No employee match** — a Firebase account nothing in ERP claims. `@elbrit.org`
  ones are tagged `internal` and worth a second look; a random gmail is more
  likely a doctor or external.
- **Shared login** — one Firebase account matched to two or more employees.
  Usually duplicate employee records or a genuinely shared login. It makes
  coverage slightly optimistic, so it's flagged rather than hidden.

---

## Vacant records are excluded everywhere

Vacant placeholders represent **open territories, not people**, and they would
badly distort every number if counted: most carry status `Active`, and many carry
a real `user_id` inherited from whoever left.

They're identified by `employee_name` starting with "Vacant" — `Vacant_Aeru
Ramulu (E01137)`, `Vacant-Vinoth Kannan`, `Vacant_BE_Ayodhya` (underscore, hyphen
or space all occur).

**The name is the reliable signal, not the employee ID.** Every `V`-prefixed ID
(`V02014`) is vacant, but plenty of vacant records carry ordinary IDs — `E00993`,
`HR-EMP-00176`, `HR/00158`. Filtering on the `V` prefix alone would silently miss
those. The pattern is anchored at the start of the name so a real surname
containing the letters can never trip it (covered by the self-test).

The header shows how many were excluded, so the headcount always reconciles.

## Which employees count

- **Working** = status in `CONFIG.workingStatuses` (default `Active`). Only these
  appear in "Still need to login" and in coverage percentages.
- **All statuses are still fetched**, because tab 2 needs `Left` employees to
  catch logins that were never revoked.
- The header reads `230 active employees (254 incl. left, 137 vacant excluded)`
  so it's always clear which denominator a number uses.

## How the matching works

An employee counts as registered if **any** credential they could sign in with
appears in Firebase. Checked in this order, first hit wins, most authoritative
first:

| Order | Source field | Matched against | Counts as a login? |
|---|---|---|---|
| 1 | `Employee.user_id` | Firebase email | ✅ that *is* the ERP login |
| 2 | `User.mobile_no` ‖ `User.phone` (the *linked user*, joined via `user_id`) | Firebase phone | ✅ |
| 3 | `Employee.cell_number` | Firebase phone | ✅ **but only if `user_id` is set** |
| 4 | `Employee.company_email` | Firebase email | ❌ signup only |
| 5 | `Employee.personal_email` | Firebase email | ❌ signup only |

Firebase emails from linked providers are indexed too, so a Google account whose
provider email differs from the top-level one still matches.

### "Has an account" is not the same as "matched their ERP login"

A match is only counted toward coverage when it is on the identity ERP knows the
person by — `user_id`, or the phone on that same ERP User record.

Matching on `company_email` or `personal_email` proves something weaker: a
Firebase account exists carrying an address we hold for that person. Concretely,
employee E01257 "Sreejith K" has a Firebase account under `sreejith17k@gmail.com`,
which is exactly their `personal_email` in ERP — so the signup is almost certainly
theirs. But that address is not an ERP User, and it is not the address their
`user_id` names (`nishad936.be@elbrit.org`, itself a data fault — see below).

**What is NOT known: whether such an account can actually use the app.**

- Supporting "it can't":
  [`lib/loginDiagnostics.js`](../../lib/loginDiagnostics.js) says a login is mapped
  onto an ERP User via `Employee.user_id` — *"until then the app has no ERP account
  to map the login onto"* — and none of these addresses is an ERP User.
- Against it: the app's ERP token is **shared per environment**, not per user
  (Firestore `tokens/{ERP|DEV}`), and the code that resolves a Firebase login to
  an ERP identity is **not in this repo** — it lives in Plasmic. A Firestore check
  of the `users` collection was inconclusive (0 of 14 unconfirmed accounts had a
  doc, but only 1 of 12 known-good logins did either — that collection is stale
  legacy, still carrying `provider: microsoft.com`).

So the dashboard reports the **fact** and does not pass judgement:

| State | Meaning | Where it lands |
|---|---|---|
| **ERP login** | matched `user_id` or the linked user's phone | counts toward coverage |
| **signed up, unconfirmed** | account matches a non-login address on their record | **Still need to login**, tagged |
| **never signed up** | no Firebase account at all | **Still need to login** |

Counting is conservative deliberately: a coverage number that is too low makes you
chase someone who is already fine, while one that is too high hides someone who
cannot get in.

On live data the two corrections nearly cancel out — 13 employees moved to
*unconfirmed*, while 15 phone signups were recovered that the User-record-only
phone rule had missed. Coverage lands at **50%**, the same figure as before both
fixes but now for defensible reasons rather than by accident.

**To settle it definitively:** ask one of the 14 (say Sreejith K) to try signing in
with their gmail. If it works, flip these to counting as covered. If it doesn't,
the label can harden to "cannot log in".

The Firebase-side tabs show the same three states rather than a binary
linked/unlinked, since "linked" alone was the misleading part.

### Phone: the linked User record first, then the Employee cell

Both are checked, and this is not optional — **reading only the linked User record
reported 18 real logins as pending** on live data.

`E01257 "Sreejith K"` is the case that exposed it. His ERP User
`nishad936.be@elbrit.org` is a **recycled login**: `full_name` was updated to him,
but `phone` still held `9895551121` from his predecessor and `last_login`
(2026-01-25) predates his own joining date (2026-07-13). His real cell,
`8921442251`, does have a Firebase account — created and signed in. Reading only
the User record missed it entirely.

Of those 18, **14 linked User records held no phone at all** and 4 held a stale
number. `cell_number` is HR-maintained and current; the User record's phone
frequently is neither. For a phone signup there is no email involved, so a
Firebase account under the number HR holds for someone is direct evidence they
signed up.

**Both User fields must be read too.** `mobile_no` is null on a large share of
enabled users while `phone` carries the number; where both are set they agree. So
it's `mobile_no || phone`. Values arrive with stray whitespace (`" 9659824225"`),
so everything is normalised first.

**A cell match still needs a `user_id`.** Without one there is no ERP account for
the login to land on, so it counts as found-but-not-working and shows on tab 2 as
`no user link` — that being the thing to fix first.

**"No phone" means no number anywhere**, not merely absent from the User record.
Flagging the 62 people whose number lives only on the Employee record would send
you chasing something HR already has; that narrower case is the `copy to user`
tag, counted by `phoneOnEmployeeOnly`. Under this rule exactly **1** active
employee has no number at all — which matches a direct ERP query, a useful
cross-check.

If the `User` doctype can't be read, phone becomes *unknown* rather than
"missing": the column shows `n/a`, nobody is falsely flagged, and the header warns.

Normalisation exists because the real data is messy, and all of it is covered by
`selftest.mjs`:

- Emails are trimmed and lowercased — ERP stores `"gowthamd.scm@elbrit.org "`
  with a trailing space.
- Phones compare on the **last 10 digits**, so `+91 98434 11231`, `09843411231`
  and `9843411231` all collide.
- `personal_email` really matters: plenty of staff signed in with a personal
  gmail, which no `@elbrit.org` lookup would ever find.
- Department names get their ` - ELPL` company suffix stripped for display.

`selftest.mjs` pins the phone rule from both directions: a number on the linked
user matches even when `cell_number` holds a *different* number, and the same
Firebase number sitting only on `cell_number` does **not** match.

### Verifying it

```bash
node tools/auth-audit-dashboard/selftest.mjs        # 73 — matching logic
node tools/auth-audit-dashboard/selftest-auth.mjs   # 17 — endpoint fails closed
node tools/auth-audit-dashboard/selftest-login.mjs  # 36 — password, session, gate
```

The two security suites exist because a regression there doesn't throw or look
broken — it just quietly starts serving the staff directory to anyone with the
URL. They assert that the endpoint refuses anonymous callers **even when
server-side credentials are present** (a real leak, found by that test), that a
tampered or expired session cookie is rejected, and that an unconfigured password
locks the site rather than opening it. Run both before any deploy; neither needs
credentials.

76 checks: the normalisers, the vacant identifier (including that it does *not*
fire on `Pravacant Kumar`), each match path against **real Firebase accounts**
with employee and user fixtures shaped like the real ERP data (trailing
whitespace, `mobile_no` null with `phone` set, whitespace-only numbers, bare vs
E.164 phone, gmail personal address, empty `user_id`, a departed employee with an
enabled login and one correctly revoked), then every bucket, KPI and pivot —
including that tab 5's count is the *union* of both gaps and never the
intersection. Needs no ERP token.

---

## Caveats

- **Firebase Auth has no server-side date filter.** `accounts:batchGet` is the
  only list endpoint, so the server pages through every account and compares in
  memory. Instant at ~300 accounts, fine into the tens of thousands.
- **A match is inference, not proof.** Matching on `personal_email` or
  `cell_number` means "an account exists using a credential we have on file for
  this person". The *Matched on* column always shows which one, so you can judge.
- **Report is cached 60s.** **Refresh** forces a refetch (`CONFIG.cacheSeconds`).
- **Tab 2 needs read access on the `User` doctype.** Without it the "left but
  login still active" half can't be computed — the header shows a warning, the
  ERP-login columns read `n/a`, and everything else still works.
- **CSV exports raw values**, not the rendered badges — so the ERP-login column
  exports `true`/`false`/empty rather than enabled/disabled/no-user.

## PII

Every view contains staff emails, phone numbers and names. `.gitignore` covers
`account-audit-*.csv` and `erp-token.txt`. Don't commit exports or leave them in
shared folders.

## Related

[`scripts/firebase-auth-users.mjs`](../../scripts/firebase-auth-users.mjs) is the
CLI counterpart — Firebase-only, no ERP, good for piping into `jq`. Documented in
[`scripts/README-firebase-auth-users.md`](../../scripts/README-firebase-auth-users.md).
