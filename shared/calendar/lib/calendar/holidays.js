import { format } from "date-fns";

// The holiday on `date` from the calendar context's holidaysByDate
// ({ "yyyy-MM-dd": "Diwali" }), or undefined.
export function holidayOn(holidaysByDate, date) {
  if (!holidaysByDate || !date) return undefined;
  return holidaysByDate[format(date, "yyyy-MM-dd")];
}

// Rose is the one hue no event type uses (amber is the warning colour), so a
// holiday never reads as an event, a leave or a warning.
export const HOLIDAY_STYLES = {
  // Whole day cell / day column wash.
  wash: "bg-rose-50 dark:bg-rose-500/10",
  // Holiday name next to a day number.
  text: "text-rose-700 dark:text-rose-300",
  // Holiday name as a chip (agenda list).
  chip: "bg-rose-100 text-rose-700 ring-1 ring-inset ring-rose-200 dark:bg-rose-500/15 dark:text-rose-200 dark:ring-rose-500/30",
};
