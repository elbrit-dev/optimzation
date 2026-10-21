/* Who may call verify-doc. Two ways in, and nothing else:
 *
 * 1. A signed-in Elbrit user, straight from the app:
 *      Authorization: Bearer <Firebase ID token>   (from firebase.auth().currentUser.getIdToken())
 *    The Firebase token proves the login (signature, project, expiry) and
 *    carries the uid -- Google or phone sign-in alike. That is enough for now
 *    (decided 21 Oct 2026). With REQUIRE_ERP_TOKEN=true the caller must ALSO
 *    send X-ERP-Token: <the user's ERP token>, checked live against the ERP
 *    -- for if anyone outside the company can get a Firebase login.
 *
 * 2. Another Elbrit server, with a client key (VERIFY_DOC_CLIENTS):
 *      Authorization: Bearer <client key>
 *
 * No third-party libraries: Firebase tokens are RS256 JWTs checked against
 * Google's published certificates with node:crypto. */

import { createHash, createPublicKey, timingSafeEqual, verify as verifySig } from "node:crypto";
import { config } from "./config.mjs";

export class AuthError extends Error {
  constructor(message, status = 401) {
    super(message);
    this.status = status;
  }
}

const sha = (s) => createHash("sha256").update(String(s)).digest();

/* --- client keys --------------------------------------------------------- */

function clientKey(token) {
  const given = sha(token);
  for (const [name, key] of Object.entries(config.clients)) {
    if (key && timingSafeEqual(given, sha(key))) return name;
  }
  return null;
}

/* --- Firebase ID tokens --------------------------------------------------- */

const CERTS_URL = "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";
let certs = { keys: {}, until: 0 };

async function googleCerts(fetchImpl) {
  if (Date.now() < certs.until) return certs.keys;
  const res = await fetchImpl(CERTS_URL, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new AuthError("Could not load Google's sign-in certificates.", 503);
  const maxAge = Number(/max-age=(\d+)/.exec(res.headers.get("cache-control") || "")?.[1] || 3600);
  certs = { keys: await res.json(), until: Date.now() + maxAge * 1000 };
  return certs.keys;
}

const b64json = (part) => JSON.parse(Buffer.from(part, "base64url").toString("utf8"));

export async function verifyFirebaseToken(token, { fetchImpl = fetch, now = Date.now() } = {}) {
  const parts = String(token).split(".");
  if (parts.length !== 3) throw new AuthError("Not a sign-in token.");
  let header;
  let claims;
  try {
    header = b64json(parts[0]);
    claims = b64json(parts[1]);
  } catch {
    throw new AuthError("Not a sign-in token.");
  }
  if (header.alg !== "RS256" || !header.kid) throw new AuthError("Unexpected sign-in token.");
  const pem = (await googleCerts(fetchImpl))[header.kid];
  if (!pem) throw new AuthError("Sign-in token signed by an unknown key -- sign in again.");
  const ok = verifySig("RSA-SHA256", Buffer.from(`${parts[0]}.${parts[1]}`), createPublicKey(pem), Buffer.from(parts[2], "base64url"));
  if (!ok) throw new AuthError("Sign-in token signature is not valid.");
  const t = Math.floor(now / 1000);
  const project = config.firebaseProject;
  if (claims.aud !== project || claims.iss !== `https://securetoken.google.com/${project}`) throw new AuthError("Sign-in token is for another app.");
  if (!(claims.exp > t - 60)) throw new AuthError("Sign-in token has expired -- refresh it and try again.");
  if (!(claims.iat <= t + 60) || !(claims.auth_time <= t + 60)) throw new AuthError("Sign-in token is not valid yet.");
  if (!claims.sub) throw new AuthError("Sign-in token has no user.");
  return { uid: claims.sub, email: claims.email || null, phone: claims.phone_number || null };
}

/* --- ERP tokens ----------------------------------------------------------- */

const erpSeen = new Map(); // sha(token) -> { user, until }
const ERP_TTL_MS = 10 * 60 * 1000;

export async function verifyErpToken(token, { fetchImpl = fetch } = {}) {
  const key = sha(token).toString("hex");
  const hit = erpSeen.get(key);
  if (hit && hit.until > Date.now()) return hit.user;
  const auth = /^token\s/i.test(token) ? token : `token ${token}`;
  const res = await fetchImpl(`${config.erpUrl}/api/method/frappe.auth.get_logged_user`, {
    headers: { Authorization: auth, Accept: "application/json" },
    redirect: "manual",
    signal: AbortSignal.timeout(10000),
  });
  if (res.status === 401 || res.status === 403) throw new AuthError("The ERP token is not valid.", 403);
  if (!res.ok) throw new AuthError(`Could not check the ERP token (HTTP ${res.status}).`, 503);
  const user = (await res.json().catch(() => ({}))).message;
  if (!user || user === "Guest") throw new AuthError("The ERP token is not valid.", 403);
  if (erpSeen.size > 5000) erpSeen.clear();
  erpSeen.set(key, { user, until: Date.now() + ERP_TTL_MS });
  return user;
}

/* --- the gate ------------------------------------------------------------- */

/* -> { kind: "client", name } | { kind: "user", uid, erpUser, email, phone } */
export async function identify(headers, deps = {}) {
  const m = /^Bearer\s+(.+)$/i.exec(headers.authorization || "");
  if (!m) throw new AuthError("Sign in to use this.");
  const token = m[1].trim();

  const name = clientKey(token);
  if (name) return { kind: "client", name };

  if (token.split(".").length !== 3) throw new AuthError("Unknown key.");
  const user = await verifyFirebaseToken(token, deps);
  // The ERP-token check is OFF for now (REQUIRE_ERP_TOKEN): a valid Firebase
  // login of our project is enough. Turn it on to also demand a live ERP token.
  let erpUser = null;
  if (config.requireErpToken) {
    const erpToken = headers["x-erp-token"];
    if (!erpToken) throw new AuthError("Send the ERP token too (X-ERP-Token).", 403);
    erpUser = await verifyErpToken(String(erpToken), deps);
  }
  return { kind: "user", uid: user.uid, email: user.email, phone: user.phone, erpUser };
}

/* --- a simple per-caller rate limit (per instance) ------------------------ */

const hits = new Map();
export function allow(who, perMinute = config.ratePerMinute) {
  const now = Date.now();
  const h = hits.get(who) || { start: now, n: 0 };
  if (now - h.start > 60000) {
    h.start = now;
    h.n = 0;
  }
  h.n += 1;
  hits.set(who, h);
  if (hits.size > 10000) hits.clear();
  return h.n <= perMinute;
}
