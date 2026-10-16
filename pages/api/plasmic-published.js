import { PLASMIC } from '@/plasmic-init';
import { CORE_COMMIT } from '../../lib/coreVersion';
import { RELEASE_ENV, publishedPlasmicVersion, readRelease, writeRelease } from '../../lib/release';

/**
 * Plasmic Studio's publish webhook (Project settings → Publish → Webhooks,
 * POST to https://<app>/api/plasmic-published).
 *
 * A publish used to take 10–15 minutes to show: pages are ISR and the CDN
 * holds their HTML. Here, the moment Plasmic publishes:
 *   1. read the version now published for this environment from Plasmic
 *      itself — the call's content is never trusted, so it needs no secret:
 *      a stranger calling it can only make us look, and a look at an
 *      unchanged version does nothing;
 *   2. regenerate every Plasmic page (Next on-demand revalidation), so the
 *      server renders the new design from now on;
 *   3. then record the version in the release record (lib/release.js) — every
 *      open app hears it within seconds and reloads past the CDN's copy
 *      (components/UpdateCheck.jsx).
 *
 * One run at a time per server; a call during a run joins it.
 */

let running = null;

async function regenerate(res, paths) {
  const done = [];
  const failed = [];
  const queue = [...paths];
  const worker = async () => {
    for (let path = queue.shift(); path; path = queue.shift()) {
      try {
        await res.revalidate(path);
        done.push(path);
      } catch (err) {
        failed.push({ path, error: String(err?.message || err).slice(0, 120) });
      }
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  return { done, failed };
}

async function run(res) {
  const published = await publishedPlasmicVersion({ fresh: true });
  if (!published) return { status: 502, body: { error: 'Plasmic version unavailable' } };

  const recorded = await readRelease();
  if (recorded?.plasmic === published) {
    return { status: 200, body: { env: RELEASE_ENV, plasmic: published, unchanged: true } };
  }

  const pages = await PLASMIC.fetchPages();
  // Home first: it is where most open apps are.
  const paths = [...new Set(['/', ...pages.map((page) => page.path)])];
  const { done, failed } = await regenerate(res, paths);

  await writeRelease({ plasmic: published, commit: CORE_COMMIT });
  return {
    status: 200,
    body: { env: RELEASE_ENV, plasmic: published, previous: recorded?.plasmic ?? null, regenerated: done.length, failed },
  };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  try {
    if (!running) running = run(res).finally(() => { running = null; });
    const { status, body } = await running;
    res.status(status).json(body);
  } catch (err) {
    res.status(500).json({ error: String(err?.message || err).slice(0, 200) });
  }
}

export const config = { maxDuration: 300 };
