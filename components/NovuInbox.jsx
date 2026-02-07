import React, { useState, useEffect, useCallback } from 'react';
import { NovuProvider, Inbox } from '@novu/react';

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

  // Connect OneSignal to Novu when component mounts and user data is available
  useEffect(() => {
    setIsClient(true);
    
    if (typeof window !== 'undefined' && config.subscriberId && userPayload) {
      const connectOneSignalToNovu = async () => {
        // Wait for OneSignal to be ready
        if (!window.OneSignal) {
          setTimeout(connectOneSignalToNovu, 500);
          return;
        }

        try {
          const playerId = await window.OneSignal.User.PushSubscription.id;
          const subscriptionId = await window.OneSignal.User.PushSubscription.token;
          
          if (playerId || subscriptionId) {
            // Use firstName/lastName from props, or parse from displayName
            let firstName = userPayload.firstName;
            let lastName = userPayload.lastName;
            
            if (!firstName && userPayload.displayName) {
              const userName = userPayload.displayName.split(' ');
              firstName = userName[0];
              lastName = userName.slice(1).join(' ');
            }
            
            await fetch('/api/novu/connect', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                subscriberId: config.subscriberId,
                oneSignalPlayerId: playerId,
                oneSignalSubscriptionId: subscriptionId,
                email: userPayload.email,
                firstName,
                lastName,
              }),
            });
          }
        } catch (error) {
          console.error('[NovuInbox] Error connecting OneSignal to Novu:', error);
        }
      };
      
      // Connect when OneSignal is ready
      connectOneSignalToNovu();
      
      // Also connect when subscription changes
      const handleSubscriptionChange = async (isSubscribed) => {
        if (isSubscribed) {
          await connectOneSignalToNovu();
        }
      };
      
      if (window.OneSignal) {
        window.OneSignal.Notifications.addEventListener('subscriptionChange', handleSubscriptionChange);
      }
      
      // Cleanup
      return () => {
        if (window.OneSignal) {
          window.OneSignal.Notifications.removeEventListener('subscriptionChange', handleSubscriptionChange);
        }
      };
    }
  }, [config.subscriberId, userPayload]);

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
