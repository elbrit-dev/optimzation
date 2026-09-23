'use client';

/* Live ERPNext data source for the Team Report screen. See PLAN.md §2/§4 for
 * how these queries were derived and verified directly against the live
 * endpoint (https://erp.elbrit.org/api/method/graphql).
 *
 * Two hard constraints from that investigation, both still true:
 *
 *   - Link fields come back BOTH ways: as an object needing its own subfield
 *     selection (`custom_hq { name }`) AND as a flat `<field>__name` scalar.
 *     Either works for an ordinary link. For the DYNAMIC link on
 *     `event_participants.reference_docname` only the scalar does -- the
 *     object form is a `BaseDocType` interface this ERP cannot resolve to a
 *     concrete type, and asking for it 500s inside the resolver. An earlier
 *     version of this note claimed the `__name` scalars did not exist and
 *     that the field had to be dropped; introspection says otherwise, and
 *     the participant's identity is read through it.
 *   - `after` + a `filter` throws "Filter must be a tuple or list" on this
 *     ERP (the same constraint ViewPaginator.jsx works around), so nothing
 *     here cursor-paginates. THE DATE WINDOW IS THE PAGINATION KEY INSTEAD:
 *     `fetchWindowed` asks for the whole range, and halves it and retries
 *     whenever the answer comes back short. One request in the common case,
 *     more only where the volume needs them.
 *
 *     This replaced a single `first: MAX_ROWS` page, which told a reader
 *     looking at ONE month that the range was too wide and to "pick fewer
 *     months" -- advice they could not act on, over a cap they had no way of
 *     knowing was theirs to hit. The quotations behind a month are an order
 *     of magnitude more numerous than the visits, so that is usually what
 *     overflowed, and the message blamed the wrong doctype as well.
 */

import { getEndpointConfigFromUrlKeyAsync } from '@/app/graphql-playground/constants';
import { shortDesignation } from './shape';
import { monthEnd } from './selectors';

/* LOCAL date, not `new Date().toISOString().slice(0, 10)`. `toISOString`
   reads the UTC date, and east of Greenwich that is still YESTERDAY for the
   first few hours of the local day (00:00-05:29 IST) -- exactly the class of
   bug format.js's parseISODate exists to avoid on the display side. This is
   the same fix on the fetch side, since `today` here is what decides both the
   "Today" window and the "as of" month start. */
function todayLocal() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/* 'ERP' is the row NAME in the /tokens registry, not a secret -- it is the
   default until a caller picks a different one. It ONLY resolves which ERP
   HOST to call (`getEndpointConfigFromUrlKeyAsync` below reads just its
   `endpointUrl`); the registry's own stored credential is never read or used
   as a fallback. `gqlToken` is a REQUIRED prop -- the signed-in user's own
   ERP token, bound by whatever page renders this component (a Studio page
   binds it the same way it already does for CalendarPage/DoctorDetail; the
   dev harness on /visit resolves its own convenience default and passes a
   concrete value down) -- never resolved here, so a shared/service
   credential can never quietly stand in for the viewer. */
export const DEFAULT_GQL_ENVIRONMENT = 'ERP';
const MAX_ROWS = 20000;

/* A token arrives as whatever the caller typed or stored, so it may or may
   not already carry the "token " scheme Frappe expects. Adding the scheme
   only when it is missing means both forms work without the caller growing
   its own "paste the whole header" instructions. */
function normalizeToken(raw) {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  return /^token\s/i.test(trimmed) ? trimmed : `token ${trimmed}`;
}

/* A short-lived cache for the fetches that do NOT depend on the month.
 *
 * Changing the month re-ran the whole dataset, which re-issued four requests
 * whose answers could not have changed: the 496-row roster, the 441-row role
 * profile tree, today's leave, and today's visits. Measured, not assumed --
 * one load is 5 requests and a month change was 6, of which 4 were repeats.
 * They sit inside a Promise.all, so the whole screen waited on them.
 *
 * THE PROMISE IS CACHED, NOT THE VALUE. Two callers arriving together share
 * one request instead of racing; that is also what makes today's visits free
 * on a month change rather than merely fast.
 *
 * KEYED BY TOKEN because the answer is scoped to the viewer -- the roster a
 * restricted token can see is not the one an admin sees, and serving one to
 * the other would be a permission leak, not a stale read. Keyed by endpoint
 * too, since the dev harness can point at another instance.
 *
 * A REJECTED PROMISE IS EVICTED. Caching a failure would keep a screen broken
 * for the whole TTL after a blip.
 *
 * TTL, not forever: a roster edit should reach the screen without a reload,
 * and two minutes is short enough that nobody notices the lag and long
 * enough to cover a reader flipping through months. */
const CACHE_TTL_MS = 2 * 60 * 1000;
const inflight = new Map();

function cached(key, run) {
  const hit = inflight.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.promise;

  const promise = run();
  inflight.set(key, { at: Date.now(), promise });
  promise.catch(() => {
    if (inflight.get(key)?.promise === promise) inflight.delete(key);
  });
  return promise;
}

/* Exported for the dev harness and for tests: a token swap or a deliberate
   refresh must not be served yesterday's roster. */
export function clearVisitCache() {
  inflight.clear();
}

async function graphqlRequest(query, variables, { endpointUrl, gqlToken, gqlEnvironment }) {
  if (!endpointUrl) throw new Error(`[visit] no endpoint configured for urlKey "${gqlEnvironment}"`);

  /* The registry stores this one WITH the "token " prefix already on it --
     prepending another one produced "Authorization: token token <key>:<secret>",
     which Frappe rejects as unauthenticated rather than as a malformed token. */
  const res = await fetch(`${new URL(endpointUrl).origin}/api/method/graphql`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: gqlToken ?? '' },
    body: JSON.stringify({ query, variables }),
  });
  /* A Frappe error page is not always JSON. Parsing blind turns a 502 from
     the proxy into "Unexpected token <", which tells the reader nothing. */
  let json;
  try {
    json = await res.json();
  } catch {
    throw new Error(`[visit] ERP returned a non-JSON response (HTTP ${res.status})`);
  }

  if (json.errors?.length) {
    throw new Error(`[visit] ${json.errors.map((e) => e.message).join('; ')}`);
  }

  /* FRAPPE HAS A SECOND ERROR SHAPE, and it carries no `errors` key at all.
     An invalid or expired API token returns

       { "exception": "frappe.exceptions.AuthenticationError",
         "exc_type": "AuthenticationError", "exc": "<traceback>" }

     with no `data`. Returning that untouched handed every caller `undefined`,
     and the screen reported "Cannot read properties of undefined (reading
     'Employees')" -- a message that names an internal field and hides the
     only fact that mattered: the token was rejected.

     (An ABSENT token is different again: that one does come back as `errors`,
     which is why the missing-token case always read correctly and the WRONG
     token case did not.) */
  if (json.exception || json.exc_type) {
    const detail = json.exc_type || json.exception;
    throw new Error(
      `[visit] ERP rejected the request (HTTP ${res.status}): ${detail}`
        + (/auth/i.test(String(detail)) ? ' — the ERP token is missing, expired or wrong.' : ''),
    );
  }

  /* Anything else with no data is still unusable, and saying so here beats
     letting the caller destructure undefined three frames away. */
  if (!json.data) {
    throw new Error(`[visit] ERP returned no data (HTTP ${res.status})`);
  }

  return json.data;
}

/* A doctor is a CRM Lead on this instance (see shape.js), so `custom_doctor`
   resolves to the Lead type and the label lives in `lead_name` --
   `custom_doctor { name }` alone is the Lead's primary key, "DR-60005",
   which is what the doctor plan was showing where a name belongs.

   It used to be selected conditionally, behind a flag that dropped it on the
   first complaint, because nobody had run it against the live schema. It has
   now been run: `lead_name` is populated on 400/400 September events. The
   guess, and the flag that hedged it, are gone.

   THE PARTICIPANT'S IDENTITY IS A `__name` SCALAR, NOT `{ name }`. This
   schema exposes every link field twice -- as an object, and as a flat
   `<field>__name` string -- and for `event_participants.reference_docname`
   only the scalar is usable. The object form is typed `BaseDocType`, a
   GraphQL INTERFACE, and this Frappe build cannot resolve a dynamic link to
   a concrete type: asking for `reference_docname { name }` returns a 500
   from inside the resolver ("handle_field_error() missing 1 required
   positional argument"), which names no field and so cannot even be caught
   and retried. Selecting it bare is rejected at validation instead.

   Confirmed by introspection against erp.elbrit.org:
     reference_docname         INTERFACE  BaseDocType
     reference_docname__name   SCALAR     String      <- this one

   NOTE the comment style below is `#`. GraphQL has no block comments, and a
   JS-style one inside the document is a parse error, not a comment. */

const VISITS_QUERY = () => `
  query VisitsInWindow($f: [DBFilterInput], $first: Int) {
    Events(filter: $f, first: $first) {
      totalCount
      edges { node {
        name
        subject
        starts_on
        custom_employee_id { name }
        # A doctor is a CRM Lead. city is a plain scalar; the category is a
        # link to Category List, so it takes the __name shadow like every
        # other link here. NO BACKTICKS IN THIS DOCUMENT -- it is a JS
        # template literal, and a backtick ends it mid-query.
        custom_doctor {
          name
          lead_name
          city
          custom_specialty__name
          # FOUR separate category links, not a child table. A doctor carries a
          # commercial grade (C / SC / E), a value-vs-reach band (LILR / HIHR),
          # a focus bucket (EC10 / C20) and sometimes a campaign (A&P FOCUS 20).
          # Any of them can be empty; the card joins whatever is set.
          custom_category__name
          custom_category1__name
          custom_category2__name
          custom_category3__name
        }
        custom_hq { name }
        custom_department { name }
        custom_pob_given
        event_participants {
          # Scalars. The object forms of these two cannot be resolved -- see above.
          reference_doctype__name
          reference_docname__name
          custom_visit_time
          custom_distance
          custom_is_force_visit
          custom_force_visit_reason
        }
      } }
    }
  }
`;

/* One VisitRow per participant, not per Event: an Event with no participant
   is a plan nobody has been assigned to yet, which shape.js's PLANNED /
   HAPPENED model (one rep per row) has nothing to show for.

   JOINT CALLS ARE COMMON, and an older note here guessed the opposite. Of
   400 live September events: 315 carry one participant, 84 carry two, one
   carries three -- 486 participant rows for 400 calls. Roughly a fifth of
   the plan is somebody going along with somebody else.

   That is why these rows carry `planOwnerId` (the Event's employee) and NOT
   an `employeeId`. Attribution is decided in fetchVisitDataset, from the
   participant, because stamping every row of a joint call with the plan
   owner counted one doctor twice against that rep and credited the person
   who actually came along with nothing. */
/* One day either side of a 'YYYY-MM-DD', and the midpoint between two.
   Built from local Date PARTS for the reason todayLocal documents: parsing
   an ISO date string is a UTC operation, and east of Greenwich that shifts
   the day. */
function shiftDay(iso, days) {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function daysBetween(from, to) {
  const [y1, m1, d1] = from.split('-').map(Number);
  const [y2, m2, d2] = to.split('-').map(Number);
  return Math.round((new Date(y2, m2 - 1, d2) - new Date(y1, m1 - 1, d1)) / 86400000);
}

/* PAGES BY DATE, because this ERP cannot page by cursor -- `after` plus a
 * `filter` throws "Filter must be a tuple or list" (see the note at the top
 * of this file). The date filter works fine, so the window itself is the
 * pagination key.
 *
 * SPLITS ONLY WHEN IT HAS TO. The whole window is tried first, so the common
 * case stays exactly one request; a window that comes back short is halved
 * and each half retried, recursively. A month of visits is one request, a
 * month of quotations that overflows becomes two or four.
 *
 * This is what stopped a single month reporting "the figures below are
 * incomplete": nothing is truncated now unless ONE DAY on its own exceeds
 * MAX_ROWS, which is the point at which there is genuinely nothing left to
 * split and the caller deserves to be told.
 *
 * `merge` is passed in because the two callers accumulate different shapes --
 * rows for visits, entries for quotations -- and neither should have to know
 * about the other's. */
async function fetchWindowed({ from, to }, fetchOnce, merge) {
  const page = await fetchOnce({ from, to });
  if (!page.truncated || from === to) return page;

  /* A window of one day that is still short cannot be split further. Return
     it truncated and let the caller say so. */
  const span = daysBetween(from, to);
  if (span < 1) return page;

  const mid = shiftDay(from, Math.floor(span / 2));
  const [left, right] = await Promise.all([
    fetchWindowed({ from, to: mid }, fetchOnce, merge),
    fetchWindowed({ from: shiftDay(mid, 1), to }, fetchOnce, merge),
  ]);
  return merge(left, right);
}

async function fetchVisitRows({ from, to }, conn) {
  return fetchWindowed(
    { from, to },
    (window) => fetchVisitRowsPage(window, conn),
    (a, b) => ({ rows: [...a.rows, ...b.rows], truncated: a.truncated || b.truncated }),
  );
}

/* A window cut into equal date shards, fetched at once.
 *
 * WHY, when fetchWindowed already splits: it only splits on OVERFLOW, so a
 * month that fits is one query — and that query costs about a second, almost
 * all of it the ERP counting and joining rows rather than sending them.
 * Measured on Sep 2026: 1099 events, 1093ms as one query, ~350ms as four
 * week-sized ones in parallel. The work is the same; the waiting is not.
 *
 * This is the only lever the ERP leaves for a big window. Cursor paging is
 * out -- `after` plus a `filter` throws, still, checked against the live
 * instance -- and there are no aggregate resolvers to ask for a summary
 * instead of rows. The date window is the only pagination key there is, so
 * the window is what gets cut.
 *
 * CONCURRENCY IS CAPPED. A month is 4 shards, but a twelve-month range would
 * be 52, and firing 52 queries at a production ERP to make one screen paint
 * faster is a way to make everyone else's screen slower. Six at a time keeps
 * a month fully parallel and a year merely quick.
 *
 * Each shard still goes through fetchWindowed, so a shard that overflows
 * halves itself exactly as before -- the cap is a floor on request count,
 * never a ceiling on completeness. */
const SHARD_DAYS = 7;
const SHARD_CONCURRENCY = 6;

function shardRange({ from, to }, days = SHARD_DAYS) {
  const span = daysBetween(from, to);
  /* Not worth cutting: a range this short is one fast query, and three
     round trips to save nothing is worse than one. */
  if (span < days) return [{ from, to }];

  const out = [];
  for (let start = 0; start <= span; start += days) {
    const end = Math.min(start + days - 1, span);
    out.push({ from: shiftDay(from, start), to: shiftDay(from, end) });
  }
  return out;
}

async function inPool(items, limit, run) {
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await run(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}

async function fetchVisitRowsSharded({ from, to }, conn) {
  const shards = shardRange({ from, to });
  if (shards.length === 1) return fetchVisitRows({ from, to }, conn);

  const parts = await inPool(shards, SHARD_CONCURRENCY, (shard) => fetchVisitRows(shard, conn));
  return {
    rows: parts.flatMap((p) => p.rows),
    truncated: parts.some((p) => p.truncated),
  };
}

async function fetchVisitRowsPage({ from, to }, conn) {
  const variables = {
    first: MAX_ROWS,
    f: [
      { fieldname: 'event_category', operator: 'EQ', value: 'Doctor Visit plan' },
      { fieldname: 'starts_on', operator: 'GTE', value: `${from} 00:00:00` },
      { fieldname: 'starts_on', operator: 'LTE', value: `${to} 23:59:59` },
    ],
  };

  /* NO RETRY LADDER. Every optional selection this query used to guess at
     has been checked against the live schema -- by introspection and by a
     real read -- so there is nothing left for a fallback to discover:

       custom_doctor.lead_name    populated on 400/400 September events
       reference_doctype__name    'Employee' on all 486 participant rows
       reference_docname__name    the employee id itself, e.g. "E00869"

     A fallback guarding a verified field is not safety, it is a second code
     path nobody exercises. The last one was worse than useless: it swallowed
     a server-side 500 that deserved to be read and fixed. If this query ever
     starts failing, it should fail loudly. */
  const data = await graphqlRequest(VISITS_QUERY(), variables, conn);

  const { totalCount, edges } = data.Events;
  /* Returned as well as warned. A console line is enough while the window
     is always one month and the volume is a few hundred visits a day; it
     is NOT enough now that the picker can ask for a span, because a
     truncated answer produces totals that look ordinary and are wrong.
     The screen says so out loud -- see VisitReport. */
  const truncated = totalCount > edges.length;
  if (truncated) {
    console.info(`[visit] ${from}..${to} holds ${totalCount} events, over the ${MAX_ROWS} page size — splitting the window`);
  }

  /* Distinct people on one Event's participant table. A row whose reference
     is blank cannot be matched against another, so it counts as its own
     person rather than collapsing every blank into one. */
  const uniqueParticipants = (list) => {
    if (!list?.length) return 1;
    const seen = new Set();
    let blanks = 0;
    for (const p of list) {
      const ref = (p?.reference_docname__name ?? '').trim();
      if (ref) seen.add(ref);
      else blanks += 1;
    }
    return Math.max(seen.size + blanks, 1);
  };

  const rows = [];
  for (const { node } of edges) {
    /* An event with no participant table at all still produces ONE row --
       the plan exists and somebody owns it -- which is what `[null]` is
       for. Its participantCount is 1, not 0: one person was expected. */
    const participants = node.event_participants?.length ? node.event_participants : [null];
    for (const p of participants) {
      rows.push({
        eventId: node.name,
        subject: node.subject ?? '',
        plannedDate: (node.starts_on ?? '').slice(0, 10),
        /* WHOSE PLAN it is, which is not always who went -- see the joint
           call note above. Kept separate from `employeeId` (resolved in
           fetchVisitDataset) because the POB join still hangs off the plan
           owner: a quotation is raised by the rep who owns the call, not by
           whoever came along to it. */
        planOwnerId: node.custom_employee_id?.name ?? '',
        /* `employeeId` and `employeeName` are NOT set here. They are the
           attribution every KPI aggregates on, and who a visit belongs to
           cannot be decided from the Event alone -- it needs the participant
           resolved against the roster. Both are filled in fetchVisitDataset.
           `custom_employee_id { name }` is in any case the Employee's
           primary key ("E01102"), not their name. */
        doctorId: node.custom_doctor?.name ?? '',
        /* `||`, not `??`: an empty-string lead_name is as useless as a
           missing one, and the id at least identifies the doctor. */
        doctorName: node.custom_doctor?.lead_name || node.custom_doctor?.name || '',
        /* The doctor's own town and clinical specialty, for the card in the
           drill-downs. SPECIALTY, NOT custom_category: the category is a
           commercial grade (E, EC30, FOCUS 20) and the badge wanted the
           practice — CARDIO, ORTHO, GP, CP. "CP" on the reference design is
           a Specialty record, which is what settled it.

           Both come off the Lead and describe the DOCTOR, not
           the call -- which is why `hq` below stays the EVENT's territory:
           that is what byHq groups on and what the HQ strip filters by, and
           a doctor's own territory quietly disagreeing with it would make
           the sheet's header contradict the card that opened it. */
        doctorCity: node.custom_doctor?.city ?? '',
        doctorSpecialty: node.custom_doctor?.custom_specialty__name ?? '',
        /* An ARRAY, in the doctype's own order, with the blanks removed here
           rather than in the component: which of the four slots a grade
           happens to sit in is an ERPNext fact, and nothing above this line
           should have to know there are four of them. */
        doctorCategories: [
          node.custom_doctor?.custom_category__name,
          node.custom_doctor?.custom_category1__name,
          node.custom_doctor?.custom_category2__name,
          node.custom_doctor?.custom_category3__name,
        ].filter(Boolean),
        hq: node.custom_hq?.name ?? '',
        department: node.custom_department?.name ?? '',
        pobGiven: Boolean(node.custom_pob_given),
        visitTime: p?.custom_visit_time ?? null,
        distanceKm: p?.custom_distance ?? null,
        forceVisit: Boolean(p?.custom_is_force_visit),
        /* What the rep typed when they logged the call away from the planned
           location. There is a `custom_force_visit_reason` on the EVENT too,
           but nothing writes it -- the field the app captures is this one, on
           the participant, alongside the distance and the flag it explains.
           Trimmed because the control is a free-text Small Text and a
           whitespace-only answer is a missing one. */
        forceVisitReason: (p?.custom_force_visit_reason ?? '').trim(),
        /* WHO ACTUALLY ATTENDED, as a login email. The participant is the
           only record of that: `custom_employee_id` is on the EVENT, so two
           participants on one Event would otherwise both be credited to one
           rep -- the calls counted twice against the same person and the
           second attendee nowhere.

           Guarded on reference_doctype because the child table is generic:
           it can point at a Contact or a Lead just as easily as a User, and
           a Lead's name resolved through the employee roster would silently
           match nobody. Resolved to an employeeId in fetchVisitDataset,
           where the roster exists. */
        /* AN EMPLOYEE ID ALREADY, on a Doctor Visit plan. The child table is
           a dynamic link, so what it points AT has to be read before the
           value means anything -- and on this event category it is always
           `Employee`, giving "E00869" straight out. Checked across 400 live
           September events: 486 participant rows, every one of them
           reference_doctype = Employee.

           The `User` arm is not speculation either: the Google-Calendar-
           synced events on this instance use it, and there the value is a
           login address that only the roster can turn into an employee. Two
           reference types, both seen in the data, resolved in
           fetchVisitDataset where the roster exists. Anything else -- a
           Contact, a Lead -- is left alone rather than pushed through a
           lookup that would silently match nobody. */
        participantRef: (p?.reference_docname__name ?? '').trim(),
        participantRefType: p?.reference_doctype__name ?? '',
        /* HOW MANY PEOPLE WERE ON THIS CALL, read off the Event rather than
           counted downstream. A joint call is one plan two people attended,
           and the flattened rows cannot answer it on their own: scope the
           screen to a rep and their manager's row is gone, so counting rows
           per eventId would report every joint call in that scope as solo.
           The Event knows, so the Event says.

           UNIQUE, because the child table does not stop the same person
           being added twice — seen on the calendar-synced events, where a
           re-sync appends rather than replaces. Counted on the resolved
           reference, so two rows pointing at one employee are one person. */
        participantCount: uniqueParticipants(node.event_participants),
      });
    }
  }
  return { rows, truncated };
}

const EMPLOYEES_QUERY = `
  query ActiveEmployees($f: [DBFilterInput], $first: Int) {
    Employees(filter: $f, first: $first) {
      totalCount
      edges { node {
        name
        employee_name
        designation { name }
        reports_to { name }
        custom_territory { name }
        user_id { name }
        custom_role_profile__name
      } }
    }
  }
`;

/* No vacancy FIELD exists on Employee in ERPNext (see PLAN.md §2.6), but HR's
   own workaround for an open seat is a placeholder Employee record on a
   dedicated "V..." naming series (e.g. "V01617"), kept Active so the seat
   still shows up in the hierarchy and the reporting chain below it doesn't
   dangle. The ID series is the primary signal; the "Vacant_<name>" label is
   also checked as a fallback, because a handful of Active placeholders on ERP
   predate the series and are still on their original "HR-EMP-xxxxx" ID --
   without this those seats would read as filled until renumbered onto the
   "V..." series like the rest. */
function isVacantId(employeeId, employeeName) {
  /* V FOLLOWED BY DIGITS, not any V. Checked against the live roster: all 71
     placeholders are on the V-series and every real employee is on the
     E-series, so the digits cost nothing today and stop a future employee
     whose id begins with a letter V from being reported as an empty seat —
     which would drop a real person out of every headcount on the screen.

     THE NAME CHECK IS TOLERANT OF TYPING, because the live records are:
     "Vacant _ Amit Kumar Thakur" has a space before the underscore, and
     "\tVacant_Marimuthu K(E00886)" begins with a tab, which the anchored
     pattern could not match at all. Both are on the V-series so neither was
     mis-read — but a placeholder still on its original HR-EMP id, which is
     the only reason this fallback exists, would have been. */
  return /^v\d/i.test(employeeId ?? '') || /^vacant\s*_/i.test((employeeName ?? '').trim());
}

async function fetchTeam(conn) {
  const data = await graphqlRequest(EMPLOYEES_QUERY, {
    first: MAX_ROWS,
    f: [{ fieldname: 'status', operator: 'EQ', value: 'Active' }],
  }, conn);

  const { totalCount, edges } = data.Employees;
  if (totalCount > edges.length) {
    console.warn(`[visit] truncated: got ${edges.length} of ${totalCount} active employees — raise MAX_ROWS`);
  }

  return edges.map(({ node }) => {
    const designation = node.designation?.name ?? '';
    return {
      id: node.name,
      name: node.employee_name,
      designation,
      short: shortDesignation(designation),
      reportsTo: node.reports_to?.name ?? null,
      hq: node.custom_territory?.name ?? '',
      vacant: isVacantId(node.name, node.employee_name),
      onLeave: false, // overlaid below, once actual leave is known
      userId: node.user_id?.name || null,
      roleProfile: node.custom_role_profile__name || null,
    };
  });
}

/* Role Profile is a TREE on this instance, and "Sales" is a node in it --
   `parent_role_profile` chains BE9-ELBR-KE-THR -> ABM3-ELBR-KE-THR ->
   RBM-ELBR-KE-THR -> ... -> Sales. 397 of the 441 profiles hang off it.
   Fetched whole and walked here rather than filtered server-side, because
   `lft`/`rgt` are all ZERO on this instance -- the nested set was never
   built, so the usual "between lft and rgt" trick returns nothing.

   `parent_role_profile { name }`, not `parent_role_profile__name`: the
   scalar shadow exists for Employee.custom_role_profile but NOT for this
   field, and asking for the one that does not exist fails the whole query.
   Both were checked against the live schema. */
const ROLE_PROFILES_QUERY = `
  query RoleProfileTree($first: Int) {
    RoleProfiles(first: $first) {
      totalCount
      edges { node { name parent_role_profile { name } } }
    }
  }
`;

const SALES_ROLE_ROOT = 'Sales';

async function fetchSalesRoleProfiles(conn) {
  const data = await graphqlRequest(ROLE_PROFILES_QUERY, { first: MAX_ROWS }, conn);
  const { totalCount, edges } = data.RoleProfiles;
  if (totalCount > edges.length) {
    console.warn(`[visit] truncated: got ${edges.length} of ${totalCount} role profiles — raise MAX_ROWS`);
  }

  const childrenOf = new Map();
  for (const { node } of edges) {
    const parent = node.parent_role_profile?.name;
    if (!parent) continue;
    if (!childrenOf.has(parent)) childrenOf.set(parent, []);
    childrenOf.get(parent).push(node.name);
  }

  /* Iterative, and guarded by the visited set it is building: a role profile
     tree is user-maintained data, and one accidental cycle should not hang
     the screen. */
  const under = new Set();
  const stack = [SALES_ROLE_ROOT];
  while (stack.length) {
    const current = stack.pop();
    if (under.has(current)) continue;
    under.add(current);
    for (const child of childrenOf.get(current) ?? []) stack.push(child);
  }
  return under;
}

/* Who belongs on a SALES team report.
 *
 * Two signals, because neither alone is right on this data:
 *
 *   - The role profile is authoritative when it is set: 379 of 496 active
 *     employees sit under the Sales node, and the 52 with a profile outside
 *     it are CRM, Accounts, HR, Distribution and so on. Those are the rows
 *     this filter exists to drop.
 *
 *   - 65 ACTIVE EMPLOYEES HAVE NO ROLE PROFILE AT ALL, and 27 of them are
 *     Business Executives and Area Business Managers -- field staff whose
 *     visits are the entire subject of this screen. Filtering on the profile
 *     alone deletes them, which is a far worse error than showing a few
 *     extra people: their calls would still be counted in the HQ totals
 *     while their names vanished from the tree, so the tree would stop
 *     adding up to the cards above it.
 *
 * EITHER SIGNAL IS ENOUGH -- the profile does NOT get to veto the ladder.
 * That was the first version of this rule, and it decapitated the tree: the
 * General Manager (E00003), who every Zonal Sales Manager and Sales Manager
 * reports to, carries `custom_role_profile = 'IT'`. Treating the profile as
 * authoritative dropped him, and with him the root the whole sales hierarchy
 * hangs from -- ten managers became false roots at once.
 *
 * A GM filed under IT is a data-entry artifact. The designation ladder is
 * this screen's own definition of the sales hierarchy (DESIGNATION_SHORT),
 * and where the two disagree the ladder is the truer one. Checked on the live
 * roster: the OR re-admits exactly ONE person, that GM, and nobody else.
 *
 * The CEO is still out, deliberately -- not on the ladder, and GM is meant to
 * be the top of this tree. See DESIGNATION_SHORT's note. */
const SALES_SHORTS = new Set(['BE', 'ABM', 'RBM', 'SM', 'ZSM', 'GM']);

export function inSales(member, salesProfiles) {
  if (SALES_SHORTS.has(member.short)) return true;
  return Boolean(member.roleProfile) && salesProfiles.has(member.roleProfile);
}

const POB_QUERY = `
  query PobQuotationsInWindow($f: [DBFilterInput], $first: Int) {
    Quotations(filter: $f, first: $first) {
      totalCount
      edges { node {
        name
        party_name { name }
        owner { name }
        total
        grand_total
        transaction_date
      } }
    }
  }
`;

/* ASSUMED, NOT YET VERIFIED -- see shape.js's PobEntry doc for the full
   reasoning and the exact join this rests on. Returns RAW entries keyed by
   the quotation's `owner` email, not by employeeId: resolving owner -> BE is
   fetchVisitDataset's job below, once `team` (and its userId) is available,
   so this function stays a plain, independently-testable "ask ERPNext for
   quotations in a window" the same shape as fetchVisitRows/fetchTeam.

   `party_name` is a DYNAMIC Link -- its target doctype depends on
   `quotation_to` ("Lead" here, "Customer" for a distributor quotation) --
   resolved as the generic `BaseDocType` on this GraphQL layer, same category
   as `event_participants.reference_docname` at the top of this file, which
   is the one field that 500s on this ERP no matter how it's selected. This
   one is filtered to `quotation_to = 'Lead'` server-side, so every row's
   target really is a Lead, but if `party_name { name }` turns out to hit the
   same resolver bug, the next thing to try is an inline fragment scoped to
   that one doctype: `party_name { ... on Lead { name } }`. */
async function fetchPobQuotations({ from, to }, conn) {
  return fetchWindowed(
    { from, to },
    (window) => fetchPobQuotationsPage(window, conn),
    (a, b) => ({ entries: [...a.entries, ...b.entries], truncated: a.truncated || b.truncated }),
  );
}

async function fetchPobQuotationsPage({ from, to }, conn) {
  const data = await graphqlRequest(POB_QUERY, {
    first: MAX_ROWS,
    f: [
      { fieldname: 'quotation_to', operator: 'EQ', value: 'Lead' },
      { fieldname: 'transaction_date', operator: 'GTE', value: from },
      { fieldname: 'transaction_date', operator: 'LTE', value: to },
    ],
  }, conn);

  const { totalCount, edges } = data.Quotations;
  const truncated = totalCount > edges.length;
  if (truncated) {
    console.info(`[visit] ${from}..${to} holds ${totalCount} POB quotations, over the ${MAX_ROWS} page size — splitting the window`);
  }

  const entries = edges.map(({ node }) => ({
    ownerEmail: node.owner?.name ?? '',
    doctorId: node.party_name?.name ?? '',
    /* grand_total (post-tax/discount) over total (line-item sum) when both
       are present -- it is the number that would actually reach the doctor's
       order, which is what "collected" means on the reference design. */
    amount: Number(node.grand_total ?? node.total ?? 0),
    plannedDate: (node.transaction_date ?? '').slice(0, 10),
  }));

  return { entries, truncated };
}

/* WHO is asking, according to the SAME token that fetched everything else in
   this dataset -- never a separately-passed identity prop, for the same
   reason `gqlToken` itself never leaves this module: threading a viewer
   identity through as a prop is how a Studio field ends up letting a page
   author hand themselves someone else's "my team" scope. Resolved once per
   fetch; failure is silent and falls back to the pre-existing largest-subtree
   heuristic in useVisitKpi.js, so an unresolvable viewer never blocks the
   screen. */
async function resolveViewerEmail(conn) {
  try {
    const res = await fetch(`${new URL(conn.endpointUrl).origin}/api/method/frappe.auth.get_logged_user`, {
      headers: { Authorization: conn.gqlToken ?? '' },
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json?.message ?? null;
  } catch {
    return null;
  }
}

const LEAVE_QUERY = `
  query ApprovedLeaveIn($f: [DBFilterInput], $first: Int) {
    LeaveApplications(filter: $f, first: $first) {
      totalCount
      edges { node { employee { name } from_date to_date leave_type__name } }
    }
  }
`;

/* IDs with approved leave OVERLAPPING [from, to].
 *
 * Asked twice: once for today, once for the selected window. Attendance in
 * the day view is a right-now fact, and in the month view it is a fact about
 * the month — a rep who took the 4th off was on leave in August whether or
 * not they are at a desk this afternoon. Only VACANCY is read as of now in
 * both, because a seat is empty or it is not; there is no such thing as
 * having been vacant last Tuesday.
 *
 * Overlap, not containment: leave from the 28th of last month to the 3rd of
 * this one is leave in this window, and `from_date BETWEEN` would miss it. */
async function fetchLeave({ from, to }, conn) {
  const data = await graphqlRequest(LEAVE_QUERY, {
    first: MAX_ROWS,
    f: [
      { fieldname: 'status', operator: 'EQ', value: 'Approved' },
      { fieldname: 'from_date', operator: 'LTE', value: to },
      { fieldname: 'to_date', operator: 'GTE', value: from },
    ],
  }, conn);

  /* ONE ENTRY PER APPLICATION, not per person: a rep can have two spells of
     leave in a month and they can be different types. Grouped by employee
     because that is how every consumer reads it. */
  const byEmployee = new Map();
  for (const { node } of data.LeaveApplications.edges) {
    const id = node.employee?.name;
    if (!id) continue;
    const list = byEmployee.get(id) ?? [];
    list.push({
      from: (node.from_date ?? '').slice(0, 10),
      to: (node.to_date ?? '').slice(0, 10),
      /* The Leave Type record's own name -- "Casual Leave", "Sick Leave".
         Blank rather than null so a component can print it without a guard;
         the field is mandatory in ERPNext, so blank means the link broke. */
      type: node.leave_type__name ?? '',
    });
    byEmployee.set(id, list);
  }
  return byEmployee;
}

/* Returns the same shape buildMockDataset does: { team, rows, today }.
   Fetches ONE calendar month in one go -- whichever `month` is asked for,
   clamped to today -- so the 'today' and 'month' periods both slice that
   dataset client-side (see periodWindow/inPeriod in selectors.js).

   `gqlEnvironment` is the /tokens row NAME, e.g. "ERP" -- resolved here ONLY
   for its `endpointUrl` (which ERP host to call), never for its stored
   token.

   `gqlToken` is REQUIRED: the signed-in user's own ERP credential, passed
   down by whatever renders this component. There is no fallback -- a caller
   that has no token to give has nothing to view this with, and must not be
   quietly handed a shared one. */
export async function fetchVisitDataset({
  anchorDate,
  month,
  monthTo,
  gqlEnvironment = DEFAULT_GQL_ENVIRONMENT,
  gqlToken: rawGqlToken,
  /* CALLED ONCE PER WAVE, newest dataset as its argument, if the caller wants
     the screen before the whole month lands. Omit it and this behaves as it
     always did: one promise, resolved when everything is in. */
  onWave,
} = {}) {
  const gqlToken = normalizeToken(rawGqlToken);
  if (!gqlToken) {
    throw new Error(
      "[visit] no gqlToken provided -- bind the signed-in user's ERP token; "
      + 'gqlEnvironment only selects which ERP host to call, never a credential.',
    );
  }

  const today = anchorDate ?? todayLocal();
  /* `month` is the picked 'YYYY-MM', defaulting to the one today falls
     in. The window is clamped the same way periodWindow clamps it, so the
     fetch and the slice cannot disagree about where the current month
     ends. */
  const firstMonth = month ?? today.slice(0, 7);
  const lastMonth = monthTo ?? firstMonth;
  const windowFrom = `${firstMonth}-01`;
  const selectedEnd = monthEnd(lastMonth);
  const windowTo = selectedEnd < today ? selectedEnd : today;

  /* TODAY IS ALWAYS ITS OWN QUERY, even when it falls inside the window.
     Two reasons, and there used to be one.

     The old one: the DAY view's attendance is a right-now fact whichever
     month is selected (see useVisitKpi), so a dataset for August with no rows
     for today would report the entire team as not reported the moment you
     flip back to Today. Stretching the window from the picked month to now
     would fetch a year of events to answer a question about one morning.

     The new one: the screen OPENS on Today (VisitReport's `period`), and a
     day is about fifty rows against the month's eleven hundred. Asking for
     the day on its own is what lets the first paint cost one small query
     rather than one large one. Inside the window it is a few duplicate rows,
     dropped when the window lands below. */
  const todayInWindow = today >= windowFrom && today <= windowTo;

  const { endpointUrl } = await getEndpointConfigFromUrlKeyAsync(gqlEnvironment);
  const conn = { endpointUrl, gqlToken, gqlEnvironment };

  /* The month-dependent two are fetched fresh every time; the rest are keyed
     on what they actually vary by -- the token, and the DAY for the two that
     are about today. Flipping from September to August now re-issues only
     the visits and the quotations. */
  const scope = `${endpointUrl}|${gqlToken}`;

  /* ---- WAVE 1: the roster, and today -----------------------------------
     Everything the screen needs to paint what it opens on, and nothing else. */
  const rosterPromise = Promise.all([
    cached(`team:${scope}`, () => fetchTeam(conn)),
    cached(`roles:${scope}`, () => fetchSalesRoleProfiles(conn)),
    cached(`leave:${scope}:${today}`, () => fetchLeave({ from: today, to: today }, conn)),
    cached(`viewer:${scope}`, () => resolveViewerEmail(conn)),
  ]);
  const todayFetch = await cached(`visits:${scope}:${today}`, () =>
    fetchVisitRows({ from: today, to: today }, conn));

  /* WAVES 2 AND 3 START HERE -- after today's query has come back, before
     anything else is awaited. The timing is measured, not tidy:

       queued after all of wave 1:  today at 1.66s, everything at 3.21s
       all fired at once:           today at 2.17s, everything at 2.64s
       started here:                today at 1.68s, everything at 2.69s

     Firing the month alongside the day costs the day half a second, because
     five week-shards saturate the ERP and the browser's connections and the
     small query waits its turn behind them. Waiting for the whole of wave 1
     costs the month the same half second for nothing, since the roster it
     waits on is not an input to it. Between the two: the day gets a clear
     run, the month starts the instant it stops needing one.

     `catch` parks any failure on the promise so a wave that nobody has
     awaited yet cannot surface as an unhandled rejection; the real handling
     is the await further down, which rethrows. */
  const parked = (p) => { p.catch(() => {}); return p; };
  const windowPromise = parked(Promise.all([
    fetchVisitRowsSharded({ from: windowFrom, to: windowTo }, conn),
    cached(`leave:${scope}:${windowFrom}:${windowTo}`, () =>
      fetchLeave({ from: windowFrom, to: windowTo }, conn)),
  ]));
  const pobPromise = parked(fetchPobQuotations({ from: windowFrom, to: windowTo }, conn));

  const [allTeam, salesProfiles, leaveToday, viewerEmail] = await rosterPromise;

  /* SALES ONLY. The roster query asks for every active employee because the
     role profile tree is the thing that decides who is in Sales, and that is
     not expressible as an Employee filter -- `custom_role_profile` is a flat
     link, and the 397 profiles under Sales are only knowable by walking the
     tree. So the narrowing happens here, once, and everything downstream --
     the scope picker, the tree, attendance, every rep count -- sees a roster
     that is already only Sales. */
  const team = allTeam.filter((m) => inSales(m, salesProfiles));
  const dropped = allTeam.length - team.length;
  if (dropped > 0) {
    console.info(`[visit] roster narrowed to Sales: ${team.length} of ${allTeam.length} active employees (${dropped} outside)`);
  }

  /* Names in, ids out. A row arrives carrying the employee's primary key in
     both fields (see fetchVisitRows); the roster is the one place that maps
     it to a person, and doing it here means every consumer downstream gets
     a name without knowing the roster exists. An id with no matching
     employee keeps the id -- an unknown rep is better identified by their
     number than by a blank. */
  const nameByEmployeeId = new Map(team.map((m) => [m.id, m.name]));

  /* The login-email index the participant resolution, the POB attribution and
     the viewer lookup all need. Built once, here, because all three now
     happen in different waves. */
  const employeeIdByEmail = new Map(
    team.filter((m) => m.userId).map((m) => [m.userId.toLowerCase(), m.id]),
  );

  /* A viewer whose email matches no employee's userId (Administrator, a
     service account, an email typo in ERP) resolves to null, same as an
     unattributed POB owner -- useVisitKpi.js's fallback chain handles it. */
  const viewerId = viewerEmail ? employeeIdByEmail.get(viewerEmail.toLowerCase()) ?? null : null;

  const todayRows = attributeRows(todayFetch.rows, nameByEmployeeId, employeeIdByEmail);

  /* The dataset as it stands after each wave. `ready` is the load-bearing
     part: a consumer must not render a month total off a dataset whose month
     has not arrived, and a flag it can read beats a row count it would have
     to guess from. See useVisitKpi, which holds the screen for the period the
     reader is actually looking at and lets the rest land quietly. */
  const build = ({ rows, leaveInWindow, pob, truncated, ready }) => ({
    /* BOTH leave flags, because the two periods ask different questions of
       the same roster: `onLeave` is "out today", `onLeaveInWindow` is "took
       leave at some point in the selected range". attendanceOf picks. */
    team: team.map((m) => ({
      ...m,
      onLeave: leaveToday.has(m.id),
      onLeaveInWindow: leaveInWindow.has(m.id),
      /* THE SPELLS THEMSELVES, so the Absent drill-down can name the days and
         say what kind of leave each was. A boolean could say somebody was
         away; only this can say when, and for how long, and why. */
      leave: leaveInWindow.get(m.id) ?? [],
    })),
    rows,
    pob,
    today,
    viewerId,
    ready,
    /* WHICH dataset hit the cap, not just THAT one did. These are three
       different doctypes with three different volumes: a single month of
       visits is a few thousand rows, while the POB quotations behind the
       same month can be an order of magnitude more. Collapsing them into one
       boolean made the screen tell a reader looking at ONE month to "pick
       fewer months" when what had actually overflowed was the money. */
    truncated,
  });

  const NO_LEAVE = new Map();
  onWave?.(build({
    rows: todayRows,
    leaveInWindow: NO_LEAVE,
    pob: [],
    truncated: { visits: todayFetch.truncated, pob: false },
    /* Says what is KNOWN, not what is on screen: the money cards read an
       amount, and an amount of zero is a claim rather than a blank. The
       consumer decides what to show while `pob` is false. */
    ready: { today: true, window: false, pob: false },
  }));

  /* ---- WAVE 2: the picked window ---------------------------------------
     Sharded by date and run in parallel (see fetchVisitRowsSharded), because
     rows scanned is the only thing this ERP charges for and the date window
     is the only lever it leaves. The leave spells over the same window come
     along rather than following: the Absent bucket is part of the month's
     attendance, not a detail of it, and a month view without them would show
     people as not-reported who were on approved leave. */
  const [windowFetch, leaveInWindow] = await windowPromise;

  const windowRows = attributeRows(windowFetch.rows, nameByEmployeeId, employeeIdByEmail);
  /* REPLACED, not merged, when today falls inside the window: the window
     query already returned today's events, and concatenating would count
     every one of this morning's visits twice. Outside the window the two are
     disjoint by construction and both are needed. */
  const rows = todayInWindow ? windowRows : [...windowRows, ...todayRows];
  const visitsTruncated = windowFetch.truncated || todayFetch.truncated;

  onWave?.(build({
    rows,
    leaveInWindow,
    pob: [],
    truncated: { visits: visitsTruncated, pob: false },
    ready: { today: true, window: true, pob: false },
  }));

  /* ---- WAVE 3: the money -----------------------------------------------
     Last because it is the only thing on this screen that no visit number
     depends on. POB is a second doctype, an order of magnitude bigger in a
     busy month, and every card but the two money ones is already correct
     without it. */
  const pobQuotations = await pobPromise;

  /* Resolving `ownerEmail` to an employeeId needs `team`, so it happens here
     rather than inside fetchPobQuotations, which only has the quotations
     query to work with. A quotation whose owner is not a mapped employee's
     userId (Administrator, an ops account, someone inactive) is dropped
     rather than attributed to nobody -- an unattributed rupee amount would
     inflate whichever total it silently landed under. */
  const pob = pobQuotations.entries
    .map((q) => ({
      employeeId: employeeIdByEmail.get(q.ownerEmail.toLowerCase()) ?? null,
      doctorId: q.doctorId,
      amount: q.amount,
      plannedDate: q.plannedDate,
    }))
    .filter((entry) => entry.employeeId != null);

  const final = build({
    rows,
    leaveInWindow,
    pob,
    truncated: { visits: visitsTruncated, pob: pobQuotations.truncated },
    ready: { today: true, window: true, pob: true },
  });
  onWave?.(final);
  return final;
}

/* WHO ACTUALLY WENT, per row -- the one piece of the dataset that needs the
 * roster, lifted out of fetchVisitDataset so each wave can run it over its own
 * rows without rebuilding the indexes.
 *
 * The attribution is the PARTICIPANT, not the plan owner. A joint call arrives
 * as one row per attendee, all carrying the same Event; stamping them all with
 * the Event's employee -- which this used to do -- counted one doctor twice
 * against the rep who owned the plan and credited the colleague who actually
 * went with nothing. Neither number was true, and roughly a fifth of live
 * events are joint, so neither was rare. */
function attributeRows(fetched, nameByEmployeeId, employeeIdByEmail) {
  return fetched.map((r) => {
    /* The participant table is a dynamic link, so what it points at decides
       how to read it: on a Doctor Visit plan it names an Employee and the
       value is already the roster key; on the calendar-synced events it names
       a User and has to go through the login index. */
    const participantId =
      r.participantRefType === 'Employee'
        /* Checked against the roster rather than trusted, so a participant
           pointing at an employee this viewer cannot see does not become an
           id nothing can render. */
        ? (nameByEmployeeId.has(r.participantRef) ? r.participantRef : null)
        : r.participantRefType === 'User'
          ? employeeIdByEmail.get(r.participantRef.toLowerCase()) ?? null
          : null;

    /* Falls back to the plan owner when the participant cannot be resolved,
       which is the old behaviour for exactly the rows that cannot answer the
       new question -- a visit attributed to nobody would vanish from every
       scope on the screen. */
    const employeeId = participantId ?? r.planOwnerId;

    return {
      ...r,
      employeeId,
      employeeName: nameByEmployeeId.get(employeeId) || employeeId,
      participantId,
      /* Falls back to the raw reference, then to the plan owner's name. An
         attendee we cannot name is still better identified by their id or
         login than by a blank row in the participant table. */
      participantName:
        (participantId && nameByEmployeeId.get(participantId))
        || r.participantRef
        || nameByEmployeeId.get(r.planOwnerId)
        || r.planOwnerId,
    };
  });
}
