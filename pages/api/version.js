import { CORE_BUILT_AT, CORE_COMMIT } from '../../lib/coreVersion';
import { announceCommit, publishedPlasmicVersion } from '../../lib/release';

/**
 * What a release looks like right now: the Core Version this server runs
 * (lib/coreVersion.js) and the Plasmic version published for this environment
 * (lib/release.js). An open app asks when it comes back to the foreground, when
 * the release record changes, and on a slow timer, and compares both with its
 * own page (components/UpdateCheck.jsx).
 *
 * The first request a new build serves also records its commit in the release
 * record, which is what tells every open app at once (bounded to 3 s here —
 * the answer must not wait on Firestore).
 *
 * Never cached anywhere: a stale answer is exactly what this exists to catch.
 */
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  const [plasmic] = await Promise.all([
    publishedPlasmicVersion(),
    Promise.race([announceCommit(), new Promise((resolve) => setTimeout(resolve, 3000))]),
  ]);
  res.status(200).json({ commit: CORE_COMMIT, builtAt: CORE_BUILT_AT, plasmic });
}
