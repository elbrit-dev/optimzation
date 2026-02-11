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
    {
      label: "All",
      filter: {},
    },
    {
      label: "Approval",
      filter: {
        tags: ["approval"],
      },
    },
    {
      label: "Announcement",
      filter: {
        tags: ["announcement"],
      },
    },
  ];

  if (mode === "icon") {
    return (
      <div
        className={className}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
        }}
        {...props}
      >
        <NovuProvider {...novuProviderProps}>
          <Inbox tabs={tabs} />
        </NovuProvider>
      </div>
    );
  }

  return (
    <div
      className={className}
      style={{
        minHeight: "100vh",
        width: "100%",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        padding: "20px",
        boxSizing: "border-box",
      }}
      {...props}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "420px",
          height: "80vh",
          maxHeight: "700px",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <NovuProvider {...novuProviderProps}>
          <Inbox tabs={tabs} />
        </NovuProvider>
      </div>
    </div>
  );
};

export default NovuInbox;