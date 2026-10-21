import { useCallback, useEffect, useRef, useState } from 'react';
import Router from 'next/router';

/**
 * Replaces the WHOLE app with the maintenance screen while the "Maintenance
 * Mode" switch in Plasmic Studio is on (see pages/api/maintenance.js for how
 * the switch is read).
 *
 * Mounted in _app around every page, so it covers signed-in and signed-out
 * users, the login page, deep links and the installed PWA alike. The page
 * underneath is unmounted, not just covered, so nothing behind the screen
 * keeps polling ERP or writing.
 *
 * It never delays a normal load: the page renders straight away and is only
 * swapped out once the check says so. It re-checks every minute, whenever the
 * app comes back to the foreground or online, and on navigation (at most
 * once per MIN_GAP_MS for the foreground and navigation checks) — and
 * every 20s while the screen is up, so switching off lets people back in
 * without them having to do anything.
 */

const POLL_MS = 60_000;
const POLL_MS_WHILE_DOWN = 20_000;
// Coming back to the app fires visibilitychange AND focus, and every
// navigation asks too: without a floor that was 2–3 identical checks a resume
// and one per page. A check this recent (or still running) answers for them.
const MIN_GAP_MS = 15_000;
const BYPASS_STORAGE = 'elbrit.maintenanceBypass';
const RED = '#D92C24';

function readBypassKey() {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get('maintenance');
    if (fromUrl) localStorage.setItem(BYPASS_STORAGE, fromUrl);
    return localStorage.getItem(BYPASS_STORAGE) || '';
  } catch {
    return '';
  }
}

export default function MaintenanceGate({ children }) {
  const [status, setStatus] = useState(null);
  const lastCheckRef = useRef(0);

  // `force` is for the timer and the Check again button; event-driven checks
  // within MIN_GAP_MS of the last one are skipped.
  const check = useCallback(async (force = false) => {
    const now = Date.now();
    if (force !== true && now - lastCheckRef.current < MIN_GAP_MS) return;
    lastCheckRef.current = now;
    try {
      const key = readBypassKey();
      const res = await fetch(`/api/maintenance${key ? `?key=${encodeURIComponent(key)}` : ''}`);
      if (!res.ok) return; // keep whatever we last knew
      setStatus(await res.json());
    } catch {
      // Offline or server unreachable: keep the last known state.
    }
  }, []);
  const forceCheck = useCallback(() => check(true), [check]);

  const down = Boolean(status?.enabled);

  useEffect(() => {
    // Plasmic Studio loads the app in an iframe through /plasmic-host; the
    // screen must never block editing.
    if (window.location.pathname.startsWith('/plasmic-host')) return undefined;

    // Event listeners pass an event object, never `true`, so they stay throttled.
    const soft = () => check();
    check();
    const timer = setInterval(forceCheck, down ? POLL_MS_WHILE_DOWN : POLL_MS);
    const onVisible = () => document.visibilityState === 'visible' && soft();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', soft);
    window.addEventListener('online', forceCheck);
    Router.events.on('routeChangeStart', soft);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', soft);
      window.removeEventListener('online', forceCheck);
      Router.events.off('routeChangeStart', soft);
    };
  }, [check, forceCheck, down]);

  if (!down) return children;
  return <MaintenanceScreen {...status} onRetry={forceCheck} />;
}

/**
 * The switch as it appears in Plasmic Studio: a global context, so its
 * settings live in Studio's project settings rather than on any one page.
 *
 * It renders nothing of its own, anywhere: the settings it carries in the
 * page's (possibly 10-minute-old) published bundle are NOT what decides
 * maintenance; MaintenanceGate asks /api/maintenance, which reads Studio's
 * latest saved state. It must ALWAYS render its children — Studio drops a
 * global context from Project Settings when it doesn't (a "preview" mode that
 * swapped the canvas for the screen did exactly that), so preview the screen
 * on the test app with "Applies to: Test only" instead.
 */
export function MaintenanceMode({ children }) {
  return children;
}

export function MaintenanceScreen({ title, message, backBy, onRetry }) {
  return (
    <main
      role="alert"
      aria-live="assertive"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2147483000,
        background: '#ffffff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 16px',
        overflowY: 'auto',
        fontFamily: 'var(--font-roboto, Roboto), system-ui, sans-serif',
        color: '#1f1f1f',
        textAlign: 'center',
      }}
    >
      <div style={{ maxWidth: 420, width: '100%' }}>
        <img src="/logo.svg" alt="Elbrit" width={64} height={64} style={{ margin: '0 auto 28px', display: 'block' }} />
        <div style={{ width: 40, height: 3, background: RED, borderRadius: 2, margin: '0 auto 20px' }} />
        <h1
          style={{
            margin: '0 0 12px',
            fontFamily: 'var(--font-work-sans, "Work Sans"), system-ui, sans-serif',
            fontSize: 24,
            fontWeight: 600,
            lineHeight: 1.25,
          }}
        >
          {title || 'We’ll be right back'}
        </h1>
        <p style={{ margin: '0 0 16px', fontSize: 15, lineHeight: 1.55, color: '#555', whiteSpace: 'pre-line' }}>
          {message || 'Elbrit One is down for scheduled maintenance. Your data is safe. Please check back shortly.'}
        </p>
        {backBy ? (
          <p style={{ margin: '0 0 24px', fontSize: 14, fontWeight: 500, color: RED }}>{backBy}</p>
        ) : null}
        {onRetry ? <button
          type="button"
          onClick={onRetry}
          style={{
            marginTop: 8,
            padding: '10px 22px',
            border: `1px solid ${RED}`,
            borderRadius: 8,
            background: '#ffffff',
            color: RED,
            fontSize: 14,
            fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          Check again
        </button> : null}
      </div>
    </main>
  );
}
