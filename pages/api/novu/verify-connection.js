/**
 * API Route: Verify OneSignal connection to Novu
 * Checks if a subscriber has OneSignal credentials properly set
 */

import { Novu } from '@novu/node';

const novu = new Novu(process.env.NOVU_API_KEY || process.env.NOVU_SECRET_KEY || '');

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const subscriberId = req.method === 'GET' ? req.query.subscriberId : req.body.subscriberId;

    if (!subscriberId) {
      return res.status(400).json({ error: 'subscriberId is required' });
    }

    // Get subscriber details to verify credentials
    const subscriber = await novu.subscribers.get(subscriberId);

    // Check if OneSignal credentials exist
    const onesignalCredentials = subscriber?.channels?.find(
      (channel) => channel.providerId === 'onesignal' || channel.providerId === 'OneSignal'
    );

    const hasDeviceTokens = onesignalCredentials?.credentials?.deviceTokens?.length > 0;

    return res.status(200).json({
      success: true,
      subscriberId,
      connected: hasDeviceTokens,
      hasCredentials: !!onesignalCredentials,
      deviceTokensCount: onesignalCredentials?.credentials?.deviceTokens?.length || 0,
      deviceTokens: hasDeviceTokens ? onesignalCredentials.credentials.deviceTokens : [],
      message: hasDeviceTokens
        ? 'OneSignal is properly connected'
        : 'OneSignal credentials not found. Please connect OneSignal first.',
    });
  } catch (error) {
    console.error('[Novu Verify] Error:', error);
    return res.status(500).json({
      error: error.message || 'Failed to verify OneSignal connection',
      details: error.response?.data || error.stack,
    });
  }
}

