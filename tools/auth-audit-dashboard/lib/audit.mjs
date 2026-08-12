/**
 * Account Audit — shared core.
 *
 * Fetches Firebase Auth accounts and ERPNext Employees/Users, then compares them.
 * ONE copy of this logic serves both runtimes:
 *   - local:      ../server.mjs   (node HTTP server on 127.0.0.1)
 *   - Netlify:    ../netlify/functions/report.mjs  (serverless)
 *
 * Config resolves ENV FIRST, then local files, so the same code works in a
 * serverless function (no filesystem, no gcloud) and on a dev machine.
 */

import { createSign, createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { dirname, join, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

const execFileAsync = promisify(execFile)
const HERE = dirname(fileURLToPath(import.meta.url))
const TOOL_ROOT = join(HERE, '..')

// ════════════════════════════════════════════════════════════════════
//  CONFIG
//
//  NO ENV VARS ARE REQUIRED. Credentials come from the dashboard UI, are kept
//  in the browser's localStorage, and are sent with each request. The server
//  stores nothing.
//
//  That is also the entire access-control model, and why there is no password:
//  with no credentials supplied the endpoint can fetch nothing at all, so a
//  stranger who finds the URL gets an empty form. The ERP API token *is* the
//  credential. See `requireCreds` below — it fails closed.
//
//  Non-secret defaults are baked in below (project id, ERP URL). Secrets are
//  deliberately NOT: a service-account private key hardcoded here would ship
//  inside the deployed function bundle and stay in git history permanently,
//  and it grants full admin over the whole Firebase project. Env vars still
//  work if you ever want them, but nothing needs them.
// ════════════════════════════════════════════════════════════════════
const env = (name) => {
  const v = process.env[name]
  return typeof v === 'string' && v.trim() ? v.trim() : ''
}

/**
 * Env-derived values are GETTERS, read at use time rather than snapshotted at
 * import. Two reasons: a serverless module instance outlives a single request,
 * and — more usefully — it makes the auth gate testable in-process
 * (selftest-auth.mjs varies env between cases against a shared module).
 */
const CONFIG = {
  // ── Firebase ──────────────────────────────────────────────────────
  get firebaseProjectId() { return env('FIREBASE_PROJECT_ID') || 'elbrit-sso-d01d9' },

  /**
   * Serverless path: the whole service-account JSON in one env var, raw or
   * base64. This is the ONLY way to authenticate on Netlify — there is no
   * filesystem to read a key from and no gcloud to fall back on.
   */
  get serviceAccountJson() { return env('FIREBASE_SERVICE_ACCOUNT') },

  /**
   * Local path: the key on disk. The `it@elbrit.org` user is under org Cloud
   * session control (its gcloud token expires and reauth needs an interactive
   * password), so a service account is the only thing that works unattended.
   * If this is missing, the local server falls back to
   * `gcloud auth print-access-token`.
   */
  get serviceAccountKey() {
    return env('GOOGLE_APPLICATION_CREDENTIALS')
      || 'C:/Users/bbhar/Downloads/elbrit-sso-d01d9-4d7291fcaa38.json'
  },

  // ── ERPNext ───────────────────────────────────────────────────────
  get erpBaseUrl() { return env('ERP_BASE_URL') || 'https://erp.elbrit.org' },

  /**
   * Frappe API token, format "api_key:api_secret" (ERP → User → API Access →
   * Generate Keys; needs read on Employee and on User).
   *
   * Deployed: set ERP_API_TOKEN. Locally: leave blank and paste it into the
   * dashboard once — it saves to erp-token.txt (gitignored) and is reused.
   */
  get erpApiToken() { return env('ERP_API_TOKEN') },

  // ── Behaviour ─────────────────────────────────────────────────────
  get timezone() { return env('TZ_NAME') || 'Asia/Kolkata' },

  /**
   * Which statuses count as "this person should be able to log in". Everything
   * else is still fetched — `Left` is needed to catch departed staff whose ERP
   * login is still enabled — but only these are counted in coverage.
   */
  workingStatuses: ['Active'],

  /**
   * Vacant records are placeholders for open territories, NOT people. They must
   * be excluded everywhere: most carry status "Active" and many carry a real
   * user_id inherited from whoever left, so they would otherwise inflate both
   * the headcount and the pending list.
   */
  excludeVacant: true,

  port: Number(process.env.PORT) || 4820,
  cacheSeconds: 60,
}

const TOKEN_FILE = join(TOOL_ROOT, 'erp-token.txt')

/**
 * 2000/page keeps Employee and User to a single round trip each (~1300 and
 * ~1000 rows today). Netlify caps a synchronous function at 10s wall clock, and
 * six sequential ERP calls would flirt with that ceiling.
 */
const ERP_PAGE_SIZE = 2000
const FB_PAGE_SIZE = 1000

const EMPLOYEE_FIELDS = [
  'name', 'employee_name', 'user_id', 'company_email', 'personal_email',
  'cell_number', 'designation', 'department', 'branch', 'company',
  'status', 'date_of_joining', 'relieving_date', 'reports_to',
]

/**
 * Vacant placeholders are named "Vacant_Aeru Ramulu (E01137)", "Vacant-Vinoth
 * Kannan", "Vacant_BE_Ayodhya" — underscore, hyphen or space after the word.
 *
 * The name is the reliable signal, NOT the employee ID: while every V-prefixed
 * ID (V02014) is vacant, plenty of vacant records carry ordinary IDs — E00993,
 * HR-EMP-00176, HR/00158. Anchored at the start so a real surname containing
 * the letters can never trip it.
 */
const isVacant = (e) => /^vacant\b|^vacant[_-]/i.test(String(e.employee_name ?? '').trim())

// ════════════════════════════════════════════════════════════════════
//  helpers
// ════════════════════════════════════════════════════════════════════

const log = (...a) => console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...a)

/** ERP stores stray whitespace in email fields ("gowthamd.scm@elbrit.org "). */
const normEmail = (v) => String(v ?? '').trim().toLowerCase()

/** "+91 90146 16799", "09014616799" and "9014616799" must all collide. */
const normPhone = (v) => {
  const d = String(v ?? '').replace(/\D/g, '')
  return d.length > 10 ? d.slice(-10) : d
}

const localDateKey = (ms, tz) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date(ms))

const localStamp = (ms, tz) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(ms)).replace(', ', ' ')

/** Strip the " - ELPL" style company suffix ERP appends to department names. */
const cleanDept = (v) => String(v ?? '').replace(/\s*-\s*[A-Z]{2,6}$/, '').trim() || '—'

// ════════════════════════════════════════════════════════════════════
//  Firebase Auth
// ════════════════════════════════════════════════════════════════════

// ════════════════════════════════════════════════════════════════════
//  credentials
// ════════════════════════════════════════════════════════════════════

/** Thrown when nothing was supplied and nothing is configured. */
class CredentialsRequiredError extends Error {
  constructor(missing) {
    super(`Credentials required: ${missing.join(', ')}`)
    this.name = 'CredentialsRequiredError'
    this.code = 'CREDENTIALS_REQUIRED'
    this.missing = missing
  }
}

/**
 * Merge caller-supplied credentials over the built-in defaults.
 *
 * Precedence: what the browser sent > env var > local file / gcloud. The UI is
 * first so the deployed site needs no server-side configuration at all.
 */
function resolveCreds(supplied = {}, { allowServerCreds = true } = {}) {
  const pick = (a, b) => (typeof a === 'string' && a.trim() ? a.trim() : b)
  /**
   * `allowServerCreds: false` means SECRETS MUST COME FROM THE REQUEST. Without
   * this, setting ERP_API_TOKEN / FIREBASE_SERVICE_ACCOUNT on the site would
   * silently make the deployed endpoint answer anonymous callers with the full
   * staff report — the exact leak selftest-auth.mjs guards against. Non-secret
   * defaults (ERP URL, project id) still fall through; they are in the repo.
   */
  const secret = (a, b) => (allowServerCreds ? pick(a, b) : pick(a, ''))
  return {
    erpBaseUrl: pick(supplied.erpBaseUrl, CONFIG.erpBaseUrl),
    erpToken: secret(supplied.erpToken, CONFIG.erpApiToken),
    serviceAccountJson: secret(supplied.serviceAccountJson, CONFIG.serviceAccountJson),
    firebaseProjectId: pick(supplied.firebaseProjectId, CONFIG.firebaseProjectId),
    /** Local-only fallbacks (key file, gcloud); never set by a deployed request. */
    allowLocalFallback: allowServerCreds && supplied.allowLocalFallback === true,
  }
}

/**
 * Fail closed. Without an ERP token AND a Firebase credential there is nothing
 * this endpoint can legitimately answer, so it must refuse rather than serve a
 * partial report — a stranger must not be able to pull the Firebase user list.
 */
function requireCreds(creds) {
  const missing = []
  if (!creds.erpToken) missing.push('ERP API token')
  if (!creds.serviceAccountJson && !creds.allowLocalFallback) {
    missing.push('Firebase service account')
  }
  if (missing.length) throw new CredentialsRequiredError(missing)
}

/** Short stable id for a credential set, so caches never bleed between callers. */
function credsKey(creds) {
  return createHash('sha256')
    .update([creds.erpBaseUrl, creds.erpToken, creds.serviceAccountJson,
      creds.firebaseProjectId, creds.allowLocalFallback].join(' '))
    .digest('hex').slice(0, 16)
}

const googleTokenCache = new Map() // credsKey -> { token, via, expiresAt }

/**
 * Accepts the key as raw JSON or base64 — Netlify's env UI mangles multi-line
 * values, so base64 is the reliable way to carry a PEM private key through it.
 */
function parseServiceAccount(raw) {
  const text = raw.trim().startsWith('{')
    ? raw
    : Buffer.from(raw, 'base64').toString('utf8')
  const key = JSON.parse(text)
  // Netlify's env UI can turn the PEM's \n escapes into literal backslash-n.
  if (key.private_key?.includes('\\n')) {
    key.private_key = key.private_key.replace(/\\n/g, '\n')
  }
  return key
}

async function tokenFromServiceAccount(key, sourceLabel) {
  if (!key.client_email || !key.private_key) {
    throw new Error(`${sourceLabel} is not a service-account key (needs client_email + private_key)`)
  }
  const tokenUri = key.token_uri || 'https://oauth2.googleapis.com/token'
  const iat = Math.floor(Date.now() / 1000)
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({
    iss: key.client_email,
    scope: 'https://www.googleapis.com/auth/cloud-platform',
    aud: tokenUri, iat, exp: iat + 3600,
  })}`
  const signer = createSign('RSA-SHA256')
  signer.update(unsigned)
  const assertion = `${unsigned}.${signer.sign(key.private_key, 'base64url')}`

  const res = await fetch(tokenUri, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion,
    }),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`Google token exchange failed (${res.status}): ${text}`)
  return { token: JSON.parse(text).access_token, via: `service account ${key.client_email}` }
}

async function tokenFromGcloud() {
  const { stdout } = await execFileAsync(
    process.platform === 'win32' ? 'gcloud.cmd' : 'gcloud',
    ['auth', 'print-access-token'], { windowsHide: true },
  )
  return { token: stdout.trim(), via: 'gcloud active account' }
}

async function getGoogleToken(creds = {}) {
  const key = credsKey(resolveCreds(creds))
  const cached = googleTokenCache.get(key)
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached

  // Supplied credential first — that's the deployed path, where there is no key
  // file and no gcloud. The local fallbacks only run when explicitly allowed.
  let result
  if (creds.serviceAccountJson) {
    result = await tokenFromServiceAccount(
      parseServiceAccount(creds.serviceAccountJson), 'supplied service account')
  } else if (CONFIG.serviceAccountJson) {
    result = await tokenFromServiceAccount(
      parseServiceAccount(CONFIG.serviceAccountJson), '$FIREBASE_SERVICE_ACCOUNT')
  } else {
    try {
      const raw = await readFile(CONFIG.serviceAccountKey, 'utf8')
      result = await tokenFromServiceAccount(parseServiceAccount(raw), CONFIG.serviceAccountKey)
    } catch (err) {
      log(`service-account key unusable (${err.message}) — falling back to gcloud`)
      result = await tokenFromGcloud()
    }
  }
  const entry = { ...result, expiresAt: Date.now() + 55 * 60_000 }
  googleTokenCache.set(key, entry)
  return entry
}

/**
 * Identity Toolkit has no server-side createdAt filter — accounts:batchGet is
 * the only list endpoint (it's what admin.auth().listUsers() uses), so we page
 * through everything and filter in memory. Fine well past 10k accounts.
 */
async function fetchFirebaseUsers(creds = {}) {
  const { token, via } = await getGoogleToken(creds)
  const users = []
  let pageToken
  do {
    const url = new URL(`https://identitytoolkit.googleapis.com/v1/projects/${creds.firebaseProjectId || CONFIG.firebaseProjectId}/accounts:batchGet`)
    url.searchParams.set('maxResults', String(FB_PAGE_SIZE))
    if (pageToken) url.searchParams.set('nextPageToken', pageToken)
    const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } })
    const text = await res.text()
    if (!res.ok) throw new Error(`Firebase accounts:batchGet failed (${res.status}): ${text}`)
    const json = JSON.parse(text)
    users.push(...(json.users || []))
    pageToken = json.nextPageToken
  } while (pageToken)
  log(`firebase: ${users.length} accounts (${via})`)
  return users
}

function shapeFirebaseUser(u, tz) {
  const created = Number(u.createdAt) || null
  const lastLogin = Number(u.lastLoginAt) || null
  const lastRefresh = u.lastRefreshAt ? Date.parse(u.lastRefreshAt) : null
  const providers = new Set((u.providerUserInfo || []).map((p) => p.providerId).filter(Boolean))
  if (u.phoneNumber) providers.add('phone')
  return {
    uid: u.localId,
    email: normEmail(u.email),
    phone: u.phoneNumber || '',
    phoneKey: normPhone(u.phoneNumber),
    displayName: u.displayName || '',
    providers: [...providers],
    disabled: Boolean(u.disabled),
    createdAtMs: created,
    createdAt: created ? localStamp(created, tz) : '',
    createdDay: created ? localDateKey(created, tz) : '',
    lastLogin: lastLogin ? localStamp(lastLogin, tz) : '',
    lastActive: lastRefresh ? localStamp(lastRefresh, tz) : '',
    signedIn: Boolean(lastLogin),
    // secondary emails from linked providers — a Google account can carry an
    // address different from the top-level one
    altEmails: [...new Set((u.providerUserInfo || []).map((p) => normEmail(p.email)).filter(Boolean))],
  }
}

// ════════════════════════════════════════════════════════════════════
//  ERPNext
// ════════════════════════════════════════════════════════════════════

let erpTokenCache = null

/**
 * Local convenience only: the token the local server saved to erp-token.txt.
 * A deployed request always carries its own token, so this never runs there.
 */
async function getErpToken({ refresh = false } = {}) {
  if (erpTokenCache && !refresh) return erpTokenCache
  if (CONFIG.erpApiToken) {
    erpTokenCache = CONFIG.erpApiToken
    return erpTokenCache
  }
  try {
    const saved = (await readFile(TOKEN_FILE, 'utf8')).trim()
    if (saved) { erpTokenCache = saved; return erpTokenCache }
  } catch { /* not saved yet */ }
  return null
}

/** Lets the local server hand a freshly pasted token to the shared core. */
function setErpToken(token) {
  erpTokenCache = token ? String(token).trim() : null
}

/**
 * @param {string} path
 * @param {{erpToken?, erpBaseUrl?, method?, body?}} [creds]
 *   `method`/`body` are only used by the User Permission writes — everything
 *   else in this tool is a plain GET.
 */
async function erpFetch(path, creds = {}) {
  const token = creds.erpToken || await getErpToken()
  if (!token) {
    const err = new Error('No ERP API token supplied — add one in the dashboard.')
    err.code = 'NO_ERP_TOKEN'
    throw err
  }
  const method = creds.method || 'GET'
  const res = await fetch(`${creds.erpBaseUrl || CONFIG.erpBaseUrl}${path}`, {
    method,
    headers: {
      Accept: 'application/json',
      ...(creds.body ? { 'Content-Type': 'application/json' } : {}),
      // Tolerate a pasted value that already carries the scheme, otherwise we'd
      // send "token token k:s" and ERP 401s with no clue why.
      Authorization: /^token\s/i.test(token) ? token : `token ${token}`,
    },
    ...(creds.body ? { body: JSON.stringify(creds.body) } : {}),
  })
  const text = await res.text()
  let json = null
  try { json = JSON.parse(text) } catch { /* HTML error page */ }
  if (!res.ok) {
    // Frappe buries the useful line in _server_messages; surface that first.
    let detail = json?.exception || json?.message || text.slice(0, 200)
    if (json?._server_messages) {
      try {
        const first = JSON.parse(json._server_messages)[0]
        const parsed = typeof first === 'string' ? JSON.parse(first) : first
        if (parsed?.message) detail = parsed.message
      } catch { /* keep what we had */ }
    }
    const err = new Error(`ERP ${res.status}: ${String(detail).replace(/<[^>]+>/g, ' ').trim()}`)
    err.code = res.status === 401 ? 'BAD_ERP_TOKEN'
      : res.status === 403 ? 'ERP_FORBIDDEN'
      : res.status === 409 ? 'ERP_DUPLICATE'
      : 'ERP_ERROR'
    err.status = res.status
    throw err
  }
  return json
}

async function erpList(doctype, fields, filters, creds) {
  const out = []
  for (let start = 0; ; start += ERP_PAGE_SIZE) {
    const q = new URLSearchParams({
      fields: JSON.stringify(fields),
      limit_start: String(start),
      limit_page_length: String(ERP_PAGE_SIZE),
      order_by: 'name asc',
    })
    if (filters?.length) q.set('filters', JSON.stringify(filters))
    const json = await erpFetch(`/api/resource/${encodeURIComponent(doctype)}?${q}`, creds)
    const rows = json?.data || []
    out.push(...rows)
    if (rows.length < ERP_PAGE_SIZE) break
  }
  return out
}

/**
 * All statuses, because "Left employee whose ERP login is still enabled" needs
 * the departed ones. Per-tab scoping happens in buildReport.
 */
async function fetchEmployees(creds) {
  const rows = await erpList('Employee', EMPLOYEE_FIELDS, [], creds)
  const vacant = rows.filter(isVacant)
  const kept = CONFIG.excludeVacant ? rows.filter((e) => !isVacant(e)) : rows
  log(`erp: ${rows.length} employees, ${vacant.length} vacant excluded, ${kept.length} real`)
  return { employees: kept, vacantCount: vacant.length }
}

/**
 * ERP User records, best-effort. Answers "does this person even have an ERP
 * login, and is it enabled" — a different failure from "no Firebase account".
 * Read permission on User is often restricted, so a failure here must not sink
 * the whole report.
 */
async function fetchErpUsers(creds) {
  try {
    const rows = await erpList('User',
      ['name', 'enabled', 'user_type', 'full_name', 'mobile_no', 'phone',
        'last_login', 'last_active'], [], creds)
    log(`erp: ${rows.length} user records (${rows.filter((u) => u.enabled).length} enabled)`)
    return rows
  } catch (err) {
    log(`erp: User doctype unreadable (${err.message}) — link tab will be partial`)
    return null
  }
}

// ════════════════════════════════════════════════════════════════════
//  the comparison
// ════════════════════════════════════════════════════════════════════

/**
 * The phone number comes from the linked ERP User record, not from
 * `Employee.cell_number`.
 *
 * Both User fields have to be read: `mobile_no` is null on a large share of
 * enabled users while `phone` carries the number, and where both are set they
 * hold the same value. Values also arrive with stray whitespace (" 9659824225").
 */
const userPhoneOf = (erpUser) => {
  if (!erpUser) return ''
  return normPhone(erpUser.mobile_no) || normPhone(erpUser.phone)
}

/**
 * Credentials an employee could have signed in with, most authoritative first.
 *
 * `authoritative` marks a match on the person's ACTUAL ERP LOGIN IDENTITY:
 *
 *   - the ERP login address itself (`user_id`)
 *   - the phone on that same linked ERP User record
 *
 * A match on `company_email` or `personal_email` that differs from `user_id`
 * proves only that a Firebase account exists carrying an address we hold for
 * that person. It is weaker evidence, and it is not the identity ERP knows them
 * by, so it does not count toward coverage.
 *
 * WHAT IS NOT KNOWN: whether such an account can actually use the app.
 * lib/loginDiagnostics.js says a login is mapped onto an ERP User via
 * `Employee.user_id` ("until then the app has no ERP account to map the login
 * onto"), which would mean these cannot get in. But the app's ERP token is
 * shared per environment rather than per user (Firestore `tokens/{ERP|DEV}`),
 * and the code that resolves a Firebase login to an ERP identity is not in this
 * repo — it lives in Plasmic. So this deliberately reports the FACT (which
 * credential matched) and never claims the account is unusable.
 *
 * Counting is conservative on purpose: a coverage number that is too low makes
 * you chase someone who is already fine, while one that is too high hides
 * someone who cannot get in. Live data: 14 of 206 apparent registrations match
 * only on a non-login address, 11 of them personal gmail addresses.
 */
function matchCandidates(e, erpUser) {
  return [
    { value: normEmail(e.user_id), kind: 'email', label: 'ERP login email', authoritative: true },
    { value: userPhoneOf(erpUser), kind: 'phone', label: 'ERP user phone', authoritative: true },
    /**
     * Employee.cell_number is ALSO authoritative for a phone signup, and it has
     * to be checked — reading the phone only off the linked User record missed 18
     * real logins on live data. 14 of those User records held no phone at all,
     * and 4 held a stale number from a recycled login: E01257 "Sreejith K" has
     * cell 8921442251 (which does have a Firebase account) while his User record
     * still carried 9895551121 from his predecessor, plus a last_login predating
     * his own joining date.
     *
     * `cell_number` is HR-maintained and current; the User record's phone is
     * frequently neither. For a phone signup there is no email involved at all,
     * so a Firebase account under the number HR holds for someone is direct
     * evidence that person signed up.
     */
    {
      value: normPhone(e.cell_number),
      kind: 'phone',
      label: 'Employee cell',
      // Only counts as a working login if there is an ERP account for the login
      // to land on. Without a user_id this is the same "signed up but ERP has
      // nowhere to map them" case as a personal-email match — and it shows up on
      // the link tab as `no user link`, which is the thing to fix first.
      authoritative: Boolean(normEmail(e.user_id)),
    },
    { value: normEmail(e.company_email), kind: 'email', label: 'Company email', authoritative: false },
    { value: normEmail(e.personal_email), kind: 'email', label: 'Personal email', authoritative: false },
  ].filter((c) => c.value)
}

function buildReport({ firebaseUsers, employees, erpUsers, tz, vacantCount = 0 }) {
  const fbShaped = firebaseUsers.map((u) => shapeFirebaseUser(u, tz))

  const byEmail = new Map()
  const byPhone = new Map()
  for (const u of fbShaped) {
    if (u.email && !byEmail.has(u.email)) byEmail.set(u.email, u)
    for (const alt of u.altEmails) if (!byEmail.has(alt)) byEmail.set(alt, u)
    if (u.phoneKey && !byPhone.has(u.phoneKey)) byPhone.set(u.phoneKey, u)
  }

  const erpUserByEmail = erpUsers
    ? new Map(erpUsers.map((u) => [normEmail(u.name), u]))
    : null

  /** Every address that can actually be an ERP login. */
  const erpLoginAddresses = new Set(erpUserByEmail ? erpUserByEmail.keys() : [])

  const matchedUids = new Set()
  const today = localDateKey(Date.now(), tz)

  const rows = employees.map((e) => {
    // Resolve the linked ERP user FIRST — its phone is one of the match keys.
    const loginEmail = normEmail(e.user_id)
    const erpUser = erpUserByEmail && loginEmail ? erpUserByEmail.get(loginEmail) : null
    const userPhone = userPhoneOf(erpUser)

    let hit = null
    for (const cand of matchCandidates(e, erpUser)) {
      const found = cand.kind === 'email'
        ? byEmail.get(cand.value)
        : byPhone.get(cand.value)
      if (found) {
        hit = { account: found, via: cand.label, authoritative: cand.authoritative, value: cand.value }
        break
      }
    }
    if (hit) matchedUids.add(hit.account.uid)

    // A non-authoritative match on an address that IS somebody's ERP login means
    // this employee's contact field holds another employee's login address —
    // a data fault worth naming rather than burying.
    const crossLinkedTo = hit && !hit.authoritative && hit.value !== normPhone(hit.value)
      && erpLoginAddresses.has(hit.value) ? hit.value : ''

    return {
      employeeId: e.name,
      name: e.employee_name || '—',
      role: e.designation || '—',
      department: cleanDept(e.department),
      departmentRaw: e.department || '',
      branch: e.branch || '—',
      company: e.company || '—',
      joined: e.date_of_joining || '',
      reportsTo: e.reports_to || '',
      status: e.status,
      relieved: e.relieving_date || '',
      working: CONFIG.workingStatuses.includes(e.status),
      loginEmail: e.user_id || '',
      companyEmail: normEmail(e.company_email),
      personalEmail: normEmail(e.personal_email),

      // Displayed phone prefers the linked ERP User's number, falling back to the
      // Employee cell so the column is not blank when only HR holds it.
      phone: userPhone || normPhone(e.cell_number),
      phoneFromUserRecord: Boolean(userPhone),
      // Kept for reference only: when the user record has no number but the
      // employee record does, the fix is to copy it across rather than to go
      // and collect it. Shown on the contact tab, never used for matching.
      employeeCell: normPhone(e.cell_number),

      // Emptiness is decided AFTER normalising, not on the raw string: ERP holds
      // whitespace-only values (" ", " 9659824225") that look present but are
      // not, and an ERP-side `= ""` filter would never catch those.
      noCompanyEmail: !normEmail(e.company_email),
      /**
       * "No phone" means no number ANYWHERE — not merely absent from the User
       * record. 14 employees have a number on the Employee record while their
       * User record has none; calling those "missing phone" would send you
       * chasing a number HR already holds. The narrower "the User record is the
       * one missing it" case is the `copy to user` tag instead.
       *
       * null = unknown, when the User doctype could not be read at all.
       */
      noPhone: erpUserByEmail ? !(userPhone || normPhone(e.cell_number)) : null,

      // hasAccount   = a Firebase account exists carrying an address/phone we
      //                hold for this person.
      // loginUsable  = that match is on their ERP login identity (user_id, or the
      //                phone on that ERP User). Only this counts toward coverage.
      // unconfirmed  = matched only on a non-login address. Whether such an
      //                account can use the app is UNVERIFIED — see matchCandidates.
      hasAccount: Boolean(hit),
      loginUsable: Boolean(hit?.authoritative),
      accountUnconfirmed: Boolean(hit) && !hit.authoritative,
      crossLinkedTo,
      matchedVia: hit?.via || '',
      uid: hit?.account.uid || '',
      providers: hit?.account.providers || [],
      accountCreated: hit?.account.createdAt || '',
      accountCreatedDay: hit?.account.createdDay || '',
      createdToday: hit ? hit.account.createdDay === today : false,
      lastLogin: hit?.account.lastLogin || '',
      lastActive: hit?.account.lastActive || '',
      signedIn: hit?.account.signedIn || false,
      accountDisabled: hit?.account.disabled || false,

      // No user_id -> no ERP login link at all, so nothing to sign in with.
      // This is an ERP-side fix, not a Firebase one.
      noUserLink: !e.user_id,
      erpUserExists: erpUser ? true : erpUserByEmail ? false : null,
      erpUserEnabled: erpUser ? Boolean(erpUser.enabled) : null,
      erpFullName: erpUser?.full_name || '',
      erpLastLogin: erpUser?.last_login ? String(erpUser.last_login).slice(0, 16) : '',
    }
  })

  // ── the buckets, one per tab ───────────────────────────────────────
  const working = rows.filter((r) => r.working)

  /**
   * Coverage counts only people who can actually get in. Someone who signed up
   * with a personal gmail has a Firebase account but no route onto their ERP
   * account, so they still need to log in properly — they belong below, not here.
   */
  const withAccount = working.filter((r) => r.loginUsable)

  /**
   * Tab: still need to login. Two kinds, both needing action:
   *   - no Firebase account at all
   *   - signed up, but with an identity that cannot map onto their ERP account
   */
  const stillNeedLogin = working.filter((r) => !r.loginUsable)
  const unconfirmedSignups = working.filter((r) => r.accountUnconfirmed)

  /**
   * Tab: employee ↔ ERP user link problems. Two different faults, both about the
   * link being wrong rather than about Firebase:
   *   - working employee with no user_id  -> cannot be onboarded until ERP is fixed
   *   - Left employee whose ERP login is still enabled -> should have been revoked
   */
  const noUserLink = working.filter((r) => r.noUserLink)
  const leftWithActiveUser = rows
    .filter((r) => r.status === 'Left' && r.erpUserEnabled === true)
    .sort((a, b) => (b.relieved || '').localeCompare(a.relieved || ''))
  const linkIssues = [
    ...noUserLink.map((r) => ({ ...r, issue: 'No ERP user link' })),
    ...leftWithActiveUser.map((r) => ({ ...r, issue: 'Left but login still active' })),
  ]

  /**
   * Tab: missing contact details. "Either missing" rather than "both missing",
   * because in practice empty company_email is pervasive across field staff
   * while a missing phone is rare — an AND would render an empty table and hide
   * the real gap. `missingBoth` isolates the case that actually leaves someone
   * with no route in at all, and is filterable on its own.
   */
  const missingContact = working
    .filter((r) => r.noCompanyEmail || r.noPhone === true)
    .map((r) => ({
      ...r,
      missing: [r.noCompanyEmail && 'company email', r.noPhone === true && 'phone']
        .filter(Boolean).join(' + '),
      missingBoth: r.noCompanyEmail && r.noPhone === true,
    }))
    .sort((a, b) =>
      Number(b.missingBoth) - Number(a.missingBoth) ||
      a.department.localeCompare(b.department) ||
      a.name.localeCompare(b.name))

  /**
   * Tabs: every Firebase authentication, and today's subset. Employee identity is
   * grafted on from the reverse of the match above, so each account says who it
   * belongs to — or that nothing in ERP claims it.
   */
  const employeeByUid = new Map()
  for (const r of rows) if (r.uid && !employeeByUid.has(r.uid)) employeeByUid.set(r.uid, r)

  const firebaseAll = fbShaped
    .map((u) => {
      const emp = employeeByUid.get(u.uid) || null
      return {
        uid: u.uid,
        email: u.email,
        phone: u.phone,
        displayName: u.displayName,
        providers: u.providers,
        accountCreated: u.createdAt,
        accountCreatedDay: u.createdDay,
        createdToday: u.createdDay === today,
        lastLogin: u.lastLogin,
        lastActive: u.lastActive,
        signedIn: u.signedIn,
        disabled: u.disabled,
        // linked = some employee claims this account. linkUsable = that claim is
        // authoritative, so the account can actually get into the app. An account
        // that is linked but NOT usable is a signup with the wrong identity.
        linked: Boolean(emp),
        linkUsable: Boolean(emp?.loginUsable),
        employeeId: emp?.employeeId || '',
        employeeName: emp?.name || '',
        role: emp?.role || '',
        department: emp?.department || '',
        employeeStatus: emp?.status || '',
        matchedVia: emp?.matchedVia || '',
        // An @elbrit.org account nothing in ERP claims is worth a second look; a
        // random gmail is more likely a doctor, external, or a personal signup.
        internal: u.email.endsWith('@elbrit.org'),
      }
    })
    .sort((a, b) => (b.accountCreated || '').localeCompare(a.accountCreated || ''))

  const createdToday = firebaseAll.filter((u) => u.createdToday)

  /**
   * Coverage rolled up by a dimension, worst-pending first — the view that says
   * where to spend the follow-up effort. Same shape for every dimension so the
   * UI can pivot between them with one table. Working staff only: Left and
   * vacant rows would drag every percentage down for no reason.
   */
  const coverageBy = (key) => {
    const map = new Map()
    for (const r of working) {
      const g = r[key] || '—'
      const cur = map.get(g) || { group: g, total: 0, pending: 0 }
      cur.total += 1
      if (!r.loginUsable) cur.pending += 1
      map.set(g, cur)
    }
    return [...map.values()]
      .map((d) => ({
        ...d,
        done: d.total - d.pending,
        pct: d.total ? Math.round(((d.total - d.pending) / d.total) * 100) : 0,
      }))
      .sort((a, b) => b.pending - a.pending || a.group.localeCompare(b.group))
  }

  /**
   * One Firebase account claimed by two or more employees — duplicate employee
   * records, or a shared login. Surfaced because it makes the headline "missing"
   * number ambiguous: one of those employees is matched on someone else's login.
   */
  const uidClaims = new Map()
  for (const r of rows) if (r.uid) uidClaims.set(r.uid, (uidClaims.get(r.uid) || 0) + 1)
  for (const r of rows) r.sharedAccount = r.uid ? uidClaims.get(r.uid) > 1 : false

  return {
    generatedAt: localStamp(Date.now(), tz),
    timezone: tz,
    today,
    project: CONFIG.firebaseProjectId,
    erpBaseUrl: CONFIG.erpBaseUrl,
    workingStatuses: CONFIG.workingStatuses,
    erpUsersAvailable: Boolean(erpUsers),
    vacantExcluded: vacantCount,
    kpis: {
      // one headline per tab, in tab order
      createdToday: createdToday.length,
      createdTodayLinked: createdToday.filter((u) => u.linked).length,
      linkIssues: linkIssues.length,
      noUserLink: noUserLink.length,
      leftWithActiveUser: leftWithActiveUser.length,
      firebaseTotal: firebaseAll.length,
      firebaseUnlinked: firebaseAll.filter((u) => !u.linked).length,
      firebaseLinkedUnconfirmed: firebaseAll.filter((u) => u.linked && !u.linkUsable).length,
      unconfirmedSignups: unconfirmedSignups.length,
      crossLinked: working.filter((r) => r.crossLinkedTo).length,
      stillNeedLogin: stillNeedLogin.length,
      missingContact: missingContact.length,
      noCompanyEmail: working.filter((r) => r.noCompanyEmail).length,
      noPhone: working.filter((r) => r.noPhone === true).length,
      // Number exists on the Employee record but not on the linked User —
      // reachable, but the ERP link is incomplete. Fix by copying it across.
      phoneOnEmployeeOnly: working.filter((r) => !r.phoneFromUserRecord && r.employeeCell).length,
      missingBothContacts: missingContact.filter((r) => r.missingBoth).length,
      coverage: working.length ? Math.round((withAccount.length / working.length) * 100) : 0,

      // supporting counts
      workingEmployees: working.length,
      totalEmployees: rows.length,
      registered: withAccount.length,
      neverSignedIn: withAccount.filter((r) => !r.signedIn).length,
      sharedAccounts: rows.filter((r) => r.sharedAccount).length,
    },
    coverage: {
      department: coverageBy('department'),
      role: coverageBy('role'),
      branch: coverageBy('branch'),
    },
    createdToday,
    linkIssues,
    firebaseAll,
    stillNeedLogin,
    unconfirmedSignups,
    missingContact,
    employees: rows,
  }
}

const reportCache = new Map() // credsKey -> { at, data }

function invalidateReportCache() {
  reportCache.clear()
}

/**
 * @param {{refresh?: boolean, creds?: object}} opts
 *   `creds` is what the caller supplied (browser-held ERP token + Firebase
 *   service account). Absent them, falls back to env / local files — which is
 *   only reachable from the local server, never from a deployed request.
 */
async function loadReport({ refresh, creds: supplied, allowServerCreds = true } = {}) {
  const creds = resolveCreds(supplied, { allowServerCreds })
  requireCreds(creds)

  const key = credsKey(creds)
  const hit = reportCache.get(key)
  if (!refresh && hit && Date.now() - hit.at < CONFIG.cacheSeconds * 1000) {
    return { ...hit.data, cached: true }
  }
  const [firebaseUsers, employeeResult, erpUsers] = await Promise.all([
    fetchFirebaseUsers(creds),
    fetchEmployees(creds),
    fetchErpUsers(creds),
  ])
  const data = buildReport({
    firebaseUsers,
    employees: employeeResult.employees,
    vacantCount: employeeResult.vacantCount,
    erpUsers,
    tz: CONFIG.timezone,
  })
  // One entry is enough for a personal tool; a bound stops a hostile caller
  // rotating credentials to grow the map without limit.
  if (reportCache.size > 4) reportCache.clear()
  reportCache.set(key, { at: Date.now(), data })
  const k = data.kpis
  log(`report: ${k.stillNeedLogin}/${k.workingEmployees} still need to login · ` +
      `${k.linkIssues} link issues · ${k.createdToday} created today · ${k.coverage}% coverage`)
  return { ...data, cached: false }
}

// ════════════════════════════════════════════════════════════════════
//  exports
// ════════════════════════════════════════════════════════════════════

export {
  CONFIG,
  resolveCreds,
  requireCreds,
  CredentialsRequiredError,
  TOKEN_FILE,
  loadReport,
  buildReport,
  fetchFirebaseUsers,
  fetchEmployees,
  fetchErpUsers,
  shapeFirebaseUser,
  erpFetch,
  getErpToken,
  setErpToken,
  invalidateReportCache,
  normEmail,
  normPhone,
  isVacant,
  userPhoneOf,
  log,
}
