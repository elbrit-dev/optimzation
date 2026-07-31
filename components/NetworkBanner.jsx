import React from "react";
import { Wifi, WifiOff, SignalLow, SignalMedium, Activity } from "lucide-react";

/**
 * NetworkBanner — an inline banner that warns when the connection is genuinely
 * slow or offline.
 *
 * Why this exists / what changed:
 *   The old version trusted `navigator.connection.effectiveType`. Chrome reports
 *   that as a coarse *estimate* derived from recently-observed RTT, and on an idle
 *   page it frequently reports "3g" even on a 300–500 Mbps LAN — producing a false
 *   "Slow connection" banner. We now MEASURE real throughput with a tiny background
 *   download probe (Cloudflare's public, CORS-enabled speed endpoint). A fast line
 *   measures fast and the banner never appears.
 *
 * Placement:
 *   This is a NORMAL in-flow component, not a fixed/portaled toast — drop it
 *   anywhere in the tree (top of a page, inside a header, above a table) and it
 *   renders exactly there, filling the width of its slot. When it has nothing to
 *   say it returns `null`, so it occupies ZERO layout space: no gap, no empty box,
 *   no reserved height. Wrap it yourself if you want it fixed/sticky.
 *
 * Behaviour:
 *   - Auto-appears ONLY when a real measurement is slow (or the browser is offline).
 *   - Click the banner -> runs a full, fast.com-style speed test with a live Mbps
 *     readout, then closes itself. Tap to gone is ~1.8s.
 *   - There is no manual dismiss: the banner closes ITSELF when the connection
 *     recovers (background probe reads good) or when a tap-to-test comes back fast.
 *     This is deliberate — a slow-network warning shouldn't be dismissable while the
 *     network is still slow, or the user wouldn't know why things load slowly.
 *   - Closing plays a short slide-out, then the element unmounts completely.
 *   - Everything is fast by construction: every measurement is hard time-capped, so
 *     no verdict can outlast its cap however bad the line is. See "Timing budget".
 */

const STYLE_ID = "esw-network-banner-styles";

// --- Measurement endpoint (Cloudflare's public speed test backend; CORS: *). ---
const PROBE_URL = "https://speed.cloudflare.com/__down";

// --- Timing budget ----------------------------------------------------------
// EVERY measurement is hard time-capped: when the cap fires we abort the download
// and score the bytes that actually arrived. So a verdict costs the cap, never
// more, no matter how slow the line is (the old 12s timeout meant a slow link
// could stall the decision for seconds — that was the "takes so long" problem).
//
// Worst case, first paint of a slow banner:
//   FIRST_PROBE_DELAY + PROBE_TIME_CAP + CONFIRM_DELAY + PROBE_TIME_CAP ≈ 1.8s
// Worst case, tap to test -> banner gone:
//   FULL_TIME_CAP + AUTO_CLOSE_DELAY ≈ 1.8s
const PROBE_BYTES = 250_000;      // background probe payload (~0.25 MB) — enough to classify
const PROBE_TIME_CAP = 650;       // hard cap per background probe
const FIRST_PROBE_DELAY = 300;    // first probe fires almost immediately after mount
const CONFIRM_DELAY = 200;        // one slow reading -> re-probe this fast to confirm
const GOOD_INTERVAL = 120_000;    // idle re-probe cadence while the line reads good
// While slow we re-probe on a doubling backoff: quick at first, so a line that
// recovers right away closes the banner within ~1.5s, then easing off so we
// aren't stealing bandwidth from an app that is already struggling.
const SLOW_INTERVAL_MIN = 1_500;
const SLOW_INTERVAL_MAX = 10_000;
const AUTO_CLOSE_DELAY = 900;     // how long a manual-test result stays on screen
const FULL_BYTES = 20_000_000;    // manual test payload ceiling (~20 MB)
const FULL_TIME_CAP = 900;        // manual test hard cap
const PAINT_THROTTLE = 80;        // ms between live Mbps repaints during a manual test

// Severity thresholds (Mbps). A 300 Mbps line measures far above these.
const RED_BELOW = 1.5;
const YELLOW_BELOW = 5;

const THEME = {
  red:    { bg: "#fde8e8", fg: "#9b1c1c", border: "#f8b4b4", accent: "#e02424", Icon: WifiOff },
  orange: { bg: "#feecdc", fg: "#9a4a07", border: "#fdba8c", accent: "#ff5a1f", Icon: SignalLow },
  yellow: { bg: "#fdf6b2", fg: "#8e6a00", border: "#fce96a", accent: "#c27803", Icon: SignalMedium },
  green:  { bg: "#def7ec", fg: "#03543f", border: "#84e1bc", accent: "#0e9f6e", Icon: Wifi },
};

const PREVIEW = {
  red: "You are offline.",
  orange: "Very slow connection · 0.9 Mbps",
  yellow: "Slow connection · 2.4 Mbps",
  green: "Fast connection · 305 Mbps",
};

function fmtMbps(m) {
  if (!isFinite(m) || m <= 0) return "0";
  if (m >= 100) return String(Math.round(m));
  if (m >= 10) return m.toFixed(0);
  return m.toFixed(1);
}

// Map a measured throughput to a [severity, message]. Non-positive / NaN means the
// probe was inconclusive (blocked/aborted) -> treat as good so we never cry wolf.
function mbpsToStatus(mbps) {
  if (!isFinite(mbps) || mbps <= 0) return ["green", "Connected."];
  if (mbps < RED_BELOW) return ["red", `Very slow connection · ${fmtMbps(mbps)} Mbps`];
  if (mbps < YELLOW_BELOW) return ["yellow", `Slow connection · ${fmtMbps(mbps)} Mbps`];
  return ["green", `Fast connection · ${fmtMbps(mbps)} Mbps`];
}

/**
 * Score a reading from measureMbps(). The zero-byte case is ambiguous and the two
 * halves mean opposite things, so it can't be folded into mbpsToStatus():
 *   - 0 bytes because the request was blocked/failed -> NOT a speed signal
 *     (corporate proxy, adblocker, endpoint down) -> stay quiet, report good.
 *   - 0 bytes because the clock ran out -> the line could not move a single packet
 *     inside the cap window. That IS very slow, and it's the case a short cap makes
 *     common on bad links, so it must not be scored as green.
 */
function readingToStatus({ mbps, bytes, timedOut }) {
  if (bytes > 0) return mbpsToStatus(mbps);
  return timedOut ? ["red", "Very slow connection."] : ["green", "Connected."];
}

/**
 * Stream a download from the speed endpoint and measure real throughput.
 * Reports live progress via onProgress(mbps). Always resolves — a time-cap abort
 * is a normal outcome, and the bytes that did arrive are the measurement.
 * Returns { mbps, bytes, timedOut }; `timedOut` distinguishes "too slow to finish"
 * from an external abort (unmount / superseded probe) or an outright failure.
 */
async function measureMbps({ bytes, onProgress, signal, timeoutMs }) {
  const ctrl = new AbortController();
  const onAbort = () => ctrl.abort();
  signal?.addEventListener?.("abort", onAbort);
  let timedOut = false;
  const timer = timeoutMs
    ? setTimeout(() => { timedOut = true; ctrl.abort(); }, timeoutMs)
    : null;

  const start = performance.now();
  let loaded = 0;
  try {
    const res = await fetch(`${PROBE_URL}?bytes=${bytes}&t=${Date.now()}`, {
      cache: "no-store",
      signal: ctrl.signal,
    });
    if (!res.ok || !res.body) throw new Error(`probe ${res.status}`);
    const reader = res.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      loaded += value.byteLength;
      const elapsed = (performance.now() - start) / 1000;
      if (elapsed > 0 && onProgress) onProgress((loaded * 8) / (elapsed * 1e6));
    }
  } catch (e) {
    // An abort (time-cap / unmount) is expected: fall through and use what we read.
    if (e.name !== "AbortError" && loaded === 0) throw e;
  } finally {
    if (timer) clearTimeout(timer);
    signal?.removeEventListener?.("abort", onAbort);
  }
  const elapsed = Math.max((performance.now() - start) / 1000, 0.001);
  return { mbps: (loaded * 8) / (elapsed * 1e6), bytes: loaded, timedOut };
}

function ensureStyles() {
  if (typeof document === "undefined" || document.getElementById(STYLE_ID)) return;
  const el = document.createElement("style");
  el.id = STYLE_ID;
  el.textContent = `
    /* In-flow banner: single class only, so a Plasmic layout/style class on the
       same element wins and the host controls width, margin and alignment. */
    .esw-banner {
      display: flex; align-items: center; gap: 10px;
      width: 100%; box-sizing: border-box;
      padding: 10px 12px 10px 14px;
      border: 1px solid var(--esw-border); border-radius: 14px;
      background: var(--esw-bg); color: var(--esw-fg);
      font: 500 14px/1.35 inherit; text-align: left; cursor: pointer;
      box-shadow: 0 2px 8px rgba(0,0,0,0.06);
      transition: transform .12s ease, box-shadow .12s ease;
    }
    .esw-banner:hover { box-shadow: 0 4px 14px rgba(0,0,0,0.10); }
    .esw-banner:active { transform: scale(0.995); }
    .esw-banner:focus-visible { outline: 2px solid var(--esw-accent); outline-offset: 2px; }
    .esw-icon {
      flex: 0 0 auto; display: flex; align-items: center; justify-content: center;
      width: 30px; height: 30px; border-radius: 9px;
      background: color-mix(in srgb, var(--esw-accent) 16%, transparent); color: var(--esw-accent);
    }
    .esw-body { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; }
    .esw-msg { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .esw-sub { font-size: 12px; font-weight: 500; opacity: 0.78; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .esw-num { font-variant-numeric: tabular-nums; }
    .esw-hint { flex: 0 0 auto; font-size: 12px; font-weight: 600; opacity: 0.7; white-space: nowrap; }
    .esw-spin { animation: esw-spin 1s linear infinite; }
    .esw-anim-enter { animation: esw-slide-in .28s cubic-bezier(.16,1,.3,1); }
    .esw-anim-exit  { animation: esw-slide-out .22s ease-in forwards; }
    @keyframes esw-spin { to { transform: rotate(360deg); } }
    @keyframes esw-slide-in  { from { opacity: 0; transform: translateY(-12px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes esw-slide-out { from { opacity: 1; transform: translateY(0); } to { opacity: 0; transform: translateY(-12px); } }
    @media (max-width: 480px) {
      .esw-banner { font-size: 13px; gap: 8px; padding: 9px 9px 9px 11px; border-radius: 12px; }
      .esw-icon { width: 26px; height: 26px; }
      .esw-hint { display: none; }
    }
    @media (prefers-reduced-motion: reduce) { .esw-anim-enter, .esw-anim-exit, .esw-spin { animation: none; } }
  `;
  document.head.appendChild(el);
}

export default function NetworkBanner({
  showWhenFast = false,
  forceShow = false,          // editor-only preview (Plasmic Studio)
  demoSeverity,               // "red" | "orange" | "yellow" | "green"
  className,
  style,
}) {
  const [mounted, setMounted] = React.useState(false);
  const [status, setStatus] = React.useState(null);          // [severity, message] | null
  const [leaving, setLeaving] = React.useState(false);
  const [test, setTest] = React.useState(null);              // { running, mbps, done } | null

  const mountedRef = React.useRef(true);
  const connRef = React.useRef(null);
  const timerRef = React.useRef(null);
  const probeCtrlRef = React.useRef(null);
  const testingRef = React.useRef(false);
  const lastShownRef = React.useRef(null);
  const slowStreakRef = React.useRef(0);     // consecutive "slow" readings (confirmation gate)
  const slowStepRef = React.useRef(0);       // recovery-recheck backoff step while slow
  const autoCloseRef = React.useRef(null);
  const kickRef = React.useRef(null);        // lets the manual test restart the loop at once

  const isPreview = Boolean(demoSeverity || forceShow);

  // ---- background detection loop -------------------------------------------
  React.useEffect(() => {
    if (isPreview) return;          // canvas preview: skip live probing
    mountedRef.current = true;
    ensureStyles();
    setMounted(true);
    connRef.current =
      (typeof navigator !== "undefined" &&
        (navigator.connection || navigator.mozConnection || navigator.webkitConnection)) ||
      null;

    const scheduleNext = (ms) => {
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(runCheck, ms);
    };

    // Recovery cadence while slow/offline: 1.5s, 3s, 6s, then 10s forever. The first
    // couple of checks are quick so a line that comes good closes the banner almost
    // at once; the backoff stops us hogging a link the app still needs.
    const scheduleRecheck = () => {
      const ms = Math.min(SLOW_INTERVAL_MIN * 2 ** slowStepRef.current, SLOW_INTERVAL_MAX);
      slowStepRef.current += 1;
      scheduleNext(ms);
    };

    const applyStatus = (next) => {
      if (!mountedRef.current) return;
      setStatus(next);
    };

    async function runCheck() {
      if (!mountedRef.current) return;
      // Don't probe while a manual test runs, or while the tab is hidden.
      if (testingRef.current) return scheduleNext(SLOW_INTERVAL_MIN);
      if (typeof document !== "undefined" && document.hidden) return scheduleNext(GOOD_INTERVAL);

      if (typeof navigator !== "undefined" && !navigator.onLine) {
        applyStatus(["red", "You are offline."]);
        return scheduleRecheck();
      }

      probeCtrlRef.current?.abort();
      const ctrl = new AbortController();
      probeCtrlRef.current = ctrl;

      let next;
      try {
        const reading = await measureMbps({
          bytes: PROBE_BYTES,
          signal: ctrl.signal,
          timeoutMs: PROBE_TIME_CAP,
        });
        // Aborted, but NOT by our own time cap -> a newer probe or a tap-to-test cut
        // this one short. Its partial bytes are not a speed measurement (they'd read
        // artificially low and flash a false "slow"), so drop the reading. Still
        // reschedule, or the loop would die with nothing pending.
        if (ctrl.signal.aborted && !reading.timedOut) return scheduleNext(SLOW_INTERVAL_MIN);
        next = readingToStatus(reading);
      } catch {
        // Probe blocked/failed (not a speed signal). Only escalate on the cheap 2g hint;
        // never treat a plain failure or a "3g" guess as slow — that was the original bug.
        const et = connRef.current?.effectiveType;
        next = et === "2g" || et === "slow-2g"
          ? ["red", "Very slow connection. The app may struggle."]
          : ["green", "Connected."];
      }
      if (!mountedRef.current) return;

      // Confirmation gate: a SINGLE slow reading is not trusted — the first probe
      // often runs while the page is still loading (contention + TCP warm-up) and
      // reads artificially low. Require two slow readings in a row before showing,
      // and re-probe quickly to confirm. A good reading clears the streak and hides.
      if (next[0] === "green") {
        slowStreakRef.current = 0;
        slowStepRef.current = 0;             // back to good -> reset the recovery backoff
        applyStatus(next);
        scheduleNext(GOOD_INTERVAL);
      } else {
        slowStreakRef.current += 1;
        if (slowStreakRef.current >= 2) {
          applyStatus(next);                 // confirmed slow -> show
          scheduleRecheck();                 // ...and start watching for recovery
        } else {
          scheduleNext(CONFIRM_DELAY);       // first slow reading -> stay hidden, re-check soon
        }
      }
    }

    // Any explicit signal (came online, went offline, tab refocused) is a reason to
    // measure NOW and to restart the recovery cadence from its quickest step.
    const kick = () => { clearTimeout(timerRef.current); slowStepRef.current = 0; runCheck(); };
    const onVisible = () => { if (!document.hidden) kick(); };
    kickRef.current = kick;                  // runFullTest() uses this to resume instantly

    // Only a token delay before the first probe — just enough to let the mount settle.
    // It DOES now measure while the app is still loading, so a busy boot can read low;
    // the two-reading confirmation gate absorbs most of that, and anything that slips
    // through clears itself on the next recheck ~1.5s later.
    timerRef.current = setTimeout(runCheck, FIRST_PROBE_DELAY);
    window.addEventListener("online", kick);
    window.addEventListener("offline", kick);
    connRef.current?.addEventListener?.("change", kick);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      mountedRef.current = false;
      clearTimeout(timerRef.current);
      clearTimeout(autoCloseRef.current);
      probeCtrlRef.current?.abort();
      window.removeEventListener("online", kick);
      window.removeEventListener("offline", kick);
      connRef.current?.removeEventListener?.("change", kick);
      document.removeEventListener("visibilitychange", onVisible);
      kickRef.current = null;
    };
  }, [isPreview]);

  // ---- manual, fast.com-style speed test (on click) ------------------------
  const runFullTest = React.useCallback(async () => {
    if (testingRef.current || isPreview) return;
    testingRef.current = true;
    probeCtrlRef.current?.abort();            // stop any background probe first
    clearTimeout(autoCloseRef.current);
    setLeaving(false);
    setTest({ running: true, mbps: 0, done: false });

    let reading = { mbps: 0, bytes: 0, timedOut: false };
    let lastPaint = 0;                        // throttle live repaints during the test
    try {
      reading = await measureMbps({
        bytes: FULL_BYTES,
        timeoutMs: FULL_TIME_CAP,
        onProgress: (m) => {
          const now = performance.now();
          if (mountedRef.current && now - lastPaint >= PAINT_THROTTLE) {
            lastPaint = now;
            setTest({ running: true, mbps: m, done: false });
          }
        },
      });
    } catch {
      reading = { mbps: 0, bytes: 0, timedOut: false };
    }
    testingRef.current = false;
    if (!mountedRef.current) return;
    const result = readingToStatus(reading);
    const good = result[0] === "green";
    setTest({ running: false, mbps: reading.mbps, done: true });
    setStatus(result);                        // reflect the real result
    slowStreakRef.current = good ? 0 : 2;     // keep the background gate in sync with reality
    slowStepRef.current = 0;                  // and re-check quickly from here
    // Show the result briefly, then drop back to the live status: if the line is now
    // fast the banner closes itself; if it's still slow the normal slow banner remains.
    // Kicking the loop here matters — without it a tap made while the loop was asleep
    // on GOOD_INTERVAL would leave the next recovery check up to 2 min away, so a
    // banner would sit there long after the line came good.
    autoCloseRef.current = setTimeout(() => {
      if (!mountedRef.current) return;
      setTest(null);
      kickRef.current?.();
    }, AUTO_CLOSE_DELAY);
  }, [isPreview]);

  // ---- derive what to render -----------------------------------------------
  let severity, message;
  if (isPreview) {
    severity = demoSeverity || "yellow";
    message = PREVIEW[severity] || "Network status preview.";
  } else if (status) {
    [severity, message] = status;
  }

  const testing = Boolean(test && (test.running || test.done));
  const statusWantsShow =
    Boolean(severity) && !(severity === "green" && !showWhenFast);
  const shouldShow = isPreview || statusWantsShow || testing;

  if (shouldShow && severity) lastShownRef.current = [severity, message];

  // Toggle the slide-out when we go from shown -> hidden (or cancel it on re-show).
  // NOTE: this MUST NOT depend on `leaving`, or it would re-run the instant it sets
  // `leaving`, and its own cleanup would cancel the unmount timer below — leaving the
  // banner stuck in the DOM at opacity 0 ("invisible but still there").
  React.useEffect(() => {
    if (isPreview) return;
    if (shouldShow) { setLeaving(false); return; }
    if (lastShownRef.current) setLeaving(true);
  }, [shouldShow, isPreview]);

  // Once the slide-out has played, fully unmount by clearing the remembered state.
  React.useEffect(() => {
    if (!leaving) return;
    const t = setTimeout(() => {
      if (!mountedRef.current) return;
      setLeaving(false);
      lastShownRef.current = null;
    }, 240);
    return () => clearTimeout(t);
  }, [leaving]);

  if (!mounted && !isPreview) return null;            // SSR / pre-mount: render nothing
  ensureStyles();

  const [sev, msg] = shouldShow ? [severity, message] : (lastShownRef.current || []);
  const hasContent = (shouldShow || leaving) && Boolean(sev || testing);
  if (!hasContent) return null;

  // While testing, theme/icon follow the live measurement.
  const liveSev = testing ? mbpsToStatus(test.mbps || 0)[0] : sev;
  const c = THEME[(testing ? liveSev : sev)] || THEME.yellow;
  const Icon = test?.running ? Activity : c.Icon;

  let title, sub;
  if (test?.running) {
    title = "Testing your connection…";
    sub = `${fmtMbps(test.mbps)} Mbps`;
  } else if (test?.done) {
    title = "Your connection";
    const verdict = test.mbps >= YELLOW_BELOW ? "looks good" : test.mbps >= RED_BELOW ? "is a bit slow" : "is very slow";
    sub = `${fmtMbps(test.mbps)} Mbps · ${verdict}`;
  } else {
    title = msg;
  }

  // Rendered in place, as a single in-flow element. Nothing to say -> `null` above,
  // so the component contributes no box, no height and no margin to the layout.
  return (
    <div
      role="button"
      tabIndex={0}
      aria-live="polite"
      title="Click to run a speed test"
      onClick={() => { if (!test?.running) runFullTest(); }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); if (!test?.running) runFullTest(); }
      }}
      className={`esw-banner ${leaving ? "esw-anim-exit" : "esw-anim-enter"}${className ? ` ${className}` : ""}`}
      style={{ "--esw-bg": c.bg, "--esw-fg": c.fg, "--esw-border": c.border, "--esw-accent": c.accent, ...style }}
    >
      <span className="esw-icon">
        <Icon size={18} strokeWidth={2.25} className={test?.running ? "esw-spin" : undefined} />
      </span>
      <span className="esw-body">
        <span className="esw-msg">{title}</span>
        {sub ? <span className="esw-sub esw-num">{sub}</span> : null}
      </span>
      {!testing ? <span className="esw-hint" aria-hidden="true">Tap to test</span> : null}
    </div>
  );
}