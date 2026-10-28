/* A bill read by rules alone, from Docling's text -- no AI model, no model
 * key (POST /v1/extract with "reader": "docling"). Fills a form while
 * someone waits: amount, date, shop and a general title. It cannot judge
 * printed vs handwritten, and a handwritten "+20" is not in Docling's text;
 * the full check on send (Docling + model) does that.
 *
 *   billFromText(markdown) -> { amount, date, vendor, title, readable } */

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

function amountOf(ls) {
  for (const word of TOTAL_WORDS) {
    for (let i = ls.length - 1; i >= 0; i--) {
      const l = ls[i];
      if (!word.test(l) || NOT_TOTAL.test(l) || NOT_AMOUNT.test(l)) continue;
      const here = moneyIn(l.replace(word, " "));
      const next = i + 1 < ls.length && !NOT_AMOUNT.test(ls[i + 1]) ? moneyIn(ls[i + 1]) : [];
      const found = here.length ? here : next;
      if (found.length) return found[found.length - 1].n;
    }
  }
  // No total line: the largest amount written like money (₹ / Rs / two decimals).
  const money = ls.filter((l) => !NOT_AMOUNT.test(l)).flatMap(moneyIn).filter(({ t }) => /₹|rs|inr|\.\d{2}\b/i.test(t));
  return money.length ? Math.max(...money.map((m) => m.n)) : null;
}

function dateOf(ls) {
  const pat = /(\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[/.\-]\d{1,2}[/.\-]\d{2,4}|\d{1,2}[\s\-/.]*[a-z]{3,9}[\s\-/.,]*\d{2,4}|[a-z]{3,9}[\s\-/.]*\d{1,2}(?:st|nd|rd|th)?[\s,\-/.]*\d{2,4})/gi;
  const today = new Date().toISOString().slice(0, 10);
  // A line that says "date" first, then any line.
  const order = [...ls.filter((l) => /date|dt[.:]/i.test(l)), ...ls];
  for (const l of order) for (const m of l.match(pat) || []) {
    const d = parseDate(m.trim());
    if (d && d <= today && d >= "2020-01-01") return d;
  }
  return null;
}

function vendorOf(ls) {
  for (const l of ls.slice(0, 6)) {
    if (/gstin|mob|phone|ph\b|tel|invoice|bill\s*no|date|table|road|street|nagar|\d{6}|tax|receipt|cash\s*memo/i.test(l)) continue;
    const letters = l.replace(/[^a-z]/gi, "");
    if (letters.length >= 3) return l.slice(0, 60);
  }
  return null;
}

export function billFromText(md) {
  const ls = lines(md);
  const all = ls.join("\n");
  const readable = all.replace(/[^a-z0-9]/gi, "").length >= 15;
  if (!readable) return { amount: null, date: null, vendor: null, title: null, readable };
  const title = (TITLES.find(([, re]) => re.test(all)) || [null])[0];
  return { amount: amountOf(ls), date: dateOf(ls), vendor: vendorOf(ls), title, readable };
}
