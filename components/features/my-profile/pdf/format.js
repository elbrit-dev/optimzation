// Pure helpers shared by the PDF templates. No React, no @react-pdf imports -
// everything here is unit-testable on its own.

const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
  "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function wordsUnder1000(value) {
  if (value < 20) return ONES[value];
  if (value < 100) {
    const rest = value % 10;
    return TENS[Math.floor(value / 10)] + (rest ? ` ${ONES[rest]}` : "");
  }
  const rest = value % 100;
  return `${ONES[Math.floor(value / 100)]} Hundred${rest ? ` ${wordsUnder1000(rest)}` : ""}`;
}

/** "₹1,10,260" -> 110260. Returns null when there is no number to read. */
export function parseAmount(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const digits = String(value ?? "").replace(/[^\d.-]/g, "");
  if (!digits || digits === "-" || digits === ".") return null;
  const parsed = Number(digits);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Indian grouping with two decimals: 222400 -> "₹ 2,22,400.00". */
export function formatAmount(value, { symbol = "₹", decimals = 2 } = {}) {
  const amount = parseAmount(value);
  if (amount === null) return String(value ?? "");
  const body = amount.toLocaleString("en-IN", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return symbol ? `${symbol} ${body}` : body;
}

/** Indian numbering, matching the ERP wording: "INR Two Lakh, ... only." */
export function amountInWords(value) {
  const amount = parseAmount(value);
  if (amount === null) return "";

  const whole = Math.abs(Math.round(amount));
  if (whole === 0) return "INR Zero only.";

  const groups = [
    [Math.floor(whole / 10000000), "Crore"],
    [Math.floor((whole % 10000000) / 100000), "Lakh"],
    [Math.floor((whole % 100000) / 1000), "Thousand"],
  ];

  const parts = groups
    .filter(([count]) => count > 0)
    .map(([count, unit]) => `${wordsUnder1000(count)} ${unit}`);

  // The hundreds and the remainder read as one phrase - "Four Hundred Sixty",
  // not "Four Hundred, Sixty".
  const tail = whole % 1000;
  if (tail) parts.push(wordsUnder1000(tail));

  return `INR ${amount < 0 ? "Minus " : ""}${parts.join(", ")} only.`;
}

/**
 * "01 Jul - 31 Jul 2026" -> { start: "01 Jul 2026", end: "31 Jul 2026" }.
 * The start half usually omits the year, so borrow it from the end.
 */
export function splitPeriod(period) {
  const text = String(period ?? "").trim();
  if (!text) return { start: "", end: "" };

  const halves = text.split(/\s*[-–—]\s*/);
  if (halves.length < 2) return { start: "", end: text };

  const [start, end] = halves;
  const year = (end.match(/\b(\d{4})\b/) || [])[1];
  return {
    start: year && !/\b\d{4}\b/.test(start) ? `${start} ${year}` : start,
    end,
  };
}

/** "31 of 31" -> { payment: 31, working: 31, lossOfPay: 0 }. */
export function splitPayableDays(value) {
  const numbers = String(value ?? "").match(/[\d.]+/g);
  if (!numbers || !numbers.length) return null;

  const payment = Number(numbers[0]);
  const working = numbers.length > 1 ? Number(numbers[1]) : payment;
  if (!Number.isFinite(payment) || !Number.isFinite(working)) return null;

  return {
    payment: payment.toFixed(1),
    working: working.toFixed(1),
    lossOfPay: Math.max(0, working - payment).toFixed(1).replace(/\.0$/, ""),
  };
}

/** "Joined 01 Apr 2014" -> "01 Apr 2014". */
export function stripPrefix(value, prefix) {
  const text = String(value ?? "").trim();
  return text.toLowerCase().startsWith(prefix.toLowerCase())
    ? text.slice(prefix.length).trim()
    : text;
}

export function findValue(items, label) {
  if (!Array.isArray(items)) return "";
  const match = items.find((item) => item?.label === label);
  return match ? match.value : "";
}

/** File-system-safe download name. */
export function downloadName(value, fallback) {
  const slug = String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || fallback;
}
