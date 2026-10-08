import { graphqlRequest } from "@calendar/lib/graphql-client";
import { AUTH_CONFIG } from "@calendar/components/auth/calendar-users";
import {
  EMPLOYEES_QUERY, DOCTOR_QUERY, HQ_TERRITORIES_QUERY,
  ITEMS_QUERY
} from "@calendar/components/calendar/module/event/graphql/events.query";
import { ERP_DOCTOR_FIELDS } from "@calendar/components/calendar/module/event/graphql/field-config";
import { getCached } from "@calendar/lib/data-cache";
import { mapDoctors } from "@calendar/lib/helper";

const MAX_ROWS = 1000; // safe upper bound

// Only surface active employees — Left/Inactive employees may still carry stale
// role profiles (with no ERP User) and would otherwise pollute the dropdowns and
// break hierarchy-based DocShare (sharing with a user that no longer exists).
const ACTIVE_EMPLOYEE_FILTER = {
  fieldname: "status",
  operator: "EQ",
  value: "Active",
};

export async function fetchEmployeeNodes() {
  return getCached("EMPLOYEE_RAW", async () => {
    const data = await graphqlRequest(EMPLOYEES_QUERY, {
      first: MAX_ROWS,
      filters: [ACTIVE_EMPLOYEE_FILTER],
    });

    const nodes = data?.Employees?.edges?.map(({ node }) => node) || [];
    // An empty list is ERP's intermittent empty reply, not a company with no
    // staff. Throwing keeps it out of the cache (getCached drops rejections),
    // so the next call really asks again instead of reusing "nobody".
    if (!nodes.length) {
      throw new Error("ERP returned no employees");
    }
    return nodes;
  });
}

export async function fetchEmployees() {
  const employees = await fetchEmployeeNodes();

  return (
    employees.map((node) => ({
      doctype: "Employee",
      value: node.name,
      label: node.employee_name,
      email: node.user_id || node.company_email, // the ERP User first: DocShare targets a User
      role: node.designation?.name ?? null,
      roleId: node.role_id,
      hqTerritory: node.custom_hq__name ?? null,
      leave_approver: node.leave_approver?.name ?? null,
    })) || []
  );
}

export async function searchEmployees(search) {
  const query = search?.trim().toLowerCase() ?? "";
  // The picker's search handler has no catch; a failed load finds nobody.
  const employees = await fetchEmployeeNodes().catch(() => []);

  const filteredEmployees = !query
    ? employees
    : employees.filter((node) =>
        [
          node.employee_name,
          node.company_email,
          node.user_id,
          node.designation?.name,
          node.name,
        ]
          .filter(Boolean)
          .some((value) =>
            String(value).toLowerCase().includes(query)
          )
      );

  return (
    filteredEmployees.map((node) => ({
      doctype: "Employee",
      value: node.name,
      label: node.employee_name,
      email: node.user_id || node.company_email, // the ERP User first: DocShare targets a User
      role: node.designation?.name ?? null,
      roleId: node.role_id,
      hqTerritory: node.custom_hq__name ?? null,
      leave_approver: node.leave_approver?.name ?? null,
    })) || []
  );
}

export async function fetchItems() {
  return getCached("POB_ITEMS", async () => {
    const data = await graphqlRequest(ITEMS_QUERY, {
      first: MAX_ROWS,
      filters: [
        {
          fieldname: "custom_last_mrp",
          operator: "GT",
          value: "0",
        },
      ],
    });

    const unique = new Map();

    data?.Items?.edges.forEach(({ node }) => {
      if (!unique.has(node.item_name)) {
        unique.set(node.item_name, {
          value: node.item_name,
          label: node.item_name,
          rate: Number(node.custom_last_mrp),
        });
      }
    });

    return Array.from(unique.values());
  });
}

function normalizeDepartmentName(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function normalizeDepartmentKey(value) {
  return normalizeDepartmentName(value).replace(/[^a-z0-9]/g, "");
}

function departmentsMatch(left, right) {
  const normalizedLeft = normalizeDepartmentName(left);
  const normalizedRight = normalizeDepartmentName(right);
  const keyLeft = normalizeDepartmentKey(left);
  const keyRight = normalizeDepartmentKey(right);

  if (!normalizedLeft || !normalizedRight) return false;

  return (
    normalizedLeft === normalizedRight ||
    keyLeft === keyRight ||
    normalizedLeft.includes(normalizedRight) ||
    normalizedRight.includes(normalizedLeft) ||
    keyLeft.includes(keyRight) ||
    keyRight.includes(keyLeft)
  );
}

function parseBoundaryDate(value, boundary = "start") {
  if (!value) return null;

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;

  if (boundary === "end") {
    parsed.setHours(23, 59, 59, 999);
  } else {
    parsed.setHours(0, 0, 0, 0);
  }

  return parsed;
}

function isActiveDepartmentMapping(detail) {
  const validFrom = parseBoundaryDate(detail?.valid_from, "start");
  const validTo = parseBoundaryDate(detail?.valid_to, "end");
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (!detail?.valid_from && !detail?.valid_to) {
    return true;
  }

  if (detail?.valid_from && !validFrom) {
    return false;
  }

  if (detail?.valid_to && !validTo) {
    return false;
  }

  if (validFrom && !validTo) {
    return today >= validFrom;
  }

  if (!validFrom && validTo) {
    return today <= validTo;
  }

  return today >= validFrom && today <= validTo;
}

/**
 * Products a user may bill POB against.
 *
 * Accepts one department or several: a manager's role profile carries no
 * department of its own (an SM covers more than one, and the link field holds
 * only a single value), so callers pass the departments of every role under
 * them. An item qualifies when ANY of them matches an active mapping.
 */
export async function fetchItemsByDepartment(departmentNames) {
  const normalizedDepartments = (
    Array.isArray(departmentNames) ? departmentNames : [departmentNames]
  )
    .map(normalizeDepartmentName)
    .filter(Boolean);

  // No department resolved means nothing can match — don't spend a full item
  // fetch to arrive at an empty list.
  if (!normalizedDepartments.length) return [];

  return getCached(
    `POB_ITEMS_${[...normalizedDepartments].sort().join("|")}`,
    async () => {
      const data = await graphqlRequest(ITEMS_QUERY, {
        first: MAX_ROWS,
        filters: [
          {
            fieldname: "custom_last_mrp",
            operator: "GT",
            value: "0",
          },
        ],
      });

      const unique = new Map();

      data?.Items?.edges.forEach(({ node }) => {
        const mappings = Array.isArray(node.custom_department_details)
          ? node.custom_department_details
          : [];

        const isAllowed = mappings.some((detail) => {
          if (!isActiveDepartmentMapping(detail)) return false;

          return normalizedDepartments.some((department) =>
            departmentsMatch(detail?.elbrit_department__name, department)
          );
        });

        if (!isAllowed) return;

        if (!unique.has(node.item_name)) {
          unique.set(node.item_name, {
            value: node.item_name,
            label: node.item_name,
            rate: Number(node.custom_last_mrp),
          });
        }
      });

      return Array.from(unique.values());
    }
  );
}

export async function fetchDoctors() {
  const data = await graphqlRequest(DOCTOR_QUERY, {
    first: MAX_ROWS,
  });
  
  return mapDoctors(data);
}
function getErpBaseUrl() {
  const { erpUrl } = AUTH_CONFIG;

  if (!erpUrl) {
    throw new Error("Missing ERP auth configuration");
  }

  return erpUrl
    .replace(/(\/api(?:\/method)?\/graphql|\/graphql)\/?$/i, "")
    .replace(/\/$/, "");
}

const ROLE_DOCTOR_FIELDS = JSON.stringify([
  "name", "lead_name", "city", "custom_latitude", "custom_longitude",
  "custom_doctor_code", "custom_speciality", "custom_specialty", "email_id",
  "custom_category", "custom_category1", "custom_category2", "custom_category3",
  "territory",
]);

// Doctors mapped (Lead.custom_role_profile) to one of `roleIds` AT `territory`:
// the mapping row itself must carry that HQ, since one doctor is often mapped to
// several roles in different HQs (DR-4672: Chennai for Vasco, Kanchipuram for
// CND and Elbrit). The doctor's own `territory` field plays no part — the
// mapping says who works a doctor and where. `allRoles` (admins) drops the role
// condition and keeps only the HQ.
//
// REST, not GraphQL: GraphQL silently ignores a `role_profile_list` filter (it
// is a child-table field) and returns unrelated Leads, and it can't list Leads
// by name either. REST joins the Role Profile Multiselect child table once, so
// the role and HQ conditions both apply to the same mapping row. Notes are not
// read here — the visit dialog loads them per doctor via fetchDoctorById.
const ROLE_CHUNK = 80; // an SM's team runs to hundreds of roles; keeps each URL short
const MAX_LEAD_PAGES = 50; // 50k mapping rows: far past any team, stops a runaway loop

// PAGED until a short page: one page of MAX_ROWS used to be the whole answer,
// and a team's mapping at a big HQ runs past it — an RBM at HQ-Chennai has
// 1,812 rows (1,608 doctors), so ~620 never loaded (DR-2657 among them). The
// pages are sorted by row so none is skipped or repeated between them.
async function fetchMappedLeads(filters) {
  const { authToken } = AUTH_CONFIG;
  if (!authToken) {
    throw new Error("Missing ERP auth configuration");
  }
  const rows = [];
  for (let page = 0; page < MAX_LEAD_PAGES; page += 1) {
    const params = new URLSearchParams({
      fields: ROLE_DOCTOR_FIELDS,
      filters: JSON.stringify(filters),
      order_by: "`tabLead`.`name` asc, `tabRole Profile Multiselect`.`name` asc",
      limit_start: String(page * MAX_ROWS),
      limit_page_length: String(MAX_ROWS),
    });
    const response = await fetch(`${getErpBaseUrl()}/api/resource/Lead?${params}`, {
      headers: {
        Accept: "application/json",
        Authorization: `token ${authToken}`,
      },
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = (await response.json())?.data ?? [];
    rows.push(...data);
    if (data.length < MAX_ROWS) break;
  }
  return rows;
}

export async function fetchDoctorsByRoles(roleIds, territory, { allRoles = false } = {}) {
  if (!territory || (!allRoles && !roleIds?.length)) return [];
  const hqFilter = ["Role Profile Multiselect", "hq", "=", territory];

  const batches = allRoles
    ? [[hqFilter]]
    : Array.from({ length: Math.ceil(roleIds.length / ROLE_CHUNK) }, (_, i) => [
        ["Role Profile Multiselect", "role_profile_list", "in", roleIds.slice(i * ROLE_CHUNK, (i + 1) * ROLE_CHUNK)],
        hqFilter,
      ]);
  const results = await Promise.all(batches.map(fetchMappedLeads));

  // The child-table join returns a doctor once per matching mapping row, and
  // the batches can overlap, so keep one row per doctor.
  const byName = new Map();
  results.flat().forEach((row) => {
    if (row?.name && !byName.has(row.name)) byName.set(row.name, row);
  });

  // Reshape REST rows into the GraphQL node shape mapDoctors reads. The HQ shown
  // is the mapping's — the one being planned — not the doctor's territory field.
  const edges = [...byName.values()].map((row) => ({
    node: {
      ...row,
      custom_specialty__name: row.custom_specialty,
      custom_category__name: row.custom_category,
      custom_category1__name: row.custom_category1,
      custom_category2__name: row.custom_category2,
      custom_category3__name: row.custom_category3,
      territory__name: territory,
    },
  }));
  return mapDoctors({ Leads: { edges } });
}
export async function searchDoctors({
  search,
  territory,
}) {
  const filter = [];

  if (territory) {
    filter.push({
      fieldname: "territory",
      operator: "EQ",
      value: territory,
    });
  }

  if (search?.trim()) {
    filter.push({
      fieldname: ERP_DOCTOR_FIELDS.searchName,
      operator: "LIKE",
      value: `%${search}%`,
    });
  }
  

  const data = await graphqlRequest(DOCTOR_QUERY, {
    first: MAX_ROWS,
    filter,
  });

  return mapDoctors(data);
}
// Fetch a single doctor (Lead) by its id/name, with its notes. Used to
// guarantee the doctor of an open visit is available for name/notes resolution
// even when it falls outside the capped `fetchDoctors()` slice (MAX_ROWS).
// NOTE: filtering the `Leads` LIST by `name` returns [] in frappe_graphql — use
// the single-document `Lead(name:)` query (same shape `fetchLeadNotes` relies on).
export async function fetchDoctorById(doctorName) {
  if (!doctorName) return [];

  const data = await graphqlRequest(
    `
    query GetDoctor($name: String!) {
      Lead(name: $name) {
        name
        lead_name
        city
        custom_latitude
        custom_longitude
        custom_doctor_code
        custom_speciality
        custom_specialty__name
        email_id
        notes {
          name
          note
          creation
          idx
          doctype
          modified
        }
        custom_category__name
        custom_category3__name
        custom_category2__name
        custom_category1__name
        territory__name:${ERP_DOCTOR_FIELDS.territory}
      }
    }
    `,
    { name: doctorName }
  );

  if (!data?.Lead) return [];

  // Reuse mapDoctors by wrapping the single node in the list-query shape.
  return mapDoctors({ Leads: { edges: [{ node: data.Lead }] } });
}

export async function fetchHQTerritories() {
  const data = await graphqlRequest(HQ_TERRITORIES_QUERY, {
    first: MAX_ROWS,
  });

  return (
    data?.Territorys?.edges.map(({ node }) => ({
      doctype: "Territory",
      value: node.name, // ERP value
      label: node.name, // UI label (same)
    })) || []
  );
}
