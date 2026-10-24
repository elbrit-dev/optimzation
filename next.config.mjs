import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { withSentryConfig } from '@sentry/nextjs/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* CORE VERSION — which commit of this code a build is, and when it was built,
   stamped into the bundle (lib/coreVersion.js). "App Version" is the Plasmic
   design's own number; this is the engine underneath it. The commit comes from
   whichever variable the build platform sets, else from git, else "unknown". */
function coreCommit() {
  const fromEnv = ['COMMIT_SHA', 'SHORT_SHA', 'GIT_COMMIT_SHA', 'SOURCE_VERSION', 'GITHUB_SHA', 'COMMIT_REF']
    .map((name) => process.env[name])
    .find(Boolean);
  if (fromEnv) return fromEnv.slice(0, 7);
  try {
    return execSync('git rev-parse --short=7 HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return '';
  }
}
const CORE_COMMIT = process.env.NEXT_PUBLIC_CORE_COMMIT || coreCommit() || 'unknown';
const CORE_BUILT_AT = process.env.NEXT_PUBLIC_CORE_BUILT_AT || new Date().toISOString();

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_CORE_COMMIT: CORE_COMMIT,
    NEXT_PUBLIC_CORE_BUILT_AT: CORE_BUILT_AT,
  },
  /* Every page is ISR (revalidate: 600), so Next sends
     `s-maxage=600, stale-while-revalidate=<expireTime - 600>`. With the default
     (a year) a browser cache — which has no max-age to go on, so holds every
     page as stale — kept showing the page it had and fetching the new one
     behind it: a phone ran the previous build until its second launch after a
     release. 900 leaves the CDN its 10 minutes and caps that at 5 more. */
  expireTime: 900,
  // transpilePackages: [
  //   'antd',
  //   '@ant-design/icons',
  //   '@ant-design/icons-svg',
  //   'rc-pagination',
  //   'rc-picker',
  //   'rc-util',
  //   'rc-tree',
  //   'rc-table',
  //   '@rc-component/util',
  //   '@rc-component/mutate-observer'
  // ],
  typescript: {
    ignoreBuildErrors: true,
  },
  // Since Next.js 16 uses Turbopack by default, we need to explicitly allow webpack or migrate aliases.
  // Adding an empty turbopack object silences the warning when webpack is also used.
  turbopack: {},
  webpack: (config) => {
    config.resolve.alias['../shared/components/src/components'] = path.resolve(__dirname, 'components/DataTable');
    return config;
  },
  // The PWA manifest names the app after its site (pages/api/manifest.js).
  async rewrites() {
    return [{ source: '/manifest.webmanifest', destination: '/api/manifest' }];
  },
  async headers() {
    return [
      {
        source: '/onesignal/OneSignalSDKWorker.js',
        headers: [
          {
            key: 'Content-Type',
            value: 'application/javascript',
          },
          {
            key: 'Service-Worker-Allowed',
            value: '/onesignal/',
          },
        ],
      },
      {
        source: '/OneSignalSDKWorker.js',
        headers: [
          {
            key: 'Content-Type',
            value: 'application/javascript',
          },
          {
            key: 'Service-Worker-Allowed',
            value: '/',
          },
        ],
      },
      {
        source: '/OneSignalSDK.sw.js',
        headers: [
          {
            key: 'Content-Type',
            value: 'application/javascript',
          },
          {
            key: 'Service-Worker-Allowed',
            value: '/',
          },
        ],
      },
    ];
  },
};

/* Sentry (instrumentation-client.js). Source maps go to our Sentry only when the
   build has SENTRY_AUTH_TOKEN, and are deleted from the output after upload; without
   it none are made, so the app's source is never served. Errors still arrive either
   way — with minified stack traces. */
export default withSentryConfig(nextConfig, {
  org: 'elbrit',
  project: 'elbrit-app',
  sentryUrl: 'https://sentry.elbrit.org/',
  authToken: process.env.SENTRY_AUTH_TOKEN,
  release: { name: `elbrit-app@${CORE_COMMIT}` },
  sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN },
  widenClientFileUpload: true,
  silent: true,
  telemetry: false,
});
