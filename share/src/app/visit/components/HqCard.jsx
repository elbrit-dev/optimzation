'use client';

import { Card, LegendChip, StackedBar } from '@/design-system';
import { hqLabel } from '../data/format';
import { VISIT_STATUS_LABEL } from '../data/shape';

/* One HQ, as a stat card that is also the filter.
 *
 * Title and headline on one row, a slim three-segment bar, then a labelled
 * legend. Bar and legend carry the same three numbers twice — once as
 * proportion, once as count — and that is the point: the bar answers "how does
 * this territory look" at a glance, the legend answers "by how much" without a
 * tooltip. The wordless `54 · 4 · 41` row this replaced needed the reader to
 * already know the colour order.
 *
 * `variant="hairline"` — a 1px outline and NO shadow. The DS allows one or the
 * other, never both, and a strip of a dozen shadowed cards is visual noise
 * where a hairline stays quiet.
 *
 * The fraction is the only bold thing on the card: `122` at the 20px heading
 * step, `/232` at 12px muted beside it. Everything else is secondary or muted,
 * so the eye lands on the number first and the card second.
 *
 * WIDTH IS A TOKEN (`--ds-hq-card-w`). At 19rem this shows about one and a
 * quarter cards on a 390px phone, which is a real cost to a strip whose job is
 * comparison — the 8.5rem version it replaced showed nearly three. One
 * declaration to change if that trade turns out wrong in the field.
 *
 * The legend is `size="sm"`: three full labels plus their counts do not fit
 * across 280px at the 12px step. */

export function HqCard({ label, planned, happened, verified, force, selected, onSelect }) {
  const name = hqLabel(label);
  const unvisited = Math.max(planned - happened, 0);

  return (
    <Card
      variant="hairline"
      padding="none"
      onClick={onSelect}
      selected={selected}
      className="ds-hq-card"
      /* The whole card in words. A bar and three tinted dots give a screen
         reader nothing on their own. */
      aria-label={
        `${name}: ${happened} of ${planned} visits — `
        + `${verified} geo verified, ${force} force visit, ${unvisited} pending`
      }
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="truncate text-12 font-medium text-ds-secondary">{name}</span>
        <span className="shrink-0 tabular-nums">
          <span className="text-20 font-semibold text-heading">{happened}</span>
          <span className="text-12 text-ds-muted">/{planned}</span>
        </span>
      </div>

      <StackedBar
        size="sm"
        label={`${verified} geo verified, ${force} force visit, ${unvisited} pending`}
        segments={[
          { key: 'verified', value: verified, tone: 'success', label: VISIT_STATUS_LABEL.verified },
          { key: 'force', value: force, tone: 'danger', label: VISIT_STATUS_LABEL.force },
          { key: 'unvisited', value: unvisited, tone: 'neutral', label: VISIT_STATUS_LABEL.pending },
        ]}
      />

      {/* `justify-between` so the three read as columns rather than as a
          sentence. `aria-hidden` because the card's own label already says all
          of this in words — without it a screen reader hears every count
          twice. */}
      <div className="flex items-center justify-between gap-2" aria-hidden="true">
        <LegendChip size="sm" tone="success" label={VISIT_STATUS_LABEL.verified} value={verified} />
        <LegendChip size="sm" tone="danger" label={VISIT_STATUS_LABEL.force} value={force} />
        <LegendChip size="sm" tone="neutral" label={VISIT_STATUS_LABEL.pending} value={unvisited} />
      </div>
    </Card>
  );
}
