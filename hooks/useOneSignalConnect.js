import { useEffect, useRef, useMemo } from 'react';

/**
 * Connect OneSignal device to Novu subscriber
 * Based on: https://docs.novu.co/platform/integrations/push/onesignal
 * 
 * @param {string} subscriberId - Novu subscriber ID
 * @param {object} userData - Optional user data { email, firstName, lastName }
 */
export function useOneSignalConnect(subscriberId, userData = {}) {
  const connectedRef = useRef(false);
  const retryCountRef = useRef(0);
  const MAX_RETRIES = 10; // Max retries to wait for OneSignal

  // Memoize userData to prevent unnecessary re-renders
  const memoizedUserData = useMemo(() => userData, [
    userData?.email,
    userData?.firstName,
    userData?.lastName,
  ]);

  useEffect(() => {
    if (!subscriberId || typeof window === 'undefined') {
      console.log('[OneSignal] Skipping connection: subscriberId or window not available');
      return;
    }

    const connect = async () => {
      // Wait for OneSignal to be ready
      if (!window.OneSignal) {
        retryCountRef.current += 1;
        if (retryCountRef.current < MAX_RETRIES) {
          setTimeout(connect, 500);
          return;
        } else {
          console.error('[OneSignal] OneSignal SDK not loaded after max retries');
          return;
        }
      }

      // Reset retry count on success
      retryCountRef.current = 0;

      // Prevent duplicate connections (but allow reconnection on subscription change)
      if (connectedRef.current) {
        console.log('[OneSignal] Already connected, skipping duplicate connection');
        return;
      }

      try {
        // Check notification permission
        const permission = await window.OneSignal.Notifications.permission;
        if (permission !== 'granted') {
          console.warn('[OneSignal] Push notification permission not granted. User needs to grant permission first.');
          return;
        }

        // Get OneSignal player_id (this is what Novu needs as deviceToken)
        // Wait a bit for the subscription to be ready
        let playerId = window.OneSignal.User?.PushSubscription?.id;
        
        // If not available, try waiting a bit more
        if (!playerId) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          playerId = window.OneSignal.User?.PushSubscription?.id;
        }

        if (!playerId) {
          console.warn('[OneSignal] player_id not available yet. OneSignal may still be initializing.');
          return;
        }

        console.log('[OneSignal] Attempting to connect player_id to Novu:', playerId);

        // Connect OneSignal player_id to Novu subscriber
        const response = await fetch('/api/novu/connect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            subscriberId,
            oneSignalPlayerId: playerId,
            ...(memoizedUserData.email && { email: memoizedUserData.email }),
            ...(memoizedUserData.firstName && { firstName: memoizedUserData.firstName }),
            ...(memoizedUserData.lastName && { lastName: memoizedUserData.lastName }),
          }),
        });

        const result = await response.json();

        if (response.ok && result.success) {
          connectedRef.current = true;
          console.log('[OneSignal] ✅ Successfully connected to Novu!', {
            subscriberId,
            playerId,
            message: result.message,
          });
        } else {
          console.error('[OneSignal] ❌ Failed to connect to Novu:', result);
          connectedRef.current = false; // Allow retry
        }
      } catch (error) {
        console.error('[OneSignal] ❌ Connection error:', error);
        connectedRef.current = false; // Allow retry
      }
    };

    connect();

    // Reconnect when subscription changes
    const handleSubscriptionChange = async (isSubscribed) => {
      if (isSubscribed) {
        console.log('[OneSignal] Subscription changed, reconnecting...');
        connectedRef.current = false; // Reset to allow reconnection
        await new Promise(resolve => setTimeout(resolve, 500)); // Small delay
        connect();
      }
    };

    // Set up subscription change listener
    let subscriptionListener = null;
    if (window.OneSignal) {
      subscriptionListener = handleSubscriptionChange;
      window.OneSignal.Notifications.addEventListener('subscriptionChange', subscriptionListener);
    }

    // Cleanup
    return () => {
      if (window.OneSignal && subscriptionListener) {
        window.OneSignal.Notifications.removeEventListener('subscriptionChange', subscriptionListener);
      }
    };
  }, [subscriberId, memoizedUserData]);
}