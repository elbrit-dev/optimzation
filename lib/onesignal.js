// lib/onesignal.js

const PROMPT_KEY = "onesignal_prompt_done";

export async function requestPushPermission() {
  if (typeof window === "undefined" || !window.OneSignal) return;

  // Prevent repeated permission prompts (browsers block/penalize repeated prompts)
  if (localStorage.getItem(PROMPT_KEY)) {
    return; // Already prompted and granted, skip
  }

  // Triggers browser permission prompt (user must click Allow)
  await window.OneSignal.showNativePrompt();
  
  // Only mark as done if permission is actually granted (allows re-try if user blocked)
  const permission = await window.OneSignal.Notifications.permission;
  if (permission === "granted") {
    localStorage.setItem(PROMPT_KEY, "true");
  }
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
    // ❗ Documented identity sync for v16 - use login() instead of setExternalUserId()
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

