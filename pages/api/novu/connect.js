/**
 * API Route: Connect OneSignal to Novu
 * Connects OneSignal device tokens to Novu subscriber for push notifications
 * Based on: https://docs.novu.co/platform/integrations/push/onesignal
 */

import { Novu } from '@novu/node';

const novu = new Novu(process.env.NOVU_API_KEY || process.env.NOVU_SECRET_KEY || '');

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { subscriberId, oneSignalPlayerId, email, firstName, lastName, integrationIdentifier } = req.body;

    if (!subscriberId || !oneSignalPlayerId) {
      return res.status(400).json({ error: 'subscriberId and oneSignalPlayerId (player_id) are required' });
    }

    // Update subscriber profile if data provided
    if (email || firstName || lastName) {
      await novu.subscribers.identify(subscriberId, {
        ...(email && { email }),
        ...(firstName && { firstName }),
        ...(lastName && { lastName }),
      });
    }

    // Connect OneSignal device token using credentials.update() method
    // According to Novu docs, we use player_id as the device token
    // The providerId should be 'onesignal' (lowercase string for @novu/node)
    const updateParams = {
      providerId: 'onesignal',
      credentials: {
        deviceTokens: [oneSignalPlayerId],
      },
    };

    // Add integrationIdentifier if provided (for multiple OneSignal integrations)
    if (integrationIdentifier) {
      updateParams.integrationIdentifier = integrationIdentifier;
    }

    // Use credentials.update() method as per Novu documentation
    // Note: @novu/node may use a slightly different API than @novu/api
    // If credentials.update() doesn't work, we'll fall back to setCredentials()
    let updateResult;
    try {
      // Try the new API method first (as per docs)
      if (novu.subscribers.credentials && typeof novu.subscribers.credentials.update === 'function') {
        updateResult = await novu.subscribers.credentials.update(updateParams, subscriberId);
      } else {
        // Fallback to setCredentials if update() doesn't exist
        updateResult = await novu.subscribers.setCredentials(subscriberId, 'onesignal', {
          deviceTokens: [oneSignalPlayerId],
        });
      }
    } catch (apiError) {
      // If update() fails, try setCredentials as fallback
      console.warn('[Novu Connect] credentials.update() failed, trying setCredentials()...', apiError.message);
      try {
        updateResult = await novu.subscribers.setCredentials(subscriberId, 'onesignal', {
          deviceTokens: [oneSignalPlayerId],
        });
      } catch (fallbackError) {
        throw new Error(`Both credentials.update() and setCredentials() failed: ${fallbackError.message}`);
      }
    }

    return res.status(200).json({ 
      success: true, 
      subscriberId,
      playerId: oneSignalPlayerId,
      message: 'OneSignal player_id connected to Novu subscriber',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Novu Connect] Error:', error);
    return res.status(500).json({ 
      error: error.message || 'Failed to connect OneSignal to Novu',
      details: error.response?.data || error.stack 
    });
  }
}

