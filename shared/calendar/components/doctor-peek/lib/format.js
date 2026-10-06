/**
 * Formatters, transcribed from the approved design's DCLogic helpers.
 *
 * The design pinned `NOW` to 2026-09-10 so its screenshots stayed stable. Here
 * it is the real clock — but it is still read through one function rather than
 * scattered `new Date()` calls, because the month window, the "x mo ago" spans
 * and the financial year all have to agree on which day it is. Two calls a
 * millisecond apart either side of midnight on 1 April would otherwise disagree
 * about the financial year.
 */

export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function now() {
  return new Date();
}

/** Midnight-local for a plain ERP date ("2026-04-30"). */
export function T(value) {
  if (value == null || value === "") return null;
  const text = String(value);
  // ERP hands back both "2026-04-30" and "2026-04-30 11:22:33.000000".
  const date = text.includes("T") ? new Date(text) : new Date(text.slice(0, 10) + "T00:00:00");
  const time = date.getTime();
  return Number.isFinite(time) ? time : null;
}

export function toNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (value == null || value === "") return 0;
  const n = Number(String(value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export function inrFull(n) {
  return "₹" + Math.round(toNumber(n)).toLocaleString("en-IN");
}

export function inrShort(n) {
  const v = toNumber(n);
  const a = Math.abs(v);
  if (a >= 1e7) return "₹" + (v / 1e7).toFixed(2) + "Cr";
  if (a >= 1e5) return "₹" + (v / 1e5).toFixed(2) + "L";
  if (a >= 1e3) return "₹" + Math.round(v / 1e3) + "k";
  return "₹" + Math.round(v);
}

/** The design's "Actual / Lacks" switch picks between the two. */
export function makeMoney(short) {
  return (n) => (short ? inrShort(n) : inrFull(n));
}

export function fdate(value) {
  const t = T(value);
  if (t == null) return "—";
  const x = new Date(t);
  return x.getDate() + " " + MONTHS[x.getMonth()] + " " + x.getFullYear();
}

/** "2 Sep" — the short form the banner's last-3 list uses. */
export function sdate(value) {
  const t = T(value);
  if (t == null) return "—";
  const x = new Date(t);
  return x.getDate() + " " + MONTHS[x.getMonth()];
}

export function monthLabel(y, m) {
  return MONTHS[m] + " " + String(y).slice(2);
}

export function roiText(v) {
  return v == null || !Number.isFinite(v) ? "—" : v.toFixed(2) + "x";
}

export function span(m) {
  if (m == null) return "—";
  if (m < 12) return m + " mo";
  const y = Math.floor(m / 12);
  const r = m % 12;
  return y + " yr" + (r ? " " + r + " mo" : "");
}

export function monthsSince(t, from = now()) {
  if (t == null) return null;
  const f = new Date(t);
  return (from.getFullYear() - f.getFullYear()) * 12 + (from.getMonth() - f.getMonth()) + 1;
}

export function plural(n, one, many) {
  return n + " " + (n === 1 ? one : many);
}

/**
 * The first two words' initials, which is what the design shows.
 *
 * Not first-and-last: Indian doctor names here are routinely "S. Ramesh Kumar"
 * or "Arpith M N", where the trailing words are themselves initials. Taking the
 * last word gives SK and AN; the design's SR and AM are the two the reader
 * actually recognises.
 */
export function initialsOf(name) {
  const parts = String(name ?? "")
    .replace(/^\s*(dr|prof|mr|mrs|ms)\.?\s+/i, "")
    .replace(/[.]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "—";
  return parts.slice(0, 2).map((p) => p[0]).join("").toUpperCase();
}

/** Lead.notes[].note is HTML. Flatten it; never inject it. */
export function stripHtml(value) {
  if (value == null) return "";
  return String(value)
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/(p|div|li|h[1-6])>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Bulk-imported doctors carry a literal "0" in every phone column, so a naive
 * truthiness check invites the reader to dial zero.
 */
export function realPhone(value) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits || /^0+$/.test(digits)) return null;
  return digits.length >= 6 ? String(value).trim() : null;
}
