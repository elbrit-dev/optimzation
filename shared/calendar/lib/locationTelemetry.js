import * as Sentry from "@sentry/nextjs";

/* ---------------------------------------------
   VISIT LOCATION TELEMETRY
--------------------------------------------- */
// Every visit location capture, good or bad, is sent to Sentry (project
// elbrit-one-app) as ONE event titled "Visit location: <outcome>". Events
// group by outcome, so the Issues list doubles as a tally: how many captures
// ended "good", "no_fix", "denied" ... and Discover can split them by the
// location.* tags below (rep, phone, network, attempt, duration).
//
// Reps reported "Capturing..." for 5-10 minutes while one attempt is capped
// at 45 s, so the events record what can stretch that: retries
// (location.attempt), the app being backgrounded (location.hidden), a slow
// permission check (permissionCheckMs), and a watchdog event if an attempt
// is still open after STUCK_MS.
//
// Good captures are "info"; everything else is "warning", and only warnings
// pull in a session replay (see beforeErrorSampling in
// instrumentation-client.js). With no Sentry DSN all of this is a no-op.

const SLOW_MS = 45000;
const STUCK_MS = 60000;
const SLOW_PERMISSION_MS = 2000;
const COARSE_M = 500;

const GOOD_OUTCOMES = new Set(["good", "usable", "already_set"]);

function durationBucket(ms) {
  if (ms < 10000) return "<10s";
  if (ms < 30000) return "10-30s";
  if (ms < 45000) return "30-45s";
  if (ms < 60000) return "45-60s";
  if (ms < 300000) return "1-5m";
  return "5m+";
}

function accuracyBucket(m) {
  if (m == null) return "none";
  if (m <= 30) return "<=30m";
  if (m <= 150) return "<=150m";
  if (m <= COARSE_M) return "<=500m";
  return ">500m";
}

function networkInfo() {
  const c = typeof navigator !== "undefined" ? navigator.connection : null;
  return {
    online: typeof navigator !== "undefined" ? navigator.onLine : null,
    effectiveType: c?.effectiveType ?? null,
    downlinkMbps: c?.downlink ?? null,
    rttMs: c?.rtt ?? null,
    saveData: c?.saveData ?? null,
  };
}

function isStandalone() {
  if (typeof window === "undefined") return null;
  return Boolean(
    window.matchMedia?.("(display-mode: standalone)")?.matches ||
      window.navigator?.standalone
  );
}

// One per capture attempt. The capture code calls permissionChecked(),
// fix(), positionError() and outcome() as things happen, then finish().
export function startLocationTrace({ platform, trigger, attempt, visit } = {}) {
  const startedAt = Date.now();
  let finished = false;
  let outcome = null;
  let permission = "unknown";
  let permissionCheckMs = null;
  let firstFixMs = null;
  let fixes = 0;
  let bestAccuracyM = null;
  const positionErrors = { 1: 0, 2: 0, 3: 0 };
  let hiddenMs = 0;
  let hiddenCount = 0;
  let hiddenSince =
    typeof document !== "undefined" && document.visibilityState === "hidden"
      ? Date.now()
      : null;
  let stuckReported = false;

  const onVisibility = () => {
    if (document.visibilityState === "hidden") {
      if (hiddenSince === null) {
        hiddenSince = Date.now();
        hiddenCount += 1;
      }
    } else if (hiddenSince !== null) {
      hiddenMs += Date.now() - hiddenSince;
      hiddenSince = null;
    }
  };

  const snapshot = (finalOutcome, extra = {}) => {
    const now = Date.now();
    const totalMs = now - startedAt;
    const hiddenTotal = hiddenMs + (hiddenSince !== null ? now - hiddenSince : 0);
    const net = networkInfo();
    const accuracyM = extra.accuracyM ?? bestAccuracyM;
    const attemptTag = attempt == null ? "unknown" : attempt >= 5 ? "5+" : String(attempt);

    // A quick "cancelled" is the form restarting its own capture on open, or
    // the rep closing it straight away; a long one is someone giving up.
    const quietCancel = finalOutcome === "cancelled" && totalMs < 10000;
    const negative =
      (!GOOD_OUTCOMES.has(finalOutcome) && !quietCancel) ||
      totalMs > SLOW_MS ||
      (accuracyM != null && accuracyM > COARSE_M) ||
      (permissionCheckMs != null && permissionCheckMs > SLOW_PERMISSION_MS) ||
      (attempt != null && attempt >= 3);

    return {
      level: negative ? "warning" : "info",
      fingerprint: ["visit-location", finalOutcome],
      tags: {
        "location.outcome": finalOutcome,
        "location.trigger": trigger ?? "unknown",
        "location.attempt": attemptTag,
        "location.permission": permission,
        "location.platform": platform ?? "unknown",
        "location.standalone": String(isStandalone()),
        "location.network": net.effectiveType ?? "unknown",
        "location.online": String(net.online),
        "location.hidden": hiddenTotal > 0 ? "yes" : "no",
        "location.duration": durationBucket(totalMs),
        "location.accuracy": accuracyBucket(accuracyM),
        "location.slow_permission": String(
          permissionCheckMs != null && permissionCheckMs > SLOW_PERMISSION_MS
        ),
        ...(visit ? { "location.visit": String(visit) } : {}),
      },
      contexts: {
        location_capture: {
          outcome: finalOutcome,
          totalMs,
          permission,
          permissionCheckMs,
          firstFixMs,
          fixes,
          bestAccuracyM,
          finalAccuracyM: extra.accuracyM ?? null,
          positionErrors,
          hiddenMs: hiddenTotal,
          hiddenCount,
          attempt,
          trigger,
          visit: visit ?? null,
          ...net,
          ...extra,
        },
      },
    };
  };

  // captureEvent, not captureMessage: captureMessage adds a synthetic stack
  // trace, and Sentry then titles the issue after its top frame ("y").
  const send = (title, finalOutcome, extra) => {
    try {
      Sentry.captureEvent({ message: title, ...snapshot(finalOutcome, extra) });
    } catch {
      // Telemetry must never break a visit.
    }
  };

  // Still open long after the 45 s cap means something outside the GPS watch
  // is holding it (permission check, a frozen page). Report it right away,
  // since the user may give up and close the app before it ends.
  const stuckTimer = setTimeout(() => {
    if (finished) return;
    stuckReported = true;
    send("Visit location: still capturing after 60 s", "stuck", { stage: outcome ?? "waiting" });
  }, STUCK_MS);

  // Closing the app or leaving the page mid-capture: the end is never seen.
  function onPageHide() {
    if (finished) return;
    finished = true;
    cleanup();
    send("Visit location: app closed while capturing", "abandoned");
  }

  function cleanup() {
    clearTimeout(stuckTimer);
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", onVisibility);
    }
    if (typeof window !== "undefined") {
      window.removeEventListener("pagehide", onPageHide);
    }
  }

  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", onVisibility);
  }
  if (typeof window !== "undefined") {
    window.addEventListener("pagehide", onPageHide);
  }

  return {
    permissionChecked(state) {
      permission = state ?? "unknown";
      permissionCheckMs = Date.now() - startedAt;
    },
    fix(pos) {
      fixes += 1;
      if (firstFixMs === null) firstFixMs = Date.now() - startedAt;
      const a = pos?.coords?.accuracy;
      if (a != null && (bestAccuracyM === null || a < bestAccuracyM)) {
        bestAccuracyM = Math.round(a);
      }
    },
    positionError(err) {
      if (err?.code in positionErrors) positionErrors[err.code] += 1;
    },
    // How the attempt ended, set where it ends; finish() reports it.
    outcome(value) {
      if (!outcome) outcome = value;
    },
    finish(extra = {}) {
      if (finished) return;
      finished = true;
      cleanup();
      const finalOutcome = outcome ?? "unknown";
      send(`Visit location: ${finalOutcome}`, finalOutcome, {
        ...extra,
        afterStuckReport: stuckReported,
      });
    },
  };
}
