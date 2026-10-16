/* Words and numbers as the review sheet says them: rupees in full
   (never lakh / crore shorthand), months as "Aug 26", percentages to one place. Pure. */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/* ₹1,62,40,000 · ₹4,250 — always the full amount. A missing value is a dash, never 0. */
export function rupees(v, { sign = false } = {}) {
  if (v == null || Number.isNaN(v)) return '—';
  const s = sign && v > 0 ? '+' : v < 0 ? '−' : '';
  return `${s}₹${Math.round(Math.abs(v)).toLocaleString('en-IN')}`;
}

/* Full rupee amount, no symbol — for dense rows that carry a "₹" key. */
export function amount(v) {
  if (v == null || Number.isNaN(v)) return '—';
  return Math.round(v).toLocaleString('en-IN');
}

export function pct(v, { sign = false } = {}) {
  if (v == null || !Number.isFinite(v)) return '—';
  const s = sign && v > 0 ? '+' : v < 0 ? '−' : '';
  return `${s}${Math.abs(v * 100).toFixed(1)}%`;
}

export function ratio(v) {
  if (v == null || !Number.isFinite(v)) return '—';
  return `${v >= 10 ? Math.round(v) : v.toFixed(1)}×`;
}

/* "2026-08" → "Aug 26" / "August 2026". */
export function monthShort(m) {
  if (!m) return '';
  return `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(2, 4)}`;
}

export function monthLong(m) {
  if (!m) return '';
  const long = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
    'September', 'October', 'November', 'December'];
  return `${long[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
}

export function count(n, word, plural = `${word}s`) {
  return `${(n ?? 0).toLocaleString('en-IN')} ${n === 1 ? word : plural}`;
}
