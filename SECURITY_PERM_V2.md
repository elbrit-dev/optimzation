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
