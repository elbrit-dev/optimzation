"use client";

import React, { useEffect, useState } from "react";
import {
  getPushSubscriptionState,
  subscribeToPush,
  unsubscribeFromPush,
  onPushSubscriptionChange,
  getOneSignalDeviceId,
  getOneSignalExternalId,
} from "@/lib/onesignal";

// The OneSignal subscription id can take a moment to exist after opt-in
// (the SDK has to register with the push service first).
const waitForDeviceId = async (tries = 20, intervalMs = 500) => {
  for (let i = 0; i < tries; i++) {
    const id = await getOneSignalDeviceId();
    if (id) return id;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return null;
};

/**
 * "Show notifications" label + toggle switch reflecting the live push
 * subscription status. Toggling ON re-triggers the native browser permission
 * popup when the user skipped it at login (allowed because the click is a
 * user gesture while permission is still "default"), then registers the
 * device for push. Toggling OFF opts the device out of push delivery —
 * browser permission stays granted, so toggling back ON later is instant.
 * If the user previously clicked "Block" on the popup, browsers never allow
 * re-opening it, so the toggle shows settings instructions instead.
 */
const PushNotificationToggle = ({
  email,
  label = "Show notifications",
  deniedMessage = "Notifications are blocked for this site. Enable them from the lock icon in your browser's address bar (Site settings → Notifications → Allow), then try again.",
  hideWhenUnsupported = true,
  activeColor = "#2c5282",
  inactiveColor = "#cbd5e0",
  labelColor,
  fontSize = 14,
  toggleHeight = 24,
  className,
  onChange,
  ...rest
}) => {
  // null while the OneSignal SDK is still initializing.
  const [subState, setSubState] = useState(null);
  const [busy, setBusy] = useState(false);
  const [showDeniedHelp, setShowDeniedHelp] = useState(false);
  const cleanEmail = (email || "").trim().toLowerCase();

  const enabled = !!subState && subState.permission === "granted" && subState.optedIn;

  useEffect(() => {
    let mounted = true;
    const apply = (state) => {
      if (!mounted || !state) return;
      setSubState(state);
      if (state.permission === "granted" && state.optedIn) setShowDeniedHelp(false);
    };
    getPushSubscriptionState().then(apply);
    const off = onPushSubscriptionChange(apply);
    return () => {
      mounted = false;
      off();
    };
  }, []);

  const registerDevice = async () => {
    // Same identity as the NovuInbox bell: the email prop bound in Plasmic.
    // Fall back to the external id NovuInbox already set via OneSignal.login()
    // so the toggle still registers correctly if the binding is missing.
    const subscriberId = cleanEmail || (await getOneSignalExternalId());
    const deviceId = await waitForDeviceId();
    if (!deviceId) return null;
    if (!subscriberId) {
      console.warn("PushNotificationToggle: No email bound and no OneSignal identity yet — skipping device registration.");
      return deviceId;
    }
    try {
      await fetch("/api/onesignal/register-device", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscriberId, deviceId }),
      });
      console.log(`PushNotificationToggle: Device registered for ${subscriberId}.`);
    } catch (e) {
      console.error("PushNotificationToggle: Device registration failed:", e);
    }
    return deviceId;
  };

  const handleToggle = async () => {
    if (busy || !subState) return;

    if (enabled) {
      setBusy(true);
      try {
        const state = await unsubscribeFromPush();
        if (state) setSubState(state);
        if (typeof onChange === "function") onChange(false, null);
      } finally {
        setBusy(false);
      }
      return;
    }

    if (subState.permission === "denied") {
      setShowDeniedHelp(true);
      return;
    }

    setBusy(true);
    try {
      const state = await subscribeToPush();
      if (state) setSubState(state);
      if (state?.permission === "granted" && state?.optedIn) {
        setShowDeniedHelp(false);
        const deviceId = await registerDevice();
        if (typeof onChange === "function") onChange(true, deviceId);
      } else if (state?.permission === "denied") {
        setShowDeniedHelp(true);
      }
      // Popup dismissed again → stays off, no message needed.
    } finally {
      setBusy(false);
    }
  };

  if (subState && !subState.supported && hideWhenUnsupported) return null;

  const loading = !subState;
  const disabled = loading || busy || (subState && !subState.supported);
  const trackWidth = Math.round(toggleHeight * 1.83);
  const knobSize = toggleHeight - 4;

  const trackStyle = {
    position: "relative",
    flexShrink: 0,
    width: `${trackWidth}px`,
    height: `${toggleHeight}px`,
    borderRadius: `${toggleHeight / 2}px`,
    border: "none",
    padding: 0,
    background: enabled ? activeColor : inactiveColor,
    cursor: disabled ? "default" : "pointer",
    opacity: loading || busy ? 0.6 : 1,
    transition: "background 0.2s ease, opacity 0.2s ease",
  };

  const knobStyle = {
    position: "absolute",
    top: "2px",
    left: enabled ? `${trackWidth - knobSize - 2}px` : "2px",
    width: `${knobSize}px`,
    height: `${knobSize}px`,
    borderRadius: "50%",
    background: "#ffffff",
    boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
    transition: "left 0.2s ease",
  };

  return (
    <div
      className={className}
      style={{ display: "inline-flex", flexDirection: "column", gap: "8px" }}
      {...rest}
    >
      <div
        onClick={handleToggle}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "12px",
          cursor: disabled ? "default" : "pointer",
          userSelect: "none",
        }}
      >
        <span
          style={{
            fontSize: `${fontSize}px`,
            fontWeight: 500,
            color: labelColor || "inherit",
          }}
        >
          {label}
        </span>
        {/* No onClick of its own — its keyboard/click events bubble to the row
            handler above, so it never double-fires. */}
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label={label}
          disabled={disabled}
          style={trackStyle}
        >
          <span style={knobStyle} />
        </button>
      </div>
      {showDeniedHelp && (
        <div
          style={{
            padding: "10px 12px",
            borderRadius: "8px",
            background: "#fff5f5",
            border: "1px solid #feb2b2",
            color: "#742a2a",
            fontSize: "12px",
            lineHeight: 1.5,
            maxWidth: "320px",
          }}
        >
          {deniedMessage}
        </div>
      )}
    </div>
  );
};

export default PushNotificationToggle;
