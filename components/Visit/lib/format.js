/* Display formatting. Kept out of the components so the same number reads the
   same way in a card, a list row and a tree node.
 *
 * Everything here takes the value and returns a string. Nothing here computes
 * anything — that is selectors.js. */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/* Parsed manually rather than with `new Date(iso)`. A bare 'YYYY-MM-DD' is
   parsed as UTC by spec, so east of Greenwich `new Date('2026-09-06')` is the
   5th at 5:30am local and every date label lands a day early. */
function parseISODate(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function formatDayHeading(iso) {
  const d = parseISODate(iso);
  return `${DAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function formatMonthRange(fromISO, toISO) {
  const a = parseISODate(fromISO);
  const b = parseISODate(toISO);
  return `${a.getDate()}–${b.getDate()} ${MONTHS[b.getMonth()]} ${b.getFullYear()}`;
}

/* '2026-09-05 16:04:00' -> '4:04 PM'. Reads the string rather than
   constructing a Date, for the same timezone reason as above. */
export function formatClock(stamp) {
  if (!stamp) return null;
  const h = Number(stamp.slice(11, 13));
  const m = stamp.slice(14, 16);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m} ${suffix}`;
}

/* Chart axis: 9 -> '9a', 12 -> '12p', 17 -> '5p'. Short because nine of these
   have to fit across 338px without rotating. */
export function formatHour(hour) {
  const suffix = hour >= 12 ? 'p' : 'a';
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}${suffix}`;
}

/* Returns an em dash for null, which is what selectors return for "no plan".
   Never renders '0%' for a missing ratio — see attainment() for why. */
export function formatPercent(ratio) {
  if (ratio == null || !Number.isFinite(ratio)) return '—';
  return `${Math.round(ratio * 100)}%`;
}

export function formatRatio(done, total) {
  if (!total) return '—';
  return `${done}/${total}`;
}

export function formatDecimal(value, places = 1) {
  if (value == null || !Number.isFinite(value)) return '—';
  return value.toFixed(places);
}

/* ₹1,800 under a lakh, ₹1.8 L up to a crore, ₹1.20 Cr above -- the Indian
   grouping the reference design itself uses ("POB COLLECTED ₹1.8 L"), not a
   Western thousands/millions split that would put the decimal in the wrong
   place for anyone reading this as rupees. Null is '—', same as every other
   formatter here -- see attainment() for why a missing figure is never a
   bare 0. */
export function formatCurrency(amount) {
  if (amount == null || !Number.isFinite(amount)) return '—';
  const abs = Math.abs(amount);
  if (abs >= 1e7) return `₹${(amount / 1e7).toFixed(2)} Cr`;
  if (abs >= 1e5) return `₹${(amount / 1e5).toFixed(1)} L`;
  return `₹${Math.round(amount).toLocaleString('en-IN')}`;
}

/* 'HQ-Hubballi' -> 'Hubballi'. The prefix is an ERPNext naming convention, not
   information — every territory on this screen is an HQ. */
export function hqLabel(hq) {
  return String(hq ?? '').replace(/^HQ-\s*/, '');
}

export function countWorkingDays(fromISO, toISO) {
  const end = parseISODate(toISO);
  const cursor = parseISODate(fromISO);
  let n = 0;
  while (cursor <= end) {
    if (cursor.getDay() !== 0) n += 1;
    cursor.setDate(cursor.getDate() + 1);
  }
  return n;
}

/* Attainment -> tone. ONE copy: HqCard and TeamTree both colour a bar by "how
   close to plan", and two thresholds would have them disagree about the same
   rep on the same screen.

   The bands are 80 / 50, not 80 / 60. With 60 as the floor, a mid-afternoon
   read — where nothing is finished yet — painted every bar on the page red,
   and a colour that is always red carries no information. At 50 the routine
   afternoon spread (53%, 54%, 59%) reads amber and a genuine laggard (35%)
   still reads red, which is the distinction the colour exists to make.

   Returns `neutral` for no plan at all: a vacant territory has not failed. */
export function attainmentTone(ratio) {
  if (ratio == null || !Number.isFinite(ratio)) return 'neutral';
  if (ratio >= 0.8) return 'success';
  if (ratio >= 0.5) return 'warning';
  return 'danger';
}
