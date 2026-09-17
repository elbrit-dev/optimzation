/**
 * Every ERP read the page makes, and why each is shaped the way it is.
 *
 * The GraphQL ladders and the REST order_by clauses here are not stylistic —
 * each one is a shape that was proven against live ERP, and several of the
 * obvious alternatives fail silently rather than loudly. The comments say which.
 */

import { erpDoc, erpList, firstAnswer, firstSuccessful } from "./erp";

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
  name lead_name first_name city state country
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

/**
 * The doctor.
 *
 * REST FIRST. `GET /api/resource/Lead/<id>` returns the whole document —
 * notes and custom_role_profile included — in one call, and it does not care
 * what TYPE a field is. GraphQL does: asking for a Link as a scalar 400s the
 * entire query. `salutation` is a Link to Salutation and took the whole page
 * down until it was removed from the selection above; nothing here needs it,
 * because the name is de-prefixed when initials are taken.
 *
 * The GraphQL ladder stays as the fallback for an instance where the REST list
 * permission is withheld but the GraphQL resolver is not.
 */
export function fetchLead(vars) {
  return firstAnswer([
    () => erpDoc("Lead", vars.name),
    () => firstSuccessful(LEAD_QUERIES, vars, (d) => d?.Lead ?? null),
  ]);
}

/* ------------------------------------------------------------------- POB */

/**
 * The POB ledger.
 *
 * `Quotation.custom_doctorvisit` is a Link to the LEAD despite the name — it
 * holds "DR-47718", not an event id.
 *
 * WHO a POB belongs to is NOT `owner`. Owner is whoever saved the record, which
 * is routinely an admin or an integration account, and that says nothing about
 * whose call it was. The Quotation carries no employee and no role profile of
 * its own; the only honest link is `custom_event` -> the doctor visit -> that
 * visit's `custom_employee_id`. A POB raised straight from the doctor page has
 * no event at all, so it stays unattributed rather than being credited to
 * whoever happened to press save.
 */
const POB_FIELDS = `
  name transaction_date customer_name customer_address__name
  address_display territory__name total_qty valid_till
  custom_event__name custom_doctorvisit__name
  /*
   * item_code__name, NOT item_code. It is a Link to Item, and frappe_graphql
   * answers a Link asked as a scalar with "Field 'item_code' of type 'Item'
   * must have a selection of subfields" -- which 400s the WHOLE document, not
   * just this field. Both POB ladders carried the scalar form, so neither could
   * ever have answered; the read only works because REST is tried first, and a
   * POB would have silently come back empty the day that route was refused.
   * Verified against live ERP with scripts/gql-probe.mjs.
   */
  items { item_name item_code__name net_amount qty rate }
`;

export const POB_QUERIES = [
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

const POB_REST_FIELDS = [
  "name", "transaction_date", "customer_name", "customer_address", "address_display",
  "territory", "total_qty", "valid_till", "status", "grand_total",
  "custom_event", "custom_doctorvisit",
  "`tabQuotation Item`.item_name as item_name",
  "`tabQuotation Item`.item_code as item_code",
  "`tabQuotation Item`.qty as qty",
  "`tabQuotation Item`.rate as rate",
  "`tabQuotation Item`.net_amount as net_amount",
];

/**
 * REST first, and the shapes differ on purpose.
 *
 * The REST read selects child columns, so it answers ONE ROW PER LINE and a
 * quotation with no lines drops out of the INNER JOIN. GraphQL answers one row
 * per quotation with a nested `items` array. Both shapes are normalised in
 * derive.js, which is why either can serve.
 */
export function fetchPobs(vars) {
  return firstAnswer([
    async () => {
      const rows = await erpList("Quotation", {
        fields: POB_REST_FIELDS,
        filters: [["custom_doctorvisit", "=", vars.name]],
        limit: 2000,
        orderBy: "`tabQuotation`.`transaction_date` desc",
      });
      return rows;
    },
    () => firstSuccessful(POB_QUERIES, vars, (d) => normalizeConnection(d?.Quotations)),
  ]);
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
      custom_role_profile__name custom_department__name
      custom_employee_id { employee_name employee }
      event_participants {
        reference_doctype__name reference_docname__name attending
        custom_visit_time custom_is_force_visit
        custom_role_profile__name
      }
    } }
  }
}`;

export const VISIT_QUERIES = [
  VISIT_QUERY("$filters: [DBFilterInput!]", "$filters"),
  VISIT_QUERY("$name: String!", '{fieldname: "custom_doctor", operator: EQ, value: $name}'),
];

const VISIT_REST_FIELDS = [
  "name", "subject", "status", "event_type", "event_category", "starts_on", "creation",
  "custom_hq", "custom_doctor", "custom_pob_given", "custom_force_visit_reason",
  "custom_latitude", "custom_longitude", "custom_employee_id",
  "custom_role_profile", "custom_department",
];

/**
 * GraphQL FIRST here, which is the opposite of everywhere else.
 *
 * Only the GraphQL shape brings back `event_participants`, and those are the
 * only proof a visit actually HAPPENED. The REST fallback cannot express that
 * child read, so rows it returns are marked as having UNKNOWN attendance —
 * better than silently reporting every visit as never made.
 */
export function fetchVisits(vars) {
  const ladder = vars.visitFilters ? VISIT_QUERIES : VISIT_QUERIES.slice(1);
  return firstAnswer([
    () => firstSuccessful(ladder, vars, (d) => normalizeConnection(d?.Events)),
    async () => {
      const rows = await erpList("Event", {
        fields: VISIT_REST_FIELDS,
        filters: [["custom_doctor", "=", vars.name]],
        limit: 1000,
        orderBy: "`tabEvent`.`starts_on` desc",
      });
      return rows.map((r) => ({ ...r, __attendanceUnknown: true }));
    },
  ]);
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
