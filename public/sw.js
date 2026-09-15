/* Basic service worker for offline caching.
 *
 * Two rules this file exists to keep, both learned the hard way:
 *
 * 1. NEVER hand respondWith() anything but a Response. A promise resolving to
 *    undefined becomes a network error, and for a NAVIGATION that means a blank
 *    frame rather than a failed request — which is how this worker silently
 *    broke Plasmic Studio: Studio loads /plasmic-host in an iframe, the worker
 *    answered undefined, and Studio waited forever for a handshake that could
 *    never arrive.
 *
 * 2. NEVER cache a 200 without looking at what is in it. Netlify answers 200
 *    with the SPA's HTML for an asset that does not exist, so a missing font
 *    comes back as "<!DOCTYPE html>" with status 200. Cached under the font's
 *    URL it poisons every later load until CACHE_NAME changes.
 *
 * Bump CACHE_NAME whenever this file changes. Without it every browser that
 * already has the old cache keeps serving out of it.
 */
const CACHE_NAME = 'app-cache-v3';

const PRE_CACHE_URLS = [
  '/',
  '/favicon.ico',
  '/manifest.webmanifest',
];

/**
 * Paths the worker must keep its hands off.
 *
 * The Plasmic host page is a live handshake with Studio — there is nothing
 * about it worth caching and everything about it worth not breaking. API calls
 * and auth callbacks are the same: an offline copy of a POST result or an OAuth
 * redirect is worse than no answer.
 */
function isBypassed(url) {
  return (
    url.pathname.startsWith('/plasmic-host') ||
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/google-callback') ||
    url.pathname.startsWith('/onesignal') ||
    url.pathname.endsWith('/sw.js') ||
    url.pathname.endsWith('/OneSignalSDKWorker.js')
  );
}

/** An asset request answered with an HTML page is a 404 wearing a 200. */
function isHtmlForAnAsset(request, response) {
  const type = (response.headers.get('content-type') || '').toLowerCase();
  if (!type.includes('text/html')) return false;
  const destination = request.destination;
  return (
    destination === 'font' || destination === 'script' || destination === 'style' ||
    destination === 'image' || destination === 'audio' || destination === 'video' ||
    destination === 'manifest'
  );
}

function isCacheable(request, response) {
  return (
    request.method === 'GET' &&
    response &&
    response.status === 200 &&
    // An opaque cross-origin response has no readable status; caching it means
    // caching a failure we cannot inspect.
    response.type !== 'opaque' &&
    !isHtmlForAnAsset(request, response)
  );
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      // One URL at a time. cache.addAll() is ATOMIC — a single 404 rejects the
      // whole thing and leaves the cache empty, which is what left the
      // navigation fallback with nothing to fall back to.
      Promise.allSettled(PRE_CACHE_URLS.map((url) => cache.add(url)))
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') return;

  let url;
  try {
    url = new URL(request.url);
  } catch (error) {
    return;
  }

  // Cross-origin (Plasmic's CDN, fonts, ERP) is the browser's business.
  if (url.origin !== self.location.origin) return;
  if (isBypassed(url)) return;

  // Network-first for pages, so a deploy is picked up on the next navigation.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (isCacheable(request, response)) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => {});
          }
          return response;
        })
        .catch(async () => {
          // Whatever happens, hand back a real Response.
          return (
            (await caches.match(request)) ||
            (await caches.match('/')) ||
            new Response(
              '<!doctype html><meta charset="utf-8"><title>Offline</title>'
                + '<body style="font:16px system-ui;padding:2rem">'
                + '<h1>You are offline</h1><p>Reconnect and reload this page.</p>',
              { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
            )
          );
        })
    );
    return;
  }

  // Cache-first for static assets, revalidating behind the answer.
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) {
        fetch(request)
          .then((response) => {
            if (isCacheable(request, response)) {
              const copy = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => {});
            }
          })
          .catch(() => {});
        return cached;
      }
      return fetch(request)
        .then((response) => {
          if (isCacheable(request, response)) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => {});
          }
          return response;
        })
        // There is no cached copy in this branch, so there is nothing to fall
        // back TO — Response.error() is a real Response and reads to the page
        // as the network failure it actually is.
        .catch(() => Response.error());
    })
  );
});
