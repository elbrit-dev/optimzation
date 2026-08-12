#!/usr/bin/env node
/**
 * Verifies the auth layer: password hashing, session signing, and that the gate
 * fails closed.
 *
 * These are the checks you cannot afford to have silently regress — a broken
 * signature check or an unconfigured-but-open gate turns the whole dashboard
 * public without anything appearing to be wrong.
 *
 *   node tools/auth-audit-dashboard/selftest-login.mjs
 */

import {
  hashPassword, verifyPassword, randomSaltB64, createSession, verifySession,
  readCookie, sessionCookieHeader, authConfigured, SESSION_COOKIE, PBKDF2_ITERATIONS,
} from './lib/auth.mjs'

let failures = 0
const check = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `\n        expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`}`)
}

const salt = randomSaltB64()
const AUTH = {
  salt,
  iterations: PBKDF2_ITERATIONS,
  passwordHash: await hashPassword('correct horse battery staple', salt),
  sessionSecret: randomSaltB64(32),
  sessionHours: 12,
}

console.log('\nPassword')
check('correct password verifies', await verifyPassword('correct horse battery staple', AUTH), true)
check('wrong password rejected', await verifyPassword('wrong', AUTH), false)
check('empty password rejected', await verifyPassword('', AUTH), false)
check('null password rejected', await verifyPassword(null, AUTH), false)
check('case matters', await verifyPassword('Correct Horse Battery Staple', AUTH), false)
check('trailing space matters', await verifyPassword('correct horse battery staple ', AUTH), false)
check('same password + different salt -> different hash',
  (await hashPassword('x', randomSaltB64())) === (await hashPassword('x', randomSaltB64())), false)
check('hash is deterministic for a given salt',
  (await hashPassword('x', salt)) === (await hashPassword('x', salt)), true)
// A bare SHA-256 would be far too fast to be safe for a human password.
check('uses a slow KDF (>=200k iterations)', PBKDF2_ITERATIONS >= 200_000, true)

console.log('\nSession')
const good = await createSession(AUTH.sessionSecret)
check('fresh session validates', (await verifySession(AUTH.sessionSecret, good)).valid, true)
check('wrong secret rejected', (await verifySession('other-secret', good)).valid, false)
check('  reason is bad-signature',
  (await verifySession('other-secret', good)).reason, 'bad-signature')
check('tampered payload rejected', (await verifySession(AUTH.sessionSecret,
  `${btoa('{"exp":99999999999999}').replace(/=+$/, '')}.${good.split('.')[1]}`)).valid, false)
check('truncated cookie rejected', (await verifySession(AUTH.sessionSecret, good.split('.')[0])).valid, false)
check('empty cookie rejected', (await verifySession(AUTH.sessionSecret, '')).valid, false)
check('garbage rejected', (await verifySession(AUTH.sessionSecret, 'a.b')).valid, false)
check('missing secret rejected', (await verifySession('', good)).valid, false)
const expired = await createSession(AUTH.sessionSecret, { hours: -1 })
check('expired session rejected', (await verifySession(AUTH.sessionSecret, expired)).valid, false)
check('  reason is expired', (await verifySession(AUTH.sessionSecret, expired)).reason, 'expired')

console.log('\nCookie')
const header = sessionCookieHeader(good, { hours: 12 })
check('HttpOnly set', /HttpOnly/.test(header), true)
check('Secure set', /Secure/.test(header), true)
check('SameSite set', /SameSite=Lax/.test(header), true)
check('scoped to /', /Path=\//.test(header), true)
check('clear sets Max-Age=0', /Max-Age=0/.test(sessionCookieHeader('', { clear: true })), true)
check('round-trips through a Cookie header',
  readCookie(`other=1; ${SESSION_COOKIE}=${good}; x=2`), good)
check('absent cookie -> empty string', readCookie('other=1'), '')
check('no cookie header -> empty string', readCookie(null), '')

console.log('\nFails closed when unconfigured')
check('no password set -> not configured', authConfigured({ passwordHash: '', salt, sessionSecret: 'x' }), false)
check('no salt -> not configured', authConfigured({ passwordHash: 'h', salt: '', sessionSecret: 'x' }), false)
check('no session secret -> not configured', authConfigured({ passwordHash: 'h', salt, sessionSecret: '' }), false)
check('fully set -> configured', authConfigured(AUTH), true)
check('unconfigured auth rejects every password',
  await verifyPassword('anything', { passwordHash: '', salt: '' }), false)

// The gate module must be importable in a Node context too (it runs on Deno in
// production, but a syntax error should surface here rather than at deploy).
console.log('\nGate module')
try {
  const gate = await import('./netlify/edge-functions/gate.mjs')
  check('gate imports', typeof gate.default, 'function')
  check('gate is registered for all paths', gate.config.path, '/*')
  check('login paths are excluded', gate.config.excludedPath.includes('/login.html'), true)
  check('  and the login API', gate.config.excludedPath.includes('/api/login'), true)
} catch (err) {
  failures++
  console.log(`FAIL  gate imports\n        ${err.message}`)
}

console.log(failures ? `\n${failures} FAILED\n` : '\nAll checks passed\n')
process.exit(failures ? 1 : 0)
