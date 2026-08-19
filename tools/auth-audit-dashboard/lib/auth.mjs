/**
 * Generic auth layer — password login + signed session cookie.
 *
 * Deliberately built on Web Crypto (`crypto.subtle`) and nothing else, because
 * it has to run in BOTH Netlify runtimes: Node functions and Deno edge
 * functions. `node:crypto` would not load at the edge.
 *
 * Not reinventing crypto — this is PBKDF2-SHA256 for the password and
 * HMAC-SHA256 for the session, both from the platform. No dependencies.
 *
 * Shape of a session cookie:   <base64url(payload)>.<base64url(hmac)>
 * The payload carries only an expiry and an issued-at stamp; there is nothing
 * secret in it, and the HMAC is what makes it unforgeable.
 */

const enc = new TextEncoder()

const b64urlEncode = (bytes) => {
  let s = ''
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  for (const b of arr) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const b64urlDecode = (str) => {
  const pad = str.replace(/-/g, '+').replace(/_/g, '/')
  const s = atob(pad + '='.repeat((4 - (pad.length % 4)) % 4))
  return Uint8Array.from(s, (c) => c.charCodeAt(0))
}

/** Constant-time compare on equal-length byte arrays. */
function sameBytes(a, b) {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
  return diff === 0
}

// ── password ────────────────────────────────────────────────────────

export const PBKDF2_ITERATIONS = 210_000

/**
 * PBKDF2-SHA256, not a bare SHA-256: a bare hash of a human-chosen password is
 * brute-forceable at billions of guesses/second. Returns base64url.
 */
export async function hashPassword(password, saltB64, iterations = PBKDF2_ITERATIONS) {
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(String(password)), 'PBKDF2', false, ['deriveBits'],
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: b64urlDecode(saltB64), iterations, hash: 'SHA-256' },
    keyMaterial, 256,
  )
  return b64urlEncode(bits)
}

/** Timing-safe password check. Returns false rather than throwing on bad input. */
export async function verifyPassword(password, auth) {
  if (!auth?.passwordHash || !auth?.salt) return false
  if (typeof password !== 'string' || !password) return false
  const got = await hashPassword(password, auth.salt, auth.iterations || PBKDF2_ITERATIONS)
  return sameBytes(b64urlDecode(got), b64urlDecode(auth.passwordHash))
}

export function randomSaltB64(bytes = 16) {
  return b64urlEncode(crypto.getRandomValues(new Uint8Array(bytes)))
}

// ── session ─────────────────────────────────────────────────────────

async function hmacKey(secret) {
  return crypto.subtle.importKey(
    'raw', enc.encode(String(secret)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  )
}

/**
 * @returns {Promise<string>} the cookie value
 * `role` decides what the session may reach — see ROLE_POLICY below. It lives in
 * the signed payload rather than in a second cookie so it cannot be edited
 * without the signing key.
 */
export async function createSession(secret, { hours = 12, role = 'admin' } = {}) {
  const payload = JSON.stringify({
    exp: Date.now() + hours * 3600_000,
    iat: Date.now(),
    role: ROLE_POLICY[role] ? role : 'admin',
  })
  const body = b64urlEncode(enc.encode(payload))
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(body))
  return `${body}.${b64urlEncode(sig)}`
}

/**
 * @returns {Promise<{valid: boolean, reason?: string}>}
 * Verifies the signature BEFORE reading the payload, so an attacker-controlled
 * payload is never parsed as trusted input.
 */
export async function verifySession(secret, cookieValue) {
  if (!secret || typeof cookieValue !== 'string' || !cookieValue.includes('.')) {
    return { valid: false, reason: 'malformed' }
  }
  const [body, sig] = cookieValue.split('.', 2)
  let expected
  try {
    expected = await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(body))
  } catch {
    return { valid: false, reason: 'malformed' }
  }
  let given
  try { given = b64urlDecode(sig) } catch { return { valid: false, reason: 'malformed' } }
  if (!sameBytes(given, new Uint8Array(expected))) return { valid: false, reason: 'bad-signature' }

  let payload
  try { payload = JSON.parse(new TextDecoder().decode(b64urlDecode(body))) }
  catch { return { valid: false, reason: 'malformed' } }
  if (!payload?.exp || Date.now() > payload.exp) return { valid: false, reason: 'expired' }
  // A cookie with no role predates the second login and can only have been signed
  // for the one password that existed then — the admin one.
  const role = ROLE_POLICY[payload.role] ? payload.role : 'admin'
  return { valid: true, role }
}

// ── roles ───────────────────────────────────────────────────────────

/**
 * Who may reach what. One table, imported by BOTH the edge gate and the
 * functions, so a path can never be open at one layer and closed at the other.
 *
 * `report` exists for the sales report: it signs in with its own password, sees
 * exactly one page, and — crucially — has no route to the credential form or to
 * anything that reads staff PII. It uses the ERP token the server already holds
 * and can neither see nor change it.
 */
export const ROLE_POLICY = {
  admin: {
    home: '/',
    label: 'Full access',
    /** Everything, including the credential form and the staff audit. */
    allows: () => true,
  },
  report: {
    home: '/sales.html',
    label: 'Sales report only',
    allows: (path) => REPORT_PATHS.has(path),
  },
}

/**
 * Deliberately a fixed set, not a prefix match: `/api/` + prefix matching is how
 * a "read-only" role quietly gains `/api/permissions`, which writes to ERP.
 */
const REPORT_PATHS = new Set([
  '/sales.html', '/sales', '/api/sales', '/api/logout', '/favicon.ico', '/robots.txt',
])

export const mayAccess = (role, path) => {
  const policy = ROLE_POLICY[role] || ROLE_POLICY.report
  return Boolean(policy.allows(path))
}

export const homeFor = (role) => (ROLE_POLICY[role] || ROLE_POLICY.report).home

// ── cookie plumbing ─────────────────────────────────────────────────

export const SESSION_COOKIE = 'aa_session'

export function readCookie(cookieHeader, name = SESSION_COOKIE) {
  if (!cookieHeader) return ''
  for (const part of String(cookieHeader).split(';')) {
    const [k, ...rest] = part.trim().split('=')
    if (k === name) return rest.join('=')
  }
  return ''
}

/**
 * HttpOnly so page scripts (and any XSS) cannot read it; Secure so it never
 * travels over http; SameSite=Lax so a cross-site POST can't ride the session
 * while a normal top-level visit still works.
 */
export function sessionCookieHeader(value, { hours = 12, clear = false } = {}) {
  const attrs = [
    `${SESSION_COOKIE}=${clear ? '' : value}`,
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    clear ? 'Max-Age=0' : `Max-Age=${Math.round(hours * 3600)}`,
  ]
  return attrs.join('; ')
}

/** True when a password has actually been configured; otherwise deny everyone. */
export function authConfigured(auth) {
  return Boolean(auth?.passwordHash && auth?.salt && auth?.sessionSecret)
}

/**
 * The report login is optional: with no hash set, that role simply does not
 * exist and nobody can hold it. It still needs the shared session secret, which
 * `authConfigured` covers.
 */
export function reportAuthConfigured(auth) {
  return Boolean(auth?.reportPasswordHash && auth?.reportSalt && auth?.sessionSecret)
}

/** Case- and space-insensitive: an ID is a name, not a secret. */
const sameId = (a, b) => String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase()

/**
 * Which role an ID + password unlocks, or '' for none.
 *
 * The ID is not a second secret — it selects which login is being attempted, so
 * the report password cannot be used without knowing that it belongs to `elbrit`,
 * and a wrong ID fails the same way a wrong password does. Both candidates are
 * always evaluated so the timing does not reveal which half was wrong.
 *
 * A BLANK id still works for the admin password, because that login existed
 * before there was an ID field and its holders have no reason to learn one.
 */
export async function roleForLogin({ id = '', password = '' } = {}, auth) {
  const adminId = auth?.adminUserId || 'admin'
  const reportId = auth?.reportUserId || ''
  const idIsAdmin = !String(id ?? '').trim() || sameId(id, adminId)
  const idIsReport = Boolean(reportId) && sameId(id, reportId)

  const admin = await verifyPassword(password, auth)
  const report = reportAuthConfigured(auth)
    ? await verifyPassword(password, {
      passwordHash: auth.reportPasswordHash,
      salt: auth.reportSalt,
      iterations: auth.iterations,
    })
    : false

  if (admin && idIsAdmin) return 'admin'
  if (report && idIsReport) return 'report'
  return ''
}

/** Older shape, kept because an ID-less attempt is exactly the admin case. */
export const roleForPassword = (password, auth) => roleForLogin({ password }, auth)
