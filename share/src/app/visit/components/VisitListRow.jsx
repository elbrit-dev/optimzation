'use client';

import { ListRow, StatusPill } from '@/design-system';
import { formatDistance } from '../data/format';

/* One visit, as a row in a sheet. Shared by every drill-down that lands on
 * individual calls — the doctor plan and the hourly chart today.
 *
 * WHY THIS EXISTS. Both sheets had grown their own copy of the same three
 * decisions: which pill a call gets, what a forced call says underneath it,
 * and how the facts under the doctor's name are joined. Three copies of a
 * vocabulary is how a screen ends up calling the same call "Visited" in one
 * place and "Geo verified" in another — which is exactly what had happened,
 * against a legend that says "Green = geo-verified".
 *
 * The caller supplies `facts`, because that part genuinely differs: the
 * doctor plan shows the money, the hourly sheet shows the HQ, and neither
 * wants the other's. Everything that should NOT differ lives here.
 *
 * THE STATUS VOCABULARY IS THE SCREEN'S, not a generic done/not-done:
 *   green  — geo verified, logged at the planned location
 *   red    — force visit, logged away from it
 *   grey   — pending, planned and not yet done
 * A force visit IS done. That is the distinction the red is teaching, and a
 * "completed/not completed" pill would erase it. */

/* Sixty rows. A region's month is several thousand visits and a scroll
   container with a thousand list rows janks on the hardware this runs on.
   Shared so the two sheets cannot drift to different caps, and always STATED
   (see limitNote) rather than hidden behind a fade: a list that silently
   stops is a list you cannot trust. */
export const SHEET_ROW_LIMIT = 60;

/* The subtitle fragment that admits to the cap, or null when it did not
   bite. Returned rather than rendered so it joins the sheet's own ' · '
   subtitle instead of being a second line saying the same thing. */
export function limitNote(total) {
  return total > SHEET_ROW_LIMIT ? `showing first ${SHEET_ROW_LIMIT}` : null;
}

/* Green's wording, which is the one thing a caller may legitimately want to
   soften: on a plan the useful contrast is done-versus-not, and "Geo
   verified" there invites "as opposed to what?" from a reader who has not
   met the vocabulary yet. Both still mean the same state and the same
   colour. */
function statusLabel(visit, verifiedLabel) {
  if (!visit.visitTime) return 'Pending';
  return visit.forceVisit ? 'Force visit' : verifiedLabel;
}

function statusTone(visit) {
  if (!visit.visitTime) return 'neutral';
  return visit.forceVisit ? 'danger' : 'success';
}

export function VisitListRow({ visit, facts = [], verifiedLabel = 'Geo verified' }) {
  /* Distance first, then the reason. The distance is the OBJECTIVE half --
     it is what tripped the flag -- and the reason is the rep's account of
     it, so the measurement leads.

     Both are carried only on a forced call (see doctorPlan / visitsIn), so
     this needs no forceVisit check of its own; an ordinary row has nothing
     to put here and renders no line at all. */
  const forceNote = [
    visit.distanceKm != null ? `${formatDistance(visit.distanceKm)} away` : null,
    visit.forceVisitReason || null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <ListRow
      dense
      title={visit.doctorName}
      /* `|| null` and not just the join: a pending call on a rep's own plan
         has no time, no rep name and no money, and an empty string still
         renders a 20px line of nothing under the name. */
      subtitle={facts.filter(Boolean).join(' · ') || null}
      trailing={
        <StatusPill status={statusTone(visit)} showDot={false}>
          {statusLabel(visit, verifiedLabel)}
        </StatusPill>
      }
    >
      {/* Its own line rather than another ' · ' fact: the reason is free text
          a rep typed on a phone, so it is a sentence, not a fact of the same
          size as a time or an amount, and it wraps. */}
      {forceNote ? <span className="text-10 text-danger">{forceNote}</span> : null}
    </ListRow>
  );
}
