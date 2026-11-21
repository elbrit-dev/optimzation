import { DEPARTMENT_PARENT_QUERY, EMPLOYEE_BY_USER_QUERY } from "./employee.graphql";
import { executeHelpDeskGraphQL } from "./graphqlClient";

export async function fetchEmployeeByUser(user, graphqlConfig) {
  if (!user) return null;
  const data = await executeHelpDeskGraphQL(EMPLOYEE_BY_USER_QUERY, { user }, { cache: true, config: graphqlConfig });
  const node = data?.Employees?.edges?.[0]?.node;
  if (!node) return null;

  const department = node.department__name || "";
  // Every ancestor of the employee's department, nearest first: a department-only
  // collection reaches everyone below that department (the field teams sit under
  // "Sales"). A failed lookup ends the walk; the departments found so far still count.
  const ancestorDepartments = [];
  for (let current = department; current && ancestorDepartments.length < 10; ) {
    const parent = await executeHelpDeskGraphQL(DEPARTMENT_PARENT_QUERY, { name: current }, { cache: true, config: graphqlConfig })
      .then((res) => res?.Departments?.edges?.[0]?.node?.parent_department__name || "")
      .catch(() => "");
    if (!parent || parent === current || ancestorDepartments.includes(parent)) break;
    ancestorDepartments.push(parent);
    current = parent;
  }

  return {
    id: node.name,
    name: node.employee_name || node.name,
    status: node.status || "",
    // ERP stores the Department docname, which carries a company suffix ("IT - ELPL").
    department: node.department__name || "",
    ancestorDepartments,
    designation: node.designation__name || "",
  };
}
