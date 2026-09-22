/* Pure aggregation over VisitRow[] and TeamMember[].
 *
 * Every number on the screen comes from a function in this file. None of them
 * touch React, the network, or the clock — which is what makes the whole
 * dashboard testable without rendering it, and what lets the mock and the live
 * source share one code path.
 *
 * If you find yourself computing a total inside a component, it belongs here.
 */

import { ATTENDANCE, MANAGER_LEVELS, shortDesignation } from './shape';

/* ---- Scope: which people, and therefore which rows ------------------- */

/* Everyone below `rootId`, inclusive. Iterative rather than recursive because
   the live roster is ~400 people and a cycle in reports_to (which ERPNext does
   not prevent) would blow the stack. The `seen` set makes a cycle terminate
   instead. */
export function subtreeOf(team, rootId) {
  const byParent = new Map();
  for (const m of team) {
    const key = m.reportsTo ?? '__root__';
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push(m);
  }

  const root = team.find((m) => m.id === rootId);
  if (!root) return [];

  const out = [];
  const seen = new Set();
  const stack = [root];
  while (stack.length) {
    const node = stack.pop();
    if (seen.has(node.id)) continue;
    seen.add(node.id);
    out.push(node);
    stack.push(...(byParent.get(node.id) ?? []));
  }
  return out;
}

export function childrenOf(team, parentId) {
  return team.filter((m) => m.reportsTo === parentId);
}

/* Sales managers with no SALES manager above them -- the top of one or more
   disconnected trees in the roster. Not "reports_to is null": a real head of
   Sales can (and on a live roster, does) report to a CEO or MD who is
   themselves outside MANAGER_LEVELS on purpose (see shape.js), so their own
   reports_to is never null. What makes them a root here is that whoever they
   report to is not ANOTHER sales manager, which is exactly as true for the
   genuine head of Sales as it is for an orphaned manager record whose real
   manager is missing, inactive, or non-sales.

   Sorted by name -- ScopeSelect renders the picker's own top level straight
   from this, so it needs a stable, readable order regardless of which one
   `largestManagerRoot` below picks as the default. */
export function managerRoots(team) {
  const managers = team.filter((m) => MANAGER_LEVELS.has(shortDesignation(m.designation)));
  const managerIds = new Set(managers.map((m) => m.id));
  return managers.filter((m) => !managerIds.has(m.reportsTo)).sort((a, b) => a.name.localeCompare(b.name));
}

/* The root `useVisitKpi` opens on by default. NOT `managerRoots(team)[0]`:
   alphabetical order has no relationship to which root is the genuine head
   of Sales versus an orphan whose `reports_to` dangles on a deleted or
   inactive record -- and a live roster can and does have both at once (found
   on UAT: a GM heading ~490 real reports, alongside an RBM and a vacant ABM
   seat both pointing at IDs that no longer resolve, and "Hashim" sorted
   before "Rajkumar"). Subtree size is the one signal available from the data
   itself that tells them apart: a dangling reference roots a tree of one,
   the real org does not. */
export function largestManagerRoot(team) {
  const roots = managerRoots(team);
  if (roots.length <= 1) return roots[0];
  return roots.reduce((best, r) => (subtreeOf(team, r.id).length > subtreeOf(team, best.id).length ? r : best));
}

/* ---- Period ---------------------------------------------------------- */

/* The last calendar day of a 'YYYY-MM'. Day 0 of the NEXT month, which is
   how you get 28 / 29 / 30 / 31 right with no leap-year table. Built from
   local Date PARTS, never from an ISO string — `new Date('2026-08-01')` is
   parsed as UTC by spec, so east of Greenwich it is July 31st and every
   month here would end a day early. Same trap format.js documents. */
export function monthEnd(month) {
  const [y, m] = String(month).split('-').map(Number);
  const last = new Date(y, m, 0);
  return `${month}-${String(last.getDate()).padStart(2, '0')}`;
}

/* One window for both periods. The months are parameters rather than always
 * being the current one, and `monthTo` defaults to `month` so the common
 * case — one month — is a one-month range and needs no second concept.
 *
 * THE LAST MONTH STOPS AT TODAY. That is what used to be called "month till
 * date" and it is not a special mode: it falls out of clamping the window to
 * `today`. A window running to the 30th of a month that is eleven days old
 * would divide eleven days of visits by a full month of working days (see
 * callAverage) and report every rep on the screen as behind. A month that is
 * genuinely over runs to its own last day.
 *
 * Both default to the month `today` falls in, so a caller that has picked
 * nothing gets exactly the old month-till-date behaviour. */
export function periodWindow(period, today, month, monthTo) {
  if (period !== 'month') return { from: today, to: today };
  const first = month ?? today.slice(0, 7);
  const last = monthTo ?? first;
  const end = monthEnd(last);
  return { from: `${first}-01`, to: end < today ? end : today };
}


export function inPeriod(rows, { from, to }) {
  return rows.filter((r) => r.plannedDate >= from && r.plannedDate <= to);
}

export function forEmployees(rows, employeeIds) {
  const set = employeeIds instanceof Set ? employeeIds : new Set(employeeIds);
  return rows.filter((r) => set.has(r.employeeId));
}

/* ---- The headline numbers -------------------------------------------- */

export const planned = (rows) => rows.length;

export const happened = (rows) => rows.reduce((n, r) => n + (r.visitTime ? 1 : 0), 0);

/* Returns null rather than 0 for an empty plan. A rep with no plan has no
   attainment; showing 0% would read as failure rather than as absence, and
   the vacant seats in every team make this the common case, not the edge. */
export function attainment(rows) {
  if (rows.length === 0) return null;
  return happened(rows) / rows.length;
}

export function pobGiven(rows) {
  const done = rows.filter((r) => r.visitTime);
  return { given: done.filter((r) => r.pobGiven).length, of: done.length };
}

/* The real ₹ figure `pobGiven` above can't provide -- see shape.js's PobEntry
   for the doctype it comes from and the ASSUMED join this rests on. `rows`
   here are PobEntry, not VisitRow, but deliberately shaped with the same
   `employeeId` / `plannedDate` fields so `forEmployees`/`inPeriod` scope them
   exactly like a VisitRow, with no second copy of that filtering logic. */
export function pobTotal(pobRows) {
  return pobRows.reduce((sum, r) => sum + (r.amount || 0), 0);
}

/* Calls per rep PER DAY.
 *
 * Two divisors, and leaving either out produces a number that looks right and
 * is not:
 *
 *   - by reps who actually WORKED, not by headcount. A team with four
 *     vacancies otherwise reports an average no individual would recognise.
 *   - by WORKING DAYS. The company standard (12) is a per-day figure, so a
 *     month-to-date view that skips this reports 46 against a target of 12 and
 *     every rep looks like a hero.
 */
export function callAverage(rows, workingCount, workingDays = 1) {
  if (!workingCount || !workingDays) return null;
  return happened(rows) / workingCount / workingDays;
}

/* How many distinct BEs logged at least one visit in this row set. The
   denominator for callAverage, and NOT the same as attendance().working once
   the period is wider than a day — over a month it counts anyone who worked at
   any point, which is exactly right for an average and exactly wrong for
   "who is in the field".

   BE only, same rule `repCount` and `byHq` already use -- `rows` is keyed by
   `Event.custom_employee_id`, which the live workflow only ever sets to a
   field rep, but nothing enforces that at the data layer. Without the
   filter, one visit-plan Event mistakenly tagged to a manager would count
   that manager as a "rep working" here while every other rep-count on the
   screen still excludes them. */
export function activeReps(rows, team) {
  const beIds = new Set(team.filter((m) => m.short === 'BE').map((m) => m.id));
  const set = new Set();
  for (const r of rows) if (r.visitTime && beIds.has(r.employeeId)) set.add(r.employeeId);
  return set.size;
}

export function geoSplit(rows) {
  let verified = 0;
  let force = 0;
  for (const r of rows) {
    if (!r.visitTime) continue;
    if (r.forceVisit) force += 1;
    else verified += 1;
  }
  return { verified, force };
}

/* ---- Distributions ---------------------------------------------------- */

/* Fixed 9am-5pm buckets, always all nine, always in order. Deriving the range
   from the data instead makes the x-axis move between HQs, which is unreadable
   when you are flipping between two chips. Anything outside the window folds
   into the nearest edge bucket rather than vanishing. */
export const CHART_HOURS = [9, 10, 11, 12, 13, 14, 15, 16, 17];

/* Which column a row belongs to, or null if it is not a completed visit.
   Pulled out of visitsByHour because the sheet BEHIND the chart has to fold
   the 8:55am and the 6:30pm call into the same edge buckets the bar counted.
   Two copies of this rule is a bar that says 14 opening a list of 12. */
export function chartHourOf(row) {
  if (!row.visitTime) return null;
  const raw = Number(row.visitTime.slice(11, 13));
  if (!Number.isFinite(raw)) return null;
  return Math.min(Math.max(raw, CHART_HOURS[0]), CHART_HOURS[CHART_HOURS.length - 1]);
}

export function visitsByHour(rows) {
  const buckets = new Map(CHART_HOURS.map((h) => [h, { hour: h, verified: 0, force: 0 }]));

  for (const r of rows) {
    const hour = chartHourOf(r);
    if (hour == null) continue;
    const bucket = buckets.get(hour);
    if (r.forceVisit) bucket.force += 1;
    else bucket.verified += 1;
  }
  return CHART_HOURS.map((h) => buckets.get(h));
}

/* The rows behind one bar, or behind one legend chip.
 *
 * COMPLETED VISITS ONLY, because that is what the chart plots: a bar is a
 * count of calls that HAPPENED at an hour, and a pending call has no hour to
 * sit at. This is the one drill-down on the screen that cannot show a plan.
 *
 * `hour` filters to a column, `tone` to a series ('verified' | 'force'), and
 * both together to one segment of one bar. Null means "don't filter on this",
 * so the legend can ask for every force visit in the window.
 *
 * Sorted by clock time: the question a bar raises is "what was happening at
 * 2pm", and the answer reads in the order it happened. */
export function visitsIn(rows, { hour = null, tone = null } = {}) {
  const out = [];

  rows.forEach((r, i) => {
    const h = chartHourOf(r);
    if (h == null) return;
    if (hour != null && h !== hour) return;
    if (tone === 'force' && !r.forceVisit) return;
    if (tone === 'verified' && r.forceVisit) return;

    out.push({
      /* Same reason as doctorPlan: eventId is not unique across VisitRows.
         The index is over the UNFILTERED input, so a row keeps its key
         whichever bar or chip opened it. */
      id: `${r.eventId}#${i}`,
      hour: h,
      doctorName: r.doctorName,
      employeeName: r.employeeName,
      hq: r.hq,
      visitTime: r.visitTime,
      forceVisit: r.forceVisit,
      /* Same rule as doctorPlan: both facts belong to a forced call only. */
      forceVisitReason: r.forceVisit ? (r.forceVisitReason ?? '') : '',
      distanceKm: r.forceVisit ? r.distanceKm : null,
    });
  });

  return out.sort((a, b) => a.visitTime.localeCompare(b.visitTime));
}

export function byHq(rows, team) {
  const out = new Map();
  const ensure = (hq) => {
    if (!out.has(hq)) {
      out.set(hq, {
        hq, planned: 0, happened: 0, verified: 0, force: 0, activeReps: 0, totalReps: 0,
      });
    }
    return out.get(hq);
  };

  const repsWithVisits = new Set(rows.filter((r) => r.visitTime).map((r) => r.employeeId));
  for (const m of team) {
    if (m.short !== 'BE' || m.vacant) continue;
    const entry = ensure(m.hq);
    entry.totalReps += 1;
    if (repsWithVisits.has(m.id)) entry.activeReps += 1;
  }

  for (const r of rows) {
    const entry = ensure(r.hq);
    entry.planned += 1;
    if (!r.visitTime) continue;
    entry.happened += 1;
    /* verified and force are counted here rather than derived as
       `happened - force` by the caller: a force flag on a row that never
       happened would otherwise silently subtract from the verified count. */
    if (r.forceVisit) entry.force += 1;
    else entry.verified += 1;
  }

  return [...out.values()].sort((a, b) => b.happened - a.happened || a.hq.localeCompare(b.hq));
}

/* ---- Attendance ------------------------------------------------------- */

/* One rep, one state, in priority order: a vacant seat cannot be on leave, and
   someone on leave is not "not reporting" — they told us. */
export function attendanceOf(member, repsWithVisits) {
  if (member.vacant) return 'vacant';
  if (member.onLeave) return 'onLeave';
  return repsWithVisits.has(member.id) ? 'working' : 'notReporting';
}

export function attendance(rows, team) {
  const repsWithVisits = new Set(rows.filter((r) => r.visitTime).map((r) => r.employeeId));
  const counts = Object.fromEntries(ATTENDANCE.map((k) => [k, 0]));

  for (const m of team) {
    if (m.short !== 'BE') continue;
    counts[attendanceOf(m, repsWithVisits)] += 1;
  }

  /* "20 of 22 in field" — the denominator excludes vacancies, because a seat
     nobody sits in is not a person who failed to show up. */
  const inScope = counts.working + counts.notReporting + counts.onLeave;
  return { counts, working: counts.working, inScope };
}

/* ---- Per-node rollup for the tree -------------------------------------- */

/* Everything one tree row needs, for one manager or one rep. Computed per node
   on expand rather than for the whole tree up front: the live hierarchy is
   five levels deep and most of it is never opened. */
export function rollupFor(member, team, rows, pobRows = []) {
  const members = subtreeOf(team, member.id);
  const ids = new Set(members.map((m) => m.id));
  const mine = forEmployees(rows, ids);
  const reps = members.filter((m) => m.short === 'BE');
  const repsWithVisits = new Set(mine.filter((r) => r.visitTime).map((r) => r.employeeId));

  return {
    planned: planned(mine),
    happened: happened(mine),
    attainment: attainment(mine),
    pob: pobGiven(mine),
    /* The subtree's money, so a tree row can say what a territory BROUGHT IN
       next to what it did. `pobGiven` above is the checkbox count and cannot
       answer that -- see shape.js for why the two are different fields.
       Defaults to an empty list, so a caller that has no POB (the mock, or a
       token that cannot read Quotation) gets 0 rather than a crash. */
    pobAmount: pobTotal(forEmployees(pobRows, ids)),
    workingReps: reps.filter((m) => repsWithVisits.has(m.id)).length,
    totalReps: reps.filter((m) => !m.vacant).length,
    isLeaf: member.short === 'BE',
    attendance: member.short === 'BE' ? attendanceOf(member, repsWithVisits) : null,
  };
}

/* ---- Drill-downs: the rows behind a number ---------------------------- */

function groupRowsByEmployee(rows) {
  const out = new Map();
  for (const r of rows) {
    const list = out.get(r.employeeId);
    if (list) list.push(r);
    else out.set(r.employeeId, [r]);
  }
  return out;
}

/* The people behind one attendance chip.
 *
 * Classified by `attendanceOf`, the SAME function attendance() counts with,
 * rather than re-testing vacant/onLeave/visits here. A second copy of that
 * priority order is exactly how a chip that reads 46 opens a list of 45 --
 * and a drill-down that disagrees with the number it was opened from is
 * worse than no drill-down.
 *
 * Takes today's rows for the same reason attendance() does: who is in the
 * field is a right-now fact even when the page is showing a month.
 *
 * Sorted by calls done, descending. The chip is tapped to find out WHO, and
 * on a list of forty the thing worth reading first is the spread.
 */
export function repsInAttendanceState(team, todayRows, state) {
  const repsWithVisits = new Set(todayRows.filter((r) => r.visitTime).map((r) => r.employeeId));
  const rowsByEmployee = groupRowsByEmployee(todayRows);
  const nameById = new Map(team.map((m) => [m.id, m.name]));

  const out = [];
  for (const m of team) {
    if (m.short !== 'BE') continue;
    if (attendanceOf(m, repsWithVisits) !== state) continue;
    const mine = rowsByEmployee.get(m.id) ?? [];
    out.push({
      id: m.id,
      name: m.name,
      hq: m.hq,
      managerName: nameById.get(m.reportsTo) ?? null,
      planned: mine.length,
      happened: happened(mine),
    });
  }

  return out.sort((a, b) => b.happened - a.happened || a.name.localeCompare(b.name));
}

/* Every visit under one tree node, doctor by doctor -- the list a manager
 * asks for when the ratio on their row is not the answer they wanted.
 *
 * Scoped with subtreeOf + forEmployees, so an RBM's plan is their whole
 * region's and a BE's is their own, off one code path.
 *
 * POB is a separate doctype joined on (rep, doctor, day) -- see shape.js for
 * why that join is ASSUMED rather than verified. Summed, not first-wins: one
 * call can carry more than one quotation. The same rep visiting the same
 * doctor twice in a day would show the day's total against both rows; that
 * is the known limit of a join with no visit reference on it, and it is
 * still better than dropping the money from the row entirely.
 */
export function doctorPlan(member, team, rows, pobRows = []) {
  const ids = new Set(subtreeOf(team, member.id).map((m) => m.id));
  const mine = forEmployees(rows, ids);

  const pobByVisit = new Map();
  for (const p of pobRows) {
    if (!ids.has(p.employeeId)) continue;
    const key = `${p.employeeId}|${p.doctorId}|${p.plannedDate}`;
    pobByVisit.set(key, (pobByVisit.get(key) ?? 0) + (p.amount || 0));
  }

  return mine
    /* `id` is the event id PLUS the row's index, because eventId is not
       unique across VisitRows and was never meant to be: one Event with two
       participants is two visits (see fetchVisitRows), and React saw two
       children keyed EV279571. The index is taken before the sort below, so
       it is stable for a given input rather than shifting with the order. */
    .map((r, i) => ({
      id: `${r.eventId}#${i}`,
      doctorName: r.doctorName,
      employeeName: r.employeeName,
      plannedDate: r.plannedDate,
      visitTime: r.visitTime,
      forceVisit: r.forceVisit,
      /* Both carried only on a forced call. A reason left over on a row whose
         flag is off is a half-edited record, and showing it would tell the
         reader a visit was forced when the data says it was not. The distance
         is dropped on an ordinary row for a plainer reason: it is 0.2km on
         every one of them, which is noise. Same rule as visitsIn, so the two
         sheets that show a forced call describe it identically. */
      forceVisitReason: r.forceVisit ? (r.forceVisitReason ?? '') : '',
      distanceKm: r.forceVisit ? r.distanceKm : null,
      pob: pobByVisit.get(`${r.employeeId}|${r.doctorId}|${r.plannedDate}`) ?? null,
    }))
    /* Done first in the order they happened, then everything still open.
       The rows carry no planned TIME (the doctype is all-day -- see
       shape.js), so there is no schedule to sort the pending ones into;
       putting them after the completed ones makes the list answer "what is
       left" by where you stop reading. */
    .sort((a, b) => {
      if (a.visitTime && b.visitTime) return a.visitTime.localeCompare(b.visitTime);
      if (a.visitTime) return -1;
      if (b.visitTime) return 1;
      return a.doctorName.localeCompare(b.doctorName);
    });
}

/* ---- Clock ------------------------------------------------------------- */

/* The "as of" time is the latest visit we actually have, NOT Date.now(). A
   header that says 6:41 PM over a chart whose last bar is 2 PM is claiming
   data it does not have. */
export function asOfFrom(rows) {
  let latest = null;
  for (const r of rows) {
    if (r.visitTime && (latest === null || r.visitTime > latest)) latest = r.visitTime;
  }
  return latest;
}
