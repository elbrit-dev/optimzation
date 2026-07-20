import { LOGGED_IN_USER } from "@calendar/components/auth/calendar-users";
import { STATUS } from "@calendar/components/calendar/constants";
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
  const eventEscalationApproverEmail = normalizeEmail(
    event.escalation_approver
  );
  const isOwner = eventEmployeeId === loggedUserId;

  // The leave can be approved/rejected by EITHER the assigned approver (one level
  // up — e.g. the ABM) OR the escalation approver (one extra level up — e.g. the
  // RBM). Match the logged-in user against both.
  const isApprover =
    (!!eventApproverEmail && loggedUserEmail === eventApproverEmail) ||
    (!!eventEscalationApproverEmail &&
      loggedUserEmail === eventEscalationApproverEmail);

  const isOpen = event.status === STATUS.OPEN;

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
