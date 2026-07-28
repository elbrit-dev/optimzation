import { Novu } from "@novu/node";

// Construct lazily inside the handler: `new Novu(undefined)` throws at
// construction, which at module scope would crash the whole route with a bare
// (non-JSON) 500. A trimmed key also avoids stray-whitespace 401s.
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

  const { email, firstName, lastName, phone, meta = {} } = req.body;
  const cleanEmail = email?.toString().trim().toLowerCase();

  if (!cleanEmail || !cleanEmail.includes('@')) {
    return res.status(400).json({ error: "A valid email string is required" });
  }

  try {
    const novu = getNovu();
    await novu.subscribers.identify(cleanEmail, {
      email: cleanEmail,
      firstName: firstName || "",
      lastName: lastName || "",
      phone: phone || "",
      data: meta,
    });
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("Novu Identify Error:", err.response?.data || err);
    return res.status(500).json({ error: "Identify failed", details: err.response?.data || err.message });
  }
}