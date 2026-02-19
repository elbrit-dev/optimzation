import { graphqlRequest } from "@calendar/lib/graphql-client";
import {
  EMPLOYEES_QUERY,DOCTOR_QUERY,HQ_TERRITORIES_QUERY,
  ITEMS_QUERY
} from "@calendar/services/events.query";
import { getCached } from "@calendar/lib/participants-cache";

const MAX_ROWS = 1000; // safe upper bound

export async function fetchEmployees() {
  const data = await graphqlRequest(EMPLOYEES_QUERY, {
    first: MAX_ROWS,
  });

  return (
    data?.Employees?.edges.map(({ node }) => ({
      doctype: "Employee",
      value: node.name,          // ERP ID → saved
      label: node.employee_name, 
      email: node.company_email, 
      role: node.designation?.name ?? null,// UI text
      roleId:node.role_id,
      leave_approver:node.leave_approver?.name ?? null,
    })) || []
  );
}

export async function fetchItems() {
  return getCached("POB_ITEMS", async () => {
    const data = await graphqlRequest(ITEMS_QUERY, {
      first: MAX_ROWS,
      filters: [
        {
          fieldname: "whg_last_pts",
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
          rate: Number(node.whg_last_pts),
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

  return (
    data?.Leads?.edges.map(({ node }) => ({
      doctype: "Lead",
      value: node.name,
      label: node.lead_name,
      kly_lat_long: node.fsl_lat_lon,
    })) || []
  );
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