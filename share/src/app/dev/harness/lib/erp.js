/* The harness's own ERP plumbing: which host an environment is, who a token
 * belongs to, the people you can act as, and — on non-production ERPs only —
 * minting a token for one of them with an admin token.
 *
 * MINTING REPLACES THAT USER'S API SECRET (Frappe's generate_keys issues a
 * new one; the old stops working). That is fine on UAT and is why it is
 * refused on production: there you paste a token the user already has. */

import { getEndpointConfigFromUrlKeyAsync, getEndpointOptionsAsync } from '@/app/graphql-playground/constants';

/* Hosts where the harness never mints tokens or changes anything about a
   user. Anything else (UAT, a sandbox) may be minted on. */
export const PRODUCTION_HOSTS = ['erp.elbrit.org'];

export function authHeader(token) {
  const t = String(token ?? '').trim();
  if (!t) return null;
  return /^(token|bearer|basic)\s/i.test(t) ? t : `token ${t}`;
}

export async function listEnvironments() {
  try {
    const rows = await getEndpointOptionsAsync();
    return rows.map((r) => r.name);
  } catch {
    return [];
  }
}

/* A /tokens registry row NAME → { name, endpointUrl, origin, registryToken,
   production }. */
export async function resolveEnvironment(name) {
  const config = await getEndpointConfigFromUrlKeyAsync(name);
  if (!config?.endpointUrl) throw new Error(`No endpoint registered for "${name}".`);
  const origin = new URL(config.endpointUrl).origin;
  return {
    name: config.name ?? name,
    endpointUrl: config.endpointUrl,
    origin,
    registryToken: config.authToken ?? '',
    production: PRODUCTION_HOSTS.includes(new URL(origin).host),
  };
}

export async function erpCall(origin, token, method, body, { fetchImpl = fetch } = {}) {
  const res = await fetchImpl(`${origin}/api/method/${method}`, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: authHeader(token) ?? '', 'Content-Type': 'application/json', Accept: 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.exc_type) throw new Error(json.exc_type || `ERP request failed (${res.status})`);
  return json.message;
}

/* Whose token this is — the ERP's answer. */
export function whoIs(origin, token, opts) {
  return erpCall(origin, token, 'frappe.auth.get_logged_user', undefined, opts);
}

/* The people you can act as: every enabled system user, with their active
   Employee's seat where they have one. Read with the admin token. */
export async function listPeople(origin, adminToken, opts) {
  const [users, employees] = await Promise.all([
    erpCall(origin, adminToken, 'frappe.client.get_list', {
      doctype: 'User',
      filters: [['enabled', '=', 1], ['user_type', '=', 'System User']],
      fields: ['name', 'full_name', 'role_profile_name'],
      limit_page_length: 0,
    }, opts),
    erpCall(origin, adminToken, 'frappe.client.get_list', {
      doctype: 'Employee',
      filters: [['status', '=', 'Active']],
      fields: ['name', 'employee_name', 'user_id', 'role_id', 'custom_role_profile', 'designation'],
      limit_page_length: 0,
    }, opts),
  ]);
  const byUser = new Map((employees ?? []).filter((e) => e.user_id).map((e) => [String(e.user_id).toLowerCase(), e]));
  return (users ?? [])
    .filter((u) => u.name && u.name !== 'Administrator' && u.name !== 'Guest')
    .map((u) => {
      const e = byUser.get(String(u.name).toLowerCase());
      return {
        email: u.name,
        name: e?.employee_name || u.full_name || u.name,
        roleProfile: u.role_profile_name || null,
        seat: e?.role_id || e?.custom_role_profile || null,
        employeeId: e?.name || null,
        designation: e?.designation || null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/* A token for `email`, made with the admin token. NOT on production. */
export async function mintToken(env, adminToken, email, opts) {
  if (env.production) throw new Error('Minting is off on production — paste a token this user already has.');
  const secret = await erpCall(env.origin, adminToken, 'frappe.core.doctype.user.user.generate_keys', { user: email }, opts);
  const key = await erpCall(env.origin, adminToken, 'frappe.client.get_value', {
    doctype: 'User', filters: email, fieldname: 'api_key',
  }, opts);
  const apiKey = key?.api_key;
  const apiSecret = secret?.api_secret;
  if (!apiKey || !apiSecret) throw new Error('ERP did not return a key and secret.');
  return `${apiKey}:${apiSecret}`;
}
