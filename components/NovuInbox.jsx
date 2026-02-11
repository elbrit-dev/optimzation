"use client";

import React, { useState, useEffect } from "react";
import { NovuProvider, Inbox } from "@novu/react";

const NovuInbox = ({
  subscriberId,
  applicationIdentifier,
  subscriberHash,
  className,
  mode = "icon",
  ...props
}) => {
  const [employeeId, setEmployeeId] = useState(null);

  useEffect(() => {
    const storedEmployeeId =
      typeof window !== "undefined"
        ? localStorage.getItem("employeeid")
        : null;

    if (storedEmployeeId) {
      setEmployeeId(storedEmployeeId);
    }
  }, []);

  const config = {
    subscriberId: subscriberId || employeeId,
    applicationIdentifier:
      applicationIdentifier ||
      process.env.NEXT_PUBLIC_NOVU_APPLICATION_IDENTIFIER ||
      "sCfOsfXhHZNc",
    subscriberHash:
      subscriberHash ||
      process.env.NEXT_PUBLIC_NOVU_SUBSCRIBER_HASH ||
      undefined,
  };

  if (!config.subscriberId || !config.applicationIdentifier) {
    return null;
  }

  const novuProviderProps = {
    subscriberId: config.subscriberId,
    applicationIdentifier: config.applicationIdentifier,
  };

  if (config.subscriberHash) {
    novuProviderProps.subscriberHash = config.subscriberHash;
  }

  const tabs = [
    { label: "All", filter: {} },
    { label: "Approval", filter: { tags: ["approval"] } },
    { label: "Announcement", filter: { tags: ["announcement"] } },
  ];

  return (
    <div className={className} {...props}>
      <NovuProvider {...novuProviderProps}>
        <Inbox tabs={tabs} />
      </NovuProvider>
    </div>
  );
};

export default NovuInbox;