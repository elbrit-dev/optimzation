import React, { useState, useEffect } from 'react';
import { NovuProvider, Inbox } from '@novu/react';

// 🔵 Brand Tokens (Elbrit Style)
const elbritInboxTheme = {
  appearance: {
    variables: {
      colorPrimary: "#0B3C5D",          // Elbrit Navy
      colorPrimaryForeground: "#FFFFFF",
      colorNeutralForeground: "#6B7280",
      colorForeground: "#111827",
      colorBackground: "#F9FAFB",
      fontFamily: "Inter, sans-serif",
      fontSize: "14px",
      borderRadius: "8px",
    },
    elements: {
      inboxRoot: {
        height: "100dvh",
        background: "#F9FAFB",
      },
      header: {
        background: "#0B3C5D",
        color: "#FFFFFF",
        padding: "16px",
        fontWeight: 600,
        fontSize: "16px",
      },
      notificationsList: {
        padding: "8px",
      },
      notificationItem: {
        background: "#FFFFFF",
        borderRadius: "12px",
        padding: "14px 16px",
        marginBottom: "10px",
        boxShadow: "0 2px 6px rgba(0,0,0,0.04)",
        transition: "all 0.2s ease",
      },
      notificationItemUnread: {
        borderLeft: "4px solid #0B3C5D",
        background: "#F3F8FC",
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
      tabsTrigger: {
        fontWeight: 500,
        fontSize: "13px",
      },
      tabsTriggerActive: {
        color: "#0B3C5D",
        borderBottom: "2px solid #0B3C5D",
      },
    },
  },
};

const NovuInbox = ({
  subscriberId,
  applicationIdentifier,
  subscriberHash,
  className,
  ...props
}) => {
  const [employeeId, setEmployeeId] = useState(null);
  const [isClient, setIsClient] = useState(false);

  // Get employeeId from localStorage on client side
  useEffect(() => {
    setIsClient(true);
    if (typeof window !== 'undefined') {
      const storedEmployeeId = localStorage.getItem('employeeid');
      if (storedEmployeeId) {
        setEmployeeId(storedEmployeeId);
      }
    }
  }, []);

  // Get config: props > localStorage employeeid (subscriberId is user-specific, not from env)
  const config = {
    subscriberId: subscriberId || employeeId, // User-specific, from props or localStorage only
    applicationIdentifier: applicationIdentifier || process.env.NEXT_PUBLIC_NOVU_APPLICATION_IDENTIFIER || 'sCfOsfXhHZNc',
    subscriberHash: subscriberHash || process.env.NEXT_PUBLIC_NOVU_SUBSCRIBER_HASH || undefined,
  };

  // Don't render until we're on client side (for localStorage access)
  if (!isClient) {
    return null;
  }

  // Validate required config
  if (!config.subscriberId || !config.applicationIdentifier) {
    console.warn('NovuInbox: subscriberId and applicationIdentifier are required');
    return (
      <div className={className} style={{ padding: '20px', textAlign: 'center' }}>
        <p>Novu Inbox: Configuration missing. Please provide subscriberId and applicationIdentifier.</p>
      </div>
    );
  }

  // Build NovuProvider props - only include subscriberHash if it exists
  const novuProviderProps = {
    subscriberId: config.subscriberId,
    applicationIdentifier: config.applicationIdentifier,
  };

  // Only add subscriberHash if it's provided (it's optional for HMAC authentication)
  if (config.subscriberHash) {
    novuProviderProps.subscriberHash = config.subscriberHash;
  }

  return (
    <div
      className={className}
      style={{
        height: "100dvh",
        width: "100%",
        background: "#F9FAFB",
        overflow: "hidden",
      }}
      {...props}
    >
      <NovuProvider {...novuProviderProps}>
        <Inbox {...elbritInboxTheme} />
      </NovuProvider>
    </div>
  );
};

export default NovuInbox;

