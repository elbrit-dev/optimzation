'use client';

import { Tabs } from '@/design-system';
import RangePicker from '@/components/RangePicker';

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
 * THE PICKER IS THE SHARED `RangePicker` in month mode — the same control the
 * report-table and datatable headers use — rather than a select of the last
 * twenty-four months. Three reasons it is worth pulling a PrimeReact overlay
 * onto this screen for: a month GRID is how you get to March 2025 in two
 * clicks instead of fourteen scroll-lines; the reader already knows this
 * control from the other two screens; and there is then one month picker in
 * netstar to fix rather than two to keep in step.
 *
 * `single`, so one click picks one month and the panel closes — the picker's
 * own addition, not a wrapper here. The report reads ONE month at a time by
 * design: the source fetches a window in a single page (MAX_ROWS in
 * liveSource.js) and a month of a few hundred visits a day is about what that
 * holds, so a control that invited a six-month span would be inviting a
 * truncated answer. It still emits a [start, end] pair, and periodWindow
 * still takes two months, so the day the source can serve a span this is one
 * prop away rather than a rewrite.
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

export function PeriodTabs({ value, range, maxDate, onChange, onRangeChange }) {
  return (
    <div className="flex flex-col gap-3">
      <Tabs items={ITEMS} value={value} onChange={onChange} ariaLabel="Period" />
      {value === 'month' ? (
        <RangePicker
          mode="month"
          single
          maxDate={maxDate}
          value={range}
          onChange={onRangeChange}
          placeholder={['Month', 'Month']}
        />
      ) : null}
    </div>
  );
}
