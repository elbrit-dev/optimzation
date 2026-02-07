import React, { useState, useEffect, useCallback } from 'react';
import { NovuProvider, Inbox, useNotifications } from '@novu/react';

// Custom notification item component with actions
const CustomNotificationItem = ({ notification, onActionClick }) => {
  const handleAction = async (action, notificationId) => {
    if (onActionClick) {
      await onActionClick(action, notificationId, notification);
    }
  };

  // Determine notification type/category
  const notificationType = notification?.payload?.type || 
                          notification?.payload?.category || 
                          'general';
  
  const isApproval = notificationType === 'approval' || 
                     notification?.payload?.category === 'approval';
  const isAnnouncement = notificationType === 'announcement' || 
                        notification?.payload?.category === 'announcement';

  // Get custom actions from payload
  const actions = notification?.payload?.actions || [];
  const hasApproveDeny = actions.some(a => 
    a.type === 'approve' || a.type === 'deny' || 
    a.type === 'accept' || a.type === 'decline'
  );

  return (
    <div 
      className={`notification-item p-4 border-b border-gray-200 hover:bg-gray-50 transition-colors ${
        !notification.read ? 'bg-blue-50' : ''
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          {/* Custom title rendering */}
          <h3 className="font-semibold text-gray-900 mb-1">
            {notification?.payload?.title || notification?.title || 'Notification'}
          </h3>
          
          {/* Custom content rendering */}
          <div className="text-sm text-gray-600 mb-2">
            {notification?.payload?.content || 
             notification?.payload?.body || 
             notification?.body || 
             'No content'}
          </div>

          {/* Custom metadata */}
          {notification?.payload?.metadata && (
            <div className="text-xs text-gray-500 mb-2">
              {Object.entries(notification.payload.metadata).map(([key, value]) => (
                <span key={key} className="mr-3">
                  <strong>{key}:</strong> {String(value)}
                </span>
              ))}
            </div>
          )}

          {/* Custom actions */}
          {hasApproveDeny && (
            <div className="flex gap-2 mt-3">
              {actions.map((action, index) => {
                const isPrimary = action.type === 'approve' || action.type === 'accept';
                const isDanger = action.type === 'deny' || action.type === 'decline';
                
                return (
                  <button
                    key={index}
                    onClick={() => handleAction(action.type, notification.id)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      isPrimary
                        ? 'bg-green-600 text-white hover:bg-green-700'
                        : isDanger
                        ? 'bg-red-600 text-white hover:bg-red-700'
                        : 'bg-gray-200 text-gray-800 hover:bg-gray-300'
                    }`}
                  >
                    {action.label || action.type}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        
        {/* Timestamp */}
        <div className="text-xs text-gray-400 ml-4">
          {notification?.createdAt 
            ? new Date(notification.createdAt).toLocaleDateString()
            : ''}
        </div>
      </div>
    </div>
  );
};

// Enhanced Inbox with filtering - must be inside NovuProvider
const EnhancedInbox = ({ 
  activeTab, 
  onTabChange, 
  onActionClick,
  userPayload,
  className 
}) => {
  const { notifications, markNotificationAsRead, markAllAsRead } = useNotifications();
  
  // Calculate unseen count from notifications
  const unseenCount = notifications.filter(n => !n.read).length;

  // Filter notifications based on active tab
  const filteredNotifications = notifications.filter((notification) => {
    if (activeTab === 'all') return true;
    
    const notificationType = notification?.payload?.type || 
                            notification?.payload?.category || 
                            notification?.payload?.category || 
                            'general';
    
    if (activeTab === 'approval') {
      return notificationType === 'approval' || 
             notification?.payload?.category === 'approval';
    }
    
    if (activeTab === 'announcement') {
      return notificationType === 'announcement' || 
             notification?.payload?.category === 'announcement';
    }
    
    return true;
  });

  return (
    <div className={className}>
      {/* Tab Filtering */}
      <div className="flex border-b border-gray-200 mb-4">
        {['all', 'approval', 'announcement'].map((tab) => (
          <button
            key={tab}
            onClick={() => onTabChange(tab)}
            className={`px-6 py-3 font-medium text-sm transition-colors capitalize ${
              activeTab === tab
                ? 'border-b-2 border-blue-600 text-blue-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {tab}
            {tab === 'all' && unseenCount > 0 && (
              <span className="ml-2 bg-blue-600 text-white text-xs px-2 py-0.5 rounded-full">
                {unseenCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Notifications List */}
      <div className="notifications-list max-h-96 overflow-y-auto">
        {filteredNotifications.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            No {activeTab !== 'all' ? activeTab : ''} notifications
          </div>
        ) : (
          filteredNotifications.map((notification) => (
            <CustomNotificationItem
              key={notification.id}
              notification={notification}
              onActionClick={onActionClick}
            />
          ))
        )}
      </div>
    </div>
  );
};

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
  const [activeTab, setActiveTab] = useState('all');

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

  // Merge user payload override
  const finalUserPayload = {
    ...userPayload,
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

  // Default action handler
  const handleActionClick = useCallback(async (action, notificationId, notification) => {
    console.log('[NovuInbox] Action clicked:', { action, notificationId, notification });
    
    // Call custom action handler if provided
    if (onActionClick) {
      await onActionClick(action, notificationId, notification);
    } else {
      // Default action handling
      // You can make API calls here to handle approve/deny, accept/decline
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

  return (
    <div className={className} {...props}>
      <NovuProvider {...novuProviderProps}>
        <EnhancedInbox
          activeTab={activeTab}
          onTabChange={setActiveTab}
          onActionClick={handleActionClick}
          userPayload={finalUserPayload}
          className="novu-inbox-container"
        />
      </NovuProvider>
    </div>
  );
};

export default NovuInbox;
