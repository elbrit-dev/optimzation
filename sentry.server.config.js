/* SENTRY ON THE SERVER — API routes, getStaticProps / ISR, server errors.
   Same project and settings as instrumentation-client.js; loaded by
   instrumentation.js. No DSN: off. */
import * as Sentry from '@sentry/nextjs';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || 'development',
    release: `elbrit-app@${process.env.NEXT_PUBLIC_CORE_COMMIT}`,
    tracesSampleRate: 0.1,
  });
}
