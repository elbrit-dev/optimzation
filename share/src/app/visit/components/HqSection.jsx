'use client';

import { Card, Eyebrow, LegendChip, SectionLabel, StackedBar } from '@/design-system';
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
          <VisitsByHourChart
            data={hourly}
            onSelectHour={onDrillVisits ? (hour) => onDrillVisits({ hour }) : undefined}
          />
        </div>

        <div className="mt-4">
          <StackedBar
            size="md"
            label={
              `${VISIT_STATUS_LABEL.verified}: ${geo.verified}, `
              + `${VISIT_STATUS_LABEL.force}: ${geo.force}`
            }
            segments={[
              { key: 'verified', value: geo.verified, tone: 'success', label: VISIT_STATUS_LABEL.verified },
              { key: 'force', value: geo.force, tone: 'danger', label: VISIT_STATUS_LABEL.force },
            ]}
          />
          {/* This legend is the CHART's legend as much as the bar's — both are
              built from the same rows and the same two tones, which is why the
              chart above does not carry a second one.

              Interactive, so it is also the way into a series across the whole
              window: the bars answer "who was out at 2pm", these answer "show
              me every force visit today", which is the question the red is
              there to provoke in the first place. `size` drops back to the
              default when pressable — LegendChip refuses to shrink a tap
              target, and a 15px control is not one.

              A zero segment stays a plain span: there are no rows behind it. */}
          <div className="flex gap-4">
            <LegendChip
              label={VISIT_STATUS_LABEL.verified}
              value={geo.verified}
              tone="success"
              onClick={onDrillVisits && geo.verified > 0 ? () => onDrillVisits({ tone: 'verified' }) : undefined}
            />
            <LegendChip
              label={VISIT_STATUS_LABEL.force}
              value={geo.force}
              tone="danger"
              onClick={onDrillVisits && geo.force > 0 ? () => onDrillVisits({ tone: 'force' }) : undefined}
            />
          </div>
          {/* The "nothing happened yet" sentence used to live here too. It is
              the chart's now (VisitsByHourChart renders it in place of its
              bars), because that is where the emptiness is actually visible —
              saying it twice in one card read as two different problems. */}
        </div>
      </Card>
    </section>
  );
}
