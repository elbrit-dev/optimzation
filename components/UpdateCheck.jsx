import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Router from 'next/router';
import { isOtherCore, plasmicVersionOf } from '../lib/coreVersion';

/**
 * Notices a new release while the app is open, and gets it onto the screen.
 *
 * A release is either part changing: the Core Version (the app's code) or the
 * Plasmic version (the published design). An installed app can sit in memory
 * for days without loading a page, so the service worker's fresh-page fetch
 * (public/sw.js) never gets a chance to help. This asks /api/version what the
 * server has now whenever the app comes back to the foreground or online,
 * after each navigation, and every 5 minutes while it is on screen.
 *
 * A NEW DESIGN IS CONFIRMED ON THE PAGE BEING SHOWN before it is offered.
 * Pages are ISR, and after a Plasmic publish every page catches up on its
 * own: each CDN edge and each server instance keeps its own copy of each page
 * for up to ~15 minutes. Home can already be new while the page on screen is
 * still old — and a reload of THAT page then shows the old screen and offers
 * again (seen on a handset, 21 Oct 2026: the bar came back after every
 * reload). So the check reads the data of the page on screen, past the CDN,
 * and offers only once that already carries the new version. A new build
 * needs no such wait.
 *
 * Then, without costing anyone their work:
 *   - back from the background after a minute or more, on home, with nothing
 *     open: reload straight away;
 *   - anywhere else: a "New version available" bar with Reload. There is no
 *     "Later": it stays until they reload.
 *
 * A RELOAD THAT DID NOT DELIVER IS NOT OFFERED AGAIN STRAIGHT AWAY. If the
 * page comes back still on the old version (a cache on the way had not caught
 * up), the same release is left alone on that page for 10 minutes and then
 * offered once more — never a bar that reappears the moment it is used, and
 * never a reload loop.
 */

const POLL_MS = 5 * 60_000;
const AWAY_MS = 60_000;
const PROBE_GAP_MS = 2 * 60_000;
/* After a reload that came back on the old version, how long the same release
   is left alone on that page. */
const RETRY_MS = 10 * 60_000;

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

/* What the last reload was for, per tab: { key, attempt, at }. */
const RELOAD_NOTE = 'elbrit:update-reload';

function readNote() {
  try {
    return JSON.parse(window.sessionStorage.getItem(RELOAD_NOTE) || 'null');
  } catch {
    return null;
  }
}

function writeNote(note) {
  try {
    window.sessionStorage.setItem(RELOAD_NOTE, JSON.stringify(note));
  } catch {
    /* storage refused (private mode, quota): the guard is lost, not the reload */
  }
}

/** Whether this release was reloaded for here a moment ago — and is still not on screen. */
function triedRecently(key) {
  const note = readNote();
  return Boolean(note && note.key === key && Date.now() - note.at < RETRY_MS);
}

/* RELOAD PAST THE CDN. A plain reload fetches the page's HTML, which the CDN
   can hold for 10 more minutes. A `_v` parameter makes the reload a separate
   CDN entry — but one named after the version alone is shared by every
   reload for that release, and a CDN edge that cached it while its server was
   still behind handed that old page to every reload after (seen on a
   handset). The attempt number makes each reload its own entry, while
   keeping the service worker's page cache (keyed by URL) to a handful of
   copies rather than one per press. It replaces the history entry (no extra
   back press) and is taken off the URL again once the page is up. */
const VERSION_PARAM = '_v';

function reloadFresh(target) {
  const note = readNote();
  const attempt = note && note.key === target.key ? note.attempt + 1 : 1;
  writeNote({ key: target.key, attempt, at: Date.now() });
  const url = new URL(window.location.href);
  url.searchParams.set(VERSION_PARAM, `${target.label}-${attempt}`);
  window.location.replace(url.toString());
}

/* The data URL Next fetches for a page on an in-app navigation:
   "/" -> /_next/data/<build>/index.json, "/planner" -> …/planner.json. */
function dataUrl(buildId, pathname) {
  let path = pathname || '/';
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
  if (path === '/') path = '/index';
  return `/_next/data/${buildId}${path}.json`;
}

/* The Plasmic version the server renders `pathname` with right now, or null.
   A one-off query makes it a CDN miss, so the answer is the server's, not an
   edge's; `no-store` keeps it out of the browser's cache. */
async function servedPlasmicVersion(pathname) {
  const buildId = window.__NEXT_DATA__?.buildId;
  if (!buildId) return null;
  const res = await fetch(`${dataUrl(buildId, pathname)}?_probe=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) return null;
  const data = await res.json();
  return plasmicVersionOf(data?.pageProps);
}

export default function UpdateCheck({ plasmicVersion }) {
  const [available, setAvailable] = useState(false);
  const hiddenAt = useRef(null);
  const busy = useRef(false);
  const lastProbe = useRef({ key: null, at: 0, served: null });
  const pagePlasmic = useRef(plasmicVersion);
  if (plasmicVersion) pagePlasmic.current = plasmicVersion;
  const target = useRef(null);

  /* Whether the page on screen is served with `published` now. Pages whose
     data cannot be read (no Plasmic page data, a server error) fall back to
     home's, as before. */
  const newDesignServed = useCallback(async (published, pathname) => {
    const key = `${published}|${pathname}`;
    const probe = lastProbe.current;
    if (probe.key === key && Date.now() - probe.at < PROBE_GAP_MS) return probe.served === published;
    let served = null;
    try {
      served = await servedPlasmicVersion(pathname);
      if (served == null && pathname !== '/') served = await servedPlasmicVersion('/');
    } catch {
      served = null;
    }
    lastProbe.current = { key, at: Date.now(), served };
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
        const pathname = window.location.pathname;

        let next = null;
        if (isOtherCore(server)) {
          next = { key: `code:${server.commit}:${server.builtAt}`, label: server.commit || 'build' };
        } else if (server.plasmic && page && server.plasmic !== page && (await newDesignServed(server.plasmic, pathname))) {
          next = { key: `design:${server.plasmic}@${pathname}`, label: server.plasmic };
        }

        if (!next || triedRecently(next.key)) {
          setAvailable(false);
          return;
        }
        target.current = next;
        if (cameBack && isQuiet()) {
          reloadFresh(next);
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
        onClick={() => target.current && reloadFresh(target.current)}
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
