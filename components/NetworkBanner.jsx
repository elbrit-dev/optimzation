import React from "react";
import { Wifi, WifiOff, SignalLow, SignalMedium } from "lucide-react";

/**
 * NetworkBanner — React/Next.js port of the Frappe "NetworkWatcher" client script.
 *
 * Watches the browser connection (navigator.connection) plus the online/offline
 * events and shows a corner toast whenever the network is degraded. Because the
 * toast is `position: fixed`, it floats over the page and never occupies layout
 * space. It mounts/unmounts itself automatically with a smooth slide animation,
 * and is fully responsive (full-width toast on small screens).
 *
 * Registered in Plasmic Studio (see plasmic-init.js), so it can be dragged onto a
 * page. Editor-only props (forceShow / demoSeverity) let designers preview it on
 * the canvas, where the real network is always "fast".
 */

const STYLE_ID = "esw-network-banner-styles";

const PALETTE = {
  red:    { bg: "#fde8e8", fg: "#9b1c1c", border: "#f8b4b4", accent: "#e02424" },
  orange: { bg: "#feecdc", fg: "#9a4a07", border: "#fdba8c", accent: "#ff5a1f" },
  yellow: { bg: "#fdf6b2", fg: "#8e6a00", border: "#fce96a", accent: "#c27803" },
  green:  { bg: "#def7ec", fg: "#03543f", border: "#84e1bc", accent: "#0e9f6e" },
};

const ICONS = {
  red: WifiOff,
  orange: SignalLow,
  yellow: SignalMedium,
  green: Wifi,
};

// Returns [severityKey, humanMessage] for the current connection.
function getStatus(conn) {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return ["red", "You are offline."];
  }
  if (!conn) {
    // Browser without the Network Information API (Safari/Firefox).
    return ["green", "Connected."];
  }

  const mbps = Math.round((conn.downlink ?? 0) * 10) / 10;

  if (["2g", "slow-2g"].includes(conn.effectiveType)) {
    return ["red", `Very slow 2G connection (${mbps} Mbps). The app may struggle.`];
  }
  if (mbps >= 5)   return ["green",  `Fast connection (${mbps} Mbps).`];
  if (mbps >= 1.8) return ["yellow", `Slow connection (${mbps} Mbps).`];
  return ["orange", `Very slow network (${mbps} Mbps). Things may load slowly.`];
}

// Inject the keyframes/media-query CSS once (inline styles can't do either).
function ensureStyles() {
  if (typeof document === "undefined" || document.getElementById(STYLE_ID)) return;
  const el = document.createElement("style");
  el.id = STYLE_ID;
  el.textContent = `
    /* Toast: fixed to a corner, floats over the page, takes no layout space. */
    .esw-banner-wrap {
      position: fixed; z-index: 9999;
      display: flex; padding: 16px; pointer-events: none;
    }
    .esw-banner-wrap[data-pos="top"]    { top: 0; right: 0; }
    .esw-banner-wrap[data-pos="bottom"] { bottom: 0; right: 0; }
    .esw-banner {
      pointer-events: auto;
      display: flex; align-items: center; gap: 10px;
      width: auto; max-width: min(380px, calc(100vw - 32px));
      padding: 10px 14px;
      border: 1px solid var(--esw-border);
      border-radius: 12px;
      background: var(--esw-bg); color: var(--esw-fg);
      box-shadow: 0 6px 20px rgba(0,0,0,0.08);
      font-size: 14px; font-weight: 500; line-height: 1.35;
      font-family: inherit;
      cursor: pointer;
      transition: transform .12s ease, box-shadow .12s ease;
    }
    .esw-banner:hover { box-shadow: 0 8px 24px rgba(0,0,0,0.12); }
    .esw-banner:active { transform: scale(0.99); }
    .esw-banner:focus-visible {
      outline: 2px solid var(--esw-accent); outline-offset: 2px;
    }
    .esw-banner-hint {
      flex: 0 0 auto; font-size: 12px; font-weight: 600; opacity: 0.75;
      white-space: nowrap;
    }
    .esw-banner-icon {
      flex: 0 0 auto; display: flex; align-items: center; justify-content: center;
      width: 28px; height: 28px; border-radius: 8px;
      background: color-mix(in srgb, var(--esw-accent) 16%, transparent);
      color: var(--esw-accent);
    }
    .esw-banner-msg { flex: 1 1 auto; min-width: 0; }
    .esw-anim-enter { animation: esw-slide-in .28s cubic-bezier(.16,1,.3,1); }
    .esw-anim-exit  { animation: esw-slide-out .22s ease-in forwards; }
    @keyframes esw-slide-in {
      from { opacity: 0; transform: translateX(16px); }
      to   { opacity: 1; transform: translateX(0); }
    }
    @keyframes esw-slide-out {
      from { opacity: 1; transform: translateX(0); }
      to   { opacity: 0; transform: translateX(16px); }
    }
    @media (max-width: 480px) {
      /* Full-width toast on small screens. */
      .esw-banner-wrap { left: 0; right: 0; padding: 8px; }
      .esw-banner {
        width: 100%; max-width: none;
        font-size: 13px; gap: 8px; padding: 9px 11px; border-radius: 10px;
      }
      .esw-banner-icon { width: 24px; height: 24px; }
    }
    @media (prefers-reduced-motion: reduce) {
      .esw-anim-enter, .esw-anim-exit { animation: none; }
    }
  `;
  document.head.appendChild(el);
}

export default function NetworkBanner({
  position = "top",
  showWhenFast = false,
  // Editor-only previews (used by Plasmic Studio; ignored at runtime logic):
  forceShow = false,
  demoSeverity, // "red" | "orange" | "yellow" | "green"
  // Forwarded by Plasmic Studio so the component can be styled/sized from the editor.
  className,
  style,
}) {
  const [state, setState] = React.useState(null);   // [severity, message] | null
  const [leaving, setLeaving] = React.useState(false);
  const connRef = React.useRef(null); // live connection object, used by the click re-check

  React.useEffect(() => {
    ensureStyles();
    const conn =
      navigator.connection ||
      navigator.mozConnection ||
      navigator.webkitConnection ||
      null;
    connRef.current = conn;

    const update = () => {
      if (document.hidden) return;
      setState(getStatus(conn));
    };

    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    conn?.addEventListener?.("change", update);
    document.addEventListener("visibilitychange", update);
    // Re-check every 3 seconds in case the speed drifts without firing an event.
    const poll = setInterval(update, 3000);

    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
      conn?.removeEventListener?.("change", update);
      document.removeEventListener("visibilitychange", update);
      clearInterval(poll);
    };
  }, []);

  // Decide what to display. Editor previews win so designers can see it.
  const isPreview = Boolean(demoSeverity || forceShow);

  // Re-check the network on demand (banner click / keyboard activation).
  // Reads the live connection state again; if it's now stable the banner stops
  // showing and unmounts to null, freeing the space it occupied.
  const recheck = React.useCallback(() => {
    if (isPreview) return;
    setLeaving(false); // cancel any in-flight exit so the fresh state wins
    setState(getStatus(connRef.current));
  }, [isPreview]);

  let severity, message;
  if (isPreview) {
    severity = demoSeverity || "orange";
    message = PREVIEW_TEXT[severity] || "Network status preview.";
  } else if (state) {
    [severity, message] = state;
  }
  const shouldShow =
    isPreview ||
    (Boolean(severity) && !(severity === "green" && !showWhenFast));

  // Remember the last content that was actually shown, so the exit animation
  // slides out *that* (e.g. the "offline" bar) rather than flashing the new
  // "green/recovered" state on its way out.
  const lastShownRef = React.useRef(null);
  if (shouldShow && severity) lastShownRef.current = [severity, message];

  // Keep mounted briefly to play the exit animation.
  React.useEffect(() => {
    if (!shouldShow && lastShownRef.current && !leaving && !isPreview) {
      setLeaving(true);
      const t = setTimeout(() => {
        setLeaving(false);
        lastShownRef.current = null;
      }, 220);
      return () => clearTimeout(t);
    }
  }, [shouldShow, leaving, isPreview]);

  ensureStyles();

  // When the network is good (nothing to show and no exit animation running) the
  // root element is collapsed with `display: none` so it is fully removed from the
  // layout — it occupies zero space rather than just being visually hidden.
  const visible = shouldShow || leaving;
  const [sev, msg] = shouldShow ? [severity, message] : (lastShownRef.current || []);
  const hasContent = visible && Boolean(sev);

  const c = PALETTE[sev] || PALETTE.green;
  const Icon = ICONS[sev] || Wifi;

  return (
    <div
      className={`esw-banner-wrap${className ? ` ${className}` : ""}`}
      data-pos={position}
      aria-hidden={hasContent ? undefined : "true"}
      style={{ ...style, ...(hasContent ? null : { display: "none" }) }}
    >
      {hasContent && (
        <div
          role="button"
          tabIndex={0}
          aria-live="polite"
          title="Click to re-check your connection"
          onClick={recheck}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              recheck();
            }
          }}
          className={`esw-banner ${leaving ? "esw-anim-exit" : "esw-anim-enter"}`}
          style={{
            "--esw-bg": c.bg,
            "--esw-fg": c.fg,
            "--esw-border": c.border,
            "--esw-accent": c.accent,
          }}
        >
          <span className="esw-banner-icon">
            <Icon size={18} strokeWidth={2.25} />
          </span>
          <span className="esw-banner-msg">{msg}</span>
          <span className="esw-banner-hint" aria-hidden="true">Tap to retry</span>
        </div>
      )}
    </div>
  );
}

const PREVIEW_TEXT = {
  red: "You are offline.",
  orange: "Very slow network (0.9 Mbps). Things may load slowly.",
  yellow: "Slow connection (2.4 Mbps).",
  green: "Fast connection (12 Mbps).",
};
