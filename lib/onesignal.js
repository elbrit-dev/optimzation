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
  if (!window.OneSignal) return;

  // Optional but OK (even in Player Model)
  if (subscriberId) {
    window.OneSignal.setExternalUserId(subscriberId);
  }

  // Email
  if (email) {
    window.OneSignal.User?.addEmail(email);
  }

  // Phone (must be E.164 format: +91XXXXXXXXXX)
  if (phone) {
    window.OneSignal.User?.addSms(phone);
  }

  // Tags (key-value only, strings/numbers)
  if (tags && typeof tags === "object") {
    window.OneSignal.User?.addTags(tags);
  }
}

