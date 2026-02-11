import React, { useState, useEffect } from "react";
import { NovuProvider, Inbox } from "@novu/react";

/* ==============================
   🔵 ELBRIT DESIGN SYSTEM
================================ */

const elbritInboxTheme = {
  appearance: {
    variables: {
      colorPrimary: "#1F2F5F", // Elbrit Navy
      colorPrimaryForeground: "#FFFFFF",
      colorNeutralForeground: "#6B7280",
      colorForeground: "#111827",
      colorBackground: "#F4F6F9",
      fontFamily: "Inter, sans-serif",
      fontSize: "14px",
      borderRadius: "10px",
    },
    elements: {
      inboxRoot: {
        height: "100%",
        display: "flex",
        flexDirection: "column",
      },
      header: {
        background: "#1F2F5F",
        color: "#FFFFFF",
        fontWeight: 600,
        fontSize: "15px",
        padding: "14px 16px",
      },
      notificationsList: {
        padding: "12px",
      },
      notificationItem: {
        background: "#FFFFFF",
        borderRadius: "12px",
        padding: "14px 16px",
        marginBottom: "10px",
        boxShadow: "0 4px 12px rgba(0,0,0,0.05)",
      },
      notificationItemUnread: {
        borderLeft: "4px solid #E0312B", // Red accent
        background: "#FFF6F6",
      },
      notificationTitle: {
        fontWeight: 600,
        fontSize: "14px",
        color: "#111827",
      },
      notificationBody: {
        fontSize: "13px",
        color: "#4B5563",
      },
      notificationDate: {
        fontSize: "11px",
        color: "#9CA3AF",
      },
      tabsTriggerActive: {
        color: "#1F2F5F",
        borderBottom: "2px solid #1F2F5F",
      },
    },
  },
};

/* ==============================
   🔔 NOVU INBOX COMPONENT
================================ */

const NovuInbox = ({
  subscriberId,
  applicationIdentifier,
  subscriberHash,
  className,
  ...props
}) => {
  const [employeeId, setEmployeeId] = useState(null);
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);

    const storedEmployeeId =
      typeof window !== "undefined"
        ? localStorage.getItem("employeeid")
        : null;

    if (storedEmployeeId) {
      setEmployeeId(storedEmployeeId);
    }
  }, []);

  if (!isClient) return null;

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
    return (
      <div style={{ padding: 20, textAlign: "center" }}>
        Configuration missing.
      </div>
    );
  }

  const novuProviderProps = {
    subscriberId: config.subscriberId,
    applicationIdentifier: config.applicationIdentifier,
  };

  if (config.subscriberHash) {
    novuProviderProps.subscriberHash = config.subscriberHash;
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
        background: "#F4F6F9",
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
          background: "#FFFFFF",
          borderRadius: "16px",
          boxShadow: "0 20px 40px rgba(0,0,0,0.08)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <NovuProvider {...novuProviderProps}>
          <Inbox {...elbritInboxTheme} />
        </NovuProvider>
      </div>
    </div>
  );
};

export default NovuInbox;