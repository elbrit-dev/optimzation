// pages/api/erp/claim-file.js
//
// GET ?endpoint=<ERP GraphQL URL>&path=/private/files/bill.jpg
//     header x-erp-token: the signed-in user's ERP token
//
// Hands back an Expense Claim attachment so the Claims page can preview it.
// The browser cannot fetch it from the ERP itself: the ERP answers the CORS
// preflight for /private/files but sends no Access-Control-Allow-Origin on the
// file GET, so the fetch is blocked.
//
// No service account here: the request is made with the user's OWN token, so
// the ERP decides whether this person may see this file, exactly as it would
// in the desk. The host must be one of ours (no open proxy) and the path must
// be a Frappe file path.

import { allowedErpHosts } from "../../../lib/erpServer";

const FILE_PATH = /^\/(private\/)?files\/[^?#]+$/;

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed." });
  }

  const token = String(req.headers["x-erp-token"] || "").trim();
  const path = String(req.query?.path || "").trim();
  let origin;
  try {
    const url = new URL(String(req.query?.endpoint || ""));
    if (!allowedErpHosts().has(url.host.toLowerCase())) throw new Error("host");
    origin = url.origin;
  } catch {
    return res.status(400).json({ error: "That ERP is not one this app talks to." });
  }
  if (!token) return res.status(401).json({ error: "Sign in again to open this file." });
  if (!FILE_PATH.test(path) || path.includes("..")) {
    return res.status(400).json({ error: "That is not an ERP file." });
  }

  let upstream;
  try {
    upstream = await fetch(origin + path, {
      headers: { Authorization: /^(token|bearer)\s/i.test(token) ? token : `token ${token}` },
      redirect: "manual",
    });
  } catch (error) {
    console.error("Claim file: ERP unreachable", error);
    return res.status(502).json({ error: "The ERP could not be reached." });
  }

  // Frappe redirects to the login page instead of answering 403.
  if (upstream.status >= 300 && upstream.status < 400) {
    return res.status(403).json({ error: "You do not have access to this file." });
  }
  if (upstream.status === 401 || upstream.status === 403) {
    return res.status(403).json({ error: "You do not have access to this file. Sign in again if this keeps happening." });
  }
  if (!upstream.ok) {
    return res.status(upstream.status === 404 ? 404 : 502).json({
      error: upstream.status === 404 ? "The file is no longer in the ERP." : `The ERP refused the file (HTTP ${upstream.status}).`,
    });
  }

  const type = upstream.headers.get("content-type") || "application/octet-stream";
  if (/text\/html/i.test(type)) return res.status(403).json({ error: "You do not have access to this file." });

  const buffer = Buffer.from(await upstream.arrayBuffer());
  res.setHeader("Content-Type", type);
  res.setHeader("Content-Length", buffer.length);
  res.setHeader("Content-Disposition", `inline; filename="${path.split("/").pop().replace(/"/g, "")}"`);
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  return res.status(200).send(buffer);
}
