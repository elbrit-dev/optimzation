"use client";

import React, { useEffect, useState } from "react";
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
  const [status, setStatus] = useState("Initializing...");

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.pathname === "/login") logoutOneSignal();
  }, []);

  useEffect(() => {
    if (!subscriberId || !subscriberId.includes('@')) {
      console.log("NovuInbox: Waiting for a valid email prop...");
      setStatus("Waiting for Email...");
      return; 
    }

    const setup = async () => {
      try {
        console.log(`NovuInbox: Starting setup for ${subscriberId}...`);
        setStatus("Identifying...");

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
            throw new Error(errorData.details || errorData.error);
        }
    
        console.log("NovuInbox: Identification successful.");
        setStatus("Syncing OneSignal...");

        await setOneSignalUserData({ subscriberId, email: subscriberId, phone, tags });
        await requestPushPermission();
    
        const deviceId = await getOneSignalDeviceId();
        if (deviceId) {
          await fetch("/api/onesignal/register-device", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ subscriberId, deviceId }),
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
  }, [subscriberId, firstName, lastName, phone, JSON.stringify(tags), JSON.stringify(meta)]);

  if (!subscriberId || !applicationIdentifier) {
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
        subscriberId={subscriberId} 
        applicationIdentifier={applicationIdentifier} 
        subscriberHash={subscriberHash}
      >
        <Inbox 
          position="bottom-end" 
          offset={8} 
          width="372px"
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