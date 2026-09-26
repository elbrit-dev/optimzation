/* The overview's period: a contiguous run of months, held as month indices
 * (year * 12 + month0) so stepping and ranges are plain arithmetic.
 *
 * Contiguous, not a free set of months like the Support Report's picker: the
 * Sales Summary engine takes one date range, so a gap in the middle of a
 * selection could not be asked for in one query. */

export const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const FY_MON = ["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"];

export const idxOf = (d) => d.getFullYear() * 12 + d.getMonth();
export const yearOf = (i) => Math.floor(i / 12);
export const monOf = (i) => i % 12;
export const ymOfIdx = (i) => `${yearOf(i)}-${String(monOf(i) + 1).padStart(2, "0")}`;
export const fyOfIdx = (i) => (monOf(i) >= 3 ? yearOf(i) : yearOf(i) - 1);
export const fyStart = (fy) => fy * 12 + 3;
export const fyLabel = (fy) => `FY ${fy}-${String(fy + 1).slice(2)}`;
const labelOf = (i) => MON[monOf(i)] + " " + yearOf(i);
const pad = (n) => String(n).padStart(2, "0");
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function rangeLabel(from, to) {
  if (from === to) return labelOf(from);
  const fy = fyOfIdx(from);
  if (from === fyStart(fy) && to === fyStart(fy) + 11) return fyLabel(fy);
  if (fyOfIdx(to) === fy && (from - fyStart(fy)) % 3 === 0 && to - from === 2) return `Q${(from - fyStart(fy)) / 3 + 1} · ${fyLabel(fy)}`;
  return yearOf(from) === yearOf(to)
    ? `${MON[monOf(from)]} – ${MON[monOf(to)]} ${yearOf(to)}`
    : `${labelOf(from)} – ${labelOf(to)}`;
}

/* Everything the fetches and the tiles need to know about a period.
   `live` is the one case the design was drawn for -- this month, to date --
   and the only one with a pace, a "today" and a live visit feed. */
export function describePeriod({ from, to }, today) {
  const now = idxOf(today);
  const live = from === to && to === now;
  const includesNow = to >= now;
  const n = to - from + 1;
  const endOfTo = new Date(yearOf(to), monOf(to) + 1, 0);
  const clampTo = includesNow ? today : endOfTo;
  const day = today.getDate(), days = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  /* Pace across the whole period: the share of its days gone by. A closed
     period is all gone by, so it is judged against its full target. */
  const start = new Date(yearOf(from), monOf(from), 1);
  const dayMs = 86400000;
  const totalDays = Math.round((endOfTo - start) / dayMs) + 1;
  const elapsed = Math.min(totalDays, Math.round((new Date(clampTo.getFullYear(), clampTo.getMonth(), clampTo.getDate()) - start) / dayMs) + 1);
  return {
    from, to, live, closed: !includesNow, n, totalDays, elapsed, pace: elapsed / totalDays, left: totalDays - elapsed,
    label: rangeLabel(from, to),
    sub: live ? `Month to date · day ${day} of ${days}` : includesNow ? `${n} months · to date` : n === 1 ? "Closed" : `${n} months · closed`,
    fromDate: `${ymOfIdx(from)}-01`,
    toDate: iso(clampTo),
    endDate: iso(endOfTo),
    fromYm: ymOfIdx(from), toYm: ymOfIdx(to),
    day, days,
  };
}
