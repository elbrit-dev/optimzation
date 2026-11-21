/* A date as printed on an Indian bill -> "YYYY-MM-DD", in plain code
   (20 Nov 2026).

   Gemma copies each date exactly as printed ("01/10/2026", "01-Oct-2026",
   "01.10.26 19:40"). Clairic, which turned that text into a date, stopped
   giving one back for day/month/year text -- only "1 Oct 2026" and
   "2026-10-01" came through -- so every printed bill went to hand entry.
   It had also read "3/10/26" as 3 August (its "3/8/26" example leaking).
   Indian bills are day/month/year, so this needs no AI: the reader takes
   the date from here, and from Clairic only when this cannot place it.

   Understood (any of / - . or spaces between the parts, a time after it is
   ignored, "1st" / "2nd" ... allowed):
     day/month/year     01/10/2026, 1-10-26, 01.10.2026 19:40
     day month-name     01-Oct-2026, 1 October 2026, 1st Oct '26, 01Oct2026,
                        5th of October, 2026
     month-name day     Oct 1, 2026
     year-month-day     2026-10-01, 2026/10/01
   Anything else -- a missing year, month/day/year that cannot be told apart
   from day/month/year (it is always taken as day/month), an impossible day
   like 31/02 -- gives null. */

const MONTHS = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5, jun: 6, june: 6,
  jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10,
  nov: 11, november: 11, dec: 12, december: 12,
};

const pad = (n) => String(n).padStart(2, "0");

function iso(y, m, d) {
  let year = Number(y);
  if (String(y).length === 2) year += 2000;
  const month = Number(m), day = Number(d);
  if (!(year >= 2000 && year <= 2099 && month >= 1 && month <= 12 && day >= 1 && day <= 31)) return null;
  const dt = new Date(Date.UTC(year, month - 1, day));
  if (dt.getUTCMonth() !== month - 1 || dt.getUTCDate() !== day) return null; // 31/02, 29/02 in a non-leap year
  return `${year}-${pad(month)}-${pad(day)}`;
}

const SEP = "[\\s./,-]*";
const DAY = "(\\d{1,2})(?!\\d)(?:st|nd|rd|th)?";
const YEAR = "'?(\\d{4}|\\d{2})";
const NAME = "([a-z]{3,9})\\.?";
const PATTERNS = [
  // 2026-10-01, 2026/10/01
  [new RegExp(`^(\\d{4})[./-](\\d{1,2})[./-](\\d{1,2})(?!\\d)`), (m) => iso(m[1], m[2], m[3])],
  // 01/10/2026, 1-10-26, 01.10.2026 (always day first)
  [new RegExp(`^(\\d{1,2})[./-](\\d{1,2})[./-](\\d{4}|\\d{2})(?!\\d)`), (m) => iso(m[3], m[2], m[1])],
  // 01-Oct-2026, 1 October 2026, 1st Oct '26, 01Oct2026
  [new RegExp(`^${DAY}${SEP}${NAME}${SEP}${YEAR}(?!\\d)`), (m) => (MONTHS[m[2]] ? iso(m[3], MONTHS[m[2]], m[1]) : null)],
  // Oct 1, 2026
  [new RegExp(`^${NAME}${SEP}${DAY}${SEP}${YEAR}(?!\\d)`), (m) => (MONTHS[m[1]] ? iso(m[3], MONTHS[m[1]], m[2]) : null)],
];

export function billDate(text) {
  if (text == null) return null;
  const s = String(text)
    .trim()
    .toLowerCase()
    .replace(/^(date|dt|dated)\s*[:.-]?\s*/, "")
    // a leading weekday, as cab receipts print it ("Wednesday, 7 October 2026", "Wed, 7 Oct"): 21 Nov 2026
    .replace(/^(mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)(day|sday|nesday|rsday|urday)?\.?,?\s+/, "")
    .replace(/\s+of\s+/g, " ");
  if (!s || s === "null") return null;
  for (const [re, make] of PATTERNS) {
    const m = s.match(re);
    if (m) return make(m);
  }
  return null;
}
