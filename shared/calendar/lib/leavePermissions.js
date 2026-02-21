import { LOGGED_IN_USER } from "@calendar/components/auth/calendar-users";
/**
 * Normalize email safely
 */
function normalizeEmail(email) {
  return (email || "").trim().toLowerCase();
}

/**
 * Resolve leave permissions for current logged-in user
 */
export function resolveLeavePermissions({
  event,
}) {
  if (!event || !LOGGED_IN_USER) {
    return {
      isOwner: false,
      isApprover: false,
      canEditDelete: false,
      canApproveReject: false,
    };
  }

  const loggedUserId = LOGGED_IN_USER.id;
  const loggedUserEmail = normalizeEmail(LOGGED_IN_USER.email);

  const eventEmployeeId = event.employee;
  const eventApproverEmail = normalizeEmail(event.leave_approver);
  const isOwner = eventEmployeeId === loggedUserId;

  const isApprover = eventApproverEmail === loggedUserEmail;

  const isOpen = event.status === "OPEN";

  const canEditDelete = isOwner && isOpen;

  const canApproveReject =
    isApprover &&
    isOpen;

  return {
    isOwner,
    isApprover,
    canEditDelete,
    canApproveReject,
  };
}
