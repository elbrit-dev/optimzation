'use client';

import { Card, LegendChip, SectionLabel } from '@/design-system';
import { HqStrip } from './HqStrip';
import { VisitsByHourChart } from './VisitsByHourChart';
import { hqLabel } from '../data/format';
import { VISIT_STATUS_LABEL } from '../data/shape';

/* "Where the visits happened" — one strip of HQ cards that is both the
   comparison and the filter, then the detail for whichever is selected.
 *
 * ONE MECHANISM. There used to be three: a chip row to filter, a sentence to
 * summarise, and a list to compare. Each printed "58 of 99" in a different
 * shape, and the two that were not the chip row did nothing when tapped.
 *
 * The split now is comparison versus depth. The strip carries the three
 * numbers you scan across territories; the detail card carries everything that
 * only makes sense about one of them — reps active, force count, the hourly
 * shape, the geo split. That is why the summary line is back: it is no longer
 * a duplicate of the cards, it is the part the cards deliberately dropped. */

export const ALL_HQS = '__all__';

export function HqSection({
  hqRows,
  activeHq,
  onSelectHq,
  hourly,
  geo,
  totals,
  showReps = true,
  onDrillVisits,
}) {
  const isAll = activeHq === ALL_HQS;
  const selected = isAll ? null : hqRows.find((h) => h.hq === activeHq);
  const label = isAll ? 'All HQs' : hqLabel(selected?.hq ?? '');

  const detail = isAll ? totals : selected;

  return (
    /* `min-w-0`: the card strip inside scrolls, and a flex/grid item
       defaults to `min-width: auto` — i.e. as wide as its content wants. Without
       this the strip pushes this whole column past the frame instead of
       scrolling inside it, and takes the chart and the team tree with it. */
    <section className="flex min-w-0 flex-col gap-2">
      {/* The heading is handed to the strip rather than rendered here, so it
          and the search can share one row. The section still declares its own
          title — the strip only lays it out. */}
      <HqStrip
        heading={<SectionLabel>Where the visits happened</SectionLabel>}
        hqRows={hqRows}
        totals={totals}
        activeHq={activeHq}
        allKey={ALL_HQS}
        onSelect={onSelectHq}
      />

      <Card>
        {/* Title and its facts on the left, the two series on the right.
            The legend moved up here from under the chart: it is the chart's
            key, and a key read before the bars is a key you do not have to
            scroll back to. */}
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div className="flex min-w-0 flex-col gap-0.5">
            <h3 className="text-16 font-semibold text-heading">Visits by hour</h3>
            <p className="text-12 text-ds-muted">
              {label}
              {detail ? (
                <>
                  {/* "reps active" is a fact about a TEAM. In My Report the
                      team is one person, and the ratio would read 0/0 for any
                      manager — reps are counted as BEs everywhere on this
                      screen (see byHq), and a manager is not one. */}
                  {showReps ? (
                    <>
                      {' · '}
                      <span className="tabular-nums">
                        {detail.activeReps}/{detail.totalReps}
                      </span>{' '}
                      reps active
                    </>
                  ) : null}
                  {' · '}
                  <span className="tabular-nums">{detail.force}</span> force visits
                </>
              ) : null}
            </p>
          </div>
          {/* Interactive, so it is also the way into a series across the
              whole window: the bars answer "who was out at 2pm", these
              answer "show me every force visit today". A zero series stays a
              plain span: there are no rows behind it. */}
          <div className="flex gap-2">
            <LegendChip
              className="ds-visit-chip"
              label={VISIT_STATUS_LABEL.verified}
              value={geo.verified}
              tone="success"
              onClick={onDrillVisits && geo.verified > 0 ? () => onDrillVisits({ tone: 'verified' }) : undefined}
            />
            <LegendChip
              className="ds-visit-chip"
              label={VISIT_STATUS_LABEL.force}
              value={geo.force}
              tone="danger"
              onClick={onDrillVisits && geo.force > 0 ? () => onDrillVisits({ tone: 'force' }) : undefined}
            />
          </div>
        </div>

        <div className="mt-4">
          <VisitsByHourChart
            data={hourly}
            onSelectHour={onDrillVisits ? (hour) => onDrillVisits({ hour }) : undefined}
          />
        </div>
      </Card>
    </section>
  );
}
