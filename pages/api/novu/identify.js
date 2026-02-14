import { Novu } from "@novu/node";

const novu = new Novu(process.env.NOVU_API_KEY);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Check if API key is configured
  if (!process.env.NOVU_API_KEY) {
    console.error("NOVU_API_KEY is not configured");
    return res.status(500).json({ error: "Novu API key not configured" });
  }

  const { email, firstName, lastName, phone, meta = {} } = req.body;

  if (!email || typeof email !== "string") {
    return res.status(400).json({ error: "Valid email required" });
  }

  try {
    await novu.subscribers.identify(email, {
      email,
      firstName,
      lastName,
      phone,
      data: meta,
    });

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("Novu identify failed", err);
    // Return more detailed error in development, generic in production
    const errorMessage = process.env.NODE_ENV === "development" 
      ? err.message || "Identify failed"
      : "Identify failed";
    return res.status(500).json({ error: errorMessage });
  }
}
