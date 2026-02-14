import { Novu } from "@novu/node";

const novu = new Novu(process.env.NOVU_API_KEY);

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { email, firstName, lastName, phone, meta = {} } = req.body;

  // 1. Clean the email to prevent "malformed" errors
  const cleanEmail = email?.toString().trim();

  if (!cleanEmail || !cleanEmail.includes('@')) {
    return res.status(400).json({ error: "A valid email string is required" });
  }

  try {
    // 2. Identify the subscriber
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
    return res.status(500).json({ 
      error: "Identify failed", 
      details: err.response?.data || err.message 
    });
  }
}