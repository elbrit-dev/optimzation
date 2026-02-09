import React, { useState, useEffect } from 'react';
import { NovuProvider, Inbox } from '@novu/react';
import {
  requestPushPermission,
  setOneSignalUser,
  getOneSignalDeviceId,
} from "@/lib/onesignal";

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

  // OneSignal push notification setup (must be before early returns per React hooks rules)
  useEffect(() => {
    if (!config.subscriberId) return;
    if (typeof window === "undefined") return;

    let cancelled = false;

    async function setupPush() {
      try {
        // 1️⃣ Ask permission (only once per browser - localStorage guard prevents re-prompting)
        await requestPushPermission();

        // 2️⃣ Attach subscriberId to device
        setOneSignalUser(config.subscriberId);

        // 3️⃣ Get device ID
        const deviceId = await getOneSignalDeviceId();
        if (!deviceId || cancelled) return;

        // 4️⃣ Prevent duplicate registration calls (cache last registered device)
        const lastKey = `os_device_${config.subscriberId}`;
        const lastRegisteredDeviceId = localStorage.getItem(lastKey);
        
        if (lastRegisteredDeviceId === deviceId) {
          // Already registered this device for this subscriber, skip
          return;
        }

        // 5️⃣ Send deviceId → backend → Novu
        await fetch("/api/onesignal/register-device", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subscriberId: config.subscriberId,
            deviceId,
          }),
        });

        // Cache successful registration
        localStorage.setItem(lastKey, deviceId);
      } catch (err) {
        console.error("Push setup failed", err);
      }
    }

    setupPush();

    return () => {
      cancelled = true;
    };
  }, [config.subscriberId]);

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
    <div className={className} {...props}>
      <NovuProvider {...novuProviderProps}>
        <Inbox />
      </NovuProvider>
    </div>
  );
};

export default NovuInbox;

