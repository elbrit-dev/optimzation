import { CORE_BUILT_AT, CORE_COMMIT, PLASMIC_PROJECT_ID } from '../../lib/coreVersion';

/**
 * What a release looks like right now: the Core Version this server runs
 * (lib/coreVersion.js) and the Plasmic version currently published for this
 * environment. An open app asks on returning to the foreground and compares
 * both with its own page (components/UpdateCheck.jsx).
 *
 * The Plasmic version is read the way Plasmic's own loader resolves it: the
 * "published" bundle URL answers with a redirect to the versioned one, so the
 * Location header names the version without downloading the ~MB bundle. Same
 * project, token and tag rule as plasmic-init.js: live loads the "prod" tag,
 * test loads the latest publish. Read at most once a minute per server; null
 * when Plasmic cannot be reached (the code check still works).
 *
 * Never cached anywhere: a stale answer is exactly what this exists to catch.
 */

const PROJECT_TOKEN =
  process.env.NEXT_PUBLIC_PLASMIC_PROJECT_TOKEN ||
  'hKaQFlYDzP6By8Fk45XBc6AhEoXVcAk3jJA5AvDn7lEnJI4Ho97wv9zkcp0LvOnjUhV0wQ6ZeeXBj5V135I9YA';
const PROJECT_SPEC =
  process.env.NEXT_PUBLIC_PLASMIC_TAG === 'prod' ? `${PLASMIC_PROJECT_ID}@prod` : PLASMIC_PROJECT_ID;
const CACHE_MS = 60_000;

let cached = { at: 0, version: null };
let inflight = null;

async function publishedPlasmicVersion() {
  if (Date.now() - cached.at < CACHE_MS) return cached.version;
  if (!inflight) {
    inflight = (async () => {
      try {
        const query = new URLSearchParams({ platform: 'nextjs', projectId: PROJECT_SPEC });
        const res = await fetch(`https://codegen.plasmic.app/api/v1/loader/code/published?${query}`, {
          method: 'GET',
          redirect: 'manual',
          headers: { 'x-plasmic-api-project-tokens': `${PLASMIC_PROJECT_ID}:${PROJECT_TOKEN}` },
          signal: AbortSignal.timeout(5000),
        });
        const location = res.headers.get('location') || '';
        const spec = new URL(location, 'https://codegen.plasmic.app').searchParams.get('projectId') || '';
        const version = spec.startsWith(`${PLASMIC_PROJECT_ID}@`) ? spec.slice(PLASMIC_PROJECT_ID.length + 1) : null;
        cached = { at: Date.now(), version };
      } catch {
        cached = { at: Date.now(), version: null };
      } finally {
        inflight = null;
      }
      return cached.version;
    })();
  }
  return inflight;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.status(200).json({
    commit: CORE_COMMIT,
    builtAt: CORE_BUILT_AT,
    plasmic: await publishedPlasmicVersion(),
  });
}
