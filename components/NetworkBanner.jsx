import React from "react";
import { Wifi, WifiOff, SignalLow, SignalMedium } from "lucide-react";

/**
 * NetworkBanner — inline banner that warns when the browser connection is degraded.
 * Flows in normal document layout (full width of its container), auto-mounts with a
 * slide-down animation, and collapses to `display: none` when the connection is good.
 * Registered in Plasmic Studio; editor-only props (forceShow / demoSeverity) preview it.
 */

const STYLE_ID = "esw-network-banner-styles";

const THEME = {
  red:    { bg: "#fde8e8", fg: "#9b1c1c", border: "#f8b4b4", accent: "#e02424", Icon: WifiOff },
  orange: { bg: "#feecdc", fg: "#9a4a07", border: "#fdba8c", accent: "#ff5a1f", Icon: SignalLow },
  yellow: { bg: "#fdf6b2", fg: "#8e6a00", border: "#fce96a", accent: "#c27803", Icon: SignalMedium },
  green:  { bg: "#def7ec", fg: "#03543f", border: "#84e1bc", accent: "#0e9f6e", Icon: Wifi },
};

const PREVIEW = {
  red: "You are offline.",
  orange: "Very slow network (0.9 Mbps). Things may load slowly.",
  yellow: "Slow connection (2.4 Mbps).",
  green: "Fast connection (12 Mbps).",
};

// [severityKey, humanMessage] for the current connection.
// We deliberately ignore `downlink`: Chrome reports recently *observed* throughput
// (often 1–4 Mbps on an idle page) rather than real bandwidth, which produces false
// "slow network" banners on fast connections. `onLine` and `effectiveType` are stable.
function getStatus(conn) {
  if (typeof navigator !== "undefined" && !navigator.onLine) return ["red", "You are offline."];
  if (conn && ["2g", "slow-2g"].includes(conn.effectiveType))
    return ["red", "Very slow connection. The app may struggle."];
  if (conn && conn.effectiveType === "3g")
    return ["yellow", "Slow connection. Things may load slowly."];
  return ["green", "Connected."]; // 4g, or no Network Information API (Safari/Firefox)
}

// Inject the keyframes/media-query CSS once (inline styles can't do either).
function ensureStyles() {
  if (typeof document === "undefined" || document.getElementById(STYLE_ID)) return;
  const el = document.createElement("style");
  el.id = STYLE_ID;
  el.textContent = `
    .esw-banner-wrap { display: none; width: 100%; }
    .esw-banner {
      display: flex; align-items: center; gap: 10px;
      width: 100%; box-sizing: border-box; padding: 10px 14px;
      border: 1px solid var(--esw-border); border-radius: 12px;
      background: var(--esw-bg); color: var(--esw-fg);
      font: 500 14px/1.35 inherit; cursor: pointer;
      transition: transform .12s ease, box-shadow .12s ease;
    }
    .esw-banner:hover { box-shadow: 0 4px 14px rgba(0,0,0,0.08); }
    .esw-banner:active { transform: scale(0.99); }
    .esw-banner:focus-visible { outline: 2px solid var(--esw-accent); outline-offset: 2px; }
    .esw-banner-hint { flex: 0 0 auto; font-size: 12px; font-weight: 600; opacity: 0.75; white-space: nowrap; }
    .esw-banner-icon {
      flex: 0 0 auto; display: flex; align-items: center; justify-content: center;
      width: 28px; height: 28px; border-radius: 8px;
      background: color-mix(in srgb, var(--esw-accent) 16%, transparent); color: var(--esw-accent);
    }
    .esw-banner-msg { flex: 1 1 auto; min-width: 0; }
    .esw-anim-enter { animation: esw-slide-in .28s cubic-bezier(.16,1,.3,1); }
    .esw-anim-exit  { animation: esw-slide-out .22s ease-in forwards; }
    @keyframes esw-slide-in  { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes esw-slide-out { from { opacity: 1; transform: translateY(0); } to { opacity: 0; transform: translateY(-8px); } }
    @media (max-width: 480px) {
      .esw-banner { font-size: 13px; gap: 8px; padding: 9px 11px; border-radius: 10px; }
      .esw-banner-icon { width: 24px; height: 24px; }
    }
    @media (prefers-reduced-motion: reduce) { .esw-anim-enter, .esw-anim-exit { animation: none; } }
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
  const [state, setState] = React.useState(null);   // [severity, message] | null
  const [leaving, setLeaving] = React.useState(false);
  const connRef = React.useRef(null);
  const lastShownRef = React.useRef(null);

  React.useEffect(() => {
    ensureStyles();
    const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection || null;
    connRef.current = conn;
    const update = () => { if (!document.hidden) setState(getStatus(conn)); };
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    conn?.addEventListener?.("change", update);
    document.addEventListener("visibilitychange", update);
    const poll = setInterval(update, 3000); // catch silent speed drift
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
      conn?.removeEventListener?.("change", update);
      document.removeEventListener("visibilitychange", update);
      clearInterval(poll);
    };
  }, []);

  const isPreview = Boolean(demoSeverity || forceShow);

  // Re-check on click/keyboard; if the network recovered the banner unmounts.
  const recheck = React.useCallback(() => {
    if (isPreview) return;
    setLeaving(false); // cancel any in-flight exit so the fresh state wins
    setState(getStatus(connRef.current));
  }, [isPreview]);

  let severity, message;
  if (isPreview) {
    severity = demoSeverity || "orange";
    message = PREVIEW[severity] || "Network status preview.";
  } else if (state) {
    [severity, message] = state;
  }
  const shouldShow = isPreview || (Boolean(severity) && !(severity === "green" && !showWhenFast));

  // Remember the last shown content so the exit animation slides *it* out (not the recovered state).
  if (shouldShow && severity) lastShownRef.current = [severity, message];

  // Keep mounted briefly to play the exit animation.
  React.useEffect(() => {
    if (!shouldShow && lastShownRef.current && !leaving && !isPreview) {
      setLeaving(true);
      const t = setTimeout(() => { setLeaving(false); lastShownRef.current = null; }, 220);
      return () => clearTimeout(t);
    }
  }, [shouldShow, leaving, isPreview]);

  ensureStyles();

  // When idle, the root collapses with `display: none` so it occupies zero layout space.
  const [sev, msg] = shouldShow ? [severity, message] : (lastShownRef.current || []);
  const hasContent = (shouldShow || leaving) && Boolean(sev);
  const c = THEME[sev] || THEME.green;
  const Icon = c.Icon;

  // The whole wrapper is hidden with `display: none` when there's nothing to show,
  // so the entire banner (not just an inner part) is removed from layout. The inner
  // banner is always rendered; its slide-in animation replays each time the wrapper
  // goes from `display: none` back to visible.
  return (
    <div
      className={`esw-banner-wrap${className ? ` ${className}` : ""}`}
      aria-hidden={hasContent ? undefined : "true"}
      style={{ ...style, display: hasContent ? "block" : "none" }}
    >
      <div
        role="button"
        tabIndex={0}
        aria-live="polite"
        title="Click to re-check your connection"
        onClick={recheck}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); recheck(); } }}
        className={`esw-banner ${leaving ? "esw-anim-exit" : "esw-anim-enter"}`}
        style={{ "--esw-bg": c.bg, "--esw-fg": c.fg, "--esw-border": c.border, "--esw-accent": c.accent }}
      >
        <span className="esw-banner-icon"><Icon size={18} strokeWidth={2.25} /></span>
        <span className="esw-banner-msg">{msg}</span>
        <span className="esw-banner-hint" aria-hidden="true">Tap to retry</span>
      </div>
    </div>
  );
}
