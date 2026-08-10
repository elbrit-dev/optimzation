import { useCallback, useEffect } from "react";

/**
 * Keeps a rolling buffer of what the browser actually said, so a bug report can
 * carry the failure instead of "it showed 0".
 *
 * Wrapping console.error/warn — the obvious thing — caught almost nothing in
 * practice, because the failures worth reporting don't arrive that way:
 *
 *   console.group + log   Our GraphQL failures are reported as a console GROUP
 *                         of plain logs (share/src/lib/graphqlErrorReport.js).
 *                         "You don't have access to Report: Sales Summary" is a
 *                         console.log inside a console.group, so a capture that
 *                         only wrapped error/warn saw none of it.
 *
 *                         Grouped output is deliberate, structured reporting,
 *                         unlike loose logging — so it is captured, under one
 *                         rule: what a group SHOWS is kept, what a
 *                         groupCollapsed HIDES (query text, raw response
 *                         bodies) is not. The ticket then reads like the
 *                         console does at a glance, without the payloads.
 *
 *   fetch                 "POST /api/method/graphql 400 (Bad Request)" is
 *                         printed by the browser itself, not by console.*, so
 *                         no amount of console wrapping can ever see it. Only
 *                         the status line is recorded — the body is left
 *                         untouched, since graphqlErrorReport already logs the
 *                         message out of it.
 *
 * Capture is a module-level singleton that starts on the first call and never
 * uninstalls: it has to outlive the report form being unmounted, and restoring
 * a console that something else has since re-wrapped is how you lose logs.
 *
 * Start it at app boot (pages/_app.jsx) — the failures people report happen
 * while the page is loading, long before anyone opens the report form, so
 * installing on the form's own mount would miss exactly the errors that
 * prompted the report.
 */

const LOG_LIMIT = 120; // rolling window: the newest 120 entries survive
const TEXT_MAX = 400; // per entry, before the payload cap bites
const PAYLOAD_MAX = 20_000; // total chars sent to ERP
const INDENT_MAX = 6; // nesting past this reads as noise, not structure

const buffer = [];

let installed = false;
let depth = 0; // open console groups
let hiddenFrom = 0; // depth of the outermost COLLAPSED group, 0 when none
let inOriginal = false; // inside a real console method — see wrap()

/** Wall-clock only — the date is already on the ticket, and ISO stamps here cost
 *  more width than they earn when there are eighty lines of them. */
const clockTime = () => new Date().toTimeString().slice(0, 8);

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

function push(level, text) {
  const indent = "  ".repeat(Math.min(depth, INDENT_MAX));
  const entry = `${indent}${text}`.slice(0, TEXT_MAX);

  // A render loop firing the same error 200 times should cost one line, not
  // the whole buffer — devtools collapses these the same way.
  const last = buffer[buffer.length - 1];
  if (last && last.level === level && last.text === entry) {
    last.repeats = (last.repeats || 1) + 1;
    last.at = clockTime();
    return;
  }

  buffer.push({ level, at: clockTime(), text: entry });
  if (buffer.length > LOG_LIMIT) buffer.shift();
}

/**
 * Console groups are opened and closed within one synchronous block, so any
 * group still open once the task ends was never closed — usually a throw
 * between group() and groupEnd(). Left alone that would strand `depth` above
 * zero and turn every later console.log into a captured line.
 */
function scheduleGroupReset() {
  setTimeout(() => {
    depth = 0;
    hiddenFrom = 0;
  }, 0);
}

function patchConsole() {
  const original = {};

  // Wrap rather than replace, so the real console still shows everything —
  // this must never make the app harder to debug in devtools.
  const wrap = (name, capture) => {
    original[name] = console[name];
    console[name] = (...args) => {
      try {
        // Some console methods are implemented in terms of the others —
        // console.group calls console.log internally — which would record the
        // group header a second time as a child of itself. Only the outermost
        // call is ours to capture.
        if (!inOriginal) capture(args);
      } catch {
        /* capture must never break the app it is observing */
      }

      const wasInOriginal = inOriginal;
      inOriginal = true;
      try {
        return original[name].apply(console, args);
      } finally {
        inOriginal = wasInOriginal;
      }
    };
  };

  for (const level of ["error", "warn"]) {
    // Always kept, collapsed group or not: an error is the point of the report.
    wrap(level, (args) => push(level, formatArgs(args)));
  }

  for (const level of ["log", "info"]) {
    // Loose logging is chatter; the same call inside a group is a deliberate
    // report. Keep only the latter, and only while the group is one the
    // developer chose to leave open.
    wrap(level, (args) => {
      if (depth > 0 && !hiddenFrom) push("log", formatArgs(args));
    });
  }

  for (const [name, collapsed] of [
    ["group", false],
    ["groupCollapsed", true],
  ]) {
    wrap(name, (args) => {
      // The header shows even when the group is collapsed, so it is always
      // worth keeping — it's the headline of the failure.
      if (!hiddenFrom) push("group", formatArgs(args));
      if (depth === 0) scheduleGroupReset();
      depth += 1;
      if (collapsed && !hiddenFrom) hiddenFrom = depth;
    });
  }

  wrap("groupEnd", () => {
    depth = Math.max(0, depth - 1);
    if (hiddenFrom && depth < hiddenFrom) hiddenFrom = 0;
  });
}

/**
 * The recorded URL ends up in an ERP ticket that other people read, so anything
 * that looks like a credential in the query string is masked. The rest of the
 * query is kept — which report, which filters — since that's usually the reason
 * the request failed.
 */
function redactUrl(raw) {
  const s = String(raw ?? "");
  const q = s.indexOf("?");
  if (q === -1) return s;

  const query = s
    .slice(q + 1)
    .replace(
      /([^&=]*(?:token|secret|password|api[-_]?key|auth|sid)[^&=]*)=[^&]*/gi,
      "$1=REDACTED"
    );
  return `${s.slice(0, q)}?${query}`;
}

function patchFetch() {
  const originalFetch = window.fetch;
  if (typeof originalFetch !== "function") return;

  window.fetch = function patchedFetch(input, init) {
    const method = String(init?.method || input?.method || "GET").toUpperCase();
    const url = redactUrl(
      typeof input === "string" ? input : input?.url || String(input ?? "")
    );

    // .call(window) not .call(this): fetch is routinely pulled off window and
    // called bare, and a detached `this` makes Chrome throw "Illegal invocation".
    return originalFetch.call(window, input, init).then(
      (res) => {
        // Failures only. A ticket listing every successful request buries the
        // one request that didn't work.
        if (res && !res.ok) {
          push("network", `${method} ${url} → ${res.status} ${res.statusText || ""}`.trim());
        }
        return res;
      },
      (err) => {
        // Aborts are routine — navigation, a cancelled effect — not failures.
        if (err?.name !== "AbortError") {
          push("network", `${method} ${url} → ${err?.message || "request failed"}`);
        }
        throw err;
      }
    );
  };
}

/**
 * Begins capture. Idempotent and permanent — call it as early as the app runs.
 */
export function startConsoleCapture() {
  if (installed || typeof window === "undefined") return;
  installed = true;

  patchConsole();
  patchFetch();

  window.addEventListener("error", (event) =>
    push(
      "uncaught",
      `${event.message}${event.filename ? ` @${event.filename}:${event.lineno}` : ""}`
    )
  );
  window.addEventListener("unhandledrejection", (event) =>
    push("unhandled-rejection", formatArg(event.reason))
  );
}

/** Everything captured so far, oldest first. */
export function getConsoleCapture() {
  return buffer.slice();
}

export function useConsoleCapture(enabled) {
  useEffect(() => {
    // Usually a no-op — _app.jsx has already started it. This is the fallback
    // for a page that renders the form without that wiring.
    if (enabled) startConsoleCapture();
  }, [enabled]);

  /** Snapshot for submission: the logs plus the context that explains them. */
  const collect = useCallback(() => {
    if (typeof window === "undefined") return null;

    const logs = buffer.map((entry) => ({
      level: entry.level,
      at: entry.at,
      text: entry.repeats > 1 ? `${entry.text}  (×${entry.repeats})` : entry.text,
    }));

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
