import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Router from 'next/router';
import { db } from '../firebase';
import { CORE_COMMIT, RELEASE_ENV, isOtherCore, plasmicVersionOf } from '../lib/coreVersion';

/**
 * Notices a new release while the app is open, and gets it onto the screen.
 *
 * A release is either part changing: the Core Version (the app's code) or the
 * Plasmic version (the published design). An installed app can sit in memory
 * for days without loading a page, so the service worker's fresh-page fetch
 * (public/sw.js) never gets a chance to help. This asks /api/version what the
 * server has now:
 *   - THE MOMENT A RELEASE HAPPENS: it listens to the release record in
 *     Firestore (appRelease/<env>, lib/release.js), which the server updates
 *     once a release is servable — a Plasmic publish after its pages are
 *     regenerated, a build on its first request;
 *   - and as a backstop for a missed event: when the app comes back to the
 *     foreground or online, after each navigation, and every 30 minutes on
 *     screen.
 * The record is only a nudge: what decides is /api/version plus the check
 * below, so a wrong record costs a check, never a bad reload.
 *
 * A NEW DESIGN IS CONFIRMED BEFORE IT IS OFFERED. Pages are ISR: for up to
 * ~15 minutes after a Plasmic publish the server (and CDN) still render the
 * previous design, so reloading straight away would show the old screen and
 * offer again. The check reads the home page's data once (only after a
 * publish has been seen, and at most every 2 minutes) and acts only when that
 * already carries the new version. A new build needs no such wait.
 *
 * Then, without costing anyone their work:
 *   - back from the background after a minute or more, on home, with nothing
 *     open: reload straight away;
 *   - anywhere else: a "New version available" bar with Reload. There is no
 *     "Later": it stays until they reload.
 */

const POLL_MS = 30 * 60_000;
const AWAY_MS = 60_000;
const PROBE_GAP_MS = 2 * 60_000;

/* A dialog on screen, not one merely in the page: a closed Ant Design drawer
   (the profile drawer) stays mounted at 0×0 with role="dialog", and counting
   it kept home from ever being quiet (seen on a handset). */
const dialogOpen = () =>
  [...document.querySelectorAll('[role="dialog"], [aria-modal="true"]')].some((el) => {
    const box = el.getBoundingClientRect();
    if (box.width < 1 || box.height < 1) return false;
    const style = window.getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
  });

const isQuiet = () => window.location.pathname === '/' && !dialogOpen();

/* RELOAD PAST THE CDN. The design check reads the page data the server renders
   now; a plain reload fetches the page's HTML, which the CDN can hold for 10
   more minutes — seen on a handset: reloaded quietly onto the OLD design, then
   offered again. A one-off `_v` parameter is a separate CDN entry, so the
   reload gets what the server renders. It replaces the history entry (no extra
   back press) and is taken off the URL again once the page is up. */
const VERSION_PARAM = '_v';

function reloadFresh(version) {
  const url = new URL(window.location.href);
  url.searchParams.set(VERSION_PARAM, String(version || Date.now()));
  window.location.replace(url.toString());
}

/** The Plasmic version the server would render home with right now, or null. */
async function servedPlasmicVersion() {
  const buildId = window.__NEXT_DATA__?.buildId;
  if (!buildId) return null;
  const res = await fetch(`/_next/data/${buildId}/index.json`, { cache: 'no-cache' });
  if (!res.ok) return null;
  const data = await res.json();
  return plasmicVersionOf(data?.pageProps);
}

export default function UpdateCheck({ plasmicVersion }) {
  const [available, setAvailable] = useState(false);
  const hiddenAt = useRef(null);
  const busy = useRef(false);
  const lastProbe = useRef({ version: null, at: 0, served: null });
  const pagePlasmic = useRef(plasmicVersion);
  if (plasmicVersion) pagePlasmic.current = plasmicVersion;
  const target = useRef(null);

  const newDesignServed = useCallback(async (published) => {
    const probe = lastProbe.current;
    if (probe.version === published && Date.now() - probe.at < PROBE_GAP_MS) return probe.served === published;
    let served = null;
    try {
      served = await servedPlasmicVersion();
    } catch {
      served = null;
    }
    lastProbe.current = { version: published, at: Date.now(), served };
    return served === published;
  }, []);

  const check = useCallback(
    async ({ cameBack = false } = {}) => {
      if (busy.current) return;
      busy.current = true;
      try {
        const res = await fetch('/api/version', { cache: 'no-store' });
        if (!res.ok) return;
        const server = await res.json();
        const page = pagePlasmic.current;
        let newer = isOtherCore(server);
        if (!newer && server.plasmic && page && server.plasmic !== page) {
          newer = await newDesignServed(server.plasmic);
        }
        if (!newer) {
          setAvailable(false);
          return;
        }
        target.current = server.plasmic || server.commit;
        if (cameBack && isQuiet()) {
          reloadFresh(target.current);
          return;
        }
        setAvailable(true);
      } catch {
        // Offline or server unreachable: ask again next time.
      } finally {
        busy.current = false;
      }
    },
    [newDesignServed],
  );

  useEffect(() => {
    // Plasmic Studio loads the app in an iframe through /plasmic-host.
    if (window.location.pathname.startsWith('/plasmic-host')) return undefined;

    /* Arrived through reloadFresh: take the parameter off the URL again,
       without a reload or a new history entry. */
    const here = new URL(window.location.href);
    if (here.searchParams.has(VERSION_PARAM)) {
      here.searchParams.delete(VERSION_PARAM);
      const clean = `${here.pathname}${here.search}${here.hash}`;
      Router.ready(() => {
        Promise.resolve(Router.replace(clean, undefined, { shallow: true, scroll: false })).catch(() => {});
      });
    }

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt.current = Date.now();
        return;
      }
      const away = hiddenAt.current != null && Date.now() - hiddenAt.current >= AWAY_MS;
      hiddenAt.current = null;
      check({ cameBack: away });
    };
    const onOnline = () => check();
    const timer = setInterval(() => document.visibilityState === 'visible' && check(), POLL_MS);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('online', onOnline);
    Router.events.on('routeChangeComplete', onOnline);
    check();
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('online', onOnline);
      Router.events.off('routeChangeComplete', onOnline);
    };
  }, [check]);

  /* The release record: a change to it is a release that is ready to serve.
     Re-subscribed when the Firebase sign-in changes — reading it needs a
     signed-in user unless the read rule for appRelease is in place, and a
     listener refused once stays refused. A refusal is silent: the backstop
     checks above still run. */
  useEffect(() => {
    if (window.location.pathname.startsWith('/plasmic-host')) return undefined;
    let stop = null;
    const subscribe = () => {
      stop?.();
      stop = null;
      try {
        stop = db
          .collection('appRelease')
          .doc(RELEASE_ENV)
          .onSnapshot(
            (snap) => {
              const record = snap.data();
              if (!record) return;
              const page = pagePlasmic.current;
              const newCode = record.commit && record.commit !== CORE_COMMIT;
              const newDesign = record.plasmic && page && record.plasmic !== page;
              if (newCode || newDesign) check();
            },
            () => {},
          );
      } catch {
        stop = null;
      }
    };
    subscribe();
    const stopAuth = window.firebaseAuth?.onAuthStateChanged?.(() => subscribe());
    return () => {
      stop?.();
      if (typeof stopAuth === 'function') stopAuth();
    };
  }, [check]);

  if (!available || typeof document === 'undefined') return null;

  return createPortal(
    <div
      role="status"
      aria-live="polite"
      data-update-available=""
      style={{
        position: 'fixed',
        left: '50%',
        transform: 'translateX(-50%)',
        bottom: 'calc(5rem + env(safe-area-inset-bottom, 0px))',
        zIndex: 1200,
        maxWidth: 'calc(100vw - 2rem)',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '8px 8px 8px 16px',
        borderRadius: 16,
        background: '#ffffff',
        border: '1px solid #e5e7eb',
        boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
        fontFamily: 'var(--font-roboto, Roboto), system-ui, sans-serif',
        fontSize: 14,
        color: '#1f1f1f',
      }}
    >
      <span style={{ whiteSpace: 'nowrap' }}>New version available</span>
      <button
        type="button"
        onClick={() => reloadFresh(target.current)}
        style={{
          background: '#2563eb',
          color: '#ffffff',
          border: 0,
          borderRadius: 10,
          fontSize: 14,
          fontWeight: 600,
          padding: '6px 14px',
          cursor: 'pointer',
        }}
      >
        Reload
      </button>
    </div>,
    document.body,
  );
}
