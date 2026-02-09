// lib/onesignal.js

const PROMPT_KEY = "onesignal_prompt_done";

export async function requestPushPermission() {
  if (typeof window === "undefined" || !window.OneSignal) return;

  // Prevent repeated permission prompts (browsers block/penalize repeated prompts)
  if (localStorage.getItem(PROMPT_KEY)) {
    return; // Already prompted, skip
  }

  // Triggers browser permission prompt (user must click Allow)
  await window.OneSignal.showNativePrompt();
  
  // Mark as prompted (even if user denies, don't prompt again)
  localStorage.setItem(PROMPT_KEY, "true");
}

export function setOneSignalUser(subscriberId) {
  if (!window.OneSignal || !subscriberId) return;

  // Link device to your internal user (employeeId)
  window.OneSignal.setExternalUserId(subscriberId);
}

export async function getOneSignalDeviceId() {
  if (!window.OneSignal) return null;

  // OneSignal v16 way
  return window.OneSignal.User?.PushSubscription?.id || null;
}

