// lib/onesignal.js

const PROMPT_KEY = "onesignal_prompt_done";

export async function requestPushPermission() {
  if (typeof window === "undefined") return;

  window.OneSignalDeferred = window.OneSignalDeferred || [];
  window.OneSignalDeferred.push(async function (OneSignal) {
    const permission = await OneSignal.Notifications.permission;

    // Already granted
    if (permission === "granted") {
      localStorage.setItem(PROMPT_KEY, "true");
      return;
    }

    // Ask only if browser allows
    if (permission === "default") {
      const result = await OneSignal.Notifications.requestPermission();
      if (result === "granted") {
        localStorage.setItem(PROMPT_KEY, "true");
      }
    }
  });
}

export async function getOneSignalDeviceId() {
  if (!window.OneSignal) return null;

  // OneSignal v16 way
  return window.OneSignal.User?.PushSubscription?.id || null;
}

export function setOneSignalUserData({
  subscriberId,
  email,
  phone,
  tags = {},
}) {
  if (typeof window === "undefined") return;

  window.OneSignalDeferred = window.OneSignalDeferred || [];
  window.OneSignalDeferred.push(async function (OneSignal) {
    // 🔒 REQUIRED: identity must be asserted PER BROWSER
    if (subscriberId) {
      await OneSignal.login(subscriberId);
    }

    // Tags (key-value pairs)
    if (tags && Object.keys(tags).length > 0) {
      await OneSignal.User.addTags(tags);
    }

    // Email channel (if provided)
    if (email) {
      await OneSignal.User.addEmail(email);
    }

    // SMS channel (if provided)
    if (phone) {
      await OneSignal.User.addSms(phone);
    }
  });
}

