/* What this page is running, in the two parts a release can change:

     Core Version    the app's own code — the commit a build was made from,
                     stamped in by next.config.mjs;
     Plasmic version the published design of the app's Plasmic project that the
                     page was rendered with (its page data).

   UpdateCheck compares both with what the server has now. The build time is
   kept only to tell two builds apart when the commit could not be read. */

export const CORE_COMMIT = process.env.NEXT_PUBLIC_CORE_COMMIT || 'unknown';
export const CORE_BUILT_AT = process.env.NEXT_PUBLIC_CORE_BUILT_AT || '';

/** "1f5f1e2" */
export const CORE_VERSION = CORE_COMMIT;

/** Which release record this deployment reads and writes: appRelease/<env>. */
export const RELEASE_ENV = process.env.NEXT_PUBLIC_PLASMIC_TAG === 'prod' ? 'live' : 'test';

/** The app's Plasmic project (the same default as plasmic-init.js). */
export const PLASMIC_PROJECT_ID = process.env.NEXT_PUBLIC_PLASMIC_PROJECT_ID || 'b6mXu8rXhi8fdDd6jwb8oh';

/** "92.0.1" — the app project's version in a page's data, or null. */
export function plasmicVersionOf(pageProps) {
  const projects = pageProps?.plasmicData?.bundle?.projects;
  if (!Array.isArray(projects)) return null;
  return projects.find((p) => p?.id === PLASMIC_PROJECT_ID)?.version ?? null;
}

/** Whether the server runs different code from this page. */
export function isOtherCore(server) {
  if (!server?.builtAt && !server?.commit) return false;
  return server.commit !== CORE_COMMIT || server.builtAt !== CORE_BUILT_AT;
}
