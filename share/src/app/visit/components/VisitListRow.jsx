'use client';

import { formatDistance } from '../data/format';
import { VISIT_STATUS_LABEL, VISIT_STATUS_TONE } from '../data/shape';

/* The shared vocabulary for one visit, wherever a drill-down shows it.
 *
 * WHAT THIS IS NOW. It began as a flat row component; both sheets moved to
 * the doctor card (VisitEventGroup), so the component went and these two
 * functions stayed. They are the part that must NOT differ between the two
 * sheets — which pill a call gets, and what a forced one says underneath.
 * Three copies of that is how a screen ends up calling the same call
 * "Visited" in one place and "Geo verified" in another, against a legend
 * that says "Green = geo-verified".
 *
 * THE WORDS LIVE IN shape.js (VISIT_STATUS_LABEL); this is where a row is
 * mapped onto them:
 *   green  — geo verified, logged at the planned location
 *   red    — force visit, logged away from it
 *   grey   — pending, planned and not yet done */

/* ONE WORD PER STATE, from shape.js, with no per-caller override.
 *
 * The doctor plan sheet used to soften green to "Visited", on the reasoning
 * that a list holding not-yet-done calls wants a done-versus-not contrast.
 * What it actually produced was a card whose HEADER said "Visited" and whose
 * attendee rows, two lines below, said "Geo verified" — the same call, the
 * same green, two words. The contrast that sheet needs is against "Pending",
 * and grey-versus-green already draws it. */
export function visitStatus(visit) {
  const key = !visit.visitTime ? 'pending' : visit.forceVisit ? 'force' : 'verified';
  return { tone: VISIT_STATUS_TONE[key], label: VISIT_STATUS_LABEL[key] };
}

/* Distance first, then the reason. The distance is the OBJECTIVE half -- it
   is what tripped the flag -- and the reason is the rep's account of it, so
   the measurement leads. Returns '' on anything that is not a forced call,
   which is also the render condition: there is no line to draw.

   Exported because the card shows it per attendee inside an expanded call
   and again on the collapsed header. Two copies is how the same call ends up
   worded two ways. */
export function forceNote(visit) {
  if (!visit.forceVisit) return '';
  return [
    visit.distanceKm != null ? `${formatDistance(visit.distanceKm)} away` : null,
    visit.forceVisitReason || null,
  ]
    .filter(Boolean)
    .join(' · ');
}
