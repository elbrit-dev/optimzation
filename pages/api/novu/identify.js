import { Novu } from "@novu/node";

const novu = new Novu(process.env.NOVU_API_KEY);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const {
    email,
    firstName,
    lastName,
    phone,
    meta = {},
  } = req.body;

  if (!email) {
    return res.status(400).json({ error: "Email required" });
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
    return res.status(500).json({ error: "Identify failed" });
  }
}
