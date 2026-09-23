'use client';

import { formatHour } from '../data/format';
import { VisitBars, keyFromClick } from './VisitBars';

/* Stacked bars, one per hour that actually had a visit.
 *
 * ONLY THE HOURS THAT HAPPENED. This has been three things: nine columns
 * clamped to 9-5, which drew a 7:15am call at 9am and a 9pm one at 5pm and so
 * could not show the early start or the long evening; then all twenty-four,
 * which spent more than half the width on an empty night. Now it draws the
 * hours with something in them and nothing else, so a nine-call day is nine
 * columns wherever in the clock they fall.
 *
 * THE COST, STATED: the x-axis is no longer linear in time. A gap from 11AM
 * to 2PM looks exactly like 11AM to 12PM, so the chart answers "which hours,
 * and how busy" and no longer answers "how long was the lull".
 *
 * THE CHART ITSELF IS VisitBars, shared with a rep's daily trend — same
 * stack, same colours, same click and hit-area behaviour over a different x.
 * What lives here is which categories exist and what they are called.
 *
 * The legend lives on the card, not in here — see HqSection. Two legends for
 * one pair of colours is the duplication that section's comment is about.
 *
 * A DAY WITH NOTHING IN IT SAYS SO IN WORDS. There is no axis to fall back on
 * once the empty hours are gone — a chart that renders as a bare line reads as
 * one that failed, not as a quiet morning. The sentence is the empty state.
 */

/* Recharts wants a flat row per column, with the hour already worded — a
   `tickFormatter` would re-run it on every resize. Pure and exported so what
   the chart draws can be tested without a browser to draw it in: jsdom gives
   Recharts no width, so nothing is rendered there. */
export function hourSeries(data) {
  return data
    .filter((d) => d.verified + d.force > 0)
    .map((d) => ({
      key: d.hour,
      hour: d.hour,
      label: formatHour(d.hour),
      verified: d.verified,
      force: d.force,
      total: d.verified + d.force,
    }));
}

/* The hour behind a click, for callers and tests that speak in hours rather
   than in the chart's generic keys. */
export function hourFromClick(series, state) {
  return keyFromClick(series, state);
}

export function VisitsByHourChart({ data, label, onSelectHour }) {
  const shown = hourSeries(data);

  if (shown.length === 0) {
    return (
      <figure className="m-0">
        {label ? <figcaption className="ds-eyebrow mb-2">{label}</figcaption> : null}
        {/* Present tense: on a Today view before 10am this is the normal state
            of the screen, not a failure. */}
        <p className="py-4 text-11 text-ds-muted">No visits in this period.</p>
      </figure>
    );
  }

  return (
    <figure className="m-0">
      {label ? <figcaption className="ds-eyebrow mb-2">{label}</figcaption> : null}
      <VisitBars
        data={shown}
        onSelect={onSelectHour}
        /* EVERY HOUR KEEPS ITS LABEL. The axis is the only thing carrying
           WHICH hours these are now that the empty ones are dropped, so
           thinning it would leave 9AM and 2PM indistinguishable. A working
           day is rarely more than a dozen columns, so they fit. */
        tickInterval={0}
        /* Grows with the container: a chart that stays phone-sized on a 27"
           screen is the bug this rule exists for. */
        className="h-32 @2xl/report:h-40 @5xl/report:h-48"
      />
    </figure>
  );
}
