"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { NovuProvider, Inbox } from "@novu/react";
import {
  requestPushPermission,
  getOneSignalDeviceId,
  setOneSignalUserData,
  logoutOneSignal,
} from "@/lib/onesignal";

// Stacking floor for the notification panel. Every Novu surface is portaled to
// <body>, so they only stack correctly relative to each other if set together.
const POPOVER_Z = 9999;

// Wide enough for all five tabs to sit inline instead of collapsing into the
// overflow menu; capped to the viewport so it still fits a phone screen.
const PANEL_WIDTH = "min(480px, calc(100vw - 16px))";

const NovuInbox = ({
  email,
  firstName,
  lastName,
  phone,
  tags = {},
  meta = {},
  applicationIdentifier,
  subscriberHash,
  // Self-hosted Novu endpoints. Without these the widget connects to Novu Cloud.
  apiUrl,
  socketUrl,
  className,
  onNotificationClick,
  onPrimaryActionClick,
  onSecondaryActionClick,
  routerPush,
  fallbackRedirectPath = "/chat",
  bellSize = 28,
  bellPadding = "2px",
  promptGateKey = "token",
  ...rest
}) => {
  const [status, setStatus] = useState("Initializing...");
  const cleanEmail = (email || "").trim().toLowerCase();
  const router = useRouter();

  // Centralised navigation: prop override → Next.js SPA push → hard redirect.
  // Novu calls this (via routerPush) with a notification's redirect URL.
  const navigate = (path) => {
    if (!path) return;
    if (typeof routerPush === "function") return routerPush(path);
    if (router && typeof router.push === "function") return router.push(path);
    if (typeof window !== "undefined") window.location.href = path;
  };

  // Fires on notification (body) click. Navigation is driven ONLY by the
  // notification's own redirect URL — Novu calls routerPush={navigate} with it.
  // Invoice (snapshot) notifications carry redirect "/chat", so they open /chat;
  // every other notification carries no redirect and simply stays readable in the
  // inbox (the click just marks it read). No forced fallback redirect.
  const handleNotificationClick = (notification) => {
    if (typeof onNotificationClick === "function") onNotificationClick(notification);
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.pathname === "/login") logoutOneSignal();
  }, []);

  useEffect(() => {
    if (!cleanEmail || !cleanEmail.includes('@')) {
      console.log("NovuInbox: Waiting for a valid email prop...");
      setStatus("Waiting for Email...");
      return; 
    }

    const setup = async () => {
      try {
        console.log(`NovuInbox: Starting setup for ${cleanEmail}...`);
        setStatus("Identifying...");

        const identifyRes = await fetch("/api/novu/identify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: cleanEmail,
            firstName,
            lastName,
            phone,
            tags,
            meta,
          }),
        });
    
        if (!identifyRes.ok) {
          // `details` is often an object (e.g. Novu's 401 body); stringify it so
          // the console shows the real reason instead of "[object Object]".
          const errorData = await identifyRes.json().catch(() => ({}));
          const detail =
            typeof errorData.details === "string"
              ? errorData.details
              : errorData.details
              ? JSON.stringify(errorData.details)
              : errorData.error;
          throw new Error(detail || `identify failed (HTTP ${identifyRes.status})`);
        }
    
        console.log("NovuInbox: Identification successful.");
        setStatus("Syncing OneSignal...");

        await setOneSignalUserData({
          subscriberId: cleanEmail,
          email: cleanEmail,
          phone,
          tags
        });
        await requestPushPermission({ gateKey: promptGateKey });
    
        const deviceId = await getOneSignalDeviceId();
        if (deviceId) {
          await fetch("/api/onesignal/register-device", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ subscriberId: cleanEmail, deviceId }),
          });
          console.log("NovuInbox: Device registered successfully.");
        }
        
        setStatus("Ready");
      } catch (error) {
        console.error("NovuInbox Error:", error.message);
        setStatus("Error: Check Console");
      }
    };

    setup();
  }, [cleanEmail, firstName, lastName, phone, JSON.stringify(tags), JSON.stringify(meta)]);

  if (!cleanEmail || !applicationIdentifier) {
    return (
      <div className={className} style={{ 
        padding: '20px', 
        border: '2px dashed #3182ce', 
        borderRadius: '8px',
        background: '#ebf8ff',
        color: '#2c5282',
        textAlign: 'center',
        fontSize: '12px'
      }}>
        <strong>Novu Inbox Placeholder</strong><br/>
        Status: {status}
      </div>
    );
  }

  return (
    <div className={className} {...rest}>
      <NovuProvider
        subscriberId={cleanEmail}
        applicationIdentifier={applicationIdentifier}
        subscriberHash={subscriberHash}
        apiUrl={apiUrl}
        socketUrl={socketUrl}
      >
        <Inbox
          // NOT `position` / `offset` — those aren't props in @novu/react and
          // were being silently dropped. The real names are placement/placementOffset.
          placement="bottom-end"
          placementOffset={8}
          appearance={{
            elements: {
              // Tighten the trigger button so its background hugs the bell
              // instead of leaving empty padding around it.
              popoverTrigger: {
                padding: bellPadding,
                width: "fit-content",
                height: "fit-content",
                lineHeight: 0,
              },
              // Scale the bell itself. Sizing the container + the SVG icon so
              // the bell fills the (now tight) trigger.
              bellContainer: {
                width: `${bellSize}px`,
                height: `${bellSize}px`,
              },
              bellIcon: {
                width: `${bellSize}px`,
                height: `${bellSize}px`,
              },
              // The calendar's month event badges use `z-10` (needed for
              // multi-day event layering), which was bleeding through the
              // notification panel. Lift the popover above the calendar grid.
              popoverContent: {
                zIndex: POPOVER_Z,
                // Novu defaults the panel to 400px. Its tab bar is `gap-6` + `px-4`,
                // so five tabs need ~410px — and any tab that doesn't FULLY fit is
                // moved into the "..." overflow menu (Novu also hides one extra tab
                // to make room for that trigger). At 400px that swallowed
                // Announcement + Invoice. Widen so all five stay inline, while
                // never exceeding the viewport on mobile.
                width: PANEL_WIDTH,
              },
              // Novu portals each dropdown (Inbox status, ..., tab overflow,
              // snooze) to <body> as a SIBLING of the popover, styled `z-10`.
              // Once the popover was lifted to POPOVER_Z those menus opened
              // *behind* it. Keying off the base `dropdownContent` covers every
              // variant — appearance keys cascade over their `__` suffix, so
              // `inboxStatus__dropdownContent` et al. inherit this too.
              dropdownContent: {
                zIndex: POPOVER_Z + 1,
              },
            },
          }}
          routerPush={navigate}
          onNotificationClick={handleNotificationClick}
          onPrimaryActionClick={onPrimaryActionClick}
          onSecondaryActionClick={onSecondaryActionClick}
          // Every tab is tag-scoped. Tags live on the WORKFLOW in Novu (not on the
          // individual trigger) and match case-sensitively, so each string below
          // must equal the workflow's tag exactly. "All" is deliberately NOT a
          // catch-all: it shows only "General"-tagged notifications, so untagged
          // or other-tagged workflows never leak into it.
          //
          // Live tags on notify.elbrit.org (Production): approval-flow → "Approval",
          // erp-notification → "General", snapshot-invoice → "Invoice".
          // "Chat" and "announcement" have no workflow yet, so those tabs read empty
          // until one is tagged accordingly in Novu.
          tabs={[
            { label: "All", filter: { tags: ["General"] } },
            { label: "Chat", filter: { tags: ["Chat"] } },
            { label: "Approval", filter: { tags: ["Approval"] } },
            { label: "Announcement", filter: { tags: ["announcement"] } },
            { label: "Invoice", filter: { tags: ["Invoice"] } }
          ]}
        />
      </NovuProvider>
    </div>
  );
};

export default NovuInbox;