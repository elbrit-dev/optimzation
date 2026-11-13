// pages/api/claims/read-bill.js
//
// POST multipart { files: <the bill photo or PDF> }
//      x-erp-endpoint: <the page's ERP GraphQL URL>
//      x-erp-token:    <the user's ERP token>
//
// Reads a bill the moment it is attached -- the only time any AI runs on it
// (lib/billReader.js): toMarkdown (a photo sent upright and at the size it reads
// anyway, 13 Nov 2026), then Clairic (values) and Clef Flash (title).
// -> { read: { values, confidence, title, titleConfidence, md }, sig, ms }
//    sig: the server's signature over `read`; the bill carries both to
//    /api/claims/check, which compares them with what was submitted.
// Not switched on (no Cloudflare token yet) -> { skipped }: the person types
// the bill in and it goes to Accounts.

import { allowedErpHosts } from "../../../lib/erpServer";
import { billReaderOn, billText, readMarkdown, signRead } from "../../../lib/billReader";
import { contentHash, fileHash, imageHash } from "../../../lib/billFingerprint";
import { SLOTS, manualBillVerdict, tripBillVerdict } from "../../../shared/calendar/lib/field-expenses/bill-rules";

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

/* A planner trip bill, after the read (12 Nov 2026). In order, and each step
   only when the one before passed:
     1. the trip checks on the read -- type, date (a hotel bill by its nights),
        60 % confidence (shared/calendar/lib/field-expenses/bill-rules.js);
     2. the bill is stored in the ERP as the rep (a private File);
     3. its fingerprint goes to the ERP's "Bill Fingerprint API", which refuses
        a bill already used (and records the attempt) or registers it.
   Refused at 3 -> the stored file is deleted again. Passed -> the read, with
   the verdict and the fingerprint inside it, signed: /api/claims/check later
   trusts that signature to score the claim row.
   -> { verdict, read?, sig?, file?: { name, url }, fingerprint?: { name, flag } } */
/* Store the bill in the ERP as the rep (private; attached to the month's
   claim later) and hash it. Started the moment the upload arrives, so it runs
   WHILE toMarkdown reads the bill (13 Nov 2026) -- a refused bill's file is
   deleted again. -> { stored, file, image } | { error } */
async function storeBill({ origin, userErp, body, type }) {
  const auth = { Authorization: tokenHeader(userErp) };
  const form = await new Request("http://local/", { method: "POST", headers: { "content-type": type }, body }).formData();
  const file = form.get("files");
  if (!file || typeof file.arrayBuffer !== "function") return { error: "No bill file came with the request." };
  const bytes = Buffer.from(await file.arrayBuffer());
  const up = new FormData();
  up.append("file", new Blob([bytes], { type: file.type || "application/octet-stream" }), file.name || "bill");
  up.append("is_private", "1");
  up.append("folder", "Home/Attachments");
  const [stored, image] = await Promise.all([
    fetch(`${origin}/api/method/upload_file`, { method: "POST", headers: auth, body: up, redirect: "manual" })
      .then(async (r) => (r.ok ? (await r.json()).message : null))
      .catch(() => null),
    imageHash(bytes, file.type).catch(() => null),
  ]);
  if (!stored?.file_url) return { error: "The bill could not be stored in the ERP — try again." };
  return { stored, file: fileHash(bytes), image };
}

async function tripBillStep({ origin, userErp, body, type, read, tripBill, given = null, storing = null }) {
  const auth = { Authorization: tokenHeader(userErp) };
  const drop = (name) => fetch(`${origin}/api/resource/File/${encodeURIComponent(name)}`, { method: "DELETE", headers: auth, redirect: "manual" }).catch(() => {});
  // given: a hand-entered bill's verdict (manualBillVerdict), else the read's
  const verdict = given || tripBillVerdict(read, tripBill.slot, tripBill.trip);
  if (!verdict.ok) {
    // stored while it was being read, but refused: take the file away again
    if (storing) storing.then((s) => s?.stored && drop(s.stored.name));
    return { verdict };
  }

  // 2. the bill stored (already under way when `storing` is given) and hashed
  const s = await (storing || storeBill({ origin, userErp, body, type }));
  if (s.error) return { verdict: { ok: false, reason: s.error } };
  const stored = s.stored;
  const content = contentHash(read.values);
  const prints = { file: s.file, image: s.image, content: content?.hash || null, strong: !!content?.strong };
  const dropFile = () => drop(stored.name);

  // 3. the fingerprint check
  const v = read.values || {};
  const fp = await fetch(`${origin}/api/method/bill_fingerprint`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      action: "claim",
      kind: verdict.kind,
      trip: tripBill.trip.id,
      bill_date: verdict.kind === "Stay" ? verdict.checkIn : verdict.date,
      amount: String(verdict.billed),
      vendor: String(v.vendor || "").slice(0, 140),
      bill_no: String(v.bill_no || "").slice(0, 140),
      file_url: stored.file_url,
      file_hash: prints.file,
      image_hash: prints.image || "",
      content_hash: prints.content || "",
      strong: prints.strong ? "1" : "0",
    }),
    redirect: "manual",
  })
    .then(async (r) => {
      const j = await r.json().catch(() => ({}));
      if (r.ok) return j.message || null;
      // the script's own words (frappe.throw), else nothing
      let msg = null;
      try {
        msg = JSON.parse(JSON.parse(j._server_messages)[0]).message;
      } catch {
        /* none */
      }
      return { error: msg ? String(msg).replace(/<[^>]*>/g, "") : null };
    })
    .catch(() => null);
  if (!fp || fp.error !== undefined) {
    await dropFile();
    return { verdict: { ok: false, reason: fp?.error || "The duplicate-bill check isn't available right now — try again in a moment." } };
  }
  if (!fp.ok) {
    await dropFile();
    return { verdict: { ok: false, reason: `${fp.reason} This attempt is recorded for your reporting officer.`, duplicate: true } };
  }

  const signedRead = {
    ...read,
    trip: { ...tripBill, verdict, fingerprint: fp.name, flag: fp.flag || null, file_url: stored.file_url, hashes: prints },
  };
  return {
    verdict,
    read: signedRead,
    sig: signRead(signedRead),
    file: { name: stored.name, url: stored.file_url },
    fingerprint: { name: fp.name, flag: fp.flag || null },
  };
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
  // A planner trip bill (12 Nov 2026): x-trip-bill = { slot, trip: { id, from, to } }
  let tripBill = null;
  if (req.headers["x-trip-bill"]) {
    try {
      const tb = JSON.parse(String(req.headers["x-trip-bill"]));
      const iso = /^\d{4}-\d{2}-\d{2}$/;
      if (!(SLOTS[tb.slot] || tb.slot === "da" || tb.slot === "car") || !iso.test(tb.trip?.from) || !iso.test(tb.trip?.to)) throw new Error("bad");
      tripBill = { slot: tb.slot, trip: { id: String(tb.trip.id || tb.trip.from).slice(0, 40), from: tb.trip.from, to: tb.trip.to } };
    } catch {
      return res.status(400).json({ error: "Which trip is this bill for?" });
    }
  }
  /* A bill the rep entered BY HAND (12 Nov 2026): it could not be read, so no
     AI runs -- the typed values ("manual" form field) get the same trip
     checks (manualBillVerdict), the photo is stored and fingerprinted (its
     file and image hashes still catch the same photo coming back), and the
     line says "entered by hand" so a person compares it with the photo. */
  if (tripBill && req.headers["x-manual-bill"] === "1") {
    const me = await fetch(`${origin}/api/method/frappe.auth.get_logged_user`, { headers: { Authorization: tokenHeader(userErp) }, redirect: "manual" })
      .then((r) => (r.ok ? r.json() : null)).catch(() => null);
    if (!me?.message || me.message === "Guest") return res.status(401).json({ error: "Sign in again to add bills." });
    try {
      const body = await rawBody(req);
      const form = await new Request("http://local/", { method: "POST", headers: { "content-type": type }, body }).formData();
      let entry = {};
      try {
        entry = JSON.parse(String(form.get("manual") || "{}"));
      } catch {
        /* checked below */
      }
      const given = manualBillVerdict(entry, tripBill.slot, tripBill.trip);
      if (!given.ok) return res.status(200).json({ verdict: given });
      // the payment proof (GPay / UPI / bank screenshot): asked for, optional
      // while testing (12 Nov 2026) -- stored as the rep, privately, for a
      // person to look at; no AI reads it
      const proof = form.get("proof");
      const hasProof = !!proof && typeof proof.arrayBuffer === "function" && proof.size > 0;
      if (hasProof && proof.size > 10 * 1024 * 1024) return res.status(200).json({ verdict: { ok: false, reason: "The payment proof is over 10 MB." } });
      let proofFile = null;
      if (hasProof) {
        const pup = new FormData();
        pup.append("file", new Blob([Buffer.from(await proof.arrayBuffer())], { type: proof.type || "application/octet-stream" }), proof.name || "payment-proof");
        pup.append("is_private", "1");
        pup.append("folder", "Home/Attachments");
        proofFile = await fetch(`${origin}/api/method/upload_file`, { method: "POST", headers: { Authorization: tokenHeader(userErp) }, body: pup, redirect: "manual" })
          .then(async (r) => (r.ok ? (await r.json()).message : null))
          .catch(() => null);
        if (!proofFile?.file_url) return res.status(200).json({ verdict: { ok: false, reason: "The payment proof could not be stored in the ERP — try again." } });
      }
      const TITLE = { Stay: "Hotel bill", Food: "Food bill", Fuel: "Fuel bill", Toll: "Toll" };
      const read = {
        manual: true,
        title: TITLE[given.kind],
        titleConfidence: null,
        values: { total: given.billed, date: given.kind === "Stay" ? given.checkOut : given.date, check_in: given.checkIn || null, check_out: given.checkOut || null, vendor: given.vendor, bill_no: null, gstin: null },
        confidence: {},
        md: "",
        at: new Date().toISOString(),
      };
      const out = await tripBillStep({ origin, userErp, body, type, read, tripBill, given });
      if (!out.verdict?.ok) {
        // the bill was refused (e.g. a repeat): its proof goes too
        if (proofFile) await fetch(`${origin}/api/resource/File/${encodeURIComponent(proofFile.name)}`, { method: "DELETE", headers: { Authorization: tokenHeader(userErp) }, redirect: "manual" }).catch(() => {});
        return res.status(200).json(out);
      }
      return res.status(200).json({ ...out, proof: proofFile ? { name: proofFile.name, url: proofFile.file_url } : null });
    } catch (e) {
      console.error("read-bill (manual):", e.message);
      return res.status(e.status || 502).json({ error: e.status ? e.message : `The bill could not be added: ${e.message}` });
    }
  }
  if (!billReaderOn()) {
    // nothing can be read: the rep may still enter the bill by hand
    if (tripBill) return res.status(200).json({ verdict: tripBillVerdict(null, tripBill.slot, tripBill.trip) });
    return res.status(200).json({ skipped: true, reason: "The bill reader is not switched on yet." });
  }

  const t = Date.now();
  // Only a signed-in ERP user may spend the reader (asked while the upload is
  // still coming in).
  const [who, body] = await Promise.all([
    fetch(`${origin}/api/method/frappe.auth.get_logged_user`, { headers: { Authorization: tokenHeader(userErp) }, redirect: "manual" })
      .then((r) => (r.ok ? r.json() : null)).catch(() => null),
    rawBody(req),
  ]);
  if (!who?.message || who.message === "Guest") return res.status(401).json({ error: "Sign in again to read bills." });

  // a planner trip bill: stored in the ERP and hashed WHILE it is read
  const storing = tripBill ? storeBill({ origin, userErp, body, type }).catch((e) => ({ error: e.message })) : null;
  const dropStored = () => storing && storing.then((s) => s?.stored && fetch(`${origin}/api/resource/File/${encodeURIComponent(s.stored.name)}`, { method: "DELETE", headers: { Authorization: tokenHeader(userErp) }, redirect: "manual" }).catch(() => {}));
  try {
    const { md, via } = await billText(body, type);
    const tText = Date.now() - t;
    if (!md) {
      dropStored();
      if (tripBill) return res.status(200).json({ verdict: tripBillVerdict(null, tripBill.slot, tripBill.trip), ms: Date.now() - t });
      return res.status(200).json({ read: null, unreadable: true, ms: Date.now() - t });
    }
    const read = { ...(await readMarkdown(md)), md: md.slice(0, 6000), via, at: new Date().toISOString() };
    const tRead = Date.now() - t;
    if (tripBill) {
      const out = await tripBillStep({ origin, userErp, body, type, read, tripBill, storing });
      // where the time went (seconds matter to a rep waiting on a bill)
      const timing = { text: tText, read: tRead - tText, store: Date.now() - t - tRead, total: Date.now() - t, via };
      console.info("read-bill timing", JSON.stringify(timing));
      return res.status(200).json({ ...out, ms: timing.total, timing });
    }
    return res.status(200).json({ read, sig: signRead(read), ms: Date.now() - t });
  } catch (e) {
    dropStored();
    console.error("read-bill:", e.message);
    return res.status(e.status || 502).json({ error: e.status ? e.message : `The bill could not be read: ${e.message}` });
  }
}
