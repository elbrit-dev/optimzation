// pages/api/claims/read-bill.js
//
// POST multipart { files: <the bill photo or PDF> }
//      x-erp-endpoint: <the page's ERP GraphQL URL>
//      x-erp-token:    <the user's ERP token>
//
// Reads a bill the moment it is attached -- the only time any AI runs on it
// (lib/billReader.js): toMarkdown, then Clairic (values) and Clef Flash (title).
// -> { read: { values, confidence, title, titleConfidence, md }, sig, ms }
//    sig: the server's signature over `read`; the bill carries both to
//    /api/claims/check, which compares them with what was submitted.
// Not switched on (no Cloudflare token yet) -> { skipped }: the person types
// the bill in and it goes to Accounts.

import { allowedErpHosts } from "../../../lib/erpServer";
import { billReaderOn, readMarkdown, signRead, toMarkdown } from "../../../lib/billReader";

export const config = { api: { bodyParser: false } };

const MAX = 10 * 1024 * 1024 + 64 * 1024; // the form's 10 MB, plus the multipart wrapping
const tokenHeader = (t) => (/^(token|bearer)\s/i.test(t) ? t : `token ${t}`);

async function rawBody(req) {
  const parts = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX) throw Object.assign(new Error("The bill is over 10 MB."), { status: 413 });
    parts.push(chunk);
  }
  return Buffer.concat(parts);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed." });
  }
  const userErp = String(req.headers["x-erp-token"] || "").trim();
  const type = String(req.headers["content-type"] || "");
  if (!userErp) return res.status(401).json({ error: "Sign in again to read bills." });
  if (!/^multipart\/form-data/i.test(type)) return res.status(400).json({ error: "Send the bill as a file." });
  let origin;
  try {
    const url = new URL(String(req.headers["x-erp-endpoint"] || ""));
    if (!allowedErpHosts().has(url.host.toLowerCase())) throw new Error("host");
    origin = url.origin;
  } catch {
    return res.status(400).json({ error: "That ERP is not one this app talks to." });
  }
  if (!billReaderOn()) return res.status(200).json({ skipped: true, reason: "The bill reader is not switched on yet." });

  // Only a signed-in ERP user may spend the reader.
  const who = await fetch(`${origin}/api/method/frappe.auth.get_logged_user`, { headers: { Authorization: tokenHeader(userErp) }, redirect: "manual" })
    .then((r) => (r.ok ? r.json() : null)).catch(() => null);
  if (!who?.message || who.message === "Guest") return res.status(401).json({ error: "Sign in again to read bills." });

  const t = Date.now();
  try {
    const body = await rawBody(req);
    const md = await toMarkdown(body, type);
    if (!md) return res.status(200).json({ read: null, unreadable: true, ms: Date.now() - t });
    const read = { ...(await readMarkdown(md)), md: md.slice(0, 6000), at: new Date().toISOString() };
    return res.status(200).json({ read, sig: signRead(read), ms: Date.now() - t });
  } catch (e) {
    console.error("read-bill:", e.message);
    return res.status(e.status || 502).json({ error: e.status ? e.message : `The bill could not be read: ${e.message}` });
  }
}
