import { useCallback, useEffect, useRef } from "react";

/**
 * Keeps a rolling buffer of console errors/warnings and uncaught failures, so a
 * bug report can carry what the browser actually said instead of "it showed 0".
 *
 * Coverage starts when the hook mounts. Anything thrown before that — during
 * the very first render, or by a script that ran earlier — is missed. Mount the
 * host component high on the page and that gap is small; it is not zero.
 */

const LOG_LIMIT = 60; // rolling window: the newest 60 entries survive
const TEXT_MAX = 400; // per entry, before the payload cap bites
const PAYLOAD_MAX = 12_000; // total chars sent to ERP

function formatArg(arg) {
  if (arg instanceof Error) {
    const firstFrame = String(arg.stack || "").split("\n")[1];
    return `${arg.name}: ${arg.message}${firstFrame ? ` @${firstFrame.trim()}` : ""}`;
  }
  if (typeof arg === "string") return arg;
  if (arg === null) return "null";
  if (arg === undefined) return "undefined";
  try {
    return JSON.stringify(arg);
  } catch {
    // Circular structures are common in React/DOM objects.
    return String(arg);
  }
}

const formatArgs = (args) => args.map(formatArg).join(" ");

export function useConsoleCapture(enabled) {
  const buffer = useRef([]);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return undefined;

    const push = (level, text) => {
      buffer.current.push({
        level,
        at: new Date().toISOString(),
        text: String(text).slice(0, TEXT_MAX),
      });
      if (buffer.current.length > LOG_LIMIT) buffer.current.shift();
    };

    // Wrap rather than replace, so the real console still shows everything —
    // this must never make the app harder to debug in devtools.
    const originals = {};
    for (const level of ["error", "warn"]) {
      originals[level] = console[level];
      console[level] = (...args) => {
        try {
          push(level, formatArgs(args));
        } catch {
          /* capture must never break the app it is observing */
        }
        originals[level].apply(console, args);
      };
    }

    const onError = (event) =>
      push(
        "uncaught",
        `${event.message}${event.filename ? ` @${event.filename}:${event.lineno}` : ""}`
      );
    const onRejection = (event) =>
      push("unhandled-rejection", formatArg(event.reason));

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);

    return () => {
      for (const level of Object.keys(originals)) console[level] = originals[level];
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, [enabled]);

  /** Snapshot for submission: the logs plus the context that explains them. */
  const collect = useCallback(() => {
    if (typeof window === "undefined") return null;

    let logs = buffer.current.slice();

    // Drop oldest until the payload fits. Newest entries are the ones that
    // matter — they're what was on screen when the person hit report.
    while (logs.length && JSON.stringify(logs).length > PAYLOAD_MAX) logs.shift();

    return {
      url: window.location?.href || "",
      userAgent: navigator?.userAgent || "",
      viewport: `${window.innerWidth}×${window.innerHeight}`,
      online: navigator?.onLine !== false,
      at: new Date().toISOString(),
      logs,
    };
  }, []);

  return collect;
}
