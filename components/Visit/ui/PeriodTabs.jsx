'use client';

import { Tabs } from '@/design-system';

/* Today / Month till date.
 *
 * `Tabs`, not `SegmentedControl`. Switching the period changes every number on
 * the page — the plan, the completions, the chart, the whole tree — so this is
 * page structure, not a view setting. SegmentedControl is for the Cards/Table
 * kind of switch, where the data is the same and only the render changes.
 *
 * This owns the date window for the whole screen; everything downstream is a
 * pure function of the period, so there is no second place to keep in sync. */

const ITEMS = [
  { id: 'today', label: 'Today' },
  { id: 'mtd', label: 'Month till date' },
];

export function PeriodTabs({ value, onChange }) {
  return <Tabs items={ITEMS} value={value} onChange={onChange} ariaLabel="Period" />;
}
