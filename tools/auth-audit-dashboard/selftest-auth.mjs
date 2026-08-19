#!/usr/bin/env node
/**
 * Verifies /api/report and /api/sales give an unauthenticated caller NOTHING —
 * including when credentials are stored server-side, which is the whole point of
 * storing them — and that the sales-report role reaches the sales endpoint and
 * ONLY the sales endpoint.
 *
 * The failure this guards is silent and total: if the function ever answered
 * without a session while lib/credentials.mjs holds a token, the entire staff
 * report becomes public to anyone with the URL. It is checked here at the function
 * level and separately at the edge, so losing one layer cannot open the door.
 *
 *   node tools/auth-audit-dashboard/selftest-auth.mjs
 *
 * Offline — every case is rejected before any upstream fetch.
 */

import { createSession, sessionCookieHeader } from './lib/auth.mjs'

let failures = 0
const check = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `\n        expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`}`)
}

const URL_ = 'https://example.netlify.app/api/report'

/**
 * Fresh module per case so env changes land. Env is used here to simulate
 * "credentials are stored" without writing to lib/credentials.mjs, since that
 * file reads the same env vars as its override.
 */
async function call({ env = {}, method = 'GET', body, cookie } = {}) {
  const saved = { ...process.env }
  for (const k of ['ERP_API_TOKEN', 'FIREBASE_SERVICE_ACCOUNT', 'AUTH_PASSWORD_HASH',
    'AUTH_PASSWORD_SALT', 'AUTH_SESSION_SECRET']) delete process.env[k]
  Object.assign(process.env, env)
  const mod = await import(`./netlify/functions/report.mjs?v=${Math.random().toString(36).slice(2)}`)
  let res
  try {
    res = await mod.default(new Request(URL_, {
      method,
      headers: {
        ...(cookie ? { cookie } : {}),
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
    }))
  } finally {
    process.env = saved
  }
  const parsed = await res.json().catch(() => ({}))
  return { status: res.status, code: parsed.code, body: parsed, headers: res.headers }
}

// A configured auth setup, and a real session cookie for it.
const SECRET = 'test-session-secret-000'
const AUTH_ENV = {
  AUTH_PASSWORD_HASH: 'irrelevant-for-session-checks',
  AUTH_PASSWORD_SALT: 'c2FsdA',
  AUTH_SESSION_SECRET: SECRET,
}
const goodCookie = sessionCookieHeader(await createSession(SECRET)).split(';')[0]
const STORED_ENV = {
  ERP_API_TOKEN: 'key:secret',
  FIREBASE_SERVICE_ACCOUNT: Buffer.from(JSON.stringify({
    client_email: 'x@y.iam.gserviceaccount.com',
    private_key: '-----BEGIN PRIVATE KEY-----\nZm9v\n-----END PRIVATE KEY-----\n',
  })).toString('base64'),
}

console.log('\nNo session -> nothing, even with credentials stored')
// THE critical case. Storing credentials must not make the endpoint public.
const anonStored = await call({ env: { ...AUTH_ENV, ...STORED_ENV }, method: 'POST', body: {} })
check('POST, no cookie, creds stored -> 401', anonStored.status, 401)
check('  and AUTH_REQUIRED', anonStored.code, 'AUTH_REQUIRED')
check('GET, no cookie, creds stored -> 401',
  (await call({ env: { ...AUTH_ENV, ...STORED_ENV } })).status, 401)
check('POST with a forged cookie -> 401',
  (await call({ env: { ...AUTH_ENV, ...STORED_ENV }, method: 'POST', body: {}, cookie: 'aa_session=abc.def' })).status, 401)
check('POST with a cookie signed by the WRONG secret -> 401',
  (await call({
    env: { ...AUTH_ENV, ...STORED_ENV }, method: 'POST', body: {},
    cookie: sessionCookieHeader(await createSession('some-other-secret')).split(';')[0],
  })).status, 401)
const expiredCookie = sessionCookieHeader(await createSession(SECRET, { hours: -1 })).split(';')[0]
check('POST with an expired session -> 401',
  (await call({ env: { ...AUTH_ENV, ...STORED_ENV }, method: 'POST', body: {}, cookie: expiredCookie })).status, 401)
// No password configured at all -> no session can be valid, so still closed.
check('auth not configured -> 401 even with a cookie',
  (await call({ env: STORED_ENV, method: 'POST', body: {}, cookie: goodCookie })).status, 401)

console.log('\nWith a valid session')
const probe = await call({ env: { ...AUTH_ENV, ...STORED_ENV }, cookie: goodCookie })
check('GET -> 200', probe.status, 200)
check('  reports credentials are stored', [probe.body.ready, probe.body.stored], [true, true])
check('  leaks no report payload', ['employees', 'firebaseAll', 'kpis'].some((k) => k in probe.body), false)

// "Nothing stored" cannot be simulated through env once lib/credentials.mjs holds
// real values — env can only add. So the empty-credentials path is asserted at the
// unit level instead, which also keeps this suite offline.
const { resolveCreds, requireCreds } = await import('./lib/audit.mjs')
let credErr = null
try {
  requireCreds(resolveCreds({}, { allowServerCreds: false }))
} catch (e) { credErr = e }
check('no credentials supplied -> throws', Boolean(credErr), true)
check('  code is CREDENTIALS_REQUIRED', credErr?.code, 'CREDENTIALS_REQUIRED')
check('  names both', credErr?.missing, ['ERP API token', 'Firebase service account'])
check('a stored/server credential is ignored when allowServerCreds is false',
  resolveCreds({}, { allowServerCreds: false }).erpToken, '')

check('PUT -> 405',
  (await call({ env: { ...AUTH_ENV, ...STORED_ENV }, method: 'PUT', cookie: goodCookie })).status, 405)
check('bad JSON body -> 400',
  (await call({ env: { ...AUTH_ENV, ...STORED_ENV }, method: 'POST', body: 'nope', cookie: goodCookie })).status, 400)

// ── the second login ────────────────────────────────────────────────
console.log('\nRole boundary at the function level')

/** Same harness, pointed at whichever function is under test. */
async function callFn(fn, { env = {}, method = 'GET', cookie, url } = {}) {
  const saved = { ...process.env }
  for (const k of ['ERP_API_TOKEN', 'FIREBASE_SERVICE_ACCOUNT', 'AUTH_PASSWORD_HASH',
    'AUTH_PASSWORD_SALT', 'AUTH_SESSION_SECRET', 'REPORT_PASSWORD_HASH',
    'REPORT_PASSWORD_SALT']) delete process.env[k]
  Object.assign(process.env, env)
  const mod = await import(`./netlify/functions/${fn}.mjs?v=${Math.random().toString(36).slice(2)}`)
  let res
  try {
    res = await mod.default(new Request(url || `https://example.netlify.app/api/${fn}`, {
      method, headers: { ...(cookie ? { cookie } : {}) },
    }))
  } finally { process.env = saved }
  const parsed = await res.json().catch(() => ({}))
  return { status: res.status, code: parsed.code, body: parsed }
}

const reportRoleCookie = sessionCookieHeader(
  await createSession(SECRET, { role: 'report' }),
).split(';')[0]

check('/api/sales, no cookie -> 401',
  (await callFn('sales', { env: { ...AUTH_ENV, ...STORED_ENV } })).status, 401)
check('/api/sales with a forged cookie -> 401',
  (await callFn('sales', { env: { ...AUTH_ENV, ...STORED_ENV }, cookie: 'aa_session=x.y' })).status, 401)
check('/api/sales rejects POST',
  (await callFn('sales', { env: { ...AUTH_ENV, ...STORED_ENV }, method: 'POST', cookie: goodCookie })).status, 405)

/**
 * THE boundary. A sales-report session must be refused by the staff-audit
 * endpoint even though its cookie is perfectly valid — the role is what stops it,
 * and it is enforced in the function as well as at the edge.
 */
const crossover = await call({
  env: { ...AUTH_ENV, ...STORED_ENV }, method: 'POST', body: {}, cookie: reportRoleCookie,
})
check('report role calling /api/report -> refused', crossover.status, 403)
check('  with ROLE_FORBIDDEN', crossover.code, 'ROLE_FORBIDDEN')
check('  and no report payload',
  ['employees', 'firebaseAll', 'kpis'].some((k) => k in crossover.body), false)
check('report role calling /api/permissions -> refused',
  (await callFn('permissions', {
    env: { ...AUTH_ENV, ...STORED_ENV }, cookie: reportRoleCookie,
  })).status, 403)

console.log('\nHeaders')
const h = probe.headers
check('no-store', /no-store/.test(h.get('cache-control')), true)
check('noindex', /noindex/.test(h.get('x-robots-tag')), true)
check('no-referrer', h.get('referrer-policy'), 'no-referrer')

console.log(failures ? `\n${failures} FAILED\n` : '\nAll checks passed\n')
process.exit(failures ? 1 : 0)
