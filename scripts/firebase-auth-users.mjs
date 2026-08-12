#!/usr/bin/env node
/**
 * List Firebase Authentication accounts, optionally only the ones created "today".
 *
 * Firebase Auth has NO server-side filter on createdAt — the only way to list
 * accounts is the Identity Toolkit `accounts:batchGet` endpoint (the same one
 * `admin.auth().listUsers()` and `firebase auth:export` use), which returns every
 * user page by page. So this script pages through all accounts and filters
 * client-side on the creation date, in a real timezone (default Asia/Kolkata).
 *
 * Auth: a service-account key (JWT -> access token, no npm deps), or an existing
 * gcloud access token. See scripts/README-firebase-auth-users.md for details.
 *
 * Usage:
 *   node scripts/firebase-auth-users.mjs                        # created today (IST)
 *   node scripts/firebase-auth-users.mjs --date=2026-08-10      # a specific day
 *   node scripts/firebase-auth-users.mjs --days=7               # last 7 days incl. today
 *   node scripts/firebase-auth-users.mjs --all                  # every account, no date filter
 *   node scripts/firebase-auth-users.mjs --json                 # JSON instead of a table
 *   node scripts/firebase-auth-users.mjs --out=new-users.csv    # also write a CSV
 *   node scripts/firebase-auth-users.mjs --tz=UTC --date=2026-08-10
 *   node scripts/firebase-auth-users.mjs --sort=created --field=lastLoginAt
 *
 * Flags:
 *   --project=ID   Firebase project id (default: NEXT_PUBLIC_FIREBASE_PROJECT_ID or elbrit-sso-d01d9)
 *   --key=PATH     service-account JSON key (default: $GOOGLE_APPLICATION_CREDENTIALS, then FIREBASE_SA_KEY)
 *   --token=TOKEN  use this OAuth access token instead of a key file
 *   --date=DATE    YYYY-MM-DD in --tz (default: today)
 *   --days=N       last N days including today (overrides --date)
 *   --all          no date filter
 *   --tz=ZONE      IANA timezone for day boundaries (default: Asia/Kolkata)
 *   --field=NAME   date field to filter/sort on: createdAt (default) | lastLoginAt | lastRefreshAt
 *   --sort=WHICH   created | email | provider   (default: created, oldest first)
 *   --json         print JSON array
 *   --csv          print CSV to stdout
 *   --out=PATH     write CSV to a file (PII — keep it out of git)
 *   --quiet        suppress progress lines on stderr
 */

import { createSign } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

const DEFAULT_PROJECT = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'elbrit-sso-d01d9'
const DEFAULT_TZ = 'Asia/Kolkata'
const SCOPE = 'https://www.googleapis.com/auth/cloud-platform'
const PAGE_SIZE = 1000

// ---------------------------------------------------------------- args

function parseArgs(argv) {
  const opts = {}
  for (const arg of argv) {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(arg)
    if (!m) continue
    opts[m[1]] = m[2] === undefined ? true : m[2]
  }
  return opts
}

const opts = parseArgs(process.argv.slice(2))
const quiet = Boolean(opts.quiet)
const log = (...a) => { if (!quiet) console.error(...a) }

const project = opts.project || DEFAULT_PROJECT
const tz = opts.tz || DEFAULT_TZ
const dateField = opts.field || 'createdAt'
if (!['createdAt', 'lastLoginAt', 'lastRefreshAt'].includes(dateField)) {
  console.error(`--field must be createdAt, lastLoginAt or lastRefreshAt (got "${dateField}")`)
  process.exit(2)
}

// ---------------------------------------------------------------- dates

/** YYYY-MM-DD for an epoch-ms instant, as seen in `tz`. */
function localDateKey(ms, timeZone) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(ms))
}

/** Human-readable local timestamp, for display. */
function localStamp(ms, timeZone) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).format(new Date(ms)).replace(', ', ' ')
}

/**
 * Which local days count as a hit. Comparing date *strings* rather than epoch
 * ranges keeps this correct across DST and avoids offset math entirely.
 */
function targetDateKeys() {
  if (opts.all) return null
  const today = localDateKey(Date.now(), tz)
  if (opts.days) {
    const n = Number(opts.days)
    if (!Number.isInteger(n) || n < 1) {
      console.error(`--days must be a positive integer (got "${opts.days}")`)
      process.exit(2)
    }
    // Walk back from today's local midnight-as-UTC; only the date part is used,
    // so a fixed 24h step is safe here.
    const anchor = Date.parse(`${today}T12:00:00Z`)
    return new Set(
      Array.from({ length: n }, (_, i) => localDateKey(anchor - i * 86_400_000, tz)),
    )
  }
  const date = opts.date === true ? null : opts.date
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    console.error(`--date must be YYYY-MM-DD (got "${date}")`)
    process.exit(2)
  }
  return new Set([date || today])
}

// ---------------------------------------------------------------- auth

async function tokenFromServiceAccountKey(keyPath) {
  const key = JSON.parse(await readFile(keyPath, 'utf8'))
  if (!key.client_email || !key.private_key) {
    throw new Error(`${keyPath} is not a service-account key (needs client_email + private_key)`)
  }
  const tokenUri = key.token_uri || 'https://oauth2.googleapis.com/token'
  const iat = Math.floor(Date.now() / 1000)
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({
    iss: key.client_email, scope: SCOPE, aud: tokenUri, iat, exp: iat + 3600,
  })}`
  const signer = createSign('RSA-SHA256')
  signer.update(unsigned)
  const assertion = `${unsigned}.${signer.sign(key.private_key, 'base64url')}`

  const res = await fetch(tokenUri, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  })
  const body = await res.text()
  if (!res.ok) throw new Error(`token exchange failed (${res.status}): ${body}`)
  log(`auth: service account ${key.client_email}`)
  return JSON.parse(body).access_token
}

async function tokenFromGcloud() {
  const { stdout } = await execFileAsync(
    process.platform === 'win32' ? 'gcloud.cmd' : 'gcloud',
    ['auth', 'print-access-token'],
    { windowsHide: true },
  )
  log('auth: gcloud active account')
  return stdout.trim()
}

async function getAccessToken() {
  if (typeof opts.token === 'string') { log('auth: --token'); return opts.token }
  if (process.env.FIREBASE_ACCESS_TOKEN) {
    log('auth: $FIREBASE_ACCESS_TOKEN')
    return process.env.FIREBASE_ACCESS_TOKEN
  }
  const keyPath = (typeof opts.key === 'string' && opts.key)
    || process.env.GOOGLE_APPLICATION_CREDENTIALS
    || process.env.FIREBASE_SA_KEY
  if (keyPath) return tokenFromServiceAccountKey(keyPath)
  return tokenFromGcloud()
}

// ---------------------------------------------------------------- fetch users

/**
 * Page through every account. `accounts:batchGet` is the only list endpoint;
 * there is no createdAt query parameter, hence the client-side filter.
 */
async function fetchAllUsers(token) {
  const users = []
  let pageToken
  let page = 0
  do {
    const url = new URL(`https://identitytoolkit.googleapis.com/v1/projects/${project}/accounts:batchGet`)
    url.searchParams.set('maxResults', String(PAGE_SIZE))
    if (pageToken) url.searchParams.set('nextPageToken', pageToken)

    const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } })
    const text = await res.text()
    if (!res.ok) throw new Error(`accounts:batchGet failed (${res.status}): ${text}`)
    const json = JSON.parse(text)

    users.push(...(json.users || []))
    pageToken = json.nextPageToken
    log(`page ${++page}: +${(json.users || []).length} (total ${users.length})`)
  } while (pageToken)
  return users
}

// ---------------------------------------------------------------- shape

function providersOf(u) {
  const set = new Set((u.providerUserInfo || []).map((p) => p.providerId).filter(Boolean))
  if (u.phoneNumber) set.add('phone')
  if (u.passwordHash && !set.size) set.add('password')
  return [...set]
}

function toRow(u) {
  const created = Number(u.createdAt) || null
  const lastLogin = Number(u.lastLoginAt) || null
  const lastRefresh = u.lastRefreshAt ? Date.parse(u.lastRefreshAt) : null
  return {
    uid: u.localId,
    email: u.email || '',
    phoneNumber: u.phoneNumber || '',
    displayName: u.displayName || '',
    providers: providersOf(u).join('|'),
    emailVerified: Boolean(u.emailVerified),
    disabled: Boolean(u.disabled),
    createdAtMs: created,
    createdAtLocal: created ? localStamp(created, tz) : '',
    createdAtUtc: created ? new Date(created).toISOString() : '',
    lastLoginLocal: lastLogin ? localStamp(lastLogin, tz) : '',
    lastRefreshLocal: lastRefresh ? localStamp(lastRefresh, tz) : '',
    signedIn: Boolean(lastLogin),
  }
}

function fieldMs(u) {
  if (dateField === 'lastRefreshAt') return u.lastRefreshAt ? Date.parse(u.lastRefreshAt) : null
  return Number(u[dateField]) || null
}

const CSV_COLS = [
  'uid', 'email', 'phoneNumber', 'displayName', 'providers',
  'emailVerified', 'disabled', 'createdAtLocal', 'createdAtUtc',
  'lastLoginLocal', 'lastRefreshLocal',
]

function toCsv(rows) {
  const esc = (v) => {
    const s = v === null || v === undefined ? '' : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [CSV_COLS.join(','), ...rows.map((r) => CSV_COLS.map((c) => esc(r[c])).join(','))].join('\n')
}

function printTable(rows) {
  const cols = [
    ['createdAtLocal', 'CREATED (' + tz + ')'],
    ['providers', 'PROVIDER'],
    ['email', 'EMAIL'],
    ['phoneNumber', 'PHONE'],
    ['displayName', 'NAME'],
    ['uid', 'UID'],
  ]
  const width = (k, h) => Math.max(h.length, ...rows.map((r) => String(r[k] ?? '').length))
  const w = cols.map(([k, h]) => width(k, h))
  const line = (cells) => cells.map((c, i) => String(c ?? '').padEnd(w[i])).join('  ').trimEnd()
  console.log(line(cols.map(([, h]) => h)))
  console.log(w.map((n) => '-'.repeat(n)).join('  '))
  for (const r of rows) console.log(line(cols.map(([k]) => r[k])))
}

// ---------------------------------------------------------------- main

const keys = targetDateKeys()
const label = keys ? [...keys].sort().join(', ') : 'all time'

log(`project: ${project}`)
log(`filter:  ${dateField} in [${label}] (${tz})`)

const token = await getAccessToken()
const all = await fetchAllUsers(token)

let rows = all
  .filter((u) => {
    if (!keys) return true
    const ms = fieldMs(u)
    return ms ? keys.has(localDateKey(ms, tz)) : false
  })
  .map(toRow)

const sort = opts.sort || 'created'
rows.sort((a, b) => {
  if (sort === 'email') return (a.email || a.phoneNumber).localeCompare(b.email || b.phoneNumber)
  if (sort === 'provider') return a.providers.localeCompare(b.providers) || (a.createdAtMs - b.createdAtMs)
  return (a.createdAtMs || 0) - (b.createdAtMs || 0)
})

log(`matched: ${rows.length} of ${all.length} total accounts`)

if (opts.json) {
  console.log(JSON.stringify(rows, null, 2))
} else if (opts.csv) {
  console.log(toCsv(rows))
} else if (rows.length === 0) {
  console.log(`No accounts with ${dateField} on ${label} (${tz}). Total accounts in ${project}: ${all.length}.`)
} else {
  printTable(rows)
  const byProvider = rows.reduce((acc, r) => {
    acc[r.providers || '(none)'] = (acc[r.providers || '(none)'] || 0) + 1
    return acc
  }, {})
  console.log('')
  console.log(`${rows.length} account(s) — ${Object.entries(byProvider).map(([p, n]) => `${p}: ${n}`).join(', ')}`)
  console.log(`(${all.length} accounts total in ${project})`)
}

if (typeof opts.out === 'string' && opts.out) {
  await writeFile(opts.out, `${toCsv(rows)}\n`, 'utf8')
  log(`wrote ${rows.length} row(s) to ${opts.out}`)
}
