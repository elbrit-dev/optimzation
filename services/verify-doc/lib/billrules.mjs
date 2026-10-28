/* A bill read by rules alone, from Docling's text -- no AI model, no model
 * key (POST /v1/extract with "reader": "docling"). Fills a form while
 * someone waits: amount, date, shop and a general title. It cannot judge
 * printed vs handwritten, and a handwritten "+20" is not in Docling's text;
 * the full check on send (Docling + model) does that.
 *
 *   billFromText(markdown) -> { amount, date, vendor, title, vendor_gstin,
 *     invoice_no, customer, payment_mode, readable } */

import { parseDate, parseNumber } from "./parse.mjs";

// The line that holds what was paid, strongest first.
const TOTAL_WORDS = [
  /grand\s*total/i, /net\s*(amount|payable|total)/i, /amount\s*(payable|paid|due)/i, /total\s*(fare|amount|payable)/i,
  /bill\s*amount/i, /to\s*pay/i, /\btotal\b/i, /\bcash\b/i, /\bpaid\b/i, /\bfare\b/i, /\bamount\b/i, /\bnet\b/i,
];
const NOT_TOTAL = /sub\s*-?\s*total|cgst|sgst|igst|\bgst\b|\btax\b|discount|round\s*off|savings|change\s*due|tender/i;
// Numbers that are never the amount: phone, GSTIN, PIN, bill / table numbers.
const NOT_AMOUNT = /mob|phone|ph\b|tel|gstin|pin\b|pincode|invoice\s*no|bill\s*no|\bno[.:]|table|kot|token|order\s*id|pnr|vehicle/i;

const TITLES = [
  ["Cab bill", /\b(ola|uber|rapido|cab|taxi|ride\s*(fare|details)|trip\s*fare)\b/i],
  ["Auto bill", /\bauto(\s*rickshaw)?\b/i],
  ["Fuel bill", /\b(petrol|diesel|fuel|hpcl|iocl|bpcl|indian\s*oil|bharat\s*petroleum|hindustan\s*petroleum|nozzle|litre|ltr)\b/i],
  ["Train ticket", /\b(irctc|pnr|train|railway|coach|berth)\b/i],
  ["Flight ticket", /\b(flight|airline|boarding|indigo|air\s*india|vistara|akasa)\b/i],
  ["Bus ticket", /\b(bus|redbus|ksrtc|tnstc|setc|msrtc|seat\s*no)\b/i],
  ["Toll", /\b(toll|fastag|plaza)\b/i],
  ["Parking", /\bparking\b/i],
  ["Hotel bill", /\b(room|lodge|check[\s-]*in|check[\s-]*out|tariff|stay|night\(?s\)?)\b/i],
  ["Medicine", /\b(pharma|pharmacy|medical|medicals|chemist|tablet|tab\.|capsule|syrup)\b/i],
  ["Courier", /\b(courier|consignment|awb|dtdc|blue\s*dart|delhivery|speed\s*post)\b/i],
  ["Mobile recharge", /\b(recharge|prepaid|airtel|jio|vodafone|\bvi\b|bsnl)\b/i],
  ["Stationery", /\b(stationery|xerox|photocopy|print\s*out|printout|pen|notebook|a4)\b/i],
  ["Food bill", /\b(restaurant|hotel|cafe|caf[eé]|meals?|rice|biryani|tea|coffee|dosa|idli|parotta|chapati|curry|soda|juice|lunch|dinner|breakfast|kot|waiter|table|veg|chicken|fish|mutton|bakery|sweets)\b/i],
];

const lines = (md) =>
  String(md || "")
    .split(/\r?\n/)
    .map((l) => l.replace(/^#+\s*/, "").replace(/\|/g, "  ").replace(/[*_`]/g, "").replace(/\s+/g, " ").trim())
    .filter((l) => l && !/^[-:\s]+$/.test(l));

// Money-looking numbers on a line (1,234.50 / 950.00 / ₹ 65), not dates or long codes.
const moneyIn = (l) =>
  (l.replace(/\d{1,2}[/.\-]\d{1,2}[/.\-]\d{2,4}/g, " ").replace(/\d{1,2}:\d{2}(:\d{2})?/g, " ").match(/(?:₹|rs\.?|inr)?\s*\d[\d,]*(?:\.\d{1,2})?/gi) || [])
    .map((t) => ({ t, n: parseNumber(t) }))
    .filter(({ t, n }) => n != null && n > 0 && n < 1000000 && t.replace(/\D/g, "").length <= 8);

// Written like money (₹ 950.00 / Rs 65 / 85.00), not a bare count or code.
const MONEY = /₹|rs|inr|\.\d{2}\b/i;
// The words that name the bill's total outright; a bare number beside one of
// these (on the same line) is trusted. "Total" / "Cash" alone are not enough.
const STRONG = /grand\s*total|net\s*(amount|payable|total)|amount\s*(payable|paid|due)|total\s*(fare|amount|payable)|bill\s*amount|to\s*pay/i;

// An item line: words, then at least two money amounts (rate, amount); its
// last one is what the line costs. A total can never be below one of these.
function itemsOf(ls) {
  return ls
    .filter((l) => /[a-z]{3}/i.test(l) && !TOTAL_WORDS.some((w) => w.test(l)) && !NOT_TOTAL.test(l) && !NOT_AMOUNT.test(l))
    .map((l) => moneyIn(l).filter((x) => /\.\d{2}\b/.test(x.t)))
    .filter((xs) => xs.length >= 2)
    .map((xs) => xs[xs.length - 1].n);
}

/* The amount, or null when it is not certain -- a blank field the person fills
 * beats a wrong one. Taken only from a line that names the total: written like
 * money there or within the next two lines (Docling may split a receipt's
 * "CASH" and "₹ 950.00", with the till line "C 1 15:48:20" between), or a bare
 * number on the same line as a word like "Grand Total". Never below the
 * dearest item line. No total line -> null (no "largest number" guessing). */
function amountOf(ls) {
  const items = itemsOf(ls);
  const floor = items.length ? Math.max(...items) : 0;
  for (const word of TOTAL_WORDS) {
    for (let i = ls.length - 1; i >= 0; i--) {
      const l = ls[i];
      if (!word.test(l) || NOT_TOTAL.test(l) || NOT_AMOUNT.test(l)) continue;
      const here = moneyIn(l.replace(word, " "));
      const next = ls.slice(i + 1, i + 3).filter((n) => !NOT_AMOUNT.test(n) && !TOTAL_WORDS.some((w) => w.test(n))).flatMap(moneyIn);
      const sure = [here.filter((x) => MONEY.test(x.t)), next.filter((x) => MONEY.test(x.t)), STRONG.test(l) ? here.filter((x) => x.n >= 10) : []]
        .find((xs) => xs.length);
      if (!sure) continue;
      const n = sure[sure.length - 1].n;
      if (n >= floor) return n;
    }
  }
  return null;
}

// The date, or null when it is not certain: from a line that says "date"
// (or "dt"), else only when the whole bill holds exactly one date.
function dateOf(ls) {
  const pat = /(\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[/.\-]\d{1,2}[/.\-]\d{2,4}|\d{1,2}[\s\-/.]*[a-z]{3,9}[\s\-/.,]*\d{2,4}|[a-z]{3,9}[\s\-/.]*\d{1,2}(?:st|nd|rd|th)?[\s,\-/.]*\d{2,4})/gi;
  const today = new Date().toISOString().slice(0, 10);
  const datesIn = (l) => (l.match(pat) || []).map((m) => parseDate(m.trim())).filter((d) => d && d <= today && d >= "2020-01-01");
  for (const l of ls.filter((x) => /date|dt[.:]/i.test(x))) {
    const d = datesIn(l);
    if (d.length) return d[0];
  }
  const all = [...new Set(ls.flatMap(datesIn))];
  return all.length === 1 ? all[0] : null;
}

// The shop's name: an early line of words only -- no digits, no address or
// header words. Null rather than an address or a garbled line.
const NOT_VENDOR = /gstin|mob|phone|ph\b|tel|invoice|bill\s*no|date|table|road|\brd\b|street|\bst\b|nagar|layout|cross|bldg|building|floor|near|behind|opp|tax|receipt|cash\s*memo|thank|welcome|dealers?\s*in|\bII\b|prasanna|namah|\bom\b|description|particulars|\bqty\b|quantity|\brate\b|amount|\bitems?\b|price/i;
function vendorOf(ls) {
  for (const l of ls.slice(0, 6)) {
    if (/\d/.test(l) || NOT_VENDOR.test(l)) continue;
    const words = l.split(/\s+/).filter((w) => /^[a-z&'.-]+$/i.test(w));
    if (words.length && words.join("").replace(/[^a-z]/gi, "").length >= 3 && words.length === l.split(/\s+/).length) return l.slice(0, 60);
  }
  return null;
}

// A GSTIN: 2 digits, PAN (5 letters, 4 digits, a letter), entity, Z, check.
const GSTIN = /\b(\d{2}[A-Z]{5}\d{4}[A-Z][0-9A-Z]Z[0-9A-Z])\b/;
function gstinOf(ls) {
  for (const l of ls) {
    const m = GSTIN.exec(l.toUpperCase().replace(/[\s.]/g, "")) || (/gst/i.test(l) && /([0-9A-Z]{15})/.exec(l.toUpperCase().replace(/[\s.:-]/g, "").replace(/^.*?GSTI?N?/, "")));
    if (m) return m[1];
  }
  return null;
}

function invoiceOf(ls) {
  for (const l of ls) {
    if (/gstin|mob|phone|table/i.test(l)) continue;
    const m = /\b(?:bill|invoice|inv|receipt|ride|order|ticket|txn|transaction)\s*(?:no|number|id|#)?\s*[.:#-]*\s*([A-Z0-9][A-Z0-9/-]{1,24})/i.exec(l) || /^\s*no[.:]\s*([A-Z0-9][A-Z0-9/-]{1,24})/i.exec(l);
    if (m && /\d/.test(m[1])) return m[1];
  }
  return null;
}

function customerOf(ls) {
  for (const l of ls) {
    const m = /\b(?:customer|bill\s*to|billed\s*to|guest|passenger|name)\s*(?:name)?\s*[:-]\s*([A-Za-z][A-Za-z .]{1,50})/i.exec(l);
    if (m) return m[1].trim();
  }
  return null;
}

const PAY = [["UPI", /\b(upi|gpay|google\s*pay|phonepe|paytm|bhim)\b/i], ["Card", /\b(card|visa|master\s*card|rupay|credit|debit)\b/i], ["FASTag", /\bfastag\b/i], ["Wallet", /\bwallet\b/i], ["Cash", /\bcash\b/i]];

export function billFromText(md) {
  const ls = lines(md);
  const all = ls.join("\n");
  const readable = all.replace(/[^a-z0-9]/gi, "").length >= 15;
  const none = { amount: null, date: null, vendor: null, title: null, vendor_gstin: null, invoice_no: null, customer: null, payment_mode: null };
  if (!readable) return { ...none, readable };
  const title = (TITLES.find(([, re]) => re.test(all)) || [null])[0];
  return {
    amount: amountOf(ls), date: dateOf(ls), vendor: vendorOf(ls), title,
    vendor_gstin: gstinOf(ls), invoice_no: invoiceOf(ls), customer: customerOf(ls),
    payment_mode: (PAY.find(([, re]) => re.test(all)) || [null])[0],
    readable,
  };
}
