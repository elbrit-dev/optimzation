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

/* "5 Sep" — the short form, for a fact sitting beside a clock time on a card.
   `formatDayHeading` spells the weekday and the year because it heads a whole
   day's list; that is three times the width for a slot that has to sit next
   to "2:10 PM" without dwarfing it. Built from local parts for the same
   timezone reason parseISODate exists. */
export function formatPlanDay(iso) {
  const d = parseISODate(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
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

/* A Date -> the 'YYYY-MM' the data layer speaks. Read off local parts,
   never `toISOString().slice(0, 7)`, which is the UTC month and puts the
   first of the month into the previous one east of Greenwich. */
export function toMonthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/* '2026-08' -> 'Aug 2026'. The year is always there: a label naming a month
   without it makes the reader work out which year it meant. */
export function formatMonthName(month) {
  const [y, m] = String(month).split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

/* '2026-08' -> 'Aug', or 'Aug 2025' when it is not the year of `today`.
   Dropping the year in the common case keeps a KPI label to two words; a
   month from another year is a month you chose ON PURPOSE, and the year is
   the whole reason you chose it. */
function shortMonth(month, today) {
  const [y, m] = String(month).split('-').map(Number);
  return y === Number(today.slice(0, 4)) ? MONTHS[m - 1] : `${MONTHS[m - 1]} ${y}`;
}

/* What a label tacks on to say WHEN: 'today', 'MTD', 'Aug', 'Jun–Aug'.
 *
 * MTD survives as a word even though the period is now just "a month",
 * because on the month still running that is exactly what the number is —
 * eleven days, not a month — and "Visit plans Sep" over eleven days of data
 * would read as a full month that went badly. A range that ENDS in the
 * current month is the same story, so it keeps the marker too. */
export function periodSuffix(period, month, today, monthTo) {
  if (period !== 'month') return 'today';
  const current = today.slice(0, 7);
  const first = month ?? current;
  const last = monthTo ?? first;
  if (first === last) return first === current ? 'MTD' : shortMonth(first, today);
  const span = `${shortMonth(first, today)}–${shortMonth(last, today)}`;
  return last === current ? `${span} MTD` : span;
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

/* Chart axis and sheet titles: 9 -> '9AM', 12 -> '12PM', 17 -> '5PM'.
 *
 * It was '9a' / '5p', on the grounds that nine of these had to fit across
 * 338px without rotating. They do still have to fit — but a lone 'a' after a
 * numeral is not a word anyone reads as "am", and the axis was paying for
 * width it no longer needs now that the chart draws only the hours that
 * happened (see VisitsByHourChart). */
export function formatHour(hour) {
  const suffix = hour >= 12 ? 'PM' : 'AM';
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

/* How far from the planned location a call was logged. Metres under a
   kilometre, because "0.4 km" is the distance that decides whether a visit is
   geo-verified and three decimal places of a kilometre is the wrong unit to
   make that call in. Rounded to whole metres and one decimal km -- the GPS
   this comes from is not accurate enough to justify more. */
export function formatDistance(km) {
  if (km == null || !Number.isFinite(km)) return '—';
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
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

/* Every working day in the window, as 'YYYY-MM-DD'. Sunday is the only day
   off — this is a field force, and Saturday is a working day.

   THE DAYS THEMSELVES, not just how many, because the attendance drill-down
   needs to name the ones a rep was silent on and those include days nobody
   planned for them. Built by walking local Date parts for the same timezone
   reason parseISODate exists. */
export function workingDaysBetween(fromISO, toISO) {
  const end = parseISODate(toISO);
  const cursor = parseISODate(fromISO);
  const out = [];
  while (cursor <= end) {
    if (cursor.getDay() !== 0) {
      out.push(
        `${cursor.getFullYear()}-`
        + `${String(cursor.getMonth() + 1).padStart(2, '0')}-`
        + `${String(cursor.getDate()).padStart(2, '0')}`,
      );
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

export function countWorkingDays(fromISO, toISO) {
  return workingDaysBetween(fromISO, toISO).length;
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
