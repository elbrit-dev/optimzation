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
