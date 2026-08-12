/**
 * TEMPLATE. Copy to `credentials.mjs` (same folder, drop the `.example`) then:
 *
 *     node tools/auth-audit-dashboard/set-credentials.mjs
 *
 * The real `credentials.mjs` is gitignored: it holds an ERP API token and a
 * Firebase service-account key, which together grant ERP read access and admin
 * on the Firebase project.
 *
 * Why this file and not Firestore, since Firestore was the obvious idea: reading
 * anything out of Firestore needs a Google credential, and the credential being
 * stored IS that credential — it can never bootstrap itself. Netlify Blobs would
 * work but needs an npm dependency; this needs none and is bundled into the
 * functions at deploy time, exactly like auth-secrets.mjs.
 *
 * WHY STORING THEM SERVER-SIDE IS SAFE HERE: the login gate. They are only ever
 * used for a request carrying a valid session cookie, checked at the edge
 * (netlify/edge-functions/gate.mjs) AND again inside report.mjs, so losing the
 * edge gate alone cannot expose them. Before that gate existed, report.mjs
 * refused server-side credentials outright — selftest-auth.mjs still pins that an
 * unauthenticated caller gets nothing even when these are populated.
 *
 * Leave empty and the dashboard simply asks for them in the browser instead.
 */

const env = (name) => {
  const v = typeof process !== 'undefined' ? process.env?.[name] : undefined
  return typeof v === 'string' && v.trim() ? v.trim() : ''
}

export const STORED = {
  /** Frappe "api_key:api_secret". Empty = the dashboard will ask. */
  get erpToken() { return env('ERP_API_TOKEN') || '' },
  /** Service-account JSON, base64. Empty = the dashboard will ask. */
  get serviceAccountJson() { return env('FIREBASE_SERVICE_ACCOUNT') || '' },
  /** Non-secret, kept alongside so one place describes the connection. */
  get erpBaseUrl() { return env('ERP_BASE_URL') || 'https://erp.elbrit.org' },
}

export const haveStoredCredentials = () =>
  Boolean(STORED.erpToken && STORED.serviceAccountJson)
