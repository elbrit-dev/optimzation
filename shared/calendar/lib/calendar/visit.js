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
