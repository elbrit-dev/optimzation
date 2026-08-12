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

/** @returns {Promise<string>} the cookie value */
export async function createSession(secret, { hours = 12 } = {}) {
  const payload = JSON.stringify({
    exp: Date.now() + hours * 3600_000,
    iat: Date.now(),
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
  return { valid: true }
}

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
