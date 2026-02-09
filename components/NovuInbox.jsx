import React, { useState, useEffect, useCallback } from 'react';
import { NovuProvider, Inbox } from '@novu/react';
import { useOneSignalConnect } from '@/hooks/useOneSignalConnect';

const NovuInbox = ({
  subscriberId,
  applicationIdentifier,
  subscriberHash,
  className,
  onActionClick, // Callback for custom actions (Approve/Deny, Accept/Decline)
  userPayload, // User data from props: { subscriberId, email, displayName, firstName, lastName, etc. }
  ...props
}) => {
  const [isClient, setIsClient] = useState(false);

  // Get config from props (user data should come from props, not localStorage)
  const config = {
    subscriberId: subscriberId || userPayload?.subscriberId, // From props only
    applicationIdentifier: applicationIdentifier || process.env.NEXT_PUBLIC_NOVU_APPLICATION_IDENTIFIER || 'sCfOsfXhHZNc',
    subscriberHash: subscriberHash || process.env.NEXT_PUBLIC_NOVU_SUBSCRIBER_HASH || undefined,
  };

  // Parse user data for OneSignal connection
  const userData = userPayload ? {
    email: userPayload.email,
    firstName: userPayload.firstName || (userPayload.displayName?.split(' ')[0]),
    lastName: userPayload.lastName || (userPayload.displayName?.split(' ').slice(1).join(' ')),
  } : {};

  // Connect OneSignal to Novu (simplified with hook)
  useOneSignalConnect(config.subscriberId, userData);

  // Set client-side flag
  useEffect(() => {
    setIsClient(true);
  }, []);

  // Default action handler - must be before any early returns (React hooks rule)
  const handleActionClick = useCallback(async (action, notificationId, notification) => {
    console.log('[NovuInbox] Action clicked:', { action, notificationId, notification });
    
    // Call custom action handler if provided
    if (onActionClick) {
      await onActionClick(action, notificationId, notification);
    } else {
      // Default action handling
      try {
        const response = await fetch('/api/novu/notification-action', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            action,
            notificationId,
            subscriberId: config.subscriberId,
            notification,
          }),
        });

        const result = await response.json();
        if (result.success) {
          console.log('[NovuInbox] Action handled successfully:', result);
        }
      } catch (error) {
        console.error('[NovuInbox] Error handling action:', error);
      }
    }
  }, [onActionClick, config.subscriberId]);

  // Don't render until we're on client side
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

  // Configure tabs for All/Approval/Announcement
  // Using tags filter - make sure to assign these tags to your workflows in Novu dashboard
  // Alternative: use data object filter like { data: { category: 'approval' } }
  const tabs = [
    {
      label: 'All',
      filter: { tags: [] }, // Empty tags array shows all notifications
    },
    {
      label: 'Approval',
      filter: { 
        tags: ['approval'], // Filter by 'approval' tag
        // Alternative: filter: { data: { category: 'approval' } }
      },
    },
    {
      label: 'Announcement',
      filter: { 
        tags: ['announcement'], // Filter by 'announcement' tag
        // Alternative: filter: { data: { category: 'announcement' } }
      },
    },
  ];

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
        <Inbox 
          tabs={tabs}
          // Note: Native Inbox handles actions differently
          // You may need to use Novu's action system in workflows instead
        />
      </NovuProvider>
    </div>
  );
};

export default NovuInbox;
