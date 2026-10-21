/* Turning what was printed on a document ("₹1,23,456.50", "21/10/26",
 * "Sep-2026") into numbers, ISO dates and months. The model reads values
 * off the page as text; every comparison happens on these parsed forms, so
 * a model that formats a value oddly can never change a score. */

export function parseNumber(v) {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (v == null) return null;
  let s = String(v).trim();
  if (!s) return null;
  const negative = /^\(.*\)$/.test(s) || /^-/.test(s);
  s = s.replace(/[()]/g, "").replace(/(rs\.?|inr|₹|\$|€|£)/gi, "").replace(/[,\s]/g, "");
  const m = /-?\d+(\.\d+)?/.exec(s);
  if (!m) return null;
  const n = Math.abs(Number(m[0]));
  return negative ? -n : n;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const monthIndex = (name) => MONTHS.indexOf(String(name).slice(0, 3).toLowerCase());
const pad = (n) => String(n).padStart(2, "0");
const fullYear = (y) => (y < 100 ? 2000 + y : y);

function iso(y, m, d) {
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

/* Dates read Indian style: 03/04/2026 is 3 April, not March 4. */
export function parseDate(v) {
  if (v == null) return null;
  const s = String(v).trim();
  let m;
  if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s))) return iso(+m[1], +m[2], +m[3]);
  if ((m = /^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})$/.exec(s))) return iso(fullYear(+m[3]), +m[2], +m[1]);
  if ((m = /^(\d{1,2})[\s\-/.]*([a-z]{3,9})[\s\-/.,]*(\d{2,4})$/i.exec(s)) && monthIndex(m[2]) >= 0)
    return iso(fullYear(+m[3]), monthIndex(m[2]) + 1, +m[1]);
  if ((m = /^([a-z]{3,9})[\s\-/.]*(\d{1,2})(?:st|nd|rd|th)?[\s,\-/.]*(\d{2,4})$/i.exec(s)) && monthIndex(m[1]) >= 0)
    return iso(fullYear(+m[3]), monthIndex(m[1]) + 1, +m[2]);
  // An Excel serial (days since 1899-12-30), as a bare number in a sheet.
  if (/^\d{5}(\.\d+)?$/.test(s)) {
    const dt = new Date(Date.UTC(1899, 11, 30) + Math.floor(+s) * 86400000);
    return iso(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
  }
  return null;
}

export function parseMonth(v) {
  if (v == null) return null;
  const s = String(v).trim();
  let m;
  if ((m = /^(\d{4})-(\d{1,2})$/.exec(s)) && +m[2] >= 1 && +m[2] <= 12) return `${m[1]}-${pad(+m[2])}`;
  if ((m = /^(\d{1,2})[/.\-](\d{4})$/.exec(s)) && +m[1] >= 1 && +m[1] <= 12) return `${m[2]}-${pad(+m[1])}`;
  if ((m = /^([a-z]{3,9})[\s\-/.,']*(\d{2,4})$/i.exec(s)) && monthIndex(m[1]) >= 0) return `${fullYear(+m[2])}-${pad(monthIndex(m[1]) + 1)}`;
  const d = parseDate(s);
  return d ? d.slice(0, 7) : null;
}

export const normText = (v) => String(v ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export function daysBetween(a, b) {
  return Math.round(Math.abs(Date.parse(a) - Date.parse(b)) / 86400000);
}

/* "2%" -> relative 0.02; "50" / 50 -> absolute 50; missing -> exact. */
export function parseTolerance(t) {
  if (t == null || t === "") return { rel: 0, abs: 0 };
  if (typeof t === "number") return { rel: 0, abs: Math.abs(t) };
  const s = String(t).trim();
  if (s.endsWith("%")) return { rel: Math.abs(parseFloat(s)) / 100 || 0, abs: 0 };
  return { rel: 0, abs: Math.abs(parseFloat(s)) || 0 };
}
