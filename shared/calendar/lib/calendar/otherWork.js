import { startOfDay } from "date-fns";
import { STATUS } from "@calendar/components/calendar/constants";

/**
 * Other Work (Admin Day / Chemist Day / Conference / Meeting) has nothing to
 * mark done: it is complete once its day is over. One planned ahead stays Open
 * until that day ends; one entered for a past day is Completed straight away.
 */
export function otherWorkStatus(date, now = new Date()) {
  if (!date) return STATUS.OPEN;
  const day = new Date(date);
  if (Number.isNaN(day.getTime())) return STATUS.OPEN;
  return startOfDay(day) < startOfDay(now) ? STATUS.COMPLETED : STATUS.OPEN;
}
