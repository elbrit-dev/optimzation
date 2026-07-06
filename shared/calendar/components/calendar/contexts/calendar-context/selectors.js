import { LOGGED_IN_USER } from "@calendar/components/auth/calendar-users";
import { STATUS, TAG_IDS } from "@calendar/components/calendar/constants";

export function buildEmployeeEmailToId(users = []) {
  const map = new Map();

  users.forEach((user) => {
    if (user.email && user.id) {
      map.set(user.email.toLowerCase(), user.id);
    }
  });

  return map;
}

export function buildEmployeeRoleMap(users = []) {
  const map = new Map();

  users.forEach((user) => {
    map.set(user.id, user.roleId);
  });

  return map;
}

export function getEventEmployeeIds(event, employeeEmailToId) {
  const ids = new Set();

  // The creator/owner must always be able to see their own event, even when
  // they didn't add themselves as a participant (e.g. a meeting where only a
  // colleague was invited).
  const ownerId = event.ownerEmployeeId ?? event.owner?.id ?? null;
  if (ownerId) {
    ids.add(ownerId);
  }

  if (event.event_participants?.length) {
    event.event_participants.forEach((participant) => {
      if (
        participant.reference_doctype === "Employee" &&
        participant.reference_docname
      ) {
        ids.add(participant.reference_docname);
      }
    });
  }

  if (event.employees) {
    if (Array.isArray(event.employees)) {
      event.employees.forEach((employeeId) => ids.add(employeeId));
    } else {
      ids.add(event.employees);
    }
  }

  if (event.tags === TAG_IDS.LEAVE) {
    if (event.employee) {
      ids.add(event.employee);
    }

    if (event.leave_approver) {
      const approverId = employeeEmailToId.get(
        event.leave_approver.toLowerCase()
      );

      if (approverId) {
        ids.add(approverId);
      }
    }
  }

  if (event.tags === TAG_IDS.TODO_LIST && event.allocated_to) {
    const allocatedEmployeeId = employeeEmailToId.get(
      event.allocated_to.toLowerCase()
    );

    if (allocatedEmployeeId) {
      ids.add(allocatedEmployeeId);
    }
  }

  if (event.tags === TAG_IDS.TODO_LIST && event.assignedTo?.length) {
    event.assignedTo.forEach((employeeId) => ids.add(employeeId));
  }

  return [...ids];
}

export function getEventRoleIds(
  event,
  employeeRoleMap,
  employeeEmailToId
) {
  const roleIds = new Set();
  const employeeIds = getEventEmployeeIds(event, employeeEmailToId);

  employeeIds.forEach((employeeId) => {
    const roleId = employeeRoleMap.get(employeeId);

    if (roleId) {
      roleIds.add(roleId);
    }
  });

  return [...roleIds];
}

export function filterCalendarEvents({
  allEvents,
  selectedUserId,
  selectedColors,
  selectedStatuses,
  visibleRoleIds,
  allowedEmployeeIds,
  isCurrentUserLeaf = false,
  usersLoading,
  elbritRoleLoading,
  employeeRoleMap,
  employeeEmailToId,
}) {
  if (usersLoading || elbritRoleLoading) {
    return allEvents;
  }

  if (!allEvents?.length) {
    return [];
  }

  const matchesSelectedUsers = (event) => {
    if (!selectedUserId.length) {
      return true;
    }

    const eventEmployeeIds = getEventEmployeeIds(
      event,
      employeeEmailToId
    );

    return selectedUserId.some((id) => eventEmployeeIds.includes(id));
  };

  const matchesSelectedColors = (event) =>
    !selectedColors.length ||
    selectedColors.includes(event.color || "blue");

  const matchesSelectedStatuses = (event) =>
    !selectedStatuses.length ||
    selectedStatuses.includes(
      event.status?.trim()?.toLowerCase()
    );

  let result = allEvents;

  if (LOGGED_IN_USER?.roleId !== "Admin") {
    result = result.filter((event) => {
      // Own events, participants, and (for managers) subordinates in the role
      // hierarchy. This already covers a user's own events, leaves and todos.
      const eventRoleIds = getEventRoleIds(
        event,
        employeeRoleMap,
        employeeEmailToId
      );
      const roleMatch = eventRoleIds.some((roleId) =>
        visibleRoleIds.includes(roleId)
      );
      const eventEmployeeIds = getEventEmployeeIds(
        event,
        employeeEmailToId
      );
      const employeeMatch = eventEmployeeIds.some((employeeId) =>
        allowedEmployeeIds.includes(employeeId)
      );

      if (roleMatch || employeeMatch) {
        return true;
      }

      // Events explicitly shared with the current user (ERP DocShare) are always
      // visible — the recipient is typically outside the owner's hierarchy (e.g.
      // an ABM's HQ Tour Plan shared down to a BE).
      if (event.isSharedWithCurrentUser) {
        return true;
      }

      // Leaf-role users (e.g. BEs) have no subordinates. ERP permission-scopes
      // the events it returns to them to public + own + shared + participant.
      // Their own/shared/participant events are all "Private", so surface any
      // Private event ERP returned to them (this is how a BE sees a plan shared
      // down to them) — but never a "Public" event, which ERP exposes to every
      // user regardless of ownership.
      if (
        isCurrentUserLeaf &&
        String(event.eventType).toLowerCase() === "private"
      ) {
        return true;
      }

      return false;
    });
  }

  return result.filter(
    (event) =>
      matchesSelectedUsers(event) &&
      matchesSelectedColors(event) &&
      matchesSelectedStatuses(event)
  );
}

export function buildLeaveNotifications(
  events,
  employeeResolvers
) {
  return events
    .filter(
      (event) =>
        event.tags === TAG_IDS.LEAVE &&
        event.status?.toLowerCase() === STATUS.OPEN.toLowerCase() &&
        event.leave_approver === LOGGED_IN_USER.email
    )
    .map((leave) => ({
      id: leave.erpName,
      title: "Leave Approval Pending",
      message: `${
        leave.employeeName ??
        employeeResolvers.getEmployeeNameById(leave.employee) ??
        leave.employee
      } applied for ${leave.leaveType}`,
      createdAt: leave.startDate,
      isRead: false,
      leave,
    }));
}
