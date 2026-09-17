'use client';

import { Card, Metric } from '@/design-system';
import { formatCurrency, formatDecimal, formatPercent } from '../lib/format';

/* The 2x2 headline grid.
 *
 * THE THIRD CARD IS MONEY, as the reference always intended ("POB COLLECTED
 * ₹1.8 L · ₹899/call") -- it just took finding the real source first.
 * `Event.custom_pob_given` is only a checkbox (PLAN.md §2.5); the actual
 * rupee figure comes from `Quotation` (`quotation_to = 'Lead'`, since a
 * doctor is a CRM Lead here), summed and attributed to the visiting rep via
 * `owner`. See shape.js's PobEntry for the full join and its ASSUMED,
 * NOT-YET-VERIFIED status -- neither available API token could see one of
 * these quotations to confirm it directly. `pobAmount`/`pobPerCall` arrive
 * pre-computed (selectors.js's pobTotal) rather than a `{given, of}` pair,
 * because there is nothing left for this component to compute once the
 * number is real money instead of a ratio.
 *
 * `callStandard` is the company's per-day call target. It is a business
 * constant, not data, which is why it arrives as a prop rather than being
 * derived — and why the tone flips on it rather than on an arbitrary
 * percentile. */

export function KpiGrid({
  planned,
  happened,
  pobAmount,
  pobPerCall,
  callAverage,
  callStandard = 12,
  repCount,
  period,
}) {
  const attainment = planned > 0 ? happened / planned : null;

  return (
    /* Two-up when narrow, four-up from @2xl. Never one-up: the four numbers are
       a comparison, and a single column turns them into a list you scroll. */
    <div className="grid grid-cols-2 gap-3 @2xl/report:grid-cols-4 @2xl/report:gap-4">
      <Card>
        <Metric
          label={period === 'mtd' ? 'Visit plans MTD' : 'Visit plans today'}
          value={planned}
          caption={repCount ? `planned across ${repCount} reps` : 'planned calls'}
          tone="brand"
          dot
        />
      </Card>

      <Card>
        <Metric
          label="Visits happened"
          value={happened}
          caption={attainment == null ? 'no plan' : `${formatPercent(attainment)} of plan`}
          tone={attainment != null && attainment >= 0.8 ? 'success' : 'warning'}
          dot
          progress={{ value: happened, max: Math.max(planned, 1) }}
        />
      </Card>

      <Card>
        <Metric
          label={period === 'mtd' ? 'POB collected MTD' : 'POB collected today'}
          value={formatCurrency(pobAmount)}
          /* No `progress` bar here, unlike the other three cards -- a rupee
             total has no natural max to bound it against, and forcing one
             (the plan? the standard?) would imply a target this figure
             doesn't have yet. */
          caption={pobPerCall != null ? `${formatCurrency(pobPerCall)} / call` : 'no completed visits'}
          tone="brand"
          dot
        />
      </Card>

      <Card>
        <Metric
          label="Call average"
          value={formatDecimal(callAverage)}
          caption={`calls ÷ reps working · std ${callStandard}`}
          tone={callAverage != null && callAverage >= callStandard ? 'success' : 'danger'}
          dot
          progress={{ value: callAverage ?? 0, max: callStandard }}
        />
      </Card>
    </div>
  );
}
