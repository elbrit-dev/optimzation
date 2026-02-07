/**
 * API Route: Connect OneSignal to Novu
 * Connects OneSignal device tokens to Novu subscriber for push notifications
 */

import { Novu } from '@novu/node';

const novu = new Novu(process.env.NOVU_API_KEY || '');

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { subscriberId, oneSignalPlayerId, oneSignalSubscriptionId, email, firstName, lastName } = req.body;

    if (!subscriberId || (!oneSignalPlayerId && !oneSignalSubscriptionId)) {
      return res.status(400).json({ error: 'subscriberId and OneSignal ID required' });
    }

    // Update subscriber profile if data provided
    if (email || firstName || lastName) {
      await novu.subscribers.identify(subscriberId, {
        ...(email && { email }),
        ...(firstName && { firstName }),
        ...(lastName && { lastName }),
      });
    }

    // Connect OneSignal device token
    const deviceToken = oneSignalSubscriptionId || oneSignalPlayerId;
    await novu.subscribers.setCredentials(subscriberId, 'onesignal', {
      deviceTokens: [deviceToken],
    });

    return res.status(200).json({ success: true, subscriberId });
  } catch (error) {
    console.error('[Novu Connect] Error:', error);
    return res.status(500).json({ error: error.message });
  }
}

