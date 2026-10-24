import * as Sentry from '@sentry/nextjs';

// Next calls register() once per server process. No edge runtime here (no
// middleware, no edge routes), so only the Node.js config is loaded.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }
}

// Errors thrown while rendering or in API routes.
export const onRequestError = Sentry.captureRequestError;
