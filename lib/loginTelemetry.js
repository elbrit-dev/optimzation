import * as Sentry from "@sentry/nextjs";

/* ---------------------------------------------
   LOGIN TELEMETRY
--------------------------------------------- */
// Every sign-in attempt on the login page is sent to Sentry (project
// elbrit-one-app) as ONE event titled "Login: <outcome>", the same way visit
// location captures are (shared/calendar/lib/locationTelemetry.js). Events
// group by outcome, so the Issues list is a tally: how many attempts ended
// "signed in", "auth/too-many-requests", "erp failed" ... and Discover splits
// them by the login.* tags below (phone, method, stage, network, attempt).
//
// Why: FirebaseUI shows phone errors (SMS blocked, quota, reCAPTCHA) inside its
// own widget and never hands them to our code, so a rep "stuck at login" left
// nothing in Sentry. instrumentAuth() wraps the Firebase Auth instance
// FirebaseUI signs in with, which sees every send-code and verify-code result
// with Firebase's own error code.
//
// An attempt starts when a code is sent (or the Google popup opens) and ends at
// the first of:
//   signed in        Firebase said yes, the ERP login ran and left a token
//   <firebase code>  sending or checking the code failed, e.g.
//                    auth/too-many-requests (number/device/IP throttled)
//   erp failed       Firebase said yes, the ERP login (Plasmic onSuccess) threw
//   no token         the ERP login finished but stored no token
//   abandoned        the page was closed mid-attempt
// A wrong code doesn't end it (the rep types again); the count rides along.
// If the code screen is still open after CODE_WAIT_MS with nothing entered,
// "Login: code not entered after 3 min" goes out at once: usually the SMS
// never arrived.
//
// "signed in" and the rep's own mistakes are "info"; everything else is
// "warning", and only warnings pull in a session replay (beforeErrorSampling
// in instrumentation-client.js). With no Sentry DSN all of this is a no-op.

const CODE_WAIT_MS = 3 * 60 * 1000;

// Ends the attempt, but the rep did it, not the system.
const INFO_CODES = new Set([
  "auth/invalid-phone-number",
  "auth/missing-phone-number",
  "auth/popup-closed-by-user",
  "auth/cancelled-popup-request",
  "auth/user-cancelled",
]);

// Don't end the attempt: the rep just types the code again.
const RETRY_CODES = new Set(["auth/invalid-verification-code", "auth/missing-verification-code"]);

let current = null;
let attempts = 0;

function durationBucket(ms) {
  if (ms < 10000) return "<10s";
  if (ms < 30000) return "10-30s";
  if (ms < 60000) return "30-60s";
  if (ms < 180000) return "1-3m";
  if (ms < 600000) return "3-10m";
  return "10m+";
}

function networkInfo() {
  const c = typeof navigator !== "undefined" ? navigator.connection : null;
  return {
    online: typeof navigator !== "undefined" ? navigator.onLine : null,
    effectiveType: c?.effectiveType ?? null,
    downlinkMbps: c?.downlink ?? null,
    rttMs: c?.rtt ?? null,
  };
}

function isStandalone() {
  if (typeof window === "undefined") return null;
  return Boolean(
    window.matchMedia?.("(display-mode: standalone)")?.matches ||
      window.navigator?.standalone
  );
}

function errorCode(error) {
  return error?.code || (error ? "error" : "unknown");
}

function errorMessage(error) {
  const text = error?.message ?? (error == null ? null : String(error));
  return text ? text.slice(0, 500) : null;
}

function onVisibility() {
  const a = current;
  if (!a) return;
  if (document.visibilityState === "hidden") {
    if (a.hiddenSince === null) {
      a.hiddenSince = Date.now();
      a.hiddenCount += 1;
    }
  } else if (a.hiddenSince !== null) {
    a.hiddenMs += Date.now() - a.hiddenSince;
    a.hiddenSince = null;
  }
}

// Closing the app or reloading mid-attempt: the end is never seen.
function onPageHide() {
  if (current) end("abandoned");
}

function listen(on) {
  if (typeof window === "undefined") return;
  const method = on ? "addEventListener" : "removeEventListener";
  document[method]("visibilitychange", onVisibility);
  window[method]("pagehide", onPageHide);
}

function begin(method, phone) {
  attempts += 1;
  current = {
    method,
    phone: phone || null,
    attempt: attempts,
    startedAt: Date.now(),
    stage: method === "phone" ? "send_code" : "popup",
    codesSent: 0,
    sendFailures: [],
    codeSentAt: null,
    wrongCodes: 0,
    firebaseOkAt: null,
    hiddenMs: 0,
    hiddenCount: 0,
    hiddenSince:
      typeof document !== "undefined" && document.visibilityState === "hidden" ? Date.now() : null,
    codeWaitTimer: null,
    codeWaitReported: false,
  };
  listen(true);
  return current;
}

function snapshot(a, outcome, level, extra = {}) {
  const now = Date.now();
  const totalMs = now - a.startedAt;
  const hiddenTotal = a.hiddenMs + (a.hiddenSince !== null ? now - a.hiddenSince : 0);
  const net = networkInfo();
  return {
    level,
    fingerprint: ["login", outcome],
    // Not signed in yet, so the scope has no user: the number they typed is the
    // only way to find them (user.username:+9198..., same as after sign-in).
    ...(a.phone ? { user: { username: a.phone } } : {}),
    tags: {
      "login.outcome": outcome,
      "login.method": a.method,
      "login.stage": a.stage,
      "login.attempt": a.attempt >= 5 ? "5+" : String(a.attempt),
      "login.codes_sent": a.codesSent >= 3 ? "3+" : String(a.codesSent),
      "login.wrong_codes": a.wrongCodes >= 3 ? "3+" : String(a.wrongCodes),
      "login.duration": durationBucket(totalMs),
      "login.network": net.effectiveType ?? "unknown",
      "login.online": String(net.online),
      "login.standalone": String(isStandalone()),
      "login.hidden": hiddenTotal > 0 ? "yes" : "no",
      ...(a.phone ? { "login.phone": a.phone } : {}),
    },
    contexts: {
      login_attempt: {
        outcome,
        method: a.method,
        stage: a.stage,
        attempt: a.attempt,
        totalMs,
        codesSent: a.codesSent,
        sendFailures: a.sendFailures,
        smsWaitMs: a.codeSentAt ? now - a.codeSentAt : null,
        wrongCodes: a.wrongCodes,
        erpMs: a.firebaseOkAt ? now - a.firebaseOkAt : null,
        hiddenMs: hiddenTotal,
        hiddenCount: a.hiddenCount,
        ...net,
        ...extra,
      },
    },
  };
}

// captureEvent, not captureMessage: captureMessage adds a synthetic stack
// trace, and Sentry then titles the issue after its top frame.
function send(title, a, outcome, level, extra) {
  try {
    Sentry.captureEvent({ message: title, ...snapshot(a, outcome, level, extra) });
  } catch {
    // Telemetry must never break a sign-in.
  }
}

function end(outcome, { level, extra } = {}) {
  const a = current;
  if (!a) return;
  current = null;
  clearTimeout(a.codeWaitTimer);
  listen(false);
  const lvl = level ?? (outcome === "signed in" || INFO_CODES.has(outcome) ? "info" : "warning");
  send(`Login: ${outcome}`, a, outcome, lvl, { ...extra, afterCodeWaitReport: a.codeWaitReported });
}

function armCodeWait(a) {
  clearTimeout(a.codeWaitTimer);
  a.codeWaitTimer = setTimeout(() => {
    if (current !== a || a.stage !== "enter_code") return;
    a.codeWaitReported = true;
    send("Login: code not entered after 3 min", a, "code not entered", "warning");
  }, CODE_WAIT_MS);
}

function trackConfirmation(a, confirmationResult) {
  const confirm = confirmationResult?.confirm;
  if (typeof confirm !== "function") return confirmationResult;
  confirmationResult.confirm = function (code) {
    if (current === a) a.stage = "verify_code";
    return confirm.call(this, code).then(
      (cred) => {
        if (current === a) {
          clearTimeout(a.codeWaitTimer);
          a.stage = "erp";
          a.firebaseOkAt = Date.now();
        }
        return cred;
      },
      (error) => {
        if (current === a) {
          const code = errorCode(error);
          if (RETRY_CODES.has(code)) {
            a.wrongCodes += 1;
            a.stage = "enter_code";
          } else {
            end(code, { extra: { message: errorMessage(error) } });
          }
        }
        throw error;
      }
    );
  };
  return confirmationResult;
}

/**
 * Wrap the Firebase Auth instance FirebaseUI signs in with (it calls these on
 * the very instance it was given). Once per instance; safe to call again.
 */
export function instrumentAuth(auth) {
  if (!auth || auth.__elbritLoginTelemetry) return;
  auth.__elbritLoginTelemetry = true;

  const signInWithPhoneNumber = auth.signInWithPhoneNumber;
  if (typeof signInWithPhoneNumber === "function") {
    auth.signInWithPhoneNumber = function (phoneNumber, verifier) {
      // "Resend" on the code screen is the same attempt.
      const a = current?.method === "phone" ? current : begin("phone", phoneNumber);
      if (phoneNumber) a.phone = phoneNumber;
      a.stage = "send_code";
      return signInWithPhoneNumber.call(this, phoneNumber, verifier).then(
        (result) => {
          if (current === a) {
            a.codesSent += 1;
            a.codeSentAt = Date.now();
            a.stage = "enter_code";
            armCodeWait(a);
          }
          return trackConfirmation(a, result);
        },
        (error) => {
          if (current === a) {
            const code = errorCode(error);
            a.sendFailures.push(code);
            end(code, { extra: { message: errorMessage(error) } });
          }
          throw error;
        }
      );
    };
  }

  const signInWithPopup = auth.signInWithPopup;
  if (typeof signInWithPopup === "function") {
    auth.signInWithPopup = function (provider) {
      if (current) end("abandoned", { extra: { replacedBy: "popup" } });
      const a = begin(provider?.providerId || "popup", null);
      return signInWithPopup.call(this, provider).then(
        (cred) => {
          if (current === a) {
            a.stage = "erp";
            a.firebaseOkAt = Date.now();
          }
          return cred;
        },
        (error) => {
          if (current === a) {
            const code = errorCode(error);
            end(code, {
              level: INFO_CODES.has(code) ? "info" : "warning",
              extra: { message: errorMessage(error) },
            });
          }
          throw error;
        }
      );
    };
  }
}

/** Firebase accepted the sign-in; the ERP login (host onSuccess) runs next. */
export function loginFirebaseOk(user) {
  const a = current ?? begin(user?.providerData?.[0]?.providerId || "unknown", user?.phoneNumber);
  clearTimeout(a.codeWaitTimer);
  a.stage = "erp";
  if (!a.firebaseOkAt) a.firebaseOkAt = Date.now();
  if (!a.phone && user?.phoneNumber) a.phone = user.phoneNumber;
}

/**
 * The ERP login finished: `error` if the host's onSuccess threw. The Plasmic
 * login page stores the ERP key as localStorage "token" before it goes home,
 * so no token there means it never got one.
 */
export function loginErpDone(error) {
  if (!current) return;
  if (error) {
    end("erp failed", { extra: { message: errorMessage(error) } });
    return;
  }
  let hasToken = null;
  try {
    hasToken = Boolean(localStorage.getItem("token"));
  } catch {
    // Storage blocked; can't tell.
  }
  end(hasToken === false ? "no token" : "signed in");
}
