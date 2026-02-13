"use client";

import React, { useEffect } from "react";
import { NovuProvider, Inbox } from "@novu/react";
import {
  requestPushPermission,
  getOneSignalDeviceId,
  setOneSignalUserData,
} from "@/lib/onesignal";

const NovuInbox = ({
  subscriberId, // MUST be email
  applicationIdentifier,
  subscriberHash,
  className,
  mode = "icon",
  ...props
}) => {
  // 🔥 Identity + Device Sync
  useEffect(() => {
    if (!subscriberId) return;

    const setup = async () => {
      try {
        // 1️⃣ Identify subscriber in Novu
        await fetch("/api/novu/identify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: subscriberId,
          }),
        });

        // 2️⃣ Login OneSignal
        await setOneSignalUserData({
          subscriberId,
          email: subscriberId,
        });

        // 3️⃣ Ask push permission
        await requestPushPermission();

        // 4️⃣ Get device ID
        const deviceId = await getOneSignalDeviceId();

        if (deviceId) {
          await fetch("/api/onesignal/register-device", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              subscriberId,
              deviceId,
            }),
          });
        }
      } catch (error) {
        console.error("NovuInbox setup error:", error);
      }
    };

    setup();
  }, [subscriberId]);

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
    <div className={className} {...props}>
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