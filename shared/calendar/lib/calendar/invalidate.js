import { clearEventCache } from "@calendar/lib/calendar/event-cache";
import { clearCached } from "@calendar/lib/data-cache";
import { clearLeaveCache } from "@calendar/components/calendar/module/leave/cache/leave-cache";
import { notifyCalendarDataChanged } from "@calendar/lib/calendar/realtime";

// The range cache is only the outer layer. It is *rebuilt* from these
// `data-cache` entries, which are memoised for the lifetime of the page with no
// TTL — so dropping the range cache alone makes the calendar refetch events
// while re-merging the exact same stale leaves and todos. Every caller that
// invalidates must drop all of them together.
const CALENDAR_DATA_CACHE_KEYS = ["LEAVE_APPLICATIONS", "TODO_LIST"];

/**
 * Single entry point for "the calendar's data is no longer trustworthy".
 * Call it after any write to Event / Leave Application / ToDo, and before any
 * hard refresh.
 *
 * @param {{ broadcast?: boolean, reason?: string|null }} [options]
 *   broadcast — also tell this tab and every other open tab to refetch.
 *   Pass `false` when the caller is about to refetch itself, to avoid a
 *   redundant round trip.
 */
export function invalidateCalendarData(options = {}) {
  const { broadcast = true, reason = null } = options;

  clearEventCache();
  clearCached(CALENDAR_DATA_CACHE_KEYS);
  clearLeaveCache();

  if (broadcast) {
    notifyCalendarDataChanged({ reason });
  }
}
