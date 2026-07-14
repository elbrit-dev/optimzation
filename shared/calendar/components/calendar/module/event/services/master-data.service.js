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
      email: node.company_email || node.user_id,
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
      email: node.company_email || node.user_id,
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

export async function fetchItemsByDepartment(departmentName) {
  const normalizedDepartment = normalizeDepartmentName(departmentName);

  return getCached(
    `POB_ITEMS_${normalizedDepartment || "all"}`,
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
          return (
            departmentsMatch(
              detail?.elbrit_department__name,
              normalizedDepartment
            ) &&
            isActiveDepartmentMapping(detail)
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
