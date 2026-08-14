import { EMPLOYEE_BY_USER_QUERY } from "./employee.graphql";
import { executeHelpDeskGraphQL } from "./graphqlClient";

export async function fetchEmployeeByUser(user, graphqlConfig) {
  if (!user) return null;
  const data = await executeHelpDeskGraphQL(EMPLOYEE_BY_USER_QUERY, { user }, { cache: true, config: graphqlConfig });
  const node = data?.Employees?.edges?.[0]?.node;
  if (!node) return null;

  return {
    id: node.name,
    name: node.employee_name || node.name,
    status: node.status || "",
    // ERP stores the Department docname, which carries a company suffix ("IT - ELPL").
    department: node.department__name || "",
  };
}
