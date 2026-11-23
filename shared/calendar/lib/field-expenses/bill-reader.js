/* Scanning a bill onto a planner trip (12 Nov 2026). The app server reads it
   (Cloudflare Gemma 4 -- a photo, a PDF's text or a scanned PDF's pages --
   then Clairic + Clef), checks it against the trip --
   right type, date inside the trip (a hotel bill by its nights), read with
   60 % confidence -- stores it in the ERP as the rep and registers its
   fingerprint so the same bill can't come back. A bill that fails any of it
   is refused with the reason; nobody types an amount in.
   See pages/api/claims/read-bill.js and bill-rules.js. */

import { AUTH_CONFIG } from "@calendar/components/auth/calendar-users";

export const BILL_ACCEPT = "image/*,application/pdf";
export const BILL_MAX = 10 * 1024 * 1024;

export function checkBillFile(file) {
  if (!file) return "No file picked.";
  if (!/^image\//.test(file.type) && file.type !== "application/pdf") return "Only photos and PDFs can be attached.";
  if (file.size > BILL_MAX) return "That file is over 10 MB.";
  return null;
}

/* A phone photo shrunk before it is sent (13 Nov 2026): a 3-5 MB camera
   picture takes many seconds on mobile data, and the reader only uses ~1280 px
   of it. Upright, at most 1600 px, JPEG -- still sharp enough for a person to
   read the bill later. A PDF, a small photo, or anything that fails goes as it is. */
const SHRINK_PX = 1600;
export async function shrinkPhoto(file) {
  try {
    if (!file || !/^image\/(jpeg|png|webp)$/.test(file.type) || typeof createImageBitmap !== "function") return file;
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, SHRINK_PX / Math.max(bmp.width, bmp.height));
    if (scale === 1 && file.size < 600 * 1024) {
      bmp.close?.();
      return file;
    }
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d").drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close?.();
    const blob = await new Promise((r) => canvas.toBlob(r, "image/jpeg", 0.85));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], String(file.name || "bill").replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}

/* What the server's Gemma 4 reads of a PDF bill (16 Nov 2026), made here in
   the browser -- the server never opens the PDF:
     a PDF with text  its own text, copied out page by page (exact, like
                      toMarkdown was) -> { text }; no pictures are made
     a scanned PDF    (photos saved as a PDF, no text in it) its pages as
                      JPEGs -> { pages }, read by Gemma all in one request
   Up to PDF_PAGES pages (a bill is a page or two; this keeps a long PDF from
   making the upload huge). pdf.js is loaded from cdnjs only when a PDF is
   attached. Not a PDF, or it could not be opened -> {} (the server then asks
   for a photo instead). -> { text?, pages? } */
const PDFJS = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38";
const PAGE_PX = 1600;
export const PDF_PAGES = 5;
// enough letters and a figure to be a bill's text, not a stray scanner stamp
const hasText = (t) => t.replace(/[^A-Za-z0-9]/g, "").length >= 40 && /\d/.test(t);
export async function pdfForReading(file) {
  try {
    if (!file || file.type !== "application/pdf" || typeof document === "undefined") return {};
    const pdfjs = await import(/* webpackIgnore: true */ `${PDFJS}/pdf.min.mjs`);
    pdfjs.GlobalWorkerOptions.workerSrc = `${PDFJS}/pdf.worker.min.mjs`;
    const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    try {
      const count = Math.min(doc.numPages, PDF_PAGES);
      const texts = [];
      for (let n = 1; n <= count; n++) {
        const { items } = await (await doc.getPage(n)).getTextContent();
        const body = items.map((it) => (it.str || "") + (it.hasEOL ? "\n" : " ")).join("").replace(/[ \t]+\n/g, "\n").trim();
        texts.push(count > 1 ? `--- page ${n} ---\n${body}` : body);
      }
      const text = texts.join("\n\n").trim();
      if (hasText(text)) return { text };
      const base = String(file.name || "bill").replace(/\.\w+$/, "");
      const pages = [];
      for (let n = 1; n <= count; n++) {
        const page = await doc.getPage(n);
        const one = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: PAGE_PX / Math.max(one.width, one.height) });
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(viewport.width);
        canvas.height = Math.round(viewport.height);
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport }).promise;
        const blob = await new Promise((r) => canvas.toBlob(r, "image/jpeg", 0.85));
        if (!blob) return {};
        pages.push(new File([blob], `${base}-page${n}.jpg`, { type: "image/jpeg" }));
      }
      return { pages };
    } finally {
      doc.destroy();
    }
  } catch (e) {
    console.warn("bill reader: could not open the PDF to read it:", e?.message || e);
    return {};
  }
}

/* -> the form the reader is sent: the bill itself ("files"), and for a PDF
   its text ("text") or its page pictures ("page" parts). */
export async function billForm(file) {
  const [small, pdf] = await Promise.all([shrinkPhoto(file), pdfForReading(file)]);
  const form = new FormData();
  form.append("files", small, small.name || "bill");
  if (pdf.text) form.append("text", pdf.text);
  for (const p of pdf.pages || []) form.append("page", p, p.name);
  return form;
}

const erpOrigin = () => {
  try {
    return new URL(AUTH_CONFIG.erpUrl).origin;
  } catch {
    return "";
  }
};
const tokenHeader = (t) => (/^(token|bearer)\s/i.test(String(t || "")) ? t : `token ${t}`);

/* slot: "da" (stay OR food, the bill decides) | "stays" | "foods" | "fuels" |
   "tolls"; trip: { id, from, to }
   -> { ok: true, bill } | { ok: false, reason }
   bill: { amount, billed, date, nights, vendor, url, fileName, fp, flag, signed } */
export async function readTripBill(file, slot, trip) {
  const bad = checkBillFile(file);
  if (bad) return { ok: false, reason: bad };
  const form = await billForm(file);
  let json;
  try {
    const res = await fetch("/api/claims/read-bill", {
      method: "POST",
      headers: {
        "x-erp-token": AUTH_CONFIG.authToken,
        "x-erp-endpoint": AUTH_CONFIG.erpUrl,
        "x-trip-bill": JSON.stringify({ slot, trip: { id: trip.id, from: trip.from, to: trip.to, ...(trip.eve ? { eve: trip.eve } : {}) } }),
      },
      body: form,
      signal: AbortSignal.timeout(150000),
    });
    json = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, reason: json.error || `The bill could not be read (HTTP ${res.status}).` };
  } catch (e) {
    return { ok: false, reason: e?.name === "TimeoutError" ? "Reading the bill took too long — try again." : "The bill could not be sent — check the connection and try again." };
  }
  return toBill(json);
}

/* The bill could not be read: the rep enters it by hand next to the photo,
   with the payment proof (GPay / UPI / bank screenshot) and why it is only a
   handwritten bill (12 Nov 2026).
   entry: { kind, date, checkIn, checkOut, amount, vendor, why }, proof: File
   -> as readTripBill */
export async function enterTripBill(file, slot, trip, entry, proof) {
  // the payment proof: asked for, optional while testing (12 Nov 2026)
  const bad = proof ? checkBillFile(proof) : null;
  if (bad) return { ok: false, reason: bad };
  const [small, proofSmall] = await Promise.all([shrinkPhoto(file), proof ? shrinkPhoto(proof) : null]);
  const form = new FormData();
  form.append("files", small, small.name || "bill");
  if (proofSmall) form.append("proof", proofSmall, proofSmall.name || "payment-proof");
  form.append("manual", JSON.stringify(entry || {}));
  let json;
  try {
    const res = await fetch("/api/claims/read-bill", {
      method: "POST",
      headers: {
        "x-erp-token": AUTH_CONFIG.authToken,
        "x-erp-endpoint": AUTH_CONFIG.erpUrl,
        "x-trip-bill": JSON.stringify({ slot, trip: { id: trip.id, from: trip.from, to: trip.to, ...(trip.eve ? { eve: trip.eve } : {}) } }),
        "x-manual-bill": "1",
      },
      body: form,
      signal: AbortSignal.timeout(90000),
    });
    json = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, reason: json.error || `The bill could not be added (HTTP ${res.status}).` };
  } catch {
    return { ok: false, reason: "The bill could not be sent — check the connection and try again." };
  }
  return toBill(json);
}

/* the route's answer -> { ok, bill } | { ok: false, reason, manual?, prefill? } */
function toBill(json) {
  const v = json.verdict || {};
  if (!v.ok) return { ok: false, reason: v.reason || "The bill could not be checked.", duplicate: !!v.duplicate, manual: !!v.manual, prefill: v.prefill || null };
  return {
    ok: true,
    bill: {
      manual: !!v.manual,
      // Stay | Food | Fuel | Toll -- for the one stay-and-food upload, the bill decides
      kind: v.kind,
      amount: v.amount,
      billed: v.billed,
      date: v.date,
      nights: v.nights || [],
      // a hotel bill's whole stay, so it can be spread over the cards it covers (23 Nov 2026)
      checkIn: v.checkIn || null,
      checkOut: v.checkOut || null,
      vendor: v.vendor || null,
      url: json.file?.url || null,
      fileName: json.file?.name || null,
      fp: json.fingerprint?.name || null,
      flag: json.fingerprint?.flag || null,
      // a handwritten bill: its payment proof and the rep's reason
      proof: json.proof?.url || null,
      proofName: json.proof?.name || null,
      cash: !!v.cash,
      why: v.why || null,
      signed: { read: json.read, sig: json.sig },
    },
  };
}

/* The rep took a bill off the trip: its fingerprint is freed, so it can be
   scanned again. Best effort -- a fingerprint left behind only blocks that
   same bill on another trip. */
export async function releaseTripBill(bill) {
  if (!bill?.fp) return;
  try {
    await fetch(`${erpOrigin()}/api/method/bill_fingerprint`, {
      method: "POST",
      headers: { Authorization: tokenHeader(AUTH_CONFIG.authToken), "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({ action: "release", name: bill.fp }),
    });
  } catch {
    /* best effort */
  }
}

/* Wakes nothing any more (the reader is a Cloudflare call); kept so callers
   need not change. */
export function warmReader() {}
