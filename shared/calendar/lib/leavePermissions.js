import { LOGGED_IN_USER } from "@calendar/components/auth/calendar-users";
import { STATUS } from "@calendar/components/calendar/constants";
/**
 * Normalize email safely
 */
function normalizeEmail(email) {
  return (email || "").trim().toLowerCase();
}

/**
 * Is this email the logged-in user? Matches the company email the page passes
 * in OR the ERP User (login_email). ERP stores approvers by User, and when the
 * two differ the approver lost Approve/Reject on their team's leaves.
 */
export function isLoggedInUserEmail(email) {
  const target = normalizeEmail(email);
  if (!target || !LOGGED_IN_USER) return false;
  return (
    target === normalizeEmail(LOGGED_IN_USER.email) ||
    target === normalizeEmail(LOGGED_IN_USER.login_email)
  );
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

  const eventEmployeeId = event.employee;
  const isOwner = eventEmployeeId === loggedUserId;

  // The leave can be approved/rejected by EITHER the assigned approver (one level
  // up — e.g. the ABM) OR the escalation approver (one extra level up — e.g. the
  // RBM). Match the logged-in user against both.
  const isApprover =
    isLoggedInUserEmail(event.leave_approver) ||
    isLoggedInUserEmail(event.escalation_approver);

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
