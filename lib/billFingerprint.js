/**
 * A bill's fingerprint (12 Nov 2026): three hashes that catch the same bill
 * coming back, checked by the ERP's "Bill Fingerprint API" across every
 * employee. Server only (node:crypto, sharp).
 *
 *   fileHash     SHA-256 of the file's bytes          -> the exact same file
 *   imageHash    64-bit difference hash of the picture -> the same photo
 *                resized, recompressed or screenshotted (near = 6 or fewer
 *                differing bits; PDFs have none)
 *   contentHash  SHA-256 of what the AI read: bill no (billKey) | date |
 *                total, else vendor | date | total -> kept on the row.
 *
 * The ERP script decides (16 Nov 2026), field by field, not on this one hash:
 * a read is not the same letter for letter every time ("INV 2610..." vs
 * "2610...", "13OCT" vs "130CT", the vendor with or without its address).
 * See share/src/app/field-expense/server/bill_fingerprint_api.py.
 */
import crypto from "node:crypto";

const sha256 = (data) => crypto.createHash("sha256").update(data).digest("hex");

export const fileHash = (buf) => sha256(buf);

/* dHash: the picture in grey at 9×8, each pixel against its right-hand
   neighbour -> 64 bits -> 16 hex. null when it is not a picture sharp reads. */
export async function imageHash(buf, type) {
  if (!/^image\//i.test(type || "")) return null;
  try {
    const sharp = (await import("sharp")).default;
    const px = await sharp(buf).rotate().greyscale().resize(9, 8, { fit: "fill" }).raw().toBuffer();
    let hex = "";
    for (let y = 0; y < 8; y++) {
      let byte = 0;
      for (let x = 0; x < 8; x++) byte = (byte << 1) | (px[y * 9 + x] > px[y * 9 + x + 1] ? 1 : 0);
      hex += byte.toString(16).padStart(2, "0");
    }
    return hex;
  } catch (e) {
    console.warn("imageHash:", e.message);
    return null;
  }
}

const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

/* A bill number by its digits, as the ERP script compares them (bill_key
   there -- keep the two the same): the letters in front dropped, O read as 0,
   I / l as 1, then only the digits. "INV 261021IMRTN05360" and
   "261021IMRTN05360" -> "261021105360"; "UBR-8F2K-13OCT" and "...130CT" ->
   "82130". "" when under 4 digits. */
export function billKey(s) {
  const t = norm(s).replace(/^[a-z]+/, "");
  const out = t.replace(/o/g, "0").replace(/[il]/g, "1").replace(/[^0-9]/g, "").replace(/^0+/, "");
  return out.length >= 4 ? out : "";
}

/* -> { hash, strong } | null (nothing to key on) */
export function contentHash(values) {
  const v = values || {};
  const who = norm(v.gstin).length === 15 ? norm(v.gstin) : norm(v.vendor);
  const no = billKey(v.bill_no);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(v.date || "")) ? v.date : "";
  const total = typeof v.total === "number" && v.total > 0 ? String(Math.round(v.total)) : "";
  if (!total || !date || (!who && !no)) return null;
  return { hash: sha256((no ? ["no", no, date, total] : ["who", who, date, total]).join("|")), strong: !!no };
}
