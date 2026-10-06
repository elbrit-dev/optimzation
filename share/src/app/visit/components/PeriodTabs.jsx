'use client';

import { Tabs } from '@/design-system';
import FyMonthPicker from '@/components/FyMonthPicker';

/* Date / Month, and which day or month.
 *
 * `Tabs`, not `SegmentedControl`. Switching the period changes every number on
 * the page — the plan, the completions, the chart, the whole tree — so this is
 * page structure, not a view setting. SegmentedControl is for the Cards/Table
 * kind of switch, where the data is the same and only the render changes.
 *
 * THE DAY IS PICKED TOO. The tab was "Today" and could only show today; it is
 * "Date" now, with the same picker in date mode -- the same trigger and ‹ ›
 * steps, a day at a time. Today is still where it opens.
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
 * LOCKED TO THE CURRENT FINANCIAL YEAR (Apr–Mar), the day as the months.
 * `min` is 1 April of the FY the dataset's today falls in, so earlier days,
 * months, quarters and years are greyed out and "Last FY" is not offered.
 *
 * `maxDate` is the DATASET's today, not the browser's. Later days and months
 * are greyed out: there is nothing to report on a period that has not
 * happened, and a screen of zeroes is not an answer to "how did October go".
 *
 * Each tab shows its own picker and only that one: a control sitting inert
 * beside the other tab would be a control that does nothing. */

/* 'today' stays the DAY view's id: it is read across the screen as "not the
   month", and the day it shows is whichever was picked. */
const ITEMS = [
  { id: 'today', label: 'Date' },
  { id: 'month', label: 'Month' },
];

// 1 April of the Indian FY that `date` falls in.
function fyStart(date) {
  const d = date ?? new Date();
  return new Date(d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1, 3, 1);
}

export function PeriodTabs({ value, range, dayRange, maxDate, onChange, onRangeChange, onDayChange }) {
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
      ) : (
        <FyMonthPicker
          mode="date"
          min={fyStart(maxDate)}
          max={maxDate ?? undefined}
          value={dayRange}
          onChange={onDayChange}
          className="w-full h-9 sm:h-8 sm:w-auto sm:flex-none"
        />
      )}
    </div>
  );
}
