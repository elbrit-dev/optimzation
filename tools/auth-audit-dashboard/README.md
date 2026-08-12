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

Four pages behind a fixed sidebar, each with its own URL (`#/employees`,
`#/permissions`) so a view can be bookmarked and a reload lands where you were.
Counts are live, and the **User permissions** badge turns red when a permission is
mis-assigned.

```
AUDIT                     MANAGE
  Overview                  User permissions
  Employees   ← 4 views
  Firebase accounts
```

It started as six pages and that was too many. Two consolidations:

- **Firebase** — "Today's created" was a *subset* of the same rows, so it is a
  `Created today` filter on **Firebase accounts** rather than its own page.
- **Employees** — "Still need to login", "ERP identity faults", "Employee / user
  link" and "Missing phone / email" all read the same rows (`report.employees`) and
  differ only in subset and columns, so they are tabs on one page.

Old links still resolve: `#/today` → Firebase, `#/pending` / `#/links` /
`#/contact` → Employees (landing on the right view), `#/coverage` → Overview.

Each page shows its views as a **tab strip** with live counts. They were briefly a
dropdown and that was wrong — the views became invisible.

### Layout

Sidebar fixed full-height. Page chrome (title, tabs, KPIs, filters) is pinned, and
**the table owns both scrollbars** — so the page itself never scrolls.

Getting there took four attempts, and the failures are worth not repeating:

| Attempt | What broke |
|---|---|
| `68vh` inner box | the box scrolled **and** the page scrolled — two competing scrollbars |
| content column scrolls | horizontal scroll dragged the whole layout sideways, KPIs included, and left a 16px band above the sticky header where rows showed through |
| table scrolls, but `.wrap { margin: 0 auto }` | **the table still could not be scrolled at all** — see below |
| table scrolls, `.wrap { width: 100% }` | works |

The third one is the interesting failure, because every check said it was fine.

An `auto` margin turns **off** a grid item's stretch alignment, so the item is
sized by `fit-content` — which is `max(min-content, available)`. The table's cells
are `nowrap`, so its min-content width was 1436px, and the wrap grew to 1486px
inside a 1208px grid track. 278px of table hung outside the viewport, clipped by
`overflow: hidden`, with nothing able to scroll it: `LAST ACTIVE` and `STATE` were
simply unreachable at any window size. Measuring `#view .scroll` said "no
overflow" — true, and useless, because the overflow had been pushed up to the
document. `document.scrollWidth > document.clientWidth` is the check that catches
it, and `selftest-ui.mjs` now makes it.

The fix is two rules: an explicit `width` on the wrap (so it resolves against the
grid track, not its content) and `min-width: 0` down the whole flex chain (a flex
item's automatic minimum size is its min-content width, so any box in the chain
will otherwise refuse to be narrower than the widest row and push the overflow
back up). Verified at 1440 / 1280 / 1024 / 768 / 390px: no page-level horizontal
scroll anywhere, the last column reachable on every view, the KPIs stationary
while the rows move, and the sticky header flush with the top of its box.

Cells truncate with an ellipsis (full text on hover, full value in the CSV) and
each view carries only the columns that earn their place, so most tables fit
outright. Everything dropped from a column is still reachable through Advanced
filters and **All fields** export.

### KPI cards are per page

Every page used to show the same nine cards, so the Firebase page led with
"missing company email" and no page had a headline. Each view now carries the four
or five numbers that answer *its* question and the rest are one click away. Cards
that can narrow or navigate are `role="button"`, focusable, and work from the
keyboard.

### Colour and contrast

Every foreground/background pair is measured against WCAG AA (4.5:1 for small
text) in **both** schemes rather than eyeballed, because three of them failed:

| Token | Was | Now |
|---|---|---|
| `--ink-3` on white (KPI hints, field labels, muted cells) | 2.83:1 | **5.03:1** |
| `--ink-3` on the dark panel | 3.70:1 | **5.79:1** |
| `--accent` on `--accent-soft` (the selected sidebar item) | 4.04:1 | **5.93:1** via a separate `--accent-ink` |

That "faded" look in light mode was not a style choice, it was a contrast bug. The
audit runs over the live page in both schemes, so it covers what is actually
rendered rather than what the stylesheet claims.

Sort state is a glyph as well as a colour, and carries `aria-sort`; the nav marks
the current page with `aria-current`; the loading and error region is an
`aria-live` status; and `prefers-reduced-motion` slows the spinner and drops
transitions.

### Narrow screens

Three breakpoints, and the table never widens the page at any of them:

- **≤1180px** — the rail narrows to 188px, since 232px is a lot of a 900px window.
- **≤860px** — the rail becomes a sticky top strip, the page takes back vertical
  scrolling (a flexed table would be a few rows tall), and nav items and buttons
  grow to a 44px touch target.
- **≤700px** — the tab strip becomes one horizontally scrolling row instead of
  wrapping to three, which had pushed the table most of a screen down.

Checked at 1440 / 1280 / 1024 / 768 / 390px.

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
| **can't tell** | no Employee record carries the *holder's* address, so there is nothing to compare the target against |
| **no such record** | `for_value` points at an Employee that no longer exists |
| **No employee perm** | user has no `Employee` permission at all — often why they can't see their own records |

**"can't tell" is not "self".** 35 live rows rendered a green *self* tick next to
another person's name, because the table treated anything that wasn't a mismatch as
correct and collapsed the unjudgeable case into it. They genuinely cannot be
decided from ERP: `arunkumar817.be@elbrit.org` → E00817 "Arunkumar M" is the same
person on a since-renamed login (the record now says `arunkumar.abm@`), while
`adhithan1011.be@elbrit.org` → E01263 "Sujith" is somebody else entirely. Guessing
between those by name similarity is exactly the inference that made the coverage
numbers wrong, so the page says it doesn't know and gives you a filter and a KPI to
work through them.

### Filtering

Search, plus **User**, **Department**, **Role** and a **Show** state filter. Role
and department come from the permission holder's own Employee record, which makes
"every Business Executive in Elbrit Chennai" a two-click question — 38 permissions
across that department, 8 of them ABMs.

The Department and Role dropdowns are narrowed by each other, so no combination can
be selected that returns an empty table. 229 permissions belong to users with no
Employee record at all and therefore have no role or department to filter on; they
are reachable through **Show › Holder has no Employee record** rather than being
silently unreachable.

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

## What each view answers

| Page / view | Question | Rows |
|---|---|---|
| **Overview** | How far along are we, and where is the gap? | pivot by department / role / branch |
| **Employees** › Still need to login | Who has not logged in yet, with role and department? | working employees with no confirmed login |
| **Employees** › ERP identity faults | Whose ERP identity is wrong, so their login state cannot be trusted? | working employees with a recycled, placeholder or duplicated login |
| **Employees** › Employee / user link | Where is the Employee↔ERP-User link broken? | working employees with no `user_id`, **plus** `Left` employees whose ERP login is still enabled |
| **Employees** › Missing phone or email | Whose contact details are incomplete? | working employees missing `company_email` **or** a phone anywhere |
| **Firebase accounts** | Every account that exists, and the employee it belongs to | all Firebase accounts; `Created today` is a filter |
| **User permissions** | Who can see whose data — and fix it | ERPNext User Permission records |

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
appears in Firebase. Every candidate is tried and the **strongest match wins** —
not the first one found:

| Rank | Source field | Matched against | Counts as a login? |
|---|---|---|---|
| 1 | `Employee.user_id` | Firebase email | ✅ that *is* the ERP login |
| 2 | `Employee.cell_number` | Firebase phone | ✅ **if `user_id` is set** — a number HR maintains |
| 3 | `User.mobile_no` ‖ `User.phone` (the *linked user*, joined via `user_id`) | Firebase phone | ✅ **if it agrees with `cell_number`** |
| 4 | `Employee.company_email` | Firebase email | ❌ signup only |
| 5 | `Employee.personal_email` | Firebase email | ❌ signup only |

Firebase emails from linked providers are indexed too, so a Google account whose
provider email differs from the top-level one still matches.

It used to stop at the first match, and that was wrong: when a stale User-record
phone sat above someone's own cell number in the list, they were attributed to the
predecessor's account and their own signup was never looked for. Six people were
mislabelled that way on live data — E01157 Ezaz Ahmed Mulla, E01249 Atul Yadav,
E01240 Kalidasan P among them — all of whom *had* signed up under their own number.

### One Firebase account, one employee

ERP recycles logins: when someone leaves, their `user_id` is handed to the
replacement and the User record keeps the **departed person's phone**. So two
employees can resolve to the same Firebase account, and every one of them used to
be counted as logged in.

Now the strongest claim keeps the account (their own ERP login beats their own
number, which beats a number only the User record carries) and every other
claimant is reported on **Employees › ERP identity faults** with a sentence naming
who the account actually belongs to. Four faults, all found in live ERP data:

| Fault | What it means | Live count |
|---|---|---|
| `inheritedPhone` | the linked User record's phone disagrees with the cell HR holds — it came from whoever held the login before | 1 |
| `placeholderLogin` | `user_id` is a `vacant…@elbrit.org` address left over from the previous holder of the territory | 7 |
| `duplicateLogin` | the same `user_id` sits on two employee records | 2 |
| `claimedByOther` | the matched account went to a stronger claimant | 0 |

Concrete cases, each verified against ERP and Firebase directly:

- **E01213 Hari Babu** carries `vacantramesh@elbrit.org`, whose User record holds
  `7010742975` — E00835 **Ramesh M's** number, and Ramesh's Firebase account. Hari
  Babu's own cell has no account: he has never signed in, and was reported as done.
- **E01219 Kamal B** carries `nickson1022.be@elbrit.org` (E01022 Nickson B, Left)
  and was credited with Nickson's account.
- **E01215 Harsh** carries `vacantjaiprakash@elbrit.org`. He *did* sign up, under
  his own number, on 2026-08-12 — but there is no ERP identity for that login to
  land on until HR issues him one, so the row says exactly that.
- **DE068 Boopathiraja C** and **DE028 Jananika S** (Left) share
  `jananikas.mis@elbrit.org`; **DE078 Murdhul R** and **DE062 Birat Kumar** (Left)
  share `birat@elbrit.org`.

Every one of these is an **ERP-side fix**. The dashboard's job is to stop reporting
them as covered and to say which record is wrong.

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
| **ERP login** | matched `user_id`, their own cell, or a linked-user phone that agrees with it | counts toward coverage |
| **ERP identity fault** | the evidence belongs to someone else, or the login is a placeholder | **ERP identity faults**, and **Still need to login** |
| **signed up, unconfirmed** | account matches a non-login address on their record | **Still need to login**, tagged |
| **never signed up** | no Firebase account at all | **Still need to login** |

The pending list breaks down into exactly those last three, counted from the rows
rather than subtracted from the total — `pending − unconfirmed − conflicts` was
wrong, because a duplicated login the person *does* hold is a fault but is not
pending. Live: **139 never signed up + 13 unconfirmed + 9 blocked by ERP = 161**.

Counting is conservative deliberately: a coverage number that is too low makes you
chase someone who is already fine, while one that is too high hides someone who
cannot get in.

On live data these corrections roughly cancel: employees move to *unconfirmed*,
while phone signups the User-record-only rule had missed are recovered. The
identity-fault pass then removed 3 more from the covered column (Hari Babu, Harsh,
Kamal B) and re-credited 5 accounts to their rightful owner, taking coverage from
**62% to 61%** — a smaller number that is now defensible person by person.

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
node tools/auth-audit-dashboard/selftest.mjs             # 90 — matching logic
node tools/auth-audit-dashboard/selftest-auth.mjs        # 19 — endpoint fails closed
node tools/auth-audit-dashboard/selftest-login.mjs       # 36 — password, session, gate
node tools/auth-audit-dashboard/selftest-permissions.mjs # 19 — permission analysis
node tools/auth-audit-dashboard/selftest-ui.mjs          # the rendered page (needs server.mjs up)
```

The two security suites exist because a regression there doesn't throw or look
broken — it just quietly starts serving the staff directory to anyone with the
URL. They assert that the endpoint refuses anonymous callers **even when
server-side credentials are present** (a real leak, found by that test), that a
tampered or expired session cookie is rejected, and that an unconfigured password
locks the site rather than opening it. Run both before any deploy; neither needs
credentials.

`selftest-ui.mjs` drives the actual page in a headless browser, because the report
being right does not mean the page shows it. It clicks every tab and KPI card and
asserts the table follows — which caught two bugs nothing else did: all six
Firebase tabs rendering as selected (counting a subset assigned to the same
`filters.extra` the `on` flag compared against, one line later), and clicking a
Firebase tab filtering nothing at all (`rows.filter(passesExtra)` hands `filter`'s
index argument straight into the function's second parameter). It skips instead of
failing when no browser or no local server is available.

90 checks: the normalisers, the vacant identifier (including that it does *not*
fire on `Pravacant Kumar`), each match path against **real Firebase accounts**
with employee and user fixtures shaped like the real ERP data (trailing
whitespace, `mobile_no` null with `phone` set, whitespace-only numbers, bare vs
E.164 phone, gmail personal address, empty `user_id`, a departed employee with an
enabled login and one correctly revoked), then every bucket, KPI and pivot —
including that tab 5's count is the *union* of both gaps and never the
intersection. Needs no ERP token.

The identity-fault rules have their own fixtures, each modelled on the live record
that exposed it: a User record whose phone disagrees with `cell_number` (must not
count, and the account goes to whoever owns the number), a `vacant…` login (must
not count even with no second claimant to give it away), and one `user_id` on two
employee records (both flagged, one credited). Plus the invariant that matters
most: **no Firebase account is ever credited to two employees**, and every
conflicted person still appears in the follow-up list rather than vanishing from
both columns.

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
