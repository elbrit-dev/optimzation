import React from "react";
import { createPortal } from "react-dom";
import { Wifi, WifiOff, SignalLow, SignalMedium, Activity, X } from "lucide-react";

/**
 * NetworkBanner — a floating overlay banner that warns when the connection is
 * genuinely slow or offline.
 *
 * Why this exists / what changed:
 *   The old version trusted `navigator.connection.effectiveType`. Chrome reports
 *   that as a coarse *estimate* derived from recently-observed RTT, and on an idle
 *   page it frequently reports "3g" even on a 300–500 Mbps LAN — producing a false
 *   "Slow connection" banner. We now MEASURE real throughput with a tiny background
 *   download probe (Cloudflare's public, CORS-enabled speed endpoint). A fast line
 *   measures fast and the banner never appears.
 *
 * Behaviour:
 *   - Renders into <body> via a portal as a `position: fixed` overlay at `top: 8vh`,
 *     high z-index, so it floats above everything and takes no layout space.
 *   - Auto-appears ONLY when a real measurement is slow (or the browser is offline).
 *   - Click the banner -> runs a full, fast.com-style speed test with a live Mbps
 *     readout (capped ~10s).
 *   - The X button fully dismisses it for the session; it re-appears only if the
 *     connection later degrades to a worse state (and resets once the line is good).
 */

const STYLE_ID = "esw-network-banner-styles";

// --- Measurement endpoint (Cloudflare's public speed test backend; CORS: *). ---
const PROBE_URL = "https://speed.cloudflare.com/__down";
const PROBE_BYTES = 500_000;     // background probe payload (~0.5 MB) — enough to classify
const PROBE_TIMEOUT = 12_000;    // ms before a background probe is abandoned
const GOOD_INTERVAL = 5 * 60_000;// re-probe every 5 min while the line is good
const SLOW_INTERVAL = 60_000;    // re-probe every 60s while slow/offline (catches recovery)
const FIRST_PROBE_DELAY = 1_500; // let the page finish loading before the very first probe
const CONFIRM_DELAY = 1_500;     // after one "slow" reading, re-probe fast to confirm before showing
const AUTO_CLOSE_DELAY = 2_500;  // after a manual test shows a good result, auto-dismiss
const FULL_BYTES = 100_000_000;  // manual test ceiling (~100 MB); time-cap bounds slow links
const FULL_TIME_CAP = 10_000;    // manual test runs at most ~10s

// Severity thresholds (Mbps). A 300 Mbps line measures far above these.
const RED_BELOW = 1.5;
const YELLOW_BELOW = 5;

const RANK = { green: 0, yellow: 1, orange: 2, red: 3 };

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
 * Stream a download from the speed endpoint and measure real throughput in Mbps.
 * Reports live progress via onProgress(mbps). Aborts on timeout (background) or
 * time-cap (manual test) and still returns the throughput observed so far.
 */
async function measureMbps({ bytes, onProgress, signal, timeoutMs }) {
  const ctrl = new AbortController();
  const onAbort = () => ctrl.abort();
  signal?.addEventListener?.("abort", onAbort);
  const timer = timeoutMs ? setTimeout(() => ctrl.abort(), timeoutMs) : null;

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
    // An abort (timeout / time-cap) is expected: fall through and use what we read.
    if (e.name !== "AbortError" && loaded === 0) throw e;
  } finally {
    if (timer) clearTimeout(timer);
    signal?.removeEventListener?.("abort", onAbort);
  }
  const elapsed = Math.max((performance.now() - start) / 1000, 0.001);
  return (loaded * 8) / (elapsed * 1e6);
}

function ensureStyles() {
  if (typeof document === "undefined" || document.getElementById(STYLE_ID)) return;
  const el = document.createElement("style");
  el.id = STYLE_ID;
  el.textContent = `
    .esw-portal {
      position: fixed; left: 0; right: 0; top: var(--esw-top, 8vh);
      z-index: var(--esw-z, 2000000000);
      display: flex; justify-content: center;
      padding: 0 12px; pointer-events: none;
    }
    /* Two-class selector (specificity 0,2,0) so a Plasmic layout class on the
       same element can't stretch the banner to full width. */
    .esw-portal .esw-banner {
      pointer-events: auto;
      display: flex; align-items: center; gap: 10px;
      width: 100%; max-width: min(560px, calc(100vw - 32px)); box-sizing: border-box;
      padding: 10px 12px 10px 14px;
      border: 1px solid var(--esw-border); border-radius: 14px;
      background: var(--esw-bg); color: var(--esw-fg);
      font: 500 14px/1.35 inherit; cursor: pointer;
      box-shadow: 0 10px 30px rgba(0,0,0,0.16), 0 2px 8px rgba(0,0,0,0.08);
      transition: transform .12s ease, box-shadow .12s ease;
    }
    .esw-banner:hover { box-shadow: 0 14px 38px rgba(0,0,0,0.20), 0 3px 10px rgba(0,0,0,0.10); }
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
    .esw-close {
      flex: 0 0 auto; display: flex; align-items: center; justify-content: center;
      width: 26px; height: 26px; padding: 0; margin-left: 2px;
      border: none; border-radius: 8px; cursor: pointer;
      background: transparent; color: inherit; opacity: 0.6;
      transition: background .12s ease, opacity .12s ease;
    }
    .esw-close:hover { opacity: 1; background: color-mix(in srgb, var(--esw-fg) 12%, transparent); }
    .esw-close:focus-visible { outline: 2px solid var(--esw-accent); outline-offset: 2px; }
    .esw-spin { animation: esw-spin 1s linear infinite; }
    .esw-anim-enter { animation: esw-slide-in .28s cubic-bezier(.16,1,.3,1); }
    .esw-anim-exit  { animation: esw-slide-out .22s ease-in forwards; }
    @keyframes esw-spin { to { transform: rotate(360deg); } }
    @keyframes esw-slide-in  { from { opacity: 0; transform: translateY(-12px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes esw-slide-out { from { opacity: 1; transform: translateY(0); } to { opacity: 0; transform: translateY(-12px); } }
    @media (max-width: 480px) {
      .esw-portal .esw-banner { font-size: 13px; gap: 8px; padding: 9px 9px 9px 11px; border-radius: 12px; }
      .esw-icon { width: 26px; height: 26px; }
      .esw-hint { display: none; }
    }
    @media (prefers-reduced-motion: reduce) { .esw-anim-enter, .esw-anim-exit, .esw-spin { animation: none; } }
  `;
  document.head.appendChild(el);
}

export default function NetworkBanner({
  showWhenFast = false,
  topOffset = "8vh",
  zIndex = 2000000000,
  forceShow = false,          // editor-only preview (Plasmic Studio)
  demoSeverity,               // "red" | "orange" | "yellow" | "green"
  className,
  style,
}) {
  const [mounted, setMounted] = React.useState(false);
  const [status, setStatus] = React.useState(null);          // [severity, message] | null
  const [leaving, setLeaving] = React.useState(false);
  const [dismissedRank, setDismissedRank] = React.useState(-1);
  const [test, setTest] = React.useState(null);              // { running, mbps, done } | null

  const mountedRef = React.useRef(true);
  const connRef = React.useRef(null);
  const timerRef = React.useRef(null);
  const probeCtrlRef = React.useRef(null);
  const testingRef = React.useRef(false);
  const lastShownRef = React.useRef(null);
  const slowStreakRef = React.useRef(0);     // consecutive "slow" readings (confirmation gate)
  const autoCloseRef = React.useRef(null);

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

    const applyStatus = (next) => {
      if (!mountedRef.current) return;
      setStatus(next);
      if (next && next[0] === "green") setDismissedRank(-1); // line recovered -> allow future warnings
    };

    async function runCheck() {
      if (!mountedRef.current) return;
      // Don't probe while a manual test runs, or while the tab is hidden.
      if (testingRef.current) return scheduleNext(SLOW_INTERVAL);
      if (typeof document !== "undefined" && document.hidden) return scheduleNext(GOOD_INTERVAL);

      if (typeof navigator !== "undefined" && !navigator.onLine) {
        applyStatus(["red", "You are offline."]);
        return scheduleNext(SLOW_INTERVAL);
      }

      probeCtrlRef.current?.abort();
      const ctrl = new AbortController();
      probeCtrlRef.current = ctrl;

      let next;
      try {
        const mbps = await measureMbps({ bytes: PROBE_BYTES, signal: ctrl.signal, timeoutMs: PROBE_TIMEOUT });
        next = mbpsToStatus(mbps);
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
        applyStatus(next);
        scheduleNext(GOOD_INTERVAL);
      } else {
        slowStreakRef.current += 1;
        if (slowStreakRef.current >= 2) {
          applyStatus(next);                 // confirmed slow -> show
          scheduleNext(SLOW_INTERVAL);
        } else {
          scheduleNext(CONFIRM_DELAY);       // first slow reading -> stay hidden, re-check soon
        }
      }
    }

    const kick = () => { clearTimeout(timerRef.current); runCheck(); };
    const onVisible = () => { if (!document.hidden) kick(); };

    // Delay the first probe so it doesn't compete with the app's initial load.
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

    let final = 0;
    let lastPaint = 0;                        // throttle live repaints to ~8/sec
    try {
      final = await measureMbps({
        bytes: FULL_BYTES,
        timeoutMs: FULL_TIME_CAP,
        onProgress: (m) => {
          const now = performance.now();
          if (mountedRef.current && now - lastPaint >= 120) {
            lastPaint = now;
            setTest({ running: true, mbps: m, done: false });
          }
        },
      });
    } catch {
      final = 0;
    }
    testingRef.current = false;
    if (!mountedRef.current) return;
    const result = mbpsToStatus(final);
    const good = result[0] === "green";
    setTest({ running: false, mbps: final, done: true });
    setStatus(result);                        // reflect the real result
    slowStreakRef.current = good ? 0 : 2;     // keep the background gate in sync with reality
    // If the connection is actually fine, show the result briefly then close itself.
    if (good) autoCloseRef.current = setTimeout(() => { if (mountedRef.current) setTest(null); }, AUTO_CLOSE_DELAY);
  }, [isPreview]);

  const handleClose = React.useCallback(
    (e) => {
      e?.stopPropagation?.();
      clearTimeout(autoCloseRef.current);
      setTest(null);
      testingRef.current = false;
      probeCtrlRef.current?.abort();
      const rank = lastShownRef.current ? RANK[lastShownRef.current[0]] ?? 0 : 0;
      setDismissedRank(rank);                 // hide this (and milder) states for the session
    },
    []
  );

  // ---- derive what to render -----------------------------------------------
  let severity, message;
  if (isPreview) {
    severity = demoSeverity || "yellow";
    message = PREVIEW[severity] || "Network status preview.";
  } else if (status) {
    [severity, message] = status;
  }

  const testing = Boolean(test && (test.running || test.done));
  const sevRank = severity ? RANK[severity] ?? 0 : -1;
  const statusWantsShow =
    Boolean(severity) &&
    !(severity === "green" && !showWhenFast) &&
    sevRank > dismissedRank;
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

  const banner = (
    <div
      className="esw-portal"
      aria-hidden={hasContent ? undefined : "true"}
      style={{ "--esw-top": topOffset, "--esw-z": zIndex }}
    >
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
        <button type="button" className="esw-close" aria-label="Dismiss" onClick={handleClose}>
          <X size={16} strokeWidth={2.5} />
        </button>
      </div>
    </div>
  );

  // Portal to <body> so the fixed overlay is never clipped by a parent's overflow
  // or transform, and floats above everything regardless of where it's placed.
  if (isPreview || typeof document === "undefined") return banner;
  return createPortal(banner, document.body);
}
