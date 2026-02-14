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
  subscriberId,
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
    if (window.location.pathname === "/login") logoutOneSignal();
  }, []);

  useEffect(() => {
    // ✅ 200% FIX: Wait for a valid email before calling the API
    if (!subscriberId || typeof subscriberId !== 'string' || !subscriberId.includes('@')) {
      return; 
    }

    const setup = async () => {
      try {
        // 1️⃣ Identify subscriber
        const identifyRes = await fetch("/api/novu/identify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: subscriberId.trim(),
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
        await setOneSignalUserData({ subscriberId, email: subscriberId, phone, tags });
    
        // 3️⃣ Ask push permission
        await requestPushPermission();
    
        // 4️⃣ Attach device
        const deviceId = await getOneSignalDeviceId();
        if (deviceId) {
          await fetch("/api/onesignal/register-device", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ subscriberId, deviceId }),
          });
        }
      } catch (error) {
        console.error("NovuInbox setup error:", error.message);
      }
    };

    setup();
  }, [subscriberId, firstName, lastName, phone, JSON.stringify(tags), JSON.stringify(meta)]);

  if (!subscriberId || !applicationIdentifier) return null;

  return (
    <div className={className} {...rest}>
      <NovuProvider subscriberId={subscriberId} applicationIdentifier={applicationIdentifier} subscriberHash={subscriberHash}>
        <Inbox position="bottom-end" offset={8} width="372px" />
      </NovuProvider>
    </div>
  );
};

export default NovuInbox;