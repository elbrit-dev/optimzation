"use client";

/**
 * Every ERP read the doctor detail makes — over GraphQL, with the reader's own
 * token, the way the Support Report and Home Overview read.
 *
 * WHY NOT REST ANY MORE. The page used to read most of this through
 * `/api/resource/<Doctype>` lists, walking the reporting tree one REST level at
 * a time. The two reports that work for every grade read the same doctypes
 * through GraphQL, with one shared connection, one promise cache and one error
 * shape; this file puts the doctor on that same footing. The transport is the
 * Support Report's own (`makeConn` / `gql` / `cached` / `loggedUser`), so a fix
 * to how ERP is asked lands in all three.
 *
 * Every read returns rows in the SAME shape the old REST reads did, so
 * derive.js and console.js — and therefore the design — are untouched. Where a
 * field name differs (GraphQL writes a Link as `x__name`) it is renamed here
 * and nowhere else.
 *
 * GraphQL has no block comments, `#` only, and these are JS template literals,
 * so no backticks inside them either. A `/* … *\/` comment inside a query is a
 * syntax error that fails the whole request — the old POB query carried one.
 */

import { cached, gql, loggedUser, makeConn } from "../../features/support-report/data/erpClient";

export { makeConn, loggedUser };

const FIRST = 2000;
const EQ = (fieldname, value) => [{ fieldname, operator: "EQ", value }];
// The doctor's rows from `since` on ("2026-04-01"), when a floor is given.
const FROM = (fieldname, since) => (since ? [{ fieldname, operator: "GTE", value: since }] : []);
const clean = (v) => (v == null ? null : String(v).trim() || null);
const title = (v) => (v == null ? null : String(v).charAt(0) + String(v).slice(1).toLowerCase());

/**
 * A list read that will not take "nothing" for an answer when ERP itself says
 * there is something. frappe_graphql intermittently answers a populated query
 * with `totalCount: N, edges: []`; believing it would show a doctor with no
 * history. Asked again a couple of times before the empty answer is accepted.
 */
async function list(conn, query, variables, pick) {
  for (let attempt = 1; ; attempt += 1) {
    const conn_ = pick(await gql(conn, query, variables));
    const edges = conn_?.edges ?? [];
    if (edges.length || !(conn_?.totalCount > 0) || attempt >= 3) return edges.map((e) => e.node);
    await new Promise((r) => setTimeout(r, 300 * attempt));
  }
}

/* ------------------------------------------------------------------- org */

const EMPLOYEES_QUERY = `
  query DoctorOrg($first: Int) {
    Employees(first: $first) { edges { node {
      name employee_name status
      user_id__name designation__name department__name
      custom_role_profile__name role_id
      fsl_hq__name custom_territory__name reports_to__name
    } } }
  }
`;

const ROLE_PROFILES_QUERY = `
  query DoctorSeats($first: Int) {
    RoleProfiles(first: $first) { edges { node {
      name custom_department { name } custom_territory { name }
    } } }
  }
`;

/**
 * The whole org, once per credential: every Employee (all statuses — a vacant
 * or left seat is still a link in the reporting chain) as the Employee-row
 * shape scope.js reads, the seats' own department/HQ, and who the token is.
 * One ~1k-row read, the same one the Support Report makes, instead of a REST
 * round trip per level of the tree.
 */
export function fetchOrg(conn) {
  return cached(conn, "doctor:org", async () => {
    const [rows, seats, email] = await Promise.all([
      gql(conn, EMPLOYEES_QUERY, { first: 20000 }).then((d) => d.Employees.edges.map(({ node: n }) => ({
        name: n.name,
        employee_name: n.employee_name,
        // Select fields arrive as enums ("ACTIVE"); the old REST rows said "Active".
        status: title(n.status),
        user_id: clean(n.user_id__name),
        designation: clean(n.designation__name),
        department: clean(n.department__name),
        custom_role_profile: clean(n.custom_role_profile__name),
        role_id: clean(n.role_id),
        fsl_hq: clean(n.fsl_hq__name),
        custom_territory: clean(n.custom_territory__name),
        reports_to: clean(n.reports_to__name),
      }))),
      gql(conn, ROLE_PROFILES_QUERY, { first: 5000 })
        .then((d) => new Map(d.RoleProfiles.edges.map(({ node: n }) => [n.name, {
          department: clean(n.custom_department?.name),
          hq: clean(n.custom_territory?.name),
        }])))
        // The seats only fill gaps; a token that cannot read them still works.
        .catch(() => new Map()),
      loggedUser(conn),
    ]);
    return { rows, seats, email };
  });
}

/* ------------------------------------------------------------------ Lead */

/**
 * `Lead(name:)` rather than a filtered `Leads` list, because filtering that
 * list by name returns [] in frappe_graphql. Richest shape first: one unknown
 * field fails the whole query, so the second rung drops the optional ones.
 * `salutation` is a Link and must never be asked as a scalar.
 */
const LEAD_FIELDS = `
  name lead_name first_name city state country__name
  custom_doctor_code custom_specialty__name custom_speciality
  custom_category__name custom_category1__name custom_category2__name
  custom_category3__name custom_latitude custom_longitude
  custom_latitude_and_longitude custom_address_created status
  email_id creation modified
  notes { name added_by__name added_on note creation }
  territory { name territory_name }
  custom_role_profile {
    role_profile_list__name department__name hq__name
    role_profile_list { custom_employee_id { employee_name employee } }
  }
`;

const LEAD_QUERIES = [
  `query DoctorLead($name: String!) { Lead(name: $name) {
    ${LEAD_FIELDS}
    custom_qualification__name mobile_no phone whatsapp_no company__name
  } }`,
  `query DoctorLead($name: String!) { Lead(name: $name) { ${LEAD_FIELDS} } }`,
];

export async function fetchLead(conn, id) {
  let last;
  for (const query of LEAD_QUERIES) {
    try {
      const d = await gql(conn, query, { name: id });
      return d?.Lead ?? null;
    } catch (e) { last = e; }
  }
  throw last;
}

/* --------------------------------------------------------------- Support */

/**
 * Doctor Support with its `item_table` NESTED — one read, where REST needed
 * two because selecting child columns INNER JOINs a month with no item rows
 * out of existence. Here the parent always comes back, so `totals` is the
 * authority on each month and `items` on how it splits, exactly as before.
 */
const SUPPORT_QUERY = `
  query DoctorSupport($f: [DBFilterInput], $first: Int) {
    DoctorSupports(filter: $f, first: $first) { totalCount edges { node {
      name date custom_period custom_total_qty custom_total_amount
      item_table {
        item__name brand qty rate amount
        custom_department__name custom_hq__name custom_role_profile__name custom_status
      }
    } } }
  }
`;

export async function fetchSupport(conn, id, since) {
  const docs = await list(conn, SUPPORT_QUERY, { f: [...EQ("doctor", id), ...FROM("date", since)], first: FIRST }, (d) => d.DoctorSupports);
  docs.sort((a, b) => String(b.date ?? "").localeCompare(String(a.date ?? "")));
  const totals = docs.map((d) => ({
    name: d.name, date: d.date, custom_period: d.custom_period,
    custom_total_qty: d.custom_total_qty, custom_total_amount: d.custom_total_amount,
  }));
  const items = docs.flatMap((d) => (d.item_table ?? []).map((t) => ({
    name: d.name, date: d.date, custom_period: d.custom_period,
    item: t.item__name, brand: t.brand, qty: t.qty, rate: t.rate, amount: t.amount,
    department: t.custom_department__name, hq: t.custom_hq__name,
    role_profile: t.custom_role_profile__name, item_status: t.custom_status,
  })));
  return { totals, items };
}

/* --------------------------------------------------------------- Service */

/** `service_name` and `workflow_state` are Links here, hence `__name`. */
const SERVICE_QUERY = `
  query DoctorService($f: [DBFilterInput], $first: Int) {
    DoctorServices(filter: $f, first: $first) { totalCount edges { node {
      name service_name__name service_amount service_date date
      by__name hq__name department__name role_profile__name remarks workflow_state__name
    } } }
  }
`;

export async function fetchServices(conn, id) {
  const rows = await list(conn, SERVICE_QUERY, { f: EQ("doctor", id), first: FIRST }, (d) => d.DoctorServices);
  return rows
    .map((r) => ({
      name: r.name, service_name: r.service_name__name, service_amount: r.service_amount,
      service_date: r.service_date, date: r.date, by: r.by__name, hq: r.hq__name,
      department: r.department__name, role_profile: r.role_profile__name,
      remarks: r.remarks, workflow_state: r.workflow_state__name,
    }))
    .sort((a, b) => String(b.service_date ?? b.date ?? "").localeCompare(String(a.service_date ?? a.date ?? "")));
}

/* ------------------------------------------------------------- Addresses */

/**
 * An Address reaches its doctor through the `links` (Dynamic Link) child
 * table. Filtering on the child's `link_name` works over GraphQL — verified
 * against live ERP — so this no longer needs REST's two-doctype filter.
 */
const ADDRESS_QUERY = `
  query DoctorAddresses($f: [DBFilterInput], $first: Int) {
    Addresses(filter: $f, first: $first) { totalCount edges { node {
      name address_title address_type address_line1 address_line2
      city county state pincode country__name phone email_id modified
      links { link_doctype__name link_name__name }
    } } }
  }
`;

export async function fetchAddresses(conn, id) {
  const rows = await list(conn, ADDRESS_QUERY, { f: EQ("link_name", id), first: 20 }, (d) => d.Addresses);
  return rows
    // The child filter matches the name alone; keep only links that are this Lead.
    .filter((r) => (r.links ?? []).some((l) => l.link_name__name === id && (!l.link_doctype__name || l.link_doctype__name === "Lead")))
    .sort((a, b) => String(b.modified ?? "").localeCompare(String(a.modified ?? "")))
    // Select fields arrive as enums ("DOCTOR"); REST said "Doctor".
    .map(({ country__name, links, address_type, ...r }) => ({ ...r, address_type: title(address_type), country: country__name }));
}

/* ------------------------------------------------------------------- POB */

/**
 * `Quotation.custom_doctorvisit` is a Link to the LEAD despite its name.
 * `item_code__name`, not `item_code`: asking a Link as a scalar 400s the whole
 * document. One row per quotation with nested `items`; derive.js normalises it.
 */
const POB_QUERY = `
  query DoctorPobs($f: [DBFilterInput], $first: Int) {
    Quotations(filter: $f, first: $first) { totalCount edges { node {
      name transaction_date customer_name customer_address__name
      address_display territory__name total_qty valid_till status grand_total
      custom_event__name custom_doctorvisit__name
      items { item_name item_code__name net_amount qty rate }
    } } }
  }
`;

export async function fetchPobs(conn, id, first = 500, since) {
  const rows = await list(conn, POB_QUERY, { f: [...EQ("custom_doctorvisit", id), ...FROM("transaction_date", since)], first }, (d) => d.Quotations);
  return rows.sort((a, b) => String(b.transaction_date ?? "").localeCompare(String(a.transaction_date ?? "")));
}

/* ---------------------------------------------------------------- Visits */

/**
 * `event_participants` is what proves a visit HAPPENED — the calendar stamps
 * the employee participant `attending` with a `custom_visit_time`; the Event's
 * own `attending` is never written.
 */
const VISIT_QUERY = `
  query DoctorVisits($f: [DBFilterInput], $first: Int) {
    Events(filter: $f, first: $first) { totalCount edges { node {
      name subject status event_type event_category starts_on creation
      custom_hq__name custom_doctor__name custom_pob_given
      custom_force_visit_reason custom_latitude custom_longitude
      custom_employee_id__name
      custom_role_profile__name custom_department__name
      custom_employee_id { employee_name employee }
      event_participants {
        reference_doctype__name reference_docname__name attending
        custom_visit_time custom_is_force_visit
        custom_role_profile__name
      }
    } } }
  }
`;

export async function fetchVisits(conn, id, since) {
  const rows = await list(conn, VISIT_QUERY, { f: [...EQ("custom_doctor", id), ...FROM("starts_on", since)], first: 1000 }, (d) => d.Events);
  return rows.sort((a, b) => String(b.starts_on ?? "").localeCompare(String(a.starts_on ?? "")));
}
