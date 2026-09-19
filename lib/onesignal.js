// lib/onesignal.js

const PROMPT_KEY = "onesignal_prompt_done";

// SDK v16 exposes Notifications.permission as a boolean and the browser-native
// "default" | "granted" | "denied" string on Notifications.permissionNative.
// Normalize to the string form so callers can distinguish "never asked"
// (default) from "blocked" (denied).
function readNativePermission(OneSignal) {
  const native = OneSignal?.Notifications?.permissionNative;
  if (native === "default" || native === "granted" || native === "denied") {
    return native;
  }
  if (typeof Notification !== "undefined" && Notification.permission) {
    return Notification.permission;
  }
  return "default";
}

const isIOS = () => {
  if (typeof navigator === "undefined") return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.platform || "") ||
    /iPad|iPhone|iPod/.test(navigator.userAgent || "") ||
    (/Macintosh/.test(navigator.userAgent || "") && navigator.maxTouchPoints > 1)
  );
};

/**
 * Holds the permission prompt until the screen has been touched, on the
 * platforms that insist.
 *
 * Safari only allows Notification.requestPermission() from a user gesture, and
 * the auto-prompt below runs on page open — so on iPhone it was failing the
 * moment it was called, silently, every time. Chrome has no such rule, which
 * is why this only ever showed up as "notifications work on Android".
 *
 * iOS has a second rule worth knowing: web push only exists for a web app that
 * has been added to the Home Screen. In a Safari tab there is nothing to ask
 * for, so we do not ask.
 */
function whenPromptIsAllowed() {
  if (!isIOS()) return Promise.resolve(true);

  const standalone =
    !!navigator.standalone ||
    !!window.matchMedia?.("(display-mode: standalone)")?.matches;
  if (!standalone) return Promise.resolve(false);

  return new Promise((resolve) => {
    // click and touchend, not pointerdown: those are the events Safari counts
    // as activation.
    const events = ["click", "touchend", "keydown"];
    const done = () => {
      events.forEach((name) => window.removeEventListener(name, done, true));
      resolve(true);
    };
    events.forEach((name) => window.addEventListener(name, done, true));
  });
}

function readSubscriptionState(OneSignal) {
  let supported = true;
  try {
    supported = OneSignal.Notifications.isPushSupported();
  } catch (e) {
    // Older SDK builds may not expose isPushSupported; assume supported.
  }
  // If init failed (e.g. domain not authorized in the OneSignal dashboard),
  // User/PushSubscription accessors can throw — fall back to browser-native
  // values so callers still get a usable state instead of hanging.
  let optedIn = false;
  let deviceId = null;
  try {
    optedIn = !!OneSignal.User?.PushSubscription?.optedIn;
    deviceId = OneSignal.User?.PushSubscription?.id || null;
  } catch (e) {
    console.warn("OneSignal: could not read subscription state:", e);
  }
  return {
    supported,
    permission: readNativePermission(OneSignal),
    optedIn,
    deviceId,
  };
}

// Auto-prompt used at page open (NovuInbox). Gated: the native popup is only
// requested when localStorage holds a non-empty value under `gateKey`
// (default "token"), i.e. the user is actually logged in. Pass an empty
// gateKey to disable the gate. User-gesture flows (the notification toggle)
// use subscribeToPush() instead, which is never gated.
export async function requestPushPermission({ gateKey = "token" } = {}) {
  if (typeof window === "undefined") return;

  return new Promise((resolve) => {
    window.OneSignalDeferred = window.OneSignalDeferred || [];
    window.OneSignalDeferred.push(async function (OneSignal) {
      const permission = readNativePermission(OneSignal);

      // Already granted
      if (permission === "granted") {
        localStorage.setItem(PROMPT_KEY, "true");
        resolve();
        return;
      }

      if (gateKey && !localStorage.getItem(gateKey)) {
        resolve();
        return;
      }

      // Ask only if browser allows
      if (permission === "default") {
        // On iOS this waits for the first tap; everywhere else it is already
        // resolved and nothing about the timing changes.
        const allowed = await whenPromptIsAllowed();
        if (!allowed) {
          resolve();
          return;
        }
        const result = await OneSignal.Notifications.requestPermission();
        if (result === "granted") {
          localStorage.setItem(PROMPT_KEY, "true");
        }
        resolve();
      } else {
        resolve();
      }
    });
  });
}

export async function getOneSignalDeviceId() {
  if (typeof window === "undefined") return null;

  return new Promise((resolve) => {
    window.OneSignalDeferred = window.OneSignalDeferred || [];
    window.OneSignalDeferred.push(async function (OneSignal) {
      // OneSignal v16 way
      const deviceId = OneSignal.User?.PushSubscription?.id || null;
      resolve(deviceId);
    });
  });
}

export async function setOneSignalUserData({
  subscriberId,
  email,
  phone,
  tags = {},
}) {
  if (typeof window === "undefined") return;

  return new Promise((resolve) => {
    window.OneSignalDeferred = window.OneSignalDeferred || [];
    window.OneSignalDeferred.push(async function (OneSignal) {

      // 🔹 Always assert identity FIRST
      if (subscriberId) {
        await OneSignal.login(subscriberId);
      }

      // 🔹 Set email explicitly
      if (email) {
        await OneSignal.User.addEmail(email);
      }

      // 🔹 Set phone explicitly
      if (phone) {
        await OneSignal.User.addSms(phone);
      }

      // 🔹 Set tags explicitly
      if (tags && Object.keys(tags).length > 0) {
        await OneSignal.User.addTags(tags);
      }

      resolve();
    });
  });
}

// The external id set by OneSignal.login() — the lowercase email that
// NovuInbox logs in with. Lets components recover the subscriber identity
// without being passed the email again.
export async function getOneSignalExternalId() {
  if (typeof window === "undefined") return null;

  return new Promise((resolve) => {
    window.OneSignalDeferred = window.OneSignalDeferred || [];
    window.OneSignalDeferred.push(async function (OneSignal) {
      resolve(OneSignal.User?.externalId || null);
    });
  });
}

export async function getPushSubscriptionState() {
  if (typeof window === "undefined") {
    return { supported: false, permission: "default", optedIn: false, deviceId: null };
  }

  return new Promise((resolve) => {
    window.OneSignalDeferred = window.OneSignalDeferred || [];
    window.OneSignalDeferred.push(async function (OneSignal) {
      resolve(readSubscriptionState(OneSignal));
    });
  });
}

// Opts this device in to push. If browser permission is still "default"
// (the user skipped the login-time prompt), this re-triggers the native
// permission popup — it must be called from a user gesture (button click).
// If permission is "denied" the browser will not show the popup again;
// the caller should direct the user to browser settings instead.
export async function subscribeToPush() {
  if (typeof window === "undefined") return null;

  return new Promise((resolve) => {
    window.OneSignalDeferred = window.OneSignalDeferred || [];
    window.OneSignalDeferred.push(async function (OneSignal) {
      try {
        await OneSignal.User.PushSubscription.optIn();
      } catch (e) {
        console.error("OneSignal optIn failed:", e);
      }
      const state = readSubscriptionState(OneSignal);
      if (state.permission === "granted") {
        localStorage.setItem(PROMPT_KEY, "true");
      }
      resolve(state);
    });
  });
}

// Opts this device out of push (stops delivery). Browser permission stays
// granted, so opting back in later needs no popup.
export async function unsubscribeFromPush() {
  if (typeof window === "undefined") return null;

  return new Promise((resolve) => {
    window.OneSignalDeferred = window.OneSignalDeferred || [];
    window.OneSignalDeferred.push(async function (OneSignal) {
      try {
        await OneSignal.User.PushSubscription.optOut();
      } catch (e) {
        console.error("OneSignal optOut failed:", e);
      }
      resolve(readSubscriptionState(OneSignal));
    });
  });
}

// Calls back with a fresh subscription state whenever browser permission or
// the OneSignal opt-in status changes. Returns an unsubscribe function.
export function onPushSubscriptionChange(callback) {
  if (typeof window === "undefined") return () => {};

  let disposed = false;
  let cleanup = null;

  window.OneSignalDeferred = window.OneSignalDeferred || [];
  window.OneSignalDeferred.push(async function (OneSignal) {
    if (disposed) return;
    const notify = () => callback(readSubscriptionState(OneSignal));
    OneSignal.User?.PushSubscription?.addEventListener?.("change", notify);
    OneSignal.Notifications?.addEventListener?.("permissionChange", notify);
    cleanup = () => {
      OneSignal.User?.PushSubscription?.removeEventListener?.("change", notify);
      OneSignal.Notifications?.removeEventListener?.("permissionChange", notify);
    };
  });

  return () => {
    disposed = true;
    if (cleanup) cleanup();
  };
}

export async function logoutOneSignal() {
  if (typeof window === "undefined") return;

  return new Promise((resolve) => {
    window.OneSignalDeferred = window.OneSignalDeferred || [];
    window.OneSignalDeferred.push(async function (OneSignal) {
      await OneSignal.logout();
      resolve();
    });
  });
}

