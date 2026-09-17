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

export function periodWindow(period, today) {
  if (period === 'mtd') {
    return { from: `${today.slice(0, 7)}-01`, to: today };
  }
  return { from: today, to: today };
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

export function visitsByHour(rows) {
  const buckets = new Map(CHART_HOURS.map((h) => [h, { hour: h, verified: 0, force: 0 }]));
  const first = CHART_HOURS[0];
  const last = CHART_HOURS[CHART_HOURS.length - 1];

  for (const r of rows) {
    if (!r.visitTime) continue;
    const raw = Number(r.visitTime.slice(11, 13));
    if (!Number.isFinite(raw)) continue;
    const hour = Math.min(Math.max(raw, first), last);
    const bucket = buckets.get(hour);
    if (r.forceVisit) bucket.force += 1;
    else bucket.verified += 1;
  }
  return CHART_HOURS.map((h) => buckets.get(h));
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
export function rollupFor(member, team, rows) {
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
    workingReps: reps.filter((m) => repsWithVisits.has(m.id)).length,
    totalReps: reps.filter((m) => !m.vacant).length,
    isLeaf: member.short === 'BE',
    attendance: member.short === 'BE' ? attendanceOf(member, repsWithVisits) : null,
  };
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
