import { startOfDay } from "date-fns";
import { TAG_IDS } from "@calendar/components/calendar/constants";

/**
 * True when `employeeId` has an APPROVED leave whose date range covers `date`.
 * Used to block event creation on days the employee is off — a pending/applied
 * (Open) leave does NOT count, only Approved.
 *
 * @param {Array}  events      calendar events (prefer the UNFILTERED `allEvents`)
 * @param {string} employeeId  the employee to check (e.g. LOGGED_IN_USER.id)
 * @param {Date|string|number} date  the day to test
 */
export function isEmployeeOnApprovedLeave(events, employeeId, date) {
  if (!date || !employeeId) return false;

  const target = startOfDay(new Date(date)).getTime();
  if (Number.isNaN(target)) return false;

  return (events ?? []).some((event) => {
    if (event?.tags !== TAG_IDS.LEAVE) return false;
    if (String(event.employee) !== String(employeeId)) return false;
    if (String(event.status ?? "").toLowerCase() !== "approved") return false;
    if (!event.startDate) return false;

    const start = startOfDay(new Date(event.startDate)).getTime();
    const end = startOfDay(new Date(event.endDate ?? event.startDate)).getTime();
    return target >= start && target <= end;
  });
}
