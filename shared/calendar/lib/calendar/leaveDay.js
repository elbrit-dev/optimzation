import { endOfDay, format, startOfDay } from "date-fns";
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

/**
 * Why `employeeId` cannot plan a DR Tour Plan on `date`, or null when they can.
 * Blocked by their own leave (pending as well as approved — approved already
 * blocks Add Event altogether) or their own Other Work that day: a visit plan
 * on such a day could not happen. Shared by the event form, which greys the
 * chip and refuses the save, and the mobile "+" bar, which leaves it out.
 */
export function doctorVisitBlockReason(events, employeeId, date) {
  if (!date || !employeeId) return null;
  const day = startOfDay(new Date(date));
  if (Number.isNaN(day.getTime())) return null;

  const covers = (ev) =>
    ev?.startDate &&
    day >= startOfDay(new Date(ev.startDate)) &&
    day <= endOfDay(new Date(ev.endDate ?? ev.startDate));
  const isLive = (ev) =>
    !["rejected", "cancelled", "canceled"].includes(
      String(ev?.status ?? "").toLowerCase()
    );
  const me = String(employeeId);
  const dayLabel = format(day, "d MMM yyyy");

  const leave = (events ?? []).find(
    (ev) =>
      ev?.tags === TAG_IDS.LEAVE &&
      String(ev.employee) === me &&
      isLive(ev) &&
      covers(ev)
  );
  if (leave) {
    return `DR Tour Plan isn't available on ${dayLabel} — you have ${leave.leaveType || "leave"} that day.`;
  }

  const otherWork = (events ?? []).find(
    (ev) =>
      ev?.tags === TAG_IDS.OTHER &&
      (String(ev.ownerEmployeeId ?? "") === me ||
        ev.participants?.some((p) => String(p.id) === me)) &&
      isLive(ev) &&
      covers(ev)
  );
  if (otherWork) {
    return `DR Tour Plan isn't available on ${dayLabel} — you have Other Work that day.`;
  }
  return null;
}
