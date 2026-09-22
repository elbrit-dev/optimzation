'use client';

import { useMemo } from 'react';
import { Sheet } from '@/design-system';
import { visitsIn } from '../data/selectors';
import { formatClock, formatHour, hqLabel } from '../data/format';
import { SHEET_ROW_LIMIT, VisitListRow, limitNote } from './VisitListRow';

/* The calls behind one bar of the hourly chart, or behind one legend chip.
 *
 * The chart answers "when in the day" and then leaves you there. A 2pm spike
 * is only interesting if you can ask who was out at 2pm, and until now the
 * only way to get from the shape to the names was to open ERPNext. The bar
 * that reports the count is now the control that opens the list — the same
 * move AttendanceSheet makes from a chip, and LegendChip was already built
 * for (see its `onClick`).
 *
 * COMPLETED VISITS ONLY. This sheet is the chart's drill-down and the chart
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
  const series = tone === 'force' ? 'Force visits' : tone === 'verified' ? 'Geo-verified visits' : 'Visits';
  return hour != null ? `${series} at ${formatHour(hour)}` : series;
}

export function VisitsByHourSheet({ selection, rows, periodLabel, scopeLabel, showHq = true, onClose }) {
  const visits = useMemo(
    () => (selection ? visitsIn(rows, selection) : []),
    [selection, rows],
  );

  const forced = visits.filter((v) => v.forceVisit).length;
  const shown = visits.slice(0, SHEET_ROW_LIMIT);

  const subtitle = [
    periodLabel,
    scopeLabel,
    `${visits.length} ${visits.length === 1 ? 'visit' : 'visits'}`,
    /* Only when there are any, and only when the selection has not already
       narrowed to them — "12 force visits · 12 force" is not a second fact. */
    forced > 0 && selection?.tone !== 'force' ? `${forced} force` : null,
    limitNote(visits.length),
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
      {visits.length === 0 ? (
        <p className="py-4 text-12 text-ds-secondary">No completed visits in this hour.</p>
      ) : (
        shown.map((v) => (
          <VisitListRow
            key={v.id}
            visit={v}
            /* The rep is always shown here, unlike the doctor plan sheet:
               that one is opened from a named person, so the name is already
               in the title. A bar is not a person — it is everyone who was
               out at that hour — so the rep is the whole point of the row.

               The HQ is not, once the strip has been filtered to one: every
               row would repeat the territory the subtitle already names. It
               earns its place only under "All HQs", where it is the fact
               that tells two otherwise identical rows apart. Same rule as
               `showRep` on the doctor plan sheet. */
            facts={[formatClock(v.visitTime), v.employeeName, showHq ? hqLabel(v.hq) : null]}
          />
        ))
      )}
    </Sheet>
  );
}
