import { Novu } from "@novu/node";

// Lazy construction: `new Novu(undefined)` throws at construction, which at
// module scope would crash the route with a bare 500 instead of clean JSON.
function getNovu() {
  const key = (process.env.NOVU_API_KEY || "").trim();
  if (!key) throw new Error("NOVU_API_KEY is not set on this deployment");
  // Self-hosted Novu (notify.elbrit.org). Without backendUrl the SDK hits Novu
  // Cloud (api.novu.co) and every key 401s with "API Key not found".
  const backendUrl = (process.env.NOVU_BACKEND_URL || "https://api.notify.elbrit.org").trim();
  return new Novu(key, { backendUrl });
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { subscriberId, deviceId } = req.body;
  const cleanSubId = subscriberId?.toString().trim();

  if (!cleanSubId || !deviceId) return res.status(400).json({ error: "Missing data" });

  try {
    const novu = getNovu();
    // Omit integrationIdentifier so Novu auto-uses the single active OneSignal
    // integration in the current environment (Dev = "test", Prod = "onesignal").
    await novu.subscribers.setCredentials(cleanSubId, 'one-signal', {
      deviceTokens: [deviceId],
    });
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("Device Registration Error:", err.response?.data || err);
    return res.status(500).json({ error: "Registration failed", details: err.response?.data || err.message });
  }
}