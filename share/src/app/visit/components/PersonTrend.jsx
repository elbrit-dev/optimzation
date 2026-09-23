'use client';

import { formatPlanDay } from '../data/format';
import { VisitBars } from './VisitBars';

/* One rep's month, day by day — the drill-down behind a card on the Reported
 * sheet.
 *
 * THE QUESTION IT ANSWERS. Since the attendance states went day based,
 * "Reported" is true of a rep who worked twelve days and of one who worked a
 * single Tuesday. The chip cannot tell them apart and neither can the card's
 * own ratio. This is where they stop looking alike.
 *
 * THE SAME BARS AS THE HOURLY CHART, over days instead of hours — see
 * VisitBars. It was an area chart of done-against-planned, which was a
 * different picture of the same data in a different visual language two cards
 * apart, and it could not show the ONE distinction this screen is built
 * around: how much of that work was geo verified and how much was forced. A
 * rep with twenty solid days and a rep with twenty forced ones read
 * identically on it.
 *
 * ONLY THE DAYS THAT HAPPENED, the same rule the hourly chart applies to its
 * hours — see trendSeries for why the silent ones go and where they went. */

/* Recharts wants a flat row per column, with the date already worded — a
   `tickFormatter` would re-run it on every resize. Pure and exported so the
   series can be tested without rendering a chart into a jsdom that has no
   layout to render it into. */
export function trendSeries(days) {
  return days
    .map((d) => ({
      key: d.date,
      label: formatPlanDay(d.date),
      verified: d.verified ?? 0,
      force: d.force ?? 0,
      total: (d.verified ?? 0) + (d.force ?? 0),
    }))
    /* ONLY THE DAYS THAT HAPPENED, the same rule the hourly chart applies to
       its hours. A silent day drew a labelled column of nothing — a "0" and a
       date taking the same width as a real day — and on a month where a rep
       works alternate days that was half the chart spent saying nothing,
       pushing the days that did happen off the end of the scroll.
     *
       The silent days are not lost: they are the Not reported sheet, which
       exists to list them and says WHY each one was silent. This chart
       answers the other half — what the days they did work looked like. */
    .filter((d) => d.total > 0);
}

export function PersonTrend({ days }) {
  if (!days?.length) return null;

  return (
    <VisitBars
      data={trendSeries(days)}
      /* EVERY DATE KEEPS ITS LABEL, because the track scrolls rather than
         compressing — see minColumnWidth. Thinning the axis was the answer
         while all twenty-six days had to fit at once, and it cost the reader
         the ability to tell which column was which: the whole question here
         is WHICH days went badly, and an axis labelled every fifth day
         cannot answer it. */
      tickInterval={0}
      /* 44px, not 36. The floor is set by the widest LABEL, and "10 Sep" is
         half as wide again as "4 Sep" — at 36 the two-digit half of the month
         ran its dates together while the first nine days looked fine, which
         is the kind of bug that only shows up after the 10th. */
      minColumnWidth={44}
      /* Taller than the 80px it needs, so the hover card has room inside the
         scroll box that clips it — see VisitBars. */
      className="h-24"
    />
  );
}
