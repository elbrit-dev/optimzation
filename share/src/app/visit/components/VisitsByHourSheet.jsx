'use client';

import { useMemo, useState } from 'react';
import { Sheet } from '@/design-system';
import { filterPlan, groupByEvent, visitsIn } from '../data/selectors';
import { PlanControls } from './PlanControls';
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

/* Everything off. One reference rather than a literal that has to be kept in
   step with the controls. Same shape the doctor plan sheet uses. */
const BLANK_FILTERS = { values: {}, sorts: {}, query: '' };

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

  /* THE SAME CONTROLS AS THE DOCTOR PLAN SHEET, over the same shape of list —
     grouped calls — so one implementation serves both and a reader who has
     filtered one already knows the other. This list is wider than that one:
     a 2pm bar at company scope is every rep's afternoon, which is why the Rep
     tab earns its place here and culls itself out on a single person's plan
     (see PLAN_FILTER_DEFS). Reset with the selection below: a search that
     survives tapping a different bar makes that bar look empty rather than
     filtered. */
  const [filters, setFilters] = useState(BLANK_FILTERS);

  /* CLEARED WHEN THE BAR CHANGES, for the reason DoctorPlanSheet documents:
     the sheet stays mounted between opens, so a search typed against the 2pm
     bar would still be applied when the 9am bar opens — and that hour would
     read as empty rather than as filtered. */
  const selectionKey = `${selection?.hour ?? ''}|${selection?.tone ?? ''}`;
  const [filteredFor, setFilteredFor] = useState(selectionKey);
  if (selectionKey !== filteredFor) {
    setFilteredFor(selectionKey);
    setFilters(BLANK_FILTERS);
  }

  const visits = useMemo(
    () => (selection ? visitsIn(rows, selection, team) : []),
    [selection, rows, team],
  );
  /* The SAME card the doctor plan sheet uses, so one visit reads identically
     whichever drill-down found it -- and a joint call stops appearing as the
     same doctor listed twice with no hint the two lines are one call. */
  const calls = useMemo(() => groupByEvent(visits), [visits]);

  /* THE CONTROLS RUN OVER THE WHOLE SELECTION, not the page on screen — every
     row is in memory and the paging below is a rendering budget, not a data
     one. Same call, same reason, as the doctor plan sheet. */
  const shownCalls = useMemo(() => filterPlan(calls, filters), [calls, filters]);

  const forced = visits.filter((v) => v.forceVisit).length;
  /* Paged by CALL, because a call is what a card is. Reset on the selection
     AND on the controls: tapping a different bar, or searching after
     scrolling to row sixty, should land at the top of the answer. */
  const { shown, hasMore, sentinelRef } = useIncrementalList(shownCalls.length, {
    resetKey: [selection?.hour ?? '', selection?.tone ?? '', JSON.stringify(filters)].join('|'),
  });
  const visible = shownCalls.slice(0, shown);

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
    /* Against what the FILTERS left, not the whole selection: with a search
       applied, "showing 30 of 237" counts a list that is not on screen. */
    hasMore ? `showing ${shown} of ${shownCalls.length}` : null,
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
      /* Pinned under the heading, same as the plan sheet: a search that
         scrolls away is one the reader scrolls back up to change. Only once
         there is something to sift. */
      toolbar={
        calls.length > 0 ? (
          <PlanControls
            calls={calls}
            value={filters}
            onChange={setFilters}
            resultCount={shownCalls.length}
            totalCount={calls.length}
          />
        ) : null
      }
    >
      {calls.length === 0 ? (
        <p className="py-4 text-12 text-ds-secondary">
          No visits in this {selection?.hour != null ? 'hour' : 'period'}.
        </p>
      ) : shownCalls.length === 0 ? (
        /* A DIFFERENT EMPTY. The hour is not empty — the controls emptied it,
           and "no visits in this hour" would be a lie about the data rather
           than a report on the filter. */
        <p className="py-4 text-12 text-ds-secondary">No calls match these filters.</p>
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

