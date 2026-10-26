/* SENTRY IN THE BROWSER — project elbrit-one-app on our own Sentry (sentry.elbrit.org),
   environments "production" (app.elbrit.org) and "uat" (app-uat), from
   NEXT_PUBLIC_SENTRY_DSN / NEXT_PUBLIC_SENTRY_ENVIRONMENT in apphosting*.yaml.
   No DSN (local dev, a build without it): Sentry stays off.

   What it records:
     errors       every one, with the console and clicks that led up to it
     traces       1 page or interaction in 10. ERP calls carry the trace, so the
                  ERP's own trace of that request (its SQL, per user) hangs under
                  the app's: the ERP keeps the app's decision (elbrit_mod sentry.py)
     replays      every session with an error (the minute before it included),
                  plus 1 session in 10. NOT masked: text, numbers and typed values
                  show as the user saw them — it all stays on our own server.
                  Password fields stay hidden.
   The signed-in user is attached by lib/sentryUser.js. */
import * as Sentry from '@sentry/nextjs';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || 'development',
    release: `elbrit-app@${process.env.NEXT_PUBLIC_CORE_COMMIT}`,
    tracesSampleRate: 0.1,
    // Same-origin calls (/api/...) propagate by default; the ERP is cross-origin.
    // Its CORS echoes whatever headers the preflight asks for (frappe/app.py),
    // so sentry-trace and baggage go through.
    tracePropagationTargets: [/^\//, /^https:\/\/erp\.elbrit\.org\//],
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
    integrations: [
      Sentry.replayIntegration({
        maskAllText: false,
        maskAllInputs: false,
        blockAllMedia: false,
        mask: ['input[type="password"]'],
        // Info events (e.g. a good visit location fix, shared/calendar/lib/
        // locationTelemetry.js) are a tally, not a problem: no replay for them.
        beforeErrorSampling: (event) => event.level !== 'info',
      }),
    ],
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
