"use client";

// Broadcasts "the calendar dataset just changed" to every listener in this
// browser — the tab that made the change (so an optimistic row gets reconciled
// with what ERP actually stored) and every other open tab.
//
// This only covers writes made from this browser. Changes made by *other*
// users are picked up by the polling probe in `useCalendarLiveSync`.

const WINDOW_EVENT = "calendar-data:changed";
const CHANNEL_NAME = "calendar-data:changed";
const STORAGE_PING_KEY = "calendar-data:changed-at";

let channel = null;

function isBrowser() {
  return typeof window !== "undefined";
}

function getChannel() {
  if (!isBrowser() || typeof BroadcastChannel === "undefined") {
    return null;
  }

  if (!channel) {
    try {
      channel = new BroadcastChannel(CHANNEL_NAME);
    } catch {
      channel = null;
    }
  }

  return channel;
}

function safeJsonParse(value) {
  try {
    return JSON.parse(value) ?? {};
  } catch {
    return {};
  }
}

export function notifyCalendarDataChanged(detail = {}) {
  if (!isBrowser()) return;

  const payload = { at: Date.now(), ...detail };

  // Same tab. BroadcastChannel deliberately does not echo to the sender, so
  // this is the only way the writing tab hears about its own write.
  window.dispatchEvent(new CustomEvent(WINDOW_EVENT, { detail: payload }));

  getChannel()?.postMessage(payload);

  // Fallback for browsers without BroadcastChannel (older iOS Safari / Android
  // WebViews): a localStorage write fires `storage` in every *other* tab.
  try {
    window.localStorage.setItem(STORAGE_PING_KEY, JSON.stringify(payload));
  } catch {
    /* private mode / quota — the window event above still covers this tab */
  }
}

export function subscribeCalendarDataChanged(listener) {
  if (!isBrowser()) {
    return () => {};
  }

  const handleWindowEvent = (browserEvent) => {
    listener(browserEvent.detail ?? {});
  };

  const handleChannelMessage = (browserEvent) => {
    listener(browserEvent.data ?? {});
  };

  const handleStorage = (browserEvent) => {
    if (browserEvent.key !== STORAGE_PING_KEY) return;
    listener(safeJsonParse(browserEvent.newValue));
  };

  window.addEventListener(WINDOW_EVENT, handleWindowEvent);
  window.addEventListener("storage", handleStorage);

  const activeChannel = getChannel();
  activeChannel?.addEventListener("message", handleChannelMessage);

  return () => {
    window.removeEventListener(WINDOW_EVENT, handleWindowEvent);
    window.removeEventListener("storage", handleStorage);
    activeChannel?.removeEventListener("message", handleChannelMessage);
  };
}
