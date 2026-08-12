#!/usr/bin/env node
/**
 * Stores the ERP token and Firebase service account into lib/credentials.mjs, so
 * the dashboard stops asking for them on every device.
 *
 *   node tools/auth-audit-dashboard/set-credentials.mjs
 *       picks up erp-token.txt and the key path from CONFIG
 *
 *   node set-credentials.mjs --erp "key:secret" --key /path/to/sa.json
 *   node set-credentials.mjs --clear
 *
 * Redeploy afterwards — the file is bundled into the functions at deploy time.
 */

import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CONFIG, TOKEN_FILE } from './lib/audit.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const FILE = join(HERE, 'lib', 'credentials.mjs')

const args = process.argv.slice(2)
const flag = (name) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : ''
}
const clear = args.includes('--clear')

let erpToken = ''
let saB64 = ''
let erpBaseUrl = flag('url') || CONFIG.erpBaseUrl

if (!clear) {
  erpToken = flag('erp')
  if (!erpToken) {
    try {
      erpToken = (await readFile(TOKEN_FILE, 'utf8')).trim()
      console.log(`  ERP token   from ${TOKEN_FILE}`)
    } catch {
      console.error('No --erp given and erp-token.txt not found.')
      process.exit(2)
    }
  }
  if (!/^(token\s+)?[^:\s]+:[^:\s]+$/.test(erpToken)) {
    console.error('ERP token should look like api_key:api_secret.')
    process.exit(2)
  }

  const keyPath = flag('key') || CONFIG.serviceAccountKey
  let raw
  try {
    raw = await readFile(keyPath, 'utf8')
    console.log(`  Firebase key from ${keyPath}`)
  } catch {
    console.error(`Could not read the service-account key at ${keyPath}. Pass --key <path>.`)
    process.exit(2)
  }
  let parsed
  try { parsed = JSON.parse(raw) } catch {
    console.error('That key file is not valid JSON.')
    process.exit(2)
  }
  if (!parsed.client_email || !parsed.private_key) {
    console.error('That JSON has no client_email/private_key — not a service-account key.')
    process.exit(2)
  }
  // base64 so a PEM's newlines survive being embedded in a JS string literal
  saB64 = Buffer.from(raw, 'utf8').toString('base64')
  console.log(`  service account ${parsed.client_email}`)
}

/** Fields are getters, so env stays live — these patterns match that shape. */
const setter = (key, envName, value) => [
  new RegExp(`get ${key}\\(\\) \\{ return env\\('${envName}'\\) \\|\\| '[^']*' \\}`),
  `get ${key}() { return env('${envName}') || '${value}' }`,
]

const src = await readFile(FILE, 'utf8')
const patched = [
  setter('erpToken', 'ERP_API_TOKEN', erpToken),
  setter('serviceAccountJson', 'FIREBASE_SERVICE_ACCOUNT', saB64),
  setter('erpBaseUrl', 'ERP_BASE_URL', erpBaseUrl),
].reduce((acc, [re, to]) => {
  if (!re.test(acc)) {
    console.error(`Could not find ${re} in ${FILE}`)
    process.exit(1)
  }
  return acc.replace(re, to)
}, src)
await writeFile(FILE, patched, 'utf8')

console.log('')
console.log(clear
  ? '  Cleared. The dashboard will ask for credentials again.'
  : '  Stored. The dashboard will no longer ask on any device.')
console.log('')
console.log('  Deploy it:')
console.log('    cd tools/auth-audit-dashboard')
console.log('    netlify deploy --no-build --prod --dir=public --functions=netlify/functions')
console.log('')
