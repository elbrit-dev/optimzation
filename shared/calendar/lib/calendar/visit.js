import { isBackdateOpen } from "./backdate";

/**
 * One definition of "this person has completed their visit".
 *
 * It decides three things that must never disagree:
 *   - whether the roster shows the participant as visited,
 *   - whether they are asked to visit again,
 *   - whether a save is allowed to overwrite their recorded visit.
 *
 * When the write path used a looser rule than the UI, a visit saved without a
 * location counted as done on write (so it could not be corrected) while the UI
 * still asked for it — leaving the participant permanently unable to finish.
 */
export function hasValidVisitLocation(latitude, longitude) {
  const lat = Number(latitude);
  const lng = Number(longitude);

  return lat !== 0 && lng !== 0 && !Number.isNaN(lat) && !Number.isNaN(lng);
}

export function isParticipantVisitRecorded(participant) {
  if (!participant) return false;

  return (
    String(participant.attending ?? "").toLowerCase() === "yes" &&
    hasValidVisitLocation(
      participant.custom_latitude,
      participant.custom_longitude
    )
  );
}

/**
 * A planned visit can be marked only ON its day: not ahead of time (a plan for
 * the 16th marked on the 14th) and not after it (a missed plan stays missed).
 * Planning ahead is still allowed; only the visit itself waits for the day.
 * The exception is a past day ERP has opened for backdated entry.
 */
export function isVisitDay(plannedDate, now = new Date()) {
  return isPlannedToday(plannedDate, now) || isBackdateOpen(plannedDate, now);
}

/**
 * A visit marked after its day inside a backdate window: no 500 m check, so
 * it is never a force visit.
 */
export function isBackdatedVisit(plannedDate, now = new Date()) {
  return !isPlannedToday(plannedDate, now) && isBackdateOpen(plannedDate, now);
}

function isPlannedToday(plannedDate, now) {
  if (!plannedDate) return false;
  const day = new Date(plannedDate);
  if (Number.isNaN(day.getTime())) return false;
  return (
    day.getFullYear() === now.getFullYear() &&
    day.getMonth() === now.getMonth() &&
    day.getDate() === now.getDate()
  );
}
