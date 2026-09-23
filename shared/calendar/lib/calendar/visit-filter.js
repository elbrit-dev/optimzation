import { format, isSameDay, isValid, parseISO } from "date-fns";
import { TAG_IDS } from "@calendar/components/calendar/constants";

export const VISIT_FILTER = {
  ALL: "all",
  VISITED: "visited",
  PENDING: "pending",
};

export const VISIT_FILTER_OPTIONS = [
  { value: VISIT_FILTER.ALL, label: "All visits" },
  { value: VISIT_FILTER.VISITED, label: "Visited" },
  { value: VISIT_FILTER.PENDING, label: "Not visited" },
];

// "Visited" means a visit time has been recorded (event.visitTime). Only Doctor
// Visit Plans have a visit to record, so every other event type passes through.
export function matchesVisitFilter(event, filter) {
  if (filter === VISIT_FILTER.ALL || event?.tags !== TAG_IDS.DOCTOR_VISIT_PLAN) {
    return true;
  }

  const visited = Boolean(event.visitTime);
  return filter === VISIT_FILTER.VISITED ? visited : !visited;
}

// "10:32", or "10 Sep, 10:32" when the visit was recorded on a different day
// than the one it was planned for.
export function formatVisitTime(event, use24HourFormat) {
  if (event?.tags !== TAG_IDS.DOCTOR_VISIT_PLAN || !event.visitTime) return null;

  const visitedAt = parseISO(event.visitTime);
  if (!isValid(visitedAt)) return null;

  const time = format(visitedAt, use24HourFormat ? "HH:mm" : "h:mm a");
  const plannedFor = event.startDate ? parseISO(event.startDate) : null;

  return plannedFor && isValid(plannedFor) && !isSameDay(visitedAt, plannedFor)
    ? `${format(visitedAt, "d MMM")}, ${time}`
    : time;
}
