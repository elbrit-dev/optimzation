'use client';

import { Avatar } from '@/design-system';
import { formatDayHeading, formatMonthRange } from '../data/format';

/* The top bar: who you are and what you are looking at.
 *
 * IT USED TO SAY "as of 2:52 PM" — the time of the latest visit in the data,
 * not the wall clock. The idea was that a reader at 6pm should know the last
 * check-in was hours ago. In practice it read as a page-refresh timestamp,
 * which is a different claim and a wrong one, and the freshness question it
 * was answering is better answered by the hourly chart: that shows WHEN the
 * day's calls landed, all of them, rather than asserting one clock time whose
 * meaning has to be explained.
 *
 * "· 20 working days" went with it. It was the divisor behind Call average,
 * printed where a reader takes the subtitle for a description of the range —
 * so it read as a claim about the month rather than as the arithmetic under
 * one KPI. That card carries its own caption (`visits ÷ reps reported · std
 * 12`), which is where the figure belongs and where it can be checked against
 * the number beside it.
 *
 * What is left is the range and nothing else: the subtitle says WHICH days,
 * and every count on the screen says what it counted.
 *
 * `asOf` is still computed and still passed in — the prop is kept so the
 * clause can come back without re-deriving it, and asOfFrom() in selectors.js
 * has the note on why it is the latest visit rather than Date.now(). */

export function ReportHeader({ root, period, window: win, title, caption, control, children }) {
  const subtitle = period === 'month' ? formatMonthRange(win.from, win.to) : formatDayHeading(win.to);

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
        {/* WHO, THEN WHEN. The scope line sits directly under the title
            because it finishes the sentence the title starts — "Team report:
            Rajkumar N, GM, 220 BE in scope" — while the date range qualifies
            the whole thing and reads last. It was below the range, which put
            the period between a heading and the roster it was heading.

            The range steps down to muted for the same reason: two lines at
            the same weight under one title read as a list of equals, and
            these are not. */}
        {caption ? (
          <p className="truncate text-10 text-ds-secondary @2xl/report:text-12">{caption}</p>
        ) : null}
        <p className="text-10 text-ds-muted @2xl/report:text-11">{subtitle}</p>
      </div>
      {children}
    </header>
  );
}
