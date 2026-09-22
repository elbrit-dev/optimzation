'use client';

/* Live ERPNext data source for the Team Report screen. See PLAN.md §2/§4 for
 * how these queries were derived and verified directly against the live
 * endpoint (https://erp.elbrit.org/api/method/graphql).
 *
 * Two hard constraints from that investigation, both still true:
 *
 *   - Link fields come back as an object needing its own subfield selection
 *     (`custom_hq { name }`), not a scalar `__name`-suffixed field. The
 *     `event_participants.reference_docname` field is a Dynamic Link
 *     (`BaseDocType`) whose resolver 500s on this ERP no matter how it is
 *     selected -- it is dropped entirely; every field this screen needs is
 *     already on the Event or the participant row without it.
 *   - `after` + a `filter` throws "Filter must be a tuple or list" on this
 *     ERP (the same constraint ViewPaginator.jsx works around), so nothing
 *     here cursor-paginates. Every query asks for one generous `first`
 *     instead. Current volume is a few hundred visits/day and ~500 active
 *     employees, so one page comfortably holds a month; MAX_ROWS exists to
 *     warn loudly rather than silently truncate if that ever changes.
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
  const json = await res.json();
  if (json.errors?.length) {
    throw new Error(`[visit] ${json.errors.map((e) => e.message).join('; ')}`);
  }
  return json.data;
}

/* A doctor is a CRM Lead on this instance (see shape.js), so `custom_doctor`
   resolves to the Lead type and the label lives in `lead_name` --
   `custom_doctor { name }` alone is the Lead's primary key, "DR-60005",
   which is what the doctor plan was showing where a name belongs.

   This is the ONE field in this module that has not been run against the
   live schema, and a wrong field name fails the WHOLE GraphQL request --
   taking the screen down to print a name, which is a bad trade. So the
   selection is conditional: the first request that comes back complaining
   about this field drops it, retries, and the module remembers for the
   rest of the session. Worst case the sheet shows ids again, which is
   where it started. */
let doctorNameSupported = true;

const VISITS_QUERY = (withDoctorName) => `
  query VisitsInWindow($f: [DBFilterInput], $first: Int) {
    Events(filter: $f, first: $first) {
      totalCount
      edges { node {
        name
        subject
        starts_on
        custom_employee_id { name }
        custom_doctor { name${withDoctorName ? ' lead_name' : ''} }
        custom_hq { name }
        custom_department { name }
        custom_pob_given
        event_participants {
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
   HAPPENED model (one rep per row) has nothing to show for. In practice a
   Doctor Visit plan Event always carries exactly one participant, but this
   does not assume that. */
async function fetchVisitRows({ from, to }, conn) {
  const variables = {
    first: MAX_ROWS,
    f: [
      { fieldname: 'event_category', operator: 'EQ', value: 'Doctor Visit plan' },
      { fieldname: 'starts_on', operator: 'GTE', value: `${from} 00:00:00` },
      { fieldname: 'starts_on', operator: 'LTE', value: `${to} 23:59:59` },
    ],
  };

  let data;
  try {
    data = await graphqlRequest(VISITS_QUERY(doctorNameSupported), variables, conn);
  } catch (error) {
    /* Narrowed to an error that actually names the field, so a timeout or a
       401 is not mistaken for an unsupported schema and does not silently
       cost every later request its doctor names. */
    if (!doctorNameSupported || !/lead_name/i.test(String(error?.message ?? ''))) throw error;
    console.warn('[visit] custom_doctor.lead_name rejected by this schema; falling back to the doctor id', error);
    doctorNameSupported = false;
    data = await graphqlRequest(VISITS_QUERY(false), variables, conn);
  }

  const { totalCount, edges } = data.Events;
  /* Returned as well as warned. A console line is enough while the window
     is always one month and the volume is a few hundred visits a day; it
     is NOT enough now that the picker can ask for a span, because a
     truncated answer produces totals that look ordinary and are wrong.
     The screen says so out loud -- see VisitReport. */
  const truncated = totalCount > edges.length;
  if (truncated) {
    console.warn(`[visit] truncated: got ${edges.length} of ${totalCount} events for ${from}..${to} — narrow the month range or raise MAX_ROWS`);
  }

  const rows = [];
  for (const { node } of edges) {
    const participants = node.event_participants?.length ? node.event_participants : [null];
    for (const p of participants) {
      rows.push({
        eventId: node.name,
        subject: node.subject ?? '',
        plannedDate: (node.starts_on ?? '').slice(0, 10),
        employeeId: node.custom_employee_id?.name ?? '',
        /* The ID for now. `custom_employee_id { name }` is the Employee's
           primary key ("E01102"), not their name -- the same mistake the
           doctor field had. Resolved against the roster in
           fetchVisitDataset rather than by asking for `employee_name`
           here, because that query runs anyway and its answer is the same
           one every other name on this screen comes from. */
        employeeName: node.custom_employee_id?.name ?? '',
        doctorId: node.custom_doctor?.name ?? '',
        /* `||`, not `??`: an empty-string lead_name is as useless as a
           missing one, and the id at least identifies the doctor. */
        doctorName: node.custom_doctor?.lead_name || node.custom_doctor?.name || '',
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
  return /^v/i.test(employeeId ?? '') || /^vacant_/i.test(employeeName ?? '');
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
    };
  });
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
    console.warn(`[visit] truncated: got ${edges.length} of ${totalCount} POB quotations for ${from}..${to} — narrow the month range or raise MAX_ROWS`);
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
  query ApprovedLeaveOn($f: [DBFilterInput], $first: Int) {
    LeaveApplications(filter: $f, first: $first) {
      totalCount
      edges { node { employee { name } } }
    }
  }
`;

/* IDs on approved leave spanning `onDate`. Only ever queried for "today" --
   attendance is a right-now fact, not a fact about the whole reporting
   window (see useVisitKpi.js). */
async function fetchOnLeaveIds(onDate, conn) {
  const data = await graphqlRequest(LEAVE_QUERY, {
    first: MAX_ROWS,
    f: [
      { fieldname: 'status', operator: 'EQ', value: 'Approved' },
      { fieldname: 'from_date', operator: 'LTE', value: onDate },
      { fieldname: 'to_date', operator: 'GTE', value: onDate },
    ],
  }, conn);
  return new Set(data.LeaveApplications.edges.map(({ node }) => node.employee?.name).filter(Boolean));
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

  /* TODAY'S ROWS COME ALONG EVEN WHEN THE WINDOW IS A PAST MONTH.
     Attendance is a right-now fact whatever period the page is showing
     (see useVisitKpi), so a dataset for August with no rows for today
     would report the entire team as not reporting the moment you look at
     it. A second, one-day query rather than one window stretched from the
     picked month to now: on a January selection that would be a year of
     events fetched to answer a question about one morning. */
  const needsToday = today < windowFrom || today > windowTo;

  const { endpointUrl } = await getEndpointConfigFromUrlKeyAsync(gqlEnvironment);
  const conn = { endpointUrl, gqlToken, gqlEnvironment };

  const [windowFetch, todayFetch, team, onLeaveIds, pobQuotations, viewerEmail] = await Promise.all([
    fetchVisitRows({ from: windowFrom, to: windowTo }, conn),
    needsToday ? fetchVisitRows({ from: today, to: today }, conn) : Promise.resolve({ rows: [], truncated: false }),
    fetchTeam(conn),
    fetchOnLeaveIds(today, conn),
    fetchPobQuotations({ from: windowFrom, to: windowTo }, conn),
    resolveViewerEmail(conn),
  ]);

  const fetched = needsToday ? [...windowFetch.rows, ...todayFetch.rows] : windowFetch.rows;

  /* Names in, ids out. A row arrives carrying the employee's primary key in
     both fields (see fetchVisitRows); the roster is the one place that maps
     it to a person, and doing it here means every consumer downstream gets
     a name without knowing the roster exists. An id with no matching
     employee keeps the id -- an unknown rep is better identified by their
     number than by a blank. */
  const nameByEmployeeId = new Map(team.map((m) => [m.id, m.name]));
  const rows = fetched.map((r) => ({
    ...r,
    employeeName: nameByEmployeeId.get(r.employeeId) || r.employeeId,
  }));

  /* Resolving `ownerEmail` to an employeeId needs `team`, so it happens here
     rather than inside fetchPobQuotations, which only has the quotations
     query to work with. A quotation whose owner is not a mapped employee's
     userId (Administrator, an ops account, someone inactive) is dropped
     rather than attributed to nobody -- an unattributed rupee amount would
     inflate whichever total it silently landed under. */
  const employeeIdByEmail = new Map(
    team.filter((m) => m.userId).map((m) => [m.userId.toLowerCase(), m.id]),
  );
  const pob = pobQuotations.entries
    .map((q) => ({
      employeeId: employeeIdByEmail.get(q.ownerEmail.toLowerCase()) ?? null,
      doctorId: q.doctorId,
      amount: q.amount,
      plannedDate: q.plannedDate,
    }))
    .filter((entry) => entry.employeeId != null);

  /* Same email->employeeId map the POB attribution above already built. A
     viewer whose email matches no employee's userId (Administrator, a
     service account, an email typo in ERP) resolves to null, same as an
     unattributed POB owner -- useVisitKpi.js's fallback chain handles it. */
  const viewerId = viewerEmail ? employeeIdByEmail.get(viewerEmail.toLowerCase()) ?? null : null;

  return {
    team: team.map((m) => ({ ...m, onLeave: onLeaveIds.has(m.id) })),
    rows,
    pob,
    today,
    viewerId,
    /* True when EITHER query hit MAX_ROWS. One flag, not two: the reader's
       next move is the same whichever half of the screen is short. */
    truncated: windowFetch.truncated || todayFetch.truncated || pobQuotations.truncated,
  };
}
