# Security: permissions v2 (branch `security/perm-v2`)

Status: on branch only. Not merged, not deployed. Each section is one fix, with
what changed for users and what still has to happen elsewhere.

Common pattern used by the fixes below ("caller-token pattern"):

- The browser sends the signed-in person's OWN ERP token ("token key:secret",
  from the component's bound `token` prop, else localStorage `token`) in the
  `x-erp-token` header - the convention `/api/erp/claim-file` and
  `/api/claims/check` already used. Client helper: `lib/userErpToken.js`.
- The route resolves who that is with ERP `frappe.auth.get_logged_user`
  (`resolveCaller` in `lib/erpServer.js`). Bad / expired / Guest token -> 401.
- Wherever possible the ERP call itself is made WITH the caller's token, so the
  ERP's own permissions apply. The service token is used only where a normal
  user's token cannot do the job, and then only after an explicit check.

## 1. `/api/erp/print` (payslip PDF)

Before: `GET /api/erp/print?employee=E0xxxx` listed that employee's Salary
Slips and streamed the PDF using the server's service token
(`NEXT_PUBLIC_GRAPHQL_AUTH_TOKEN_<TARGET>` via `erpConfig`). No caller check:
anyone who could reach the URL could download anyone's payslip by guessing an
employee id.

Now:
- Requires `x-erp-token`; missing -> 401.
- Caller resolved with `get_logged_user`; invalid -> 401, ERP unreachable -> 502.
- The slip lookup (GraphQL `SalarySlips`) AND `download_pdf` run with the
  caller's token. The service token is not used at all (only the endpoint URL is
  taken from env). ERP permission refusal -> 403; a list the ERP filters to
  nothing -> 404 "No payslips you can open were found for this employee."
- Client: `components/features/my-profile/erp-print/printClient.js` sends the
  token (`token` prop of MyProfileExperience, else localStorage `token`) and
  shows "Your sign-in has expired..." on 401.

Must verify on UAT before merge: a plain Employee-role user (field sales) can
read and print their OWN Salary Slip with their own token (Salary Slip read via
the Employee user permission). If the ERP role setup does not allow it,
payslip download breaks for those users until the ERP permission is added - do
not "fix" that by going back to the service token.

## 2. `/api/erp/profile-picture`

Before: GET read any user's picture for anyone; POST uploaded a file and
rewrote `User.user_image` (and `Employee.image`) for whatever `user` /
`employee` the request body named, using the service token. The only guard was
a same-origin check, which does not stop a signed-in (or not signed-in) person
on our own origin from replacing anyone's picture, or repainting any Employee
record's image.

Now (both methods need `x-erp-token`, resolved with `get_logged_user`):
- GET: any valid signed-in caller may read any user's picture (avatars of other
  people are legitimate). No token / bad token -> 401. The read still uses the
  service token, because a normal user cannot read another User doc.
- POST: allowed only when the caller IS the target `user` (case-insensitive),
  or the caller has the System Manager role (roles read from the caller's User
  doc with the service token; a failed read grants nothing). Otherwise 403
  "You can only change your own profile picture."
- The Employee mirror is written only when that Employee's `user_id` equals the
  target user; otherwise the User picture is still saved and a warning comes
  back. The writes themselves still use the service token (a normal user cannot
  write the Employee doc), but only after these checks. Same-origin check kept.
- Client (`pictureClient.js`, `useProfilePicture.js`): sends the token. With no
  token at all the avatar read is skipped (initials, as before for a failed
  read) and a save shows "Your sign-in has expired...".

## 3. Inventory: API routes and the ERP service token

`app/api/**` does not exist in this repo; all routes are `pages/api/**`.
"Service token" = `lib/erpServer.js` `resolveErpCredentials` / `erpConfig`
(env `ERP_API_TOKEN` or `NEXT_PUBLIC_GRAPHQL_AUTH_TOKEN_<TARGET>`), or a token
handed in from Plasmic props (`erpUrl` + `authToken` in the request body).

| Route | What it does | ERP credential | Checks the caller now? | Risk / note |
|---|---|---|---|---|
| `GET /api/erp/print` | Payslip PDF from ERP | Caller's token only (was: service) | Yes - fix 1 | Was HIGH (anyone's payslip). Fixed. |
| `GET/POST /api/erp/profile-picture` | Read / replace a user's avatar (+ Employee image) | Service token, after caller checks | Yes - fix 2 | Was HIGH (overwrite anyone's picture / Employee image). Fixed. |
| `GET /api/erp/claim-file` | Proxy an Expense Claim attachment | Caller's token (`x-erp-token`) | ERP decides | OK. Host allowlist, Frappe file path only. |
| `POST /api/claims/check` | AI-check bills on a claim, write scores | Reads with caller's token + Firebase ID token; writes with `ERP_AI_CHECKER_TOKEN[_UAT]` | Yes (claim must be readable by caller) | OK by design: the checker login is the only one the ERP lets write scores. Caller can trigger a re-check only of a claim they can read. |
| `POST /api/hr/login-help` | Pre-login "Can't log in?" ticket: reads Employee + User, creates/assigns an ERP Task | Service token (or Plasmic-prop pair) | No (pre-login by definition) | MEDIUM: public write (Task creation) gated only by an in-memory per-IP rate limit and dedupe. Response does not echo the Employee/User diagnosis. Not changed: there is no user token before login. Backend-side rate limiting / a captcha would be the real fix. |
| `POST /api/hr/ticket-status` | Pre-login: is there an open ticket for this employee id? | Service token (or Plasmic-prop pair) | No (pre-login) | LOW-MEDIUM: for an id with an open login ticket it returns the Task subject, which contains the employee's NAME ("Cannot log in: E0xxxx - Name") - an id-to-name oracle, rate limited per IP. Not changed (the form shows it); consider dropping `subject` from `publicTicket` for the login variant. |
| `POST /api/hr/designations` | Designation names for the login-help dropdown | Service token (or Plasmic-prop pair) | No (pre-login) | LOW: job titles only, cached, rate limited. |
| `POST /api/google-calendar/connect` | Exchanges a Google OAuth code, saves refresh token on the user's ERP "Google Calendar" doc | Caller's token, passed in the body (from the OAuth `state`) | ERP decides on the write | Was MEDIUM: `erpUrl` was unrestricted, so the server would POST the caller's token + Google refresh token to any URL (SSRF / exfiltration). Fixed here: `erpUrl` must be https on an allowed ERP host; missing token -> 401. Remaining: the user's ERP token travels inside the OAuth `state` parameter through Google (browser history, Google logs) - move to a server-side nonce later. |
| `GET /api/maintenance` | Maintenance switch from the Plasmic preview bundle | None (Plasmic project token) | n/a | LOW. Plasmic public project token has a hard-coded fallback in source (it is a public loader token anyway). |
| `GET /api/version` | Running core + Plasmic version | None (Plasmic project token) | n/a | LOW, same note. |
| `GET /api/manifest` | PWA manifest | None | n/a | None. |
| `GET /api/hello` | Next.js sample | None | n/a | None; can be deleted. |

Plasmic-prop tokens (`erpUrl` + `authToken` in the body of the three `hr/*`
routes): the host must be an allowed ERP host (`resolveErpCredentials`), so this
is not an SSRF. But any token bound to those props on a PUBLIC (pre-login) page
is shipped in the page to every visitor - keep those props EMPTY in Studio so
the env credential is used.

Outside `pages/api` but worth a separate decision (not changed here):
- The Firestore-backed `/tokens` registry (used by `components/DoctorPobDialog.jsx`
  `getEndpointConfigFromUrlKeyAsync`, the doctor pages and home overview) hands
  a shared ERP service credential to the BROWSER at runtime. Whatever that
  account may do, any signed-in user can do from devtools, and every POB it
  writes is owned by the integration account. Move those writes behind an API
  route using the caller-token pattern.

## 4. Login: send the Firebase ID token (flag `NEXT_PUBLIC_SEND_ID_TOKEN`, default OFF)

Where the login happens: the GraphQL `login` mutation is NOT in this repo's
code. It is the Plasmic Studio interaction bound to `FirebaseUIComponent`'s
`onSuccess` on the Login page; that step calls the backend `login` mutation
and stores the returned ERP key as localStorage `token`
(`lib/loginTelemetry.js` `loginErpDone` relies on that).

Code change (`components/FirebaseUIComponent.jsx`): `onSuccess` now receives
`{ firebaseUser, sendIdToken, idToken? }`.
- Flag off (default, and any value other than 1/true/yes/on): exactly
  `{ firebaseUser, sendIdToken: false }` - no ID token is read, nothing else
  changes. This build works against the current backend.
- Flag on: `idToken` = `await user.getIdToken()` and `sendIdToken: true`. A
  failed `getIdToken()` gives `sendIdToken: false` instead of blocking sign-in.
- Flag is build-time (`NEXT_PUBLIC_`, inlined); documented in `.env.example`,
  NOT added to `apphosting*.yaml`.

Studio change still needed (cannot be done from this repo): on the Login page
`onSuccess`, add a second login step that calls
`login(..., idToken: $data.idToken)` with "run only when" `$data.sendIdToken`,
and set "run only when" `!$data.sendIdToken` on the existing step. A static
GraphQL document that names `idToken` fails validation on the old backend even
with a null value, which is why it is two steps rather than one with an
optional variable. Publishing that Studio change is safe at any time because
the flag decides which step runs.

Order: (1) backend accepts optional `idToken` (live on UAT, then prod);
(2) Studio two-step change published; (3) set `NEXT_PUBLIC_SEND_ID_TOKEN=true`
and rebuild UAT, test, then prod; (4) only after every client sends it, the
backend may make `idToken` required. Turn the flag on ONLY after step 1 is live
on the ERP that build talks to.

## 5. Impersonation ("Switch to person")

Not removed. What actually happens today:

1. Who sees the Switch button: decided ONLY in the browser.
   `components/Impersonation.jsx` `isAllowed(me)` - department in
   `["IT - ELPL", "MIS - ELPL", "Marketing - ELPL"]` or designation
   `"Chief Executive Officer"` (defaults also in `plasmic-init.js`, global
   context props `allowedDepartments` / `allowedDesignations`), or already
   impersonating. Anyone can bypass this by opening the URL in step 2.
2. `switchTo(id, reason, name)` saves the person's own `token` in
   localStorage `elbrit.impersonation` and loads
   `/login/<id>/<name>/<reason>` (full page load). `id` = the target's ERP login
   (User id / email) or phone (`components/ImpersonateSwitch.jsx` `personId`).
3. That path is the Plasmic Studio **Login page**. On load it runs the backend
   GraphQL query **`userToken`** with the route's `id`; the backend looks the
   person up by User email / mobile_no / phone and returns THAT USER'S ERP API
   token ("key:secret"). The page stores it as localStorage `token`. From then
   on every ERP call is made as the target.
   - The same page is the normal login page: on every ordinary sign-in it runs
     `userToken("[id]")` (the literal placeholder) and fails with
     "User not found in ERPNext" (see `instrumentation-client.js`). So
     `userToken` is reachable BEFORE anyone has signed in, which means the
     Studio data query does not carry a user's own token, or carries a shared
     integration token. **Check in Studio which Authorization header the
     `userToken` operation sends.**
4. "Back to me" puts the saved own token back. Logout's
   `localStorage.clear()` drops everything.

What the backend must enforce (the browser cannot):
- `userToken` must require an authenticated caller identified by THEIR OWN
  credential - the caller's ERP token in Authorization (localStorage `token`)
  and/or a verified Firebase ID token - never a shared integration token and
  never anonymous.
- The caller must hold an explicit impersonation permission checked server-side
  (e.g. a dedicated role "Can Impersonate"); the department/designation list
  above is UI only. Refuse impersonating System Managers / Administrator, and
  log actor, target, reason on every call (the client already reports to
  Sentry, but that is client-controlled and can be suppressed).
- When the Studio query changes to send the caller's token, update the Login
  page so `userToken` sends `Authorization: <localStorage token>` - for a jump
  from A to B that is A's token, so the backend must resolve the REAL actor
  (e.g. keep a server-side impersonation session, or require the Firebase ID
  token, whose uid is the real person's) rather than trusting A.

Client change in this branch (`components/Impersonation.jsx`): a switch now
records what it is waiting for (`pending`: target, token before, previous
target). If the Login page leaves without storing a new token, or after 20 s on
the Login page with no new token, it:
- shows a banner "Could not switch to <target> - The ERP refused it or did not
  answer ... You are still signed in as before." with "Go back" (on the Login
  page) and "Dismiss";
- puts the previous state back (for a jump A -> B, still "impersonating A");
- reports "Impersonation: switch refused" to Sentry once.
A token that arrives after the 20 s still counts as a successful switch.
`$ctx.impersonation.failedTarget` / `.failedAt` and the global action
"Dismiss switch error" are available for a Studio-built message instead.
Known edge: switching to the account you are already on looks like a refused
switch (the token does not change).

## 6. `elbrit-users.json` (Firebase user export) removed from git

The file (Firebase Auth export with phone numbers and emails, ~63 KB, first
committed in `457c90f`) was tracked. `.gitignore` already listed it, but an
ignore rule does nothing for a file that is already tracked. Now
`git rm --cached` (the local copy is kept), so the existing ignore rule takes
effect. Nothing in the app imports it.

History is NOT rewritten: the file stays readable in every past commit and in
every existing clone/fork of `elbrit-dev/optimzation`. Purging it
(git filter-repo / BFG + force-push + everyone re-cloning + GitHub support for
cached views) is a separate decision. Treat the data as already exposed to
anyone who had repo access.

## Test steps (UAT, before merge)

Not run here: dependencies are not installed in this worktree, so no lint /
build. Changed `.js` files pass `node --check`; changed `.jsx` files parse with
acorn-jsx.

1. Payslip, own: sign in as a plain field-sales Employee -> My Profile ->
   Payslips -> download latest and one older month. Expect the same PDF as
   before. If 404/403 here, the ERP Salary Slip permission for the Employee
   role is missing - fix it in the ERP, not here.
2. Payslip, someone else's: `curl -H "x-erp-token: <your key:secret>"
   "/api/erp/print?employee=<other id>&latest=1"` -> 404/403. Without the
   header -> 401. With a garbage token -> 401.
3. Avatar read: My Profile shows the ERP picture as before. `GET
   /api/erp/profile-picture?user=<x>` without header -> 401; with any valid
   token -> 200 for any user.
4. Avatar write: change your own picture -> saved (User + Employee image).
   POST with your token but `user` = someone else -> 403. As a System Manager
   -> allowed. POST with your own user but another person's `employee` ->
   picture saved, warning, that Employee's image untouched.
5. Google Calendar connect from the planner still completes; a POST with
   `erpUrl` on another host -> 400.
6. Login with the flag unset: phone and Google sign-in work exactly as before.
   After the backend change + Studio two-step change, build UAT with
   `NEXT_PUBLIC_SEND_ID_TOKEN=true` and repeat; check the backend received
   `idToken`.
7. Impersonation: allowed user switches and returns as before. Switch to an
   unknown id (or, after the backend change, as a user without the
   permission) -> banner "Could not switch to ..." within 20 s or on leaving
   the Login page, still signed in as yourself; Sentry shows one
   "Impersonation: switch refused". A jump A -> B that fails leaves you as A.
8. `git status` in a clone: `elbrit-users.json` stays untracked/ignored.
