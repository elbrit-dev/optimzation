// lib/onesignal.js

const PROMPT_KEY = "onesignal_prompt_done";

export async function requestPushPermission() {
  if (typeof window === "undefined") return;

  return new Promise((resolve) => {
    window.OneSignalDeferred = window.OneSignalDeferred || [];
    window.OneSignalDeferred.push(async function (OneSignal) {
      const permission = await OneSignal.Notifications.permission;

      // Already granted
      if (permission === "granted") {
        localStorage.setItem(PROMPT_KEY, "true");
        resolve();
        return;
      }

      // Ask only if browser allows
      if (permission === "default") {
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

