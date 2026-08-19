#!/usr/bin/env node
/**
 * Pins the sales report's pure logic and — separately — the ROLE boundary, which
 * is the part that would fail silently and expensively: a sales-report login is
 * meant to see one page, with no route to the credential form, the staff audit, or
 * the permission writes.
 *
 * Offline. No ERP, no credentials, no network.
 */

import {
  parseQuery, buildErpFilters, defaultFrom, splitFree, rollUpByMonth, topN,
  stampFreeQty, fillTeamFromInvoice, monthKey, monthLabel, cleanTeam,
  SORTABLE, PAGE_SIZES, THERAPIES,
} from './lib/sales.mjs'
import { BRAND_THERAPY, therapyForBrand, brandsForTherapy } from './lib/therapy.mjs'
import {
  ROLE_POLICY, mayAccess, homeFor, createSession, verifySession,
  reportAuthConfigured, roleForPassword, roleForLogin, hashPassword, randomSaltB64,
} from './lib/auth.mjs'

let failures = 0
const check = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `\n        expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`}`)
}

const TODAY = '2026-08-19'

// ── query defaults ───────────────────────────────────────────────────
console.log('\nQuery defaults')
check('three-month default window, not one month', defaultFrom(TODAY), '2026-06-01')
check('  crosses a year boundary correctly', defaultFrom('2026-02-10'), '2025-12-01')
const d = parseQuery({}, { today: TODAY })
check('defaults', [d.from, d.to, d.docstatus, d.paidOnly, d.page, d.pageSize, d.sort, d.dir],
  ['2026-06-01', '2026-08-19', 1, true, 1, 50, 'date', 'desc'])
check('docstatus "all" means every status', parseQuery({ docstatus: 'all' }, { today: TODAY }).docstatus, '')
check('docstatus 0 (Draft) survives', parseQuery({ docstatus: '0' }, { today: TODAY }).docstatus, 0)
check('a junk docstatus falls back to Submitted', parseQuery({ docstatus: 'x' }, { today: TODAY }).docstatus, 1)
check('paidOnly can be switched off by string or bool', [
  parseQuery({ paidOnly: 'false' }, { today: TODAY }).paidOnly,
  parseQuery({ paidOnly: false }, { today: TODAY }).paidOnly,
  parseQuery({ paidOnly: '0' }, { today: TODAY }).paidOnly,
], [false, false, false])
check('a malformed date is ignored rather than passed to ERP',
  parseQuery({ from: '19-08-2026', to: 'yesterday' }, { today: TODAY }).from, '2026-06-01')
check('page cannot be zero or negative', [
  parseQuery({ page: 0 }, { today: TODAY }).page,
  parseQuery({ page: -4 }, { today: TODAY }).page,
], [1, 1])
check('page size must be one of the offered sizes',
  parseQuery({ pageSize: 5000 }, { today: TODAY }).pageSize, 50)
check('every offered page size is accepted',
  PAGE_SIZES.map((n) => parseQuery({ pageSize: String(n) }, { today: TODAY }).pageSize), PAGE_SIZES)

// The one that matters for safety: `order_by` is interpolated into SQL by Frappe.
console.log('\nSort is an allowlist, never passed through')
check('an unknown sort key falls back to date',
  parseQuery({ sort: 'qty; drop table' }, { today: TODAY }).sort, 'date')
check('dir is only asc or desc', [
  parseQuery({ dir: 'asc' }, { today: TODAY }).dir,
  parseQuery({ dir: 'DESC; --' }, { today: TODAY }).dir,
], ['asc', 'desc'])
check('every sortable column maps to something concrete',
  Object.values(SORTABLE).every((v) => typeof v === 'string' && v.length > 3), true)
// Child columns MUST carry backticks: without them Frappe returns zero rows and
// the page reads as "no data for this filter".
check('child sort columns are backtick-qualified',
  ['invoice', 'item', 'brand', 'qty', 'rate', 'amount', 'team']
    .every((k) => SORTABLE[k].startsWith('`tabSales Invoice Item`.')), true)
check('parent sort columns are bare', [SORTABLE.date, SORTABLE.distributor, SORTABLE.grandTotal],
  ['posting_date', 'customer', 'base_grand_total'])

// ── filters ──────────────────────────────────────────────────────────
console.log('\nERP filters')
const f1 = buildErpFilters(parseQuery({}, { today: TODAY }))
check('date range and docstatus always present', f1, [
  ['posting_date', '>=', '2026-06-01'],
  ['posting_date', '<=', '2026-08-19'],
  ['docstatus', '=', 1],
])
const f2 = buildErpFilters(parseQuery({
  company: 'Elbrit Lifesciences Private Limited', distributor: 'Umesh Pharma',
  team: 'Elbrit Chennai - ELPL', hq: 'HQ-Madurai', brand: 'NEURONZ', item: 'NEURONZ MAX',
}, { today: TODAY }))
check('child fields use the four-part form, parent fields the three-part one',
  f2.filter((x) => x.length === 4).map((x) => x[1]),
  ['custom_department', 'custom_hq', 'brand', 'item_name'])
check('company and distributor filter the parent',
  f2.filter((x) => x.length === 3 && x[0] !== 'posting_date' && x[0] !== 'docstatus').map((x) => x[0]),
  ['company', 'customer'])
check('"all" docstatus drops the filter entirely',
  buildErpFilters(parseQuery({ docstatus: 'all' }, { today: TODAY })).some((x) => x[0] === 'docstatus'), false)

/**
 * The paid-only toggle applies to the TABLE only. If it leaked into the
 * aggregates, "free units" would always be zero — the KPI would silently report
 * that no scheme stock had shipped.
 */
check('paid-only is absent from the aggregate filters',
  f1.some((x) => x[1] === 'is_free_item'), false)
check('paid-only is present in the row filters',
  buildErpFilters(parseQuery({}, { today: TODAY }), { forRows: true })
    .some((x) => x[1] === 'is_free_item' && x[3] === 0), true)
check('and absent from the row filters once switched off',
  buildErpFilters(parseQuery({ paidOnly: 'false' }, { today: TODAY }), { forRows: true })
    .some((x) => x[1] === 'is_free_item'), false)

// ── shaping ──────────────────────────────────────────────────────────
console.log('\nTotals and rollups')
check('paid and free split apart', splitFree([
  { is_free_item: 0, value: 31602175.93, qty: 635209, lines_count: 10898 },
  { is_free_item: 1, value: 0, qty: 23615, lines_count: 2862 },
]), { value: 31602175.93, unitsBilled: 635209, freeUnits: 23615, paidLines: 10898, freeLines: 2862 })
check('a range with no free lines at all reports zero, not undefined',
  splitFree([{ is_free_item: 0, value: 100, qty: 5, lines_count: 2 }]).freeUnits, 0)
check('ERP sometimes returns is_free_item as a string',
  splitFree([{ is_free_item: '1', qty: 7, value: 0, lines_count: 1 }]).freeUnits, 7)

check('monthKey / monthLabel', [monthKey('2026-08-19'), monthLabel('2026-08')], ['2026-08', 'Aug 26'])
const rolled = rollUpByMonth([
  { posting_date: '2026-06-30', is_free_item: 0, value: 100, qty: 10 },
  { posting_date: '2026-06-01', is_free_item: 1, value: 0, qty: 3 },
  { posting_date: '2026-08-02', is_free_item: 0, value: 50, qty: 5 },
])
check('days roll up into months', rolled.map((m) => m.key), ['2026-06', '2026-07', '2026-08'])
check('  an empty month is kept as a gap, not closed up',
  rolled[1], { key: '2026-07', value: 0, unitsBilled: 0, freeUnits: 0, label: 'Jul 26' })
check('  free units do not land in the value total',
  [rolled[0].value, rolled[0].unitsBilled, rolled[0].freeUnits], [100, 10, 3])
check('  months carry a human label', rolled.map((m) => m.label), ['Jun 26', 'Jul 26', 'Aug 26'])
check('a year boundary rolls up in order', rollUpByMonth([
  { posting_date: '2025-12-05', is_free_item: 0, value: 1, qty: 1 },
  { posting_date: '2026-01-05', is_free_item: 0, value: 2, qty: 1 },
]).map((m) => m.key), ['2025-12', '2026-01'])
check('no data yields no months', rollUpByMonth([]), [])

console.log('\nRanked bars')
const ranked = topN(Array.from({ length: 12 }, (_, i) => ({ brand: `B${i}`, value: 100 - i * 5, qty: 1 })), 'brand', 8)
check('top 8 plus one Other', ranked.length, 9)
check('  Other is last and flagged', [ranked[8].name, ranked[8].isOther], ['Other (4)', true])
check('  Other totals the tail, so the chart reconciles with the KPI',
  ranked[8].value, [8, 9, 10, 11].reduce((s, i) => s + (100 - i * 5), 0))
check('a short list is not folded', topN([{ brand: 'A', value: 5, qty: 1 }], 'brand', 8).length, 1)
check('blank dimension values are named, not dropped',
  topN([{ brand: null, value: 9, qty: 1 }], 'brand')[0].name, '(not set)')
check('rows with neither value nor qty are dropped',
  topN([{ brand: 'A', value: 0, qty: 0 }, { brand: 'B', value: 1, qty: 0 }], 'brand').length, 1)
check('a credit note keeps its negative value but still ranks',
  topN([{ brand: 'A', value: -500, qty: -2 }, { brand: 'B', value: 10, qty: 1 }], 'brand')
    .map((r) => r.name), ['B', 'A'])

console.log('\nFree-quantity stamping')
/**
 * Free goods ship as their own lines. On live data 158 of 1,167 invoices carry
 * both paid and free lines (a 10+1 scheme), 166 are free-only claim invoices, and
 * the rest are paid-only — so the stamp has to be per invoice AND per item code.
 */
const stamped = stampFreeQty(
  [
    { invoice: 'INV-1', itemCode: 'TELBRIT 40', qty: 50 },
    { invoice: 'INV-1', itemCode: 'NERO PG 50', qty: 10 },
    { invoice: 'INV-2', itemCode: 'TELBRIT 40', qty: 20 },
  ],
  [
    { parent: 'INV-1', item_code: 'TELBRIT 40', stock_qty: 10, is_free_item: 1 },
    { parent: 'INV-1', item_code: 'NERO PG 50', stock_qty: 2, is_free_item: 1 },
    { parent: 'INV-9', item_code: 'TELBRIT 40', stock_qty: 99, is_free_item: 1 },
  ],
)
check('the scheme quantity lands on the right line', stamped.map((r) => r.freeQty), [10, 2, 0])
check('  and never on the same item on another invoice',
  stamped.find((r) => r.invoice === 'INV-2').freeQty, 0)
check('several free lines for one item are summed', stampFreeQty(
  [{ invoice: 'A', itemCode: 'X', qty: 1 }],
  [
    { parent: 'A', item_code: 'X', stock_qty: 2, is_free_item: 1 },
    { parent: 'A', item_code: 'X', stock_qty: 3, is_free_item: 1 },
  ],
)[0].freeQty, 5)
check('no free lines leaves every row at zero',
  stampFreeQty([{ invoice: 'A', itemCode: 'X', qty: 1 }], [])[0].freeQty, 0)
check('team suffix cleaned for display, blank stays blank',
  [cleanTeam('Vasco Coimbatore - ELPL'), cleanTeam(''), cleanTeam(null)],
  ['Vasco Coimbatore', '', ''])


// ── invoice and therapy filters ──────────────────────────────────────
console.log('\nInvoice filter')
const fi = buildErpFilters(parseQuery({ invoice: 'INV-KA26' }, { today: TODAY }))
check('matches as a substring, so a series prefix works too',
  fi.find((x) => x[0] === 'name'), ['name', 'like', '%INV-KA26%'])
check('absent when not asked for',
  buildErpFilters(parseQuery({}, { today: TODAY })).some((x) => x[0] === 'name'), false)
check('a blank invoice is not a filter',
  buildErpFilters(parseQuery({ invoice: '   ' }, { today: TODAY })).some((x) => x[0] === 'name'), false)

console.log('\nTherapy filter (ERP has no therapy field)')
check('11 therapy areas, from the brand map', THERAPIES.length, 11)
check('every mapped brand points at one of them',
  Object.values(BRAND_THERAPY).every((t) => THERAPIES.includes(t)), true)
check('the map covers the brands their own export used', Object.keys(BRAND_THERAPY).length, 57)
check('a known brand resolves', therapyForBrand('GLIMIBRIT'), 'Diabetes')
check('an unknown brand resolves to blank, not to a guess',
  [therapyForBrand('NOT-A-BRAND'), therapyForBrand(''), therapyForBrand(null)], ['', '', ''])
check('TRIGLIMIBRIT stays blank — their file has no therapy for it either',
  therapyForBrand('TRIGLIMIBRIT'), '')

const ft = buildErpFilters(parseQuery({ therapy: 'Cardiovascular' }, { today: TODAY }))
const brandIn = ft.find((x) => x[1] === 'brand' && x[2] === 'in')
check('becomes a brand IN filter', Boolean(brandIn), true)
check('  listing only that therapy’s brands',
  brandIn[3].every((b) => BRAND_THERAPY[b] === 'Cardiovascular'), true)
check('  and all of them', brandIn[3].length, brandsForTherapy('Cardiovascular').length)
/**
 * An unrecognised therapy must be DROPPED by parseQuery, never passed through: an
 * empty IN list would match nothing, and a stray string would produce a filter on
 * no brands at all — either way the page would quietly show the wrong total.
 */
check('an unknown therapy is dropped', parseQuery({ therapy: 'Astrology' }, { today: TODAY }).therapy, '')
check('  so it adds no filter',
  buildErpFilters(parseQuery({ therapy: 'Astrology' }, { today: TODAY }))
    .some((x) => x[1] === 'brand'), false)
check('an explicit brand wins over a therapy, rather than fighting it',
  buildErpFilters(parseQuery({ therapy: 'Diabetes', brand: 'ROZULA' }, { today: TODAY }))
    .filter((x) => x[1] === 'brand'), [['Sales Invoice Item', 'brand', '=', 'ROZULA']])

// ── sales team filled from the invoice ───────────────────────────────
console.log('\nSales Team completion')
/**
 * The Department is stamped per line and 10.8% of live lines have none; a third of
 * those sit on an invoice that DOES carry it elsewhere. Their own export
 * (Sales Invoice-34.xlsx) has the same shape — 79 of 49,821 rows blank.
 */
const teamRows = [
  { invoice: 'CN-1', teamRaw: '', team: '' },
  { invoice: 'CN-1', teamRaw: 'Elbrit Kerala - ELPL', team: 'Elbrit Kerala' },
  { invoice: 'CN-2', teamRaw: '', team: '' },
]
const filled = fillTeamFromInvoice(teamRows, [
  { parent: 'CN-1', custom_department: 'Elbrit Kerala - ELPL' },
  { parent: 'CN-3', custom_department: 'Elbrit Chennai - ELPL' },
])
check('a blank line takes the team from its own invoice',
  [filled[0].team, filled[0].teamFromInvoice], ['Elbrit Kerala', true])
check('  and says so, rather than passing it off as stamped data',
  filled[1].teamFromInvoice, undefined)
check('an invoice with no team anywhere stays blank',
  [filled[2].team, filled[2].teamFromInvoice], ['', undefined])
check('never borrows from a DIFFERENT invoice',
  fillTeamFromInvoice([{ invoice: 'X', teamRaw: '', team: '' }],
    [{ parent: 'Y', custom_department: 'Elbrit Delhi - ELPL' }])[0].team, '')
check('the ELPL suffix is stripped for display',
  fillTeamFromInvoice([{ invoice: 'A', teamRaw: '', team: '' }],
    [{ parent: 'A', custom_department: 'Vasco Coimbatore - ELPL' }])[0].team, 'Vasco Coimbatore')
check('an already-stamped line is left exactly as it was',
  fillTeamFromInvoice([{ invoice: 'A', teamRaw: 'Elbrit AP - ELPL', team: 'Elbrit AP' }],
    [{ parent: 'A', custom_department: 'Elbrit Delhi - ELPL' }])[0].team, 'Elbrit AP')

console.log('\nFree quantity is stamped only from FREE sibling lines')
check('a paid sibling is not counted as free stock', stampFreeQty(
  [{ invoice: 'A', itemCode: 'X', qty: 10 }],
  [
    { parent: 'A', item_code: 'X', stock_qty: 10, is_free_item: 0 },
    { parent: 'A', item_code: 'X', stock_qty: 2, is_free_item: 1 },
  ],
)[0].freeQty, 2)

// ── the role boundary ────────────────────────────────────────────────
console.log('\nRole boundary')
check('two roles exist', Object.keys(ROLE_POLICY).sort(), ['admin', 'report'])
check('admin lands on the dashboard, report on the sales page',
  [homeFor('admin'), homeFor('report')], ['/', '/sales.html'])

const REPORT_MAY = ['/sales.html', '/api/sales', '/api/logout']
const REPORT_MAY_NOT = [
  '/', '/index.html', '/api/report', '/api/permissions', '/api/erp-token', '/api/status',
  // Path-shaped attempts to slip past a prefix check.
  '/api/sales/../report', '/API/SALES', '/api/sales?x=1', '/sales.html/../index.html',
]
for (const p of REPORT_MAY) check(`report role may reach ${p}`, mayAccess('report', p), true)
for (const p of REPORT_MAY_NOT) check(`report role is REFUSED ${p}`, mayAccess('report', p), false)
for (const p of [...REPORT_MAY, ...REPORT_MAY_NOT]) {
  if (!mayAccess('admin', p)) { failures++; console.log(`FAIL  admin should reach ${p}`) }
}
check('admin reaches everything above', true, true)
check('an unknown role gets the LEAST privilege, not the most',
  [mayAccess('superuser', '/'), mayAccess('', '/api/report'), mayAccess(undefined, '/index.html')],
  [false, false, false])

console.log('\nRole travels inside the signed session')
const secret = 'test-secret-for-selftest-only'
const adminCookie = await createSession(secret, { role: 'admin' })
const reportCookie = await createSession(secret, { role: 'report' })
check('admin session carries its role', (await verifySession(secret, adminCookie)).role, 'admin')
check('report session carries its role', (await verifySession(secret, reportCookie)).role, 'report')
check('an unknown role is stored as admin only when it came from a valid signature',
  (await verifySession(secret, await createSession(secret, { role: 'nope' }))).role, 'admin')
/**
 * The role must be unforgeable: editing the payload has to break the signature,
 * otherwise a report user could promote themselves by editing a cookie.
 */
const [body, sig] = reportCookie.split('.')
const tampered = `${Buffer.from(Buffer.from(body, 'base64url').toString('utf8')
  .replace('"report"', '"admin"')).toString('base64url')}.${sig}`
check('editing the role in the cookie invalidates it',
  await verifySession(secret, tampered), { valid: false, reason: 'bad-signature' })
check('a session signed with another key is rejected',
  (await verifySession('different-secret', reportCookie)).valid, false)
check('a legacy cookie with no role is treated as admin', await (async () => {
  // Only the admin password existed before the second login, so a role-less
  // session can only have come from it.
  const legacy = Buffer.from(JSON.stringify({ exp: Date.now() + 60000, iat: Date.now() })).toString('base64url')
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const s = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(legacy))
  const b64 = Buffer.from(s).toString('base64url')
  return (await verifySession(secret, `${legacy}.${b64}`)).role
})(), 'admin')

console.log('\nWhich password unlocks which role')
const salt = randomSaltB64()
const rSalt = randomSaltB64()
const AUTH = {
  passwordHash: await hashPassword('admin-pass', salt),
  salt,
  reportPasswordHash: await hashPassword('report-pass', rSalt),
  reportSalt: rSalt,
  sessionSecret: secret,
}
check('report auth is configured', reportAuthConfigured(AUTH), true)
check('the admin password gives the admin role', await roleForPassword('admin-pass', AUTH), 'admin')
check('the report password ALONE is not enough — it needs its ID',
  await roleForPassword('report-pass', AUTH), '')
check('with the ID it gives the report role',
  await roleForLogin({ id: 'elbrit', password: 'report-pass' }, { ...AUTH, reportUserId: 'elbrit' }), 'report')
check('a wrong password gives no role', await roleForPassword('nope', AUTH), '')
check('an empty password gives no role', await roleForPassword('', AUTH), '')
check('with no report password set, that role cannot be held',
  await roleForLogin({ id: 'elbrit', password: 'report-pass' },
    { ...AUTH, reportUserId: 'elbrit', reportPasswordHash: '', reportSalt: '' }), '')
check('report auth reported as unconfigured then',
  reportAuthConfigured({ ...AUTH, reportPasswordHash: '' }), false)
check('if both passwords were somehow identical, admin wins',
  await roleForPassword('same', {
    ...AUTH,
    passwordHash: await hashPassword('same', salt),
    reportPasswordHash: await hashPassword('same', rSalt),
  }), 'admin')

console.log('\nThe login ID selects which login is being attempted')
const WITH_IDS = { ...AUTH, adminUserId: 'admin', reportUserId: 'elbrit' }
check('the report ID + report password -> report',
  await roleForLogin({ id: 'elbrit', password: 'report-pass' }, WITH_IDS), 'report')
check('  case and stray spaces do not matter — an ID is a name, not a secret',
  await roleForLogin({ id: '  ELBRIT ', password: 'report-pass' }, WITH_IDS), 'report')
check('the report password WITHOUT its ID is refused',
  await roleForLogin({ id: '', password: 'report-pass' }, WITH_IDS), '')
check('the report password under the WRONG ID is refused',
  await roleForLogin({ id: 'admin', password: 'report-pass' }, WITH_IDS), '')
check('the report ID with the admin password is refused',
  await roleForLogin({ id: 'elbrit', password: 'admin-pass' }, WITH_IDS), '')
check('the admin password with a blank ID still works — that login predates the field',
  await roleForLogin({ id: '', password: 'admin-pass' }, WITH_IDS), 'admin')
check('  and with its own ID', await roleForLogin({ id: 'admin', password: 'admin-pass' }, WITH_IDS), 'admin')
check('an unknown ID gets nothing, whatever the password',
  [await roleForLogin({ id: 'someone', password: 'admin-pass' }, WITH_IDS),
    await roleForLogin({ id: 'someone', password: 'report-pass' }, WITH_IDS)], ['', ''])
check('no ID and no password is not a login',
  await roleForLogin({}, WITH_IDS), '')

console.log(failures ? `\n${failures} FAILED\n` : '\nAll checks passed\n')
process.exit(failures ? 1 : 0)
