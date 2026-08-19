#!/usr/bin/env node
/**
 * Sets the dashboard login password by rewriting lib/auth-secrets.mjs in place.
 * No environment variables involved.
 *
 *   node tools/auth-audit-dashboard/set-password.mjs "your password"
 *   node tools/auth-audit-dashboard/set-password.mjs --generate      (random, printed once)
 *
 * The SECOND login — sales report only, no access to credentials or staff data:
 *
 *   node tools/auth-audit-dashboard/set-password.mjs --report --id elbrit "their password"
 *   node tools/auth-audit-dashboard/set-password.mjs --report --generate
 *
 * The admin password also mints a fresh session secret, so setting it logs out
 * every existing session — which is what you want after a password change.
 * `--report` deliberately leaves the session secret alone: adding or rotating the
 * report login should not sign an admin out of a session they are using.
 *
 * Redeploy afterwards: the secrets are bundled into the functions at deploy time.
 */

import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { hashPassword, randomSaltB64, PBKDF2_ITERATIONS } from './lib/auth.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const FILE = join(HERE, 'lib', 'auth-secrets.mjs')

const args = process.argv.slice(2)
const generate = args.includes('--generate')
const report = args.includes('--report')
/** `--id elbrit` sets the login ID that goes with this password. */
const idFlag = args.indexOf('--id')
const loginId = idFlag >= 0 ? args[idFlag + 1] : ''
const supplied = args.filter((a) => !a.startsWith('--') && a !== loginId)[0]

if (!generate && !supplied) {
  console.error('Usage: node set-password.mjs "your password"   (or --generate)')
  console.error('       node set-password.mjs --report "their password"   (sales-report login)')
  process.exit(2)
}

const password = generate
  ? [...crypto.getRandomValues(new Uint8Array(18))]
    .map((b) => 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 56]).join('')
  : supplied

if (password.length < 8) {
  console.error('Password must be at least 8 characters.')
  process.exit(2)
}

const salt = randomSaltB64()
const passwordHash = await hashPassword(password, salt, PBKDF2_ITERATIONS)
const sessionSecret = randomSaltB64(32)

/**
 * The fields are getters (so env changes are read live and the auth layer stays
 * testable), which is what these patterns have to match.
 */
const setter = (key, envName, value) => [
  new RegExp(`get ${key}\\(\\) \\{ return env\\('${envName}'\\) \\|\\| '[^']*' \\}`),
  `get ${key}() { return env('${envName}') || '${value}' }`,
]

/**
 * The report login writes only its own two fields, leaving the admin hash and the
 * session secret untouched.
 */
if (report) {
  const before = await readFile(FILE, 'utf8')
  const after = [
    setter('reportPasswordHash', 'REPORT_PASSWORD_HASH', passwordHash),
    setter('reportSalt', 'REPORT_PASSWORD_SALT', salt),
    ...(loginId ? [setter('reportUserId', 'REPORT_USER_ID', loginId)] : []),
  ].reduce((acc, [re, to]) => {
    if (!re.test(acc)) {
      console.error(`Could not find ${re} in ${FILE} — has its shape changed?`)
      process.exit(1)
    }
    return acc.replace(re, to)
  }, before)
  await writeFile(FILE, after, 'utf8')
  console.log('')
  console.log(`  Sales-report login set${loginId ? ` for ID "${loginId}"` : ''}.`)
  console.log('  It opens /sales.html and nothing else —')
  console.log('  no credential form, no staff data, no permission writes.')
  if (generate) {
    console.log('')
    console.log(`    ${password}`)
    console.log('')
    console.log('  ^ shown once. Save it now.')
  }
  console.log('')
  console.log('  Existing sessions keep working: this does not rotate the session key.')
  console.log('  Deploy it:')
  console.log('    cd tools/auth-audit-dashboard')
  console.log('    netlify deploy --no-build --prod --dir=public --functions=netlify/functions')
  console.log('')
  process.exit(0)
}

const src = await readFile(FILE, 'utf8')
const patched = [
  setter('passwordHash', 'AUTH_PASSWORD_HASH', passwordHash),
  setter('salt', 'AUTH_PASSWORD_SALT', salt),
  setter('sessionSecret', 'AUTH_SESSION_SECRET', sessionSecret),
].reduce((acc, [re, to]) => {
  if (!re.test(acc)) {
    console.error(`Could not find ${re} in ${FILE}`)
    process.exit(1)
  }
  return acc.replace(re, to)
}, src)

if (patched === src) {
  console.error(`Could not patch ${FILE} — has its shape changed?`)
  process.exit(1)
}
await writeFile(FILE, patched, 'utf8')

console.log('')
console.log('  Password set. Existing sessions are now invalid.')
if (generate) {
  console.log('')
  console.log(`    ${password}`)
  console.log('')
  console.log('  ^ shown once. Save it now.')
}
console.log('')
console.log('  Deploy it:')
console.log('    cd tools/auth-audit-dashboard')
console.log('    netlify deploy --no-build --prod --dir=public --functions=netlify/functions')
console.log('')
