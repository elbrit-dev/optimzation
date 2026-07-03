import { graphqlRequest } from "@calendar/lib/graphql-client";
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

    return data?.Employees?.edges?.map(({ node }) => node) || [];
  });
}

export async function fetchEmployees() {
  const employees = await fetchEmployeeNodes();

  return (
    employees.map((node) => ({
      doctype: "Employee",
      value: node.name,
      label: node.employee_name,
      email: node.company_email,
      role: node.designation?.name ?? null,
      roleId: node.role_id,
      leave_approver: node.leave_approver?.name ?? null,
    })) || []
  );
}

export async function searchEmployees(search) {
  const query = search?.trim().toLowerCase() ?? "";
  const employees = await fetchEmployeeNodes();

  const filteredEmployees = !query
    ? employees
    : employees.filter((node) =>
        [
          node.employee_name,
          node.company_email,
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
      email: node.company_email,
      role: node.designation?.name ?? null,
      roleId: node.role_id,
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

export async function fetchDoctors() {
  const data = await graphqlRequest(DOCTOR_QUERY, {
    first: MAX_ROWS,
  });
  
  return mapDoctors(data);
}
export async function fetchDoctorsByTerritory(territory) {
  const data = await graphqlRequest(DOCTOR_QUERY, {
    first: MAX_ROWS,
    filter: [
      {
        fieldname: "territory",
        operator: "EQ",
        value: territory,
      },
    ],
  });

  return mapDoctors(data);
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
