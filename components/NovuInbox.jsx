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

const NovuInbox = ({
  email,
  firstName,
  lastName,
  phone,
  tags = {},
  meta = {},
  applicationIdentifier,
  subscriberHash,
  className,
  onNotificationClick,
  onPrimaryActionClick,
  onSecondaryActionClick,
  routerPush,
  fallbackRedirectPath = "/chat",
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
            const errorData = await identifyRes.json();
            throw new Error(errorData.details || errorData.error);
        }
    
        console.log("NovuInbox: Identification successful.");
        setStatus("Syncing OneSignal...");

        await setOneSignalUserData({
          subscriberId: cleanEmail,
          email: cleanEmail,
          phone,
          tags
        });
        await requestPushPermission();
    
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
      >
        <Inbox
          position="bottom-end"
          offset={8}
          width="372px"
          routerPush={navigate}
          onNotificationClick={handleNotificationClick}
          onPrimaryActionClick={onPrimaryActionClick}
          onSecondaryActionClick={onSecondaryActionClick}
          tabs={[
            { label: "All", value: [] },
            { label: "Approval", value: ["approval"] },
            { label: "Announcement", value: ["announcement"] }
          ]}
        />
      </NovuProvider>
    </div>
  );
};

export default NovuInbox;