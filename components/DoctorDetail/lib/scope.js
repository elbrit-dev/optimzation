"use client";

/**
 * WHAT THIS VIEWER IS ALLOWED TO COUNT.
 *
 * Every fact this page shows about a doctor is stamped with a ROLE PROFILE —
 * the seat that produced it, not the person:
 *
 *   support   `Support Items.custom_role_profile`      (+ custom_department / custom_hq)
 *   visits    `Event Participants.custom_role_profile` (+ the Event's own custom_*)
 *   service   `Doctor Service.department` / `.hq`      (role_profile is OFTEN EMPTY)
 *   POB       nothing of its own — INHERITED from its visit, see below
 *
 * POB IS THE ODD ONE. A Quotation carries no seat, no employee and no
 * department; `Quotation Item`'s only custom fields are GST columns. Its one
 * honest link is `custom_event` -> the doctor visit -> that visit's seat, and
 * every doctor-linked Quotation in ERP does carry it. So a POB is scoped by the
 * visit it was raised on, never by `owner` — owner is routinely an admin or an
 * integration account and says nothing about whose call it was.
 *
 * The attributed order lines on `Sales Order Item` are deliberately NOT read
 * here. They carry doctor, seat, department and HQ and would be the easier
 * source, but order and invoice documents are out of bounds for this page.
 *
 * A POB raised straight from the doctor page has no event at all and stays
 * unattributed — it reaches nobody once scoping is on. That is a gap in the
 * capture flow, not something to paper over by showing it to everyone.
 *
 * A doctor is routinely covered by several seats across several divisions —
 * DR-6879 is worked by BE5-ELBR-MY-MAN (Elbrit Mysore) AND BE7-AURA-KA-MAN
 * (Aura & Proxima Karnataka), both out of HQ-Mangalore. Showing a reader the
 * whole row set would hand an Elbrit Mysore BE the Aura numbers for the same
 * doctor. So the page counts only the rows whose seat falls inside the
 * reader's own span of control.
 *
 * ONE RULE COVERS EVERY GRADE. The span is the reader's own subtree in the
 * reporting hierarchy, and every grade's stated rule falls out of it:
 *
 *   BE    subtree is just them            -> their one HQ
 *   ABM   subtree is their BEs            -> the HQs THEY hold, not the
 *                                            division's whole HQ list
 *   RBM   subtree is their ABMs + BEs     -> their division
 *   SM    subtree is their RBMs downward  -> every division under them, which
 *   ZSM                                      is 1, 2 or 3 of them, never the
 *                                            ones they do not carry
 *
 * There is no per-grade branch anywhere below. Adding one is how the rules
 * drift apart.
 *
 * ------------------------------------------------------------------ WHY THE
 * TREE IS WALKED ON `Employee.reports_to` AND NOT THE OBVIOUS ALTERNATIVES
 *
 * Three other routes look right in ERP and are all wrong:
 *
 *   `Employee.lft`/`rgt`   — the nested set is STALE. E00494 (RBM-CND-CH-CHE)
 *     sits at 184..243 while the manager it reports to, E00006, sits at
 *     189..332; E01053 reports to the same manager from 685..720. A containment
 *     test on those numbers silently returns the wrong people, which is the
 *     worst possible failure for a permission boundary.
 *
 *   `Role Profile.lft`/`rgt` — never maintained at all; every row reads 0/0.
 *
 *   `Role Profile.custom_employee_id` — the seat's back-link to its holder goes
 *     stale on transfer. RBM-AURA-KA-MYS carries NULL for both its employee and
 *     its department, while Employee E01283 correctly names that seat and
 *     carries the department. Read the seat and you lose a whole region; read
 *     the Employee and you do not.
 *
 * `reports_to` is the one link maintained on every move, so it is the only one
 * trusted here. `Role Profile.parent_role_profile` agrees with it and is used
 * ONLY to fill gaps.
 *
 * ------------------------------------------------------------------ WHY THE
 * DEPARTMENT COMES OFF THE SUBTREE AND NEVER OFF THE READER'S OWN ROW
 *
 * An SM or ZSM has `department = "Sales - ELPL"` on their Employee row and
 * `custom_department = null` on their Role Profile. "Sales - ELPL" is a holding
 * bucket, not a division — filtering by it matches nothing. Their real
 * divisions are only discoverable from the RBMs beneath them: E00010's seat is
 * SM-ELB_AURA_KA, and the four RBMs under it name Elbrit Coimbatore, Elbrit
 * Trichy, Elbrit Chennai and Aura & Proxima Karnataka. That is the correction
 * this module exists to make.
 *
 * Vacant seats (`V…` employee ids) are deliberately KEPT. Doctor Service rows
 * are written against them — `by: "V02016"` — so dropping them loses real
 * spend.
 *
 * Left staff are not walked, and do not need to be: their rows are stamped with
 * the SEAT, and the seat is still held by whoever replaced them. Filtering on
 * role profile rather than on employee is what makes a predecessor's POB still
 * count for the person sitting in that chair today.
 */

import { erpList } from "./erp";
import { SERVICE_MIN_RANK, gradeRank } from "./grade";

/** Employee columns the span is built from. Nothing here is optional. */
const SPAN_FIELDS = [
  "name", "employee_name", "designation", "status",
  "custom_role_profile", "role_id",
  "department", "fsl_hq", "custom_territory", "reports_to",
];

/**
 * A Frappe `in` filter travels in the QUERY STRING, so the list cannot grow
 * without bound. A ZSM's level can run to ~90 direct reports; 50 ids per
 * request keeps every URL comfortably inside the limit.
 */
const IN_CHUNK = 50;

/** Depth guard. The real ladder is BE -> ABM -> RBM -> SM -> ZSM -> GM -> CEO. */
const MAX_DEPTH = 10;

const clean = (value) => {
  const text = String(value ?? "").trim();
  return text ? text : null;
};

function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/**
 * Everyone at or below this employee in the reporting tree, INCLUDING them.
 *
 * Walked one level at a time rather than fetched whole: a BE costs a single
 * empty answer, and only a ZSM pays for five rounds. Fetching every Employee
 * and pruning in the browser would cost every BE the whole company.
 */
async function walkSubtree(rootEmployeeId) {
  const seen = new Map();
  let frontier = [rootEmployeeId];

  for (let depth = 0; depth < MAX_DEPTH && frontier.length; depth += 1) {
    const rows = [];
    for (const ids of chunk(frontier, IN_CHUNK)) {
      const batch = await erpList("Employee", {
        fields: SPAN_FIELDS,
        filters: [["reports_to", "in", ids]],
        limit: 2000,
      });
      rows.push(...batch);
    }

    frontier = [];
    for (const row of rows) {
      // A reporting cycle would otherwise loop until MAX_DEPTH burns out.
      if (!row?.name || seen.has(row.name)) continue;
      seen.set(row.name, row);
      frontier.push(row.name);
    }
  }

  return [...seen.values()];
}

/**
 * Turn a set of people into the sets the row filters actually test against.
 *
 * Both halves of each pair are collected because no single source carries all
 * of them: support and POB rows name a role profile, Doctor Service rows name
 * only a department and an HQ, and an Event names both plus the employee.
 */
function collect(rows) {
  const roleProfiles = new Set();
  const departments = new Set();
  const hqs = new Set();
  const employees = new Set();

  for (const row of rows) {
    const seat = clean(row?.custom_role_profile) ?? clean(row?.role_id);
    // "Sales - ELPL" is the holding bucket every SM and ZSM sits in. Letting it
    // into the department set would widen an SM to every division in the
    // company the moment any row happened to carry it.
    const department = clean(row?.department);
    const hq = clean(row?.fsl_hq) ?? clean(row?.custom_territory);

    if (seat) roleProfiles.add(seat);
    if (department && !/^sales\s*-/i.test(department)) departments.add(department);
    if (hq) hqs.add(hq);
    if (clean(row?.name)) employees.add(row.name);
  }

  return { roleProfiles, departments, hqs, employees };
}

/**
 * Fill in seats whose Employee row is missing or whose department is blank.
 *
 * Only reached when the subtree produced seats we could not attach a department
 * to — a vacant chair, or a seat whose holder was never linked. The Role
 * Profile row is the second opinion; it is wrong often enough that it is never
 * the first.
 */
async function backfillFromSeats(span) {
  const seats = [...span.roleProfiles];
  if (!seats.length) return;

  const rows = [];
  for (const ids of chunk(seats, IN_CHUNK)) {
    const batch = await erpList("Role Profile", {
      fields: ["name", "custom_department", "custom_territory", "parent_role_profile"],
      filters: [["name", "in", ids]],
      limit: 2000,
    }).catch(() => []);
    rows.push(...batch);
  }

  for (const row of rows) {
    const department = clean(row?.custom_department);
    const hq = clean(row?.custom_territory);
    if (department && !/^sales\s*-/i.test(department)) span.departments.add(department);
    if (hq) span.hqs.add(hq);
  }
}

/**
 * The reader's span, ready to filter rows with.
 *
 * `resolved: false` means we could not establish who is reading. That is
 * treated as the LEAST privileged reader, never the most: empty sets match no
 * rows and the service gate stays shut. Failing open here would show a doctor's
 * whole cross-division history, and what the company spends on them, to anyone
 * whose Employee record happens to be missing.
 */
export async function resolveScope(viewerRow) {
  const self = viewerRow ?? null;
  const rank = gradeRank({
    roleId: self?.custom_role_profile ?? self?.role_id,
    designation: self?.designation,
  });

  const empty = {
    resolved: false,
    rank,
    canSeeService: false,
    roleProfiles: new Set(),
    departments: new Set(),
    hqs: new Set(),
    employees: new Set(),
    people: [],
  };

  if (!self?.name) return empty;

  let subtree = [];
  try {
    subtree = await walkSubtree(self.name);
  } catch {
    // A failed walk must not silently collapse to "just me", which would look
    // like a working page showing a manager a BE's slice of the doctor.
    return { ...empty, rank };
  }

  const people = [self, ...subtree];
  const span = collect(people);

  if (!span.departments.size || !span.hqs.size) {
    await backfillFromSeats(span).catch(() => {});
  }

  return {
    resolved: true,
    rank,
    canSeeService: rank >= SERVICE_MIN_RANK,
    ...span,
    people,
  };
}

/* ------------------------------------------------------------- row testing */

/**
 * Does this row belong to the reader?
 *
 * The seat is the strongest signal and is tested first. A row with NO seat —
 * which is most Doctor Service rows, where `role_profile` is routinely empty —
 * falls back to department AND HQ together. Either alone is too loose: HQ-
 * Bangalore is worked by Elbrit, Aura and Vasco, and "Elbrit Karnataka" spans
 * HQs an ABM does not hold.
 */
export function rowInScope(scope, { roleProfile, department, hq, employee } = {}) {
  if (!scope?.resolved) return false;

  const seat = clean(roleProfile);
  if (seat) return scope.roleProfiles.has(seat);

  const dept = clean(department);
  const territory = clean(hq);
  if (dept && territory) return scope.departments.has(dept) && scope.hqs.has(territory);
  if (dept) return scope.departments.has(dept);
  if (territory) return scope.hqs.has(territory);

  const person = clean(employee);
  if (person) return scope.employees.has(person);

  // Nothing to judge it by. Unattributed rows are excluded rather than shown to
  // everyone — an untagged row is a data defect, not a shared one.
  return false;
}

/** Keep the rows a reader may count; `read` names where the stamps live. */
export function filterInScope(scope, rows, read) {
  if (!Array.isArray(rows) || !rows.length) return [];
  if (!scope?.resolved) return [];
  return rows.filter((row) => rowInScope(scope, read(row)));
}

/** A Link reads as a scalar over REST and as `field__name` over GraphQL. */
const link = (row, field) =>
  clean(row?.[field]) ?? clean(row?.[field + "__name"]) ?? clean(row?.[field]?.name);

/**
 * Narrow every raw payload to the reader, in one place.
 *
 * Applied to the RAW rows, before anything is derived, so no total, average or
 * chart series is ever computed over rows the reader may not count. Filtering
 * after derivation would leave the summary numbers right and the tables wrong.
 */
export function scopeRawRows(scope, { support, service, visits, pobs } = {}) {
  /*
   * FAILS CLOSED. A reader whose span we could not establish gets NOTHING, not
   * everything — the same stance `resolveViewer` already takes on the service
   * gate. Falling open here would mean a single failed Employee read quietly
   * handed someone every division's numbers for the doctor, and it would look
   * exactly like a working page.
   *
   * The caller surfaces `scoped: false` so the page can say why it is empty
   * rather than showing a doctor who appears to have no history.
   */
  if (!scope?.resolved) {
    return { support: { totals: [], items: [] }, service: [], visits: [], pobs: [] };
  }

  /* ---- support: the item rows carry the stamp; the parent total does not. */
  const items = filterInScope(scope, support?.items ?? [], (r) => ({
    roleProfile: r?.role_profile,
    department: r?.department,
    hq: r?.hq,
  }));

  /*
   * The month totals are DROPPED once scoping is on, and that is deliberate.
   * `Doctor Support`'s parent row totals the whole month across every seat that
   * worked the doctor. deriveSupport turns whatever the item rows do not account
   * for into an "unassigned remainder" row — which, under scoping, would be the
   * OTHER divisions' support money, handed to this reader as a mystery figure.
   * Better to show only the rows they may count than to show them a number they
   * are not allowed to see and cannot explain.
   */
  const scopedSupport = { totals: [], items };

  /* ---- service: `role_profile` is usually blank, so dept+HQ carries it. */
  const scopedService = filterInScope(scope, service ?? [], (r) => ({
    roleProfile: r?.role_profile,
    department: r?.department,
    hq: r?.hq,
    employee: r?.by,
  }));

  /*
   * ---- visits: the Event's own seat OR any participant's.
   *
   * The participant table is what makes a manager's own attendance count: an
   * ABM who joined a BE's call is in `event_participants` with their own seat,
   * while the Event itself still names the BE who planned it. Testing only the
   * Event would drop every visit a reader actually went on with someone else.
   *
   * A visit that qualifies is kept WHOLE, participants included. The participant
   * rows are what prove the visit happened at all, and pruning them to the
   * reader's own seat would turn a colleague's attended call into an apparently
   * missed one.
   */
  const scopedVisits = (visits ?? []).filter((event) => {
    if (rowInScope(scope, {
      roleProfile: link(event, "custom_role_profile"),
      department: link(event, "custom_department"),
      hq: link(event, "custom_hq"),
      employee: link(event, "custom_employee_id"),
    })) return true;

    const participants = Array.isArray(event?.event_participants) ? event.event_participants : [];
    return participants.some((p) => {
      const seat = link(p, "custom_role_profile");
      if (seat) return scope.roleProfiles.has(seat);
      const person = link(p, "reference_docname");
      return person ? scope.employees.has(person) : false;
    });
  });

  /*
   * ---- POB: inherited from the visit it was raised on.
   *
   * A Quotation carries no seat of its own, so the only honest test is whether
   * the reader can see the EVENT behind it. A POB with no event — raised
   * straight from the doctor page — reaches nobody; see the header note.
   */
  const visible = new Set(scopedVisits.map((e) => clean(e?.name)).filter(Boolean));
  const scopedPobs = (pobs ?? []).filter((q) => {
    const event = link(q, "custom_event");
    return event ? visible.has(event) : false;
  });

  return {
    support: scopedSupport,
    service: scopedService,
    visits: scopedVisits,
    pobs: scopedPobs,
  };
}
