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
   binds it the same way it already does for CalendarPage/DoctorDetail) --
   never resolved here, so a shared/service credential can never quietly
   stand in for the viewer. */
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

const VISITS_QUERY = `
  query VisitsInWindow($f: [DBFilterInput], $first: Int) {
    Events(filter: $f, first: $first) {
      totalCount
      edges { node {
        name
        subject
        starts_on
        custom_employee_id { name }
        custom_doctor { name }
        custom_hq { name }
        custom_department { name }
        custom_pob_given
        event_participants {
          custom_visit_time
          custom_distance
          custom_is_force_visit
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
  const data = await graphqlRequest(VISITS_QUERY, {
    first: MAX_ROWS,
    f: [
      { fieldname: 'event_category', operator: 'EQ', value: 'Doctor Visit plan' },
      { fieldname: 'starts_on', operator: 'GTE', value: `${from} 00:00:00` },
      { fieldname: 'starts_on', operator: 'LTE', value: `${to} 23:59:59` },
    ],
  }, conn);

  const { totalCount, edges } = data.Events;
  if (totalCount > edges.length) {
    console.warn(`[visit] truncated: got ${edges.length} of ${totalCount} events for ${from}..${to} — raise MAX_ROWS`);
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
        employeeName: node.custom_employee_id?.name ?? '',
        doctorId: node.custom_doctor?.name ?? '',
        doctorName: node.custom_doctor?.name ?? '',
        hq: node.custom_hq?.name ?? '',
        department: node.custom_department?.name ?? '',
        pobGiven: Boolean(node.custom_pob_given),
        visitTime: p?.custom_visit_time ?? null,
        distanceKm: p?.custom_distance ?? null,
        forceVisit: Boolean(p?.custom_is_force_visit),
      });
    }
  }
  return rows;
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
  if (totalCount > edges.length) {
    console.warn(`[visit] truncated: got ${edges.length} of ${totalCount} POB quotations for ${from}..${to} — raise MAX_ROWS`);
  }

  return edges.map(({ node }) => ({
    ownerEmail: node.owner?.name ?? '',
    doctorId: node.party_name?.name ?? '',
    /* grand_total (post-tax/discount) over total (line-item sum) when both
       are present -- it is the number that would actually reach the doctor's
       order, which is what "collected" means on the reference design. */
    amount: Number(node.grand_total ?? node.total ?? 0),
    plannedDate: (node.transaction_date ?? '').slice(0, 10),
  }));
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
   Fetches the whole calendar month up to `today` in one go -- exactly what
   the mock does -- so 'today' and 'mtd' periods both slice client-side from
   one dataset (see periodWindow/inPeriod in selectors.js).

   `gqlEnvironment` is the /tokens row NAME, e.g. "ERP" -- resolved here ONLY
   for its `endpointUrl` (which ERP host to call), never for its stored
   token.

   `gqlToken` is REQUIRED: the signed-in user's own ERP credential, passed
   down by whatever renders this component. There is no fallback -- a caller
   that has no token to give has nothing to view this with, and must not be
   quietly handed a shared one. */
export async function fetchVisitDataset({
  anchorDate,
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
  const monthStart = `${today.slice(0, 7)}-01`;

  const { endpointUrl } = await getEndpointConfigFromUrlKeyAsync(gqlEnvironment);
  const conn = { endpointUrl, gqlToken, gqlEnvironment };

  const [rows, team, onLeaveIds, pobQuotations, viewerEmail] = await Promise.all([
    fetchVisitRows({ from: monthStart, to: today }, conn),
    fetchTeam(conn),
    fetchOnLeaveIds(today, conn),
    fetchPobQuotations({ from: monthStart, to: today }, conn),
    resolveViewerEmail(conn),
  ]);

  /* Resolving `ownerEmail` to an employeeId needs `team`, so it happens here
     rather than inside fetchPobQuotations, which only has the quotations
     query to work with. A quotation whose owner is not a mapped employee's
     userId (Administrator, an ops account, someone inactive) is dropped
     rather than attributed to nobody -- an unattributed rupee amount would
     inflate whichever total it silently landed under. */
  const employeeIdByEmail = new Map(
    team.filter((m) => m.userId).map((m) => [m.userId.toLowerCase(), m.id]),
  );
  const pob = pobQuotations
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
  };
}
