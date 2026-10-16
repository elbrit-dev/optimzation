/* The release record — SERVER ONLY.

   One Firestore document per environment, appRelease/test or appRelease/live
   in the `elbrit` database: { commit, plasmic, at }. Every open app listens to
   it (components/UpdateCheck.jsx) and checks itself the moment it changes, so
   a release reaches open phones in seconds instead of at their next check.

   Only the server writes it, and only once the release is really servable:
     - a Plasmic publish: /api/plasmic-published regenerates the pages first,
       then records the version;
     - a code release: the new build records its commit on the first
       /api/version it serves.
   The record is only ever a nudge — an app that hears it still asks
   /api/version and confirms before it reloads — so a wrong or stale record
   can cost a check, never a bad reload.

   Written through Firestore's REST API with the Firebase service account from
   apphosting.yaml (FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY), signed with
   node's own crypto: no firebase-admin dependency for one document. */

import crypto from 'crypto';
import { CORE_COMMIT, PLASMIC_PROJECT_ID, RELEASE_ENV } from './coreVersion';

export { RELEASE_ENV };

const FIRESTORE_PROJECT = process.env.FIREBASE_PROJECT_ID || 'elbrit-sso-d01d9';
const FIRESTORE_DATABASE = 'elbrit';
const DOC_URL = `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT}/databases/${FIRESTORE_DATABASE}/documents/appRelease/${RELEASE_ENV}`;

/* ---------- Plasmic: the version published for this environment ---------- */

const PLASMIC_TOKEN =
  process.env.NEXT_PUBLIC_PLASMIC_PROJECT_TOKEN ||
  'hKaQFlYDzP6By8Fk45XBc6AhEoXVcAk3jJA5AvDn7lEnJI4Ho97wv9zkcp0LvOnjUhV0wQ6ZeeXBj5V135I9YA';
// Same rule as plasmic-init.js: live loads the "prod" tag, test the latest publish.
const PLASMIC_SPEC = RELEASE_ENV === 'live' ? `${PLASMIC_PROJECT_ID}@prod` : PLASMIC_PROJECT_ID;
const PLASMIC_CACHE_MS = 60_000;

let plasmicCache = { at: 0, version: null };
let plasmicInflight = null;

/**
 * Read the way Plasmic's own loader resolves it: the "published" bundle URL
 * answers with a redirect to the versioned one, so the Location header names
 * the version without downloading the bundle. Cached a minute unless `fresh`;
 * null when Plasmic cannot be reached.
 */
export async function publishedPlasmicVersion({ fresh = false } = {}) {
  if (!fresh && Date.now() - plasmicCache.at < PLASMIC_CACHE_MS) return plasmicCache.version;
  if (!plasmicInflight) {
    plasmicInflight = (async () => {
      try {
        const query = new URLSearchParams({ platform: 'nextjs', projectId: PLASMIC_SPEC });
        const res = await fetch(`https://codegen.plasmic.app/api/v1/loader/code/published?${query}`, {
          method: 'GET',
          redirect: 'manual',
          headers: { 'x-plasmic-api-project-tokens': `${PLASMIC_PROJECT_ID}:${PLASMIC_TOKEN}` },
          signal: AbortSignal.timeout(5000),
        });
        const location = res.headers.get('location') || '';
        const spec = new URL(location, 'https://codegen.plasmic.app').searchParams.get('projectId') || '';
        const version = spec.startsWith(`${PLASMIC_PROJECT_ID}@`) ? spec.slice(PLASMIC_PROJECT_ID.length + 1) : null;
        plasmicCache = { at: Date.now(), version };
      } catch {
        plasmicCache = { at: Date.now(), version: null };
      } finally {
        plasmicInflight = null;
      }
      return plasmicCache.version;
    })();
  }
  return plasmicInflight;
}

/* ---------- Firestore, as the service account ---------- */

let tokenCache = { token: null, exp: 0 };

const b64url = (input) =>
  Buffer.from(typeof input === 'string' ? input : JSON.stringify(input)).toString('base64url');

async function accessToken() {
  if (tokenCache.token && Date.now() < tokenCache.exp - 60_000) return tokenCache.token;
  const email = process.env.FIREBASE_CLIENT_EMAIL;
  const key = (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  if (!email || !key) throw new Error('Firebase service account not configured');
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${b64url({ alg: 'RS256', typ: 'JWT' })}.${b64url({
    iss: email,
    scope: 'https://www.googleapis.com/auth/datastore',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  })}`;
  const signature = crypto.createSign('RSA-SHA256').update(unsigned).sign(key).toString('base64url');
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${unsigned}.${signature}`,
    }),
    signal: AbortSignal.timeout(8000),
  });
  const json = await res.json();
  if (!res.ok || !json.access_token) throw new Error(`token: ${json.error || res.status}`);
  tokenCache = { token: json.access_token, exp: Date.now() + (json.expires_in || 3600) * 1000 };
  return tokenCache.token;
}

/** { commit, plasmic, at } or null when there is none (or it cannot be read). */
export async function readRelease() {
  try {
    const res = await fetch(DOC_URL, {
      headers: { Authorization: `Bearer ${await accessToken()}` },
      signal: AbortSignal.timeout(8000),
    });
    if (res.status === 404) return null;
    if (!res.ok) return null;
    const { fields = {} } = await res.json();
    return {
      commit: fields.commit?.stringValue ?? null,
      plasmic: fields.plasmic?.stringValue ?? null,
      at: fields.at?.timestampValue ?? null,
    };
  } catch {
    return null;
  }
}

/** Writes the given fields (and `at`), leaving the others as they are. */
export async function writeRelease(values) {
  const fields = { at: { timestampValue: new Date().toISOString() } };
  for (const [name, value] of Object.entries(values)) {
    if (value != null) fields[name] = { stringValue: String(value) };
  }
  const mask = Object.keys(fields)
    .map((name) => `updateMask.fieldPaths=${encodeURIComponent(name)}`)
    .join('&');
  const res = await fetch(`${DOC_URL}?${mask}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${await accessToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`write appRelease/${RELEASE_ENV}: ${res.status}`);
}

/* ---------- A new build records its commit, once per server ---------- */

let commitAnnounced = null;

/**
 * Called from /api/version. The first request a new build serves records its
 * commit if the record names another; the rest of that server's life it is a
 * no-op. Never throws: an unrecorded release is still caught by the apps'
 * own checks.
 */
export function announceCommit() {
  if (commitAnnounced) return commitAnnounced;
  commitAnnounced = (async () => {
    try {
      const current = await readRelease();
      if (current?.commit === CORE_COMMIT) return;
      await writeRelease({ commit: CORE_COMMIT });
    } catch {
      commitAnnounced = null; // try again on a later request
    }
  })();
  return commitAnnounced;
}
