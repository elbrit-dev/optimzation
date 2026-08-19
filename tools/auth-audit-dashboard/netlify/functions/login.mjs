/**
 * POST /api/login   { id, password, next }  -> signed session cookie + where to go
 * POST /api/logout                      -> clears it
 *
 * Two passwords, two roles. The admin one opens everything; the report one opens
 * the sales report and nothing else (see ROLE_POLICY in lib/auth.mjs). Which one
 * was typed decides the role — there is no role selector to get wrong, and the
 * response says where that role should land.
 *
 * Rate limiting is deliberately crude — a per-instance counter with a delay, not
 * a real limiter. It exists so that an online guessing attack is slow, while the
 * actual strength comes from PBKDF2 (210k iterations) and from the password
 * being long. A shared-nothing serverless runtime cannot hold real state, so
 * anything stronger would need a store this tool does not have.
 */

import {
  roleForLogin, createSession, sessionCookieHeader, authConfigured,
  mayAccess, homeFor, ROLE_POLICY,
} from '../../lib/auth.mjs'
import { AUTH } from '../../lib/auth-secrets.mjs'

const json = (status, body, extraHeaders = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store, no-cache, must-revalidate, private',
      'x-robots-tag': 'noindex, nofollow',
      'referrer-policy': 'no-referrer',
      ...extraHeaders,
    },
  })

let recentFailures = 0
let windowStart = Date.now()

export default async (req) => {
  const path = new URL(req.url).pathname

  if (path === '/api/logout') {
    return json(200, { ok: true }, { 'set-cookie': sessionCookieHeader('', { clear: true }) })
  }

  if (req.method !== 'POST') return json(405, { error: 'POST only.' })

  if (!authConfigured(AUTH)) {
    return json(503, {
      error: 'No password is set for this dashboard. Run set-password.mjs and redeploy.',
      code: 'AUTH_NOT_CONFIGURED',
    })
  }

  let id, password, next
  try { ({ id, password, next } = await req.json()) }
  catch { return json(400, { error: 'Expected a JSON body.' }) }

  // Reset the window every 10 minutes so a wrong guess isn't punished forever.
  if (Date.now() - windowStart > 600_000) { recentFailures = 0; windowStart = Date.now() }
  if (recentFailures >= 10) {
    return json(429, { error: 'Too many attempts. Wait a few minutes.', code: 'RATE_LIMITED' })
  }

  const role = await roleForLogin({ id, password }, AUTH)
  if (!role) {
    recentFailures += 1
    // Small constant delay: enough to make bulk guessing tedious, not enough to
    // matter to a human typing a password.
    await new Promise((r) => setTimeout(r, 400))
    return json(401, { error: 'Wrong password.', code: 'AUTH_FAILED' })
  }

  recentFailures = 0
  const value = await createSession(AUTH.sessionSecret, { hours: AUTH.sessionHours, role })
  /**
   * The server picks the landing page, not the browser. `next` is honoured only
   * when this role may actually reach it — otherwise a report user following a
   * bookmarked admin URL would be redirected there and bounced straight back out
   * by the gate, which reads as a broken login rather than a permission boundary.
   */
  const clean = typeof next === 'string' ? next.trim() : ''
  // Same-origin absolute paths only. Both '//evil.example' and '/\evil' are read
  // as absolute URLs by browsers, so the second character has to be checked too.
  const wanted = clean.startsWith('/') && !'/\\'.includes(clean[1] || '') ? clean : ''
  const to = wanted && mayAccess(role, wanted) ? wanted : homeFor(role)
  return json(200, { ok: true, role, roleLabel: ROLE_POLICY[role].label, to }, {
    'set-cookie': sessionCookieHeader(value, { hours: AUTH.sessionHours }),
  })
}

export const config = { path: ['/api/login', '/api/logout'] }
