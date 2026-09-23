/* Pure aggregation over VisitRow[] and TeamMember[].
 *
 * Every number on the screen comes from a function in this file. None of them
 * touch React, the network, or the clock — which is what makes the whole
 * dashboard testable without rendering it, and what lets the mock and the live
 * source share one code path.
 *
 * If you find yourself computing a total inside a component, it belongs here.
 */

import { ATTENDANCE, isHqTerritory, MANAGER_LEVELS, shortDesignation } from './shape';

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

/* A visit somebody else was also on. `participantCount` comes off the Event
   itself (see shape.js) rather than being counted across these rows, because
   the rows are already scoped: narrow the screen to one rep and the manager
   who came with them is filtered out, which would make every joint call in
   that scope look solo. */
export const isJoint = (row) => (row.participantCount ?? 1) > 1;

/* The three states, each split again by whether the visit was joint.
 *
 * `verified` and `force` are the TOTALS, with `jointVerified` and the rest a
 * subset of them — not a fourth and fifth category. A caller that adds them
 * up gets double the visits, which is why they are named as parts of
 * something rather than as peers. */
export function geoSplit(rows) {
  const out = {
    verified: 0, force: 0,
    jointVerified: 0, jointForce: 0, jointPending: 0,
  };
  for (const r of rows) {
    const joint = isJoint(r);
    if (!r.visitTime) {
      if (joint) out.jointPending += 1;
      continue;
    }
    if (r.forceVisit) {
      out.force += 1;
      if (joint) out.jointForce += 1;
    } else {
      out.verified += 1;
      if (joint) out.jointVerified += 1;
    }
  }
  return out;
}

/* ---- Distributions ---------------------------------------------------- */

/* THE WHOLE DAY, midnight to 11pm. Always all twenty-four, always in order.
   The axis therefore never moves: the 2pm column is in the same place on
   every HQ, every scope and every month, so flipping between two chips
   compares like with like instead of re-teaching the reader the axis.

   It was nine columns clamped to 9-5, which silently folded a 7:15am call
   into the 9am bar and a 9pm one into 5pm -- the early start and the long
   evening, which are the two shapes worth opening this chart for. Twenty-four
   columns do not fit a phone card, so the chart scrolls; see
   VisitsByHourChart, which opens on the first hour that has anything in it
   rather than on midnight. */
export const CHART_HOURS = Array.from({ length: 24 }, (_, h) => h);

/* Which column a row belongs to, or null if it is not a completed visit.
   NO LONGER CLAMPED. This used to fold a 7:15am call into the 9am bar and a
   9pm one into 5pm, so the early starts and the late finishes -- the two
   shapes anybody actually wants to find -- were the only ones the chart could
   not show. It reports the real hour and the axis widens to fit (see
   chartHoursFor); the sheet behind a bar reads the same function, so the two
   still cannot disagree. */
export function chartHourOf(row) {
  if (!row.visitTime) return null;
  const raw = Number(row.visitTime.slice(11, 13));
  if (!Number.isFinite(raw)) return null;
  if (raw < 0 || raw > 23) return null;
  return raw;
}

export function visitsByHour(rows) {
  const buckets = new Map(CHART_HOURS.map((h) => [h, { hour: h, verified: 0, force: 0 }]));

  for (const r of rows) {
    const hour = chartHourOf(r);
    if (hour == null) continue;
    /* The axis was built from these same rows, so every hour has a bucket --
       but this stays defensive rather than trusting that across a refactor:
       a missing bucket would throw, and a chart is not worth a blank screen. */
    const bucket = buckets.get(hour);
    if (!bucket) continue;
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
export function visitsIn(rows, { hour = null, tone = null } = {}, team = []) {
  /* `team` is optional and only supplies the attendee's RUNG for the role
     pill on the card. Defaulting to an empty roster degrades to no rung
     rather than throwing, so a caller that only wants the rows still works. */
  const shortById = new Map(team.map((m) => [m.id, m.short]));
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
      /* Carried so groupByEvent can put the joint call back together. */
      eventId: r.eventId,
      hour: h,
      doctorId: r.doctorId,
      doctorCity: r.doctorCity,
      doctorSpecialty: r.doctorSpecialty,
      doctorCategories: r.doctorCategories ?? [],
      doctorName: r.doctorName,
      employeeName: r.employeeName,
      /* Who attended, falling back to whose plan it is. On the single
         participant events the live data actually holds these are the same
         person; they diverge only on a joint call. */
      participantName: r.participantName || r.employeeName,
      participantId: r.participantId ?? null,
      participantShort: shortById.get(r.participantId) ?? shortById.get(r.employeeId) ?? '',
      /* The DAY, which a clock time cannot supply once the window is a month:
         a 2pm bar over thirty days is thirty different afternoons. */
      plannedDate: r.plannedDate,
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

/* What the scope picker's raw state MEANS, with the one distinction the
 * control depends on: null and [] are not the same answer.
 *
 *   null -> nobody has chosen yet. Fall back to `fallback` (the viewer's own
 *           branch), because a report that opens on nothing is a report that
 *           looks broken.
 *   []   -> chosen, and deliberately empty. Honoured exactly, so unticking
 *           the last node clears the scope instead of snapping back to the
 *           default and fighting the reader.
 *
 * A NON-EMPTY list that has gone entirely stale still falls back. That is the
 * case the fallback was originally written for -- the roster changed under a
 * saved scope -- and it is genuinely different from being asked for nobody.
 */
export function resolveSelection(picks, team, fallback = []) {
  if (picks == null) return fallback;
  if (picks.length === 0) return [];

  const live = picks.filter((pick) => team.some((m) => m.id === pick.id));
  return live.length ? live : fallback;
}

/* Rebuilds the CALL that the per-participant flattening took apart.
 *
 * A visit row is one participant, so a joint call arrives as two rows sharing
 * an eventId (see shape.js). Listing them flat shows one doctor twice with no
 * hint the two lines are the same call; this groups them back into one entry
 * whose `participants` are the people who attended it.
 *
 * WHO IS IN `participants` IS THE CHILD ROWS, NOTHING ELSE. A manager sees a
 * call because it is in their subtree, but they are only listed inside it if
 * they were actually on the participant table -- a report's call never shows
 * their name as having attended. That is the whole "children don't show in
 * parent" rule, applied at the one place the data can express it.
 *
 * The group's own status is the OPTIMISTIC one: a call is forced only if
 * every attendee forced it. One rep at the clinic and their manager in the
 * car park is a call that happened where it was meant to, and colouring the
 * whole row red would accuse the rep of the manager's shortcut. The detail
 * that says otherwise is one tap away, per person.
 *
 * Order is preserved from the input, so whatever the caller sorted by --
 * clock time, completed-first -- still holds for the group. */
export function groupByEvent(visits) {
  const groups = new Map();

  for (const v of visits) {
    /* The event id, NOT the row id: the row id carries the participant
       index precisely so it stays unique, which is the opposite of what
       grouping needs. Falls back to the row id so a row with no event
       cannot silently merge with another one. */
    const key = v.eventId ?? v.id;
    let group = groups.get(key);

    if (!group) {
      group = {
        id: key,
        doctorId: v.doctorId,
        doctorCity: v.doctorCity,
        doctorSpecialty: v.doctorSpecialty,
        doctorCategories: v.doctorCategories ?? [],
        doctorName: v.doctorName,
        hq: v.hq,
        hour: v.hour,
        plannedDate: v.plannedDate,
        participants: [],
        /* Filled below from whichever attendee carries it, rather than from
           whichever happened to create the group: on a joint call only the
           plan owner's row has the money on it, and that row is not reliably
           first. */
        pob: null,
      };
      groups.set(key, group);
    }
    group.participants.push(v);
  }

  for (const group of groups.values()) {
    const done = group.participants.filter((p) => p.visitTime);
    group.attended = done.length;
    /* The call's money, taken once from whichever attendee carries it --
       NOT summed, which would multiply one quotation by the number of
       people standing in the room. */
    group.pob = group.participants.find((p) => p.pob != null)?.pob ?? null;
    /* The earliest arrival is the call's time. A group headed by the LAST
       one would sort a joint call after solo calls that finished before it
       started. */
    group.visitTime = done.length
      ? done.reduce((a, b) => (a.visitTime <= b.visitTime ? a : b)).visitTime
      : null;
    group.forceVisit = done.length > 0 && done.every((p) => p.forceVisit);
    /* Distinct from forceVisit: this is what makes a mixed call worth
       opening, and the header says so rather than leaving it to the caret. */
    group.mixed = done.length > 1 && done.some((p) => p.forceVisit) && !group.forceVisit;
  }

  return [...groups.values()];
}

/* ---- The plan sheet's filter and sort -------------------------------- */

/* THE FIELDS FilterSortSidebar IS DRIVEN BY. Its model is that every sortable
 * field is also a filter tab — the sort pane is built from the same defs —
 * so this list is both "what you can narrow by" and "what you can order by",
 * in tab order.
 *
 * `fieldtype` is ERPNext's, and the sidebar reads it only to word the sort
 * options: Datetime gives "Oldest to Latest", anything else "A to Z". Calling
 * the clock field Datetime is therefore a labelling decision, not a claim
 * about storage.
 *
 * WHY A DOCTOR TAB RATHER THAN A SEARCH BOX. The sidebar has no free-text
 * record search — its per-tab search box searches that tab's VALUES. Making
 * the doctor a filter field turns "search by name or code" into exactly what
 * the component already does well, including paging a long list, and the
 * match runs over both fields (see planFilterValues). */
export const PLAN_FILTER_DEFS = [
  { key: 'doctor', label: 'Doctor', fieldtype: 'Link' },
  { key: 'hq', label: 'HQ', fieldtype: 'Link' },
  { key: 'city', label: 'City', fieldtype: 'Data' },
  /* THE DOCTOR'S OWN ATTRIBUTES, not the call's. They are what a reader
     planning a day actually sorts people by — "show me the cardiologists",
     "show me the EC10s" — and the cards in this sheet already print both, so
     filtering by them needs no new vocabulary. */
  { key: 'specialty', label: 'Specialty', fieldtype: 'Link' },
  { key: 'category', label: 'Category', fieldtype: 'Link' },
  /* SORTED BY, NEVER FILTERED ON. Both are orders a reader wants — "earliest
     first", "this morning's calls at the top" — and neither is a list anybody
     picks values from: the date tab would list every date in the range and the
     time tab a column of clock hours. `sortOnly` is what keeps them in the
     sidebar's sort pane and out of its tab rail. */
  { key: 'visitDate', label: 'Visit date', fieldtype: 'Datetime', sortOnly: true },
  { key: 'visitTime', label: 'Visit time', fieldtype: 'Datetime', sortOnly: true },
];

/* The value a call carries for each field. One place, so the filter, the
   value list and the sort can never disagree about what "the city" is. */
const PLAN_FIELD = {
  doctor: (c) => c.doctorId ?? '',
  hq: (c) => c.hq ?? '',
  city: (c) => c.doctorCity ?? '',
  specialty: (c) => c.doctorSpecialty ?? '',
  /* AN ARRAY, and the only one: a doctor carries up to four category links at
     once (commercial grade, value band, focus bucket, campaign — see
     liveSource's query). Every other field answers with one value, so the
     readers below normalise rather than branching, and "category is EC10"
     means "EC10 is among them" rather than "EC10 is the whole of it". */
  category: (c) => c.doctorCategories ?? [],
  /* NO ENTRY FOR THE SORT-ONLY FIELDS. A field with no tab has no value list
     to build and nothing that can send values for it, so giving it a reader
     here would only be a way to filter by something the panel never offers.
     Their ORDER lives in PLAN_COMPARE below, which is all they need. */
};

/* A call sorts by the moment it HAPPENED, falling back to nothing: a pending
   call has no moment, and those sort to the bottom of every order rather than
   heading an ascending one with a run of blanks. */
const doneAt = (c) => c.visitTime ?? '';

/* WHAT A CALL ANSWERS FOR A FIELD, always as a list. A scalar field answers
   with one entry, the category field with up to four, and a blank with none —
   so "has none of the picked values" and "has no value at all" are the same
   empty list, which is what both the filter and the value list want. */
function planValuesOf(key, call) {
  const raw = PLAN_FIELD[key]?.(call) ?? '';
  const list = Array.isArray(raw) ? raw : [raw];
  return list.filter(Boolean);
}

const PLAN_COMPARE = {
  doctor: (a, b) => (a.doctorName ?? '').localeCompare(b.doctorName ?? ''),
  hq: (a, b) => (a.hq ?? '').localeCompare(b.hq ?? ''),
  city: (a, b) => (a.doctorCity ?? '').localeCompare(b.doctorCity ?? ''),
  specialty: (a, b) => (a.doctorSpecialty ?? '').localeCompare(b.doctorSpecialty ?? ''),
  /* By the FIRST category, which is the commercial grade — the one the cards
     print first and the only one every doctor has. Sorting by a joined list
     would order "C, EC10" before "C" for no reason a reader could name. */
  category: (a, b) => (a.doctorCategories?.[0] ?? '').localeCompare(b.doctorCategories?.[0] ?? ''),
  /* BY THE MOMENT IT HAPPENED, falling back to the planned day. Not by the
     day alone: within one date a reader scanning a plan wants the morning
     before the afternoon, and two calls on the same date are otherwise left
     in whatever order the roster produced them. */
  visitDate: (a, b) => doneAt(a).localeCompare(doneAt(b)) || a.plannedDate.localeCompare(b.plannedDate),
  /* TIME OF DAY, across dates — 9am on the 5th before 2pm on the 4th. That is
     the whole reason it is a separate order from the date: the same field read
     for a different question. Sort only; there is no visit-time FIELD above,
     because the tab that would have gone with it listed clock hours (see the
     `sortOnly` note on PLAN_FILTER_DEFS). */
  visitTime: (a, b) => doneAt(a).slice(11).localeCompare(doneAt(b).slice(11)),
};

/* Everything the sidebar's Apply does, in one pure pass.
 *
 * IT RUNS OVER THE WHOLE PLAN, not the page on screen. The sheet renders in
 * pages (see useIncrementalList) purely to keep the DOM small — every call is
 * already in memory, fetched with the window. Filtering the rendered slice
 * would search the rows a reader happened to have scrolled past, which is the
 * bug that makes a search box worse than none.
 *
 * `sorts` is the sidebar's own shape, `{ [field]: 'asc' | 'desc' }`, and it
 * lets a reader tick more than one. Only the FIRST is honoured: a second key
 * can only break ties the first leaves, and on this data the first never
 * leaves any worth breaking. Documented rather than silently dropped.
 *
 * `values` is `{ [field]: string[] }` — empty or missing means "all", which
 * is what an untouched tab sends. */
export function filterPlan(calls, { values = {}, sorts = {}, query = '' } = {}) {
  /* A KEY WITH NO FIELD READER IS IGNORED, not treated as matching nothing.
     The sort-only fields have no reader (see PLAN_FIELD), and a stale saved
     filter naming one would otherwise empty the sheet -- which reads as a
     broken screen rather than as a filter nobody can see. */
  const active = Object.entries(values)
    .filter(([key, v]) => PLAN_FIELD[key] && Array.isArray(v) && v.length > 0);
  /* THE ONE CONTROL THAT IS NOT IN THE PANEL. A reader looking for one doctor
     types the name or the code they have in front of them; making them open a
     panel, find the Doctor tab and tick a box to do it is three steps for the
     commonest question this sheet is asked. Name AND code, because the memory
     supplies one and the ERP printout the other. */
  const q = query.trim().toLowerCase();

  const out = calls.filter(
    (c) =>
      /* ANY of the call's values for that field, because a doctor can be in
         four categories at once. On every other field the list is one long
         and this is the plain equality it looks like. */
      active.every(([key, picked]) => planValuesOf(key, c).some((v) => picked.includes(v)))
      && (!q
        || (c.doctorName ?? '').toLowerCase().includes(q)
        || (c.doctorId ?? '').toLowerCase().includes(q)),
  );

  const [field, direction] = Object.entries(sorts)[0] ?? ['visitDate', 'desc'];
  const compare = PLAN_COMPARE[field] ?? PLAN_COMPARE.visitDate;
  const pendingLast = (a, b) => (!doneAt(a) !== !doneAt(b) ? (doneAt(a) ? -1 : 1) : 0);

  /* Sorted on a COPY: `filter` already returns one, but that is an accident
     of this implementation, and a caller's array reordered underneath it is
     the kind of bug that surfaces three components away. */
  return [...out].sort(
    (a, b) => pendingLast(a, b) || (direction === 'asc' ? compare(a, b) : -compare(a, b)),
  );
}

/* One page of the values a tab can offer, in the shape `fetchFilterValues`
 * promises the sidebar: `(key, { page, pageLength, search }) => [{value,
 * label}]`.
 *
 * SYNCHRONOUS DATA, ASYNC CONTRACT. The sidebar was built for a server that
 * pages and searches remotely; here the calls are already in hand, so this
 * answers from memory. The contract is honoured exactly — paged, searched,
 * and returning fewer than a full page to mean "no more" — because that is
 * what the sidebar's infinite scroll reads to decide whether to ask again.
 *
 * THE DOCTOR TAB SEARCHES NAME AND CODE. A reader has one or the other: the
 * name is what they remember, the code is what the ERP printout gives them.
 * The label carries both so the list is recognisable either way. */
export function planFilterValues(
  calls,
  key,
  { page = 1, pageLength = 50, search = '', currentFilters = {} } = {},
) {
  const q = search.trim().toLowerCase();
  const seen = new Map();
  const counts = new Map();

  /* HOW MANY CALLS EACH VALUE WOULD LEAVE, counted against the plan as the
   * OTHER tabs have already narrowed it — never against the whole plan, and
   * never against this tab's own selection.
   *
   * Against the whole plan the numbers are a lie the moment a second filter
   * is on: "Dharwad 40" beside a list showing four is not a count of
   * anything on screen. Against this tab's own selection every unticked value
   * reads 0, which is true and useless — the reader is asking what happens if
   * they tick it, not what is true while they have not.
   *
   * The VALUES themselves still come from the unfiltered plan, so a tab never
   * loses options as you narrow: an option that would leave nothing is worth
   * showing as a 0 rather than vanishing, which reads as a list that broke. */
  const { [key]: _ownSelection, ...others } = currentFilters;
  const pool = filterPlan(calls, { values: others });
  for (const c of pool) {
    for (const value of planValuesOf(key, c)) {
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
  }

  for (const c of calls) {
    /* Blanks are already dropped by planValuesOf. A doctor with no city on
       their record is not a city you can filter by, and offering "" as an
       option is offering a way to empty the list by accident. */
    for (const value of planValuesOf(key, c)) {
      if (seen.has(value)) continue;
      seen.set(value, planValueLabel(key, c, value));
    }
  }

  const all = [...seen.entries()]
    .map(([value, label]) => ({ value, label, count: counts.get(value) ?? 0 }))
    .filter(({ value, label }) => !q || label.toLowerCase().includes(q) || value.toLowerCase().includes(q))
    /* BY THE LABEL, which is what the reader is scanning. Every tab left
       here labels with words or codes; the one list that had to sort by its
       raw value was the hours tab, and that went with the visit-time
       filter. */
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));

  return all.slice((page - 1) * pageLength, page * pageLength);
}

/* WHAT IS CURRENTLY APPLIED, one chip per thing, in the order the panel shows
 * them: values first, then sorts.
 *
 * The panel is where filters are SET; this is where they are seen. A reader
 * who has closed the sidebar has no other way to tell a filtered list from a
 * short one — a single count on the trigger says how many, never which — and
 * removing one should not cost a round trip through a panel. Each chip
 * carries the key and value it stands for so the caller can drop exactly
 * that one.
 *
 * Labelled through the same list the panel offers, so a chip and the ticked
 * box it came from read identically. */
export function planChips(calls, { values = {}, sorts = {} } = {}) {
  const chips = [];

  for (const def of PLAN_FILTER_DEFS) {
    const picked = values[def.key] ?? [];
    if (picked.length === 0) continue;
    const labels = new Map(
      planFilterValues(calls, def.key, { pageLength: Number.MAX_SAFE_INTEGER }).map((v) => [v.value, v.label]),
    );
    for (const value of picked) {
      chips.push({ kind: 'value', key: def.key, value, label: labels.get(value) ?? value });
    }
  }

  for (const [key, direction] of Object.entries(sorts)) {
    const def = PLAN_FILTER_DEFS.find((d) => d.key === key);
    /* NAMED AS AN ORDER, not as a field: "Visit time ↑" is a sort, "Visit
       time" beside a doctor's name would read as another filter. */
    chips.push({
      kind: 'sort',
      key,
      label: `${def?.label ?? key} ${direction === 'asc' ? '↑' : '↓'}`,
    });
  }

  return chips;
}

/* How each value reads in the list. The raw value is the filter key; this is
   what a person recognises. */
function planValueLabel(key, call, value) {
  if (key === 'doctor') return `${call.doctorName ?? value} · ${value}`;
  if (key === 'hq') return value.replace(/^HQ-\s*/, '');
  return value;
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
    /* Only a real HQ gets a card. A rep whose territory is a state, a zone
       or unset is not a rep "in an HQ", and counting them would put a
       headcount denominator under a card for a place that does not exist --
       see isHqTerritory. */
    if (!isHqTerritory(m.hq)) continue;
    const entry = ensure(m.hq);
    entry.totalReps += 1;
    if (repsWithVisits.has(m.id)) entry.activeReps += 1;
  }

  for (const r of rows) {
    if (!isHqTerritory(r.hq)) continue;
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
   someone on leave has not failed to report — they told us.
 *
 * `overRange` CHANGES TWO THINGS, and both follow from the period.
 *
 * WHICH LEAVE FLAG. `onLeave` is "out today"; `onLeaveInWindow` is "had
 * approved leave at some point in the range" (see liveSource's
 * fetchOnLeaveIds, which asks the same overlap query twice). Over August,
 * leave taken on the 4th is leave in August whether or not the rep is at a
 * desk this afternoon.
 *
 * WHERE LEAVE SITS IN THE ORDER. Over a range it drops BELOW reporting: a rep
 * who logged twenty days and took one off is not "On leave" for the month —
 * they reported, twenty times, and the count beside the chip is the proof.
 * Leave then explains exactly the people it still can: logged nothing, and
 * was away for part of the range. On a single day the two coincide, so the
 * original order stands.
 *
 * VACANCY IS AS-OF-NOW IN BOTH, and it is the only thing that is. A seat is
 * empty or it is not; there is no such thing as having been vacant last
 * Tuesday. */
export function attendanceOf(member, repsWithVisits, overRange = false) {
  if (member.vacant) return 'vacant';
  const reported = repsWithVisits.has(member.id);
  if (!overRange) return member.onLeave ? 'onLeave' : reported ? 'working' : 'notReporting';

  /* Falls back to today's flag when the source has no windowed one -- the
     mock, and any caller still on the old shape -- so a missing field
     degrades to the old behaviour rather than to "nobody was ever away". */
  const away = member.onLeaveInWindow ?? member.onLeave;
  return reported ? 'working' : away ? 'onLeave' : 'notReporting';
}

/* EVERY state a person is in, which over a range can be more than one.
 *
 * THE BUCKETS OVERLAP NOW, AND THAT IS THE POINT. "Reported" for August meant
 * one visit in twenty-two days, and a rep who worked the 4th and vanished
 * scored the same as one who worked every day — the month collapsed to a
 * single boolean and hid exactly the thing a month is worth looking at. Day
 * by day:
 *
 *   Reported     — logged a visit on at least one day
 *   Not reported — had a plan on at least one day and logged nothing that day
 *   Absent       — had approved leave somewhere in the range
 *
 * So the same person appears under Reported AND Not reported: twelve days out,
 * six days silent, and both facts are true of them. The counts therefore do
 * NOT add up to the headcount, which is why the card stops drawing them as a
 * stacked bar over a range — see AttendanceCard.
 *
 * A DAY WITH NO PLAN IS NOT A SILENT DAY. Sundays, and any day nobody was
 * given work, are absent from `days` entirely; a rep is only "not reported"
 * for a day they were expected somewhere.
 *
 * A PERSON WITH NO PLAN AT ALL still lands in Not reported rather than in
 * nothing. They logged no visits over the whole range, which is the question
 * the chip asks — and a body that appears in none of the four buckets is a
 * person the screen has quietly lost.
 *
 * ON A SINGLE DAY this returns exactly one state, the same one attendanceOf
 * does. The buckets only overlap once there are days to disagree about. */
export function attendanceStatesOf(member, days, overRange = false) {
  if (member.vacant) return ['vacant'];

  const reportedAnyDay = days.some((d) => d.happened > 0);

  /* One day, one state — leave first, exactly as attendanceOf has it. */
  if (!overRange) {
    if (member.onLeave) return ['onLeave'];
    return [reportedAnyDay ? 'working' : 'notReporting'];
  }

  const out = [];
  if (reportedAnyDay) out.push('working');
  /* A silent day is a day they were EXPECTED somewhere: `days` only holds
     days with a plan, so this cannot fire on a Sunday. The `length === 0`
     arm is the person with no plan at all in the range — no day can speak
     for them, so the range does, rather than losing them from all four. */
  if (days.some((d) => d.happened === 0) || days.length === 0) out.push('notReporting');
  if (member.onLeaveInWindow ?? member.onLeave) out.push('onLeave');
  return out;
}

/* `overRange` says the rows span more than today — see attendanceOf. The
   CALLER decides, because only it knows which window produced these rows;
   inferring it from the data would make an empty month look like a day. */
export function attendance(rows, team, overRange = false, calendar = []) {
  const daysByEmployee = daysByEmployeeOf(rows, calendar);
  /* Somebody with no rows at all still has the window's days — all of them
     silent, which is exactly what they were. Built once and shared: it is
     the same array for everyone who logged nothing, and on a live roster
     that is most of the list. */
  const noRows = daysOf([], calendar);
  const counts = Object.fromEntries(ATTENDANCE.map((k) => [k, 0]));

  /* EVERYONE IN SCOPE, not just the BEs — the same roster the team tree draws
     rows for.
   *
   * It counted field reps only, on the reasoning that "who is in the field"
   * is a question about field staff. That was wrong twice over: managers make
   * calls too (21% of the plan is joint, and since the attribution fix those
   * calls land on the manager's own id), and a card reading "3 of 19" beside
   * a tree of twenty-four names invites the reader to find the missing five.
   * The scope picker decides who is in scope; this counts whoever that is. */
  for (const m of team) {
    for (const state of attendanceStatesOf(m, daysByEmployee.get(m.id) ?? noRows, overRange)) {
      counts[state] += 1;
    }
  }

  /* "20 of 22 reported" — the denominator is the PEOPLE, counted once each,
     minus the vacancies: a seat nobody sits in is not a person who failed to
     show up. Summing the three states would double-count anyone who is in
     two of them, which over a range is most of the roster. */
  const inScope = team.filter((m) => !m.vacant).length;
  /* True once the buckets can overlap, and the card reads it to decide
     whether its stacked bar is still a partition of anything. */
  return { counts, working: counts.working, inScope, overlapping: overRange };
}

/* ---- Per-node rollup for the tree -------------------------------------- */

/* Everything one tree row needs, for one manager or one rep. Computed per node
   on expand rather than for the whole tree up front: the live hierarchy is
   five levels deep and most of it is never opened. */
export function rollupFor(member, team, rows, pobRows = [], overRange = false) {
  const members = subtreeOf(team, member.id);
  const ids = new Set(members.map((m) => m.id));

  /* THE VISIT NUMBERS ARE THIS PERSON'S OWN, not their branch's.
   *
   * They used to be the subtree's, which made a GM's row read "49898 visits,
   * 13149 of them joint" — the whole company's work stacked under one name.
   * That is a real number, but it is not a fact ABOUT that person, and it is
   * already the number the row above them shows. Every level repeated its
   * children's work, so the same visit was counted five times down one
   * branch, and no row anywhere said what the manager themselves did.
   *
   * Own rows are participant-attributed (see liveSource's attributeRows), so
   * a manager's own contribution is exactly the joint calls they actually
   * went on — the same set their Dr plan sheet lists (see doctorPlan). A row's
   * bar and the sheet behind its button now describe one thing.
   *
   * THE HEADCOUNT STAYS THE SUBTREE, deliberately. "12/14 Reported" is a
   * question about a branch; asked of one person it can only ever answer 0/1
   * or 1/1, which is not a statistic. The two live side by side on the row
   * because they answer the two different things a manager's row is for:
   * what they did, and how their people are doing. */
  const own = forEmployees(rows, new Set([member.id]));
  const mine = forEmployees(rows, ids);
  /* THEIR PEOPLE, NOT THEM. Everyone below this node — managers as well as
     BEs, so a branch's number is its whole branch — but not the node itself.
     It used to include them, to match the attendance card, which counts every
     person in scope; that made an ABM with four reps read "5/5", a number the
     four rows underneath visibly contradict.

     Since the bar beside it counts this person's OWN calls, including them
     here said the same thing twice and neither time clearly. The row now
     answers two separate questions: what they did, and how their people are
     doing. A manager’s row therefore no longer adds up to the card above it —
     by exactly one person, themselves, who is counted on their own row. */
  const reps = members.filter((m) => m.id !== member.id);
  const repsWithVisits = new Set(mine.filter((r) => r.visitTime).map((r) => r.employeeId));

  /* THE SAME SPLIT THE HQ CARDS DRAW, so a tree row can carry the same
     three-segment bar. Taken from geoSplit rather than counted here: two
     copies of "what counts as forced" is how a row and the territory card
     above it end up disagreeing. */
  const geo = geoSplit(own);

  return {
    planned: planned(own),
    happened: happened(own),
    attainment: attainment(own),
    verified: geo.verified,
    force: geo.force,
    /* The joint half of each, for the bar's inner split. */
    jointVerified: geo.jointVerified,
    jointForce: geo.jointForce,
    jointPending: geo.jointPending,
    pob: pobGiven(own),
    /* THIS PERSON'S money, for the same reason as the visit counts above: a
       manager's row showing their branch's turnover says nothing about them
       and repeats what their own manager's row already said. `pobGiven` above
       is the checkbox count and cannot answer "how much" -- see shape.js for
       why the two are different fields. Defaults to an empty list, so a
       caller that has no POB (the mock, or a token that cannot read
       Quotation) gets 0 rather than a crash. */
    pobAmount: pobTotal(forEmployees(pobRows, new Set([member.id]))),
    workingReps: reps.filter((m) => repsWithVisits.has(m.id)).length,
    totalReps: reps.filter((m) => !m.vacant).length,
    isLeaf: member.short === 'BE',
    /* EVERY NODE HAS AN ATTENDANCE STATE, managers included, and it is
       classified by the same `overRange` the card used. It was BEs only and
       always as-of-today, which was harmless while the card counted BEs
       only — now that the card counts the whole roster, a manager sitting in
       its "Not reported" list with no mark in the tree is the two views
       disagreeing about the same person. */
    attendance: attendanceOf(member, repsWithVisits, overRange),
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

/* One entry per day this person had a plan, in date order.
 *
 * ONE ROW PER DAY, not per visit: the question it answers is "which days",
 * and a day with six planned calls is still one day. `happened` rides along
 * so a reader can tell a day that went entirely silent from one that went
 * half done — on the Not reported list every day is the former, which is
 * exactly the point, and on the other lists it is the useful half. */
/* Every employee's days, in one pass. `attendance` and the drill-down behind
   it both need them, and walking the rows twice on a 2,600-row month to
   build the same map twice is the kind of thing that only shows up on a
   live dataset. */
function daysByEmployeeOf(rows, calendar) {
  const out = new Map();
  for (const [id, mine] of groupRowsByEmployee(rows)) out.set(id, daysOf(mine, calendar));
  return out;
}

function daysOf(rows, calendar = []) {
  /* SEEDED FROM THE CALENDAR, not from the plan. Every working day in the
     window starts at zero and the rows fill it in, so a day nobody scheduled
     is still a day — which is the whole point: a rep with no plan on Thursday
     did not report on Thursday, and the reader looking for their silent days
     expects to see it. Building this from `rows` alone could only ever list
     days somebody had already thought about. */
  const blank = (date) => ({ date, planned: 0, happened: 0, verified: 0, force: 0 });
  const byDate = new Map(calendar.map((date) => [date, blank(date)]));
  for (const r of rows) {
    /* A row outside the calendar still counts. It should not happen — the
       rows are windowed before they get here — but dropping a visit because
       it fell on a Sunday would make the card disagree with the bar beside
       it, and a visit that happened is a day that was reported. */
    const day = byDate.get(r.plannedDate) ?? blank(r.plannedDate);
    day.planned += 1;
    if (r.visitTime) {
      day.happened += 1;
      /* THE SPLIT PER DAY, so the trend can draw the same two-colour stack
         the hourly chart does. Counted here rather than derived later: a
         force flag on a row that never happened would otherwise subtract
         from the verified count, which is the trap geoSplit's own comment
         records. */
      if (r.forceVisit) day.force += 1;
      else day.verified += 1;
    }
    byDate.set(r.plannedDate, day);
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/* The days in this window a person was on approved leave, each with the kind
 * of leave it was — "Casual Leave", "Sick Leave".
 *
 * INTERSECTED WITH THE CALENDAR, so an application running Saturday to
 * Tuesday contributes three days and not four: Sunday is not a working day
 * and counting it would make "4/22 days absent" disagree with a denominator
 * that never included it. The same reason the figure and the list can be read
 * against each other at all.
 *
 * A spell is a RANGE on the wire (`from_date`/`to_date`), so the expansion
 * happens here rather than in the data source — the window it has to be cut
 * against is a screen fact, not a fetch fact. */
export function leaveDaysOf(member, calendar = []) {
  const spells = member.leave ?? [];
  if (spells.length === 0) return [];

  const out = [];
  for (const date of calendar) {
    const spell = spells.find((s) => s.from <= date && date <= s.to);
    if (spell) out.push({ date, type: spell.type });
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
 * Takes whatever rows the card counted, and the same `overRange` — a sheet
 * that classified the month's rows by today's priority order would list
 * people the chip above it did not count.
 *
 * Sorted by calls done, descending. The chip is tapped to find out WHO, and
 * on a list of forty the thing worth reading first is the spread.
 */
export function repsInAttendanceState(team, rows, state, overRange = false, calendar = []) {
  const rowsByEmployee = groupRowsByEmployee(rows);

  const out = [];
  for (const m of team) {
    const mine = rowsByEmployee.get(m.id) ?? [];
    /* No BE filter, for the same reason attendance() dropped its one: the
       chip counts everyone in scope, and a list that counted fewer would
       open shorter than the number that opened it.
     *
     * `includes`, not `===`: over a range a person is in every bucket their
     * days put them in, so the same name legitimately appears on both the
     * Reported and the Not reported list. */
    const days = daysOf(mine, calendar);
    if (!attendanceStatesOf(m, days, overRange).includes(state)) continue;
    /* The same split the tree rows and the HQ cards draw — one function, so
       a rep's bar says the same thing wherever the reader met them. */
    const geo = geoSplit(mine);
    out.push({
      id: m.id,
      name: m.name,
      short: m.short,
      hq: m.hq,
      planned: mine.length,
      happened: happened(mine),
      verified: geo.verified,
      force: geo.force,
      jointVerified: geo.jointVerified,
      jointForce: geo.jointForce,
      jointPending: geo.jointPending,
      /* DAYS THEY SHOWED UP, which is what the attendance chips are counting
         now that the states are day based — not the same question as how many
         visits they logged. A rep with 40 visits on two days and one with 20
         across ten are a long way apart, and only this tells them apart. */
      reportedDays: days.filter((d) => d.happened > 0).length,
      /* The days they were away, with the kind of leave each was — the
         Absent list's own figure and the rows behind it. */
      leaveDays: leaveDaysOf(m, calendar),
      /* WHEN, not just how much. "Not reported" over a month is a rep who
         logged nothing across four weeks, and the next question is always
         which days were lost — a fact the aggregates above cannot answer and
         the rows can, since the plan carries its own dates. */
      days,
    });
  }

  return out.sort((a, b) => b.happened - a.happened || a.name.localeCompare(b.name));
}

/* One person's own doctor plan: the calls they were ON, not the calls their
 * reports were on.
 *
 * THIS NO LONGER ROLLS UP THE SUBTREE, and that is the point. It used to
 * scope with subtreeOf + forEmployees, so opening "Dr plan" on an RBM listed
 * every call in the region -- hundreds of rows belonging to people the reader
 * would have to scroll past to find their own. Worse, it presented a report's
 * solo call as though the manager had made it; the manager's name was in the
 * title and the rep's was buried in the subtitle.
 *
 * A visit is this member's when they are ON THE PARTICIPANT TABLE. A manager
 * therefore sees exactly the joint calls they actually attended, and a rep
 * sees their own. The tree row above still shows the rolled-up ratio -- that
 * is a team fact and stays one; this is the personal half of it.
 *
 * FALLS BACK TO employeeId WHEN participantId IS NULL. Participants resolve
 * through the roster by login email, and an unresolved one (an ops account,
 * someone inactive, a schema that does not return reference_docname) would
 * otherwise empty every plan on the screen at once. Falling back to whose
 * plan it is reproduces the old behaviour for exactly the rows that cannot
 * answer the new question.
 *
 * POB is a separate doctype joined on (rep, doctor, day) -- see shape.js for
 * why that join is ASSUMED rather than verified. Summed, not first-wins: one
 * call can carry more than one quotation. The same rep visiting the same
 * doctor twice in a day would show the day's total against both rows; that
 * is the known limit of a join with no visit reference on it, and it is
 * still better than dropping the money from the row entirely.
 *
 * The money stays keyed on the ROW's employeeId rather than the reader's:
 * a quotation belongs to the rep who raised it, so a manager opening a joint
 * call still sees the POB that call produced.
 */
export function doctorPlan(member, team, rows, pobRows = []) {
  /* Two steps, and the second one matters: pick the CALLS this member was on,
     then keep every participant of those calls. Filtering straight down to
     the member's own rows would hand the sheet a joint call with one attendee
     in it -- the reader would see "Dr Two" with only their own name under it
     and no sign the rep they went with was ever there. */
  const attended = (r) => (r.participantId ?? r.employeeId) === member.id;
  const myEvents = new Set(rows.filter(attended).map((r) => r.eventId));
  const mine = rows.filter((r) => myEvents.has(r.eventId));

  /* The attendee's RUNG, not their name -- BE / ABM / RBM. A joint call is
     interesting because of who came along: a rep alone is the ordinary case,
     a rep with their ABM is a coached call, and the sheet says so in two
     characters where the names take a line each. Resolved from the roster,
     which is the only thing that knows a person's designation. */
  const shortById = new Map(team.map((m) => [m.id, m.short]));

  const pobByVisit = new Map();
  for (const p of pobRows) {
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
      /* Carried so groupByEvent can put the joint call back together. */
      eventId: r.eventId,
      doctorId: r.doctorId,
      doctorCity: r.doctorCity,
      doctorSpecialty: r.doctorSpecialty,
      doctorCategories: r.doctorCategories ?? [],
      doctorName: r.doctorName,
      /* The doctor card shows it, and this sheet is scoped to a PERSON, not
         to a territory -- so unlike the hourly sheet the rows genuinely
         differ and the HQ is worth a column. It was simply missing here,
         which is why the card rendered a blank right rail. */
      hq: r.hq,
      employeeName: r.employeeName,
      participantName: r.participantName || r.employeeName,
      participantId: r.participantId ?? null,
      /* Falls back to the plan owner's rung when the participant did not
         resolve, for the same reason the attribution does -- and to '' rather
         than a guess when neither is on the roster, so the pill drops the
         segment instead of inventing a role. */
      participantShort:
        shortById.get(r.participantId) ?? shortById.get(r.employeeId) ?? '',
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
      /* Keyed on the PLAN OWNER, not on whoever attended. A quotation is
         raised by the rep whose call it is; a manager who came along did not
         raise it, and keying on them would leave a joint call's money on
         neither row. Falls back to employeeId for rows with no separate
         owner recorded. */
      pob: pobByVisit.get(`${r.planOwnerId ?? r.employeeId}|${r.doctorId}|${r.plannedDate}`) ?? null,
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
