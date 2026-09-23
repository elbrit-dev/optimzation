import { TAG_IDS } from "@calendar/components/calendar/constants";

const compact = (value) => String(value ?? "").replace(/\s+/g, "");

// "<Doctor>-Visit-<Team>". The team segment is dropped when unknown rather than
// falling back to the owner's name.
export function composeDoctorVisitTitle(doctorName, teamName) {
  return [compact(doctorName), "Visit", compact(teamName)]
    .filter(Boolean)
    .join("-");
}

// Team = department (sales team) of the employee's role profile. Keyed on
// users[].roleId, which is the role the hierarchy uses — not the stale role id
// stored on the Event itself.
export function createTeamNameResolver(users = [], elbritRoleEdges = []) {
  const teamByRoleId = new Map();
  elbritRoleEdges.forEach(({ node }) => {
    if (node?.role_id && node.sales_team__name) {
      teamByRoleId.set(node.role_id, node.sales_team__name);
    }
  });

  const roleIdByEmployeeId = new Map(
    users.map((user) => [String(user.id), user.roleId])
  );

  return (employeeId) =>
    employeeId == null
      ? null
      : teamByRoleId.get(roleIdByEmployeeId.get(String(employeeId))) ?? null;
}

// Rebuilt from the doctor segment each time, so it is safe on titles that
// already carry a team.
export function applyDoctorVisitTeamTitles(events, resolveTeamName) {
  return events.map((event) => {
    if (event?.tags !== TAG_IDS.DOCTOR_VISIT_PLAN) return event;

    const doctorName = String(event.title ?? "").split("-")[0].trim();
    if (!doctorName) return event;

    const title = composeDoctorVisitTitle(
      doctorName,
      resolveTeamName(event.ownerEmployeeId)
    );

    return title === event.title ? event : { ...event, title };
  });
}
