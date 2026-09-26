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
   quotations in a window" the same shape as fetchTeam.

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

/* ---- Visits COUNTED on the server --------------------------------------
 *
 * A month is ~55,000 visits on production — about 38 MB as the rows the
 * report used to download and count. The "Elbrit Visit Summary" server script
 * (server/elbrit_visit_summary.py) counts them where they are and sends one
 * line per (person, planned day, event HQ, status, joint, hour) with how many
 * visits it stands for: a few thousand lines. Each becomes a COUNT ROW here —
 * a row with the fields every count reads and `n`, which the selectors add
 * instead of 1 (see selectors.weightOf). Checked on UAT: the counts equal the
 * rows' own, bucket for bucket.
 *
 * The rows themselves are fetched only when a list is opened — the Dr plan,
 * or the visits behind a bar of the hourly chart — by loadVisitRows below.
 *
 * `sales` is the Sales roster's [id, login email] pairs: attribution (the
 * participant when they are in it, else the plan owner — see attributeRows)
 * needs it, and sending it keeps "who is Sales" decided in one place. */
async function postMethod(method, body, { endpointUrl, gqlToken }) {
  const res = await fetch(`${new URL(endpointUrl).origin}/api/method/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: gqlToken ?? '', Accept: 'application/json' },
    body: JSON.stringify(body),
  });
  let json;
  try {
    json = await res.json();
  } catch {
    throw new Error(`[visit] ERP returned a non-JSON response (HTTP ${res.status})`);
  }
  if (!res.ok || json.exc_type || !json.message) {
    throw new Error(`[visit] ${method}: ${json.exc_type || `HTTP ${res.status}`}`);
  }
  return json.message;
}

/* The hour a count line says, as the visit time a row would carry — so
   chartHourOf reads the same bar. -1 is a done visit with no readable hour:
   'NA' where the hour sits keeps it out of every bar, as the row's own time
   did. */
function countVisitTime(day, hour) {
  return hour >= 0 ? `${day} ${String(hour).padStart(2, '0')}:00:00` : `${day} NA:00:00`;
}

export async function fetchVisitCounts({ from, to }, sales, conn, nameByEmployeeId = new Map()) {
  const m = await postMethod('elbrit_visit_summary', { from, to, sales }, conn);
  return m.rows.map(([e, d, h, s, j, hr, n]) => {
    const employeeId = m.employees[e];
    const plannedDate = m.days[d];
    return {
      employeeId,
      employeeName: nameByEmployeeId.get(employeeId) || employeeId,
      plannedDate,
      hq: m.hqs[h],
      visitTime: s === 0 ? null : countVisitTime(plannedDate, hr),
      forceVisit: s === 2,
      participantCount: j ? 2 : 1,
      pobGiven: false,
      n,
    };
  });
}

/* The rows behind ONE list, attributed exactly as the report attributes
   them. `request` is { mode: 'plan', member } or { mode: 'visits',
   employees, hq ('*' = every HQ- territory), hour, tone }, over { from, to }. */
export async function loadVisitRows(request, sales, conn, nameByEmployeeId, employeeIdByEmail) {
  const m = await postMethod('elbrit_visit_rows', { ...request, sales }, conn);
  return attributeRows(m.rows, nameByEmployeeId, employeeIdByEmail);
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
  /* The window's leave does not need the roster, so it starts now; the
     visits COUNTS do (attribution needs the Sales roster) and start the
     moment it lands, below. */
  const leaveWindowPromise = parked(cached(`leave:${scope}:${windowFrom}:${windowTo}`, () =>
    fetchLeave({ from: windowFrom, to: windowTo }, conn)));
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
     both fields (see elbrit_visit_rows); the roster is the one place that maps
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

  /* WHO IS SALES, as [id, login email] — what the server's attribution
     needs, the same roster attributeRows uses here. */
  const sales = team.map((m) => [m.id, m.userId ?? '']);
  const windowCountsPromise = parked(fetchVisitCounts({ from: windowFrom, to: windowTo }, sales, conn, nameByEmployeeId));
  const todayRows = todayInWindow
    ? []
    : await fetchVisitCounts({ from: today, to: today }, sales, conn, nameByEmployeeId);
  /* The rows behind one list, fetched when it is opened (see loadVisitRows). */
  const loadRows = (request) => loadVisitRows(request, sales, conn, nameByEmployeeId, employeeIdByEmail);

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
    /* COUNT ROWS, not visits: the numbers read them (selectors.weightOf);
       the lists that need real visits ask `loadRows`. */
    countsOnly: true,
    loadRows,
    /* WHICH dataset hit the cap, not just THAT one did. These are three
       different doctypes with three different volumes: a single month of
       visits is a few thousand rows, while the POB quotations behind the
       same month can be an order of magnitude more. Collapsing them into one
       boolean made the screen tell a reader looking at ONE month to "pick
       fewer months" when what had actually overflowed was the money. */
    truncated,
  });

  const NO_LEAVE = new Map();
  /* Today inside the window comes with the window's counts — one call, not
     two for the same day — so there is no separate first wave then. */
  if (!todayInWindow) onWave?.(build({
    rows: todayRows,
    leaveInWindow: NO_LEAVE,
    pob: [],
    truncated: { visits: false, pob: false },
    /* Says what is KNOWN, not what is on screen: the money cards read an
       amount, and an amount of zero is a claim rather than a blank. The
       consumer decides what to show while `pob` is false. */
    ready: { today: true, window: false, pob: false },
  }));

  /* ---- WAVE 2: the picked window ---------------------------------------
     The window's visits COUNTED on the server (see fetchVisitCounts) — a
     month is ~55,000 visits on production, too many to download and count
     here. The leave spells over the same window come
     along rather than following: the Absent bucket is part of the month's
     attendance, not a detail of it, and a month view without them would show
     people as not-reported who were on approved leave. */
  const [windowRows, leaveInWindow] = await Promise.all([windowCountsPromise, leaveWindowPromise]);

  /* REPLACED, not merged, when today falls inside the window: the window
     query already returned today's events, and concatenating would count
     every one of this morning's visits twice. Outside the window the two are
     disjoint by construction and both are needed. */
  const rows = todayInWindow ? windowRows : [...windowRows, ...todayRows];
  /* Counted on the server, over the whole window: nothing is ever cut off. */
  const visitsTruncated = false;

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
