"use client";

import React, { useEffect } from "react";
import { NovuProvider, Inbox } from "@novu/react";
import {
  requestPushPermission,
  getOneSignalDeviceId,
  setOneSignalUserData,
  logoutOneSignal,
} from "@/lib/onesignal";

const NovuInbox = ({
  subscriberId,      // email (REQUIRED)
  firstName,
  lastName,
  phone,
  tags = {},
  meta = {},
  applicationIdentifier,
  subscriberHash,
  className,
  ...rest
}) => {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const path = window.location.pathname;

    if (path === "/login") {
      logoutOneSignal();
    }
  }, []);

  useEffect(() => {
    if (!subscriberId) return;

    const setup = async () => {
      try {
        // 1️⃣ Identify subscriber - WAIT for success before moving on
        const identifyRes = await fetch("/api/novu/identify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: subscriberId,
            firstName,
            lastName,
            phone,
            tags,
            meta,
          }),
        });
    
        if (!identifyRes.ok) {
            const errorData = await identifyRes.json();
            throw new Error(`Identify failed: ${errorData.details || errorData.error}`);
        }
    
        // 2️⃣ Login OneSignal
        await setOneSignalUserData({
          subscriberId,
          email: subscriberId,
          phone,
          tags,
        });
    
        // 3️⃣ Ask push permission
        await requestPushPermission();
    
        // 4️⃣ Attach device - only run if Identify succeeded
        const deviceId = await getOneSignalDeviceId();
    
        if (deviceId) {
          const registerRes = await fetch("/api/onesignal/register-device", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              subscriberId,
              deviceId,
            }),
          });
          
          if (!registerRes.ok) {
              console.warn("Device registration failed, but subscriber was identified.");
          }
        }
      } catch (error) {
        console.error("NovuInbox setup error:", error.message);
      }
    };

    setup();
  }, [
    subscriberId,
    firstName,
    lastName,
    phone,
    JSON.stringify(tags),
    JSON.stringify(meta),
  ]);

  if (!subscriberId || !applicationIdentifier) {
    return null;
  }

  const novuProviderProps = {
    subscriberId,
    applicationIdentifier,
  };

  if (subscriberHash) {
    novuProviderProps.subscriberHash = subscriberHash;
  }

  const tabs = [
    { label: "All", filter: {} },
    { label: "Approval", filter: { tags: ["approval"] } },
    { label: "Announcement", filter: { tags: ["announcement"] } },
  ];

  return (
    <div className={className} {...rest}>
      <NovuProvider {...novuProviderProps}>
        <Inbox
          tabs={tabs}
          position="bottom-end"
          offset={8}
          width="372px"
        />
      </NovuProvider>
    </div>
  );
};

export default NovuInbox;