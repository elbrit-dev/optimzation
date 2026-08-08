/**
 * Server-only ERPNext REST client.
 *
 * ⚠️ NEVER import this from a component / client bundle. It reads
 * `ERP_API_TOKEN`, which is a service-account credential with write access.
 * The `NEXT_PUBLIC_` prefix is deliberately absent — see .env.example.
 *
 * Why this exists at all: every other ERP call in the app rides on the
 * *per-user* token that Plasmic hands to the page after login
 * (shared/calendar/components/auth/auth-context.jsx). The login-help flow runs
 * BEFORE login — there is no user token yet, by definition — so it needs a
 * server-side service account instead.
 */

const env = (name) => (process.env[name] || "").trim();

/**
 * Resolves the ERP origin + token as a MATCHED PAIR.
 *
 * By default it reuses the credentials already on Netlify:
 *   NEXT_PUBLIC_GRAPHQL_ENDPOINT_<TARGET> + NEXT_PUBLIC_GRAPHQL_AUTH_TOKEN_<TARGET>
 * where <TARGET> comes from `ERP_TARGET` and defaults to ERP (production).
 * Set ERP_TARGET=UAT on the UAT site so its tickets don't land in live ERP.
 *
 * On the NEXT_PUBLIC_ prefix: those vars are public *by convention*, but they
 * are not actually in the client bundle — Next.js only inlines a NEXT_PUBLIC_
 * var where client code references `process.env.NAME` literally, and nothing
 * does. (lib/graphql-endpoints.js iterates process.env dynamically, which is
 * both never inlined AND why that file silently does nothing in the browser;
 * it has no importers regardless.) Reading them here, server-side, is safe and
 * exposes nothing new. If a NEXT_PUBLIC_GRAPHQL_AUTH_TOKEN_* ever gets
 * referenced literally from a component, that write token ships to browsers —
 * at which point move this to the dedicated ERP_API_TOKEN below.
 *
 * ERP_BASE_URL + ERP_API_TOKEN override everything, for when the login-help
 * flow should use its own narrower service account.
 *
 * `overrides` carries the Plasmic props (erpUrl / authToken / erpTarget) so
 * this can be retuned from Studio without a Netlify change + redeploy. They
 * arrive over the wire from a PUBLIC page, so they are NOT trusted blindly:
 * `url` must resolve to a host already named in the env endpoints. Without
 * that check this route would be an open proxy — anyone could POST an
 * `erpUrl` of their choosing and have our server fetch it (SSRF).
 */
function allowedErpHosts() {
  const hosts = new Set();
  for (const candidate of [
    env("ERP_BASE_URL"),
    env("NEXT_PUBLIC_GRAPHQL_ENDPOINT_ERP"),
    env("NEXT_PUBLIC_GRAPHQL_ENDPOINT_UAT"),
  ]) {
    if (!candidate) continue;
    try {
      hosts.add(new URL(candidate).host.toLowerCase());
    } catch {
      /* ignore a malformed env value rather than breaking the allowlist */
    }
  }
  return hosts;
}

export function resolveErpCredentials(overrides = {}) {
  const propUrl = String(overrides.url ?? "").trim();
  const propToken = String(overrides.token ?? "").trim();

  // Props are a PAIR, same as the env pair below: a prop URL silently married
  // to an env token (or vice versa) is how you end up writing prod tickets
  // with a UAT credential.
  if (propUrl && propToken) {
    let host;
    try {
      host = new URL(propUrl).host.toLowerCase();
    } catch {
      throw new Error("The ERP URL set in Plasmic is not a valid URL");
    }
    const allowed = allowedErpHosts();
    if (!allowed.has(host)) {
      throw new Error(
        `ERP host "${host}" is not allowed. Permitted hosts come from ` +
          "NEXT_PUBLIC_GRAPHQL_ENDPOINT_ERP / _UAT / ERP_BASE_URL — add it there first."
      );
    }
    return { url: propUrl, token: propToken };
  }
  if (propUrl || propToken) {
    throw new Error(
      "The ERP URL and Auth Token props must both be set, or both be left empty"
    );
  }

  const explicitUrl = env("ERP_BASE_URL");
  const explicitToken = env("ERP_API_TOKEN");

  if (explicitUrl && explicitToken) {
    return { url: explicitUrl, token: explicitToken };
  }
  // Half-configured is the dangerous state: it would otherwise fall through to
  // the shared pair and quietly ignore the override someone just set.
  if (explicitUrl || explicitToken) {
    throw new Error(
      "ERP_BASE_URL and ERP_API_TOKEN must both be set, or both be left unset"
    );
  }

  const target = (String(overrides.target ?? "").trim() || env("ERP_TARGET") || "ERP")
    .toUpperCase()
    // The suffix is interpolated into an env key — keep it to a plain word.
    .replace(/[^A-Z0-9_]/g, "");
  const url = env(`NEXT_PUBLIC_GRAPHQL_ENDPOINT_${target}`);
  const token = env(`NEXT_PUBLIC_GRAPHQL_AUTH_TOKEN_${target}`);

  // Never mix suffixes or fall back across them — pairing a UAT token with the
  // production endpoint (or vice versa) would file HR tickets into the wrong
  // system, and fail in a way nobody would notice for weeks.
  if (!url || !token) {
    throw new Error(
      `ERP credentials missing for target "${target}": need both ` +
        `NEXT_PUBLIC_GRAPHQL_ENDPOINT_${target} and NEXT_PUBLIC_GRAPHQL_AUTH_TOKEN_${target} ` +
        "on this deployment (or set the ERP URL + Auth Token props in Plasmic)"
    );
  }

  return { url, token };
}

/** ERP origin, with any trailing /graphql or /api/method/graphql suffix stripped. */
export function erpBaseUrl(creds) {
  return (creds ?? resolveErpCredentials())
    .url.replace(/(\/api(?:\/method)?\/graphql|\/graphql)\/?$/i, "")
    .replace(/\/$/, "");
}

/**
 * Frappe returns errors in several shapes depending on which layer failed.
 * Mirrors the extraction in the calendar's leave.service.js so ERP validation
 * messages surface instead of a bare "HTTP 417".
 */
function extractErpError(json) {
  if (!json) return null;

  const stripHtml = (s) =>
    String(s || "")
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  if (json._server_messages) {
    try {
      const messages = JSON.parse(json._server_messages);
      const first = Array.isArray(messages) ? messages[0] : messages;
      const parsed = typeof first === "string" ? JSON.parse(first) : first;
      const text = stripHtml(parsed?.message || parsed);
      if (text) return text;
    } catch {
      /* fall through */
    }
  }

  if (json.exception || json.exc_type) {
    return stripHtml(json.exception || json.exc_type).split("\n")[0];
  }

  return json.message ? stripHtml(json.message) : null;
}

export class ErpError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "ErpError";
    this.status = status;
  }
}

/**
 * @param {string} path  e.g. "/api/resource/Task"
 * @param {{method?: string, body?: object, query?: object, creds?: object}} [options]
 *   `creds` is the already-resolved {url, token}. Resolve ONCE per request and
 *   thread it through, so a request can't half-switch environments partway.
 */
export async function erpFetch(path, { method = "GET", body, query, creds } = {}) {
  // Frappe accepts "token <api_key>:<api_secret>" for service accounts.
  const resolved = creds ?? resolveErpCredentials();

  let url = `${erpBaseUrl(resolved)}${path}`;
  if (query) {
    const params = new URLSearchParams(
      Object.entries(query).map(([k, v]) => [
        k,
        typeof v === "string" ? v : JSON.stringify(v),
      ])
    );
    url += `?${params}`;
  }

  const response = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `token ${resolved.token}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  let json = null;
  try {
    json = await response.json();
  } catch {
    throw new ErpError("Invalid response from ERP", response.status);
  }

  if (!response.ok) {
    throw new ErpError(
      extractErpError(json) || `HTTP ${response.status}`,
      response.status
    );
  }

  if (json?.exc || json?.exception) {
    throw new ErpError(extractErpError(json) || "ERP request failed", 500);
  }

  return json;
}

/** Employee IDs are the doc name itself (E01271, DE067) — not a separate field. */
export function normalizeEmployeeId(raw) {
  return String(raw ?? "").trim().toUpperCase().replace(/\s+/g, "");
}

/**
 * Compares on the last 10 digits so "+91 90146 16799", "09014616799" and
 * "9014616799" all match the bare `cell_number` ERP stores.
 */
export function normalizePhone(raw) {
  const digits = String(raw ?? "").replace(/\D/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
}

/**
 * Fetches the Employee doc, or null when the ID matches nothing.
 * Returns the RAW doc — callers must pick which fields are safe to expose,
 * since these endpoints answer unauthenticated callers.
 */
export async function fetchEmployee(employeeId, creds) {
  try {
    const json = await erpFetch(
      `/api/resource/Employee/${encodeURIComponent(employeeId)}`,
      { creds }
    );
    return json?.data ?? null;
  } catch (err) {
    if (err instanceof ErpError && (err.status === 404 || err.status === 403)) {
      return null;
    }
    throw err;
  }
}

/**
 * Fetches the ERP User linked from Employee.user_id, or null.
 *
 * This is the account the login actually resolves to, so its `enabled` flag is
 * a first-class reason a sign-in fails — plenty of Users in this instance are
 * disabled. Note `mobile_no` is NOT usable as a check: it is empty on all but a
 * couple of Users, so comparing against it would flag nearly everyone.
 */
export async function fetchUser(userId, creds) {
  if (!String(userId || "").trim()) return null;
  try {
    const json = await erpFetch(
      `/api/resource/User/${encodeURIComponent(userId)}`,
      { creds }
    );
    return json?.data ?? null;
  } catch (err) {
    if (err instanceof ErpError && (err.status === 404 || err.status === 403)) {
      return null;
    }
    throw err;
  }
}

/**
 * Fixed-window in-memory throttle. These endpoints are public (pre-login), so
 * this is the only thing standing between the form and a script.
 *
 * Caveat, deliberately accepted: serverless instances don't share memory, so
 * the real ceiling is `max` × live instances. It stops casual abuse and
 * accidental double-taps, not a determined attacker — ERP-side rate limiting
 * would be the fix for that.
 */
const rateBuckets = new Map();

export function rateLimit(key, { max = 10, windowMs = 60_000 } = {}) {
  const now = Date.now();
  const bucket = rateBuckets.get(key);

  if (!bucket || now > bucket.resetAt) {
    rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfter: 0 };
  }

  bucket.count += 1;
  if (bucket.count > max) {
    return {
      allowed: false,
      retryAfter: Math.ceil((bucket.resetAt - now) / 1000),
    };
  }
  return { allowed: true, retryAfter: 0 };
}

/** Best-effort caller IP for rate-limit keying (Netlify sets x-forwarded-for). */
export function callerIp(req) {
  const forwarded = req.headers["x-nf-client-connection-ip"] || req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded) return forwarded.split(",")[0].trim();
  return req.socket?.remoteAddress || "unknown";
}
