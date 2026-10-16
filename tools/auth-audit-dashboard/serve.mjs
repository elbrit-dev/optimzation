#!/usr/bin/env node
/**
 * Account Audit Dashboard — production server for Firebase App Hosting (Cloud Run).
 *
 * Not to be confused with server.mjs, the 127.0.0.1-only dev server. This one
 * listens on $PORT on every interface, so it MUST carry the same auth layer the
 * Netlify deploy has. It does that by running the very same modules:
 *
 *   netlify/edge-functions/gate.mjs  — in front of every request, static page included
 *   netlify/functions/*.mjs          — the /api/* handlers, which re-check the session
 *
 * Both are Web-standard (Request -> Response), so the only thing written here is
 * the Node <-> Fetch plumbing, static file serving, and the response headers that
 * netlify.toml used to add. No auth decision is made in this file.
 */

import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { join, extname, dirname, normalize, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import gate from './netlify/edge-functions/gate.mjs'
import login from './netlify/functions/login.mjs'
import report from './netlify/functions/report.mjs'
import permissions from './netlify/functions/permissions.mjs'
import sales from './netlify/functions/sales.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const PUBLIC_DIR = join(HERE, 'public')
const PORT = Number(process.env.PORT) || 8080

const API = {
  '/api/login': login,
  '/api/logout': login,
  '/api/report': report,
  '/api/permissions': permissions,
  '/api/sales': sales,
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
}

/** What netlify.toml's [[headers]] blocks applied. Staff PII: no index, no cache, no framing. */
const SECURITY_HEADERS = {
  'x-robots-tag': 'noindex, nofollow, noarchive',
  'x-frame-options': 'DENY',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'cache-control': 'no-store, must-revalidate',
  'permissions-policy': 'geolocation=(), microphone=(), camera=()',
}
const API_HEADERS = {
  'cache-control': 'no-store, no-cache, must-revalidate, private',
  'x-robots-tag': 'noindex, nofollow',
}

const notFound = () =>
  new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } })

/** Netlify's pretty URLs: `/` -> index.html, `/sales` -> sales.html. */
async function serveStatic(pathname) {
  let rel = decodeURIComponent(pathname)
  if (rel.endsWith('/')) rel += 'index.html'
  else if (!extname(rel)) rel += '.html'
  const file = normalize(join(PUBLIC_DIR, rel))
  if (!file.startsWith(PUBLIC_DIR + sep)) return notFound()
  try {
    const body = await readFile(file)
    return new Response(body, {
      status: 200,
      headers: { 'content-type': MIME[extname(file)] || 'application/octet-stream' },
    })
  } catch {
    return notFound()
  }
}

/** What the gate's `context.next()` hands control to: the function or the file. */
function origin(request) {
  const { pathname } = new URL(request.url)
  const handler = API[pathname]
  if (handler) return handler(request)
  if (pathname.startsWith('/api/')) {
    return Response.json({ error: 'Unknown endpoint.' }, { status: 404 })
  }
  return serveStatic(pathname)
}

/** Every request goes through the gate first, exactly as on Netlify. */
const handle = (request) => gate(request, { next: () => origin(request) })

function toRequest(req) {
  // Cloud Run terminates TLS; the forwarded headers carry the public origin, which
  // the gate's redirects and the login cookie's `Secure` flag both rely on.
  const proto = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim()
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost'
  const url = new URL(req.url, `${proto}://${host}`)
  const headers = new Headers()
  for (const [k, v] of Object.entries(req.headers)) {
    if (Array.isArray(v)) v.forEach((x) => headers.append(k, x))
    else if (v != null) headers.set(k, v)
  }
  const hasBody = !['GET', 'HEAD'].includes(req.method)
  return new Request(url, {
    method: req.method,
    headers,
    body: hasBody ? req : undefined,
    duplex: hasBody ? 'half' : undefined,
  })
}

async function send(res, response, pathname) {
  const headers = { ...SECURITY_HEADERS, ...(pathname.startsWith('/api/') ? API_HEADERS : {}) }
  response.headers.forEach((v, k) => { if (k !== 'set-cookie') headers[k] = v })
  const cookies = response.headers.getSetCookie?.() || []
  if (cookies.length) headers['set-cookie'] = cookies
  res.writeHead(response.status, headers)
  res.end(Buffer.from(await response.arrayBuffer()))
}

createServer(async (req, res) => {
  let pathname = '/'
  try {
    const request = toRequest(req)
    pathname = new URL(request.url).pathname
    await send(res, await handle(request), pathname)
  } catch (err) {
    console.error('[serve]', req.method, req.url, err)
    if (!res.headersSent) {
      res.writeHead(500, { ...SECURITY_HEADERS, 'content-type': 'application/json; charset=utf-8' })
    }
    res.end(JSON.stringify({ error: 'Internal error.' }))
  }
}).listen(PORT, () => console.log(`[serve] account audit dashboard on :${PORT}`))
