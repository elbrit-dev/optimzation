import { fetchAllCustomers } from "@calendar/components/calendar/module/event/services/event.service";
import { ELBRIT_ROLEID, normalizeRoleProfiles } from "@calendar/components/calendar/module/event/graphql/events.query";
import { fetchEmployeeNodes } from "@calendar/components/calendar/module/event/services/master-data.service";
import { mapEmployeesToCalendarUsers } from "@calendar/components/calendar/module/event/services/employee-to-calendar-user";
import { LOGGED_IN_USER } from "@calendar/components/auth/calendar-users";
import { getCached } from "@calendar/lib/data-cache";
import { graphqlRequest } from "@calendar/lib/graphql-client";

const ROLE_CACHE_KEY = "ELBRIT_ROLE_PROFILES";

function mapEmployeesToOptions(employees = []) {
  return employees.map((employee) => ({
    doctype: "Employee",
    value: employee.name,
    label: employee.employee_name,
    email: employee.company_email,
    role: employee.designation?.name ?? null,
    roleId: employee.role_id,
    leave_approver: employee.leave_approver?.name ?? null,
  }));
}

async function fetchElbritRoleEdges() {
  return getCached(ROLE_CACHE_KEY, async () => {
    const rawData = await graphqlRequest(ELBRIT_ROLEID, {
      first: 1000,
    });

    const normalizedData = normalizeRoleProfiles(rawData);
    return normalizedData?.ElbritRoleIDS?.edges ?? [];
  });
}

function mapCustomersToOptions(customers = []) {
  return customers.map((name) => ({
    label: name,
    value: name,
  }));
}

function buildLoggedInUserFallback() {
  if (!LOGGED_IN_USER?.id) {
    return {
      users: [],
      employeeOptions: [],
    };
  }

  return {
    users: [
      {
        id: LOGGED_IN_USER.id,
        name: LOGGED_IN_USER.name ?? LOGGED_IN_USER.id,
        email: LOGGED_IN_USER.email ?? null,
        role: LOGGED_IN_USER.role ?? null,
        status: LOGGED_IN_USER.status ?? "Active",
        leave_approver: LOGGED_IN_USER.leave_approver ?? null,
        roleId: LOGGED_IN_USER.roleId ?? null,
      },
    ],
    employeeOptions: [
      {
        doctype: "Employee",
        value: LOGGED_IN_USER.id,
        label: LOGGED_IN_USER.name ?? LOGGED_IN_USER.id,
        email: LOGGED_IN_USER.email ?? null,
        role: LOGGED_IN_USER.role ?? null,
        roleId: LOGGED_IN_USER.roleId ?? null,
        leave_approver: LOGGED_IN_USER.leave_approver ?? null,
      },
    ],
  };
}

export async function fetchCalendarBootstrapData() {
  const [employeesResult, rolesResult, customersResult] =
    await Promise.allSettled([
      fetchEmployeeNodes(),
      fetchElbritRoleEdges(),
      fetchAllCustomers(),
    ]);

  const employeeUsers =
    employeesResult.status === "fulfilled"
      ? mapEmployeesToCalendarUsers(employeesResult.value)
      : [];
  const employeeOptions =
    employeesResult.status === "fulfilled"
      ? mapEmployeesToOptions(employeesResult.value)
      : [];
  const fallback = buildLoggedInUserFallback();

  return {
    users:
      employeeUsers.length > 0
        ? employeeUsers
        : fallback.users,
    employeeOptions:
      employeeOptions.length > 0
        ? employeeOptions
        : fallback.employeeOptions,
    elbritRoleEdges:
      rolesResult.status === "fulfilled"
        ? rolesResult.value
        : [],
    customerOptions:
      customersResult.status === "fulfilled"
        ? mapCustomersToOptions(customersResult.value)
        : [],
    errors: {
      employees:
        employeesResult.status === "rejected"
          ? employeesResult.reason
          : null,
      roles:
        rolesResult.status === "rejected"
          ? rolesResult.reason
          : null,
      customers:
        customersResult.status === "rejected"
          ? customersResult.reason
          : null,
    },
  };
}
