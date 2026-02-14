import { Novu } from "@novu/node";

const novu = new Novu(process.env.NOVU_API_KEY);

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { subscriberId, deviceId } = req.body;
  const cleanSubId = subscriberId?.toString().trim();

  if (!cleanSubId || !deviceId) {
    return res.status(400).json({ error: "subscriberId and deviceId are required" });
  }

  try {
    // FIX: Use 'one-signal' for Provider ID and 'onesignal' for Integration Identifier
    await novu.subscribers.setCredentials(cleanSubId, 'one-signal', {
      deviceTokens: [deviceId],
      integrationIdentifier: 'onesignal' // Matches "Identifier" in your dashboard image
    });

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("Device Registration Error:", err.response?.data || err);
    return res.status(500).json({ 
      error: "Device registration failed", 
      details: err.response?.data || err.message 
    });
  }
}