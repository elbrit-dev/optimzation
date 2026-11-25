/**
 * Server-only helpers for the survey API routes (26 Nov 2026): the app's own service account for an ERP, and a
 * call to an ERP method as it. The same logic as pages/api/survey/read-file.js (kept there unchanged).
 */
const env = (name) => (process.env[name] || "").trim();
export const tokenHeader = (t) => (/^(token|bearer)\s/i.test(t) ? t : `token ${t}`);

/* the app's service account for THIS ERP (the same host), from the deployment's endpoint + token pairs.
   -> { auth, as } | { tried: [ … ] } */
const serviceCache = new Map();
export async function serviceFor(origin) {
  if (serviceCache.has(origin)) return serviceCache.get(origin);
  const host = new URL(origin).host.toLowerCase();
  const tried = [];
  for (const t of ["ERP", "UAT", "NEW", ""]) {
    const url = env(t ? `NEXT_PUBLIC_GRAPHQL_ENDPOINT_${t}` : "NEXT_PUBLIC_GRAPHQL_ENDPOINT");
    const token = env(t ? `NEXT_PUBLIC_GRAPHQL_AUTH_TOKEN_${t}` : "NEXT_PUBLIC_GRAPHQL_AUTH_TOKEN");
    if (!url || !token) continue;
    let same = false;
    try {
      same = new URL(url).host.toLowerCase() === host;
    } catch {
      /* a malformed env value */
    }
    if (!same) continue;
    const auth = tokenHeader(token);
    const r = await fetch(`${origin}/api/method/frappe.auth.get_logged_user`, { headers: { Authorization: auth, Accept: "application/json" }, redirect: "manual" }).catch(() => null);
    const who = r?.ok ? (await r.json().catch(() => ({}))).message : null;
    if (who && who !== "Guest") {
      const found = { auth, as: who };
      serviceCache.set(origin, found);
      return found;
    }
    tried.push(`${t || "(default)"}: ${r ? `HTTP ${r.status}` : "unreachable"}`);
  }
  return { tried };
}

export async function erpCall(origin, auth, method, args) {
  const r = await fetch(`${origin}/api/method/${method}`, {
    method: "POST",
    headers: { Authorization: auth, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(args),
    redirect: "manual",
    signal: AbortSignal.timeout(30000),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.exc_type || j.exception) {
    let msg = null;
    try {
      msg = JSON.parse(JSON.parse(j._server_messages)[0]).message;
    } catch {
      /* none */
    }
    throw Object.assign(new Error(String(msg || j.exception || `HTTP ${r.status}`).replace(/<[^>]*>/g, "").slice(0, 300)), { status: r.status });
  }
  return j.message;
}

/* who a person is, from their own ERP token */
export async function userFromToken(origin, token) {
  const r = await fetch(`${origin}/api/method/frappe.auth.get_logged_user`, { headers: { Authorization: tokenHeader(token), Accept: "application/json" }, redirect: "manual" }).catch(() => null);
  const user = r?.ok ? (await r.json().catch(() => ({}))).message : null;
  return user && user !== "Guest" ? user : null;
}
