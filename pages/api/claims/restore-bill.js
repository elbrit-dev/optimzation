// pages/api/claims/restore-bill.js
//
// POST JSON { name, slot, trip: { id, from, to } }
//      x-erp-endpoint: <the page's ERP GraphQL URL>
//      x-erp-token:    <the user's ERP token>
//
// BILLS ON EVERY DEVICE (25 Nov 2026, the owner): a trip bill scanned before the
// app kept its own copy in the ERP lives only on the phone that scanned it. This
// rebuilds such a bill from its Bill Fingerprint (the rep's own, not yet on any
// claim line): the stored file is read again and checked against the trip as
// when it was scanned; a file that cannot be read now is taken as registered
// (its date, total, vendor -- a hotel bill as one night from its date). No new
// fingerprint: the bill keeps the one it has. The read is signed as read-bill
// signs it, so /api/claims/check trusts it the same way.
// -> as read-bill: { verdict, read, sig, file: { name, url }, fingerprint: { name, flag } }

import { allowedErpHosts } from "../../../lib/erpServer";
import { billText, readMarkdown, signRead } from "../../../lib/billReader";
import { fingerprintCall } from "../../../lib/billFingerprint";
import { SLOTS, tripBillVerdict } from "../../../shared/calendar/lib/field-expenses/bill-rules";
import { limiter } from "../../../lib/limit";

const aiSlot = limiter(Number(process.env.BILL_READ_PARALLEL) || 6);
const tokenHeader = (t) => (/^(token|bearer)\s/i.test(t) ? t : `token ${t}`);
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const addDay = (iso) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};
// the register's kind -> the trip card's kind
const KIND = { Stay: "Stay", Food: "Food", Fuel: "Fuel", Toll: "Toll", Bill: "Travel" };

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed." });
  }
  const userErp = String(req.headers["x-erp-token"] || "").trim();
  if (!userErp) return res.status(401).json({ error: "Sign in again." });
  let origin;
  try {
    const url = new URL(String(req.headers["x-erp-endpoint"] || ""));
    if (!allowedErpHosts().has(url.host.toLowerCase())) throw new Error("host");
    origin = url.origin;
  } catch {
    return res.status(400).json({ error: "That ERP is not one this app talks to." });
  }
  const body = req.body || {};
  const slot = String(body.slot || "");
  const trip = body.trip || {};
  if (!SLOTS[slot] || !ISO.test(trip.from) || !ISO.test(trip.to)) return res.status(400).json({ error: "Which trip is this bill for?" });
  const tb = { slot, trip: { id: String(trip.id || trip.from).slice(0, 40), from: trip.from, to: trip.to } };
  const auth = { Authorization: tokenHeader(userErp) };

  // the rep's own registered bill (the ERP checks it is theirs and still in use)
  const got = await fingerprintCall(origin, userErp, { action: "get", name: String(body.name || "") });
  const fp = got?.bill;
  if (!fp?.file_url) return res.status(404).json({ error: got?.error || "That bill is not registered to you." });

  // its stored file, read again
  let read = null;
  try {
    const f = await fetch(`${origin}${fp.file_url}`, { headers: auth, redirect: "manual" });
    if (f.ok) {
      const bytes = Buffer.from(await f.arrayBuffer());
      const form = new FormData();
      form.append("files", new Blob([bytes], { type: f.headers.get("content-type") || "application/octet-stream" }), fp.file_url.split("/").pop() || "bill");
      const reqForm = new Request("http://local/", { method: "POST", body: form });
      const type = reqForm.headers.get("content-type");
      const raw = Buffer.from(await reqForm.arrayBuffer());
      const { md, via } = await aiSlot(() => billText(raw, type));
      if (md) read = { ...(await aiSlot(() => readMarkdown(md))), md: md.slice(0, 6000), via, at: new Date().toISOString() };
    }
  } catch (e) {
    console.warn("restore-bill: read again failed:", e.message);
  }
  let verdict = read ? tripBillVerdict(read, slot, tb.trip) : null;
  if (!verdict?.ok) {
    // as registered: the date, total and vendor it was accepted with
    const kind = KIND[fp.kind] || "Food";
    const date = ISO.test(fp.bill_date) ? fp.bill_date : tb.trip.from;
    const billed = Math.round(Number(fp.amount) || 0);
    verdict =
      kind === "Stay"
        ? { ok: true, kind, billed, amount: billed, date, nights: [date], checkIn: date, checkOut: addDay(date), vendor: fp.vendor || null, billNo: fp.bill_no || null, restored: true }
        : { ok: true, kind, billed, amount: billed, date, nights: [], vendor: fp.vendor || null, billNo: fp.bill_no || null, restored: true };
    read = read || { values: { date, total: billed, vendor: fp.vendor || null, bill_no: fp.bill_no || null }, confidence: {}, title: null, at: new Date().toISOString() };
  }
  // the File record's name (the claim attaches the bill by it)
  let fileName = null;
  try {
    const q = new URLSearchParams({ filters: JSON.stringify([["file_url", "=", fp.file_url]]), fields: JSON.stringify(["name"]), limit_page_length: "1" });
    const r = await fetch(`${origin}/api/resource/File?${q}`, { headers: auth, redirect: "manual" });
    if (r.ok) fileName = (await r.json()).data?.[0]?.name || null;
  } catch {
    /* none */
  }
  const hashes = { file: fp.file_hash || null, image: fp.image_hash || null, content: fp.content_hash || null, strong: !!Number(fp.strong) };
  const signedRead = { ...read, trip: { ...tb, verdict, fingerprint: fp.name, flag: null, file_url: fp.file_url, hashes, restored: true } };
  return res.status(200).json({
    verdict,
    read: signedRead,
    sig: signRead(signedRead),
    file: { name: fileName, url: fp.file_url },
    fingerprint: { name: fp.name, flag: null },
  });
}
