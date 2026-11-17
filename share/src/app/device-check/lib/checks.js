/* Device check — will this browser run Elbrit One?

   Every check resolves to { id, status, code, detail }:
     status  'pass' | 'warn' | 'fail'   (warn never blocks; fail does)
     code    machine-readable reason, picks the fix-it steps in instructions.js
     detail  one short line for the person reading the checklist

   What the app actually depends on, and why each check exists:
     desktop     Chrome's "Desktop site" serves the 980px desktop layout to a
                 phone and breaks the app's mobile screens.
     location    Doctor visits record GPS (shared/calendar). "Not asked yet" is
                 fine — the app asks when it needs it. Only "blocked" fails.
     cookies     Chrome ties ALL site storage to the cookie setting: blocking
                 cookies also blocks localStorage and IndexedDB.
     local       localStorage — impersonation, device id, queues, drafts.
     session     sessionStorage — FirebaseUI's sign-in flow, update notes.
     indexeddb   Firebase Auth keeps the signed-in session here; Dexie /
                 localforage tables cache data.
     space       Free storage quota. A full phone gives Chrome almost no
                 quota and sign-in dies after the OTP with QuotaExceededError
                 (Sentry ELBRIT-ONE-APP-3J).
     worker      Service worker — offline shell and push. Missing = warn only.

   Everything here is browser-only and side-effect free apart from the tiny
   probe values it writes and immediately removes. */

const PROBE_KEY = '__elbrit_device_check__';
const PROBE_DB = 'elbrit-device-check';
// Big enough to trip a nearly-full quota, small enough to be instant.
const PROBE_SIZE = 64 * 1024;

const MB = 1024 * 1024;
export const SPACE_FAIL_BYTES = 20 * MB;
export const SPACE_WARN_BYTES = 100 * MB;

// `icon` is a PrimeIcons name, rendered through the design system's <Icon>.
export const CHECKS = [
  { id: 'desktop', label: 'Mobile view', icon: 'mobile' },
  { id: 'location', label: 'Location not blocked', icon: 'map-marker' },
  { id: 'cookies', label: 'Cookies allowed', icon: 'shield' },
  { id: 'local', label: 'Local storage', icon: 'database' },
  { id: 'session', label: 'Session storage', icon: 'history' },
  { id: 'indexeddb', label: 'IndexedDB', icon: 'server' },
  { id: 'space', label: 'Free storage', icon: 'chart-pie' },
  { id: 'worker', label: 'Offline & notifications', icon: 'bell' },
];

const result = (id, status, code, detail) => ({ id, status, code, detail });

/* ---------- platform ---------- */

const MOBILE_UA = /Android|iPhone|iPod|Mobile/i;

/**
 * Is this a phone showing the desktop site? A desktop-site phone hides its
 * mobile UA tokens, so it is recognised by what it can't hide: a touch-first
 * (coarse) primary pointer on a UA that claims a desktop OS.
 *   - "X11; Linux x86_64" + touch  → Android Chrome / Samsung in desktop mode
 *     (ChromeOS is excluded: it is genuinely a laptop).
 *   - "Macintosh" + touch + short side < 600px → iPhone "Request Desktop
 *     Website". iPads also say Macintosh by default; they are left alone.
 *   - Windows touch laptops have a fine primary pointer → never flagged.
 */
export function isDesktopSite(env) {
  const { ua = '', maxTouchPoints = 0, coarsePointer = false, screenW = 0, screenH = 0, uaDataMobile } = env;
  if (MOBILE_UA.test(ua)) return false;
  if (uaDataMobile === true) return false;
  if (!(maxTouchPoints > 0 && coarsePointer)) return false;
  if (/CrOS/.test(ua)) return false;
  if (/Linux/.test(ua)) return true;
  if (/Macintosh/.test(ua)) {
    const short = Math.min(screenW || Infinity, screenH || Infinity);
    return short < 600;
  }
  return false;
}

/** { os: 'android'|'ios'|'other', browser: 'chrome'|'samsung'|'safari'|'firefox'|'edge'|'other' } */
export function detectPlatform(env) {
  const { ua = '', maxTouchPoints = 0, coarsePointer = false } = env;
  const touch = maxTouchPoints > 0 && coarsePointer;
  let os = 'other';
  if (/Android/.test(ua) || (touch && /Linux/.test(ua) && !/CrOS/.test(ua))) os = 'android';
  else if (/iPhone|iPad|iPod/.test(ua) || (touch && /Macintosh/.test(ua))) os = 'ios';

  let browser = 'other';
  if (/SamsungBrowser/.test(ua)) browser = 'samsung';
  else if (/EdgA|EdgiOS|Edg\//.test(ua)) browser = 'edge';
  else if (/Firefox|FxiOS/.test(ua)) browser = 'firefox';
  else if (/CriOS|Chrome\//.test(ua)) browser = 'chrome';
  else if (/Safari/.test(ua)) browser = 'safari';
  return { os, browser };
}

export function readEnv(win = typeof window !== 'undefined' ? window : undefined) {
  if (!win) return {};
  const nav = win.navigator || {};
  let coarsePointer = false;
  try {
    coarsePointer = !!win.matchMedia?.('(pointer: coarse)').matches;
  } catch {
    /* old browsers */
  }
  return {
    ua: nav.userAgent || '',
    maxTouchPoints: nav.maxTouchPoints || 0,
    coarsePointer,
    screenW: win.screen?.width || 0,
    screenH: win.screen?.height || 0,
    uaDataMobile: nav.userAgentData ? nav.userAgentData.mobile : undefined,
  };
}

/* ---------- storage error triage ---------- */

/** QuotaExceededError (any of its historic spellings) means "full", anything else "blocked". */
export function classifyStorageError(err) {
  if (!err) return 'blocked';
  const name = err.name || '';
  if (
    name === 'QuotaExceededError' ||
    name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    err.code === 22 ||
    err.code === 1014
  ) {
    return 'full';
  }
  return 'blocked';
}

/** Free = quota − usage. Below FAIL the app can't save a session; below WARN it soon won't. */
export function evaluateSpace(estimate) {
  if (!estimate || typeof estimate.quota !== 'number') {
    return result('space', 'pass', 'unknown', "This browser doesn't report free space.");
  }
  const free = Math.max(0, estimate.quota - (estimate.usage || 0));
  const mb = Math.round(free / MB);
  if (free < SPACE_FAIL_BYTES) return result('space', 'fail', 'full', `Only ${mb} MB free for the app.`);
  if (free < SPACE_WARN_BYTES) return result('space', 'warn', 'low', `Only ${mb} MB free. Free some space on your phone soon.`);
  return result('space', 'pass', 'ok', mb > 1024 ? `${(mb / 1024).toFixed(1)} GB available.` : `${mb} MB available.`);
}

/* ---------- individual checks ---------- */

export function checkDesktop(env) {
  return isDesktopSite(env)
    ? result('desktop', 'fail', 'desktop_site', 'This browser is showing the desktop site.')
    : result('desktop', 'pass', 'ok', 'Mobile view is on.');
}

function withTimeout(promise, ms, onTimeout) {
  let t;
  return Promise.race([
    promise,
    new Promise((resolve) => {
      t = setTimeout(() => resolve(onTimeout()), ms);
    }),
  ]).finally(() => clearTimeout(t));
}

/**
 * Never prompts. Asks the Permissions API; only when the site already holds
 * "granted" does it read a position, to catch the phone itself blocking the
 * browser (site says allowed, OS says no → PERMISSION_DENIED).
 */
export async function checkLocation(nav = navigator, { timeoutMs = 10000 } = {}) {
  if (!nav.geolocation) return result('location', 'fail', 'unsupported', "This browser can't share location.");

  let state = 'unknown';
  try {
    const status = await nav.permissions?.query({ name: 'geolocation' });
    if (status?.state) state = status.state;
  } catch {
    /* Permissions API missing (older Safari) */
  }

  if (state === 'denied') return result('location', 'fail', 'blocked', 'Location is blocked for this site.');
  if (state === 'prompt') return result('location', 'pass', 'prompt', 'Not decided yet. Tap Allow when the app asks.');
  if (state !== 'granted') return result('location', 'pass', 'unknown', 'Tap Allow when the app asks for location.');

  return withTimeout(
    new Promise((resolve) => {
      nav.geolocation.getCurrentPosition(
        () => resolve(result('location', 'pass', 'ok', 'Location is allowed.')),
        (err) => {
          if (err?.code === 1) resolve(result('location', 'fail', 'os_blocked', "Your phone's settings stop the browser from using location."));
          // 3 = TIMEOUT: no fix yet is not a settings problem — the site is allowed.
          else if (err?.code === 3) resolve(result('location', 'pass', 'ok', 'Location is allowed.'));
          else resolve(result('location', 'warn', 'gps_off', 'Location is allowed, but your phone could not find it. Turn on Location (GPS).'));
        },
        { enableHighAccuracy: false, maximumAge: Infinity, timeout: timeoutMs },
      );
    }),
    timeoutMs + 1000,
    () => result('location', 'pass', 'ok', 'Location is allowed.'),
  );
}

export function checkCookies(doc = document, nav = navigator) {
  if (nav.cookieEnabled === false) return result('cookies', 'fail', 'blocked', 'Cookies are turned off.');
  try {
    doc.cookie = `${PROBE_KEY}=1; path=/; SameSite=Lax`;
    const ok = doc.cookie.includes(`${PROBE_KEY}=1`);
    doc.cookie = `${PROBE_KEY}=; path=/; max-age=0; SameSite=Lax`;
    return ok ? result('cookies', 'pass', 'ok', 'Cookies are allowed.') : result('cookies', 'fail', 'blocked', 'Cookies are turned off.');
  } catch {
    return result('cookies', 'fail', 'blocked', 'Cookies are turned off.');
  }
}

export function checkWebStorage(id, getStore) {
  let store;
  try {
    store = getStore();
  } catch (err) {
    return result(id, 'fail', 'blocked', 'Blocked by browser settings.');
  }
  if (!store) return result(id, 'fail', 'blocked', 'Not available in this browser.');
  const value = 'x'.repeat(PROBE_SIZE);
  try {
    store.setItem(PROBE_KEY, value);
    const ok = store.getItem(PROBE_KEY) === value;
    store.removeItem(PROBE_KEY);
    return ok ? result(id, 'pass', 'ok', 'Allowed.') : result(id, 'fail', 'blocked', 'Could not read back saved data.');
  } catch (err) {
    try {
      store.removeItem(PROBE_KEY);
    } catch {
      /* ignore */
    }
    return classifyStorageError(err) === 'full'
      ? result(id, 'fail', 'full', 'Storage is full.')
      : result(id, 'fail', 'blocked', 'Blocked by browser settings.');
  }
}

/** Open → write → read → delete a throwaway database. Some private modes hang open(); that's a fail. */
export function checkIndexedDB(idb = typeof indexedDB !== 'undefined' ? indexedDB : undefined, { timeoutMs = 5000 } = {}) {
  if (!idb) return Promise.resolve(result('indexeddb', 'fail', 'blocked', 'Not available in this browser.'));

  const fromError = (err) =>
    classifyStorageError(err) === 'full'
      ? result('indexeddb', 'fail', 'full', 'Storage is full.')
      : result('indexeddb', 'fail', 'blocked', 'Blocked by browser settings.');

  const run = new Promise((resolve) => {
    let req;
    try {
      req = idb.open(PROBE_DB, 1);
    } catch (err) {
      resolve(fromError(err));
      return;
    }
    req.onupgradeneeded = () => {
      try {
        req.result.createObjectStore('probe');
      } catch {
        /* surfaced through onerror */
      }
    };
    req.onerror = () => resolve(fromError(req.error));
    req.onsuccess = () => {
      const db = req.result;
      const done = (res) => {
        try {
          db.close();
          idb.deleteDatabase(PROBE_DB);
        } catch {
          /* ignore */
        }
        resolve(res);
      };
      try {
        const tx = db.transaction('probe', 'readwrite');
        tx.objectStore('probe').put('x'.repeat(PROBE_SIZE), 'k');
        tx.oncomplete = () => done(result('indexeddb', 'pass', 'ok', 'Allowed.'));
        tx.onerror = () => done(fromError(tx.error));
        tx.onabort = () => done(fromError(tx.error));
      } catch (err) {
        done(fromError(err));
      }
    };
  });

  return withTimeout(run, timeoutMs, () => result('indexeddb', 'fail', 'blocked', 'The browser did not respond. Private / incognito mode?'));
}

export async function checkSpace(nav = navigator) {
  try {
    const estimate = await nav.storage?.estimate?.();
    return evaluateSpace(estimate);
  } catch {
    return evaluateSpace(null);
  }
}

export function checkWorker(nav = navigator) {
  return 'serviceWorker' in nav
    ? result('worker', 'pass', 'ok', 'Supported.')
    : result('worker', 'warn', 'unsupported', 'Offline mode and notifications will not work here.');
}

/** Default time limits. The launch gate (behind the splash) passes ~2s. */
export const DEFAULT_TIMEOUTS = { location: 10000, indexeddb: 5000 };

/**
 * Location is for doctor visits — a phone thing. On a desktop or laptop (HQ
 * staff) a blocked location is a warning, never a blocker.
 */
export function applyPlatformRules(results, platform) {
  if (platform?.os !== 'other') return results;
  return results.map((r) =>
    r.id === 'location' && r.status === 'fail'
      ? { ...r, status: 'warn', detail: `${r.detail} Only needed on the phone, for doctor visits.` }
      : r,
  );
}

/**
 * Run every check in order. `onEach(result)` fires as each one finishes.
 * `timeouts` caps the two checks that can wait on the browser.
 */
export async function runAllChecks({ onEach, timeouts = DEFAULT_TIMEOUTS } = {}) {
  const env = readEnv();
  const platform = detectPlatform(env);
  const t = { ...DEFAULT_TIMEOUTS, ...timeouts };
  const steps = [
    () => checkDesktop(env),
    () => checkLocation(navigator, { timeoutMs: t.location }),
    () => checkCookies(document, navigator),
    () => checkWebStorage('local', () => window.localStorage),
    () => checkWebStorage('session', () => window.sessionStorage),
    () => checkIndexedDB(undefined, { timeoutMs: t.indexeddb }),
    () => checkSpace(navigator),
    () => checkWorker(navigator),
  ];
  const results = [];
  for (const step of steps) {
    let r;
    try {
      r = await step();
    } catch (err) {
      r = result(CHECKS[results.length].id, 'fail', 'error', String(err?.message || err));
    }
    [r] = applyPlatformRules([r], platform);
    results.push(r);
    onEach?.(r);
  }
  return { results, platform };
}

export const isBlocking = (r) => r?.status === 'fail';

/** Only same-origin paths: "/x" yes, "//evil.com" or "https://…" no. */
export function safeNext(raw, fallback = '/') {
  const s = String(raw || '').trim();
  if (!s.startsWith('/') || s.startsWith('//') || s.startsWith('/\\')) return fallback;
  return s;
}
