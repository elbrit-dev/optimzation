/**
 * Netlify Function — /api/sales
 *
 * The invoice item-wise sales report. Reachable by BOTH logins: the full-access
 * one and the sales-report-only one.
 *
 * ── Why this endpoint never accepts credentials ──
 * /api/report takes an ERP token from the request body, because the audit
 * dashboard lets an admin paste their own. This one deliberately does NOT: the
 * report login exists to see one report with the token the server already holds,
 * and must be able to neither supply nor read one. So credentials come from
 * lib/credentials.mjs (or env) only, and there is no code path here that reads a
 * token out of the request.
 *
 * The session is verified here as well as at the edge — same reason as
 * report.mjs: if the edge gate is ever removed or misconfigured, stored
 * credentials must not become a public sales-data endpoint.
 */

import { verifySession, readCookie, authConfigured, SESSION_COOKIE, mayAccess } from '../../lib/auth.mjs'
import { AUTH } from '../../lib/auth-secrets.mjs'
import { STORED } from '../../lib/credentials.mjs'
import { CONFIG } from '../../lib/audit.mjs'
import { buildSalesReport, listCompanies } from '../../lib/sales.mjs'

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
async function session(req) {
  if (!authConfigured(AUTH)) return { valid: false }
  return verifySession(AUTH.sessionSecret, readCookie(req.headers.get('cookie'), SESSION_COOKIE))
}

/** Today in the report's timezone — a UTC clock would flip the date early here. */
function todayInTz(tz = CONFIG.timezone) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
}

export default async (req) => {
  const url = new URL(req.url)

  const { valid, role } = await session(req)
  if (!valid) return json(401, { error: 'Not signed in.', code: 'AUTH_REQUIRED' })
  // Belt and braces: the edge already enforces this, and it costs one line here.
  if (!mayAccess(role, '/api/sales')) {
    return json(403, { error: 'This login does not have access to that.', code: 'ROLE_FORBIDDEN' })
  }
  if (req.method !== 'GET') return json(405, { error: 'GET only.' })

  const erpToken = STORED.erpToken || CONFIG.erpApiToken
  if (!erpToken) {
    return json(428, {
      error: 'No ERP token is stored on the server, so this report cannot be built. '
        + 'Run set-credentials.mjs and redeploy.',
      code: 'CREDENTIALS_REQUIRED',
    })
  }
  const creds = { erpBaseUrl: STORED.erpBaseUrl || CONFIG.erpBaseUrl, erpToken }

  try {
    if (url.searchParams.get('options') === 'company') {
      return json(200, { companies: await listCompanies(creds) })
    }
    const query = Object.fromEntries(url.searchParams)
    const data = await buildSalesReport({ creds, query, today: todayInTz() })
    return json(200, { ...data, role })
  } catch (err) {
    const status = err.status === 401 || err.code === 'BAD_ERP_TOKEN' ? 502
      : err.code === 'ERP_FORBIDDEN' ? 502 : 500
    return json(status, {
      error: err.message || 'The ERP request failed.',
      code: err.code || 'ERROR',
    })
  }
}

export const config = { path: '/api/sales' }
