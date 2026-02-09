// pages/api/onesignal/register-device.js
// 
// ⚠️ ENVIRONMENT CONSISTENCY CHECK:
// Ensure these all point to the SAME Novu environment:
// - NOVU_API_KEY (server-side, used here)
// - NEXT_PUBLIC_NOVU_APPLICATION_IDENTIFIER (client-side, in NovuInbox)
// - OneSignal integration config in Novu dashboard
// - Workflow you're triggering
// Dev ↔ Prod mismatch = silent failure

import { Novu } from "@novu/node";

const novu = new Novu(process.env.NOVU_API_KEY);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { subscriberId, deviceId } = req.body;

  if (!subscriberId || !deviceId) {
    return res.status(400).json({
      error: "subscriberId and deviceId are required",
    });
  }

  try {
    await novu.subscribers.credentials.update(
      {
        providerId: "one_signal",
        credentials: {
          deviceTokens: [deviceId],
        },
      },
      subscriberId
    );

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("OneSignal → Novu attach failed", err);
    return res.status(500).json({ error: "Failed to register device" });
  }
}

