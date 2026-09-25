/* ERP transport for the Support Report. Same contract as help-support's
 * graphqlClient: the endpoint and token are PROPS, never read from env, so a
 * Studio page binds the signed-in user's own token and the ERP's permission
 * rules decide what comes back. Nothing here widens or narrows that. */

function normalizeToken(raw) {
  const t = String(raw ?? "").trim();
  if (!t) return "";
  // Frappe expects "token key:secret". Accept either form from the caller.
  return /^(token|bearer)\s/i.test(t) ? t : `token ${t}`;
}

export function makeConn({ url, token }) {
  const endpointUrl = String(url ?? "").trim();
  const authToken = normalizeToken(token);
  if (!endpointUrl || !authToken) {
    throw new Error("Support Report needs the ERP GraphQL URL and token passed as props.");
  }
  let origin;
  try {
    origin = new URL(endpointUrl).origin;
  } catch {
    throw new Error(`Support Report: "${endpointUrl}" is not a valid URL.`);
  }
  return { endpointUrl, authToken, origin };
}

function serverMessage(payload) {
  try {
    const first = JSON.parse(payload._server_messages)?.[0];
    return first ? JSON.parse(first).message?.replace(/<[^>]*>/g, "") : null;
  } catch {
    return null;
  }
}

export async function gql(conn, query, variables = {}) {
  const res = await fetch(conn.endpointUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: conn.authToken },
    body: JSON.stringify({ query, variables }),
  });

  let json;
  try {
    json = await res.json();
  } catch {
    throw new Error(`ERP returned a non-JSON response (HTTP ${res.status}).`);
  }

  if (json.errors?.length) {
    throw new Error(serverMessage(json) || json.errors.map((e) => e.message).join("; "));
  }
  // Frappe's second error shape: an auth failure carries no `errors` key.
  if (json.exception || json.exc_type) {
    const detail = json.exc_type || json.exception;
    throw new Error(
      /auth/i.test(String(detail))
        ? "The ERP token is missing, expired or wrong."
        : `ERP rejected the request: ${detail}`,
    );
  }
  if (!json.data) throw new Error(`ERP returned no data (HTTP ${res.status}).`);
  return json.data;
}

/* Who the token belongs to. Failure is not fatal: the report then opens at
   the widest scope the token's own data allows. */
export async function loggedUser(conn) {
  try {
    const res = await fetch(`${conn.origin}/api/method/frappe.auth.get_logged_user`, {
      headers: { Authorization: conn.authToken },
    });
    if (!res.ok) return null;
    return (await res.json())?.message ?? null;
  } catch {
    return null;
  }
}

/* Promise cache keyed by endpoint AND token: what one token may see is not
   what another may, so a hit must never cross tokens. A rejected promise is
   evicted so one network blip doesn't stick for the whole TTL. */
const TTL_MS = 5 * 60 * 1000;
const cache = new Map();

export function cached(conn, key, run) {
  const k = `${conn.endpointUrl}|${conn.authToken}|${key}`;
  const hit = cache.get(k);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.promise;
  const promise = run();
  cache.set(k, { at: Date.now(), promise });
  promise.catch(() => {
    if (cache.get(k)?.promise === promise) cache.delete(k);
  });
  return promise;
}

export function evictCached(conn, key) {
  cache.delete(`${conn.endpointUrl}|${conn.authToken}|${key}`);
}

export function clearSupportCache() {
  cache.clear();
}
