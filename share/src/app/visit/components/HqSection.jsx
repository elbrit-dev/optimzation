'use client';

import { Card, Eyebrow, LegendChip, SectionLabel, StackedBar } from '@/design-system';
import { HqStrip } from './HqStrip';
import { VisitsByHourChart } from './VisitsByHourChart';
import { hqLabel } from '../data/format';

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

export function HqSection({ hqRows, activeHq, onSelectHq, hourly, geo, totals, showReps = true }) {
  const isAll = activeHq === ALL_HQS;
  const selected = isAll ? null : hqRows.find((h) => h.hq === activeHq);
  const label = isAll ? 'All HQs' : hqLabel(selected?.hq ?? '');

  const detail = isAll ? totals : selected;
  const totalDone = geo.verified + geo.force;

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
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <Eyebrow as="h3">Visits by hour · {label}</Eyebrow>
          {detail ? (
            <p className="text-10 text-ds-secondary">
              {/* "reps active" is a fact about a TEAM. In My Report the team
                  is one person, and the ratio would read 0/0 for any
                  manager — reps are counted as BEs everywhere on this
                  screen (see byHq), and a manager is not one. */}
              {showReps ? (
                <>
                  <span className="tabular-nums">
                    {detail.activeReps}/{detail.totalReps}
                  </span>{' '}
                  reps active ·{' '}
                </>
              ) : null}
              <span className="tabular-nums">{detail.force}</span> force visits
            </p>
          ) : null}
        </div>

        <div className="mt-3">
          <VisitsByHourChart data={hourly} />
        </div>

        <div className="mt-4">
          <StackedBar
            size="md"
            label={`Geo-verified: ${geo.verified}, Force visit: ${geo.force}`}
            segments={[
              { key: 'verified', value: geo.verified, tone: 'success', label: 'Geo-verified' },
              { key: 'force', value: geo.force, tone: 'danger', label: 'Force visit' },
            ]}
          />
          <div className="flex gap-4">
            <LegendChip label="Geo-verified" value={geo.verified} tone="success" />
            <LegendChip label="Force visit" value={geo.force} tone="danger" />
          </div>
          {totalDone === 0 ? (
            <p className="text-10 text-ds-muted">No completed visits in this window yet.</p>
          ) : null}
        </div>
      </Card>
    </section>
  );
}
