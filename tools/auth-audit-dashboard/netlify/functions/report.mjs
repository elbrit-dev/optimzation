/**
 * Netlify Function — /api/report
 *
 * No environment variables. Credentials come from, in order:
 *   1. the request body (the dashboard's form — overrides everything)
 *   2. lib/credentials.mjs, written once by set-credentials.mjs
 *   3. env vars, if you happen to prefer them
 *
 * ── Why stored credentials are safe here ──
 * ONLY for a request carrying a valid session cookie. That is checked twice:
 * at the edge (netlify/edge-functions/gate.mjs) and again below. The second check
 * is not redundant — it is what stops a misconfigured or removed edge gate from
 * turning stored credentials into a public staff-data endpoint. Before the login
 * gate existed this function refused server-side credentials outright, and
 * selftest-auth.mjs still pins that an unauthenticated caller gets nothing.
 */

import { verifySession, readCookie, authConfigured, SESSION_COOKIE } from '../../lib/auth.mjs'
import { AUTH } from '../../lib/auth-secrets.mjs'
import { STORED, haveStoredCredentials } from '../../lib/credentials.mjs'
import { loadReport, resolveCreds } from '../../lib/audit.mjs'

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store, no-cache, must-revalidate, private',
      'x-robots-tag': 'noindex, nofollow',
      'referrer-policy': 'no-referrer',
    },
  })

/** Independent of the edge gate, on purpose. */
async function signedIn(req) {
  if (!authConfigured(AUTH)) return false
  const { valid } = await verifySession(
    AUTH.sessionSecret, readCookie(req.headers.get('cookie'), SESSION_COOKIE),
  )
  return valid
}

export default async (req) => {
  const url = new URL(req.url)

  if (!(await signedIn(req))) {
    return json(401, { error: 'Not signed in.', code: 'AUTH_REQUIRED' })
  }

  if (req.method === 'GET') {
    // Readiness probe: does the server already hold credentials, so the page can
    // skip the form entirely?
    const stored = haveStoredCredentials()
    return json(200, {
      ready: stored,
      stored,
      needs: stored ? [] : ['erpToken', 'serviceAccountJson'],
      erpBaseUrl: STORED.erpBaseUrl,
      hint: stored
        ? 'Credentials are stored server-side. POST {} to build the report.'
        : 'POST { erpBaseUrl, erpToken, serviceAccountJson } to build the report.',
    })
  }

  if (req.method !== 'POST') {
    return json(405, { error: 'Use GET to check readiness, POST to build the report.' })
  }

  let body = {}
  try {
    const text = await req.text()
    body = text ? JSON.parse(text) : {}
  } catch {
    return json(400, { error: 'Expected a JSON body.', code: 'BAD_BODY' })
  }

  // Body wins, then the stored file. Signed-in callers may use either.
  const creds = {
    erpBaseUrl: body.erpBaseUrl || STORED.erpBaseUrl,
    erpToken: body.erpToken || STORED.erpToken,
    serviceAccountJson: body.serviceAccountJson || STORED.serviceAccountJson,
    firebaseProjectId: body.firebaseProjectId,
    allowLocalFallback: false,
  }

  try {
    const data = await loadReport({
      refresh: url.searchParams.get('refresh') === '1' || body.refresh === true,
      creds,
      // Safe because we verified the session above; without that this would be
      // the leak selftest-auth.mjs guards against.
      allowServerCreds: true,
    })
    return json(200, { ...data, credentialSource: body.erpToken ? 'request' : 'stored' })
  } catch (err) {
    if (err.code === 'CREDENTIALS_REQUIRED') {
      return json(428, { error: err.message, code: err.code, missing: err.missing })
    }
    console.error('report failed:', err.message)
    return json(502, { error: err.message, code: err.code || 'UPSTREAM_ERROR' })
  }
}

export const config = { path: '/api/report' }

/** Exported for selftest-auth.mjs. */
export { signedIn as _signedIn }
