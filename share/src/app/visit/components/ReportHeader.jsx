'use client';

import { Avatar } from '@/design-system';
import {
  countWorkingDays,
  formatClock,
  formatDayHeading,
  formatMonthRange,
} from '../data/format';

/* The top bar: who you are, what you are looking at, and how current it is.
 *
 * The third line is the one that matters. "as of 4:00 PM" is derived from the
 * latest visit in the data, not from the wall clock — see asOfFrom() in
 * selectors.js. A rep reading this at 6pm needs to know the last check-in was
 * two hours ago, and a header that just echoes the current time hides exactly
 * that.
 *
 * When nothing has happened yet the clause is dropped rather than showing
 * "as of —": an empty morning is not a data error. */

export function ReportHeader({ root, period, window: win, asOf, title, control, children }) {
  const subtitle =
    period === 'month'
      ? `${formatMonthRange(win.from, win.to)} · ${countWorkingDays(win.from, win.to)} working days`
      : [formatDayHeading(win.to), asOf ? `as of ${formatClock(asOf)}` : null]
          .filter(Boolean)
          .join(' · ');

  return (
    <header className="flex items-center gap-3">
      <Avatar name={root?.name} size="md" />
      <div className="min-w-0 flex-1">
        {/* The title is a CONTROL when there is a choice to make — Team
            Report against My Report — and plain text when there is not.
            Putting the switch anywhere else would leave a heading that
            names one thing sitting above a picker that changes it. */}
        {control ?? (
          <h1 className="text-16 font-semibold text-heading @2xl/report:text-20">{title}</h1>
        )}
        <p className="text-10 text-ds-secondary @2xl/report:text-12">{subtitle}</p>
      </div>
      {children}
    </header>
  );
}
