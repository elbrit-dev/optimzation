/* Reads the amount off a scanned bill with the app's existing bill reader
   (verify-doc, via the Claims feature's extractBill), so a fuel, toll or hotel
   scan fills its own amount as in the prototype. Best effort: anything that
   goes wrong (not signed in to Firebase, the reader asleep, a blurred photo)
   resolves to null and the rep types the amount instead. */

import { AUTH_CONFIG } from "@calendar/components/auth/calendar-users";

export const BILL_ACCEPT = "image/*,application/pdf";
export const BILL_MAX = 10 * 1024 * 1024;

export function checkBillFile(file) {
  if (!file) return "No file picked.";
  if (!/^image\//.test(file.type) && file.type !== "application/pdf") return "Only photos and PDFs can be attached.";
  if (file.size > BILL_MAX) return "That file is over 10 MB.";
  return null;
}

/* -> { amount, date, vendor } | null */
export async function readBill(file, what) {
  try {
    const api = await import("../../../../components/features/expense-claims/data/claimsApi");
    const conn = api.makeConn({ url: AUTH_CONFIG.erpUrl, token: AUTH_CONFIG.authToken });
    const r = await api.extractBill(conn, file, what);
    return r && r.amount ? { amount: Math.round(r.amount), date: r.date || null, vendor: r.vendor || null } : null;
  } catch (e) {
    console.warn("[field] bill not read:", e?.message || e);
    return null;
  }
}

/* Wakes the reader while the camera is open (it sleeps when idle). */
export function warmReader() {
  import("../../../../components/features/expense-claims/data/claimsApi")
    .then((api) => api.warmBillReader?.())
    .catch(() => {});
}
