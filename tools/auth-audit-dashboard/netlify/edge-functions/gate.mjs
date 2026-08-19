/**
 * Auth gate — runs at the edge, in front of EVERYTHING.
 *
 * This is why the auth layer is real rather than cosmetic: the check happens
 * before Netlify serves the static page, so an unauthenticated visitor never
 * receives index.html at all, let alone reaches /api/report.
 *
 * It also enforces the ROLE boundary. There are two logins: full access, and
 * sales-report-only. A report session is turned away from every other path here,
 * at the edge — the page never has to be trusted to hide anything.
 *
 * Runs on Deno, so it uses Web Crypto only — see lib/auth.mjs.
 */

import {
  verifySession, readCookie, authConfigured, SESSION_COOKIE, mayAccess, homeFor,
} from '../../lib/auth.mjs'
import { AUTH } from '../../lib/auth-secrets.mjs'

/** Paths reachable without a session — the login flow itself, and nothing else. */
const PUBLIC_PATHS = new Set(['/login', '/login.html', '/api/login', '/api/logout', '/robots.txt'])

export default async (request, context) => {
  const url = new URL(request.url)
  const path = url.pathname

  if (PUBLIC_PATHS.has(path)) return context.next()

  // No password configured -> deny everything and say so. Failing closed matters
  // more than being reachable: the alternative is an open staff-data dashboard.
  if (!authConfigured(AUTH)) {
    if (path.startsWith('/api/')) {
      return Response.json(
        { error: 'No dashboard password is set. Run set-password.mjs and redeploy.', code: 'AUTH_NOT_CONFIGURED' },
        { status: 503, headers: { 'cache-control': 'no-store' } },
      )
    }
    return new Response(LOCKED_PAGE, {
      status: 503,
      headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
    })
  }

  const { valid, role } = await verifySession(
    AUTH.sessionSecret, readCookie(request.headers.get('cookie'), SESSION_COOKIE),
  )
  if (valid) {
    if (mayAccess(role, path)) return context.next()
    /**
     * Signed in, but not for this page. The report role is enforced HERE, at the
     * edge, so a sales-report user never receives index.html or reaches
     * /api/report — not merely has the link hidden from them.
     */
    if (path.startsWith('/api/')) {
      return Response.json(
        { error: 'This login does not have access to that.', code: 'ROLE_FORBIDDEN', role },
        { status: 403, headers: { 'cache-control': 'no-store' } },
      )
    }
    return Response.redirect(new URL(homeFor(role), url), 302)
  }

  // API callers get a machine-readable 401; browsers get the login page.
  if (path.startsWith('/api/')) {
    return Response.json(
      { error: 'Not signed in.', code: 'AUTH_REQUIRED' },
      { status: 401, headers: { 'cache-control': 'no-store' } },
    )
  }
  const to = new URL('/login.html', url)
  if (path !== '/') to.searchParams.set('next', path)
  return Response.redirect(to, 302)
}

export const config = {
  path: '/*',
  // The gate must not shadow the login assets it redirects to.
  excludedPath: ['/login.html', '/api/login', '/api/logout', '/robots.txt'],
}

const LOCKED_PAGE = `<!doctype html><meta charset="utf-8">
<title>Locked</title>
<style>body{font:15px/1.6 -apple-system,"Segoe UI",Roboto,sans-serif;max-width:34rem;margin:15vh auto;padding:0 1.5rem;color:#14181f}
code{background:#f1f3f5;padding:.15rem .4rem;border-radius:4px;font-size:13px}
@media(prefers-color-scheme:dark){body{background:#0f1216;color:#e8ecf1}code{background:#22272e}}</style>
<h1>Dashboard is locked</h1>
<p>No password has been set, so nothing is being served.</p>
<p>Set one and redeploy:</p>
<pre><code>node tools/auth-audit-dashboard/set-password.mjs --generate</code></pre>`
