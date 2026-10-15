'use client';

import { cx } from '@/design-system';
import { formatDecimal } from '../data/format';

/* One person's calls against the month, as one line under their bar:
 *
 *   8.4/day · 120/288 calls · 168 left · 12.9/day needed · 4 days off
 *
 * What a reporting officer reads down the tree to find who to call: the
 * average is red below the standard, and "needed" goes red once it is more
 * than the standard (they cannot catch up on a normal day's work). A month
 * that is over has no days ahead, so what is left reads as "short".
 *
 * `calls` is callTarget's result; nothing renders without one (day view,
 * vacant seat). */
export function CallTarget({ calls, className }) {
  if (!calls) return null;
  const { standard, done, target, left, daysOff, daysAhead, average, perDayNeeded } = calls;
  const below = average != null && average < standard;
  const needsMore = perDayNeeded != null && perDayNeeded > standard;

  return (
    <span className={cx('flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 text-10 tabular-nums text-ds-secondary', className)}>
      <span
        className={cx('font-semibold', average == null ? 'text-ds-muted' : below ? 'text-danger-text' : 'text-approved-text')}
        title={`Calls a day over the days already worked; standard ${standard}`}
      >
        {formatDecimal(average)}/day
      </span>
      <span aria-hidden="true">·</span>
      <span title={`Target: ${standard} calls × available working days this month`}>
        <span className="font-semibold text-heading">{done}</span>/{target} calls
      </span>
      <span aria-hidden="true">·</span>
      {left === 0 ? (
        <span className="font-semibold text-approved-text">Target met</span>
      ) : daysAhead === 0 ? (
        <span className="font-semibold text-danger-text">{left} short</span>
      ) : (
        <>
          <span>{left} left</span>
          <span aria-hidden="true">·</span>
          <span className={cx(needsMore && 'font-semibold text-danger-text')}>
            {formatDecimal(perDayNeeded)}/day needed
          </span>
        </>
      )}
      {daysOff > 0 ? (
        <>
          <span aria-hidden="true">·</span>
          <span className="text-ds-muted" title="Leave and Other Work days, taken off the target">
            {daysOff} {daysOff === 1 ? 'day' : 'days'} off
          </span>
        </>
      ) : null}
    </span>
  );
}
