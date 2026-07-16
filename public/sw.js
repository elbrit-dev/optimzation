/* Basic service worker for offline caching */
const CACHE_NAME = 'app-cache-v2';
const ALLOWED_ORIGINS = [
  'https://app.elbrit.org',
  'https://plamsic-app.netlify.app',
  'https://test-optimize.netlify.app',
  'http://localhost:3000',
  self.location.origin
];
const PRE_CACHE_URLS = [
  '/',
  '/favicon.ico',
  '/manifest.webmanifest',
  '/elbrit one logo.gif'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    // Cache each URL independently so one 404 doesn't reject the whole install
    // and leave the cache empty (which broke the navigation fallback).
    caches.open(CACHE_NAME).then((cache) =>
      Promise.allSettled(PRE_CACHE_URLS.map((url) => cache.add(url)))
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const requestUrl = new URL(request.url);

  // Never intercept the Plasmic Studio host / editor iframe — it must load
  // directly. Caching or falling back to '/' breaks the Studio canvas.
  if (requestUrl.pathname.startsWith('/plasmic-host')) {
    return; // Let the browser handle it directly
  }

  // Only handle same-origin GET requests. Everything else (cross-origin,
  // POST/PUT, etc.) is left to the browser.
  if (request.method !== 'GET' || requestUrl.origin !== self.location.origin) {
    return;
  }

  // Network-first for navigation requests (pages)
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(async () =>
        (await caches.match('/')) || Response.error()
      )
    );
    return;
  }

  // Cache-first for static assets, then fall back to network
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) {
        // Stale-while-revalidate
        fetch(request).then((response) => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
        }).catch(() => {});
        return cached;
      }
      return fetch(request).then((response) => {
        if (response && response.status === 200) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      }).catch(() => cached || Response.error());
    })
  );
});


