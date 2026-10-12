#!/usr/bin/env node
/*
 * Put the Doctor Service server scripts (share/src/app/doctor-service/server/*.py)
 * into an ERP as Server Script records, and add the two custom fields the app
 * cannot work without. Each file's header says its name, type and method.
 *
 *   ERP_URL=https://uat.elbrit.org ERP_TOKEN=key:secret node scripts/deploy-doctor-service.mjs
 *       -> PREVIEW: shows what would be created / updated, writes nothing
 *   ... node scripts/deploy-doctor-service.mjs --apply
 *       -> writes
 *
 * The token must be a System Manager's (Server Script and Custom Field are
 * admin doctypes). Meant for UAT first — the script refuses a production
 * host unless --production is also passed.
 *
 * What it does NOT do: the Workflow itself (the ERP team builds it — see
 * the server folder's README), roles, or the optional custom fields.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'share', 'src', 'app', 'doctor-service', 'server');
const apply = process.argv.includes('--apply');
const allowProd = process.argv.includes('--production');
const base = String(process.env.ERP_URL || '').replace(/\/(api.*)?$/, '');
const token = String(process.env.ERP_TOKEN || '').replace(/^token\s+/i, '');

if (!base || !token) {
  console.error('Set ERP_URL (e.g. https://uat.elbrit.org) and ERP_TOKEN (key:secret of a System Manager).');
  process.exit(1);
}
if (/\/\/erp\.elbrit\.org/i.test(base) && !allowProd) {
  console.error('That is production. Deploy to UAT first; pass --production to go ahead anyway.');
  process.exit(1);
}

const REQUIRED_FIELDS = [
  { fieldname: 'custom_via_app', label: 'Raised from App', fieldtype: 'Check', insert_after: 'remarks', read_only: 1, default: '0' },
  { fieldname: 'custom_rejection_reason', label: 'Rejection Reason', fieldtype: 'Small Text', insert_after: 'custom_via_app' },
];

async function call(path, { method = 'GET', body, query } = {}) {
  const qs = query ? '?' + new URLSearchParams(query) : '';
  const res = await fetch(base + path + qs, {
    method,
    headers: { Authorization: 'token ' + token, Accept: 'application/json', 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    let msg = json.exception || json.exc_type || res.statusText;
    try { msg = JSON.parse(json._server_messages).map((m) => JSON.parse(m).message).join(' ') || msg; } catch { /* keep */ }
    throw new Error(`${method} ${path} -> ${res.status} ${msg}`);
  }
  return json;
}

function header(src, key) {
  const m = src.match(new RegExp('^#\\s+' + key + '\\s*:\\s*(.+)$', 'm'));
  return m ? m[1].trim() : '';
}

function scriptDocs() {
  return readdirSync(DIR).filter((f) => f.endsWith('.py')).map((file) => {
    const script = readFileSync(join(DIR, file), 'utf8');
    const type = header(script, 'Script Type');
    const doc = { name: header(script, 'Name'), script_type: type, script, disabled: 0 };
    if (type === 'API') {
      doc.api_method = header(script, 'API Method');
      doc.allow_guest = 0;
    } else {
      doc.reference_doctype = header(script, 'Reference');
      doc.doctype_event = header(script, 'Event');
    }
    if (!doc.name || !type) throw new Error(`${file}: header has no Name / Script Type`);
    return { file, doc };
  });
}

async function exists(doctype, name) {
  try {
    return (await call(`/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`)).data;
  } catch (e) {
    if (/ 404 /.test(e.message)) return null;
    throw e;
  }
}

const who = (await call('/api/method/frappe.auth.get_logged_user')).message;
console.log(`${apply ? 'APPLYING to' : 'PREVIEW of'} ${base} as ${who}\n`);

for (const { file, doc } of scriptDocs()) {
  const cur = await exists('Server Script', doc.name);
  const same = cur && cur.script === doc.script && cur.disabled === 0;
  const verb = !cur ? 'create' : same ? 'unchanged' : 'update';
  console.log(`Server Script  ${verb.padEnd(9)} ${doc.name}  (${file})`);
  if (!apply || same) continue;
  if (cur) await call(`/api/resource/Server Script/${encodeURIComponent(doc.name)}`, { method: 'PUT', body: doc });
  else await call('/api/resource/Server Script', { method: 'POST', body: doc });
}

for (const f of REQUIRED_FIELDS) {
  const name = `Doctor Service-${f.fieldname}`;
  const cur = await exists('Custom Field', name);
  console.log(`Custom Field   ${(cur ? 'exists' : 'create').padEnd(9)} ${name}`);
  if (!apply || cur) continue;
  await call('/api/resource/Custom Field', { method: 'POST', body: { dt: 'Doctor Service', ...f } });
}

console.log(apply ? '\nDone.' : '\nNothing written. Run again with --apply to deploy.');
