#!/usr/bin/env node
/**
 * Account Audit Dashboard — local dev server.
 *
 * Serves public/index.html and the same report the deployed Netlify function
 * serves, from the same shared core in lib/audit.mjs. Run this to work on the
 * dashboard, or when you'd rather not go through the deployed site at all.
 *
 *   node tools/auth-audit-dashboard/server.mjs   ->  http://127.0.0.1:4820
 *
 * Binds 127.0.0.1 ONLY. That is the entire security model here: this thing
 * serves staff PII and holds an ERP token, so it must never listen on a shared
 * interface. The deployed copy is password-gated instead — see DEPLOY.md.
 */

import { createServer } from 'node:http'
import { readFile, writeFile } from 'node:fs/promises'
import { join, extname, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  CONFIG, TOKEN_FILE, loadReport, erpFetch, getErpToken, setErpToken,
  invalidateReportCache, log,
} from './lib/audit.mjs'
import { STORED } from './lib/credentials.mjs'
import {
  listUserPermissions, fetchEmployeeIndex, analysePermissions,
  createUserPermission, deleteUserPermission, listAllowOptions,
  COMMON_ALLOW_DOCTYPES,
} from './lib/permissions.mjs'
import { buildSalesReport, listCompanies } from './lib/sales.mjs'

/**
 * Credentials for a local run. `allowLocalFallback` is what lets the shared core
 * fall back to the service-account key file (or gcloud) instead of demanding the
 * JSON up front — a deployed request never sets it.
 */
async function localCreds() {
  return {
    erpBaseUrl: CONFIG.erpBaseUrl,
    erpToken: STORED.erpToken || (await getErpToken()) || '',
    serviceAccountJson: STORED.serviceAccountJson,
    allowLocalFallback: true,
  }
}

const HERE = dirname(fileURLToPath(import.meta.url))
const PUBLIC_DIR = join(HERE, 'public')

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
}

function sendJson(res, status, body) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(JSON.stringify(body))
}

async function readBody(req) {
  const chunks = []
  for await (const c of req) chunks.push(c)
  return Buffer.concat(chunks).toString('utf8')
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1')
  try {
    if (url.pathname === '/api/status') {
      const token = await getErpToken()
      return sendJson(res, 200, {
        hasErpToken: Boolean(token),
        erpBaseUrl: CONFIG.erpBaseUrl,
        firebaseProjectId: CONFIG.firebaseProjectId,
        timezone: CONFIG.timezone,
        workingStatuses: CONFIG.workingStatuses,
        tokenSource: CONFIG.erpApiToken ? '$ERP_API_TOKEN' : token ? 'erp-token.txt' : 'none',
        // The local server never asks for the dashboard password: it is
        // unreachable from anywhere but this machine.
        requiresPassword: false,
      })
    }

    if (url.pathname === '/api/erp-token' && req.method === 'POST') {
      const { token } = JSON.parse((await readBody(req)) || '{}')
      const clean = String(token || '').trim()
      if (!/^(token\s+)?[^:\s]+:[^:\s]+$/.test(clean)) {
        return sendJson(res, 400, { error: 'Expected "api_key:api_secret".' })
      }
      setErpToken(clean)
      try {
        // Verify before persisting — a saved bad token is worse than no token.
        await erpFetch('/api/resource/Employee?limit_page_length=1&fields=["name"]')
      } catch (err) {
        setErpToken(null)
        return sendJson(res, 400, { error: `ERP rejected that token — ${err.message}` })
      }
      await writeFile(TOKEN_FILE, `${clean}\n`, 'utf8')
      invalidateReportCache()
      log('erp token saved to erp-token.txt')
      return sendJson(res, 200, { ok: true })
    }

    if (url.pathname === '/api/permissions') {
      const creds = await localCreds()
      if (!creds.erpToken) {
        return sendJson(res, 428, { error: 'No ERP API token yet.', code: 'CREDENTIALS_REQUIRED' })
      }
      const body = (req.method === 'POST' || req.method === 'DELETE')
        ? JSON.parse((await readBody(req)) || '{}')
        : {}

      if (req.method === 'GET') {
        const optionsFor = url.searchParams.get('options')
        if (optionsFor) {
          return sendJson(res, 200, {
            doctype: optionsFor,
            options: await listAllowOptions(creds, optionsFor),
          })
        }
        const user = url.searchParams.get('user') || ''
        const [permissions, employees] = await Promise.all([
          listUserPermissions(creds, user ? { user } : {}),
          fetchEmployeeIndex(creds),
        ])
        return sendJson(res, 200, {
          ...analysePermissions(permissions, employees),
          allowDoctypes: COMMON_ALLOW_DOCTYPES,
          users: [...new Set(employees.map((e) => e.user_id).filter(Boolean))].sort(),
          employees: employees.filter((e) => e.status === 'Active')
            .map((e) => ({ id: e.name, name: e.employee_name, user: e.user_id || '' })),
          scope: user || 'all',
        })
      }
      if (req.method === 'POST') {
        return sendJson(res, 201, { ok: true, created: await createUserPermission(creds, body) })
      }
      if (req.method === 'DELETE') {
        const name = url.searchParams.get('name') || body.name
        return sendJson(res, 200, { ok: true, ...(await deleteUserPermission(creds, name)) })
      }
      return sendJson(res, 405, { error: 'GET, POST or DELETE.' })
    }

    /**
     * The sales report. Deployed this sits behind its own login; locally there is
     * no login at all, so it is simply available.
     */
    if (url.pathname === '/api/sales') {
      const creds = await localCreds()
      if (!creds.erpToken) {
        return sendJson(res, 428, { error: 'No ERP API token yet.', code: 'CREDENTIALS_REQUIRED' })
      }
      if (url.searchParams.get('options') === 'company') {
        return sendJson(res, 200, { companies: await listCompanies(creds) })
      }
      const today = new Intl.DateTimeFormat('en-CA', {
        timeZone: CONFIG.timezone, year: 'numeric', month: '2-digit', day: '2-digit',
      }).format(new Date())
      const data = await buildSalesReport({
        creds,
        query: Object.fromEntries(url.searchParams),
        today,
      })
      return sendJson(res, 200, { ...data, role: 'admin' })
    }

    if (url.pathname === '/api/report') {
      const creds = await localCreds()
      if (!creds.erpToken) {
        // 428 makes the page show its paste-a-token form.
        return sendJson(res, 428, {
          error: 'No ERP API token yet — paste one into the dashboard.',
          code: 'NO_ERP_TOKEN',
        })
      }
      const data = await loadReport({
        refresh: url.searchParams.get('refresh') === '1',
        creds,
      })
      return sendJson(res, 200, data)
    }

    const file = url.pathname === '/' ? 'index.html' : url.pathname.replace(/^\/+/, '')
    if (file.includes('..')) { res.writeHead(403).end('nope'); return }
    try {
      const body = await readFile(join(PUBLIC_DIR, file))
      res.writeHead(200, {
        'content-type': MIME[extname(file)] || 'application/octet-stream',
        'cache-control': 'no-store',
      })
      return res.end(body)
    } catch {
      res.writeHead(404, { 'content-type': 'text/plain' })
      return res.end('Not found')
    }
  } catch (err) {
    log(`error: ${err.message}`)
    return sendJson(res, err.code === 'NO_ERP_TOKEN' ? 428 : 500, {
      error: err.message, code: err.code || 'ERROR',
    })
  }
})

server.listen(CONFIG.port, '127.0.0.1', () => {
  console.log('')
  console.log('  Account Audit Dashboard (local)')
  console.log(`  ERP ${CONFIG.erpBaseUrl}   Firebase ${CONFIG.firebaseProjectId}`)
  console.log(`  →  http://127.0.0.1:${CONFIG.port}`)
  console.log('  Ctrl+C to stop')
  console.log('')
})
