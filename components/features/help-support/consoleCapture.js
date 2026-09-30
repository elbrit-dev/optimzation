// Buffers recent browser console errors/warnings so a Help Desk ticket can ship
// them to support. Installed once from pages/_app.jsx so errors raised on any
// page before the user opens the Raise ticket form are still available.

const MAX_ENTRIES = 50;
const MAX_MESSAGE_LENGTH = 2000;
// sessionStorage survives reloads (mobile browsers often reload backgrounded
// tabs, and pull-to-refresh) but is cleared when the tab is closed.
const STORAGE_KEY = "hd-console-capture";
const SAVE_DELAY_MS = 300;

const entries = [];
let installed = false;
let saveTimer = null;

function saveEntries() {
  saveTimer = null;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Private mode / quota exceeded - keep working from memory only.
  }
}

// Render loops can log hundreds of times a second, so writes are batched.
function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(saveEntries, SAVE_DELAY_MS);
}

function restoreEntries() {
  try {
    const stored = JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) || "[]");
    if (Array.isArray(stored)) entries.push(...stored.filter((entry) => entry?.message).slice(-MAX_ENTRIES));
  } catch {
    // Corrupt or unavailable storage - start empty.
  }
}

function stringifyArg(arg) {
  if (arg instanceof Error) return arg.stack || `${arg.name}: ${arg.message}`;
  if (typeof arg === "string") return arg;
  if (arg === undefined) return "undefined";
  try {
    const seen = new WeakSet();
    return JSON.stringify(arg, (_key, value) => {
      if (typeof value === "object" && value !== null) {
        if (seen.has(value)) return "[Circular]";
        seen.add(value);
      }
      return value;
    });
  } catch {
    return String(arg);
  }
}

function record(level, args) {
  let message = args.map(stringifyArg).join(" ");
  if (message.length > MAX_MESSAGE_LENGTH) message = `${message.slice(0, MAX_MESSAGE_LENGTH)}… [truncated]`;

  // Render loops log the same error dozens of times - collapse consecutive repeats.
  const last = entries[entries.length - 1];
  if (last && last.level === level && last.message === message) {
    last.count += 1;
    last.lastAt = new Date().toISOString();
  } else {
    entries.push({ level, message, count: 1, at: new Date().toISOString(), url: window.location.href });
    if (entries.length > MAX_ENTRIES) entries.shift();
  }
  scheduleSave();
}

export function installConsoleCapture() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  restoreEntries();

  // A pending batched write would be lost if the tab is backgrounded and then
  // discarded, so flush when the page is hidden.
  window.addEventListener("pagehide", () => saveTimer && saveEntries());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden" && saveTimer) saveEntries();
  });

  ["error", "warn"].forEach((level) => {
    const original = console[level];
    console[level] = (...args) => {
      try {
        record(level, args);
      } catch {
        // Capturing must never break the real console call.
      }
      return original.apply(console, args);
    };
  });

  window.addEventListener("error", (event) => {
    // Resource load failures (img/script 404s) fire on the element, not as ErrorEvent.
    if (!(event instanceof ErrorEvent)) {
      const target = event.target;
      const source = target?.src || target?.href;
      if (source) record("error", [`Failed to load resource: ${source}`]);
      return;
    }
    record("error", [
      event.error || event.message,
      event.filename ? `(${event.filename}:${event.lineno}:${event.colno})` : "",
    ]);
  }, true);

  window.addEventListener("unhandledrejection", (event) => {
    record("error", ["Unhandled promise rejection:", event.reason]);
  });
}

export function getCapturedConsoleEntries() {
  return entries.map((entry) => ({ ...entry }));
}

/** Called once a ticket has the log attached, so the next ticket starts fresh. */
export function clearCapturedConsoleEntries() {
  entries.length = 0;
  clearTimeout(saveTimer);
  saveTimer = null;
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to clear.
  }
}

export function formatConsoleEntries(list = entries) {
  const header = [
    `Captured: ${new Date().toISOString()}`,
    `Page: ${typeof window !== "undefined" ? window.location.href : ""}`,
    `User agent: ${typeof navigator !== "undefined" ? navigator.userAgent : ""}`,
    `Viewport: ${typeof window !== "undefined" ? `${window.innerWidth}x${window.innerHeight}` : ""}`,
    `Entries: ${list.length}`,
    "",
  ];
  const body = list.map((entry) => {
    const repeat = entry.count > 1 ? ` (x${entry.count}, last ${entry.lastAt})` : "";
    return `[${entry.at}] ${entry.level.toUpperCase()}${repeat}\n  at ${entry.url}\n${entry.message}\n`;
  });
  return [...header, ...body].join("\n");
}

/** Builds the .txt attachment uploaded alongside a new ticket. */
export function buildConsoleLogFile(list) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return new File([formatConsoleEntries(list)], `console-errors-${stamp}.txt`, { type: "text/plain" });
}
