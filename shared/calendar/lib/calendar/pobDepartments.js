import { resolveVisibleRoleIds } from "@calendar/lib/employeeHeirachy";

/**
 * Departments whose products this user may bill POB against.
 *
 * A manager's own role profile has no department: an SM covers several
 * (SM-Vasco spans Vasco Chennai and Vasco Coimbatore) and ERP's field holds
 * only one, so it is left empty — which used to leave every SM with an empty
 * item list. Resolve it down the same role hierarchy the calendar uses for
 * event visibility and take the union, so a manager gets exactly what their
 * team carries. A BE is a leaf, so this is just their own department.
 */
export function resolvePobDepartments(elbritRoleEdges, roleId) {
  if (!roleId) return [];

  const visibleRoleIds = new Set(
    resolveVisibleRoleIds(elbritRoleEdges, roleId)
  );
  const departments = new Set();

  elbritRoleEdges?.forEach(({ node }) => {
    if (!node?.role_id || !visibleRoleIds.has(node.role_id)) return;
    if (node.sales_team__name) departments.add(node.sales_team__name);
  });

  return [...departments];
}
