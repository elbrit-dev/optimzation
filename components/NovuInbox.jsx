"use client";

import React, { useEffect } from "react";
import { NovuProvider, Inbox } from "@novu/react";
import {
  requestPushPermission,
  getOneSignalDeviceId,
  setOneSignalUserData,
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
    if (!subscriberId) return;

    const setup = async () => {
      try {
        // 1️⃣ Identify subscriber in Novu (FULL DATA)
        await fetch("/api/novu/identify", {
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

        // 2️⃣ Login OneSignal with same identity
        await setOneSignalUserData({
          subscriberId,
          email: subscriberId,
          phone,
          tags,
        });

        // 3️⃣ Ask push permission
        await requestPushPermission();

        // 4️⃣ Attach device to Novu
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