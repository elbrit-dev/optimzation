/**
 * Every ERP read the page makes, and why each is shaped the way it is.
 *
 * The GraphQL ladders and the REST order_by clauses here are not stylistic —
 * each one is a shape that was proven against live ERP, and several of the
 * obvious alternatives fail silently rather than loudly. The comments say which.
 */

import { erpList, firstSuccessful } from "./erp";

/* ------------------------------------------------------------------ Lead */

/**
 * The doctor, richest shape first.
 *
 * Asked as `Lead(name:)` rather than a filtered `Leads` list because filtering
 * that list by name returns [] in frappe_graphql.
 *
 * `custom_role_profile` is the important part: it is where the doctor's
 * DEPARTMENTS live, and through `custom_employee_id` it names the people who
 * cover them. Rows in that child table are routinely duplicated, so whatever
 * reads it has to dedupe.
 */
const LEAD_FIELDS = `
  name lead_name first_name salutation city state country
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

export const LEAD_QUERIES = [
  `query DoctorLead($name: String!) { Lead(name: $name) {
    ${LEAD_FIELDS}
    custom_qualification__name mobile_no phone whatsapp_no company__name
  } }`,
  `query DoctorLead($name: String!) { Lead(name: $name) { ${LEAD_FIELDS} } }`,
];

export function fetchLead(vars) {
  return firstSuccessful(LEAD_QUERIES, vars, (d) => d?.Lead ?? null);
}

/* ------------------------------------------------------------------- POB */

/**
 * The POB ledger.
 *
 * `Quotation.custom_doctorvisit` is a Link to the LEAD, despite the name — it
 * holds "DR-47718", not an event id. Verified against live rows.
 *
 * The Quotation itself carries no department and no role. `owner` is the login
 * that raised it, and that resolves to an Employee, which is where both come
 * from — see fetchEmployeeIndex. `owner` is therefore not optional here even
 * though nothing renders it directly.
 */
const POB_FIELDS = `
  name owner transaction_date customer_name customer_address__name
  address_display territory__name total_qty valid_till
  custom_event__name custom_doctorvisit__name
  items { item_name item_code net_amount qty rate }
`;

export const POB_QUERIES = [
  `query DoctorPobs($first: Int!, $filters: [DBFilterInput!]) {
    Quotations(first: $first, filter: $filters) {
      edges { node { ${POB_FIELDS} status grand_total } }
    }
  }`,
  `query DoctorPobs($first: Int!, $name: String!) {
    Quotations(first: $first, filter: {fieldname: "custom_doctorvisit", operator: EQ, value: $name}) {
      edges { node { ${POB_FIELDS} status grand_total } }
    }
  }`,
  `query DoctorPobs($first: Int!, $name: String!) {
    Quotations(first: $first, filter: {fieldname: "custom_doctorvisit", operator: EQ, value: $name}) {
      edges { node { ${POB_FIELDS} } }
    }
  }`,
];

export function fetchPobs(vars) {
  // Drop the bounded shape when there is no date floor to bound with.
  const ladder = vars.pobFilters ? POB_QUERIES : POB_QUERIES.slice(1);
  return firstSuccessful(ladder, vars, (d) => normalizeConnection(d?.Quotations));
}

/* ---------------------------------------------------------------- Visits */

/**
 * Visit history.
 *
 * `event_participants` is what proves a visit HAPPENED: the calendar stamps the
 * employee participant `attending` with a `custom_visit_time`, and the parent
 * Event's own `attending` is never written. Reading the parent would mark every
 * planned call as made.
 *
 * `custom_employee_id` is the department/role hook, the same way `owner` is on
 * a Quotation.
 */
const VISIT_QUERY = (varDecl, filterArg) => `query DoctorVisits(${varDecl}) {
  Events(first: 1000, filter: ${filterArg}) {
    edges { node {
      name subject status event_type event_category starts_on creation
      custom_hq__name custom_doctor__name custom_pob_given
      custom_force_visit_reason custom_latitude custom_longitude
      custom_employee_id__name
      custom_employee_id { employee_name employee }
      event_participants {
        reference_doctype__name reference_docname__name attending
        custom_visit_time custom_is_force_visit
      }
    } }
  }
}`;

export const VISIT_QUERIES = [
  VISIT_QUERY("$filters: [DBFilterInput!]", "$filters"),
  VISIT_QUERY("$name: String!", '{fieldname: "custom_doctor", operator: EQ, value: $name}'),
];

export function fetchVisits(vars) {
  const ladder = vars.visitFilters ? VISIT_QUERIES : VISIT_QUERIES.slice(1);
  return firstSuccessful(ladder, vars, (d) => normalizeConnection(d?.Events));
}

/* --------------------------------------------------------------- Support */

/**
 * SUPPORT — what the doctor gives back. The number the business runs on.
 *
 * A monthly roll-up per doctor fed from Ecubix, and it is FULLY ATTRIBUTED —
 * but only in its child table. The parent row carries just the month and the
 * totals; `item_table` (doctype Support Items) holds one row per product with
 * its own department, HQ, role profile and brand, summing exactly to those
 * totals.
 *
 * That distinction matters more than it looks: `/api/resource/Doctor Support?
 * fields=["*"]` returns ONLY the parent columns, because the list API never
 * returns child tables. Reading it that way and concluding support has no
 * department is a mistake this file exists to stop anyone repeating.
 *
 * Two reads, deliberately. Selecting child columns makes Frappe INNER JOIN, so
 * a support month with no item rows would vanish and its money with it. The
 * parent read is the authority on the total; the item read is the authority on
 * how it splits, and anything the items do not account for is surfaced rather
 * than dropped.
 */
const SUPPORT_FIELDS = ["name", "date", "custom_period", "custom_total_qty", "custom_total_amount"];

const SUPPORT_ITEM_FIELDS = [
  "name", "date", "custom_period",
  "`tabSupport Items`.item as item",
  "`tabSupport Items`.brand as brand",
  "`tabSupport Items`.qty as qty",
  "`tabSupport Items`.rate as rate",
  "`tabSupport Items`.amount as amount",
  "`tabSupport Items`.custom_department as department",
  "`tabSupport Items`.custom_hq as hq",
  "`tabSupport Items`.custom_role_profile as role_profile",
  "`tabSupport Items`.custom_status as item_status",
];

export async function fetchSupport(doctorId) {
  const [totals, items] = await Promise.all([
    erpList("Doctor Support", {
      fields: SUPPORT_FIELDS,
      filters: [["doctor", "=", doctorId]],
      limit: 200,
      // Qualified AND backticked: once the child is joined both tables carry
      // `date`-adjacent columns and an unqualified clause answers 500.
      orderBy: "`tabDoctor Support`.`date` desc",
    }),
    erpList("Doctor Support", {
      fields: SUPPORT_ITEM_FIELDS,
      filters: [["doctor", "=", doctorId]],
      limit: 2000,
      orderBy: "`tabDoctor Support`.`date` desc",
    }).catch(() => []),
  ]);
  return { totals, items };
}

/* --------------------------------------------------------------- Service */

/**
 * SERVICE — what the company spends ON the doctor.
 *
 * Unlike support this one is fully attributed: `department` and `role_profile`
 * are on the row, so the department pager and the role coverage ring are real
 * here without any lookup.
 *
 * `service_date` IS SOMETIMES NULL (rows that carry only an auto-series name),
 * so nothing downstream may assume every row is dated. `workflow_state` is
 * "Draft" on effectively every row and is never filtered on — filtering would
 * empty the panel for every doctor.
 */
const SERVICE_FIELDS = [
  "name", "service_name", "service_amount", "service_date", "date",
  "by", "hq", "department", "role_profile", "remarks", "workflow_state",
];

export function fetchServices(doctorId) {
  return erpList("Doctor Service", {
    fields: SERVICE_FIELDS,
    filters: [["doctor", "=", doctorId]],
    limit: 500,
    orderBy: "`tabDoctor Service`.`service_date` desc",
  });
}

/* ------------------------------------------------------------- Addresses */

/**
 * The doctor's clinics, as far as ERP has them.
 *
 * An Address joins to its doctor through the `Dynamic Link` CHILD table, and
 * frappe_graphql's DBFilterInput has nowhere to name a second doctype, so this
 * one cannot be asked over GraphQL at all. REST can express it.
 *
 * The order_by must stay qualified AND backticked: both tables carry
 * `modified`, and an unqualified clause answers 500 once the child is joined.
 *
 * ERP has no notion of a clinic TYPE or VISITING DAYS, which the design shows
 * as chips — those render from what is here and say so when empty.
 */
const ADDRESS_FIELDS = [
  "name", "address_title", "address_type", "address_line1", "address_line2",
  "city", "county", "state", "pincode", "country", "phone", "email_id",
];

export function fetchAddresses(doctorId) {
  return erpList("Address", {
    fields: ADDRESS_FIELDS,
    filters: [
      ["Dynamic Link", "link_doctype", "=", "Lead"],
      ["Dynamic Link", "link_name", "=", doctorId],
    ],
    limit: 20,
    orderBy: "`tabAddress`.`modified` desc",
  });
}

/* ----------------------------------------------------------------- utils */

/** Unwrap { edges: [{ node }] } / arrays / a bare row into a flat list. */
export function normalizeConnection(value) {
  if (value == null) return null;
  if (Array.isArray(value)) return value.map((row) => row?.node ?? row).filter(Boolean);
  if (Array.isArray(value.edges)) return value.edges.map((e) => e?.node ?? e).filter(Boolean);
  if (Array.isArray(value.data)) return value.data;
  return [value];
}
