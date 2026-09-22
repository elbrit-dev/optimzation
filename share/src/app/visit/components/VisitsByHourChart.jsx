'use client';

import { cx, toneFill } from '@/design-system';
import { formatHour } from '../data/format';

/* Nine stacked bars, hand-rolled.
 *
 * Recharts is already a dependency and is NOT used here on purpose. This chart
 * has nine static categories, no tooltip, no axis ticks and no responsive
 * re-layout of its own — every feature Recharts charges its ~90KB for. What it
 * does need is a value label sitting above each bar and a fixed 9am-5pm axis
 * that does not move between HQs, both of which are fights with a charting
 * library and three lines of flexbox without one.
 *
 * The bars ARE now interactive — each one opens the calls behind it — and that
 * still does not buy a charting library: a click handler on a flex child is
 * one line, and Recharts' version of this would be a tooltip, which is the
 * wrong answer on a phone where there is no hover to show it with. Reach for
 * Recharts if this ever needs brushing, a time axis or a third series.
 *
 * The legend lives on the card, not in here — see HqSection. Two legends for
 * one pair of colours is the duplication that section's comment is about.
 *
 * HEIGHT IS A CLASS, NOT A NUMBER. The plot box is sized by a responsive
 * utility on the wrapper and every bar is a PERCENTAGE of it, so the chart
 * grows on a tablet and a desktop without this file knowing the breakpoints.
 * The previous version hardcoded 126px and stayed phone-sized on a 27" screen.
 *
 * The empty state renders the axis without bars rather than a "no data"
 * message: on a phone the axis is the thing that tells you this is a clock,
 * and swapping it for a sentence makes an early-morning screen look broken.
 */

/* A single visit in an otherwise busy hour would round to a sliver. Floor the
   whole column, not each segment, so the split inside it stays honest. */
const MIN_COLUMN_PCT = 1.5;

export function VisitsByHourChart({ data, label, onSelectHour }) {
  const peak = data.reduce((max, d) => Math.max(max, d.verified + d.force), 0);
  const interactive = typeof onSelectHour === 'function';

  return (
    <figure className="m-0">
      {label ? <figcaption className="ds-eyebrow mb-2">{label}</figcaption> : null}

      <div className="flex h-32 items-end gap-1 @2xl/report:h-40 @5xl/report:h-48">
        {data.map((d) => {
          const total = d.verified + d.force;
          /* Scaled to the peak, never to a round number. The question this
             chart answers is "when in the day", which is a shape question — a
             fixed axis just makes every bar short. */
          const columnPct = peak > 0 && total > 0 ? Math.max((total / peak) * 100, MIN_COLUMN_PCT) : 0;

          /* THE WHOLE COLUMN IS THE TARGET, not the drawn bar. At 9am the bar
             can be three pixels tall, and a three-pixel tap target on a phone
             is a control that does not exist. The button is full height and
             transparent above the bar, so the hit area is the same generous
             size whatever the value — the same reason the axis label below
             stays a fixed width while the bar above it does not.

             An empty hour is NOT pressable: there is nothing behind it, and a
             sheet that opens to "no visits" is a dead end the reader paid a
             tap for. */
          const Column = interactive && total > 0 ? 'button' : 'div';

          return (
            <Column
              key={d.hour}
              type={interactive && total > 0 ? 'button' : undefined}
              onClick={interactive && total > 0 ? () => onSelectHour(d.hour) : undefined}
              className={cx(
                'flex h-full flex-1 flex-col justify-end gap-1',
                interactive && total > 0 && 'ds-hourbar',
              )}
              /* The bar's own text is a bare number, which reads as "14" with
                 no unit and no hour attached. Screen reader users get the
                 sentence the sighted reader assembles from the axis. */
              aria-label={
                interactive && total > 0
                  ? `${formatHour(d.hour)}: ${total} ${total === 1 ? 'visit' : 'visits'}`
                    + (d.force > 0 ? `, ${d.force} force` : '')
                  : undefined
              }
            >
              <span className="text-center text-10 tabular-nums text-ds-muted">{total || ''}</span>
              <div
                className="flex w-full flex-col justify-end overflow-hidden rounded-sm"
                style={{ height: `${columnPct}%` }}
              >
                {/* Force on TOP of verified. The eye reads a stack from the
                    baseline up, and the baseline is the normal case. */}
                {d.force > 0 ? (
                  <span
                    style={{
                      height: `${(d.force / total) * 100}%`,
                      backgroundColor: toneFill('danger'),
                    }}
                  />
                ) : null}
                {d.verified > 0 ? (
                  <span
                    style={{
                      height: `${(d.verified / total) * 100}%`,
                      backgroundColor: toneFill('success'),
                    }}
                  />
                ) : null}
              </div>
            </Column>
          );
        })}
      </div>

      <div className="flex gap-1 border-t border-line-subtle pt-1">
        {data.map((d) => (
          <span key={d.hour} className="flex-1 text-center text-10 text-ds-muted">
            {formatHour(d.hour)}
          </span>
        ))}
      </div>
    </figure>
  );
}
