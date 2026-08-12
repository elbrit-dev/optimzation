#!/usr/bin/env node
/**
 * Sets the dashboard login password by rewriting lib/auth-secrets.mjs in place.
 * No environment variables involved.
 *
 *   node tools/auth-audit-dashboard/set-password.mjs "your password"
 *   node tools/auth-audit-dashboard/set-password.mjs --generate      (random, printed once)
 *
 * Also mints a fresh session secret, so setting a password logs out every
 * existing session — which is what you want after a password change.
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
const supplied = args.find((a) => !a.startsWith('--'))

if (!generate && !supplied) {
  console.error('Usage: node set-password.mjs "your password"   (or --generate)')
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
