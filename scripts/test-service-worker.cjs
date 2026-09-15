// Run: node scripts/test-service-worker.cjs
//
// public/sw.js runs in a ServiceWorkerGlobalScope, so it is never exercised by
// anything else in the repo — it just goes live and breaks pages. This harness
// fakes enough of that scope to fire real FetchEvents at it.
//
// The bug it exists to prevent: respondWith() given a promise that resolves to
// undefined. The browser turns that into a network error, and for a NAVIGATION
// that is a blank frame — which is how this worker silently broke Plasmic
// Studio, whose /plasmic-host iframe then waited forever for a handshake.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const ORIGIN = 'https://app-uat.elbrit.org';

function makeCache() {
  const store = new Map();
  return {
    store,
    async match(req) { return store.get(typeof req === 'string' ? req : req.url) ?? undefined; },
    async put(req, res) { store.set(typeof req === 'string' ? req : req.url, res); },
    async add(url) {
      // Stands in for a 404 during precache — the case that used to reject
      // cache.addAll() atomically and leave the cache empty.
      if (url === '/missing') throw new Error('404');
      store.set(new URL(url, ORIGIN).href, { status: 200, ok: true });
    },
  };
}

function loadWorker({ fetchImpl, cache }) {
  const listeners = {};
  const caches = {
    _cache: cache,
    async open() { return cache; },
    async match(req) { return cache.match(req); },
    async keys() { return ['app-cache-v1', 'app-cache-v3']; },
    async delete() { return true; },
  };

  class FakeResponse {
    constructor(body, init = {}) {
      this.body = body;
      this.status = init.status ?? 200;
      this.type = init.type ?? 'basic';
      this.ok = this.status >= 200 && this.status < 300;
      const headers = new Map(Object.entries(init.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
      this.headers = { get: (k) => headers.get(String(k).toLowerCase()) ?? null };
    }
    clone() { return this; }
    static error() { return new FakeResponse(null, { status: 0, type: 'error' }); }
  }

  const scope = {
    self: null,
    location: { origin: ORIGIN },
    caches,
    fetch: fetchImpl,
    URL,
    Promise,
    Response: FakeResponse,
    console,
    addEventListener: (name, fn) => { listeners[name] = fn; },
    skipWaiting: () => {},
    clients: { claim: () => {} },
  };
  scope.self = scope;

  vm.runInNewContext(fs.readFileSync(path.join(root, 'public/sw.js'), 'utf8'), scope);
  return { listeners, FakeResponse };
}

/** Fire a fetch event and return whatever respondWith was handed, or undefined. */
async function fire(listeners, request) {
  let responded;
  let called = false;
  listeners.fetch({
    request,
    respondWith: (value) => { called = true; responded = value; },
  });
  return { called, value: called ? await responded : undefined };
}

const req = (url, extra = {}) => ({
  url, method: 'GET', mode: 'same-origin', destination: '', ...extra,
});

async function main() {
  const checks = [];
  const check = async (name, fn) => { await fn(); checks.push(name); };

  const reject = async () => { throw new TypeError('Failed to fetch'); };

  /* ------------------------------------------------- the Studio-killing bug */

  await check('a failing navigation still yields a real Response', async () => {
    const { listeners } = loadWorker({ fetchImpl: reject, cache: makeCache() });
    const { called, value } = await fire(listeners, req(ORIGIN + '/report', { mode: 'navigate' }));
    assert.equal(called, true);
    assert.notEqual(value, undefined, 'undefined here is what the browser reports as a network error');
    assert.equal(typeof value.status, 'number');
  });

  await check('a failing asset with nothing cached still yields a real Response', async () => {
    const { listeners } = loadWorker({ fetchImpl: reject, cache: makeCache() });
    const { value } = await fire(listeners, req(ORIGIN + '/_next/static/x.js', { destination: 'script' }));
    assert.notEqual(value, undefined);
    assert.equal(typeof value.type, 'string');
  });

  await check('an empty precache does not strand the navigation fallback', async () => {
    // The old worker fell back to caches.match('/'), which is undefined when
    // the precache failed — and it failed whenever ANY precached URL 404'd.
    const cache = makeCache();
    const { listeners } = loadWorker({ fetchImpl: reject, cache });
    assert.equal(cache.store.size, 0);
    const { value } = await fire(listeners, req(ORIGIN + '/', { mode: 'navigate' }));
    assert.notEqual(value, undefined);
    assert.equal(value.status, 503);
  });

  /* ---------------------------------------------------------- what to skip */

  await check('the Plasmic host page is never intercepted', async () => {
    const { listeners } = loadWorker({ fetchImpl: reject, cache: makeCache() });
    const { called } = await fire(listeners, req(ORIGIN + '/plasmic-host', { mode: 'navigate' }));
    assert.equal(called, false, 'Studio needs a live handshake, not a cached frame');
  });

  await check('cross-origin is left to the browser', async () => {
    const { listeners } = loadWorker({ fetchImpl: reject, cache: makeCache() });
    const { called } = await fire(listeners, req('https://studio-static.plasmic.app/static/js/async/3209.js', { destination: 'script' }));
    assert.equal(called, false);
  });

  await check('API, auth and the workers themselves are left alone', async () => {
    const { listeners } = loadWorker({ fetchImpl: reject, cache: makeCache() });
    for (const p of ['/api/hr/designations', '/google-callback', '/sw.js', '/OneSignalSDKWorker.js']) {
      const { called } = await fire(listeners, req(ORIGIN + p));
      assert.equal(called, false, p + ' must not be intercepted');
    }
  });

  await check('a non-GET is left alone', async () => {
    const { listeners } = loadWorker({ fetchImpl: reject, cache: makeCache() });
    const { called } = await fire(listeners, req(ORIGIN + '/x', { method: 'POST' }));
    assert.equal(called, false);
  });

  /* ------------------------------------------------- the poisoned-font case */

  await check('HTML returned for a font is never cached', async () => {
    // Netlify answers 200 with the SPA's HTML for an asset that is not there.
    // Cached under the font URL, that is the "invalid sfntVersion" error, and
    // it survives every reload until CACHE_NAME changes.
    const cache = makeCache();
    let html;
    const { listeners, FakeResponse } = loadWorker({
      fetchImpl: async () => {
        html = new FakeResponse('<!DOCTYPE html>', { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
        return html;
      },
      cache,
    });
    const { value } = await fire(listeners, req(ORIGIN + '/fonts/inter.woff2', { destination: 'font' }));
    assert.equal(value, html, 'the response is still passed through');
    assert.equal(cache.store.size, 0, 'but it must not be stored');
  });

  await check('a real asset IS cached', async () => {
    const cache = makeCache();
    const { listeners, FakeResponse } = loadWorker({
      fetchImpl: async () => new FakeResponse('body{}', { status: 200, headers: { 'content-type': 'text/css' } }),
      cache,
    });
    await fire(listeners, req(ORIGIN + '/a.css', { destination: 'style' }));
    assert.equal(cache.store.size, 1);
  });

  await check('an opaque cross-origin response is not cached', async () => {
    const cache = makeCache();
    const { listeners, FakeResponse } = loadWorker({
      fetchImpl: async () => new FakeResponse(null, { status: 200, type: 'opaque' }),
      cache,
    });
    await fire(listeners, req(ORIGIN + '/proxied.js', { destination: 'script' }));
    assert.equal(cache.store.size, 0);
  });

  /* ----------------------------------------------------------------- install */

  await check('one 404 does not empty the whole precache', async () => {
    const cache = makeCache();
    const { listeners } = loadWorker({ fetchImpl: reject, cache });
    const waits = [];
    await listeners.install({ waitUntil: (p) => waits.push(p) });
    await Promise.all(waits);
    assert.ok(cache.store.size >= 3, 'cache.addAll would have rejected atomically');
  });

  await check('CACHE_NAME was bumped alongside the logic', () => {
    const src = fs.readFileSync(path.join(root, 'public/sw.js'), 'utf8');
    const name = src.match(/CACHE_NAME = '([^']+)'/)[1];
    assert.notEqual(name, 'app-cache-v2', 'without a bump every browser keeps the broken cache');
  });

  console.log(checks.map((c) => '  ok  ' + c).join('\n'));
  console.log('\n' + checks.length + ' checks passed');
}

main().catch((error) => {
  console.error('\nFAILED:', error && error.message);
  console.error(error && error.stack);
  process.exit(1);
});
