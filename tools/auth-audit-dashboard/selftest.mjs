#!/usr/bin/env node
/**
 * Exercises the ERP↔Firebase matching against REAL Firebase accounts plus
 * employee fixtures shaped like the real ERP data — including the quirks that
 * actually exist in it: trailing whitespace in company_email, bare 10-digit
 * cell_number vs E.164, gmail personal_email, and an empty user_id.
 *
 * No ERP token needed. Run: node tools/auth-audit-dashboard/selftest.mjs
 */

import { buildReport, fetchFirebaseUsers, normPhone, normEmail, isVacant } from './lib/audit.mjs'

let failures = 0
const check = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `\n        expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`}`)
}

// ── normalizers ──────────────────────────────────────────────────────
console.log('\nNormalizers')
check('E.164 -> last 10', normPhone('+919843411231'), '9843411231')
check('bare 10 unchanged', normPhone('9843411231'), '9843411231')
check('leading 0 stripped', normPhone('09843411231'), '9843411231')
check('spaced E.164', normPhone('+91 98434 11231'), '9843411231')
check('trailing space email', normEmail('gowthamd.scm@elbrit.org '), 'gowthamd.scm@elbrit.org')
check('uppercase email', normEmail('Rajkumar@Elbrit.org'), 'rajkumar@elbrit.org')

// ── matching, against live Firebase accounts ─────────────────────────
console.log('\nFetching real Firebase accounts…')
const firebaseUsers = await fetchFirebaseUsers()

// Pick real accounts to build fixtures around, so the test proves matching on
// data that actually exists rather than data invented to pass.
const realGoogle = firebaseUsers.find((u) => u.email?.endsWith('@elbrit.org'))
const realGmail = firebaseUsers.find((u) => u.email?.endsWith('@gmail.com'))
const realPhone = firebaseUsers.find((u) => u.phoneNumber && !u.email)
if (!realGoogle || !realGmail || !realPhone) {
  console.error('Could not find one of each account shape in Firebase — aborting.')
  process.exit(1)
}
console.log(`  using: ${realGoogle.email} / ${realGmail.email} / ${realPhone.phoneNumber}\n`)

const employees = [
  // 1. matches on user_id, with the case mangled
  { name: 'T001', employee_name: 'Login Email Match', user_id: realGoogle.email.toUpperCase(),
    company_email: '', personal_email: '', cell_number: '', designation: 'Manager',
    department: 'Sales - ELPL', status: 'Active', branch: 'HO' },
  // 2. no user_id; matches on company_email carrying a trailing space
  { name: 'T002', employee_name: 'Company Email Match', user_id: '',
    company_email: `${realGoogle.email} `, personal_email: '', cell_number: '',
    designation: 'Manager', department: 'Sales - ELPL', status: 'Active', branch: 'HO' },
  // 3. matches only on a personal gmail
  { name: 'T003', employee_name: 'Personal Email Match', user_id: 'nobody.t003@elbrit.org',
    company_email: '', personal_email: realGmail.email, cell_number: '',
    designation: 'Business Executive', department: 'Elbrit Kerala - ELPL', status: 'Active', branch: 'Field Sales' },
  // 4. phone match — the number lives on the LINKED USER record (see erpUsers
  //    below), NOT on cell_number, which deliberately holds a different number
  //    to prove the employee field is no longer consulted for matching.
  { name: 'T004', employee_name: 'Phone Match', user_id: 'phone.t004@elbrit.org',
    company_email: '', personal_email: '', cell_number: '9111111111',
    designation: 'Business Executive', department: 'Elbrit Mysore - ELPL', status: 'Active', branch: 'Field Sales' },
  // 4b. the Firebase number sits on cell_number but there is NO user_id — the
  //     signup is found, yet there is no ERP account for it to land on.
  { name: 'T004B', employee_name: 'Employee Cell No Link', user_id: '',
    company_email: '', personal_email: '', cell_number: normPhone(realPhone.phoneNumber),
    designation: 'Business Executive', department: 'Elbrit Mysore - ELPL', status: 'Active', branch: 'Field Sales' },
  // 4c. THE REGRESSION THIS GUARDS: linked User record carries a STALE phone
  //     (a recycled login), while cell_number holds the real one that actually
  //     signed up. Reading only the User record reported 18 such people as
  //     pending on live data — E01257 "Sreejith K" among them.
  { name: 'T004C', employee_name: 'Stale User Phone', user_id: 'stale.t004c@elbrit.org',
    company_email: '', personal_email: '', cell_number: normPhone(realPhone.phoneNumber),
    designation: 'Business Executive', department: 'Elbrit Mysore - ELPL', status: 'Active', branch: 'Field Sales' },
  // 5. genuinely absent everywhere -> must land in "no account yet"
  { name: 'T005', employee_name: 'Truly Missing', user_id: 'ghost.t005@elbrit.org',
    company_email: '', personal_email: 'ghost.t005@gmail.com', cell_number: '',
    designation: 'Area Business Manager', department: 'Elbrit Delhi - ELPL', status: 'Active', branch: 'Field Sales' },
  // 6. no user_id at all -> pending AND flagged as ERP-side blocked
  { name: 'T006', employee_name: 'No Login Email', user_id: '', company_email: '',
    personal_email: '', cell_number: '9000000002', designation: 'Business Executive',
    department: 'Elbrit Delhi - ELPL', status: 'Active', branch: 'Field Sales' },
  // 7. departed, but the ERP login is still enabled -> must surface on the link tab
  { name: 'T007', employee_name: 'Left But Enabled', user_id: 'left.t007@elbrit.org',
    company_email: '', personal_email: '', cell_number: '9000000003',
    designation: 'Business Executive', department: 'Elbrit Delhi - ELPL',
    status: 'Left', relieving_date: '2026-06-30', branch: 'Field Sales' },
  // 8. departed and correctly revoked -> must NOT surface
  { name: 'T008', employee_name: 'Left And Revoked', user_id: 'left.t008@elbrit.org',
    company_email: '', personal_email: '', cell_number: '9000000004',
    designation: 'Business Executive', department: 'Elbrit Delhi - ELPL',
    status: 'Left', relieving_date: '2026-05-31', branch: 'Field Sales' },
  // 9. whitespace-only contact fields — these LOOK present on the raw string and
  //    an ERP `= ""` filter would miss them, so they must count as missing.
  { name: 'T009', employee_name: 'Whitespace Contacts', user_id: 'ws.t009@elbrit.org',
    company_email: '   ', personal_email: '', cell_number: '  ',
    designation: 'Regional Manager', department: 'Sales - ELPL',
    status: 'Active', branch: 'HO' },
  // 10. fully populated contacts -> must NOT appear on the contact tab
  { name: 'T010', employee_name: 'Complete Contacts', user_id: 'ok.t010@elbrit.org',
    company_email: 'ok.t010@elbrit.org', personal_email: 'ok.t010@gmail.com',
    cell_number: '9000000010', designation: 'Regional Manager',
    department: 'Sales - ELPL', status: 'Active', branch: 'HO' },
]

const erpUsers = [
  // mobile_no null but phone populated — the dominant real shape, and the reason
  // reading mobile_no alone would miss most numbers
  { name: 'phone.t004@elbrit.org', enabled: 1, user_type: 'System User', full_name: 'Phone Match',
    mobile_no: null, phone: normPhone(realPhone.phoneNumber), last_login: '' },
  { name: 'left.t007@elbrit.org', enabled: 1, user_type: 'System User', full_name: 'Left But Enabled',
    mobile_no: '9000000003', phone: '9000000003', last_login: '2026-06-28 10:00:00' },
  { name: 'left.t008@elbrit.org', enabled: 0, user_type: 'System User', full_name: 'Left And Revoked',
    mobile_no: '', phone: '', last_login: '' },
  // leading whitespace, as ERP really stores it
  { name: 'ws.t009@elbrit.org', enabled: 1, user_type: 'System User', full_name: 'Whitespace Contacts',
    mobile_no: ' 9659824225', phone: null, last_login: '' },
  { name: 'ok.t010@elbrit.org', enabled: 1, user_type: 'System User', full_name: 'Complete Contacts',
    mobile_no: '9000000010', phone: '9000000010', last_login: '' },
  // stale phone from a recycled login — must not stop the cell_number match
  { name: 'stale.t004c@elbrit.org', enabled: 1, user_type: 'System User', full_name: 'Stale User Phone',
    mobile_no: null, phone: '9899999999', last_login: '2026-01-25 11:47:37' },
  // user exists but both number fields are whitespace-only -> counts as missing,
  // even though `mobile_no != ""` would match them ERP-side
  { name: 'ghost.t005@elbrit.org', enabled: 1, user_type: 'System User', full_name: 'Truly Missing',
    mobile_no: '   ', phone: '  ', last_login: '' },
]

const report = buildReport({ firebaseUsers, employees, erpUsers, tz: 'Asia/Kolkata', vacantCount: 42 })
const byId = Object.fromEntries(report.employees.map((e) => [e.employeeId, e]))

console.log('Usable vs unusable logins')
// What this pins: a match on an address that is NOT the ERP login (user_id)
// must not count toward coverage. Real case that exposed it: E01257
// "Sreejith K" matched sreejith17k@gmail.com via personal_email and was
// reported as a registered login.
//
// Whether such an account can actually USE the app is unverified — the
// Firebase->ERP resolution lives in Plasmic, not this repo — so the dashboard
// reports which credential matched and counts conservatively rather than
// asserting the account is broken.
check('personal-email match is unconfirmed, not counted as a login',
  [byId.T003.hasAccount, byId.T003.loginUsable, byId.T003.accountUnconfirmed],
  [true, false, true])
check('company-email match (differs from user_id) also unconfirmed',
  [byId.T002.hasAccount, byId.T002.loginUsable], [true, false])
check('user_id match IS usable', [byId.T001.hasAccount, byId.T001.loginUsable], [true, true])
check('linked-user phone match IS usable', [byId.T004.hasAccount, byId.T004.loginUsable], [true, true])
check('unconfirmed signups still counted as needing to login',
  report.stillNeedLogin.some((r) => r.employeeId === 'T003'), true)
check('usable logins are not in the pending list',
  report.stillNeedLogin.some((r) => r.employeeId === 'T001'), false)
check('coverage counts only usable logins', report.kpis.registered,
  report.employees.filter((r) => r.working && r.loginUsable).length)
check('unconfirmedSignups bucket matches the flag', report.kpis.unconfirmedSignups,
  report.employees.filter((r) => r.working && r.accountUnconfirmed).length)
check('firebase account tied to a non-login address is flagged, not plain linked',
  (() => { const a = report.firebaseAll.find((u) => u.uid === byId.T003.uid); return [a.linked, a.linkUsable] })(),
  [true, false])

console.log('\nMatching')
check('T001 user_id (case-insensitive)', [byId.T001.hasAccount, byId.T001.matchedVia], [true, 'ERP login email'])
check('T002 company_email (trailing space)', [byId.T002.hasAccount, byId.T002.matchedVia], [true, 'Company email'])
check('T003 personal gmail', [byId.T003.hasAccount, byId.T003.matchedVia], [true, 'Personal email'])
check('T004 matches on the LINKED USER phone', [byId.T004.hasAccount, byId.T004.matchedVia], [true, 'ERP user phone'])
check('T004 phone shown is the user record, not cell_number',
  [byId.T004.phone, byId.T004.employeeCell], [normPhone(realPhone.phoneNumber), '9111111111'])
// A cell_number signup IS found, but without a user_id there is no ERP account
// for it to land on, so it does not count as a working login.
check('cell match with no user_id: found, but not a usable login',
  [byId.T004B.hasAccount, byId.T004B.loginUsable, byId.T004B.noUserLink],
  [true, false, true])
// The 18-false-negative regression: stale User phone must not hide a real signup.
check('stale User phone does not hide a cell_number signup',
  [byId.T004C.hasAccount, byId.T004C.loginUsable, byId.T004C.matchedVia],
  [true, true, 'Employee cell'])
check('  and the stale number is what the User record held',
  [byId.T004C.phone, byId.T004C.employeeCell],
  ['9899999999', normPhone(realPhone.phoneNumber)])
check('linked-User phone still wins when it is correct', byId.T004.matchedVia, 'ERP user phone')
check('user phone reads mobile_no when phone is null', byId.T009.phone, '9659824225')
check('user phone falls back to phone when mobile_no is null', byId.T004.phone, normPhone(realPhone.phoneNumber))
check('whitespace-only user number counts as missing',
  [byId.T005.phone, byId.T005.noPhone], ['', true])
check('no linked user -> phone falls back to the employee cell',
  [byId.T006.phone, byId.T006.noPhone, byId.T006.phoneFromUserRecord],
  ['9000000002', false, false])
check('T005 correctly unmatched', byId.T005.hasAccount, false)
check('T006 unmatched + flagged', [byId.T006.hasAccount, byId.T006.noUserLink], [false, true])
check('T001 carries the real UID', byId.T001.uid, realGoogle.localId)
check('role + department surfaced', [byId.T005.role, byId.T005.department], ['Area Business Manager', 'Elbrit Delhi'])

console.log('\nVacant exclusion (the identifier itself)')
// Real shapes seen in ERP: V-prefixed IDs, ordinary IDs, and both separators.
for (const [nm, want] of [
  ['Vacant_Aeru Ramulu (E01137)', true],
  ['Vacant-Vinoth Kannan', true],
  ['Vacant_BE_Ayodhya', true],
  ['vacant_lowercase', true],
  ['Rajkumar N', false],
  ['Nishanth S Kumar', false],
  // must not fire on a real name that merely contains the letters
  ['Pravacant Kumar', false],
]) check(`isVacant(${JSON.stringify(nm)})`, isVacant({ employee_name: nm }), want)

console.log('\nBuckets')
// Working = Active only. T007/T008 are Left, so they leave the denominator.
check('working employees', report.kpis.workingEmployees, 10)
check('total incl. left', report.kpis.totalEmployees, 12)
// Only T001 (user_id) and T004 (linked-user phone) are usable logins now.
// T001 (user_id), T004 (linked-user phone), T004C (employee cell).
check('registered counts usable logins only', report.kpis.registered, 3)
// +T002 and +T003: they signed up, but with identities that cannot log in.
check('still need to login', report.kpis.stillNeedLogin, 7)
check('coverage % over working only', report.kpis.coverage, 30)
check('vacant count passed through', report.vacantExcluded, 42)

// Both T002 and T006 have an empty user_id. T002 already signed in (matched on
// company_email) but the ERP link is still missing, which is its own data fault
// worth fixing — so it belongs here even though it isn't pending.
check('noUserLink counts every working employee with no link', report.kpis.noUserLink, 3)
check('T002 is listed despite having an account', [byId.T002.noUserLink, byId.T002.hasAccount], [true, true])
check('left with still-active login', report.kpis.leftWithActiveUser, 1)
check('revoked left employee excluded', report.linkIssues.some((r) => r.employeeId === 'T008'), false)
check('link tab holds both problems', report.kpis.linkIssues, 4)
check('link issues labelled', report.linkIssues.map((r) => `${r.employeeId}:${r.issue}`),
  ['T002:No ERP user link', 'T004B:No ERP user link', 'T006:No ERP user link', 'T007:Left but login still active'])
check('erp last login surfaced', byId.T007.erpLastLogin, '2026-06-28 10:00')

console.log('\nMissing contact details')
// T009: whitespace-only company_email, but its user record carries a number with
// a leading space — that IS a usable phone, so only the email is missing.
check('whitespace-only company_email counts as missing',
  [byId.T009.noCompanyEmail, byId.T009.noPhone], [true, false])
check('T009 missing email only', report.missingContact
  .find((r) => r.employeeId === 'T009').missing, 'company email')
check('populated contacts not flagged',
  [byId.T010.noCompanyEmail, byId.T010.noPhone], [false, false])
check('complete employee absent from the tab',
  report.missingContact.some((r) => r.employeeId === 'T010'), false)
// T005 misses both: whitespace-only company_email and whitespace-only user phone
check('T005 flagged as missing both', report.missingContact
  .find((r) => r.employeeId === 'T005').missingBoth, true)
check('missing label lists both fields', report.missingContact
  .find((r) => r.employeeId === 'T005').missing, 'company email + phone')
// T004B has the number on cell_number only — surfaced as "copy it to the user"
check('phone-on-employee-only counted', report.kpis.phoneOnEmployeeOnly >= 1, true)
check('T004B: number on the employee record but not the user record',
  [byId.T004B.phoneFromUserRecord, Boolean(byId.T004B.employeeCell)], [false, true])
check('every missingBoth row precedes the rest', (() => {
  const flags = report.missingContact.map((r) => Boolean(r.missingBoth));
  return flags.indexOf(false) === -1 || !flags.slice(flags.indexOf(false)).includes(true);
})(), true)
check('missingBoth KPI', report.kpis.missingBothContacts, 3)
// The tab is OR, so its count must equal the union, never the intersection.
check('tab count is the union of both gaps', report.kpis.missingContact,
  report.employees.filter((r) => r.working && (r.noCompanyEmail || r.noPhone)).length)
check('union >= each individual gap',
  report.kpis.missingContact >= Math.max(report.kpis.noCompanyEmail, report.kpis.noPhone), true)
check('left employees excluded from contact tab',
  report.missingContact.some((r) => r.status === 'Left'), false)

console.log('\nFirebase side')
check('firebase total passes through', report.kpis.firebaseTotal, firebaseUsers.length)
// T001 and T002 deliberately resolve to the SAME account, so 4 matches claim
// only 3 distinct UIDs.
check('unlinked = total minus distinct matches', report.kpis.firebaseUnlinked, firebaseUsers.length - 3)
check('every account appears exactly once', report.firebaseAll.length, firebaseUsers.length)
check('linked accounts carry employee identity',
  report.firebaseAll.filter((u) => u.linked).length, 3)
check("today's tab is a subset of all accounts",
  report.createdToday.every((u) => report.firebaseAll.some((a) => a.uid === u.uid)), true)
// T001+T002 share one Google account; T004+T004B+T004C share one phone account.
check('shared login detected', [report.kpis.sharedAccounts, byId.T001.sharedAccount, byId.T003.sharedAccount], [5, true, false])

console.log('\nCoverage pivots')
// Assert the property, not the sort order: no group keeps its ' - ELPL' suffix.
check('department suffix stripped everywhere',
  report.coverage.department.filter((d) => / - [A-Z]{2,6}$/.test(d.group)).length, 0)
check('dept rollup', report.coverage.department.find((d) => d.group === 'Elbrit Delhi'),
  { group: 'Elbrit Delhi', total: 2, pending: 2, done: 0, pct: 0 })
// T001 usable, T002 an unusable signup -> half the Managers still pending.
check('role pivot', report.coverage.role.find((d) => d.group === 'Manager'),
  { group: 'Manager', total: 2, pending: 1, done: 1, pct: 50 })
check('branch pivot totals match headcount',
  report.coverage.branch.reduce((n, b) => n + b.total, 0), 10)
check('every pivot sums to the same pending total',
  ['department', 'role', 'branch'].map((k) => report.coverage[k].reduce((n, g) => n + g.pending, 0)),
  [7, 7, 7])

console.log(failures ? `\n${failures} FAILED\n` : '\nAll checks passed\n')
process.exit(failures ? 1 : 0)
