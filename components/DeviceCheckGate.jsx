import { useEffect, useRef, useState } from 'react';
import * as Sentry from '@sentry/nextjs';
import { DeviceCheck } from '@/app/device-check/components/DeviceCheck';
import { isBlocking, runAllChecks } from '@/app/device-check/lib/checks';

/**
 * Checks the browser once per app launch, behind the splash screen, and only
 * shows anything when something would stop Elbrit One working: "Desktop
 * site" on, location blocked (on a phone), cookies / localStorage /
 * sessionStorage / IndexedDB blocked, or the phone out of space. Then the
 * DeviceCheck checklist replaces the app, opened on the first problem, until
 * it's fixed — and it lets them through by itself once it is.
 *
 * Mounted in _app inside MaintenanceGate (maintenance wins), around every
 * page: before login and for signed-in people alike. The page underneath is
 * unmounted, not covered, so a login can't start and die on storage.
 *
 * Timing: the page renders straight away (no SSR difference), the checks run
 * at once with ~2s caps on the two that can wait on the browser, and the
 * splash waits for them (see _app: it listens for DONE_EVENT, and never waits
 * longer than its own cap). A healthy phone finishes in well under a second,
 * inside the splash's existing minimum.
 *
 * Warnings (GPS off, storage running low, no service worker) never block.
 *
 * Sentry: a block sends ONE event "Device check: <first problem>" (warning,
 * so it carries a replay), and getting through afterwards sends "Device
 * check: fixed" (info) — the same tally style as lib/loginTelemetry.js.
 */

export const DONE_EVENT = 'elbrit:device-check-done';
const TIMEOUTS = { location: 2000, indexeddb: 2000 };

// Studio's canvas must never be blocked; the standalone page runs its own copy.
const SKIP_PATHS = ['/plasmic-host', '/device-check'];

function announceDone() {
  window.__elbritDeviceCheckDone = true;
  window.dispatchEvent(new Event(DONE_EVENT));
}

function report(results, platform, outcome) {
  try {
    const failing = results.filter(isBlocking);
    const first = failing[0];
    const title = outcome === 'fixed' ? 'Device check: fixed' : `Device check: ${first.id} ${first.code}`;
    Sentry.withScope((scope) => {
      scope.setLevel(outcome === 'fixed' ? 'info' : 'warning');
      scope.setTag('device_check.outcome', outcome);
      scope.setTag('device_check.os', platform?.os);
      scope.setTag('device_check.browser', platform?.browser);
      if (first) scope.setTag('device_check.first', `${first.id}/${first.code}`);
      scope.setContext('device_check', {
        failing: failing.map((r) => `${r.id}/${r.code}`).join(', ') || 'none',
        results: Object.fromEntries(results.map((r) => [r.id, `${r.status} ${r.code}`])),
      });
      scope.setFingerprint(['device-check', title]);
      Sentry.captureMessage(title);
    });
  } catch {
    /* telemetry must never break the gate */
  }
}

export default function DeviceCheckGate({ children }) {
  // null = still checking (show the page — the splash is covering it).
  const [blocked, setBlocked] = useState(null);
  const once = useRef(false);

  useEffect(() => {
    if (once.current) return;
    once.current = true;
    if (SKIP_PATHS.some((p) => window.location.pathname.startsWith(p))) {
      announceDone();
      return;
    }
    // No "alive" flag: StrictMode's mount→unmount→mount would mark the only
    // run dead (the ref stops a second one) and the splash would wait its cap.
    runAllChecks({ timeouts: TIMEOUTS })
      .then(({ results, platform }) => {
        if (results.some(isBlocking)) {
          setBlocked({ results, platform });
          report(results, platform, 'blocked');
        }
      })
      .catch(() => {
        /* a broken check must not lock anyone out */
      })
      .finally(announceDone);
  }, []);

  if (!blocked) return children;

  return (
    <main
      data-surface="app"
      className="fixed inset-0 overflow-y-auto bg-page"
      style={{ zIndex: 2147482000 }}
    >
      <DeviceCheck
        initialResults={blocked.results}
        initialPlatform={blocked.platform}
        timeouts={TIMEOUTS}
        autoContinue
        onPass={(results) => {
          report(results.filter(Boolean), blocked.platform, 'fixed');
          setBlocked(null);
        }}
      />
    </main>
  );
}
