'use client';

import { useMemo, useState } from 'react';
import { Sheet } from '@/design-system';
import { groupByEvent, visitsIn } from '../data/selectors';
import { formatHour } from '../data/format';
import { VISIT_STATUS_LABEL } from '../data/shape';
import { useIncrementalList } from './useIncrementalList';
import { VisitEventGroup } from './VisitEventGroup';

/* The calls behind one bar of the hourly chart, or behind one legend chip.
 *
 * The chart answers "when in the day" and then leaves you there. A 2pm spike
 * is only interesting if you can ask who was out at 2pm, and until now the
 * only way to get from the shape to the names was to open ERPNext. The bar
 * that reports the count is now the control that opens the list — the same
 * move AttendanceSheet makes from a chip, and LegendChip was already built
 * for (see its `onClick`).
 *
 * DONE VISITS ONLY. This sheet is the chart's drill-down and the chart
 * plots what happened, so there is no "pending" row here — a call with no
 * visit time has no hour to have been plotted at. That is why DoctorPlanSheet
 * still exists and is not replaced by this one: it answers "what was the
 * plan", this answers "what actually happened, and when".
 *
 * The row is VisitListRow, shared with that sheet, so a forced call reads
 * identically whichever way the reader arrived at it. */

/* `selection` is null, { hour }, { tone } or both. The title has to name
   whichever of them is set, and a chip that filtered to nothing still needs a
   heading, so this never falls through to an empty string. */
function titleFor(selection) {
  if (!selection) return '';
  const { hour, tone } = selection;
  /* THE LEGEND'S OWN WORD PLUS THE NOUN — "Force visits", "Geo visits". It
     used to add an "s" to the label, which worked while the labels were
     "Force visit" and "Pending" and produced "Geo verifieds" for the third.
     Adding the noun instead survives the labels being shortened to one word
     each, and reads as a heading rather than as a plural of a status. */
  const series = tone ? `${VISIT_STATUS_LABEL[tone]} visits` : 'Visits';
  return hour != null ? `${series} at ${formatHour(hour)}` : series;
}

export function VisitsByHourSheet({
  selection,
  rows,
  team = [],
  periodLabel,
  scopeLabel,
  showHq = true,
  showDate = false,
  onClose,
}) {
  const [openId, setOpenId] = useState(null);

  const visits = useMemo(
    () => (selection ? visitsIn(rows, selection, team) : []),
    [selection, rows, team],
  );
  /* The SAME card the doctor plan sheet uses, so one visit reads identically
     whichever drill-down found it -- and a joint call stops appearing as the
     same doctor listed twice with no hint the two lines are one call. */
  const calls = useMemo(() => groupByEvent(visits), [visits]);

  const forced = visits.filter((v) => v.forceVisit).length;
  /* Paged by CALL, because a call is what a card is. Reset keyed on the
     selection so tapping a different bar starts at the top rather than
     scrolled deep into a list that no longer exists. */
  const { shown, hasMore, sentinelRef } = useIncrementalList(calls.length, {
    resetKey: `${selection?.hour ?? ''}|${selection?.tone ?? ''}`,
  });
  const visible = calls.slice(0, shown);

  const subtitle = [
    periodLabel,
    scopeLabel,
    /* BOTH counts when they differ. The bar counts PEOPLE -- one joint call
       is two visits on the chart -- and the list now shows one card per
       CALL, so a bar reading 14 above a list of 12 cards would look like a
       discrepancy. Saying "12 calls · 14 visits" keeps the sheet honest
       about the number that opened it. */
    calls.length !== visits.length ? `${calls.length} ${calls.length === 1 ? 'call' : 'calls'}` : null,
    `${visits.length} ${visits.length === 1 ? 'visit' : 'visits'}`,
    /* Only when there are any, and only when the selection has not already
       narrowed to them — "12 force visits · 12 force" is not a second fact. */
    forced > 0 && selection?.tone !== 'force' ? `${forced} force visits` : null,
    hasMore ? `showing ${shown} of ${calls.length}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Sheet
      open={selection != null}
      onClose={onClose}
      surface="app"
      title={titleFor(selection)}
      subtitle={subtitle}
    >
      {calls.length === 0 ? (
        <p className="py-4 text-12 text-ds-secondary">
          No visits in this {selection?.hour != null ? 'hour' : 'period'}.
        </p>
      ) : (
        visible.map((call) => (
          <VisitEventGroup
            key={call.id}
            group={call}
            /* The HQ earns a place only under "All HQs": filtered to one
               territory every card would repeat what the subtitle says. */
            showHq={showHq}
            showDate={showDate}
            expanded={openId === call.id}
            onToggle={() => setOpenId(openId === call.id ? null : call.id)}
          />
        ))
      )}

      {/* The tripwire for the next page. Rendered only while there IS one, so
          a finished list has nothing at the bottom still watching. */}
      {hasMore ? <div ref={sentinelRef} aria-hidden="true" className="h-1" /> : null}
    </Sheet>
  );
}

