/**
 * Netlify Function — /api/permissions
 *
 *   GET    ?user=<email>       list permissions (all users if omitted) + analysis
 *   GET    ?options=<doctype>  values selectable for `for_value`
 *   POST   {user, allow, forValue, applyToAll, applicableFor}
 *   DELETE ?name=<permission name>
 *
 * THE ONLY WRITE PATH IN THIS TOOL. Creating or deleting a User Permission
 * changes what a real person can see in ERP, immediately. So:
 *
 *   - a valid session is required, verified here and not merely at the edge
 *   - DELETE takes one exact `name`; there is no filter-based delete
 *   - the ERP token must have write access on User Permission. If it is
 *     read-only, ERP answers 403 and that is surfaced verbatim rather than
 *     being reported as a generic failure
 */

import { verifySession, readCookie, authConfigured, SESSION_COOKIE, mayAccess } from '../../lib/auth.mjs'
import { AUTH } from '../../lib/auth-secrets.mjs'
import { STORED } from '../../lib/credentials.mjs'
import {
  listUserPermissions, fetchEmployeeIndex, analysePermissions,
  createUserPermission, deleteUserPermission, listAllowOptions,
  COMMON_ALLOW_DOCTYPES,
} from '../../lib/permissions.mjs'

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

async function signedIn(req) {
  if (!authConfigured(AUTH)) return false
  const { valid } = await verifySession(
    AUTH.sessionSecret, readCookie(req.headers.get('cookie'), SESSION_COOKIE),
  )
  return valid
}

/**
 * A valid session is not enough — it has to be a session that may reach HERE.
 * The sales-report login holds a perfectly good cookie, and this endpoint serves
 * staff PII, so the role is checked in the function as well as at the edge. Found
 * by selftest-auth: without this, a report session got all the way to ERP.
 */
async function mayCall(req) {
  if (!authConfigured(AUTH)) return false
  const { valid, role } = await verifySession(
    AUTH.sessionSecret, readCookie(req.headers.get('cookie'), SESSION_COOKIE),
  )
  return valid && mayAccess(role, '/api/permissions')
}

/** Credentials from the body (if sent) else the stored ones. */
function credsFrom(body = {}) {
  return {
    erpBaseUrl: body.erpBaseUrl || STORED.erpBaseUrl,
    erpToken: body.erpToken || STORED.erpToken,
  }
}

export default async (req) => {
  if (!(await signedIn(req))) {
    return json(401, { error: 'Not signed in.', code: 'AUTH_REQUIRED' })
  }
  if (!(await mayCall(req))) {
    return json(403, { error: 'This login does not have access to that.', code: 'ROLE_FORBIDDEN' })
  }

  const url = new URL(req.url)

  let body = {}
  if (req.method === 'POST' || req.method === 'DELETE') {
    try {
      const text = await req.text()
      body = text ? JSON.parse(text) : {}
    } catch {
      return json(400, { error: 'Expected a JSON body.', code: 'BAD_BODY' })
    }
  }

  const creds = credsFrom(body)
  if (!creds.erpToken) {
    return json(428, { error: 'No ERP API token available.', code: 'CREDENTIALS_REQUIRED' })
  }

  try {
    if (req.method === 'GET') {
      const optionsFor = url.searchParams.get('options')
      if (optionsFor) {
        return json(200, { doctype: optionsFor, options: await listAllowOptions(creds, optionsFor) })
      }
      const user = url.searchParams.get('user') || ''
      const [permissions, employees] = await Promise.all([
        listUserPermissions(creds, user ? { user } : {}),
        fetchEmployeeIndex(creds),
      ])
      const analysis = analysePermissions(permissions, employees)
      return json(200, {
        ...analysis,
        allowDoctypes: COMMON_ALLOW_DOCTYPES,
        // Only users that exist as an Employee login, so the picker cannot invent
        // a permission for an address ERP does not know.
        users: [...new Set(employees.map((e) => e.user_id).filter(Boolean))].sort(),
        employees: employees
          .filter((e) => e.status === 'Active')
          .map((e) => ({ id: e.name, name: e.employee_name, user: e.user_id || '' })),
        scope: user || 'all',
      })
    }

    if (req.method === 'POST') {
      const created = await createUserPermission(creds, body)
      return json(201, { ok: true, created })
    }

    if (req.method === 'DELETE') {
      const name = url.searchParams.get('name') || body.name
      const deleted = await deleteUserPermission(creds, name)
      return json(200, { ok: true, ...deleted })
    }

    return json(405, { error: 'GET, POST or DELETE.' })
  } catch (err) {
    const status = err.code === 'BAD_INPUT' ? 400
      : err.code === 'ERP_FORBIDDEN' ? 403
      : err.code === 'ERP_DUPLICATE' ? 409
      : 502
    if (err.code === 'ERP_FORBIDDEN') {
      return json(403, {
        error: `${err.message} — the ERP API token needs write access on User Permission.`,
        code: err.code,
      })
    }
    console.error('permissions failed:', err.message)
    return json(status, { error: err.message, code: err.code || 'ERP_ERROR' })
  }
}

export const config = { path: '/api/permissions' }
