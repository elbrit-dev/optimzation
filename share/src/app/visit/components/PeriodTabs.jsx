'use client';

import { Tabs } from '@/design-system';
import FyMonthPicker from '@/components/FyMonthPicker';

/* Today / Month, and which month.
 *
 * `Tabs`, not `SegmentedControl`. Switching the period changes every number on
 * the page — the plan, the completions, the chart, the whole tree — so this is
 * page structure, not a view setting. SegmentedControl is for the Cards/Table
 * kind of switch, where the data is the same and only the render changes.
 *
 * THE CURRENT MONTH IS NOT A SEPARATE MODE. The tab used to say "Month till
 * date", which named a behaviour rather than a period and left nowhere to put
 * a second month. It says "Month" now, and month-till-date is what the month
 * still running IS — periodWindow clamps the window to today, so nothing
 * about it is special-cased.
 *
 * THE PICKER IS THE SHARED `FyMonthPicker` -- the one SmartDataProvider's
 * date control uses, so the reader meets the same Month / Quarter / Financial
 * year tabs, presets and ‹ › steps on every report. It picks a contiguous run
 * of months; the source splits a long window by date (liveSource.js), and
 * periodWindow / periodSuffix already take a first and last month.
 *
 * LOCKED TO THE CURRENT FINANCIAL YEAR (Apr–Mar). `min` is 1 April of the FY
 * the dataset's today falls in, so earlier months, quarters and years are
 * greyed out and "Last FY" is not offered.
 *
 * `maxDate` is the DATASET's today, not the browser's. Months after it are
 * greyed out: there is nothing to report on a month that has not happened,
 * and a screen of zeroes is not an answer to "how did October go".
 *
 * The picker only appears on the Month tab. A month control sitting inert
 * beside Today would be a control that does nothing, which is worse than one
 * that arrives when it starts mattering. */

const ITEMS = [
  { id: 'today', label: 'Today' },
  { id: 'month', label: 'Month' },
];

// 1 April of the Indian FY that `date` falls in.
function fyStart(date) {
  const d = date ?? new Date();
  return new Date(d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1, 3, 1);
}

export function PeriodTabs({ value, range, maxDate, onChange, onRangeChange }) {
  return (
    <div className="flex flex-col gap-3">
      <Tabs items={ITEMS} value={value} onChange={onChange} ariaLabel="Period" />
      {value === 'month' ? (
        <FyMonthPicker
          min={fyStart(maxDate)}
          max={maxDate ?? undefined}
          value={range}
          onChange={onRangeChange}
          className="w-full h-9 sm:h-8 sm:w-auto sm:flex-none"
        />
      ) : null}
    </div>
  );
}
