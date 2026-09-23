'use client';

import { useState } from 'react';
import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { toneFill } from '@/design-system';
import { VISIT_STATUS_LABEL } from '../data/shape';

/* Visits as stacked bars — green for geo verified, red for force — over
 * whatever the caller's categories are.
 *
 * ONE COMPONENT, TWO AXES. The hourly chart asks "when in the day"; a rep's
 * trend asks "which days". They are the same picture over a different x, and
 * keeping them as two files meant the second was an approximation of the
 * first: a line where the other had bars, no force split at all, and a
 * separate set of decisions about labels, hit areas and empty states to keep
 * in step by hand.
 *
 * WHAT THE CALLER SUPPLIES is a flat series — key, label, verified, force —
 * already worded. Deciding which categories exist is the caller's business
 * (the hour chart drops empty hours; the trend keeps every working day,
 * because a silent day is the thing it is there to show).
 *
 * RECHARTS, and the reasons are in VisitsByHourChart's own note: the column
 * arithmetic that a hand-rolled version needed a min-width, a max-width, a
 * scroll container and three rounds of browser measuring to get right.
 */

const AXIS_TICK = { fontSize: 10, fill: 'var(--ds-text-muted)' };

const TOOLTIP_STYLE = {
  background: 'var(--surface-card)',
  border: 'var(--border-w) solid var(--border-subtle)',
  borderRadius: 'var(--ds-radius-md)',
  boxShadow: 'var(--ds-shadow-pop)',
  padding: 'var(--space-6) var(--space-8)',
  fontSize: 'var(--fs-11)',
};

/* WHICH CATEGORY A CLICK LANDED ON, off the chart-level event.
 *
 * Recharts hands the CHART an `activeTooltipIndex` and that is the only click
 * API here that can be relied on: `onClick` through a `Cell` never reaches
 * the DOM, and `onClick` on a `Bar` stops firing once its cells carry props.
 * The chart-level handler also covers the whole plot area rather than only
 * the painted rectangle.
 *
 * THE INDEX IS A STRING. Recharts 3 types it `number | TooltipIndex |
 * undefined` with `TooltipIndex = string | null`, and sends "0", "1".
 * Guarding with `Number.isInteger` on the raw value rejected every real click
 * and the drill-down silently did nothing.
 *
 * Pure and exported because jsdom gives every element a zero-size box, so
 * Recharts can never resolve a click to a category in a test. */
export function keyFromClick(series, state) {
  const raw = state?.activeTooltipIndex;
  if (raw == null || raw === '') return null;
  const i = Number(raw);
  return Number.isInteger(i) && series[i] ? series[i].key : null;
}

/* What one column says out loud. The bar's own text is a bare total, which
   reads as "14" with no unit and no category attached. */
function nameFor(d) {
  return (
    `${d.label}: ${d.total} ${d.total === 1 ? 'visit' : 'visits'}`
    + (d.force > 0 ? `, ${d.force} force` : '')
  );
}

export function VisitBars({
  data,
  onSelect,
  /* Every tick, or let Recharts drop the ones that would collide. A working
     day is a dozen columns and they all fit; a month is thirty and they do
     not. The caller knows which it has. */
  tickInterval = 0,
  /* A FLOOR PER COLUMN, IN PIXELS, past which the track scrolls instead of
     squeezing. 0 means "always fit", which is right for a chart whose
     categories are bounded — a working day is a dozen hours. A month is
     twenty-six days, and twenty-six columns across a phone are 10px wide:
     unreadable, untappable, and with an axis that has to drop most of its
     labels to fit. Scrolling a legible chart beats fitting an illegible one.

     36px is the width of "12 Sep" at the 10px step plus air, so the floor is
     set by the LABEL rather than by the bar — same rule the hourly chart
     arrived at the hard way. */
  minColumnWidth = 0,
  className = 'h-32',
}) {
  const interactive = typeof onSelect === 'function';
  /* Which column the pointer is over, for the readout below — only used by
     the scrolling variant, where Recharts' own card cannot be kept inside
     the visible box. Null when the pointer has left the chart. */
  const [activeKey, setActiveKey] = useState(null);
  const scrolls = minColumnWidth > 0;

  /* `cap` is a hair of height on top of every column, carrying the total
     label and the column's accessible name. Neither can ride on a real
     series: Recharts draws no rectangle for a zero value, so whichever of
     green and red happens to be absent takes the label with it — which is
     how the count went missing above every hour with no force visits, and
     then above every hour that had them.

     `rest` fills the column out to the tallest one as a transparent but
     PAINTED shape. The chart-level handler should cover that space on its
     own and does not reliably, and a 9am bar three pixels tall is otherwise
     a three-pixel tap target. */
  const peak = data.reduce((max, d) => Math.max(max, d.total), 0);
  const cap = Math.max(peak * 0.01, 0.01);
  const series = data.map((d) => ({ ...d, cap, rest: Math.max(peak - d.total, 0) }));

  const active = scrolls ? series.find((d) => d.key === activeKey) : null;

  return (
    <>
      {/* The scrollbar is the DS's own, not the platform's — and only present
          when a floor is set, since a chart that always fits has nothing to
          scroll and the class would just add a scroll container to every
          card. */}
      <div className={`ds-chart ${className} ${scrolls ? 'ds-scrollbar overflow-x-auto' : ''}`}>
      {/* `minWidth` is what makes the track wider than the card: Recharts
          sizes itself to its parent, so the only way to have it draw past the
          edge is to tell it a floor and let the parent scroll. */}
      <ResponsiveContainer
        width="100%"
        height="100%"
        minWidth={minColumnWidth > 0 ? data.length * minColumnWidth : undefined}
      >
        <BarChart
          data={series}
          onClick={interactive ? (state) => {
            const key = keyFromClick(series, state);
            if (key != null) onSelect(key);
          } : undefined}
          /* THE READOUT TRACKS FOUR EVENTS, and the touch ones are not
             belt-and-braces: a phone fires no `mousemove` of its own. Most
             mobile browsers synthesise one after a tap, so the line would
             have appeared MOST of the time — which is worse than never,
             because there is no way to tell from the code whether it is
             meant to. Recharts exposes the touch pair, so the behaviour is
             stated rather than inherited from the browser's compatibility
             layer.
           *
             `touchmove` as well as `touchstart`, so a finger dragged along
             the chart reads out each column it crosses — which is how you
             scan a month on a phone, and the closest thing touch has to
             hover. Chart-level rather than per-bar for the same reason the
             click is: it covers the space above a short column too. */
          onMouseMove={scrolls ? (state) => setActiveKey(keyFromClick(series, state)) : undefined}
          onMouseLeave={scrolls ? () => setActiveKey(null) : undefined}
          onTouchStart={scrolls ? (state) => setActiveKey(keyFromClick(series, state)) : undefined}
          onTouchMove={scrolls ? (state) => setActiveKey(keyFromClick(series, state)) : undefined}
          /* NOTHING CLEARS IT ON `touchend`, deliberately. A pointer leaving
             the chart is the reader looking elsewhere; a finger lifting is
             the reader having ARRIVED, and wiping the line at that moment
             would erase the answer at the instant it was asked for. The
             desktop clear stays, because there the line is a hover readout
             and a stale one would be a lie about where the pointer is. */
          margin={{ top: 14, right: 4, bottom: 0, left: 4 }}
          /* A GAP, NOT A FIXED WIDTH: two columns share the width as two wide
             bars, fifteen share it as narrow ones, and neither case needs a
             scroll container. */
          barCategoryGap="22%"
          maxBarSize={56}
        >
          <XAxis
            dataKey="label"
            interval={tickInterval}
            minTickGap={12}
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={{ stroke: 'var(--border-subtle)' }}
          />
          {/* Scaled to the data, never to a round number: these are shape
              questions, and a fixed axis just makes every bar short. */}
          <YAxis hide domain={[0, 'dataMax']} />

          {/* RECHARTS' OWN CARD ONLY WHERE IT FITS — that is, where the chart
              is no wider than the box around it.
           *
              Once the track scrolls, the card is placed correctly (it scrolls
              WITH the chart, so it stays by the pointer) but Recharts flips it
              away from the edge of the CHART, which it knows about, and not
              the edge of the WINDOW, which it does not. Hover a column near
              the right of the visible area and the card is drawn into the
              300px of chart you cannot see. Padding the box did not help —
              the clipping is horizontal — and `portal` moves the element
              without moving its maths: portalled to something that does not
              scroll, it lands `scrollLeft` away from the pointer.

              So the scrolling variant gets a readout under the chart instead;
              see below. Same information, outside the box that clips it, and
              legible on touch where there is no hover at all. */}
          {minColumnWidth > 0 ? null : (
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            labelStyle={{ color: 'var(--ds-text-secondary)' }}
            itemStyle={{ padding: 0 }}
            /* NO CURSOR BAND. Recharts' default highlight covers the whole
               category — bar, gaps and full height — which on a two-column
               chart paints a slab over a third of the card and reads as a
               selection. `activeBar` lights the bar itself instead. */
            cursor={false}
            formatter={(value, name) => [
              value,
              name === 'verified' ? VISIT_STATUS_LABEL.verified : VISIT_STATUS_LABEL.force,
            ]}
          />
          )}

          {/* VERIFIED FIRST so the stack builds from the baseline up: the eye
              reads a stack from the bottom and the baseline is the normal
              case. Force lands on top, where an unusual amount of it shows as
              a red cap rather than being buried under the green. */}
          <Bar
            dataKey="verified"
            stackId="v"
            fill={toneFill('success')}
            activeBar={{ fillOpacity: 0.82 }}
            isAnimationActive={false}
            cursor={interactive ? 'pointer' : undefined}
          />
          <Bar
            dataKey="force"
            stackId="v"
            fill={toneFill('danger')}
            activeBar={{ fillOpacity: 0.82 }}
            isAnimationActive={false}
            cursor={interactive ? 'pointer' : undefined}
          />

          <Bar
            dataKey="cap"
            stackId="v"
            fill="transparent"
            radius={[2, 2, 0, 0]}
            isAnimationActive={false}
            tooltipType="none"
            cursor={interactive ? 'pointer' : undefined}
          >
            <LabelList
              dataKey="total"
              position="top"
              offset={4}
              style={{ fontSize: 10, fill: 'var(--ds-text-muted)' }}
            />
            {data.map((d) => (
              <Cell key={d.key} role="img" aria-label={nameFor(d)} />
            ))}
          </Bar>

          {interactive ? (
            <Bar
              dataKey="rest"
              stackId="v"
              fill="transparent"
              isAnimationActive={false}
              tooltipType="none"
              cursor="pointer"
              onClick={(d) => onSelect(d.key)}
            />
          ) : null}
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* THE READOUT, OUTSIDE THE BOX THAT CLIPS. A scrolling chart cannot
          carry Recharts' own hover card (see the Tooltip above), so the same
          information is printed here instead — in the card's own flow, where
          nothing can cut it off and it needs no positioning maths at all.

          It also works where a hover card never did: on a phone there is no
          pointer, and tapping a column both opens the sheet and leaves its
          numbers written here on the way.

          THE HEIGHT IS RESERVED whether or not anything is hovered. Letting
          the line appear and vanish would jog every card below it by twelve
          pixels each time the pointer crossed a column. */}
      {scrolls ? (
        <p className="h-4 truncate text-10 text-ds-muted" aria-hidden="true">
          {active
            ? `${active.label} · ${active.verified} geo verified`
              + (active.force > 0 ? ` · ${active.force} force` : '')
            : null}
        </p>
      ) : null}
    </>
  );
}
