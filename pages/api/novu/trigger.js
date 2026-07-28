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

/**
 * Triggers a Novu workflow. Designed to be called by ERPNext (UAT) Webhooks /
 * Server Scripts, or any backend service.
 *
 * Auth: send header  x-webhook-secret: <NOVU_TRIGGER_SECRET>
 *
 * Body:
 * {
 *   "workflowId": "erp-notification",        // Novu workflow trigger identifier (required)
 *   "to": "user@elbrit.org",                 // email string, OR
 *   // "to": { "subscriberId": "user@elbrit.org", "email": "...", "firstName": "..." }, OR
 *   // "to": ["a@elbrit.org", "b@elbrit.org"],   // array of the above
 *   "payload": {                              // free-form data your workflow template uses
 *     "subject": "Sales Order SO-0001 needs approval",
 *     "body": "Order ₹1,20,000 from Acme is awaiting your approval.",
 *     "url": "https://uat.elbrit.org/app/sales-order/SO-0001"
 *   }
 * }
 */
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  // --- 1. Authenticate the caller (ERPNext) ---
  const secret = req.headers["x-webhook-secret"];
  if (!process.env.NOVU_TRIGGER_SECRET || secret !== process.env.NOVU_TRIGGER_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { workflowId, to, payload = {} } = req.body || {};

  if (!workflowId) return res.status(400).json({ error: "workflowId is required" });
  if (!to) return res.status(400).json({ error: "'to' (recipient) is required" });

  // --- 2. Normalize recipients into Novu subscriber objects ---
  // subscriberId is always the lowercased email, matching identify.js / NovuInbox.
  const toRecipient = (entry) => {
    if (typeof entry === "string") {
      const email = entry.trim().toLowerCase();
      return email.includes("@") ? { subscriberId: email, email } : null;
    }
    if (entry && typeof entry === "object") {
      const email = (entry.email || entry.subscriberId || "").toString().trim().toLowerCase();
      if (!email.includes("@")) return null;
      return { ...entry, subscriberId: email, email };
    }
    return null;
  };

  const recipients = (Array.isArray(to) ? to : [to]).map(toRecipient).filter(Boolean);

  if (recipients.length === 0) {
    return res.status(400).json({ error: "No valid recipient email(s) provided" });
  }

  try {
    const novu = getNovu();
    // Novu creates the subscriber on the fly if it doesn't exist yet, so this
    // works even for users who have never opened the inbox. Existing subscribers
    // (with their OneSignal push credential) are reused.
    await novu.trigger(workflowId, {
      to: recipients.length === 1 ? recipients[0] : recipients,
      payload,
    });

    return res.status(200).json({ success: true, count: recipients.length });
  } catch (err) {
    console.error("Novu Trigger Error:", err.response?.data || err);
    return res
      .status(500)
      .json({ error: "Trigger failed", details: err.response?.data || err.message });
  }
}
