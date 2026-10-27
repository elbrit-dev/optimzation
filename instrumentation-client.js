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

/* The Plasmic Login page runs a "userToken" lookup on load with the route's id.
   Everyone signing in normally opens the page as the literal
   /login/[id]/[name]/[reason], so that looks up "[id]" and fails with "User not
   found in ERPNext" on every visit (ELBRIT-ONE-APP-7: 83 events, 28 people on
   day 1), which reads like a real sign-in failure. Only that case is dropped;
   the same error under a real id still reports. Sign-in attempts themselves
   report through lib/loginTelemetry.js. */
function isLoginPagePlaceholderLookup(event) {
  if (typeof window === 'undefined') return false;
  let path = window.location.pathname;
  try {
    path = decodeURIComponent(path);
  } catch {
    // keep it raw
  }
  if (path !== '/login/[id]/[name]/[reason]') return false;
  const text = (event.exception?.values || []).map((v) => v.value || '').join(' ');
  return text.includes('User not found in ERPNext');
}

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
    beforeSend: (event) => (isLoginPagePlaceholderLookup(event) ? null : event),
    integrations: [
      Sentry.replayIntegration({
        maskAllText: false,
        maskAllInputs: false,
        blockAllMedia: false,
        mask: ['input[type="password"]'],
        // Info events (e.g. a good visit location fix, shared/calendar/lib/
        // locationTelemetry.js, or a sign-in, lib/loginTelemetry.js) are a
        // tally, not a problem: no replay for them.
        beforeErrorSampling: (event) => event.level !== 'info',
      }),
    ],
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
